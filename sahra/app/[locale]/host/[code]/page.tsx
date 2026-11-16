import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HostLobby } from "@/components/room/HostLobby";

export async function generateMetadata({ params }: PageProps<"/[locale]/host/[code]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "host" });
  return { title: t("title"), robots: { index: false } };
}

/** TV / laptop host screen (16:9, at least 1280×720). */
export default async function HostPage({ params }: PageProps<"/[locale]/host/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  return (
    <main className="flex min-h-screen flex-col">
      <HostLobby code={code} />
    </main>
  );
}
