# Sahra (سهرة)

Arabic-first party games for Arab gatherings, hosted by Kassa the tea glass.
Next.js 16 + Supabase. Read `../CLAUDE.md` for conventions and `docs/SAHRA_SPEC.md` for the full spec.

> Status: Milestone 3 (rooms). This README grows with each milestone.

### Try a room locally

1. On the laptop (the "TV"): http://localhost:3000/play/group → pick a game. The host screen opens with a QR code and a 4-digit code.
2. On phones on the same Wi-Fi, open `http://<laptop-ip>:3000/join/<code>` (or scan the QR code if it points at a reachable address). To simulate phones on one computer, use separate private windows.
3. Leave the app on a phone, lock it, or close the tab: everyone (host screen and other phones) sees "left the app" or "disconnected", and the host screen counts how many times each player left.

## Run locally

Requirements: Node 20.9+ (22 recommended) and Docker (for the local Supabase).

```bash
cd sahra
npm install
npm run db:start     # local Supabase in Docker: migrations + seed content, writes .env.local
npm run dev
```

Open http://localhost:3000 for Arabic, or http://localhost:3000/en for English. Try **العب الآن → فردي → ليلة الأسئلة**. The design guide is at `/design`.

- `npm run db:stop` stops the local stack; `npm run db:reset` wipes it and re-applies migrations + `supabase/seed.sql`.
- Without Supabase the pages still render, but games show "not connected to its database yet".
- To use a cloud project instead, copy `.env.example` to `.env.local` and fill it in (Project Settings → API).

## Set up Supabase (free tier)

1. Create a project at supabase.com.
2. In Authentication → Sign In / Providers, turn on **Allow anonymous sign-ins**. Leave the **Email** provider on (it's used for magic links).
   In Authentication → Rate Limits, raise **anonymous sign-ins per hour** from 30 to about 150: all phones at one gathering share the venue's Wi-Fi IP.
3. Apply the migrations. Either:
   - with the CLI: `npx supabase login`, then `npx supabase link --project-ref <ref>`, then `npx supabase db push`, or
   - paste each file in `supabase/migrations/` (in order) into the SQL editor.
4. Seed the content. Either:
   - `npm run content:import` (uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`), or
   - paste `supabase/seed.sql` into the SQL editor.

The second migration schedules the nightly job with `pg_cron`. If it isn't enabled, turn on the pg_cron extension under Database → Extensions and re-run that file.

## Content

Seed files live in `content/` and are validated by Zod (`lib/content/schemas.ts`):

| File | What | Status |
| --- | --- | --- |
| `questions.json` | 12 verified Arabic questions, plus English translations | Arabic `approved`; English `draft` (machine-translated, needs review) |
| `charades.json` | 15 charades words | `approved` |
| `prompts.json` | 5 secret prompts | `approved` |
| `traits.json` | 30 "Who among us?" traits | 5 given by the brief are `approved`; 25 drafted ones are `draft` |
| `kassa.ar.json` | Kassa's lines: 13 events × 3 moods × 5 lines | `draft`, for review |
| `blocklist.json` | Basic Arabic and English profanity list | — |

Commands:

```bash
npm run content:check    # validate
npm run content:sql      # regenerate supabase/seed.sql after editing content/
npm run content:import   # upsert into Supabase
```

Approved questions must have a `source_url`. Re-importing never turns approved content back into a draft.

## Create an admin

Sign in once in the app, then in the Supabase SQL editor run:

```sql
update public.profiles set is_admin = true where id = '<your auth user id>';
```

(The admin pages arrive in Milestone 7.)

## Tests

```bash
npm test             # unit tests (database tests are skipped without TEST_DATABASE_URL)
npm run db:test      # migration + RLS tests on a throwaway local Postgres (no Docker)
npm run build && npm run test:e2e   # Playwright: phone and 1280x720 host viewports (needs `npm run db:start`)
npm run ci           # lint + typecheck + content check + tests + build
```

The solo e2e tests play real games against the local Supabase, using the seed answers to answer right or wrong on purpose, and include anti-cheat checks (fake timestamps, double submissions, forged rounds, other players' games).

GitHub Actions runs everything, including the database and e2e tests, from `.github/workflows/sahra-ci.yml`.

## Deploy (Vercel Hobby)

1. Import the GitHub repo in Vercel and set **Root Directory** to `sahra`.
2. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel domain and add it to the redirect URLs.
