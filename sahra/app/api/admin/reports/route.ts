import { NextResponse } from "next/server";
import { reportAction } from "@/lib/admin/content";
import { adminContext } from "@/lib/server/admin";

type Row = { id: string; question_id: string; reason: string | null; created_at: string };

/** Open question reports, grouped by question. */
export async function GET() {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const { data: reports } = await ctx.db
    .from("question_reports")
    .select("id, question_id, reason, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const byQuestion = new Map<string, Row[]>();
  for (const r of (reports ?? []) as Row[]) byQuestion.set(r.question_id, [...(byQuestion.get(r.question_id) ?? []), r]);
  const ids = [...byQuestion.keys()];
  const { data: questions } = ids.length
    ? await ctx.db.from("questions").select("id, question, options, answer_index, source_url, status, times_shown, times_correct").in("id", ids)
    : { data: [] };
  const items = (questions ?? [])
    .map((q) => ({ ...q, reports: byQuestion.get(q.id as string)!.length, reasons: byQuestion.get(q.id as string)!.map((r) => r.reason).filter(Boolean) }))
    .sort((a, b) => b.reports - a.reports);
  return NextResponse.json({ ok: true, items });
}

/** Resolve a question's reports, optionally retiring the question. */
export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const parsed = reportAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (parsed.data.action === "retire") await ctx.db.from("questions").update({ status: "retired" }).eq("id", parsed.data.questionId);
  await ctx.db.from("question_reports").update({ resolved_at: new Date().toISOString() }).eq("question_id", parsed.data.questionId).is("resolved_at", null);
  return NextResponse.json({ ok: true });
}
