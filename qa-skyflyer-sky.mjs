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
import { createRequire } from 'node:module';
const require_ = createRequire(process.cwd() + '/');
const { chromium } = require_('playwright-core');
import fs from 'node:fs';

const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.SKY_BASE || 'http://127.0.0.1:8899';
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
console.log('wrote', OUT + '/sky-' + world + '-*.png');
