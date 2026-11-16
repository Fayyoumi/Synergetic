import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PhoneShell } from "@/components/PhoneShell";
import { SoloTrivia } from "@/components/solo/SoloTrivia";

export async function generateMetadata({ params }: PageProps<"/[locale]/play/sudden">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "play" });
  return { title: t("games.sudden.name") };
}

export default async function SuddenDeathPage({ params }: PageProps<"/[locale]/play/sudden">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PhoneShell lights={false}>
      <SoloTrivia mode="sudden" />
    </PhoneShell>
  );
}
