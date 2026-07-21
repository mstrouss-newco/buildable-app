-- MM2 (Music Maker "Make it a keeper") — add an OPTIONAL cover_url column to
-- saved_songs so each song's album cover art travels with it as a first-class
-- field. This is a tidy-up, not a requirement: the app already stores the cover
-- URL inside saved_songs.meta ->> 'coverUrl', and /api/list-songs reads that
-- when the column is absent. Run ONCE in the Supabase SQL editor when convenient.
--
-- Safe / idempotent: "if not exists", additive only, deletes nothing.

alter table saved_songs
  add column if not exists cover_url text;   -- hosted album cover image URL

-- Backfill the new column from any cover URL already saved in meta.
update saved_songs
   set cover_url = meta ->> 'coverUrl'
 where cover_url is null
   and meta ->> 'coverUrl' is not null;
