#!/usr/bin/env node
// scripts/autopilot.mjs — work roadmap cards one at a time, each in a BRAND NEW
// Claude Code session.
//
// Why a new session per card: a session that has been running for hours carries
// everything it has ever read into every reply. `claude -p` starts with an empty
// context, so card 4 costs the same as card 1. The planner is the handoff — the
// finishing session writes its state there, this runner reads it back.
//
//   npm run cards                  work open cards until something unexpected
//   npm run cards -- --max 2       hard ceiling of 2 cards this run
//   npm run cards -- --card LP4    one named card
//   npm run cards -- --phase LP    only cards in phase LP
//   npm run cards -- --dry         print the prompt it WOULD send, run nothing
//
// It stops the moment anything is off: the session exits non-zero, or the card is
// not marked done afterwards. That is deliberate. A chain that ploughs past a
// half-finished card builds the next card on top of broken work.
import { spawn } from 'node:child_process';

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

const MAX = Math.max(1, parseInt(val('max', DEFAULT_MAX), 10) || DEFAULT_MAX);
const ONLY = val('card', null);
const PHASE = val('phase', null);
const TURNS = val('turns', null);

async function roadmap() {
  const r = await fetch(API + '?scope=roadmap', { headers: { 'Cache-Control': 'no-store' } });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) die('could not read the planner (' + (j.error || r.status) + ')');
  return j;
}
async function fullCard(id) {
  const r = await fetch(API, { headers: { 'Cache-Control': 'no-store' } });
  const j = await r.json().catch(() => ({}));
  const cards = (j.meta && j.meta.roadmap && j.meta.roadmap.sessions) || [];
  return cards.find((c) => c.id === id) || null;
}

// Pick the next card: phase order first, then the order cards sit in the array.
// `later` cards are parked on purpose and never picked automatically.
function pickNext({ phases, cards }) {
  if (ONLY) {
    const c = cards.find((x) => x.id === ONLY);
    if (!c) die('no card ' + ONLY);
    if (c.state === 'done') die('card ' + ONLY + ' is already done');
    return c;
  }
  const order = new Map(phases.map((p, i) => [String(p.num), i]));
  return cards
    .filter((c) => c.state === 'open')
    .filter((c) => !PHASE || String(c.phaseNum) === String(PHASE))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (order.get(String(a.c.phaseNum)) ?? 99) - (order.get(String(b.c.phaseNum)) ?? 99) || a.i - b.i)
    .map((o) => o.c)[0] || null;
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

// ---- the loop --------------------------------------------------------------
let doneCount = 0;
for (let n = 1; n <= MAX; n++) {
  const rm = await roadmap();
  const summary = pickNext(rm);
  if (!summary) { say('\nNothing open' + (PHASE ? ' in phase ' + PHASE : '') + '. Stopping.'); break; }

  const card = await fullCard(summary.id) || summary;
  const phaseTitle = (rm.phases.find((p) => String(p.num) === String(card.phaseNum)) || {}).title;
  const prompt = buildPrompt(card, phaseTitle);

  if (has('dry')) {
    say('--- the prompt a fresh session would receive ---\n');
    say(prompt);
    say('\n--- nothing was run (--dry) ---');
    break;
  }

  say(`\n${'='.repeat(70)}\ncard ${n} of at most ${MAX}: ${card.id} — ${card.name}\npermissions: ${PERM}\n${'='.repeat(70)}\n`);

  const code = await runSession(prompt);
  if (code === 'missing') die("could not find the `claude` command on this machine.");
  if (code !== 0) die(`the session for ${card.id} exited with code ${code}. Chain stopped; nothing else was started.`);

  // The verification gate: believe the planner, not the session's own summary.
  const after = (await roadmap()).cards.find((c) => c.id === card.id);
  if (!after || after.state !== 'done') {
    say(`\ncard ${card.id} came back as "${after ? after.state : 'missing'}", not done.`);
    die('chain stopped on purpose. Look at that card before running again.');
  }
  doneCount++;
  say(`\n${card.id} is done${after.deployed ? ' and live' : ' (not flagged live yet)'}.`);
  if (ONLY) break;
}

say(`\n${doneCount} card${doneCount === 1 ? '' : 's'} finished this run.`);
