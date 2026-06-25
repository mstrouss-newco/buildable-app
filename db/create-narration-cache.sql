-- db/create-narration-cache.sql
-- Caches ElevenLabs narration (audio + word timings) keyed by a hash of the
-- voice + page text, so re-reading a story — or another kid reading the same
-- generated line — never re-spends ElevenLabs characters.
-- Run ONCE in the Supabase SQL editor. Idempotent; nothing is deleted.

create table if not exists narration_cache (
  id            bigint generated always as identity primary key,
  cache_key     text not null unique,        -- sha1(voiceId + ":" + text)
  audio_b64     text not null,               -- base64 mp3
  word_timings  jsonb,                        -- [{w,start,end}]
  created_at    timestamptz not null default now()
);
create index if not exists narration_cache_created_idx on narration_cache (created_at desc);
