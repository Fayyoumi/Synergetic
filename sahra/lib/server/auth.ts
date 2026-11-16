import "server-only";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ServerContext =
  | { ok: true; userId: string; service: SupabaseClient }
  | { ok: false; error: "unconfigured" | "unauthenticated"; status: number };

/** The signed-in (possibly anonymous) user plus a service-role client for trusted writes. */
export async function serverContext(): Promise<ServerContext> {
  const user = await getServerSupabase();
  const service = getServiceSupabase();
  if (!user || !service) return { ok: false, error: "unconfigured", status: 503 };
  const { data } = await user.auth.getUser();
  if (!data.user) return { ok: false, error: "unauthenticated", status: 401 };
  return { ok: true, userId: data.user.id, service };
}
