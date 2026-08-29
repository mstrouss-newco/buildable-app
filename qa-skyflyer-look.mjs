// FL6 LOOK GATE (was AR1R) — LOOK RULE 19. The offer card is a LAYOUT change, which is
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
  await page.goto(BASE + '/skyflyer-engine.html?v=fl7&level=0', { waitUntil: 'load' });
  await page.waitForFunction('window.SKY && SKY.state', null, { timeout: 30000 });
  // park the plane where a job is waiting to be found, and let the game's own
  // loop do the offering — the card must come up the way a kid gets it
  await page.evaluate(() => { const s = SKY.state; s.pos.x = 0; s.pos.z = -60; s.pos.y = 30; s.yaw = 0; });
  // FL15: the swoop raises a PILL. Shoot the pill, then tap it the way a kid
  // does - the card must never come up on its own any more.
  await page.waitForFunction('SKY.findPill().up === true', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  const pill = await page.evaluate(() => SKY.findPill());
  console.log(`\n${S.name} pill: up=${pill.up} job=${pill.id} icons=${pill.icons} "${pill.label}"`);
  await page.screenshot({ path: `${OUT}/findpill-${S.name}.png` });
  await page.evaluate(() => SKY.tapPill());
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

// ==========================================================================
//  FL6 — THE THINGS ONLY A PICTURE CAN CHECK.
//  A transform quest has two of them. The OFFER for one has to answer "what am
//  I saying yes to?" with a creature on the GO pill and a picture that runs the
//  other way round (collect from the many, take it to the one). And the BODY
//  itself is seen from an arm's length behind for the whole quest, which is far
//  too close to review in code — AR1R deleted a whole flock of birds for looking
//  like flying triangles, and no screenshot had ever been taken of them.
// ==========================================================================
const QUESTS = [
  { id:'busy-bee',          level:0, at:{ x:-420, z:-90  } },
  { id:'puffin-parent',     level:0, at:{ x: 430, z:-60  } },
  { id:'hummingbird-hover', level:2, at:{ x: 300, z:-120 } },
  // FL7. Each `at` is that quest's own start point, which for a gathering quest
  // is where it goes HOME to, not where it starts collecting.
  { id:'goose-squad',       level:1, at:{ x: -80, z:-490 } },
  { id:'owl-night-flight',  level:1, at:{ x:-300, z:-370 } },
  { id:'eagle-glider',      level:2, at:{ x: 100, z:-420 } },
];
for (const Q of QUESTS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 704 } });
  page.on('pageerror', e => console.log('  PAGE ERROR', Q.id, e.message));
  await page.goto(`${BASE}/skyflyer-engine.html?v=fl7&level=${Q.level}`, { waitUntil: 'load' });
  await page.waitForFunction('window.SKY && SKY.state', null, { timeout: 30000 });
  // park where the quest's beam is and let the game's own loop do the offering
  await page.evaluate(a => { const s = SKY.state; s.pos.x=a.x; s.pos.z=a.z; s.pos.y=20; s.yaw=0; }, Q.at);
  // FL15: swoop raises the pill, the tap opens the card
  await page.waitForFunction(`SKY.findPill().id === '${Q.id}'`, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => SKY.tapPill());
  await page.waitForFunction(`SKY.offer().id === '${Q.id}'`, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => ({ offer: SKY.offer(), card: SKY.offerCard() }));
  const sh = info.card && info.card.shape;
  console.log(`\n${Q.id} offer  found=${info.offer.id}`);
  if (sh) console.log(`   card ${sh.w}x${sh.h}px = ${(sh.w/sh.vw*100).toFixed(0)}% wide, ${(sh.h/sh.vh*100).toFixed(0)}% tall`
    + `  margins L${sh.left} R${sh.right}  radius ${sh.radius}`);
  if (info.card) console.log(`   picture: ${info.card.sceneStops} stops drawn   go pill svgs: ${info.card.go.ride}`);
  await page.screenshot({ path: `${OUT}/quest-offer-${Q.id}.png` });
  await page.close();
}
// and the body, from the chase camera, which is the only place it is ever seen
for (const Q of QUESTS) {
  const page = await browser.newPage({ viewport: { width: 760, height: 520 } });
  page.on('pageerror', e => console.log('  PAGE ERROR', Q.id, e.message));
  await page.goto(`${BASE}/skyflyer-engine.html?v=fl7&level=${Q.level}&mode=free&manual=1`, { waitUntil: 'load' });
  await page.waitForFunction('SKY.flying().loaded===true', null, { timeout: 30000 })
    .catch(() => console.log('  BODY GLB NEVER LOADED', Q.id));
  await page.evaluate(id => SKY.startMission(id), Q.id);
  await page.waitForFunction('SKY.flying().bodyUp===true', null, { timeout: 15000 })
    .catch(() => console.log('  BODY NEVER APPEARED', Q.id));
  // fly on until something is in hand, so what you carry is on show too
  await page.evaluate(() => { SKY.autopilot(true);
    for (let i=0;i<9000;i++){ SKY.tick(1/30); if (SKY.job().carrying>0) break; }
    SKY.autopilot(false); for (let i=0;i<10;i++){ SKY.tick(1/30); SKY.draw(1/30); } });
  const f = await page.evaluate(() => SKY.flying());
  console.log(`\n${Q.id} body   ${f.name} (${f.model})  ride parts hidden ${f.ridePartsHidden}/${f.rideParts}`
    + `   turns in ${f.feel.circle}u, camera ${f.feel.camBack}u back`);
  await page.screenshot({ path: `${OUT}/quest-body-${Q.id}.png`, timeout: 90000, animations: 'disabled' });
  await page.close();
}
await browser.close();
