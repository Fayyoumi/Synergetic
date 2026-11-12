import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Kassa, kassaExpressions } from "@/components/Kassa";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PhoneShell } from "@/components/PhoneShell";
import { WeddingLights } from "@/components/WeddingLights";
import { Button, Card } from "@/components/ui";
import { SessionStatus } from "@/components/SessionStatus";
import { formatNumber, formatPoints, roomCode } from "@/lib/i18n/digits";

export const metadata: Metadata = { robots: { index: false } };

const swatches = [
  ["tomato", "#E8412C", "bg-tomato"],
  ["sunflower", "#FFC93C", "bg-sunflower"],
  ["chair", "#12A6A0", "bg-chair"],
  ["ink", "#2B1B17", "bg-ink"],
  ["cream", "#FFF4DE", "bg-cream"],
  ["tea", "#D9541E", "bg-tea"],
  ["muted", "#6B5147", "bg-muted"],
] as const;

/** Internal style guide for reviewing tokens and components in both directions. */
export default async function DesignPage({ params }: PageProps<"/[locale]/design">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("design");

  return (
    <PhoneShell>
      <header className="flex items-center justify-between">
        <h1 className="display-text text-4xl">{t("title")}</h1>
        <LanguageToggle />
      </header>

      <Card>
        <h2 className="display-text text-2xl mb-2">{t("session")}</h2>
        <SessionStatus />
      </Card>

      <section>
        <h2 className="display-text text-2xl mb-2">{t("colours")}</h2>
        <ul className="grid grid-cols-4 gap-2">
          {swatches.map(([name, hex, cls]) => (
            <li key={name} className="text-xs">
              <div className={`${cls} h-12 rounded-[12px] ink-border`} />
              <div className="font-bold mt-1" dir="ltr">--{name}</div>
              <div className="text-muted" dir="ltr">{hex}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="display-text text-2xl mb-2">{t("type")}</h2>
        <p className="display-text text-4xl">{t("displaySample")}</p>
        <p>{t("bodySample")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="display-text text-2xl">{t("buttons")}</h2>
        <Button tone="sunflower" size="xl" block>{t("primary")}</Button>
        <div className="grid grid-cols-2 gap-3">
          <Button tone="chair">{t("solo")}</Button>
          <Button tone="tomato">{t("group")}</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button tone="paper" size="md" selected={false}>{t("solo")}</Button>
          <Button size="md" selected>{t("selected")}</Button>
        </div>
      </section>

      <section>
        <h2 className="display-text text-2xl mb-2">{t("kassa")}</h2>
        <ul className="grid grid-cols-3 gap-3">
          {kassaExpressions.map((mood) => (
            <li key={mood} className="flex flex-col items-center gap-1">
              <Kassa mood={mood} size={110} label={t(`expressions.${mood}`)} />
              <span className="text-sm font-semibold">{t(`expressions.${mood}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="display-text text-2xl mb-2">{t("digits")}</h2>
        <p className="display-text text-3xl">
          {formatPoints(300, locale)} · {formatNumber(1500, locale)}
        </p>
        <p className="text-muted">{t("roomCodeLabel")}</p>
        <p className="display-text text-5xl tracking-widest" dir="ltr">{roomCode("4827")}</p>
      </section>

      <section aria-hidden="true">
        <WeddingLights variant="wide" />
      </section>
    </PhoneShell>
  );
}
