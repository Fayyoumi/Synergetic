# Sahra (سهرة)

Arabic-first party games for Arab gatherings, hosted by Kassa the tea glass.
Next.js 16 + Supabase. Read `../CLAUDE.md` for conventions and `docs/SAHRA_SPEC.md` for the full spec.

> Status: Milestone 8, ready for the pilot. Everything in the MVP is built: solo trivia (classic, daily, sudden death), team trivia, charades and "Who among us?" with secret prompts on a TV plus up to 12 phones; Kassa's lines; sounds; story images; the content admin and the pilot dashboard.

## What's in it

| Where | What |
| --- | --- |
| `/` | Home. `/en` is the English version of every page. |
| `/play/solo` | Solo trivia: classic (5 questions), daily challenge, sudden death |
| `/play/group` | Create a room on the TV: team trivia, charades, "Who among us?" |
| `/join` and `/join/<code>` | Phones join by QR code or 4-digit code: no app, no account |
| `/titles`, `/profile` | The titles you won, and your XP, streaks, badges and "delete my data" |
| `/night/<code>` | After the night: the titles with share buttons |
| `/admin`, `/admin/pilot` | Content review and the pilot numbers (admins only) |

**Kassa's lines** come from `content/kassa.ar.json`. They're imported into the `kassa_lines` table as drafts, and Kassa says only the ones an admin approved, for the room's mood (and Family lines on any night). Until a line is approved, the screens use the built-in copy from `messages/*.json`. English screens always use the built-in copy.

**Sounds** are made in the browser (WebAudio), so there are no sound files: a tick in the last 5 seconds, a ding for a right answer, a buzz for a wrong one, a fanfare at a reveal, and a pop when someone joins. Each screen has a mute button; the choice is remembered on that device.

### Try a room locally

1. On the laptop (the "TV"): http://localhost:3000/play/group → pick a game. The host screen opens with a QR code and a 4-digit code.
2. On phones on the same Wi-Fi, open `http://<laptop-ip>:3000/join/<code>` (or scan the QR code if it points at a reachable address). To simulate phones on one computer, use separate private windows.
3. Pick "ليلة الأسئلة بفرق", choose 5/10/15 questions and a difficulty, tap a player's team chip to move them, then "يلا نبدأ!". Phones answer; the TV reveals, shows the scoreboard, and ends with the winner.
4. Leave the app on a phone, lock it, or close the tab: everyone (host screen and other phones) sees "left the app" or "disconnected", and the host screen counts how many times each player left.

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

```bash
npm run admin:make -- you@example.com
```

This creates (or promotes) a confirmed admin account and prints a one-time sign-in link, which works even without email (locally). In production, set `SITE_URL` to your domain when running it, or simply sign in at `/admin` with an emailed magic link once the account is an admin.

- `/admin`: review and approve drafts (questions need a source; Kassa's lines, traits, prompts, charades words), resolve question reports, upload CSV/JSON.
- `/admin/pilot`: the pilot's go/no-go numbers per day and per room (rooms, average players, night length, replay rate, share rate, solo day-1/day-7 return).

## Tests

```bash
npm test             # unit tests (database tests are skipped without TEST_DATABASE_URL)
npm run db:test      # migration + RLS tests on a throwaway local Postgres (no Docker)
npm run build && npm run test:e2e   # Playwright: phone and 1280x720 host viewports (needs `npm run db:start`)
npm run ci           # lint + typecheck + content check + tests + build
```

`tests/e2e/pilot-night.spec.ts` plays a whole night in one room: 1 host screen and 3 phones play a full team-trivia game, go back to the lobby, switch to "Who among us?", play it to the end, and close the night. The other multi-device specs cover dropped phones, the charades secret word, vetoes and anti-cheat.

The solo e2e tests play real games against the local Supabase, using the seed answers to answer right or wrong on purpose, and include anti-cheat checks (fake timestamps, double submissions, forged rounds, other players' games).

GitHub Actions runs everything, including the database and e2e tests, from `.github/workflows/sahra-ci.yml`.

## Lighthouse (mobile, production build)

Measured with `next start` and Lighthouse's default mobile throttling:

| Page | Performance | Accessibility | Best practices |
| --- | --- | --- | --- |
| `/` | 91 | 100 | 100 |
| `/play/trivia` | 91 | 100 | 100 |
| `/join/<code>` | 92 | 100 | 96 |
| `/profile` | 89 | 100 | 100 |
| `/play/sudden` | 90 | 100 | 100 |
| `/en` | 91 | 96 | 100 |

The PWA is installable (`app/manifest.ts` and the icons in `public/icons/`). To keep these numbers:

- Render the screen's text on the server, and let only the parts that need data wait for it. A "loading" screen in place of the page makes the first big paint wait for sign-in and an API call.
- Keep the layout the same size while loading (use "…" for values), so nothing jumps.
- Only the Arabic body font is preloaded. Lalezar and the Latin faces load on demand.

## Deploy to production (Vercel Hobby + Supabase Free)

1. **Supabase**: set up a project as in "Set up Supabase" above (anonymous sign-ins on, the rate limit raised, migrations applied, content seeded).
2. **Vercel**: import the GitHub repo and set **Root Directory** to `sahra`. The framework preset is Next.js; keep the default build command.
3. Add the environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Project Settings → API);
   - `SUPABASE_SERVICE_ROLE_KEY` (server only; never in the browser or the repo).
4. Deploy, then in Supabase → Authentication → URL Configuration, set the **Site URL** to the Vercel domain and add `https://<domain>/auth/callback` to the redirect URLs (admin magic links).
5. Make yourself an admin: run `SITE_URL=https://<domain> npm run admin:make -- you@example.com` with `.env.local` pointing at the production project, then open the printed link.
6. In `/admin`, approve Kassa's lines, the traits and any translations you've checked. Nothing in draft is ever shown to players.
7. Smoke test on the real domain: open `/play/group` on a laptop, join with two phones on mobile data (not the same Wi-Fi), play one trivia round, and check `/admin/pilot` shows the room.
