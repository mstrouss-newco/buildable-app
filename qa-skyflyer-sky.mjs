// FL8 SKY LOOK GATE — LOOK RULE 19, pointed at the sky instead of the land.
// Clouds and sun rays are pure LOOK: there is no number that tells you a cloud
// reads as vapour rather than as a bag of marbles, or that a ray fan reads as
// air rather than as a comic-book starburst. Both of those were the FIRST build
// this session and both were only visible in a picture. So this script parks six
// cameras in a chosen world and shoots them, and prints SKY.sky() beside them.
//
//   npm i --no-save playwright-core        (it is NOT a repo dep)
//   (cd public && python3 -m http.server 8899)
//   node qa-skyflyer-sky.mjs                     # sunny-islands
//   node qa-skyflyer-sky.mjs snowy-peaks         # or sunset-canyon
//
// Run it FROM the repo directory — node resolves playwright-core from cwd.
// GOTCHA (AR1M, still true): a parked frame does NOT survive to the next
// Claude-in-Chrome tool call. Park and shoot in the SANDBOX.
import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import { qaBase } from './scripts/qa-serve.mjs';
const require_ = createRequire(process.cwd() + '/');
// playwright-core is NOT a repo dep, so `npm ci` takes it away again every time.
// Try the repo, then the machine-wide install the other harnesses fall back to,
// and if neither is there SAY SO in one plain line instead of throwing a module
// resolution stack at somebody reading a QA report.
let chromium = null;
for (const spec of ['playwright-core', 'playwright',
                    '/opt/node22/lib/node_modules/playwright/index.js']) {
  try { chromium = require_(spec).chromium; break; } catch (e) { /* keep trying */ }
}
if (!chromium) {
  console.log('FAIL  this gate could run  ::  no playwright here — `npm i --no-save playwright`');
  process.exit(1);
}
import fs from 'node:fs';

// A pinned build number goes stale the day the image is rebuilt. Take the one
// that is actually on disk, and let playwright pick for itself if none matches.
const CHROME = process.env.PW_CHROME || (function () {
  const roots = ['/opt/pw-browsers'];
  for (const root of roots) {
    let names = [];
    try { names = fsSync.readdirSync(root); } catch (e) { continue; }
    for (const n of names.filter((x) => /^chromium-/.test(x)).sort().reverse()) {
      for (const tail of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = root + '/' + n + '/' + tail;
        try { if (fsSync.existsSync(p)) return p; } catch (e) {}
      }
    }
  }
  return undefined;               // undefined means "playwright, you choose"
})();
// FL-GATE PLUMBING (QA57): this used to require somebody to have run
// `python3 -m http.server 8899` in another window first, and died with
// ERR_CONNECTION_REFUSED when nobody had — which in qa-all.mjs reads exactly
// like a broken game and is not one. It now serves public/ itself if nothing is
// already answering, the way every other harness in this repo does.
const SERVER = await qaBase();
const BASE = SERVER.base;
const OUT = process.env.SHOT_DIR || '/tmp/shots';
const world = process.argv[2] || 'sunny-islands';
fs.mkdirSync(OUT, { recursive: true });

// The sun lives at plane + (280,170,-560), so "into the sun" is a real aim and
// not a guess. Everything else is a camera a kid actually gets: the low close
// one Mike judges from, the cruise, level with the cloud band, and above it.
const CAMS = [
  ['a-low-close',     [0, 22, 120],   [0, 16, -40]],
  ['b-into-the-sun',  [-60, 40, 140], [280, 170, -560]],
  ['c-cruise',        [0, 58, 200],   [0, 46, -260]],
  ['d-in-the-clouds', [0, 118, 240],  [40, 112, -300]],
  ['e-above',         [0, 210, 260],  [0, 60, -320]],
  ['f-away-from-sun', [0, 70, -160],  [-260, 60, 420]],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 620 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

// mode=free keeps the job beams and the offer card out of the sky pictures.
await page.goto(`${BASE}/skyflyer-engine.html?level=${world}&mode=free`, { waitUntil: 'load' });
await page.waitForFunction(() => window.SKY && window.SKY.sky, null, { timeout: 60000 });
await page.waitForTimeout(3500);                       // let the model kit land
await page.evaluate(() => {
  document.querySelectorAll('.ov,#hud,#start,#takeoff,#chips,#hudwrap')
    .forEach(e => e.style.display = 'none');
});

const sky = await page.evaluate(() => window.SKY.sky());
console.log(world, 'SKY.sky() =', JSON.stringify(sky));
if (sky.raySep !== null && !(sky.raySep > sky.glowSep && sky.glowSep > 0))
  console.log('  !! THE PINWHEEL TRAP: rays/halo are not behind the disc');

for (const [name, pos, at] of CAMS) {
  // look() parks the camera, freezes the loop, re-faces the cloud billboards
  // for THIS camera and draws one frame.
  const info = await page.evaluate(([p, a]) => window.SKY.look(p, a), [pos, at]);
  await page.screenshot({ path: `${OUT}/sky-${world}-${name}.png`, timeout: 90000, animations: 'disabled' });
  console.log(' ', name, JSON.stringify(info));
  await page.evaluate(() => window.SKY.release());
  await page.waitForTimeout(120);
}
await browser.close();
SERVER.close();
console.log('wrote', OUT + '/sky-' + world + '-*.png');
