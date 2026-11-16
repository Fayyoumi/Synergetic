import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PhoneShell } from "@/components/PhoneShell";
import { SoloTrivia } from "@/components/solo/SoloTrivia";

export async function generateMetadata({ params }: PageProps<"/[locale]/play/trivia">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "play" });
  return { title: t("games.trivia.name") };
}

export default async function TriviaPage({ params }: PageProps<"/[locale]/play/trivia">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PhoneShell lights={false}>
      <SoloTrivia mode="classic" />
    </PhoneShell>
  );
}
