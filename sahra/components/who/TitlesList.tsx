"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Kassa } from "@/components/Kassa";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ensureGuestSession } from "@/lib/supabase/session";

type TitleRow = { id: string; title_text: string; created_at: string; display_name: string; code: string; mine: boolean };

/**
 * Titles of the nights you were at (RLS: only rooms you were in, or your groups).
 * Yours are highlighted.
 */
export function TitlesList() {
  const t = useTranslations("titles");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<TitleRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await ensureGuestSession();
      const db = getBrowserSupabase();
      if (!db || session.status !== "ok") return alive && setRows([]);
      const { data } = await db
        .from("titles")
        .select("id, title_text, created_at, room_players(display_name, profile_id), rooms(code)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!alive) return;
      setRows(
        (data ?? []).map((r) => {
          const rp = r.room_players as unknown as { display_name: string; profile_id: string | null } | null;
          const room = r.rooms as unknown as { code: string } | null;
          return {
            id: r.id as string,
            title_text: r.title_text as string,
            created_at: r.created_at as string,
            display_name: rp?.display_name ?? "?",
            code: room?.code ?? "",
            mine: rp?.profile_id === session.user.id,
          };
        }),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!rows) return <p className="text-muted">{tc("loading")}</p>;
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Kassa mood="neutral" size={110} />
        <p>{t("empty")}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3" data-testid="titles-list">
      {rows.map((r) => (
        <li key={r.id} className={`flex flex-col rounded-[18px] px-4 py-3 ${r.mine ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}>
          <span className="display-text text-2xl">{r.title_text}</span>
          <span className="font-semibold">{r.display_name}</span>
          <span className="text-sm text-muted" dir="auto">
            {t("room", { code: r.code })}
          </span>
        </li>
      ))}
    </ul>
  );
}
