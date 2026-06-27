-- Add a theme label to reusable hero characters so they can be filtered and
-- mixed like community_layers / community_sprites already are (Shared Asset
-- Library rule). Theme is a LABEL, not a fence — heroes stay usable across all
-- themes; this just lets "give me a jungle hero" be a one-line request.
--
-- Safe + idempotent: re-running this changes nothing. Non-destructive.
-- Owner: run once in the Supabase SQL editor.

ALTER TABLE community_characters
  ADD COLUMN IF NOT EXISTS theme_tags text[] DEFAULT '{}';

-- Fast theme filtering on the array.
CREATE INDEX IF NOT EXISTS idx_community_characters_theme_tags
  ON community_characters USING gin (theme_tags);
