-- Dev "Update Planner": Mike's private cross-device queue of game + platform
-- updates to hand to Claude in efficient batches. Additive + idempotent.
-- Two tables: the tasks themselves, and a single meta row holding settings,
-- daily send counts, and custom game/area names. Safe to run repeatedly.

create table if not exists planner_tasks (
  id           bigint generated always as identity primary key,
  kind         text not null,               -- 'game' | 'platform'
  target       text not null,               -- e.g. 'Breaker' or 'HUD'
  description  text not null,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists planner_tasks_open_idx on planner_tasks (done, kind, target);

-- Single-row store (id is always 1) for settings + sends + custom lists.
create table if not exists planner_meta (
  id    int primary key default 1,
  data  jsonb not null default '{}'::jsonb,
  constraint planner_meta_singleton check (id = 1)
);
insert into planner_meta (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;
