-- db/create-kid-games.sql
-- Session CB1 (Cobuild): the table a KID-MADE GAME lives in.
--
-- A kid-made game is NOT new engine code. It is a manifest the kid owns, pointed
-- at an engine we already ship (breaker / sling / castleguard / skyflyer). The
-- row below IS the game: the shell launches an engine with ?kg=<id> and the
-- shared loader (public/buildable-manifest.js) serves this manifest instead of
-- the stock one.
--
-- Idempotent ("if not exists"); deletes nothing. Applied in-session with the
-- Supabase MCP (apply_migration), per AGENTS.md "Running SQL yourself".
--
-- RLS is ON with NO policy on purpose, exactly like invite_matches: the ONLY
-- thing that ever touches this table is /api/kid-game.js, which carries the
-- service key server-side and does its own ownership checks (family_id / kid_id
-- for private rows, the public flag for a guest link). Nothing reaches it with
-- an anon key, so there is no anon lane to lock down.

create table if not exists kid_games (
  id            text primary key,              -- short slug, e.g. "pizza-dragon-k3f9"
  family_id     text,                          -- the family lane (device id or parent id)
  kid_id        text,                          -- which kid made it
  kid_name      text,                          -- shown on the loading screen + share link
  grownup_name  text,                          -- "A GAME BY <kid> AND <grownup>"
  engine        text not null,                 -- breaker | sling | castleguard | skyflyer
  name          text not null,                 -- the kid's title for their game
  cover         text,                          -- image_cache key or asset id
  manifest      jsonb not null,                -- the manifest-v2 the engine plays
  source_game   text,                          -- what it was forked from (our id, or another kid_games.id)
  layer         integer default 1,             -- how many remixes deep (source layer + 1)
  plays         integer default 0,
  cleared       integer default 0,
  shared        boolean default false,          -- a private /g/<id> link exists
  public        boolean default false,          -- listed publicly (moderated)
  robot         jsonb,                          -- play-test verdict, same shape as the editor's
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists kid_games_family_idx on kid_games (family_id, created_at desc);
create index if not exists kid_games_kid_idx    on kid_games (kid_id, created_at desc);
create index if not exists kid_games_engine_idx on kid_games (engine);
create index if not exists kid_games_public_idx on kid_games (public) where public;
create index if not exists kid_games_source_idx on kid_games (source_game);

alter table kid_games enable row level security;

-- Verify:
--   select count(*) from kid_games;
--   select id, engine, name, kid_name, layer from kid_games order by created_at desc limit 10;

-- ---------------------------------------------------------------------------
-- Soft delete. A kid's "Delete" must never be an irreversible row removal in a
-- kids' product (and AGENTS.md forbids destructive statements outright), so
-- /api/kid-game.js op=delete stamps deleted_at and every read filters it out.
-- The game vanishes from My Games and from its share link; nothing is lost.
alter table kid_games add column if not exists deleted_at timestamptz;
create index if not exists kid_games_alive_idx on kid_games (family_id, created_at desc) where deleted_at is null;
