"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/digits";
import { useLocale } from "next-intl";

/** Circular countdown. Turns tomato at 5 seconds or less. */
export function Countdown({ seconds, total = 15, size = 56 }: { seconds: number; total?: number; size?: number }) {
  const t = useTranslations("question");
  const locale = useLocale();
  const urgent = seconds <= 5;
  const r = 24;
  const c = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, seconds / total));
  return (
    <div
      role="timer"
      aria-label={t("timer", { seconds: formatNumber(seconds, locale) })}
      className="relative shrink-0"
      style={{ width: size, height: size }}
      data-urgent={urgent}
    >
      <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill={urgent ? "var(--tomato)" : "var(--sunflower)"} stroke="var(--ink)" strokeWidth="3" />
        <circle
          cx="28"
          cy="28"
          r={r - 6}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity="0.25"
          strokeWidth="4"
          strokeDasharray={`${2 * Math.PI * (r - 6)}`}
          strokeDashoffset={`${2 * Math.PI * (r - 6) * (1 - fraction)}`}
        />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray={`${c}`} />
      </svg>
      <span
        aria-hidden="true"
        className={`display-text absolute inset-0 flex items-center justify-center text-2xl ${urgent ? "text-cream" : "text-ink"}`}
      >
        {formatNumber(seconds, locale)}
      </span>
    </div>
  );
}
