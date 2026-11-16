"use client";

import { useTranslations } from "next-intl";
import { useProfile } from "@/lib/profile/client";
import { GameCard } from "./GameCard";

/** Daily challenge card; says when today's is already played. */
export function DailyCard() {
  const t = useTranslations("play");
  const profile = useProfile();
  const done = profile?.ok && profile.profile.dailyDoneToday;
  return (
    <GameCard
      href="/play/daily"
      tone="chair"
      name={t("games.daily.name")}
      meta={done ? t("games.dailyDone") : t("games.daily.meta")}
      tag={t("games.daily.tag")}
    />
  );
}
