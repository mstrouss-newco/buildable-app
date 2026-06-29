-- db/seed-sling-launch-mechanic.sql
-- Registers the reusable SLINGSHOT LAUNCH + simple-physics mechanic introduced by Sling Squad
-- (public/sling-squad.html) so a generation prompt or a future game can request it by name.
-- Idempotent + non-destructive. See MECHANICS.md section 16. Run ONCE in Supabase.

insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'sling-launch-physics',
  'Slingshot launch + topple physics (always-winnable)',
  'Drag-back-and-release slingshot launcher with real rigid-body physics (Matter.js): a friendly character is flung along a gravity arc to knock over stacked block towers and bonk goofy targets that simply topple and POOF (no harm, no weapons). Kid-tuned + always-winnable: forgiving big-pull aim with a trajectory preview, gentle gravity, generous launches per level (a few to spare), and soft-fail only (out of slings just retries the level — never a harsh game-over). Targets pop generously (a direct hit always counts, plus knocked-by-a-block, displaced-from-rest, or fell-off-screen), and each level pre-settles its towers with pops disabled so settling jitter can never pop a target before the kid acts. Data-driven levels (per-level block layout, target positions, launches) so a new level = editing data. Verified by a sensible-aim QA bot (qa-sling.mjs) that clears EVERY level with launches to spare. Implemented in public/sling-squad.html on the shared engine libs BR/BA/BM/BS + game-nav, with public/matter.min.js (vendored, MIT).',
  '{"engine":"public/sling-squad.html","physics":"Matter.js (public/matter.min.js, MIT, vendored)","input":"drag back to aim+power, release to launch; pull clamped to MAXPULL; forgiving","pop_conditions":["direct hit by flung ammo","knocked by a block above a speed threshold","displaced from rest > POP_MOVE","fell off-screen"],"always_winnable":["generous launches per level","soft-fail retry (no game-over)","pre-settle towers then arm pops","aim predictor auto-calibrated to engine gravity"],"data_shape":"GAME_CONFIG.levels[] = {name, launches, blocks:[{x,y,w,h}], targets:[{x,y}]}","qa_hook":"window.BUILDABLE_GAME (alias SLING_GAME) with sim(idx)/campaign()","qa_runner":"qa-sling.mjs","fx":"BM.explode/shake on launch, impact, poof, win","sound":"created sling_* one-shots via /api/sfx (BA synth is silent fallback)"}'::jsonb,
  array['physics','slingshot','launcher','always-winnable','data-driven','shared-lib','track-b'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
