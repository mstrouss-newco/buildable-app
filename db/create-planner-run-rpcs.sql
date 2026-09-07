-- db/create-planner-run-rpcs.sql — the writes a CLOUD run session is allowed to make
-- (card RB2). Idempotent: every function is CREATE OR REPLACE, nothing is dropped.
--
-- Why these exist at all. A session on Mike's Mac reaches the planner through
-- /api/planner, which holds the service key server-side. A session in the cloud
-- sandbox cannot reach that host at all, so it talks to Supabase directly through
-- the connected MCP. That means every planner write from a cloud session is raw
-- SQL, and raw SQL against a single JSON blob is exactly how a roadmap gets wiped:
-- read 226 cards, change one, write back 1.
--
-- So a cloud session never reads-and-writes the blob. It calls one of these
-- functions, each of which:
--   * changes ONE card, inside ONE statement, with jsonb_agg over the live array,
--   * counts the cards before and after and RAISES if the number moved,
--   * returns that count, so the caller checks it too.
--
-- The claim function is the other half: two runners can never take the same run,
-- because the row is locked and skipped while it is being claimed.

-- ---------------------------------------------------------------- claiming a run
-- Pops the oldest run that is ready and whose start time has arrived, marks it
-- running, and stamps who took it. FOR UPDATE SKIP LOCKED is what makes a second
-- caller at the same instant get nothing rather than the same row.
create or replace function planner_claim_run(p_by text)
returns setof planner_runs
language sql
as $$
  update planner_runs set status = 'running', claimed_by = left(coalesce(p_by, 'cloud'), 80), claimed_at = now()
  where id = (
    select id from planner_runs
    where status = 'ready' and (start_at is null or start_at <= now())
    order by id asc
    limit 1
    for update skip locked
  )
  returning *;
$$;

-- Hand a claimed run back untouched (a pre-flight check failed, the session died
-- before starting). Ready again, so the next kick picks it up.
create or replace function planner_release_run(p_run bigint)
returns setof planner_runs
language sql
as $$
  update planner_runs set status = 'ready', claimed_by = null, claimed_at = null
  where id = p_run and status = 'running'
  returning *;
$$;

-- One card outcome, appended as the run goes, so a run that dies half way still
-- says what it managed. The server stamps the time; a caller never passes one.
create or replace function planner_run_outcome(p_run bigint, p_entry jsonb)
returns integer
language plpgsql
as $$
declare n integer;
begin
  update planner_runs
     set outcomes = outcomes || jsonb_build_array(p_entry || jsonb_build_object('at', to_jsonb(now())))
   where id = p_run and status = 'running'
   returning jsonb_array_length(outcomes) into n;
  if n is null then raise exception 'run % is not running', p_run; end if;
  return n;
end$$;

-- The end of a run: 'done' worked everything it was given, 'stopped' gave up.
create or replace function planner_run_finish(p_run bigint, p_status text, p_summary text)
returns setof planner_runs
language sql
as $$
  update planner_runs
     set status = case when p_status = 'stopped' then 'stopped' else 'done' end,
         summary = left(coalesce(p_summary, ''), 8000),
         finished_at = now()
   where id = p_run and status = 'running'
  returning *;
$$;

-- ------------------------------------------------------------- one card at a time
-- Tick a card done. Mirrors op:'card' in api/planner.js, including clearing any
-- pending review flag, and adds the count guard the API gets for free by rebuilding
-- the blob in JavaScript.
create or replace function planner_card_done(p_id text, p_note text default null)
returns table (cards integer, notes integer)
language plpgsql
as $$
declare before_n integer; after_n integer;
begin
  select jsonb_array_length(data->'roadmap'->'sessions') into before_n from planner_meta where id = 1;
  if before_n is null then raise exception 'no roadmap in planner_meta'; end if;
  if not exists (select 1 from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                  where m.id = 1 and e->>'id' = p_id)
    then raise exception 'card id not found: %', p_id; end if;

  update planner_meta set data = jsonb_set(data, '{roadmap,sessions}', (
    select jsonb_agg(case when e->>'id' = p_id then
        e || jsonb_build_object('done', true, 'needsReview', false, 'reviewRequestedAt', null)
          || case when coalesce(p_note, '') = '' then '{}'::jsonb
                  else jsonb_build_object('notes', (
                    select jsonb_agg(x) from (
                      select x from jsonb_array_elements(coalesce(e->'notes', '[]'::jsonb) || to_jsonb(array[left(p_note, 400)])) x
                      offset greatest(0, jsonb_array_length(coalesce(e->'notes', '[]'::jsonb)) + 1 - 20)
                    ) t)) end
      else e end)
    from jsonb_array_elements(data->'roadmap'->'sessions') e))
   where id = 1;

  select jsonb_array_length(data->'roadmap'->'sessions') into after_n from planner_meta where id = 1;
  if after_n is distinct from before_n then
    raise exception 'roadmap card count moved % -> %, refusing', before_n, after_n;
  end if;
  return query
    select after_n, (select jsonb_array_length(coalesce(e->'notes', '[]'::jsonb))::integer
                       from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                      where m.id = 1 and e->>'id' = p_id);
end$$;

-- Flag a card for Mike. The question comes first and must actually be a question:
-- the planner is asking him to decide something, so it has to say what. Same rule
-- planner.mjs enforces on the Mac side, enforced here so the cloud cannot skip it.
create or replace function planner_card_review(p_id text, p_question text)
returns table (cards integer, notes integer)
language plpgsql
as $$
declare before_n integer; after_n integer;
begin
  if coalesce(p_question, '') = '' or position('?' in p_question) = 0 then
    raise exception 'a review note must ask a question, and the question comes first';
  end if;
  select jsonb_array_length(data->'roadmap'->'sessions') into before_n from planner_meta where id = 1;
  if before_n is null then raise exception 'no roadmap in planner_meta'; end if;
  if not exists (select 1 from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                  where m.id = 1 and e->>'id' = p_id)
    then raise exception 'card id not found: %', p_id; end if;

  update planner_meta set data = jsonb_set(data, '{roadmap,sessions}', (
    select jsonb_agg(case when e->>'id' = p_id then
        e || jsonb_build_object('needsReview', true, 'reviewRequestedAt', to_jsonb(now()),
              'notes', (select jsonb_agg(x) from (
                 select x from jsonb_array_elements(coalesce(e->'notes', '[]'::jsonb) || to_jsonb(array[left(p_question, 400)])) x
                 offset greatest(0, jsonb_array_length(coalesce(e->'notes', '[]'::jsonb)) + 1 - 20)
               ) t))
      else e end)
    from jsonb_array_elements(data->'roadmap'->'sessions') e))
   where id = 1;

  select jsonb_array_length(data->'roadmap'->'sessions') into after_n from planner_meta where id = 1;
  if after_n is distinct from before_n then
    raise exception 'roadmap card count moved % -> %, refusing', before_n, after_n;
  end if;
  return query
    select after_n, (select jsonb_array_length(coalesce(e->'notes', '[]'::jsonb))::integer
                       from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                      where m.id = 1 and e->>'id' = p_id);
end$$;

-- One plain note on a card, nothing else changed. Kept to the last 20, like the API.
create or replace function planner_card_note(p_id text, p_text text)
returns table (cards integer, notes integer)
language plpgsql
as $$
declare before_n integer; after_n integer;
begin
  if coalesce(p_text, '') = '' then raise exception 'a note needs some text'; end if;
  select jsonb_array_length(data->'roadmap'->'sessions') into before_n from planner_meta where id = 1;
  if before_n is null then raise exception 'no roadmap in planner_meta'; end if;
  if not exists (select 1 from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                  where m.id = 1 and e->>'id' = p_id)
    then raise exception 'card id not found: %', p_id; end if;

  update planner_meta set data = jsonb_set(data, '{roadmap,sessions}', (
    select jsonb_agg(case when e->>'id' = p_id then
        e || jsonb_build_object('notes', (select jsonb_agg(x) from (
               select x from jsonb_array_elements(coalesce(e->'notes', '[]'::jsonb) || to_jsonb(array[left(p_text, 400)])) x
               offset greatest(0, jsonb_array_length(coalesce(e->'notes', '[]'::jsonb)) + 1 - 20)
             ) t))
      else e end)
    from jsonb_array_elements(data->'roadmap'->'sessions') e))
   where id = 1;

  select jsonb_array_length(data->'roadmap'->'sessions') into after_n from planner_meta where id = 1;
  if after_n is distinct from before_n then
    raise exception 'roadmap card count moved % -> %, refusing', before_n, after_n;
  end if;
  return query
    select after_n, (select jsonb_array_length(coalesce(e->'notes', '[]'::jsonb))::integer
                       from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e
                      where m.id = 1 and e->>'id' = p_id);
end$$;
