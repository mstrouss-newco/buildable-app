-- db/seed-boardgame-mechanics.sql
-- Registers the reusable mechanics introduced by the simple-board-game batch
-- (Tic-Tac-Toe, Connect Four, Dots and Boxes) so a generation prompt or a future
-- game can request them by name. Idempotent + non-destructive.
-- See MECHANICS.md (section 14) + public/buildable-boardgame.js (BG) for how each
-- one works and how to reuse it. Run ONCE in the Supabase SQL editor (safe to re-run).

-- 1) Same-device hot-seat turn manager (no backend, no accounts)
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'hot-seat-turns',
  'Same-device hot-seat turns',
  'Two players alternate on ONE device (pass-and-play): Player A / Player B take turns, or in solo mode Player B is an easy computer. No backend, no accounts. A move switches the turn unless it grants an extra turn (e.g. claiming a box). Implemented by BG.makeTurn + BG.boot in public/buildable-boardgame.js; the shared shell owns the canvas, pointer->board mapping, start screen (BS), sound (BA), juice (BM), win banner, Home (nav:exit) and the QA scaffold, so a new turn-based board game only supplies its rules + draw.',
  '{"lib":"public/buildable-boardgame.js","global":"BG","factory":"BG.makeTurn(mode)","players":"1=A,2=B","modes":["solo (vs easy computer)","two (hot-seat)"],"extraTurn":"out.extra keeps the same player","backend":"none (v1)","followup":"cross-device poll-a-row left out of v1"}'::jsonb,
  array['turns','hot-seat','board','shell','no-backend'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;

-- 2) Grid line winner — N-in-a-row claim detector (any direction)
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'grid-line-winner',
  'Grid line winner (N-in-a-row)',
  'A reusable win detector: scan a cols x rows grid of cells (0=empty,1=A,2=B) for N-in-a-row in any of 4 directions (horizontal, vertical, both diagonals) and return the winning player + the winning cells (for highlighting). The SAME function powers Tic-Tac-Toe (need=3 on 3x3) and Connect Four (need=4 on 7x6). Pair with BG.boardFull for the draw/tie case.',
  '{"lib":"public/buildable-boardgame.js","fn":"BG.lineWinner(cells, cols, rows, need)","returns":"{player, cells:[idx...]} or null","draw":"BG.boardFull(cells)","reused_by":["tic-tac-toe (need=3)","connect-four (need=4)"]}'::jsonb,
  array['win-condition','grid','detector','reusable'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;

-- 3) Box claim + extra turn (the dots-and-boxes rule)
insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'box-claim-extra-turn',
  'Box claim + extra turn',
  'The dots-and-boxes claim rule as a reusable detector: edges are stored as a horizontal array h[] and a vertical array v[]; drawing the 4th side of a box closes it. BG.boxesNewlyClosed returns the box(es) a freshly drawn edge just completed; the closer claims them AND takes another turn (out.extra=true keeps the same player in the hot-seat manager). Most boxes wins; pressure-free (no harsh fail).',
  '{"lib":"public/buildable-boardgame.js","sides":"BG.boxSides(cols,rows,bc,br)","closed":"BG.boxClosed(h,v,cols,rows,bc,br)","detect":"BG.boxesNewlyClosed(h,v,cols,rows,kind,idx) -> [boxIdx...]","reward":"claim box(es) + extra turn","win":"most boxes when all edges drawn"}'::jsonb,
  array['win-condition','claim','extra-turn','board','reusable'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
