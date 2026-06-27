-- Seed: FX / "juice" mechanics for the game_mechanics library.
-- Run this ONCE in the Supabase SQL editor (or psql) to make these reusable
-- feel/FX mechanics selectable by api/generate-game.js and discoverable for the
-- hand-authored engines. Idempotent: re-running updates the existing row by slug.
-- NON-DESTRUCTIVE: INSERT ... ON CONFLICT DO UPDATE only. No DELETEs, no schema change.
--
-- These are the FEEL primitives (explosions, shake, flash, pop text, confetti)
-- that survival/croc/breaker were each hand-coding. They are now implemented once
-- in public/buildable-mechanics.js (window.BuildableMechanics, "BM"). Each rule's
-- `lib`/`fn` points at the BM call that produces the effect, so both tracks share
-- one source of truth. See MECHANICS.md §9.

insert into game_mechanics (slug, name, description, rule, tags, enabled) values
(
  'fx-explosion-burst',
  'Explosion burst',
  'A satisfying pop when something is destroyed: a ring of particles plus a quick screen flash and a small shake. Use it when an enemy, brick, or boss dies.',
  '{"lib":"buildable-mechanics.js","fn":"explode","n":18,"shake":0.3,"flash":0.25}'::jsonb,
  array['fx','juice','explosion','particles','destroy'],
  true
),
(
  'fx-screen-shake-on-hit',
  'Screen shake on hit',
  'Briefly shake the camera when the player takes damage or a big hit lands, to sell impact. Keep it short (<0.35s) so it never makes the game hard to read.',
  '{"lib":"buildable-mechanics.js","fn":"shake","amount":0.3,"maxPx":12}'::jsonb,
  array['fx','juice','shake','impact','feedback'],
  true
),
(
  'fx-hit-flash',
  'Hit flash',
  'Flash a translucent color over the screen for a moment on a key event (player hurt = red, power-up = gold, stun = yellow). A fast, readable damage/feedback cue.',
  '{"lib":"buildable-mechanics.js","fn":"flash","strength":0.25,"hurtColor":"#ff4400","goodColor":"#ffd23f"}'::jsonb,
  array['fx','juice','flash','feedback'],
  true
),
(
  'fx-floating-score-pop',
  'Floating score pop',
  'Spawn small text that floats up and fades ("+5", "-1", "BOOM!") at the point of an event, so kids see what just happened.',
  '{"lib":"buildable-mechanics.js","fn":"pop","riseSpeed":40,"life":0.9}'::jsonb,
  array['fx','juice','text','score','feedback'],
  true
),
(
  'fx-confetti-celebrate',
  'Confetti celebrate',
  'A bigger, gravity-fed multi-color particle burst for wins and level-clears — the celebratory cousin of the explosion. Pair with the win sound.',
  '{"lib":"buildable-mechanics.js","fn":"burst","n":60,"gravity":260,"life":[0.8,1.4],"sfx":"win"}'::jsonb,
  array['fx','juice','confetti','win','celebrate'],
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  rule        = excluded.rule,
  tags        = excluded.tags,
  enabled     = excluded.enabled;

-- Verify:
-- select slug, name, enabled, rule from game_mechanics
-- where 'fx' = any(tags) order by slug;
