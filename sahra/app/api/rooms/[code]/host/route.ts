import { NextResponse } from "next/server";
import { hostActionRequest } from "@/lib/rooms/api";
import { roomRoute } from "@/lib/server/roomRoute";

/** Host-only actions: mood, game, remove a player, end the night. */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/host">) {
  const { code } = await params;
  const parsed = hostActionRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return roomRoute(code, (svc, c) => svc.hostAction(c, parsed.data));
}
