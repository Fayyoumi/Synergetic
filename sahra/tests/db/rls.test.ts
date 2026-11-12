import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, createTestDatabase, failsAs, TEST_DATABASE_URL } from "./helpers";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

describe.skipIf(!TEST_DATABASE_URL)("database: migrations + RLS", () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
    // Users (profiles are created by the auth trigger).
    for (const id of [A, B, C, ADMIN]) await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query("update profiles set is_admin = true where id = $1", [ADMIN]);
    // A and B share a group; C is a stranger.
    const g = await db.query("insert into groups (name, owner_id) values ('الشلة', $1) returning id", [A]);
    await db.query("insert into group_members (group_id, profile_id) values ($1, $2)", [g.rows[0].id, B]);
    // Content.
    await db.query(`insert into questions (id, lang, category, difficulty, question, options, answer_index, source_url, status)
      values ('geo-0001','ar','geo','easy','q',array['a','b','c','d'],0,'https://example.org','approved'),
             ('geo-0002','ar','geo','hard','q2',array['a','b','c','d'],1,'https://example.org','approved')`);
    await db.query(`insert into charades_words (lang, word, category, difficulty, status)
      values ('ar','منسف','أكلات',1,'approved'), ('ar','مسودة','أكلات',1,'draft')`);
    await db.query(`insert into prompts (id, lang, text, status) values ('prompt-0001','ar','p','approved')`);
  }, 60_000);

  afterAll(async () => {
    await drop?.();
  });

  it("enables RLS on every public table", async () => {
    const { rows } = await db.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("creates a profile for every new auth user, Arabic by default", async () => {
    const { rows } = await db.query("select locale, total_xp from profiles where id = $1", [A]);
    expect(rows[0]).toEqual({ locale: "ar", total_xp: 0 });
  });

  it("lets players read themselves and their group, not strangers", async () => {
    const ids = await as(db, A, async () =>
      (await db.query("select id from profiles order by id")).rows.map((r) => r.id),
    );
    expect(ids).toEqual([A, B]);
    const forC = await as(db, C, async () => (await db.query("select id from profiles")).rows.map((r) => r.id));
    expect(forC).toEqual([C]);
  });

  it("lets players edit their name but never XP or admin flags", async () => {
    const updated = await as(db, A, async () =>
      (await db.query("update profiles set display_name = 'ليلى' where id = $1 returning display_name", [A])).rows,
    );
    expect(updated).toEqual([{ display_name: "ليلى" }]);
    expect(await failsAs(db, A, "update profiles set total_xp = 99999 where id = $1", [A])).toMatch(/permission denied/);
    expect(await failsAs(db, A, "update profiles set is_admin = true where id = $1", [A])).toMatch(/permission denied/);
    // Updating someone else's row matches nothing.
    const other = await as(db, A, async () =>
      (await db.query("update profiles set display_name = 'x' where id = $1", [C])).rowCount,
    );
    expect(other).toBe(0);
  });

  it("hides the question bank (and its answers) from players, not from admins", async () => {
    expect(await as(db, A, async () => (await db.query("select * from questions")).rowCount)).toBe(0);
    expect(await as(db, null, async () => (await db.query("select * from questions")).rowCount)).toBe(0);
    expect(await as(db, ADMIN, async () => (await db.query("select * from questions")).rowCount)).toBe(2);
  });

  it("shows only approved charades words to anyone", async () => {
    const words = await as(db, null, async () => (await db.query("select word from charades_words")).rows);
    expect(words).toEqual([{ word: "منسف" }]);
  });

  it("blocks players from writing scores, answers, rooms or events", async () => {
    const g = await db.query("insert into games (profile_id, type) values ($1, 'trivia_classic') returning id", [A]);
    const gameId = g.rows[0].id;
    expect(
      await failsAs(db, A, "insert into scores (game_id, profile_id, points, xp) values ($1, $2, 9999, 999)", [gameId, A]),
    ).toMatch(/row-level security/);
    expect(
      await failsAs(
        db,
        A,
        "insert into answers (game_id, question_id, profile_id, correct, time_left, points) values ($1,'geo-0001',$2,true,15,150)",
        [gameId, A],
      ),
    ).toMatch(/row-level security/);
    expect(await failsAs(db, A, "insert into rooms (code) values ('1234')")).toMatch(/row-level security/);
    expect(await failsAs(db, null, "insert into events (name) values ('x')")).toMatch(/row-level security/);
  });

  it("lets a player report a question as themselves only", async () => {
    const n = await as(db, A, async () =>
      (await db.query("insert into question_reports (question_id, reporter_profile_id) values ('geo-0001', $1)", [A])).rowCount,
    );
    expect(n).toBe(1);
    expect(
      await failsAs(db, A, "insert into question_reports (question_id, reporter_profile_id) values ('geo-0001', $1)", [B]),
    ).toMatch(/row-level security/);
  });

  describe("rooms", () => {
    let roomId: string;
    let seatA: string;
    let seatC: string;

    beforeAll(async () => {
      roomId = (await db.query("insert into rooms (code, host_profile_id) values ('4827', $1) returning id", [B])).rows[0].id;
      seatA = (
        await db.query(
          "insert into room_players (room_id, profile_id, guest_device_id, display_name) values ($1,$2,'dev-a','ليلى') returning id",
          [roomId, A],
        )
      ).rows[0].id;
      seatC = (
        await db.query(
          "insert into room_players (room_id, profile_id, guest_device_id, display_name) values ($1,$2,'dev-c','كريم') returning id",
          [roomId, C],
        )
      ).rows[0].id;
      await db.query(
        "insert into prompt_answers (room_id, room_player_id, prompt_id, answer_text) values ($1,$2,'prompt-0001','سر ليلى')",
        [roomId, seatA],
      );
    });

    it("keeps codes unique among active rooms only", async () => {
      await expect(db.query("insert into rooms (code) values ('4827')")).rejects.toThrow(/rooms_active_code/);
      await db.query("insert into rooms (code, status) values ('4827', 'ended')");
    });

    it("requires the 18+ confirmation for roast mood", async () => {
      await expect(db.query("insert into rooms (code, mood) values ('1111', 'roast')")).rejects.toThrow(/roast_needs_confirmation/);
    });

    it("lets seated players see the room and the seats, not outsiders", async () => {
      expect(await as(db, C, async () => (await db.query("select * from room_players")).rowCount)).toBe(2);
      await db.query("insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000ee')");
      expect(
        await as(db, "00000000-0000-0000-0000-0000000000ee", async () => (await db.query("select * from rooms")).rowCount),
      ).toBe(0);
    });

    it("keeps secret prompt answers private to their author", async () => {
      expect(await as(db, A, async () => (await db.query("select * from prompt_answers")).rowCount)).toBe(1);
      expect(await as(db, C, async () => (await db.query("select * from prompt_answers")).rowCount)).toBe(0);
      // Even the host can't read them directly; the host's server route does.
      expect(await as(db, B, async () => (await db.query("select * from prompt_answers")).rowCount)).toBe(0);
    });

    it("rejects self-votes", async () => {
      const g = (await db.query("insert into games (room_id, type) values ($1, 'who_among_us') returning id", [roomId])).rows[0].id;
      await expect(
        db.query("insert into votes (game_id, round, voter_id, target_id) values ($1, 1, $2, $2)", [g, seatA]),
      ).rejects.toThrow(/no_self_vote/);
      await db.query("insert into votes (game_id, round, voter_id, target_id) values ($1, 1, $2, $3)", [g, seatA, seatC]);
    });
  });

  it("refuses approved questions without a source", async () => {
    await expect(
      db.query(`insert into questions (id, lang, category, difficulty, question, options, answer_index, status)
        values ('sci-0099','ar','sci','easy','q',array['a','b','c','d'],0,'approved')`),
    ).rejects.toThrow(/approved_needs_source/);
  });

  describe("nightly maintenance", () => {
    it("deletes expired prompt answers but keeps saved and fresh ones", async () => {
      const room = (await db.query("insert into rooms (code) values ('7777') returning id")).rows[0].id;
      const seat = (
        await db.query("insert into room_players (room_id, guest_device_id, display_name) values ($1,'d','x') returning id", [room])
      ).rows[0].id;
      await db.query(
        `insert into prompt_answers (room_id, room_player_id, prompt_id, answer_text, delete_after, saved_by_group) values
         ($1,$2,'prompt-0001','old', now() - interval '1 day', false),
         ($1,$2,'prompt-0001','saved', now() - interval '1 day', true),
         ($1,$2,'prompt-0001','fresh', now() + interval '1 day', false)`,
        [room, seat],
      );
      expect((await db.query("select purge_expired_prompt_answers() as n")).rows[0].n).toBe(1);
      const left = (await db.query("select answer_text from prompt_answers where room_id = $1 order by answer_text", [room])).rows;
      expect(left.map((r) => r.answer_text)).toEqual(["fresh", "saved"]);
    });

    it("recalibrates difficulty after 50 answers and logs the change", async () => {
      await db.query(`insert into questions (id, lang, category, difficulty, question, options, answer_index, source_url, status, times_shown, times_correct) values
        ('cal-0001','ar','sci','hard','too easy',array['a','b','c','d'],0,'https://e.org','approved',100,90),
        ('cal-0002','ar','sci','easy','too hard',array['a','b','c','d'],0,'https://e.org','approved',60,10),
        ('cal-0003','ar','sci','medium','few answers',array['a','b','c','d'],0,'https://e.org','approved',49,49),
        ('cal-0004','ar','sci','easy','already easiest',array['a','b','c','d'],0,'https://e.org','approved',80,80),
        ('cal-0005','ar','sci','hard','draft',array['a','b','c','d'],0,'https://e.org','draft',100,100)`);
      const result = (await db.query("select nightly_maintenance() as r")).rows[0].r;
      expect(result.questions_recalibrated).toBe(2);
      const rows = (await db.query("select id, difficulty, times_shown from questions where id like 'cal-%' order by id")).rows;
      expect(rows).toEqual([
        { id: "cal-0001", difficulty: "medium", times_shown: 0 },
        { id: "cal-0002", difficulty: "medium", times_shown: 0 },
        { id: "cal-0003", difficulty: "medium", times_shown: 49 },
        { id: "cal-0004", difficulty: "easy", times_shown: 80 },
        { id: "cal-0005", difficulty: "hard", times_shown: 100 },
      ]);
      const log = (await db.query("select question_id, from_difficulty, to_difficulty from difficulty_changes order by question_id")).rows;
      expect(log).toEqual([
        { question_id: "cal-0001", from_difficulty: "hard", to_difficulty: "medium" },
        { question_id: "cal-0002", from_difficulty: "easy", to_difficulty: "medium" },
      ]);
    });

    it("keeps nightly functions away from players", async () => {
      expect(await failsAs(db, A, "select nightly_maintenance()")).toMatch(/permission denied/);
    });
  });

  it("deletes a player's data when their account is deleted", async () => {
    const D = "00000000-0000-0000-0000-0000000000dd";
    await db.query("insert into auth.users (id) values ($1)", [D]);
    const game = (await db.query("insert into games (profile_id, type) values ($1,'trivia_classic') returning id", [D])).rows[0].id;
    await db.query(
      "insert into answers (game_id, question_id, profile_id, correct, time_left, points) values ($1,'geo-0001',$2,true,10,133)",
      [game, D],
    );
    const room = (await db.query("insert into rooms (code) values ('5555') returning id")).rows[0].id;
    const seat = (
      await db.query("insert into room_players (room_id, profile_id, display_name) values ($1,$2,'د') returning id", [room, D])
    ).rows[0].id;
    await db.query(
      "insert into prompt_answers (room_id, room_player_id, prompt_id, answer_text) values ($1,$2,'prompt-0001','سر')",
      [room, seat],
    );
    await db.query("insert into events (name, profile_id) values ('game_finished', $1)", [D]);

    await db.query("delete from auth.users where id = $1", [D]);

    const count = async (sql: string) => Number((await db.query(sql, [D])).rows[0].n);
    expect(await count("select count(*) n from profiles where id = $1")).toBe(0);
    expect(await count("select count(*) n from answers where profile_id = $1")).toBe(0);
    expect(await count("select count(*) n from room_players where profile_id = $1")).toBe(0);
    expect(Number((await db.query("select count(*) n from prompt_answers where room_player_id = $1", [seat])).rows[0].n)).toBe(0);
    // Analytics rows stay but lose the link to the person.
    expect(await count("select count(*) n from events where profile_id = $1")).toBe(0);
  });
});
