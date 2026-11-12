-- Sahra: initial schema.
-- Every table has RLS on. Players can read their own data and their groups'
-- data. Scores, answers, rooms, votes and prompt answers are written only by
-- server route handlers using the service-role key (which bypasses RLS).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.mood as enum ('family', 'friends', 'roast');
create type public.content_status as enum ('draft', 'approved', 'retired');
create type public.difficulty as enum ('easy', 'medium', 'hard', 'legend');
create type public.room_status as enum ('lobby', 'playing', 'ended');
create type public.game_type as enum (
  'trivia_classic', 'trivia_daily', 'trivia_sudden', 'trivia_team', 'charades', 'who_among_us'
);

-- ---------------------------------------------------------------------------
-- Profiles and groups
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  avatar_color text not null default '#12A6A0' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  -- Nullable. Under 18 => Family mood only and no public leagues.
  birth_year smallint check (birth_year between 1900 and 2100),
  total_xp integer not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_played_on date,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index on public.group_members (profile_id);

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[0-9]{4}$'),
  host_profile_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  mood public.mood not null default 'family',
  roast_confirmed_at timestamptz,
  status public.room_status not null default 'lobby',
  -- Public game state only; never private data such as a charades word for players.
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  -- Roast mood needs the host's explicit 18+ confirmation.
  constraint roast_needs_confirmation check (mood <> 'roast' or roast_confirmed_at is not null)
);
-- A code is unique among rooms that haven't ended.
create unique index rooms_active_code on public.rooms (code) where status <> 'ended';
create index on public.rooms (host_profile_id);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  guest_device_id text check (char_length(guest_device_id) <= 64),
  display_name text not null check (char_length(display_name) between 1 and 40),
  name_flagged boolean not null default false,
  avatar_color text not null default '#FFC93C' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  team smallint check (team in (1, 2)),
  joined_at timestamptz not null default now(),
  consent_at timestamptz,
  constraint player_identity check (profile_id is not null or guest_device_id is not null)
);
-- Reconnect: one seat per device per room.
create unique index room_players_device on public.room_players (room_id, guest_device_id)
  where guest_device_id is not null;
create index on public.room_players (profile_id);

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  type public.game_type not null,
  settings jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint game_owner check (room_id is not null or profile_id is not null)
);
create index on public.games (room_id);
create index on public.games (profile_id);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.questions (
  id text primary key,
  lang text not null check (lang in ('ar', 'en')),
  category text not null check (category in (
    'geo', 'sport', 'food', 'hist', 'sci', 'tv', 'lang', 'flags', 'logos', 'music', 'riddles', 'maps'
  )),
  difficulty public.difficulty not null,
  country_tags text[] not null default '{}',
  question text not null,
  options text[] not null check (cardinality(options) = 4),
  answer_index smallint not null check (answer_index between 0 and 3),
  explanation text,
  source_url text,
  status public.content_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  times_shown integer not null default 0,
  times_correct integer not null default 0,
  created_at timestamptz not null default now(),
  -- No invented facts: approved questions must cite a source.
  constraint approved_needs_source check (status <> 'approved' or source_url is not null)
);
create index on public.questions (status, lang, category, difficulty);

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id text not null references public.questions (id) on delete cascade,
  reporter_profile_id uuid references public.profiles (id) on delete set null,
  reporter_device_id text,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on public.question_reports (reporter_profile_id);

create table public.charades_words (
  id uuid primary key default gen_random_uuid(),
  lang text not null check (lang in ('ar', 'en')),
  word text not null,
  category text not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  status public.content_status not null default 'draft',
  unique (lang, word)
);

create table public.prompts (
  id text primary key,
  lang text not null check (lang in ('ar', 'en')),
  text text not null,
  mood_min public.mood not null default 'family',
  status public.content_status not null default 'draft'
);

-- "Who among us?" traits (not in the original table list; needed for the templates).
create table public.traits (
  id text primary key,
  lang text not null check (lang in ('ar', 'en')),
  text text not null,
  mood_min public.mood not null default 'family',
  banned boolean not null default false,
  status public.content_status not null default 'draft',
  constraint banned_never_approved check (not (banned and status = 'approved'))
);

-- ---------------------------------------------------------------------------
-- Play data
-- ---------------------------------------------------------------------------
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  room_player_id uuid references public.room_players (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  question_index smallint not null default 0,
  choice_index smallint check (choice_index between 0 and 3), -- null = timeout
  correct boolean not null,
  time_left smallint not null check (time_left between 0 and 15),
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  constraint answer_player check (room_player_id is not null or profile_id is not null)
);
create index on public.answers (game_id);
create index on public.answers (profile_id, created_at);

create table public.prompt_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  room_player_id uuid not null references public.room_players (id) on delete cascade,
  prompt_id text not null references public.prompts (id) on delete cascade,
  answer_text text not null check (char_length(answer_text) <= 280),
  flagged boolean not null default false,
  saved_by_group boolean not null default false,
  created_at timestamptz not null default now(),
  delete_after timestamptz not null default now() + interval '30 days'
);
create index on public.prompt_answers (room_id);
create index on public.prompt_answers (delete_after);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  round smallint not null,
  voter_id uuid not null references public.room_players (id) on delete cascade,
  target_id uuid not null references public.room_players (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, round, voter_id),
  constraint no_self_vote check (voter_id <> target_id)
);

create table public.titles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete set null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  room_player_id uuid not null references public.room_players (id) on delete cascade,
  title_text text not null,
  created_at timestamptz not null default now()
);
create index on public.titles (group_id);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  room_player_id uuid references public.room_players (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  points integer not null check (points >= 0),
  xp integer not null check (xp >= 0),
  badges text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint score_player check (room_player_id is not null or profile_id is not null)
);
create index on public.scores (profile_id, created_at);
create index on public.scores (game_id);

create table public.daily_challenges (
  date date primary key,
  question_id text not null references public.questions (id)
);

-- Analytics (pilot go/no-go). Written by server routes only.
create table public.events (
  id bigint generated always as identity primary key,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  profile_id uuid references public.profiles (id) on delete set null,
  device_id text,
  room_id uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.events (name, created_at);

-- Log of automatic difficulty changes made by the nightly job.
create table public.difficulty_changes (
  id bigint generated always as identity primary key,
  question_id text not null references public.questions (id) on delete cascade,
  from_difficulty public.difficulty not null,
  to_difficulty public.difficulty not null,
  times_shown integer not null,
  times_correct integer not null,
  changed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New auth user => profile row (anonymous guests included).
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, locale)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'locale', 'ar'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Group owner is always a member.
create function public.handle_new_group() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null then
    insert into public.group_members (group_id, profile_id, role)
    values (new.id, new.owner_id, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- ---------------------------------------------------------------------------
-- RLS helper functions (security definer so policies don't recurse).
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members where group_id = gid and profile_id = auth.uid()
  );
$$;

create function public.shares_group_with(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.profile_id = auth.uid() and b.profile_id = pid
  );
$$;

-- Host of the room, a seated player, or a member of the room's group.
create function public.can_see_room(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rooms r
    where r.id = rid
      and (
        r.host_profile_id = auth.uid()
        or (r.group_id is not null and public.is_group_member(r.group_id))
        or exists (
          select 1 from public.room_players p where p.room_id = r.id and p.profile_id = auth.uid()
        )
      )
  );
$$;

create function public.owns_room_player(rpid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_players where id = rpid and profile_id = auth.uid()
  );
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_group() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.questions enable row level security;
alter table public.question_reports enable row level security;
alter table public.charades_words enable row level security;
alter table public.prompts enable row level security;
alter table public.traits enable row level security;
alter table public.answers enable row level security;
alter table public.prompt_answers enable row level security;
alter table public.votes enable row level security;
alter table public.titles enable row level security;
alter table public.scores enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.events enable row level security;
alter table public.difficulty_changes enable row level security;

-- profiles: read yourself, people in your groups, or anything as admin.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id) or public.is_admin());
-- Players edit only harmless columns; XP, streaks and is_admin are server-only.
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_color, locale, birth_year) on public.profiles to authenticated;

-- groups
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id) or public.is_admin());
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- group_members: members see each other; owners manage; anyone may leave.
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());
create policy group_members_insert on public.group_members for insert to authenticated
  with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy group_members_delete on public.group_members for delete to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- rooms / room_players / games: read-only for those involved. Writes are server-only.
create policy rooms_select on public.rooms for select to authenticated
  using (public.can_see_room(id) or public.is_admin());
create policy room_players_select on public.room_players for select to authenticated
  using (public.can_see_room(room_id) or public.is_admin());
create policy games_select on public.games for select to authenticated
  using (
    profile_id = auth.uid()
    or (room_id is not null and public.can_see_room(room_id))
    or public.is_admin()
  );

-- questions: never readable by players (the answer index would leak).
-- Players get questions through server routes that strip answer_index.
create policy questions_admin_all on public.questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- question_reports: a signed-in player may file one as themselves; admins manage.
create policy question_reports_insert on public.question_reports for insert to authenticated
  with check (reporter_profile_id = auth.uid());
create policy question_reports_select_own on public.question_reports for select to authenticated
  using (reporter_profile_id = auth.uid() or public.is_admin());
create policy question_reports_admin_update on public.question_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Lighter content: approved rows are public; admins manage everything.
create policy charades_select on public.charades_words for select to anon, authenticated
  using (status = 'approved' or public.is_admin());
create policy charades_admin on public.charades_words for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy prompts_select on public.prompts for select to anon, authenticated
  using (status = 'approved' or public.is_admin());
create policy prompts_admin on public.prompts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy traits_select on public.traits for select to anon, authenticated
  using ((status = 'approved' and not banned) or public.is_admin());
create policy traits_admin on public.traits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- answers / scores: your own, or from rooms you can see.
create policy answers_select on public.answers for select to authenticated
  using (
    profile_id = auth.uid()
    or (room_player_id is not null and public.owns_room_player(room_player_id))
    or public.is_admin()
  );
create policy scores_select on public.scores for select to authenticated
  using (
    profile_id = auth.uid()
    or (room_player_id is not null and public.owns_room_player(room_player_id))
    or exists (
      select 1 from public.games g
      where g.id = game_id and g.room_id is not null and public.can_see_room(g.room_id)
    )
    or public.is_admin()
  );

-- prompt_answers: secret. Only the author can see their own; the host's
-- server route reads them for the reveal. Admins don't get access either.
create policy prompt_answers_select_own on public.prompt_answers for select to authenticated
  using (public.owns_room_player(room_player_id));

-- votes: only your own vote is visible; tallies go through the host's broadcast.
create policy votes_select_own on public.votes for select to authenticated
  using (public.owns_room_player(voter_id));

-- titles: group history, or the room you were in.
create policy titles_select on public.titles for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or public.can_see_room(room_id)
    or public.is_admin()
  );

-- daily_challenges: which question is today's is public (not the answer).
create policy daily_select on public.daily_challenges for select to anon, authenticated
  using (true);

-- events / difficulty_changes: admins read; server writes.
create policy events_admin_select on public.events for select to authenticated
  using (public.is_admin());
create policy difficulty_changes_admin_select on public.difficulty_changes for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Nightly maintenance
-- ---------------------------------------------------------------------------

-- Deletes secret answers past their 30-day window unless the group saved them.
create function public.purge_expired_prompt_answers() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.prompt_answers where delete_after < now() and not saved_by_group;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Approved questions with >= 50 answers: correct rate > 85% => one level easier,
-- < 25% => one level harder. Each change is logged, then the counters reset so
-- the next change is based on answers at the new difficulty.
create function public.recalibrate_question_difficulty() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  q record;
  levels public.difficulty[] := array['easy', 'medium', 'hard', 'legend']::public.difficulty[];
  pos integer;
  target public.difficulty;
  n integer := 0;
begin
  for q in
    select id, difficulty, times_shown, times_correct
    from public.questions
    where status = 'approved' and times_shown >= 50
    for update
  loop
    pos := array_position(levels, q.difficulty);
    target := null;
    if q.times_correct::numeric / q.times_shown > 0.85 and pos > 1 then
      target := levels[pos - 1];
    elsif q.times_correct::numeric / q.times_shown < 0.25 and pos < 4 then
      target := levels[pos + 1];
    end if;
    if target is not null then
      insert into public.difficulty_changes (question_id, from_difficulty, to_difficulty, times_shown, times_correct)
      values (q.id, q.difficulty, target, q.times_shown, q.times_correct);
      update public.questions
        set difficulty = target, times_shown = 0, times_correct = 0
        where id = q.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Ends rooms that expired after 6 hours of inactivity (frees their codes).
create function public.expire_rooms() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.rooms set status = 'ended' where status <> 'ended' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.nightly_maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return jsonb_build_object(
    'prompt_answers_deleted', public.purge_expired_prompt_answers(),
    'questions_recalibrated', public.recalibrate_question_difficulty(),
    'rooms_expired', public.expire_rooms()
  );
end;
$$;

revoke all on function public.purge_expired_prompt_answers() from public, anon, authenticated;
revoke all on function public.recalibrate_question_difficulty() from public, anon, authenticated;
revoke all on function public.expire_rooms() from public, anon, authenticated;
revoke all on function public.nightly_maintenance() from public, anon, authenticated;
