// qa-runbuilder.mjs — the Run builder gate (card RB1).
//
// Two halves, because the run builder is two halves:
//   1. the page (public/planner.html) driven in jsdom — picking, ordering,
//      grouping, and every warning it is supposed to raise before Mike saves,
//   2. the server op (api/planner.js saveRun) driven with a stubbed fetch, so the
//      validation that stands between a stale phone tab and the roadmap is proved
//      rather than assumed.
//
// Run:  node qa-runbuilder.mjs
import fs from 'fs';
import { JSDOM } from 'jsdom';

let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`); };

/* ---------- 1. the page ---------------------------------------------------- */
const html = fs.readFileSync('public/planner.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x/planner' });
const w = dom.window, d = w.document;
w.alert = () => {};
w.confirm = () => true;
let posted = [];
w.fetch = async (url, opts) => {
  if (opts && opts.method === 'POST') posted.push(JSON.parse(opts.body));
  return { ok: true, json: async () => ({ ok: true, runs: [], run: { id: 1 } }) };
};

check('run builder functions are on the page', typeof w.rbOpen === 'function' && typeof w.rbWarnings === 'function');

// A small roadmap standing in for the real one: RB2 depends on RB1, RB4 on a card
// that is already finished, and RB3 is waiting on Mike.
const rd = w.rmData();
rd.phases = [{ num: 'RB', title: 'Run anywhere' }, { num: 'Z', title: 'All done' }];
rd.sessions = [
  { id: 'RB1', name: 'Run builder page', desc: 'Build the run builder.', phaseNum: 'RB', done: false, needsReview: false, notes: [] },
  { id: 'RB2', name: 'Cloud runner', desc: 'AFTER RB1. A saved task on the Claude side.', phaseNum: 'RB', done: false, needsReview: false, notes: [] },
  { id: 'RB3', name: 'Two kickoffs', desc: 'AFTER RB2. Instant and hands-off.', phaseNum: 'RB', done: false, needsReview: true, notes: [] },
  { id: 'RB4', name: 'Morning report', desc: 'AFTER RB0. The green panel.', phaseNum: 'RB', done: false, needsReview: false, notes: [] },
  { id: 'RB0', name: 'Already finished', desc: 'Groundwork.', phaseNum: 'RB', done: true, needsReview: false, notes: [] },
  { id: 'RBL', name: 'Parked', desc: 'Later.', phaseNum: 'RB', done: false, later: true, notes: [] },
  { id: 'Z1', name: 'Done card', desc: 'Nothing.', phaseNum: 'Z', done: true, notes: [] },
];

w.rbOpen();
check('the builder opens', d.getElementById('runModal').classList.contains('show'));
const pickIds = [...d.querySelectorAll('#rb-body .rb-pick .nm b')].map(e => e.textContent);
check('only open cards are offered', pickIds.join(',') === 'RB1,RB2,RB3,RB4', '(got ' + pickIds.join(',') + ')');
const phaseHeads = d.querySelectorAll('#rb-body .rb-phase').length;
check('a phase with nothing open is not offered', phaseHeads === 1, '(phases shown=' + phaseHeads + ')');
check('save is off with an empty run', d.getElementById('rb-save').disabled === true);

// --- picking ---
w.rbToggleCard('RB2');
w.rbToggleCard('RB1');
check('ticking two cards makes two sessions', w.rbFlat().join(',') === 'RB2,RB1');
check('save is on once something is picked', d.getElementById('rb-save').disabled === false);
w.rbToggleCard('RB2');
check('unticking takes the card out', w.rbFlat().join(',') === 'RB1');

// --- order warning: RB2 comes after RB1, so RB2 first is wrong ---
w.rbClearRun();
w.rbToggleCard('RB2'); w.rbToggleCard('RB1');
let warns = w.rbWarnings();
check('out-of-order dependency is flagged', warns.some(t => /RB2 says it comes after RB1.*later in this run/.test(t)), JSON.stringify(warns));
w.rbMove(0, 1);
check('moving it down fixes the order', w.rbFlat().join(',') === 'RB1,RB2');
check('and the warning goes away', !w.rbWarnings().some(t => /later in this run/.test(t)));

// --- a dependency that is not in the run at all ---
w.rbClearRun(); w.rbToggleCard('RB3');
check('a missing dependency is flagged', w.rbWarnings().some(t => /RB3 says it comes after RB2, and RB2 is neither finished nor in this run/.test(t)), JSON.stringify(w.rbWarnings()));
check('a needs-review card is flagged', w.rbWarnings().some(t => /RB3 is waiting for your review/.test(t)));

// --- a dependency that is already done raises nothing ---
w.rbClearRun(); w.rbToggleCard('RB4');
check('a finished dependency is not flagged', w.rbWarnings().length === 0, JSON.stringify(w.rbWarnings()));

// --- whole phase, then grouping ---
w.rbClearRun(); w.rbAddPhase('RB');
check('adding a phase takes every open card', w.rbFlat().join(',') === 'RB1,RB2,RB3,RB4');
check('and never a parked or finished one', w.rbFlat().indexOf('RBL') === -1 && w.rbFlat().indexOf('RB0') === -1);
w.rbToggleSel(0); w.rbToggleSel(1); w.rbGroup();
let rows = d.querySelectorAll('#rb-body .rb-row');
check('grouping two rows makes one session', rows.length === 3, '(rows=' + rows.length + ')');
check('the grouped row names both cards', rows[0].querySelector('.what b').textContent === 'RB1 + RB2');
check('the cards stay in the same order', w.rbFlat().join(',') === 'RB1,RB2,RB3,RB4');
check('a grouped pair with a dependency says so', w.rbWarnings().some(t => /RB1 and RB2 are grouped into one session/.test(t)), JSON.stringify(w.rbWarnings()));
w.rbUngroup(0);
check('splitting puts them back as their own sessions', d.querySelectorAll('#rb-body .rb-row').length === 4);

// --- drag to reorder ---
w.rbClearRun(); w.rbAddPhase('RB');
const ev = (t) => { const e = new w.Event(t, { bubbles: true }); e.dataTransfer = { setData(){}, effectAllowed: '', dropEffect: '' }; e.preventDefault = () => {}; return e; };
rows = d.querySelectorAll('#rb-body .rb-row');
rows[3].dispatchEvent(ev('dragstart'));
rows[0].dispatchEvent(ev('drop'));
check('dragging the last row to the top reorders the run', w.rbFlat().join(',') === 'RB4,RB1,RB2,RB3', '(got ' + w.rbFlat().join(',') + ')');

// --- too many in one session ---
w.rbClearRun(); w.rbAddPhase('RB');
w.rbToggleSel(0); w.rbToggleSel(1); w.rbToggleSel(2); w.rbToggleSel(3); w.rbGroup();
check('four cards in one session is called out', w.rbWarnings().some(t => /holds 4 cards/.test(t)));

// --- settings and start time ---
w.rbClearRun(); w.rbToggleCard('RB1');
check('start time is empty while Start is Now', w.rbStartIso() === null);
w.rbSetStart('at'); w.rbSetStartAt('07:00');
const iso = w.rbStartIso();
check('a start time resolves to the next 07:00', !!iso && new Date(iso).getTime() > Date.now());
w.rbSetShip(false); w.rbSetCarry(false); w.rbSetFails(3); w.rbSetHard('hours'); w.rbSetHardVal('hours', 8);

// --- saving sends exactly what the page shows ---
posted = [];
await w.rbSave();
const body = posted.find(p => p.op === 'saveRun');
check('saving posts one saveRun', !!body);
check('it carries the sessions as arrays of ids', body && JSON.stringify(body.sessions) === '[["RB1"]]', JSON.stringify(body && body.sessions));
check('it carries the settings the page shows', body && body.settings.ship === false && body.settings.carryOn === false
  && body.settings.stopAfterFailures === 3 && body.settings.hardStop.kind === 'hours' && body.settings.hardStop.hours === 8,
  JSON.stringify(body && body.settings));
check('it carries the start time', !!(body && body.startAt));
check('the builder empties itself after a save', w.rbFlat().length === 0);
check('the page does not start anything itself', !posted.some(p => p.op === 'queue' || p.op === 'claim'));

// --- the waiting-run bar ---
w.rbSetRuns([{ id: 7, status: 'ready', sessions: [['RB1', 'RB2'], ['RB3']], settings: { ship: false, carryOn: true, hardStop: { kind: 'clock', clock: '07:00' } }, start_at: null }]);
const bar = d.getElementById('run-bar').textContent;
check('the bar says a run is waiting', /A run is saved and waiting/.test(bar), bar.slice(0, 80));
check('the bar counts cards and sessions', /3 cards in 2 sessions/.test(bar), bar.slice(0, 120));
check('the bar shows the order and the grouping', /RB1 \+ RB2/.test(bar));
check('the bar repeats the settings in plain words', /parked on one branch/.test(bar) && /hard stop at 07:00/.test(bar), bar);

/* ---------- 2. the server op ---------------------------------------------- */
process.env.SUPABASE_URL = 'https://stub.test';
process.env.SUPABASE_SERVICE_KEY = 'stub-key';
const { default: handler } = await import('./api/planner.js');

const META = { roadmap: { phases: [{ num: 'RB' }], sessions: [{ id: 'RB1' }, { id: 'RB2' }, { id: 'RB3' }] } };
let liveRuns = [];
let inserted = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('planner_meta')) return { ok: true, json: async () => [{ data: JSON.parse(JSON.stringify(META)) }] };
  if (u.includes('planner_runs') && (opts.method || 'GET') === 'GET') return { ok: true, json: async () => liveRuns };
  if (u.includes('planner_runs') && opts.method === 'POST') { inserted = JSON.parse(opts.body); return { ok: true, json: async () => [{ id: 3, ...inserted }] }; }
  return { ok: true, json: async () => [] };
};
async function post(body) {
  let out = null;
  const res = { setHeader() {}, status(c) { this._c = c; return this; }, json(j) { out = { code: this._c, ...j }; return out; } };
  await handler({ method: 'POST', url: '/api/planner', body }, res);
  return out;
}
const run = (sessions, extra = {}) => post({ op: 'saveRun', sessions, settings: { ship: true }, ...extra });

let r = await run([['RB1'], ['RB2', 'RB3']]);
check('a good run saves', r.ok === true, JSON.stringify(r));
check('it is stored ready, not running', inserted && inserted.status === 'ready');
check('the group is stored as one session', inserted && JSON.stringify(inserted.sessions) === '[["RB1"],["RB2","RB3"]]');

r = await run([['NOPE']]);
check('an unknown card id is refused', r.ok === false && /not found/.test(r.error), JSON.stringify(r));
r = await run([['RB1'], ['RB1']]);
check('the same card twice is refused', r.ok === false && /twice/.test(r.error), JSON.stringify(r));
r = await run([]);
check('an empty run is refused', r.ok === false);
r = await run([['RB1', 'RB2', 'RB3', 'RB1', 'RB2', 'RB3', 'RB1']]);
check('more than six cards in one session is refused', r.ok === false && /at most 6/.test(r.error), JSON.stringify(r));
r = await run([['RB1']], { startAt: 'not a time' });
check('a start time it cannot read is refused', r.ok === false && /start time/.test(r.error), JSON.stringify(r));

r = await post({ op: 'saveRun', sessions: [['RB1']], settings: { stopAfterFailures: 99, hardStop: { kind: 'sideways' } } });
check('a silly failure count is clamped', inserted && inserted.settings.stopAfterFailures === 9, JSON.stringify(inserted && inserted.settings));
check('an unknown hard stop falls back to none', inserted && inserted.settings.hardStop.kind === 'none');
check('ship and carry-on default to on', inserted && inserted.settings.ship === true && inserted.settings.carryOn === true);

liveRuns = [{ id: 3, status: 'ready' }];
r = await run([['RB1']]);
check('a second run is refused while one is waiting', r.ok === false && /already ready/.test(r.error), JSON.stringify(r));
liveRuns = [];

console.log(fail === 0 ? '\nRUN BUILDER: ALL PASS' : `\nRUN BUILDER: ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
