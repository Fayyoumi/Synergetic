import "server-only";
import { NextResponse } from "next/server";
import { roomCode } from "@/lib/rooms/api";
import type { GameErrorCode } from "@/lib/rooms/game";
import { serverContext } from "./auth";
import { RoomGameService, type GameOutcome } from "./roomGame";

const STATUS: Partial<Record<GameErrorCode, number>> = {
  unconfigured: 503,
  unauthenticated: 401,
  bad_request: 400,
  not_found: 404,
  ended: 410,
  not_host: 403,
  not_member: 403,
  server_error: 500,
};

/** Shared wrapper for room-game route handlers. */
export async function gameRoute(code: string, run: (svc: RoomGameService) => Promise<GameOutcome>): Promise<NextResponse> {
  const receivedAt = Date.now();
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!roomCode.safeParse(code).success) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  try {
    const result = await run(new RoomGameService(ctx.service, ctx.userId, receivedAt));
    return NextResponse.json(result, { status: result.ok ? 200 : (STATUS[result.error] ?? 409) });
  } catch (e) {
    console.error("room game api", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
