import { NextResponse } from "next/server";
import { roomCode } from "@/lib/rooms/api";
import type { NightView } from "@/lib/rooms/night";
import { serverContext } from "@/lib/server/auth";

/**
 * The night's summary (totals and titles). Available to the host and the
 * players who were there, also after the room has ended.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/rooms/[code]/night">) {
  const { code } = await params;
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  if (!roomCode.safeParse(code).success) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const db = ctx.service;
  const { data: room } = await db
    .from("rooms")
    .select("id, code, status, host_profile_id")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; code: string; status: NightView["status"]; host_profile_id: string | null }>();
  if (!room) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: seats } = await db.from("room_players").select("id, profile_id, display_name, avatar_color").eq("room_id", room.id);
  const mine = seats?.find((s) => s.profile_id === ctx.userId) ?? null;
  if (room.host_profile_id !== ctx.userId && !mine) return NextResponse.json({ ok: false, error: "not_member" }, { status: 403 });

  const [{ data: games }, { data: titles }] = await Promise.all([
    db.from("games").select("id").eq("room_id", room.id).not("ended_at", "is", null),
    db.from("titles").select("id, room_player_id, title_text").eq("room_id", room.id).order("created_at"),
  ]);
  const gameIds = (games ?? []).map((g) => g.id as string);
  const { data: scores } = gameIds.length ? await db.from("scores").select("room_player_id, points").in("game_id", gameIds) : { data: [] };
  const totals = new Map<string, number>();
  for (const s of scores ?? []) totals.set(s.room_player_id as string, (totals.get(s.room_player_id as string) ?? 0) + (s.points as number));
  const nameOf = (id: string) => seats?.find((s) => s.id === id)?.display_name ?? "?";

  const view: NightView = {
    code: room.code,
    status: room.status,
    gamesPlayed: gameIds.length,
    players: (seats ?? [])
      .map((s) => ({ seatId: s.id as string, name: s.display_name as string, color: s.avatar_color as string, points: totals.get(s.id as string) ?? 0 }))
      .sort((a, b) => b.points - a.points),
    titles: (titles ?? []).map((t) => ({ id: t.id as string, seatId: t.room_player_id as string, name: nameOf(t.room_player_id as string), title: t.title_text as string })),
    mySeatId: (mine?.id as string | undefined) ?? null,
  };
  return NextResponse.json({ ok: true, night: view });
}
