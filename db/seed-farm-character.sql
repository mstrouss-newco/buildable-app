-- db/seed-farm-character.sql — card FM9.
-- Registers the farm's main character in the SHARED asset library, the same way
-- PB3 registered Paper Route's art, so any other project can stand her up too.
--
-- WHAT IS BEING REGISTERED: one rigged body, four movement clips and three
-- skins. Everything that makes her a PERSON is the skin png — the body and the
-- clips are shared by every look — so each skin is its own row and the body is
-- its own row, rather than one row per finished character.
--
-- Source: Kenney "Animated Characters Bundle" (characterSmall), CC0. Licence
-- travels with the files at public/models/skyflyer/character/LICENSE-kenney.txt.
--
-- theme is a LABEL, not a fence (ASSET-LIBRARY.md): she is tagged farm and town
-- because that is where she suits, and nothing stops a castle game using her.
-- Idempotent: re-running it changes nothing.
--
-- APPLIED IN-SESSION through the connected Supabase MCP (project Buildable Kids,
-- ref fmguhfmfntvohtnccmap) and verified by counting the rows back.

insert into community_sprites
  (asset_id, subject, layer_type, category, image_url, theme_tags, prompt_used,
   has_transparency, reusable, moderation_status, created_by_device_id)
values
  ('farm/character/body-v1','Rigged child character, body and skeleton (glb)','character','model-3d','https://www.buildablekids.com/models/skyflyer/character/character-kid.glb','{farm,town,island}','Kenney Animated Characters Bundle, characterSmall, CC0, converted FBX to glb for FM9',true,true,'approved','agent:farm-fm9'),
  ('farm/character/anim-idle-v1','Character movement: standing still (glb clip)','character','model-3d-clip','https://www.buildablekids.com/models/skyflyer/character/anim-idle.glb','{farm,town,island}','Kenney Animated Characters Bundle clip, CC0, plays on the body above',false,true,'approved','agent:farm-fm9'),
  ('farm/character/anim-walk-v1','Character movement: walking (glb clip)','character','model-3d-clip','https://www.buildablekids.com/models/skyflyer/character/anim-walk.glb','{farm,town,island}','Kenney Animated Characters Bundle clip, CC0, plays on the body above',false,true,'approved','agent:farm-fm9'),
  ('farm/character/anim-run-v1','Character movement: running (glb clip)','character','model-3d-clip','https://www.buildablekids.com/models/skyflyer/character/anim-run.glb','{farm,town,island}','Kenney Animated Characters Bundle clip, CC0, plays on the body above',false,true,'approved','agent:farm-fm9'),
  ('farm/character/anim-pickup-v1','Character movement: bending down to pick something up (glb clip)','character','model-3d-clip','https://www.buildablekids.com/models/skyflyer/character/anim-pickup.glb','{farm,town,island}','Kenney Animated Characters Bundle clip, CC0, plays on the body above',false,true,'approved','agent:farm-fm9'),
  ('farm/character/skin-farm-a-v1','Farm outfit A: blue dungarees, white tee, green boots (1024 skin)','character','model-3d-skin','https://www.buildablekids.com/models/skyflyer/character/skin-farm-a.png','{farm,town}','Kenney skin, CC0. One png carries outfit, hair, face and skin tone',true,true,'approved','agent:farm-fm9'),
  ('farm/character/skin-farm-b-v1','Farm outfit B: red shirt, grey dungarees, brown boots (1024 skin)','character','model-3d-skin','https://www.buildablekids.com/models/skyflyer/character/skin-farm-b.png','{farm,town}','Kenney skin, CC0. One png carries outfit, hair, face and skin tone',true,true,'approved','agent:farm-fm9'),
  ('farm/character/skin-farm-girl-v1','Farm girl: outfit A with longer hair (1024 skin)','character','model-3d-skin','https://www.buildablekids.com/models/skyflyer/character/skin-farm-girl.png','{farm,town}','Kenney skins combined, CC0. One png carries outfit, hair, face and skin tone',true,true,'approved','agent:farm-fm9')
on conflict do nothing;

-- Added in the same session: the corrected girl skin. The supplied
-- skin-farm-girl.png paints the head a deep maroon while the arms in the same
-- atlas stay peach, so the farm loads this one instead. The original row above
-- stays: nothing in the library is removed, and either is one path away.
insert into community_sprites
  (asset_id, subject, layer_type, category, image_url, theme_tags, prompt_used,
   has_transparency, reusable, moderation_status, created_by_device_id)
values
  ('farm/character/skin-farm-girl-v2','Farm girl, corrected: outfit A tones with her own hair (1024 skin)','character','model-3d-skin','https://www.buildablekids.com/models/skyflyer/character/skin-farm-girl-v2.png','{farm,town}','skin-farm-a.png with the hair from skin-farm-girl.png composited over it, so the face matches the hands',true,true,'approved','agent:farm-fm9')
on conflict do nothing;
