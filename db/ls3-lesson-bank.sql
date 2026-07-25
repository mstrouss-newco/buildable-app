-- db/ls3-lesson-bank.sql  (Session LS3 — the lesson factory)
-- Additive + idempotent. Run ONCE in the Supabase SQL editor. Nothing deleted.
--
-- WHY THIS TABLE EXISTS
-- Session LS2 shipped the lesson map as a FILE (public/lessons/index.json) and
-- lesson content as files under public/lessons/*.json. That works, but it means
-- approving a lesson requires a code push, and the repo owner cannot push. So
-- from LS3 on, generated lessons live HERE and the review gate is a database
-- flip: the owner taps Approve on /lesson-review and the lesson is live to kids
-- with no deploy. The static files stay working forever (index.json is still the
-- shape of the path map, g1-making-ten.json is still served from disk) — the
-- table is additive on top of them, per the replace-first-remove-second rule.
--
-- REVIEW GATE: every lesson enters with status='pending'. Only status='approved'
-- rows are ever served to a kid (api/lesson.js and api/lesson-map.js both filter
-- on it). A pending draft is reachable ONLY with the owner preview token, so a
-- kid can never see an unreviewed lesson. This is the same gate shape as
-- db/6b-question-bank.sql uses for question_bank.
--
-- Practice questions are NOT duplicated here: a lesson's step 4 pulls approved
-- rows out of question_bank through api/lesson-questions.js, exactly as LS1
-- built it. This table holds the TEACHING (intro, teach cards, guided questions,
-- mastery check), not the practice pool.

create table if not exists lesson_bank (
  id           uuid primary key default gen_random_uuid(),
  lesson_key   text unique not null,        -- matches a 'key' in public/lessons/index.json
  grade        text,                        -- 'k','1','2' (the launch range; k-6 allowed)
  subject      text not null,               -- 'math' | 'geometry' | 'spelling' | 'reading'
  skill        text,                        -- curriculum tag from api/_curriculum.js
  title        text not null,               -- kid-facing lesson title
  unit         text,                        -- unit label, e.g. 'Unit 2 - Addition within 20'
  minutes      int default 5,               -- rough length, shown on the path card
  payload      jsonb not null,              -- the WHOLE lesson, in the LS1 player shape
  source       text default 'ai',           -- 'ai' | 'local' | 'human'
  status       text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  content_hash text unique,                 -- de-dupe guard so a re-run cannot double up
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,                 -- set when the owner edits the words
  reviewed_at  timestamptz,
  reviewed_by  text
);

-- Fast serve: the player asks for one approved lesson by key.
create index if not exists lesson_bank_serve_idx
  on lesson_bank (status, lesson_key);
-- Fast map merge: which lessons are approved for this subject + grade.
create index if not exists lesson_bank_map_idx
  on lesson_bank (status, subject, grade);
-- Review queue, newest first.
create index if not exists lesson_bank_review_idx
  on lesson_bank (status, created_at desc);

-- A small log so we can confirm the factory ran and see what each run made.
-- Mirrors question_bank_runs from db/8a-question-bank-review.sql.
create table if not exists lesson_bank_runs (
  id         uuid primary key default gen_random_uuid(),
  ran_at     timestamptz not null default now(),
  requested  int,            -- how many lessons the run aimed for
  generated  int,            -- how many it actually drafted
  inserted   int,            -- how many were new (after de-dupe) and stored pending
  by_source  jsonb,          -- e.g. { "local": 10, "ai": 0 }
  note       text            -- e.g. 'subject=math grades=k,1,2'
);
create index if not exists lesson_bank_runs_idx on lesson_bank_runs (ran_at desc);
