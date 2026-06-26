-- db/add-chess-reaction.sql
-- Adds a column for the canned "reactions" (Nice move!, Nice try!, ...) kids send
-- each move in online family chess. Run ONCE in the Supabase SQL editor.
alter table chess_matches add column if not exists reaction jsonb;
