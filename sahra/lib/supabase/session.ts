"use client";

import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./client";

export type GuestSession =
  | { status: "unconfigured" }
  | { status: "ok"; user: User }
  | { status: "error"; message: string };

let pending: Promise<GuestSession> | null = null;

/**
 * Returns the current Supabase user, signing in anonymously first if needed.
 * Concurrent callers share one sign-in request.
 */
export function ensureGuestSession(): Promise<GuestSession> {
  pending ??= (async (): Promise<GuestSession> => {
    const supabase = getBrowserSupabase();
    if (!supabase) return { status: "unconfigured" };
    const { data } = await supabase.auth.getUser();
    if (data.user) return { status: "ok", user: data.user };
    const { data: signedIn, error } = await supabase.auth.signInAnonymously();
    if (error || !signedIn.user) {
      pending = null; // allow a retry later
      return { status: "error", message: error?.message ?? "unknown" };
    }
    return { status: "ok", user: signedIn.user };
  })();
  return pending;
}
