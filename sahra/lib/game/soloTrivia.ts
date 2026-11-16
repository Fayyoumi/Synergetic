import { scoreAnswer, type Difficulty, type PointsBreakdown, type RoundDifficulty, type SoloMode } from "./scoring";

/**
 * Solo trivia state machine (server-side authority).
 * question → reveal → question → … → finished
 * Pure: the caller supplies the clock (`now`), the server-computed timeLeft,
 * the correct answer and any randomness.
 */

export type PlannedQuestion = {
  id: string;
  category: string;
  difficulty: Difficulty;
  lang: "ar" | "en";
  /** Display slot k shows stored option perm[k]. */
  perm: number[];
};

export type AnswerRecord = {
  questionId: string;
  index: number;
  /** Stored option index chosen; null = timeout. */
  choice: number | null;
  correct: boolean;
  timeLeft: number;
  doubled: boolean;
  breakdown: PointsBreakdown;
};

export type SoloState = {
  v: 1;
  mode: SoloMode;
  locale: "ar" | "en";
  categories: string[];
  difficulty: RoundDifficulty;
  questions: PlannedQuestion[];
  index: number;
  phase: "question" | "reveal" | "finished";
  /** When the current question was shown (ms since epoch, server clock). */
  startedAt: number;
  streak: number;
  points: number;
  answers: AnswerRecord[];
  jokers: { fifty: boolean; double: boolean }; // true = still available
  /** Stored indices hidden by 50:50 on the current question. */
  hidden: number[];
  /** No more questions after the current reveal. */
  done: boolean;
  notices: { filledFromOtherCategories: boolean; usedOtherLanguage: boolean };
};

export type SoloAction =
  | { type: "answer"; index: number; displayChoice: number | null; timeLeft: number; answerIndex: number; useDouble: boolean }
  | { type: "fifty"; index: number; hiddenStored: [number, number]; answerIndex: number }
  | { type: "next"; now: number }
  | { type: "report"; index: number; now: number; replacement: PlannedQuestion | null };

export type SoloError =
  | "wrong_phase"
  | "stale_question"
  | "joker_used"
  | "bad_choice"
  | "bad_hidden";

export type SoloResult = { ok: true; state: SoloState } | { ok: false; error: SoloError };

export function createSoloState(args: {
  mode: SoloMode;
  locale: "ar" | "en";
  categories: string[];
  difficulty: RoundDifficulty;
  questions: PlannedQuestion[];
  now: number;
  notices: SoloState["notices"];
}): SoloState {
  return {
    v: 1,
    mode: args.mode,
    locale: args.locale,
    categories: args.categories,
    difficulty: args.difficulty,
    questions: args.questions,
    index: 0,
    phase: args.questions.length === 0 ? "finished" : "question",
    startedAt: args.now,
    streak: 0,
    points: 0,
    answers: [],
    jokers: { fifty: true, double: true },
    hidden: [],
    done: args.questions.length === 0,
    notices: args.notices,
  };
}

const fail = (error: SoloError): SoloResult => ({ ok: false, error });

export function soloReducer(state: SoloState, action: SoloAction): SoloResult {
  switch (action.type) {
    case "answer": {
      if (state.phase !== "question") return fail("wrong_phase");
      if (action.index !== state.index) return fail("stale_question");
      if (action.useDouble && !state.jokers.double) return fail("joker_used");
      const q = state.questions[state.index];
      let stored: number | null = null;
      if (action.displayChoice !== null) {
        if (!Number.isInteger(action.displayChoice) || action.displayChoice < 0 || action.displayChoice > 3) {
          return fail("bad_choice");
        }
        stored = q.perm[action.displayChoice];
        // A hidden (50:50) option can't be picked.
        if (state.hidden.includes(stored)) return fail("bad_choice");
      }
      const correct = stored !== null && stored === action.answerIndex && action.timeLeft > 0;
      const breakdown = scoreAnswer({
        difficulty: q.difficulty,
        correct,
        timeLeft: action.timeLeft,
        streakBefore: state.streak,
        doubleActive: action.useDouble,
      });
      const isLast = state.index >= state.questions.length - 1;
      const suddenOut = state.mode === "sudden" && !correct;
      return {
        ok: true,
        state: {
          ...state,
          phase: "reveal",
          streak: breakdown.streakAfter,
          points: state.points + breakdown.points,
          jokers: { ...state.jokers, double: action.useDouble ? false : state.jokers.double },
          answers: [
            ...state.answers,
            {
              questionId: q.id,
              index: state.index,
              choice: stored,
              correct,
              timeLeft: action.timeLeft,
              doubled: action.useDouble,
              breakdown,
            },
          ],
          done: isLast || suddenOut,
        },
      };
    }

    case "fifty": {
      if (state.phase !== "question") return fail("wrong_phase");
      if (action.index !== state.index) return fail("stale_question");
      if (!state.jokers.fifty) return fail("joker_used");
      const [a, b] = action.hiddenStored;
      if (a === b || a === action.answerIndex || b === action.answerIndex || ![a, b].every((i) => i >= 0 && i <= 3)) {
        return fail("bad_hidden");
      }
      return { ok: true, state: { ...state, hidden: [a, b], jokers: { ...state.jokers, fifty: false } } };
    }

    case "next": {
      if (state.phase !== "reveal") return fail("wrong_phase");
      if (state.done) return { ok: true, state: { ...state, phase: "finished", hidden: [] } };
      return {
        ok: true,
        state: { ...state, phase: "question", index: state.index + 1, startedAt: action.now, hidden: [] },
      };
    }

    case "report": {
      // Reporting hides the question immediately: swap in a replacement with a
      // fresh timer, or (if none is left) skip it without touching the score or streak.
      if (state.phase !== "question") return fail("wrong_phase");
      if (action.index !== state.index) return fail("stale_question");
      if (action.replacement) {
        const questions = [...state.questions];
        questions[state.index] = action.replacement;
        return { ok: true, state: { ...state, questions, startedAt: action.now, hidden: [] } };
      }
      const questions = state.questions.filter((_, i) => i !== state.index);
      if (state.index >= questions.length) {
        return { ok: true, state: { ...state, questions, phase: "finished", hidden: [], done: true } };
      }
      return { ok: true, state: { ...state, questions, startedAt: action.now, hidden: [] } };
    }
  }
}

/** Summary numbers for the results screen. */
export function soloSummary(state: SoloState) {
  const results = state.answers.map((a) => a.correct);
  let best = 0;
  let run = 0;
  for (const ok of results) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return {
    points: state.points,
    correct: results.filter(Boolean).length,
    answered: results.length,
    bestStreak: best,
    results,
  };
}
