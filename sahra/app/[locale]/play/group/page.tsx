import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { GameCard } from "@/components/play/GameCard";
import { GroupGameCards } from "@/components/play/GroupGameCards";
import { JoinCodeForm } from "@/components/room/JoinCodeForm";

export async function generateMetadata({ params }: PageProps<"/[locale]/play/group">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "play" });
  return { title: t("groupGames") };
}

/** Play hub, step 2 (group): picking a game creates a room and opens the host screen. */
export default async function GroupGamesPage({ params }: PageProps<"/[locale]/play/group">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("play");
  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("groupGames")} href="/play" />
        <p className="text-muted">{t("groupSoon")}</p>
        <GroupGameCards />
        <GameCard disabled tone="ink" name={t("games.mafia.name")} meta={t("games.mafia.meta")} tag={t("games.mafia.tag")} />
        <p className="text-sm text-muted">{t("gamesSoonNote")}</p>
        <div className="mt-2 rounded-[20px] ink-border bg-paper p-4">
          <JoinCodeForm compact />
        </div>
      </PhoneShell>
      <BottomNav />
    </>
  );
}
