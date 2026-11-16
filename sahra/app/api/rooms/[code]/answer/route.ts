import { NextResponse } from "next/server";
import { answerRequest } from "@/lib/rooms/game";
import { gameRoute } from "@/lib/server/gameRoute";

/** A phone's answer to the current question (timed by the server on arrival). */
export async function POST(request: Request, { params }: RouteContext<"/api/rooms/[code]/answer">) {
  const { code } = await params;
  const parsed = answerRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  return gameRoute(code, (svc) => svc.answer(code, parsed.data));
}
