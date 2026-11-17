import { z } from "zod";

/** Content types the admin can review. */
export const ADMIN_TYPES = {
  questions: { table: "questions", cols: "id, lang, category, difficulty, question, options, answer_index, source_url, status", order: "id" },
  traits: { table: "traits", cols: "id, lang, text, mood_min, banned, status", order: "id" },
  prompts: { table: "prompts", cols: "id, lang, text, mood_min, status", order: "id" },
  charades: { table: "charades_words", cols: "id, lang, word, category, difficulty, status", order: "word" },
  kassa: { table: "kassa_lines", cols: "id, lang, event, mood, text, status", order: "id" },
} as const;
export type AdminType = keyof typeof ADMIN_TYPES;
export const adminType = z.enum(Object.keys(ADMIN_TYPES) as [AdminType, ...AdminType[]]);

export const contentAction = z.object({
  type: adminType,
  id: z.string().min(1).max(80),
  action: z.enum(["approve", "retire", "draft"]),
  /** Questions: the source to save before approving. */
  sourceUrl: z.url().optional(),
});

export const reportAction = z.object({ questionId: z.string().max(40), action: z.enum(["resolve", "retire"]) });

export const UPLOAD_KINDS = ["questions", "charades", "traits", "prompts"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const uploadRequest = z.object({
  kind: z.enum(UPLOAD_KINDS),
  format: z.enum(["json", "csv"]),
  text: z.string().max(2_000_000),
});

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, commas and newlines in quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Turns a CSV row into the JSON shape the content schemas expect. */
export function csvRowToContent(kind: UploadKind, r: Record<string, string>): Record<string, unknown> {
  const status = r.status || "draft";
  switch (kind) {
    case "questions":
      return {
        id: r.id,
        lang: r.lang || "ar",
        category: r.category,
        difficulty: r.difficulty,
        country_tags: r.country_tags ? r.country_tags.split("|").map((s) => s.trim()).filter(Boolean) : [],
        question: r.question,
        options: [r.option_1, r.option_2, r.option_3, r.option_4],
        answer_index: Number(r.answer_index),
        explanation: r.explanation || null,
        source_url: r.source_url || null,
        status,
      };
    case "charades":
      return { lang: r.lang || "ar", word: r.word, category: r.category, difficulty: Number(r.difficulty), status };
    case "traits":
      return { id: r.id, lang: r.lang || "ar", text: r.text, mood_min: r.mood_min || "family", banned: r.banned === "true", status };
    case "prompts":
      return { id: r.id, lang: r.lang || "ar", text: r.text, mood_min: r.mood_min || "family", status };
  }
}
