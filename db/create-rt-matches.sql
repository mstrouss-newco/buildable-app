-- db/create-rt-matches.sql
-- Lobby/score rows for REAL-TIME two-player games (tennis, pong, ...). One generic
-- table for ALL real-time games (distinguished by the `game` column) — the live
-- ball/paddle state travels over Supabase Realtime Broadcast, NOT through this table.
-- Same family model as chess: cross-device play needs the parent/email account lane,
-- so kid identities are shared across devices.
--
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql + create-accounts-rls.sql.
-- Idempotent + NON-DESTRUCTIVE (create if not exists; no drops of data).

create table if not exists rt_matches (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  game        text not null,                       -- 'tennis' | 'pong' | ...
  host_kid    uuid not null references kid_profiles(id) on delete cascade,  -- started it; owns the ball
  guest_kid   uuid not null references kid_profiles(id) on delete cascade,  -- the invited sibling
  world       text not null default 'default',     -- which look/scene
  settings    jsonb default '{}'::jsonb,           -- agreed options (ball speed, points-to-win...)
  status      text not null default 'open',        -- 'open' | 'playing' | 'done'
  winner      text,                                 -- 'host' | 'guest' | 'draw' | null
  score       jsonb,                                -- final score, e.g. {"host":11,"guest":8}
  reaction    jsonb,                                -- last canned reaction (kid-safe; no free text)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists rt_matches_parent on rt_matches(parent_id);
create index if not exists rt_matches_lookup on rt_matches(game, host_kid, guest_kid);

-- Row-level security: a family only ever sees/edits its OWN matches.
alter table rt_matches enable row level security;

drop policy if exists rt_by_family on rt_matches;
create policy rt_by_family on rt_matches
  for all
  using      (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- keep updated_at fresh (lobby polling for "your sibling joined" before the live channel opens)
create or replace function touch_rt_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists rt_match_touch on rt_matches;
create trigger rt_match_touch before update on rt_matches
  for each row execute function touch_rt_match();

-- Verify:
-- select id, game, status, winner, score from rt_matches order by updated_at desc;
