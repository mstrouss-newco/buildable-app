-- db/create-word-matches.sql
-- Turn-based online Word Buddies between two kids in the SAME family (siblings on
-- different devices). This is the "poll a row" model (MULTIPLAYER.md, Pattern A) —
-- a direct copy of chess_matches: one row holds the whole game, a move PATCHes it,
-- the other device re-reads every ~2s. Pass-and-play (same device) needs NONE of this.
--
-- NOTE: v1 of Word Buddies ships SAME-DEVICE pass-and-play first; this table is the
-- scaffold so cross-device turn-based play can be added later without rework
-- (build src/lib/wordMatches.js + src/FamilyWord.jsx like chessMatches.js/FamilyChess.jsx).
--
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql + create-accounts-rls.sql.

create table if not exists word_matches (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  p1_kid      uuid not null references kid_profiles(id) on delete cascade,  -- who started (Purple)
  p2_kid      uuid not null references kid_profiles(id) on delete cascade,  -- the invited sibling (Coral)
  board       jsonb,                              -- committed board letters (the engine's own format)
  bag         jsonb,                              -- remaining tile bag (server-authoritative draw order)
  racks       jsonb,                              -- { p1:[...], p2:[...] } each kid's current tiles
  scores      jsonb default '{"p1":0,"p2":0}'::jsonb,
  turn        text not null default 'p1',          -- 'p1' | 'p2'
  last_word   jsonb,                              -- {word, cells:[...]} for showing the opponent's play
  reaction    text,                               -- canned reaction only (no free text) — see ALLOWED list
  status      text not null default 'active',     -- 'active' | 'done'
  winner      text,                               -- 'p1' | 'p2' | 'tie' | null
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists word_matches_parent on word_matches(parent_id);
create index if not exists word_matches_kids   on word_matches(p1_kid, p2_kid);

-- Row-level security: a family only ever sees/edits its OWN matches (copy of chess policy).
alter table word_matches enable row level security;

drop policy if exists word_by_family on word_matches;
create policy word_by_family on word_matches
  for all
  using      (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- keep updated_at fresh so the other device can poll for changes
create or replace function touch_word_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists word_match_touch on word_matches;
create trigger word_match_touch before update on word_matches
  for each row execute function touch_word_match();
