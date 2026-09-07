// qa-rb2.mjs — the cloud run lane gate (card RB2).
//
// The runner is a Claude session, so the only parts that CAN be tested are the
// parts that had better not be improvised: which session comes next, when the run
// stops, what a session is told to do, what the dry-run report says, and the gate
// that keeps a run in dry mode until Mike has approved one. All of that lives in
// scripts/run-lane.mjs, which is pure — no network, no key, no writes.
//
// The two halves here are that logic, and the server side of the dry-run gate in
// api/planner.js driven with a stubbed fetch.
//
// Run:  node qa-rb2.mjs
import { mode, deps, steps, hardStopAt, preflight, nextStep, sessionPrompt, dryRunReport } from './scripts/run-lane.mjs';

let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`); };

const CARDS = [
  { id: 'RB1', name: 'Run builder page', desc: 'Build the run builder.', phaseNum: 'RB', done: true },
  { id: 'RB2', name: 'Cloud runner', desc: 'AFTER RB1. The runner.', phaseNum: 'RB', done: false },
  { id: 'RB3', name: 'Two kickoffs', desc: 'AFTER RB2. Instant and hands-off.', phaseNum: 'RB', done: false, needsReview: true },
  { id: 'RB4', name: 'Morning report panel', desc: 'AFTER RB2. The green panel.', phaseNum: 'RB', done: false },
];
const run = (over = {}) => ({
  id: 5, status: 'running', sessions: [['RB2'], ['RB3', 'RB4']],
  settings: { mode: 'dry', ship: true, carryOn: true, stopAfterFailures: 2, hardStop: { kind: 'none' } },
  start_at: null, claimed_at: '2026-09-06T10:00:00.000Z', outcomes: [], ...over,
});
const withSettings = (o) => run({ settings: { ...run().settings, ...o } });

/* ---------- mode and the dry-run gate ------------------------------------- */
check('a run with no mode is a dry run', mode(run({ settings: {} })) === 'dry');
check('only mode "real" is real', mode(withSettings({ mode: 'real' })) === 'real' && mode(withSettings({ mode: 'REAL' })) === 'dry');
let pf = preflight(withSettings({ mode: 'real' }), CARDS);
check('a real run with no approved dry run is blocked', !pf.ok && pf.blockers.some(b => /no dry run has been approved/.test(b)), JSON.stringify(pf.blockers));
pf = preflight(withSettings({ mode: 'real', dryApproved: true }), CARDS);
check('a real run with an approved dry run is allowed', pf.ok, JSON.stringify(pf.blockers));
check('a plain dry run is allowed', preflight(run(), CARDS).ok);

/* ---------- pre-flight ----------------------------------------------------- */
check('a run that was never claimed is blocked', preflight(run({ status: 'ready' }), CARDS).blockers.some(b => /claim it first/.test(b)));
check('an empty run is blocked', preflight(run({ sessions: [] }), CARDS).blockers.some(b => /no sessions/.test(b)));
pf = preflight(run({ sessions: [['RB2'], ['GONE']] }), CARDS);
check('a card that left the roadmap is blocked', pf.blockers.some(b => /GONE is in the run but no longer on the roadmap/.test(b)), JSON.stringify(pf.blockers));
pf = preflight(run({ sessions: [['RB1']] }), CARDS);
check('a card finished since the run was saved is blocked', pf.blockers.some(b => /RB1 was finished after the run was saved/.test(b)), JSON.stringify(pf.blockers));
pf = preflight(run({ sessions: [['RB4'], ['RB2']] }), CARDS);
check('a dependency that is later in the run is blocked', pf.blockers.some(b => /RB4 comes after RB2, but RB2 is later in this run/.test(b)), JSON.stringify(pf.blockers));
pf = preflight(run({ sessions: [['RB4']] }), CARDS);
check('a dependency that is missing is only a warning', pf.ok && pf.warnings.some(w => /RB4 comes after RB2/.test(w)), JSON.stringify(pf));
check('a needs-review card is only a warning', preflight(run(), CARDS).warnings.some(w => /RB3 is waiting on Mike/.test(w)));
check('a dependency that is already done raises nothing', preflight(run({ sessions: [['RB2']] }), CARDS).warnings.length === 0);
const future = new Date(Date.now() + 3600e3).toISOString();
check('a run that is not due yet is blocked', preflight(run({ start_at: future }), CARDS).blockers.some(b => /not due to start/.test(b)));

/* ---------- the steps ------------------------------------------------------ */
const st = steps(run(), CARDS);
check('the run reads as two steps', st.length === 2 && st[0].n === 1 && st[1].n === 2);
check('the grouped step carries both cards', st[1].grouped === true && st[1].ids.join(',') === 'RB3,RB4');
check('a step knows the card names', st[0].names[0] === 'Cloud runner');
check('a card that left the roadmap still renders', steps(run({ sessions: [['GONE']] }), CARDS)[0].names[0] === '(card is gone)');

/* ---------- what to do next ------------------------------------------------ */
let n = nextStep(run(), CARDS);
check('a fresh run works step 1', n.action === 'work' && n.step.n === 1, JSON.stringify(n));
n = nextStep(run({ outcomes: [{ step: 1, result: 'done' }] }), CARDS);
check('after step 1 it works step 2', n.action === 'work' && n.step.n === 2);
n = nextStep(run({ outcomes: [{ step: 1, result: 'done' }, { step: 2, result: 'done' }] }), CARDS);
check('with every step done the run is finished', n.action === 'finished');
n = nextStep(run({ outcomes: [{ step: 1, result: 'failed' }, { step: 2, result: 'failed' }] }), CARDS);
check('two failures stop the run', n.action === 'stop' && /2 sessions failed/.test(n.reason), n.reason);
n = nextStep(run({ outcomes: [{ step: 1, result: 'failed' }] }), CARDS);
check('one failure does not', n.action === 'work' && n.step.n === 2);
n = nextStep({ ...withSettings({ stopAfterFailures: 1 }), outcomes: [{ step: 1, result: 'failed' }] }, CARDS);
check('the failure limit is the run\'s own number', n.action === 'stop', n.reason);
n = nextStep({ ...withSettings({ carryOn: false }), outcomes: [{ step: 1, result: 'needs-mike' }] }, CARDS);
check('stop-when-it-needs-Mike stops the run', n.action === 'stop' && /needs Mike/.test(n.reason), n.reason);
n = nextStep(run({ outcomes: [{ step: 1, result: 'needs-mike' }] }), CARDS);
check('carry-on carries on past a card that needs Mike', n.action === 'work' && n.step.n === 2);

/* ---------- the hard stop -------------------------------------------------- */
const claimed = '2026-09-06T10:00:00.000Z';
let hs = hardStopAt({ ...withSettings({ hardStop: { kind: 'hours', hours: 3 } }), claimed_at: claimed });
check('an hours hard stop counts from the claim', hs && hs.toISOString() === '2026-09-06T13:00:00.000Z', String(hs));
check('no hard stop means none', hardStopAt(run()) === null);
hs = hardStopAt(withSettings({ hardStop: { kind: 'clock', clock: '07:00' } }), new Date('2026-09-06T10:00:00Z'));
check('a clock hard stop resolves to the next such time', !!hs && hs.getTime() > new Date('2026-09-06T10:00:00Z').getTime());
check('a hard stop that is not a time is ignored', hardStopAt(withSettings({ hardStop: { kind: 'clock', clock: 'soon' } })) === null);
n = nextStep({ ...withSettings({ hardStop: { kind: 'hours', hours: 1 } }), claimed_at: claimed }, CARDS, new Date('2026-09-06T12:00:00Z'));
check('past the hard stop the run stops', n.action === 'stop' && /hard stop/.test(n.reason), n.reason);
n = nextStep({ ...withSettings({ hardStop: { kind: 'hours', hours: 4 } }), claimed_at: claimed }, CARDS, new Date('2026-09-06T12:00:00Z'));
check('before the hard stop it keeps working', n.action === 'work');

/* ---------- the session prompt --------------------------------------------- */
let p = sessionPrompt(run(), CARDS, 1);
check('the prompt names only that card', /Do ONLY card RB2\./.test(p) && !/RB3/.test(p), p.slice(0, 120));
check('the prompt points at the three rule files', /AGENTS\.md/.test(p) && /AUTOPILOT\.md/.test(p) && /RUN-ANYWHERE\.md/.test(p));
check('the prompt carries the card text', /Cloud runner: AFTER RB1\./.test(p));
check('a ship run says commit to main', /SHIP IT: commit to main/.test(p));
check('the prompt insists on the truth gate', /not on main is flagged for review/.test(p));
p = sessionPrompt(run(), CARDS, 2);
check('a grouped step says do them as ONE session', /Do these 2 cards as ONE session/.test(p) && /GROUPED law/.test(p), p.slice(0, 140));
check('a grouped step names the order', /in this order: RB3, RB4/.test(p));
p = sessionPrompt(withSettings({ ship: false, carryOn: false }), CARDS, 1);
check('a parked run says do not merge to main', /PARK IT/.test(p) && /do NOT merge to main/.test(p));
check('a stop run says stop rather than flag', /stop the whole run and say why/.test(p));
check('there is no step 9', sessionPrompt(run(), CARDS, 9) === null);

/* ---------- the dry-run report --------------------------------------------- */
let rep = dryRunReport(run(), CARDS);
check('the report says nothing was shipped', /Nothing was built, shipped or ticked/.test(rep), rep.split('\n')[0]);
check('the report counts the work', /3 cards in 2 sessions/.test(rep), rep);
check('the report lists the steps in order', rep.indexOf('1. RB2') < rep.indexOf('2. RB3 + RB4'));
check('the report explains ship in plain words', /Each session commits to main and Vercel deploys it/.test(rep));
check('the report explains the failure limit', /gives up after 2 failed sessions/.test(rep));
check('the report repeats the warnings', /RB3 is waiting on Mike/.test(rep));
check('the report asks for the approval', /press "Looks right" on this report/.test(rep));
rep = dryRunReport(withSettings({ ship: false, carryOn: false, hardStop: { kind: 'hours', hours: 2 } }), CARDS);
check('a parked run says nothing goes live', /nothing goes live until you merge it/.test(rep));
check('a stop run says it stops', /stops the whole run the first time a card needs you/.test(rep));
check('a hard stop is named in the report', /Hard stop at /.test(rep));
rep = dryRunReport(run({ sessions: [['RB1']] }), CARDS);
check('a report on a run that cannot start says so first', /It would NOT start/.test(rep), rep);

/* ---------- the server side of the gate ------------------------------------ */
process.env.SUPABASE_URL = 'https://stub.test';
process.env.SUPABASE_SERVICE_KEY = 'stub-key';
const { default: handler } = await import('./api/planner.js');
const META = { roadmap: { phases: [{ num: 'RB' }], sessions: CARDS.map(c => ({ id: c.id })) } };
let approvedRuns = [], liveRuns = [], inserted = null, patched = null, oneRun = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('planner_meta')) return { ok: true, json: async () => [{ data: JSON.parse(JSON.stringify(META)) }] };
  if (u.includes('settings-%3E%3Eapproved') || u.includes('settings->>approved')) return { ok: true, json: async () => approvedRuns };
  if (u.includes('planner_runs') && opts.method === 'PATCH') { patched = JSON.parse(opts.body); return { ok: true, json: async () => [{ id: 9 }] }; }
  if (u.includes('planner_runs') && opts.method === 'POST') { inserted = JSON.parse(opts.body); return { ok: true, json: async () => [{ id: 9, ...inserted }] }; }
  if (u.includes('planner_runs') && u.includes('select=settings,status')) return { ok: true, json: async () => oneRun };
  if (u.includes('planner_runs')) return { ok: true, json: async () => liveRuns };
  return { ok: true, json: async () => [] };
};
async function post(body) {
  let out = null;
  const res = { setHeader() {}, status(c) { this._c = c; return this; }, json(j) { out = { code: this._c, ...j }; return out; } };
  await handler({ method: 'POST', url: '/api/planner', body }, res);
  return out;
}
async function get(qs) {
  let out = null;
  const res = { setHeader() {}, status(c) { this._c = c; return this; }, json(j) { out = { code: this._c, ...j }; return out; } };
  await handler({ method: 'GET', url: '/api/planner?' + qs }, res);
  return out;
}

let r = await post({ op: 'saveRun', sessions: [['RB2']], settings: {} });
check('a run with no mode saves as a dry run', r.ok && inserted.settings.mode === 'dry', JSON.stringify(inserted && inserted.settings));
r = await post({ op: 'saveRun', sessions: [['RB2']], settings: { mode: 'real' } });
check('a real run is refused while no dry run is approved', r.ok === false && /dry run has to be approved/.test(r.error), JSON.stringify(r));
approvedRuns = [{ id: 3 }];
r = await post({ op: 'saveRun', sessions: [['RB2']], settings: { mode: 'real' } });
check('once one is approved a real run saves', r.ok === true && inserted.settings.mode === 'real', JSON.stringify(r));
check('and the approval is stamped on the run', inserted.settings.dryApproved === true);
r = await get('scope=runs');
check('the page is told the real mode is unlocked', r.ok && r.realUnlocked === true);
approvedRuns = [];
r = await get('scope=runs');
check('and told it is locked when nothing is approved', r.ok && r.realUnlocked === false);

oneRun = [{ settings: { mode: 'dry' }, status: 'running' }];
r = await post({ op: 'approveRun', id: 9 });
check('a run still going cannot be approved', r.ok === false && /after it has reported/.test(r.error), JSON.stringify(r));
oneRun = [{ settings: { mode: 'dry' }, status: 'done' }];
r = await post({ op: 'approveRun', id: 9 });
check('a finished dry run can be approved', r.ok === true && patched.settings.approved === true, JSON.stringify(r));
r = await post({ op: 'approveRun', id: 9, val: false });
check('and the approval can be taken back', r.ok === true && patched.settings.approved === false);
oneRun = [];
r = await post({ op: 'approveRun', id: 9 });
check('approving a run that is not there is refused', r.ok === false && /no run 9/.test(r.error), JSON.stringify(r));
r = await post({ op: 'approveRun' });
check('approving with no id is refused', r.ok === false);

console.log(fail === 0 ? '\nCLOUD RUN LANE: ALL PASS' : `\nCLOUD RUN LANE: ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
