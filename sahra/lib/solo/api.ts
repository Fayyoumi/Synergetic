import { z } from "zod";
import { CATEGORIES } from "@/lib/content/schemas";

/** Request/response contract for POST /api/solo, shared by client and server. */

export const soloMode = z.enum(["classic", "daily", "sudden"]);
export const roundDifficulty = z.enum(["easy", "mixed", "hard"]);

export const soloRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    mode: soloMode,
    categories: z.array(z.enum(CATEGORIES)).min(1).max(CATEGORIES.length).default(["geo"]),
    difficulty: roundDifficulty.default("mixed"),
    locale: z.enum(["ar", "en"]),
    /**
     * The round the setup screen previewed (so its "highest possible score" is
     * exact). The server re-checks every id and rebuilds the round if any is invalid.
     */
    questionIds: z.array(z.string().max(40)).max(50).optional(),
  }),
  z.object({ action: z.literal("state"), gameId: z.uuid() }),
  z.object({
    action: z.literal("answer"),
    gameId: z.uuid(),
    index: z.number().int().min(0).max(49),
    /** Display slot 0–3, or null when the timer ran out. */
    choice: z.number().int().min(0).max(3).nullable(),
    /** Client's answer time in server-clock ms (client clock + offset). */
    answeredAt: z.number().finite().nullable(),
    double: z.boolean().default(false),
  }),
  z.object({ action: z.literal("fifty"), gameId: z.uuid(), index: z.number().int().min(0).max(49) }),
  z.object({ action: z.literal("next"), gameId: z.uuid() }),
  z.object({
    action: z.literal("report"),
    gameId: z.uuid(),
    index: z.number().int().min(0).max(49),
    reason: z.string().trim().max(500).optional(),
  }),
]);
export type SoloRequest = z.input<typeof soloRequest>;
export type SoloParsed = z.output<typeof soloRequest>;

export type QuestionView = {
  index: number;
  /** Planned questions; null for sudden death (open-ended). */
  total: number | null;
  category: string;
  difficulty: "easy" | "medium" | "hard" | "legend";
  lang: "ar" | "en";
  question: string;
  /** Options in display order. */
  options: string[];
  /** Display slots hidden by 50:50. */
  hidden: number[];
  startedAt: number;
};

export type RevealView = {
  correctChoice: number;
  /** Display slot the player picked; null = timeout. */
  choice: number | null;
  correct: boolean;
  timedOut: boolean;
  points: number;
  base: number;
  speed: number;
  streakBonus: number;
  doubled: boolean;
  done: boolean;
};

export type SummaryView = {
  points: number;
  correct: number;
  answered: number;
  bestStreak: number;
  xp: number;
  badges: string[];
  dayStreak: number;
};

export type SoloView = {
  gameId: string;
  mode: "classic" | "daily" | "sudden";
  phase: "question" | "reveal" | "finished";
  points: number;
  streak: number;
  jokers: { fifty: boolean; double: boolean };
  maxScore: number | null;
  notices: { filledFromOtherCategories: boolean; usedOtherLanguage: boolean; repeats: number };
  /** Server clock when this response was made, for the client's clock offset. */
  serverNow: number;
  question: QuestionView | null;
  reveal: RevealView | null;
  summary: SummaryView | null;
};

export type SoloErrorCode =
  | "unconfigured"
  | "unauthenticated"
  | "bad_request"
  | "not_found"
  | "no_questions"
  | "daily_done"
  | "conflict"
  | "wrong_phase"
  | "stale_question"
  | "joker_used"
  | "bad_choice"
  | "bad_hidden";

export type SoloResponse = { ok: true; view: SoloView } | { ok: false; error: SoloErrorCode };

/** GET /api/solo/catalog: what the setup screen needs to preview a round. No answers. */
export type SoloCatalog = {
  pool: { id: string; category: string; difficulty: "easy" | "medium" | "hard" | "legend"; lang: "ar" | "en" }[];
  recentIds: string[];
  reportedIds: string[];
};
