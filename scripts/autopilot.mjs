#!/usr/bin/env node
// scripts/autopilot.mjs — work roadmap cards one at a time, each in a BRAND NEW
// Claude Code session.
//
// Why a new session per card: a session that has been running for hours carries
// everything it has ever read into every reply. `claude -p` starts with an empty
// context, so card 4 costs the same as card 1. The planner is the handoff — the
// finishing session writes its state there, this runner reads it back.
//
//   npm run cards -- --watch       WAIT for a phase to be queued from the planner,
//                                  work it, then go back to waiting. Leave it open.
//   npm run cards                  work whatever the planner has queued, then stop
//   npm run cards -- --phase LP    ignore the planner, work phase LP now
//   npm run cards -- --card LP4    one named card
//   npm run cards -- --max 2       hard ceiling of 2 cards this run
//   npm run cards -- --dry         print the prompt it WOULD send, run nothing
//
// The normal way in is the planner: tap "Run this phase" on a phase at /planner and
// a watching runner picks it up within half a minute. Nothing to type.
//
// It stops the moment anything is off: the session exits non-zero, or the card is
// not marked done afterwards. That is deliberate. A chain that ploughs past a
// half-finished card builds the next card on top of broken work.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const API = process.env.PLANNER_URL || 'https://www.buildablekids.com/api/planner';
// Permission baseline for each spawned session. `acceptEdits` auto-approves file
// edits but still asks before anything riskier — safe, but it CAN pause the chain
// waiting for an answer. Set CLAUDE_PERMISSION_MODE to widen it if that bites.
const PERM = process.env.CLAUDE_PERMISSION_MODE || 'acceptEdits';
const DEFAULT_MAX = 4;   // AUTOPILOT.md's "keep a stack to about four cards"

const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const val = (f, d) => { const i = argv.indexOf('--' + f); return i === -1 ? d : argv[i + 1]; };
const say = (m) => console.log(m);
const die = (m) => { console.error('\nautopilot: ' + m); process.exit(1); };

// A Claude Code session running this would spawn sessions inside itself, which is
// how a runaway starts. Refuse unless the human explicitly overrides.
if ((process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) && !has('force')) {
  die('this looks like it is being run from inside a Claude Code session.\n' +
      'That would nest sessions inside each other. Run it from a plain terminal,\n' +
      'or pass --force if you are certain.');
}

const ONLY = val('card', null);
const TURNS = val('turns', null);
const WATCH = has('watch');
const POLL_SECONDS = 20;
// --phase / --card are manual overrides. Everything else comes from the planner.
let PHASE = val('phase', null);
let MAX = Math.max(1, parseInt(val('max', DEFAULT_MAX), 10) || DEFAULT_MAX);

// `soft` returns null instead of exiting. The watch loop must never be killed by
// one flaky read: die() calls process.exit, which no try/catch can catch.
async function roadmap(soft) {
  try {
    const r = await fetch(API + '?scope=roadmap', { headers: { 'Cache-Control': 'no-store' } });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'http ' + r.status);
    return j;
  } catch (e) {
    if (soft) return null;
    die('could not read the planner (' + (e.message || e) + ')');
  }
}

// A file the watcher touches every poll, so "is it actually running?" can be
// answered by looking rather than by asking. Gitignored.
function heartbeat(state) {
  try {
    writeFileSync('.autopilot-heartbeat', JSON.stringify({
      at: new Date().toISOString(), pid: process.pid, state,
    }) + '\n');
  } catch { /* a read-only checkout should not stop the run */ }
}
async function fullCard(id) {
  const r = await fetch(API, { headers: { 'Cache-Control': 'no-store' } });
  const j = await r.json().catch(() => ({}));
  const cards = (j.meta && j.meta.roadmap && j.meta.roadmap.sessions) || [];
  return cards.find((c) => c.id === id) || null;
}

// A phase whose TITLE says it is parked holds work Mike shelved on purpose until
// something triggers it. Those cards are never picked automatically — asking for
// them by name (--phase 9 / --card 9A) still works.
const isParked = (p) => /\bparked\b/i.test(String(p.title || ''));

// Pick the next card: phase order first, then the order cards sit in the array.
// `later` cards are parked on purpose too and are never picked automatically.
function pickQueue({ phases, cards }) {
  if (ONLY) {
    const c = cards.find((x) => x.id === ONLY);
    if (!c) die('no card ' + ONLY);
    if (c.state === 'done') die('card ' + ONLY + ' is already done');
    return { queue: [c], skipped: [] };
  }
  const order = new Map(phases.map((p, i) => [String(p.num), i]));
  const parked = new Set(phases.filter(isParked).map((p) => String(p.num)));
  const open = cards.filter((c) => c.state === 'open').filter((c) => !PHASE || String(c.phaseNum) === String(PHASE));
  // An explicit --phase overrides the parked rule: you asked for it by name.
  const skipped = PHASE ? [] : open.filter((c) => parked.has(String(c.phaseNum)));
  const queue = open
    .filter((c) => PHASE || !parked.has(String(c.phaseNum)))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (order.get(String(a.c.phaseNum)) ?? 99) - (order.get(String(b.c.phaseNum)) ?? 99) || a.i - b.i)
    .map((o) => o.c);
  return { queue, skipped };
}

// A few seconds to hit ctrl-C if the pick is wrong. Cheap insurance against a
// whole session spent on a card you would not have chosen.
async function countdown(card, secs = 6) {
  if (has('yes')) return;
  for (let s = secs; s > 0; s--) {
    process.stdout.write(`\rstarting ${card.id} in ${s}...  (ctrl-C to stop, or close this window)   `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
}

function buildPrompt(card, phaseTitle) {
  const notes = (card.notes || []).length
    ? '\nNotes left by earlier sessions:\n' + card.notes.map((n) => '  - ' + n).join('\n') + '\n'
    : '';
  return `You are working ONE card from the Buildable roadmap, in a fresh session.

CARD ${card.id} — ${card.name}
Phase ${card.phaseNum}${phaseTitle ? ' — ' + phaseTitle : ''}

${card.desc || '(the card has no description — see the readiness test in AUTOPILOT.md)'}
${notes}
Read AGENTS.md and AUTOPILOT.md in this repo before you start. They are the law and
AUTOPILOT.md is what changes when nobody is watching: decide and log, never stall.

Work ONLY card ${card.id}. Do not start the next one — a runner does that.

When the work is finished, in this order:
  1. Run the QA script for whatever you touched and make it green.
  2. Push to main.
  3. Check the live site actually shows it.
  4. node scripts/planner.mjs done ${card.id} "one line on what shipped"
     If anything is half-finished, use \`review ${card.id}\` instead and say why in a note.
  5. node scripts/planner.mjs deployed ${card.id}   (only after step 3)
  6. Dated entries in SESSION-LOG.md and README.md, per AGENTS.md.

A runner is watching the planner. If card ${card.id} is not marked done when you exit,
the chain STOPS. That is the correct outcome for unfinished work. Do NOT mark it done
to keep the chain moving — a false green here poisons every card built on top of it.`;
}

function runSession(prompt) {
  const args = ['-p', prompt, '--permission-mode', PERM];
  if (TURNS) args.push('--max-turns', String(TURNS));
  return new Promise((resolve) => {
    const p = spawn('claude', args, { stdio: 'inherit' });
    p.on('error', (e) => resolve(e.code === 'ENOENT' ? 'missing' : 'error'));
    p.on('close', (code) => resolve(code));
  });
}

// ---- talking back to the planner -------------------------------------------
async function setStatus(status, note) {
  try {
    await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'queueStatus', status, note: note || '' }) });
  } catch { /* the run matters more than the status light */ }
}

// ---- work up to MAX cards for the current PHASE -----------------------------
// Returns a short reason string. Anything other than 'finished' means we stopped
// early and nothing further should be started.
async function workRun() {
  let doneCount = 0;
  for (let n = 1; n <= MAX; n++) {
    const rm = await roadmap();
    const { queue, skipped } = pickQueue(rm);
    const summary = queue[0];
    if (n === 1 && skipped.length) {
      say(`skipping ${skipped.length} card${skipped.length === 1 ? '' : 's'} in parked phases (${skipped.map((c) => c.id).join(', ')}). Ask for them with --phase or --card.`);
    }
    if (!summary) {
      say('\nNothing open' + (PHASE ? ' in phase ' + PHASE : '') + '.');
      return { done: doneCount, reason: 'finished' };
    }
    if (n === 1 && queue.length > 1) say('queue: ' + queue.slice(0, MAX).map((c) => c.id).join(' -> '));

    const card = await fullCard(summary.id) || summary;
    const phaseTitle = (rm.phases.find((p) => String(p.num) === String(card.phaseNum)) || {}).title;
    const prompt = buildPrompt(card, phaseTitle);

    if (has('dry')) {
      say('--- the prompt a fresh session would receive ---\n');
      say(prompt);
      say('\n--- nothing was run (--dry) ---');
      return { done: 0, reason: 'dry' };
    }

    say(`\n${'='.repeat(70)}\ncard ${n} of at most ${MAX}: ${card.id} — ${card.name}\nphase ${card.phaseNum}${phaseTitle ? ' — ' + phaseTitle : ''}\npermissions: ${PERM}\n${'='.repeat(70)}\n`);
    await countdown(card);
    await setStatus('running', `working ${card.id} — ${card.name}`);

    const code = await runSession(prompt);
    if (code === 'missing') die('could not find the `claude` command on this machine.');
    if (code !== 0) {
      say(`\nthe session for ${card.id} exited with code ${code}.`);
      return { done: doneCount, reason: `${card.id} errored (exit ${code})` };
    }

    // The verification gate: believe the planner, not the session's own summary.
    const after = (await roadmap()).cards.find((c) => c.id === card.id);
    if (!after || after.state !== 'done') {
      say(`\ncard ${card.id} came back as "${after ? after.state : 'missing'}", not done.`);
      return { done: doneCount, reason: `${card.id} did not finish` };
    }
    doneCount++;
    say(`\n${card.id} is done${after.deployed ? ' and live' : ' (not flagged live yet)'}.`);
    if (ONLY) break;
  }
  return { done: doneCount, reason: 'finished' };
}

function report({ done, reason }) {
  say(`\n${done} card${done === 1 ? '' : 's'} finished. ${reason === 'finished' ? '' : 'Stopped: ' + reason}`);
}

// ---- how the run gets started ----------------------------------------------
const MANUAL = ONLY || val('phase', null) || has('dry');

if (MANUAL) {
  // You asked for something specific. The planner's queue is ignored.
  report(await workRun());

} else if (WATCH) {
  say('Waiting for a phase. Open the planner and tap "Run this phase" on any phase.');
  say('Close this window to stop.\n');
  let ticks = 0;
  for (;;) {
    const rm = await roadmap(true);
    const ar = rm && rm.autorun;
    heartbeat(ar && ar.status === 'waiting' ? 'picking-up' : rm ? 'waiting' : 'planner-unreachable');
    if (!rm) {
      say(`[${new Date().toLocaleTimeString()}] cannot reach the planner. Still trying.`);
    } else if (!ar || ar.status !== 'waiting') {
      // A visible pulse, so a waiting window never looks like a dead one.
      ticks++;
      if (ticks === 1 || ticks % 6 === 0) say(`[${new Date().toLocaleTimeString()}] waiting. Nothing queued yet.`);
    }
    if (ar && ar.status === 'waiting') {
      ticks = 0;
      PHASE = String(ar.phase);
      MAX = Math.max(1, parseInt(ar.max, 10) || DEFAULT_MAX);
      say(`\nPicked up phase ${PHASE} from the planner (up to ${MAX} card${MAX === 1 ? '' : 's'}).`);
      const r = await workRun();
      report(r);
      await setStatus(r.reason === 'finished' ? 'done' : 'stopped',
        r.reason === 'finished' ? `${r.done} card${r.done === 1 ? '' : 's'} finished` : r.reason);
      say('\nBack to waiting. Tap another phase in the planner when you are ready.\n');
    }
    await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
  }

} else {
  // One shot: work whatever the planner already has queued, then stop.
  const ar = (await roadmap()).autorun;
  if (!ar || !ar.phase || ar.status === 'done' || ar.status === 'stopped') {
    say('Nothing queued in the planner.\n');
    say('Open the planner, tap "Run this phase" on the phase you want worked, then run');
    say('this again. Or leave it running with --watch and it will pick phases up for you.');
    process.exit(0);
  }
  PHASE = String(ar.phase);
  MAX = Math.max(1, parseInt(ar.max, 10) || DEFAULT_MAX);
  say(`Phase ${PHASE} from the planner (up to ${MAX} card${MAX === 1 ? '' : 's'}).`);
  const r = await workRun();
  report(r);
  await setStatus(r.reason === 'finished' ? 'done' : 'stopped',
    r.reason === 'finished' ? `${r.done} card${r.done === 1 ? '' : 's'} finished` : r.reason);
}
