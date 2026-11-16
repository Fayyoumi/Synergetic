import { getTranslations, setRequestLocale } from "next-intl/server";
import { Kassa } from "@/components/Kassa";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PhoneShell } from "@/components/PhoneShell";
import { ButtonLink, Card, SpeechBubble } from "@/components/ui";
import { BottomNav } from "@/components/BottomNav";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const c = await getTranslations("common");

  return (
    <>
    <PhoneShell>
      <header className="flex items-center justify-between pt-1">
        <h1 className="display-text text-5xl text-tomato">{c("appName")}</h1>
        <LanguageToggle />
      </header>

      <section className="flex items-end gap-3">
        <Kassa mood="cheeky" size={96} label={c("kassa")} className="shrink-0" />
        <SpeechBubble>{t("greetingGuest")}</SpeechBubble>
      </section>

      {/* The next-gathering card appears here once rooms and groups exist (Milestone 3). */}

      <section aria-labelledby="groups-title" className="flex flex-col gap-3">
        <h2 id="groups-title" className="display-text text-2xl">
          {t("groupsTitle")}
        </h2>
        <Card>
          <p className="text-muted">{t("groupsEmpty")}</p>
        </Card>
      </section>

      <div className="mt-auto pt-2">
        <ButtonLink href="/play" tone="tomato" size="xl" block>
          {t("playNow")}
        </ButtonLink>
      </div>
    </PhoneShell>
    <BottomNav />
    </>
  );
}
