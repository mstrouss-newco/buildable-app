-- db/seed-paper-route-art.sql — card PB3.
-- Registers Paper Route's drawn art set in the SHARED library, so a house, a tree,
-- a bush or an ice cream van made for this street can be reused by any other
-- project. Idempotent: re-running it changes nothing.
--
-- APPLIED IN-SESSION on 2026-09-07 through the connected Supabase MCP (project
-- Buildable Kids, ref fmguhfmfntvohtnccmap), verified with a count of 16 rows.
-- The file is the reviewable, re-runnable record; the database is not the
-- documentation. See AGENTS.md "Running SQL yourself".
--
-- theme is a LABEL, not a fence: these are tagged town/suburb (and beach or forest
-- where they suit it), which makes "give me a suburban set" one line, and stops
-- nothing from using a suburban house in a jungle. `usable_in` (asset shape), not
-- theme, is the real gate. See ASSET-LIBRARY.md.

insert into community_sprites
  (asset_id, subject, layer_type, category, image_url, theme_tags, prompt_used,
   has_transparency, reusable, moderation_status, created_by_device_id)
values
  ('paper-route/house/cream-v1','Cream suburban house with a red roof','prop','house','https://www.buildablekids.com/paper-route/art/house-a.svg','{town,suburb,beach}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/house/blue-v1','Suburban house with a porch and a blue door','prop','house','https://www.buildablekids.com/paper-route/art/house-b.svg','{town,suburb,beach}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/tree/leafy-v1','Round leafy street tree','prop','tree','https://www.buildablekids.com/paper-route/art/tree.svg','{town,suburb,forest,meadow}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/bush/flowering-v1','Garden bush with small flowers','prop','plant','https://www.buildablekids.com/paper-route/art/bush.svg','{town,suburb,forest,meadow}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/mailbox/white-v1','Kerbside mailbox on a post','prop','mailbox','https://www.buildablekids.com/paper-route/art/mailbox.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/flag/up-v1','Mailbox flag raised','prop','flag','https://www.buildablekids.com/paper-route/art/flag-up.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/flag/down-v1','Mailbox flag lowered','prop','flag','https://www.buildablekids.com/paper-route/art/flag-down.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/rider/classic-v1','Rider on a bike seen from behind','character','rider','https://www.buildablekids.com/paper-route/art/rider.svg','{town,suburb,beach}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/obstacle/bin-v1','Green wheelie bin','prop','obstacle','https://www.buildablekids.com/paper-route/art/bin.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/obstacle/cone-v1','Orange traffic cone','prop','obstacle','https://www.buildablekids.com/paper-route/art/cone.svg','{town,suburb,desert}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/vehicle/car-v1','Family car seen from behind','prop','vehicle','https://www.buildablekids.com/paper-route/art/car.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/vehicle/icecream-v1','Ice cream van with a cone on the roof','prop','vehicle','https://www.buildablekids.com/paper-route/art/icecream-truck.svg','{town,suburb,beach}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/paper/rolled-v1','Rolled newspaper in the air','prop','item','https://www.buildablekids.com/paper-route/art/paper.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/bundle/tied-v1','Tied bundle of newspapers','prop','item','https://www.buildablekids.com/paper-route/art/bundle.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/badge/v1','Paper Route badge','prop','badge','https://www.buildablekids.com/paper-route/art/badge.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',true,true,'approved','agent:paper-route'),
  ('paper-route/loading/v1','Paper Route loading screen','layer','loading','https://www.buildablekids.com/paper-route/art/loading.svg','{town,suburb}','Hand-drawn vector authored for Paper Route (PB3)',false,true,'approved','agent:paper-route')
on conflict do nothing;
