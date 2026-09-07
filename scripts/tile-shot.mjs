// scripts/tile-shot.mjs — the Tile Shots camera (Sessions TS0-TS3).
//
// Opens each game in a real browser, gets it into a good-looking moment of real
// play, and saves a 1200x900 picture of the canvas. That picture is what a game
// tile shows instead of the AI painting it shows today.
//
//   node scripts/tile-shot.mjs                     # every game in the table
//   node scripts/tile-shot.mjs survival breaker    # just these
//   node scripts/tile-shot.mjs --no-wash           # also shoot the plain version
//   node scripts/tile-shot.mjs --zoom 2.9          # try a different crop
//   node scripts/tile-shot.mjs --out public/tile-shots
//
// TWO WAYS A GAME CAN BE PHOTOGRAPHED
//
//   mode "photo"  the game has its own ?tileshot=1 hook: it poses the scene to
//                 the recipe, holds still, and signals when it is ready. Total
//                 control, but it costs an edit inside that game.
//   mode "demo"   the game only has the ?screen=demo attract mode it already
//                 shipped with. The camera lets it play itself for a few
//                 seconds and then photographs it. NO game code changes at all.
//
// "demo" is the default, because the attract mode is real play — the honest
// thing a tile should show — and it scales to the whole catalogue for free.
// A game only earns a "photo" mode if its attract shot cannot be made to work.
//
// THE ZOOM IS DONE WITH THE VIEWPORT, NOT THE ENGINE
//
// Every engine sizes its world by the window's ASPECT, not its pixel size, so a
// 960x720 window shows exactly the same amount of world as a 600x450 one, just
// bigger. Shooting in a window scaled up by the zoom and then cropping the
// middle 600x450 back out is therefore a true crop into the same scene, at full
// resolution and with no engine change. Output is always 1200x900.
//
// It serves public/ itself and never touches the network, so it runs anywhere,
// and every pixel in a shot is the game's own art file on disk.
//
// It writes PNGs and NOTHING else. Swapping a tile's live art is a separate,
// deliberate step that only happens after Mike has approved the contact sheet.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);

/* ---------------------------------------------------------------------------
 * The catalogue. colour is the game's signature colour from GAME_CATALOG in
 * src/BuildableKids.jsx — the same colour as the dot beside its name on the
 * tile, so the wash and the dot always agree.
 *   warm  how long to let the attract mode play before the shutter (ms)
 *   zoom  how far to crop in; 1 is the whole screen
 *   focus where to centre the crop, as fractions of the screen (default middle)
 * ------------------------------------------------------------------------- */
const GAMES = [
  // TS0 — the two with a hand-posed photo mode
  { id: 'survival',    name: 'Survival',      url: '/survival-engine.html',  imgId: 'survival',    color: '#8A6BFF', mode: 'photo' },
  { id: 'castleguard', name: 'Castle Guard',  url: '/castle-guard.html',     imgId: 'castleguard', color: '#2E8B57', mode: 'photo' },
  // TS1 — action
  { id: 'skyflyer',    name: 'Sky Flyer',     url: '/skyflyer-engine.html',  imgId: 'skyflyer',    color: '#2FB7D6', warm: 6000, zoom: 1.5 },
  // Breaker letterboxes to a narrow play area, so a shallow crop catches black
  // bars down both sides. Crop hard into the bricks instead.
  { id: 'breaker',     name: 'Breaker',       url: '/breaker-engine.html',   imgId: 'breaker',     color: '#FF6B6B', warm: 6000, zoom: 2.1, focus: [0.5, 0.40] },
  { id: 'sling',       name: 'Sling Squad',   url: '/sling-squad.html',      imgId: 'sling',       color: '#7BD0FF', warm: 12000, zoom: 1.7, focus: [0.44, 0.60] },
  { id: 'bubble',      name: 'Bubble Buddies',url: '/bubble-engine.html',    imgId: 'bubble',      color: '#5BC0EB', warm: 10000, zoom: 2.0, focus: [0.5, 0.30] },
  // its mission banner is painted ON the canvas, so it has to be cropped out
  { id: 'croctot',     name: 'Croc Tot',      url: '/croctot.html',          imgId: 'croctot',     color: '#3AA655', warm: 9000, zoom: 1.7, focus: [0.5, 0.38] },
  { id: 'rileys',      name: "Riley's Garden",url: '/rileys-garden.html',    imgId: 'rileys',      color: '#4CAF50', warm: 20000, zoom: 1.5, focus: [0.5, 0.62] },
  // TS2 — sports, arcade, learning
  { id: 'tumble',      name: 'Tumble Blocks', url: '/tumble-engine.html',    imgId: 'tetris',      color: '#67C7FF', warm: 9000, zoom: 2.2, focus: [0.42, 0.58] },
  { id: 'stringmatch', name: 'String Match',  url: '/string-match.html',     imgId: 'stringmatch', color: '#57A93F', warm: 7000, zoom: 1.0, mode: 'dom' },
  // the question prompt is painted across the top, so the crop sits low
  { id: 'mathcannon',  name: 'Math Cannon',   url: '/mathcannon-engine.html',imgId: 'mathcannon',  color: '#F4A63B', warm: 7000, zoom: 1.15, focus: [0.5, 0.50] },
  { id: 'typing',      name: 'Typing',        url: '/typing.html',           imgId: 'typing',      color: '#1FA897', warm: 7000, zoom: 1.7, focus: [0.5, 0.52], mode: 'dom' },
  { id: 'mahjong',     name: 'Mahjong',       url: '/mahjong-engine.html',   imgId: 'mahjong',     color: '#F0B429', warm: 6000, zoom: 1.3 },
  // TS3 — boards and classics (the ones that already attract-play)
  { id: 'checkers',    name: 'Checkers',      url: '/buildable-checkers.html', imgId: 'checkers',  color: '#8E6BFF', warm: 9000, zoom: 1.55, focus: [0.5, 0.58], mode: 'dom' },
  { id: 'memory',      name: 'Memory Match',  url: '/memory-engine.html',    imgId: 'memory',      color: '#A78BFF', warm: 7000, zoom: 1.25 },
  // These four have no attract mode, but they DO expose the QA hook their test
  // harness drives, so the camera plays a few moves itself and photographs the
  // board mid-game. Still real play, still no changes inside the game.
  { id: 'tennis',      name: 'Tennis',        url: '/tennis.html',           imgId: 'tennis',      color: '#34D399', mode: 'drive', zoom: 1.25,
    // long enough for the "slide to move" tutorial to clear and a rally to start
    drive: "TENNIS_GAME._begin(1); TENNIS_GAME._step(700); TENNIS_GAME._draw();" },
  { id: 'tictactoe',   name: 'Tic-Tac-Toe',   url: '/tictactoe-engine.html', imgId: 'tictactoe',   color: '#5B8CFF', mode: 'drive', zoom: 1.15, plies: 5 },
  { id: 'connectfour', name: 'Connect Four',  url: '/connectfour-engine.html', imgId: 'connectfour', color: '#FF5A6E', mode: 'drive', zoom: 1.15, plies: 16 },
  { id: 'dotsboxes',   name: 'Dots and Boxes',url: '/dotsboxes-engine.html', imgId: 'dotsboxes',   color: '#36D6C3', mode: 'drive', zoom: 1.15, plies: 30 },
];

// The board engines all expose the same control surface to their QA harness:
// moves() lists what is legal, _play(t) makes one, _draw() repaints. Playing a
// fixed number of moves with a fixed pick order gives the same believable
// mid-game board every run. (_ai() alone does nothing in a two-player game,
// which is why the first attempt photographed empty boards.)
const boardDriver = (plies) => `
  BUILDABLE_GAME._begin('two');
  for (var i = 0; i < ${plies}; i++) {
    var m = BUILDABLE_GAME.moves();
    if (!m || !m.length) break;
    BUILDABLE_GAME._play(m[(i * 7 + 3) % m.length]);
  }
  BUILDABLE_GAME._draw();`;

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt  = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const OUT  = opt('--out', 'qa-shots/tiles');
const ZOOM = opt('--zoom', null);
const only = args.filter((a) => !a.startsWith('--') && !OUT.endsWith(a) && a !== ZOOM);
const W = 600, H = 450, SCALE = 2;      // crop window; output is always 1200x900

/* ---- Playwright: local, then the globally installed one. Skips loudly. ---- */
let chromium = null;
for (const spec of ['playwright', 'playwright-core']) {
  try { chromium = require(spec).chromium; if (chromium) break; } catch (e) { /* next */ }
}
if (!chromium) {
  try { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; }
  catch (e) { /* still none */ }
}
if (!chromium) {
  console.log('SKIP  Playwright is not installed - no tile shots taken.');
  process.exit(0);
}

/* ---- serve public/ ourselves; /api/* answers empty so nothing waits ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.css': 'text/css', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
let missed = [];
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(204).end(); return; }
  try {
    const body = fs.readFileSync(path.join('public', p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { missed.push(p); res.writeHead(404).end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

/* ---- everything on the page that is not the canvas, hidden ----------------
 * A tile shows the GAME, never the app around it. Element screenshots still
 * catch anything sitting on top of the canvas, so the Home/Sound nav and every
 * hint or overlay has to go before the shutter. Games with their own photo mode
 * do this themselves (buildable-tileshot.js); for attract-mode games the camera
 * does it from out here, so the game needs no changes at all. */
const HIDE_FLOATERS = `(() => {
  // No canvas to isolate, so hide what floats: the shared Home/Sound nav and any
  // other pinned overlay. The board itself is in the normal page flow and stays.
  for (const el of document.body.querySelectorAll('*')) {
    const p = getComputedStyle(el).position;
    if (p === 'fixed' || p === 'sticky') { try { el.style.setProperty('display', 'none', 'important'); } catch (e) {} }
  }
  return 'ok';
})()`;

const HIDE_CHROME = `(() => {
  const cv = document.querySelector('canvas');
  if (!cv) return 'no canvas';
  for (const el of document.body.querySelectorAll('*')) {
    if (el === cv || el.contains(cv)) continue;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
    try { el.style.setProperty('display', 'none', 'important'); } catch (e) {}
  }
  try { document.body.style.setProperty('background', '#000', 'important'); } catch (e) {}
  return 'ok';
})()`;

/* ---- the signature-colour wash, painted over the canvas as a plain element -
 * Same recipe as buildable-tileshot.js: the game's own colour rising out of the
 * bottom edge, so the picture is bound to the colour dot beside its name. */
const washScript = (hex) => `(() => {
  const m = /^#?([0-9a-f]{6})$/i.exec(${JSON.stringify(hex)});
  if (!m) return 'no colour';
  const n = parseInt(m[1], 16);
  const rgb = ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;' +
    'background:linear-gradient(to top, rgba(' + rgb + ',0.80) 0%, rgba(' + rgb + ',0.38) 22%, rgba(' + rgb + ',0) 70%)';
  document.body.appendChild(d);
  return 'ok';
})()`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const shots = [];
let failed = 0;

for (const g of GAMES) {
  if (only.length && !only.includes(g.id)) continue;
  const zoom = ZOOM ? +ZOOM : (g.zoom || 1);
  let variants = [['', true]];
  if (flag('--no-wash')) variants = [['', true], ['-nowash', false]];
  if (ZOOM) variants = [['-z' + ZOOM, true]];

  for (const [suffix, wash] of variants) {
    const label = g.id + suffix;
    // Shoot in a window scaled up by the zoom, then crop the middle back out.
    const vw = Math.round(W * zoom), vh = Math.round(H * zoom);
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: SCALE });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
    missed = [];
    try {
      if (g.mode === 'photo') {
        // The game poses itself and says when it is holding still.
        await page.goto(`${base}${g.url}?tileshot=1${wash ? '' : '&wash=0'}&zoom=${zoom}`, { waitUntil: 'load', timeout: 25000 });
        await page.waitForFunction('window.TILESHOT_READY === true', null, { timeout: 25000 });
      } else {
        // "demo": the game plays itself and we watch. "drive": no attract mode,
        // so the camera plays a few moves through the game's own QA hook and
        // photographs the board mid-game. Either way the game is unchanged.
        await page.goto(`${base}${g.url}${g.mode === 'drive' ? '' : '?screen=demo'}`, { waitUntil: 'load', timeout: 25000 });
        const driver = g.drive || (g.plies ? boardDriver(g.plies) : null);
        if (driver) {
          await page.waitForTimeout(1200);                 // let the engine boot
          const out = await page.evaluate(`(() => { try { ${driver} return 'ok'; }
            catch (e) { return 'ERR ' + (e && e.message || e); } })()`);
          if (String(out).startsWith('ERR')) throw new Error(out);
          await page.waitForTimeout(400);
        }
        await page.waitForTimeout(g.warm || (g.mode === 'drive' ? 600 : 6000));
        const hid = await page.evaluate(g.mode === 'dom' ? HIDE_FLOATERS : HIDE_CHROME);
        if (hid !== 'ok') throw new Error('could not find a canvas to photograph');
        if (wash) await page.evaluate(washScript(g.color));
        await page.waitForTimeout(120);          // one more painted frame
      }
      // A photo-mode game applies its own crop, so it is shot whole.
      const fx = g.focus ? g.focus[0] : 0.5, fy = g.focus ? g.focus[1] : 0.5;
      const clip = g.mode === 'photo'
        ? undefined
        : { x: Math.max(0, Math.round(vw * fx - W / 2)), y: Math.max(0, Math.round(vh * fy - H / 2)), width: W, height: H };
      const file = path.join(OUT, label + '.png');
      if (clip) await page.screenshot({ path: file, clip });
      else await page.locator('canvas').first().screenshot({ path: file });
      const kb = Math.round(fs.statSync(file).size / 1024);
      shots.push({ id: g.id, name: g.name, imgId: g.imgId, color: g.color, label, file, kb, mode: g.mode || 'demo' });
      console.log(`OK    ${label.padEnd(20)} ${String(kb).padStart(4)} KB  ${g.mode || 'demo'}  zoom ${zoom}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${label.padEnd(20)} ${String(e.message).split('\n')[0].slice(0, 100)}`);
    }
    if (errs.length) console.log('      page errors: ' + [...new Set(errs)].slice(0, 2).join(' | '));
    const gone = [...new Set(missed)].filter((m) => !m.startsWith('/favicon'));
    if (gone.length) console.log('      missing files: ' + gone.slice(0, 5).join(' '));
    await page.close();
  }
}

await browser.close();
server.close();
// Shooting a subset must not wipe the rest of the contact sheet, so merge with
// whatever the last run left behind.
const manifest = path.join(OUT, 'shots.json');
let all = [];
try { all = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch (e) { all = []; }
for (const s of shots) {
  const i = all.findIndex((x) => x.label === s.label);
  if (i >= 0) all[i] = s; else all.push(s);
}
all = all.filter((s) => fs.existsSync(path.join(OUT, s.label + '.png')));
fs.writeFileSync(manifest, JSON.stringify(all, null, 2));
console.log(`\n${shots.length} shot(s) written to ${OUT}/, ${failed} failed.`);
console.log('Nothing has been swapped into the live tiles. Open /tile-shots.html to review.');
process.exit(failed ? 1 : 0);
