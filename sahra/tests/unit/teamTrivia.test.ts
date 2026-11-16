import { describe, expect, it } from "vitest";
import {
  balanceTeams,
  createTeamState,
  finalResults,
  teamTriviaReducer,
  type TeamAction,
  type TeamTriviaState,
} from "@/lib/game/teamTrivia";
import type { PlannedQuestion } from "@/lib/game/soloTrivia";

const q = (id: string, difficulty: PlannedQuestion["difficulty"] = "medium"): PlannedQuestion => ({
  id,
  category: "geo",
  difficulty,
  lang: "ar",
  perm: [0, 1, 2, 3],
});

function apply(s: TeamTriviaState, a: TeamAction): TeamTriviaState {
  const r = teamTriviaReducer(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const settings = { count: 2, difficulty: "mixed" as const, locale: "ar" as const };

// Team 1: a, b. Team 2: c.
function started() {
  return apply(createTeamState(), {
    type: "start",
    gameId: "g",
    questions: [q("q1"), q("q2", "hard")],
    teams: { a: 1, b: 1, c: 2 },
    settings,
    now: 0,
  });
}

describe("team trivia state machine", () => {
  it("goes lobby → question → reveal → scoreboard → question → … → final → lobby", () => {
    let s = started();
    expect(s.phase).toBe("question");
    s = apply(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 15 }, b: { choice: 0, timeLeft: 15 }, c: { choice: 0, timeLeft: 15 } }, answerIndex: 0, now: 3000 });
    expect(s.phase).toBe("reveal");
    s = apply(s, { type: "advance", now: 4000 });
    expect(s.phase).toBe("scoreboard");
    s = apply(s, { type: "advance", now: 5000 });
    expect(s).toMatchObject({ phase: "question", index: 1, startedAt: 5000 });
    s = apply(s, { type: "reveal", index: 1, answers: {}, answerIndex: 2, now: 20_000 });
    s = apply(s, { type: "advance", now: 21_000 });
    s = apply(s, { type: "advance", now: 22_000 });
    expect(s.phase).toBe("final");
    s = apply(s, { type: "lobby" });
    expect(s.phase).toBe("lobby");
  });

  it("averages team points so team size doesn't matter", () => {
    let s = started();
    // a right at 15 s (300), b wrong (0) → team 1 = 150; c right at 15 s → team 2 = 300.
    s = apply(s, {
      type: "reveal",
      index: 0,
      answers: { a: { choice: 0, timeLeft: 15 }, b: { choice: 1, timeLeft: 15 }, c: { choice: 0, timeLeft: 15 } },
      answerIndex: 0,
      now: 1000,
    });
    expect(s.lastReveal!.teamPoints).toEqual({ 1: 150, 2: 300 });
    expect(s.teamScores).toEqual({ 1: 150, 2: 300 });
    expect(s.players.a.points).toBe(300);
    expect(s.players.b.points).toBe(0);
  });

  it("won't reveal early unless everyone answered", () => {
    const s = started();
    expect(teamTriviaReducer(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 10 } }, answerIndex: 0, now: 5000 })).toEqual({
      ok: false,
      error: "too_early",
    });
    expect(teamTriviaReducer(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 10 } }, answerIndex: 0, now: 15_000 }).ok).toBe(true);
  });

  it("scores a player who disconnected mid-question 0 and resets their streak", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 12 }, b: { choice: 0, timeLeft: 12 }, c: { choice: 0, timeLeft: 12 } }, answerIndex: 0, now: 1 });
    s = apply(s, { type: "advance", now: 2 });
    s = apply(s, { type: "advance", now: 3 });
    // b drops off and never answers question 2.
    s = apply(s, { type: "reveal", index: 1, answers: { a: { choice: 2, timeLeft: 15 }, c: { choice: 2, timeLeft: 15 } }, answerIndex: 2, now: 15_003 });
    expect(s.lastReveal!.perSeat.b).toMatchObject({ choice: null, correct: false, breakdown: { points: 0 } });
    expect(s.players.b.streak).toBe(0);
    // Team 1's average includes b's 0: leaving never helps a team.
    expect(s.lastReveal!.teamPoints[1]).toBe(Math.round(s.lastReveal!.perSeat.a.breakdown.points / 2));
  });

  it("uses each player's own streak bonus", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 15 }, b: { choice: 1, timeLeft: 15 }, c: { choice: 0, timeLeft: 15 } }, answerIndex: 0, now: 1 });
    s = apply(s, { type: "advance", now: 2 });
    s = apply(s, { type: "advance", now: 3 });
    s = apply(s, { type: "reveal", index: 1, answers: { a: { choice: 0, timeLeft: 15 }, b: { choice: 0, timeLeft: 15 }, c: { choice: 0, timeLeft: 15 } }, answerIndex: 0, now: 4 });
    // hard: 300 + 150 = 450; a has a streak of 1 → +45
    expect(s.lastReveal!.perSeat.a.breakdown.points).toBe(495);
    expect(s.lastReveal!.perSeat.b.breakdown.points).toBe(450);
  });

  it("treats an answer at 0 seconds as a timeout", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 0 } }, answerIndex: 0, now: 15_000 });
    expect(s.lastReveal!.perSeat.a.correct).toBe(false);
  });

  it("refuses stale and out-of-phase actions", () => {
    let s = started();
    expect(teamTriviaReducer(s, { type: "reveal", index: 1, answers: {}, answerIndex: 0, now: 99_999 })).toEqual({ ok: false, error: "stale_question" });
    expect(teamTriviaReducer(s, { type: "lobby" })).toEqual({ ok: false, error: "wrong_phase" });
    s = apply(s, { type: "reveal", index: 0, answers: {}, answerIndex: 0, now: 15_000 });
    expect(teamTriviaReducer(s, { type: "reveal", index: 0, answers: {}, answerIndex: 0, now: 15_000 })).toEqual({ ok: false, error: "wrong_phase" });
  });

  it("needs players on both teams to start", () => {
    expect(
      teamTriviaReducer(createTeamState(), { type: "start", gameId: "g", questions: [q("x")], teams: { a: 1, b: 1 }, settings, now: 0 }),
    ).toEqual({ ok: false, error: "need_two_teams" });
  });

  it("lets late joiners play from the next question, and removed players stop counting", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: {}, answerIndex: 0, now: 15_000 });
    s = apply(s, { type: "advance", now: 1 });
    s = apply(s, { type: "advance", now: 2, joinedTeams: { d: 2 } });
    expect(s.players.d).toEqual({ team: 2, points: 0, streak: 0, results: [] });
    s = apply(s, { type: "remove", seatId: "b" });
    expect(Object.keys(s.players).sort()).toEqual(["a", "c", "d"]);
  });

  it("final results: winner, standings, XP and badges", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: { a: { choice: 0, timeLeft: 15 }, c: { choice: 1, timeLeft: 15 } }, answerIndex: 0, now: 15_000 });
    const r = finalResults(s, new Set(["c"]));
    expect(r.winner).toBe(1);
    expect(r.standings[0]).toMatchObject({ seatId: "a", points: 300, xp: 30, correct: 1 });
    expect(r.standings.find((x) => x.seatId === "c")!.badges).toEqual(["first_round"]);
  });

  it("calls a tie a tie", () => {
    let s = started();
    s = apply(s, { type: "reveal", index: 0, answers: {}, answerIndex: 0, now: 15_000 });
    expect(finalResults(s).winner).toBeNull();
  });
});

describe("balanceTeams", () => {
  it("keeps chosen teams and puts the rest on the smaller team", () => {
    expect(balanceTeams(["a", "b", "c", "d", "e"], { a: 1, b: 1 })).toEqual({ a: 1, b: 1, c: 2, d: 2, e: 1 });
    expect(balanceTeams(["a", "b"], {})).toEqual({ a: 1, b: 2 });
  });
});
