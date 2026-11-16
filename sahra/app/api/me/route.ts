import { NextResponse } from "next/server";
import blocklist from "@/content/blocklist.json";
import { createTextFilter } from "@/lib/content/textFilter";
import { localDate, visibleDayStreak } from "@/lib/game/dayStreak";
import { isMinor, profilePatch, type ProfileView } from "@/lib/profile/api";
import { serverContext } from "@/lib/server/auth";
import { getServerSupabase } from "@/lib/supabase/server";

const filterText = createTextFilter(blocklist);

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_color: string;
  locale: "ar" | "en";
  birth_year: number | null;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_played_on: string | null;
};

async function loadProfile(userId: string): Promise<ProfileView | null> {
  const db = await getServerSupabase(); // as the user: RLS applies
  if (!db) return null;
  const [{ data: profile }, { data: scores }, { data: auth }, { data: daily }] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, avatar_color, locale, birth_year, total_xp, current_streak, longest_streak, last_played_on")
      .eq("id", userId)
      .single<ProfileRow>(),
    db.from("scores").select("badges").eq("profile_id", userId),
    db.auth.getUser(),
    db
      .from("games")
      .select("id")
      .eq("profile_id", userId)
      .eq("type", "trivia_daily")
      .eq("settings->>date", localDate(new Date()))
      .not("ended_at", "is", null)
      .limit(1),
  ]);
  if (!profile) return null;
  const today = localDate(new Date());
  const badges = [...new Set((scores ?? []).flatMap((s) => (s.badges as string[]) ?? []))];
  return {
    id: profile.id,
    isGuest: auth.user?.is_anonymous ?? true,
    displayName: profile.display_name,
    nameFlagged: false,
    avatarColor: profile.avatar_color,
    locale: profile.locale,
    birthYear: profile.birth_year,
    isMinor: isMinor(profile.birth_year),
    totalXp: profile.total_xp,
    dayStreak: visibleDayStreak(
      { current: profile.current_streak, longest: profile.longest_streak, lastPlayedOn: profile.last_played_on },
      today,
    ),
    longestStreak: profile.longest_streak,
    gamesPlayed: scores?.length ?? 0,
    badges,
    playedToday: profile.last_played_on === today,
    dailyDoneToday: (daily?.length ?? 0) > 0,
  };
}

export async function GET() {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const profile = await loadProfile(ctx.userId);
  if (!profile) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}

/** Updates the player's own editable fields. Names go through the profanity filter. */
export async function PATCH(request: Request) {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const parsed = profilePatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const patch = { ...parsed.data };
  let nameFlagged = false;
  if (patch.display_name !== undefined) {
    const filtered = filterText(patch.display_name);
    patch.display_name = filtered.text;
    nameFlagged = filtered.flagged;
  }
  const db = await getServerSupabase();
  const { error } = await db!.from("profiles").update(patch).eq("id", ctx.userId);
  if (error) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  const profile = await loadProfile(ctx.userId);
  return NextResponse.json({ ok: true, profile: profile && { ...profile, nameFlagged } });
}

/** "Delete my data": removes the account; the database cascades to everything personal. */
export async function DELETE() {
  const ctx = await serverContext();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { error } = await ctx.service.auth.admin.deleteUser(ctx.userId);
  if (error) return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  const db = await getServerSupabase();
  await db?.auth.signOut();
  return NextResponse.json({ ok: true });
}
