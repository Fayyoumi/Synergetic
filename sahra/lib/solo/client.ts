"use client";

import { ensureGuestSession } from "@/lib/supabase/session";
import type { SoloCatalog, SoloRequest, SoloResponse } from "./api";

export type ClientError = "unconfigured" | "network" | string;

/** Calls POST /api/solo after making sure the guest session exists. */
export async function soloCall(req: SoloRequest): Promise<SoloResponse | { ok: false; error: ClientError }> {
  const session = await ensureGuestSession();
  if (session.status === "unconfigured") return { ok: false, error: "unconfigured" };
  try {
    const res = await fetch("/api/solo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return (await res.json()) as SoloResponse;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchCatalog(): Promise<{ ok: true; catalog: SoloCatalog } | { ok: false; error: ClientError }> {
  const session = await ensureGuestSession();
  if (session.status === "unconfigured") return { ok: false, error: "unconfigured" };
  try {
    const res = await fetch("/api/solo/catalog");
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}
