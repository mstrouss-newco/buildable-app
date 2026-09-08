// Picture gate for THE FARM (LOOK RULE 19): render the real farm in the real
// engine and take the shots Mike judges, because he judges pictures and not
// descriptions.
//
// FM5's four: the welcome-back basket with what is in it floating above, the
// wrapped present in the shop, the reveal mid-confetti, and the shop at phone
// width. Written to qa/shots/ .
//
// Run:  node qa-farm-shot.mjs .
// Same rig as qa-farm.mjs: a real chromium on the software rasteriser, over a
// tiny static server, because the scene fetches a glb and file:// will not do.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const dir = process.argv[2] || '.';
const root = path.resolve(dir, 'public');
const outDir = path.resolve(dir, 'qa', 'shots');
let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try { chromium = createRequire(import.meta.url)(spec).chromium; break; } catch (e) { /* keep trying */ }
}
if (!chromium) {
  console.log('FAIL  the farm camera could run  ::  playwright not found — `npm i --no-save playwright`');
  console.log('\nSOME CHECKS FAILED');
  process.exit(1);
}

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.glb':'model/gltf-binary',
                '.json':'application/json', '.png':'image/png', '.css':'text/css' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/skyflyer-farm.html';

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const shot = async (page, name) => {
  const file = path.join(outDir, name + '.png');
  await page.screenshot({ path: file });
  chk('shot: ' + name, fs.existsSync(file) && fs.statSync(file).size > 8000,
    fs.existsSync(file) ? Math.round(fs.statSync(file).size / 1024) + 'KB' : 'missing');
};
const ready = (p) => p.waitForFunction(
  () => window.FARM && window.FARM.save && window.FARM.save.booted() && window.FARM.animals().length > 0, null,
  { timeout: 25000 });

try {
  // ---------------------------------------------------- 1. the basket, tablet
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  await page.goto(BASE, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(() => {
    window.FARM.save.load({
      v: window.FARM.save.snapshot().v, savedAt: Date.now() - 40 * 60 * 1000,
      patches: [{ s: 'corn', left: 12 }, { s: 'wheat', left: 8 }, { s: 'carrot', left: 6 }]
        .concat(Array(6).fill({ s: null })),
      animals: window.FARM.animals().map(a => ({ k: a.kind, st: 'making', left: 9 })),
      stack: [], basket: [], collected: ['corn', 'carrot', 'wheat', 'egg', 'milk'],
      unlocks: [], duck: false, ordersDone: 4, order: null
    });
    const b = window.FARM.basket();
    window.FARM.moveKidTo(b.x + 0.3, b.z + 3.5);      // walking up to it, not on it
  });
  await page.waitForTimeout(1400);
  await shot(page, 'fm5-welcome-basket');

  // ------------------------------------------- 2. the present, in the shop
  await page.evaluate(() => { window.FARM.addCoins(600); window.FARM.openShop(); });
  await page.waitForTimeout(700);
  await shot(page, 'fm5-shop-present');

  // ---------------------------------------- 3. the reveal, mid-confetti
  await page.evaluate(() => { window.FARM.closeShop(); window.FARM.moveKidTo(-8, 0); });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.FARM.buyPresent());
  await page.waitForFunction(() => { const r = window.FARM.revealing();
    return !!r && r.popped && window.FARM.confetti() > 10; }, null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => ({ conf: window.FARM.confetti(),
    r: window.FARM.revealing(), plane: window.FARM.plane() }));
  chk('the reveal really is mid-confetti when the picture is taken',
    mid.conf > 10 && !!mid.r, mid.conf + ' pieces');
  await shot(page, 'fm5-present-reveal');
  await page.close();

  // ---------------------------------- 4. FM6: the dog, the pumpkin, the row
  const fm6 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  await fm6.goto(BASE, { waitUntil: 'load' });
  await ready(fm6);
  await fm6.evaluate(() => {
    window.FARM.givePresent('pumpkinseed');
    window.FARM.givePresent('farmdog');
    window.FARM.givePresent('fieldrow');
    // a field with pumpkins in it, including two in the new fourth row
    ['pumpkin', 'corn', 'pumpkin', 'carrot', 'pumpkin', 'wheat',
     'corn', 'pumpkin', 'carrot', 'pumpkin', 'pumpkin', 'corn']
      .forEach((k, i) => window.FARM.plant(i, k));
    window.FARM.advanceTime(80);
    window.FARM.moveKidTo(0, 12);      // south of the field, looking up it
  });
  // the dog trots, so he needs a moment to catch her up before the shutter
  await fm6.waitForFunction(() => {
    const d = window.FARM.dog(), k = window.FARM.kid();
    return d.there && Math.hypot(d.x - k.x, d.z - k.z) < 3.2;
  }, null, { timeout: 20000 }).catch(() => {});
  await fm6.waitForTimeout(900);
  await shot(fm6, 'fm6-field-and-dog');

  // the seed pop-up, now four across
  await fm6.evaluate(() => window.FARM.openSeedPicker(4));
  await fm6.waitForTimeout(500);
  await shot(fm6, 'fm6-seed-picker');
  await fm6.evaluate(() => window.FARM.closeSeedPicker());

  // the dog carrying something home to her
  const fetched = await fm6.evaluate(() => {
    window.FARM.moveKidTo(0, 16);   // well clear of the fence, so his trip home is in the open
    window.FARM.ageReady();
    return window.FARM.dog().there;
  });
  await fm6.waitForFunction(() => window.FARM.dog().carry !== null, null, { timeout: 25000 }).catch(() => {});
  // and then wait until he is most of the way BACK to her, or the picture is a
  // dog somewhere off the top of the screen and shows nothing at all
  await fm6.waitForFunction(() => {
    const d = window.FARM.dog(), k = window.FARM.kid();
    return d.carry !== null && Math.hypot(d.x - k.x, d.z - k.z) < 5.2;
  }, null, { timeout: 25000 }).catch(() => {});
  chk('the dog really is carrying something when the picture is taken',
    fetched === true && (await fm6.evaluate(() => window.FARM.dog().carry)) !== null,
    String(await fm6.evaluate(() => window.FARM.dog().carry)));
  await shot(fm6, 'fm6-dog-fetching');
  await fm6.close();

  // the seed pop-up at phone width, where four buttons have to go two by two
  const seedPhone = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seedPhone.goto(BASE, { waitUntil: 'load' });
  await ready(seedPhone);
  await seedPhone.evaluate(() => { window.FARM.givePresent('pumpkinseed'); window.FARM.openSeedPicker(4); });
  await seedPhone.waitForTimeout(600);
  await shot(seedPhone, 'fm6-seed-picker-phone');
  await seedPhone.close();

  // ------------------------------------------- 5. the shop at phone width
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.goto(BASE, { waitUntil: 'load' });
  await ready(phone);
  await phone.evaluate(() => { window.FARM.addCoins(600); window.FARM.openShop(); });
  await phone.waitForTimeout(800);
  await shot(phone, 'fm5-shop-phone');
  await phone.close();
  // ------------------------------------- 6. FM6: the island, at three widths
  // Mike judges the land at the sizes it is actually played at, so the same
  // island is shot on a phone, on a tablet and on a desktop.
  const WIDTHS = [
    { name: 'phone',   w: 390,  h: 844, dpr: 2, mobile: true },
    { name: 'tablet',  w: 1024, h: 768, dpr: 2, mobile: true },
    { name: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false }
  ];
  for (const W of WIDTHS) {
    const pg = await browser.newPage({ viewport: { width: W.w, height: W.h },
      deviceScaleFactor: W.dpr, isMobile: W.mobile, hasTouch: W.mobile });
    await pg.goto(BASE, { waitUntil: 'load' });
    await ready(pg);
    await pg.evaluate(() => window.FARM.moveKidTo(0, 8));
    await pg.waitForTimeout(2200);
    await shot(pg, 'fm6-island-' + W.name);
    // and the whole island in one frame, so the layout can be judged at all
    await pg.evaluate(() => window.FARM.lookWide(true));
    await pg.waitForTimeout(1400);
    await shot(pg, 'fm6-island-wide-' + W.name);
    await pg.close();
  }

  // the new land, under its stones, on a tablet
  const land = await browser.newPage({ viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await land.goto(BASE, { waitUntil: 'load' });
  await ready(land);
  const covered = await land.evaluate(() => {
    window.FARM.givePresent('fieldrow');
    window.FARM.moveKidTo(0, 15);
    return window.FARM.coversLeft();
  });
  chk('the sixteen new slots really are under stones when the picture is taken',
    covered === 16, covered + ' covered');
  await land.waitForTimeout(1800);
  await shot(land, 'fm6-new-land');
  await land.close();

  // ----------------------------------------- 7. FM7: the new verbs
  const f7 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await f7.goto(BASE, { waitUntil: 'load' });
  await ready(f7);
  await f7.evaluate(() => {
    window.FARM.addCoins(5000);
    ['pumpkinseed','farmdog','fieldrow','pig','mill','bees','strawberry']
      .forEach(id => window.FARM.givePresent(id));
    ['tomatoseed','duck','melonseed','dairy'].forEach(id => window.FARM.giveExtra(id));
    window.FARM.giveCan();
  });
  await f7.waitForTimeout(2200);

  // the mill and the dairy, on the pads FM6 left for them
  await f7.evaluate(() => window.FARM.moveKidTo(9, -10));
  await f7.waitForTimeout(1400);
  await shot(f7, 'fm7-mill-and-dairy');

  // the seed pop-up, now seven crops
  await f7.evaluate(() => window.FARM.openSeedPicker(4));
  await f7.waitForTimeout(600);
  await shot(f7, 'fm7-seven-seeds');
  await f7.evaluate(() => window.FARM.closeSeedPicker());

  // the name picker
  await f7.evaluate(() => window.FARM.openNameFor(0));
  await f7.waitForTimeout(600);
  await shot(f7, 'fm7-name-picker');
  await f7.evaluate(() => { window.FARM.nameAnimal(0, 'crown'); });

  // the things she can buy for the farm
  await f7.evaluate(() => window.FARM.openDecor());
  await f7.waitForTimeout(600);
  await shot(f7, 'fm7-make-it-yours');
  await f7.evaluate(() => window.FARM.closeDecor());

  // raining on a crop, held
  const raining = await f7.evaluate(() => {
    window.FARM.moveKidTo(0, 9);
    window.FARM.plant(4, 'melon');
    return window.FARM.waterPatch(4);
  });
  await f7.waitForFunction(() => window.FARM.can().drops > 6, null, { timeout: 15000 }).catch(() => {});
  const drops = await f7.evaluate(() => window.FARM.can().drops);
  chk('it really is raining on the crop when the picture is taken',
    raining === true && drops > 6, drops + ' drops');
  await shot(f7, 'fm7-watering');
  await f7.evaluate(() => window.FARM.stopWatering());

  // the pig, in its own pen
  await f7.evaluate(() => window.FARM.moveKidTo(-6.5, 21.5));
  await f7.waitForTimeout(1400);
  await shot(f7, 'fm7-pig');
  await f7.close();

  // and the seed pop-up at phone width, where seven crops have to fit
  const seven = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await seven.goto(BASE, { waitUntil: 'load' });
  await ready(seven);
  await seven.evaluate(() => {
    window.FARM.givePresent('pumpkinseed'); window.FARM.givePresent('strawberry');
    window.FARM.giveExtra('tomatoseed'); window.FARM.giveExtra('melonseed');
    window.FARM.openSeedPicker(4);
  });
  await seven.waitForTimeout(700);
  await shot(seven, 'fm7-seven-seeds-phone');
  await seven.close();

  // ------------------------------------------------- FM8 and FM9: the new farm
  const f8 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  await f8.route('**/api/save-art', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: '{"ok":true}' }));
  await f8.goto(BASE, { waitUntil: 'load' });
  await ready(f8);
  // she has picked who she is, and the model has had time to arrive
  await f8.evaluate(() => window.FARM.pickLook('girl'));
  await f8.waitForFunction(() => window.FARM.kidModel().on === true, null, { timeout: 30000 })
    .catch(() => {});
  await f8.waitForTimeout(1200);

  // the character herself, close enough to judge her face and her outfit
  await f8.evaluate(() => { window.FARM.moveKidTo(-6, 0); window.FARM.giveItem('corn', 3); });
  await f8.waitForTimeout(1600);
  await shot(f8, 'fm9-the-kid');
  await f8.evaluate(() => window.FARM.pickLook('boy'));
  await f8.waitForTimeout(900);
  await shot(f8, 'fm9-the-kid-boy');
  await f8.evaluate(() => { window.FARM.pickLook('girl'); window.FARM.clearStack(); });

  // the two helpers and the tractor, all on the farm at once
  await f8.evaluate(() => {
    ['pumpkinseed', 'farmdog', 'fieldrow', 'pig', 'mill', 'bees', 'strawberry',
     'tractor', 'farmhand'].forEach(id => window.FARM.givePresent(id));
    window.FARM.setCoins(400);
    for (let i = 0; i < 6; i++) window.FARM.plant(i, 'corn');
    window.FARM.moveKidTo(6, 8);
  });
  await f8.waitForTimeout(2200);
  await shot(f8, 'fm8-helpers');

  // the tractor planting the whole field, mid-run
  await f8.evaluate(() => { window.FARM.harvestAll(); window.FARM.setCoins(400);
    window.FARM.openFieldPicker(); });
  await f8.waitForTimeout(500);
  await shot(f8, 'fm8-plant-the-field-card');
  await f8.evaluate(() => {
    document.querySelector('#seedRow .seed[data-kind="corn"]').click();
    window.FARM.tractorTick(6);              // a few seconds into the drive
  });
  await f8.waitForTimeout(900);
  await shot(f8, 'fm8-tractor-planting');

  // the truck on the road, wanting what the farm makes
  await f8.evaluate(() => {
    ['bread', 'cheese', 'honey'].forEach(k => window.FARM.giveItem(k, 1));
    window.FARM.clearStack();
    window.FARM.truckCall();
  });
  await f8.evaluate(() => window.FARM.truckTick(8));
  await f8.waitForFunction(() => window.FARM.truck().state === 'waiting', null, { timeout: 30000 })
    .catch(() => {});
  // stand her well back from it, so the truck and what it wants are both in the
  // frame rather than hard against the bottom edge behind the hint
  await f8.evaluate(() => { const t = window.FARM.truck();
    window.FARM.tapAt(t.stop.x, t.stop.z - 9);      // a real tap, so the hint retires
    window.FARM.moveKidTo(t.stop.x, t.stop.z - 9); });
  await f8.waitForTimeout(1600);
  await shot(f8, 'fm8-delivery-truck');

  // the sticker book, half full, which is the whole point of it
  await f8.evaluate(() => { window.FARM.giveDuck(); window.FARM.openBook(); });
  await f8.waitForTimeout(800);
  await shot(f8, 'fm8-sticker-book');
  await f8.evaluate(() => window.FARM.closeBook());
  await f8.close();

  // the sticker book and the who-is-this card at phone width
  const f8p = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await f8p.goto(BASE, { waitUntil: 'load' });
  await ready(f8p);
  // it comes up by itself a couple of seconds in, which at three frames a second
  // is a good while, so the picture waits for it and then asks for it
  await f8p.waitForFunction(() => window.FARM.lookPicker().up === true, null, { timeout: 30000 })
    .catch(() => {});
  await f8p.evaluate(() => { if (!window.FARM.lookPicker().up) window.FARM.openLookPicker(); });
  await f8p.waitForTimeout(900);
  chk('the who-is-this card really is on screen when its picture is taken',
    (await f8p.evaluate(() => window.FARM.lookPicker())).options.join(',') === 'girl,boy');
  await shot(f8p, 'fm9-who-is-this-phone');
  await f8p.evaluate(() => { window.FARM.pickLook('girl');
    ['pumpkinseed', 'farmdog', 'fieldrow', 'pig'].forEach(id => window.FARM.givePresent(id));
    window.FARM.openBook(); });
  await f8p.waitForTimeout(800);
  await shot(f8p, 'fm8-sticker-book-phone');
  await f8p.close();

} catch (e) {
  chk('the farm camera completed its run', false, e.message);
} finally {
  await browser.close();
  server.close();
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
