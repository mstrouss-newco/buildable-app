-- Seed: Breakout mechanic for the game_mechanics library.
-- Run this in the Supabase SQL editor (or psql) to make the Breakout
-- mechanic selectable as a hint by api/generate-game.js.
-- Idempotent: re-running updates the existing row by slug.

insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'breakout-clear-all-bricks',
  'Clear all the bricks',
  'Bounce the ball off the paddle to break every brick to win; do not let the ball fall past the paddle.',
  '{"lives": 3, "rows": 4, "cols": 8, "ballSpeed": 220, "speedUpEvery": 8, "speedUpBy": 20, "paddleWidth": 110}'::jsonb,
  array['breakout','paddle','ball','arcade'],
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  rule        = excluded.rule,
  tags        = excluded.tags,
  enabled     = excluded.enabled;

-- Verify:
-- select slug, name, enabled, rule from game_mechanics where slug = 'breakout-clear-all-bricks';
