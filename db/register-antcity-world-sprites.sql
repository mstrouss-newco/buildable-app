-- db/register-antcity-world-sprites.sql — card AC10.
--
-- Puts Ant City's thirteen world sprites into the SHARED asset library, so the
-- meadow pieces are available to every project and not siloed inside one game.
-- They are CC0 Quaternius Stylized Nature MegaKit models, shot into flat side-on
-- transparent PNGs by scripts/nature-shot.mjs under one lighting rig, which is
-- what makes them usable as a set rather than as thirteen downloads.
--
-- Additive and idempotent: re-running it updates the rows in place and never
-- deletes anything. No DELETE, no DROP, no schema change.
--
-- `usable_in` is not a column on community_sprites yet (see ASSET-LIBRARY.md), so
-- the shape is carried in `category`: side-on-cutout means a transparent sprite
-- that stands on a ground line, which is what a side-view game can use.

insert into community_sprites
  (asset_id, subject, layer_type, category, image_url, theme_tags,
   has_transparency, reusable, moderation_status, prompt_used)
values
  ('nature/world/tree-pine-1-v1',  'Pine tree, side on (Quaternius Stylized Nature, CC0)',        'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/tree-pine-1.png',  array['forest','meadow','garden'], true, true, 'approved', 'shot from Pine_1 by scripts/nature-shot.mjs'),
  ('nature/world/tree-pine-2-v1',  'Pine tree, taller, side on (Quaternius Stylized Nature, CC0)','element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/tree-pine-2.png',  array['forest','meadow','garden'], true, true, 'approved', 'shot from Pine_3 by scripts/nature-shot.mjs'),
  ('nature/world/tree-round-1-v1', 'Round leafy tree, side on (Quaternius Stylized Nature, CC0)', 'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/tree-round-1.png', array['forest','meadow','garden'], true, true, 'approved', 'shot from CommonTree_1 by scripts/nature-shot.mjs'),
  ('nature/world/tree-round-2-v1', 'Round leafy tree, slim, side on (Quaternius, CC0)',           'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/tree-round-2.png', array['forest','meadow','garden'], true, true, 'approved', 'shot from CommonTree_3 by scripts/nature-shot.mjs'),
  ('nature/world/tree-round-3-v1', 'Round leafy tree, broad, side on (Quaternius, CC0)',          'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/tree-round-3.png', array['forest','meadow','garden'], true, true, 'approved', 'shot from CommonTree_5 by scripts/nature-shot.mjs'),
  ('nature/world/bush-flowers-v1', 'Flowering bush, side on (Quaternius, CC0)',                   'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/bush-flowers.png', array['forest','meadow','garden'], true, true, 'approved', 'shot from Bush_Common_Flowers by scripts/nature-shot.mjs'),
  ('nature/world/fern-v1',         'Fern clump, looked down on (Quaternius, CC0)',                'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/fern.png',         array['forest','meadow','jungle'], true, true, 'approved', 'shot from Fern_1 by scripts/nature-shot.mjs'),
  ('nature/world/grass-tall-v1',   'Tall grass tuft, side on (Quaternius, CC0)',                  'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/grass-tall.png',   array['forest','meadow','garden'], true, true, 'approved', 'shot from Grass_Common_Tall by scripts/nature-shot.mjs'),
  ('nature/world/flowers-1-v1',    'Red flowers, side on (Quaternius, CC0)',                      'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/flowers-1.png',    array['meadow','garden'],          true, true, 'approved', 'shot from Flower_3_Group by scripts/nature-shot.mjs'),
  ('nature/world/flowers-2-v1',    'Yellow flowers, side on (Quaternius, CC0)',                   'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/flowers-2.png',    array['meadow','garden'],          true, true, 'approved', 'shot from Flower_4_Group by scripts/nature-shot.mjs'),
  ('nature/world/mushroom-v1',     'Mushroom cluster, side on (Quaternius, CC0)',                 'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/mushroom.png',     array['forest','meadow'],          true, true, 'approved', 'shot from Mushroom_Common by scripts/nature-shot.mjs'),
  ('nature/world/rock-1-v1',       'Rock, side on (Quaternius, CC0)',                             'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/rock-1.png',       array['forest','meadow','desert'], true, true, 'approved', 'shot from Rock_Medium_1 by scripts/nature-shot.mjs'),
  ('nature/world/rock-2-v1',       'Rock, flatter, side on (Quaternius, CC0)',                    'element', 'side-on-cutout', 'https://www.buildablekids.com/antcity/art/world/rock-2.png',       array['forest','meadow','desert'], true, true, 'approved', 'shot from Rock_Medium_2 by scripts/nature-shot.mjs')
on conflict (asset_id) do update set
  subject          = excluded.subject,
  layer_type       = excluded.layer_type,
  category         = excluded.category,
  image_url        = excluded.image_url,
  theme_tags       = excluded.theme_tags,
  has_transparency = excluded.has_transparency,
  reusable         = excluded.reusable,
  moderation_status= excluded.moderation_status,
  prompt_used      = excluded.prompt_used;
