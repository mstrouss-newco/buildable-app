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

comment on table  public.farm_saves is
  'FM5: one saved farm per kid. Written by /api/farm-save (service key only).';
comment on column public.farm_saves.data is
  'Whole-farm snapshot: {v, savedAt, patches, animals, stack, collected, order, ordersDone, unlocks}.';
