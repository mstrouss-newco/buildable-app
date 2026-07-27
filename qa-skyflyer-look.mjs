// AR1R LOOK GATE — LOOK RULE 19. The offer card is a LAYOUT change, which is
// exactly the class of bug a picture catches and a code review does not. AR1Q
// shipped two things Mike rejected on sight, and one of them was this card, which
// no screenshot had ever opened: every QA camera used mode=free, and mode=free
// suppresses the offer. So this script FORCES the card open and shoots it at
// phone, tablet and desktop widths, and prints the measured shape next to it.
// Resolve playwright-core from wherever it is installed (it is NOT a repo dep):
//   npm i --no-save playwright-core   and run this FROM the repo directory.
// Serve public/ first:  (cd public && python3 -m http.server 8899)
import { createRequire } from 'node:module';
const require_ = createRequire(process.cwd() + '/');
const { chromium } = require_('playwright-core');
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.SKY_BASE || 'http://127.0.0.1:8899';
const OUT = process.env.SHOT_DIR || '/tmp/shots';

import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'phone',   w: 390, h: 704 },
  { name: 'tablet',  w: 820, h: 1024 },
  { name: 'desktop', w: 1280, h: 800 },
];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

for (const S of SIZES) {
  const page = await browser.newPage({ viewport: { width: S.w, height: S.h } });
  page.on('pageerror', e => console.log('  PAGE ERROR', S.name, e.message));
  await page.goto(BASE + '/skyflyer-engine.html?v=ar1r&level=0', { waitUntil: 'load' });
  await page.waitForFunction('window.SKY && SKY.state', null, { timeout: 30000 });
  // park the plane where a job is waiting to be found, and let the game's own
  // loop do the offering — the card must come up the way a kid gets it
  await page.evaluate(() => { const s = SKY.state; s.pos.x = 0; s.pos.z = -60; s.pos.y = 30; s.yaw = 0; });
  await page.waitForFunction('SKY.offer().up === true', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1600);   // let the one-shot picture finish walking
  const info = await page.evaluate(() => ({ offer: SKY.offer(), card: SKY.offerCard() }));
  const sh = info.card && info.card.shape;
  console.log(`\n${S.name} ${S.w}x${S.h}  job=${info.offer.id}`);
  if (sh) console.log(`   card ${sh.w}x${sh.h}px  = ${(sh.w / sh.vw * 100).toFixed(0)}% wide, ${(sh.h / sh.vh * 100).toFixed(0)}% tall`
    + `  margins L${sh.left} R${sh.right} T${sh.top} B${sh.bottom}  radius ${sh.radius}`);
  await page.screenshot({ path: `${OUT}/offer-${S.name}.png` });
  // and the same card with the grown-up drawer open, which is its tallest state
  await page.evaluate(() => SKY.offerWords(true));
  await page.waitForTimeout(200);
  const sh2 = (await page.evaluate(() => SKY.offerCard())).shape;
  if (sh2) console.log(`   drawer open: ${sh2.w}x${sh2.h}px = ${(sh2.h / sh2.vh * 100).toFixed(0)}% tall`);
  await page.screenshot({ path: `${OUT}/offer-${S.name}-drawer.png` });
  await page.close();
}
await browser.close();
