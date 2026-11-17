"use client";

import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Button, ButtonLink } from "@/components/ui";
import { ShareButton } from "@/components/share/ShareButton";
import { formatNumber } from "@/lib/i18n/digits";
import { Kassa } from "@/components/Kassa";
import { SpeechBubble } from "@/components/ui";
import { useKassa } from "@/lib/kassa/useKassa";
import type { SummaryView } from "@/lib/solo/api";

/** End of a solo game: score, correct count, best streak, XP, badges, play again / share. */
export function ResultsScreen({
  summary,
  mode,
  total,
  onAgain,
}: {
  summary: SummaryView;
  mode: "classic" | "daily" | "sudden";
  total: number | null;
  onAgain: (() => void) | null;
}) {
  const t = useTranslations("results");
  const tb = useTranslations("badges");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const tp = useTranslations("play");
  const ts = useTranslations("share");
  const say = useKassa();
  const kassaLine = summary.badges.includes("perfect_round")
    ? say("perfect_round", "family", summary.points)
    : say(summary.correct > 0 ? "final_winner" : "timeout", "family", summary.points);
  const gameName = tp(`games.${mode === "classic" ? "trivia" : mode}.name`);
  const lines = [
    total !== null && mode !== "sudden"
      ? t("correctOf", { correct: fmt(summary.correct), total: fmt(total) })
      : t("correctOpen", { correct: fmt(summary.correct) }),
    `${t("bestStreak")}: ${fmt(summary.bestStreak)}`,
  ];

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="results">
      <section className="flex flex-col items-center gap-1 rounded-[24px] ink-border-thick bg-tomato px-4 py-6 text-cream">
        <span className="font-bold">{t("yourScore")}</span>
        <span className="display-text text-7xl" data-testid="final-score">
          {fmt(summary.points)}
        </span>
        <span>
          {total !== null && mode !== "sudden"
            ? t("correctOf", { correct: fmt(summary.correct), total: fmt(total) })
            : t("correctOpen", { correct: fmt(summary.correct) })}
        </span>
      </section>

      <dl className="grid grid-cols-3 gap-3">
        {[
          [t("correct"), fmt(summary.correct)],
          [t("bestStreak"), fmt(summary.bestStreak)],
          [t("xp"), t("xpValue", { xp: fmt(summary.xp) })],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse items-center gap-1 rounded-[18px] ink-border bg-paper py-4">
            <dt className="text-sm">{label}</dt>
            <dd className="display-text text-3xl">{value}</dd>
          </div>
        ))}
      </dl>

      {summary.badges.length > 0 && (
        <section aria-labelledby="badges-title" className="flex flex-col gap-2">
          <h2 id="badges-title" className="font-bold">
            {t("badgesTitle")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {summary.badges.map((b) => (
              <li key={b}>
                <Chip tone="sunflower">{tb(b)}</Chip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-end gap-3">
        <Kassa mood={summary.correct > 0 ? "laughing" : "sad"} size={80} className="shrink-0" />
        <SpeechBubble className="flex-1">
          <span data-testid="kassa-line">{kassaLine}</span>
        </SpeechBubble>
      </div>

      {summary.dayStreak > 0 && <p className="font-semibold">{t("dayStreak", { days: fmt(summary.dayStreak) })}</p>}
      {mode === "daily" && <p className="rounded-[16px] ink-border bg-paper px-4 py-3">{t("dailyDone")}</p>}

      <div className="mt-auto grid grid-cols-2 gap-3">
        {onAgain ? (
          <Button tone="ink" size="lg" onClick={onAgain} data-testid="play-again">
            <span className="text-sunflower">{t("again")}</span>
          </Button>
        ) : (
          <ButtonLink href="/play/solo" tone="ink" size="lg">
            <span className="text-sunflower">{t("backToGames")}</span>
          </ButtonLink>
        )}
        <ShareButton
          what="solo_result"
          card={{
            kind: "result",
            heading: gameName,
            label: ts("resultLabel"),
            value: fmt(summary.points),
            lines,
            badges: summary.badges.map((b) => tb(b)),
            kassa: summary.correct > 0 ? "laughing" : "sad",
          }}
        />
      </div>
    </div>
  );
}
