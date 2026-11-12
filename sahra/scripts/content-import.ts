/**
 * Validates /content with Zod and upserts it into Supabase.
 *
 *   npm run content:check   validate only (CI)
 *   npm run content:sql     write supabase/seed.sql (paste into the SQL editor, or used by `supabase db reset`)
 *   npm run content:import  upsert into the project in NEXT_PUBLIC_SUPABASE_URL using SUPABASE_SERVICE_ROLE_KEY
 *
 * Kassa lines and the blocklist stay as JSON files read by the app; they are validated here too.
 * Re-importing never downgrades content that an admin already approved.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadSeedContent } from "../lib/content/load";
import { buildSeedSql } from "../lib/content/seedSql";

async function main() {
  const mode = process.argv.includes("--check") ? "check" : process.argv.includes("--sql") ? "sql" : "import";
  const content = loadSeedContent();
  const counts = {
    questions: content.questions.length,
    approvedQuestions: content.questions.filter((q) => q.status === "approved").length,
    charades: content.charades.length,
    prompts: content.prompts.length,
    traits: content.traits.length,
    kassaLines: Object.values(content.kassa.ar.events).flatMap((m) => Object.values(m)).flat().length,
  };
  console.log("Content is valid:", counts);
  if (mode === "check") return;

  if (mode === "sql") {
    const file = path.resolve(__dirname, "../supabase/seed.sql");
    writeFileSync(file, buildSeedSql(content));
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Never downgrade: keep an existing approved/retired status when the seed says draft.
  async function mergeStatus<T extends { status: string }>(table: string, keyOf: (r: T) => string, keyCols: string, rows: T[]) {
    const { data, error } = await db.from(table).select(`${keyCols}, status`);
    if (error) throw error;
    const existing = new Map(
      (data as unknown as Record<string, string>[]).map((r) => [keyCols.split(",").map((c) => r[c.trim()]).join("|"), r.status]),
    );
    return rows.map((r) => {
      const prev = existing.get(keyOf(r));
      return prev && prev !== "draft" && r.status === "draft" ? { ...r, status: prev } : r;
    });
  }

  const upsert = async (table: string, rows: object[], onConflict: string) => {
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  ${table}: ${rows.length} rows`);
  };

  const questions = content.questions.map((q) => ({ ...q, explanation: q.explanation ?? null, source_url: q.source_url ?? null }));
  await upsert("questions", await mergeStatus("questions", (r) => r.id, "id", questions), "id");
  await upsert("charades_words", await mergeStatus("charades_words", (r) => `${r.lang}|${r.word}`, "lang,word", content.charades), "lang,word");
  await upsert("prompts", await mergeStatus("prompts", (r) => r.id, "id", content.prompts), "id");
  await upsert(
    "traits",
    await mergeStatus("traits", (r) => r.id, "id", content.traits.map((t) => ({ id: t.id, lang: t.lang, text: t.text, mood_min: t.mood_min, banned: t.banned, status: t.status }))),
    "id",
  );
  console.log("Import finished.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
