import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, nextDayStreak, visibleDayStreak } from "@/lib/game/dayStreak";
import {
  acceptProposedRound,
  buildRound,
  dailyQuestionIndex,
  fiftyFifty,
  optionPermutation,
  seededRng,
  type QuestionMeta,
} from "@/lib/game/round";
import {
  badgesFor,
  maxPossibleScore,
  ROUND_LENGTH,
  serverTimeLeft,
  xpFor,
  type Difficulty,
} from "@/lib/game/scoring";
import { createSoloState, soloReducer, soloSummary, type PlannedQuestion, type SoloAction, type SoloState } from "@/lib/game/soloTrivia";
import type { SoloErrorCode, SoloParsed, SoloView, SummaryView } from "@/lib/solo/api";
import { logEvent } from "./events";

type Req<A extends SoloParsed["action"]> = Extract<SoloParsed, { action: A }>;

/**
 * Server side of solo trivia. The client never sees answer indices: it gets
 * questions with options in a shuffled display order, and the server checks
 * answers, timing, jokers and points.
 */

type Stored = SoloState & {
  maxScore: number | null;
  repeats: number;
  /** When the game started (ms), for the analytics duration. */
  gameStartedAt: number;
  summary?: SummaryView;
};

type QuestionRow = {
  id: string;
  lang: "ar" | "en";
  category: string;
  difficulty: Difficulty;
  question: string;
  options: string[];
  answer_index: number;
};

type GameRow = { id: string; profile_id: string; progress: Stored; version: number; ended_at: string | null };

export type SoloOutcome = { ok: true; view: SoloView } | { ok: false; error: SoloErrorCode };

const GAME_TYPE = { classic: "trivia_classic", daily: "trivia_daily", sudden: "trivia_sudden" } as const;

const rng = () => seededRng(randomInt(0, 2 ** 31));

export class SoloService {
  /** When the request arrived, before any database work: used for answer timing. */
  private readonly receivedAt: number;

  constructor(
    private db: SupabaseClient,
    private userId: string,
    private now: () => number = Date.now,
    receivedAt?: number,
  ) {
    this.receivedAt = receivedAt ?? now();
  }

  async handle(req: SoloParsed): Promise<SoloOutcome> {
    switch (req.action) {
      case "start":
        return this.start(req);
      case "state":
        return this.withGame(req.gameId, (g) => this.view(g.progress, false, g.id));
      case "answer":
        return this.answer(req);
      case "fifty":
        return this.fifty(req);
      case "next":
        return this.next(req.gameId);
      case "report":
        return this.report(req);
    }
  }

  // ---------------------------------------------------------------- start

  private async start(req: Req<"start">): Promise<SoloOutcome> {
    const { mode, locale, categories, difficulty } = req;
    const now = this.now();

    let planned: QuestionMeta[];
    let notices = { filledFromOtherCategories: false, usedOtherLanguage: false };
    let repeats = 0;
    const settings: Record<string, unknown> = { categories, difficulty, locale };

    if (mode === "daily") {
      const date = localDate(new Date(now));
      settings.date = date;
      const existing = await this.db
        .from("games")
        .select("id, profile_id, progress, version, ended_at")
        .eq("profile_id", this.userId)
        .eq("type", "trivia_daily")
        .eq("settings->>date", date)
        .maybeSingle<GameRow>();
      if (existing.data) return this.view(existing.data.progress, false);

      const daily = await this.dailyQuestion(date, locale);
      if (!daily) return { ok: false, error: "no_questions" };
      planned = [daily];
      notices.usedOtherLanguage = daily.lang !== locale;
    } else {
      const [pool, recent, reported] = await Promise.all([this.pool(), this.recentIds(), this.reportedIds()]);
      const roundDifficulty = mode === "sudden" ? "mixed" : difficulty;
      const proposed = mode === "classic" ? acceptProposedRound(req.questionIds, pool, reported, roundDifficulty, ROUND_LENGTH[mode]) : null;
      const round = buildRound({
        pool,
        categories,
        difficulty: roundDifficulty,
        count: ROUND_LENGTH[mode],
        locale,
        recentIds: recent,
        excludedIds: reported,
        rng: rng(),
      });
      planned = proposed ?? round.questions;
      const selected = new Set<string>(categories);
      notices = {
        filledFromOtherCategories: planned.some((q) => !selected.has(q.category)),
        usedOtherLanguage: planned.some((q) => q.lang !== locale),
      };
      repeats = planned.filter((q) => recent.has(q.id)).length;
    }
    if (planned.length === 0) return { ok: false, error: "no_questions" };

    const r = rng();
    const questions: PlannedQuestion[] = planned.map((q) => ({ ...q, perm: optionPermutation(r) }));
    const state: Stored = {
      ...createSoloState({ mode, locale, categories, difficulty, questions, now, notices }),
      maxScore: mode === "sudden" ? null : maxPossibleScore(questions.map((q) => q.difficulty)),
      repeats,
      gameStartedAt: now,
    };

    const inserted = await this.db
      .from("games")
      .insert({ profile_id: this.userId, type: GAME_TYPE[mode], settings, progress: state })
      .select("id")
      .single<{ id: string }>();
    if (inserted.error) {
      // Two taps on "start daily" at once: the unique index lets only one through.
      if (mode === "daily" && inserted.error.code === "23505") return this.start(req);
      throw inserted.error;
    }
    void logEvent("game_started", { type: GAME_TYPE[mode], settings }, { profileId: this.userId });
    return this.view({ ...state }, false, inserted.data.id);
  }

  private async pool(): Promise<QuestionMeta[]> {
    const { data, error } = await this.db
      .from("questions")
      .select("id, category, difficulty, lang")
      .eq("status", "approved");
    if (error) throw error;
    return (data ?? []) as QuestionMeta[];
  }

  private async recentIds(): Promise<Set<string>> {
    const since = new Date(this.now() - 30 * 86_400_000).toISOString();
    const { data } = await this.db
      .from("answers")
      .select("question_id")
      .eq("profile_id", this.userId)
      .gte("created_at", since);
    return new Set((data ?? []).map((r) => r.question_id as string));
  }

  private async reportedIds(): Promise<Set<string>> {
    const { data } = await this.db.from("question_reports").select("question_id").eq("reporter_profile_id", this.userId);
    return new Set((data ?? []).map((r) => r.question_id as string));
  }

  /** Today's question: the same for everyone (its approved translation in English if there is one). */
  private async dailyQuestion(date: string, locale: "ar" | "en"): Promise<QuestionMeta | null> {
    let row = await this.db.from("daily_challenges").select("question_id").eq("date", date).maybeSingle();
    if (!row.data) {
      const { data: pool } = await this.db
        .from("questions")
        .select("id")
        .eq("status", "approved")
        .eq("lang", "ar")
        .order("id");
      const idx = dailyQuestionIndex(date, pool?.length ?? 0);
      if (idx < 0 || !pool) return null;
      await this.db.from("daily_challenges").upsert({ date, question_id: pool[idx].id }, { onConflict: "date", ignoreDuplicates: true });
      row = await this.db.from("daily_challenges").select("question_id").eq("date", date).maybeSingle();
    }
    const id = row.data?.question_id as string | undefined;
    if (!id) return null;
    const ids = locale === "en" ? [`${id}-en`, id] : [id];
    const { data } = await this.db
      .from("questions")
      .select("id, category, difficulty, lang")
      .in("id", ids)
      .eq("status", "approved");
    const rows = (data ?? []) as QuestionMeta[];
    return rows.find((q) => q.lang === locale) ?? rows[0] ?? null;
  }

  // ---------------------------------------------------------------- steps

  private async answer(req: Req<"answer">): Promise<SoloOutcome> {
    return this.withGame(req.gameId, async (g) => {
      const state = g.progress;
      if (state.phase !== "question") return this.view(state, true);
      if (req.index !== state.index) return { ok: false, error: "stale_question" };
      const q = await this.question(state.questions[state.index].id);
      const receivedAt = this.receivedAt;
      const timeLeft =
        req.choice === null
          ? 0
          : serverTimeLeft({ startedAt: state.startedAt, receivedAt, clientAnsweredAt: req.answeredAt });
      const result = this.reduce(state, {
        type: "answer",
        index: req.index,
        displayChoice: req.choice,
        timeLeft,
        answerIndex: q.answer_index,
        useDouble: req.double ?? false,
      });
      if (!result.ok) return result;
      const next = result.state;
      const record = next.answers[next.answers.length - 1];
      const answerRow = {
        question_id: record.questionId,
        question_index: record.index,
        choice_index: record.choice,
        correct: record.correct,
        time_left: record.timeLeft,
        points: record.breakdown.points,
      };
      const committed = await this.commit(g, next, answerRow);
      if (!committed) return this.reload(req.gameId, true);
      void logEvent(
        "question_answered",
        { mode: state.mode, correct: record.correct, time_left: record.timeLeft, points: record.breakdown.points },
        { profileId: this.userId },
      );

      if (next.done) {
        // Finish right away so the score is saved even if the player closes the app on the last reveal.
        const finished = await this.finish({ ...g, version: g.version + 1 }, next);
        return this.view(finished ?? next, true, g.id);
      }
      return this.view(next, true, g.id);
    });
  }

  private async fifty(req: Req<"fifty">): Promise<SoloOutcome> {
    return this.withGame(req.gameId, async (g) => {
      const state = g.progress;
      const q = await this.question(state.questions[state.index]?.id);
      const result = this.reduce(state, {
        type: "fifty",
        index: req.index,
        hiddenStored: fiftyFifty(q.answer_index, rng()),
        answerIndex: q.answer_index,
      });
      if (!result.ok) return result;
      if (!(await this.commit(g, result.state))) return this.reload(req.gameId, false);
      return this.view(result.state, false, g.id);
    });
  }

  private async next(gameId: string): Promise<SoloOutcome> {
    return this.withGame(gameId, async (g) => {
      const state = g.progress;
      if (state.phase === "reveal" && state.done) {
        // Normally already finished at answer time; this covers a failed finish.
        const finished = g.ended_at ? state : await this.finish(g, state);
        return this.view(finished ?? state, false, g.id);
      }
      const result = this.reduce(state, { type: "next", now: this.now() });
      if (!result.ok) return result.error === "wrong_phase" ? this.view(state, false, g.id) : result;
      if (!(await this.commit(g, result.state))) return this.reload(gameId, false);
      return this.view(result.state, false, g.id);
    });
  }

  private async report(req: Req<"report">): Promise<SoloOutcome> {
    return this.withGame(req.gameId, async (g) => {
      const state = g.progress;
      const current = state.questions[state.index];
      if (state.phase !== "question" || req.index !== state.index || !current) return this.view(state, false, g.id);
      await this.db
        .from("question_reports")
        .insert({ question_id: current.id, reporter_profile_id: this.userId, reason: req.reason ?? null });
      void logEvent("question_reported", { question_id: current.id, mode: state.mode }, { profileId: this.userId });

      let replacement: PlannedQuestion | null = null;
      if (state.mode !== "daily") {
        const [pool, recent, reported] = await Promise.all([this.pool(), this.recentIds(), this.reportedIds()]);
        const inRound = new Set(state.questions.map((q) => q.id));
        const pick = buildRound({
          pool: pool.filter((q) => !inRound.has(q.id)),
          categories: state.categories,
          difficulty: state.mode === "sudden" ? "mixed" : state.difficulty,
          count: 1,
          locale: state.locale,
          recentIds: recent,
          excludedIds: new Set([...reported, current.id]),
          rng: rng(),
        }).questions[0];
        if (pick) replacement = { ...pick, perm: optionPermutation(rng()) };
      }
      const result = this.reduce(state, { type: "report", index: req.index, now: this.now(), replacement });
      if (!result.ok) return result;
      let next: Stored = result.state;
      if (next.phase === "finished") {
        next = (await this.finish(g, next)) ?? next;
        return this.view(next, false, g.id);
      }
      if (!(await this.commit(g, next))) return this.reload(req.gameId, false);
      return this.view(next, false, g.id);
    });
  }

  // ---------------------------------------------------------------- persistence

  private reduce(state: Stored, action: SoloAction): { ok: true; state: Stored } | { ok: false; error: SoloErrorCode } {
    const r = soloReducer(state, action);
    if (!r.ok) return r;
    return { ok: true, state: { ...state, ...r.state } };
  }

  private async withGame(gameId: string, fn: (g: GameRow) => Promise<SoloOutcome> | SoloOutcome): Promise<SoloOutcome> {
    const { data, error } = await this.db
      .from("games")
      .select("id, profile_id, progress, version, ended_at")
      .eq("id", gameId)
      .eq("profile_id", this.userId)
      .maybeSingle<GameRow>();
    if (error) throw error;
    if (!data?.progress) return { ok: false, error: "not_found" };
    return fn(data);
  }

  private async reload(gameId: string, withReveal: boolean): Promise<SoloOutcome> {
    return this.withGame(gameId, (g) => this.view(g.progress, withReveal, g.id));
  }

  private async commit(g: GameRow, state: Stored, answer?: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await this.db.rpc("solo_commit", {
      p_game: g.id,
      p_version: g.version,
      p_progress: state,
      p_answer: answer ?? null,
    });
    if (error) throw error;
    return data === true;
  }

  /** Saves the score, XP, badges and day streak. Returns the finished state, or null if someone else finished it. */
  private async finish(g: GameRow, state: Stored): Promise<Stored | null> {
    const summary = soloSummary(state);
    const xp = xpFor(summary.points);
    const [{ count }, { data: profile }] = await Promise.all([
      this.db.from("scores").select("id", { count: "exact", head: true }).eq("profile_id", this.userId),
      this.db
        .from("profiles")
        .select("current_streak, longest_streak, last_played_on")
        .eq("id", this.userId)
        .single<{ current_streak: number; longest_streak: number; last_played_on: string | null }>(),
    ]);
    const today = localDate(new Date(this.now()));
    const streak = nextDayStreak(
      {
        current: profile?.current_streak ?? 0,
        longest: profile?.longest_streak ?? 0,
        lastPlayedOn: profile?.last_played_on ?? null,
      },
      today,
    );
    const badges = badgesFor({ mode: state.mode, results: summary.results, points: summary.points, isFirstGame: (count ?? 0) === 0 });
    const finishedState: Stored = {
      ...state,
      phase: "finished",
      hidden: [],
      summary: {
        points: summary.points,
        correct: summary.correct,
        answered: summary.answered,
        bestStreak: summary.bestStreak,
        xp,
        badges,
        dayStreak: visibleDayStreak(streak, today),
      },
    };
    const { data, error } = await this.db.rpc("solo_finish", {
      p_game: g.id,
      p_version: g.version,
      p_progress: finishedState,
      p_points: summary.points,
      p_xp: xp,
      p_badges: badges,
      p_current_streak: streak.current,
      p_longest_streak: streak.longest,
      p_played_on: today,
    });
    if (error) throw error;
    if (data !== true) return null;
    void logEvent(
      "game_finished",
      {
        type: GAME_TYPE[state.mode],
        duration_sec: Math.round((this.now() - state.gameStartedAt) / 1000),
        points: summary.points,
        correct: summary.correct,
        answered: summary.answered,
      },
      { profileId: this.userId },
    );
    return finishedState;
  }

  private async question(id: string | undefined): Promise<QuestionRow> {
    const { data, error } = await this.db
      .from("questions")
      .select("id, lang, category, difficulty, question, options, answer_index")
      .eq("id", id ?? "")
      .single<QuestionRow>();
    if (error) throw error;
    return data;
  }

  // ---------------------------------------------------------------- views

  private async view(state: Stored, withReveal: boolean, gameId?: string): Promise<SoloOutcome> {
    const id = gameId ?? "";
    const showReveal = state.phase === "reveal" || (withReveal && state.answers.length > 0);
    const current = state.phase === "question" ? state.questions[state.index] : null;
    const last = showReveal ? state.answers[state.answers.length - 1] : null;
    const lastPlanned = last ? state.questions[last.index] : null;

    const ids = [current?.id, last?.questionId].filter((x): x is string => !!x);
    const rows = new Map<string, QuestionRow>();
    if (ids.length) {
      const { data } = await this.db
        .from("questions")
        .select("id, lang, category, difficulty, question, options, answer_index")
        .in("id", ids);
      for (const r of (data ?? []) as QuestionRow[]) rows.set(r.id, r);
    }

    const view: SoloView = {
      gameId: id,
      mode: state.mode,
      phase: state.phase,
      points: state.points,
      streak: state.streak,
      jokers: state.jokers,
      maxScore: state.maxScore,
      notices: { ...state.notices, repeats: state.repeats },
      serverNow: this.now(),
      question: null,
      reveal: null,
      summary: state.phase === "finished" ? (state.summary ?? null) : null,
    };

    if (current) {
      const row = rows.get(current.id);
      if (row) {
        view.question = {
          index: state.index,
          total: state.mode === "sudden" ? null : state.questions.length,
          category: row.category,
          difficulty: row.difficulty,
          lang: row.lang,
          question: row.question,
          options: current.perm.map((i) => row.options[i]),
          hidden: state.hidden.map((stored) => current.perm.indexOf(stored)),
          startedAt: state.startedAt,
        };
      }
    }

    if (last && lastPlanned && lastPlanned.id === last.questionId) {
      const row = rows.get(last.questionId);
      if (row) {
        view.reveal = {
          correctChoice: lastPlanned.perm.indexOf(row.answer_index),
          choice: last.choice === null ? null : lastPlanned.perm.indexOf(last.choice),
          correct: last.correct,
          timedOut: last.choice === null || (last.timeLeft === 0 && !last.correct),
          points: last.breakdown.points,
          base: last.breakdown.base,
          speed: last.breakdown.speed,
          streakBonus: last.breakdown.streak,
          doubled: last.doubled,
          done: state.done,
        };
        // The reveal also needs the question text and options for the screen.
        if (!view.question) {
          view.question = {
            index: last.index,
            total: state.mode === "sudden" ? null : state.questions.length,
            category: row.category,
            difficulty: row.difficulty,
            lang: row.lang,
            question: row.question,
            options: lastPlanned.perm.map((i) => row.options[i]),
            hidden: [],
            startedAt: state.startedAt,
          };
        }
      }
    }
    return { ok: true, view };
  }
}
