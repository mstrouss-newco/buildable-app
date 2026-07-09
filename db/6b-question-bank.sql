-- db/6b-question-bank.sql  (Session 6B — curriculum-tagged question bank)
-- A reviewed bank of quiz questions, tagged by curriculum so the app can pick
-- questions that match a kid's grade, subject, and specific skill (and lean into
-- skills the kid recently missed). Run ONCE in the Supabase SQL editor.
-- Additive + idempotent. Nothing is deleted.
--
-- REVIEW GATE: every question enters with status='pending'. Only status='approved'
-- rows are ever served to a kid. AI-generated questions are written here as
-- 'pending' and must be approved (a grown-up flips the status) before use. This
-- is the "review step before any generated question enters the bank" rule.
--
-- Full scheduled AI generation that fills this bank each week is Phase 8A; 6B
-- only builds the table, the review gate, and adaptive serving from it.

create table if not exists question_bank (
  id           uuid primary key default gen_random_uuid(),
  grade        text,                       -- 'k','1'..'6' (null = any grade)
  subject      text not null,              -- 'math' | 'geometry' | 'spelling' | 'reading'
  skill        text,                       -- specific skill tag, e.g. 'addition-within-20'
  quiz_type    text not null,              -- mirrors generate-quiz quizType
  payload      jsonb not null,             -- the question shape generate-quiz returns
  source       text default 'ai',          -- 'ai' | 'human' | 'local'
  status       text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  content_hash text unique,                -- de-dupe guard (hash of the question text)
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  text
);
-- Fast adaptive lookup: approved questions by subject/grade/skill.
create index if not exists question_bank_serve_idx
  on question_bank (status, subject, grade, skill);
create index if not exists question_bank_status_idx
  on question_bank (status, created_at desc);
