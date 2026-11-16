import { z } from "zod";
import { AVATAR_COLOURS } from "@/lib/profile/api";
import type { TeamPublicView } from "./game";

/** Room HTTP API contract, shared by client and server. */

export const MAX_PLAYERS = 12;
export const ROOM_GAMES = ["trivia_team", "charades", "who_among_us"] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];
export const MOODS = ["family", "friends", "roast"] as const;
export type RoomMood = (typeof MOODS)[number];

export const roomCode = z.string().regex(/^[0-9]{4}$/);

export const createRoomRequest = z.object({ game: z.enum(ROOM_GAMES) });

export const joinRoomRequest = z.object({
  name: z.string().trim().min(1).max(24),
  avatarColor: z.enum(AVATAR_COLOURS),
  deviceId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  consent: z.boolean(),
});

export const hostActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mood"), mood: z.enum(MOODS), roastConfirmed: z.boolean().default(false) }),
  z.object({ action: z.literal("game"), game: z.enum(ROOM_GAMES) }),
  z.object({ action: z.literal("remove"), seatId: z.uuid() }),
  z.object({ action: z.literal("end") }),
]);
export type HostAction = z.input<typeof hostActionRequest>;

export type Seat = {
  id: string;
  name: string;
  color: string;
  team: 1 | 2 | null;
  joinedAt: string;
};

export type RoomView = {
  code: string;
  status: "lobby" | "playing" | "ended";
  mood: RoomMood;
  game: RoomGame | null;
  seats: Seat[];
  full: boolean;
  /** Present for the host and seated players only. */
  role: "host" | "player" | "visitor";
  mySeatId: string | null;
};

export type RoomErrorCode =
  | "unconfigured"
  | "unauthenticated"
  | "bad_request"
  | "not_found"
  | "ended"
  | "full"
  | "consent_required"
  | "removed"
  | "minor_mood"
  | "minor_seated"
  | "roast_unconfirmed"
  | "not_host"
  | "server_error";

export type RoomResponse = { ok: true; room: RoomView } | { ok: false; error: RoomErrorCode };

/** Realtime topics. */
export const roomTopic = (code: string) => `room:${code}`;
export const seatTopic = (code: string, seatId: string) => `room:${code}:p:${seatId}`;

/** Broadcast events the server sends on the room topic (protocol v1). */
export const roomBroadcast = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("room"), room: z.custom<Omit<RoomView, "role" | "mySeatId">>() }),
  z.object({ v: z.literal(1), type: z.literal("removed"), seatId: z.string() }),
  /** Full public game state after every change. */
  z.object({ v: z.literal(1), type: z.literal("state"), game: z.custom<TeamPublicView>((x) => typeof x === "object" && x !== null) }),
  /** A seat answered the current question (who, never what). */
  z.object({ v: z.literal(1), type: z.literal("answered"), seatId: z.string(), index: z.number() }),
]);
export type RoomBroadcast = z.infer<typeof roomBroadcast>;

/** What each client publishes as its presence. */
export const presencePayload = z.object({
  v: z.literal(1),
  role: z.enum(["host", "player"]),
  seatId: z.string().nullable(),
  /** "active" = app in the foreground; "away" = switched app / locked screen. */
  status: z.enum(["active", "away"]),
  since: z.number(),
});
export type PresencePayload = z.infer<typeof presencePayload>;
