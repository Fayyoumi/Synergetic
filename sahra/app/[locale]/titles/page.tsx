import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { TitlesList } from "@/components/who/TitlesList";

export async function generateMetadata({ params }: PageProps<"/[locale]/titles">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "titles" });
  return { title: t("title") };
}

export default async function TitlesPage({ params }: PageProps<"/[locale]/titles">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("titles");
  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("title")} href="/" />
        <TitlesList />
      </PhoneShell>
      <BottomNav />
    </>
  );
}
