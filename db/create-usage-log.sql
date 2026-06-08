-- Create the usage_log table so the Admin Dashboard can show REAL spend over time.
-- Run ONCE in the Supabase SQL editor (project: mstrouss-newco's Project).
-- Safe / idempotent: uses "if not exists". No data is deleted.
--
-- Each generation endpoint can insert one row per AI call with its cost in USD.
-- /api/admin-stats reads this table to report today's and this month's spend;
-- until rows exist, admin-stats falls back to an estimate from row counts.

create table if not exists usage_log (
  id          bigint generated always as identity primary key,
  kind        text not null,              -- 'character' | 'level' | 'game' | 'quiz'
  cost_usd    numeric(10,4) not null default 0,
  model       text,                       -- e.g. 'gpt-image-1', 'claude', 'dall-e-3'
  device_id   text,                       -- anonymous creator device (optional)
  meta        jsonb,                      -- freeform: theme, tokens, fallbackReason, etc.
  created_at  timestamptz not null default now()
);

-- Fast range scans for "today" / "this month" rollups.
create index if not exists usage_log_created_at_idx on usage_log (created_at desc);
create index if not exists usage_log_kind_idx on usage_log (kind);

-- The API reads/writes this with the service key (same pattern as the other
-- community/published tables); the app does not rely on RLS for these reads.
-- If RLS is enabled on this table, add a service-role policy or run with
-- "Run without RLS" as was done for the existing tables.

-- Verify:
-- select count(*) as rows, coalesce(sum(cost_usd),0) as total_usd from usage_log;
