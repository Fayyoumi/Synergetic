import { NextResponse } from "next/server";
import { adminContext } from "@/lib/server/admin";

const day = /^\d{4}-\d{2}-\d{2}$/;

/** Pilot go/no-go numbers for a date range (Amman days). Default: the last 30 days. */
export async function GET(request: Request) {
  const ctx = await adminContext();
  if (!ctx.ok) return ctx.response;
  const url = new URL(request.url);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(new Date());
  const to = url.searchParams.get("to") ?? today;
  const from = url.searchParams.get("from") ?? new Date(Date.parse(to) - 29 * 86_400_000).toISOString().slice(0, 10);
  if (!day.test(from) || !day.test(to) || from > to) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const { data, error } = await ctx.db.rpc("pilot_metrics", { p_from: from, p_to: to });
  if (error) return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  return NextResponse.json({ ok: true, metrics: data });
}
