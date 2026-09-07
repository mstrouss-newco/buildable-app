-- db/create-farm-save.sql
-- FM5 — THE FARM REMEMBERS HER. One row per kid holding the whole farm as a
-- JSON blob: every patch, every animal, the stack, the pantry (COLLECTED),
-- the live order, orders done, the presents she has opened, and when she was
-- last here.
--
-- Idempotent: safe to run again. Mirrors db/create-learning-progress.sql and
-- db/create-saved-pages.sql — service-key only, written by /api/farm-save.
--
-- The save is BEST-EFFORT and NEVER blocks play. If this table is missing or
-- the network is down, the farm carries on from localStorage and syncs later.
-- Nothing here ever deletes a save: there is no reset path a child can reach.

create table if not exists public.farm_saves (
  kid_profile_id text primary key,
  data           jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- Newest-first listing for a grown-up view later on.
create index if not exists farm_saves_updated_at_idx
  on public.farm_saves (updated_at desc);

-- LOCKED DOWN. Applied 2026-09-07 on Mike's say-so after the security advisor
-- flagged it. Who may touch a child's saved farm:
--
--   service_role  — the ONLY thing that reaches this table today. /api/farm-save
--                   runs with the service key, which bypasses RLS entirely, so
--                   the API keeps full access no matter what is written below.
--   a signed-in kid — may read and write EXACTLY ONE ROW: their own, matched on
--                   a kid_profile_id claim in their token.
--   anon          — nothing at all. No policy, no access.
--
-- Note for whoever reads this next: THERE IS NO KID LOGIN IN THIS PRODUCT YET,
-- so no token carries kid_profile_id and the per-kid policies below match
-- nothing today. They are written now anyway, so that the day a kid does sign
-- in, their farm is already fenced off from every other kid's and nobody has to
-- remember to come back here and do it.

alter table public.farm_saves enable row level security;

-- the kid id carried by the caller's token, from either place Supabase puts it
create or replace function public.jwt_kid_profile_id()
returns text language sql stable as $$
  select coalesce(
    nullif(auth.jwt() ->> 'kid_profile_id', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'kid_profile_id', '')
  );
$$;

drop policy if exists "a kid reads only their own farm"   on public.farm_saves;
drop policy if exists "a kid creates only their own farm" on public.farm_saves;
drop policy if exists "a kid updates only their own farm" on public.farm_saves;

create policy "a kid reads only their own farm"
  on public.farm_saves for select to authenticated
  using (kid_profile_id = public.jwt_kid_profile_id());

create policy "a kid creates only their own farm"
  on public.farm_saves for insert to authenticated
  with check (kid_profile_id = public.jwt_kid_profile_id());

create policy "a kid updates only their own farm"
  on public.farm_saves for update to authenticated
  using (kid_profile_id = public.jwt_kid_profile_id())
  with check (kid_profile_id = public.jwt_kid_profile_id());

-- Deliberately NO delete policy and NO anon policy: a farm is never destroyed
-- from outside, and nobody holding the public key gets in at all.

comment on table  public.farm_saves is
  'FM5: one saved farm per kid. Written by /api/farm-save (service key only).';
comment on column public.farm_saves.data is
  'Whole-farm snapshot: {v, savedAt, patches, animals, stack, collected, order, ordersDone, unlocks}.';
