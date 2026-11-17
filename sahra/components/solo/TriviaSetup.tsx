"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ToggleChip } from "@/components/Chip";
import { Button } from "@/components/ui";
import { CATEGORIES, IMAGE_CATEGORIES, type Category } from "@/lib/content/schemas";
import { buildRound, seededRng } from "@/lib/game/round";
import { BASE_POINTS, DIFFICULTY_FILTER, maxPossibleScore, ROUND_LENGTH, type RoundDifficulty } from "@/lib/game/scoring";
import { formatNumber } from "@/lib/i18n/digits";
import type { SoloCatalog } from "@/lib/solo/api";
import { fetchCatalog } from "@/lib/solo/client";

export type SetupChoice = { categories: Category[]; difficulty: RoundDifficulty; questionIds?: string[] };

const DIFF_LABEL = { easy: "diffEasy", mixed: "diffMixed", hard: "diffHard" } as const;

/** Category chips + difficulty + summary box (questions, highest possible score, rule). */
export function TriviaSetup({
  mode,
  busy,
  onStart,
  onError,
}: {
  mode: "classic" | "sudden";
  busy: boolean;
  onStart: (choice: SetupChoice) => void;
  onError: (error: string) => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("categories");
  const tCommon = useTranslations("common");
  const locale = useLocale() as "ar" | "en";
  const fmt = (n: number) => formatNumber(n, locale);

  const [catalog, setCatalog] = useState<SoloCatalog | null>(null);
  const [selected, setSelected] = useState<Category[] | null>(null);
  const [difficulty, setDifficulty] = useState<RoundDifficulty>("mixed");
  // One seed per visit so the preview doesn't reshuffle on every tap.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  useEffect(() => {
    let alive = true;
    void fetchCatalog().then((r) => {
      if (!alive) return;
      if (r.ok) setCatalog(r.catalog);
      else onError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [onError]);

  // Hide categories without approved questions (and the image categories in the MVP).
  const available = useMemo(() => {
    const present = new Set(catalog?.pool.map((q) => q.category));
    return CATEGORIES.filter((c) => !IMAGE_CATEGORIES.includes(c) && present.has(c));
  }, [catalog]);
  const categories = selected ?? available;

  const effectiveDifficulty: RoundDifficulty = mode === "sudden" ? "mixed" : difficulty;
  const preview = useMemo(() => {
    if (!catalog || categories.length === 0) return null;
    return buildRound({
      pool: catalog.pool,
      categories,
      difficulty: effectiveDifficulty,
      count: ROUND_LENGTH[mode],
      locale,
      recentIds: new Set(catalog.recentIds),
      excludedIds: new Set(catalog.reportedIds),
      rng: seededRng(seed),
    });
  }, [catalog, categories, effectiveDifficulty, mode, locale, seed]);

  const toggle = (c: Category) =>
    setSelected((prev) => {
      const cur = prev ?? available;
      return cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
    });

  const range = (d: RoundDifficulty) => {
    const bases = DIFFICULTY_FILTER[d].map((x) => BASE_POINTS[x]);
    return t("range", { min: fmt(Math.min(...bases)), max: fmt(Math.max(...bases)) });
  };
  const count = preview?.questions.length ?? 0;
  const max = preview ? maxPossibleScore(preview.questions.map((q) => q.difficulty)) : 0;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section aria-labelledby="cat-title" className="flex flex-col gap-3">
        <h2 id="cat-title" className="text-lg">
          <span className="font-bold">{t("categories")}</span>{" "}
          <span className="text-muted">{t("selectedCount", { count: fmt(categories.length) })}</span>
        </h2>
        {/* The rest of the screen renders on the server; only the categories wait for the catalog. */}
        {!catalog && <p className="text-muted">{tCommon("loading")}</p>}
        <div className="flex flex-wrap gap-2">
          {available.map((c) => (
            <ToggleChip key={c} pressed={categories.includes(c)} onClick={() => toggle(c)}>
              {tc(c)}
            </ToggleChip>
          ))}
        </div>
        {catalog && categories.length === 0 && (
          <p role="alert" className="font-semibold text-tomato">
            {t("pickOne")}
          </p>
        )}
      </section>

      {mode === "classic" && (
        <section aria-labelledby="diff-title" className="flex flex-col gap-3">
          <h2 id="diff-title" className="text-lg font-bold">
            {t("difficulty")}
          </h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="diff-title">
            {(["easy", "mixed", "hard"] as const).map((d) => {
              const on = difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDifficulty(d)}
                  className={`flex min-h-20 flex-col items-center justify-center rounded-[20px] px-1 ${
                    on ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"
                  }`}
                >
                  <span className="display-text text-2xl">{t(DIFF_LABEL[d])}</span>
                  <span className="text-xs">{range(d)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-cream" aria-live="polite">
        <div className="flex items-center justify-between">
          <span>{t("questionCount")}</span>
          <span className="display-text text-2xl" data-testid="setup-count">
            {mode === "sudden" ? t("untilWrong") : catalog ? fmt(count) : "…"}
          </span>
        </div>
        {mode === "classic" && (
          <div className="flex items-center justify-between">
            <span>{t("maxScore")}</span>
            <span className="display-text text-3xl text-sunflower" data-testid="setup-max">
              {catalog ? fmt(max) : "…"}
            </span>
          </div>
        )}
        <p className="text-sm leading-relaxed">{mode === "sudden" ? t("suddenRule") : t("rule")}</p>
        {mode === "classic" && preview?.filledFromOtherCategories && <p className="text-sm text-sunflower">{t("filledNotice")}</p>}
        {preview?.usedOtherLanguage && <p className="text-sm text-sunflower">{t("otherLangNotice")}</p>}
        {mode === "classic" && (preview?.repeats ?? 0) > 0 && <p className="text-sm text-sunflower">{t("repeatNotice")}</p>}
      </section>

      {preview && count === 0 && categories.length > 0 && (
        <p role="alert" className="font-semibold text-tomato">
          {t("noQuestions")}
        </p>
      )}

      <div className="mt-auto">
        <Button
          tone="tomato"
          size="xl"
          block
          disabled={busy || categories.length === 0 || count === 0}
          onClick={() =>
            onStart({
              categories,
              difficulty: effectiveDifficulty,
              questionIds: mode === "classic" ? preview?.questions.map((q) => q.id) : undefined,
            })
          }
        >
          {t("start")}
        </Button>
      </div>
    </div>
  );
}
