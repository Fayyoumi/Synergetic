"use client";

import { useLocale, useTranslations } from "next-intl";
import { Chip, difficultyTone } from "@/components/Chip";
import { Countdown } from "@/components/Countdown";
import { Kassa } from "@/components/Kassa";
import { ConnBadge } from "@/components/room/Presence";
import { Button } from "@/components/ui";
import { BASE_POINTS } from "@/lib/game/scoring";
import type { Team } from "@/lib/game/teamTrivia";
import { formatNumber } from "@/lib/i18n/digits";
import type { PresenceTracker } from "@/lib/realtime/presence";
import type { Seat } from "@/lib/rooms/api";
import type { TeamPublicView } from "@/lib/rooms/game";
import { useQuestionCountdown } from "@/lib/rooms/useRoomGame";

const teamBg: Record<Team, string> = { 1: "bg-tomato text-cream", 2: "bg-chair text-ink" };

type Props = {
  game: TeamPublicView;
  seats: Seat[];
  tracker: PresenceTracker;
  offset: number;
  busy: boolean;
  onAdvance: () => void;
  onTimeUp: () => void;
  onLobby: () => void;
  onEnd: () => void;
};

/** Host screen during team trivia: question, reveal, scoreboard, final. Large type for a TV. */
export function HostTrivia(props: Props) {
  const { game } = props;
  if (game.phase === "question" || game.phase === "reveal") return <HostQuestion {...props} />;
  if (game.phase === "scoreboard") return <HostScoreboard {...props} />;
  return <HostFinal {...props} />;
}

function TeamScores({ game, size = "md" }: { game: TeamPublicView; size?: "md" | "lg" }) {
  const t = useTranslations("teams");
  const locale = useLocale();
  return (
    <div className={`grid grid-cols-2 gap-4 ${size === "lg" ? "" : "max-w-xl"}`} data-testid="team-scores">
      {([1, 2] as Team[]).map((team) => (
        <div key={team} className={`flex items-center justify-between gap-4 rounded-[20px] ink-border-thick px-5 ${teamBg[team]} ${size === "lg" ? "py-6" : "py-2"}`}>
          <span className={`display-text ${size === "lg" ? "text-5xl" : "text-2xl"}`}>{t(String(team))}</span>
          <span className={`display-text ${size === "lg" ? "text-7xl" : "text-3xl"}`} data-testid={`team-${team}-score`}>
            {formatNumber(game.teamScores[team], locale)}
          </span>
        </div>
      ))}
    </div>
  );
}

function HostQuestion({ game, seats, tracker, offset, busy, onAdvance, onTimeUp }: Props) {
  const t = useTranslations("trivia");
  const td = useTranslations("difficulty");
  const tc = useTranslations("categories");
  const tq = useTranslations("question");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const q = game.question!;
  const reveal = game.phase === "reveal" ? game.reveal : null;
  const seconds = useQuestionCountdown(q.startedAt, offset, !reveal, onTimeUp);
  const letters = tq("letters").split(",");
  const inGame = seats.filter((s) => game.players[s.id]);
  const nameOf = (id: string) => seats.find((s) => s.id === id)?.name ?? "?";

  return (
    <div className="flex flex-1 flex-col gap-6 px-10 pb-8">
      <div className="flex items-center gap-5">
        <Countdown seconds={seconds} size={96} />
        <div className="flex flex-1 flex-col gap-2">
          <span className="display-text text-3xl">{t("questionOf", { n: fmt(game.index + 1), total: fmt(game.total) })}</span>
          <div className="flex gap-2">
            <Chip tone="sunflower" size="lg">{tc(q.category)}</Chip>
            <Chip tone={difficultyTone[q.difficulty]} size="lg">
              {td("chip", { label: td(q.difficulty), points: fmt(BASE_POINTS[q.difficulty]) })}
            </Chip>
          </div>
        </div>
        <TeamScores game={game} />
      </div>

      <h2 className="display-text text-6xl leading-tight" lang={q.lang} dir={q.lang === "ar" ? "rtl" : "ltr"} data-testid="host-question">
        {q.question}
      </h2>

      <ol className="grid grid-cols-2 gap-5" dir={q.lang === "ar" ? "rtl" : "ltr"}>
        {q.options.map((label, i) => {
          const correct = reveal?.correctChoice === i;
          const pickers = reveal ? Object.entries(reveal.perSeat).filter(([, r]) => r.choice === i).map(([id]) => nameOf(id)) : [];
          return (
            <li
              key={i}
              data-testid={`host-option-${i}`}
              data-state={reveal ? (correct ? "correct" : "other") : "open"}
              className={`flex min-h-24 flex-col justify-center gap-2 rounded-[24px] ink-border-thick px-5 py-3 ${
                reveal ? (correct ? "bg-chair" : "bg-paper opacity-60") : "bg-paper"
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="display-text flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-ink text-3xl text-cream">
                  {letters[i]}
                </span>
                <span className="flex-1 text-4xl font-bold">{label}</span>
                {correct && <Chip size="lg">{tq("correctLabel")}</Chip>}
              </div>
              {pickers.length > 0 && <p className="text-xl font-semibold">{pickers.join(t("listSeparator"))}</p>}
            </li>
          );
        })}
      </ol>

      {reveal ? (
        <div className="flex items-center gap-6">
          <div className="flex flex-1 items-center gap-4 rounded-[20px] ink-border bg-paper px-5 py-3" data-testid="who-got-it">
            <Kassa mood={Object.values(reveal.perSeat).some((r) => r.correct) ? "laughing" : "shocked"} size={70} />
            <span className="display-text text-2xl">{t("whoGotIt")}:</span>
            <span className="text-2xl font-bold">
              {Object.entries(reveal.perSeat)
                .filter(([, r]) => r.correct)
                .map(([id, r]) => `${nameOf(id)} +${fmt(r.points)}`)
                .join(t("listSeparator")) || t("nobody")}
            </span>
          </div>
          <div className="flex gap-3 text-2xl font-bold">
            {([1, 2] as Team[]).map((team) => (
              <span key={team} className={`rounded-full ink-border px-4 py-2 ${teamBg[team]}`}>
                +{fmt(reveal.teamPoints[team])}
              </span>
            ))}
          </div>
          <Button tone="sunflower" size="xl" onClick={onAdvance} disabled={busy} data-testid="host-advance">
            {t("toScoreboard")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-2xl font-bold" data-testid="answered-count">
            {t("answeredCount", { count: fmt(game.answered.length), total: fmt(inGame.length) })}
          </span>
          {/* Answered dots, with each player's connection status (fair play). */}
          <ul className="flex flex-wrap gap-3">
            {inGame.map((s) => {
              const done = game.answered.includes(s.id);
              return (
                <li
                  key={s.id}
                  data-testid={`answered-${s.name}`}
                  data-answered={done}
                  className={`flex items-center gap-2 rounded-full ink-border px-4 py-2 text-xl font-bold ${done ? "bg-sunflower" : "bg-paper"}`}
                >
                  <span aria-hidden="true" className={`inline-block h-4 w-4 rounded-full ink-border ${done ? "bg-ink" : "bg-paper"}`} />
                  {s.name}
                  <span className="sr-only">{done ? t("answered") : t("waitingFor")}</span>
                  <ConnBadge status={tracker.statuses[s.id] ?? "offline"} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Standings({ game, seats, limit }: { game: TeamPublicView; seats: Seat[]; limit: number }) {
  const t = useTranslations("trivia");
  const tt = useTranslations("teams");
  const locale = useLocale();
  const rows = Object.entries(game.players)
    .map(([id, p]) => ({ id, ...p, name: seats.find((s) => s.id === id)?.name ?? "?" }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="display-text text-3xl">{t("topPlayers")}</h3>
      <ol className="flex flex-col gap-2" data-testid="standings">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-4 rounded-[18px] ink-border bg-paper px-4 py-2 text-2xl">
            <span className="display-text w-10 text-center text-3xl">{formatNumber(i + 1, locale)}</span>
            <span className="flex-1 font-bold">{r.name}</span>
            <span className={`rounded-full ink-border px-3 text-lg ${teamBg[r.team]}`}>{tt(`short${r.team}`)}</span>
            <span className="display-text text-3xl">{formatNumber(r.points, locale)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HostScoreboard({ game, seats, busy, onAdvance }: Props) {
  const t = useTranslations("trivia");
  const last = game.index >= game.total - 1;
  return (
    <div className="flex flex-1 flex-col gap-8 px-10 pb-8">
      <h2 className="display-text text-6xl">{t("scoreboard")}</h2>
      <TeamScores game={game} size="lg" />
      <Standings game={game} seats={seats} limit={5} />
      <div className="mt-auto flex justify-end">
        <Button tone="sunflower" size="xl" onClick={onAdvance} disabled={busy} data-testid="host-advance">
          {last ? t("toFinal") : t("nextQuestion")}
        </Button>
      </div>
    </div>
  );
}

function HostFinal({ game, seats, busy, onLobby, onEnd }: Props) {
  const t = useTranslations("trivia");
  const tt = useTranslations("teams");
  const th = useTranslations("host");
  const tb = useTranslations("badges");
  const locale = useLocale();
  const final = game.final;
  const winner = final?.winner ?? null;
  return (
    <div className="flex flex-1 flex-col gap-6 px-10 pb-8">
      <div className="flex items-center gap-6">
        <Kassa mood="laughing" size={150} />
        <div>
          <p className="text-3xl font-bold">{t("finalTitle")}</p>
          <h2 className="display-text text-7xl" data-testid="winner">
            {winner === null ? tt("tie") : tt("wins", { team: tt(String(winner)) })}
          </h2>
        </div>
      </div>
      <TeamScores game={game} size="lg" />
      <ol className="grid grid-cols-2 gap-3" data-testid="final-standings">
        {(final?.standings ?? []).slice(0, 6).map((s, i) => (
          <li key={s.seatId} className="flex items-center gap-3 rounded-[18px] ink-border bg-paper px-4 py-3 text-2xl">
            <span className="display-text w-10 text-center text-3xl">{formatNumber(i + 1, locale)}</span>
            <span className="flex-1 font-bold">{seats.find((x) => x.id === s.seatId)?.name ?? "?"}</span>
            <span className="flex flex-wrap gap-1">
              {s.badges.map((b) => (
                <Chip key={b} tone="sunflower">
                  {tb(b)}
                </Chip>
              ))}
            </span>
            <span className="display-text text-3xl">{formatNumber(s.points, locale)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex justify-end gap-4">
        <Button tone="paper" size="xl" onClick={onEnd} disabled={busy}>
          {th("end")}
        </Button>
        <Button tone="sunflower" size="xl" onClick={onLobby} disabled={busy} data-testid="play-again">
          {t("playAgain")}
        </Button>
      </div>
    </div>
  );
}
