import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, createTestDatabase, TEST_DATABASE_URL } from "./helpers";

const HOST = "00000000-0000-0000-0000-0000000000b1";
const PLAYER = "00000000-0000-0000-0000-0000000000b2";
const OTHER = "00000000-0000-0000-0000-0000000000b3";
const OUTSIDER = "00000000-0000-0000-0000-0000000000b4";

describe.skipIf(!TEST_DATABASE_URL)("database: realtime room topics", () => {
  let db: Client;
  let drop: () => Promise<void>;
  let seat: string;
  let otherSeat: string;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
    for (const id of [HOST, PLAYER, OTHER, OUTSIDER]) await db.query("insert into auth.users (id) values ($1)", [id]);
    const room = (await db.query("insert into rooms (code, host_profile_id, game) values ('4242', $1, 'charades') returning id", [HOST])).rows[0].id;
    seat = (
      await db.query("insert into room_players (room_id, profile_id, guest_device_id, display_name) values ($1,$2,'d1','ليلى') returning id", [room, PLAYER])
    ).rows[0].id;
    otherSeat = (
      await db.query("insert into room_players (room_id, profile_id, guest_device_id, display_name) values ($1,$2,'d2','كريم') returning id", [room, OTHER])
    ).rows[0].id;
  }, 60_000);
  afterAll(async () => drop?.());

  const allowed = (uid: string, topic: string) =>
    as(db, uid, async () => (await db.query("select public.can_use_room_topic($1) as ok", [topic])).rows[0].ok as boolean);

  it("lets the host and seated players use the room channel, nobody else", async () => {
    expect(await allowed(HOST, "room:4242")).toBe(true);
    expect(await allowed(PLAYER, "room:4242")).toBe(true);
    expect(await allowed(OUTSIDER, "room:4242")).toBe(false);
  });

  it("keeps each player's private channel to that player only (not even the host)", async () => {
    expect(await allowed(PLAYER, `room:4242:p:${seat}`)).toBe(true);
    expect(await allowed(OTHER, `room:4242:p:${seat}`)).toBe(false);
    expect(await allowed(HOST, `room:4242:p:${seat}`)).toBe(false);
    expect(await allowed(OTHER, `room:4242:p:${otherSeat}`)).toBe(true);
  });

  it("rejects malformed topics and unknown rooms", async () => {
    for (const topic of ["room:9999", "room", "lobby:4242", "room:4242:x:abc", `room:4242:p:${seat}:extra`, ""]) {
      expect(await allowed(PLAYER, topic), topic).toBe(false);
    }
  });

  it("shuts removed players and ended rooms out", async () => {
    await db.query("update room_players set removed_at = now() where id = $1", [otherSeat]);
    expect(await allowed(OTHER, "room:4242")).toBe(false);
    await db.query("update rooms set status = 'ended' where code = '4242'");
    expect(await allowed(HOST, "room:4242")).toBe(false);
    expect(await allowed(PLAYER, "room:4242")).toBe(false);
  });
});
