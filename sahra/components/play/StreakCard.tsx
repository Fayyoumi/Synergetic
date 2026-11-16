"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/digits";
import { useProfile } from "@/lib/profile/client";

/** Reminder at the bottom of the Play hub: "5 days in a row. Play today…". */
export function StreakCard() {
  const t = useTranslations("play");
  const locale = useLocale();
  const result = useProfile();
  if (!result || !result.ok) return null;
  const { dayStreak, playedToday } = result.profile;
  const days = formatNumber(dayStreak, locale);
  const text = dayStreak === 0 ? t("streakNone") : playedToday ? t("streakToday", { days }) : t("streak", { days });
  return (
    <div className="flex items-center gap-3 rounded-[20px] ink-border bg-paper px-4 py-3" data-testid="streak-card">
      {dayStreak > 0 && <span className="display-text text-3xl text-tomato">{days}</span>}
      <p className="font-semibold">{text}</p>
    </div>
  );
}
