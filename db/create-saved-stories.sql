-- db/create-saved-stories.sql
-- Buildable Stories: persist generated picture-books per kid/parent profile so a
-- child's stories follow them across devices (same model as saved_songs/saved_games).
-- Run ONCE in the Supabase SQL editor. Idempotent ("if not exists"); no data deleted.
--
-- The full structured story (title + pages[] with text, art_prompt, art_url,
-- effect, audio_url, word_timings) is stored as JSONB in `story` so the reader can
-- rehydrate the whole book from one row.

create table if not exists saved_stories (
  id              bigint generated always as identity primary key,
  story_id        text not null unique,        -- client-stable id
  device_id       text not null,               -- anonymous device lane
  kid_profile_id  uuid references kid_profiles(id) on delete set null,
  kid_name        text,
  title           text not null,
  world           text,
  cover_color     text,
  story           jsonb not null,              -- full structured story plan
  created_at      timestamptz not null default now()
);

create index if not exists saved_stories_device_idx on saved_stories (device_id, created_at desc);
create index if not exists saved_stories_kid_idx     on saved_stories (kid_profile_id);

-- RLS to match the accounts lane (service key bypasses it for the device lane,
-- exactly like saved_songs/saved_games).
alter table saved_stories enable row level security;
drop policy if exists stories_by_family on saved_stories;
create policy stories_by_family on saved_stories
  for all
  using     (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()))
  with check (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()));

-- Verify:
-- select count(*) from saved_stories;
