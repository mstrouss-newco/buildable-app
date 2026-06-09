-- Create the agent_learnings table so external agents (e.g. the game-mechanics
-- agent working on another game) can persist what they learn back into buildable-app.
-- Run ONCE in the Supabase SQL editor (project: mstrouss-newco's Project).
-- Safe / idempotent: uses "if not exists". No data is deleted.
--
-- Each learning is one row. /api/log-learning inserts rows; the admin dashboard
-- (or any tool) can read them back to build up institutional knowledge over time.

create table if not exists agent_learnings (
  id          bigint generated always as identity primary key,
  source      text not null,
  project     text,
  category    text,
  title       text not null,
  detail      text,
  tags        text[],
  meta        jsonb,
  created_at  timestamptz not null default now()
);

-- Helpful indexes for browsing/filtering.
create index if not exists agent_learnings_created_idx  on agent_learnings (created_at desc);
create index if not exists agent_learnings_source_idx   on agent_learnings (source);
create index if not exists agent_learnings_category_idx on agent_learnings (category);
