-- db/create-accounts.sql
-- ---------------------------------------------------------------
-- Parent/Teacher accounts + lightweight kid profiles, so a child's
-- creations (songs, games, heroes) can FOLLOW the child across devices
-- once a grown-up signs in. COPPA-standard model: ONE real credentialed
-- login belongs to a parent/teacher; kids pick a profile by tapping an
-- avatar (no kid passwords).
--
-- Run ONCE in the Supabase SQL editor (project: mstrouss-newco's Project).
-- Additive + idempotent ("if not exists" / "add column if not exists").
-- NOTHING is deleted. Run create-accounts-rls.sql AFTER this one.
-- ---------------------------------------------------------------

-- 1. Adult account: 1:1 with Supabase Auth. The password lives in
--    auth.users (managed by Supabase Auth) and is NEVER stored here.
create table if not exists parent_accounts (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  account_type text not null default 'parent',   -- 'parent' | 'teacher'
  consent_at   timestamptz,                       -- verifiable parental-consent record (COPPA)
  created_at   timestamptz not null default now()
);

-- 2. Lightweight kid profiles under an adult. NO credentials here:
--    a kid "logs in" by tapping their tile, gated behind the adult session.
--    avatar is an emoji or sprite key only -- never a photo.
create table if not exists kid_profiles (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references parent_accounts(id) on delete cascade,
  display_name text not null,
  avatar       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_kid_profiles_parent on kid_profiles(parent_id);

-- 3. Additive owner column on the existing creation tables. NULLABLE on
--    purpose: existing rows + the no-login "anonymous device" lane keep
--    working with kid_profile_id = null. When a kid is signed in under a
--    parent, saves stamp kid_profile_id so creations follow the child.
alter table saved_songs add column if not exists kid_profile_id uuid references kid_profiles(id) on delete set null;
alter table saved_games add column if not exists kid_profile_id uuid references kid_profiles(id) on delete set null;

create index if not exists idx_saved_songs_kid_profile on saved_songs(kid_profile_id);
create index if not exists idx_saved_games_kid_profile on saved_games(kid_profile_id);
