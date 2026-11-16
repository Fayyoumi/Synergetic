import { NextResponse } from "next/server";
import { voteRequest } from "@/lib/rooms/game";
import { gameRoute } from "@/lib/server/gameRoute";
import { WhoGame } from "@/lib/server/whoGame";

/** A phone's vote in "Who among us?" (one per round, never for yourself). */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/vote">) {
  const { code } = await params;
  const parsed = voteRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return gameRoute(code, async (svc) => {
    const room = await svc.load(code);
    if (!room || room.game !== "who_among_us") return { ok: false, error: "not_playing" };
    return new WhoGame(svc).vote(room, parsed.data);
  });
}
