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

describe.skipIf(!TEST_DATABASE_URL)("database: room game state", () => {
  let db: Client;
  let drop: () => Promise<void>;
  let room: string;
  let seat: string;
  let game: string;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
    for (const id of [HOST, PLAYER]) await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(`insert into questions (id, lang, category, difficulty, question, options, answer_index, source_url, status)
      values ('geo-0001','ar','geo','easy','q',array['a','b','c','d'],0,'https://e.org','approved')`);
    room = (await db.query("insert into rooms (code, host_profile_id, game_state) values ('5151', $1, '{\"secret\":1}') returning id", [HOST])).rows[0].id;
    seat = (await db.query("insert into room_players (room_id, profile_id, display_name) values ($1,$2,'ليلى') returning id", [room, PLAYER])).rows[0].id;
    game = (await db.query("insert into games (room_id, type) values ($1, 'trivia_team') returning id", [room])).rows[0].id;
  }, 60_000);
  afterAll(async () => drop?.());

  it("hides game_state (and pending answers) from everyone but the server", async () => {
    expect(await as(db, PLAYER, async () => (await db.query("select code from rooms")).rows)).toEqual([{ code: "5151" }]);
    await expect(as(db, HOST, () => db.query("select game_state from rooms"))).rejects.toThrow(/permission denied/);
    await db.query("insert into room_pending_answers (game_id, question_index, room_player_id, choice_index, time_left) values ($1,0,$2,0,12)", [game, seat]);
    expect(await as(db, PLAYER, async () => (await db.query("select * from room_pending_answers")).rowCount)).toBe(0);
  });

  it("keeps one pending answer per player per question", async () => {
    await expect(
      db.query("insert into room_pending_answers (game_id, question_index, room_player_id, choice_index, time_left) values ($1,0,$2,1,10)", [game, seat]),
    ).rejects.toThrow(/duplicate key/);
  });

  it("commits state with a version check", async () => {
    const v = (await db.query("select state_version from rooms where id = $1", [room])).rows[0].state_version;
    expect((await db.query("select room_commit($1, $2, '{\"phase\":\"question\"}') ok", [room, v])).rows[0].ok).toBe(true);
    expect((await db.query("select room_commit($1, $2, '{}') ok", [room, v])).rows[0].ok).toBe(false);
  });

  it("records scored answers at the reveal exactly once, and scores + XP at the end", async () => {
    const v = (await db.query("select state_version from rooms where id = $1", [room])).rows[0].state_version;
    const answers = JSON.stringify([
      { question_id: "geo-0001", room_player_id: seat, question_index: 0, choice_index: 0, correct: true, time_left: 12, points: 140 },
    ]);
    expect((await db.query("select room_reveal_commit($1,$2,'{}',$3,$4) ok", [room, v, game, answers])).rows[0].ok).toBe(true);
    expect((await db.query("select room_reveal_commit($1,$2,'{}',$3,$4) ok", [room, v, game, answers])).rows[0].ok).toBe(false);
    expect(Number((await db.query("select count(*) n from answers where game_id = $1", [game])).rows[0].n)).toBe(1);
    expect((await db.query("select profile_id from answers where game_id = $1", [game])).rows[0].profile_id).toBe(PLAYER);

    const scores = JSON.stringify([{ room_player_id: seat, points: 140, xp: 14, badges: ["first_round"] }]);
    expect((await db.query("select room_game_finish($1,$2,'{}',$3,$4) ok", [room, v + 1, game, scores])).rows[0].ok).toBe(true);
    expect((await db.query("select total_xp from profiles where id = $1", [PLAYER])).rows[0].total_xp).toBe(14);
    expect((await db.query("select ended_at is not null as ended from games where id = $1", [game])).rows[0].ended).toBe(true);
  });

  it("keeps the room game functions away from players", async () => {
    await expect(as(db, HOST, () => db.query("select room_commit($1, 0, '{}')", [room]))).rejects.toThrow(/permission denied/);
  });
});
