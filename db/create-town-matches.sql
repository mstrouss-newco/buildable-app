-- db/create-town-matches.sql
-- Family Town — an original Monopoly-STYLE board game for 3-4 kids in the SAME
-- family, played across devices (turn-based, the chess "poll a row" model).
--
-- Design note (the 3-4 player question): chess used two fixed kid columns
-- (white_kid / black_kid) and a binary `turn`. A board game wants 3-4 seats, so
-- instead of fixed columns we store the seats as a `players` jsonb ARRAY and make
-- `turn` an integer index into it (0..N-1), advanced by (turn + 1) % N. The whole
-- game state still lives in ONE row, so a dropped/late poll self-heals on the next
-- read exactly like chess. Family RLS (parent_id = auth.uid()) is unchanged — it
-- does not care how many kids are in the row.
--
-- Same-device pass-and-play needs NONE of this (it's local). This table is only
-- for cross-device family play. Run ONCE in the Supabase SQL editor, AFTER
-- create-accounts.sql + create-accounts-rls.sql. Idempotent / re-runnable.

create table if not exists town_matches (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  host_kid    uuid not null references kid_profiles(id) on delete cascade,  -- who started the game (seat 0)
  -- The whole game state, all in one row (the chess model, extended to N seats):
  players     jsonb not null default '[]'::jsonb,  -- [{ kid_id, name, seat, color, pos, coins, owns:[spaceIdx...], finished }]
  turn        int  not null default 0,             -- index into players[] whose turn it is (0..N-1)
  laps_target int  not null default 3,             -- game length the kids picked (laps around the board)
  board       jsonb,                               -- the board recipe (spaces, deck seed) so every device renders the same town
  last_roll   jsonb,                               -- { seat, dice:[a,b], from, to, event } so others can animate the move
  reaction    jsonb,                               -- { seat, text } canned reaction only (no free text, ever)
  status      text not null default 'lobby',       -- 'lobby' | 'active' | 'done'
  winner      int,                                 -- winning seat index (most coins), or null
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists town_matches_parent on town_matches(parent_id);
create index if not exists town_matches_host   on town_matches(host_kid);

-- Row-level security: a family only ever sees / edits its OWN matches.
-- (Copied verbatim from chess_matches — the model is identical regardless of seat count.)
alter table town_matches enable row level security;

drop policy if exists town_by_family on town_matches;
create policy town_by_family on town_matches
  for all
  using      (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- keep updated_at fresh so the other devices can poll for changes
create or replace function touch_town_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists town_match_touch on town_matches;
create trigger town_match_touch before update on town_matches
  for each row execute function touch_town_match();
