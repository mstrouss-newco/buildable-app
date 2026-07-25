-- db/create-saved-pages.sql
-- Kidspedia topic books (Session TB1): a kid folds the corner of a page ("dog-ears
-- it") and that page follows them to any device they sign in on. Run ONCE in the
-- Supabase SQL editor. Idempotent ("if not exists"); deletes nothing.
--
-- Two lanes, exactly like saved_art / saved_stories:
--   owner_key = 'kid:<kid_profile_id>'  -> signed in, follows the kid across devices
--   owner_key = 'dev:<device_id>'       -> guest, honest device-only lane
--
-- Unfolding a corner NEVER deletes a row: it flips saved = false. That keeps this
-- table append-and-update only, so no product action can ever destroy data.

create table if not exists saved_pages (
  id              bigint generated always as identity primary key,
  owner_key       text not null,                -- 'kid:<uuid>' or 'dev:<device>'
  kid_profile_id  uuid references kid_profiles(id) on delete set null,
  device_id       text,
  exhibit_id      text not null,                -- e.g. 'sharks'
  exhibit_title   text,                         -- denormalised for the bookshelf
  page_id         text not null,                -- e.g. 'teeth'
  page_title      text,
  saved           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_key, exhibit_id, page_id)
);

create index if not exists saved_pages_owner_idx   on saved_pages (owner_key, updated_at desc);
create index if not exists saved_pages_kid_idx     on saved_pages (kid_profile_id);
create index if not exists saved_pages_exhibit_idx on saved_pages (exhibit_id);

-- RLS to match the accounts lane (the service key bypasses it for the device
-- lane, exactly like saved_art / saved_stories / saved_songs).
alter table saved_pages enable row level security;
drop policy if exists pages_by_family on saved_pages;
create policy pages_by_family on saved_pages
  for all
  using     (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()))
  with check (kid_profile_id in (select id from kid_profiles where parent_id = auth.uid()));
