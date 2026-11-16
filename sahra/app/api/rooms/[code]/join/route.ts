import { NextResponse } from "next/server";
import { joinRoomRequest } from "@/lib/rooms/api";
import { roomRoute } from "@/lib/server/roomRoute";

/** Takes (or gets back) a seat in the room. */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/join">) {
  const { code } = await params;
  const parsed = joinRoomRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return roomRoute(code, (svc, c) => svc.join(c, parsed.data));
}
