"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BackHeader } from "@/components/BackHeader";
import { SoundToggle } from "@/components/SoundToggle";
import { Kassa } from "@/components/Kassa";
import { Button, SpeechBubble } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { SoloRequest, SoloView } from "@/lib/solo/api";
import { soloCall } from "@/lib/solo/client";
import { QuestionScreen } from "./QuestionScreen";
import { ResultsScreen } from "./ResultsScreen";
import { TriviaSetup, type SetupChoice } from "./TriviaSetup";

type Mode = "classic" | "daily" | "sudden";

const STORAGE_KEY = (mode: Mode) => `sahra:solo:${mode}`;
const TITLE_KEY = { classic: "trivia", daily: "daily", sudden: "sudden" } as const;

function readStoredGame(mode: Mode): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY(mode));
  } catch {
    return null;
  }
}
function storeGame(mode: Mode, id: string | null) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY(mode), id);
    else sessionStorage.removeItem(STORAGE_KEY(mode));
  } catch {
    // private mode: resume just won't work
  }
}

/** A whole solo game: setup → questions → results. The server holds the truth. */
export function SoloTrivia({ mode }: { mode: Mode }) {
  const t = useTranslations("play");
  const ts = useTranslations("setup");
  const tq = useTranslations("question");
  const te = useTranslations("errors");
  const tc = useTranslations("common");
  const locale = useLocale() as "ar" | "en";

  const [view, setView] = useState<SoloView | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastChoice, setLastChoice] = useState<SetupChoice | null>(null);
  // The setup screen renders straight away (server-rendered, fast first paint); a stored game swaps it out.
  const [resuming, setResuming] = useState(false);

  const apply = useCallback(
    (v: SoloView) => {
      setOffset(v.serverNow - Date.now());
      setView(v);
      storeGame(mode, v.phase === "finished" ? null : v.gameId);
      // A finished game without a pending reveal (e.g. today's daily, already played) goes straight to results.
      if (v.phase === "finished" && !v.reveal) setShowResults(true);
    },
    [mode],
  );

  const call = useCallback(
    async (req: SoloRequest) => {
      setBusy(true);
      setError(null);
      const r = await soloCall(req);
      setBusy(false);
      if (r.ok) apply(r.view);
      else setError(r.error);
      return r;
    },
    [apply],
  );

  // Resume a game in progress after a refresh (classic and sudden).
  useEffect(() => {
    if (mode === "daily") return;
    let alive = true;
    void (async () => {
      const id = readStoredGame(mode);
      if (id) {
        setResuming(true);
        const r = await soloCall({ action: "state", gameId: id });
        if (!alive) return;
        if (r.ok && r.view.phase !== "finished") apply(r.view);
        else storeGame(mode, null);
      }
      if (alive) setResuming(false);
    })();
    return () => {
      alive = false;
    };
  }, [mode, apply]);

  const start = useCallback(
    (choice: SetupChoice, again = false) => {
      setLastChoice(choice);
      setShowResults(false);
      setNotice(null);
      void call({ action: "start", mode, locale, ...choice, again });
    },
    [call, mode, locale],
  );

  const onAnswer = useCallback(
    (choice: number | null, answeredAt: number, double: boolean) => {
      if (!view?.question) return;
      void call({ action: "answer", gameId: view.gameId, index: view.question.index, choice, answeredAt, double });
    },
    [call, view],
  );

  const onNext = useCallback(() => {
    if (!view) return;
    setNotice(null);
    if (view.reveal?.done && view.summary) {
      setShowResults(true);
      return;
    }
    void call({ action: "next", gameId: view.gameId });
  }, [call, view]);

  const onFifty = useCallback(() => {
    if (view?.question) void call({ action: "fifty", gameId: view.gameId, index: view.question.index });
  }, [call, view]);

  const onReport = useCallback(async () => {
    if (!view?.question) return;
    const r = await call({ action: "report", gameId: view.gameId, index: view.question.index });
    if (r.ok) setNotice(tq("reported"));
  }, [call, view, tq]);

  const onSetupError = useCallback((e: string) => setError(e), []);

  const title = t(`games.${TITLE_KEY[mode]}.name`);
  const playing = !!view && !showResults && !!view.question && (view.phase !== "finished" || !!view.reveal);
  const scorePill = view && playing && (
    <span className="display-text rounded-full bg-ink px-4 py-1 text-2xl text-sunflower" data-testid="score">
      {formatNumber(view.points, locale)}
    </span>
  );

  let body;
  if (error) {
    const message = error === "unconfigured" ? te("unconfigured") : error === "no_questions" ? ts("noQuestions") : error === "network" ? tq("networkError") : te("generic");
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Kassa mood="sad" size={120} label={tc("kassa")} />
        <p role="alert" className="font-semibold">
          {message}
        </p>
        <Button tone="sunflower" size="md" onClick={() => (view ? void call({ action: "state", gameId: view.gameId }) : setError(null))}>
          {tc("retry")}
        </Button>
      </div>
    );
  } else if (view && showResults && view.summary) {
    body = (
      <ResultsScreen
        summary={view.summary}
        mode={mode}
        total={view.question?.total ?? null}
        onAgain={mode === "daily" ? null : () => (lastChoice ? start({ ...lastChoice, questionIds: undefined }, true) : (setView(null), setShowResults(false)))}
      />
    );
  } else if (view && playing) {
    body = (
      <QuestionScreen
        // A new question remounts the screen, resetting jokers-armed and report UI.
        key={`${view.question!.index}-${view.question!.startedAt}`}
        view={view}
        clockOffset={offset}
        busy={busy}
        onAnswer={onAnswer}
        onFifty={onFifty}
        onNext={onNext}
        onReport={onReport}
      />
    );
  } else if (resuming) {
    body = <p className="py-10 text-center text-muted">{tc("loading")}</p>;
  } else if (mode === "daily") {
    body = (
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex items-end gap-3">
          <Kassa mood="cheeky" size={96} label={tc("kassa")} className="shrink-0" />
          <SpeechBubble>{ts("dailyIntro")}</SpeechBubble>
        </div>
        <div className="mt-auto">
          <Button tone="tomato" size="xl" block disabled={busy} onClick={() => start({ categories: ["geo"], difficulty: "mixed" })}>
            {ts("start")}
          </Button>
        </div>
      </div>
    );
  } else {
    body = <TriviaSetup mode={mode} busy={busy} onStart={start} onError={onSetupError} />;
  }

  return (
    <>
      <BackHeader
        title={title}
        href="/play/solo"
        trailing={
          <span className="flex items-center gap-2">
            {scorePill}
            <SoundToggle />
          </span>
        }
      />
      {notice && (
        <p role="status" className="rounded-[16px] ink-border bg-sunflower px-4 py-2 font-semibold">
          {notice}
        </p>
      )}
      {body}
    </>
  );
}
