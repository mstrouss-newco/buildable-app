-- Adds tester-feedback support to the Update Planner. Additive + idempotent.
-- source: 'me' = Mike's own task, 'tester' = feedback submitted from /feedback.
-- author: the tester's chosen name (null for Mike's own tasks).
alter table planner_tasks add column if not exists source text not null default 'me';
alter table planner_tasks add column if not exists author text;
create index if not exists planner_tasks_source_idx on planner_tasks (source);
