import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { NightPage } from "@/components/room/NightSummary";

export async function generateMetadata({ params }: PageProps<"/[locale]/night/[code]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "night" });
  return { title: t("title"), robots: { index: false } };
}

export default async function NightRoute({ params }: PageProps<"/[locale]/night/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("night");
  return (
    <PhoneShell lights={false}>
      <BackHeader title={t("title")} href="/titles" />
      <NightPage code={code} />
    </PhoneShell>
  );
}
