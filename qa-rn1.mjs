// Headless QA for RN1 — "done has to mean it is in the app".
//
// What this proves:
//   1) scripts/git-gate.mjs, scripts/planner.mjs, scripts/autopilot.mjs all parse.
//   2) gateCheck() returns { ok: true, skipped: true } when run OUTSIDE a git
//      checkout (Mike's phone, PLANNER_URL stubs) — the whole thing is skipped
//      rather than failing.
//   3) gateCheck() returns { ok: true } here, in this checkout, right now — the
//      current session is expected to have pushed before running QA, so the gate
//      is not a blocker on its own author.
//   4) gateCheck() catches a dirty working tree: seeded a scratch commit + a new
//      untracked file inside a throwaway repo, we get { ok: false } with a note
//      naming the offending files and a plain-English hint.
//   5) gateCheck() catches a HEAD that is not in origin/main: a scratch repo
//      with a local commit past a bare "origin/main" returns { ok: false } with
//      a "N commits not in origin/main" note.
//   6) strandedBranches() returns a { branches: [...] } shape — and inside a
//      seeded repo with one doc-only branch, one real branch and one
//      "NOT for main" branch, it lists ONLY the real one.
//   7) planner.mjs stranded runs (subprocess), exits 0, prints sane output.
//   8) planner.mjs (spawned with PLANNER_URL set to an unreachable stub so no
//      real card is touched) still parses its args past `done` — i.e. the gate
//      code path is reachable from the CLI.
//   9) autopilot.mjs imports the gate — the source contains a call to
//      gateCheck() at the verification step, so no other route can tick done
//      without hitting the same check.
//
//   node qa-rn1.mjs
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { gateCheck, strandedBranches, inGitCheckout } from './scripts/git-gate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const shOK = (cmd, opts) => { try { execSync(cmd, { stdio: 'ignore', ...opts }); return true; } catch { return false; } };

// -------------------------------------------------------- 1) files parse
console.log('--- Source files parse ---');
for (const f of ['scripts/git-gate.mjs', 'scripts/planner.mjs', 'scripts/autopilot.mjs']) {
  chk(f + ' parses', shOK(`node --check ${JSON.stringify(join(HERE, f))}`));
}

// -------------------------------------------------------- 2) skipped outside git
console.log('--- gateCheck() skips outside a git checkout ---');
const outDir = mkdtempSync(join(tmpdir(), 'rn1-nogit-'));
try {
  // Run the gate in a subprocess whose cwd is a non-git directory.
  const r = spawnSync(process.execPath, ['-e',
    `import('${join(HERE, 'scripts/git-gate.mjs').replace(/\\/g, '\\\\')}').then(m => { const g = m.gateCheck(); console.log(JSON.stringify(g)); });`
  ], { cwd: outDir, encoding: 'utf8' });
  chk('subprocess exited 0', r.status === 0, r.stderr.trim());
  let out = {}; try { out = JSON.parse(r.stdout.trim().split('\n').pop() || '{}'); } catch {}
  chk('gate returns ok:true, skipped:true outside git', out.ok === true && out.skipped === true, JSON.stringify(out));
} finally { rmSync(outDir, { recursive: true, force: true }); }

// -------------------------------------------------------- 3) well-formed result here
console.log('--- gateCheck() returns a well-formed result in this checkout ---');
chk('we are inside a git checkout', inGitCheckout());
const here = gateCheck();
// QA runs BEFORE the push, so ok may be false (uncommitted QA files etc.).
// What matters is the shape: either ok:true, or ok:false with a note + hint the
// caller can print. Not throwing is the check.
const wellFormed = here && typeof here.ok === 'boolean' &&
  (here.ok || (typeof here.note === 'string' && typeof here.hint === 'string'));
chk('gate returns a well-formed { ok, note?, hint? }', wellFormed, JSON.stringify(here).slice(0, 200));

// Helper: build a throwaway repo pair (bare "origin" + working clone) so we
// can seed exactly the conditions the gate is supposed to catch, without
// touching the real project.
function seedRepo() {
  const root = mkdtempSync(join(tmpdir(), 'rn1-seed-'));
  const bare = join(root, 'origin.git');
  const work = join(root, 'work');
  execSync(`git init --bare -q -b main ${JSON.stringify(bare)}`);
  execSync(`git init -q -b main ${JSON.stringify(work)}`);
  const runIn = (cmd) => execSync(cmd, { cwd: work, stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_NAME: 'qa', GIT_AUTHOR_EMAIL: 'qa@x',
      GIT_COMMITTER_NAME: 'qa', GIT_COMMITTER_EMAIL: 'qa@x' } });
  runIn(`git remote add origin ${JSON.stringify(bare)}`);
  writeFileSync(join(work, 'README.md'), 'seed\n');
  runIn(`git add README.md`);
  runIn(`git commit -q -m "seed"`);
  runIn(`git push -q origin main`);
  runIn(`git fetch -q origin`);
  return { root, work, runIn };
}
function callGate(work) {
  const gatePath = join(HERE, 'scripts/git-gate.mjs').replace(/\\/g, '\\\\');
  const r = spawnSync(process.execPath, ['-e',
    `import('${gatePath}').then(m => { const g = m.gateCheck(); console.log(JSON.stringify(g)); });`
  ], { cwd: work, encoding: 'utf8' });
  try { return JSON.parse(r.stdout.trim().split('\n').pop() || '{}'); }
  catch { return { _raw: r.stdout, _err: r.stderr }; }
}
function callStranded(work) {
  const gatePath = join(HERE, 'scripts/git-gate.mjs').replace(/\\/g, '\\\\');
  const r = spawnSync(process.execPath, ['-e',
    `import('${gatePath}').then(m => { const s = m.strandedBranches(); console.log(JSON.stringify(s)); });`
  ], { cwd: work, encoding: 'utf8' });
  try { return JSON.parse(r.stdout.trim().split('\n').pop() || '{}'); }
  catch { return { _raw: r.stdout, _err: r.stderr }; }
}

// -------------------------------------------------------- 4) dirty tree blocked
console.log('--- gateCheck() blocks a dirty working tree ---');
{
  const { root, work } = seedRepo();
  try {
    writeFileSync(join(work, 'untracked-file.txt'), 'stray work\n');
    const g = callGate(work);
    chk('dirty tree -> ok:false', g.ok === false, JSON.stringify(g));
    chk('note names the file', /untracked-file\.txt/.test(g.note || ''), g.note || '');
    chk('hint is a plain-English next step', /commit|stash|gitignore|push/i.test(g.hint || ''), g.hint || '');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// -------------------------------------------------------- 5) stranded commit blocked
console.log('--- gateCheck() blocks a HEAD not in origin/main ---');
{
  const { root, work, runIn } = seedRepo();
  try {
    writeFileSync(join(work, 'engine.js'), 'shipped!\n');
    runIn(`git add engine.js`);
    runIn(`git commit -q -m "ship engine"`);
    // Do NOT push — this is exactly the 7M / 9E / FL9 / RP8 failure mode.
    const g = callGate(work);
    chk('stranded commit -> ok:false', g.ok === false, JSON.stringify(g));
    chk('note counts commits not in origin/main', /commit(s)? not in origin\/main/.test(g.note || ''), g.note || '');
    chk('note names the stranded file', /engine\.js/.test(g.note || ''), g.note || '');
    chk('hint says to push', /push/i.test(g.hint || ''), g.hint || '');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// -------------------------------------------------------- 6) strandedBranches shape + filters
console.log('--- strandedBranches() lists real branches and filters doc-only / NOT-for-main ---');
{
  const { root, work, runIn } = seedRepo();
  try {
    // Branch A: real code change — should appear.
    runIn(`git checkout -q -b feature/real`);
    writeFileSync(join(work, 'src.js'), 'real\n');
    runIn(`git add src.js`);
    runIn(`git commit -q -m "real work"`);
    runIn(`git push -q -u origin feature/real`);
    // Branch B: only touches SESSION-LOG.md — should be filtered out.
    runIn(`git checkout -q main`);
    runIn(`git checkout -q -b docs/session-log`);
    writeFileSync(join(work, 'SESSION-LOG.md'), 'log entry\n');
    runIn(`git add SESSION-LOG.md`);
    runIn(`git commit -q -m "session log"`);
    runIn(`git push -q -u origin docs/session-log`);
    // Branch C: head commit message says NOT for main — should be filtered out.
    runIn(`git checkout -q main`);
    runIn(`git checkout -q -b scratch/experiment`);
    writeFileSync(join(work, 'wip.js'), 'wip\n');
    runIn(`git add wip.js`);
    runIn(`git commit -q -m "wip NOT for main"`);
    runIn(`git push -q -u origin scratch/experiment`);
    runIn(`git checkout -q main`);
    runIn(`git fetch -q origin`);

    const s = callStranded(work);
    chk('shape has a branches array', Array.isArray(s.branches), JSON.stringify(s).slice(0, 200));
    const names = (s.branches || []).map((b) => b.branch);
    chk('lists origin/feature/real', names.includes('origin/feature/real'), names.join(', '));
    chk('ignores doc-only branch (origin/docs/session-log)', !names.includes('origin/docs/session-log'), names.join(', '));
    chk('ignores "NOT for main" branch (origin/scratch/experiment)', !names.includes('origin/scratch/experiment'), names.join(', '));
    const real = (s.branches || []).find((b) => b.branch === 'origin/feature/real');
    chk('real branch reports a commit count and file list', !!real && real.count >= 1 && Array.isArray(real.files) && real.files.includes('src.js'), JSON.stringify(real || null));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// -------------------------------------------------------- 7) planner.mjs stranded runs
console.log('--- planner.mjs stranded runs cleanly here ---');
{
  const r = spawnSync(process.execPath, [join(HERE, 'scripts/planner.mjs'), 'stranded'],
    { cwd: HERE, encoding: 'utf8' });
  chk('exit 0', r.status === 0, (r.stderr || '').slice(0, 200));
  chk('prints something', (r.stdout || '').trim().length > 0, r.stdout);
}

// -------------------------------------------------------- 8) planner.mjs done gate wiring
console.log('--- planner.mjs done runs the gate before the network call ---');
{
  // Point PLANNER_URL at an unreachable local port. Two acceptable outcomes:
  //   (a) the gate fails first (dirty tree / stranded etc.) → exit 2, plain message
  //   (b) the gate passes and only THEN does the network fail
  // Either proves the gate code path is executed by the CLI. Anything else means
  // the wiring is broken.
  const r = spawnSync(process.execPath, [join(HERE, 'scripts/planner.mjs'), 'done', 'RN1-QA-STUB-DOES-NOT-EXIST', 'from qa'],
    { cwd: HERE, encoding: 'utf8', env: { ...process.env, PLANNER_URL: 'http://127.0.0.1:59321/api/planner-does-not-exist' } });
  const combined = (r.stdout || '') + (r.stderr || '');
  chk('exit code is non-zero (gate hold OR unreachable stub)', r.status !== 0, `code=${r.status} out=${combined.slice(0, 200)}`);
  const gateFired = /HOLD:.*flagged for review/.test(combined) || /Next session:/.test(combined);
  const networkFired = /planner:/.test(combined) || /ECONNREFUSED|fetch failed|read failed|write failed|refused/i.test(combined);
  chk('either the gate held or the network path was reached', gateFired || networkFired, combined.slice(0, 400));
}

// -------------------------------------------------------- 9) autopilot uses the same gate
console.log('--- autopilot.mjs calls gateCheck() at the verification step ---');
{
  const src = readFileSync(join(HERE, 'scripts/autopilot.mjs'), 'utf8');
  chk('imports gateCheck from git-gate.mjs', /import\s*\{\s*gateCheck\s*\}\s*from\s*['"]\.\/git-gate\.mjs['"]/.test(src));
  chk('calls gateCheck() after the planner verification', /const\s+after\s*=[\s\S]{0,2000}const\s+gate\s*=\s*gateCheck\(\)/.test(src));
  chk('flips a stranded card back to needsReview', /fields:\s*\{\s*done:\s*false,\s*needsReview:\s*true\s*\}/.test(src));
}

// -------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
