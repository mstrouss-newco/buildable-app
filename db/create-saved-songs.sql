-- Create the saved_songs table so kids can store AI-generated music
-- tied to their device/profile, and so the Admin Dashboard can see all songs.
-- Run ONCE in the Supabase SQL editor (project: mstrouss-newco's Project).
-- Safe / idempotent: uses "if not exists". No data is deleted.
--
-- Each kid (identified by device_id) can keep up to 10 songs. The 10-song cap
-- is enforced in /api/save-song.js, but we also add a helpful index here.
-- Songs are reusable across the app (e.g. as background music in games),
-- so they are stored centrally rather than only on-device.

create table if not exists saved_songs (
  id           bigint generated always as identity primary key,
  song_id      text not null unique,        -- client-generated stable id (uuid-ish)
  device_id    text not null,               -- the kid/parent profile (anonymous device)
  kid_name     text,                        -- friendly display name from the profile
  title        text not null,               -- playful song title
  prompt       text,                        -- what the kid said the song is about
  vibe         text,                        -- 'happy' | 'epic' | 'spooky' | 'silly' | 'chill' | 'dance'
  theme        text,                        -- optional game theme: space, underwater, castle, candy...
  audio_url    text,                        -- hosted audio URL from the music provider
  cover_color  text,                        -- a fun color for the song card (hex)
  duration_sec numeric(6,2),                -- length in seconds (optional)
  provider     text,                        -- which music service generated it (e.g. 'demo','elevenlabs','replicate')
  meta         jsonb,                        -- freeform: model, style tags, fallbackReason, etc.
  created_at   timestamptz not null default now()
);

-- Fast lookups + cap-counting per kid, newest first.
create index if not exists saved_songs_device_idx
  on saved_songs (device_id, created_at desc);

-- Prevent accidental duplicate inserts of the same client song id.
create unique index if not exists saved_songs_song_id_idx
  on saved_songs (song_id);

-- Optional: tidy view the admin can read for per-kid song counts.
create or replace view saved_songs_by_kid as
  select device_id,
         max(kid_name) as kid_name,
         count(*)      as song_count,
         max(created_at) as last_created
  from saved_songs
  group by device_id;
