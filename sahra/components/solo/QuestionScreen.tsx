"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Chip, difficultyTone } from "@/components/Chip";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui";
import { BASE_POINTS, countdownSeconds } from "@/lib/game/scoring";
import { formatNumber } from "@/lib/i18n/digits";
import type { SoloView } from "@/lib/solo/api";
import { Kassa } from "@/components/Kassa";
import { useKassa } from "@/lib/kassa/useKassa";
import { playSound } from "@/lib/sound";

type Props = {
  view: SoloView;
  /** serverNow − Date.now() when the view arrived. */
  clockOffset: number;
  busy: boolean;
  onAnswer: (choice: number | null, answeredAt: number, double: boolean) => void;
  onFifty: () => void;
  onNext: () => void;
  onReport: () => void;
};

export function QuestionScreen({ view, clockOffset, busy, onAnswer, onFifty, onNext, onReport }: Props) {
  const t = useTranslations("question");
  const td = useTranslations("difficulty");
  const tc = useTranslations("categories");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const q = view.question!;
  const reveal = view.phase === "question" ? null : view.reveal;
  const [doubleArmed, setDoubleArmed] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [seconds, setSeconds] = useState(() => countdownSeconds(Date.now() + clockOffset - q.startedAt));
  const sentTimeout = useRef<number | null>(null);

  // Countdown, synced to the server clock. At 0 the phone reports a timeout once.
  useEffect(() => {
    if (reveal) return;
    const tick = () => {
      const s = countdownSeconds(Date.now() + clockOffset - q.startedAt);
      setSeconds((prev) => {
        if (s !== prev && s > 0 && s <= 5) playSound("tick");
        return s;
      });
      if (s === 0 && sentTimeout.current !== q.startedAt) {
        sentTimeout.current = q.startedAt;
        onAnswer(null, Date.now() + clockOffset, false);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [reveal, q.startedAt, clockOffset, onAnswer]);

  const letters = t("letters").split(",");
  const say = useKassa();
  // Sound on the reveal (once per question).
  const revealed = reveal ? (reveal.correct ? "correct" : "wrong") : null;
  useEffect(() => {
    if (revealed) playSound(revealed);
  }, [revealed]);
  const kassaEvent = !reveal
    ? null
    : reveal.correct
      ? view.streak === 3
        ? "streak_3"
        : "correct"
      : reveal.timedOut
        ? "timeout"
        : "wrong";
  const kassaLine = kassaEvent ? say(kassaEvent, "family", `${view.gameId}:${q.index}`, { points: fmt(reveal!.points) }) : null;
  const otherLang = q.lang !== locale;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* Frozen at the moment of answering once the reveal shows. */}
        <Countdown seconds={seconds} />
        {q.total !== null ? (
          <>
            <div
              role="progressbar"
              aria-label={t("progressLabel", { n: fmt(q.index + 1), total: fmt(q.total) })}
              aria-valuemin={0}
              aria-valuemax={q.total}
              aria-valuenow={q.index + 1}
              className="h-3 flex-1 overflow-hidden rounded-full ink-border bg-paper"
            >
              {/* Logical width grows from the start side, so it fills right-to-left in Arabic. */}
              <div className="h-full bg-chair" style={{ width: `${((q.index + 1) / q.total) * 100}%` }} />
            </div>
            <span className="font-bold">{t("progress", { n: fmt(q.index + 1), total: fmt(q.total) })}</span>
          </>
        ) : (
          <span className="flex-1 font-bold">{t("progressOpen", { n: fmt(q.index + 1) })}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip tone="sunflower">{tc(q.category)}</Chip>
        <Chip tone={difficultyTone[q.difficulty]}>
          {td("chip", { label: td(q.difficulty), points: fmt(BASE_POINTS[q.difficulty]) })}
        </Chip>
        {view.streak >= 2 && !reveal && <Chip tone="tomato">{t("streakChip", { count: fmt(view.streak) })}</Chip>}
        {otherLang && <Chip>{t("otherLang")}</Chip>}
      </div>

      <h2
        className="display-text text-3xl leading-snug"
        lang={q.lang}
        dir={q.lang === "ar" ? "rtl" : "ltr"}
        data-testid="question-text"
      >
        {q.question}
      </h2>

      <ol className="flex flex-col gap-3" aria-label={q.question} dir={q.lang === "ar" ? "rtl" : "ltr"}>
        {q.options.map((label, i) => {
          const hidden = !reveal && q.hidden.includes(i);
          const isCorrect = reveal?.correctChoice === i;
          const isPicked = reveal?.choice === i;
          let cls = "bg-paper text-ink";
          if (reveal && isCorrect) cls = "bg-chair text-ink";
          else if (reveal && isPicked) cls = "bg-tomato text-cream";
          else if (reveal) cls = "bg-paper text-ink opacity-50";
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!!reveal || busy || hidden}
                onClick={() => onAnswer(i, Date.now() + clockOffset, doubleArmed)}
                className={`flex min-h-14 w-full items-center gap-3 rounded-[18px] ink-border px-3 py-2 text-start text-lg font-semibold transition-opacity ${cls} ${
                  hidden ? "invisible" : ""
                }`}
                data-testid={`option-${i}`}
                data-state={reveal ? (isCorrect ? "correct" : isPicked ? "picked" : "other") : "open"}
              >
                <span className="display-text flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-ink text-cream">
                  {letters[i]}
                </span>
                <span lang={q.lang} className="flex-1">
                  {label}
                </span>
                {reveal && isCorrect && <span className="rounded-full bg-paper px-2 text-sm font-bold ink-border">{t("correctLabel")}</span>}
                {reveal && isPicked && !isCorrect && (
                  <span className="rounded-full bg-paper px-2 text-sm font-bold text-ink ink-border">{t("yourAnswer")}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {reveal ? (
        <div className="flex flex-col gap-3" aria-live="assertive">
          <div className={`rounded-[20px] ink-border p-4 ${reveal.correct ? "bg-chair" : "bg-paper"}`} data-testid="reveal-card">
            {reveal.correct ? (
              <>
                <p className="display-text text-3xl">{t("gained", { points: fmt(reveal.points) })}</p>
                <p className="font-semibold">
                  {t("breakdown", { base: fmt(reveal.base), speed: fmt(reveal.speed), streak: fmt(reveal.streakBonus) })}
                  {reveal.doubled && ` · ${t("doubled")}`}
                </p>
              </>
            ) : (
              <>
                <p className="display-text text-3xl text-tomato">{reveal.timedOut ? t("timeout") : t("wrong")}</p>
                <p className="text-muted">{t("correctWas", { answer: q.options[reveal.correctChoice] })}</p>
              </>
            )}
          </div>
          {kassaLine && (
            <div className="flex items-end gap-3" data-testid="kassa-line">
              <Kassa mood={reveal.correct ? "laughing" : reveal.timedOut ? "shocked" : "sad"} size={70} className="shrink-0" />
              <p className="rounded-[18px] rounded-es-[4px] ink-border bg-paper px-3 py-2 font-semibold">{kassaLine}</p>
            </div>
          )}
          <Button tone="sunflower" size="lg" block onClick={onNext} disabled={busy} data-testid="next">
            {reveal.done ? t("results") : t("next")}
          </Button>
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Button tone="paper" size="md" disabled={!view.jokers.fifty || busy} onClick={onFifty} data-testid="joker-fifty">
              {view.jokers.fifty ? t("fifty") : `${t("fifty")} · ${t("jokerUsed")}`}
            </Button>
            <Button
              tone="paper"
              size="md"
              selected={doubleArmed}
              disabled={!view.jokers.double || busy}
              onClick={() => setDoubleArmed((x) => !x)}
              data-testid="joker-double"
            >
              {!view.jokers.double ? `${t("double")} · ${t("jokerUsed")}` : doubleArmed ? t("doubleOn") : t("double")}
            </Button>
          </div>
          {reporting ? (
            <div className="flex flex-col gap-2 rounded-[16px] ink-border bg-paper p-3">
              <p>{t("reportConfirm")}</p>
              <div className="flex gap-2">
                <Button tone="tomato" size="md" onClick={onReport} disabled={busy}>
                  {t("reportSend")}
                </Button>
                <Button tone="paper" size="md" onClick={() => setReporting(false)}>
                  {t("reportCancel")}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="min-h-11 self-center text-sm font-semibold text-muted underline">
              {t("report")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
