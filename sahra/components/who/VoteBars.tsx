"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/digits";
import type { Seat } from "@/lib/rooms/api";

/**
 * Vote reveal bars: most votes in tomato, others in sunflower, each with the
 * count as text (never colour alone). Bars grow in from zero.
 */
export function VoteBars({ tally, top, seats, large }: { tally: Record<string, number>; top: string[]; seats: Seat[]; large?: boolean }) {
  const t = useTranslations("who");
  const locale = useLocale();
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className={large ? "text-3xl" : ""}>{t("noVotes")}</p>;
  return (
    <ol className="flex flex-col gap-3" data-testid="vote-bars">
      {rows.map(([seatId, n]) => {
        const seat = seats.find((s) => s.id === seatId);
        const isTop = top.includes(seatId);
        return (
          <li key={seatId} className="flex items-center gap-3" data-testid={`bar-${seat?.name ?? seatId}`} data-top={isTop}>
            <span className={`w-36 shrink-0 truncate font-bold ${large ? "text-3xl" : "text-lg"}`}>{seat?.name ?? "?"}</span>
            <span className={`relative flex-1 overflow-hidden rounded-full ink-border bg-paper ${large ? "h-12" : "h-8"}`}>
              <span
                className={`absolute inset-y-0 start-0 rounded-full transition-[width] duration-1000 ease-out ${isTop ? "bg-tomato" : "bg-sunflower"}`}
                style={{ width: grown ? `${(n / max) * 100}%` : "0%" }}
              />
            </span>
            <span className={`display-text w-28 shrink-0 text-end ${large ? "text-3xl" : "text-lg"}`}>{t("votes", { n, count: formatNumber(n, locale) })}</span>
          </li>
        );
      })}
    </ol>
  );
}
