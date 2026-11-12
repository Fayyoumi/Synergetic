# Build Sahra (سهرة): pilot MVP

You are building the first working version of **Sahra**, a bilingual Arabic/English party-games web app for Arab gatherings, hosted by a cheeky cartoon tea glass called **Kassa (كاسة)**. This version is for a 30-gathering pilot in Jordan. It must work on a TV/laptop "host screen" with up to 12 phones joining by QR code. It must also support solo play on a phone.

Read this whole document before writing any code. Then:

1. Create `CLAUDE.md` in the repo root that summarises the product, stack, conventions and the scoring rules below, so future sessions keep them.
2. Reply with a short build plan, broken into the milestones in section 12, and the list of accounts or keys you need from me.
3. Build **one milestone at a time**. At the end of each milestone, run the tests, show me what works and how to try it locally, and wait for my "go" before starting the next.

Hard constraints:

- **Budget is tight.** Use only free tiers (Vercel Hobby, Supabase Free). Do not add any paid service, paid API or paid library without asking me first.
- **No invented facts.** Never generate trivia questions and mark them as verified. AI-drafted content must be saved with `status: "draft"` and never shown to players until a human approves it.
- **Do not copy other quiz sites' content.** JetPunk-style *formats* are fine; their questions are not.
- **Arabic first.** Arabic (RTL) is the default language; English is a toggle. Every screen must work in both directions.
- Keep it simple: no microservices, no custom servers unless I approve.

---

## 1. Product summary

**Positioning:** "العب، نافس، واضحك مع ناسك" / "Play, compete and laugh with your people."

**Two ways to play:**

- **Solo (فردي):** Trivia Night, the daily challenge and sudden death, played on one phone, with scores saved to the player's profile.
- **Group (جماعي):** one screen (TV or laptop) shows the game. Guests scan a QR code or type a 4-digit code and play from their phones. They need no download, and no account for guests.

**Games in this MVP:**

| Game | Mode | MVP? |
| --- | --- | --- |
| Trivia Night (ليلة الأسئلة): classic 5-question round | Solo + team | Yes |
| Daily challenge (تحدي اليوم): 1 question, same for everyone | Solo | Yes |
| Sudden death (الموت المفاجئ): play until the first wrong answer | Solo | Yes |
| Charades (بدون كلام) | Group, 2 teams | Yes |
| Who among us? (مين فينا؟), built from secret prompts | Group | Yes |
| Mafia (مافيا) | Group | **No.** Phase 2, but design the room engine so it can be added |
| Who wrote it? (مين كتبها؟), Do you know me? (بتعرفني؟), True or made up? (صح ولا تأليف؟) | Group | No, Phase 2 |
| Name them all, map click, picture ID | Solo | No, Phase 2 |
| Weekly leagues, badges, country cup | All | No, Phase 2. Store the data now so it can be added |

**Kassa** narrates every game with short lines in Arabic dialect. There are three moods, set by the host: **Family (عيلة)**, the default, which is polite and safe for kids; **Friends (شلة)**, with cheeky teasing; and **Roast (تحفيل)**, which is opt-in only and off for under-18s. In the MVP, Kassa's lines come from a JSON template file, not from an AI model.

---

## 2. Tech stack

- **Next.js** (latest stable, App Router) + **TypeScript** (strict) + **Tailwind CSS**
- **Supabase**: Postgres, Auth (anonymous guests + email magic link), Realtime (broadcast + presence), Row Level Security on every table
- **Vercel** for hosting
- **next-intl** (or an equivalent) for Arabic/English; `dir="rtl"` on Arabic pages
- **Zod** for validating every message and API input
- **Vitest** for unit tests; **Playwright** for end-to-end tests, including a test with 1 host and 3 phones in one room
- An installable **PWA** (manifest + icons); no offline gameplay needed
- `qrcode` (or similar, MIT-licensed) for the join QR code
- Share images (title cards, result cards) generated with Next.js `ImageResponse` (OG images), 1080×1920 for stories

Folder layout (suggestion; adjust if you have a better reason):

```
/app
  /(player)/play           solo hub, solo games, results
  /(player)/join/[code]    phone controller for a room
  /host/[code]             TV/laptop host screen
  /admin                   content admin (protected)
  /api                     route handlers (score submission, content import, share images)
/lib
  /game                    pure, framework-free game logic + scoring (100% unit tested)
  /realtime                room channel helpers and message schemas (Zod)
  /content                 loaders for questions, charades words, prompts, Kassa lines
/content                   seed JSON files (see section 8)
/supabase/migrations       SQL migrations, RLS policies, seed SQL
/tests                     vitest + playwright
```

---

## 3. Design system (use exactly)

The look is **"Arab pop nostalgia"**: wedding string lights, plastic-chair turquoise, shop-sign lettering, thick ink outlines. It should be flat, with no gradients, no shadows and no emoji.

**Colours (CSS variables + Tailwind theme):**

| Token | Hex | Use |
| --- | --- | --- |
| `--tomato` | `#E8412C` | Wordmark, primary group actions, hard difficulty |
| `--sunflower` | `#FFC93C` | Main actions, highlights, selected states |
| `--chair` (turquoise) | `#12A6A0` | Correct answers, medium difficulty, solo mode |
| `--ink` | `#2B1B17` | Text, all outlines, legend difficulty |
| `--cream` | `#FFF4DE` | Page background |
| `--tea` | `#D9541E` | Kassa's tea only |
| `--muted` | `#6B5147` | Secondary text on cream (passes 4.5:1) |

**Type:**

- Display: **Lalezar** (Google Fonts), for titles, scores, big buttons
- Body: **IBM Plex Sans Arabic** (Google Fonts), weights 400/600/700, for everything else
- Use Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) in Arabic UI and Western digits in English UI. Room codes always use Western digits.

**Shapes:**

- Cards and buttons: `border: 2px solid var(--ink)`, radius 16–24px. Selected state: sunflower fill plus a 3–4px ink border.
- Minimum touch target 44px; main buttons 56–64px tall.
- Wedding-lights decoration: a sagging wire with coloured bulbs (tomato, sunflower, turquoise, green `#2E8B57`) across the top of host screens and the home screen. Make it an SVG component.

**Kassa SVG component.** Use this exact artwork in a `<Kassa mood size />` component. Make the eyebrows, pupils and mouth variable for these expressions: neutral, cheeky (current), shocked, laughing, sad. Keep the `clipPath` id unique per instance with `useId()`.

```svg
<svg viewBox="0 0 200 240" role="img" aria-label="Kassa">
  <defs><clipPath id="kassa-glass"><path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z"/></clipPath></defs>
  <g fill="none" stroke="#2B1B17" stroke-width="5" stroke-linecap="round">
    <path d="M85 44 C75 34 95 24 85 12"/><path d="M100 44 C90 31 110 21 100 6"/><path d="M115 44 C105 34 125 24 115 12"/>
  </g>
  <ellipse cx="100" cy="214" rx="72" ry="14" fill="#12A6A0" stroke="#2B1B17" stroke-width="5"/>
  <path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z" fill="#FFFDF7"/>
  <rect x="40" y="92" width="120" height="120" fill="#D9541E" clip-path="url(#kassa-glass)"/>
  <path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z" fill="none" stroke="#2B1B17" stroke-width="5" stroke-linejoin="round"/>
  <ellipse cx="100" cy="60" rx="40" ry="8" fill="#FFFDF7" stroke="#2B1B17" stroke-width="5"/>
  <path d="M72 76 C69 92 73 104 71 116" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="86" cy="124" r="10" fill="#FFFFFF" stroke="#2B1B17" stroke-width="4"/>
  <circle cx="114" cy="124" r="10" fill="#FFFFFF" stroke="#2B1B17" stroke-width="4"/>
  <circle cx="88" cy="126" r="4" fill="#2B1B17"/><circle cx="116" cy="126" r="4" fill="#2B1B17"/>
  <path d="M74 106 Q84 98 96 104" stroke="#2B1B17" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M105 108 Q115 105 126 110" stroke="#2B1B17" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M84 142 Q92 135 100 141 Q108 135 116 142 Q108 147 100 144 Q92 147 84 142 Z" fill="#2B1B17"/>
  <path d="M86 152 Q100 172 114 152 Z" fill="#2B1B17"/>
</svg>
```

**Design references:** I will put PNG screenshots of every screen in `/design-reference` (`Sahra-Designs-PNG.zip`). Match their layout, colours and copy. Treat them as the source of truth for look and feel, not pixel-perfect specs.

**Accessibility:** use real `<button>`, `<a>` and `<label>` elements; `aria-label` on icon-only buttons; text contrast of at least 4.5:1; visible focus rings (3px turquoise); never rely on colour alone (add a text label such as "صح" or "جوابك").

---

## 4. Screens

### Phone (player)

1. **Home** (`/`): the wordmark "سهرة" in tomato Lalezar, Kassa with a speech bubble, the next gathering card (if any), the player's groups, and a big "العب الآن" button to the Play hub.
2. **Play hub** (`/play`), in steps:
   1. Choose mode: **فردي (Solo)**, a turquoise card, or **جماعي (Group)**, a tomato card. A streak reminder card sits at the bottom.
   2. Choose game. In Solo mode: Trivia Night, Daily challenge, Sudden death, plus "سمّي الكل" shown as "قريباً" (coming soon). In Group mode: Team Trivia, Mafia (coming soon), Charades, Who among us?. Choosing a group game creates a room and opens the host screen (see below).
   3. **Trivia setup:** category chips (multi-select, at least 1) and difficulty (سهل / منوّع / صعب). A dark summary box shows the number of questions, the **highest possible score** (formula in section 5) and the scoring rule text. Then a "يلا نبدأ!" button.
   4. **Question screen:** progress bar, `n / total`, a 15-second countdown circle that turns tomato at 5 seconds or less, category and difficulty chips (the difficulty chip shows its points), a streak chip at 2 or more in a row, the question in Lalezar, 4 options (أ ب ج د), and 50:50 and ×2 jokers. After answering: the correct option turns turquoise, the player's wrong pick turns tomato, a points breakdown card appears ("+٣٠٠ نقطة · صعوبة ٢٠٠ + سرعة ١٠٠ + سلسلة ٠"), and a Next button.
   5. **Results:** big score, correct count, best streak, XP gained, a league card placeholder (Phase 2; show "قريباً" or hide it), badges earned this round, and "جولة ثانية" / "شارك النتيجة" buttons (share opens the story image).
3. **Join a room** (`/join/[code]`): enter a name (pre-filled if signed in), pick an avatar colour, accept the consent line, then wait in the lobby. This becomes the controller for whatever game the host runs.
4. **Secret prompts** (`/join/[code]/prompts` or before a gathering via an invite link): 5 prompts, one at a time, each with a textarea plus "أرسل" and "تخطّى" buttons. A progress bar, and Kassa saying "سرّك بأمان… لليلة السهرة".
5. **Profile:** name, avatar, total XP, streak, games played, badges, language toggle, delete-my-data button.

### Host screen (TV/laptop, 16:9, minimum 1280×720, large type)

1. **Lobby:** the QR code, the 4-digit code, joined players appearing live, game and mood selection, and a "يلا نبدأ!" button.
2. **Team Trivia:** question and options large, a countdown, and live "answered" dots. Then the reveal: correct answer, who got it, team scores. A team scoreboard sits between questions.
3. **Charades:** current team, 60-second timer, round `n` of 3. The word is shown **only on the actor's phone**, never on the TV. The TV shows the timer, the team scores, and the "عرفوها! / تخطّى / سرقة" controls, which the actor's phone also has.
4. **Who among us?:** the prompt line in Lalezar, a voting countdown, then a reveal with animated bars (most votes in tomato, others in sunflower) and Kassa's line.
5. **End of night:** final scores, "title of the night" cards for each title won, and a QR code to download or share them.

---

## 5. Scoring rules (implement in `/lib/game/scoring.ts`, pure functions, fully unit-tested)

### Trivia (solo and team)

- Base points by question difficulty: `easy 100`, `medium 200`, `hard 300`, `legend 500`.
- Timer: 15 seconds. `timeLeft` is whole seconds remaining when the answer is submitted (0–15).
- `speedBonus = round(base * 0.5 * timeLeft / 15)`
- `streakBefore` = number of consecutive correct answers immediately before this question.
- `streakBonus = round((base + speedBonus) * min(streakBefore, 5) * 0.1)`
- `points = (base + speedBonus + streakBonus) * (doubleActive ? 2 : 1)`
- A wrong answer or a timeout scores **0** (never negative) and resets the streak to 0.
- Jokers: **50:50** (hides 2 wrong options) and **×2** (doubles this question's points). Each can be used **once per game**. ×2 must be activated before answering, and it is used up whether the answer is right or wrong.
- Difficulty filter for building a round: `easy → [easy, medium]`, `mixed → [easy, medium, hard, legend]`, `hard → [medium, hard, legend]`. Pick from the selected categories first. If there aren't enough questions, fill from other categories at the same allowed difficulties and say so in the UI. Never repeat a question to the same player within 30 days if avoidable.
- Round length: classic 5, daily challenge 1, sudden death until the first wrong answer (maximum 50).
- **Highest possible score** shown on the setup screen: for question `i` (0-indexed) in the planned round, `round(base_i * 1.5 * (1 + min(i,5) * 0.1))`, summed. This ignores the ×2 joker.
- **Team trivia:** each player answers on their own phone and scores individually with the formula above. **Team score per question = the average of its members' points, rounded.** This keeps teams of different sizes fair.
- **Anti-cheat (solo):** the client sends answer index and `answeredAt` for each question. The server recomputes the score from the stored question start time and the answer, and caps `timeLeft` from server timestamps. Leaderboards use only server-computed scores.

### Charades

- 60-second turns, 3 rounds per team, 2 teams.
- A guessed word scores `easy 100 / medium 200 / hard 300` for the acting team.
- 3 skips per turn. A skip scores 0.
- **Steal:** a word the acting team skipped can be claimed by the other team in one guess, for half points (the host taps "سرقة").

### Who among us?

- Each player votes for one other player (no self-votes).
- Players who voted for the person with the most votes get **+100**. On a tie for most votes, everyone who voted for any of the tied players gets +100.
- The player with the most votes gets the round's **title** (e.g. "ملكة الدراما"), saved to the group history. Titles carry no points.

### XP (all games)

- `xp = floor(points / 10)`. Store XP per player per game and as a running total. Leagues, badges and levels in Phase 2 will read from this.

### Badges in the MVP (computed at the end of a game)

- `perfect_round`: every question correct in a round of 5 or more.
- `streak_3`, `streak_5`, `streak_10`: in-a-row correct answers.
- `golden_mind`: 1,500 or more points in one classic round.
- `first_round`: completed the first game ever.

---

## 6. Real-time rooms

- The host creates a room with a random 4-digit code that is unique among active rooms. Rooms expire after 6 hours of inactivity.
- Use one Supabase Realtime channel per room: `room:{code}`. Use presence for the player list. Use broadcast for game messages.
- **The host screen is the authority:** it runs the game state machine and broadcasts the full public state after every change. Phones send *intents* only (`answer`, `vote`, `skip`, `got_it`, `steal`, `ready`). The host validates each intent and ignores invalid or late ones.
- Private data, such as the charades word for the actor or a future Mafia role, is sent only to that player. It must never appear in the public state.
- The host writes results to the database through an API route at the end of each question or turn, so a refresh or disconnect does not lose scores. Persist `game_state` so a refreshed host screen can resume.
- Phones that disconnect can rejoin with the same code and get their seat back (match by device id in localStorage plus name).
- Define every message with a Zod schema in `/lib/realtime/messages.ts`. Version the protocol (`v: 1`).
- State machines (as typed reducers in `/lib/game/`):
  - Trivia: `lobby → question → reveal → scoreboard → … → final`
  - Charades: `lobby → turn_ready → turn_active → turn_summary → … → final`
  - Who among us: `lobby → prompts_collect → vote_open → reveal → … → final`

---

## 7. Data model (Supabase / Postgres)

Create migrations for these tables, with RLS on all of them. Players can read their own data and their groups' data. Only the host's server routes write scores. Admin pages need an `is_admin` flag.

- `profiles`: id (auth uid), display_name, avatar_color, locale, birth_year (nullable; under 18 → family mood only), total_xp, current_streak, longest_streak, last_played_on, created_at
- `groups`: id, name, owner_id, created_at
- `group_members`: group_id, profile_id, role
- `rooms`: id, code, host_profile_id (nullable for guest hosts), group_id (nullable), mood (`family|friends|roast`), status, game_state (jsonb), created_at, expires_at
- `room_players`: id, room_id, profile_id (nullable), guest_device_id, display_name, avatar_color, team, joined_at, consent_at
- `games`: id, room_id (nullable for solo), profile_id (for solo), type (`trivia_classic|trivia_daily|trivia_sudden|trivia_team|charades|who_among_us`), settings (jsonb: categories, difficulty), started_at, ended_at
- `questions`: id, lang, category, difficulty, country_tags (text[]), question, options (text[4]), answer_index, explanation (nullable), source_url, status (`draft|approved|retired`), created_by, approved_by, approved_at, times_shown, times_correct
- `question_reports`: id, question_id, reporter (profile or device), reason, created_at, resolved_at
- `answers`: id, game_id, question_id, player (room_player or profile), choice_index, correct, time_left, points, created_at
- `charades_words`: id, lang, word, category, difficulty (1–3), status
- `prompts`: id, lang, text, mood_min (`family|friends|roast`), status
- `prompt_answers`: id, room_id, room_player_id, prompt_id, answer_text, created_at, delete_after (default now() + 30 days)
- `votes`: id, game_id, round, voter_id, target_id
- `titles`: id, group_id (nullable), room_id, room_player_id, title_text, created_at
- `scores`: id, game_id, player ref, points, xp, badges (text[])
- `daily_challenges`: date (pk), question_id
- `events`: id, name, props (jsonb), profile_id or device_id, created_at (analytics; see section 10)

A nightly job (Supabase cron or a scheduled Vercel function on the free tier) must delete `prompt_answers` past `delete_after`. It must also recalibrate difficulty: approved questions with at least 50 answers and a correct rate above 85% move one level easier; below 25%, one level harder. Log every change.

---

## 8. Content

Put the seed files in `/content` and write an import script (`npm run content:import`) that validates them with Zod and upserts them. Also build an admin page to upload CSV/JSON, approve drafts, and resolve reports.

**Question JSON format:**

```json
{
  "id": "geo-0001",
  "lang": "ar",
  "category": "geo",
  "difficulty": "easy",
  "country_tags": ["JO"],
  "question": "ما هي عاصمة الأردن؟",
  "options": ["عمّان", "إربد", "العقبة", "الزرقاء"],
  "answer_index": 0,
  "source_url": "https://...",
  "status": "approved"
}
```

**Categories** (ids → Arabic labels): `geo` جغرافيا, `sport` رياضة, `food` أكل, `hist` تاريخ, `sci` علوم, `tv` مسلسلات وأفلام, `lang` لغة عربية, `flags` أعلام, `logos` شعارات, `music` أغاني عربية, `riddles` ألغاز, `maps` خرائط. Questions in `flags`, `logos` and `maps` need images; leave those categories empty in the MVP and hide their chips when they have no approved questions.

**Seed these verified questions** as `approved`. Add a `source_url` for each from a reliable source when you import:

| id | cat | diff | question | options | answer |
| --- | --- | --- | --- | --- | --- |
| geo-0001 | geo | easy | ما هي عاصمة الأردن؟ | عمّان، إربد، العقبة، الزرقاء | عمّان |
| geo-0002 | geo | medium | أي دولة عربية فيها أكبر عدد سكان؟ | السعودية، مصر، الجزائر، العراق | مصر |
| geo-0003 | geo | legend | ما هي أعلى قمة جبلية في الأردن؟ | جبل أم الدامي، جبل رم، جبل نيبو، جبل عجلون | جبل أم الدامي |
| sport-0001 | sport | medium | في أي سنة استضافت قطر كأس العالم لكرة القدم؟ | ٢٠١٨، ٢٠٢٦، ٢٠٢٢، ٢٠١٤ | ٢٠٢٢ |
| sport-0002 | sport | hard | كم لاعباً لكل فريق داخل ملعب كرة اليد؟ | ٥، ٦، ٧، ١١ | ٧ |
| food-0001 | food | easy | المنسف هو الطبق الوطني لأي دولة؟ | لبنان، الأردن، المغرب، اليمن | الأردن |
| hist-0001 | hist | hard | في أي عام نال الأردن استقلاله؟ | ١٩٢١، ١٩٥٢، ١٩٦٧، ١٩٤٦ | ١٩٤٦ |
| hist-0002 | hist | legend | أي مدينة كانت تُعرف قديماً باسم «فيلادلفيا»؟ | دمشق، عمّان، بيروت، القدس | عمّان |
| sci-0001 | sci | medium | ما هو أقرب كوكب إلى الشمس؟ | الزهرة، المريخ، عطارد، الأرض | عطارد |
| sci-0002 | sci | easy | كم يوماً في السنة الكبيسة؟ | ٣٦٥، ٣٦٦، ٣٦٤، ٣٦٠ | ٣٦٦ |
| lang-0001 | lang | hard | كم عدد حروف الأبجدية العربية؟ | ٢٦، ٢٨، ٢٩، ٣٠ | ٢٨ |
| tv-0001 | tv | medium | مسلسل «باب الحارة» من إنتاج أي بلد؟ | مصر، لبنان، سوريا، الأردن | سوريا |

Shuffle answer options on display, but store `answer_index` against the stored order.

**Charades seed words** (word / category / difficulty 1–3): منسف/أكلات/1, كنافة/أكلات/1, فلافل/أكلات/1, شرطي مرور/مهن/1, حلاق/مهن/1, خبّاز/مهن/1, طبيب أسنان/مهن/2, باب الحارة/مسلسلات/2, زحمة سير/مواقف يومية/2, سيارة عالقة بالثلج/مواقف يومية/2, دبكة/مواقف يومية/1, الصبر مفتاح الفرج/أمثال شعبية/3, اللي استحوا ماتوا/أمثال شعبية/3, تيتا بتعمل مقلوبة/مواقف يومية/3, عريس متأخر على عرسه/مواقف يومية/3.

**Secret prompt seeds** (`family` unless marked):

- شو أغرب أكلة بتحبها؟
- شو الكذبة اللي صدّقتها وإنت صغير لسنين؟
- مين بالجماعة أكثر واحد بيتأخر؟
- شو أكثر شي بتخاف منه وما حدا بيعرف؟ (`friends`)
- شو أغرب هدية أخذتها بحياتك؟

**"Who among us?" lines** are generated from templates such as `مين فينا… {trait}؟`. Seed 30 traits, for example: أول واحد بينام بالسهرة، بيضيع بالطريق دايماً، بياكل أكثر شي، بيبكي بالأفلام، بيرد على الرسائل بعد يومين. Mark any trait that teases appearance, religion, weight, health or family status as **banned**. Never generate those.

**Kassa lines:** `/content/kassa.ar.json`, keyed by event (`correct`, `wrong`, `timeout`, `streak_3`, `vote_reveal_winner`, `charades_time_up`, `lobby_welcome`, …) and mood. Each entry is an array of lines with `{name}` and `{points}` placeholders. Write at least 5 lines per event per mood in Levantine Arabic, and mark them `draft` for my review. Examples of tone:

- correct / friends: "برافو {name}! هالجواب بيستاهل كاسة شاي."
- wrong / family: "قريب! المرة الجاية بتجيبها."
- vote_reveal_winner / friends: "{name}، الشعب قال كلمته!"

---

## 9. Safety, privacy and legal

- A consent screen at first join (Arabic + English) explains that secret answers are shown only to the people in that gathering and are deleted after 30 days unless the group saves them. It needs a checkbox before continuing. Store `consent_at`.
- An age question at sign-up (birth year). Under-18 players are limited to Family mood and are excluded from future public leagues.
- Roast mood requires the host to tick "everyone here is 18+ and agreed to roast mode".
- A text filter on prompt answers and names: a basic Arabic + English profanity list in `/content/blocklist.json`. Mask matches with `***` and flag the entry.
- Any player can tap "تخطّى العرض" (veto a reveal) on their own answer during "Who among us?" reveals.
- One-tap "report this question" on every question. A report hides the question for that player immediately.
- A "Delete my data" button in the profile, which deletes the profile, answers and prompt answers.
- No cash prizes, no paid entry, no loot boxes anywhere in the code.
- Pages for `/privacy` and `/terms` with placeholder text marked `TODO: lawyer review`. This is the only allowed placeholder content.

---

## 10. Analytics (needed for the pilot's go/no-go decision)

Log these events to the `events` table, with no paid analytics tool:

`room_created`, `player_joined`, `game_started` (type, settings), `question_answered` (correct, time_left, points), `game_finished` (duration_sec, final scores), `share_clicked` (what), `share_image_generated`, `play_again_clicked`, `prompt_answered`, `prompt_skipped`, `question_reported`, `room_ended` (total_duration_sec, players, games_played).

Build `/admin/pilot` with these numbers per day and per room: rooms created, average players per room, average night length, % of rooms that started a second game (the **replay rate**), % of players who shared (the **share rate**), and solo day-1/day-7 return rate.

---

## 11. Quality bar

- Unit tests cover every scoring function and state machine, including edge cases: timeout at 0 seconds, ×2 on a wrong answer, ties in votes, a steal after a skip, a player disconnecting mid-question.
- One Playwright test simulates a host and 3 phones playing a full team-trivia game and a "Who among us?" round.
- Lighthouse on mobile: Performance ≥ 85, Accessibility ≥ 95, PWA installable.
- All UI strings live in translation files. No hard-coded Arabic or English in components, except content data.
- RTL is checked on every screen: icons that point (back arrows, progress) flip correctly.
- Works on iPhone Safari, Android Chrome and a TV browser (or a laptop on HDMI) at 1280×720 and 1920×1080.
- `README.md` explains how to run locally, seed content, create an admin, and deploy to Vercel + Supabase.

---

## 12. Milestones (stop and check in after each)

1. **Foundation:** repo, Next.js + Tailwind + i18n (RTL), design tokens, fonts, Kassa and wedding-lights components, Supabase project + migrations + RLS, anonymous auth, the content import script with the seed data, and a CI script running the tests.
2. **Solo Trivia:** Play hub (solo path), trivia setup with highest possible score, the question screen with timer, jokers and points breakdown, results, server-side score verification, daily challenge, sudden death, XP and MVP badges, profile.
3. **Rooms:** create room, QR code + code join, lobby with presence, reconnect, mood selection, consent screen.
4. **Team Trivia on the host screen:** host state machine, phone controller, reveal, scoreboard, final screen.
5. **Charades:** teams, actor-only word on the phone, 60-second turns, skips, steal, summary.
6. **Secret prompts + Who among us?:** prompt collection, voting, reveal with bars, titles saved to group history, veto.
7. **Sharing + analytics:** story images (result card, title card), share flow, events, `/admin/pilot` dashboard, content admin (approve drafts, resolve reports).
8. **Polish for the pilot:** Kassa lines wired to events, sound effects (optional, small files), Lighthouse pass, the Playwright multi-phone test, README, deployment to production.

Once Milestone 8 is done, give me a one-page "how to run a Sahra night" guide for the pilot hosts.

**Phase 2 (do not build now, but don't block it):** Mafia (5–12 players; roles المختار, الحكيم, أم العريف, الجار الفضولي, المافيا; Kassa as narrator; points: survive a night +100, successful protect or reveal +150, correct vote +100, village win +200, Mafia win +300), weekly leagues (Bronze → Silver → Gold → Diamond → Legend, 30 players each, top 5 up and bottom 5 down every Friday), streak freezes, the country cup, "Who wrote it?", "Do you know me?", "True or made up?", "Name them all" timed lists, map and picture quizzes, payments (occasion packs, Sahra Plus, Sahra for Teams), native apps with React Native.
