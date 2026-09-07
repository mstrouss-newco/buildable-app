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
  chk('it is the FM4 build', (await ev(() => window.FARM.version)) === 'fm4');

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
  await page.waitForFunction(() => { const o = window.FARM.order(); return o && o.full; }, { timeout: 15000 });
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
  await page.waitForFunction(() => window.FARM.plane().phase === 'parked', { timeout: 90000 });
  const w1 = await ev(() => window.FARM.wallet());
  chk('it came back and the coins landed in the shared wallet',
    w1.balance === 50 + ordF.pay, 'balance=' + w1.balance);
  chk('the pill shows the new balance', (await page.textContent('#coins')) === String(w1.balance));
  chk('one delivery is on the board', (await ev(() => window.FARM.ordersDone())) === 1);
  const ord2 = await ev(() => window.FARM.order());
  chk('a fresh order is already waiting, and nothing on it is filled in',
    !!ord2 && ord2.pay > 0 && ord2.items.every(i => !i.filled), 'pays ' + (ord2 && ord2.pay));
  chk('and its pay is three times what it is asking for', await (async () => {
    const e = await ev(() => window.FARM.economy());
    const want = ord2.items.reduce((t, i) => t + e.itemValues[i.kind], 0) * e.payMult;
    return ord2.pay === Math.max(6, Math.round(want));
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
  chk('but carry one home and NOW the crate may ask for it', await (async () => {
    await park();
    await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 2); });
    const d = (await ev(() => window.FARM.animals())).find(a => a.kind === 'duck');
    await ev(([x, z]) => window.FARM.moveKidTo(x, z), [d.x, d.z]);
    await page.waitForFunction(() => {
      const a = window.FARM.animals().find(x => x.kind === 'duck');
      return a && (a.state === 'making' || a.state === 'ready');
    }, { timeout: 15000 }).catch(() => {});
    await ev(() => window.FARM.advanceTime(40));
    await page.waitForFunction(() => window.FARM.stack().some(s => s.kind === 'duckegg'),
      { timeout: 20000 });
    return (await ev(() => window.FARM.orderableKinds())).includes('duckegg');
  })());

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
  chk('an egg left on the ground is collected within five seconds of walking up',
    await (async () => {
      await park();
      await ev(() => { window.FARM.clearStack(); window.FARM.giveItem('corn', 1); });
      const hen = (await ev(() => window.FARM.animals()))
        .find(a => a.kind === 'chicken' && a.state === 'hungry');
      if (!hen) return false;
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [hen.x, hen.z]);
      await page.waitForFunction(() => window.FARM.animals().some(a => a.state === 'making'),
        { timeout: 15000 }).catch(() => {});
      await ev(() => window.FARM.advanceTime(40));
      await page.waitForFunction(() => window.FARM.produceSpots().length > 0, { timeout: 20000 });
      const sp = (await ev(() => window.FARM.produceSpots()))[0];
      await park();
      const before = await ev(() => window.FARM.stackHeight());
      // stand a MAGNET's reach away, not on top of it — the near miss she kept making
      await ev(([x, z]) => window.FARM.moveKidTo(x, z), [sp.x + 3.6, sp.z]);
      // a generous wait, and then the five seconds is ASSERTED rather than
      // thrown: a starved machine should fail this one check, not abort the run
      const t0 = Date.now();
      await page.waitForFunction(n => window.FARM.stackHeight() > n, before, { timeout: 20000 })
        .catch(() => {});
      return (await ev(() => window.FARM.stackHeight())) > before && Date.now() - t0 < 5000;
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
      await ev(() => window.FARM.moveKidTo(-2, 6));
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
      }, { timeout: 15000 });
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
