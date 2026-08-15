// scripts/git-gate.mjs — the "done means it is in the app" check.
//
// Ticking a card done used to be a claim. Four cards (7M, 9E, FL9, RP8) were
// marked done while the work sat on branches that never reached main, and kids
// never saw any of it. This module is the CHECK that stops that happening again.
// planner.mjs runs it before every `done`; autopilot.mjs runs it after every
// session as a belt-and-suspenders second gate.
//
// Exports:
//   inGitCheckout()         true if the cwd is inside a git working tree
//   gateCheck({ fetch })    returns { ok, note?, hint?, skipped? }
//   strandedBranches()      returns { branches: [{branch, count, files}], skipped? }
//
// gateCheck() returns:
//   { ok: true }                        clean, safe to mark done
//   { ok: true, skipped: true }         not in a git checkout — do not block
//   { ok: false, note, hint }           do NOT mark done. `note` says what is
//                                       stranded; `hint` says how to land it.
import { execSync } from 'node:child_process';

function shOut(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}
function shOK(cmd) {
  try { execSync(cmd, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

export function inGitCheckout() {
  return shOK('git rev-parse --is-inside-work-tree');
}

export function gateCheck({ fetch: doFetch = true } = {}) {
  if (!inGitCheckout()) return { ok: true, skipped: true };

  const branch = shOut('git rev-parse --abbrev-ref HEAD') || '(detached)';

  const status = shOut('git status --porcelain');
  if (status) {
    const files = status.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
    const preview = files.slice(0, 6).join(', ') + (files.length > 6 ? '…' : '');
    return {
      ok: false,
      note: `branch '${branch}' has ${files.length} uncommitted change${files.length === 1 ? '' : 's'}: ${preview}`,
      hint: `commit or stash on '${branch}' (or add to .gitignore), push, then re-run.`,
    };
  }

  if (doFetch) {
    // Offline is fine — the ancestor check below will use whatever origin/main
    // was last time we fetched. That is still a real check, not a false green.
    shOK('git fetch origin main --quiet');
  }

  if (!shOK('git rev-parse --verify origin/main')) {
    return {
      ok: false,
      note: `cannot resolve origin/main (fetch failed or the remote is missing).`,
      hint: `check your git remote, run 'git fetch origin main', then re-run.`,
    };
  }

  if (shOK('git merge-base --is-ancestor HEAD origin/main')) return { ok: true };

  const ahead = shOut('git rev-list --count origin/main..HEAD') || '?';
  const files = shOut('git diff --name-only origin/main...HEAD').split('\n').filter(Boolean);
  const preview = files.slice(0, 6).join(', ') + (files.length > 6 ? '…' : '');
  const hint = branch === 'main'
    ? `push main ('git push origin main') and re-run.`
    : `push '${branch}' ('git push origin ${branch}') and merge it into main, then re-run.`;
  return {
    ok: false,
    note: `branch '${branch}' has ${ahead} commit${ahead === '1' ? '' : 's'} not in origin/main. Files: ${preview}`,
    hint,
  };
}

// Doc-only churn does not count as stranded work. A branch whose sole unmerged
// files are these three is ignored — it is almost certainly a session log left
// on a working branch, not real product code.
const IGNORED_FILES = new Set(['SESSION-LOG.md', 'README.md', 'AUTOPILOT-REPORT.md']);
const IGNORE_TAG = /NOT for main/i;

export function strandedBranches() {
  if (!inGitCheckout()) return { skipped: true, branches: [] };
  shOK('git fetch origin --quiet');

  // Format string is single-quoted so /bin/sh does not read (refname:short) as
  // a subshell. Same trap that made this method silently return [] the first time.
  const raw = shOut("git for-each-ref --format='%(refname:short)' refs/remotes/origin");
  if (!raw) return { branches: [] };

  const branches = raw.split('\n').filter((b) => b && b !== 'origin/HEAD' && b !== 'origin/main');
  const out = [];
  for (const branch of branches) {
    const count = parseInt(shOut(`git rev-list --count origin/main..${branch}`), 10);
    if (!count) continue;

    const headMsg = shOut(`git log -1 --pretty=%B ${branch}`);
    if (IGNORE_TAG.test(headMsg)) continue;

    const files = shOut(`git diff --name-only origin/main...${branch}`).split('\n').filter(Boolean);
    const meaningful = files.filter((f) => !IGNORED_FILES.has(f));
    if (!meaningful.length) continue;

    out.push({ branch, count, files: meaningful });
  }
  return { branches: out };
}
