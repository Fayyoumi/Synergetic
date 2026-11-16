import { NextResponse } from "next/server";
import { roomCode } from "@/lib/rooms/api";
import { promptAnswerRequest } from "@/lib/rooms/game";
import { serverContext } from "@/lib/server/auth";
import { RoomGameService } from "@/lib/server/roomGame";
import { WhoGame } from "@/lib/server/whoGame";

async function context(code: string) {
  const ctx = await serverContext();
  if (!ctx.ok) return { error: NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }) };
  if (!roomCode.safeParse(code).success) return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  const svc = new RoomGameService(ctx.service, ctx.userId);
  const room = await svc.load(code);
  if (!room) return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  return { who: new WhoGame(svc), room };
}

/** The secret prompts for this player tonight, with their progress. */
export async function GET(_request: Request, { params }: RouteContext<"/api/rooms/[code]/prompts">) {
  const { code } = await params;
  const c = await context(code);
  if ("error" in c) return c.error;
  const r = await c.who.prompts(c.room);
  return NextResponse.json(r, { status: r.ok ? 200 : 403 });
}

/** Answer (or skip) one secret prompt. Answers are filtered, private to tonight's room, and deleted after 30 days. */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/prompts">) {
  const { code } = await params;
  const parsed = promptAnswerRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const c = await context(code);
  if ("error" in c) return c.error;
  try {
    const r = await c.who.answerPrompt(c.room, parsed.data);
    return NextResponse.json(r, { status: r.ok ? 200 : r.error === "bad_request" ? 400 : 403 });
  } catch (e) {
    console.error("prompts api", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
