-- Per-kid game telemetry: one row per play / win / lose, for tracking favorite
-- games + progress and (later) letting the helper/AI learn about each kid.
-- Additive + idempotent. No FK (best-effort analytics log); kid_profile_id is
-- text so it accepts both account UUIDs and guest ids. Safe to run repeatedly.
create table if not exists kid_game_events (
  id              bigint generated always as identity primary key,
  kid_profile_id  text,
  device_id       text,
  game            text not null,
  event           text not null,            -- 'play' | 'win' | 'lose'
  meta            jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists kid_game_events_kid_idx  on kid_game_events (kid_profile_id, created_at desc);
create index if not exists kid_game_events_game_idx on kid_game_events (game);
