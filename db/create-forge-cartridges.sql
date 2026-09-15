-- db/create-forge-cartridges.sql — LAYER THREE'S WORKSHOP (Session CB5).
--
-- Layers one and two build a kid's game out of a game we already ship, so the
-- only thing to store is a manifest and kid_games already holds it. Layer three
-- writes a WHOLE NEW CARTRIDGE, and that file has to live somewhere the repo is
-- not: a game a child made at bedtime cannot wait for a deploy, and nothing a
-- model wrote belongs in main without a person reading it first.
--
-- So it lives here, one row per attempt, and /api/forge serves it from this row
-- inside a strict CSP. The card called for a Supabase storage bucket; a table is
-- what this repo already reaches for (image_cache holds every picture the studio
-- paints) and it means no bucket to provision, no object ACL to get wrong, and
-- the file is served only through our own route where we set the headers.
--
-- The SAME table is the roadmap signal. A forge that never passed its gate still
-- leaves a row with status 'failed' and the child's words on it, so /studio/
-- forge-review is both the promotion queue and the honest list of what kids ask
-- for that we cannot build yet.
--
-- Idempotent: safe to run again.

create table if not exists forge_cartridges (
  id            text primary key,              -- slug, e.g. "lemonade-stand-x7k2"
  kid_game_id   text,                          -- the kid_games row this plays as, once it passes
  family_id     text,                          -- who asked (device lane), for the queue
  kid_id        text,
  kid_name      text,
  grownup_name  text,
  idea          text not null,                 -- the sentence the child actually said
  name          text,                          -- the title the plan gave it
  status        text not null default 'forging',  -- forging | ready | failed | promoted
  attempts      integer not null default 0,    -- how many tries it took (cap is 3)
  html          text,                          -- the cartridge itself
  manifest      jsonb,                         -- its manifest
  sheet         jsonb,                         -- its cobuild sheet, for promotion
  verdict       jsonb,                         -- static checks + the robot's play-through
  problems      jsonb,                         -- why it failed, in the model's own terms
  nearest       text,                          -- the engine we fell back to, when we did
  plays         integer not null default 0,
  cleared       integer not null default 0,
  hearts        integer not null default 0,    -- families who said they loved it
  promoted_as   text,                          -- the engine id it became, once promoted
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists forge_cartridges_status_idx  on forge_cartridges (status, created_at desc);
create index if not exists forge_cartridges_family_idx  on forge_cartridges (family_id, created_at desc);
create index if not exists forge_cartridges_kidgame_idx on forge_cartridges (kid_game_id);

-- RLS on, with no policy: every read and write goes through /api/forge and
-- /api/cobuild-forge, which carry the service key server-side. Same posture as
-- kid_games. A browser can reach a cartridge only through the route that sets
-- the sandbox headers, which is the whole point.
alter table forge_cartridges enable row level security;
