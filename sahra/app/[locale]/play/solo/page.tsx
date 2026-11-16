import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { GameCard } from "@/components/play/GameCard";
import { DailyCard } from "@/components/play/DailyCard";

export async function generateMetadata({ params }: PageProps<"/[locale]/play/solo">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "play" });
  return { title: t("soloGames") };
}

/** Play hub, step 2 (solo): choose a game. */
export default async function SoloGamesPage({ params }: PageProps<"/[locale]/play/solo">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("play");
  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("soloGames")} href="/play" />
        <GameCard href="/play/trivia" tone="sunflower" name={t("games.trivia.name")} meta={t("games.trivia.meta")} tag={t("games.trivia.tag")} />
        <DailyCard />
        <GameCard href="/play/sudden" tone="tomato" name={t("games.sudden.name")} meta={t("games.sudden.meta")} tag={t("games.sudden.tag")} />
        <GameCard disabled tone="paper" name={t("games.nameAll.name")} meta={t("games.nameAll.meta")} tag={t("games.nameAll.tag")} />
      </PhoneShell>
      <BottomNav />
    </>
  );
}
