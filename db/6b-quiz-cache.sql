-- db/6b-quiz-cache.sql  (Session 6B)
-- Backfills the quiz_cache table that api/generate-quiz.js already references
-- but whose DDL was never checked in. One row per generated question, keyed by
-- a hash of (age|level|gameType|quizType|hourBucket). Safe / idempotent.
create table if not exists quiz_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
