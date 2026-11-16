import "server-only";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Analytics event names (spec section 10). */
export type EventName =
  | "room_created"
  | "player_joined"
  | "game_started"
  | "question_answered"
  | "game_finished"
  | "share_clicked"
  | "share_image_generated"
  | "play_again_clicked"
  | "prompt_answered"
  | "prompt_skipped"
  | "question_reported"
  | "room_ended";

/** Best-effort analytics insert. Never throws: analytics must not break a game. */
export async function logEvent(
  name: EventName,
  props: Record<string, unknown>,
  who: { profileId?: string | null; deviceId?: string | null; roomId?: string | null } = {},
): Promise<void> {
  const db = getServiceSupabase();
  if (!db) return;
  try {
    await db.from("events").insert({
      name,
      props,
      profile_id: who.profileId ?? null,
      device_id: who.deviceId ?? null,
      room_id: who.roomId ?? null,
    });
  } catch {
    // ignore
  }
}
