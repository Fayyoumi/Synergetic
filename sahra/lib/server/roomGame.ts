import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRound, optionPermutation, seededRng, type QuestionMeta } from "@/lib/game/round";
import { serverTimeLeft, type Difficulty } from "@/lib/game/scoring";
import {
  balanceTeams,
  createTeamState,
  finalResults,
  teamTriviaReducer,
  timeIsUp,
  type Team,
  type TeamAction,
  type TeamTriviaState,
} from "@/lib/game/teamTrivia";
import { roomTopic, seatTopic, type RoomBroadcast } from "@/lib/rooms/api";
import type { GameCommand, GameErrorCode, GameView, SecretView, TeamPublicView } from "@/lib/rooms/game";
import { CATEGORIES } from "@/lib/content/schemas";
import { logEvent } from "./events";
import { CharadesGame } from "./charadesGame";

export type RoomRow = {
  id: string;
  code: string;
  host_profile_id: string | null;
  status: "lobby" | "playing" | "ended";
  game: string | null;
  game_state: { kind?: string; phase?: string } | null;
  state_version: number;
};

type QuestionRow = {
  id: string;
  lang: "ar" | "en";
  category: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer_index: number;
};

export type GameOutcome = { ok: true; game: GameView } | { ok: false; error: GameErrorCode };

const fail = (error: GameErrorCode): GameOutcome => ({ ok: false, error });
const rng = () => seededRng(randomInt(0, 2 ** 31));

export function stateOf(room: RoomRow): TeamTriviaState {
  const s = room.game_state;
  return s && s.kind === "trivia_team" ? (s as unknown as TeamTriviaState) : createTeamState();
}

/** Server side of room games (team trivia). Host drives the flow; the server checks and scores. */
export class RoomGameService {
  private readonly receivedAt: number;

  constructor(
    readonly db: SupabaseClient,
    readonly userId: string,
    receivedAt?: number,
  ) {
    this.receivedAt = receivedAt ?? Date.now();
  }

  // ------------------------------------------------------------- read

  async get(code: string): Promise<GameOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    const member = await this.memberRole(room);
    if (!member) return fail("not_member");
    if (room.game === "charades") return { ok: true, game: await new CharadesGame(this).view(room) };
    return { ok: true, game: await this.view(room, stateOf(room)) };
  }

  // ------------------------------------------------------------- commands

  async command(code: string, cmd: GameCommand): Promise<GameOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    if (room.status === "ended") return fail("ended");
    const role = await this.memberRole(room);
    if (!role) return fail("not_member");

    // Team setup is the same for every team game.
    if (cmd.action === "team" || cmd.action === "balance") {
      if (role !== "host") return fail("not_host");
      const phase = room.game_state?.phase ?? "lobby";
      if (phase !== "lobby" && phase !== "final") return fail("wrong_phase");
      if (cmd.action === "team") {
        await this.db.from("room_players").update({ team: cmd.team }).eq("id", cmd.seatId).eq("room_id", room.id);
      } else {
        const seats = await this.seats(room.id);
        const teams = balanceTeams(seats.map((s) => s.id), {});
        for (const [id, team] of Object.entries(teams)) await this.db.from("room_players").update({ team }).eq("id", id);
      }
      return this.get(code);
    }
    if (room.game === "charades") return new CharadesGame(this).command(room, role, cmd);

    if (cmd.action === "timeup") return this.reveal(room, cmd.index, true);
    if (role !== "host") return fail("not_host");

    const state = stateOf(room);
    switch (cmd.action) {
      case "start": {
        const seats = await this.seats(room.id);
        if (seats.length < 2) return fail("need_two_teams");
        const teams = balanceTeams(
          seats.map((s) => s.id),
          Object.fromEntries(seats.map((s) => [s.id, s.team])),
        );
        if (!new Set(Object.values(teams)).has(2)) return fail("need_two_teams");

        const { data: pool } = await this.db.from("questions").select("id, category, difficulty, lang").eq("status", "approved");
        const round = buildRound({
          pool: (pool ?? []) as QuestionMeta[],
          categories: [...CATEGORIES],
          difficulty: cmd.difficulty ?? "mixed",
          count: cmd.count ?? 10,
          locale: cmd.locale ?? "ar",
          rng: rng(),
        });
        if (!round.questions.length) return fail("no_questions");
        const r = rng();
        const questions = round.questions.map((q) => ({ ...q, perm: optionPermutation(r) }));

        const { data: game, error } = await this.db
          .from("games")
          .insert({ room_id: room.id, type: "trivia_team", settings: { count: cmd.count, difficulty: cmd.difficulty, teams } })
          .select("id")
          .single<{ id: string }>();
        if (error) throw error;
        for (const [id, team] of Object.entries(teams)) await this.db.from("room_players").update({ team }).eq("id", id);

        const result = this.reduce(state, {
          type: "start",
          gameId: game.id,
          questions,
          teams,
          settings: { count: cmd.count ?? 10, difficulty: cmd.difficulty ?? "mixed", locale: cmd.locale ?? "ar" },
          now: Date.now(),
        });
        if (!result.ok) return result;
        if (!(await this.commit(room, result.state, "playing"))) return fail("conflict");
        void logEvent("game_started", { type: "trivia_team", settings: { count: cmd.count, difficulty: cmd.difficulty }, players: seats.length }, { profileId: this.userId, roomId: room.id });
        return this.publish(room, result.state);
      }

      case "advance": {
        let joinedTeams: Record<string, Team> | undefined;
        if (state.phase === "scoreboard") {
          // Players who joined mid-game play from the next question, on the smaller team.
          const seats = await this.seats(room.id);
          const counts: Record<Team, number> = { 1: 0, 2: 0 };
          for (const p of Object.values(state.players)) counts[p.team]++;
          joinedTeams = {};
          for (const s of seats) {
            if (state.players[s.id]) continue;
            const t: Team = s.team ?? (counts[1] <= counts[2] ? 1 : 2);
            joinedTeams[s.id] = t;
            counts[t]++;
          }
        }
        const result = this.reduce(state, { type: "advance", now: Date.now(), joinedTeams });
        if (!result.ok) return result;
        if (result.state.phase === "final") return this.finish(room, result.state);
        if (!(await this.commit(room, result.state))) return fail("conflict");
        return this.publish(room, result.state);
      }

      case "lobby": {
        const result = this.reduce(state, { type: "lobby" });
        if (!result.ok) return result;
        if (!(await this.commit(room, result.state, "lobby"))) return fail("conflict");
        void logEvent("play_again_clicked", { type: "trivia_team" }, { profileId: this.userId, roomId: room.id });
        return this.publish(room, result.state);
      }
      default:
        return fail("bad_request");
    }
  }

  // ------------------------------------------------------------- answers

  async answer(code: string, input: { index: number; choice: number; answeredAt: number | null }): Promise<GameOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    if (room.status === "ended") return fail("ended");
    const state = stateOf(room);
    if (state.phase !== "question" || !state.gameId) return fail("not_playing");
    if (input.index !== state.index) return fail("stale_question");

    const { data: seat } = await this.db
      .from("room_players")
      .select("id")
      .eq("room_id", room.id)
      .eq("profile_id", this.userId)
      .is("removed_at", null)
      .maybeSingle<{ id: string }>();
    if (!seat || !state.players[seat.id]) return fail("not_member");

    const timeLeft = serverTimeLeft({ startedAt: state.startedAt, receivedAt: this.receivedAt, clientAnsweredAt: input.answeredAt });
    if (timeLeft === 0) return fail("time_up");
    const stored = state.questions[state.index].perm[input.choice];

    const { error } = await this.db.from("room_pending_answers").insert({
      game_id: state.gameId,
      question_index: state.index,
      room_player_id: seat.id,
      choice_index: stored,
      time_left: timeLeft,
    });
    if (error) {
      if (error.code === "23505") return fail("already_answered");
      throw error;
    }
    await this.send(room.code, { v: 1, type: "answered", seatId: seat.id, index: state.index });

    // Everyone's in: reveal straight away.
    const pending = await this.pending(state.gameId, state.index);
    if (Object.keys(state.players).every((id) => pending[id])) {
      const revealed = await this.reveal(room, state.index, false);
      if (revealed.ok) return revealed;
    }
    return { ok: true, game: await this.view(room, state) };
  }

  /** Scores the current question and moves to the reveal (once everyone answered or time is up). */
  private async reveal(room: RoomRow, index: number, requireTimeUp: boolean): Promise<GameOutcome> {
    const state = stateOf(room);
    if (state.phase !== "question" || state.index !== index || !state.gameId) {
      return { ok: true, game: await this.view(room, state) }; // someone else already revealed
    }
    if (requireTimeUp && !timeIsUp(state.startedAt, Date.now())) return fail("too_early");

    const planned = state.questions[state.index];
    const { data: q } = await this.db.from("questions").select("answer_index").eq("id", planned.id).single<{ answer_index: number }>();
    const pending = await this.pending(state.gameId, state.index);
    const result = this.reduce(state, { type: "reveal", index, answers: pending, answerIndex: q!.answer_index, now: Date.now() });
    if (!result.ok) return result;
    const next = result.state;

    const answers = Object.entries(next.lastReveal!.perSeat).map(([seatId, r]) => ({
      question_id: planned.id,
      room_player_id: seatId,
      question_index: index,
      choice_index: r.choice,
      correct: r.correct,
      time_left: r.timeLeft,
      points: r.breakdown.points,
    }));
    const { data: ok, error } = await this.db.rpc("room_reveal_commit", {
      p_room: room.id,
      p_version: room.state_version,
      p_state: next,
      p_game: state.gameId,
      p_answers: answers,
    });
    if (error) throw error;
    if (ok !== true) {
      const fresh = await this.load(room.code);
      return { ok: true, game: await this.view(fresh!, stateOf(fresh!)) };
    }
    for (const a of answers) {
      void logEvent("question_answered", { mode: "trivia_team", correct: a.correct, time_left: a.time_left, points: a.points }, { roomId: room.id });
    }
    return this.publish({ ...room, state_version: room.state_version + 1 }, next);
  }

  private async finish(room: RoomRow, state: TeamTriviaState): Promise<GameOutcome> {
    // first_round badge: seats whose profile has no score yet.
    const seatIds = Object.keys(state.players);
    const { data: seatRows } = await this.db.from("room_players").select("id, profile_id").in("id", seatIds);
    const firstGame = new Set<string>();
    for (const s of seatRows ?? []) {
      if (!s.profile_id) continue;
      const { count } = await this.db.from("scores").select("id", { count: "exact", head: true }).eq("profile_id", s.profile_id);
      if ((count ?? 0) === 0) firstGame.add(s.id as string);
    }
    const results = finalResults(state, firstGame);
    state = { ...state, finalSnapshot: results };
    const scores = results.standings.map((s) => ({ room_player_id: s.seatId, points: s.points, xp: s.xp, badges: s.badges }));
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
      {
        type: "trivia_team",
        duration_sec: Math.round((Date.now() - state.gameStartedAt) / 1000),
        team_scores: results.teamScores,
        players: results.standings.length,
      },
      { profileId: this.userId, roomId: room.id },
    );
    return this.publish({ ...room, state_version: room.state_version + 1 }, state);
  }

  /** Host removed a player mid-game: they stop counting toward their team. */
  async removeFromGame(roomId: string, seatId: string) {
    const { data } = await this.db.from("rooms").select("id, code, host_profile_id, status, game, game_state, state_version").eq("id", roomId).single<RoomRow>();
    if (!data) return;
    if (data.game === "charades") return new CharadesGame(this).remove(data, seatId);
    const state = stateOf(data);
    if (!state.players[seatId]) return;
    const result = this.reduce(state, { type: "remove", seatId });
    if (result.ok && (await this.commit(data, result.state))) await this.publish({ ...data, state_version: data.state_version + 1 }, result.state);
  }

  // ------------------------------------------------------------- helpers

  private reduce(state: TeamTriviaState, action: TeamAction): { ok: true; state: TeamTriviaState } | { ok: false; error: GameErrorCode } {
    return teamTriviaReducer(state, action);
  }

  async load(code: string): Promise<RoomRow | null> {
    const { data } = await this.db
      .from("rooms")
      .select("id, code, host_profile_id, status, game, game_state, state_version")
      .eq("code", code)
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RoomRow>();
    return data;
  }

  async memberRole(room: RoomRow): Promise<"host" | "player" | null> {
    if (room.host_profile_id === this.userId) return "host";
    const { count } = await this.db
      .from("room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("profile_id", this.userId)
      .is("removed_at", null);
    return (count ?? 0) > 0 ? "player" : null;
  }

  async seats(roomId: string): Promise<{ id: string; team: Team | null }[]> {
    const { data } = await this.db.from("room_players").select("id, team").eq("room_id", roomId).is("removed_at", null).order("joined_at");
    return (data ?? []) as { id: string; team: Team | null }[];
  }

  private async pending(gameId: string, index: number): Promise<Record<string, { choice: number; timeLeft: number }>> {
    const { data } = await this.db
      .from("room_pending_answers")
      .select("room_player_id, choice_index, time_left")
      .eq("game_id", gameId)
      .eq("question_index", index);
    return Object.fromEntries((data ?? []).map((r) => [r.room_player_id as string, { choice: r.choice_index as number, timeLeft: r.time_left as number }]));
  }

  async commit(room: RoomRow, state: object, status?: "lobby" | "playing"): Promise<boolean> {
    const { data, error } = await this.db.rpc("room_commit", {
      p_room: room.id,
      p_version: room.state_version,
      p_state: state,
      p_status: status ?? null,
    });
    if (error) throw error;
    return data === true;
  }

  async publish(room: RoomRow, state: TeamTriviaState): Promise<GameOutcome> {
    const game = await this.view(room, state);
    await this.send(room.code, { v: 1, type: "state", game });
    return { ok: true, game };
  }

  /** Sends a private message on one player's own channel. */
  async sendSecret(code: string, seatId: string, secret: SecretView) {
    const channel = this.db.channel(seatTopic(code, seatId), { config: { private: true } });
    try {
      await channel.httpSend("secret", { v: 1, type: "secret", secret } satisfies RoomBroadcast);
    } catch (e) {
      console.error("secret broadcast failed", e);
    } finally {
      await this.db.removeChannel(channel);
    }
  }

  async send(code: string, message: RoomBroadcast) {
    const channel = this.db.channel(roomTopic(code), { config: { private: true } });
    try {
      await channel.httpSend(message.type, message);
    } catch (e) {
      console.error("room broadcast failed", e);
    } finally {
      await this.db.removeChannel(channel);
    }
  }

  /** Public view: question text and options only; answers only after the reveal. */
  private async view(room: RoomRow, state: TeamTriviaState): Promise<TeamPublicView> {
    const showQuestion = state.phase === "question" || state.phase === "reveal" || state.phase === "scoreboard";
    const planned = showQuestion ? state.questions[state.index] : undefined;
    let row: QuestionRow | null = null;
    if (planned) {
      const { data } = await this.db
        .from("questions")
        .select("id, lang, category, difficulty, question, options, answer_index")
        .eq("id", planned.id)
        .single<QuestionRow>();
      row = data;
    }
    const answered = state.phase === "question" && state.gameId ? Object.keys(await this.pending(state.gameId, state.index)) : [];
    const reveal = (state.phase === "reveal" || state.phase === "scoreboard") && state.lastReveal && planned;
    const final = state.phase === "final" ? (state.finalSnapshot ?? finalResults(state)) : null;

    return {
      v: 1,
      kind: "trivia_team",
      phase: state.phase,
      index: state.index,
      total: state.questions.length,
      settings: { count: state.settings.count, difficulty: state.settings.difficulty },
      question:
        planned && row
          ? {
              category: row.category,
              difficulty: row.difficulty,
              lang: row.lang,
              question: row.question,
              options: planned.perm.map((i) => row!.options[i]),
              startedAt: state.startedAt,
            }
          : null,
      answered,
      players: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { team: p.team, points: p.points }])),
      teamScores: state.teamScores,
      reveal: reveal
        ? {
            correctChoice: planned.perm.indexOf(state.lastReveal!.correctStored),
            perSeat: Object.fromEntries(
              Object.entries(state.lastReveal!.perSeat).map(([id, r]) => [
                id,
                {
                  choice: r.choice === null ? null : planned.perm.indexOf(r.choice),
                  correct: r.correct,
                  points: r.breakdown.points,
                  base: r.breakdown.base,
                  speed: r.breakdown.speed,
                  streak: r.breakdown.streak,
                },
              ]),
            ),
            teamPoints: state.lastReveal!.teamPoints,
          }
        : null,
      final: final
        ? {
            winner: final.winner,
            standings: final.standings.map((s) => ({
              seatId: s.seatId,
              team: s.team,
              points: s.points,
              correct: s.correct,
              bestStreak: s.bestStreak,
              xp: s.xp,
              badges: s.badges,
            })),
          }
        : null,
      serverNow: Date.now(),
    };
  }
}
