-- Milestone 4: team trivia on the host screen.
-- The room's game state lives in rooms.game_state (server-written only, never
-- readable by clients: it holds the round plan and per-player answers).
-- Answers arrive in room_pending_answers (one per player per question) and are
-- scored at the reveal, so nobody can see an answer's result early.

alter table public.rooms add column state_version integer not null default 0;

-- Clients may read rooms, but not game_state (re-grant every other column).
revoke select on public.rooms from anon, authenticated;
grant select (id, code, host_profile_id, group_id, mood, roast_confirmed_at, status, created_at, last_active_at, expires_at, game, state_version)
  on public.rooms to authenticated;

create table public.room_pending_answers (
  game_id uuid not null references public.games (id) on delete cascade,
  question_index smallint not null,
  room_player_id uuid not null references public.room_players (id) on delete cascade,
  -- Stored option index; the reveal compares it with the answer.
  choice_index smallint not null check (choice_index between 0 and 3),
  time_left smallint not null check (time_left between 0 and 15),
  created_at timestamptz not null default now(),
  primary key (game_id, question_index, room_player_id)
);
alter table public.room_pending_answers enable row level security;
-- No policies: only the service role touches pending answers.

-- One scored answer per player per question in a room game.
create unique index answers_one_per_room_question on public.answers (game_id, question_index, room_player_id)
  where room_player_id is not null;

-- Commits a new room state if the version still matches.
create function public.room_commit(p_room uuid, p_version integer, p_state jsonb, p_status public.room_status default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms
    set game_state = p_state,
        state_version = state_version + 1,
        status = coalesce(p_status, status),
        last_active_at = now(),
        expires_at = now() + interval '6 hours'
    where id = p_room and state_version = p_version and status <> 'ended';
  return found;
end;
$$;

-- Reveal: commits the state and records the scored answers (plus question counters), atomically.
create function public.room_reveal_commit(p_room uuid, p_version integer, p_state jsonb, p_game uuid, p_answers jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb;
begin
  if not public.room_commit(p_room, p_version, p_state) then
    return false;
  end if;
  for a in select * from jsonb_array_elements(p_answers) loop
    insert into public.answers (game_id, question_id, room_player_id, profile_id, question_index, choice_index, correct, time_left, points)
    values (
      p_game,
      a ->> 'question_id',
      (a ->> 'room_player_id')::uuid,
      (select profile_id from public.room_players where id = (a ->> 'room_player_id')::uuid),
      (a ->> 'question_index')::smallint,
      (a ->> 'choice_index')::smallint,
      (a ->> 'correct')::boolean,
      (a ->> 'time_left')::smallint,
      (a ->> 'points')::integer
    )
    on conflict do nothing;
  end loop;
  update public.questions q
    set times_shown = q.times_shown + s.shown, times_correct = q.times_correct + s.correct
    from (
      select a2 ->> 'question_id' as id,
             count(*) as shown,
             count(*) filter (where (a2 ->> 'correct')::boolean) as correct
      from jsonb_array_elements(p_answers) a2
      group by 1
    ) s
    where q.id = s.id;
  return true;
end;
$$;

-- Final: commits the state, saves each player's score and adds XP to their profile.
create function public.room_game_finish(p_room uuid, p_version integer, p_state jsonb, p_game uuid, p_scores jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s jsonb;
  v_profile uuid;
begin
  if not public.room_commit(p_room, p_version, p_state) then
    return false;
  end if;
  update public.games set ended_at = now() where id = p_game and ended_at is null;
  for s in select * from jsonb_array_elements(p_scores) loop
    select profile_id into v_profile from public.room_players where id = (s ->> 'room_player_id')::uuid;
    insert into public.scores (game_id, room_player_id, profile_id, points, xp, badges)
    values (
      p_game,
      (s ->> 'room_player_id')::uuid,
      v_profile,
      (s ->> 'points')::integer,
      (s ->> 'xp')::integer,
      array(select jsonb_array_elements_text(s -> 'badges'))
    );
    if v_profile is not null then
      update public.profiles set total_xp = total_xp + (s ->> 'xp')::integer where id = v_profile;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.room_commit(uuid, integer, jsonb, public.room_status) from public, anon, authenticated;
revoke all on function public.room_reveal_commit(uuid, integer, jsonb, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.room_game_finish(uuid, integer, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.room_commit(uuid, integer, jsonb, public.room_status) to service_role;
grant execute on function public.room_reveal_commit(uuid, integer, jsonb, uuid, jsonb) to service_role;
grant execute on function public.room_game_finish(uuid, integer, jsonb, uuid, jsonb) to service_role;
