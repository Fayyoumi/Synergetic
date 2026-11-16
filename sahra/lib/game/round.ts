import { DIFFICULTIES, DIFFICULTY_FILTER, type Difficulty, type RoundDifficulty } from "./scoring";

/** Pure helpers for building trivia rounds. No I/O. */

export type Rng = () => number;

/** Small seeded PRNG (mulberry32) so rounds are reproducible in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type QuestionMeta = {
  id: string;
  category: string;
  difficulty: Difficulty;
  lang: "ar" | "en";
};

export type BuildRoundInput = {
  pool: readonly QuestionMeta[];
  categories: readonly string[];
  difficulty: RoundDifficulty;
  count: number;
  locale: "ar" | "en";
  /** Question ids this player saw in the last 30 days. */
  recentIds?: ReadonlySet<string>;
  /** Question ids this player reported (never shown again to them). */
  excludedIds?: ReadonlySet<string>;
  rng: Rng;
};

export type BuiltRound = {
  questions: QuestionMeta[];
  /** Some questions came from categories the player didn't pick. */
  filledFromOtherCategories: boolean;
  /** Some questions are in the other language (not enough in the UI language). */
  usedOtherLanguage: boolean;
  /** Some questions were seen in the last 30 days (unavoidable). */
  repeats: number;
};

/**
 * Picks a round. Preference order, best first:
 * 1. not seen in the last 30 days, 2. in a selected category, 3. in the UI language.
 * Only the allowed difficulties for the round difficulty are ever used, and
 * reported questions never are. The round is ordered easiest first.
 */
export function buildRound(input: BuildRoundInput): BuiltRound {
  const allowed = new Set(DIFFICULTY_FILTER[input.difficulty]);
  const selected = new Set(input.categories);
  const recent = input.recentIds ?? new Set<string>();
  const excluded = input.excludedIds ?? new Set<string>();

  const ranked = shuffle(
    input.pool.filter((q) => allowed.has(q.difficulty) && !excluded.has(q.id)),
    input.rng,
  )
    .map((q) => ({
      q,
      key: [recent.has(q.id) ? 1 : 0, selected.has(q.category) ? 0 : 1, q.lang === input.locale ? 0 : 1],
    }))
    // Array.prototype.sort is stable, so the shuffle breaks ties randomly.
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);

  const picked = ranked.slice(0, Math.max(0, input.count)).map((r) => r.q);
  const order = (d: Difficulty) => DIFFICULTIES.indexOf(d);
  const questions = picked
    .map((q, i) => ({ q, i }))
    .sort((a, b) => order(a.q.difficulty) - order(b.q.difficulty) || a.i - b.i)
    .map((x) => x.q);

  return {
    questions,
    filledFromOtherCategories: questions.some((q) => !selected.has(q.category)),
    usedOtherLanguage: questions.some((q) => q.lang !== input.locale),
    repeats: questions.filter((q) => recent.has(q.id)).length,
  };
}

/**
 * Accepts the round a setup screen previewed (so its "highest possible score"
 * is exact) if every id is an approved question at an allowed difficulty that
 * the player hasn't reported, with no duplicates, and the round is full length
 * (or uses the whole eligible pool). Returns it ordered easiest first, or null.
 */
export function acceptProposedRound(
  ids: readonly string[] | undefined,
  pool: readonly QuestionMeta[],
  reported: ReadonlySet<string>,
  difficulty: RoundDifficulty,
  count: number,
): QuestionMeta[] | null {
  if (!ids || ids.length === 0 || new Set(ids).size !== ids.length) return null;
  const allowed = new Set<Difficulty>(DIFFICULTY_FILTER[difficulty]);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const picked: QuestionMeta[] = [];
  for (const id of ids) {
    const q = byId.get(id);
    if (!q || !allowed.has(q.difficulty) || reported.has(id)) return null;
    picked.push(q);
  }
  const eligible = pool.filter((q) => allowed.has(q.difficulty) && !reported.has(q.id)).length;
  if (picked.length !== Math.min(count, eligible)) return null;
  const order = (d: Difficulty) => DIFFICULTIES.indexOf(d);
  return picked.map((q, i) => ({ q, i })).sort((a, b) => order(a.q.difficulty) - order(b.q.difficulty) || a.i - b.i).map((x) => x.q);
}

/** A random display order for 4 options: display slot k shows stored option perm[k]. */
export function optionPermutation(rng: Rng): number[] {
  return shuffle([0, 1, 2, 3], rng);
}

export function toDisplayIndex(perm: readonly number[], storedIndex: number): number {
  return perm.indexOf(storedIndex);
}

export function toStoredIndex(perm: readonly number[], displayIndex: number): number {
  return perm[displayIndex];
}

/** 50:50 joker: two wrong stored indices to hide. */
export function fiftyFifty(answerIndex: number, rng: Rng): [number, number] {
  const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== answerIndex), rng);
  return [wrong[0], wrong[1]];
}

/** Deterministic pick for the daily challenge: same question for everyone on a date. */
export function dailyQuestionIndex(date: string, poolSize: number): number {
  if (poolSize <= 0) return -1;
  let h = 2166136261;
  for (const ch of date) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % poolSize;
}
