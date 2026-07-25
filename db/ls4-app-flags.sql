-- db/ls4-app-flags.sql  (Session LS4 — switches the owner can flip himself)
-- Additive + idempotent. Nothing is deleted, nothing existing is altered.
--
-- WHY THIS TABLE EXISTS
-- The Lessons tile has been "Coming soon" behind the 1111 owner gate since LS2,
-- and LS4 ends with the owner turning it on for kids. But the tile lives in the
-- React shell (src/BuildableKids.jsx), so "turn it on" written as a code change
-- means a deploy — and the owner cannot push. That is the exact problem LS3
-- solved for lesson approval by moving the gate into the database, and this is
-- the same move for the section as a whole.
--
-- So: one tiny key/value table, one endpoint (api/app-flags.js), and a switch on
-- /lesson-review. The owner taps it, the tile goes live for kids, no deploy.
--
-- SHAPE: deliberately generic. A flag is a key, a boolean-ish JSON value, and a
-- note about who last touched it. Adding a second switch later costs one row,
-- not a migration.
--
-- READING IS PUBLIC, WRITING IS NOT. api/app-flags.js serves flags to anyone
-- (the Home screen needs them on every load) but only accepts a write with the
-- owner code, and only for a key on its own allow-list.

create table if not exists app_flags (
  key         text primary key,          -- e.g. 'lessons_live'
  value       jsonb not null default 'false'::jsonb,
  note        text,                      -- plain-language reminder of what it does
  updated_at  timestamptz not null default now(),
  updated_by  text                       -- 'owner' | 'auto' — never a real name we cannot verify
);

-- The Lessons switch itself. Seeded OFF on purpose: shipping this file must not
-- change what a kid sees. The owner turns it on when he is ready.
-- ON CONFLICT DO NOTHING means re-running this file can never flip a live switch
-- back off, which is the whole point of an idempotent migration.
insert into app_flags (key, value, note, updated_by)
values (
  'lessons_live',
  'false'::jsonb,
  'When true, the Lessons tile on Home is live for kids instead of Coming soon behind the owner gate.',
  'auto'
)
on conflict (key) do nothing;

-- Read path is a single primary-key lookup, so no extra index is needed.

-- Verify:
--   select key, value, updated_at, updated_by from app_flags order by key;
