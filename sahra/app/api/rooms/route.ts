import { NextResponse } from "next/server";
import { createRoomRequest } from "@/lib/rooms/api";
import { roomRoute } from "@/lib/server/roomRoute";

/** Creates a room hosted by the caller. */
export async function POST(request: Request) {
  const parsed = createRoomRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return roomRoute(null, (svc) => svc.create(parsed.data.game));
}
