-- db/create-coparents.sql
-- ==================================================================
-- ADD A SECOND GROWN-UP (co-parent) TO A FAMILY.
-- ------------------------------------------------------------------
-- Today each family has ONE credentialed login (parent_accounts, 1:1 with
-- Supabase Auth). This lets a SECOND grown-up create their OWN login and
-- JOIN an existing family with a short family code, so both grown-ups see
-- and manage the SAME kids and their creations.
--
-- Safety model (child product, COPPA-aligned): no open search, no strangers.
-- The primary grown-up shares a private FAMILY CODE out-of-band; the second
-- grown-up types it in to link. Kids always stay owned by the family owner
-- (the primary), so nothing about existing single-parent families changes.
--
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql and
-- create-accounts-rls.sql. Additive + idempotent: safe to re-run.
-- ==================================================================

-- 0. Short, human-shareable family code (no 0/O/1/I/L). Also defined in
--    create-friends.sql; create-or-replace keeps this file self-contained.
create or replace function gen_friend_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$ language plpgsql;

-- Every family gets one private code. New parent rows get one by default;
-- backfill any existing rows that don't have one yet.
alter table parent_accounts add column if not exists friend_code text;
alter table parent_accounts alter column friend_code set default gen_friend_code();

do $$
declare r record; code text;
begin
  for r in select id from parent_accounts where friend_code is null loop
    loop
      code := gen_friend_code();
      exit when not exists (select 1 from parent_accounts where friend_code = code);
    end loop;
    update parent_accounts set friend_code = code where id = r.id;
  end loop;
end $$;

create unique index if not exists idx_parent_accounts_friend_code
  on parent_accounts (friend_code);

-- 1. The co-parent link. member_parent_id (the grown-up who joined) can
--    access primary_parent_id's family (the owner who shared the code).
create table if not exists co_parents (
  primary_parent_id uuid not null references parent_accounts(id) on delete cascade,
  member_parent_id  uuid not null references parent_accounts(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (primary_parent_id, member_parent_id)
);
create index if not exists idx_co_parents_member on co_parents (member_parent_id);

alter table co_parents enable row level security;

drop policy if exists co_parents_visible on co_parents;
create policy co_parents_visible on co_parents
  for select
  using (member_parent_id = auth.uid() or primary_parent_id = auth.uid());

drop policy if exists co_parents_delete on co_parents;
create policy co_parents_delete on co_parents
  for delete
  using (member_parent_id = auth.uid() or primary_parent_id = auth.uid());

-- 2. Widen the family RLS so a co-parent sees the same kids + creations.
--    Solo families are unaffected (co_parents is empty for them).
create or replace function my_family_owner_ids() returns setof uuid as $$
  select auth.uid()
  union
  select primary_parent_id from co_parents where member_parent_id = auth.uid();
$$ language sql stable security definer set search_path = public;

drop policy if exists kid_by_parent on kid_profiles;
create policy kid_by_parent on kid_profiles
  for all
  using (parent_id in (select my_family_owner_ids()))
  with check (parent_id in (select my_family_owner_ids()));

drop policy if exists songs_by_family on saved_songs;
create policy songs_by_family on saved_songs
  for all
  using (
    kid_profile_id in (select id from kid_profiles where parent_id in (select my_family_owner_ids()))
  )
  with check (
    kid_profile_id in (select id from kid_profiles where parent_id in (select my_family_owner_ids()))
  );

drop policy if exists games_by_family on saved_games;
create policy games_by_family on saved_games
  for all
  using (
    kid_profile_id in (select id from kid_profiles where parent_id in (select my_family_owner_ids()))
  )
  with check (
    kid_profile_id in (select id from kid_profiles where parent_id in (select my_family_owner_ids()))
  );

-- 3. Join a family by code. Runs as definer so the joiner can look up a
--    family they can't otherwise read, then links themselves in.
create or replace function join_family_by_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  norm text := upper(regexp_replace(coalesce(code, ''), '\s', '', 'g'));
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Please sign in first');
  end if;
  if norm = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter a family code');
  end if;
  select id into pid from parent_accounts where friend_code = norm limit 1;
  if pid is null then
    return jsonb_build_object('ok', false, 'error', 'No family found for that code');
  end if;
  if pid = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'That is your own family code');
  end if;
  insert into co_parents (primary_parent_id, member_parent_id)
    values (pid, auth.uid())
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function join_family_by_code(text) to authenticated;
grant execute on function my_family_owner_ids() to authenticated;
