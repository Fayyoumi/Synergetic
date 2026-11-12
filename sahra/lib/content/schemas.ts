import { z } from "zod";

/**
 * Zod schemas for every seed content file in /content. The import script and
 * the unit tests both validate against these, so a bad seed never reaches the DB.
 */

export const LANGS = ["ar", "en"] as const;
export const lang = z.enum(LANGS);

/** Content status. Only "approved" is ever shown to players. */
export const contentStatus = z.enum(["draft", "approved", "retired"]);
export type ContentStatus = z.infer<typeof contentStatus>;

export const CATEGORIES = [
  "geo",
  "sport",
  "food",
  "hist",
  "sci",
  "tv",
  "lang",
  "flags",
  "logos",
  "music",
  "riddles",
  "maps",
] as const;
export const category = z.enum(CATEGORIES);
export type Category = z.infer<typeof category>;

/** Categories that need images; left empty in the MVP. */
export const IMAGE_CATEGORIES: readonly Category[] = ["flags", "logos", "maps"];

export const DIFFICULTIES = ["easy", "medium", "hard", "legend"] as const;
export const difficulty = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof difficulty>;

export const MOODS = ["family", "friends", "roast"] as const;
export const mood = z.enum(MOODS);
export type Mood = z.infer<typeof mood>;

const nonEmpty = z.string().trim().min(1);

export const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z]+-\d{4}(-[a-z]{2})?$/, "id like geo-0001 or geo-0001-en"),
    lang,
    category,
    difficulty,
    country_tags: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
    question: nonEmpty,
    options: z.array(nonEmpty).length(4),
    answer_index: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(1).nullable().optional(),
    source_url: z.url().nullable().optional(),
    status: contentStatus,
  })
  .superRefine((q, ctx) => {
    if (new Set(q.options).size !== 4) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "options must be distinct" });
    }
    // No invented facts: an approved question must cite a source.
    if (q.status === "approved" && !q.source_url) {
      ctx.addIssue({ code: "custom", path: ["source_url"], message: "approved questions need a source_url" });
    }
    if (IMAGE_CATEGORIES.includes(q.category)) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "image categories are empty in the MVP" });
    }
  });
export type Question = z.infer<typeof questionSchema>;

export const charadesWordSchema = z.object({
  lang,
  word: nonEmpty,
  category: nonEmpty,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: contentStatus,
});
export type CharadesWord = z.infer<typeof charadesWordSchema>;

export const promptSchema = z.object({
  id: z.string().regex(/^prompt-\d{4}$/),
  lang,
  text: nonEmpty,
  mood_min: mood,
  status: contentStatus,
});
export type Prompt = z.infer<typeof promptSchema>;

/**
 * Traits for "Who among us?" lines (template: "مين فينا… {trait}؟").
 * Traits that tease appearance, religion, weight, health or family status
 * are banned: the loader drops them, and a banned trait can never be approved.
 */
export const BANNED_TOPICS = ["appearance", "religion", "weight", "health", "family_status"] as const;
export const traitSchema = z
  .object({
    id: z.string().regex(/^trait-\d{4}$/),
    lang,
    text: nonEmpty,
    mood_min: mood,
    banned: z.boolean().default(false),
    banned_topic: z.enum(BANNED_TOPICS).optional(),
    status: contentStatus,
  })
  .superRefine((t, ctx) => {
    if (t.banned && !t.banned_topic) {
      ctx.addIssue({ code: "custom", path: ["banned_topic"], message: "banned traits must name the topic" });
    }
    if (t.banned && t.status === "approved") {
      ctx.addIssue({ code: "custom", path: ["status"], message: "a banned trait can never be approved" });
    }
  });
export type Trait = z.infer<typeof traitSchema>;

export const traitTemplatesSchema = z.object({
  lang,
  templates: z.array(nonEmpty.refine((s) => s.includes("{trait}"), "template needs {trait}")).min(1),
});

/** Kassa events. Add new events here first; the tests check every event has lines. */
export const KASSA_EVENTS = [
  "lobby_welcome",
  "game_start",
  "correct",
  "wrong",
  "timeout",
  "streak_3",
  "perfect_round",
  "final_winner",
  "vote_reveal_winner",
  "vote_reveal_tie",
  "charades_got_it",
  "charades_time_up",
  "charades_steal",
] as const;
export const kassaEvent = z.enum(KASSA_EVENTS);
export type KassaEvent = z.infer<typeof kassaEvent>;

/** Placeholders a Kassa line may use. */
export const KASSA_PLACEHOLDERS = ["name", "points"] as const;

const kassaLine = nonEmpty.refine(
  (s) => [...s.matchAll(/\{(\w+)\}/g)].every((m) => (KASSA_PLACEHOLDERS as readonly string[]).includes(m[1])),
  "unknown placeholder (allowed: {name}, {points})",
);

export const kassaFileSchema = z.object({
  lang,
  status: contentStatus,
  events: z.record(kassaEvent, z.record(mood, z.array(kassaLine).min(5))),
});
export type KassaFile = z.infer<typeof kassaFileSchema>;

export const blocklistSchema = z.object({
  _note: z.string().optional(),
  ar: z.array(nonEmpty).min(1),
  en: z.array(nonEmpty).min(1),
});
export type Blocklist = z.infer<typeof blocklistSchema>;
