-- db/ls4-lessons-live-on.sql
-- Turn the Lessons section on for kids (Session QA-FIX, 2026-08-30).
--
-- The Learn door on Home reads api/app-flags.js, which reads this row. Session LS4
-- deliberately made it a DATABASE switch rather than a code constant so the owner can
-- open and close the section without a deploy. Mike approved opening it in chat on
-- 2026-08-30, after QA3d found that /lessons was fully live (11 maths + 19 reading
-- lessons, placement, read-aloud, star check) while the Home tile still said
-- "Coming soon" with no way in.
--
-- This file is the reviewable record of a change that was applied in that session.
-- It is idempotent: safe to run again, and it creates the row if it is missing.
--
-- To close the section again, run the same statement with 'false'::jsonb.

insert into app_flags (key, value, updated_at, updated_by)
values ('lessons_live', 'true'::jsonb, now(), 'QA-FIX 2026-08-30')
on conflict (key) do update
  set value = 'true'::jsonb,
      updated_at = now(),
      updated_by = 'QA-FIX 2026-08-30';

-- Verify:
--   select key, value, updated_at, updated_by from app_flags where key = 'lessons_live';
