#!/usr/bin/env node
// scripts/run-lane.mjs — the thinking half of the cloud run lane (card RB2).
//
// The runner is a Claude session, not a program. What a session must NOT do is
// improvise the bits that have to be identical every time: which session comes
// next, when to stop, what the prompt says, and what the report tells Mike. That
// is what this file is. It is PURE — it never touches the network, never holds a
// key, and never writes anything. The session reads the run out of Supabase
// through the connected MCP, saves it to a file, and asks this script what to do.
//
//   node scripts/run-lane.mjs check   run.json      can this run be worked at all?
//   node scripts/run-lane.mjs plan    run.json      the ordered sessions
//   node scripts/run-lane.mjs next    run.json      what to do right now
//   node scripts/run-lane.mjs prompt  run.json 1    the prompt for step 1
//   node scripts/run-lane.mjs report  run.json      the write-up to store on the run
//
// run.json is  { "run": <planner_runs row>, "cards": [<roadmap cards>] }.
//
// DRY RUN IS THE DEFAULT AND, UNTIL MIKE SAYS OTHERWISE, THE ONLY MODE. A run is
// only worked for real when its settings carry BOTH mode:'real' AND
// dryApproved:true, and only the planner stamps the second one, after Mike has
// read a dry-run report and pressed "Looks right". `check` refuses anything else.
import fs from 'node:fs';

export const mode = (run) => (run && run.settings && run.settings.mode === 'real' ? 'real' : 'dry');
const S = (run) => (run && run.settings) || {};
const sessionsOf = (run) => (run && Array.isArray(run.sessions) ? run.sessions : []);
const outcomesOf = (run) => (run && Array.isArray(run.outcomes) ? run.outcomes : []);
const byId = (cards) => Object.fromEntries((cards || []).map((c) => [c.id, c]));

/* A card that says "AFTER RB2." depends on RB2 — same reading the planner page
   does, so the runner and the builder never disagree about the order. */
export function deps(desc) {
  const out = []; const re = /\bAFTER\s+([A-Z]{1,5}\d{1,3})\b/gi; let m;
  while ((m = re.exec(String(desc || '')))) out.push(m[1].toUpperCase());
  return out;
}

/* The run as a list of numbered steps. One step is one build session, however
   many cards are grouped into it. */
export function steps(run, cards) {
  const map = byId(cards);
  return sessionsOf(run).map((ids, i) => ({
    n: i + 1,
    ids,
    grouped: ids.length > 1,
    names: ids.map((id) => (map[id] ? map[id].name : '(card is gone)')),
  }));
}

/* When the run must stop no matter what is left. */
export function hardStopAt(run, now = new Date()) {
  const hs = S(run).hardStop || {};
  const from = run && run.claimed_at ? new Date(run.claimed_at) : now;
  if (hs.kind === 'hours') return new Date(from.getTime() + (Number(hs.hours) || 6) * 3600e3);
  if (hs.kind === 'clock') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hs.clock || ''));
    if (!m) return null;
    const t = new Date(now); t.setHours(+m[1], +m[2], 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return t;
  }
  return null;
}

/* Everything that would make working this run wrong, and everything worth saying
   out loud but not worth refusing over. Run this BEFORE the first session. */
export function preflight(run, cards, now = new Date()) {
  const blockers = [], warnings = [];
  const map = byId(cards);
  if (!run) return { ok: false, blockers: ['there is no run to work'], warnings };
  if (run.status !== 'running') blockers.push(`the run is '${run.status}', not 'running' — claim it first`);
  if (!sessionsOf(run).length) blockers.push('the run has no sessions in it');
  if (mode(run) === 'real' && S(run).dryApproved !== true) {
    blockers.push('this run says work it for real, but no dry run has been approved yet. Report what you would do and ship nothing.');
  }
  if (run.start_at && new Date(run.start_at).getTime() > now.getTime()) {
    blockers.push('the run is not due to start until ' + new Date(run.start_at).toISOString());
  }
  const pos = {};
  sessionsOf(run).forEach((ids, i) => ids.forEach((id) => { pos[id] = i; }));
  for (const [id, i] of Object.entries(pos)) {
    const c = map[id];
    if (!c) { blockers.push(`card ${id} is in the run but no longer on the roadmap`); continue; }
    if (c.done) blockers.push(`card ${id} was finished after the run was saved — take it out or drop the run`);
    if (c.later) warnings.push(`card ${id} has been parked since the run was saved`);
    if (c.needsReview) warnings.push(`card ${id} is waiting on Mike's review`);
    for (const dep of deps(c.desc)) {
      const dc = map[dep];
      if (dc && dc.done) continue;
      if (pos[dep] === undefined) warnings.push(`${id} comes after ${dep}, and ${dep} is neither finished nor in this run`);
      else if (pos[dep] > i) blockers.push(`${id} comes after ${dep}, but ${dep} is later in this run`);
    }
  }
  return { ok: blockers.length === 0, blockers, warnings };
}

/* What to do right now, given what has happened so far. The runner asks this
   between every session and does exactly what it says. */
export function nextStep(run, cards, now = new Date()) {
  const all = steps(run, cards);
  const outs = outcomesOf(run);
  const hard = hardStopAt(run, now);
  if (hard && now.getTime() >= hard.getTime()) {
    return { action: 'stop', reason: 'the hard stop has passed' };
  }
  const failures = outs.filter((o) => o.result === 'failed').length;
  const limit = Math.min(9, Math.max(1, Number(S(run).stopAfterFailures) || 2));
  if (failures >= limit) {
    return { action: 'stop', reason: `${failures} session${failures === 1 ? '' : 's'} failed, and the limit was ${limit}` };
  }
  if (S(run).carryOn === false && outs.some((o) => o.result === 'needs-mike')) {
    const o = outs.find((x) => x.result === 'needs-mike');
    return { action: 'stop', reason: `step ${o.step} needs Mike, and this run was set to stop rather than carry on` };
  }
  const done = new Set(outs.map((o) => o.step));
  const step = all.find((s) => !done.has(s.n));
  if (!step) return { action: 'finished', reason: 'every session in the run has an outcome' };
  return { action: 'work', step, reason: `step ${step.n} of ${all.length} has no outcome yet` };
}

/* The prompt one build session is given. Same shape whichever card it is, so a
   session never has to guess what is expected of it. */
export function sessionPrompt(run, cards, n) {
  const all = steps(run, cards);
  const s = all.find((x) => x.n === Number(n));
  if (!s) return null;
  const map = byId(cards);
  const st = S(run);
  const lines = [];
  lines.push('Pull the latest from GitHub before touching any files. Read AGENTS.md, AUTOPILOT.md and RUN-ANYWHERE.md in the repo root first.');
  lines.push(s.grouped
    ? `Do these ${s.ids.length} cards as ONE session — one clone, one deploy, one QA pass — in this order: ${s.ids.join(', ')}. This is the GROUPED law in AGENTS.md. Tick each card as its own part lands.`
    : `Do ONLY card ${s.ids[0]}.`);
  for (const id of s.ids) {
    const c = map[id];
    lines.push(`${id} — ${c ? c.name : '(card is gone)'}${c && c.desc ? ': ' + c.desc : ''}`);
  }
  lines.push(st.ship === false
    ? 'PARK IT: commit to the run branch this session was given, push the branch, and do NOT merge to main.'
    : 'SHIP IT: commit to main in logical chunks and let Vercel deploy.');
  lines.push('Run the QA script for anything you touched. Never claim QA passed if it did not run.');
  lines.push(st.carryOn === false
    ? 'If this card needs a decision only Mike can make, stop the whole run and say why.'
    : 'If this card needs a decision only Mike can make, flag it for review with a ONE LINE question, then carry on to the next session.');
  lines.push('Tick the card only through the truth gate: work that is not on main is flagged for review, not ticked done. Update SESSION-LOG.md and the README log, then write your outcome back to the run.');
  return lines.join('\n\n');
}

/* The write-up stored on the run. In a dry run this is the whole deliverable:
   exactly what would happen, in Mike's language, with nothing shipped. */
export function dryRunReport(run, cards, now = new Date()) {
  const pf = preflight(run, cards, now);
  const all = steps(run, cards);
  const st = S(run);
  const hard = hardStopAt(run, now);
  const L = [];
  L.push(`DRY RUN — run ${run.id}. Nothing was built, shipped or ticked.`);
  L.push('');
  L.push(`It holds ${all.reduce((a, s) => a + s.ids.length, 0)} card${all.reduce((a, s) => a + s.ids.length, 0) === 1 ? '' : 's'} in ${all.length} session${all.length === 1 ? '' : 's'}. Here is what would happen, in order:`);
  L.push('');
  all.forEach((s) => {
    L.push(`${s.n}. ${s.ids.join(' + ')}${s.grouped ? ' (one session, both cards)' : ''}`);
    s.names.forEach((nm, i) => L.push(`   ${s.ids[i]}: ${nm}`));
  });
  L.push('');
  L.push('How it would be worked:');
  L.push(`- ${st.ship === false ? 'Parked. Everything lands on one branch and nothing goes live until you merge it.' : 'Shipped. Each session commits to main and Vercel deploys it.'}`);
  L.push(`- ${st.carryOn === false ? 'It stops the whole run the first time a card needs you.' : 'When a card needs you it leaves a one-line question on that card and carries on.'}`);
  L.push(`- It gives up after ${Math.min(9, Math.max(1, Number(st.stopAfterFailures) || 2))} failed session${(Number(st.stopAfterFailures) || 2) === 1 ? '' : 's'}.`);
  L.push(`- ${hard ? 'Hard stop at ' + hard.toISOString() + ', whatever is left.' : 'No hard stop.'}`);
  L.push('');
  if (pf.blockers.length) {
    L.push('It would NOT start. In the way:');
    pf.blockers.forEach((b) => L.push(`- ${b}`));
    L.push('');
  }
  if (pf.warnings.length) {
    L.push('Worth knowing:');
    pf.warnings.forEach((b) => L.push(`- ${b}`));
    L.push('');
  }
  if (!pf.blockers.length && !pf.warnings.length) L.push('Nothing in the way and nothing worth flagging.');
  L.push('');
  L.push('If this is what you expected, press "Looks right" on this report. That is what unlocks running one for real.');
  return L.join('\n');
}

/* ---- command line ---- */
function main(argv) {
  const [cmd, file, arg] = argv;
  if (!cmd || !file) { console.error('usage: run-lane.mjs <check|plan|next|prompt|report> run.json [step]'); process.exit(2); }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const run = j.run || j, cards = j.cards || [];
  if (cmd === 'check') {
    const r = preflight(run, cards);
    console.log('mode: ' + mode(run));
    r.blockers.forEach((b) => console.log('BLOCKER  ' + b));
    r.warnings.forEach((b) => console.log('warning  ' + b));
    if (r.ok && !r.warnings.length) console.log('clear');
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'plan') { steps(run, cards).forEach((s) => console.log(`${s.n}. ${s.ids.join(' + ')} — ${s.names.join(' · ')}`)); return; }
  if (cmd === 'next') { const n = nextStep(run, cards); console.log(n.action + ': ' + n.reason + (n.step ? ' -> ' + n.step.ids.join(' + ') : '')); return; }
  if (cmd === 'prompt') { const p = sessionPrompt(run, cards, arg); if (!p) { console.error('no step ' + arg); process.exit(2); } console.log(p); return; }
  if (cmd === 'report') { console.log(dryRunReport(run, cards)); return; }
  console.error('unknown command ' + cmd); process.exit(2);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
