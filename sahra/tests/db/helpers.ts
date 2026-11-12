import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Postgres used for migration/RLS tests. Set TEST_DATABASE_URL to any Postgres 15+
 * superuser connection (CI uses a service container). Tests are skipped without it.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = path.resolve(__dirname, "../..");

/** Creates a fresh database, applies the Supabase stub and every migration. */
export async function createTestDatabase(): Promise<{ client: Client; drop: () => Promise<void> }> {
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  const name = `sahra_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`create database ${name}`);

  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  await client.query(readFileSync(path.join(root, "tests/db/supabase-stub.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(path.join(dir, file), "utf8"));
  }

  return {
    client,
    drop: async () => {
      await client.end();
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

/**
 * Runs `fn` inside a transaction as a Supabase role, then rolls back.
 * uid = null runs as `anon`.
 */
export async function as<T>(
  client: Client,
  uid: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

/** Like `as`, but expects the statement to fail; returns the error message. */
export async function failsAs(client: Client, uid: string | null, sql: string, params: unknown[] = []) {
  try {
    await as(client, uid, () => client.query(sql, params));
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected failure: ${sql}`);
}
