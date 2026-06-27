-- db/create-saved-art.sql
-- Buildable Art Studio: persist a kid's drawings per device/profile so they follow
-- the child across devices. Mirrors saved_stories EXACTLY (device lane + family RLS).
-- Run ONCE in the Supabase SQL editor. Idempotent ("if not exists"); deletes nothing.
--
-- Two payloads on purpose:
--   image_b64 = the FINISHED flattened PNG (instant thumbnail + share, no re-render)
--   art (JSONB) = the REPLAYABLE recipe {ops[], bg} so we can later remix / "watch it
--                 draw itself" / turn a drawing into a character — without re-painting.

create table if not exists saved_art (
  id              bigint generated always as identity primary key,
  art_id          text not null unique,        -- client-stable id
  device_id       text not null,               -- anonymous device lane
  kid_profile_id  uuid references kid_profiles(id) on delete set null,
  kid_name        text,
  title           text,
  theme           text,                         -- drives the auto thumbnail word
  image_b64       text,                         -- finished PNG (data URL or base64)
  art             jsonb not null,               -- {ops:[...], bg:"#fff"}  (replayable)
  published       boolean   default false,      -- family-gallery publish flag
  published_at    timestamptz,
  play_count      integer   default 0,
  heart_count     integer   default 0,
  created_at      timestamptz not null default now()
);

create index if not exists saved_art_device_idx    on saved_art (device_id, created_at desc);
create index if not exists saved_art_kid_idx        on saved_art (kid_profile_id);
create index if not exists saved_art_published_idx  on saved_art (published) where published;

-- RLS to match the accounts lane (service key bypasses it for the device lane,
-- exactly like saved_stories/saved_songs).
alter table saved_art enable row level security;
drop policy if exists art_by_family on saved_art;
create policy art_by_family on saved_art
  for all
  using     (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()))
  with check (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()));

-- Let drawings ride the existing hearts rail (create-publishing.sql created this table).
alter table creation_hearts drop constraint if exists creation_hearts_kind_check;
alter table creation_hearts add  constraint creation_hearts_kind_check
  check (kind in ('song','game','story','art'));

-- Verify:
-- select count(*) from saved_art;
