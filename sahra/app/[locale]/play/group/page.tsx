import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { GameCard } from "@/components/play/GameCard";

export async function generateMetadata({ params }: PageProps<"/[locale]/play/group">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "play" });
  return { title: t("groupGames") };
}

/**
 * Play hub, step 2 (group). Rooms arrive in Milestone 3; until then the group
 * games are listed but not startable.
 */
export default async function GroupGamesPage({ params }: PageProps<"/[locale]/play/group">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("play");
  const c = await getTranslations("common");
  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("groupGames")} href="/play" />
        <p className="rounded-[16px] ink-border bg-paper px-4 py-3 font-semibold">{t("groupSoon")}</p>
        <GameCard disabled tone="sunflower" name={t("games.teamTrivia.name")} meta={t("games.teamTrivia.meta")} tag={c("soon")} />
        <GameCard disabled tone="ink" name={t("games.mafia.name")} meta={t("games.mafia.meta")} tag={t("games.mafia.tag")} />
        <GameCard disabled tone="tomato" name={t("games.charades.name")} meta={t("games.charades.meta")} tag={c("soon")} />
        <GameCard disabled tone="chair" name={t("games.whoAmongUs.name")} meta={t("games.whoAmongUs.meta")} tag={c("soon")} />
      </PhoneShell>
      <BottomNav />
    </>
  );
}
