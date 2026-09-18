-- db/seed-suburb-watercolor-art.sql — card PB4.
-- Registers the SUBURB watercolor set in the SHARED library. These are the real
-- painted cut-outs that replaced Paper Route's flat vectors: generated once
-- through api/game-art.js (world "suburb", style watercolor), cached forever in
-- narration_cache, and served from /api/game-art. Any project can now build a
-- street, a town or a seaside road out of them. Idempotent: re-running it
-- changes nothing.
--
-- APPLIED IN-SESSION on 2026-09-18 through the connected Supabase MCP (project
-- Buildable Kids, ref fmguhfmfntvohtnccmap), verified with a count of 15 rows.
-- The file is the reviewable, re-runnable record; the database is not the
-- documentation. See AGENTS.md "Running SQL yourself".
--
-- The PB3 vector rows in db/seed-paper-route-art.sql are NOT removed. Replace
-- first, remove second: a saved street or a manifest may still name one, and the
-- engine still routes them.
--
-- theme is a LABEL, not a fence: these are tagged suburb/town (and beach, forest
-- or desert where they suit it), which makes "give me a suburban set" one line,
-- and stops nothing from putting a suburban house in a jungle. `usable_in` (asset
-- shape), not theme, is the real gate. See ASSET-LIBRARY.md.

insert into community_sprites
  (asset_id, subject, layer_type, category, image_url, theme_tags, prompt_used,
   has_transparency, reusable, moderation_status, created_by_device_id)
values
  ('suburb/house/a-v1','Cream suburban house with a warm red roof','prop','house','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:house_a','{suburb,town,beach}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/house/b-v1','Blue suburban house with a covered porch','prop','house','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:house_b','{suburb,town,beach}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/house/c-v1','Mint-green cottage with a bay window and a chimney','prop','house','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:house_c','{suburb,town,beach,forest}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/tree/v1','Round leafy street tree','prop','tree','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:tree','{suburb,town,forest,meadow}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/bush/v1','Garden bush with small white and pink flowers','prop','plant','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:bush','{suburb,town,forest,meadow}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/mailbox/v1','White kerbside letterbox on a post','prop','mailbox','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:mailbox','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/flag/up-v1','Red mailbox signal flag raised','prop','flag','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:flag_up','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/flag/down-v1','Green mailbox signal flag folded down','prop','flag','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:flag_down','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/rider/v1','Child riding a bicycle seen from behind, papers on the rack','character','rider','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:rider','{suburb,town,beach}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/bin/v1','Green wheelie bin','prop','obstacle','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:bin','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/cone/v1','Orange traffic cone with a white band','prop','obstacle','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:cone','{suburb,town,desert}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/car/v1','Family car seen from behind','prop','vehicle','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:car','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/icecream/v1','Ice cream van seen from behind with a cone on the roof','prop','vehicle','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:icecream','{suburb,town,beach}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/paper/v1','Rolled newspaper tied with a band','prop','item','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:paper','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route'),
  ('suburb/bundle/v1','Tied bundle of folded newspapers','prop','item','https://www.buildablekids.com/api/game-art?style=watercolor&img=suburb:bundle','{suburb,town}','Watercolor cut-out generated through api/game-art.js world suburb (PB4)',true,true,'approved','agent:paper-route')
on conflict do nothing;
