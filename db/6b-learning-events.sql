-- db/6b-learning-events.sql  (Session 6B — skill history + adaptive backbone)
-- One row per quiz answer, so the grown-ups dashboard can show skills OVER TIME
-- (mastered vs practicing per subject), compute streaks, and pick a
-- "practice next" nudge. Also the source for adaptive selection: the kid's
-- recent MISSES (correct=false) steer which bank questions come next.
-- Additive + idempotent, no FK (best-effort log; kid_profile_id is text so it
-- accepts account UUIDs and guest ids alike, matching kid_game_events).
create table if not exists learning_events (
  id             bigint generated always as identity primary key,
  kid_profile_id text,
  subject        text,                     -- 'math' | 'geometry' | 'spelling' | 'reading'
  skill          text,                     -- specific skill tag (nullable)
  grade          text,
  quiz_type      text,
  correct        boolean not null,
  question_id    uuid,                     -- bank question id when it came from the bank
  game           text,                     -- game context, if any
  created_at     timestamptz not null default now()
);
create index if not exists learning_events_kid_idx
  on learning_events (kid_profile_id, created_at desc);
create index if not exists learning_events_kid_subject_idx
  on learning_events (kid_profile_id, subject);
-- Recent misses drive adaptive selection.
create index if not exists learning_events_miss_idx
  on learning_events (kid_profile_id, correct, created_at desc);
