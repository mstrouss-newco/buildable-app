-- Clean up legacy base64 layer rows in community_layers.
-- Run in the Supabase SQL editor (project: mstrouss-newco's Project).
-- SAFE / NON-DESTRUCTIVE BY DEFAULT: this script is written so the first run only
-- REPORTS what it would change. The DELETE is wrapped in a transaction and only
-- removes a base64 row when a CLEAN sibling (same subject + theme, non-base64
-- image_url) already exists, so no art is ever lost. Orphan base64 rows with no
-- clean sibling are left alone and listed for you to regenerate.
--
-- Background: /api/list-assets already filters base64 rows out of the kid UI, but
-- they still inflate the raw table (admin inventory showed 47 total / 28 clean = 19
-- legacy base64 layer rows). This removes the dupes safely.

-- ---------------------------------------------------------------------------
-- STEP 1 (read-only): see the legacy base64 rows and whether a clean sibling exists
-- ---------------------------------------------------------------------------
with base64_rows as (
  select id, subject, theme, layer_type, category
  from community_layers
  where image_url like 'data:%'
),
clean_rows as (
  select subject, theme
  from community_layers
  where image_url not like 'data:%'
)
select b.id, b.subject, b.theme, b.layer_type,
       exists (select 1 from clean_rows c
               where c.subject is not distinct from b.subject
                 and c.theme   is not distinct from b.theme) as has_clean_sibling
from base64_rows b
order by has_clean_sibling desc, b.theme, b.subject;

-- ---------------------------------------------------------------------------
-- STEP 2 (the cleanup): delete ONLY base64 dupes that have a clean sibling.
-- Review STEP 1 output first. Then run the block below. It is transaction-wrapped
-- so you can ROLLBACK if the row count looks wrong.
-- ---------------------------------------------------------------------------
begin;

  -- how many will be removed (should match the has_clean_sibling=true count above)
  select count(*) as will_delete
  from community_layers b
  where b.image_url like 'data:%'
    and exists (
      select 1 from community_layers c
      where c.image_url not like 'data:%'
        and c.subject is not distinct from b.subject
        and c.theme   is not distinct from b.theme
    );

  delete from community_layers b
  where b.image_url like 'data:%'
    and exists (
      select 1 from community_layers c
      where c.image_url not like 'data:%'
        and c.subject is not distinct from b.subject
        and c.theme   is not distinct from b.theme
    );

-- Inspect the row counts, then choose ONE:
-- commit;    -- keep the cleanup
-- rollback;  -- undo everything in this block
rollback;  -- <-- default is rollback. Change to commit; once you've verified.

-- ---------------------------------------------------------------------------
-- STEP 3 (read-only): orphan base64 rows with NO clean sibling (regenerate these)
-- ---------------------------------------------------------------------------
select id, subject, theme, layer_type
from community_layers b
where b.image_url like 'data:%'
  and not exists (
    select 1 from community_layers c
    where c.image_url not like 'data:%'
      and c.subject is not distinct from b.subject
      and c.theme   is not distinct from b.theme
  )
order by theme, subject;
