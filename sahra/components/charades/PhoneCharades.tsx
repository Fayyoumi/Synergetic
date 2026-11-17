"use client";

import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Countdown } from "@/components/Countdown";
import { Kassa } from "@/components/Kassa";
import { Button } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { Seat } from "@/lib/rooms/api";
import type { CharadesPublicView, SecretView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";
import { CharadesScores, TurnLog, turnPoints } from "./CharadesParts";
import { ShareButton } from "@/components/share/ShareButton";

type Props = {
  game: CharadesPublicView;
  code: string;
  mySeatId: string;
  seats: Seat[];
  secret: SecretView | null;
  offset: number;
  busy: boolean;
  onCommand: (action: "begin" | "got_it" | "skip" | "steal") => void;
  onTimeUp: () => void;
};

const difficultyTone = { 1: "paper", 2: "chair", 3: "tomato" } as const;

/** Phone controller for charades. Only the actor's phone shows the word. */
export function PhoneCharades({ game, code, mySeatId, seats, secret, offset, busy, onCommand, onTimeUp }: Props) {
  const t = useTranslations("charades");
  const tp = useTranslations("play");
  const tt = useTranslations("teams");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const isActor = game.actorSeatId === mySeatId;
  const myTeam = game.teams[mySeatId];
  const actor = seats.find((s) => s.id === game.actorSeatId);
  const seconds = useQuestionCountdown(
    game.startedAt,
    offset,
    game.phase === "turn_active",
    () => setTimeout(onTimeUp, 300 + Math.random() * 1200),
    game.turnSeconds,
  );
  const word = isActor && secret?.kind === "charades_word" && secret.turn === game.turn ? secret : null;
  const acting = game.phase === "turn_active" && isActor;

  return (
    <div
      className={`-mx-5 flex flex-1 flex-col gap-4 px-5 pb-4 ${acting ? "bg-sunflower" : ""}`}
      data-testid="phone-charades"
      data-phase={game.phase}
      data-actor={isActor}
    >
      <div className="flex items-center justify-between">
        <Chip>{t("roundOf", { round: fmt(game.round), total: fmt(game.roundsPerTeam) })}</Chip>
        {myTeam && <Chip tone={myTeam === 1 ? "tomato" : "chair"}>{tt(String(myTeam))}</Chip>}
      </div>
      <CharadesScores game={game} />

      {game.phase === "turn_ready" &&
        (isActor ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-[24px] ink-border-thick bg-paper p-5">
              <h2 className="display-text text-3xl">{t("yourTurn")}</h2>
              <p className="leading-relaxed">{t("yourTurnBody")}</p>
              <p className="text-sm text-muted">{t("rulesPoints")}</p>
            </div>
            <div className="mt-auto">
              <Button tone="tomato" size="xl" block onClick={() => onCommand("begin")} disabled={busy} data-testid="phone-begin">
                {t("startSixty")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Kassa mood="cheeky" size={110} />
            <p className="display-text text-2xl">{t("rulesTitle", { team: tt(String(game.actingTeam)) })}</p>
            <p className="font-bold">{t("waitForActor", { name: actor?.name ?? "?" })}</p>
          </div>
        ))}

      {game.phase === "turn_active" && (
        <>
          <div className="flex items-center gap-3">
            <Countdown seconds={seconds} total={game.turnSeconds} size={72} />
            <p className="font-bold">{t("turnPoints", { team: tt(String(game.actingTeam)), points: fmt(turnPoints(game)) })}</p>
          </div>
          {isActor ? (
            <>
              <div
                className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[28px] ink-border-thick bg-paper p-6 text-center"
                data-testid="secret-word-card"
              >
                {word ? (
                  <>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Chip tone="sunflower">{word.category}</Chip>
                      <Chip tone={difficultyTone[word.difficulty]}>
                        {t(`difficulty${word.difficulty}`)} · {fmt(word.points)}
                      </Chip>
                    </div>
                    <p className="display-text text-5xl leading-tight" data-testid="secret-word" lang="ar" dir="rtl">
                      {word.word}
                    </p>
                    <p className="text-sm text-muted">{t("noMiming")}</p>
                  </>
                ) : (
                  <p className="text-muted">{t("keepSecret")}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button tone="paper" size="lg" onClick={() => onCommand("skip")} disabled={busy || game.skipsLeft === 0} data-testid="phone-skip">
                  {t("skip", { count: fmt(game.skipsLeft) })}
                </Button>
                <Button tone="chair" size="lg" onClick={() => onCommand("got_it")} disabled={busy} data-testid="phone-got-it">
                  {t("gotIt")}
                </Button>
              </div>
              {game.canSteal && (
                <Button tone="tomato" size="md" onClick={() => onCommand("steal")} disabled={busy} data-testid="phone-steal">
                  {t("steal")}
                </Button>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              <div className="rounded-[20px] ink-border bg-paper p-4 text-center">
                <p className="display-text text-3xl">{t("acting", { name: actor?.name ?? "?" })}</p>
                <p className="font-semibold">{myTeam === game.actingTeam ? t("guessTeam") : t("otherTeam")}</p>
              </div>
              <TurnLog game={game} />
            </div>
          )}
        </>
      )}

      {game.phase === "turn_summary" && (
        <div className="flex flex-col gap-3">
          <h2 className="display-text text-3xl">{t("turnOver")}</h2>
          <TurnLog game={game} />
        </div>
      )}

      {game.phase === "final" && (
        <div className="flex flex-col gap-3" data-testid="phone-charades-final">
          <div className="flex items-end gap-3">
            <Kassa mood="laughing" size={100} />
            <h2 className="display-text text-3xl">
              {game.final?.winner ? tt("wins", { team: tt(String(game.final.winner)) }) : tt("tie")}
            </h2>
          </div>
          {myTeam && <p className="text-lg font-bold">{t("yourPoints", { points: fmt(game.teamScores[myTeam]) })}</p>}
          {myTeam && (
            <ShareButton
              what="charades_result"
              roomCode={code}
              card={{
                kind: "result",
                heading: tp("games.charades.name"),
                label: tt(String(myTeam)),
                value: fmt(game.teamScores[myTeam]),
                lines: [game.final?.winner ? tt("wins", { team: tt(String(game.final.winner)) }) : tt("tie")],
                badges: [],
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
