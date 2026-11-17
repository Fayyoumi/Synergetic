import { NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/server/events";
import { serverContext } from "@/lib/server/auth";
import { roomCode } from "@/lib/rooms/api";

/** The only analytics events a client may report itself; everything else is logged by the server. */
const clientEvent = z.object({
  name: z.enum(["share_clicked", "share_image_generated"]),
  props: z.record(z.string(), z.union([z.string().max(60), z.number(), z.boolean()])).default({}),
  roomCode: roomCode.optional(),
});

export async function POST(request: Request) {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const parsed = clientEvent.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  let roomId: string | null = null;
  if (parsed.data.roomCode) {
    const { data } = await ctx.service
      .from("rooms")
      .select("id")
      .eq("code", parsed.data.roomCode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    roomId = data?.id ?? null;
  }
  await logEvent(parsed.data.name, parsed.data.props, { profileId: ctx.userId, roomId });
  return NextResponse.json({ ok: true });
}
