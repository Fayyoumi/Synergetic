/**
 * Sahra scoring rules (spec section 5). Pure functions, no I/O.
 * Arithmetic is done in integers where possible so x.5 values round the same
 * way everywhere (Math.round rounds halves up for positive numbers).
 */

export const DIFFICULTIES = ["easy", "medium", "hard", "legend"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ROUND_DIFFICULTIES = ["easy", "mixed", "hard"] as const;
export type RoundDifficulty = (typeof ROUND_DIFFICULTIES)[number];

export const QUESTION_SECONDS = 15;
export const MAX_STREAK_MULTIPLIER = 5;

export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
  legend: 500,
};

/** Which question difficulties a round difficulty may draw from. */
export const DIFFICULTY_FILTER: Record<RoundDifficulty, readonly Difficulty[]> = {
  easy: ["easy", "medium"],
  mixed: ["easy", "medium", "hard", "legend"],
  hard: ["medium", "hard", "legend"],
};

export const ROUND_LENGTH = { classic: 5, daily: 1, sudden: 50 } as const;
export type SoloMode = keyof typeof ROUND_LENGTH;

// ---------------------------------------------------------------- charades

export const CHARADES_TURN_SECONDS = 60;
export const CHARADES_SKIPS_PER_TURN = 3;
export const CHARADES_ROUNDS_PER_TEAM = 3;

/** A guessed word: 100 / 200 / 300 by difficulty 1 / 2 / 3. */
export function charadesPoints(difficulty: 1 | 2 | 3): number {
  return difficulty * 100;
}

/** A stolen (skipped) word: half points for the other team. */
export function stealPoints(difficulty: 1 | 2 | 3): number {
  return Math.round(charadesPoints(difficulty) / 2);
}

/** Whole seconds left on a countdown of `totalSec` after `elapsedMs` (shows totalSec during the first second). */
export function countdownFrom(totalSec: number, elapsedMs: number): number {
  const remainingMs = totalSec * 1000 - Math.max(0, elapsedMs);
  return Math.min(totalSec, Math.max(0, Math.ceil(remainingMs / 1000)));
}

/** Clamps to whole seconds in [0, 15]. */
export function clampTimeLeft(timeLeft: number): number {
  if (!Number.isFinite(timeLeft)) return 0;
  return Math.min(QUESTION_SECONDS, Math.max(0, Math.floor(timeLeft)));
}

export function speedBonus(base: number, timeLeft: number): number {
  // round(base * 0.5 * timeLeft / 15) == round(base * timeLeft / 30)
  return Math.round((base * clampTimeLeft(timeLeft)) / (2 * QUESTION_SECONDS));
}

export function streakBonus(base: number, speed: number, streakBefore: number): number {
  const s = Math.min(Math.max(0, Math.floor(streakBefore)), MAX_STREAK_MULTIPLIER);
  // round((base + speed) * s * 0.1)
  return Math.round(((base + speed) * s) / 10);
}

export type AnswerInput = {
  difficulty: Difficulty;
  correct: boolean;
  /** Whole seconds remaining when answered (the number on the countdown). 0 = time ran out. */
  timeLeft: number;
  streakBefore: number;
  doubleActive: boolean;
};

export type PointsBreakdown = {
  base: number;
  speed: number;
  streak: number;
  multiplier: 1 | 2;
  points: number;
  /** Streak to carry into the next question. */
  streakAfter: number;
};

/**
 * Points for one trivia answer. Wrong or timed-out answers (timeLeft 0) score 0
 * and reset the streak. The ×2 multiplier is reported even on a miss because
 * the joker is used up either way.
 */
export function scoreAnswer(input: AnswerInput): PointsBreakdown {
  const multiplier = input.doubleActive ? 2 : 1;
  if (!input.correct || clampTimeLeft(input.timeLeft) === 0) {
    return { base: 0, speed: 0, streak: 0, multiplier, points: 0, streakAfter: 0 };
  }
  const base = BASE_POINTS[input.difficulty];
  const speed = speedBonus(base, input.timeLeft);
  const streak = streakBonus(base, speed, input.streakBefore);
  return {
    base,
    speed,
    streak,
    multiplier,
    points: (base + speed + streak) * multiplier,
    streakAfter: Math.max(0, Math.floor(input.streakBefore)) + 1,
  };
}

/**
 * Highest possible score for a planned round, ignoring the ×2 joker:
 * sum of round(base_i * 1.5 * (1 + min(i, 5) * 0.1)).
 */
export function maxPossibleScore(difficulties: readonly Difficulty[]): number {
  return difficulties.reduce((sum, d, i) => {
    const base = BASE_POINTS[d];
    // base * 1.5 * (10 + min(i,5)) / 10  ==  base * 15 * (10 + min(i,5)) / 100
    return sum + Math.round((base * 15 * (10 + Math.min(i, MAX_STREAK_MULTIPLIER))) / 100);
  }, 0);
}

/** Team score for one question: the rounded average of its members' points. */
export function teamQuestionScore(memberPoints: readonly number[]): number {
  if (memberPoints.length === 0) return 0;
  const total = memberPoints.reduce((a, b) => a + b, 0);
  return Math.round(total / memberPoints.length);
}

export function xpFor(points: number): number {
  return Math.floor(Math.max(0, points) / 10);
}

/** Longest run of consecutive trues. */
export function bestStreak(results: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const ok of results) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export const BADGES = ["perfect_round", "streak_3", "streak_5", "streak_10", "golden_mind", "first_round"] as const;
export type Badge = (typeof BADGES)[number];

export type BadgeInput = {
  mode: SoloMode | "team";
  results: readonly boolean[];
  points: number;
  isFirstGame: boolean;
};

/** MVP badges earned in one game (spec section 5). */
export function badgesFor(input: BadgeInput): Badge[] {
  const badges: Badge[] = [];
  const n = input.results.length;
  if (n >= 5 && input.results.every(Boolean)) badges.push("perfect_round");
  const best = bestStreak(input.results);
  if (best >= 3) badges.push("streak_3");
  if (best >= 5) badges.push("streak_5");
  if (best >= 10) badges.push("streak_10");
  if (input.mode === "classic" && input.points >= 1500) badges.push("golden_mind");
  if (input.isFirstGame) badges.push("first_round");
  return badges;
}

/**
 * Anti-cheat: whole seconds left, judged by the server.
 * The client's `answeredAt` is used only if it isn't earlier than what the
 * server could have received (minus a latency grace), so a client can claim
 * to be slower but never faster than the server clock allows.
 */
export function serverTimeLeft(args: {
  startedAt: number;
  receivedAt: number;
  clientAnsweredAt?: number | null;
  graceMs?: number;
}): number {
  const grace = args.graceMs ?? 1500;
  const earliestPlausible = args.receivedAt - grace;
  let answeredAt = earliestPlausible;
  if (args.clientAnsweredAt != null && Number.isFinite(args.clientAnsweredAt)) {
    answeredAt = Math.max(earliestPlausible, Math.min(args.clientAnsweredAt, args.receivedAt));
  }
  const elapsedMs = Math.max(0, answeredAt - args.startedAt);
  return countdownSeconds(elapsedMs);
}

/**
 * The number the countdown shows after `elapsedMs`: 15 during the first
 * second, …, 1 during the last second, then 0 (time is up).
 */
export function countdownSeconds(elapsedMs: number): number {
  const remainingMs = QUESTION_SECONDS * 1000 - Math.max(0, elapsedMs);
  return clampTimeLeft(Math.ceil(remainingMs / 1000));
}
