"use client";

import { useLocale, useTranslations } from "next-intl";
import { Countdown } from "@/components/Countdown";
import { Kassa } from "@/components/Kassa";
import { ConnBadge } from "@/components/room/Presence";
import { Button } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { PresenceTracker } from "@/lib/realtime/presence";
import type { Seat } from "@/lib/rooms/api";
import type { CharadesPublicView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";
import { CharadesScores, TurnLog, turnPoints } from "./CharadesParts";

type Props = {
  game: CharadesPublicView;
  seats: Seat[];
  tracker: PresenceTracker;
  offset: number;
  busy: boolean;
  onCommand: (action: "begin" | "got_it" | "skip" | "steal" | "advance" | "lobby") => void;
  onTimeUp: () => void;
  onEnd: () => void;
};

/** Host screen for charades. Never shows the word being acted. */
export function HostCharades({ game, seats, tracker, offset, busy, onCommand, onTimeUp, onEnd }: Props) {
  const t = useTranslations("charades");
  const tt = useTranslations("teams");
  const th = useTranslations("host");
  const tr = useTranslations("trivia");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const actor = seats.find((s) => s.id === game.actorSeatId);
  const seconds = useQuestionCountdown(game.startedAt, offset, game.phase === "turn_active", onTimeUp, game.turnSeconds);

  return (
    <div className="flex flex-1 flex-col gap-6 px-10 pb-8" data-testid="host-charades" data-phase={game.phase}>
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-2xl font-bold">{t("roundOf", { round: fmt(game.round), total: fmt(game.roundsPerTeam) })}</p>
          {game.phase !== "final" && (
            <h2 className="display-text text-5xl">{t("actingNow", { team: tt(String(game.actingTeam)) })}</h2>
          )}
        </div>
        <div className="w-[560px] max-w-[50%]">
          <CharadesScores game={game} large />
        </div>
      </div>

      {game.phase === "turn_ready" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <Kassa mood="cheeky" size={170} />
          <p className="display-text text-6xl">{t("actor", { name: actor?.name ?? "?" })}</p>
          {actor && <ConnBadge status={tracker.statuses[actor.id] ?? "offline"} large />}
          <p className="max-w-3xl text-2xl">{t("rulesBody")}</p>
          <p className="max-w-3xl text-xl text-muted">{t("rulesPoints")}</p>
          <Button tone="tomato" size="xl" onClick={() => onCommand("begin")} disabled={busy} data-testid="host-begin">
            {t("startSixty")}
          </Button>
        </div>
      )}

      {game.phase === "turn_active" && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex items-center gap-8">
            <Countdown seconds={seconds} total={game.turnSeconds} size={150} />
            <div className="flex flex-col gap-2">
              <p className="display-text text-5xl">{t("acting", { name: actor?.name ?? "?" })}</p>
              {actor && <ConnBadge status={tracker.statuses[actor.id] ?? "offline"} large />}
              <p className="text-2xl font-bold">{t("turnPoints", { team: tt(String(game.actingTeam)), points: fmt(turnPoints(game)) })}</p>
            </div>
          </div>
          <div className="rounded-[24px] ink-border-thick bg-paper p-6 text-center">
            <p className="display-text text-5xl">{t("guess")}</p>
            <p className="text-xl text-muted">{t("secretOnPhone")}</p>
          </div>
          <TurnLog game={game} large />
          <div className="mt-auto grid grid-cols-3 gap-4">
            <Button tone="chair" size="xl" onClick={() => onCommand("got_it")} disabled={busy} data-testid="host-got-it">
              {t("gotIt")}
            </Button>
            <Button tone="paper" size="xl" onClick={() => onCommand("skip")} disabled={busy || game.skipsLeft === 0} data-testid="host-skip">
              {t("skip", { count: fmt(game.skipsLeft) })}
            </Button>
            <Button tone="tomato" size="xl" onClick={() => onCommand("steal")} disabled={busy || !game.canSteal} data-testid="host-steal">
              {t("steal")}
            </Button>
          </div>
          <p className="text-lg text-muted">{t("stealHint")}</p>
        </div>
      )}

      {game.phase === "turn_summary" && (
        <div className="flex flex-1 flex-col gap-6">
          <h3 className="display-text text-5xl">{t("turnOver")}</h3>
          <p className="text-3xl font-bold">{t("turnPoints", { team: tt(String(game.actingTeam)), points: fmt(turnPoints(game)) })}</p>
          <TurnLog game={game} large />
          <div className="mt-auto flex items-center justify-end gap-4">
            {game.canSteal && (
              <Button tone="tomato" size="xl" onClick={() => onCommand("steal")} disabled={busy} data-testid="host-steal">
                {t("steal")}
              </Button>
            )}
            <Button tone="sunflower" size="xl" onClick={() => onCommand("advance")} disabled={busy} data-testid="host-advance">
              {game.turn + 1 >= game.totalTurns ? t("toFinal") : t("nextTurn")}
            </Button>
          </div>
        </div>
      )}

      {game.phase === "final" && (
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex items-center gap-6">
            <Kassa mood="laughing" size={150} />
            <div>
              <p className="text-3xl font-bold">{t("finalTitle")}</p>
              <h3 className="display-text text-7xl" data-testid="winner">
                {game.final?.winner ? tt("wins", { team: tt(String(game.final.winner)) }) : tt("tie")}
              </h3>
            </div>
          </div>
          <div className="mt-auto flex justify-end gap-4">
            <Button tone="paper" size="xl" onClick={onEnd} disabled={busy}>
              {th("end")}
            </Button>
            <Button tone="sunflower" size="xl" onClick={() => onCommand("lobby")} disabled={busy} data-testid="play-again">
              {tr("playAgain")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
