// OPTIONAL live-DOM QA for the NV4 phone-width sweep.
//
// qa-nv4.mjs is the house-style harness and is the one that must pass. This
// one is the honesty check on top of it: it starts Vite in preview mode, opens
// each of the five bottom-bar tab addresses at iPhone width (390 x 844), and
// asserts what a kid on a real phone would actually see:
//
//   - No page scrolls sideways (document.scrollWidth === clientWidth).
//   - Every page has more content than fits on one screen (scrollHeight >
//     clientHeight), so the bottom of the viewport is a real cut-off row cue.
//   - No Coming Soon tile appears above a real (non-soon) tile in the same
//     grid — reads the actual DOM order at 390px, not the source sort.
//   - Screenshots for all five pages land in qa/nv4/ so the owner can eyeball
//     the sweep.
//
// It needs Playwright (same pattern as qa-lessons-dom.mjs). If Playwright is
// not installed it SKIPS loudly and exits 0 — this harness must never be the
// reason a session claims a failure it did not really see.
//
//   node qa-nv4-dom.mjs .
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

const dir = process.argv[2] || '.';

let chromium = null;
const PW_SPECS = ['playwright', 'playwright/index.js',
  '/home/claude/.npm-global/lib/node_modules/playwright/index.js'];
for (const spec of PW_SPECS) {
  try {
    const m = await import(spec);
    chromium = m.chromium || (m.default && m.default.chromium) || null;
    if (chromium) break;
  } catch (e) { /* try next */ }
}
if (!chromium) {
  console.log('SKIP  Playwright not installed - live-DOM sweep did not run (qa-nv4.mjs is the required harness)');
  process.exit(0);
}

// Check for a Vite build. If dist/ is missing, skip loudly — building here
// would slow the autopilot loop; the source harness has already verified the
// nav wiring, and the dev server or a real preview URL is where a person
// would look at pixels.
const distDir = path.join(dir, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.log('SKIP  no dist/index.html (run `npm run build` first) - live-DOM sweep did not run');
  process.exit(0);
}

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

// Serve dist/ ourselves with the tiny vercel-like rules NV4 depends on:
// /app/... falls through to index.html so the SPA can route it.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const publicRoot = path.join(dir, 'public');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  // Stub the two Kids APIs we may touch — never let a headless sweep call
  // the live backend. Anything unknown gets 404 quietly.
  if (u.pathname === '/api/kid-game-stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, games: [] }));
  }
  if (u.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":true}');
  }
  // /app/... -> index.html (SPA), matching vercel.json.
  const isAppRoute = u.pathname === '/app' || u.pathname.startsWith('/app/');
  let rel = isAppRoute ? '/index.html' : u.pathname;
  // Try dist/ first (bundled assets), then public/ (static kids assets).
  let file = path.resolve(distDir, '.' + rel);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.resolve(publicRoot, '.' + rel);
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

const PW_EXE = process.env.PW_CHROMIUM || '';
const browser = await chromium.launch(PW_EXE ? { executablePath: PW_EXE } : {});

const outDir = path.join(dir, 'qa', 'nv4');
fs.mkdirSync(outDir, { recursive: true });

async function sweepOne({ label, url }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    // Stamp a kid profile so the Me tab has an initial + gradient to render,
    // and so screens gated on a kid don't fall back to the grown-ups picker.
    localStorage.setItem('bk_active_kid_v1', JSON.stringify({
      id: 'qa-nv4-kid', display_name: 'Qa', grade: '1',
    }));
  });
  // Block any request that leaves our own origin (fonts, images, telemetry).
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return u.startsWith(base) ? route.continue() : route.abort();
  });
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  // Wait for the shell + the bottom bar (proof the React tree mounted).
  await page.waitForSelector('[data-nv1-bottom-bar]', { timeout: 15000 }).catch(() => {});

  const dims = await page.evaluate(() => ({
    scrollWidth:  document.documentElement.scrollWidth,
    clientWidth:  document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    barPresent:   !!document.querySelector('[data-nv1-bottom-bar]'),
  }));

  // A soon tile must never appear above a live tile in the SAME grid.
  const soonOrder = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll(
      '[data-nv1-grid], [data-nv3-make-grid], [data-nv3-labs-grid], [data-nv3-books-grid], [data-nv2-doors]'
    ));
    const bad = [];
    for (const grid of grids) {
      const tiles = Array.from(grid.querySelectorAll('[data-soon], [data-explore-id]'));
      let sawSoon = false;
      for (const t of tiles) {
        const isSoon = t.getAttribute('data-soon') === '1';
        if (isSoon) sawSoon = true;
        else if (sawSoon) bad.push(t.getAttribute('data-game-id') || t.getAttribute('data-make-id') || t.getAttribute('data-explore-id') || 'tile');
      }
    }
    return bad;
  });

  // Cap horizontal shelves at 8 items — no row longer than 8 cards before
  // a See All. Wrapping grids are exempt (they paginate down the viewport).
  const shelvesTooLong = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[data-nv2-suggested]'));
    return rows.map((r) => r.children.length).filter((n) => n > 8);
  });

  const shot = path.join(outDir, label + '.png');
  await page.screenshot({ path: shot, fullPage: false });
  await page.close();
  return { dims, soonOrder, shelvesTooLong, shot };
}

const PAGES = [
  { label: 'home',    url: '/app' },
  { label: 'play',    url: '/app/play' },
  { label: 'make',    url: '/app/make' },
  { label: 'explore', url: '/app/explore' },
  { label: 'me',      url: '/app/me' },
];

for (const p of PAGES) {
  console.log('--- ' + p.label + ' (' + p.url + ') ---');
  const r = await sweepOne(p);
  chk(p.label + ' rendered the bottom bar', r.dims.barPresent);
  chk(p.label + ' does not scroll sideways',
    r.dims.scrollWidth === r.dims.clientWidth,
    'sw=' + r.dims.scrollWidth + ' cw=' + r.dims.clientWidth);
  chk(p.label + ' has a bottom cut-off cue (content taller than viewport)',
    r.dims.scrollHeight > r.dims.clientHeight,
    'sh=' + r.dims.scrollHeight + ' ch=' + r.dims.clientHeight);
  chk(p.label + ' has no Coming Soon tile above a real one',
    r.soonOrder.length === 0,
    'offenders=' + JSON.stringify(r.soonOrder));
  chk(p.label + ' shelves are all <= 8 items before See All',
    r.shelvesTooLong.length === 0,
    'tooLong=' + JSON.stringify(r.shelvesTooLong));
  console.log('  screenshot -> ' + r.shot);
}

await browser.close();
server.close();

console.log('---');
console.log(ok ? 'ALL LIVE-DOM CHECKS PASSED' : 'SOME LIVE-DOM CHECKS FAILED');
process.exit(ok ? 0 : 1);
