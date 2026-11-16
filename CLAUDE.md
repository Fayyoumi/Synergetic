# CLAUDE.md

This repo holds two unrelated things:

- **Repo root**: the static Synergetic Insights and Consulting website (plain HTML/CSS/JS, uploaded to GoDaddy). Don't touch it while working on Sahra.
- **`sahra/`**: **Sahra (سهرة)**, a bilingual Arabic/English party-games web app. Everything below is about Sahra. Run all commands from `sahra/`.

The full product spec is `sahra/docs/SAHRA_SPEC.md`. **The spec wins** over this file, over the prototypes in `sahra/docs/prototype-reference/` and over the screenshots in `sahra/design-reference/`. The screenshots are the source of truth for look and feel, not pixel-perfect specs.

## Product

- Party games for Arab gatherings, hosted by **Kassa (كاسة)**, a cheeky cartoon tea glass. Positioning: "العب، نافس، واضحك مع ناسك" / "Play, compete and laugh with your people."
- MVP for a 30-gathering pilot in Jordan: a TV/laptop **host screen** plus up to **12 phones** joining by QR code or 4-digit code (no download, no account for guests), and **solo** play on one phone.
- MVP games: Trivia Night (solo and team), Daily challenge, Sudden death, Charades (2 teams), Who among us? (from secret prompts).
- Phase 2 (don't build, don't block): Mafia, Who wrote it?, Do you know me?, True or made up?, Name them all, map and picture quizzes, leagues, badges beyond the MVP set, country cup, payments, native apps. Store XP now so leagues can read it later. Keep the room engine generic enough for Mafia (private per-player data).
- Kassa's moods (set by the host): **family (عيلة)** is the default and kid-safe, **friends (شلة)** is cheeky, **roast (تحفيل)** is opt-in only and needs the host to confirm everyone is 18+. Under-18 players get Family only. In the MVP, Kassa's lines come from `content/kassa.ar.json`, not an AI model.

## Hard rules

- **Free tiers only** (Vercel Hobby, Supabase Free). Ask before adding any paid service, API or library.
- **No invented facts.** Never write a trivia question and mark it approved. AI-drafted content (questions, translations, traits, Kassa lines) is saved as `status: "draft"` and is never shown to players until a human approves it. Approved questions must have a `source_url` (enforced by Zod and by a DB constraint).
- Don't copy other quiz sites' questions. Formats are fine.
- **Arabic first**: Arabic (RTL) is the default (`/`); English lives under `/en`. Every screen must work in both directions.
- Keep it simple: no microservices and no custom servers without approval.
- No cash prizes, paid entry or loot boxes anywhere.
- Placeholder text is allowed only on `/privacy` and `/terms`, marked `TODO: lawyer review`.
- Build one milestone at a time (spec section 12). At the end of each: run the tests, show what works and how to try it, then wait for the user's "go".

## Stack

- Next.js 16 (App Router, `proxy.ts` instead of middleware, `cacheComponents` off) + TypeScript strict + Tailwind CSS v4 (tokens in `app/globals.css` `@theme`).
- This Next.js version has breaking changes compared with older training data. Read `sahra/node_modules/next/dist/docs/` before using an unfamiliar API.
- next-intl 4: `i18n/routing.ts` (locales `ar`, `en`; default `ar`; `localePrefix: "as-needed"`; no Accept-Language detection). Pages live under `app/[locale]/`. Use `Link`/`useRouter` from `@/i18n/navigation`.
- Supabase: Postgres, Auth (anonymous guests + email magic link), Realtime (broadcast + presence), RLS on every table. Clients are in `lib/supabase/` (`client.ts` browser, `server.ts` user and service-role, `proxy.ts` cookie refresh). The app still renders without Supabase keys.
- Zod 4 validates every message, API input and content file.
- Vitest (unit + DB) and Playwright (e2e, using the preinstalled Chromium; `@playwright/test` is pinned to match).
- PWA: `app/manifest.ts` plus icons in `public/icons/` (regenerate with `node scripts/make-icons.mjs`).

## Layout (`sahra/`)

```
app/[locale]/            pages (home, design guide, privacy, terms, ...); app/manifest.ts
components/              Kassa, WeddingLights, ui (Button, ButtonLink, Card, SpeechBubble), PhoneShell, ...
i18n/                    next-intl routing, request config, navigation
messages/ar.json, en.json  all UI strings (same keys in both; a test checks this)
lib/game/                pure game logic + scoring (no React or Next imports; 100% unit tested)
lib/realtime/            room channel helpers + Zod message schemas (protocol v: 1)
lib/content/             Zod content schemas, seed loader, text filter, seed SQL builder
lib/i18n/digits.ts       Arabic-Indic and Western digits, room codes
lib/supabase/            Supabase clients
content/                 seed JSON: questions, charades, prompts, traits, kassa.ar, blocklist
supabase/migrations/     SQL migrations (+ RLS); supabase/seed.sql is generated, never edit it by hand
scripts/                 content-import.ts, db-test.sh, make-icons.mjs
tests/unit, tests/db, tests/e2e
docs/                    SAHRA_SPEC.md, prototype-reference/, concept and launch PDFs
design-reference/        PNG screenshots of every screen
```

## Commands (from `sahra/`)

- `npm run db:start`: local Supabase in Docker (migrations + seed) and writes `.env.local`. `db:stop`, `db:reset`. In a cloud container, start Docker first with `dockerd &`.
- `npm run dev`: dev server on http://localhost:3000
- `npm test`: Vitest. DB tests run only when `TEST_DATABASE_URL` is set.
- `npm run db:test`: starts a throwaway local Postgres (no Docker) and runs the migration and RLS tests
- `npm run test:e2e`: Playwright against `next start` on port 3100. Run `npm run build` first.
- `npm run lint`, `npm run typecheck`
- `npm run content:check` | `content:sql` | `content:import`: validate seeds, regenerate `supabase/seed.sql`, or upsert into Supabase
- `npm run ci`: lint + typecheck + content + tests + build
- CI is `.github/workflows/sahra-ci.yml`, at the repo root.

## Conventions

- **No hard-coded UI strings** in `app/` or `components/`. Everything goes in `messages/*.json`; tests fail on Arabic in code or English JSX text. Content data (questions, Kassa lines) lives in `content/`.
- **Digits**: Arabic UI uses Arabic-Indic digits and English uses Western digits, through `formatNumber`/`formatPoints` in `lib/i18n/digits.ts`. Pre-format numbers before passing them to messages. **Room codes always use Western digits** (`roomCode()`, and render them in a `dir="ltr"` element).
- **RTL**: use logical Tailwind utilities (`ms-`, `me-`, `ps-`, `start-`, `rounded-es-`, ...). Never use left/right. Pointing icons (back arrows, chevrons, progress) get the `flip-rtl` class.
- **Design**: flat, with no gradients, no shadows and no emoji. Cards and buttons use a 2px ink border (`ink-border`) and a 16–24px radius. The selected state is a sunflower fill plus a 3–4px ink border (`ink-border-thick`). Touch targets are at least 44px and main buttons 56–64px (`Button size="lg" | "xl"`). Lalezar (`font-display` / `display-text`) is for titles, scores and big buttons; IBM Plex Sans Arabic (400/600/700) is for everything else.
- Colours: tomato `#E8412C` (wordmark, group actions, hard), sunflower `#FFC93C` (main actions, highlights, selected), chair `#12A6A0` (correct, medium, solo), ink `#2B1B17` (text, outlines, legend), cream `#FFF4DE` (page background), tea `#D9541E` (Kassa's tea only), muted `#6B5147` (secondary text), plus bulb green `#2E8B57` (lights only).
- `<Kassa mood size label />`: the expression is `neutral | cheeky | shocked | laughing | sad`. Pass a translated `label`, or omit it when Kassa is decorative. The clipPath id comes from `useId()`. `<WeddingLights variant="phone" | "wide" />` goes across the top of the home screen and host screens.
- Accessibility: use real `<button>`, `<a>` and `<label>` elements; put `aria-label` on icon-only buttons; text contrast at least 4.5:1; 3px turquoise focus ring (global). Never use colour alone: add a text label such as "صح" or "جوابك".
- Questions are **never readable by clients** (RLS), so the answer can't leak. Serve them through server routes that strip `answer_index`. Shuffle options on display, but store `answer_index` against the stored order.
- Writes to scores, answers, rooms, votes, prompt answers and events go through server route handlers with the service-role key, after Zod validation. Clients can update only `display_name`, `avatar_color`, `locale` and `birth_year` on their own profile (column grants).
- Re-importing content never downgrades an approved or retired item to draft.
- Banned "Who among us?" traits (appearance, religion, weight, health, family status) are never approved and never used.
- Text filter: `lib/content/textFilter.ts` with `content/blocklist.json` masks matches with `***` and flags the entry. Use it for player names and prompt answers.

## Solo trivia (built in Milestone 2)

- Pure logic: `lib/game/scoring.ts` (points, max score, XP, badges, `serverTimeLeft`/`countdownSeconds`), `lib/game/round.ts` (round building, option shuffle, 50:50, daily pick, `acceptProposedRound`), `lib/game/soloTrivia.ts` (reducer: `question → reveal → … → finished`), `lib/game/dayStreak.ts` (daily play streak, Amman calendar day).
- Server: `POST /api/solo` (actions: start, state, answer, fifty, next, report) → `lib/server/solo.ts`. The state lives in `games.progress` (players can't read it). Every step goes through `solo_commit` (optimistic `games.version`, so replays can't score twice), and the end goes through `solo_finish` (score, XP, badges, streak in one transaction).
- `GET /api/solo/catalog` returns question metadata only (no text or answers) plus the player's recent and reported ids. The setup screen previews the exact round with `buildRound`, so "highest possible score" is exact; the server re-checks the ids with `acceptProposedRound`.
- Timing: the countdown shows `ceil(remaining)`, so 0 = timeout and scores 0. The server measures from the request's arrival time, with a 1.5 s grace.
- Profile: `GET/PATCH/DELETE /api/me`. Names pass the text filter, and DELETE removes the auth user (cascade).
- The daily challenge is the same question for everyone each Amman day (`daily_challenges`), one attempt per player (unique index). English players get its approved `-en` translation if there is one.
- `lib/server/events.ts` `logEvent()` is the analytics writer (best effort, never throws).

## Real-time rooms

**Built in Milestone 3:**
- **API.** `POST /api/rooms` creates a room (host = caller). `GET /api/rooms/[code]` returns room info; seats are listed only to the host and seated players. `POST /api/rooms/[code]/join` takes a seat: it needs consent, rejoins by account (or device id + name), refuses removed players, allows at most 12, and lets under-18s join only Family nights. `POST /api/rooms/[code]/host` handles mood (roast needs `roastConfirmed`), game, remove and end. The logic is in `lib/server/rooms.ts`.
- **Channels are private** (Realtime Authorization). The `realtime.messages` policies use `public.can_use_room_topic(topic)`:
  - `room:CODE` is open to the host and seated players;
  - `room:CODE:p:SEAT_ID` is open to that seat's owner only (not even the host), for charades words and Mafia roles.
- **Clients may only publish presence.** Every broadcast is sent by the server (`httpSend` with the service role), so players can't forge game or host messages.
- **Fair play: disconnections are public.** Each client tracks presence `{ role, seatId, status: "active" | "away" }`, where "away" means the page is hidden (app switch or screen lock). It untracks on `pagehide`. Everyone runs the same pure tracker (`lib/realtime/presence.ts`): statuses are active / away / offline, with notices ("X left the app", "X disconnected", "X is back") and per-seat away counts. The host also shows as `host`. UI: `components/room/Presence.tsx` (`ConnBadge`, `PlayerList`, `ConnToasts`, `SelfConnBanner`). Hook: `lib/realtime/useRoomChannel.ts`. Keep this visible in every game screen (host and phones).

**Team trivia (Milestone 4).** The host screen drives the flow and the server checks and scores every step:
- `lib/game/teamTrivia.ts` is the pure reducer: `lobby → question → reveal → scoreboard → … → final → lobby`. It covers `balanceTeams`, `finalResults`, and late joiners entering at the next question. Removed players stop counting. Members who don't answer (or are disconnected) score 0 and still count in their team's average, so leaving never helps.
- `lib/server/roomGame.ts` and the routes:
  - `GET /api/rooms/[code]/game`: the public view, members only;
  - `POST /api/rooms/[code]/game`: commands. The host sends `start`, `advance`, `lobby`, `team` and `balance`; any member may send `timeup`;
  - `POST /api/rooms/[code]/answer`: a phone's answer, timed by the server on arrival.
- Where state lives: `rooms.game_state` holds the full state and is unreadable by clients (column grants). Answers wait in `room_pending_answers`, where clients have no access at all.
- Each state change runs through `room_commit` (optimistic `rooms.state_version`). The reveal runs through `room_reveal_commit`, which also writes the scored `answers` rows and bumps question counters. The end runs through `room_game_finish`, which writes `scores` and adds profile XP.
- The reveal fires when everyone has answered, or on `timeup` once 15 s have passed. Any phone can send `timeup`, so the game continues if the TV drops.
- Broadcasts: `state` (the full `TeamPublicView`, with no answer before the reveal) and `answered` (who answered, never what). Clients keep the newest state by `serverNow` (`lib/rooms/useRoomGame.ts`).
- On every channel (re)subscribe, clients re-fetch the room and game (`onSubscribed`), so a missed broadcast can't leave a screen stale.
- UI: `components/trivia/HostTrivia.tsx` (TV) and `PhoneTrivia.tsx`. Connection badges and toasts stay visible during the game.
- No jokers in team mode (MVP).

**Charades (Milestone 5).**
- **Logic:** `lib/game/charades.ts` is the pure reducer: `lobby → turn_ready → turn_active → turn_summary → … → final`. There are 2 teams × 3 rounds = 6 turns of 60 s, alternating teams, with the actor rotating within each team.
- **Scoring:** a guessed word scores `charadesPoints` (100/200/300). Each turn allows 3 skips worth 0. A steal claims only the word just skipped, for half points (`stealPoints`), until the next action; it's also allowed on the turn summary.
- **Deck:** skipped words that weren't stolen, and the unfinished word, go back into the deck. A turn ends early if the deck runs out.
- **Controls:** the host or the current actor can begin, got_it, skip and steal; any member can send `timeup`.
- **Server:** `lib/server/charadesGame.ts`, reached through the same `/api/rooms/[code]/game` route. `RoomGameService` dispatches on `rooms.game`.
- **The word is private:** it's sent only on the actor's private channel (`room:CODE:p:SEAT`, a `secret` event), and `GET /api/rooms/[code]/secret` re-syncs it for the actor only. Public state never contains the current word, and skipped words stay hidden until stolen or the turn ends.
- **Final:** each player's points equal their team's score (for XP).
- **UI:** `components/charades/*`.
- **Team names** (all team games): فريق الشاي / فريق القهوة (Team Tea / Team Coffee), as in the designs.

**Spec rules (Milestones 4–6 build on these):**
- One Supabase Realtime channel per room, `room:{code}`. Presence holds the player list and broadcast carries game messages. Codes are 4 random digits, unique among non-ended rooms (partial unique index). Rooms expire after 6 hours of inactivity.
- **The host screen is the authority.** It runs the reducer state machine and broadcasts the full public state after every change. Phones send intents only (`answer`, `vote`, `skip`, `got_it`, `steal`, `ready`), and the host ignores invalid or late ones.
- Private data (the charades word, future Mafia roles) goes only to that player and never into public state.
- The host persists results through an API route after every question or turn, and persists `game_state`, so a refresh doesn't lose anything. Phones rejoin by device id (localStorage) plus name.
- State machines (typed reducers in `lib/game/`):
  - Trivia: `lobby → question → reveal → scoreboard → … → final`
  - Charades: `lobby → turn_ready → turn_active → turn_summary → … → final`
  - Who among us: `lobby → prompts_collect → vote_open → reveal → … → final`

## Scoring rules (`lib/game/scoring.ts`, pure functions, fully unit-tested)

**Trivia (solo and team)**
- Base points: easy 100, medium 200, hard 300, legend 500. The timer is 15 s; `timeLeft` is the whole seconds remaining (0–15).
- `speedBonus = round(base * 0.5 * timeLeft / 15)`
- `streakBefore` = the number of consecutive correct answers immediately before this question.
- `streakBonus = round((base + speedBonus) * min(streakBefore, 5) * 0.1)`
- `points = (base + speedBonus + streakBonus) * (doubleActive ? 2 : 1)`
- A wrong answer or a timeout scores 0 (never negative) and resets the streak.
- Jokers: 50:50 (hides 2 wrong options) and ×2 (doubles this question). Each is usable once per game. ×2 must be activated before answering and is used up even on a wrong answer.
- Difficulty filter: easy → [easy, medium]; mixed → all four; hard → [medium, hard, legend]. Pick from the selected categories first, then fill from other categories at the allowed difficulties and tell the player. Avoid repeating a question to the same player within 30 days.
- Round length: classic 5, daily 1, sudden death until the first wrong answer (maximum 50).
- **Highest possible score** (setup screen): the sum over planned questions i (0-indexed) of `round(base_i * 1.5 * (1 + min(i,5) * 0.1))`. It ignores ×2.
- **Team trivia**: each player scores individually. Team score per question = the average of its members' points, rounded.
- **Anti-cheat**: the client sends the answer index and `answeredAt`. The server recomputes the score from the stored question start time and caps `timeLeft` from server timestamps. Leaderboards use only server-computed scores.

**Charades**: 60 s turns, 3 rounds per team, 2 teams. A guessed word scores 100/200/300 by difficulty 1/2/3. Each turn allows 3 skips, and a skip scores 0. **Steal**: the other team claims a skipped word in one guess for half points (the host taps "سرقة").

**Who among us?**: each player votes for one other player (no self-votes). Voters for the top-voted player get +100. On a tie, voters for any tied player get +100. The top-voted player gets the round's title (saved to group history, worth no points).

**XP**: `xp = floor(points / 10)`, stored per player per game and as a running total.

**MVP badges** (end of game): `perfect_round` (all correct, round of 5 or more), `streak_3` / `streak_5` / `streak_10`, `golden_mind` (1,500+ points in one classic round), `first_round` (first game ever).

## Data and privacy

- The tables are in `supabase/migrations/20261112000000_init.sql`. Additions beyond the spec: `profiles.is_admin`, `traits`, `difficulty_changes` (log), `rooms.roast_confirmed_at` / `last_active_at`, `room_players.name_flagged`, and `prompt_answers.flagged` / `saved_by_group`.
- Nightly job (`pg_cron`, 00:15 UTC): `public.nightly_maintenance()` deletes expired `prompt_answers` (unless saved by the group), recalibrates difficulty (approved questions with at least 50 answers: above 85% correct moves one level easier, below 25% one level harder; each change is logged and the counters reset), and ends expired rooms.
- "Delete my data" = delete the `auth.users` row (service role). It cascades to the profile, answers, scores, seats, prompt answers and votes. Analytics events keep their row but lose the person link.
- Consent (`room_players.consent_at`) is required at first join. Any player can veto the reveal of their own answer. Questions get a one-tap report, which hides the question for that player.
- Analytics events (spec section 10) go to the `events` table only. No paid analytics.
