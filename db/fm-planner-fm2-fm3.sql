-- FM2 + FM3 planner state, written 2026-09-06.
--
-- WHY THIS IS A FILE AND NOT `node scripts/planner.mjs`: the planner tool talks
-- to https://buildablekids.com/api/planner, and this session's network policy
-- blocks that host (CONNECT tunnel 403 from the agent proxy). So the same two
-- card updates are made through the connected Supabase MCP instead, and this is
-- the reviewable, re-runnable record of exactly what changed.
--
-- It is SURGICAL on purpose. AGENTS.md forbids rebuilding the roadmap blob by
-- hand — that is how 107 cards get wiped. This only ever calls jsonb_set on the
-- named fields of the two cards it is about, addressed by looking their index up
-- rather than hardcoding one, and it is idempotent: running it twice leaves the
-- same state and adds no second note.
--
--   FM2 -> stays done; a note recording that it finally landed on main.
--          NOT marked deployed: this session cannot reach the live site to
--          check, and AGENTS.md says never set deployed on the strength of a
--          push alone.
--   FM3 -> open + needsReview, because the whole farm is unsigned art Mike has
--          never laid eyes on. The note opens with the question, as the planner
--          requires.

do $$
declare
  i_fm2 int;
  i_fm3 int;
  d jsonb;
  note_fm2 jsonb := jsonb_build_object(
    'at', '2026-09-06T00:00:00Z',
    'text', 'Landed on main 2026-09-06 after sitting unmerged since 2026-08-16. '
         || 'Merged main in by hand; the four conflicts were all both-sides-added '
         || 'at the top of a file and both dated entries were kept. Checked by '
         || 'counting rather than by eye, because a resolver on this branch '
         || 'swallowed a QA block once: qa-skyflyer came out at exactly 382 + 39 '
         || '= 421. Not marked deployed — the session that landed it could not '
         || 'reach the live site to check.');
  note_fm3 jsonb := jsonb_build_object(
    'at', '2026-09-06T00:00:00Z',
    'text', 'Does the farm look right?  FM1 and FM2 were both built by sessions '
         || 'with no browser, so nothing in the farm has ever been looked at. '
         || 'FM3 is built and green on branch claude/farm-mode-fm2-fm3-lp2354 '
         || 'with renders attached: the field, the crate and the unload, the '
         || 'plane, the duck, and the order card empty/half/full at phone, '
         || 'tablet and desktop. Three things already changed because of the '
         || 'renders (the runway was a white slab, the crate was smaller than '
         || 'the kid, the empty slots were unreadable). Coins and the duck were '
         || 'Mike''s calls this session. Nothing lands on main until he has seen '
         || 'it.');
begin
  select data into d from planner_meta where id = 1;

  select (ord - 1) into i_fm2 from jsonb_array_elements(d->'roadmap'->'sessions')
    with ordinality as t(s, ord) where s->>'id' = 'FM2';
  select (ord - 1) into i_fm3 from jsonb_array_elements(d->'roadmap'->'sessions')
    with ordinality as t(s, ord) where s->>'id' = 'FM3';
  if i_fm2 is null or i_fm3 is null then
    raise exception 'FM2/FM3 not found in the roadmap — refusing to touch anything';
  end if;

  -- FM2: done, with the landing note (added once)
  d := jsonb_set(d, array['roadmap','sessions',i_fm2::text,'done'], 'true'::jsonb);
  if not (d #> array['roadmap','sessions',i_fm2::text,'notes'] @> jsonb_build_array(note_fm2)) then
    d := jsonb_set(d, array['roadmap','sessions',i_fm2::text,'notes'],
           (d #> array['roadmap','sessions',i_fm2::text,'notes']) || jsonb_build_array(note_fm2));
  end if;

  -- FM3: open, wants Mike's eyes
  d := jsonb_set(d, array['roadmap','sessions',i_fm3::text,'done'], 'false'::jsonb);
  d := jsonb_set(d, array['roadmap','sessions',i_fm3::text,'needsReview'], 'true'::jsonb);
  d := jsonb_set(d, array['roadmap','sessions',i_fm3::text,'reviewRequestedAt'],
         to_jsonb('2026-09-06T00:00:00Z'::text));
  if not (d #> array['roadmap','sessions',i_fm3::text,'notes'] @> jsonb_build_array(note_fm3)) then
    d := jsonb_set(d, array['roadmap','sessions',i_fm3::text,'notes'],
           (d #> array['roadmap','sessions',i_fm3::text,'notes']) || jsonb_build_array(note_fm3));
  end if;

  update planner_meta set data = d where id = 1;
end $$;
