"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Kassa } from "@/components/Kassa";
import { Button, SpeechBubble } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { Seat } from "@/lib/rooms/api";
import type { SecretView, WhoPublicView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";
import { PromptFlow } from "./PromptFlow";
import { VoteBars } from "./VoteBars";
import { ShareButton } from "@/components/share/ShareButton";

type Props = {
  code: string;
  game: WhoPublicView;
  mySeatId: string;
  seats: Seat[];
  secret: SecretView | null;
  offset: number;
  onVote: (index: number, target: string) => Promise<boolean>;
  onVeto: () => void;
  onTimeUp: () => void;
};

/** Phone controller for "Who among us?". */
export function PhoneWho({ code, game, mySeatId, seats, secret, offset, onVote, onVeto, onTimeUp }: Props) {
  const t = useTranslations("who");
  const tr = useTranslations("trivia");
  const ts = useTranslations("share");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? "?";
  const [picked, setPicked] = useState<{ index: number; target: string } | null>(null);
  const seconds = useQuestionCountdown(
    game.startedAt,
    offset,
    game.phase === "vote_open",
    () => setTimeout(onTimeUp, 300 + Math.random() * 1200),
    game.voteSeconds,
  );

  if (game.phase === "prompts_collect") return <PromptFlow code={code} />;

  const mine = secret?.kind === "my_answer" && secret.round === game.index && game.round?.kind === "answer";
  const myPick = picked?.index === game.index ? picked.target : null;
  const voted = game.voted.includes(mySeatId) || !!myPick;
  const me = game.players.includes(mySeatId);

  if (game.phase === "final") {
    const mineTitles = game.titles.filter((x) => x.seatId === mySeatId);
    return (
      <div className="flex flex-col gap-4" data-testid="phone-who-final">
        <div className="flex items-end gap-3">
          <Kassa mood="laughing" size={100} />
          <h2 className="display-text text-3xl">{t("finalTitle")}</h2>
        </div>
        <p className="display-text text-3xl">{t("yourPoints", { points: fmt(game.scores[mySeatId] ?? 0) })}</p>
        {mineTitles.map((x, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-[18px] ink-border-thick bg-sunflower px-4 py-3">
            <p className="text-lg font-bold">{x.title}</p>
            <ShareButton
              what="title"
              roomCode={code}
              size="md"
              label={ts("titleButton")}
              testId={`share-title-${i}`}
              card={{ kind: "title", heading: ts("titleHeading"), title: x.title, name: nameOf(mySeatId) }}
            />
          </div>
        ))}
      </div>
    );
  }

  const round = game.round;
  const res = game.result;
  return (
    <div
      className={`-mx-5 flex flex-1 flex-col gap-4 px-5 py-4 ${game.phase === "vote_open" ? "bg-tomato text-cream" : ""}`}
      data-testid="phone-who"
      data-phase={game.phase}
    >
      <div className="flex items-center justify-between">
        <Chip>{t("roundOf", { n: fmt(game.index + 1), total: fmt(game.total) })}</Chip>
        {game.phase === "vote_open" && (
          <Chip tone="sunflower" size="lg">
            {t("seconds", { s: fmt(seconds) })}
          </Chip>
        )}
      </div>

      {res?.vetoed || !round ? (
        <p className="rounded-[18px] ink-border bg-paper px-4 py-3 text-lg font-bold text-ink" data-testid="phone-vetoed">
          {t("vetoed")}
        </p>
      ) : round.kind === "trait" ? (
        <div>
          <p className="display-text text-3xl">{t("lead")}</p>
          <h2 className="display-text text-4xl leading-tight">{t("traitLine", { trait: round.trait ?? "" })}</h2>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-bold">{round.prompt}</p>
          <blockquote className="display-text rounded-[20px] ink-border bg-cream p-4 text-2xl text-ink">«{round.answer}»</blockquote>
          <p className="display-text text-2xl">{t("whoWrote")}</p>
        </div>
      )}

      {mine && !res?.vetoed && (
        <div className="flex flex-col gap-2 rounded-[20px] ink-border-thick bg-sunflower p-4 text-ink" data-testid="my-answer">
          <p className="font-bold">{t("yourAnswer")}</p>
          <p className="text-sm">{t("vetoHint")}</p>
          <Button tone="ink" size="md" onClick={onVeto} data-testid="veto">
            {t("veto")}
          </Button>
        </div>
      )}

      {game.phase === "vote_open" && me && !res?.vetoed && (
        <>
          <ul className="grid grid-cols-2 gap-3" aria-label={t("whoWrote")}>
            {seats
              .filter((s) => game.players.includes(s.id) && s.id !== mySeatId)
              .map((s) => {
                const on = myPick === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={voted || seconds === 0}
                      aria-pressed={on}
                      onClick={async () => {
                        setPicked({ index: game.index, target: s.id });
                        if (!(await onVote(game.index, s.id))) setPicked(null);
                      }}
                      data-testid={`vote-${s.name}`}
                      className={`flex min-h-16 w-full items-center gap-3 rounded-[20px] px-3 text-start text-lg font-bold text-ink ${
                        on ? "bg-sunflower ink-border-thick" : "bg-cream ink-border"
                      } ${voted && !on ? "opacity-70" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        className="display-text flex h-11 w-11 shrink-0 items-center justify-center rounded-full ink-border text-xl"
                        style={{ background: s.color, color: s.color === "#2B1B17" ? "var(--cream)" : "var(--ink)" }}
                      >
                        {s.name.trim().charAt(0)}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <p className="text-sm">{t("selfNote")}</p>
          <div className="mt-auto flex items-end gap-3 text-ink">
            <SpeechBubble className="flex-1">{myPick ? t("kassaVoted", { name: nameOf(myPick) }) : t("kassaVote")}</SpeechBubble>
            <Kassa mood={myPick ? "laughing" : "cheeky"} size={80} className="shrink-0" />
          </div>
        </>
      )}

      {game.phase === "reveal" && res && !res.vetoed && (
        <div className="flex flex-col gap-3" data-testid="phone-who-reveal">
          <VoteBars tally={res.tally} top={res.top} seats={seats} />
          {res.title && <p className="rounded-[18px] ink-border-thick bg-sunflower px-4 py-2 font-bold">{t("titleWon", { title: res.title })} · {res.top.map(nameOf).join(tr("listSeparator"))}</p>}
          {res.authorSeatId && <p className="display-text text-2xl">{t("authorWas", { name: nameOf(res.authorSeatId) })}</p>}
          <p className="font-bold" data-testid="my-vote-result">
            {res.majorityVoters.includes(mySeatId) ? t("youGot") : t("youMissed")}
          </p>
        </div>
      )}
    </div>
  );
}
