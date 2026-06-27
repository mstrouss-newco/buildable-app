-- db/create-checkers-matches.sql
-- Online checkers between two kids in the SAME family (siblings on different devices).
-- This is a copy of chess_matches (the turn-based "poll a row" model in MULTIPLAYER.md,
-- Pattern A) with the SAME family row-level-security policy. The whole game lives in one
-- row; a move PATCHes it; the other device re-reads it every ~2s.
--
-- Requires the parent/email account lane (kid profiles must live in the DB so the same
-- kid identity is shared across devices). Guest/device-local kids can't play cross-device
-- because they only exist on one device.
--
-- SAFE + IDEMPOTENT: uses CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS
-- so it can be re-run. It does NOT drop or delete any data.
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql + create-accounts-rls.sql.

create table if not exists checkers_matches (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  red_kid     uuid not null references kid_profiles(id) on delete cascade,  -- who started (Purple, moves first)
  blue_kid    uuid not null references kid_profiles(id) on delete cascade,  -- the invited sibling (Coral)
  world       text not null default 'jungle',   -- which scene they're playing in
  board       jsonb,                              -- current board state (the game's own format)
  turn        text not null default 'r',          -- 'r' (red/Purple) | 'b' (blue/Coral)
  last_move   jsonb,                              -- {from:[r,c],to:[r,c],path:[...]} for animating the opponent's move
  status      text not null default 'active',     -- 'active' | 'done'
  winner      text,                               -- 'r' | 'b' | 'draw' | null
  reaction    jsonb,                              -- canned reaction ("Nice move!"); no free text
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists checkers_matches_parent on checkers_matches(parent_id);
create index if not exists checkers_matches_kids   on checkers_matches(red_kid, blue_kid);

-- Row-level security: a family only ever sees/edits its OWN matches.
alter table checkers_matches enable row level security;

drop policy if exists checkers_by_family on checkers_matches;
create policy checkers_by_family on checkers_matches
  for all
  using      (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- keep updated_at fresh so the other device can poll for changes
create or replace function touch_checkers_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists checkers_match_touch on checkers_matches;
create trigger checkers_match_touch before update on checkers_matches
  for each row execute function touch_checkers_match();
