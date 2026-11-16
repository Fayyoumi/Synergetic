"use client";

import { useEffect, useState } from "react";
import { ensureGuestSession } from "@/lib/supabase/session";
import type { ProfilePatch, ProfileView } from "./api";

export type ProfileResult = { ok: true; profile: ProfileView } | { ok: false; error: string };

export async function fetchProfile(): Promise<ProfileResult> {
  const session = await ensureGuestSession();
  if (session.status !== "ok") return { ok: false, error: session.status };
  try {
    return await (await fetch("/api/me", { cache: "no-store" })).json();
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function patchProfile(patch: ProfilePatch): Promise<ProfileResult> {
  try {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function deleteMyData(): Promise<{ ok: boolean }> {
  try {
    return await (await fetch("/api/me", { method: "DELETE" })).json();
  } catch {
    return { ok: false };
  }
}

/** Loads the profile once on mount. null while loading. */
export function useProfile(): ProfileResult | null {
  const [result, setResult] = useState<ProfileResult | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchProfile().then((r) => alive && setResult(r));
    return () => {
      alive = false;
    };
  }, []);
  return result;
}
