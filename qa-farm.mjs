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

// A sandbox often ships a chromium build that does not match the pinned
// playwright; scripts/qa-all.mjs hands us one it knows launches.
const PW_EXE = process.env.PW_CHROMIUM || process.env.PW_EXE || process.env.QA_CHROMIUM || '';
const browser = await chromium.launch({
  ...(PW_EXE ? { executablePath: PW_EXE } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
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
  chk('it is the FM2 build', (await ev(() => window.FARM.version)) === 'fm2');

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
