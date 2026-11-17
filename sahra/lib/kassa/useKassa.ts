"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { pickKassaLine, type KassaLine, type KassaMood, type KassaVars } from "./lines";

let cache: Promise<KassaLine[]> | null = null;

/** Approved Kassa lines (RLS only returns approved ones). Loaded once per page. */
function loadLines(): Promise<KassaLine[]> {
  cache ??= (async () => {
    const db = getBrowserSupabase();
    if (!db) return [];
    const { data } = await db.from("kassa_lines").select("id, event, mood, text").eq("lang", "ar");
    return (data ?? []) as KassaLine[];
  })().catch(() => []);
  return cache;
}

export type KassaEvent =
  | "lobby_welcome"
  | "game_start"
  | "correct"
  | "wrong"
  | "timeout"
  | "streak_3"
  | "perfect_round"
  | "final_winner"
  | "vote_reveal_winner"
  | "vote_reveal_tie"
  | "charades_got_it"
  | "charades_time_up"
  | "charades_steal";

/**
 * Kassa's voice. Arabic UI: an approved line from the content (in the room's
 * mood), else the built-in line from messages. English UI: the built-in line.
 */
export function useKassa() {
  const locale = useLocale();
  const t = useTranslations("kassaSays");
  const [lines, setLines] = useState<KassaLine[]>([]);
  useEffect(() => {
    if (locale !== "ar") return;
    let alive = true;
    void loadLines().then((l) => alive && setLines(l));
    return () => {
      alive = false;
    };
  }, [locale]);

  return useCallback(
    (event: KassaEvent, mood: KassaMood, seed: string | number, vars: KassaVars = {}): string => {
      const picked = locale === "ar" ? pickKassaLine(lines, event, mood, seed, vars) : null;
      if (picked) return picked;
      // Built-in lines: one with a name and one without.
      return vars.name ? t(`${event}.named`, { name: vars.name, points: vars.points ?? "" }) : t(`${event}.plain`, { points: vars.points ?? "" });
    },
    [lines, locale, t],
  );
}
