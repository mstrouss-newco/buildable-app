-- Central-library publishing + engagement (hearts/plays).
-- Songs & stories: a publish flag on the EXISTING saved rows (no data duplication,
-- so remixing just reads the row). Games already live in published_games.
-- Run once in the Supabase SQL editor.

alter table saved_songs   add column if not exists published    boolean     default false;
alter table saved_songs   add column if not exists published_at timestamptz;
alter table saved_songs   add column if not exists play_count   integer     default 0;
alter table saved_songs   add column if not exists heart_count  integer     default 0;

alter table saved_stories add column if not exists published    boolean     default false;
alter table saved_stories add column if not exists published_at timestamptz;
alter table saved_stories add column if not exists play_count   integer     default 0;
alter table saved_stories add column if not exists heart_count  integer     default 0;

alter table published_games add column if not exists heart_count integer default 0;

-- One row per device-heart, so hearts can toggle and never double-count.
create table if not exists creation_hearts (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('song','game','story')),
  creation_id text not null,
  device_id   text not null,
  created_at  timestamptz default now(),
  unique (kind, creation_id, device_id)
);
create index if not exists creation_hearts_lookup     on creation_hearts (kind, creation_id);
create index if not exists saved_songs_published_idx   on saved_songs   (published) where published;
create index if not exists saved_stories_published_idx on saved_stories (published) where published;
