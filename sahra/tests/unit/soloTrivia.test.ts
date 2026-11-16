import { describe, expect, it } from "vitest";
import { createSoloState, soloReducer, soloSummary, type PlannedQuestion, type SoloAction, type SoloState } from "@/lib/game/soloTrivia";
import { nextDayStreak, visibleDayStreak, localDate } from "@/lib/game/dayStreak";

const identity = [0, 1, 2, 3];
const planned = (id: string, difficulty: PlannedQuestion["difficulty"] = "medium", perm = identity): PlannedQuestion => ({
  id,
  category: "geo",
  difficulty,
  lang: "ar",
  perm,
});

function start(mode: "classic" | "daily" | "sudden", questions: PlannedQuestion[]): SoloState {
  return createSoloState({
    mode,
    locale: "ar",
    categories: ["geo"],
    difficulty: "mixed",
    questions,
    now: 0,
    notices: { filledFromOtherCategories: false, usedOtherLanguage: false },
  });
}

function apply(state: SoloState, action: SoloAction): SoloState {
  const r = soloReducer(state, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const answer = (s: SoloState, displayChoice: number | null, opts: Partial<{ timeLeft: number; answerIndex: number; useDouble: boolean }> = {}) =>
  apply(s, {
    type: "answer",
    index: s.index,
    displayChoice,
    timeLeft: opts.timeLeft ?? 15,
    answerIndex: opts.answerIndex ?? 0,
    useDouble: opts.useDouble ?? false,
  });

describe("solo trivia state machine", () => {
  it("plays a classic round: question → reveal → … → finished", () => {
    let s = start("classic", [planned("a"), planned("b"), planned("c")]);
    expect(s.phase).toBe("question");
    s = answer(s, 0); // correct, 300
    expect(s.phase).toBe("reveal");
    s = apply(s, { type: "next", now: 1000 });
    expect(s).toMatchObject({ phase: "question", index: 1, startedAt: 1000 });
    s = answer(s, 0); // correct with streak 1: 300 + 30
    s = apply(s, { type: "next", now: 2000 });
    s = answer(s, 2); // wrong
    expect(s.done).toBe(true);
    s = apply(s, { type: "next", now: 3000 });
    expect(s.phase).toBe("finished");
    expect(soloSummary(s)).toEqual({ points: 630, correct: 2, answered: 3, bestStreak: 2, results: [true, true, false] });
  });

  it("maps the shuffled display choice to the stored answer", () => {
    let s = start("classic", [planned("a", "medium", [2, 0, 3, 1])]);
    // stored answer 0 is shown in display slot 1
    s = answer(s, 1, { answerIndex: 0 });
    expect(s.answers[0]).toMatchObject({ choice: 0, correct: true });
  });

  it("scores a timeout (null choice) as 0 and resets the streak", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = answer(s, 0);
    s = apply(s, { type: "next", now: 1 });
    s = answer(s, null, { timeLeft: 0 });
    expect(s.answers[1]).toMatchObject({ choice: null, correct: false, breakdown: { points: 0 } });
    expect(s.streak).toBe(0);
  });

  it("times out a right answer that arrives at 0 seconds", () => {
    let s = start("classic", [planned("a")]);
    s = answer(s, 0, { timeLeft: 0 });
    expect(s.answers[0].correct).toBe(false);
    expect(s.points).toBe(0);
  });

  it("uses up ×2 even on a wrong answer, and refuses it twice", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = answer(s, 3, { useDouble: true });
    expect(s.points).toBe(0);
    expect(s.jokers.double).toBe(false);
    s = apply(s, { type: "next", now: 1 });
    expect(soloReducer(s, { type: "answer", index: 1, displayChoice: 0, timeLeft: 15, answerIndex: 0, useDouble: true })).toEqual({
      ok: false,
      error: "joker_used",
    });
  });

  it("doubles a right answer with ×2", () => {
    let s = start("classic", [planned("a", "hard")]);
    s = answer(s, 0, { useDouble: true });
    expect(s.points).toBe(900);
  });

  it("50:50 hides two wrong options once per game, and hidden options can't be picked", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = apply(s, { type: "fifty", index: 0, hiddenStored: [1, 3], answerIndex: 0 });
    expect(s.hidden).toEqual([1, 3]);
    expect(soloReducer(s, { type: "answer", index: 0, displayChoice: 1, timeLeft: 9, answerIndex: 0, useDouble: false })).toEqual({
      ok: false,
      error: "bad_choice",
    });
    s = answer(s, 0);
    s = apply(s, { type: "next", now: 1 });
    expect(s.hidden).toEqual([]);
    expect(soloReducer(s, { type: "fifty", index: 1, hiddenStored: [1, 2], answerIndex: 0 })).toEqual({ ok: false, error: "joker_used" });
  });

  it("refuses a 50:50 that would hide the answer", () => {
    const s = start("classic", [planned("a")]);
    expect(soloReducer(s, { type: "fifty", index: 0, hiddenStored: [0, 2], answerIndex: 0 })).toEqual({ ok: false, error: "bad_hidden" });
  });

  it("ignores double submissions and stale answers", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = answer(s, 0);
    expect(soloReducer(s, { type: "answer", index: 0, displayChoice: 0, timeLeft: 15, answerIndex: 0, useDouble: false })).toEqual({
      ok: false,
      error: "wrong_phase",
    });
    s = apply(s, { type: "next", now: 1 });
    expect(soloReducer(s, { type: "answer", index: 0, displayChoice: 0, timeLeft: 15, answerIndex: 0, useDouble: false })).toEqual({
      ok: false,
      error: "stale_question",
    });
  });

  it("ends sudden death at the first wrong answer", () => {
    let s = start("sudden", [planned("a"), planned("b"), planned("c")]);
    s = answer(s, 0);
    expect(s.done).toBe(false);
    s = apply(s, { type: "next", now: 1 });
    s = answer(s, 1);
    expect(s.done).toBe(true);
    s = apply(s, { type: "next", now: 2 });
    expect(s.phase).toBe("finished");
    expect(s.answers).toHaveLength(2);
  });

  it("ends sudden death when the questions run out", () => {
    let s = start("sudden", [planned("a")]);
    s = answer(s, 0);
    expect(s.done).toBe(true);
  });

  it("swaps in a replacement when a question is reported, with a fresh timer", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = apply(s, { type: "report", index: 0, now: 500, replacement: planned("z") });
    expect(s.questions.map((x) => x.id)).toEqual(["z", "b"]);
    expect(s.startedAt).toBe(500);
    expect(s.phase).toBe("question");
  });

  it("skips a reported question without scoring when nothing can replace it", () => {
    let s = start("classic", [planned("a"), planned("b")]);
    s = answer(s, 0);
    s = apply(s, { type: "next", now: 1 });
    s = apply(s, { type: "report", index: 1, now: 2, replacement: null });
    expect(s.phase).toBe("finished");
    expect(s.streak).toBe(1);
    expect(s.points).toBe(300);
  });

  it("finishes immediately when there are no questions", () => {
    expect(start("classic", []).phase).toBe("finished");
  });
});

describe("daily play streak", () => {
  it("counts consecutive days and keeps the longest", () => {
    let s = { current: 0, longest: 0, lastPlayedOn: null as string | null };
    s = nextDayStreak(s, "2026-11-14");
    s = nextDayStreak(s, "2026-11-15");
    s = nextDayStreak(s, "2026-11-15"); // same day: no change
    s = nextDayStreak(s, "2026-11-16");
    expect(s).toEqual({ current: 3, longest: 3, lastPlayedOn: "2026-11-16" });
    s = nextDayStreak(s, "2026-11-20");
    expect(s).toEqual({ current: 1, longest: 3, lastPlayedOn: "2026-11-20" });
  });

  it("crosses month and year boundaries", () => {
    expect(nextDayStreak({ current: 4, longest: 4, lastPlayedOn: "2026-12-31" }, "2027-01-01").current).toBe(5);
  });

  it("shows the streak as lapsed after a missed day", () => {
    const s = { current: 5, longest: 5, lastPlayedOn: "2026-11-14" };
    expect(visibleDayStreak(s, "2026-11-15")).toBe(5);
    expect(visibleDayStreak(s, "2026-11-16")).toBe(0);
  });

  it("uses the Amman calendar day", () => {
    // 22:30 UTC on the 15th is already the 16th in Amman (UTC+3).
    expect(localDate(new Date("2026-11-15T22:30:00Z"))).toBe("2026-11-16");
  });
});
