import { NextResponse } from "next/server";
import { soloRequest, type SoloResponse } from "@/lib/solo/api";
import { serverContext } from "@/lib/server/auth";
import { SoloService } from "@/lib/server/solo";

/** All solo trivia steps: start, state, answer, fifty, next, report. */
export async function POST(request: Request) {
  // Answer timing starts from arrival, not after the auth and database round trips.
  const receivedAt = Date.now();
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json<SoloResponse>({ ok: false, error: ctx.error }, { status: ctx.status });

  const parsed = soloRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json<SoloResponse>({ ok: false, error: "bad_request" }, { status: 400 });

  try {
    const result = await new SoloService(ctx.service, ctx.userId, Date.now, receivedAt).handle(parsed.data);
    const status = result.ok ? 200 : result.error === "not_found" ? 404 : result.error === "no_questions" ? 404 : 409;
    return NextResponse.json<SoloResponse>(result, { status });
  } catch (e) {
    console.error("solo api", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
