-- Migration: align platformer game_mechanics rules to current runner behavior.
-- Run this ONCE in the Supabase SQL editor (or psql).
-- Idempotent and NON-DESTRUCTIVE: it only updates the "lives" key inside the
-- rule jsonb on platformer mechanics (no INSERTs, no DELETEs, no schema change).
--
-- Why: the runner fix (commit d3665ef, June 8 2026) made generated games use 3
-- lives via a HARD RULE in the platformer prompt + fallback. Some legacy mechanic
-- rows still carry rule->>'lives' = '1' (e.g. timed-run). The prompt overrides the
-- DB hint at build time, so this change is for DB/consistency only -- it makes the
-- stored hints match what the engine actually does (3 lives).

-- 1) Bump lives -> 3 on any platformer-style mechanic whose rule currently has
--    a lives value below 3. Leaves all other rule params untouched.
update game_mechanics
set rule = jsonb_set(coalesce(rule, '{}'::jsonb), '{lives}', '3'::jsonb, true)
where coalesce((rule->>'lives')::int, 0) < 3
  and not ('breakout' = any (coalesce(tags, array[]::text[])));

-- 2) For platformer mechanics that have NO lives key at all, add lives = 3
--    so the hint is explicit. (breakout already defines its own lives = 3.)
update game_mechanics
set rule = jsonb_set(coalesce(rule, '{}'::jsonb), '{lives}', '3'::jsonb, true)
where (rule->>'lives') is null
  and not ('breakout' = any (coalesce(tags, array[]::text[])));

-- Verify:
-- select slug, name, enabled, rule->>'lives' as lives, rule
-- from game_mechanics order by slug;
