-- Milestone 7: content admin + pilot analytics.

-- Kassa's lines live in the database so an admin can approve drafts without a deploy.
-- Imported from content/kassa.ar.json (id = "event:mood:n"). Only approved lines are shown.
create table public.kassa_lines (
  id text primary key,
  lang text not null check (lang in ('ar', 'en')),
  event text not null,
  mood public.mood not null,
  text text not null,
  status public.content_status not null default 'draft',
  updated_at timestamptz not null default now()
);
alter table public.kassa_lines enable row level security;
create policy kassa_lines_select on public.kassa_lines for select to anon, authenticated
  using (status = 'approved' or public.is_admin());
create policy kassa_lines_admin on public.kassa_lines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Numbers for the pilot's go/no-go decision (dates are Amman calendar days).
--   rooms created, average players per room, average night length,
--   replay rate (% of rooms that started a second game), share rate (% of players
--   who shared), and solo day-1 / day-7 return rates (by first solo game day).
create function public.pilot_metrics(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
with r as (
  select
    r.id, r.code, r.status, r.created_at,
    (r.created_at at time zone 'Asia/Amman')::date as day,
    (select count(*) from public.room_players p where p.room_id = r.id) as players,
    (select count(*) from public.games g where g.room_id = r.id) as games,
    (select count(*) from public.events e where e.room_id = r.id and e.name = 'share_clicked') as shares,
    extract(epoch from (r.last_active_at - r.created_at)) / 60 as minutes
  from public.rooms r
  where (r.created_at at time zone 'Asia/Amman')::date between p_from and p_to
),
active as (
  -- Players who finished a game that day (solo or in a room).
  select distinct (g.started_at at time zone 'Asia/Amman')::date as day, coalesce(s.profile_id, rp.profile_id) as pid
  from public.scores s
  join public.games g on g.id = s.game_id
  left join public.room_players rp on rp.id = s.room_player_id
  where (g.started_at at time zone 'Asia/Amman')::date between p_from and p_to
),
sharers as (
  select distinct (e.created_at at time zone 'Asia/Amman')::date as day, e.profile_id as pid
  from public.events e
  where e.name = 'share_clicked' and e.profile_id is not null
    and (e.created_at at time zone 'Asia/Amman')::date between p_from and p_to
),
days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
per_day as (
  select
    d.day,
    (select count(*) from r where r.day = d.day) as rooms_created,
    (select round(avg(players)::numeric, 1) from r where r.day = d.day and players > 0) as avg_players,
    (select round(avg(minutes)::numeric, 1) from r where r.day = d.day and games > 0) as avg_night_minutes,
    (select round(100.0 * count(*) filter (where games >= 2) / nullif(count(*) filter (where games >= 1), 0), 1)
       from r where r.day = d.day) as replay_rate,
    (select round(100.0 * count(*) / nullif((select count(*) from active a where a.day = d.day and a.pid is not null), 0), 1)
       from sharers s where s.day = d.day and exists (select 1 from active a where a.day = d.day and a.pid = s.pid)) as share_rate
  from days d
),
solo as (
  select distinct g.profile_id as pid, (g.started_at at time zone 'Asia/Amman')::date as day
  from public.games g
  where g.room_id is null and g.profile_id is not null and g.ended_at is not null
),
cohort as (
  select pid, min(day) as first_day from solo group by pid having min(day) between p_from and p_to
)
select jsonb_build_object(
  'from', p_from,
  'to', p_to,
  'days', (select coalesce(jsonb_agg(to_jsonb(per_day) order by day), '[]'::jsonb) from per_day),
  'rooms', (select coalesce(jsonb_agg(jsonb_build_object(
      'code', code, 'day', day, 'status', status, 'players', players, 'games', games,
      'minutes', round(minutes::numeric, 1), 'shares', shares, 'replayed', games >= 2
    ) order by created_at desc), '[]'::jsonb) from r),
  'totals', jsonb_build_object(
    'rooms', (select count(*) from r),
    'avg_players', (select round(avg(players)::numeric, 1) from r where players > 0),
    'avg_night_minutes', (select round(avg(minutes)::numeric, 1) from r where games > 0),
    'replay_rate', (select round(100.0 * count(*) filter (where games >= 2) / nullif(count(*) filter (where games >= 1), 0), 1) from r),
    'share_rate', (
      select round(100.0 * count(distinct s.pid) / nullif((select count(distinct pid) from active where pid is not null), 0), 1)
      from sharers s where exists (select 1 from active a where a.pid = s.pid)
    ),
    'solo_cohort', (select count(*) from cohort),
    'solo_d1', (select round(100.0 * count(*) filter (where exists (select 1 from solo s where s.pid = c.pid and s.day = c.first_day + 1)) / nullif(count(*), 0), 1) from cohort c),
    'solo_d7', (select round(100.0 * count(*) filter (where exists (select 1 from solo s where s.pid = c.pid and s.day = c.first_day + 7)) / nullif(count(*), 0), 1) from cohort c)
  )
);
$$;

revoke all on function public.pilot_metrics(date, date) from public, anon, authenticated;
grant execute on function public.pilot_metrics(date, date) to service_role;
