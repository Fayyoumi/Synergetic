import { NextResponse } from "next/server";
import type { SoloCatalog } from "@/lib/solo/api";
import { serverContext } from "@/lib/server/auth";

/**
 * Metadata the setup screen needs to preview a round: approved question ids
 * with category/difficulty/language (never the text or answers), plus the
 * player's own recently seen and reported ids.
 */
export async function GET() {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [pool, recent, reported] = await Promise.all([
    ctx.service.from("questions").select("id, category, difficulty, lang").eq("status", "approved"),
    ctx.service.from("answers").select("question_id").eq("profile_id", ctx.userId).gte("created_at", since),
    ctx.service.from("question_reports").select("question_id").eq("reporter_profile_id", ctx.userId),
  ]);
  if (pool.error) return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  const catalog: SoloCatalog = {
    pool: (pool.data ?? []) as SoloCatalog["pool"],
    recentIds: [...new Set((recent.data ?? []).map((r) => r.question_id as string))],
    reportedIds: [...new Set((reported.data ?? []).map((r) => r.question_id as string))],
  };
  return NextResponse.json({ ok: true, catalog });
}
