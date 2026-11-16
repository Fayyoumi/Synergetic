"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Countdown } from "@/components/Countdown";
import { Kassa } from "@/components/Kassa";
import type { Team } from "@/lib/game/teamTrivia";
import { formatNumber } from "@/lib/i18n/digits";
import type { TeamPublicView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";

const teamBg: Record<Team, string> = { 1: "bg-tomato text-cream", 2: "bg-chair text-ink" };

type Props = {
  game: TeamPublicView;
  mySeatId: string;
  offset: number;
  onAnswer: (index: number, choice: number) => Promise<boolean>;
  onTimeUp: () => void;
};

/** Phone controller for team trivia. */
export function PhoneTrivia(props: Props) {
  const { game, mySeatId } = props;
  const t = useTranslations("trivia");
  const tt = useTranslations("teams");
  const locale = useLocale();
  const me = game.players[mySeatId];

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="phone-trivia" data-phase={game.phase}>
      {me ? (
        <div className="flex items-center justify-between">
          <span className={`rounded-full ink-border px-3 py-1 font-bold ${teamBg[me.team]}`}>{t("yourTeam", { team: tt(String(me.team)) })}</span>
          <span className="display-text rounded-full bg-ink px-4 py-1 text-xl text-sunflower" data-testid="my-points">
            {formatNumber(me.points, locale)}
          </span>
        </div>
      ) : (
        <p className="rounded-[16px] ink-border bg-paper px-4 py-3 font-semibold">{t("spectating")}</p>
      )}
      {game.phase === "question" && me && <PhoneQuestion {...props} />}
      {game.phase === "reveal" && me && <PhoneReveal {...props} />}
      {game.phase === "scoreboard" && <PhoneScoreboard {...props} />}
      {game.phase === "final" && <PhoneFinal {...props} />}
    </div>
  );
}

function PhoneQuestion({ game, mySeatId, offset, onAnswer, onTimeUp }: Props) {
  const t = useTranslations("trivia");
  const tq = useTranslations("question");
  const locale = useLocale();
  const q = game.question!;
  const [picked, setPicked] = useState<{ index: number; choice: number } | null>(null);
  const answered = game.answered.includes(mySeatId) || picked?.index === game.index;
  // Phones also ask for the reveal when time is up, in case the host screen dropped.
  const seconds = useQuestionCountdown(q.startedAt, offset, true, () => setTimeout(onTimeUp, 300 + Math.random() * 1200));
  const letters = tq("letters").split(",");

  return (
    <>
      <div className="flex items-center gap-3">
        <Countdown seconds={seconds} />
        <span className="font-bold">{t("questionOf", { n: formatNumber(game.index + 1, locale), total: formatNumber(game.total, locale) })}</span>
      </div>
      <h2 className="display-text text-2xl leading-snug" lang={q.lang} dir={q.lang === "ar" ? "rtl" : "ltr"}>
        {q.question}
      </h2>
      {answered ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center" data-testid="waiting">
          <Kassa mood="neutral" size={110} />
          <p className="text-lg font-bold">
            {t("youAnswered", { letter: picked && picked.index === game.index ? letters[picked.choice] : "" })}
          </p>
        </div>
      ) : seconds === 0 ? (
        <p className="rounded-[16px] ink-border bg-paper px-4 py-3 font-bold">{t("tooLate")}</p>
      ) : (
        <ol className="flex flex-col gap-3" dir={q.lang === "ar" ? "rtl" : "ltr"} aria-label={t("pickAnswer")}>
          {q.options.map((label, i) => (
            <li key={i}>
              <button
                type="button"
                data-testid={`phone-option-${i}`}
                onClick={async () => {
                  setPicked({ index: game.index, choice: i });
                  const ok = await onAnswer(game.index, i);
                  if (!ok) setPicked(null);
                }}
                className="flex min-h-16 w-full items-center gap-3 rounded-[18px] ink-border bg-paper px-3 py-2 text-start text-lg font-bold active:bg-sunflower"
              >
                <span className="display-text flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-ink text-xl text-cream">
                  {letters[i]}
                </span>
                <span lang={q.lang} className="flex-1">
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function PhoneReveal({ game, mySeatId }: Props) {
  const t = useTranslations("trivia");
  const tq = useTranslations("question");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const r = game.reveal?.perSeat[mySeatId];
  const myTeam = game.players[mySeatId].team;
  if (!r || !game.reveal || !game.question) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="phone-reveal">
      <div className={`rounded-[20px] ink-border p-4 ${r.correct ? "bg-chair" : "bg-paper"}`}>
        <p className="font-bold">{t("yourResult")}</p>
        {r.correct ? (
          <>
            <p className="display-text text-4xl">{tq("gained", { points: fmt(r.points) })}</p>
            <p className="font-semibold">{tq("breakdown", { base: fmt(r.base), speed: fmt(r.speed), streak: fmt(r.streak) })}</p>
          </>
        ) : (
          <>
            <p className="display-text text-4xl text-tomato">{r.choice === null ? tq("timeout") : tq("wrong")}</p>
            <p>{tq("correctWas", { answer: game.question.options[game.reveal.correctChoice] })}</p>
          </>
        )}
      </div>
      <p className="font-semibold">{t("teamGot", { points: fmt(game.reveal.teamPoints[myTeam]) })}</p>
      <p className="text-muted">{t("lookAtScreen")}</p>
    </div>
  );
}

function rankOf(game: TeamPublicView, seatId: string) {
  const sorted = Object.entries(game.players).sort((a, b) => b[1].points - a[1].points);
  return { rank: sorted.findIndex(([id]) => id === seatId) + 1, total: sorted.length };
}

function PhoneScoreboard({ game, mySeatId }: Props) {
  const t = useTranslations("trivia");
  const tt = useTranslations("teams");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const { rank, total } = rankOf(game, mySeatId);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="display-text text-3xl">{t("scoreboard")}</h2>
      {([1, 2] as Team[]).map((team) => (
        <div key={team} className={`flex items-center justify-between rounded-[18px] ink-border px-4 py-3 ${teamBg[team]}`}>
          <span className="display-text text-2xl">{tt(String(team))}</span>
          <span className="display-text text-3xl">{fmt(game.teamScores[team])}</span>
        </div>
      ))}
      {rank > 0 && <p className="font-bold">{t("yourRank", { rank: fmt(rank), total: fmt(total) })}</p>}
      <p className="text-muted">{t("watchScreen")}</p>
    </div>
  );
}

function PhoneFinal({ game, mySeatId }: Props) {
  const t = useTranslations("trivia");
  const tt = useTranslations("teams");
  const tb = useTranslations("badges");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const mine = game.final?.standings.find((s) => s.seatId === mySeatId);
  const winner = game.final?.winner ?? null;
  return (
    <div className="flex flex-col gap-4" data-testid="phone-final">
      <div className="flex items-end gap-3">
        <Kassa mood="laughing" size={100} />
        <h2 className="display-text text-4xl">{winner === null ? tt("tie") : tt("wins", { team: tt(String(winner)) })}</h2>
      </div>
      {([1, 2] as Team[]).map((team) => (
        <div key={team} className={`flex items-center justify-between rounded-[18px] ink-border px-4 py-3 ${teamBg[team]}`}>
          <span className="display-text text-2xl">{tt(String(team))}</span>
          <span className="display-text text-3xl">{fmt(game.teamScores[team])}</span>
        </div>
      ))}
      {mine && (
        <div className="flex flex-col gap-2 rounded-[18px] ink-border bg-paper p-4">
          <p className="display-text text-3xl">{t("yourTotal", { points: fmt(mine.points) })}</p>
          <p className="font-semibold">{t("xp", { xp: fmt(mine.xp) })}</p>
          {mine.badges.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t("badges")}>
              {mine.badges.map((b) => (
                <li key={b}>
                  <Chip tone="sunflower">{tb(b)}</Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
