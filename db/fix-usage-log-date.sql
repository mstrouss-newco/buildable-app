-- Idempotent. Applied to prod 2026-07-21 via Supabase migration
-- "fix_usage_log_date_column" (kept here for the record).
-- The app logs spend as {date, cost_usd, kind, model} and every daily budget
-- brake reads `date=eq.<today>`, but usage_log had no `date` column, so cost
-- logging AND the brakes silently failed app-wide.
alter table usage_log add column if not exists date date default ((now() at time zone 'utc')::date);
update usage_log set date = (created_at at time zone 'utc')::date where date is null;
create index if not exists usage_log_date_idx on usage_log(date);
