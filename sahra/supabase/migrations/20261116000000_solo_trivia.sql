-- Milestone 2: solo trivia.
-- The server keeps each solo game's state machine in games.progress and
-- commits every step with optimistic locking (games.version), so a double
-- tap or a replayed request can never score twice.

alter table public.games
  add column progress jsonb,
  add column version integer not null default 0;

-- One daily challenge per player per (Amman) day.
create unique index games_one_daily_per_day on public.games (profile_id, (settings ->> 'date'))
  where type = 'trivia_daily';

-- Commits a new solo state if nobody else did first. Optionally records an answer
-- and bumps the question's shown/correct counters (used by the nightly recalibration).
create function public.solo_commit(
  p_game uuid,
  p_version integer,
  p_progress jsonb,
  p_answer jsonb default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.games
    set progress = p_progress, version = version + 1
    where id = p_game and version = p_version and ended_at is null;
  if not found then
    return false;
  end if;

  if p_answer is not null then
    insert into public.answers (game_id, question_id, profile_id, question_index, choice_index, correct, time_left, points)
    select
      p_game,
      p_answer ->> 'question_id',
      g.profile_id,
      (p_answer ->> 'question_index')::smallint,
      (p_answer ->> 'choice_index')::smallint,
      (p_answer ->> 'correct')::boolean,
      (p_answer ->> 'time_left')::smallint,
      (p_answer ->> 'points')::integer
    from public.games g where g.id = p_game;

    update public.questions
      set times_shown = times_shown + 1,
          times_correct = times_correct + case when (p_answer ->> 'correct')::boolean then 1 else 0 end
      where id = p_answer ->> 'question_id';
  end if;
  return true;
end;
$$;

-- Ends a solo game: score row, XP and the daily play streak, all at once.
create function public.solo_finish(
  p_game uuid,
  p_version integer,
  p_progress jsonb,
  p_points integer,
  p_xp integer,
  p_badges text[],
  p_current_streak integer,
  p_longest_streak integer,
  p_played_on date
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
begin
  update public.games
    set progress = p_progress, version = version + 1, ended_at = now()
    where id = p_game and version = p_version and ended_at is null
    returning profile_id into v_profile;
  if not found then
    return false;
  end if;

  insert into public.scores (game_id, profile_id, points, xp, badges)
  values (p_game, v_profile, p_points, p_xp, p_badges);

  update public.profiles
    set total_xp = total_xp + p_xp,
        current_streak = p_current_streak,
        longest_streak = greatest(longest_streak, p_longest_streak),
        last_played_on = p_played_on
    where id = v_profile;
  return true;
end;
$$;

revoke all on function public.solo_commit(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.solo_finish(uuid, integer, jsonb, integer, integer, text[], integer, integer, date)
  from public, anon, authenticated;
grant execute on function public.solo_commit(uuid, integer, jsonb, jsonb) to service_role;
grant execute on function public.solo_finish(uuid, integer, jsonb, integer, integer, text[], integer, integer, date)
  to service_role;

-- Players read their own progress through the API, not directly: the column
-- holds the round plan (question ids), which is harmless but not needed client-side.
-- (A column can't be revoked while the table grant stands, so re-grant the rest.)
revoke select on public.games from anon, authenticated;
grant select (id, room_id, profile_id, type, settings, started_at, ended_at, version) on public.games to authenticated;
