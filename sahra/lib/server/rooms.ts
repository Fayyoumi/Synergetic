import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import blocklist from "@/content/blocklist.json";
import { createTextFilter } from "@/lib/content/textFilter";
import { isMinor } from "@/lib/profile/api";
import {
  MAX_PLAYERS,
  roomTopic,
  type HostAction,
  type RoomBroadcast,
  type RoomErrorCode,
  type RoomGame,
  type RoomMood,
  type RoomView,
  type Seat,
} from "@/lib/rooms/api";
import { logEvent } from "./events";
import { RoomGameService } from "./roomGame";

const filterName = createTextFilter(blocklist);
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

type RoomRow = {
  id: string;
  code: string;
  host_profile_id: string | null;
  mood: RoomMood;
  status: "lobby" | "playing" | "ended";
  game: RoomGame | null;
  expires_at: string;
};

type SeatRow = {
  id: string;
  profile_id: string | null;
  guest_device_id: string | null;
  display_name: string;
  avatar_color: string;
  team: 1 | 2 | null;
  joined_at: string;
};

export type RoomOutcome = { ok: true; room: RoomView } | { ok: false; error: RoomErrorCode };

const fail = (error: RoomErrorCode): RoomOutcome => ({ ok: false, error });

export class RoomService {
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {}

  // ------------------------------------------------------------- create

  async create(game: RoomGame): Promise<RoomOutcome> {
    // Free the codes of rooms that expired.
    await this.db.from("rooms").update({ status: "ended" }).neq("status", "ended").lt("expires_at", new Date().toISOString());
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(randomInt(0, 10_000)).padStart(4, "0");
      const { data, error } = await this.db
        .from("rooms")
        .insert({ code, host_profile_id: this.userId, game, game_state: { v: 1, phase: "lobby" } })
        .select("id, code, host_profile_id, mood, status, game, expires_at")
        .single<RoomRow>();
      if (!error && data) {
        void logEvent("room_created", { game }, { profileId: this.userId, roomId: data.id });
        return this.view(data);
      }
      if (error?.code !== "23505") throw error; // anything but "code taken"
    }
    return fail("server_error");
  }

  // ------------------------------------------------------------- read

  async get(code: string): Promise<RoomOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    if (room.status === "ended") return fail("ended");
    return this.view(room);
  }

  // ------------------------------------------------------------- join

  async join(
    code: string,
    input: { name: string; avatarColor: string; deviceId: string; consent: boolean },
  ): Promise<RoomOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    if (room.status === "ended") return fail("ended");

    const seats = await this.seats(room.id);
    // Reconnect: the same account, or the same device with the same name, gets its seat back.
    const mine =
      seats.find((s) => s.profile_id === this.userId) ??
      seats.find(
        (s) => s.guest_device_id === input.deviceId && s.display_name.trim().toLowerCase() === input.name.trim().toLowerCase(),
      );
    if (mine) {
      if (mine.profile_id !== this.userId) {
        await this.db.from("room_players").update({ profile_id: this.userId }).eq("id", mine.id);
      }
      await this.touch(room.id);
      return this.view(room);
    }

    // A player the host removed can't come straight back in.
    const { count: removed } = await this.db
      .from("room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("profile_id", this.userId)
      .not("removed_at", "is", null);
    if ((removed ?? 0) > 0) return fail("removed");

    if (!input.consent) return fail("consent_required");
    if (seats.length >= MAX_PLAYERS) return fail("full");

    // Under-18 players only join Family-mood nights.
    const { data: profile } = await this.db.from("profiles").select("birth_year").eq("id", this.userId).maybeSingle();
    if (room.mood !== "family" && isMinor((profile?.birth_year as number | null) ?? null)) return fail("minor_mood");

    const filtered = filterName(input.name);
    const { error } = await this.db.from("room_players").insert({
      room_id: room.id,
      profile_id: this.userId,
      guest_device_id: input.deviceId,
      display_name: filtered.text,
      name_flagged: filtered.flagged,
      avatar_color: input.avatarColor,
      consent_at: new Date().toISOString(),
    });
    if (error) {
      // Same device joined twice at once: the unique index keeps one seat.
      if (error.code === "23505") return this.get(code);
      throw error;
    }
    await this.touch(room.id);
    void logEvent("player_joined", { players: seats.length + 1 }, { profileId: this.userId, deviceId: input.deviceId, roomId: room.id });
    return this.broadcastAndView(room);
  }

  // ------------------------------------------------------------- host actions

  async hostAction(code: string, action: HostAction): Promise<RoomOutcome> {
    const room = await this.load(code);
    if (!room) return fail("not_found");
    if (room.host_profile_id !== this.userId) return fail("not_host");
    if (room.status === "ended") return fail("ended");

    switch (action.action) {
      case "mood": {
        if (action.mood === "roast" && !action.roastConfirmed) return fail("roast_unconfirmed");
        if (action.mood !== "family" && (await this.hasMinor(room.id))) return fail("minor_seated");
        await this.db
          .from("rooms")
          .update({
            mood: action.mood,
            roast_confirmed_at: action.mood === "roast" ? new Date().toISOString() : null,
          })
          .eq("id", room.id);
        break;
      }
      case "game":
        await this.db.from("rooms").update({ game: action.game }).eq("id", room.id);
        break;
      case "remove":
        await this.db
          .from("room_players")
          .update({ removed_at: new Date().toISOString() })
          .eq("id", action.seatId)
          .eq("room_id", room.id);
        await this.send(room.code, { v: 1, type: "removed", seatId: action.seatId });
        await new RoomGameService(this.db, this.userId).removeFromGame(room.id, action.seatId);
        break;
      case "end": {
        await this.db.from("rooms").update({ status: "ended" }).eq("id", room.id);
        const seats = await this.seats(room.id);
        const [{ data: created }, { count: games }] = await Promise.all([
          this.db.from("rooms").select("created_at").eq("id", room.id).single<{ created_at: string }>(),
          this.db.from("games").select("id", { count: "exact", head: true }).eq("room_id", room.id),
        ]);
        void logEvent(
          "room_ended",
          {
            players: seats.length,
            total_duration_sec: created ? Math.round((Date.now() - Date.parse(created.created_at)) / 1000) : null,
            games_played: games ?? 0,
          },
          { profileId: this.userId, roomId: room.id },
        );
        break;
      }
    }
    await this.touch(room.id);
    const fresh = (await this.load(code))!;
    return this.broadcastAndView(fresh);
  }

  // ------------------------------------------------------------- helpers

  private async load(code: string): Promise<RoomRow | null> {
    const { data } = await this.db
      .from("rooms")
      .select("id, code, host_profile_id, mood, status, game, expires_at")
      .eq("code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RoomRow>();
    if (data && data.status !== "ended" && Date.parse(data.expires_at) < Date.now()) {
      await this.db.from("rooms").update({ status: "ended" }).eq("id", data.id);
      return { ...data, status: "ended" };
    }
    return data;
  }

  private async seats(roomId: string): Promise<SeatRow[]> {
    const { data, error } = await this.db
      .from("room_players")
      .select("id, profile_id, guest_device_id, display_name, avatar_color, team, joined_at")
      .eq("room_id", roomId)
      .is("removed_at", null)
      .order("joined_at");
    if (error) throw error;
    return (data ?? []) as SeatRow[];
  }

  private async hasMinor(roomId: string): Promise<boolean> {
    const seats = await this.seats(roomId);
    const ids = seats.map((s) => s.profile_id).filter((x): x is string => !!x);
    if (!ids.length) return false;
    const { data } = await this.db.from("profiles").select("birth_year").in("id", ids);
    return (data ?? []).some((p) => isMinor(p.birth_year as number | null) === true);
  }

  /** Any activity pushes the 6-hour expiry back. */
  private async touch(roomId: string) {
    const now = Date.now();
    await this.db
      .from("rooms")
      .update({ last_active_at: new Date(now).toISOString(), expires_at: new Date(now + ROOM_TTL_MS).toISOString() })
      .eq("id", roomId);
  }

  private async view(room: RoomRow): Promise<RoomOutcome> {
    const seats = await this.seats(room.id);
    const mySeat = seats.find((s) => s.profile_id === this.userId) ?? null;
    const role = room.host_profile_id === this.userId ? "host" : mySeat ? "player" : "visitor";
    return {
      ok: true,
      room: {
        code: room.code,
        status: room.status,
        mood: room.mood,
        game: room.game,
        // Visitors (not yet joined) only learn how many are seated, not who.
        seats: role === "visitor" ? [] : seats.map(toSeat),
        full: seats.length >= MAX_PLAYERS,
        role,
        mySeatId: mySeat?.id ?? null,
      },
    };
  }

  private async broadcastAndView(room: RoomRow): Promise<RoomOutcome> {
    const seats = await this.seats(room.id);
    await this.send(room.code, {
      v: 1,
      type: "room",
      room: {
        code: room.code,
        status: room.status,
        mood: room.mood,
        game: room.game,
        seats: seats.map(toSeat),
        full: seats.length >= MAX_PLAYERS,
      },
    });
    return this.view(room);
  }

  /** Server-side broadcast on the room's private channel (REST, no socket). */
  private async send(code: string, message: RoomBroadcast) {
    const channel = this.db.channel(roomTopic(code), { config: { private: true } });
    try {
      await channel.httpSend(message.type, message);
    } catch (e) {
      console.error("room broadcast failed", e);
    } finally {
      await this.db.removeChannel(channel);
    }
  }
}

function toSeat(s: SeatRow): Seat {
  return { id: s.id, name: s.display_name, color: s.avatar_color, team: s.team, joinedAt: s.joined_at };
}
