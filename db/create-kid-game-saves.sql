-- db/create-kid-game-saves.sql
-- AC3 — ONE SAVED WORLD PER KID, PER GAME. A generalisation of
-- db/create-farm-save.sql: same shape, same rules, one extra `game` column so
-- every maker that needs "this world is hers and it follows her" shares one
-- table and one API (/api/kid-save) instead of growing a table per game.
--
-- Ant City is the first game on it. The Farm still has its own `farm_saves`
-- table and /api/farm-save, and it stays live and untouched until somebody
-- verifies a move onto this table on the live site (repo rule: replace first,
-- remove second).
--
-- Idempotent: safe to run again.
--
-- The save is BEST-EFFORT and NEVER blocks play. If this table is missing or
-- the network is down, the game carries on from localStorage and syncs later.
-- Nothing here ever deletes a save: there is no reset path a child can reach.

create table if not exists public.kid_game_saves (
  game           text        not null,
  kid_profile_id text        not null,
  data           jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (game, kid_profile_id)
);

-- Newest-first listing for a grown-up view later on.
create index if not exists kid_game_saves_updated_at_idx
  on public.kid_game_saves (updated_at desc);

-- LOCKED DOWN, exactly as farm_saves is. Who may touch a child's saved world:
--
--   service_role  — the ONLY thing that reaches this table today. /api/kid-save
--                   runs with the service key, which bypasses RLS entirely, so
--                   the API keeps full access no matter what is written below.
--   a signed-in kid — may read and write only their own rows, matched on a
--                   kid_profile_id claim in their token.
--   anon          — nothing at all. No policy, no access.
--
-- Note for whoever reads this next: THERE IS NO KID LOGIN IN THIS PRODUCT YET,
-- so no token carries kid_profile_id and the per-kid policies below match
-- nothing today. They are written now anyway, so that the day a kid does sign
-- in, their colony is already fenced off from every other kid's.

alter table public.kid_game_saves enable row level security;

-- the kid id carried by the caller's token. Already created by
-- db/create-farm-save.sql; repeated here so this file stands on its own.
create or replace function public.jwt_kid_profile_id()
returns text language sql stable as $$
  select coalesce(
    nullif(auth.jwt() ->> 'kid_profile_id', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'kid_profile_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'kid_profile_id', '')
  );
$$;

drop policy if exists "a kid reads only their own saved world"   on public.kid_game_saves;
drop policy if exists "a kid creates only their own saved world" on public.kid_game_saves;
drop policy if exists "a kid updates only their own saved world" on public.kid_game_saves;

create policy "a kid reads only their own saved world"
  on public.kid_game_saves for select to authenticated
  using (kid_profile_id = public.jwt_kid_profile_id());

create policy "a kid creates only their own saved world"
  on public.kid_game_saves for insert to authenticated
  with check (kid_profile_id = public.jwt_kid_profile_id());

create policy "a kid updates only their own saved world"
  on public.kid_game_saves for update to authenticated
  using (kid_profile_id = public.jwt_kid_profile_id())
  with check (kid_profile_id = public.jwt_kid_profile_id());

-- Deliberately NO delete policy and NO anon policy: a saved world is never
-- destroyed from outside, and nobody holding the public key gets in at all.

comment on table  public.kid_game_saves is
  'AC3: one saved world per kid per game. Written by /api/kid-save (service key only).';
comment on column public.kid_game_saves.game is
  'Which maker the blob belongs to, e.g. antcity. Allowlisted in /api/kid-save.';
comment on column public.kid_game_saves.data is
  'Whole-world snapshot the game wrote, including when it was last saved (savedAt).';
