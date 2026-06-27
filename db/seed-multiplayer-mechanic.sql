-- db/seed-multiplayer-mechanic.sql
-- Registers the real-time multiplayer MECHANIC so a game-creation prompt can request
-- it by name ("build a game and use the real-time multiplayer mechanic"). Idempotent.
-- The mechanic is implemented by the shared layer (src/lib/realtimeChannel.js +
-- src/lib/rtMatch.js + src/FamilyRealtime.jsx) + the rt_matches table; this row is the
-- catalog entry that documents how a game opts in. See MULTIPLAYER.md + MECHANICS.md.

insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'mp-realtime-broadcast',
  'Real-time two-player (Broadcast)',
  'Two kids on different devices play live (a moving ball/object), via Supabase Realtime Broadcast. The game stays network-agnostic and speaks the mp: postMessage contract; the shared FamilyRealtime layer handles the lobby, channel, roles, safety, and score. Rules: host owns the ball and broadcasts its position; each kid broadcasts only their own paddle; send positions not commands; canned reactions only (no free-text chat); requires the parent-account lane.',
  '{"transport":"supabase-broadcast","table":"rt_matches","contract":"mp:","host_authoritative":true,"send":"positions-not-commands","reactions":"canned-only","requires":"account-lane","layer":["src/lib/realtimeChannel.js","src/lib/rtMatch.js","src/FamilyRealtime.jsx"]}'::jsonb,
  array['multiplayer','realtime','broadcast','two-player','cross-device'],
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  rule        = excluded.rule,
  tags        = excluded.tags,
  enabled     = excluded.enabled;

-- Companion turn-based mechanic (the chess model), documented for completeness.
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'mp-turn-based-row',
  'Turn-based two-player (poll a row)',
  'Two kids take turns across devices (chess, board/card games). The whole game state lives in one family-scoped row; a move updates the row and the other device re-reads it every ~2s. No live channel needed. Canned reactions only; requires the parent-account lane.',
  '{"transport":"postgrest-poll","pollMs":2000,"state":"whole-state-in-row","reactions":"canned-only","requires":"account-lane","reference":"chess_matches"}'::jsonb,
  array['multiplayer','turn-based','two-player','cross-device'],
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  rule        = excluded.rule,
  tags        = excluded.tags,
  enabled     = excluded.enabled;

-- Verify:
-- select slug, name, enabled from game_mechanics where 'multiplayer' = any(tags);
