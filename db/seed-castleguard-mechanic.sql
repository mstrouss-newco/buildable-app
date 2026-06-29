-- Castle Guard: two reusable mechanics written back to the catalog (MECHANICS.md).
-- Idempotent: ON CONFLICT (slug) DO NOTHING. Owner: run once in Supabase.

INSERT INTO game_mechanics (slug, name, description, rule, tags, enabled)
VALUES
 ('td-wave-spawner',
  'Wave spawner',
  'Spawn a scripted wave of enemies one-by-one along a path: a wave is {baddie, count, spacingMs, speed, hits}. A short grace delay precedes the first spawn so the player can prepare. A wave is cleared when the queue is empty AND no enemies remain; clearing all waves wins the level.',
  '{"grindMs":1000,"defaults":{"count":6,"spacingMs":1500},"clearWhen":"queueEmpty+fieldEmpty"}'::jsonb,
  ARRAY['tower-defense','spawner','waves','always-winnable'], true),
 ('td-auto-fire-defender',
  'Auto-fire defender',
  'A placed defender automatically targets the nearest enemy within range and fires a homing soft projectile every fireMs; on enough hits the enemy gently POOFS and leaves (no health-bar death). Defender = {cost, range, fireMs, dmg}. Kid only places; aiming/firing is automatic (ages 4-8).',
  '{"target":"nearest-in-range","projectile":"homing-soft","onDefeat":"poof+reward","auto":true}'::jsonb,
  ARRAY['tower-defense','defender','auto-aim','kid-friendly'], true)
ON CONFLICT (slug) DO NOTHING;
