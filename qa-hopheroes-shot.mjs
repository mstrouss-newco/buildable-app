// qa-hopheroes-shot.mjs — drive Hop Heroes in a REAL browser: play it with the keyboard
// and with the on-screen pad, then write pictures of the level so a human can look at it.
//
// qa-hopheroes.mjs proves the rules hold. It cannot tell you whether a hole looks like a
// hole, whether the coins read as gold rather than orange, or whether the bar across the
// top is legible on a pale sky. This can.
//
// Separate from qa-hopheroes.mjs on purpose — that one must stay dependency-free and
// always runnable. This needs Playwright and SKIPS loudly without it, so it can never be
// the reason a session claims a check it did not really run. qa-all.mjs recognises the
// word "playwright" below and leaves this out unless you pass --with-browser.
//
// NOTE ON THE ART: play.html loads the hero, the world pieces and the props from
// www.buildablekids.com. On a machine with no route to that host every one of them 404s
// and the engine's drawn fallbacks stand in. The layout, the holes, the platforms, the
// HUD and the screen fit are all still real; the watercolour is not there. The script
// says so at the end rather than letting a screenshot quietly misrepresent the game.
//
//   node qa-hopheroes-shot.mjs                  # writes to qa-shots/
//   node qa-hopheroes-shot.mjs --out /tmp/x
import fs from 'fs';
import path from 'path';
import http from 'http';

const args = process.argv.slice(2);
const OUT = (() => { const i = args.indexOf('--out'); return i >= 0 && args[i + 1] ? args[i + 1] : 'qa-shots'; })();

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { try { ({ chromium } = await import('playwright')); } catch {} }
if (!chromium) {
  console.log('SKIP  qa-hopheroes-shot needs Playwright, which is not installed.');
  console.log('SKIP  Install it (npm i -D playwright-core) and set BK_CHROME to a Chromium binary.');
  process.exit(0);
}

// Find a browser: an explicit BK_CHROME wins, then the image's prebuilt Chromium, then
// whatever Playwright manages itself.
const CANDIDATES = [process.env.BK_CHROME, '/opt/pw-browsers/chromium'].filter(Boolean);
const exe = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });

// --- serve public/ so play.html loads its sibling scripts the way the site does ---
const ROOT = path.resolve('public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') u = '/play.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise(res => srv.listen(0, res));
const PORT = srv.address().port;
const URL_ = `http://127.0.0.1:${PORT}/play.html`;

fs.mkdirSync(OUT, { recursive: true });
let browser;
try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
catch (e) {
  console.log('SKIP  could not launch Chromium: ' + String(e && e.message || e).split('\n')[0]);
  srv.close(); process.exit(0);
}

const errs = [], missingArt = new Set();
let fail = 0;
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  ' + detail : ''));
  if (!ok) fail++;
}

async function open(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
  page.on('console', m => {
    const txt = m.text();
    if (m.type() !== 'error') return;
    if (/Failed to load resource|ERR_|404/.test(txt)) { missingArt.add('remote art'); return; }
    errs.push(`${w}x${h} console: ${txt.slice(0, 200)}`);
  });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.BK_GAME');
  await page.locator('#howto').dispatchEvent('pointerdown');   // the Play button pulses, so never "stable"
  return page;
}

// ---------------------------------------------------------------- real input
console.log('--- playing it for real: keyboard, then the on-screen pad ---');
{
  const page = await open(1280, 800);
  const startX = (await page.evaluate(() => BK_GAME.dbg())).px;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
  const afterKeys = await page.evaluate(() => BK_GAME.dbg());
  check('the keyboard moves the hero right', afterKeys.px > startX + 60, `${startX} -> ${afterKeys.px}`);
  await page.keyboard.press('Space'); await page.waitForTimeout(90);
  check('the keyboard jumps', (await page.evaluate(() => BK_GAME.dbg())).onG === false);
  await page.waitForTimeout(900);

  const before = (await page.evaluate(() => BK_GAME.dbg())).px;
  const J = await page.locator('#djump').boundingBox();
  await page.mouse.move(J.x + J.width / 2, J.y + J.height / 2);
  await page.mouse.down(); await page.waitForTimeout(90);
  check('the on-screen JUMP pad jumps', (await page.evaluate(() => BK_GAME.dbg())).onG === false);
  await page.mouse.up(); await page.waitForTimeout(500);

  // Right pad: measure from a clear spot, because a pipe is a wall and stopping at one
  // is correct behaviour rather than a broken button.
  await page.evaluate(() => { BK_GAME.test.boot(0); BK_GAME.test.set({ x: 120 }); });
  const padStart = (await page.evaluate(() => BK_GAME.dbg())).px;
  const R = await page.locator('#dright').boundingBox();
  await page.mouse.move(R.x + R.width / 2, R.y + R.height / 2);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  const padEnd = (await page.evaluate(() => BK_GAME.dbg())).px;
  check('the on-screen right pad moves the hero', padEnd > padStart + 40, `${padStart} -> ${padEnd}`);
  await page.close();
}

// ---------------------------------------------------------------- the pictures
console.log('--- pictures ---');
const SHOTS = [
  { name: '1-start',        frames: 40,   w: 1440, h: 900, what: 'the start of the level' },
  { name: '2-pit',          frames: 330,  w: 1440, h: 900, what: 'a hole' },
  { name: '3-blocks',       frames: 900,  w: 1440, h: 900, what: 'a two-tier climb and a block row' },
  { name: '4-pole',         frames: 2870, w: 1440, h: 900, what: 'the boss, the flag pole and the win card' },
  { name: '5-phone-start',  frames: 40,   w: 390,  h: 844, what: 'the start, phone width' },
  { name: '6-phone-pit',    frames: 330,  w: 390,  h: 844, what: 'a hole, phone width' },
];
for (const s of SHOTS) {
  const page = await open(s.w, s.h);
  await page.evaluate(n => { BK_GAME.setBot(true); BK_GAME.frameStep(n); }, s.frames);
  await page.screenshot({ path: path.join(OUT, `hopheroes-${s.name}.png`) });
  console.log(`      hopheroes-${s.name}.png  ${s.w}x${s.h}  ${s.what}`);
  await page.close();
}

await browser.close();
srv.close();

console.log('--- page errors ---');
check('the engine threw nothing at any size', errs.length === 0, errs.slice(0, 6).join(' | '));
if (missingArt.size) {
  console.log('NOTE  the watercolour art did not load (no route to www.buildablekids.com from here),');
  console.log('NOTE  so the pictures show the engine\'s drawn fallbacks in its place.');
}
console.log(fail === 0 ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(fail === 0 ? 0 : 1);
