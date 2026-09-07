// PB-FIX HUD GATE — Paper Route's top bar, MEASURED in a real Chromium phone.
//
// The bug this exists to stop: Mike played the shipped game on his phone and the
// four chips (Maple Street, Papers, Delivered, Coins) did not fit 390px. The coin
// count was cut off the right edge and the street name was clipped on the left.
// Nothing in the headless harness could ever see that, because it needs real CSS
// layout at a real phone width, inside the app shell's iframe, with the shell's
// Home and Sound columns already eating into the width.
//
// So this script opens the real engine at 320, 390 and 430 CSS pixels, twice each
// (standalone, and inside an iframe so the shared HUD switches to its in-shell
// insets), starts a real ride, and measures every chip against the canvas.
//
//   npm i --no-save playwright-core
//   node qa-paper-route-hud.mjs           # run FROM the repo directory
//
// It serves public/ itself, so nothing has to be started by hand and nothing extra
// is committed into public/. qa-all.mjs sees the word "playwright" below and leaves
// this out of the no-browser gate unless you pass --with-browser.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const dir = process.env.PR_DIR || '.';
const ROOT = path.resolve(dir, 'public');

let chromium;
const require_ = createRequire(process.cwd() + '/');
for (const spec of ['playwright-core', 'playwright']) {
  try { ({ chromium } = require_(spec)); break; } catch {}
}
if (!chromium) {
  console.log('SKIP  the HUD robot could not run  ::  playwright is not installed here');
  console.log('SKIP  Install it (npm i --no-save playwright-core) and try again.');
  process.exit(0);
}
const CHROME = process.env.PR_CHROME || [
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].find((p) => fs.existsSync(p));

let fails = 0;
const ok = (name, pass, extra = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
  if (!pass) fails++;
};

// ---------------------------------------------------------------- the server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.ico': 'image/x-icon' };
// the shell stand-in: the engine in an iframe, exactly as BuildableKids.jsx embeds it,
// which is what makes the shared HUD use its in-shell insets
const SHELL = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0f1b2a}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>
<iframe src="/paper-route-engine.html" allow="autoplay"></iframe>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/__qa_shell') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(SHELL); }
  const file = path.join(ROOT, url === '/' ? '/index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ---------------------------------------------------------------- the browser
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

// The phone widths that matter: the smallest phone still in use, the modern
// baseline Mike plays on, and the big one.
const WIDTHS = [320, 390, 430];
const errors = [];

async function measure(width, inShell) {
  const ctx = await browser.newContext({
    viewport: { width, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}${inShell ? ' in-shell' : ''}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${width}${inShell ? ' in-shell' : ''}: ${e.message}`));
  await page.goto(BASE + (inShell ? '/__qa_shell' : '/paper-route-engine.html'), { waitUntil: 'load' });

  const frame = inShell ? await (async () => {
    const h = await page.waitForSelector('iframe');
    return await h.contentFrame();
  })() : page.mainFrame();

  await frame.waitForFunction(() => !!window.BUILDABLE_GAME, null, { timeout: 15000 });
  // start a real (non-silent) ride, so the shared HUD mounts and shows its chips
  await frame.evaluate(() => { window.BUILDABLE_GAME.play(0, false); });
  await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const out = await frame.evaluate(() => {
    const bar = document.querySelector('.hud');
    const cv = document.getElementById('cv');
    const cr = cv.getBoundingClientRect();
    const groups = [...document.querySelectorAll('.hud-group')];
    const chips = [...document.querySelectorAll('.hud-chip')].map((c) => {
      const r = c.getBoundingClientRect();
      return { text: (c.textContent || '').trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, group: groups.indexOf(c.parentElement) };
    });
    const br = bar.getBoundingClientRect();
    const g = window.BUILDABLE_GAME.guide();
    return {
      canvas: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom, width: cr.width, height: cr.height },
      bar: { left: br.left, right: br.right, top: br.top, bottom: br.bottom },
      chips, inShell: bar.classList.contains('hud-inshell'),
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
      guide: g ? { arrow: g.arrow, ring: g.ring, nudge: g.nudge, dz: g.dz } : null,
      coinSVGs: document.querySelectorAll('.hud-coin').length,
      glyphSVGs: document.querySelectorAll('.hud-glyph').length,
    };
  });
  await ctx.close();
  return out;
}

for (const inShell of [false, true]) {
  console.log(`\n--- ${inShell ? 'INSIDE THE APP SHELL (Home + Sound columns taken)' : 'STANDALONE'} ---`);
  for (const width of WIDTHS) {
    const m = await measure(width, inShell);
    const tag = `${width}px${inShell ? ' in-shell' : ''}`;
    ok(`${tag}: the HUD is really the shared one, in the right mode`,
      m.chips.length >= 3 && m.inShell === inShell, `${m.chips.length} chips, inshell=${m.inShell}`);

    const overflowRight = m.chips.filter((c) => c.right > m.canvas.right + 0.5);
    const overflowLeft = m.chips.filter((c) => c.left < m.canvas.left - 0.5);
    ok(`${tag}: no chip runs off the right edge`, overflowRight.length === 0,
      overflowRight.map((c) => `"${c.text}" ends at ${c.right.toFixed(0)} > ${m.canvas.right.toFixed(0)}`).join(' | ') || 'all inside');
    ok(`${tag}: no chip runs off the left edge`, overflowLeft.length === 0,
      overflowLeft.map((c) => `"${c.text}" starts at ${c.left.toFixed(0)}`).join(' | ') || 'all inside');

    // the coin count is the one that was being cut off. It is the LAST chip of the
    // right-hand group, and it must be whole and on screen at every width.
    const rightGroup = Math.max(...m.chips.map((c) => c.group));
    const coin = m.chips.filter((c) => c.group === rightGroup).pop();
    ok(`${tag}: the coin chip exists and carries a number`, !!coin && /\d/.test(coin.text), coin && JSON.stringify(coin.text));
    ok(`${tag}: the WHOLE coin count is on screen`,
      !!coin && coin.left >= -0.5 && coin.right <= width + 0.5 && coin.width > 20,
      coin && `x ${coin.left.toFixed(0)}..${coin.right.toFixed(0)} of ${width}`);
    ok(`${tag}: the coin chip has its gold coin drawn beside it`, m.coinSVGs >= 1, `${m.coinSVGs} coins`);

    ok(`${tag}: the page itself never scrolls sideways`, m.docScrollW <= m.docClientW + 1,
      `${m.docScrollW} vs ${m.docClientW}`);
    // the bar must stay in the top strip and not creep down over the road
    const lowest = Math.max(...m.chips.map((c) => c.bottom));
    ok(`${tag}: the bar stays in the top strip, off the play area`, lowest < m.canvas.height * 0.22,
      `lowest chip at ${lowest.toFixed(0)} of ${m.canvas.height.toFixed(0)}`);
    // "fits" means ONE row: the numbers must not have to wrap down the screen
    const rows = new Set(m.chips.filter((c) => c.group === rightGroup).map((c) => Math.round(c.top)));
    ok(`${tag}: papers, delivered and coins all fit on ONE row`, rows.size === 1,
      `${rows.size} row(s) at y ${[...rows].join(',')}`);
    // a phone gets the icon-plus-number chips, so three numbers fit
    ok(`${tag}: a phone gets icon-plus-number chips instead of long words`, m.glyphSVGs >= 2, `${m.glyphSVGs} icons`);
    ok(`${tag}: the street name is still shown (trimmed, never dropped)`,
      m.chips.some((c) => c.group === 0 && c.width > 20), JSON.stringify(m.chips.filter((c) => c.group === 0).map((c) => c.text)));

    // and while we are in a real browser: the guidance layer really computes
    ok(`${tag}: the guidance arrow points at a red flag on the real page`,
      !!m.guide && !!m.guide.arrow && m.guide.arrow.x >= 0 && m.guide.arrow.x <= m.canvas.width,
      m.guide ? `arrow at ${m.guide.arrow.x.toFixed(0)},${m.guide.arrow.y.toFixed(0)} dz ${m.guide.dz.toFixed(0)}` : 'no guide');
  }
}

console.log('\n--- CONSOLE: a real phone run, with nothing thrown ---');
// /api/sfx and /api/... are serverless routes that do not exist under a static
// server, so their network 404s are expected here and are not page errors
const real = errors.filter((e) => !/api\/sfx|api\/list-audio|favicon|Failed to load resource/i.test(e));
ok('no console errors in a real Chromium phone run', real.length === 0, real.slice(0, 4).join(' | ') || 'clean');

await browser.close();
server.close();
console.log('\n' + (fails ? `${fails} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(fails ? 1 : 0);
