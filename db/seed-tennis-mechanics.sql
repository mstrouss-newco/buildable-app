-- db/seed-tennis-mechanics.sql
-- Registers the reusable mechanics introduced by Buildable Tennis so a generation
-- prompt (or a future game) can request them by name. Idempotent + non-destructive.
-- See MECHANICS.md + GAME-LOOK.md for how each one works and how to reuse it.
-- Run ONCE in the Supabase SQL editor (safe to re-run).

-- 1) Choosable AI-art world backdrops ("where do you want to play?")
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'pick-ai-world-backdrop',
  'Choosable AI-art world backdrops',
  'Kids pick WHERE they play from a grid of worlds, each backed by a full-scene AI image generated once and cached (api/images.js kind), drawn cover-fit behind the play area with a readability scrim. Every world keeps a drawn gradient fallback so a missing/over-budget image never breaks play. Reusable for any game that wants a "choose your scene" picker.',
  '{"art":"api/images.js?kind=<game>&id=<world>","cache":"generate-once-cache","draw":"BR.bgImage cover-fit + dark scrim","fallback":"drawn gradient (worldTheme.bg)","picker":"BS customizeLabel + onCustomize -> world grid","budget":"underBudget gate + <img onError> fallback"}'::jsonb,
  array['art','world','customize','backdrop','library-first'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;

-- 2) Smack talk / taunts (playful, child-safe)
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'smack-talk-taunts',
  'Smack talk / taunts',
  'Playful trash talk shown as fading speech bubbles. SOLO: the bot opponent talks freely (it is the computer) - cheeky ("Too slow!"), hype ("Nice shot!") and goofy ("Wibble wobble!") lines on each point and at game end. KID-VS-KID: NEVER free text - only the fixed canned-reaction list enforced by the realtime layer (child-safety). A new game adds taunt arrays + a sayTop/sayBot bubble; for multiplayer it keeps the canned-only rule.',
  '{"solo":"bot taunts freely (TAUNTS arrays: botPoint/youPoint/botWin/youWin)","multiplayer":"canned reactions ONLY, enforced in FamilyRealtime ALLOWED set (no free text)","render":"fading speech bubble (sayTop=opponent, sayBot=you)","safety":"curated kid-safe phrases only"}'::jsonb,
  array['polish','social','multiplayer','child-safety'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;

-- 3) Ambient world particles (FX) - cheap per-world motion over a static backdrop
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'fx-ambient-particles',
  'Ambient world particles',
  'A light per-world particle layer (snow falling, bubbles/embers rising, stars twinkling, leaves/sweets/clouds drifting) that makes even a STATIC backdrop feel alive and dynamic. ~34 cheap drawn dots, wrap-around, color + motion chosen by the world. Runs in every state (menu/play/over).',
  '{"count":"~34","types":["snow","leaves","sweets","bubbles","embers","sun","clouds","stars"],"motion":"per-type velocity + sine sway, wrap at edges","draw":"normalized 0-1 -> screen px, simple arcs","cost":"~0"}'::jsonb,
  array['fx','polish','background','motion'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
