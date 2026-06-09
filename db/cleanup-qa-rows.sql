-- Clean up leftover QA / diagnostic rows across community tables.
-- Run in the Supabase SQL editor (project: mstrouss-newco's Project).
-- SAFE: read-only preview first, then a transaction-wrapped, narrowly-scoped delete
-- that defaults to ROLLBACK. Only rows clearly tagged as test/diag are touched.
--
-- Targets (from admin inventory):
--   * a stray 'diagtest' theme that shows up in the inventory
--   * QA rows tagged like 'qaa95cb6%' left behind by an earlier test run
--   * matching QA rows in community_levels

-- ---------------------------------------------------------------------------
-- STEP 1 (read-only): preview every row that matches the QA / diag patterns
-- ---------------------------------------------------------------------------
select 'community_layers' as tbl, id, theme, subject from community_layers
  where theme = 'diagtest' or theme ilike 'qaa95cb6%' or subject ilike 'qa%test%'
union all
select 'community_sprites' as tbl, id, theme, subject from community_sprites
  where theme = 'diagtest' or theme ilike 'qaa95cb6%' or subject ilike 'qa%test%'
union all
select 'community_levels' as tbl, id, theme, null as subject from community_levels
  where theme = 'diagtest' or theme ilike 'qaa95cb6%';

-- ---------------------------------------------------------------------------
-- STEP 2 (the cleanup): transaction-wrapped, defaults to ROLLBACK.
-- Review STEP 1, then flip the final line to commit; when satisfied.
-- ---------------------------------------------------------------------------
begin;

  delete from community_layers
   where theme = 'diagtest' or theme ilike 'qaa95cb6%' or subject ilike 'qa%test%';

  delete from community_sprites
   where theme = 'diagtest' or theme ilike 'qaa95cb6%' or subject ilike 'qa%test%';

  delete from community_levels
   where theme = 'diagtest' or theme ilike 'qaa95cb6%';

-- Inspect 'DELETE n' notices, then choose ONE:
-- commit;
-- rollback;
rollback;  -- <-- default. Change to commit; once you've verified the counts.
