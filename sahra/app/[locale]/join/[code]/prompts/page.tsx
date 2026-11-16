import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackHeader } from "@/components/BackHeader";
import { PhoneShell } from "@/components/PhoneShell";
import { PromptFlow } from "@/components/who/PromptFlow";

export async function generateMetadata({ params }: PageProps<"/[locale]/join/[code]/prompts">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "prompts" });
  return { title: t("title"), robots: { index: false } };
}

/** Secret prompts for a room, answerable any time before the voting starts. */
export default async function PromptsPage({ params }: PageProps<"/[locale]/join/[code]/prompts">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("prompts");
  return (
    <PhoneShell lights={false}>
      <BackHeader title={t("title")} href={`/join/${code}`} />
      <PromptFlow code={code} />
    </PhoneShell>
  );
}
