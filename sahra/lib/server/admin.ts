import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverContext } from "./auth";

export type AdminContext = { ok: true; userId: string; db: SupabaseClient } | { ok: false; response: NextResponse };

/** Admin routes: signed in, and profiles.is_admin = true. */
export async function adminContext(): Promise<AdminContext> {
  const ctx = await serverContext();
  if (!ctx.ok) return { ok: false, response: NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }) };
  const { data } = await ctx.service.from("profiles").select("is_admin").eq("id", ctx.userId).maybeSingle<{ is_admin: boolean }>();
  if (!data?.is_admin) return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  return { ok: true, userId: ctx.userId, db: ctx.service };
}
