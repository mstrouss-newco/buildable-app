-- db/6d-guest-invite-chess.sql
-- Session 6D: teach the zero-auth guest invite (invite_matches) to carry CHESS and
-- to show up in the parent portal.
--
-- Builds on db/create-invite-matches.sql (run that first if the table is missing).
-- All ADDs are IF NOT EXISTS -> idempotent + non-destructive. Run ONCE in the
-- Supabase SQL editor. Nothing is dropped or deleted.
--
-- Why each column:
--   game        already exists; now also holds 'chess' (was 'ttt' only).
--   world       chess scene for the match (jungle/ocean/space/...).
--   last_move   the opponent's most recent move, for animating it on the other device.
--   reaction    the last canned cheer relayed between the two players.
--   host_kid    the signed-in kid who started the link (nullable; device-local kids stay null).
--   host_parent the kid's family owner, so the parent portal can list guest games.

alter table invite_matches add column if not exists world       text;
alter table invite_matches add column if not exists last_move   jsonb;
alter table invite_matches add column if not exists reaction    jsonb;
alter table invite_matches add column if not exists host_kid    uuid;
alter table invite_matches add column if not exists host_parent uuid;

-- Parent portal reads guest games by family owner.
create index if not exists invite_matches_host_parent on invite_matches(host_parent);

-- RLS stays ON with NO public policy: only the service-role /api/invite endpoint
-- ever touches this table (it validates the token / parent id). Nothing to change here.
