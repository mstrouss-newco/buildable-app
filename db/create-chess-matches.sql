-- db/create-chess-matches.sql
-- Online chess between two kids in the SAME family (siblings on different devices).
-- Requires the parent/email account lane (kid profiles must live in the DB so the
-- same kid identity is shared across devices). Guest/device-local kids can't play
-- cross-device because they only exist on one device.
--
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql + create-accounts-rls.sql.

create table if not exists chess_matches (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  white_kid   uuid not null references kid_profiles(id) on delete cascade,  -- who started (Purple)
  black_kid   uuid not null references kid_profiles(id) on delete cascade,  -- the invited sibling (Coral)
  world       text not null default 'jungle',   -- which scene they're playing in
  board       jsonb,                              -- current board state (the game's own format)
  turn        text not null default 'w',          -- 'w' | 'b'
  last_move   jsonb,                              -- {from:[r,c],to:[r,c],...} for animating the opponent's move
  status      text not null default 'active',     -- 'active' | 'done'
  winner      text,                               -- 'w' | 'b' | 'draw' | null
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists chess_matches_parent on chess_matches(parent_id);
create index if not exists chess_matches_kids   on chess_matches(white_kid, black_kid);

-- Row-level security: a family only ever sees/edits its OWN matches.
alter table chess_matches enable row level security;

drop policy if exists chess_by_family on chess_matches;
create policy chess_by_family on chess_matches
  for all
  using      (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- keep updated_at fresh so the other device can poll for changes
create or replace function touch_chess_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists chess_match_touch on chess_matches;
create trigger chess_match_touch before update on chess_matches
  for each row execute function touch_chess_match();
