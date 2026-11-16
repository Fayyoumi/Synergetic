import { NextResponse } from "next/server";
import { roomCode } from "@/lib/rooms/api";
import { serverContext } from "@/lib/server/auth";
import { CharadesGame } from "@/lib/server/charadesGame";
import { RoomGameService } from "@/lib/server/roomGame";
import { WhoGame } from "@/lib/server/whoGame";

/** The caller's private game data (the charades word, for the actor only). Used to re-sync after a reconnect. */
export async function GET(_request: Request, { params }: RouteContext<"/api/rooms/[code]/secret">) {
  const { code } = await params;
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!roomCode.safeParse(code).success) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const svc = new RoomGameService(ctx.service, ctx.userId);
  const room = await svc.load(code);
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const secret =
    room.game === "charades"
      ? await new CharadesGame(svc).secret(room)
      : room.game === "who_among_us"
        ? await new WhoGame(svc).secret(room)
        : null;
  return NextResponse.json({ ok: true, secret });
}
