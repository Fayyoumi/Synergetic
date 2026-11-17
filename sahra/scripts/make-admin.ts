/**
 * Makes an email address an admin (creates the account if needed) and prints
 * a one-time sign-in link, so it works without email (e.g. locally).
 *
 *   npm run admin:make -- you@example.com
 *
 * Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (.env.local), and
 * SITE_URL for the link (default http://localhost:3000). In production the admin
 * can also sign in normally at /admin with an emailed magic link.
 */
import { createClient } from "@supabase/supabase-js";
import { ensureAdmin } from "../lib/admin/ensureAdmin";

async function main() {
  const email = process.argv[2];
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run admin:make -- you@example.com");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
    process.exit(1);
  }
  const site = process.env.SITE_URL ?? "http://localhost:3000";
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { tokenHash } = await ensureAdmin(db, email);
  console.log(`${email} is now an admin.`);
  console.log(`One-time sign-in link (valid ~1 hour):\n${site}/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/admin`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
