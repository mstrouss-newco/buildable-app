-- db/create-accounts.sql
-- ---------------------------------------------------------------
-- Parent/Teacher accounts + lightweight kid profiles, so a child's
-- creations (songs, games, heroes) FOLLOW the child across devices
-- once a grown-up signs in. COPPA-standard model: ONE real credentialed
-- login belongs to a parent/teacher; kids pick a profile by tapping an
-- avatar (no kid passwords).
--
-- Run ONCE in the Supabase SQL editor. Additive + idempotent.
-- NOTHING is deleted. Run create-accounts-rls.sql AFTER this one.
--
-- NOTE: parent_accounts.id IS the Supabase Auth user id (auth.users.id).
-- There is no separate auth_user_id column -- the primary key doubles as
-- the auth link, which keeps RLS simple (id = auth.uid()).
-- ---------------------------------------------------------------

-- 0. saved_songs was never created in earlier work; create it here so the
--    Music feature persists. Columns match /api/save-song.js + /api/list-songs.js.
create table if not exists saved_songs (
  id           uuid primary key default gen_random_uuid(),
  song_id      text unique not null,
  device_id    text not null,
  kid_name     text,
  title        text not null,
  prompt       text,
  vibe         text,
  theme        text,
  audio_url    text,
  cover_color  text,
  duration_sec numeric,
  provider     text default 'demo',
  meta         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_saved_songs_device on saved_songs (device_id);

-- 1. Adult account: 1:1 with Supabase Auth. id = auth.users(id). The
--    password lives in auth.users (managed by Supabase Auth), never here.
create table if not exists parent_accounts (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

-- 2. Kid profile: tap-a-tile, no password. Belongs to one parent.
create table if not exists kid_profiles (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent_accounts(id) on delete cascade,
  name        text not null,
  avatar      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_kid_profiles_parent on kid_profiles (parent_id);

-- 3. Link a child's songs & games to their profile (nullable: anonymous
--    device-lane rows leave this null).
alter table saved_songs add column if not exists kid_profile_id uuid
  references kid_profiles(id) on delete set null;
alter table saved_games add column if not exists kid_profile_id uuid
  references kid_profiles(id) on delete set null;

create index if not exists idx_saved_songs_kid_profile on saved_songs (kid_profile_id);
create index if not exists idx_saved_games_kid_profile on saved_games (kid_profile_id);
