-- db/create-planner-runs.sql — the RUN table behind the planner's Run builder (card RB1).
--
-- A "run" is an ordered list of build sessions Mike ticked together on the planner,
-- plus the settings that say how they should be worked. Saving a run writes ONE row
-- here with status 'ready'. Nothing executes from the planner page: a later card
-- (RB2) adds the cloud runner that claims a ready row and works it.
--
-- Idempotent — safe to run again. No DROP, no DELETE.

create table if not exists planner_runs (
  id          bigserial primary key,
  status      text        not null default 'ready',
  sessions    jsonb       not null default '[]'::jsonb,
  settings    jsonb       not null default '{}'::jsonb,
  start_at    timestamptz,
  created_at  timestamptz not null default now(),
  claimed_by  text,
  claimed_at  timestamptz,
  finished_at timestamptz,
  outcomes    jsonb       not null default '[]'::jsonb,
  summary     text
);

-- status is a small closed list, so a typo can never park a run in limbo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planner_runs_status_chk') then
    alter table planner_runs add constraint planner_runs_status_chk
      check (status in ('ready','running','done','stopped','cancelled'));
  end if;
end$$;

-- The runner's only question is "is there a run waiting?", asked oldest-first.
create index if not exists planner_runs_status_idx on planner_runs (status, id);

-- Same posture as planner_queue / planner_lanes: reached only through /api/planner
-- with the service key, never from a browser, so no anon policies are added here.
