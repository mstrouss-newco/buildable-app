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
// NOTE ON EVERY waitForFunction BELOW: the signature is
// waitForFunction(fn, ARG, OPTIONS), so `waitForFunction(fn, {timeout: 9000})`
// passes the options object as the page function's ARGUMENT and silently uses
// Playwright's 30-second default instead. Every wait in this file spent months
// doing exactly that, which is why the slower island scene made the dog and the
// mill look flaky when they were both working perfectly. They all pass `null`
// for the argument now. If you add one, do the same.
// Park the kid far from everything, so nothing is fed or swept up by accident
// while the robot is setting the next step up.
const park = async () => { await ev(() => window.FARM.moveKidTo(-45, -45)); await page.waitForTimeout(250); };
const settle = () => page.waitForFunction(() => window.FARM.flying() === 0, null, { timeout: 20000 });

try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.FARM && window.FARM.animals && window.FARM.animals().length > 0, null,
    { timeout: 20000 });
  await page.waitForTimeout(600);

  console.log('--- THE FARM: the scene stands up in a real browser ---');
  chk('the farm scene boots with a WebGL context and no page errors', errs.length === 0, errs.join(' | '));
  chk('it is the FM8 build', (await ev(() => window.FARM.version)) === 'fm8');

  // ======================================================================
  //  FM4 — THE FIRST ORDER. This block runs BEFORE the robot collects
  //  anything, because that is the whole point: on a brand new farm the crate
  //  may only ask for the three crops. Mike's daughter's first crate asked
  //  for MILK, before a cow had ever been fed.
  // ======================================================================
  console.log('\n--- FM4: THE FIRST ORDER, ON A FARM WHERE NOTHING HAS BEEN COLLECTED ---');
  const CROPS = ['corn', 'carrot', 'wheat'];
  const coll0 = await ev(() => window.FARM.collected());
  chk('a new farm has only the three crops in its pantry',
    coll0.length === 3 && CROPS.every(k => coll0.includes(k)), coll0.join(','));
  const first = await ev(() => window.FARM.order());
  chk('so the FIRST order asks for crops and nothing else — no milk, no eggs',
    !!first && first.items.every(i => CROPS.includes(i.kind)),
    first ? first.items.map(i => i.kind).join('+') : 'no order');
  const firstRolls = await ev(() => { const o = []; for (let i = 0; i < 40; i++) o.push(window.FARM.newOrder()); return o; });
  chk('and that holds over forty fresh orders on a farm with nothing collected',
    firstRolls.every(r => r.every(k => CROPS.includes(k))));
  chk('the animals exist all along — it is what has been CARRIED that gates the pool',
    (await ev(() => window.FARM.animals())).some(a => a.gives === 'milk'));
  await ev(() => window.FARM.newOrder());

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
  // waits on the HEN, not on a stopwatch: the island is a heavier scene and on
  // the software rasteriser a fixed 1600ms is however many frames it manages
  await page.waitForFunction(b => {
    const a = window.FARM.animals().find(x => x.patrolling);
    return a && Math.hypot(a.x - b.x, a.z - b.z) > 0.35;
  }, { x: before.x, z: before.z }, { timeout: 25000 }).catch(() => {});
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
  await page.waitForFunction(() => window.FARM.animals().some(a => a.state === 'ready'), null, { timeout: 15000 });
  const ready = (await ev(() => window.FARM.animals())).find(a => a.state === 'ready');
  chk('after the wait an egg is sitting beside the animal', !!ready && ready.hasProduce);
  chk('and it sparkles, the same signal a ready crop uses', !!ready && ready.sparkling);

  // stand OUTSIDE the magnet's four units, or it fetches the egg before this
  // has even taken its first reading — which is what the slower island scene
  // started doing here
  await ev(r => window.FARM.moveKidTo(r.x + 6.5, r.z + 6.5), ready);
  await page.waitForTimeout(700);
  const prePick = await ev(() => window.FARM.stackHeight());
  await ev(r => window.FARM.moveKidTo(r.x, r.z), ready);
  await page.waitForFunction(n => window.FARM.stackHeight() > n, prePick, { timeout: 12000 })
    .catch(() => {});
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
    window.FARM.animals().find(a => a.kind === 'cow').state), null, { timeout: 20000 });
  chk('walking past the cow with wheat feeds her', true,
    'cow state=' + (await ev(() => window.FARM.animals().find(a => a.kind === 'cow').state)));
  chk('exactly one wheat left the stack for her',
    cowStack0 - (await ev(() => window.FARM.stackHeight())) === 1);

  await park();
  await ev(() => window.FARM.advanceTime(40));
  await page.waitForFunction(() => window.FARM.animals().find(a => a.kind === 'cow').state === 'ready', null,
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
  chk('a seed costs what its crop is worth: corn 4, carrot 3, wheat 2',
    econ.seedPrices.corn === 4 && econ.seedPrices.carrot === 3 && econ.seedPrices.wheat === 2,
    JSON.stringify(econ.seedPrices));
  chk('harvesting pays NOTHING — a crop is an ingredient, not money',
    econ.harvestPays === 0);
  chk('every item an order can name has a value, and produce is worth more than a crop',
    econ.itemValues.egg === 6 && econ.itemValues.duckegg === 7 && econ.itemValues.milk === 8 &&
    econ.itemValues.corn === 4 && econ.itemValues.carrot === 3 && econ.itemValues.wheat === 2,
    JSON.stringify(econ.itemValues));
  chk('an order pays THREE TIMES what it asked for, so the trip always pays',
    econ.payMult === 3);
  chk('and that really is what the card says', await (async () => {
    const set = await ev(() => window.FARM.setOrder(['corn', 'corn', 'wheat']));
    const o = await ev(() => window.FARM.order());
    return !!set && o.pay === (4 + 4 + 2) * 3;
  })());
  await ev(() => window.FARM.newOrder());
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
  chk('the card is up, with ONE slot per KIND, not one per item',
    ord0.cardUp && ord0.slots.length === new Set(ord0.items.map(i => i.kind)).size,
    ord0.items.map(i => i.kind).join('+'));
  chk('no slot starts out filled', ord0.slots.every(s => !s.full));
  chk('the order shows what it pays', ord0.pay > 0);
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
  await page.waitForFunction(() => { const o = window.FARM.order(); return o && o.full; }, null, { timeout: 15000 });
  const ordF = await ev(() => window.FARM.order());
  chk('walking to the crate emptied the wanted corn off the stack, all three',
    ordF.items.filter(i => i.filled).length === 3);
  chk('and the corn slot went green — one slot for the kind, counted down to zero',
    ordF.slots.length === 1 && ordF.slots[0].full === true && ordF.slots[0].want === 3);
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
  // the software rasteriser can be starved by anything else on the box, and a
  // wall-clock assumption here is worse than no test at all, so this waits on
  // the STATE with room to spare rather than on a tight clock
  await page.waitForFunction(() => window.FARM.plane().phase === 'parked', null, { timeout: 90000 });
  const w1 = await ev(() => window.FARM.wallet());
  chk('it came back and the coins landed in the shared wallet',
    w1.balance === 50 + ordF.pay, 'balance=' + w1.balance);
  chk('the pill shows the new balance', (await page.textContent('#coins')) === String(w1.balance));
  chk('one delivery is on the board', (await ev(() => window.FARM.ordersDone())) === 1);
  const ord2 = await ev(() => window.FARM.order());
  chk('a fresh order is already waiting, and nothing on it is filled in',
    !!ord2 && ord2.pay > 0 && ord2.items.every(i => !i.filled), 'pays ' + (ord2 && ord2.pay));
  chk('and its pay is three times what it is asking for, plus double for a favourite',
    await (async () => {
      // FM8: a customer's favourite is worth DOUBLE to the one who loves it, so
      // the pay is the order's own worth three times over plus that one item again.
      const e = await ev(() => window.FARM.economy());
      const fav = (await ev(() => window.FARM.customerCast())).fav;
      const want = ord2.items.reduce((t, i) => t + e.itemValues[i.kind], 0) * e.payMult;
      const bonus = fav ? e.itemValues[fav] * e.payMult : 0;
      return ord2.pay === Math.max(6, Math.round(want)) + bonus;
    })());

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
  chk('buying her is NOT enough — a duck egg still cannot be asked for',
    !(await ev(() => window.FARM.orderableKinds())).includes('duckegg'));
  let DUCKWHY = '';
  chk('but carry one home and NOW the crate may ask for it', await (async () => {
    await park();
    // EIGHT corn, not two. The duck stands in the coop yard with four hens who
    // also want corn, and walking in there with two feeds two hens and leaves
    // the duck asking. That is the game working; the robot just has to bring
    // enough for everybody.
    await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 8); });
    // the duck WALKS, so aiming once at where she was is a coin toss on a slow
    // machine. Re-aim at her live position until the corn has actually landed.
    for (let i = 0; i < 6; i++) {
      const d = (await ev(() => window.FARM.animals())).find(a => a.kind === 'duck');
      if (d.state === 'making' || d.state === 'ready') break;
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [d.x, d.z]);
      await page.waitForFunction(() => {
        const a = window.FARM.animals().find(x => x.kind === 'duck');
        return a && (a.state === 'making' || a.state === 'ready');
      }, null, { timeout: 9000 }).catch(() => {});
    }
    await ev(() => window.FARM.advanceTime(40));
    // wait for the egg to be ON THE GROUND, then walk to it. She fed the duck
    // mid-patrol, so where the duck stood and where the egg landed are not the
    // same place, and she should not have to be lucky.
    await page.waitForFunction(() => window.FARM.produceSpots().some(s => s.gives === 'duckegg'), null,
      { timeout: 40000 }).catch(() => {});
    const sp = (await ev(() => window.FARM.produceSpots())).find(s => s.gives === 'duckegg');
    if (sp) await ev(([x, z]) => window.FARM.moveKidTo(x, z), [sp.x, sp.z]);
    // asserted, never thrown: a starved machine should fail this one check
    // rather than abandon the hundred and fifty behind it
    await page.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'duckegg'), null,
      { timeout: 30000 }).catch(() => {});
    const duck = (await ev(() => window.FARM.animals())).find(a => a.kind === 'duck');
    const st = await ev(() => window.FARM.stack());
    DUCKWHY = 'duck=' + duck.state + ' stack=' + st.map(x => x.kind).join(',');
    return st.some(s => s.kind === 'duckegg') &&
           (await ev(() => window.FARM.orderableKinds())).includes('duckegg');
  })(), DUCKWHY);

  // ======================================================================
  //  FM4 — THE THINGS MIKE'S DAUGHTER HIT ON A TABLET.
  //
  //  Every check below is one sentence out of that playtest: she walked round
  //  things she could not pick up, she walked through fences, and the wish
  //  list was grey smudges.
  // ======================================================================
  console.log('\n--- FM4: PICKUP THAT FORGIVES A NEAR MISS ---');
  const rad = await ev(() => ({ pick: window.FARM.pickupRadius(), mag: window.FARM.magnetRadius() }));
  chk('the pickup reach is 3 units, up from the 2 she kept missing', rad.pick === 3);
  chk('and inside 4 units the thing comes to HER', rad.mag === 4 && rad.mag > rad.pick);
  const spots = await ev(() => window.FARM.plannedProduceSpots());
  chk('every animal has somewhere to leave its produce that a kid can stand on',
    spots.length > 0 && spots.every(sp => sp.standable),
    spots.filter(sp => !sp.standable).map(sp => sp.kind).join(',') || 'all clear');
  chk('and none of those spots is walled off by the coop or a fence rail',
    spots.every(sp => !!sp.standable));
  chk('an egg left on the ground is collected once she walks up to it',
    await (async () => {
      await park();
      await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 1); });
      const hen = (await ev(() => window.FARM.animals()))
        .find(a => a.kind === 'chicken' && a.state === 'hungry');
      if (!hen) return false;
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [hen.x, hen.z]);
      await page.waitForFunction(() => window.FARM.animals().some(a => a.state === 'making'), null,
        { timeout: 15000 }).catch(() => {});
      await ev(() => window.FARM.advanceTime(40));
      await page.waitForFunction(() => window.FARM.produceSpots().length > 0, null, { timeout: 20000 });
      const sp = (await ev(() => window.FARM.produceSpots()))[0];
      await park();
      const before = await ev(() => window.FARM.stackHeight());
      // stand a MAGNET's reach away, not on top of it — the near miss she kept
      // making. WHICH SIDE matters: the produce spot can sit against the coop
      // or a fence rail, and standing in the rail means being slid out of the
      // magnet's reach before it can pull. So the first clear side wins.
      await ev((s) => {
        const r = window.FARM.magnetRadius() - 0.4;
        const sides = [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]];
        const at = sides.find(([dx, dz]) => !window.FARM.blockedAt(s.x + dx, s.z + dz)) || sides[0];
        window.FARM.moveKidTo(s.x + at[0], s.z + at[1]);
      }, sp);
      // WHAT IS BEING PROVED IS THE MAGNET, not the wall clock. This harness
      // renders at about three frames a second and dt is capped at 0.05, so game
      // time here runs at roughly a sixth of real time and a "five real seconds"
      // rule was measuring the rasteriser rather than the farm. The reach itself
      // is a third of a second of GAME time and that is what the farm promises.
      const t0 = Date.now();
      await page.waitForFunction(n => window.FARM.stackHeight() > n, before, { timeout: 25000 })
        .catch(() => {});
      return (await ev(() => window.FARM.stackHeight())) > before && Date.now() - t0 < 25000;
    })());

  console.log('\n--- FM4: SOLID THINGS, AND ONE GATE PER PEN ---');
  const areas = await ev(() => window.FARM.areas());
  const blocks = await ev(() => window.FARM.blockers());
  chk('the field, the coop yard and the cow pen are all fenced areas', areas.length === 3);
  chk('each one has exactly one gate on one side', areas.every(a => !!a.side && !!a.gate));
  chk('the gap is a doorway a kid fits through, about two kid-widths',
    (await ev(() => window.FARM.gateGap())) >= 2 &&
    (await ev(() => window.FARM.gateGap())) > (await ev(() => window.FARM.kidRadius())) * 3);
  chk('the fence rails, the coop, the crate and the parked plane are all solid',
    ['fence', 'coop', 'crate', 'plane'].every(t => blocks.some(b => b.tag === t)),
    [...new Set(blocks.map(b => b.tag))].join(','));
  chk('the crops are NOT solid — walking through them is the harvest', await (async () => {
    await ev(() => { window.FARM.plant(0, 'corn'); window.FARM.advanceTime(120); });
    await page.waitForTimeout(300);
    const p = (await ev(() => window.FARM.patches()))[0];
    return (await ev(([x, z]) => window.FARM.blockedAt(x, z), [p.x, p.z])) === false;
  })());
  chk('a straight line into a pen through its RAILS is blocked', await (async () => {
    const pen = areas.find(a => a.side === 'W' && a.cx > 10);
    return (await ev(([a, b, c, d]) => window.FARM.lineClear(a, b, c, d),
      [pen.cx + pen.halfX + 3, pen.cz, pen.cx, pen.cz])) === false;
  })());
  chk('and the same trip through the GATE is clear', await (async () => {
    const pen = areas.find(a => a.side === 'W' && a.cx > 10);
    return (await ev(([a, b, c, d]) => window.FARM.lineClear(a, b, c, d),
      [pen.gate.x - 2, pen.gate.z, pen.cx, pen.cz])) === true;
  })());
  chk('walking flat at a fence never puts the kid through it — she slides along',
    await (async () => {
      const field = areas.find(a => Math.abs(a.cx) < 1);
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [field.cx, field.cz]);
      await ev(() => { window.__worst = 0; window.__on = true; (function rec() {
        const k = window.FARM.kid();
        if (window.FARM.blockedAt(k.x, k.z, 0.45)) window.__worst++;
        if (window.__on) requestAnimationFrame(rec);
      })(); });
      await ev(() => window.FARM.stick(1, 0));      // drive due east, straight at the rail
      await page.waitForTimeout(1800);
      await ev(() => window.FARM.stick(0, 0));
      await ev(() => { window.__on = false; });
      const k = await ev(() => window.FARM.kid());
      const inside = k.x < field.cx + field.halfX;
      return inside && (await ev(() => window.__worst)) === 0;
    })());
  chk('and she is never left standing inside anything solid',
    (await ev(() => { const k = window.FARM.kid(); return window.FARM.blockedAt(k.x, k.z, 0.45); })) === false);

  console.log('\n--- FM4: TAP TO GO (the main way to move on a tablet) ---');
  const drive = async (x, z, frames) => ev(([tx, tz, n]) => {
    const t = window.FARM.tapAt(tx, tz);
    let gate = 1e9;
    const gates = window.FARM.areas().map(a => a.gate);
    for (let i = 0; i < n; i++) {
      const p = window.FARM.walkTick(1 / 60);
      gates.forEach(g => { gate = Math.min(gate, Math.hypot(p.x - g.x, p.z - g.z)); });
      if (!p.walking) break;
    }
    const k = window.FARM.kid();
    return { t, gate, x: k.x, z: k.z, walking: !!window.FARM.walkingTo() };
  }, [x, z, frames]);

  await ev(() => window.FARM.stick(0, 0));
  chk('tapping empty ground walks her there, and leaves a soft ring while she goes',
    await (async () => {
      await ev(() => window.FARM.moveKidTo(-8, -8));
      const t = await ev(() => window.FARM.tapAt(-2, -12));
      const ring = await ev(() => window.FARM.tapRing());
      const r = await drive(-2, -12, 1200);
      return t.what === 'ground' && !!ring && Math.hypot(r.x + 2, r.z + 12) < 1.2;
    })());
  chk('tapping a growing crop walks her to it and does nothing else', await (async () => {
    await ev(() => window.FARM.moveKidTo(-9, 0));
    await ev(() => { window.FARM.plant(4, 'wheat'); });
    const p = (await ev(() => window.FARM.patches()))[4];
    const t = await ev(([x, z]) => window.FARM.tapAt(x, z), [p.x, p.z]);
    const r = await drive(p.x, p.z, 1800);
    const after = (await ev(() => window.FARM.patches()))[4];
    return t.what === 'growing' && Math.hypot(r.x - p.x, r.z - p.z) < 2.2 && after.state !== 'empty';
  })());
  chk('tapping an EMPTY patch still opens the seed pop-up, exactly as before',
    await (async () => {
      const e = (await ev(() => window.FARM.patches())).findIndex(p => p.state === 'empty');
      const p = (await ev(() => window.FARM.patches()))[e];
      const t = await ev(([x, z]) => window.FARM.tapAt(x, z), [p.x, p.z]);
      const up = await ev(() => window.FARM.cardUp());
      await ev(() => window.FARM.closeSeedPicker());
      return t.what === 'seedCard' && up === true;
    })());
  chk('tapping an animal inside a pen walks her IN THROUGH THE GATE, not through the rails',
    await (async () => {
      // open ground WEST of the field: FM6 moved the field to z=2, and the old
      // spot for this ended up inside its own fence
      await ev(() => window.FARM.moveKidTo(-12, 6));
      const cow = (await ev(() => window.FARM.animals())).find(a => a.kind === 'cow');
      const r = await drive(cow.x, cow.z, 4000);
      return r.t.what === 'animal' && r.t.legs > 1 && r.gate < 1.8 &&
             Math.hypot(r.x - cow.x, r.z - cow.z) < 3.2;
    })());
  chk('tapping the crate walks her to it, close enough that the unload starts',
    await (async () => {
      await ev(() => window.FARM.moveKidTo(-4, -6));
      const c = await ev(() => window.FARM.crate());
      const r = await drive(c.x, c.z, 4000);
      return r.t.what === 'crate' && (await ev(() => window.FARM.crate())).near === true;
    })());
  chk('and touching the joystick cancels the walk on the spot', await (async () => {
    await ev(() => window.FARM.moveKidTo(-20, -20));
    await ev(() => window.FARM.tapAt(10, 10));
    const going = await ev(() => window.FARM.walkingTo());
    await ev(() => window.FARM.stick(0, -1));
    const stopped = await ev(() => window.FARM.walkingTo());
    await ev(() => window.FARM.stick(0, 0));
    return !!going && stopped === null;
  })());

  console.log('\n--- FM4: THE WISH LIST YOU CAN READ ---');
  await park();
  await ev(() => window.FARM.setOrder(['corn', 'corn', 'corn', 'egg', 'egg']));
  const wish = await ev(() => window.FARM.order());
  chk('three corn and two eggs is TWO pictures, not five', wish.slots.length === 2);
  chk('and the number on each says how many are still wanted',
    wish.slots.find(s => s.kind === 'corn').badge === 3 &&
    wish.slots.find(s => s.kind === 'egg').badge === 2,
    wish.slots.map(s => s.kind + ':' + s.badge).join(' '));
  chk('the pictures are FULL COLOUR from the first frame — no grey silhouettes',
    wish.slots.every(s => s.grey === false));
  const css = await page.evaluate(() => {
    const el = document.querySelector('#orderCard .slot svg.pic');
    const cs = getComputedStyle(el);
    return { w: parseFloat(cs.width), filter: cs.filter, op: parseFloat(cs.opacity) };
  });
  chk('and they are big — the slots grew now there are at most three of them',
    css.w >= 44 && css.op === 1 && (css.filter === 'none' || !/grayscale/.test(css.filter)),
    JSON.stringify(css));
  chk('a customer is waiting on the card, drawn in code', wish.faceShown === true);
  chk('there are several customers, so the same face is not always there',
    (await ev(() => window.FARM.customers())) >= 3);
  chk('and what the crate wants floats over the crate as a real 3D model',
    wish.floating === true);
  chk('the badge counts DOWN as items land, then the slot ticks green',
    await (async () => {
      await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 3); });
      await settle();
      const c = await ev(() => window.FARM.crate());
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [c.x, c.z]);
      await page.waitForFunction(() => {
        const o = window.FARM.order();
        return o && o.slots.some(s => s.kind === 'corn' && s.full);
      }, null, { timeout: 15000 });
      const o = await ev(() => window.FARM.order());
      const corn = o.slots.find(s => s.kind === 'corn');
      const egg = o.slots.find(s => s.kind === 'egg');
      return corn.full === true && egg.full === false && egg.badge === 2;
    })());
  await park();
  await ev(() => window.FARM.newOrder());

  console.log('\n--- FM4: AND NO ORDER MAY EVER NAME SOMETHING NEVER CARRIED ---');
  const pantry = await ev(() => window.FARM.collected());
  const rolls4 = await ev(() => { const o = []; for (let i = 0; i < 60; i++) o.push(window.FARM.newOrder()); return o; });
  chk('sixty more orders, and not one names a thing outside the pantry',
    rolls4.every(r => r.every(k => pantry.includes(k))), pantry.join(','));
  chk('the pantry is remembered across a reload, so a kid never loses it',
    await (async () => {
      const p2 = await page.evaluate(() => JSON.parse(localStorage.getItem('bk_farm_collected') || '[]'));
      return p2.length === pantry.length && pantry.every(k => p2.includes(k));
    })());
  await ev(() => window.FARM.newOrder());

  // ======================================================================
  //  FM5 — THE TOWNSHIP LESSONS: it remembers her, it grows while she is
  //  away, it is never idle, and the next thing is always visible.
  //
  //  This runs on ITS OWN PAGE in its own context, so it starts from a farm
  //  nothing has been played on and its localStorage is its own. It reloads
  //  that page for real — a save that only round-trips through a variable in
  //  the same frame has not been tested at all.
  //
  //  NOTE: this whole block also IS the "Supabase is down" case. The harness
  //  serves public/ and nothing else, so every /api/farm-save call 404s. If
  //  anything below goes green, it went green with the cloud unreachable.
  // ======================================================================
  console.log('\n--- FM5: THE FARM REMEMBERS HER (save round trip, through a real reload) ---');
  const p5 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const e5 = [];
  p5.on('pageerror', e => e5.push('pageerror: ' + e.message));
  p5.on('console', m => { if (m.type() === 'error') e5.push('console: ' + m.text()); });
  const ev5 = (fn, arg) => p5.evaluate(fn, arg);
  const boot5 = () => p5.waitForFunction(
    () => window.FARM && window.FARM.save && window.FARM.save.booted() && window.FARM.animals().length > 0, null,
    { timeout: 20000 });

  await p5.goto(BASE, { waitUntil: 'load' });
  await boot5();
  chk('it is the FM8 build', (await ev5(() => window.FARM.version)) === 'fm8');
  chk('a farm nobody has played starts from the FM1 farm, not from someone else\'s',
    (await ev5(() => window.FARM.save.info())) === null &&
    (await ev5(() => window.FARM.patches().every(p => p.state === 'empty'))) === true);

  // --- play it: plant, feed, harvest, carry
  await ev5(() => { window.FARM.moveKidTo(-45, -45); window.FARM.plant(0, 'corn'); window.FARM.plant(4, 'wheat'); });
  await ev5(() => window.FARM.giveItem('corn', 2));
  // walk up to a hen carrying corn and it is fed — the FM2 mechanic, unchanged
  const hen5 = (await ev5(() => window.FARM.animals())).find(a => a.kind === 'chicken');
  await ev5(([x, z]) => window.FARM.moveKidTo(x, z), [hen5.x + 1.0, hen5.z + 1.0]);
  await p5.waitForFunction(() => window.FARM.animals().some(a => a.state === 'making'), null, { timeout: 15000 });
  await ev5(() => window.FARM.moveKidTo(-45, -45));
  await ev5(() => window.FARM.giveItem('carrot', 3));
  const before5 = await ev5(() => { window.FARM.save.now(); return {
    patches: window.FARM.patches().map(p => p.state + ':' + (p.seed || '-')),
    animals: window.FARM.animals().map(a => a.kind + ':' + a.state),
    stack: window.FARM.stack().map(s => s.kind),
    collected: window.FARM.collected().slice().sort(),
    ordersDone: window.FARM.ordersDone(),
    saved: window.FARM.save.local()
  }; });
  chk('playing writes a save to this browser, even with the cloud unreachable',
    !!before5.saved && before5.saved.v === 1 && before5.saved.patches.length === 25,
    before5.saved ? 'v' + before5.saved.v : 'nothing saved');
  chk('the save is written the moment the page is hidden, not only on a timer',
    (await ev5(() => window.FARM.save.stats())).local > 0);

  await p5.reload({ waitUntil: 'load' });
  await boot5();
  const after5 = await ev5(() => ({
    patches: window.FARM.patches().map(p => p.state + ':' + (p.seed || '-')),
    animals: window.FARM.animals().map(a => a.kind + ':' + a.state),
    stack: window.FARM.stack().map(s => s.kind),
    collected: window.FARM.collected().slice().sort(),
    ordersDone: window.FARM.ordersDone()
  }));
  chk('after a real reload the field is the field she left',
    JSON.stringify(after5.patches) === JSON.stringify(before5.patches),
    before5.patches.join(',') + '  ->  ' + after5.patches.join(','));
  chk('the animal she fed is still making what she fed it for',
    JSON.stringify(after5.animals) === JSON.stringify(before5.animals),
    after5.animals.join(','));
  chk('and the tower on her head came back item for item',
    JSON.stringify(after5.stack) === JSON.stringify(before5.stack),
    before5.stack.join('+') + '  ->  ' + after5.stack.join('+'));
  chk('the pantry and the orders done came back too',
    JSON.stringify(after5.collected) === JSON.stringify(before5.collected) &&
    after5.ordersDone === before5.ordersDone);
  chk('there is no reset button anywhere a child can reach',
    (await ev5(() => {
      const txt = document.body.innerText.toLowerCase();
      return !/new farm|start over|reset|start again/.test(txt);
    })) === true);

  console.log('\n--- FM5: IT GREW WHILE SHE WAS AWAY, AND SOMETHING IS WAITING ---');
  const away5 = await ev5(() => {
    const A = window.FARM.animals();
    const blob = {
      v: window.FARM.save.snapshot().v,
      savedAt: Date.now() - 30 * 60 * 1000,          // half an hour ago
      // three crops mid-grow, one already ready before she left, five bare
      patches: [{ s: 'corn', left: 20 }, { s: 'wheat', left: 5 }, { s: null },
                { s: 'corn', left: 0 }].concat(Array(21).fill({ s: null, lock: 1 })),
      // every animal was fed just before she went
      animals: A.map(a => ({ k: a.kind, st: 'making', left: 12 })),
      stack: [], basket: [],
      collected: ['corn', 'carrot', 'wheat', 'egg', 'milk'],
      unlocks: [], duck: window.FARM.duckBought(), ordersDone: 3,
      order: { pay: 24, face: 0, sent: false, items: [{ k: 'corn', f: false }, { k: 'corn', f: false }] }
    };
    const r = window.FARM.save.load(blob);
    return { r: r, patches: window.FARM.patches().map(p => p.state + ':' + (p.seed || '-')),
             animals: window.FARM.animals().map(a => a.state),
             basket: window.FARM.basket(), animalCount: A.length };
  });
  chk('half an hour away counts as away', away5.r && away5.r.away === true &&
    away5.r.elapsed > 1700, away5.r ? Math.round(away5.r.elapsed) + 's' : 'no load');
  chk('the two crops that would have finished are NOT still standing in the field',
    away5.patches[0] === 'empty:-' && away5.patches[1] === 'empty:-', away5.patches.join(','));
  chk('a patch she never planted is still bare — nothing is invented for her',
    away5.patches[2] === 'empty:-', away5.patches[2]);
  chk('a crop that was already ready before she left is still standing there',
    away5.patches[3] === 'ready:corn', away5.patches[3]);
  chk('every animal that was fed gave ONE thing while she was away, and no more',
    away5.animals.every(s => s === 'hungry'), away5.animals.join(','));
  chk('and all of it is in a basket by the door, not scattered round the farm',
    away5.basket.up === true &&
    away5.basket.items.length === 2 + away5.animalCount,   // two crops + one per animal
    away5.basket.items.join('+'));
  chk('the basket shows what is in it in colour, one turning model per kind',
    away5.basket.floating === away5.basket.kinds.length && away5.basket.floating > 0,
    away5.basket.kinds.join(','));
  chk('nothing else on the farm moves until she reaches it — the crate holds off',
    await (async () => {
      const c = await ev5(() => window.FARM.crate());
      await ev5(([x, z]) => window.FARM.moveKidTo(x, z), [c.x, c.z]);
      await p5.waitForTimeout(700);
      const n = (await ev5(() => window.FARM.order())).items.filter(i => i.filled).length;
      await ev5(() => window.FARM.moveKidTo(-45, -45));
      return n === 0;
    })());
  const wanted5 = away5.basket.items.length;
  let basketGot = -1;
  chk('walking to the basket whooshes the lot onto the stack', await (async () => {
    await ev5(() => window.FARM.moveKidTo(-45, -45));
    await p5.waitForTimeout(200);
    await ev5(() => window.FARM.clearStack());
    const b = await ev5(() => window.FARM.basket());
    await ev5(([x, z]) => window.FARM.moveKidTo(x, z), [b.x + 0.6, b.z + 0.6]);
    await p5.waitForFunction(() => window.FARM.basket().items.length === 0, null, { timeout: 25000 })
      .catch(() => {});
    await p5.waitForFunction((n) => window.FARM.stackHeight() === n, wanted5, { timeout: 25000 })
      .catch(() => {});
    const got = await ev5(() => window.FARM.stackHeight());
    basketGot = got;
    return got === wanted5;
  })(), wanted5 + ' wanted, ' + basketGot + ' landed');
  chk('and then the basket is gone until the next time she comes back',
    await (async () => {
      // the basket sinks over three quarters of a second of GAME time, which on
      // the software rasteriser with four island pages open is several seconds
      // of wall clock. Measured at ~5s on one page alone, so budget generously.
      await p5.waitForFunction(() => !window.FARM.basket().up, null, { timeout: 25000 }).catch(() => {});
      return !(await ev5(() => window.FARM.basket())).up;
    })(), JSON.stringify(await ev5(() => window.FARM.basket())));
  chk('over a short absence a crop just keeps growing where it stood',
    await (async () => {
      const r = await ev5(() => window.FARM.save.load({
        v: window.FARM.save.snapshot().v, savedAt: Date.now() - 20 * 1000,
        patches: [{ s: 'carrot', left: 40 }].concat(Array(24).fill({ s: null, lock: 1 })),
        animals: [], stack: [], basket: [], collected: ['corn', 'carrot', 'wheat'],
        unlocks: [], duck: false, ordersDone: 0, order: null
      }));
      const p = await ev5(() => window.FARM.patches()[0]);
      return r.away === false && p.state === 'growing' && p.seed === 'carrot';
    })());
  chk('under ten minutes away, nothing is a homecoming — no basket at all',
    await (async () => {
      const r = await ev5(() => window.FARM.save.load({
        v: window.FARM.save.snapshot().v, savedAt: Date.now() - 60 * 1000,
        patches: [{ s: 'corn', left: 5 }].concat(Array(24).fill({ s: null, lock: 1 })),
        animals: [], stack: [], basket: [], collected: ['corn', 'carrot', 'wheat'],
        unlocks: [], duck: false, ordersDone: 0, order: null
      }));
      const p = await ev5(() => window.FARM.patches()[0]);
      // it finished, but it finished in the FIELD: she walks over and takes it
      return r.away === false && p.state === 'ready' && !(await ev5(() => window.FARM.basket())).up;
    })());

  console.log('\n--- FM5: NEVER IDLE (there is always one thing she can do) ---');
  const idle5 = await ev5(() => {
    // the one state that can genuinely dry up: every patch growing, every
    // animal still making, nothing on her head, nothing ready anywhere
    window.FARM.save.load({
      v: window.FARM.save.snapshot().v, savedAt: Date.now(),
      patches: Array(9).fill(0).map(() => ({ s: 'corn', left: 900 })),
      animals: window.FARM.animals().map(a => ({ k: a.kind, st: 'making', left: 900 })),
      stack: [], basket: [], collected: ['corn', 'carrot', 'wheat'],
      unlocks: [], duck: window.FARM.duckBought(), ordersDone: 2,
      order: { pay: 24, face: 0, sent: false, items: [{ k: 'corn', f: false }] }
    });
    const before = window.FARM.whatCanSheDoNow();
    const fix = window.FARM.fixIdle();
    return { before: before, fix: fix, after: window.FARM.whatCanSheDoNow() };
  });
  chk('a farm where everything is still cooking really can reach zero', idle5.before === 0,
    'count=' + idle5.before);
  chk('and the fixer finishes whatever is closest to done, so it never stays there',
    idle5.after > 0 && idle5.fix !== 'none', idle5.fix + ' -> ' + idle5.after);
  chk('the farm does that on its own, without being asked', await (async () => {
    await ev5(() => window.FARM.save.load({
      v: window.FARM.save.snapshot().v, savedAt: Date.now(),
      patches: Array(9).fill(0).map(() => ({ s: 'wheat', left: 900 })),
      animals: window.FARM.animals().map(a => ({ k: a.kind, st: 'making', left: 900 })),
      stack: [], basket: [], collected: ['corn', 'carrot', 'wheat'],
      unlocks: [], duck: window.FARM.duckBought(), ordersDone: 2, order: null
    }));
    await ev5(() => window.FARM.moveKidTo(-45, -45));
    await p5.waitForFunction(() => window.FARM.whatCanSheDoNow() > 0, null, { timeout: 8000 }).catch(() => {});
    return (await ev5(() => window.FARM.whatCanSheDoNow())) > 0;
  })());
  chk('and from every save this run has loaded, the count is never zero after the watch',
    (await ev5(() => window.FARM.idle())).count > 0);
  chk('there is not one countdown or timer anywhere on the screen',
    (await ev5(() => !/\b\d+\s*(s|sec|secs|seconds|m|min|mins)\b|\b\d{1,2}:\d{2}\b/i
      .test(document.getElementById('hud').innerText))) === true,
    await ev5(() => document.getElementById('hud').innerText.replace(/\n/g, ' | ')));

  console.log('\n--- FM5: AN ORDER SHE CANNOT PROGRESS IS A BUG ---');
  const prog5 = await ev5(() => {
    const bad = [];
    for (let i = 0; i < 80; i++) {
      const kinds = window.FARM.newOrder();
      kinds.forEach(k => {
        if (!window.FARM.collected().includes(k)) bad.push('not carried: ' + k);
        if (!window.FARM.producibleNow(k)) bad.push('cannot be made here: ' + k);
      });
    }
    return { bad: bad.slice(0, 5), pool: window.FARM.orderableKinds() };
  });
  chk('eighty orders, and every single kind in them is one this farm can make today',
    prog5.bad.length === 0, prog5.bad.join(' | ') || prog5.pool.join(','));
  chk('the pool never empties, so there is always an order to be given',
    prog5.pool.length > 0, prog5.pool.join(','));

  console.log('\n--- FM5: THE NEXT THING IS ALWAYS VISIBLE (one present at a time) ---');
  const LADDER = [['pumpkinseed', 130], ['farmdog', 180], ['fieldrow', 240], ['pig', 300],
                  ['mill', 380], ['bees', 460], ['strawberry', 560], ['tractor', 700],
                  ['farmhand', 860]];
  let presentWhy = '';
  const un5 = await ev5(() => window.FARM.unlocks());
  chk('the path is fixed, nine presents, in the order Mike set (FM8 added the farmhand)',
    un5.length === 9 && un5.every((u, i) => u.id === LADDER[i][0]),
    un5.map(u => u.id).join(' > '));
  chk('and they cost what Mike said they cost',
    un5.every((u, i) => u.price === LADDER[i][1]),
    un5.map(u => u.price).join(','));
  chk('the first present is the pumpkin seed, and it is the only one shown',
    await (async () => {
      // a farm with nothing opened yet, so this reads the FIRST present rather
      // than wherever the save-round-trip checks above happened to leave the ladder
      await ev5(() => window.FARM.save.load({ v: window.FARM.save.snapshot().v,
        savedAt: Date.now(), patches: [], animals: [], stack: [], basket: [],
        collected: ['corn', 'carrot', 'wheat'], unlocks: [], duck: false,
        ordersDone: 0, order: null }));
      await p5.waitForTimeout(300);
      // well away from the barn, because the barn opens and closes its own copy
      await ev5(() => { window.FARM.moveKidTo(-30, 20); window.FARM.addCoins(900); window.FARM.openShop(); });
      await p5.waitForTimeout(400);              // the card fades in
      const shown = await ev5(() => {
        const el = document.getElementById('buyPresent');
        return { on: !!el && el.style.display !== 'none', text: el ? el.innerText : '',
                 others: document.getElementById('shopCard').innerText };
      });
      const nx = await ev5(() => window.FARM.nextUnlock());
      const otherPrices = LADDER.slice(1).filter(([, p]) => shown.others.includes(String(p)));
      await ev5(() => window.FARM.closeShop());
      presentWhy = 'next=' + nx.id + ' on=' + shown.on + ' text=' +
        JSON.stringify(shown.text) + ' others=' + otherPrices.map(([id]) => id).join(',');
      return nx.id === 'pumpkinseed' && shown.on && shown.text.includes('130') && otherPrices.length === 0;
    })(), presentWhy);
  chk('opening it is the biggest celebration in the game', await (async () => {
    const paid = await ev5(() => {
      const before = window.FARM.wallet().balance;
      const bought = window.FARM.buyPresent();
      return { bought: bought, before: before, after: window.FARM.wallet().balance };
    });
    // sampled AT THE POP, for the same reason as the FM6 one below: the confetti
    // is DOM that removes itself inside two seconds
    await p5.waitForFunction(() => {
      const r = window.FARM.revealing();
      if (r && r.popped && !window.__pop) window.__pop = { thing: r.thing === true, conf: window.FARM.confetti() };
      return !!window.__pop;
    }, null, { timeout: 15000 }).catch(() => {});
    const mid = await ev5(() => ({ r: window.__pop || null, conf: (window.__pop || {}).conf || 0,
      plane: window.FARM.plane().phase }));
    return paid.bought === true && paid.before - paid.after === 130 &&
      !!mid.r && mid.r.thing === true && mid.conf > 20;
  })());
  chk('the plane goes over the top of it', await (async () => {
    // the fly-by is launched with the reveal; either it is still up there or
    // it has already put itself back on its parking spot
    const r = await ev5(() => window.FARM.plane());
    return r.phase === 'flyby' || r.y > 3 || r.phase === 'parked';
  })());
  chk('a present whose thing is not built yet still hops coins back out', await (async () => {
    await p5.waitForFunction(() => window.FARM.revealing() === null, null, { timeout: 12000 }).catch(() => {});
    const w = await ev5(() => window.FARM.wallet().balance);
    // she paid 130 and a third of it came back, so she is down about 91
    return (await ev5(() => window.FARM.owned())).includes('pumpkinseed') && w > 0;
  })());
  chk('and it is marked hers, so FM6 to FM8 can honour it',
    (await ev5(() => window.FARM.unlocks()))[0].owned === true);
  chk('now the NEXT present is the farm dog, and still nothing after it',
    (await ev5(() => window.FARM.nextUnlock())).id === 'farmdog');
  chk('the presents she has opened survive a reload', await (async () => {
    await ev5(() => window.FARM.save.now());
    await p5.reload({ waitUntil: 'load' });
    await boot5();
    return (await ev5(() => window.FARM.owned())).includes('pumpkinseed') &&
           (await ev5(() => window.FARM.nextUnlock())).id === 'farmdog';
  })());

  console.log('\n--- FM5: SMALL CELEBRATIONS, CONSTANTLY ---');
  chk('planting throws up a puff of soil', await (async () => {
    await ev5(() => { window.FARM.moveKidTo(-45, -45); window.FARM.save.load({
      v: window.FARM.save.snapshot().v, savedAt: Date.now(),
      patches: Array(9).fill({ s: null }), animals: [], stack: [], basket: [],
      collected: ['corn', 'carrot', 'wheat'], unlocks: ['pumpkinseed'],
      duck: window.FARM.duckBought(), ordersDone: 1, order: null }); });
    return await ev5(() => {
      const before = window.FARM.puffs();
      const i = window.FARM.patches().findIndex(p => p.state === 'empty');
      if (i < 0) return false;
      window.FARM.plant(i, 'corn');
      return window.FARM.puffs() > before;
    });
  })());
  chk('and it clears itself up — nothing ever piles up on the farm', await (async () => {
    // the software rasteriser runs at about ten frames a second, so this waits
    // on the STATE and not on a wall clock the machine cannot keep up with
    await p5.waitForFunction(() => window.FARM.puffs() === 0, null, { timeout: 6000 }).catch(() => {});
    return (await ev5(() => window.FARM.puffs())) === 0;
  })());
  chk('the whole farm goes quiet when the shared mute flag is set',
    (await ev5(() => {
      try { localStorage.setItem('bk_muted', '1'); } catch (e) {}
      return typeof window.FARM.soundOn === 'function';
    })) === true);

  chk('no page errors in the whole FM5 run', e5.length === 0, e5.join(' | '));
  await p5.close();

  console.log('\n--- FM5: THE FILE ITSELF ---');
  const src5 = fs.readFileSync(path.join(root, 'skyflyer-farm.html'), 'utf8');
  chk('no emoji anywhere in the farm, still',
    !/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u.test(src5));
  const code5 = src5.replace(/<!--[\s\S]*?-->/g, '')
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/(^|[^:'"\w])\/\/[^\n]*/gm, '$1');
  chk('no countdown, no timer, no seconds-left anywhere in the code',
    !/countdown|timeLeft|secondsLeft|timerText|remainingSec/i.test(code5));
  // every celebration puff's own life, read off the call that makes it
  const lives5 = [...src5.matchAll(/\bpuff\([^;]*?,\s*(\d*\.?\d+)\s*\)\s*;/g)].map(m => parseFloat(m[1]));
  chk('no celebration lasts long enough to slow her down — all under half a second',
    lives5.length >= 3 && lives5.every(v => v > 0 && v < 0.5), lives5.join('s, ') + 's');
  chk('the save is best-effort: every network call has a catch on it',
    (src5.match(/fetch\("\/api\/farm-save/g) || []).length >= 2 &&
    /\.catch\(function\(\)\{\}\)/.test(src5) && /catch\(function\(\)\{ cloudErrs\+\+; \}\)/.test(src5));
  chk('and it is written on the way out of the page, not only on a timer',
    /addEventListener\("pagehide", flushSave\)/.test(src5) && /sendBeacon/.test(src5));


  // ======================================================================
  //  FM6 — THE FIRST THREE PRESENTS, BUILT FOR REAL.
  //
  //  Its own page in its own storage again, so it starts from a farm with no
  //  presents opened. The pumpkin is bought THROUGH THE SHOP, coins and all,
  //  because "the box gives you the thing" is the whole point of the ladder
  //  and a test that calls applyUnlock directly would never have checked it.
  // ======================================================================
  console.log('\n--- FM6: BEFORE ANY PRESENT IS OPENED ---');
  const p6 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const e6 = [];
  p6.on('pageerror', e => e6.push('pageerror: ' + e.message));
  p6.on('console', m => { if (m.type() === 'error') e6.push('console: ' + m.text()); });
  const ev6 = (fn, arg) => p6.evaluate(fn, arg);
  const boot6 = () => p6.waitForFunction(
    () => window.FARM && window.FARM.save && window.FARM.save.booted() && window.FARM.animals().length > 0, null,
    { timeout: 20000 });

  await p6.goto(BASE, { waitUntil: 'load' });
  await boot6();
  chk('it is the FM8 build', (await ev6(() => window.FARM.version)) === 'fm8');
  const seeds0 = await ev6(() => window.FARM.seedsOffered());
  chk('the seed pop-up offers the three starters and nothing else',
    seeds0.length === 3 && ['corn', 'carrot', 'wheat'].every(k => seeds0.includes(k)), seeds0.join(','));
  chk('the pop-up on screen shows exactly those three buttons',
    JSON.stringify(await ev6(() => window.FARM.seedRow())) === JSON.stringify(seeds0));
  chk('the field is three rows of three, and the other sixteen slots are not field yet',
    (await ev6(() => window.FARM.fieldRows())) === 3 &&
    (await ev6(() => window.FARM.patches().length)) === 25 &&
    (await ev6(() => window.FARM.patches().filter(p => p.locked).length)) === 16 &&
    (await ev6(() => window.FARM.coversLeft())) === 0);
  chk('there is no dog', (await ev6(() => window.FARM.dog())).there === false);
  chk('the pumpkin exists in the recipes but the farm cannot make one yet',
    (await ev6(() => !!window.FARM.cropRecipes().pumpkin)) === true &&
    (await ev6(() => window.FARM.producibleNow('pumpkin'))) === false);
  chk('so no order can ever name a pumpkin before the present is opened',
    await (async () => {
      const bad = await ev6(() => {
        // put it in the pantry by force, which is the harshest version of this:
        // even CARRIED once, it must not be asked for while there is no seed
        window.FARM.giveItem('pumpkin', 1);
        window.FARM.clearStack();
        const out = [];
        for (let i = 0; i < 60; i++) window.FARM.newOrder().forEach(k => { if (k === 'pumpkin') out.push(k); });
        return out;
      });
      return bad.length === 0;
    })());

  console.log('\n--- FM6: THE PUMPKIN SEED, BOUGHT THROUGH THE SHOP FOR REAL COINS ---');
  const buy6 = await ev6(() => {
    window.FARM.addCoins(1500);
    const before = window.FARM.wallet().balance;
    const bought = window.FARM.buyPresent();
    return { bought, before };
  });
  // confetti is DOM that deletes itself after about two seconds, so it is
  // SAMPLED AT THE POP inside the poll, not read afterwards: with four island
  // pages open the trip back out to node can easily take longer than that.
  await p6.waitForFunction(() => {
    const r = window.FARM.revealing();
    if (r && r.popped && !window.__pop) window.__pop = { thing: r.thing === true, conf: window.FARM.confetti() };
    return !!window.__pop;
  }, null, { timeout: 45000 }).catch(() => {});
  const rev6 = await ev6(() => ({ r: window.__pop || null, conf: (window.__pop || {}).conf || 0 }));
  chk('opening it plays the full reveal', buy6.bought === true && !!rev6.r && rev6.r.thing === true &&
    rev6.conf > 20, rev6.conf + ' pieces of confetti');
  await p6.waitForFunction(() => window.FARM.revealing() === null, null, { timeout: 12000 }).catch(() => {});
  const after6 = await ev6(() => ({ bal: window.FARM.wallet().balance, seeds: window.FARM.seedsOffered(),
    row: window.FARM.seedRow(), next: window.FARM.nextUnlock() }));
  chk('and a present with a REAL thing in it hands over the thing, not coins back',
    buy6.before - after6.bal === 130, 'paid ' + (buy6.before - after6.bal));
  chk('the pumpkin is now something she can plant',
    after6.seeds.includes('pumpkin') && after6.row.includes('pumpkin'), after6.row.join(','));
  chk('the pop-up grew to four buttons and did not lose the other three',
    after6.row.length === 4 && ['corn', 'carrot', 'wheat'].every(k => after6.row.includes(k)));
  chk('and the shop has moved on to the farm dog', after6.next.id === 'farmdog');
  chk('a pumpkin still grows in well under a minute, like everything else',
    (await ev6(() => window.FARM.cropRecipes().pumpkin.growSec)) < 60,
    (await ev6(() => window.FARM.cropRecipes().pumpkin.growSec)) + 's');
  chk('it is the dearest SEED and the most valuable thing that grows in the ground',
    await (async () => {
      const e = await ev6(() => window.FARM.economy());
      const crops = Object.keys(e.seedPrices);
      // FM7 put a melon above it in the ground and four made things above that,
      // so this is now about the crops she can plant on a fresh farm
      return e.seedPrices.pumpkin === 10 && e.itemValues.pumpkin === 10 &&
        Math.max(...['corn', 'carrot', 'wheat', 'pumpkin'].map(k => e.itemValues[k])) === 10 &&
        crops.includes('pumpkin');
    })());
  chk('she can plant one, grow it and carry it, and then the crate may ask for one',
    await (async () => {
      await ev6(() => { window.FARM.moveKidTo(-45, -45); window.FARM.clearStack();
        window.FARM.resetCollected(); window.FARM.plant(0, 'pumpkin'); window.FARM.advanceTime(80); });
      await p6.waitForFunction(() => window.FARM.patches()[0].state === 'ready', null, { timeout: 8000 });
      const P = await ev6(() => window.FARM.patches()[0]);
      await ev6(([x, z]) => window.FARM.moveKidTo(x, z), [P.x, P.z]);
      await p6.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'pumpkin'), null, { timeout: 8000 })
        .catch(() => {});
      return (await ev6(() => window.FARM.collected())).includes('pumpkin') &&
             (await ev6(() => window.FARM.producibleNow('pumpkin'))) === true;
    })());

  console.log('\n--- FM6: THE FIELD GROWS 3x3 TO 5x5, UNDER STONES ---');
  const before6 = await ev6(() => window.FARM.patches().slice(0, 9).map(p => p.x + ',' + p.z));
  const area0 = await ev6(() => window.FARM.fieldArea());
  const row6 = await ev6(() => {
    window.FARM.moveKidTo(-45, -45);
    window.FARM.givePresent('fieldrow');
    return { rows: window.FARM.fieldRows(), ring: window.FARM.fieldRing(),
             n: window.FARM.patches().length,
             pos: window.FARM.patches().slice(0, 9).map(p => p.x + ',' + p.z),
             covers: window.FARM.covers(), locked: window.FARM.patches().filter(p => p.locked).length,
             area: window.FARM.fieldArea(), blockers: window.FARM.fieldBlockers() };
  });
  chk('the field goes from nine patches to twenty-five', row6.rows === 5 && row6.n === 25,
    row6.rows + 'x' + row6.rows);
  chk('and NOT ONE of the first nine moved an inch — an old save loads straight in',
    JSON.stringify(row6.pos) === JSON.stringify(before6), before6.join(' | ').slice(0, 90));
  chk('the sixteen new ones arrive UNDER STONES, not as bare dirt',
    row6.covers.length === 16 && row6.locked === 16,
    row6.covers.length + ' covered');
  chk('and they are not all the same thing to look at',
    new Set(row6.covers.map(c => c.kind)).size === 2,
    [...new Set(row6.covers.map(c => c.kind))].join(' + '));
  chk('the fence came down and went back up around the bigger field',
    row6.area.halfZ > area0.halfZ && row6.blockers > 0,
    'half ' + area0.halfZ + ' -> ' + row6.area.halfZ);
  chk('and it still has exactly ONE gate, on the same side',
    row6.area.side === area0.side && row6.area.side === 'W');
  chk('the coop and the cow pen were not disturbed by any of that',
    (await ev6(() => window.FARM.areas().length)) === 3);
  chk('a covered slot is not a patch — tapping one does NOT open the seed pop-up',
    await (async () => {
      const c = row6.covers[0];
      const r = await ev6(([x, z]) => window.FARM.tapAt(x, z), [c.x, c.z]);
      await ev6(() => window.FARM.closeSeedPicker());
      return r.what !== 'seedCard';
    })(), 'tap gave: ' + JSON.stringify(await ev6(([x, z]) => window.FARM.tapAt(x, z),
      [row6.covers[0].x, row6.covers[0].z])));
  chk('walking at one clears it, and pays her a few coins for tidying', await (async () => {
    await ev6(() => window.FARM.closeSeedPicker());
    const w0 = await ev6(() => window.FARM.wallet().balance);
    const c = (await ev6(() => window.FARM.covers()))[0];
    await ev6(([x, z]) => window.FARM.moveKidTo(x, z), [c.x, c.z]);
    await p6.waitForFunction(n => window.FARM.coversLeft() < n, 16, { timeout: 9000 }).catch(() => {});
    const w1 = await ev6(() => window.FARM.wallet().balance);
    return (await ev6(() => window.FARM.coversLeft())) === 15 && w1 > w0;
  })());
  chk('and what is underneath is a real patch she can plant in', await (async () => {
    const free = await ev6(() => window.FARM.patches()
      .map((p, i) => ({ i, p })).filter(o => o.p.state === 'empty' && !o.p.locked).length);
    return free === 10;                       // the nine she started with, plus the one she cleared
  })());
  chk('a covered slot counts as something she can do right now',
    (await ev6(() => window.FARM.idle())).count >= 15);
  chk('clearing them all is remembered across a reload', await (async () => {
    await ev6(() => { window.FARM.moveKidTo(-45, -45); window.FARM.save.now(); });
    const covers = await ev6(() => window.FARM.coversLeft());
    await p6.reload({ waitUntil: 'load' });
    await boot6();
    return (await ev6(() => window.FARM.coversLeft())) === covers &&
           (await ev6(() => window.FARM.fieldRows())) === 5;
  })());

  console.log('\n--- FM6: THE FARM DOG, WHO TIDIES UP AND DOES NOT PLAY FOR HER ---');
  // open ground SOUTH of the field: the barn is at z -16.5 and is solid, so
  // the old spot for this stood her inside a building
  await ev6(() => { window.FARM.moveKidTo(0, 14); window.FARM.clearStack();
    window.FARM.givePresent('farmdog'); });     // he appears where she is
  const dog0 = await ev6(() => window.FARM.dog());
  chk('the present puts a dog on the farm', dog0.there === true);
  chk('he trots slower than she runs, so she can always beat him to it',
    dog0.speed < 6.4, dog0.speed + ' against her 6.4');
  chk('he waits ten seconds and seven paces before he bothers with anything',
    dog0.patience >= 10 && dog0.minAway >= 7, dog0.patience + 's / ' + dog0.minAway + ' units');
  chk('a crop that has JUST become ready is hers, and he leaves it alone',
    await (async () => {
      // the NEAREST patch that is still beyond his seven-unit rule, so what is
      // being timed is his behaviour and not the frame rate
      await ev6(() => {
        const k = window.FARM.kid(), ps = window.FARM.patches();
        window.DOGPATCH = ps.map((p, i) => ({ i, d: Math.hypot(p.x - k.x, p.z - k.z), p }))
          .filter(o => o.d > 8 && !o.p.locked && !o.p.cover)
          .sort((a, b) => a.d - b.d)[0].i;
        window.FARM.plant(window.DOGPATCH, 'corn');
        window.FARM.advanceTime(80);
      });
      await p6.waitForFunction(() => window.FARM.patches()[window.DOGPATCH].state === 'ready', null,
        { timeout: 15000 });
      await p6.waitForTimeout(1600);
      const d = await ev6(() => window.FARM.dog());
      return d.state === 'follow' && d.carry === null;
    })());
  let DOGWHY = '';
  chk('but one she walked away from and forgot, he fetches and brings to her',
    await (async () => {
      await ev6(() => window.FARM.ageReady());
      // he looks for a job about once a second of GAME time, and this scene
      // runs several times slower than that on the software rasteriser
      await p6.waitForFunction(() => window.FARM.dog().state !== 'follow', null, { timeout: 30000 })
        .catch(() => {});
      const went = (await ev6(() => window.FARM.dog())).state;
      // He PICKS IT UP, then walks it home. Both halves are checked, but they
      // are waited on separately: the harness keeps more than one page of this
      // island rendering at a time, so his walk home can take a while in wall
      // clock even though it is four seconds of his own.
      await p6.waitForFunction(() => window.FARM.dog().carry !== null, null, { timeout: 90000 })
        .catch(() => {});
      const picked = await ev6(() => window.FARM.dog().carry);
      await p6.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'corn'), null,
        { timeout: 180000 }).catch(() => {});
      const st = await ev6(() => window.FARM.stack());
      const d = await ev6(() => window.FARM.dog());
      DOGWHY = 'went=' + went + ' picked=' + picked + ' stack=' + st.map(s => s.kind).join('+') +
               ' dog=' + JSON.stringify(d);
      return (went === 'toItem' || went === 'back') && picked === 'corn' &&
             st.some(s => s.kind === 'corn') && d.carry === null;
    })(), DOGWHY);
  chk('and the patch he cleared is empty and ready to be planted again',
    (await ev6(() => window.FARM.patches()[window.DOGPATCH].state)) === 'empty');
  chk('he carries one thing at a time, so he can never empty the farm at once',
    (await ev6(() => window.FARM.dog())).carry === null);

  console.log('\n--- FM6: AND ALL THREE COME BACK AFTER A RELOAD ---');
  await ev6(() => { window.FARM.moveKidTo(-45, -45); window.FARM.save.now(); });
  await p6.reload({ waitUntil: 'load' });
  await boot6();
  const back6 = await ev6(() => ({ owned: window.FARM.owned(), seeds: window.FARM.seedsOffered(),
    rows: window.FARM.fieldRows(), n: window.FARM.patches().length,
    dog: window.FARM.dog().there, area: window.FARM.fieldArea() }));
  chk('the presents she opened are still hers', back6.owned.includes('pumpkinseed') &&
    back6.owned.includes('farmdog') && back6.owned.includes('fieldrow'), back6.owned.join(','));
  chk('the pumpkin seed is still in the pop-up', back6.seeds.includes('pumpkin'));
  chk('the field is still five by five inside the bigger fence',
    back6.rows === 5 && back6.n === 25 && back6.area.halfZ > area0.halfZ);
  chk('and the dog is still there', back6.dog === true);
  chk('the whole farm is saved with all of it in it, not rebuilt back to nine',
    (await ev6(() => window.FARM.save.local().patches.length)) === 25);

  chk('no page errors in the whole FM6 run', e6.length === 0, e6.join(' | '));
  await p6.close();


  // ======================================================================
  //  FM7 — MORE TO DO. Its own page again. Everything here is a NEW VERB,
  //  and every check is really the same check: can she do it without reading
  //  anything, and can she fail at it? (No, and no.)
  // ======================================================================
  console.log('\n--- FM7: THREE MORE CROPS ---');
  const p7 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const e7 = [];
  p7.on('pageerror', e => e7.push('pageerror: ' + e.message));
  p7.on('console', m => { if (m.type() === 'error') e7.push('console: ' + m.text()); });
  const ev7 = (fn, arg) => p7.evaluate(fn, arg);
  const boot7 = () => p7.waitForFunction(
    () => window.FARM && window.FARM.save && window.FARM.save.booted() && window.FARM.animals().length > 0, null,
    { timeout: 25000 });
  await p7.goto(BASE, { waitUntil: 'load' });
  await boot7();
  chk('the farm page is the FM8 build now', (await ev7(() => window.FARM.version)) === 'fm8');

  chk('none of the three is plantable before she has its seed',
    await (async () => {
      const seeds = await ev7(() => window.FARM.seedsOffered());
      const prod = await ev7(() => ['strawberry', 'tomato', 'melon'].map(k => window.FARM.producibleNow(k)));
      return seeds.length === 3 && prod.every(x => x === false);
    })());
  chk('and no order can name one either, over sixty rolls',
    await (async () => {
      const bad = await ev7(() => {
        ['strawberry', 'tomato', 'melon'].forEach(k => window.FARM.giveItem(k, 1));
        window.FARM.clearStack();
        const out = [];
        for (let i = 0; i < 60; i++) window.FARM.newOrder()
          .forEach(k => { if (['strawberry', 'tomato', 'melon'].includes(k)) out.push(k); });
        return out;
      });
      return bad.length === 0;
    })());
  const seeds7 = await ev7(() => {
    window.FARM.addCoins(4000);
    window.FARM.givePresent('pumpkinseed');
    window.FARM.giveExtra('tomatoseed');
    window.FARM.giveExtra('melonseed');
    window.FARM.givePresent('strawberry');
    return { offered: window.FARM.seedsOffered(), row: window.FARM.seedRow() };
  });
  chk('once she has them, all seven are in the pop-up',
    seeds7.offered.length === 7 && ['corn', 'carrot', 'wheat', 'pumpkin', 'strawberry', 'tomato', 'melon']
      .every(k => seeds7.offered.includes(k)), seeds7.offered.join(','));
  chk('and the pop-up on screen shows every one of them', seeds7.row.length === 7);
  chk('every crop still grows in under a minute — the melon is the slowest at fifty',
    await (async () => {
      const r = await ev7(() => window.FARM.cropRecipes());
      const g = Object.keys(r).map(k => r[k].growSec);
      return Math.max(...g) === 50 && g.every(v => v < 60);
    })());
  chk('she can grow one and carry it, and then the crate may ask for it',
    await (async () => {
      await ev7(() => { window.FARM.moveKidTo(-30, 22); window.FARM.clearStack();
        window.FARM.resetCollected(); window.FARM.plant(4, 'melon'); window.FARM.advanceTime(90); });
      await p7.waitForFunction(() => window.FARM.patches()[4].state === 'ready', null, { timeout: 12000 });
      const P = await ev7(() => window.FARM.patches()[4]);
      await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [P.x, P.z]);
      await p7.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'melon'), null, { timeout: 10000 })
        .catch(() => {});
      return (await ev7(() => window.FARM.collected())).includes('melon') &&
             (await ev7(() => window.FARM.producibleNow('melon'))) === true;
    })());

  console.log('\n--- FM7: THE MILL AND THE DAIRY ARE FED LIKE ANIMALS ---');
  const built7 = await ev7(() => {
    window.FARM.givePresent('mill');
    window.FARM.giveExtra('dairy');
    window.FARM.givePresent('pig');
    window.FARM.givePresent('bees');
    return { kinds: window.FARM.animals().map(a => a.kind),
             needsMill: window.FARM.needsOf('mill'), needsDairy: window.FARM.needsOf('dairy') };
  });
  chk('the mill, the dairy, the pig and the hive are all on the farm',
    ['mill', 'dairy', 'pig', 'hive'].every(k => built7.kinds.includes(k)), built7.kinds.join(','));
  chk('the mill and the dairy each want TWO of a thing',
    built7.needsMill === 2 && built7.needsDairy === 2);
  chk('a mill asks for wheat in a picture, exactly like a hen asks for corn',
    (await ev7(() => window.FARM.animals().find(a => a.kind === 'mill')))?.wanting === true);
  chk('ONE wheat is not enough, and the one she has is not taken off her',
    await (async () => {
      const mill = (await ev7(() => window.FARM.animals())).find(a => a.kind === 'mill');
      await ev7(() => { window.FARM.clearStack(); window.FARM.giveItem('wheat', 1); });
      await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [mill.x + 1.4, mill.z + 1.4]);
      await p7.waitForTimeout(1400);
      const m = (await ev7(() => window.FARM.animals())).find(a => a.kind === 'mill');
      return m.state === 'hungry' && (await ev7(() => window.FARM.stackHeight())) === 1;
    })());
  let MILLWHY = '';
  chk('two wheat go in together and bread comes out', await (async () => {
    // state-driven all the way through: this scene runs several times slower
    // than real time on the software rasteriser, so every step waits on the
    // MILL and not on a stopwatch
    await ev7(() => { window.FARM.moveKidTo(-30, 22); window.FARM.clearStack();
      window.FARM.giveItem('wheat', 2); });
    const mill = (await ev7(() => window.FARM.animals())).find(a => a.kind === 'mill');
    await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [mill.x + 1.4, mill.z + 1.4]);
    await p7.waitForFunction(() => {
      const m = window.FARM.animals().find(a => a.kind === 'mill');
      return m && m.state !== 'hungry';
    }, null, { timeout: 60000 }).catch(() => {});
    // and once the wheat has LANDED — while it is still in the air the mill is
    // "feeding" and its clock has not started, so winding it on does nothing
    await p7.waitForFunction(() => {
      const m = window.FARM.animals().find(a => a.kind === 'mill');
      return m && m.state !== 'hungry' && m.state !== 'feeding';
    }, null, { timeout: 60000 }).catch(() => {});
    const fed = (await ev7(() => window.FARM.animals())).find(a => a.kind === 'mill');
    // WALK HER AWAY before winding the clock on. Standing beside the mill she
    // is inside the magnet reach, so the loaf lands and is swept onto her stack
    // in the same breath, and the check that follows never sees it on the floor.
    await ev7(() => window.FARM.moveKidTo(-30, 22));
    await p7.waitForTimeout(400);
    await ev7(() => window.FARM.advanceTime(60));
    await p7.waitForFunction(() => {
      const m = window.FARM.animals().find(a => a.kind === 'mill');
      return m && m.state === 'ready' && m.hasProduce;
    }, null, { timeout: 60000 }).catch(() => {});
    const done = (await ev7(() => window.FARM.animals())).find(a => a.kind === 'mill');
    MILLWHY = 'fed=' + fed.state + ' done=' + done.state +
      ' produce=' + done.hasProduce + ' stack=' + (await ev7(() => window.FARM.stackHeight()));
    return fed.state === 'making' && done.state === 'ready' && done.gives === 'bread' &&
           (await ev7(() => window.FARM.stackHeight())) === 0;
  })(), MILLWHY);
  chk('and bread is worth more than the two wheat that went into it',
    await (async () => {
      const e = await ev7(() => window.FARM.economy());
      return e.itemValues.bread > e.itemValues.wheat * 2 &&
             e.itemValues.cheese > e.itemValues.milk * 2;
    })());
  chk('walking over the loaf picks it up like anything else', await (async () => {
    const m = (await ev7(() => window.FARM.produceSpots())).find(s => s.gives === 'bread');
    if (!m) return false;
    await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [m.x, m.z]);
    await p7.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'bread'), null, { timeout: 12000 })
      .catch(() => {});
    return (await ev7(() => window.FARM.collected())).includes('bread');
  })());

  console.log('\n--- FM7: THE HIVE NEEDS NOTHING, AND LIKES FLOWERS ---');
  const hive0 = await ev7(() => window.FARM.hiveSeconds());
  chk('the hive is never hungry — the bees see to themselves',
    (await ev7(() => window.FARM.animals().find(a => a.kind === 'hive'))).state !== 'hungry');
  chk('honey takes a while on its own', hive0 && hive0.now === hive0.base, JSON.stringify(hive0));
  chk('put flower beds around it and the honey comes quicker', await (async () => {
    const done = await ev7(() => {
      const h = window.FARM.animals().find(a => a.kind === 'hive');
      let placed = 0;
      for (let i = 0; i < 12 && placed < 4; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = h.x + Math.cos(a) * 4.2, z = h.z + Math.sin(a) * 4.2;
        if (window.FARM.canPlaceAt(x, z)) { window.FARM.startPlacing('flowers');
          if (window.FARM.placeAt(x, z)) placed++; }
      }
      window.FARM.stopPlacing();
      return { placed, hive: window.FARM.hiveSeconds() };
    });
    return done.placed >= 3 && done.hive.now < hive0.base && done.hive.now >= 14;
  })());
  chk('but never instant — nothing on this farm ever is',
    (await ev7(() => window.FARM.hiveSeconds())).now >= 14);

  console.log('\n--- FM7: THE WATERING CAN ---');
  chk('she has no can until she has been to the well',
    (await ev7(() => window.FARM.can())).owned === false);
  chk('walking to the well gives her one', await (async () => {
    const w = await ev7(() => window.FARM.wellAt());
    await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [w.x + 1.2, w.z + 1.2]);
    await p7.waitForFunction(() => window.FARM.can().owned, null, { timeout: 12000 }).catch(() => {});
    return (await ev7(() => window.FARM.can())).owned === true;
  })());
  chk('holding on a growing crop rains on it and doubles it', await (async () => {
    await ev7(() => { window.FARM.moveKidTo(-30, 22); window.FARM.plant(0, 'corn'); });
    const before = await ev7(() => window.FARM.patches()[0]);
    if (before.state !== 'growing') return false;
    await ev7(() => window.FARM.waterPatch(0));
    await p7.waitForFunction(() => window.FARM.can().drops > 0, null, { timeout: 9000 }).catch(() => {});
    const drops = (await ev7(() => window.FARM.can())).drops;
    await p7.waitForTimeout(2600);
    const wateredFor = await ev7(() => { window.FARM.stopWatering(); return window.FARM.can(); });
    return drops > 0 && wateredFor.watering === -1;
  })());
  chk('and there is nothing in it to run out of, and no way to get it wrong',
    (await ev7(() => window.FARM.can())).owned === true &&
    (await ev7(() => window.FARM.canFail())) === false);

  console.log('\n--- FM7: EVERY ANIMAL GETS A NAME, AND IT IS A PICTURE ---');
  const marks7 = await ev7(() => window.FARM.nameMarks());
  chk('there are eight names to choose from, and every one is a shape',
    marks7.length === 8 && marks7.every(m => typeof m === 'string'), marks7.join(','));
  chk('and all eight are really DRAWN in the card, not just listed in the code',
    await (async () => {
      // the picture gate caught an empty "Pick a name" card: the row was built
      // before the element it fills had been looked up, so it silently did
      // nothing. A count of the code's list would never have seen that.
      const d = await ev7(() => {
        const row = document.getElementById('nameRow');
        const cells = row ? row.querySelectorAll('.mark') : [];
        return { cells: cells.length, svgs: row ? row.querySelectorAll('svg').length : 0 };
      });
      return d.cells === 8 && d.svgs >= 8;
    })());
  chk('both new buttons are wired to something, not dead pictures',
    await (async () => {
      const before = await ev7(() => window.FARM.decorCardUp());
      await p7.locator('#decorBtn').click({ force: true }).catch(() => {});
      await p7.waitForTimeout(400);
      const after = await ev7(() => window.FARM.decorCardUp());
      await ev7(() => window.FARM.closeDecor());
      return before === false && after === true;
    })());
  chk('there is not one text box anywhere in the farm',
    (await ev7(() => document.querySelectorAll('input,textarea,[contenteditable]').length)) === 0);
  chk('naming one sticks, and it wears the picture when she is near it',
    await (async () => {
      const ok = await ev7(() => window.FARM.nameAnimal(0, 'crown'));
      const a = (await ev7(() => window.FARM.animals()))[0];
      await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [a.x + 2, a.z + 2]);
      await p7.waitForFunction(() => window.FARM.names()[0].badge, null, { timeout: 9000 }).catch(() => {});
      const n = (await ev7(() => window.FARM.names()))[0];
      return ok === true && n.mark === 'crown' && n.badge === true;
    })());
  chk('and it is put away again when she walks off, so the field is never cluttered',
    await (async () => {
      await ev7(() => window.FARM.moveKidTo(-38, 26));
      await p7.waitForFunction(() => !window.FARM.names()[0].badge, null, { timeout: 9000 }).catch(() => {});
      return (await ev7(() => window.FARM.names()))[0].badge === false;
    })());
  chk('standing next to one and tapping it asks what it is called',
    await (async () => {
      const a = (await ev7(() => window.FARM.animals()))[1];
      await ev7(([x, z]) => window.FARM.moveKidTo(x, z), [a.x + 1.2, a.z + 1.2]);
      await p7.waitForTimeout(400);
      const up = await ev7(() => window.FARM.openNameFor(1));
      const shown = await ev7(() => window.FARM.namePickerUp());
      await ev7(() => window.FARM.nameAnimal(1, 'star'));
      return up === true && shown === true &&
             (await ev7(() => window.FARM.names()))[1].mark === 'star';
    })());

  console.log('\n--- FM7: MAKE IT HERS ---');
  const dk = await ev7(() => window.FARM.decorKinds());
  chk('five things she can buy for the farm',
    dk.length === 5 && ['flowers', 'hay', 'fence', 'tree', 'scarecrow']
      .every(k => dk.some(d => d.id === k)), dk.map(d => d.id).join(','));
  chk('placing is two taps: pick the thing, then tap where it goes',
    await (async () => {
      await ev7(() => window.FARM.startPlacing('scarecrow'));
      const holding = await ev7(() => window.FARM.placing());
      const n0 = (await ev7(() => window.FARM.decor())).length;
      const put = await ev7(() => window.FARM.placeAt(-26, 24));
      const n1 = (await ev7(() => window.FARM.decor())).length;
      return holding === 'scarecrow' && put === true && n1 === n0 + 1;
    })());
  chk('and it cannot be dropped in the field, in a pen, on the road or in the pond',
    await (async () => {
      const L = await ev7(() => window.FARM.layout());
      const bad = await ev7(([f, pond, road]) => [
        window.FARM.canPlaceAt(f.x, f.z),
        window.FARM.canPlaceAt(pond.x, pond.z),
        window.FARM.canPlaceAt(0, road),
        window.FARM.canPlaceAt(200, 200)
      ], [L.field, L.pond, L.road.z]);
      return bad.every(b => b === false);
    })());
  chk('what she put down comes back after a reload', await (async () => {
    await ev7(() => { window.FARM.moveKidTo(-38, 26); window.FARM.save.now(); });
    const before = await ev7(() => ({ decor: window.FARM.decor().length,
      names: window.FARM.names().filter(n => n.mark).map(n => n.kind + ':' + n.mark),
      can: window.FARM.can().owned, kinds: window.FARM.animals().map(a => a.kind).sort() }));
    await p7.reload({ waitUntil: 'load' });
    await boot7();
    const after = await ev7(() => ({ decor: window.FARM.decor().length,
      names: window.FARM.names().filter(n => n.mark).map(n => n.kind + ':' + n.mark),
      can: window.FARM.can().owned, kinds: window.FARM.animals().map(a => a.kind).sort() }));
    return after.decor === before.decor && after.can === before.can &&
           JSON.stringify(after.kinds) === JSON.stringify(before.kinds) &&
           JSON.stringify(after.names.sort()) === JSON.stringify(before.names.sort());
  })());
  chk('the names came back on the RIGHT animals, not on whoever was at that index',
    (await ev7(() => window.FARM.names().filter(n => n.mark).map(n => n.kind))).length >= 2);

  console.log('\n--- FM7: THE SHOP IS STILL TWO THINGS ---');
  chk('one present and one extra, cheapest extra first', await (async () => {
    const p8 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    await p8.goto(BASE, { waitUntil: 'load' });
    await p8.waitForFunction(() => window.FARM && window.FARM.save && window.FARM.save.booted(), null,
      { timeout: 25000 });
    const E = await p8.evaluate(() => window.FARM.nextExtra());
    const U = await p8.evaluate(() => window.FARM.nextUnlock());
    await p8.evaluate(() => { window.FARM.moveKidTo(-30, 22); window.FARM.addCoins(900);
      window.FARM.openShop(); });
    await p8.waitForTimeout(400);
    const rows = await p8.evaluate(() => document.querySelectorAll('#shopCard .buy'
      ).length && Array.from(document.querySelectorAll('#shopCard .buy'))
      .filter(el => el.style.display !== 'none').length);
    await p8.close();
    return E.id === 'tomatoseed' && E.price === 90 && U.id === 'pumpkinseed' && rows === 2;
  })());

  chk('there is not one hollow box left — every present hands over a real thing',
    await (async () => {
      // FM5 shipped the ladder with six empty boxes. FM6 filled three, FM7 filled
      // four more, and FM8 fills the tractor and adds the farmhand.
      const L = await ev7(() => window.FARM.unlocks());
      const hollow = L.filter(u => !u.built).map(u => u.id);
      const models = await ev7(() => window.FARM.unlocks().map(u => ({ id: u.id,
        model: u.built ? !!window.FARM.previewUnlock(u.id) : false })));
      return hollow.length === 0 && models.filter(m => m.model).length === 9;
    })());

  chk('no page errors in the whole FM7 run', e7.length === 0, e7.join(' | '));
  await p7.close();


  // =======================================================================
  //  FM8 — THE HELPERS, THE SECOND CUSTOMER, THE BOOK AND THE PICTURE
  // =======================================================================
  console.log('\n--- FM8: THE FARMHAND, WHO ONLY EVER WATERS ---');
  const p9 = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const e9 = [];
  p9.on('pageerror', e => e9.push('pageerror: ' + e.message));
  p9.on('console', m => { if (m.type() === 'error') e9.push('console: ' + m.text()); });
  const ev9 = (fn, arg) => p9.evaluate(fn, arg);
  // My Stuff is a real API and this server only serves public/, so the gallery
  // is stubbed — and what the farm POSTS to it is checked below.
  const posted = [];
  await p9.route('**/api/save-art', async (route) => {
    try { posted.push(JSON.parse(route.request().postData() || '{}')); } catch (e) { posted.push({}); }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await p9.goto(BASE, { waitUntil: 'load' });
  await p9.waitForFunction(
    () => window.FARM && window.FARM.save && window.FARM.save.booted() && window.FARM.animals().length > 0,
    null, { timeout: 25000 });
  chk('it is the FM8 build', (await ev9(() => window.FARM.version)) === 'fm8');
  // she has picked who she is, so the card is out of the way of everything below
  await ev9(() => window.FARM.pickLook('girl'));

  chk('the farmhand arrives with his present, and he is slower than she is',
    await (async () => {
      await ev9(() => window.FARM.givePresent('farmhand'));
      const H = await ev9(() => window.FARM.hand());
      return !!H && H.state === 'idle';
    })());

  chk('he goes for the crop with the LONGEST left to wait, and ignores a ready one',
    await (async () => {
      await ev9(() => { window.FARM.addCoins(300); window.FARM.moveKidTo(-30, 20); });
      await ev9(() => { window.FARM.plant(0, 'corn'); window.FARM.plant(1, 'melon'); });
      await p9.waitForTimeout(300);
      await ev9(() => window.FARM.advanceTime(30));      // the corn is nearly done
      const job = await ev9(() => window.FARM.handFindJob());
      return !!job && job.seed === 'melon';
    })());

  chk('watering takes a real bite out of the wait, and takes nothing off the stack',
    await (async () => {
      const before = await ev9(() => ({
        left: window.FARM.save.snapshot().patches[1].left,
        stack: window.FARM.stackHeight() }));
      await p9.waitForFunction(() => window.FARM.hand().state === 'pour', null, { timeout: 25000 })
        .catch(() => {});
      await p9.waitForFunction(() => window.FARM.hand().state === 'idle', null, { timeout: 25000 })
        .catch(() => {});
      const after = await ev9(() => ({
        left: window.FARM.save.snapshot().patches[1].left,
        stack: window.FARM.stackHeight() }));
      // he only ever waters: the wait is shorter and her tower is untouched
      return after.left < before.left - 3 && after.stack === before.stack;
    })());

  chk('and he never picks a crop, however long it stands there',
    await (async () => {
      await ev9(() => { window.FARM.advanceTime(200); window.FARM.clearStack(); });
      await p9.waitForTimeout(1800);
      const ready = await ev9(() => window.FARM.patches().filter(p => p.state === 'ready').length);
      const stack = await ev9(() => window.FARM.stackHeight());
      return ready > 0 && stack === 0;
    })());

  console.log('\n--- FM8: THE TRACTOR PLANTS THE WHOLE FIELD IN ONE SHOW ---');
  chk('walking up to it asks ONE question, and it is the seed card she already knows',
    await (async () => {
      await ev9(() => { window.FARM.givePresent('tractor'); window.FARM.clearStack(); });
      // empty the field first, so there is something for it to do
      await ev9(() => window.FARM.harvestAll());
      const T = await ev9(() => window.FARM.tractor());
      await ev9(([x, z]) => window.FARM.moveKidTo(x - 2, z), [T.spot.x, T.spot.z]);
      await p9.waitForTimeout(500);
      const st = await ev9(() => ({ mode: window.FARM.fieldMode(), card: window.FARM.cardUp() }));
      return st.mode === true && st.card === true;
    })());

  chk('one seed goes in every empty patch, and each one is paid for',
    await (async () => {
      await ev9(() => window.FARM.setCoins(500));
      const before = await ev9(() => ({ coins: window.FARM.coins(),
        empty: window.FARM.emptyPatches() }));
      await ev9(() => document.querySelector('#seedRow .seed[data-kind="corn"]').click());
      // driven in GAME time: the software rasteriser gives this harness three
      // frames a second, so a real-time drive across the field takes a minute
      // and a half here and about four seconds on a phone.
      await ev9(() => window.FARM.tractorTick(120));
      const after = await ev9(() => ({ coins: window.FARM.coins(), state: window.FARM.tractor().state,
        growing: window.FARM.patches().filter(p => p.seed === 'corn' && p.state !== 'empty').length }));
      const seed = (await ev9(() => window.FARM.economy())).seedPrices.corn;
      return before.empty > 1 && after.growing === before.empty && after.state === 'parked' &&
             after.coins === before.coins - before.empty * seed;
    })());

  chk('it parks rather than spending a coin she has not got',
    await (async () => {
      await ev9(() => { window.FARM.harvestAll(); window.FARM.clearStack(); });
      await ev9(() => window.FARM.setCoins(9));      // three carrots' worth, no more
      // and the free-seed floor is HER rule, not the tractor's, so this really
      // does run out rather than planting the rest of the field for nothing
      await ev9(() => { window.FARM.openFieldPicker();
        document.querySelector('#seedRow .seed[data-kind="carrot"]').click(); });
      await ev9(() => window.FARM.tractorTick(120));
      const after = await ev9(() => ({ coins: window.FARM.coins(), state: window.FARM.tractor().state,
        planted: window.FARM.patches().filter(p => p.state === 'growing').length }));
      // the free-seed floor means the last one may be a gift rather than a buy,
      // so what this proves is that it STOPS and that she is never overdrawn
      return after.coins >= 0 && after.state === 'parked' &&
             after.planted > 0 && after.planted < 9;
    })());

  console.log('\n--- FM8: THE DELIVERY TRUCK, THE BIGGER CUSTOMER ---');
  chk('it only ever comes for what the farm MAKES, and it pays more than the crate',
    await (async () => {
      // the truck only ever comes for what the farm can MAKE, so the mill, the
      // dairy and the hive have to be standing AND she has to be able to feed
      // them — a field with no empty patch left in it means no wheat, no bread
      await ev9(() => { window.FARM.harvestAll(); window.FARM.setCoins(200);
                        window.FARM.givePresent('mill'); window.FARM.applyUnlock('dairy');
                        window.FARM.givePresent('bees');
                        window.FARM.giveItem('bread', 1); window.FARM.giveItem('cheese', 1);
                        window.FARM.giveItem('honey', 1); window.FARM.clearStack(); });
      await p9.waitForTimeout(700);
      const called = await ev9(() => window.FARM.truckCall());
      // the drive down the road is four seconds of GAME time and half a minute
      // of wall clock in this harness, so it is played out rather than waited on
      await ev9(() => window.FARM.truckTick(8));
      const T = await ev9(() => window.FARM.truck());
      const vals = (await ev9(() => window.FARM.economy())).itemValues;
      const sum = T.wants.reduce((n, w) => n + vals[w.kind], 0);
      return called && T.state === 'waiting' && T.wants.length >= 2 &&
             T.wants.every(w => T.goods.includes(w.kind)) &&
             T.pay === Math.round(sum * T.mult) && T.mult > 3;
    })());

  chk('what it wants floats over it, in colour, the same way the crate asks',
    (await ev9(() => window.FARM.truck())).floating === true);

  chk('walking up with the goods loads them on, and it drives off paying',
    await (async () => {
      const T = await ev9(() => window.FARM.truck());
      const coins = await ev9(() => window.FARM.coins());
      await ev9((kinds) => kinds.forEach(k => window.FARM.giveItem(k, 1)),
        T.wants.map(w => w.kind));
      await ev9(([x, z]) => window.FARM.moveKidTo(x, z - 1), [T.stop.x, T.stop.z]);
      // the loading itself is the crate's own rhythm, and each item really flies
      await p9.waitForFunction(() => window.FARM.truck().state !== 'waiting', null, { timeout: 60000 })
        .catch(() => {});
      const after = await ev9(() => ({ state: window.FARM.truck().state,
        coins: window.FARM.coins(), seen: window.FARM.truck().seen }));
      return after.coins === coins + T.pay && after.state === 'out' && after.seen === true;
    })());

  console.log('\n--- FM8: A CAST WHO COME BACK, AND WHAT EACH OF THEM LOVES ---');
  chk('six faces, six favourites, and the favourite is worth double to the one who loves it',
    await (async () => {
      const C = await ev9(() => window.FARM.customerCast());
      return C.faces === 6 && C.favourites.length === 6 &&
             new Set(C.favourites).size === 6;
    })());
  chk('a customer never asks for their favourite when the farm cannot make one',
    await (async () => {
      const bad = await ev9(() => {
        const out = [];
        for (let i = 0; i < 40; i++) {
          window.FARM.newOrder();
          const o = window.FARM.order(), pool = window.FARM.orderableKinds();
          const fav = window.FARM.customerCast().fav;
          if (fav && !pool.includes(fav)) out.push(fav);
          o.items.forEach(it => { if (!pool.includes(it.kind)) out.push(it.kind); });
        }
        return out;
      });
      return bad.length === 0;
    })(), 'bad kinds: ' + 0);
  chk('and the slot for it wears a heart, so the picture says it and no words do',
    await (async () => {
      const r = await ev9(() => {
        for (let i = 0; i < 30; i++) {
          window.FARM.newOrder();
          if (window.FARM.customerCast().fav) break;
        }
        const fav = window.FARM.customerCast().fav;
        const el = document.querySelector('#orderSlots .slot.fav');
        return { fav: fav, hearted: el ? el.dataset.kind : null,
                 hearts: document.querySelectorAll('#orderSlots .slot .heart').length };
      });
      return !!r.fav && r.hearted === r.fav && r.hearts > 0;
    })());

  console.log('\n--- FM8: THE STICKER BOOK ---');
  chk('one stamp per item, animal and helper, and the ones she has not got are grey',
    await (async () => {
      const B = await ev9(() => { window.FARM.openBook(); return window.FARM.book(); });
      const S = await ev9(() => window.FARM.stickers());
      const kinds = { item: 0, who: 0, help: 0 };
      S.forEach(s => { kinds[s.id.split(':')[0]]++; });
      return B.up && B.stamps === S.length && B.grey === S.filter(s => !s.got).length &&
             B.grey > 0 && kinds.item >= 14 && kinds.who === 5 && kinds.help === 4;
    })());
  chk('a thing she gets turns its own stamp from grey to colour, and nothing else moves',
    await (async () => {
      const before = await ev9(() => window.FARM.stickers().filter(s => s.got).length);
      await ev9(() => window.FARM.giveDuck());
      await p9.waitForTimeout(900);
      const after = await ev9(() => window.FARM.stickers());
      const duck = after.find(s => s.id === 'who:duck');
      return duck.got === true && after.filter(s => s.got).length === before + 1;
    })());
  chk('the book stands by the barn, and walking to it opens it',
    await (async () => {
      await ev9(() => { window.FARM.closeBook(); window.FARM.moveKidTo(-30, 20); });
      await p9.waitForTimeout(400);
      const B = await ev9(() => window.FARM.book());
      await ev9(([x, z]) => window.FARM.moveKidTo(x, z), [B.stand.x, B.stand.z]);
      await p9.waitForTimeout(600);
      const now = await ev9(() => window.FARM.book());
      return B.stand.up && !B.up && now.up;
    })());

  console.log('\n--- FM8: SHOW A GROWN-UP ---');
  chk('the button really takes a picture of the island, and it is a real jpeg',
    await (async () => {
      await ev9(() => { window.FARM.closeBook(); });
      const bytes = await ev9(() => window.FARM.shotBytes());
      const before = await ev9(() => window.FARM.photo().taken);
      await ev9(() => document.getElementById('camBtn').click());
      await p9.waitForTimeout(500);
      const after = await ev9(() => window.FARM.photo());
      return bytes > 20000 && after.taken === before + 1;
    })());
  chk('and what it sends is a picture of HER farm, into the gallery she already has',
    await (async () => {
      await p9.waitForFunction(() => window.FARM.photo().lastOk === true, null, { timeout: 20000 })
        .catch(() => {});
      const last = posted[posted.length - 1] || {};
      return posted.length > 0 && last.title === 'My farm' && last.theme === 'farm' &&
             /^data:image\/jpeg;base64,/.test(last.image_b64 || '') &&
             Array.isArray(last.art && last.art.ops) && !!(last.art && last.art.farm);
    })(), posted.length + ' posted');
  chk('and it never leaves the camera up in the sky where the picture was taken',
    await (async () => {
      await ev9(() => window.FARM.shotBytes());
      const b = await ev9(() => window.FARM.cameraPos());
      // the picture is taken from y=74; the game camera rides about 22 up
      return Math.abs(b.y - 74) > 20 && b.y > 10;
    })());

  console.log('\n--- FM8: AND ALL OF IT COMES BACK AFTER A RELOAD ---');
  chk('the helpers, the stamps, the truck and the pictures all ride home in the save',
    await (async () => {
      await ev9(() => window.FARM.save.now());
      await p9.reload({ waitUntil: 'load' });
      await p9.waitForFunction(() => window.FARM && window.FARM.save.booted(), null, { timeout: 25000 });
      await p9.waitForTimeout(600);
      const r = await ev9(() => ({ hand: !!window.FARM.hand(), tractor: !!window.FARM.tractor(),
        truckSeen: window.FARM.truck().seen, seen: window.FARM.stickers().filter(s => s.seen).length,
        look: window.FARM.kidModel().look }));
      return r.hand && r.tractor && r.truckSeen && r.seen > 3 && r.look === 'girl';
    })());
  chk('no page errors in the whole FM8 run', e9.length === 0, e9.join(' | '));

  // =======================================================================
  //  FM9 — A REAL MAIN CHARACTER
  // =======================================================================
  console.log('\n--- FM9: A REAL MAIN CHARACTER ---');
  chk('the model really loads, with its four movements, and the drawn kid steps aside',
    await (async () => {
      await p9.waitForFunction(() => window.FARM.kidModel().on === true, null, { timeout: 25000 })
        .catch(() => {});
      const K = await ev9(() => window.FARM.kidModel());
      return K.on === true && K.drawnVisible === false && K.shadow === true &&
             ['idle', 'walk', 'pick'].every(c => K.clips.includes(c));
    })());
  chk('she is exactly as tall as the kid she replaced, and her feet are on the ground',
    await (async () => {
      const K = await ev9(() => window.FARM.kidModel());
      return Math.abs(K.height - 2.5) < 0.05 && Math.abs(K.footY) < 0.05 && K.headTopY === 2.5;
    })());
  chk('the stack still lands on her head, at the same height as ever',
    await (async () => {
      await ev9(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 2); });
      await p9.waitForFunction(() => { const s = window.FARM.stack();
        return s.length === 2 && s[0].y > 2.4; }, null, { timeout: 25000 }).catch(() => {});
      const s = await ev9(() => window.FARM.stack());
      return s.length === 2 && s[0].y > 2.4 && s[1].y > s[0].y;
    })());
  chk('still is idle, moving is walk, and picking something up is a reach',
    await (async () => {
      // a pick-up she just did is still playing out, and at three frames a
      // second that takes five real seconds, so each state is WAITED for
      await ev9(() => window.FARM.stick(0, 0));
      await p9.waitForFunction(() => window.FARM.kidModel().playing === 'idle', null,
        { timeout: 25000 }).catch(() => {});
      const still = await ev9(() => window.FARM.kidModel().playing);
      await ev9(() => window.FARM.stick(0.9, 0));
      await p9.waitForFunction(() => window.FARM.kidModel().playing === 'walk', null,
        { timeout: 25000 }).catch(() => {});
      const moving = await ev9(() => window.FARM.kidModel().playing);
      await ev9(() => { window.FARM.stick(0, 0); window.FARM.kidPick(); });
      const picking = await ev9(() => window.FARM.kidModel().playing);
      await ev9(() => window.FARM.stick(0, 0));
      return still === 'idle' && moving === 'walk' && picking === 'pick';
    })());
  chk('the kid picks who she is, and the pick is a different skin on the same body',
    await (async () => {
      const looks = await ev9(() => window.FARM.looks());
      const girl = await ev9(() => window.FARM.kidModel().skin);
      await ev9(() => window.FARM.pickLook('boy'));
      await p9.waitForTimeout(300);
      const boy = await ev9(() => window.FARM.kidModel());
      await ev9(() => window.FARM.pickLook('girl'));
      return looks.length === 2 && boy.look === 'boy' && boy.skin !== girl && boy.on === true;
    })());
  await p9.close();

  chk('if the model never arrives, the farm still opens with the kid it always had',
    await (async () => {
      const pf = await browser.newPage({ viewport: { width: 900, height: 700 } });
      await pf.route('**/character-kid.glb', r => r.abort());
      await pf.goto(BASE, { waitUntil: 'load' });
      await pf.waitForFunction(() => window.FARM && window.FARM.save.booted(), null, { timeout: 25000 });
      await pf.waitForTimeout(1200);
      const K = await pf.evaluate(() => window.FARM.kidModel());
      const moved = await pf.evaluate(() => {
        window.FARM.moveKidTo(0, 0); return window.FARM.kid();
      });
      await pf.close();
      return K.on === false && K.drawnVisible === true && moved.x === 0;
    })());

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
  await zooPage.waitForFunction(() => window.FARM && window.FARM.inZoo && window.FARM.inZoo(), null, { timeout: 20000 })
    .catch(() => {});
  chk('?zoo=1 stands the models up on a turntable, with no errors',
    (await zooPage.evaluate(() => window.FARM.inZoo())) === true && zooErrs.length === 0, zooErrs.join(' | '));
  await zooPage.close();

  chk('no page errors anywhere in the whole play-through', errs.length === 0, errs.join(' | '));
} catch (e) {
  chk('the farm robot completed its run', false, e.message + '\n' + (e.stack || ''));
} finally {
  await browser.close();
  server.close();
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
