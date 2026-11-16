import { NextResponse } from "next/server";
import { gameCommand } from "@/lib/rooms/game";
import { gameRoute } from "@/lib/server/gameRoute";

/** Current public game state (host and seated players). */
export async function GET(_request: Request, { params }: RouteContext<"/api/rooms/[code]/game">) {
  const { code } = await params;
  return gameRoute(code, (svc) => svc.get(code));
}

/** Game commands: host drives start/advance/lobby/teams; any member may call "timeup". */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/game">) {
  const { code } = await params;
  const parsed = gameCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return gameRoute(code, (svc) => svc.command(code, parsed.data));
}
