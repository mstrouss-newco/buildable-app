-- db/seed-same-device-turns-mechanic.sql
-- Registers the reusable SAME-DEVICE 2-4 player turn shell introduced by the "simple games"
-- batch (Memory, Bingo, Snakes & Ladders) so a generation prompt or future game can request it
-- by name. Idempotent + non-destructive. See MECHANICS.md section 14. Run ONCE in Supabase.

insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'same-device-turns',
  'Same-device 2-4 player turn shell (pass-and-play)',
  'One shared turn brain for local pass-and-play games: 2-4 players (plus a solo path), no backend and no accounts. A single match object owns the player roster (kid-friendly names + 4 distinct colors + a token shape, no emoji), whose turn it is, per-player scores, and the winner. Games call cur()/next()/add()/leader()/finish(). Memory uses strict turns with a bonus turn on a match; Snakes uses strict turns with a bonus roll on a six; Bingo uses the roster + rotating caller + winner with simultaneous daubing. Headless-safe so the QA sims drive matches with no DOM. Implemented as public/buildable-turns.js (window.BuildableTurns / BT), the 5th shared engine lib alongside BR/BA/BM/BS.',
  '{"lib":"public/buildable-turns.js","global":"BT (window.BuildableTurns)","create":"BT.create({count:2-4, solo, players:[{name,color,token}], onTurn, onWin})","api":["cur()","curIndex()","add(delta)","addTo(i,delta)","next(keepTurn)","leader()","tiedLeaders()","finish(i)","reset()"],"palette":"4 colors, no emoji","backend":"none (v1 local pass-and-play)","headless":"safe (no DOM) for QA sims","used_by":["memory-engine.html","bingo-engine.html","snakes-engine.html"]}'::jsonb,
  array['multiplayer','same-device','turn-based','pass-and-play','shared-lib','no-backend'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
