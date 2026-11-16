import { badgesFor, QUESTION_SECONDS, scoreAnswer, teamQuestionScore, xpFor, type Badge, type PointsBreakdown, type RoundDifficulty } from "./scoring";
import type { PlannedQuestion } from "./soloTrivia";

/**
 * Team trivia state machine (pure; the server runs it, the host screen drives it).
 *   lobby → question → reveal → scoreboard → question → … → final → lobby
 * Each player answers on their phone and scores individually (same formula as
 * solo, no jokers). A team's score for a question is the rounded average of
 * its members' points, so teams of different sizes are fair. Members who
 * don't answer (or are disconnected) score 0 for that question: leaving never helps.
 */

export type Team = 1 | 2;
export const TEAMS: readonly Team[] = [1, 2];

export type PlayerScore = {
  team: Team;
  points: number;
  streak: number;
  results: boolean[];
};

export type SeatResult = {
  /** Stored option index, or null = no answer / timeout. */
  choice: number | null;
  correct: boolean;
  timeLeft: number;
  breakdown: PointsBreakdown;
};

export type RevealResult = {
  index: number;
  correctStored: number;
  perSeat: Record<string, SeatResult>;
  teamPoints: Record<Team, number>;
};

export type TeamSettings = { count: number; difficulty: RoundDifficulty; locale: "ar" | "en" };

export type TeamTriviaState = {
  v: 1;
  kind: "trivia_team";
  phase: "lobby" | "question" | "reveal" | "scoreboard" | "final";
  gameId: string | null;
  settings: TeamSettings;
  questions: PlannedQuestion[];
  index: number;
  /** Server clock (ms) when the current question went up. */
  startedAt: number;
  gameStartedAt: number;
  players: Record<string, PlayerScore>;
  teamScores: Record<Team, number>;
  lastReveal: RevealResult | null;
  /** Saved when the game ends (includes first-game badges, which need the database). */
  finalSnapshot?: ReturnType<typeof finalResults>;
};

export type PendingAnswer = { choice: number; timeLeft: number };

export type TeamAction =
  | { type: "start"; gameId: string; questions: PlannedQuestion[]; teams: Record<string, Team>; settings: TeamSettings; now: number }
  | { type: "reveal"; index: number; answers: Record<string, PendingAnswer>; answerIndex: number; now: number }
  | { type: "advance"; now: number; joinedTeams?: Record<string, Team> }
  | { type: "remove"; seatId: string }
  | { type: "lobby" };

export type TeamError = "wrong_phase" | "stale_question" | "too_early" | "need_two_teams" | "no_questions";
export type TeamResult = { ok: true; state: TeamTriviaState } | { ok: false; error: TeamError };

const fail = (error: TeamError): TeamResult => ({ ok: false, error });

export function createTeamState(settings: TeamSettings = { count: 10, difficulty: "mixed", locale: "ar" }): TeamTriviaState {
  return {
    v: 1,
    kind: "trivia_team",
    phase: "lobby",
    gameId: null,
    settings,
    questions: [],
    index: 0,
    startedAt: 0,
    gameStartedAt: 0,
    players: {},
    teamScores: { 1: 0, 2: 0 },
    lastReveal: null,
  };
}

/** Puts seats without a team on the smaller team (ties → team 1), in the given order. */
export function balanceTeams(seatIds: readonly string[], current: Readonly<Record<string, Team | null | undefined>>): Record<string, Team> {
  const out: Record<string, Team> = {};
  const size: Record<Team, number> = { 1: 0, 2: 0 };
  for (const id of seatIds) {
    const t = current[id];
    if (t === 1 || t === 2) {
      out[id] = t;
      size[t]++;
    }
  }
  for (const id of seatIds) {
    if (out[id]) continue;
    const t: Team = size[1] <= size[2] ? 1 : 2;
    out[id] = t;
    size[t]++;
  }
  return out;
}

/** True once the question's time is up (with the reveal allowed right at 0). */
export function timeIsUp(startedAt: number, now: number): boolean {
  return now - startedAt >= QUESTION_SECONDS * 1000;
}

export function teamTriviaReducer(state: TeamTriviaState, action: TeamAction): TeamResult {
  switch (action.type) {
    case "start": {
      if (state.phase !== "lobby" && state.phase !== "final") return fail("wrong_phase");
      if (action.questions.length === 0) return fail("no_questions");
      const teamsUsed = new Set(Object.values(action.teams));
      if (!teamsUsed.has(1) || !teamsUsed.has(2)) return fail("need_two_teams");
      const players: Record<string, PlayerScore> = {};
      for (const [seat, team] of Object.entries(action.teams)) players[seat] = { team, points: 0, streak: 0, results: [] };
      return {
        ok: true,
        state: {
          ...createTeamState(action.settings),
          phase: "question",
          gameId: action.gameId,
          questions: action.questions,
          startedAt: action.now,
          gameStartedAt: action.now,
          players,
        },
      };
    }

    case "reveal": {
      if (state.phase !== "question") return fail("wrong_phase");
      if (action.index !== state.index) return fail("stale_question");
      const seats = Object.keys(state.players);
      const allAnswered = seats.every((s) => action.answers[s] !== undefined);
      if (!allAnswered && !timeIsUp(state.startedAt, action.now)) return fail("too_early");

      const q = state.questions[state.index];
      const perSeat: Record<string, SeatResult> = {};
      const players = { ...state.players };
      for (const seat of seats) {
        const p = players[seat];
        const a = action.answers[seat];
        const correct = !!a && a.choice === action.answerIndex && a.timeLeft > 0;
        const breakdown = scoreAnswer({
          difficulty: q.difficulty,
          correct,
          timeLeft: a?.timeLeft ?? 0,
          streakBefore: p.streak,
          doubleActive: false,
        });
        perSeat[seat] = { choice: a?.choice ?? null, correct, timeLeft: a?.timeLeft ?? 0, breakdown };
        players[seat] = {
          ...p,
          points: p.points + breakdown.points,
          streak: breakdown.streakAfter,
          results: [...p.results, correct],
        };
      }
      const teamPoints = {} as Record<Team, number>;
      for (const t of TEAMS) {
        teamPoints[t] = teamQuestionScore(seats.filter((s) => state.players[s].team === t).map((s) => perSeat[s].breakdown.points));
      }
      return {
        ok: true,
        state: {
          ...state,
          phase: "reveal",
          players,
          teamScores: { 1: state.teamScores[1] + teamPoints[1], 2: state.teamScores[2] + teamPoints[2] },
          lastReveal: { index: state.index, correctStored: action.answerIndex, perSeat, teamPoints },
        },
      };
    }

    case "advance": {
      if (state.phase === "reveal") return { ok: true, state: { ...state, phase: "scoreboard" } };
      if (state.phase !== "scoreboard") return fail("wrong_phase");
      if (state.index >= state.questions.length - 1) return { ok: true, state: { ...state, phase: "final" } };
      // Late joiners start playing from the next question.
      const players = { ...state.players };
      for (const [seat, team] of Object.entries(action.joinedTeams ?? {})) {
        if (!players[seat]) players[seat] = { team, points: 0, streak: 0, results: [] };
      }
      return { ok: true, state: { ...state, phase: "question", index: state.index + 1, startedAt: action.now, players } };
    }

    case "remove": {
      if (!state.players[action.seatId]) return { ok: true, state };
      const players = { ...state.players };
      delete players[action.seatId];
      return { ok: true, state: { ...state, players } };
    }

    case "lobby": {
      if (state.phase !== "final") return fail("wrong_phase");
      return { ok: true, state: { ...createTeamState(state.settings) } };
    }
  }
}

export type FinalStanding = {
  seatId: string;
  team: Team;
  points: number;
  xp: number;
  correct: number;
  bestStreak: number;
  badges: Badge[];
};

/** Final results: winner (null on a tie), and per-player points, XP and badges. */
export function finalResults(state: TeamTriviaState, firstGameSeats: ReadonlySet<string> = new Set()) {
  const standings: FinalStanding[] = Object.entries(state.players)
    .map(([seatId, p]) => {
      let best = 0;
      let run = 0;
      for (const ok of p.results) {
        run = ok ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return {
        seatId,
        team: p.team,
        points: p.points,
        xp: xpFor(p.points),
        correct: p.results.filter(Boolean).length,
        bestStreak: best,
        badges: badgesFor({ mode: "team", results: p.results, points: p.points, isFirstGame: firstGameSeats.has(seatId) }),
      };
    })
    .sort((a, b) => b.points - a.points);
  const [s1, s2] = [state.teamScores[1], state.teamScores[2]];
  const winner: Team | null = s1 === s2 ? null : s1 > s2 ? 1 : 2;
  return { winner, teamScores: state.teamScores, standings };
}
