import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { BottomNav } from "@/components/BottomNav";
import { PhoneShell } from "@/components/PhoneShell";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title") };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  return (
    <>
      <PhoneShell lights={false}>
        <BackHeader title={t("title")} href="/" />
        <ProfileScreen />
      </PhoneShell>
      <BottomNav />
    </>
  );
}
