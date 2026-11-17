import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, createTestDatabase, failsAs, TEST_DATABASE_URL } from "./helpers";

const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
// Noon in Amman (UTC+3) on a given day, as UTC.
const at = (day: string, hour = 12) => `${day}T${String(hour - 3).padStart(2, "0")}:00:00Z`;

describe.skipIf(!TEST_DATABASE_URL)("database: pilot metrics", () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
    for (let i = 1; i <= 6; i++) await db.query("insert into auth.users (id) values ($1)", [U(i)]);

    // Room A on day 1: 3 players, 2 games (a replay), 90 minutes, 1 share.
    const a = (
      await db.query(
        "insert into rooms (code, host_profile_id, created_at, last_active_at, status) values ('1111', $1, $2, $3, 'ended') returning id",
        [U(1), "2026-11-01T17:00:00Z", "2026-11-01T18:30:00Z"], // 20:00 → 21:30 in Amman
      )
    ).rows[0].id;
    const seatsA: string[] = [];
    for (const i of [2, 3, 4]) {
      seatsA.push((await db.query("insert into room_players (room_id, profile_id, display_name) values ($1,$2,'p') returning id", [a, U(i)])).rows[0].id);
    }
    for (let g = 0; g < 2; g++) {
      const game = (await db.query("insert into games (room_id, type, started_at, ended_at) values ($1,'trivia_team',$2,$2) returning id", [a, at("2026-11-01", 20)])).rows[0].id;
      for (const s of seatsA) await db.query("insert into scores (game_id, room_player_id, points, xp) values ($1,$2,100,10)", [game, s]);
    }
    await db.query("insert into events (name, profile_id, room_id, created_at) values ('share_clicked', $1, $2, $3)", [U(2), a, at("2026-11-01", 21)]);

    // Room B on day 1: 1 player, 1 game, no replay.
    const b = (
      await db.query("insert into rooms (code, created_at, last_active_at) values ('2222', $1, $1) returning id", [at("2026-11-01", 18)])
    ).rows[0].id;
    const seatB = (await db.query("insert into room_players (room_id, profile_id, display_name) values ($1,$2,'p') returning id", [b, U(5)])).rows[0].id;
    const gameB = (await db.query("insert into games (room_id, type, started_at, ended_at) values ($1,'charades',$2,$2) returning id", [b, at("2026-11-01", 18)])).rows[0].id;
    await db.query("insert into scores (game_id, room_player_id, points, xp) values ($1,$2,100,10)", [gameB, seatB]);

    // Solo: U6 first plays on day 1, returns on day 2 (d1) and day 8 (d7). U5 plays day 1 only.
    for (const [pid, day] of [
      [U(6), "2026-11-01"],
      [U(6), "2026-11-02"],
      [U(6), "2026-11-08"],
      [U(5), "2026-11-01"],
    ] as const) {
      await db.query("insert into games (profile_id, type, started_at, ended_at) values ($1,'trivia_classic',$2,$2)", [pid, at(day)]);
    }
  }, 60_000);
  afterAll(async () => drop?.());

  it("computes rooms, players, night length, replay and share rates, and solo returns", async () => {
    const m = (await db.query("select pilot_metrics('2026-11-01', '2026-11-08') as m")).rows[0].m;
    expect(m.totals).toMatchObject({
      rooms: 2,
      avg_players: 2, // (3 + 1) / 2
      replay_rate: 50, // A replayed, B didn't
      share_rate: 25, // 1 sharer of 4 room players who finished a game
      solo_cohort: 2,
      solo_d1: 50,
      solo_d7: 50,
    });
    expect(Number(m.totals.avg_night_minutes)).toBeCloseTo(45, 0); // A 90 min, B 0 min
    const day1 = m.days.find((d: { day: string }) => d.day === "2026-11-01");
    expect(day1).toMatchObject({ rooms_created: 2, replay_rate: 50 });
    expect(m.days).toHaveLength(8);
    expect(m.rooms.find((r: { code: string }) => r.code === "1111")).toMatchObject({ players: 3, games: 2, shares: 1, replayed: true });
  });

  it("is only callable by the server (service role)", async () => {
    expect(await failsAs(db, U(1), "select pilot_metrics('2026-11-01', '2026-11-08')")).toMatch(/permission denied/);
  });

  it("shows only approved Kassa lines to players", async () => {
    await db.query(`insert into kassa_lines (id, lang, event, mood, text, status) values
      ('correct:family:0','ar','correct','family','برافو!','approved'),
      ('correct:family:1','ar','correct','family','مسودة','draft')`);
    const rows = await as(db, null, async () => (await db.query("select id from kassa_lines")).rows);
    expect(rows).toEqual([{ id: "correct:family:0" }]);
  });
});
