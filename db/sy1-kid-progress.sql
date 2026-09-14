-- SY1: one row per kid holding the progress that used to live only in one
-- browser on one device. Minute Math scores and Practice boxes share the blob.
-- ALREADY APPLIED to the live project; kept here so the schema is in the repo.
--
-- Written ONLY by /api/kid-progress with the service key, so RLS is on with no
-- policies: the anon key that ships in every browser can neither read nor write
-- this table directly.
create table if not exists public.kid_progress_saves (
  kid_profile_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.kid_progress_saves enable row level security;

comment on table public.kid_progress_saves is
  'SY1: per-kid Minute Math + Practice progress. Written by /api/kid-progress (service key only). RLS on, no policies, by design.';
