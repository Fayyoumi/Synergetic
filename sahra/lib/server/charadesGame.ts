import "server-only";
import { randomInt } from "node:crypto";
import {
  actingTeam,
  actorOf,
  charadesFinal,
  charadesReducer,
  createCharadesState,
  roundOf,
  type CharadesAction,
  type CharadesState,
  type WordCard,
} from "@/lib/game/charades";
import { shuffle, seededRng } from "@/lib/game/round";
import { CHARADES_ROUNDS_PER_TEAM, CHARADES_SKIPS_PER_TURN, CHARADES_TURN_SECONDS, charadesPoints } from "@/lib/game/scoring";
import { balanceTeams, type Team } from "@/lib/game/teamTrivia";
import type { CharadesPublicView, GameCommand, GameErrorCode, SecretView } from "@/lib/rooms/game";
import { logEvent } from "./events";
import type { GameOutcome, RoomGameService, RoomRow } from "./roomGame";

const fail = (error: GameErrorCode): GameOutcome => ({ ok: false, error });

function stateOf(room: RoomRow): CharadesState {
  const s = room.game_state;
  return s && s.kind === "charades" ? (s as unknown as CharadesState) : createCharadesState();
}

/** Server side of charades. The host or the current actor drives a turn; the word goes only to the actor. */
export class CharadesGame {
  constructor(private svc: RoomGameService) {}

  async command(room: RoomRow, role: "host" | "player", cmd: GameCommand): Promise<GameOutcome> {
    const state = stateOf(room);
    const now = Date.now();
    const isHost = role === "host";
    const isActor = !isHost && (await this.mySeat(room.id)) === actorOf(state);

    let action: CharadesAction;
    switch (cmd.action) {
      case "start": {
        if (!isHost) return fail("not_host");
        return this.start(room, state);
      }
      case "begin":
      case "got_it":
      case "skip":
      case "steal":
        if (!isHost && !isActor) return fail("not_actor");
        action = cmd.action === "begin" ? { type: "begin", now } : cmd.action === "got_it" ? { type: "got_it", now } : cmd.action === "skip" ? { type: "skip", now } : { type: "steal" };
        break;
      case "timeup":
        if (cmd.index !== state.turn) return { ok: true, game: await this.view(room) };
        action = { type: "time_up", now };
        break;
      case "advance": {
        if (!isHost) return fail("not_host");
        const joined: Record<string, Team> = {};
        if (state.phase === "turn_summary") {
          const seats = await this.svc.seats(room.id);
          const counts: Record<Team, number> = { 1: state.order[1].length, 2: state.order[2].length };
          for (const s of seats) {
            if (state.teams[s.id]) continue;
            const t: Team = s.team ?? (counts[1] <= counts[2] ? 1 : 2);
            joined[s.id] = t;
            counts[t]++;
          }
        }
        action = { type: "advance", joined };
        break;
      }
      case "lobby":
        if (!isHost) return fail("not_host");
        action = { type: "lobby" };
        break;
      default:
        return fail("bad_request");
    }

    const result = charadesReducer(state, action);
    if (!result.ok) {
      // A tap after the 60 s: end the turn instead.
      if (result.error === "time_up") return this.command(room, role, { action: "timeup", index: state.turn });
      if (result.error === "too_early" || result.error === "wrong_phase") return { ok: true, game: await this.view(room) };
      return fail(result.error);
    }
    const next = result.state;
    if (next.phase === "final" && state.phase !== "final") return this.finish(room, next);
    const status = next.phase === "lobby" ? "lobby" : undefined;
    if (!(await this.svc.commit(room, next, status))) {
      // Someone else acted first (e.g. two taps on "got it"): show the current state.
      const fresh = await this.svc.load(room.code);
      return { ok: true, game: await this.view(fresh!) };
    }
    if (action.type === "lobby") void logEvent("play_again_clicked", { type: "charades" }, { profileId: this.svc.userId, roomId: room.id });
    return this.publish({ ...room, state_version: room.state_version + 1 }, next, state);
  }

  private async start(room: RoomRow, state: CharadesState): Promise<GameOutcome> {
    const seats = await this.svc.seats(room.id);
    if (seats.length < 2) return fail("need_two_teams");
    const teams = balanceTeams(
      seats.map((s) => s.id),
      Object.fromEntries(seats.map((s) => [s.id, s.team])),
    );
    const order: Record<Team, string[]> = { 1: [], 2: [] };
    for (const s of seats) order[teams[s.id]].push(s.id);

    const { data: words } = await this.svc.db
      .from("charades_words")
      .select("id, word, category, difficulty")
      .eq("status", "approved")
      .eq("lang", "ar");
    const deck = shuffle((words ?? []) as WordCard[], seededRng(randomInt(0, 2 ** 31)));

    const { data: game, error } = await this.svc.db
      .from("games")
      .insert({ room_id: room.id, type: "charades", settings: { teams, words: deck.length } })
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    for (const [id, team] of Object.entries(teams)) await this.svc.db.from("room_players").update({ team }).eq("id", id);

    const result = charadesReducer(state, { type: "start", gameId: game.id, teams, order, deck, now: Date.now() });
    if (!result.ok) return fail(result.error);
    if (!(await this.svc.commit(room, result.state, "playing"))) return fail("conflict");
    void logEvent("game_started", { type: "charades", players: seats.length, words: deck.length }, { profileId: this.svc.userId, roomId: room.id });
    return this.publish({ ...room, state_version: room.state_version + 1 }, result.state, state);
  }

  private async finish(room: RoomRow, state: CharadesState): Promise<GameOutcome> {
    const results = charadesFinal(state);
    const { data: seatRows } = await this.svc.db.from("room_players").select("id, profile_id").in("id", Object.keys(state.teams));
    const scores = [];
    for (const p of results.players) {
      const profile = seatRows?.find((s) => s.id === p.seatId)?.profile_id as string | undefined;
      let first = false;
      if (profile) {
        const { count } = await this.svc.db.from("scores").select("id", { count: "exact", head: true }).eq("profile_id", profile);
        first = (count ?? 0) === 0;
      }
      scores.push({ room_player_id: p.seatId, points: p.points, xp: p.xp, badges: first ? ["first_round"] : [] });
    }
    const { data: ok, error } = await this.svc.db.rpc("room_game_finish", {
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
      { type: "charades", duration_sec: Math.round((Date.now() - state.gameStartedAt) / 1000), team_scores: state.teamScores, players: scores.length },
      { profileId: this.svc.userId, roomId: room.id },
    );
    return this.publish({ ...room, state_version: room.state_version + 1 }, state, null);
  }

  async remove(room: RoomRow, seatId: string) {
    const state = stateOf(room);
    const result = charadesReducer(state, { type: "remove", seatId });
    if (result.ok && result.state !== state && (await this.svc.commit(room, result.state))) {
      await this.publish({ ...room, state_version: room.state_version + 1 }, result.state, state);
    }
  }

  /** Broadcasts the public state; sends the word privately to the actor when it changed. */
  private async publish(room: RoomRow, state: CharadesState, prev: CharadesState | null): Promise<GameOutcome> {
    const game = this.toView(state);
    await this.svc.send(room.code, { v: 1, type: "state", game });
    const actor = actorOf(state);
    if (state.phase === "turn_active" && state.current && actor && state.current.id !== prev?.current?.id) {
      await this.svc.sendSecret(room.code, actor, secretOf(state));
    }
    return { ok: true, game };
  }

  async view(room: RoomRow): Promise<CharadesPublicView> {
    return this.toView(stateOf(room));
  }

  /** The current word, for the actor only (used to re-sync after a reconnect). */
  async secret(room: RoomRow): Promise<SecretView | null> {
    const state = stateOf(room);
    if (state.phase !== "turn_active" || !state.current) return null;
    const mine = await this.mySeat(room.id);
    return mine && mine === actorOf(state) ? secretOf(state) : null;
  }

  private async mySeat(roomId: string): Promise<string | null> {
    const { data } = await this.svc.db
      .from("room_players")
      .select("id")
      .eq("room_id", roomId)
      .eq("profile_id", this.svc.userId)
      .is("removed_at", null)
      .maybeSingle<{ id: string }>();
    return data?.id ?? null;
  }

  private toView(state: CharadesState): CharadesPublicView {
    const turnOver = state.phase === "turn_summary" || state.phase === "final";
    const final = state.phase === "final" ? charadesFinal(state) : null;
    return {
      v: 1,
      kind: "charades",
      phase: state.phase,
      turn: state.turn,
      totalTurns: state.totalTurns,
      round: roundOf(state),
      roundsPerTeam: CHARADES_ROUNDS_PER_TEAM,
      actingTeam: actingTeam(state),
      actorSeatId: actorOf(state),
      startedAt: state.startedAt,
      turnSeconds: CHARADES_TURN_SECONDS,
      skipsLeft: CHARADES_SKIPS_PER_TURN - state.skipsUsed,
      canSteal: !!state.stealable,
      log: state.log.map((e) => {
        // A skipped word stays hidden while it can still be stolen or acted again this turn.
        const stolenLater = e.kind === "skip" && state.log.some((x) => x.kind === "steal" && x.card.id === e.card.id);
        const hidden = e.kind === "skip" && !turnOver && !stolenLater;
        return {
          kind: e.kind,
          word: hidden ? null : e.card.word,
          points: e.kind === "skip" ? 0 : e.points,
          team: e.kind === "skip" ? null : e.team,
        };
      }),
      teams: state.teams,
      teamScores: state.teamScores,
      final: final ? { winner: final.winner, players: final.players } : null,
      serverNow: Date.now(),
    };
  }
}

function secretOf(state: CharadesState): SecretView {
  const c = state.current!;
  return { kind: "charades_word", turn: state.turn, word: c.word, category: c.category, difficulty: c.difficulty, points: charadesPoints(c.difficulty) };
}
