import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createTestDatabase, failsAs, TEST_DATABASE_URL } from "./helpers";

const P = "00000000-0000-0000-0000-0000000000a1";

describe.skipIf(!TEST_DATABASE_URL)("database: solo trivia functions", () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
    await db.query("insert into auth.users (id) values ($1)", [P]);
    await db.query(`insert into questions (id, lang, category, difficulty, question, options, answer_index, source_url, status)
      values ('geo-0001','ar','geo','easy','q',array['a','b','c','d'],0,'https://e.org','approved')`);
  }, 60_000);
  afterAll(async () => drop?.());

  const newGame = async () =>
    (await db.query("insert into games (profile_id, type, progress) values ($1, 'trivia_classic', '{}') returning id", [P])).rows[0].id as string;

  const answer = { question_id: "geo-0001", question_index: 0, choice_index: 0, correct: true, time_left: 12, points: 140 };

  it("commits a step and records the answer and question counters", async () => {
    const g = await newGame();
    const ok = await db.query("select solo_commit($1, 0, '{\"step\":1}', $2) as ok", [g, JSON.stringify(answer)]);
    expect(ok.rows[0].ok).toBe(true);
    expect((await db.query("select version, progress from games where id = $1", [g])).rows[0]).toEqual({ version: 1, progress: { step: 1 } });
    expect((await db.query("select points, correct from answers where game_id = $1", [g])).rows).toEqual([{ points: 140, correct: true }]);
    expect((await db.query("select times_shown, times_correct from questions where id = 'geo-0001'")).rows[0]).toEqual({ times_shown: 1, times_correct: 1 });
  });

  it("refuses a stale version, so a replayed request can't score twice", async () => {
    const g = await newGame();
    await db.query("select solo_commit($1, 0, '{}', $2)", [g, JSON.stringify(answer)]);
    const replay = await db.query("select solo_commit($1, 0, '{}', $2) as ok", [g, JSON.stringify(answer)]);
    expect(replay.rows[0].ok).toBe(false);
    expect(Number((await db.query("select count(*) n from answers where game_id = $1", [g])).rows[0].n)).toBe(1);
  });

  it("finishes once: score, XP and streak; later commits are refused", async () => {
    const g = await newGame();
    const before = (await db.query("select total_xp from profiles where id = $1", [P])).rows[0].total_xp;
    const fin = await db.query(
      "select solo_finish($1, 0, '{\"phase\":\"finished\"}', 1234, 123, array['first_round'], 3, 4, '2026-11-16') as ok",
      [g],
    );
    expect(fin.rows[0].ok).toBe(true);
    const again = await db.query("select solo_finish($1, 1, '{}', 1234, 123, array['first_round'], 3, 4, '2026-11-16') as ok", [g]);
    expect(again.rows[0].ok).toBe(false);
    expect((await db.query("select solo_commit($1, 1, '{}') as ok", [g])).rows[0].ok).toBe(false);

    const profile = (await db.query("select total_xp, current_streak, longest_streak, last_played_on::text from profiles where id = $1", [P])).rows[0];
    expect(profile).toEqual({ total_xp: before + 123, current_streak: 3, longest_streak: 4, last_played_on: "2026-11-16" });
    expect((await db.query("select points, xp, badges from scores where game_id = $1", [g])).rows).toEqual([
      { points: 1234, xp: 123, badges: ["first_round"] },
    ]);
  });

  it("allows only one daily challenge per player per day", async () => {
    await db.query("insert into games (profile_id, type, settings) values ($1, 'trivia_daily', '{\"date\":\"2026-11-16\"}')", [P]);
    await expect(
      db.query("insert into games (profile_id, type, settings) values ($1, 'trivia_daily', '{\"date\":\"2026-11-16\"}')", [P]),
    ).rejects.toThrow(/games_one_daily_per_day/);
    await db.query("insert into games (profile_id, type, settings) values ($1, 'trivia_daily', '{\"date\":\"2026-11-17\"}')", [P]);
  });

  it("keeps the commit/finish functions and the round plan away from players", async () => {
    const g = await newGame();
    expect(await failsAs(db, P, "select solo_commit($1, 0, '{}')", [g])).toMatch(/permission denied/);
    expect(await failsAs(db, P, "select solo_finish($1, 0, '{}', 1, 1, '{}', 1, 1, '2026-11-16')", [g])).toMatch(/permission denied/);
    expect(await failsAs(db, P, "select progress from games where id = $1", [g])).toMatch(/permission denied/);
  });
});
