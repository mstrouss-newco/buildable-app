# RUN-ANYWHERE.md — working a saved run from the cloud

Read this **in addition to** `AGENTS.md` and `AUTOPILOT.md` when your prompt says
*work the waiting run*, or when you were started by the run task rather than by Mike
typing. Card **RB2**.

`AUTOPILOT.md` still describes how a single card is worked and how decisions get made
when nobody is watching. Nothing here overrides the **Guardrails** in `AGENTS.md`.
This file only covers what is different when the session is in the cloud with Mike's
Mac closed.

---

## The three things that are different up here

1. **`/api/planner` does not exist for you.** The cloud sandbox cannot reach
   `buildablekids.com` at all — a request times out with no response, not a 403 you
   can work around. Every planner read and write goes through the **connected
   Supabase MCP** instead, project **Buildable Kids**, ref `fmguhfmfntvohtnccmap`.
   `scripts/planner.mjs` is a Mac tool; it will hang up here. Do not reach for it.
2. **You never read-and-write the roadmap blob.** All 226 cards live in one JSON
   value. Read it, change one card, write it back, and one bad serialisation wipes the
   roadmap. So you call the functions in `db/create-planner-run-rpcs.sql`, each of
   which changes ONE card inside ONE statement, counts the cards before and after, and
   raises if the number moved. **Check the count it returns every time.**
3. **One lane.** There are no parallel cloud lanes in v1. Two sessions working the
   same run would fight over the same cards and the same branch. The claim below is
   atomic precisely so a second session gets nothing rather than a collision.

---

## Dry run first. This is not optional.

A run carries a `mode` in its settings. **`dry` is the default and, until Mike has
approved a dry-run report, the only mode that will pass the check.**

A dry run means: claim the run, work out exactly what you would do, write that up, and
**ship nothing** — no commits, no pushes, no cards ticked, no branches. Then finish the
run so the report shows up on the planner, and stop. Mike presses "Looks right" on the
report, and only then can a run be saved with mode `real`.

`run-lane.mjs check` refuses a `real` run whose settings do not carry
`dryApproved: true`. That flag is stamped by the planner when the run is saved, and only
after an approved report exists. You cannot set it yourself, and you must not try.

---

## The run, start to finish

### 1. Claim it

```sql
select * from planner_claim_run('cloud');
```

Nothing back means there was no run waiting, or its start time has not arrived. Say so
in one line and stop — that is a normal outcome, not a failure. One row back means the
run is yours and is now `running`; nobody else can claim it.

### 2. Read the cards and check the run

Pull the run and the roadmap into one file, because the checker is a plain script that
takes a file:

**Do not ask for the whole roadmap.** All 226 cards with their descriptions come to
about 210KB, which is more than a reply can carry — the read fails and you have burned a
turn. Ask for the run's own cards in full and everything else as a one-line row. That is
about 33KB, and it is all the checker needs: the full text for the cards being worked,
and just the id, name and done flag for everything a card might depend on.

```sql
with r as (select * from planner_runs where id = <RUN ID>),
mine as (select jsonb_array_elements_text(x) id from r, jsonb_array_elements(r.sessions) x)
select jsonb_build_object(
  'run', to_jsonb(r),
  'cards', (select jsonb_agg(jsonb_build_object(
       'id', e->>'id', 'name', e->>'name', 'phaseNum', e->>'phaseNum',
       'done', coalesce((e->>'done')::boolean, false),
       'needsReview', coalesce((e->>'needsReview')::boolean, false),
       'later', coalesce((e->>'later')::boolean, false))
     || case when e->>'id' in (select id from mine)
             then jsonb_build_object('desc', e->>'desc') else '{}'::jsonb end)
   from planner_meta m, jsonb_array_elements(m.data->'roadmap'->'sessions') e where m.id = 1)
) from r;
```

Save that as `run.json` in the repo, then:

```
node scripts/run-lane.mjs check  run.json
node scripts/run-lane.mjs plan   run.json
```

`check` prints the mode, then any **BLOCKER** and any **warning**. A blocker means do
not work the run: hand it back with `select * from planner_release_run(<RUN ID>);`,
say why in one line, and stop. Warnings are for the report, not a reason to stop.

### 3. If the mode is `dry`

```
node scripts/run-lane.mjs report run.json
```

Store that as the run's summary and finish, in one statement:

```sql
select * from planner_run_finish(<RUN ID>, 'done', $$<the report text>$$);
```

Then stop. Do not build anything. Do not touch a card.

### 4. If the mode is `real`

Work the sessions **in the order the run gives them**, one at a time:

```
node scripts/run-lane.mjs next   run.json      -> work / stop / finished
node scripts/run-lane.mjs prompt run.json 1    -> the prompt for step 1
```

For each step:

- Build every card in that step as **one** session — one clone, one deploy, one QA pass.
  Two or more cards in a step is the **GROUPED** law in `AGENTS.md`.
- Ship or park per the run's settings. Park means the whole run lands on **one** branch
  and nothing merges to main.
- Verify: run the `qa-*.mjs` harness for anything you touched, and drive the real page
  in headless Chromium when the change is something a person looks at. Never claim QA
  passed if it did not run.
- Tick each card **only through the truth gate**: work that is not on `main` is flagged
  for review with a note naming the branch, never ticked done. That is `planner_card_done`
  for work that landed and `planner_card_review` for work that did not. The review note
  must **open with the question**, in one line, or the function refuses it.
- Write the outcome back before moving on:

```sql
select planner_run_outcome(<RUN ID>, '{"step":1,"cards":["RB1"],"result":"done","note":"one line"}'::jsonb);
```

`result` is one of `done`, `needs-mike` or `failed`. Re-read the run and ask `next`
again after every step — it is what enforces the failure limit, the hard stop, and the
stop-when-a-card-needs-Mike setting. Do not carry those rules in your head.

### 5. Finish

```sql
select * from planner_run_finish(<RUN ID>, 'done', $$<plain-language summary>$$);
```

Use `'stopped'` instead of `'done'` when `next` told you to stop. The summary is for
Mike, so write it the way `AUTOPILOT.md` describes the report: what shipped, what needs
him, what you decided on his behalf. Also append the usual dated entries to
`SESSION-LOG.md` and the README log, and prepend a run entry to `AUTOPILOT-REPORT.md`.

---

## Things that end the run early

`run-lane.mjs next` returns `stop` and the reason, and you obey it without argument:

- the hard stop has passed,
- the failure limit is reached,
- a card needs Mike and the run was set to stop rather than carry on.

Finish the run as `stopped` with the reason as the summary. Never quietly keep going.

---

## The saved task, and the one thing it still needs from Mike

The task that starts a session up here is a **Routine** on Mike's Claude account, called
**"Buildable: work the waiting run"**. It has **no schedule** — it never fires by itself.
Something has to kick it, and building the two ways to kick it is card RB3.

**Known gap, September 6 2026.** A Routine created from inside a session cannot be given
connectors: the tool refuses the parameter for this organisation, and a Routine created
without them fires a session with **no Supabase connector at all** — which is the one
thing this runbook depends on. So the Routine as it stands will start a session that
cannot claim a run.

The fix is Mike's, and it is one of two clicks, not a code change:

- open the Routine in the claude.ai Routines screen and attach the **Supabase**
  connector to it, or
- attach Supabase at the environment level, so every session started in that environment
  has it.

Until one of those is done, a run is worked by a session Mike starts himself, which is
exactly what happened for the first dry run. Everything else in this file works
unchanged either way.

## What a cloud session still must not do

Everything in `AGENTS.md` **Guardrails**, unchanged. In particular, up here:

- **No secrets.** You have no service key and you must not go looking for one. The
  Supabase MCP is the authorised route and it hands you nothing to leak.
- **No destructive SQL.** `DELETE`, `DROP`, `TRUNCATE` are out, including on
  `planner_runs`. A run that should not have existed is cancelled or released, not
  deleted.
- **No ticking a card you did not finish**, and no ticking a card whose work is not on
  `main`. That is the whole point of RN1's gate.
- **No merging a parked run to main.** Park means Mike merges it.
