-- db/create-invite-matches.sql
-- Quick-play GUEST invite matches (zero-auth). A kid shares a link; whoever opens it
-- types a name and plays — no account, no family. The unguessable `token` IS the
-- capability (it's the link). This is CROSS-family by design, so it does NOT use the
-- family-RLS model: RLS is ON with NO public policy, and the table is only ever touched
-- by the service-role /api/invite endpoint (which validates the token). The whole match
-- lives here, so reopening the link resumes the exact board.
--
-- Run ONCE in the Supabase SQL editor (or psql). Idempotent + non-destructive.

create table if not exists invite_matches (
  token       text primary key,
  game        text not null default 'ttt',          -- which game (v1: tic-tac-toe)
  state       jsonb not null default '{}'::jsonb,    -- board / turn / winner
  host        jsonb,                                  -- { name, device }
  guest       jsonb,                                  -- { name, device }
  status      text not null default 'open',           -- 'open' | 'playing' | 'done'
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  expires_at  timestamptz default now() + interval '7 days'
);
create index if not exists invite_matches_expires on invite_matches(expires_at);

-- Lock it down: no anon/auth access at all. Only the service-role API touches it.
alter table invite_matches enable row level security;

create or replace function touch_invite_match() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists invite_match_touch on invite_matches;
create trigger invite_match_touch before update on invite_matches
  for each row execute function touch_invite_match();

-- Optional cleanup of old links (run anytime):
--   delete from invite_matches where expires_at < now();
