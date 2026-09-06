// scripts/tile-shot.mjs — the Tile Shots camera (Session TS0).
//
// Opens each game in a real browser with its photo-mode flag (?tileshot=1),
// waits for the game to say the scene is posed and holding still, and saves a
// 1200x900 picture of the canvas. That picture is what a game tile will show
// instead of the AI painting it shows today.
//
//   node scripts/tile-shot.mjs                    # every game the rig knows
//   node scripts/tile-shot.mjs survival           # just one
//   node scripts/tile-shot.mjs --no-wash          # shoot the plain version too
//   node scripts/tile-shot.mjs --out qa-shots/tiles
//
// It serves public/ itself and never touches the network, so it runs anywhere.
// Every piece of art in the shot is the game's own file on disk.
//
// It writes PNGs and NOTHING else. Swapping a tile's live art is a separate,
// deliberate step that only happens after Mike has seen the contact sheet.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);

/* ---- the games that have a photo mode. TS1-TS3 add rows here. ---- */
const GAMES = [
  { id: 'survival',   name: 'Space Survival', url: '/survival-engine.html', imgId: 'survival',
    note: 'dark world' },
  { id: 'castleguard', name: 'Castle Guard',  url: '/castle-guard.html',    imgId: 'castleguard',
    note: 'bright world' },
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt  = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT  = opt('--out', 'qa-shots/tiles');
const only = args.filter((a) => !a.startsWith('--') && !OUT.endsWith(a));
// 4:3, the shape a game tile crops to. The page is laid out at half size and
// captured at 2x, so the file is exactly 1200x900 and still retina-crisp: the
// games cap their own canvas at 2x device pixels, so shooting bigger than this
// only inflates the file.
const WIDTH = 600, HEIGHT = 450, SCALE = 2;

/* ---- Playwright: local, then the globally installed one. Skips loudly. ---- */
let chromium = null;
for (const spec of ['playwright', 'playwright-core']) {
  try { chromium = require(spec).chromium; if (chromium) break; } catch (e) { /* next */ }
}
if (!chromium) {
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    chromium = require(path.join(root, 'playwright')).chromium;
  } catch (e) { /* still none */ }
}
if (!chromium) {
  console.log('SKIP  Playwright is not installed - no tile shots taken.');
  console.log('      Install it (npm i -D playwright) and run this again.');
  process.exit(0);
}

/* ---- serve public/ the way vercel.json does for these files ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.css': 'text/css', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
let missed = [];
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(204).end(); return; }   // no network in here
  const file = path.join('public', p);
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { missed.push(p); res.writeHead(404).end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const shots = [];
let failed = 0;

for (const g of GAMES) {
  if (only.length && !only.includes(g.id)) continue;
  const variants = flag('--no-wash') ? [['', ''], ['-nowash', '&wash=0']] : [['', '']];
  for (const [suffix, extra] of variants) {
    const label = g.id + suffix;
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    missed = [];
    try {
      await page.goto(base + g.url + '?tileshot=1' + extra, { waitUntil: 'load', timeout: 20000 });
      await page.waitForFunction('window.TILESHOT_READY === true', null, { timeout: 20000 });
      const canvas = await page.locator('canvas').first();
      const file = path.join(OUT, label + '.png');
      await canvas.screenshot({ path: file });
      const kb = Math.round(fs.statSync(file).size / 1024);
      shots.push({ ...g, label, file, kb });
      console.log(`OK    ${label.padEnd(18)} ${kb} KB  ${file}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${label.padEnd(18)} ${String(e.message).split('\n')[0].slice(0, 110)}`);
    }
    if (errs.length) console.log('      page errors: ' + [...new Set(errs)].slice(0, 3).join(' | '));
    const gone = [...new Set(missed)].filter((m) => !m.startsWith('/favicon'));
    if (gone.length) console.log('      missing files: ' + gone.slice(0, 6).join(' '));
    await page.close();
  }
}

await browser.close();
server.close();

fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots, null, 2));
console.log(`\n${shots.length} shot(s) written to ${OUT}/, ${failed} failed.`);
console.log('Nothing has been swapped into the live tiles. Open /tile-shots.html to review.');
process.exit(failed ? 1 : 0);
