#!/usr/bin/env node
// scripts/qa-all.mjs — THE RELEASE GATE (Session QA2).
//
// One command, one honest table. It does three things:
//
//   1) SERVING CHECK — every public/buildable-*.js and every public/*.html must
//      have a route in vercel.json AHEAD of the "/(.*)" catch-all. This check
//      exists because Practice shipped completely dead: qa-practice.mjs passed
//      the whole time, but buildable-practice.js had no route, so the catch-all
//      served landing.html in its place and the browser threw
//      "Unexpected token '<'". A passing harness does not mean the thing is
//      reachable. It is a file-system sweep, not a list somebody has to
//      remember to update, so a new file cannot be forgotten. With --live it
//      goes further and fetches each one from production, failing if HTML comes
//      back where JavaScript was expected.
//      (Folded in from the root qa-all.mjs, session QA-FIX 2026-08-30, which
//      this file replaces.)
//   2) MACHINE SWEEP — runs every qa-*.mjs in the repo root, captures its exit
//      code, and reports pass/fail per harness. Exit 0 = pass is the house
//      convention every harness already follows.
//   3) PAGE SWEEP — serves public/ statically, opens EVERY public/**/*.html in
//      headless Chromium, and fails on a console error, an uncaught page error,
//      or a missing file (a static request that 404s).
//
// It prints ONE table, writes QA-SWEEP-REPORT.md, and exits non-zero if anything
// failed. "Green" from this script is the only thing that lets a session tick a
// card done — see AGENTS.md.
//
//   node scripts/qa-all.mjs                  everything
//   node scripts/qa-all.mjs --no-pages       serving check + harnesses (no browser)
//   node scripts/qa-all.mjs --serving-only   just the routing check, nothing else
//   node scripts/qa-all.mjs --live           ALSO fetch each file from production
//   node scripts/qa-all.mjs --no-serving     skip the routing check
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
//   - --live needs real network. A sandbox whose egress proxy answers 403 to
//     everything is not a broken site, so the live half probes once and prints
//     SKIP loudly rather than inventing fifty failures.

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

const SERVING_ONLY = has('--serving-only');

const OPT = {
  serving: !has('--no-serving'),
  live: has('--live'),
  site: val('--site', null) || process.env.QA_SITE_URL || 'https://buildablekids.com',
  pages: !has('--no-pages') && !SERVING_ONLY,
  harnesses: !has('--pages-only') && !SERVING_ONLY,
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
// 0) serving check — is every file we ship actually reachable?
//
// Folded in from the root qa-all.mjs (session QA-FIX, 2026-08-30). vercel.json
// uses legacy `routes` with no `handle: filesystem` phase, so the final
// "/(.*)" -> /landing.html catch-all swallows anything that has no route of its
// own ahead of it. That is exactly how Practice shipped dead.
// ---------------------------------------------------------------------------
function servingCheck() {
  const rows = [];
  const add = (status, what, detail) => {
    rows.push({ name: what, status, detail: detail || '' });
    process.stdout.write(`  ${paint(status.padEnd(7))} ${what}${detail ? C.d('  ' + detail) : ''}\n`);
  };

  process.stdout.write(C.b('\nSERVING CHECK — every shipped file has a route in vercel.json\n'));

  let routes = [];
  try {
    routes = (JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).routes || []).map((r) => r.src);
  } catch (err) {
    add('FAIL', 'vercel.json is valid JSON', String(err.message).split('\n')[0]);
    return { rows, shared: [], pages: [], live: null };
  }

  // The catch-all is meant to be LAST and sends everything unmatched to the
  // marketing page. Anything that must be served as itself comes before it.
  const catchAllAt = routes.indexOf('/(.*)');
  if (catchAllAt === -1) add('PASS', 'there is no blanket catch-all to fall through');
  else add('PASS', 'the catch-all is last', `route ${catchAllAt + 1} of ${routes.length}`);

  const routedBefore = (p) => {
    const i = routes.findIndex((src) => {
      if (src === p) return true;
      if (!src.includes('(')) return false;
      try { return new RegExp('^' + src + '$').test(p); } catch { return false; }
    });
    return i !== -1 && (catchAllAt === -1 || i < catchAllAt);
  };

  const shared = fs.readdirSync(PUBLIC).filter((f) => /^buildable-.*\.js$/.test(f)).sort();
  const pages = fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html')).sort();

  const missingShared = shared.filter((f) => !routedBefore('/' + f));
  if (missingShared.length) add('FAIL', 'every public/buildable-*.js is routed', missingShared.join(', ') + ' would be served as landing.html');
  else add('PASS', 'every public/buildable-*.js is routed', `${shared.length} shared scripts`);

  // landing.html is the catch-all's own destination, so it is reached without a
  // route of its own. Everything else needs one or it silently becomes landing.
  const missingPages = pages.filter((f) => f !== 'landing.html' && !routedBefore('/' + f));
  if (missingPages.length) add('FAIL', 'every public/*.html is routed', missingPages.join(', ') + ' would be served as landing.html');
  else add('PASS', 'every public/*.html is routed', `${pages.length} pages`);

  return { rows, shared, pages, live: null };
}

// The live half: does production actually answer with the right thing? Needs
// real network, so it says SKIP loudly on a machine that cannot reach the site.
async function liveCheck(serving) {
  const SITE = OPT.site;
  const rows = [];
  const add = (status, what, detail) => {
    rows.push({ name: what, status, detail: detail || '' });
    process.stdout.write(`  ${paint(status.padEnd(7))} ${what}${detail ? C.d('  ' + detail) : ''}\n`);
  };
  process.stdout.write(C.b(`\nLIVE SERVING CHECK — what ${SITE} really returns\n`));

  const probe = await fetch(SITE + '/?stay=1').then((r) => r.status).catch(() => 0);
  if (probe === 403 || probe === 0) {
    const why = `cannot reach ${SITE} from here (probe returned ${probe || 'no response'}) — run --live from CI, where the network is open`;
    process.stdout.write(`  ${paint('SKIP'.padEnd(7))} ${why}\n`);
    return { rows, skipped: why };
  }

  const looksHtml = (t) => /^\s*<!doctype html/i.test(t) || /^\s*<html/i.test(t);
  for (const f of serving.shared) {
    try {
      const r = await fetch(`${SITE}/${f}`, { headers: { 'Cache-Control': 'no-store' } });
      const body = await r.text();
      const ct = (r.headers.get('content-type') || '').split(';')[0];
      if (!r.ok) add('FAIL', `/${f} is served`, `HTTP ${r.status}`);
      else if (looksHtml(body) || /html/.test(ct)) add('FAIL', `/${f} is served as JavaScript`, `got ${ct}, ${body.length} bytes of HTML — the catch-all ate it`);
      else add('PASS', `/${f} is served as JavaScript`, `${ct}, ${body.length} bytes`);
    } catch (err) { add('FAIL', `/${f} is reachable`, String(err.message).split('\n')[0]); }
  }

  // A page that only ever renders the marketing site is indistinguishable from
  // a fall-through, so pages are checked by byte-identity against the landing.
  const landing = await fetch(SITE + '/?stay=1').then((r) => r.text()).catch(() => '');
  for (const f of serving.pages) {
    if (f === 'landing.html') continue;
    try {
      const t = await fetch(`${SITE}/${f}`, { headers: { 'Cache-Control': 'no-store' } }).then((r) => r.text());
      if (landing && t.length === landing.length) add('FAIL', `/${f} is its own page`, 'identical to landing.html — it is falling through the catch-all');
      else add('PASS', `/${f} is its own page`, `${t.length} bytes`);
    } catch (err) { add('FAIL', `/${f} is reachable`, String(err.message).split('\n')[0]); }
  }
  return { rows, skipped: null };
}

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
  let files = fs.readdirSync(ROOT).filter((f) => /^qa-.*\.mjs$/.test(f) && f !== 'qa-all.mjs').sort();
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

function writeReport(serving, liveRes, harnesses, pageRes, started) {
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

  if (serving) {
    const st = tally(serving.rows);
    L.push('## Serving check — every shipped file has a route in `vercel.json`');
    L.push('');
    L.push(`**${st.PASS || 0} pass · ${st.FAIL || 0} fail**`);
    L.push('');
    L.push('| Check | Result | Detail |');
    L.push('|---|---|---|');
    for (const r of serving.rows) L.push(`| ${r.name} | ${r.status} | ${r.detail.replace(/\|/g, '\\|')} |`);
    L.push('');
    if (liveRes && liveRes.skipped) {
      L.push(`### Live check — **SKIPPED**`);
      L.push('');
      L.push(liveRes.skipped);
      L.push('');
    } else if (liveRes) {
      const lt = tally(liveRes.rows);
      L.push(`### Live check — \`${OPT.site}\``);
      L.push('');
      L.push(`**${lt.PASS || 0} pass · ${lt.FAIL || 0} fail**`);
      L.push('');
      const bad = liveRes.rows.filter((r) => r.status === 'FAIL');
      if (bad.length) { for (const r of bad) L.push(`- ${r.name} — ${r.detail}`); L.push(''); }
    } else {
      L.push('The live check did not run. Add `--live` before a release.');
      L.push('');
    }
  }

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
  const serving = OPT.serving ? servingCheck() : null;
  const liveRes = serving && OPT.live ? await liveCheck(serving) : null;
  const harnesses = OPT.harnesses ? await machineSweep() : [];
  const pageRes = OPT.pages ? await pageSweep() : { skipped: null, rows: [] };

  writeReport(serving, liveRes, harnesses, pageRes, started);

  const st = tally(serving ? serving.rows : []);
  const lt = tally(liveRes && !liveRes.skipped ? liveRes.rows : []);
  const ht = tally(harnesses);
  const pt = tally(pageRes.rows);
  const hardFails = (st.FAIL || 0) + (lt.FAIL || 0) + (ht.FAIL || 0) + (ht.TIMEOUT || 0) + (pt.FAIL || 0);
  const skipped = (pageRes.skipped ? 1 : 0) + (liveRes && liveRes.skipped ? 1 : 0);

  process.stdout.write(C.b('\n──────── QA SWEEP ────────\n'));
  if (serving) process.stdout.write(`serving     ${st.PASS || 0} pass · ${st.FAIL || 0} fail\n`);
  if (serving) {
    process.stdout.write(liveRes
      ? (liveRes.skipped ? `live        ${C.y('SKIPPED')} — could not reach ${OPT.site}\n`
                         : `live        ${lt.PASS || 0} pass · ${lt.FAIL || 0} fail  ${C.d(OPT.site)}\n`)
      : `live        ${C.d('not run — add --live before a release')}\n`);
  }
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
