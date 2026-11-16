-- Milestone 3: rooms.
-- Realtime channels are private: one per room ("room:1234") plus one private
-- channel per player ("room:1234:p:<seat id>") for secrets such as a charades
-- word or a future Mafia role. Clients may only receive messages and publish
-- their own presence; every game message is sent by the server (service role),
-- so nobody can forge a message as another player or as the host.

alter table public.rooms
  add column game text check (game in ('trivia_team', 'charades', 'who_among_us', 'mafia'));

alter table public.room_players
  add column removed_at timestamptz;

create index rooms_code_active on public.rooms (code) where status <> 'ended';

-- Who may use a realtime topic:
--   room:CODE            the room's host and its seated players
--   room:CODE:p:SEAT_ID  only the player in that seat
create function public.can_use_room_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_topic, ':');
  v_room uuid;
  v_host uuid;
begin
  if parts[1] is distinct from 'room' or coalesce(array_length(parts, 1), 0) not in (2, 4) then
    return false;
  end if;
  select id, host_profile_id into v_room, v_host
    from public.rooms
    where code = parts[2] and status <> 'ended' and expires_at > now();
  if v_room is null or auth.uid() is null then
    return false;
  end if;
  if array_length(parts, 1) = 2 then
    return v_host = auth.uid() or exists (
      select 1 from public.room_players
      where room_id = v_room and profile_id = auth.uid() and removed_at is null
    );
  end if;
  return parts[3] = 'p' and exists (
    select 1 from public.room_players
    where room_id = v_room and id::text = parts[4] and profile_id = auth.uid() and removed_at is null
  );
end;
$$;

grant execute on function public.can_use_room_topic(text) to authenticated;

-- Realtime Authorization policies (the realtime schema only exists on Supabase).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'realtime' and c.relname = 'messages') then
    execute $p$
      create policy sahra_room_receive on realtime.messages for select to authenticated
      using (public.can_use_room_topic(realtime.topic()))
    $p$;
    -- Clients may only publish presence (who's here, and whether they're in the app).
    execute $p$
      create policy sahra_room_presence on realtime.messages for insert to authenticated
      with check (realtime.messages.extension = 'presence' and public.can_use_room_topic(realtime.topic()))
    $p$;
  end if;
end
$$;
