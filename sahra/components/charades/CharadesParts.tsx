"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Team } from "@/lib/game/teamTrivia";
import { formatNumber } from "@/lib/i18n/digits";
import type { CharadesPublicView } from "@/lib/rooms/game";

/** Two team score cards; the acting team is highlighted (sunflower + thick border, plus aria-current). */
export function CharadesScores({ game, large }: { game: CharadesPublicView; large?: boolean }) {
  const t = useTranslations("teams");
  const locale = useLocale();
  const acting = game.phase === "turn_ready" || game.phase === "turn_active" ? game.actingTeam : null;
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="charades-scores">
      {([1, 2] as Team[]).map((team) => {
        const on = acting === team;
        return (
          <div
            key={team}
            aria-current={on ? "true" : undefined}
            className={`flex flex-col rounded-[20px] px-4 ${large ? "py-4" : "py-3"} ${on ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}
          >
            <span className={`font-bold ${large ? "text-3xl" : "text-lg"}`}>{t(String(team))}</span>
            <span className={`display-text ${large ? "text-6xl" : "text-3xl"}`} data-testid={`charades-team-${team}`}>
              {formatNumber(game.teamScores[team], locale)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** This turn's events. Skipped words stay hidden ("?") until stolen or the turn ends. */
export function TurnLog({ game, large }: { game: CharadesPublicView; large?: boolean }) {
  const t = useTranslations("charades");
  const locale = useLocale();
  if (!game.log.length) return <p className={`text-muted ${large ? "text-2xl" : ""}`}>{t("noWords")}</p>;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="turn-log">
      {game.log.map((e, i) => {
        const pts = formatNumber(e.points, locale);
        const text =
          e.kind === "got"
            ? t("logGot", { word: e.word ?? "", points: pts })
            : e.kind === "steal"
              ? t("logSteal", { word: e.word ?? "", points: pts })
              : e.word
                ? t("logSkipWord", { word: e.word })
                : t("logSkip");
        return (
          <li
            key={i}
            className={`rounded-full ink-border px-3 py-1 font-bold ${large ? "text-2xl" : ""} ${
              e.kind === "got" ? "bg-chair" : e.kind === "steal" ? "bg-tomato text-cream" : "bg-paper"
            }`}
          >
            {text}
          </li>
        );
      })}
    </ul>
  );
}

export function turnPoints(game: CharadesPublicView): number {
  return game.log.filter((e) => e.kind === "got").reduce((a, e) => a + e.points, 0);
}
