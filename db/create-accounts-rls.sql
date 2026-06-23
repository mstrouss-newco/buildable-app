-- db/create-accounts-rls.sql
-- ---------------------------------------------------------------
-- Row Level Security so a signed-in grown-up can ONLY read/write
-- their OWN family's data. The database itself enforces isolation
-- between families -- even a buggy endpoint can't cross families.
--
-- Run ONCE in the Supabase SQL editor, AFTER create-accounts.sql.
-- Idempotent: drops+recreates each policy.
--
-- Two lanes coexist:
--   * Anonymous/device lane (today's no-login flow): endpoints use the
--     SERVICE key, which BYPASSES RLS, so those keep working unchanged.
--   * Account lane (new): requests carry the signed-in adult's JWT and
--     use the ANON key, so these policies apply and scope every row to
--     the family. Account-lane rows have kid_profile_id set; anonymous
--     rows (kid_profile_id null) are simply not matched by these policies.
--
-- NOTE: parent_accounts.id IS auth.uid(), so checks compare id = auth.uid()
-- and kid_profiles.parent_id = auth.uid() directly (no auth_user_id column).
-- ---------------------------------------------------------------

alter table parent_accounts enable row level security;
alter table kid_profiles    enable row level security;
alter table saved_songs     enable row level security;
alter table saved_games     enable row level security;

-- A grown-up can only see/edit their own account row.
drop policy if exists parent_self on parent_accounts;
create policy parent_self on parent_accounts
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- A grown-up can only see/edit kid profiles they own.
drop policy if exists kid_by_parent on kid_profiles;
create policy kid_by_parent on kid_profiles
  for all
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- Songs scoped to the family via the kid profile.
drop policy if exists songs_by_family on saved_songs;
create policy songs_by_family on saved_songs
  for all
  using (
    kid_profile_id in (select id from kid_profiles where parent_id = auth.uid())
  )
  with check (
    kid_profile_id in (select id from kid_profiles where parent_id = auth.uid())
  );

-- Games scoped to the family the same way.
drop policy if exists games_by_family on saved_games;
create policy games_by_family on saved_games
  for all
  using (
    kid_profile_id in (select id from kid_profiles where parent_id = auth.uid())
  )
  with check (
    kid_profile_id in (select id from kid_profiles where parent_id = auth.uid())
  );
