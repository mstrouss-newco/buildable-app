// Headless QA for THE FARM (public/skyflyer-farm.html) — a robot that really
// plays it.
//
// qa-skyflyer.mjs carries the STATIC half of the farm's checks (the recipe, the
// laws, the shapes in the file). This is the other half: a real browser, a real
// WebGL context, and a robot that plants nothing and instead does the thing FM2
// is actually about — walk past an animal carrying the right crop and watch the
// item fly off the stack, wait for the egg, walk over it, carry it away.
//
// WHY A REAL BROWSER AND NOT JSDOM: the farm is a three.js scene that loads a
// glb. jsdom has no WebGL and no fetch for a binary model, so the whole mechanic
// is invisible to it. Chromium with the software rasteriser runs it honestly.
//
// Run:  node qa-farm.mjs .
// Needs playwright + a chromium (both already present in the build sandbox:
// PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). Without it this script FAILS
// LOUDLY rather than quietly reporting a pass it never earned — the same rule
// the jsdom half of qa-skyflyer.mjs follows.
//
// THE SOFTWARE RASTERISER IS SLOW, so this waits on STATE (window.FARM.flying()
// reaching zero, an animal reaching "ready") and never on a fixed sleep. A
// wall-clock assumption here would go green on a fast machine and red on a
// loaded one, which is worse than no test at all.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const dir = process.argv[2] || '.';
const root = path.resolve(dir, 'public');
let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

// ---------------------------------------------------------------- playwright
let chromium = null;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try { chromium = createRequire(import.meta.url)(spec).chromium; break; } catch (e) { /* keep trying */ }
}
if (!chromium) {
  console.log('FAIL  the farm robot could run  ::  playwright not found — `npm i --no-save playwright`');
  console.log('\nSOME CHECKS FAILED');
  process.exit(1);
}

// ------------------------------------------------------ serve public/ locally
// A glb is fetched over the wire, so file:// will not do. No dependency: the
// scene needs exactly three files and they are all static.
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

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const ev = (fn, arg) => page.evaluate(fn, arg);
// Park the kid far from everything, so nothing is fed or swept up by accident
// while the robot is setting the next step up.
const park = async () => { await ev(() => window.FARM.moveKidTo(-45, -45)); await page.waitForTimeout(250); };
const settle = () => page.waitForFunction(() => window.FARM.flying() === 0, { timeout: 20000 });

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FARM && window.FARM.animals && window.FARM.animals().length > 0,
    { timeout: 20000 });
  await page.waitForTimeout(600);

  console.log('--- THE FARM: the scene stands up in a real browser ---');
  chk('the farm scene boots with a WebGL context and no page errors', errs.length === 0, errs.join(' | '));
  chk('it is the FM3 build', (await ev(() => window.FARM.version)) === 'fm3');

  console.log('\n--- THE CAST ---');
  const animals = await ev(() => window.FARM.animals());
  chk('four chickens and one cow are placed',
    animals.filter(a => a.kind === 'chicken').length === 4 && animals.filter(a => a.kind === 'cow').length === 1,
    animals.map(a => a.kind).join(','));
  chk('three hens are settled on nests and one walks a patrol',
    animals.filter(a => a.nested).length === 3 && animals.filter(a => a.patrolling).length === 1);
  chk('the chicken really is the library model, not the drawn spare',
    (await ev(() => window.FARM.modelsLoaded())) && animals.find(a => a.kind === 'chicken').real === true);
  chk('chickens want corn and give eggs, the cow wants wheat and gives milk',
    animals.filter(a => a.kind === 'chicken').every(a => a.wants === 'corn' && a.gives === 'egg') &&
    animals.find(a => a.kind === 'cow').wants === 'wheat' &&
    animals.find(a => a.kind === 'cow').gives === 'milk');
  chk('every animal starts out asking for something, in pictures',
    animals.every(a => a.state === 'hungry' && a.wanting));

  const before = animals.find(a => a.patrolling);
  await page.waitForTimeout(1600);
  const later = (await ev(() => window.FARM.animals())).find(a => a.patrolling);
  chk('the walking chicken actually walks',
    Math.hypot(later.x - before.x, later.z - before.z) > 0.15,
    'moved ' + Math.hypot(later.x - before.x, later.z - before.z).toFixed(2) + 'u');

  const kinds = await ev(() => window.FARM.animalKinds());
  chk('no wait anywhere is a minute or longer',
    kinds.chicken.makeSec < 60 && kinds.cow.makeSec < 60,
    'chicken ' + kinds.chicken.makeSec + 's, cow ' + kinds.cow.makeSec + 's');

  console.log('\n--- FEEDING: no menu, no tap, no reading ---');
  await park();
  await ev(() => window.FARM.giveItem('corn', 4));
  await settle();
  const stack0 = await ev(() => window.FARM.stackHeight());
  chk('the corn is on the stack before the walk', stack0 === 4, 'stack=' + stack0);

  const hen = animals.find(a => a.kind === 'chicken' && a.nested);
  await ev(h => window.FARM.moveKidTo(h.x, h.z + 1.7), hen);
  const airborne = await ev(() => window.FARM.flying());
  await settle();
  const fed = await ev(() => ({ stack: window.FARM.stackHeight(), animals: window.FARM.animals() }));
  const fedHens = fed.animals.filter(a => a.kind === 'chicken' && a.state === 'making');
  chk('walking past with corn feeds every animal in reach — nothing was tapped',
    fed.stack < stack0 && fedHens.length >= 1,
    'stack ' + stack0 + ' -> ' + fed.stack + ', ' + fedHens.length + ' fed');
  chk('the items were seen in the air on the way over', airborne >= 1, 'in flight=' + airborne);
  chk('exactly one item leaves the stack per animal fed',
    stack0 - fed.stack === fedHens.length,
    (stack0 - fed.stack) + ' off the stack, ' + fedHens.length + ' fed');
  chk('a fed hen stops asking', fedHens.every(a => a.wanting === false));

  console.log('\n--- THE PAYOFF ---');
  await park();                                   // stand clear or it is swept up as it lands
  await ev(() => window.FARM.advanceTime(30));
  await page.waitForFunction(() => window.FARM.animals().some(a => a.state === 'ready'), { timeout: 15000 });
  const ready = (await ev(() => window.FARM.animals())).find(a => a.state === 'ready');
  chk('after the wait an egg is sitting beside the animal', !!ready && ready.hasProduce);
  chk('and it sparkles, the same signal a ready crop uses', !!ready && ready.sparkling);

  await ev(r => window.FARM.moveKidTo(r.x + 3.4, r.z + 3.4), ready);
  await page.waitForTimeout(700);
  const prePick = await ev(() => window.FARM.stackHeight());
  await ev(r => window.FARM.moveKidTo(r.x, r.z), ready);
  await page.waitForTimeout(900);
  const picked = await ev(() => ({ stack: window.FARM.stack(), animals: window.FARM.animals() }));
  chk('walking over the egg hops it onto the stack like any crop',
    picked.stack.length > prePick && picked.stack.some(s => s.kind === 'egg'),
    prePick + ' -> ' + picked.stack.length + ' [' + picked.stack.map(s => s.kind).join(',') + ']');
  chk('the hen goes straight back to asking for corn — never to a fail state',
    picked.animals.some(a => a.kind === 'chicken' && a.state === 'hungry' && a.wanting));

  console.log('\n--- THE COW: same mechanic, different item ---');
  const cow = animals.find(a => a.kind === 'cow');
  await park();
  await ev(() => window.FARM.giveItem('wheat', 2));
  await settle();
  const cowStack0 = await ev(() => window.FARM.stackHeight());
  await ev(c => window.FARM.moveKidTo(c.x + 1.8, c.z + 1.2), cow);
  await page.waitForFunction(() => ['making', 'ready'].includes(
    window.FARM.animals().find(a => a.kind === 'cow').state), { timeout: 20000 });
  chk('walking past the cow with wheat feeds her', true,
    'cow state=' + (await ev(() => window.FARM.animals().find(a => a.kind === 'cow').state)));
  chk('exactly one wheat left the stack for her',
    cowStack0 - (await ev(() => window.FARM.stackHeight())) === 1);

  await park();
  await ev(() => window.FARM.advanceTime(40));
  await page.waitForFunction(() => window.FARM.animals().find(a => a.kind === 'cow').state === 'ready',
    { timeout: 15000 });
  const cowReady = (await ev(() => window.FARM.animals())).find(a => a.kind === 'cow');
  chk('a milk bottle appears beside her, sparkling',
    cowReady.state === 'ready' && cowReady.hasProduce && cowReady.sparkling);

  await ev(c => window.FARM.moveKidTo(c.x + 3.6, c.z + 3.2), cow);
  await page.waitForTimeout(700);
  await ev(c => window.FARM.moveKidTo(c.x, c.z), cow);
  await page.waitForTimeout(900);
  const s2 = await ev(() => window.FARM.stack());
  chk('the milk hops onto the stack too', s2.some(x => x.kind === 'milk'),
    '[' + s2.map(x => x.kind).join(',') + ']');
  // Standing there still holding wheat when the bottle is swept up feeds her
  // again on the spot. That is the loop closing, not a double-spend.
  chk('collecting the milk while still holding wheat feeds her straight back up',
    !s2.some(x => x.kind === 'wheat') &&
    ['feeding', 'making'].includes((await ev(() => window.FARM.animals())).find(a => a.kind === 'cow').state));

  console.log('\n--- NOTHING CAN GO WRONG ---');
  await park();
  await ev(() => window.FARM.giveItem('carrot', 2));
  await settle();
  const carrots = await ev(() => window.FARM.stackHeight());
  await ev(c => window.FARM.moveKidTo(c.x + 1.5, c.z), cow);
  await page.waitForTimeout(1200);
  chk('carrying only the WRONG crop past an animal takes nothing off the stack',
    (await ev(() => window.FARM.stackHeight())) === carrots);
  chk('an unfed animal just keeps waiting — it never starves or expires',
    (await ev(() => window.FARM.animals())).every(a => ['hungry','feeding','making','ready'].includes(a.state)));
  chk('the scene reports no fail state at all', (await ev(() => window.FARM.canFail())) === false);

  console.log('\n--- THE STACK SURVIVES ITEMS BEING PULLED OUT OF IT ---');
  const st = await ev(() => window.FARM.stack());
  chk('whip-lag is renumbered after items leave the middle of the stack',
    st.every((s, i) => Math.abs(s.lag - i * 0.055) < 1e-6), st.map(s => s.lag.toFixed(3)).join(','));
  await park();
  await ev(() => { window.FARM.giveItem('corn', 6); window.FARM.giveItem('wheat', 5); window.FARM.giveItem('egg', 4); });
  await settle();
  await ev(() => window.FARM.moveKidTo(10, 3));
  await page.waitForTimeout(1500);
  const tall = await ev(() => window.FARM.stackHeight());
  chk('a tall stack mixing crops AND produce carries fine, with no cap', tall >= 14, 'height=' + tall);
  chk('and it never fell over — every item is still above the ground',
    (await ev(() => window.FARM.stack())).every(s => s.y > 1.0));

  // ======================================================================
  //  FM3 — THE ORDER CRATE, THE UNLOAD, THE PLANE, THE PAYOUT AND THE SHOP.
  //
  //  The unload is the moment the whole mode was built toward, so it is tested
  //  the way it is played: load a real stack, walk to the crate, and watch what
  //  the card and the stack actually do — never by calling an internal.
  // ======================================================================
  console.log('\n--- FM3: THE COIN ECONOMY (Mike\'s call) ---');
  const econ = await ev(() => window.FARM.economy());
  chk('every seed costs the same, so there is no sum for a kid to do',
    econ.seedPrice === 3, 'seed=' + econ.seedPrice);
  chk('harvesting pays NOTHING — a crop is an ingredient, not money',
    econ.harvestPays === 0);
  chk('the plane is the only income, and it pays far more than a seed costs',
    econ.payBase >= econ.seedPrice * 5, 'pay ' + econ.payBase + ' vs seed ' + econ.seedPrice);
  chk('the payout stops growing, so orders never turn into a grind',
    econ.payMax > econ.payBase && econ.payMax <= 60, 'max=' + econ.payMax);
  const w0 = await ev(() => window.FARM.wallet());
  chk('the coin pill is the SHELL\'S shared wallet, not a local variable',
    w0.shared === true && (w0.role === 'owner' || w0.role === 'announcer'), 'role=' + w0.role);
  chk('the farm still opens with fifty coins, granted once through the wallet',
    w0.balance === 50, 'balance=' + w0.balance);
  chk('the pill on screen shows that same number',
    (await page.textContent('#coins')) === String(w0.balance));

  console.log('\n--- FM3: THE ORDER, AND WHAT IT IS ALLOWED TO ASK FOR ---');
  const ord0 = await ev(() => window.FARM.order());
  chk('an order is waiting the moment the farm opens', !!ord0 && ord0.items.length >= 2);
  chk('the card is up, with one silhouette slot per item wanted',
    ord0.cardUp && ord0.slots.length === ord0.items.length,
    ord0.items.map(i => i.kind).join('+'));
  chk('no slot starts out filled', ord0.slots.every(s => !s.full));
  chk('the order shows what it pays', ord0.pay >= econ.payBase);
  const allowed = await ev(() => window.FARM.orderableKinds());
  chk('an order may only ask for things this farm can actually make',
    allowed.includes('corn') && allowed.includes('egg') && allowed.includes('milk') &&
    !allowed.includes('duckegg'), allowed.join(','));
  // 40 rolls, because the guardrail has to hold for EVERY order, not the first
  const rolls = await ev(() => { const out = []; for (let i = 0; i < 40; i++) out.push(window.FARM.newOrder()); return out; });
  chk('and that holds over forty fresh orders — never once a duck egg',
    rolls.every(r => r.every(k => allowed.includes(k))));
  chk('no order is ever bigger than six slots, which is all that reads at a glance',
    rolls.every(r => r.length >= 2 && r.length <= 6));

  console.log('\n--- FM3: THE UNLOAD (the moment the genre is built on) ---');
  await park();
  await ev(() => window.FARM.clearStack());
  await ev(() => window.FARM.setOrder(['corn', 'corn', 'corn']));
  await ev(() => window.FARM.giveItem('corn', 5));
  await settle();
  chk('five corn are on the kid\'s head and the crate wants three of them',
    (await ev(() => window.FARM.stackHeight())) === 5);
  const crate = await ev(() => window.FARM.crate());
  chk('the crate\'s reach is generous — nobody has to aim', crate.r >= 3);
  await ev(([x, z]) => window.FARM.moveKidTo(x, z), [crate.x, crate.z]);
  await page.waitForFunction(() => { const o = window.FARM.order(); return o && o.full; }, { timeout: 15000 });
  const ordF = await ev(() => window.FARM.order());
  chk('walking to the crate emptied the wanted corn off the stack, all three',
    ordF.items.filter(i => i.filled).length === 3);
  chk('and every slot on the card lit up with it — one item, one slot',
    ordF.slots.filter(s => s.full).length === 3);
  chk('the two spare corn STAYED on the stack: the crate takes only what it asked for',
    (await ev(() => window.FARM.stackHeight())) === 2);
  await park();     // step away, or the kid unloads into the NEXT order too

  console.log('\n--- FM3: THE PLANE ---');
  const legs = await ev(() => window.FARM.planeLegs());
  const flight = await ev(() => window.FARM.flightSeconds());
  chk('the plane leaves the moment the order fills — no button to find',
    (await ev(() => window.FARM.plane())).busy === true);
  chk('the whole flight is well under a minute, like everything else here',
    flight < 60, flight.toFixed(1) + 's');
  chk('it has a real trip: taxi, roll, climb, away, back, park',
    ['taxi', 'roll', 'climb', 'away', 'back', 'park'].every(k => legs[k] > 0));
  // drive the frames by hand rather than waiting the flight out in wall clock
  const seen = await ev(async () => {
    const s = new Set();
    for (let i = 0; i < 900; i++) { window.FARM.tick(1 / 60); s.add(window.FARM.plane().phase); }
    return [...s];
  });
  chk('and it really passes through every one of them',
    ['taxi', 'roll', 'climb', 'away', 'back', 'park', 'parked'].every(k => seen.includes(k)), seen.join('>'));
  await page.waitForFunction(() => window.FARM.plane().phase === 'parked', { timeout: 30000 });
  const w1 = await ev(() => window.FARM.wallet());
  chk('it came back and the coins landed in the shared wallet',
    w1.balance === 50 + ordF.pay, 'balance=' + w1.balance);
  chk('the pill shows the new balance', (await page.textContent('#coins')) === String(w1.balance));
  chk('one delivery is on the board', (await ev(() => window.FARM.ordersDone())) === 1);
  const ord2 = await ev(() => window.FARM.order());
  chk('a fresh order is already waiting, worth a little more than the last',
    !!ord2 && ord2.pay > ordF.pay && ord2.items.every(i => !i.filled),
    ord2.pay + ' vs ' + ordF.pay);
  chk('and it is bigger than the first one was, gently',
    ord2.items.length >= ordF.items.length);

  console.log('\n--- FM3: NOTHING HERE CAN FAIL, AND NOBODY CAN GET STUCK ---');
  chk('there is still no fail state anywhere', (await ev(() => window.FARM.canFail())) === false);
  chk('carrying the wrong thing to the crate costs nothing at all', await (async () => {
    await park();
    await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('wheat', 3); });
    await ev(() => window.FARM.setOrder(['milk']));
    const before = await ev(() => window.FARM.stackHeight());
    const c = await ev(() => window.FARM.crate());
    await ev(([x, z]) => window.FARM.moveKidTo(x, z), [c.x, c.z]);
    await page.waitForTimeout(1200);
    const after = await ev(() => window.FARM.stackHeight());
    const o = await ev(() => window.FARM.order());
    return after === before && o.slots.every(s => !s.full);
  })());
  chk('a kid with no coins is handed a free seed rather than being stuck', await (async () => {
    await ev(() => { const b = window.FARM.wallet().balance; if (b > 0) window.FARM.addCoins(-b); });
    return (await ev(() => window.FARM.seedIsFree())) === true;
  })());
  chk('and the seed buttons stay tappable when they are free — never greyed out',
    (await ev(() => { window.FARM.openSeedPicker(0); return window.FARM.seedButtons(); })).every(b => !b.locked));
  await ev(() => window.FARM.closeSeedPicker());

  console.log('\n--- FM3: THE SHOP AND THE DUCK ---');
  const shop0 = await ev(() => window.FARM.shop());
  chk('the shop stays hidden while a duck is out of reach — nothing is dangled',
    shop0.btnShown === false && shop0.duckBought === false);
  chk('a duck costs about five deliveries, not a season\'s work',
    shop0.price >= 100 && shop0.price <= 160, shop0.price + ' coins');
  chk('you cannot buy one you have not saved for',
    (await ev(() => window.FARM.buyDuck())) === false);
  await ev(() => window.FARM.addCoins(window.FARM.shop().price));
  chk('once the coins are there the shop button appears',
    (await ev(() => window.FARM.shop())).btnShown === true);
  chk('buying the duck works, and takes the coins', await (async () => {
    const before = (await ev(() => window.FARM.wallet())).balance;
    const bought = await ev(() => window.FARM.buyDuck());
    const after = (await ev(() => window.FARM.wallet())).balance;
    return bought === true && after === before - shop0.price;
  })());
  await page.waitForTimeout(900);
  const withDuck = await ev(() => window.FARM.animals());
  const duck = withDuck.find(a => a.kind === 'duck');
  chk('a duck is in the coop now', !!duck);
  chk('and she is the real library model, not the drawn spare', !!duck && duck.real === true);
  chk('she eats corn like the hens and lays a DIFFERENT egg',
    !!duck && duck.wants === 'corn' && duck.gives === 'duckegg');
  chk('her egg waits well under a minute, like everything else', !!duck && duck.makeSec < 60);
  chk('the shop button is gone once she is bought — it never sells a second one',
    (await ev(() => window.FARM.shop())).btnShown === false);
  chk('and NOW an order may ask for a duck egg, but not one second before',
    (await ev(() => window.FARM.orderableKinds())).includes('duckegg'));

  console.log('\n--- FM3: THE SHELL CONTRACT ---');
  chk('the shared nav bridge is loaded, so the shell\'s Home button reaches us',
    (await ev(() => window.FARM.navRegistered())) === true);
  chk('the farm honours the shell\'s pause and resume', await (async () => {
    await ev(() => dispatchEvent(new MessageEvent('message', { data: { kind: 'pause' } })));
    const p = await ev(() => window.FARM.paused());
    await ev(() => dispatchEvent(new MessageEvent('message', { data: { kind: 'resume' } })));
    return p === true && (await ev(() => window.FARM.paused())) === false;
  })());
  const map = await ev(() => window.FARM.sfxMap);
  chk('every sound is a PALETTE NAME pointing at a created clip, never a raw tone',
    Object.keys(map).length >= 10 && Object.values(map).every(v => /^sky_/.test(v)));
  chk('the unload, the takeoff, the landing and the payout each have their own sound',
    !!map.deliver && !!map.whoosh && !!map.land && !!map.collect);

  console.log('\n--- THE MODEL STAND ---');
  const zooPage = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const zooErrs = [];
  zooPage.on('pageerror', e => zooErrs.push(e.message));
  await zooPage.goto(BASE + '?zoo=1', { waitUntil: 'load' });
  await zooPage.waitForFunction(() => window.FARM && window.FARM.inZoo && window.FARM.inZoo(), { timeout: 20000 })
    .catch(() => {});
  chk('?zoo=1 stands the models up on a turntable, with no errors',
    (await zooPage.evaluate(() => window.FARM.inZoo())) === true && zooErrs.length === 0, zooErrs.join(' | '));
  await zooPage.close();

  chk('no page errors anywhere in the whole play-through', errs.length === 0, errs.join(' | '));
} catch (e) {
  chk('the farm robot completed its run', false, e.message);
} finally {
  await browser.close();
  server.close();
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
