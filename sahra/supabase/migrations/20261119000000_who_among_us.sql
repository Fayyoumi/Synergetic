-- Milestone 6: secret prompts + "Who among us?".

-- A player answers (or skips) each prompt once per room. Skips are recorded
-- so the prompt flow knows where each player is; they have no text.
alter table public.prompt_answers add column skipped boolean not null default false;
create unique index prompt_answers_one_per_player on public.prompt_answers (room_player_id, prompt_id);

-- Votes are written by the server (one per voter per round, never for yourself:
-- see the existing unique index and no_self_vote check).
create index votes_game_round on public.votes (game_id, round);

-- Titles of the night are readable by the people who were there (existing policy)
-- and listed newest first.
create index titles_room on public.titles (room_id, created_at desc);
