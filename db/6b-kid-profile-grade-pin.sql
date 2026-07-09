-- db/6b-kid-profile-grade-pin.sql  (Session 6B — onboarding)
-- Add a grade band and an OPTIONAL kid PIN to kid profiles.
-- Run ONCE in the Supabase SQL editor. Additive + idempotent. Nothing deleted.
--
-- grade    : short band string (e.g. 'k','1','2',...'6'). Drives the learning
--            level (question difficulty) instead of the old free-form age.
-- pin_hash : OPTIONAL. A short hash of a 4-digit PIN a sibling would need to
--            open this profile. NULL = no PIN (default). The raw PIN is never
--            stored; the app hashes it before saving. This is a snoop guard for
--            siblings, NOT real security.

alter table kid_profiles add column if not exists grade    text;
alter table kid_profiles add column if not exists pin_hash text;
