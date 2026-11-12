import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { as, createTestDatabase, TEST_DATABASE_URL } from "./helpers";

const seed = readFileSync(path.resolve(__dirname, "../../supabase/seed.sql"), "utf8");

describe.skipIf(!TEST_DATABASE_URL)("database: seed.sql", () => {
  let db: Client;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ client: db, drop } = await createTestDatabase());
  }, 60_000);
  afterAll(async () => drop?.());

  it("loads the seed content", async () => {
    await db.query(seed);
    const n = async (sql: string) => Number((await db.query(sql)).rows[0].n);
    expect(await n("select count(*) n from questions where status = 'approved'")).toBe(12);
    expect(await n("select count(*) n from charades_words")).toBe(15);
    expect(await n("select count(*) n from prompts")).toBe(5);
    expect(await n("select count(*) n from traits where status = 'approved'")).toBe(5);
  });

  it("is idempotent and never downgrades an admin's approval", async () => {
    await db.query("update traits set status = 'approved' where id = 'trait-0010'");
    await db.query("update questions set times_shown = 7 where id = 'geo-0001'");
    await db.query(seed);
    expect((await db.query("select status from traits where id = 'trait-0010'")).rows[0].status).toBe("approved");
    // Play counters survive a re-import.
    expect((await db.query("select times_shown from questions where id = 'geo-0001'")).rows[0].times_shown).toBe(7);
    expect(Number((await db.query("select count(*) n from questions")).rows[0].n)).toBe(24);
  });

  it("exposes approved prompts, but not drafts, to guests", async () => {
    const traits = await as(db, null, async () => (await db.query("select id from traits")).rowCount);
    expect(traits).toBe(6); // 5 seeded approvals + the one approved above
  });
});
