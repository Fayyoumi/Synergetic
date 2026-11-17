"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { formatNumber, toArabicDigits } from "@/lib/i18n/digits";

type Day = { day: string; rooms_created: number; avg_players: number | null; avg_night_minutes: number | null; replay_rate: number | null; share_rate: number | null };
type RoomRow = { code: string; day: string; status: string; players: number; games: number; minutes: number | null; shares: number; replayed: boolean };
type Metrics = {
  days: Day[];
  rooms: RoomRow[];
  totals: {
    rooms: number;
    avg_players: number | null;
    avg_night_minutes: number | null;
    replay_rate: number | null;
    share_rate: number | null;
    solo_cohort: number;
    solo_d1: number | null;
    solo_d7: number | null;
  };
};

/** /admin/pilot: the go/no-go numbers, per day and per room. */
export function PilotDashboard() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [m, setM] = useState<Metrics | null>(null);

  const num = (v: number | null | undefined) => (v == null ? t("na") : formatNumber(Number(v), locale));
  const dec = (v: number | null | undefined) => {
    if (v == null) return t("na");
    const s = Number(v).toFixed(1).replace(/\.0$/, "");
    return locale === "ar" ? toArabicDigits(s.replace(".", String.fromCharCode(0x066b))) : s;
  };
  const pct = (v: number | null | undefined) => (v == null ? t("na") : `${dec(v)}%`);
  const day = (d: string) => (locale === "ar" ? toArabicDigits(d) : d);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const r = await (await fetch(`/api/admin/pilot?${q}`, { cache: "no-store" })).json();
    if (r.ok) setM(r.metrics);
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Load once on mount; later loads use the Refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tiles: [string, string][] = m
    ? [
        [t("rooms"), num(m.totals.rooms)],
        [t("avgPlayers"), dec(m.totals.avg_players)],
        [t("avgNight"), dec(m.totals.avg_night_minutes)],
        [t("replayRate"), pct(m.totals.replay_rate)],
        [t("shareRate"), pct(m.totals.share_rate)],
        [t("soloD1"), pct(m.totals.solo_d1)],
        [t("soloD7"), pct(m.totals.solo_d7)],
      ]
    : [];

  return (
    <div className="flex flex-col gap-6" data-testid="pilot">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="display-text me-auto text-3xl">{t("pilotTitle")}</h2>
        <label className="flex flex-col text-sm font-bold">
          {t("from")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 rounded-[12px] ink-border bg-cream px-2" dir="ltr" />
        </label>
        <label className="flex flex-col text-sm font-bold">
          {t("to")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 rounded-[12px] ink-border bg-cream px-2" dir="ltr" />
        </label>
        <Button tone="sunflower" size="md" onClick={() => void load()}>
          {t("refresh")}
        </Button>
      </div>

      {m && (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tiles.map(([label, value]) => (
              <Card key={label} className="flex flex-col-reverse gap-1">
                <dt className="text-sm font-semibold">{label}</dt>
                <dd className="display-text text-4xl" data-testid={`tile-${label}`}>
                  {value}
                </dd>
              </Card>
            ))}
            <Card className="flex items-center">
              <p className="text-sm font-semibold">{t("soloCohort", { count: formatNumber(m.totals.solo_cohort, locale) })}</p>
            </Card>
          </dl>
          <p className="text-sm text-muted">{t("metricsNote")}</p>

          <section className="flex flex-col gap-2">
            <h3 className="display-text text-2xl">{t("perDay")}</h3>
            <div className="overflow-x-auto rounded-[16px] ink-border bg-paper">
              <table className="w-full text-start text-sm">
                <thead className="bg-cream">
                  <tr>
                    {[t("day"), t("rooms"), t("avgPlayers"), t("avgNight"), t("replayRate"), t("shareRate")].map((h) => (
                      <th key={h} className="px-3 py-2 text-start">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...m.days].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-ink/20">
                      <td className="px-3 py-2" dir="ltr">
                        {day(d.day)}
                      </td>
                      <td className="px-3 py-2">{num(d.rooms_created)}</td>
                      <td className="px-3 py-2">{dec(d.avg_players)}</td>
                      <td className="px-3 py-2">{dec(d.avg_night_minutes)}</td>
                      <td className="px-3 py-2">{pct(d.replay_rate)}</td>
                      <td className="px-3 py-2">{pct(d.share_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="display-text text-2xl">{t("perRoom")}</h3>
            <div className="overflow-x-auto rounded-[16px] ink-border bg-paper">
              <table className="w-full text-start text-sm" data-testid="pilot-rooms">
                <thead className="bg-cream">
                  <tr>
                    {[t("code"), t("day"), t("players"), t("games"), t("minutes"), t("shares"), t("replayed")].map((h) => (
                      <th key={h} className="px-3 py-2 text-start">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.rooms.map((r) => (
                    <tr key={`${r.code}-${r.day}`} className="border-t border-ink/20">
                      <td className="px-3 py-2 font-bold" dir="ltr">
                        {r.code}
                      </td>
                      <td className="px-3 py-2" dir="ltr">
                        {day(r.day)}
                      </td>
                      <td className="px-3 py-2">{num(r.players)}</td>
                      <td className="px-3 py-2">{num(r.games)}</td>
                      <td className="px-3 py-2">{dec(r.minutes)}</td>
                      <td className="px-3 py-2">{num(r.shares)}</td>
                      <td className="px-3 py-2">{r.replayed ? t("yes") : t("no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
