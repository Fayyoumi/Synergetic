"use client";

import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Countdown } from "@/components/Countdown";
import { Kassa } from "@/components/Kassa";
import { ConnBadge } from "@/components/room/Presence";
import { Button, SpeechBubble } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { PresenceTracker } from "@/lib/realtime/presence";
import type { Seat } from "@/lib/rooms/api";
import type { WhoPublicView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";
import { VoteBars } from "./VoteBars";

type Props = {
  game: WhoPublicView;
  seats: Seat[];
  tracker: PresenceTracker;
  offset: number;
  busy: boolean;
  onCommand: (action: "advance" | "lobby") => void;
  onTimeUp: () => void;
  onEnd: () => void;
};

/** Host screen for "Who among us?". */
export function HostWho({ game, seats, tracker, offset, busy, onCommand, onTimeUp, onEnd }: Props) {
  const t = useTranslations("who");
  const th = useTranslations("host");
  const tr = useTranslations("trivia");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? "?";
  const seconds = useQuestionCountdown(game.startedAt, offset, game.phase === "vote_open", onTimeUp, game.voteSeconds);
  const inGame = seats.filter((s) => game.players.includes(s.id));

  if (game.phase === "prompts_collect") {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 pb-8" data-testid="host-who" data-phase={game.phase}>
        <div className="flex items-end gap-5">
          <Kassa mood="cheeky" size={140} />
          <div>
            <h2 className="display-text text-6xl">{t("collecting")}</h2>
            <p className="text-2xl">{t("collectingBody")}</p>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {inGame.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-[18px] ink-border bg-paper px-4 py-3 text-2xl">
              <span className="font-bold">{s.name}</span>
              <span className="display-text" data-testid={`prompt-progress-${s.name}`}>
                {t("progress", { done: fmt(game.promptProgress[s.id] ?? 0), total: fmt(game.promptTotal) })}
              </span>
              <ConnBadge status={tracker.statuses[s.id] ?? "offline"} />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex justify-end">
          <Button tone="tomato" size="xl" onClick={() => onCommand("advance")} disabled={busy} data-testid="host-open-voting">
            {t("openVoting")}
          </Button>
        </div>
      </div>
    );
  }

  if (game.phase === "final") {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 pb-8" data-testid="host-who" data-phase="final">
        <div className="flex items-center gap-6">
          <Kassa mood="laughing" size={140} />
          <h2 className="display-text text-6xl">{t("finalTitle")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <section className="flex flex-col gap-3">
            <h3 className="display-text text-3xl">{tr("topPlayers")}</h3>
            <ol className="flex flex-col gap-2">
              {(game.final?.standings ?? []).map((s, i) => (
                <li key={s.seatId} className="flex items-center gap-3 rounded-[18px] ink-border bg-paper px-4 py-2 text-2xl">
                  <span className="display-text w-10 text-center">{fmt(i + 1)}</span>
                  <span className="flex-1 font-bold">{nameOf(s.seatId)}</span>
                  <span className="display-text">{fmt(s.points)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="flex flex-col gap-3" data-testid="titles-of-night">
            <h3 className="display-text text-3xl">{t("titlesTitle")}</h3>
            {game.titles.length ? (
              <ul className="flex flex-col gap-2">
                {game.titles.map((x, i) => (
                  <li key={i} className="rounded-[18px] ink-border-thick bg-sunflower px-4 py-3 text-2xl">
                    <span className="display-text">{nameOf(x.seatId)}</span>: {x.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-2xl text-muted">{t("noTitles")}</p>
            )}
          </section>
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
    );
  }

  const round = game.round;
  const res = game.result;
  const last = game.index >= game.total - 1;
  return (
    <div className="flex flex-1 flex-col gap-6 px-10 pb-8" data-testid="host-who" data-phase={game.phase}>
      <div className="flex items-center gap-5">
        {game.phase === "vote_open" && <Countdown seconds={seconds} total={game.voteSeconds} size={110} />}
        <Chip size="lg">{t("roundOf", { n: fmt(game.index + 1), total: fmt(game.total) })}</Chip>
      </div>

      {res?.vetoed || !round ? (
        <div className="flex flex-col gap-3 rounded-[24px] ink-border-thick bg-paper p-8" data-testid="vetoed">
          <p className="display-text text-5xl">{t("vetoed")}</p>
        </div>
      ) : round.kind === "trait" ? (
        <div>
          <p className="display-text text-5xl">{t("lead")}</p>
          <h2 className="display-text text-7xl leading-tight" data-testid="who-line">
            {t("traitLine", { trait: round.trait ?? "" })}
          </h2>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-3xl font-bold">{round.prompt}</p>
          <p className="text-2xl">{t("answerLead")}</p>
          <blockquote className="display-text rounded-[24px] ink-border-thick bg-paper p-6 text-6xl leading-tight" data-testid="who-answer">
            «{round.answer}»
          </blockquote>
          <p className="display-text text-4xl">{t("whoWrote")}</p>
        </div>
      )}

      {game.phase === "vote_open" ? (
        <div className="flex flex-col gap-2">
          <span className="text-2xl font-bold" data-testid="voted-count">
            {t("votedCount", { count: fmt(game.voted.length), total: fmt(game.players.length) })}
          </span>
          <ul className="flex flex-wrap gap-3">
            {inGame.map((s) => {
              const done = game.voted.includes(s.id);
              return (
                <li key={s.id} data-voted={done} className={`flex items-center gap-2 rounded-full ink-border px-4 py-2 text-xl font-bold ${done ? "bg-sunflower" : "bg-paper"}`}>
                  {s.name}
                  {done && <span className="sr-only">{t("voted")}</span>}
                  <ConnBadge status={tracker.statuses[s.id] ?? "offline"} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        res &&
        !res.vetoed && (
          <div className="flex flex-col gap-5" data-testid="who-reveal">
            <VoteBars tally={res.tally} top={res.top} seats={seats} large />
            <div className="flex items-end gap-4">
              <Kassa mood={res.top.length ? "laughing" : "shocked"} size={110} />
              <SpeechBubble className="text-3xl">
                {res.top.length === 0
                  ? t("noVotes")
                  : res.top.length === 1
                    ? t("kassaWinner", { name: nameOf(res.top[0]) })
                    : t("kassaTie", { names: res.top.map(nameOf).join(tr("listSeparator")) })}
              </SpeechBubble>
            </div>
            {res.title && (
              <p className="display-text self-start rounded-[20px] ink-border-thick bg-sunflower px-6 py-3 text-4xl" data-testid="round-title">
                {t("titleWon", { title: res.title })} · {res.top.map(nameOf).join(tr("listSeparator"))}
              </p>
            )}
            {res.authorSeatId && <p className="display-text text-4xl" data-testid="author">{t("authorWas", { name: nameOf(res.authorSeatId) })}</p>}
          </div>
        )
      )}

      {game.phase === "reveal" && (
        <div className="mt-auto flex justify-end">
          <Button tone="sunflower" size="xl" onClick={() => onCommand("advance")} disabled={busy} data-testid="host-advance">
            {last ? t("toFinal") : t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
