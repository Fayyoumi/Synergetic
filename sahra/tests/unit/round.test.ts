import { describe, expect, it } from "vitest";
import {
  acceptProposedRound,
  buildRound,
  dailyQuestionIndex,
  fiftyFifty,
  optionPermutation,
  seededRng,
  toDisplayIndex,
  toStoredIndex,
  type QuestionMeta,
} from "@/lib/game/round";

const q = (id: string, category: string, difficulty: QuestionMeta["difficulty"], lang: "ar" | "en" = "ar"): QuestionMeta => ({
  id,
  category,
  difficulty,
  lang,
});

const pool: QuestionMeta[] = [
  q("geo-1", "geo", "easy"),
  q("geo-2", "geo", "medium"),
  q("geo-3", "geo", "legend"),
  q("sport-1", "sport", "medium"),
  q("sport-2", "sport", "hard"),
  q("food-1", "food", "easy"),
  q("hist-1", "hist", "hard"),
  q("hist-2", "hist", "legend"),
  q("sci-1", "sci", "medium"),
  q("sci-2", "sci", "easy"),
];

describe("buildRound", () => {
  it("only uses the allowed difficulties", () => {
    for (let seed = 0; seed < 20; seed++) {
      const easy = buildRound({ pool, categories: ["geo", "sport", "food", "hist", "sci"], difficulty: "easy", count: 5, locale: "ar", rng: seededRng(seed) });
      expect(easy.questions.every((x) => x.difficulty === "easy" || x.difficulty === "medium")).toBe(true);
      const hard = buildRound({ pool, categories: ["geo"], difficulty: "hard", count: 5, locale: "ar", rng: seededRng(seed) });
      expect(hard.questions.every((x) => x.difficulty !== "easy")).toBe(true);
    }
  });

  it("prefers the selected categories, then fills from others and says so", () => {
    const r = buildRound({ pool, categories: ["geo"], difficulty: "mixed", count: 5, locale: "ar", rng: seededRng(1) });
    expect(r.questions).toHaveLength(5);
    expect(r.questions.filter((x) => x.category === "geo")).toHaveLength(3);
    expect(r.filledFromOtherCategories).toBe(true);

    const enough = buildRound({ pool, categories: ["geo", "sport", "sci"], difficulty: "mixed", count: 5, locale: "ar", rng: seededRng(1) });
    expect(enough.filledFromOtherCategories).toBe(false);
  });

  it("orders the round easiest first", () => {
    const r = buildRound({ pool, categories: ["geo", "hist"], difficulty: "mixed", count: 5, locale: "ar", rng: seededRng(4) });
    const order = ["easy", "medium", "hard", "legend"];
    const idx = r.questions.map((x) => order.indexOf(x.difficulty));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("avoids questions seen in the last 30 days when it can", () => {
    const recent = new Set(["geo-1", "geo-2"]);
    const r = buildRound({ pool, categories: ["geo"], difficulty: "mixed", count: 3, locale: "ar", recentIds: recent, rng: seededRng(2) });
    expect(r.questions.map((x) => x.id)).not.toContain("geo-1");
    expect(r.questions.map((x) => x.id)).not.toContain("geo-2");
    expect(r.repeats).toBe(0);
  });

  it("repeats only when unavoidable, and counts the repeats", () => {
    const recent = new Set(pool.map((x) => x.id));
    const r = buildRound({ pool, categories: ["geo"], difficulty: "mixed", count: 5, locale: "ar", recentIds: recent, rng: seededRng(3) });
    expect(r.questions).toHaveLength(5);
    expect(r.repeats).toBe(5);
  });

  it("never uses reported questions", () => {
    const excluded = new Set(["geo-1", "geo-2", "geo-3"]);
    const r = buildRound({ pool, categories: ["geo"], difficulty: "mixed", count: 10, locale: "ar", excludedIds: excluded, rng: seededRng(5) });
    expect(r.questions.some((x) => excluded.has(x.id))).toBe(false);
    expect(r.questions).toHaveLength(7);
  });

  it("prefers the UI language and flags the other language when used", () => {
    const mixed = [q("a", "geo", "easy", "en"), q("b", "geo", "easy", "ar"), q("c", "geo", "easy", "ar")];
    const r = buildRound({ pool: mixed, categories: ["geo"], difficulty: "easy", count: 1, locale: "en", rng: seededRng(1) });
    expect(r.questions.map((x) => x.id)).toEqual(["a"]);
    expect(r.usedOtherLanguage).toBe(false);
    const r2 = buildRound({ pool: mixed, categories: ["geo"], difficulty: "easy", count: 2, locale: "en", rng: seededRng(1) });
    expect(r2.usedOtherLanguage).toBe(true);
  });

  it("returns fewer questions when the pool is small (sudden death)", () => {
    const r = buildRound({ pool, categories: ["geo"], difficulty: "mixed", count: 50, locale: "ar", rng: seededRng(1) });
    expect(r.questions).toHaveLength(pool.length);
    expect(new Set(r.questions.map((x) => x.id)).size).toBe(pool.length);
  });
});

describe("acceptProposedRound", () => {
  const preview = (seed: number) =>
    buildRound({ pool, categories: ["geo", "sport"], difficulty: "mixed", count: 5, locale: "ar", rng: seededRng(seed) }).questions.map((x) => x.id);

  it("accepts the round the setup screen previewed, easiest first", () => {
    const ids = preview(7);
    const accepted = acceptProposedRound(ids, pool, new Set(), "mixed", 5);
    expect(accepted?.map((x) => x.id)).toEqual(ids);
    const order = ["easy", "medium", "hard", "legend"];
    const reversed = acceptProposedRound([...ids].reverse(), pool, new Set(), "mixed", 5)!;
    const ranks = reversed.map((x) => order.indexOf(x.difficulty));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("rejects unknown, duplicate, reported or wrong-difficulty ids, and short rounds", () => {
    const ids = preview(7);
    expect(acceptProposedRound([...ids.slice(0, 4), "made-up"], pool, new Set(), "mixed", 5)).toBeNull();
    expect(acceptProposedRound([...ids.slice(0, 4), ids[0]], pool, new Set(), "mixed", 5)).toBeNull();
    expect(acceptProposedRound(ids, pool, new Set([ids[2]]), "mixed", 5)).toBeNull();
    expect(acceptProposedRound(["geo-1", "geo-2", "food-1", "sci-1", "geo-3"], pool, new Set(), "easy", 5)).toBeNull(); // legend in an easy round
    expect(acceptProposedRound(ids.slice(0, 3), pool, new Set(), "mixed", 5)).toBeNull();
    expect(acceptProposedRound(undefined, pool, new Set(), "mixed", 5)).toBeNull();
  });

  it("accepts a short round when the eligible pool is small", () => {
    const tiny = pool.slice(0, 3);
    expect(acceptProposedRound(tiny.map((x) => x.id), tiny, new Set(), "mixed", 5)).toHaveLength(3);
  });
});

describe("options", () => {
  it("maps display slots to stored indices and back", () => {
    for (let seed = 0; seed < 10; seed++) {
      const perm = optionPermutation(seededRng(seed));
      expect([...perm].sort()).toEqual([0, 1, 2, 3]);
      for (let stored = 0; stored < 4; stored++) expect(toStoredIndex(perm, toDisplayIndex(perm, stored))).toBe(stored);
    }
  });

  it("50:50 hides two different wrong options, never the answer", () => {
    for (let seed = 0; seed < 50; seed++) {
      const answer = seed % 4;
      const [a, b] = fiftyFifty(answer, seededRng(seed));
      expect(a).not.toBe(b);
      expect([a, b]).not.toContain(answer);
    }
  });
});

describe("daily challenge pick", () => {
  it("is the same for everyone on a date and varies across dates", () => {
    expect(dailyQuestionIndex("2026-11-16", 12)).toBe(dailyQuestionIndex("2026-11-16", 12));
    const days = Array.from({ length: 30 }, (_, i) => dailyQuestionIndex(`2026-11-${String(i + 1).padStart(2, "0")}`, 12));
    expect(new Set(days).size).toBeGreaterThan(5);
    expect(days.every((d) => d >= 0 && d < 12)).toBe(true);
    expect(dailyQuestionIndex("2026-11-16", 0)).toBe(-1);
  });
});
