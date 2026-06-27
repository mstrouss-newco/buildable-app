-- db/seed-word-buddies-mechanics.sql
-- Registers the reusable mechanic introduced by Word Buddies so other learning games
-- (Typing, Bingo, future readers) can request it by name. Idempotent + non-destructive.
-- See MECHANICS.md (the "teach / hint / spell" mechanic) + public/word-buddies.html
-- (makeTeachHint) for the implementation and the small dependency contract.
-- Run ONCE in the Supabase SQL editor (safe to re-run).

insert into game_mechanics (slug, name, description, rule, tags, enabled)
values (
  'teach-hint-spell',
  'Teaching Helper (hint + spell-aloud)',
  'A friendly "stuck?" Helper for learning games. Given the valid word list, the board/grid state, and the learner''s available letters, it FINDS a word the learner can actually make right now (shorter words first = friendlier), HIGHLIGHTS the tiles in order, PLACES them, and SPELLS THE WORD ALOUD letter-by-letter then blended ("C... A... T... cat!") using crafted speech (/api/spell-voice). The Helper never scores against the learner — the host credits the learner. Triggers: a button (capped per game) AND an auto-offer after N wrong tries. Reusable via the makeTeachHint(deps) contract in public/word-buddies.html: deps={words, rows, cols, letterAt, rackOf, place, sayLetter, sayWord, onStep, onWord}. Always-winnable backstop: pair with a rack-reshuffle so a makeable move (through an anchor, or a crossword-style touch placement) almost always exists.',
  '{"finds":"first makeable word, shortest-first","connect":["through an existing letter","crossword-style touch (>=1 cell next to a committed tile)"],"boundaries":"empty before/after so the run is exactly the word","speak":"/api/spell-voice?letter=<c> then ?word=<w>","trigger":{"button_per_game":3,"auto_after_wrong":3},"scoring":"never against the learner — host credits the learner","contract":"makeTeachHint({words,rows,cols,letterAt,rackOf,place,sayLetter,sayWord,onStep,onWord})","reuse":["word-buddies","typing","bingo"]}'::jsonb,
  array['learning','hint','accessibility','reading','spelling','reusable'],
  true
)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  rule = excluded.rule, tags = excluded.tags, enabled = excluded.enabled;
