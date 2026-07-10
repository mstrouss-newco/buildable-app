-- db/8a-question-bank-review.sql  (Session 8A — Living question library)
-- Additive + idempotent. Run ONCE in the Supabase SQL editor. Nothing deleted.
-- Builds on db/6b-question-bank.sql (the question_bank table + review gate).
--
-- 1) game_theme tag: contextual questions themed to the game being played
--    (e.g. a space game) are tagged here so the bank keeps that context.
-- 2) question_bank_runs: a small log so we can confirm the weekly factory ran
--    and see how many questions it made each week.

alter table question_bank add column if not exists game_theme text;

-- Optional convenience index for browsing a subject's pending queue by newest.
create index if not exists question_bank_review_idx
  on question_bank (status, subject, created_at desc);

create table if not exists question_bank_runs (
  id         uuid primary key default gen_random_uuid(),
  ran_at     timestamptz not null default now(),
  requested  int,            -- how many questions the run aimed for
  generated  int,            -- how many it actually built
  inserted   int,            -- how many were new (after de-dupe) and stored pending
  by_source  jsonb,          -- e.g. { "local": 26, "ai": 22 }
  note       text            -- e.g. "theme=space" or null
);
create index if not exists question_bank_runs_idx on question_bank_runs (ran_at desc);
