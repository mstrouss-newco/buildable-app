-- db/create-cobuild-plans.sql
-- Session CB4 (Cobuild): the GROWN-UP side — what a family is on, and the house
-- rules they set for each kid.
--
-- Two tables, both additive and idempotent ("if not exists"), nothing dropped.
-- Applied in-session with the Supabase MCP (apply_migration), per AGENTS.md
-- "Running SQL yourself".
--
-- RLS is ON with NO policy on both, exactly like kid_games and invite_matches:
-- the only things that touch them are /api/cobuild-billing.js and
-- /api/cobuild-rules.js, which carry the service key server-side and do their own
-- ownership checks on family_id. Nothing reaches them with an anon key, so there
-- is no anon lane to lock down. NOTHING here holds a card number or a secret: the
-- Stripe ids below are the customer/subscription handles Stripe itself hands back,
-- which are useless without the key that lives in Vercel.

-- ---------------------------------------------------------------------------
-- WHAT A FAMILY IS ON. One row per family. games_used is the METER: a NEW game
-- counts one, a remix counts one, an EDIT NEVER COUNTS, and a layer-three build
-- (CB5) counts two. period_start is what "this month" means for that family, and
-- it moves on its own renewal date rather than the first of the month.
-- ---------------------------------------------------------------------------
create table if not exists cobuild_plans (
  family_id       text primary key,             -- the family lane (device id or parent id)
  plan            text not null default 'none', -- none | preview | cobuild | premium
  games_included  integer not null default 0,   -- new games this plan includes each month
  games_used      integer not null default 0,   -- the meter, reset when the period rolls
  extra_games     integer not null default 0,   -- bought as a three-game add-on
  period_start    timestamptz not null default now(),
  stripe_customer text,                         -- a handle, not a secret
  stripe_sub      text,                         -- a handle, not a secret
  status          text not null default 'active', -- active | past_due | canceled | preview
  email           text,                         -- what the grown-up signed up with
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists cobuild_plans_customer_idx on cobuild_plans (stripe_customer);
create index if not exists cobuild_plans_sub_idx      on cobuild_plans (stripe_sub);
alter table cobuild_plans enable row level security;

-- ---------------------------------------------------------------------------
-- THE HOUSE RULES, per kid, ALL OFF BY DEFAULT. A grown-up turns one on; nothing
-- here ever nags a child. Vegetables first applies the CB2 mathGate recipe to the
-- games named in veg_games. Chores is a short list the grown-up writes and the
-- child ticks. play_minutes 0 means the play clock is off.
-- ---------------------------------------------------------------------------
create table if not exists cobuild_house_rules (
  family_id     text not null,
  kid_id        text not null,
  veg_first     boolean not null default false,
  veg_games     jsonb   not null default '[]'::jsonb,  -- kid_games ids the gate applies to
  chores        jsonb   not null default '[]'::jsonb,  -- [{id,text}] the grown-up wrote
  chores_done   jsonb   not null default '{}'::jsonb,  -- {"date":"2026-09-06","done":["c1"]}
  play_minutes  integer not null default 0,            -- 0 = no play clock
  play_used     jsonb   not null default '{}'::jsonb,  -- {"date":"2026-09-06","minutes":12}
  updated_at    timestamptz not null default now(),
  primary key (family_id, kid_id)
);
alter table cobuild_house_rules enable row level security;

-- ---------------------------------------------------------------------------
-- The waitlist rows from the fake door get a "we told them" stamp, so the day the
-- real door opens nobody is emailed twice. Additive column, safe to re-run.
-- ---------------------------------------------------------------------------
alter table cobuild_leads add column if not exists notified_at timestamptz;
