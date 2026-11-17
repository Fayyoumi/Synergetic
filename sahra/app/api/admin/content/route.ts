import { NextResponse } from "next/server";
import { ADMIN_TYPES, adminType, contentAction } from "@/lib/admin/content";
import { adminContext } from "@/lib/server/admin";

/** Lists content of one type and status (default: drafts). */
export async function GET(request: Request) {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const url = new URL(request.url);
  const type = adminType.safeParse(url.searchParams.get("type") ?? "questions");
  const status = url.searchParams.get("status") ?? "draft";
  if (!type.success || !["draft", "approved", "retired"].includes(status)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const t = ADMIN_TYPES[type.data];
  const { data, error } = await ctx.db.from(t.table).select(t.cols).eq("status", status).order(t.order).limit(300);
  if (error) return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  const counts: Record<string, number> = {};
  for (const s of ["draft", "approved", "retired"]) {
    const { count } = await ctx.db.from(t.table).select("id", { count: "exact", head: true }).eq("status", s);
    counts[s] = count ?? 0;
  }
  return NextResponse.json({ ok: true, rows: data, counts });
}

/** Approve / retire / back to draft. Approving a question needs a source. */
export async function POST(request: Request) {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const parsed = contentAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const { type, id, action, sourceUrl } = parsed.data;
  const table = ADMIN_TYPES[type].table;
  const status = action === "approve" ? "approved" : action === "retire" ? "retired" : "draft";
  const patch: Record<string, unknown> = { status };
  if (type === "questions") {
    if (sourceUrl) patch.source_url = sourceUrl;
    if (action === "approve") {
      const { data: q } = await ctx.db.from("questions").select("source_url").eq("id", id).maybeSingle<{ source_url: string | null }>();
      if (!sourceUrl && !q?.source_url) return NextResponse.json({ ok: false, error: "needs_source" }, { status: 400 });
      patch.approved_by = ctx.userId;
      patch.approved_at = new Date().toISOString();
    }
  }
  if (type === "kassa") patch.updated_at = new Date().toISOString();
  const { error } = await ctx.db.from(table).update(patch).eq("id", id);
  if (error) {
    const banned = error.message.includes("banned_never_approved");
    return NextResponse.json({ ok: false, error: banned ? "banned" : "server_error" }, { status: banned ? 400 : 500 });
  }
  return NextResponse.json({ ok: true });
}
