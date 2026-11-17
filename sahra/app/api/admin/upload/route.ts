import { NextResponse } from "next/server";
import { z } from "zod";
import { csvRowToContent, parseCsv, uploadRequest } from "@/lib/admin/content";
import { charadesWordSchema, promptSchema, questionSchema, traitSchema } from "@/lib/content/schemas";
import { adminContext } from "@/lib/server/admin";

const SCHEMAS = { questions: questionSchema, charades: charadesWordSchema, traits: traitSchema, prompts: promptSchema } as const;
const TABLES = { questions: "questions", charades: "charades_words", traits: "traits", prompts: "prompts" } as const;
const KEYS = { questions: "id", charades: "lang,word", traits: "id", prompts: "id" } as const;

/**
 * Uploads content from CSV or JSON. Every row is validated (approved questions
 * need a source); invalid rows are reported and skipped. Existing approved or
 * retired content is never turned back into a draft.
 */
export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const parsed = uploadRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const { kind, format, text } = parsed.data;

  let raw: unknown[];
  try {
    raw = format === "json" ? JSON.parse(text) : parseCsv(text).map((r) => csvRowToContent(kind, r));
    if (!Array.isArray(raw)) throw new Error("not an array");
  } catch {
    return NextResponse.json({ ok: false, error: "unreadable" }, { status: 400 });
  }

  const valid: Record<string, unknown>[] = [];
  const errors: { row: number; message: string }[] = [];
  raw.forEach((r, i) => {
    const result = SCHEMAS[kind].safeParse(r);
    if (result.success) valid.push(result.data as Record<string, unknown>);
    else errors.push({ row: i + 1, message: z.prettifyError(result.error).slice(0, 300) });
  });

  // Never downgrade: keep an existing approved/retired status when the upload says draft.
  const keyOf = (r: Record<string, unknown>) => (kind === "charades" ? `${r.lang}|${r.word}` : String(r.id));
  const { data: existing } = await ctx.db.from(TABLES[kind]).select(kind === "charades" ? "lang, word, status" : "id, status");
  const prev = new Map(
    ((existing ?? []) as unknown as Record<string, string>[]).map((e) => [kind === "charades" ? `${e.lang}|${e.word}` : e.id, e.status]),
  );
  const rows = valid.map((r) => {
    const { banned_topic: _ignored, ...rest } = r as Record<string, unknown> & { banned_topic?: unknown };
    void _ignored;
    const p = prev.get(keyOf(r));
    return p && p !== "draft" && rest.status === "draft" ? { ...rest, status: p } : rest;
  });
  if (rows.length) {
    const { error } = await ctx.db.from(TABLES[kind]).upsert(rows, { onConflict: KEYS[kind] });
    if (error) return NextResponse.json({ ok: false, error: "server_error", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, imported: rows.length, errors });
}
