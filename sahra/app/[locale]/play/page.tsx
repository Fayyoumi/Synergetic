import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { StreakCard } from "@/components/play/StreakCard";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: PageProps<"/[locale]/play">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("play") };
}

const personIcon = (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </svg>
);
const groupIcon = (
  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5" />
    <path d="M15 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2 .7 3.4 2.5 4 5.2" />
  </svg>
);

/** Play hub, step 1: choose Solo or Group. */
export default async function PlayPage({ params }: PageProps<"/[locale]/play">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("play");

  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("title")} href="/" />
        <p className="text-lg text-muted">{t("subtitle")}</p>
        <Link href="/play/solo" className="flex flex-col gap-2 rounded-[24px] ink-border-thick bg-chair p-6 text-ink">
          {personIcon}
          <span className="display-text text-5xl">{t("solo")}</span>
          <span className="text-lg">{t("soloBody")}</span>
        </Link>
        <Link href="/play/group" className="flex flex-col gap-2 rounded-[24px] ink-border-thick bg-tomato p-6 text-cream">
          {groupIcon}
          <span className="display-text text-5xl">{t("group")}</span>
          <span className="text-lg">{t("groupBody")}</span>
        </Link>
        <div className="mt-auto">
          <StreakCard />
        </div>
      </PhoneShell>
      <BottomNav />
    </>
  );
}
