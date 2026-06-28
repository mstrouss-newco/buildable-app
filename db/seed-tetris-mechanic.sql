-- db/seed-tetris-mechanic.sql
-- Registers the reusable mechanics introduced by Tumble Blocks (public/tetris-engine.html)
-- so a generation prompt (or a future falling-block game) can request them by name.
-- Idempotent + non-destructive. See MECHANICS.md for how each one works.
-- Run ONCE in the Supabase SQL editor (safe to re-run).

-- 1) Falling-block clear-to-win goal
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'tumble-blocks-clear',
  'Tumble Blocks — fill a row to clear it',
  'A gentle falling-blocks puzzle (kid Tetris): the 7 classic tetrominoes drift down slowly; the child turns/slides them to fill a horizontal row, which then clears with a sparkle. A WORLD is won by clearing N rows (goalRows). Kid tuning: slow drop + small ramp, 3-piece preview, ghost landing outline, forgiving lock delay that resets on nudge, 7-bag randomizer. Pieces recolor per world from a soft palette.',
  '{"pieces":"7 tetrominoes (7-bag)","win":"rowsCleared >= goalRows (per world)","tuning":{"fallMs":"per-world, small per-row ramp","preview":3,"ghost":true,"lockDelayMs":600,"lockResets":12},"controls":"buttons + board gestures (drag move / tap rotate / swipe-down drop) + keyboard","render":"BR.rrect blocks (no emoji), BM line-clear explode/shake/flash"}'::jsonb,
  array['puzzle','falling-block','tetris','always-winnable','kids'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;

-- 2) Soft-reset / never-lose (falling-block always-winnable safeguard)
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'soft-reset-never-lose',
  'Soft reset — never lose (falling-block)',
  'The falling-block sibling of kill-then-boss: a game NEVER ends on a top-out. When a new piece cannot appear, the world helper character gently sweeps the bottom rows away (gentleReset) and play continues, instead of a harsh game-over. Combined with a player-controlled goal counter (rowsCleared >= goalRows) this guarantees the goal is always reachable. Age-4-friendly; no failure state.',
  '{"trigger":"new piece collides at spawn (top-out)","action":"sweep bottom rows + compact, themed toast + soft sfx (tumble_reset)","never":"no game-over / no lose state","pairWith":"goal counter rowsCleared>=goalRows","proven":"public/tetris-engine.html, qa-tetris.mjs El-Tetris bot"}'::jsonb,
  array['always-winnable','kids','falling-block','safeguard','no-game-over'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
