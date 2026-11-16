import { describe, expect, it } from "vitest";
import {
  badgesFor,
  bestStreak,
  clampTimeLeft,
  countdownSeconds,
  maxPossibleScore,
  scoreAnswer,
  serverTimeLeft,
  speedBonus,
  streakBonus,
  teamQuestionScore,
  xpFor,
} from "@/lib/game/scoring";

describe("trivia points", () => {
  it("matches the spec example: medium, full time, no streak = 300", () => {
    expect(scoreAnswer({ difficulty: "medium", correct: true, timeLeft: 15, streakBefore: 0, doubleActive: false })).toEqual({
      base: 200,
      speed: 100,
      streak: 0,
      multiplier: 1,
      points: 300,
      streakAfter: 1,
    });
  });

  it("uses the base points per difficulty", () => {
    const at = (difficulty: "easy" | "medium" | "hard" | "legend") =>
      scoreAnswer({ difficulty, correct: true, timeLeft: 1, streakBefore: 0, doubleActive: false }).base;
    expect([at("easy"), at("medium"), at("hard"), at("legend")]).toEqual([100, 200, 300, 500]);
  });

  it("computes the speed bonus as round(base * 0.5 * timeLeft / 15)", () => {
    expect(speedBonus(100, 15)).toBe(50);
    expect(speedBonus(100, 7)).toBe(23); // 23.33
    expect(speedBonus(100, 1)).toBe(3); // 3.33
    expect(speedBonus(500, 13)).toBe(217); // 216.67
    expect(speedBonus(300, 0)).toBe(0);
  });

  it("computes the streak bonus as round((base + speed) * min(streak, 5) * 0.1)", () => {
    expect(streakBonus(100, 50, 0)).toBe(0);
    expect(streakBonus(100, 50, 1)).toBe(15);
    expect(streakBonus(105, 0, 1)).toBe(11); // 10.5 rounds up
    expect(streakBonus(200, 100, 5)).toBe(150);
    expect(streakBonus(200, 100, 9)).toBe(150); // capped at 5
  });

  it("adds base + speed + streak, doubled by ×2", () => {
    const r = scoreAnswer({ difficulty: "hard", correct: true, timeLeft: 10, streakBefore: 2, doubleActive: true });
    // base 300, speed round(300*10/30)=100, streak round(400*2/10)=80 → 480 × 2
    expect(r).toMatchObject({ base: 300, speed: 100, streak: 80, points: 960, streakAfter: 3 });
  });

  it("scores a wrong answer 0 and resets the streak", () => {
    expect(scoreAnswer({ difficulty: "legend", correct: false, timeLeft: 15, streakBefore: 4, doubleActive: false })).toMatchObject({
      points: 0,
      streakAfter: 0,
    });
  });

  it("scores ×2 on a wrong answer 0 (never negative)", () => {
    const r = scoreAnswer({ difficulty: "hard", correct: false, timeLeft: 9, streakBefore: 3, doubleActive: true });
    expect(r.points).toBe(0);
    expect(r.multiplier).toBe(2);
  });

  it("treats timeLeft 0 as a timeout even if the choice was right", () => {
    expect(scoreAnswer({ difficulty: "easy", correct: true, timeLeft: 0, streakBefore: 3, doubleActive: false })).toMatchObject({
      points: 0,
      streakAfter: 0,
    });
  });

  it("clamps timeLeft into 0..15 whole seconds", () => {
    expect(clampTimeLeft(99)).toBe(15);
    expect(clampTimeLeft(-3)).toBe(0);
    expect(clampTimeLeft(7.9)).toBe(7);
    expect(clampTimeLeft(Number.NaN)).toBe(0);
  });
});

describe("highest possible score", () => {
  it("sums round(base_i * 1.5 * (1 + min(i,5) * 0.1))", () => {
    // 5 medium questions: 300, 330, 360, 390, 420
    expect(maxPossibleScore(["medium", "medium", "medium", "medium", "medium"])).toBe(1800);
    // caps the streak factor after index 5
    expect(maxPossibleScore(Array(7).fill("easy"))).toBe(150 + 165 + 180 + 195 + 210 + 225 + 225);
    expect(maxPossibleScore([])).toBe(0);
  });

  it("equals the score of a perfect, instant round without jokers", () => {
    const diffs = ["easy", "medium", "hard", "legend", "legend", "hard", "medium"] as const;
    let streak = 0;
    let total = 0;
    for (const difficulty of diffs) {
      const r = scoreAnswer({ difficulty, correct: true, timeLeft: 15, streakBefore: streak, doubleActive: false });
      total += r.points;
      streak = r.streakAfter;
    }
    expect(total).toBe(maxPossibleScore(diffs));
  });
});

describe("team trivia", () => {
  it("averages members' points, rounded, so team size doesn't matter", () => {
    expect(teamQuestionScore([300, 0, 150])).toBe(150);
    expect(teamQuestionScore([301, 0])).toBe(151); // 150.5
    expect(teamQuestionScore([200])).toBe(200);
    expect(teamQuestionScore([])).toBe(0);
  });
});

describe("xp and badges", () => {
  it("gives floor(points / 10) XP", () => {
    expect(xpFor(2845)).toBe(284);
    expect(xpFor(9)).toBe(0);
    expect(xpFor(-50)).toBe(0);
  });

  it("finds the best streak", () => {
    expect(bestStreak([true, true, false, true, true, true, false])).toBe(3);
    expect(bestStreak([])).toBe(0);
  });

  it("awards perfect_round only for 5+ all-correct rounds", () => {
    expect(badgesFor({ mode: "classic", results: Array(5).fill(true), points: 900, isFirstGame: false })).toContain("perfect_round");
    expect(badgesFor({ mode: "daily", results: [true], points: 150, isFirstGame: false })).not.toContain("perfect_round");
  });

  it("awards streak badges by best in-a-row run", () => {
    const results = [...Array(10).fill(true), false];
    expect(badgesFor({ mode: "sudden", results, points: 0, isFirstGame: false })).toEqual(["streak_3", "streak_5", "streak_10"]);
  });

  it("awards golden_mind at 1,500+ points in a classic round only", () => {
    expect(badgesFor({ mode: "classic", results: [true], points: 1500, isFirstGame: false })).toContain("golden_mind");
    expect(badgesFor({ mode: "classic", results: [true], points: 1499, isFirstGame: false })).not.toContain("golden_mind");
    expect(badgesFor({ mode: "sudden", results: [true], points: 5000, isFirstGame: false })).not.toContain("golden_mind");
  });

  it("awards first_round on the first game ever", () => {
    expect(badgesFor({ mode: "classic", results: [false], points: 0, isFirstGame: true })).toEqual(["first_round"]);
  });
});

describe("anti-cheat timing", () => {
  const startedAt = 1_000_000;

  it("shows 15 during the first second and 0 once time is up", () => {
    expect(countdownSeconds(0)).toBe(15);
    expect(countdownSeconds(999)).toBe(15);
    expect(countdownSeconds(1000)).toBe(14);
    expect(countdownSeconds(14_999)).toBe(1);
    expect(countdownSeconds(15_000)).toBe(0);
    expect(countdownSeconds(60_000)).toBe(0);
  });

  it("accepts an honest client timestamp", () => {
    expect(serverTimeLeft({ startedAt, receivedAt: startedAt + 3200, clientAnsweredAt: startedAt + 3000 })).toBe(12);
  });

  it("never lets the client claim to be faster than the server allows", () => {
    // Client says it answered instantly, but the request arrived 10 s in.
    expect(serverTimeLeft({ startedAt, receivedAt: startedAt + 10_000, clientAnsweredAt: startedAt, graceMs: 1500 })).toBe(7);
  });

  it("falls back to the server clock without a client timestamp", () => {
    expect(serverTimeLeft({ startedAt, receivedAt: startedAt + 5_000, graceMs: 0 })).toBe(10);
  });

  it("ignores client timestamps from the future", () => {
    expect(serverTimeLeft({ startedAt, receivedAt: startedAt + 2_000, clientAnsweredAt: startedAt + 99_000, graceMs: 0 })).toBe(13);
  });

  it("times out answers that arrive after 15 seconds plus grace", () => {
    expect(serverTimeLeft({ startedAt, receivedAt: startedAt + 17_000, clientAnsweredAt: startedAt + 1_000, graceMs: 1500 })).toBe(0);
  });
});
