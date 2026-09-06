#!/usr/bin/env node
// scripts/qa-all.mjs — THE RELEASE GATE (Session QA2).
//
// One command, one honest table. It does two things:
//
//   1) MACHINE SWEEP — runs every qa-*.mjs in the repo root, captures its exit
//      code, and reports pass/fail per harness. Exit 0 = pass is the house
//      convention every harness already follows.
//   2) PAGE SWEEP — serves public/ statically, opens EVERY public/**/*.html in
//      headless Chromium, and fails on a console error, an uncaught page error,
//      or a missing file (a static request that 404s).
//
// It prints ONE table, writes QA-SWEEP-REPORT.md, and exits non-zero if anything
// failed. "Green" from this script is the only thing that lets a session tick a
// card done — see AGENTS.md.
//
//   node scripts/qa-all.mjs                  everything
//   node scripts/qa-all.mjs --no-pages       harnesses only (no browser needed)
//   node scripts/qa-all.mjs --pages-only     just the browser sweep
//   node scripts/qa-all.mjs --only maze      harnesses whose name contains "maze"
//   node scripts/qa-all.mjs --jobs 1         run harnesses one at a time
//   node scripts/qa-all.mjs --strict         a SKIP counts as a failure
//   npm run qa                               the same thing
//
// HONESTY RULES, because a green table nobody trusts is worse than a red one:
//   - A harness that cannot run is never silently dropped. It is either fixed or
//     listed in QUARANTINE below with a reason and a planner card id, and it
//     prints as QUAR — visible in the table, excluded from the exit code.
//   - The page sweep needs `playwright`. If it is missing the sweep prints SKIP
//     with the install line, and the summary says "green but incomplete" rather
//     than "green". --strict turns that into a failure (use it in CI).
//   - /api/* requests are NOT counted as missing files: there is no backend in
//     front of a static server. Everything else under public/ is fair game.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

// ---------------------------------------------------------------------------
// Quarantine — a harness that cannot run today, with the card that fixes it.
// Add an entry ONLY with a planner card id. An empty object is the goal state.
// { 'qa-thing.mjs': { reason: 'why it cannot run', card: 'QA9' } }
// ---------------------------------------------------------------------------
const QUARANTINE = {
  'qa-ap2-use-in-game.mjs': {
    reason: 'asserts 2 .useg buttons on the Browse page; it now renders 307, so the stub no longer reflects the page',
    card: 'QA10',
  },
  'qa-lessons.mjs': {
    reason: 'greps the pre-NV2 Home shape (id: "lessons"); the door is now id: "learn"',
    card: 'QA11',
  },
  'qa-lessons-dom.mjs': {
    reason: 'same pre-NV2 Home assertions as qa-lessons.mjs',
    card: 'QA11',
  },
};

// Browser-driven harnesses (the Sky Flyer look/sky/HUD gates) expect public/ to
// already be served at this port — they take SKY_BASE but default to it. The
// sweep puts a server there for the duration so they are not "cannot run".
const HARNESS_PORT = 8899;

// Console noise that is a property of the harness environment, not the page.
// Keep this list SHORT and justified — every entry is a check we are not doing.
const CONSOLE_IGNORE = [
  // Chromium logs a generic line for every failed request. The request hooks
  // below already record those WITH the url, so keeping both double-counts one
  // missing file as two problems and buries the real list.
  /^Failed to load resource:/i,
  /favicon\.ico/i,                       // the static server has no favicon route for sub-paths
  /\[Report Only\]/i,                    // CSP report-only notices, not errors
];

// Files that are SUPPOSED to be missing today. These are counted and printed
// separately — never hidden — but they do not turn the gate red. Every entry
// needs a reason that says why the page is fine without the file.
const EXPECTED_MISSING = [
  {
    re: /^\/explore\/topic-photos\//,
    why: 'RP1 forward-declares per-fact art in the book JSON before the photo lands, the same way bookshelf.json lists all 20 books from day one; topic.html renders every one of these through an onerror fallback, so a kid sees the painted panel, never a broken image',
  },
];

// A failed request we do not count as a missing file.
const REQUEST_IGNORE = [
  /^\/api\//,                            // no backend in front of a static server
  /^https?:\/\//,                        // third-party origins (fonts, CDNs) — a
                                         // sandboxed or offline machine cannot
                                         // reach these, and a local request to
                                         // 127.0.0.1 never looks like this, so
                                         // nothing of ours hides behind it
];

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };

const OPT = {
  pages: !has('--no-pages'),
  harnesses: !has('--pages-only'),
  only: val('--only', null),
  jobs: Math.max(1, parseInt(val('--jobs', '4'), 10) || 4),
  timeout: (parseInt(val('--timeout', '180'), 10) || 180) * 1000,
  strict: has('--strict'),
  report: val('--report', path.join(ROOT, 'QA-SWEEP-REPORT.md')),
};

const C = process.stdout.isTTY
  ? { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m` }
  : { g: (s) => s, r: (s) => s, y: (s) => s, d: (s) => s, b: (s) => s };

const paint = (st) => st === 'PASS' ? C.g(st) : st === 'FAIL' || st === 'TIMEOUT' ? C.r(st) : C.y(st);

// ---------------------------------------------------------------------------
// 1) machine sweep
// ---------------------------------------------------------------------------
function runHarness(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file, ROOT], { cwd: ROOT, env: process.env });
    let out = '';
    const cap = (b) => { out += b; if (out.length > 200000) out = out.slice(-200000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);

    const timer = setTimeout(() => { child.kill('SIGKILL'); }, OPT.timeout);
    let killed = false;
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      killed = signal === 'SIGKILL';
      const ms = Date.now() - started;
      const q = QUARANTINE[file];
      let status;
      if (killed) status = 'TIMEOUT';
      else if (code === 0) status = 'PASS';
      else status = 'FAIL';
      if (q && status !== 'PASS') status = 'QUAR';
      resolve({ name: file, status, code, ms, out, quarantine: q || null });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ name: file, status: 'FAIL', code: -1, ms: Date.now() - started, out: String(err), quarantine: QUARANTINE[file] || null });
    });
  });
}

async function machineSweep() {
  let files = fs.readdirSync(ROOT).filter((f) => /^qa-.*\.mjs$/.test(f)).sort();
  if (OPT.only) files = files.filter((f) => f.includes(OPT.only));
  if (!files.length) return [];

  process.stdout.write(C.b(`\nMACHINE SWEEP — ${files.length} harness${files.length === 1 ? '' : 'es'}, ${OPT.jobs} at a time\n`));

  // Stand up public/ on the port the browser-driven harnesses expect. If the
  // port is already taken we leave it alone — someone is already serving.
  let held = null;
  try {
    held = await new Promise((resolve, reject) => {
      const s = http.createServer(staticHandler(PUBLIC));
      s.once('error', reject);
      s.listen(HARNESS_PORT, '127.0.0.1', () => resolve(s));
    });
    process.stdout.write(C.d(`  (serving public/ on :${HARNESS_PORT} for the browser-driven harnesses)\n`));
  } catch {
    process.stdout.write(C.d(`  (port ${HARNESS_PORT} already in use — leaving it to whoever has it)\n`));
  }

  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      const r = await runHarness(f);
      results.push(r);
      process.stdout.write(`  ${paint(r.status.padEnd(7))} ${r.name.padEnd(28)} ${C.d((r.ms / 1000).toFixed(1) + 's')}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(OPT.jobs, files.length) }, worker));
  if (held) held.close();
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

// ---------------------------------------------------------------------------
// 2) page sweep
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream',
};

function staticHandler(dir) {
  return (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const target = path.join(dir, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
    if (!target.startsWith(dir)) { res.writeHead(403).end(); return; }
    fs.stat(target, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(target).pipe(res);
    });
  };
}

function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer(staticHandler(dir));
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// Find a chromium playwright can actually launch. The repo does not pin a
// browser build, and some sandboxes ship one already; prefer whatever is there
// over asking a contributor to download 150MB.
function chromiumPath() {
  if (process.env.QA_CHROMIUM) return process.env.QA_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  const cands = [];
  for (const d of fs.readdirSync(base)) {
    for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = path.join(base, d, exe);
      if (fs.existsSync(p)) cands.push(p);
    }
  }
  // Prefer a full chrome over the headless shell; newest build wins.
  cands.sort((a, b) => (b.includes('/chrome-linux/chrome') ? 1 : 0) - (a.includes('/chrome-linux/chrome') ? 1 : 0) || b.localeCompare(a));
  return cands[0];
}

function listPages(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listPages(p, out);
    else if (e.name.endsWith('.html')) out.push('/' + path.relative(PUBLIC, p).split(path.sep).join('/'));
  }
  return out;
}

async function pageSweep() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    return { skipped: 'playwright is not installed — run: npm i -D playwright', rows: [] };
  }

  const exe = chromiumPath();
  let browser;
  try {
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
  } catch (err) {
    return { skipped: 'chromium would not launch: ' + String(err.message).split('\n')[0], rows: [] };
  }

  const { server, port } = await serve(PUBLIC);
  const pages = listPages(PUBLIC).sort();
  process.stdout.write(C.b(`\nPAGE SWEEP — ${pages.length} pages in headless chromium\n`));

  const rows = [];
  for (const rel of pages) {
    const errors = [];
    const missing = [];
    const expected = [];
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (CONSOLE_IGNORE.some((re) => re.test(t))) return;
      errors.push(t.slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push('uncaught: ' + String(e.message).slice(0, 300)));
    const noteMissing = (url, why) => {
      const u = url.startsWith(`http://127.0.0.1:${port}`) ? url.slice(`http://127.0.0.1:${port}`.length) : url;
      if (REQUEST_IGNORE.some((re) => re.test(u))) return;
      if (CONSOLE_IGNORE.some((re) => re.test(u))) return;
      if (EXPECTED_MISSING.some((e) => e.re.test(u))) { expected.push(u.slice(0, 200)); return; }
      missing.push(`${why} ${u.slice(0, 200)}`);
    };
    page.on('requestfailed', (r) => noteMissing(r.url(), 'failed'));
    page.on('response', (r) => { if (r.status() >= 400) noteMissing(r.url(), r.status() + ''); });

    let loadErr = null;
    try {
      await page.goto(`http://127.0.0.1:${port}${rel}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(1200); // let deferred work and first frames run
    } catch (err) {
      loadErr = String(err.message).split('\n')[0];
    }
    await ctx.close();

    const problems = [...(loadErr ? ['load: ' + loadErr] : []), ...errors, ...missing];
    const status = problems.length ? 'FAIL' : 'PASS';
    rows.push({ name: rel, status, problems, expected });
    const note = problems.length
      ? C.d(problems.length + ' problem' + (problems.length === 1 ? '' : 's'))
      : expected.length ? C.d(`(${expected.length} expected-missing)`) : '';
    process.stdout.write(`  ${paint(status.padEnd(7))} ${rel.padEnd(34)} ${note}\n`);
  }

  await browser.close();
  server.close();
  return { skipped: null, rows };
}

// ---------------------------------------------------------------------------
// report + exit
// ---------------------------------------------------------------------------
function tally(rows) {
  const t = { PASS: 0, FAIL: 0, TIMEOUT: 0, QUAR: 0 };
  for (const r of rows) t[r.status] = (t[r.status] || 0) + 1;
  return t;
}

function writeReport(harnesses, pageRes, started) {
  const ht = tally(harnesses);
  const pt = tally(pageRes.rows);
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const L = [];
  L.push('# QA-SWEEP-REPORT.md');
  L.push('');
  L.push(`Written by \`scripts/qa-all.mjs\` — ${stamp}. Took ${((Date.now() - started) / 1000).toFixed(0)}s.`);
  L.push('');
  L.push('This file is generated. Do not hand-edit it: re-run `npm run qa`.');
  L.push('');

  if (OPT.harnesses) {
    L.push(`## Machine sweep — ${harnesses.length} harnesses`);
    L.push('');
    L.push(`**${ht.PASS || 0} pass · ${ht.FAIL || 0} fail · ${ht.TIMEOUT || 0} timeout · ${ht.QUAR || 0} quarantined**`);
    L.push('');
    L.push('| Harness | Result | Time |');
    L.push('|---|---|---|');
    for (const r of harnesses) L.push(`| \`${r.name}\` | ${r.status} | ${(r.ms / 1000).toFixed(1)}s |`);
    L.push('');
    const bad = harnesses.filter((r) => r.status === 'FAIL' || r.status === 'TIMEOUT' || r.status === 'QUAR');
    if (bad.length) {
      L.push('### Detail');
      L.push('');
      for (const r of bad) {
        L.push(`#### \`${r.name}\` — ${r.status}${r.quarantine ? ` (quarantined: ${r.quarantine.reason}, card ${r.quarantine.card})` : ''}`);
        L.push('');
        L.push('```');
        L.push(r.out.split('\n').filter((l) => l.trim()).slice(-25).join('\n') || '(no output)');
        L.push('```');
        L.push('');
      }
    }
  }

  if (OPT.pages) {
    L.push(`## Page sweep — every \`public/**/*.html\``);
    L.push('');
    if (pageRes.skipped) {
      L.push(`**SKIPPED** — ${pageRes.skipped}`);
      L.push('');
      L.push('This half of the gate did not run, so the sweep is green but incomplete.');
    } else {
      const exp = pageRes.rows.reduce((n, r) => n + r.expected.length, 0);
      L.push(`**${pt.PASS || 0} clean · ${pt.FAIL || 0} with problems** (console errors, uncaught errors, or missing files).`);
      L.push('');
      L.push('| Page | Result | Problems | Expected-missing |');
      L.push('|---|---|---|---|');
      for (const r of pageRes.rows) L.push(`| \`${r.name}\` | ${r.status} | ${r.problems.length || ''} | ${r.expected.length || ''} |`);
      L.push('');
      if (exp) {
        L.push(`### Expected-missing — ${exp} request${exp === 1 ? '' : 's'}, not counted as failures`);
        L.push('');
        for (const e of EXPECTED_MISSING) L.push(`- \`${e.re.source}\` — ${e.why}`);
        L.push('');
        L.push('These are listed so the exemption stays visible. If one stops being');
        L.push('true, delete its entry in `scripts/qa-all.mjs` and the gate goes red.');
        L.push('');
      }
      const bad = pageRes.rows.filter((r) => r.status === 'FAIL');
      if (bad.length) {
        L.push('### Detail');
        L.push('');
        for (const r of bad) {
          L.push(`#### \`${r.name}\``);
          L.push('');
          for (const p of r.problems.slice(0, 20)) L.push(`- ${p.replace(/\|/g, '\\|')}`);
          if (r.problems.length > 20) L.push(`- …and ${r.problems.length - 20} more`);
          L.push('');
        }
      }
    }
  }

  fs.writeFileSync(OPT.report, L.join('\n') + '\n');
}

(async () => {
  const started = Date.now();
  const harnesses = OPT.harnesses ? await machineSweep() : [];
  const pageRes = OPT.pages ? await pageSweep() : { skipped: null, rows: [] };

  writeReport(harnesses, pageRes, started);

  const ht = tally(harnesses);
  const pt = tally(pageRes.rows);
  const hardFails = (ht.FAIL || 0) + (ht.TIMEOUT || 0) + (pt.FAIL || 0);
  const skipped = pageRes.skipped ? 1 : 0;

  process.stdout.write(C.b('\n──────── QA SWEEP ────────\n'));
  if (OPT.harnesses) process.stdout.write(`harnesses   ${ht.PASS || 0} pass · ${ht.FAIL || 0} fail · ${ht.TIMEOUT || 0} timeout · ${ht.QUAR || 0} quarantined\n`);
  if (OPT.pages) {
    const exp = pageRes.rows.reduce((n, r) => n + r.expected.length, 0);
    process.stdout.write(pageRes.skipped
      ? `pages       ${C.y('SKIPPED')} — ${pageRes.skipped}\n`
      : `pages       ${pt.PASS || 0} clean · ${pt.FAIL || 0} with problems${exp ? C.d(` · ${exp} expected-missing (see report)`) : ''}\n`);
  }
  process.stdout.write(`report      ${path.relative(ROOT, OPT.report)}\n`);

  if (hardFails) {
    process.stdout.write(C.r(`\nRED — ${hardFails} failure${hardFails === 1 ? '' : 's'}. Nothing ships on this.\n\n`));
    process.exit(1);
  }
  if (skipped && OPT.strict) {
    process.stdout.write(C.r('\nRED — a section was skipped and --strict is on.\n\n'));
    process.exit(1);
  }
  if (skipped) {
    process.stdout.write(C.y('\nGREEN, BUT INCOMPLETE — a section was skipped. See the report.\n\n'));
    process.exit(0);
  }
  if (ht.QUAR) {
    process.stdout.write(C.y(`\nGREEN — but ${ht.QUAR} harness${ht.QUAR === 1 ? ' is' : 'es are'} quarantined and not being checked.\n\n`));
    process.exit(0);
  }
  process.stdout.write(C.g('\nALL GREEN\n\n'));
  process.exit(0);
})().catch((err) => {
  console.error('qa-all: crashed —', err);
  process.exit(2);
});
