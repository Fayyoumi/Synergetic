import "server-only";
import { randomInt } from "node:crypto";
import blocklist from "@/content/blocklist.json";
import { createTextFilter } from "@/lib/content/textFilter";
import { seededRng } from "@/lib/game/round";
import {
  buildWhoRounds,
  createWhoState,
  validVote,
  voteTimeUp,
  VOTE_SECONDS,
  whoFinal,
  whoReducer,
  type WhoAction,
  type WhoState,
} from "@/lib/game/whoAmongUs";
import type { GameCommand, GameErrorCode, PromptItem, SecretView, WhoPublicView } from "@/lib/rooms/game";
import type { RoomMood } from "@/lib/rooms/api";
import { logEvent } from "./events";
import type { GameOutcome, RoomGameService, RoomRow } from "./roomGame";

const fail = (error: GameErrorCode): GameOutcome => ({ ok: false, error });
const filterText = createTextFilter(blocklist);
const MOOD_ORDER: RoomMood[] = ["family", "friends", "roast"];
const ROUNDS = 8;
const PROMPTS_PER_PLAYER = 5;

function stateOf(room: RoomRow): WhoState {
  const s = room.game_state;
  return s && s.kind === "who_among_us" ? (s as unknown as WhoState) : createWhoState();
}

/** Content allowed in a room's mood (e.g. a "friends" prompt never appears on a family night). */
function moodsUpTo(mood: RoomMood): RoomMood[] {
  return MOOD_ORDER.slice(0, MOOD_ORDER.indexOf(mood) + 1);
}

/** Server side of "Who among us?" and the secret prompts. */
export class WhoGame {
  constructor(private svc: RoomGameService) {}

  private get db() {
    return this.svc.db;
  }

  async command(room: RoomRow & { mood?: RoomMood }, role: "host" | "player", cmd: GameCommand): Promise<GameOutcome> {
    const state = stateOf(room);
    const now = Date.now();
    let action: WhoAction;

    switch (cmd.action) {
      case "start": {
        if (role !== "host") return fail("not_host");
        const seats = await this.svc.seats(room.id);
        const { data: game, error } = await this.db
          .from("games")
          .insert({ room_id: room.id, type: "who_among_us", settings: { rounds: ROUNDS } })
          .select("id")
          .single<{ id: string }>();
        if (error) throw error;
        action = { type: "collect", gameId: game.id, players: seats.map((s) => s.id), now };
        break;
      }
      case "advance": {
        if (role !== "host") return fail("not_host");
        if (state.phase === "prompts_collect") {
          action = { type: "open", rounds: await this.planRounds(room, state), now };
        } else {
          const joined = state.phase === "reveal" ? (await this.svc.seats(room.id)).map((s) => s.id).filter((id) => !state.players.includes(id)) : [];
          action = { type: "advance", now, joined };
        }
        break;
      }
      case "timeup":
        if (cmd.index !== state.index || state.phase !== "vote_open") return { ok: true, game: await this.view(room) };
        if (!voteTimeUp(state, now)) return fail("too_early");
        return this.reveal(room, state);
      case "veto": {
        const mine = await this.mySeat(room.id);
        if (!mine) return fail("not_member");
        action = { type: "veto", seatId: mine };
        break;
      }
      case "lobby":
        if (role !== "host") return fail("not_host");
        action = { type: "lobby" };
        break;
      default:
        return fail("bad_request");
    }

    const result = whoReducer(state, action);
    if (!result.ok) return fail(result.error);
    let next = result.state;
    if (next.phase === "final" && state.phase !== "final") return this.finish(room, next);
    const status = action.type === "collect" ? "playing" : action.type === "lobby" ? "lobby" : undefined;
    if (!(await this.svc.commit(room, next, status))) return fail("conflict");
    const bumped = { ...room, state_version: room.state_version + 1 };
    if (action.type === "collect") {
      void logEvent("game_started", { type: "who_among_us", players: next.players.length }, { profileId: this.svc.userId, roomId: room.id });
    }
    if (action.type === "lobby") void logEvent("play_again_clicked", { type: "who_among_us" }, { profileId: this.svc.userId, roomId: room.id });
    next = next as WhoState;
    return this.publish(bumped, next);
  }

  // ------------------------------------------------------------- secret prompts

  /** The prompts this player is asked tonight, with their progress. */
  async prompts(room: RoomRow & { mood?: RoomMood }): Promise<{ ok: true; prompts: PromptItem[] } | { ok: false; error: GameErrorCode }> {
    const seat = await this.mySeat(room.id);
    if (!seat) return { ok: false, error: "not_member" };
    const list = await this.promptList(room);
    const { data: done } = await this.db.from("prompt_answers").select("prompt_id, skipped").eq("room_player_id", seat);
    const status = new Map((done ?? []).map((d) => [d.prompt_id as string, d.skipped ? "skipped" : "answered"]));
    return {
      ok: true,
      prompts: list.map((p) => ({ id: p.id, text: p.text, status: (status.get(p.id) as PromptItem["status"]) ?? "pending" })),
    };
  }

  async answerPrompt(
    room: RoomRow & { mood?: RoomMood },
    input: { promptId: string; answer?: string; skip: boolean },
  ): Promise<{ ok: true; prompts: PromptItem[]; masked: boolean } | { ok: false; error: GameErrorCode }> {
    const seat = await this.mySeat(room.id);
    if (!seat) return { ok: false, error: "not_member" };
    const list = await this.promptList(room);
    if (!list.some((p) => p.id === input.promptId)) return { ok: false, error: "bad_request" };
    const text = (input.answer ?? "").trim();
    if (!input.skip && !text) return { ok: false, error: "bad_request" };
    const filtered = input.skip ? { text: "", flagged: false } : filterText(text);
    const { error } = await this.db.from("prompt_answers").upsert(
      {
        room_id: room.id,
        room_player_id: seat,
        prompt_id: input.promptId,
        answer_text: filtered.text,
        flagged: filtered.flagged,
        skipped: input.skip,
      },
      { onConflict: "room_player_id,prompt_id" },
    );
    if (error) throw error;
    void logEvent(input.skip ? "prompt_skipped" : "prompt_answered", { prompt_id: input.promptId, flagged: filtered.flagged }, { profileId: this.svc.userId, roomId: room.id });

    // Let the host screen show progress (counts only, never content).
    if (room.game === "who_among_us" && stateOf(room).phase === "prompts_collect") await this.publish(room, stateOf(room));
    const r = await this.prompts(room);
    return r.ok ? { ...r, masked: filtered.flagged } : r;
  }

  private async promptList(room: RoomRow & { mood?: RoomMood }) {
    const { data } = await this.db
      .from("prompts")
      .select("id, text, mood_min")
      .eq("status", "approved")
      .eq("lang", "ar")
      .in("mood_min", moodsUpTo(room.mood ?? "family"))
      .order("id")
      .limit(PROMPTS_PER_PLAYER);
    return (data ?? []) as { id: string; text: string }[];
  }

  // ------------------------------------------------------------- voting

  async vote(room: RoomRow, input: { index: number; target: string }): Promise<GameOutcome> {
    const state = stateOf(room);
    if (state.phase !== "vote_open" || !state.gameId) return fail("not_playing");
    if (input.index !== state.index) return fail("stale_round");
    const seat = await this.mySeat(room.id);
    if (!seat || !state.players.includes(seat)) return fail("not_member");
    if (seat === input.target) return fail("self_vote");
    if (!validVote(state.players, seat, input.target)) return fail("bad_request");
    if (voteTimeUp(state, Date.now())) return fail("time_up");

    const { error } = await this.db
      .from("votes")
      .insert({ game_id: state.gameId, round: state.index, voter_id: seat, target_id: input.target });
    if (error) {
      if (error.code === "23505") return fail("already_voted");
      throw error;
    }
    const votes = await this.votes(state);
    if (state.players.every((p) => votes[p])) return this.reveal(room, state);
    return this.publish(room, state);
  }

  private async reveal(room: RoomRow, state: WhoState): Promise<GameOutcome> {
    const votes = await this.votes(state);
    const result = whoReducer(state, { type: "reveal", index: state.index, votes, now: Date.now() });
    if (!result.ok) return result.error === "too_early" ? fail("too_early") : { ok: true, game: await this.view(room) };
    const next = result.state;
    if (!(await this.svc.commit(room, next))) {
      const fresh = await this.svc.load(room.code);
      return { ok: true, game: await this.view(fresh!) };
    }
    // Titles of the night are kept with the room (and its group, if any).
    const newTitles = next.titles.filter((t) => t.index === state.index);
    if (newTitles.length) {
      const { data: roomRow } = await this.db.from("rooms").select("group_id").eq("id", room.id).single<{ group_id: string | null }>();
      await this.db.from("titles").insert(
        newTitles.map((t) => ({ room_id: room.id, group_id: roomRow?.group_id ?? null, room_player_id: t.seatId, title_text: t.title })),
      );
    }
    return this.publish({ ...room, state_version: room.state_version + 1 }, next);
  }

  private async votes(state: WhoState): Promise<Record<string, string>> {
    const { data } = await this.db.from("votes").select("voter_id, target_id").eq("game_id", state.gameId!).eq("round", state.index);
    return Object.fromEntries((data ?? []).map((v) => [v.voter_id as string, v.target_id as string]));
  }

  // ------------------------------------------------------------- rounds, end, removal

  private async planRounds(room: RoomRow & { mood?: RoomMood }, state: WhoState) {
    const moods = moodsUpTo(room.mood ?? "family");
    const { data: traits } = await this.db
      .from("traits")
      .select("id, text")
      .eq("status", "approved")
      .eq("banned", false)
      .eq("lang", "ar")
      .in("mood_min", moods);
    const { data: answers } = await this.db
      .from("prompt_answers")
      .select("id, answer_text, room_player_id, prompts(text)")
      .eq("room_id", room.id)
      .eq("skipped", false)
      .eq("flagged", false)
      .in("room_player_id", state.players);
    return buildWhoRounds({
      traits: (traits ?? []) as { id: string; text: string }[],
      answers: (answers ?? []).map((a) => ({
        id: a.id as string,
        answer: a.answer_text as string,
        authorSeatId: a.room_player_id as string,
        prompt: ((a.prompts as unknown as { text: string } | null)?.text ?? "") as string,
      })),
      count: ROUNDS,
      rng: seededRng(randomInt(0, 2 ** 31)),
    });
  }

  private async finish(room: RoomRow, state: WhoState): Promise<GameOutcome> {
    const { standings } = whoFinal(state);
    const { data: seatRows } = await this.db.from("room_players").select("id, profile_id").in("id", state.players);
    const scores = [];
    for (const s of standings) {
      const profile = seatRows?.find((r) => r.id === s.seatId)?.profile_id as string | undefined;
      let first = false;
      if (profile) {
        const { count } = await this.db.from("scores").select("id", { count: "exact", head: true }).eq("profile_id", profile);
        first = (count ?? 0) === 0;
      }
      scores.push({ room_player_id: s.seatId, points: s.points, xp: s.xp, badges: first ? ["first_round"] : [] });
    }
    const { data: ok, error } = await this.db.rpc("room_game_finish", {
      p_room: room.id,
      p_version: room.state_version,
      p_state: state,
      p_game: state.gameId,
      p_scores: scores,
    });
    if (error) throw error;
    if (ok !== true) return fail("conflict");
    void logEvent(
      "game_finished",
      { type: "who_among_us", duration_sec: Math.round((Date.now() - state.gameStartedAt) / 1000), rounds: state.rounds.length, players: scores.length },
      { profileId: this.svc.userId, roomId: room.id },
    );
    return this.publish({ ...room, state_version: room.state_version + 1 }, state);
  }

  async remove(room: RoomRow, seatId: string) {
    const state = stateOf(room);
    const result = whoReducer(state, { type: "remove", seatId });
    if (result.ok && result.state !== state && (await this.svc.commit(room, result.state))) {
      await this.publish({ ...room, state_version: room.state_version + 1 }, result.state);
    }
  }

  // ------------------------------------------------------------- views

  private async publish(room: RoomRow, state: WhoState): Promise<GameOutcome> {
    const game = await this.toView(room, state);
    await this.svc.send(room.code, { v: 1, type: "state", game });
    // Tell the author (only) that the answer on screen is theirs, so they can veto.
    const round = state.rounds[state.index];
    if (state.phase === "vote_open" && round?.kind === "answer") {
      await this.svc.sendSecret(room.code, round.authorSeatId, { kind: "my_answer", round: state.index });
    }
    return { ok: true, game };
  }

  async view(room: RoomRow): Promise<WhoPublicView> {
    return this.toView(room, stateOf(room));
  }

  async secret(room: RoomRow): Promise<SecretView | null> {
    const state = stateOf(room);
    const round = state.rounds[state.index];
    if ((state.phase !== "vote_open" && state.phase !== "reveal") || round?.kind !== "answer") return null;
    return (await this.mySeat(room.id)) === round.authorSeatId ? { kind: "my_answer", round: state.index } : null;
  }

  private async mySeat(roomId: string): Promise<string | null> {
    const { data } = await this.db
      .from("room_players")
      .select("id")
      .eq("room_id", roomId)
      .eq("profile_id", this.svc.userId)
      .is("removed_at", null)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  }

  private async toView(room: RoomRow, state: WhoState): Promise<WhoPublicView> {
    const round = state.phase === "vote_open" || state.phase === "reveal" ? state.rounds[state.index] : undefined;
    const hidden = state.vetoed;
    let voted: string[] = [];
    if (state.phase === "vote_open" && state.gameId) voted = Object.keys(await this.votes(state));

    let promptProgress: Record<string, number> = {};
    let promptTotal = 0;
    if (state.phase === "prompts_collect") {
      promptTotal = (await this.promptList(room)).length;
      const { data } = await this.db.from("prompt_answers").select("room_player_id").eq("room_id", room.id);
      for (const r of data ?? []) promptProgress[r.room_player_id as string] = (promptProgress[r.room_player_id as string] ?? 0) + 1;
    } else {
      promptProgress = {};
    }

    const res = state.phase === "reveal" ? state.lastResult : null;
    const final = state.phase === "final" ? whoFinal(state) : null;
    return {
      v: 1,
      kind: "who_among_us",
      phase: state.phase,
      index: state.index,
      total: state.rounds.length,
      voteSeconds: VOTE_SECONDS,
      startedAt: state.startedAt,
      round: round
        ? round.kind === "trait"
          ? { kind: "trait", trait: round.trait, prompt: null, answer: null }
          : { kind: "answer", trait: null, prompt: hidden ? null : round.prompt, answer: hidden ? null : round.answer }
        : null,
      players: state.players,
      voted,
      scores: state.scores,
      result: res
        ? {
            tally: res.tally,
            top: res.top,
            majorityVoters: res.majorityVoters,
            title: res.title,
            vetoed: res.vetoed,
            authorSeatId: round?.kind === "answer" && !hidden ? round.authorSeatId : null,
          }
        : null,
      promptProgress,
      promptTotal,
      titles: state.titles.map((t) => ({ seatId: t.seatId, title: t.title })),
      final: final ? { standings: final.standings } : null,
      serverNow: Date.now(),
    };
  }
}
