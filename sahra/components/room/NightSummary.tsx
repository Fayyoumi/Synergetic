"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useLocale, useTranslations } from "next-intl";
import { Kassa } from "@/components/Kassa";
import { ShareButton } from "@/components/share/ShareButton";
import { ButtonLink } from "@/components/ui";
import { WeddingLights } from "@/components/WeddingLights";
import { formatNumber } from "@/lib/i18n/digits";
import type { NightView } from "@/lib/rooms/night";

async function fetchNight(code: string): Promise<NightView | null> {
  try {
    const r = await (await fetch(`/api/rooms/${code}/night`, { cache: "no-store" })).json();
    return r.ok ? r.night : null;
  } catch {
    return null;
  }
}

/** Host screen "end of night": totals, a card per title won, and a QR code to share them. */
export function HostNightSummary({ code }: { code: string }) {
  const t = useTranslations("night");
  const tl = useTranslations("lobby");
  const locale = useLocale();
  const [night, setNight] = useState<NightView | null>(null);
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    void fetchNight(code).then((n) => alive && setNight(n));
    void QRCode.toString(`${window.location.origin}/night/${code}`, { type: "svg", margin: 1, color: { dark: "#2B1B17", light: "#FFFFFF" } }).then(
      (svg) => alive && setQr(svg),
    );
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="flex min-h-screen flex-col" data-testid="night-summary">
      <WeddingLights variant="wide" />
      <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,4fr)] gap-8 px-10 pb-8">
        <section className="flex flex-col gap-6">
          <div className="flex items-end gap-5">
            <Kassa mood="laughing" size={150} />
            <div>
              <h1 className="display-text text-6xl">{tl("endedTitle")}</h1>
              {night && <p className="text-2xl">{t("gamesPlayed", { n: night.gamesPlayed, count: formatNumber(night.gamesPlayed, locale) })}</p>}
            </div>
          </div>
          {night && (
            <>
              <ol className="grid grid-cols-2 gap-3">
                {night.players.slice(0, 8).map((p, i) => (
                  <li key={p.seatId} className="flex items-center gap-3 rounded-[18px] ink-border bg-paper px-4 py-2 text-2xl">
                    <span className="display-text w-10 text-center">{formatNumber(i + 1, locale)}</span>
                    <span className="flex-1 font-bold">{p.name}</span>
                    <span className="display-text">{formatNumber(p.points, locale)}</span>
                  </li>
                ))}
              </ol>
              <h2 className="display-text text-4xl">{t("titles")}</h2>
              {night.titles.length ? (
                <ul className="grid grid-cols-2 gap-4" data-testid="night-titles">
                  {night.titles.map((x) => (
                    <li key={x.id} className="flex flex-col gap-1 rounded-[22px] ink-border-thick bg-sunflower px-5 py-4">
                      <span className="display-text text-3xl leading-tight">{x.title}</span>
                      <span className="text-2xl font-bold">{x.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-2xl text-muted">{t("noTitles")}</p>
              )}
            </>
          )}
        </section>
        <section className="flex flex-col items-center gap-4 self-start rounded-[28px] ink-border-thick bg-paper p-8 text-center">
          <h2 className="display-text text-3xl">{t("scanToShare")}</h2>
          <div
            className="aspect-square w-full max-w-[320px] [&_svg]:h-full [&_svg]:w-full"
            role="img"
            aria-label={t("scanToShare")}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <ButtonLink href="/" tone="sunflower" size="lg">
            {tl("backHome")}
          </ButtonLink>
        </section>
      </div>
    </div>
  );
}

/** Phone page for a night: titles with share buttons (opened from the host's QR code). */
export function NightPage({ code }: { code: string }) {
  const t = useTranslations("night");
  const ts = useTranslations("share");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [night, setNight] = useState<NightView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void import("@/lib/supabase/session").then(({ ensureGuestSession }) => ensureGuestSession()).then(() => fetchNight(code)).then((n) => alive && setNight(n));
    return () => {
      alive = false;
    };
  }, [code]);
  if (night === undefined) return <p className="text-muted">{tc("loading")}</p>;
  if (night === null) return <p role="alert">{t("notThere")}</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="night-page">
      <p className="text-muted">{t("gamesPlayed", { n: night.gamesPlayed, count: formatNumber(night.gamesPlayed, locale) })}</p>
      <h2 className="display-text text-3xl">{t("titles")}</h2>
      {night.titles.length === 0 && <p>{t("noTitles")}</p>}
      <ul className="flex flex-col gap-3">
        {night.titles.map((x) => (
          <li
            key={x.id}
            className={`flex flex-col gap-2 rounded-[20px] px-4 py-3 ${x.seatId === night.mySeatId ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}
          >
            <span className="display-text text-2xl">{x.title}</span>
            <span className="font-bold">{x.name}</span>
            <ShareButton
              what="title"
              roomCode={night.code}
              size="md"
              label={ts("titleButton")}
              testId={`share-night-title`}
              card={{ kind: "title", heading: ts("titleHeading"), title: x.title, name: x.name }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
