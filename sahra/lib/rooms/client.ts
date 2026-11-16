"use client";

import { ensureGuestSession } from "@/lib/supabase/session";
import type { HostAction, RoomGame, RoomResponse } from "./api";

const DEVICE_KEY = "sahra:device";

/** A random id kept in localStorage, used to give a phone its seat back. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

async function call(path: string, init?: RequestInit): Promise<RoomResponse> {
  const session = await ensureGuestSession();
  if (session.status === "unconfigured") return { ok: false, error: "unconfigured" };
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    return (await res.json()) as RoomResponse;
  } catch {
    return { ok: false, error: "server_error" };
  }
}

export const roomsApi = {
  create: (game: RoomGame) => call("/api/rooms", { method: "POST", body: JSON.stringify({ game }) }),
  get: (code: string) => call(`/api/rooms/${code}`),
  join: (code: string, body: { name: string; avatarColor: string; consent: boolean }) =>
    call(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ ...body, deviceId: getDeviceId() }) }),
  host: (code: string, action: HostAction) => call(`/api/rooms/${code}/host`, { method: "POST", body: JSON.stringify(action) }),
};

const CONSENT_KEY = "sahra:consent";
export function hasConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // ignore
  }
}
