-- Castle Guard: register the curated Tiny Swords (Pixel Frog) sprites into the
-- SHARED asset library so other games can reuse them (theme: castle).
-- Source/license: public/game-assets/tiny-swords/LICENSE.txt (free for personal +
-- commercial use, modify OK, NO redistribution of the raw pack — we only curate).
--
-- Idempotent + non-destructive: each row inserts ONLY if its image_url is absent.
-- Owner: run once in the Supabase SQL editor. (Castle Guard itself does NOT depend
-- on these rows — it loads the files directly with a BR drawn fallback — this seed
-- is purely so other games can pull these by theme.)

-- ELEMENTS / SPRITES (community_sprites): subject, image_url, theme_tags, reusable, moderation_status
INSERT INTO community_sprites (subject, image_url, theme_tags, reusable, moderation_status)
SELECT v.subject, v.url, ARRAY['castle']::text[], true, 'approved'
FROM (VALUES
  ('archer',  'https://www.buildablekids.com/game-assets/tiny-swords/archer_idle.png'),
  ('arrow',   'https://www.buildablekids.com/game-assets/tiny-swords/arrow.png'),
  ('goblin',  'https://www.buildablekids.com/game-assets/tiny-swords/baddie_run.png'),
  ('tower',   'https://www.buildablekids.com/game-assets/tiny-swords/tower.png'),
  ('tree',    'https://www.buildablekids.com/game-assets/tiny-swords/tree.png'),
  ('bush',    'https://www.buildablekids.com/game-assets/tiny-swords/bush1.png'),
  ('rock',    'https://www.buildablekids.com/game-assets/tiny-swords/rock1.png')
) AS v(subject, url)
WHERE NOT EXISTS (SELECT 1 FROM community_sprites s WHERE s.image_url = v.url);

-- WORLD / BACKDROP piece (community_layers): the castle building as a reusable prop
INSERT INTO community_layers (image_url, theme_tags, layer_type, reusable, moderation_status)
SELECT v.url, ARRAY['castle']::text[], 'prop', true, 'approved'
FROM (VALUES
  ('https://www.buildablekids.com/game-assets/tiny-swords/castle.png')
) AS v(url)
WHERE NOT EXISTS (SELECT 1 FROM community_layers l WHERE l.image_url = v.url);
