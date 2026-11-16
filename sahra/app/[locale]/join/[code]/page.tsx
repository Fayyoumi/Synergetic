import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { JoinRoom } from "@/components/room/JoinRoom";
import { LanguageToggle } from "@/components/LanguageToggle";

export async function generateMetadata({ params }: PageProps<"/[locale]/join/[code]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "join" });
  return { title: t("title"), robots: { index: false } };
}

/** Phone controller for a room: join, then lobby (and later the game controls). */
export default async function JoinCodePage({ params }: PageProps<"/[locale]/join/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");
  return (
    <PhoneShell lights={false}>
      <BackHeader title={t("title")} href="/" trailing={<LanguageToggle />} />
      <JoinRoom code={code} />
    </PhoneShell>
  );
}
