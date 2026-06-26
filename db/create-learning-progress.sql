-- Create the learning_progress table so a kid's Learning Mode data (settings,
-- progress/badges/streak, and the "practice what you missed" queue) can follow
-- them across devices when a grown-up is signed in.
-- Run ONCE in the Supabase SQL editor (project: mstrouss-newco's Project).
-- Safe / idempotent: uses "if not exists". No data is deleted.
--
-- One row per kid profile. The whole Learning Mode blob is stored as JSON in
-- `data` (shape: { settings, progress, review }). The app reads/writes it via
-- /api/get-progress and /api/save-progress (service key, upsert on conflict).
-- Guest (device-only) kids never touch this table.

create table if not exists learning_progress (
  kid_profile_id text primary key,          -- the kid profile id (shared across devices)
  data           jsonb,                      -- full Learning Mode blob { settings, progress, review }
  updated_at     timestamptz not null default now()
);
