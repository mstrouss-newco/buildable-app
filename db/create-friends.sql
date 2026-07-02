-- db/create-friends.sql
-- ==================================================================
-- THE SHARED FRIENDS + INVITES + PRESENCE LAYER (cross-account play).
-- ------------------------------------------------------------------
-- Everything multiplayer used to be FAMILY-only (two kids under ONE
-- parent account). This adds the ability for a kid to play an APPROVED
-- FRIEND who lives under a DIFFERENT parent account -- once, then in
-- EVERY game (one shared friends list, not per-game).
--
-- Safety model (child product, COPPA-aligned):
--   * No open search, no strangers. Families connect by a private
--     FRIEND CODE a grown-up shares with another grown-up.
--   * BOTH grown-ups must approve before any kid can play.
--   * No free-text chat ever -- canned reactions only (enforced in app).
--
-- One friends layer, reused by every game. A game only supplies its
-- board; local play + friends + invites + online status are inherited.
--
-- Run ONCE in the Supabase SQL editor. Additive + idempotent: nothing
-- is dropped or deleted, safe to re-run. Depends on db/create-accounts.sql
-- (parent_accounts, kid_profiles) having been run first.
-- ==================================================================

-- ------------------------------------------------------------------
-- 0. Helper: a short, human-shareable, unambiguous family code.
--    (No 0/O/1/I/L to avoid "read it out loud" mistakes.)
-- ------------------------------------------------------------------
create or replace function gen_friend_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------
-- 1. Each FAMILY (parent account) gets one private friend code.
-- ------------------------------------------------------------------
alter table parent_accounts add column if not exists friend_code text;

-- Backfill any existing accounts that don't have a code yet, keeping it unique.
do $$
declare r record; code text;
begin
  for r in select id from parent_accounts where friend_code is null loop
    loop
      code := gen_friend_code();
      exit when not exists (select 1 from parent_accounts where friend_code = code);
    end loop;
    update parent_accounts set friend_code = code where id = r.id;
  end loop;
end $$;

-- New accounts auto-get a unique code on insert.
create or replace function set_friend_code() returns trigger as $$
declare code text;
begin
  if new.friend_code is null then
    loop
      code := gen_friend_code();
      exit when not exists (select 1 from parent_accounts where friend_code = code);
    end loop;
    new.friend_code := code;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists parent_friend_code on parent_accounts;
create trigger parent_friend_code before insert on parent_accounts
  for each row execute function set_friend_code();

create unique index if not exists parent_accounts_friend_code_uidx
  on parent_accounts (friend_code) where friend_code is not null;

-- ------------------------------------------------------------------
-- 2. PRESENCE: when was this kid last active? Online = seen recently.
--    The app PATCHes last_seen every ~30s while a kid is in the app
--    (own kid row, allowed by the existing kid_profiles RLS). The
--    friends list treats "seen in the last 90 seconds" as online.
-- ------------------------------------------------------------------
alter table kid_profiles add column if not exists last_seen timestamptz;
create index if not exists idx_kid_profiles_last_seen on kid_profiles (last_seen);

-- ------------------------------------------------------------------
-- 3. FAMILY_FRIENDS: one row = a friendship between two FAMILIES.
--    Family-to-family (not kid-to-kid) on purpose: simpler + safest,
--    and it means "approved once = friends in every game". Any kid in
--    family A may play any kid in family B once status = 'active'.
--    parent_a = the family that entered the code (requester).
--    parent_b = the family that owns the code (must approve).
-- ------------------------------------------------------------------
create table if not exists family_friends (
  id          uuid primary key default gen_random_uuid(),
  parent_a    uuid not null references parent_accounts(id) on delete cascade,
  parent_b    uuid not null references parent_accounts(id) on delete cascade,
  status      text not null default 'pending',   -- 'pending' | 'active' | 'declined'
  approved_a  boolean not null default true,     -- requester approves by requesting
  approved_b  boolean not null default false,    -- other grown-up must approve
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (parent_a, parent_b)
);
create index if not exists idx_family_friends_a on family_friends (parent_a);
create index if not exists idx_family_friends_b on family_friends (parent_b);

create or replace function touch_family_friends() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists family_friends_touch on family_friends;
create trigger family_friends_touch before update on family_friends
  for each row execute function touch_family_friends();

alter table family_friends enable row level security;
-- A grown-up can READ any friendship their family is part of (to see
-- pending requests + their approved friends). All WRITES go through the
-- service-role /api/friends endpoint (which validates the caller's JWT,
-- resolves the other family's code, and emails them) -- so no write
-- policy is granted to anon/auth here.
drop policy if exists family_friends_read on family_friends;
create policy family_friends_read on family_friends
  for select using (auth.uid() = parent_a or auth.uid() = parent_b);

-- ------------------------------------------------------------------
-- 4. GAME_INVITES: one shared invite object for EVERY game. A kid taps
--    a friend -> a row here. Online friend: they see it live (their app
--    polls their inbox). Offline friend: it waits + their grown-up gets
--    an email. On accept, a friend_matches row is created and both
--    devices launch the same game.
-- ------------------------------------------------------------------
create table if not exists game_invites (
  id          uuid primary key default gen_random_uuid(),
  game        text not null,                     -- 'chess', 'tennis', ...
  transport   text not null default 'turns',     -- 'turns' | 'realtime'
  from_kid    uuid not null references kid_profiles(id) on delete cascade,
  from_parent uuid not null references parent_accounts(id) on delete cascade,
  to_kid      uuid not null references kid_profiles(id) on delete cascade,
  to_parent   uuid not null references parent_accounts(id) on delete cascade,
  world       text,
  status      text not null default 'pending',   -- pending | accepted | declined | canceled | expired
  match_id    uuid,                              -- set when accepted (-> friend_matches.id)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '2 hours'
);
create index if not exists idx_game_invites_to   on game_invites (to_parent, status);
create index if not exists idx_game_invites_from on game_invites (from_parent, status);

create or replace function touch_game_invites() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists game_invites_touch on game_invites;
create trigger game_invites_touch before update on game_invites
  for each row execute function touch_game_invites();

alter table game_invites enable row level security;
-- Either family may READ invites they sent or received (inbox + the
-- sender's "waiting" poll). WRITES go through /api/friends (service role).
drop policy if exists game_invites_read on game_invites;
create policy game_invites_read on game_invites
  for select using (auth.uid() = from_parent or auth.uid() = to_parent);

-- ------------------------------------------------------------------
-- 5. FRIEND_MATCHES: ONE cross-account match table for ALL games.
--    Unlike the family tables (single parent_id RLS), a friend match
--    has TWO parents, so the row carries both and RLS lets EITHER
--    family read + update it. `state` holds the whole game state
--    (turn-based board for chess, or lobby/score for realtime, exactly
--    like rt_matches). Distinguished by `game` + `transport`, so a new
--    game needs no new table.
-- ------------------------------------------------------------------
create table if not exists friend_matches (
  id            uuid primary key default gen_random_uuid(),
  game          text not null,                   -- 'chess', 'tennis', ...
  transport     text not null default 'turns',   -- 'turns' | 'realtime'
  host_kid      uuid not null references kid_profiles(id) on delete cascade,
  host_parent   uuid not null references parent_accounts(id) on delete cascade,
  guest_kid     uuid not null references kid_profiles(id) on delete cascade,
  guest_parent  uuid not null references parent_accounts(id) on delete cascade,
  world         text,
  state         jsonb not null default '{}'::jsonb,  -- whole game state (board/turn/...)
  turn          text,                            -- convenience for turn-based ('host'|'guest')
  last_move     jsonb,
  reaction      jsonb,                            -- { text, by, at } canned reaction only
  status        text not null default 'active',  -- active | done
  winner        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_friend_matches_host  on friend_matches (host_kid, status);
create index if not exists idx_friend_matches_guest on friend_matches (guest_kid, status);

create or replace function touch_friend_matches() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists friend_matches_touch on friend_matches;
create trigger friend_matches_touch before update on friend_matches
  for each row execute function touch_friend_matches();

alter table friend_matches enable row level security;
-- BOTH families may read AND update the shared match row (each device
-- polls + patches its own moves, exactly like family chess). Rows are
-- only created by /api/friends on accept, so no insert policy is granted.
drop policy if exists friend_matches_rw on friend_matches;
create policy friend_matches_rw on friend_matches
  for select using (auth.uid() = host_parent or auth.uid() = guest_parent);
drop policy if exists friend_matches_update on friend_matches;
create policy friend_matches_update on friend_matches
  for update using (auth.uid() = host_parent or auth.uid() = guest_parent);

-- ------------------------------------------------------------------
-- Optional housekeeping (run anytime):
--   delete from game_invites where expires_at < now() and status = 'pending';
-- ------------------------------------------------------------------
