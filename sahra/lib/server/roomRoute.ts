import "server-only";
import { NextResponse } from "next/server";
import type { RoomErrorCode } from "@/lib/rooms/api";
import { roomCode } from "@/lib/rooms/api";
import { serverContext } from "./auth";
import { RoomService, type RoomOutcome } from "./rooms";

const STATUS: Partial<Record<RoomErrorCode, number>> = {
  unconfigured: 503,
  unauthenticated: 401,
  bad_request: 400,
  not_found: 404,
  ended: 410,
  not_host: 403,
  removed: 403,
  server_error: 500,
};

/** Shared wrapper for room route handlers: auth, code check, errors → JSON. */
export async function roomRoute(
  code: string | null,
  run: (svc: RoomService, code: string) => Promise<RoomOutcome>,
): Promise<NextResponse> {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (code !== null && !roomCode.safeParse(code).success) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  try {
    const result = await run(new RoomService(ctx.service, ctx.userId), code ?? "");
    return NextResponse.json(result, { status: result.ok ? 200 : (STATUS[result.error] ?? 409) });
  } catch (e) {
    console.error("rooms api", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
