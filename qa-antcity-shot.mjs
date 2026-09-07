// qa-antcity-shot.mjs — drive Ant City in a REAL browser and write pictures of it, so a
// human can look at the thing card AC5 is actually about: do the ants look like they mean
// it, does the colony read as a swarm, and does the game say what to do next.
//
// qa-antcity.mjs proves the rules hold. It cannot tell you whether an ant reads as an ant
// at the new small size, whether the goal strip is legible over the panel, or whether the
// pointing mark lands on the dirt. This can.
//
// Separate from qa-antcity.mjs on purpose — that one must stay dependency-free and always
// runnable. This needs Playwright and SKIPS loudly without it, so a session can never
// claim a check it did not really run. qa-all.mjs recognises the word "playwright" below
// and leaves this out unless you pass --with-browser.
//
// NOTE ON THE ART: the two worker poses (carrying, digging) come from /api/asset-studio,
// which only exists on the deployed site. Served locally they 404 and the engine's drawn
// ants stand in. The movement, the sizes, the guide and the layout are all still real;
// the glossy sprite is not there. The script says so at the end.
//
//   node qa-antcity-shot.mjs                 # writes to qa-shots/
//   node qa-antcity-shot.mjs --out /tmp/x
import fs from 'fs';
import path from 'path';
import http from 'http';

const args = process.argv.slice(2);
const OUT = (() => { const i = args.indexOf('--out'); return i >= 0 && args[i + 1] ? args[i + 1] : 'qa-shots'; })();

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { try { ({ chromium } = await import('playwright')); } catch {} }
if (!chromium) {
  console.log('SKIP  qa-antcity-shot needs Playwright, which is not installed.');
  process.exit(0);
}
const CANDIDATES = [process.env.BK_CHROME, '/opt/pw-browsers/chromium'].filter(Boolean);
const exe = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

const ROOT = path.resolve('public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') u = '/antcity-engine.html';
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((res) => srv.listen(0, res));
const URL_ = `http://127.0.0.1:${srv.address().port}/antcity-engine.html`;

fs.mkdirSync(OUT, { recursive: true });
let browser;
try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); }
catch (e) { console.log('SKIP  could not launch Chromium: ' + String((e && e.message) || e).split('\n')[0]); srv.close(); process.exit(0); }

const errs = [];
let missedArt = false, fail = 0;
const check = (label, ok, detail) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  ::  ' + detail : '')); if (!ok) fail++; };

const page = await browser.newPage({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|ERR_|404/.test(t)) { missedArt = true; return; }
  errs.push(t.slice(0, 200));
});
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.ANTCITY_GAME');
await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} ANTCITY_GAME._reset(); ANTCITY_GAME.play(); });
await page.waitForTimeout(700);

console.log('--- the guided first minute, in a real browser ---');
const g0 = await page.evaluate(() => ANTCITY_GAME.guide());
check('the guide is up on a brand new colony', g0.on && g0.step === 0, JSON.stringify(g0));
check('the one hint line carries the step', (await page.textContent('#coachText')).length > 8, await page.textContent('#coachText'));
// AC7: the rule human QA broke on. Count what a player can actually SEE.
const hintsUp = () => page.evaluate(() => [...document.querySelectorAll('[data-hint]')]
  .filter((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 0)
  .map((el) => el.textContent.trim()));
const seenTwice = [];
const watchHints = async (where) => { const h = await hintsUp(); if (h.length > 1) seenTwice.push(where + ': ' + h.join(' | ')); return h; };
check('exactly one hint is on screen at the start', (await watchHints('start')).length === 1, JSON.stringify(await hintsUp()));
// and the panel really is slim: it must not eat the dirt the guide is pointing at
const panelBox = await page.locator('#panel').boundingBox();
check('the jobs panel is a slim strip, not half the screen', panelBox.height < 860 * 0.32,
  `${Math.round(panelBox.height)}px of 860`);
await page.screenshot({ path: path.join(OUT, 'antcity-1-guide-dig.png') });

// AC8 says phone width first: the smart bar has to fit a small phone with nothing
// spilling off the side and the hint line still readable above it.
await page.setViewportSize({ width: 360, height: 640 });
await page.waitForTimeout(500);
const spill = await page.evaluate(() => ({
  w: document.documentElement.scrollWidth,
  bar: document.getElementById('smart').getBoundingClientRect(),
  panel: document.getElementById('panel').getBoundingClientRect(),
}));
check('nothing spills off the side of a small phone', spill.w <= 360, `${spill.w}px wide`);
check('the smart bar fits across a small phone', spill.bar.width <= 360 && spill.bar.width > 200, `${Math.round(spill.bar.width)}px`);
check('and the whole bottom stack stays out of the way on a small phone',
  spill.panel.height < 640 * 0.32, `${Math.round(spill.panel.height)}px of 640`);
await page.screenshot({ path: path.join(OUT, 'antcity-1b-small-phone.png') });
await page.setViewportSize({ width: 420, height: 860 });
await page.waitForTimeout(400);

// step one for real: drag down in the dirt with a finger, not through the API
const box = await page.locator('#cv').boundingBox();
const geo = await page.evaluate(() => ANTCITY_GAME._cfg());
const cw = box.width / geo.cols, sky = Math.max(96, Math.min(170, Math.round(box.height * 0.2)));
const dx = box.x + box.width / 2, dy = box.y + sky + 3.5 * cw;
await page.mouse.move(dx, dy); await page.mouse.down();
for (let i = 1; i <= 4; i++) { await page.mouse.move(dx, dy + i * cw); await page.waitForTimeout(60); }
await page.mouse.up();
await page.waitForTimeout(900);
const g1 = await page.evaluate(() => ANTCITY_GAME.guide());
check('dragging in the dirt really moves the guide on', g1.step === 1, JSON.stringify(g1));
await watchHints('after the drag');
check('the finished step is gone, and only the new one is up', (await hintsUp()).length === 1, JSON.stringify(await hintsUp()));
await page.screenshot({ path: path.join(OUT, 'antcity-2-guide-food.png') });

// step two, exactly as taught: tap the round button, then pick the apple. AC8 put
// the tool you are holding on screen, so this is the one new thing a kid learns.
check('the colony opens with the shovel in hand', (await page.evaluate(() => ANTCITY_GAME.tool())) === 'dig');
await page.locator('#actSwap').click();
await page.waitForTimeout(300);
check('the round button opens the toolbox', await page.locator('#tool_food').isVisible());
await page.screenshot({ path: path.join(OUT, 'antcity-2b-toolbox.png') });
await page.locator('#tool_food').click();
await page.waitForTimeout(500);
check('picking the apple puts it in your hand and puts the toolbox away',
  (await page.evaluate(() => ANTCITY_GAME.tool())) === 'food' && !(await page.locator('#tool_food').isVisible()));
check('the big button says what is in your hand',
  (await page.textContent('#actName')).trim() === 'Food' && /grass/i.test(await page.textContent('#actHint')));
await watchHints('after the swap');
const gSwap = await page.evaluate(() => ANTCITY_GAME.guide());
check('swapping really moves the guide on', gSwap.step === 2, JSON.stringify(gSwap));

// step three: tap the grass, now that the apple is in hand
await page.mouse.click(box.x + box.width * 0.3, box.y + sky - 45);
await page.waitForTimeout(900);
const g2 = await page.evaluate(() => ANTCITY_GAME.guide());
check('tapping the grass really moves it on again', g2.step === 3, JSON.stringify(g2));
await watchHints('after the tap');
check('a tap on the grass leaves a crumb you can see',
  (await page.evaluate(() => ANTCITY_GAME.items())).some((i) => i.kind === 'crumb'));
// in a live browser an ant may deliver at any moment, so the honest browser form of
// "a tap is not food" is: food only ever rose by what was actually carried in
{
  const b1 = await page.evaluate(() => ANTCITY_GAME.dbg());
  await page.mouse.click(box.x + box.width * 0.5, box.y + sky - 45);
  await page.waitForTimeout(120);
  const b2 = await page.evaluate(() => ANTCITY_GAME.dbg());
  check('a tap adds a crumb, never food: food only moved by what was delivered',
    (b2.food - b1.food) <= (b2.carried - b1.carried) + 0.001, `food +${(b2.food - b1.food).toFixed(2)}, carried +${(b2.carried - b1.carried).toFixed(2)}`);
}

// step four, exactly as taught: tap the plus on Foragers. The old step taught
// dragging the colour bar, which did nothing at all with a mouse.
check('the step that teaches the job cards opens them', await page.locator('#job_forager_up').isVisible());
await page.locator('#job_forager_up').click();
await page.waitForTimeout(900);
const g3 = await page.evaluate(() => ANTCITY_GAME.guide());
check('giving an ant a new job finishes the guide', g3.on === false, JSON.stringify(g3));
await watchHints('guide finished');
// the colour bar drags with a mouse, which is what a human tester could not do
const barBox = await page.locator('#bar').boundingBox();
const jobsWas = JSON.stringify(await page.evaluate(() => ANTCITY_GAME.dbg().jobs));
await page.mouse.move(barBox.x + barBox.width * 0.45, barBox.y + barBox.height / 2);
await page.mouse.down();
await page.mouse.move(barBox.x + barBox.width * 0.8, barBox.y + barBox.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
check('the colour bar really drags with a mouse',
  JSON.stringify(await page.evaluate(() => ANTCITY_GAME.dbg().jobs)) !== jobsWas,
  jobsWas + ' -> ' + JSON.stringify(await page.evaluate(() => ANTCITY_GAME.dbg().jobs)));

console.log('\n--- ants that mean it ---');
await page.evaluate(() => { ANTCITY_GAME.assign('digger', 4); ANTCITY_GAME.digDown(5); ANTCITY_GAME.drop('food', 120); ANTCITY_GAME.drop('food', 300); });
let sawDig = false, sawFood = false, sawCarry = false, sawSurface = false, dirt = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(200);
  const crowd = await page.evaluate(() => ANTCITY_GAME.crowd());
  if (crowd.some((a) => a.task === 'dig')) sawDig = true;
  if (crowd.some((a) => a.task === 'haul')) sawFood = true;
  if (crowd.some((a) => a.carry)) sawCarry = true;
  if (crowd.some((a) => a.fr < -0.2)) sawSurface = true;
  dirt += crowd.filter((a) => a.inDirt).length;
  if (sawDig && sawFood && sawCarry && sawSurface) break;
}
check('a digger goes to the drawn spot', sawDig);
check('a forager goes out for the crumb', sawFood);
check('it walks up and out onto the meadow', sawSurface);
check('and carries the crumb home', sawCarry);
check('nobody ever walks through solid dirt', dirt === 0, `${dirt} ant-frames in dirt`);
await page.screenshot({ path: path.join(OUT, 'antcity-3-ants-working.png') });

console.log('\n--- the swarm ---');
await page.evaluate(async () => {
  ANTCITY_GAME.assign('nursery', 3);
  const cols = ANTCITY_GAME._cfg().cols;
  for (let i = 0; i < 40; i++) {
    ANTCITY_GAME.drop('food', 80 + i * 5); ANTCITY_GAME.drop('water', 200);
    ANTCITY_GAME.digDown(3);                         // and rooms out sideways, the way a kid digs
    const r = Math.max(1, ANTCITY_GAME.dbg().deepest - 1);
    for (let c = 1; c < cols - 1; c++) { ANTCITY_GAME.dig(c, r); ANTCITY_GAME.dig(c, r - 1); }
    ANTCITY_GAME.seconds(6);
  }
});
await page.waitForTimeout(900);
const big = await page.evaluate(() => ({ crowd: ANTCITY_GAME.crowd().length, dbg: ANTCITY_GAME.dbg(), goal: ANTCITY_GAME.goal() }));
check('a big colony shows a crowd, not a handful', big.crowd > 26, `${big.crowd} drawn of ${big.dbg.ants} ants`);
check('the one hint line still says something useful', big.goal.length > 8, big.goal);
check('and there is still only one of it', (await hintsUp()).length === 1, JSON.stringify(await hintsUp()));
const idlers = big.crowd0 || (await page.evaluate(() => ANTCITY_GAME.crowd()));
const stacked = {};
idlers.filter((a) => a.fr >= 0 && a.state !== 'walk').forEach((a) => { stacked[a.at] = (stacked[a.at] || 0) + 1; });
check('no pile of ants on one cell', Math.max(0, ...Object.values(stacked)) <= 2, JSON.stringify(stacked).slice(0, 120));
await page.screenshot({ path: path.join(OUT, 'antcity-4-swarm.png') });

console.log('\n--- AC7: Build is a button, and the spots are on screen ---');
await page.evaluate(() => {
  ANTCITY_GAME._reset(); ANTCITY_GAME.play(); ANTCITY_GAME._openAll();
  ANTCITY_GAME.assign('digger', 3); ANTCITY_GAME.digDown(6); ANTCITY_GAME.seconds(40);
  for (let i = 0; i < 20; i++) { ANTCITY_GAME.drop('food', 120); ANTCITY_GAME.assign('forager', 4); ANTCITY_GAME.seconds(6); }
});
await page.waitForTimeout(1200);
await page.locator('#actSwap').click();
await page.waitForTimeout(250);
await page.locator('#tool_build').click();
await page.waitForTimeout(400);
check('picking the hammer opens the room cards', await page.locator('#roomList').isVisible());
// AC8: every room is a picture of what it does, and its cost is apples you can count
const nurseryPics = await page.locator('#room_nursery .pic svg').count();
const nurseryApples = await page.locator('#room_nursery .cost svg').count();
check('each room card is a picture', nurseryPics === 1, `${nurseryPics} pictures`);
check('and its cost is a row of apples to count', nurseryApples === 6, `${nurseryApples} apples for a 6-food room`);
check('the menu closes with a drawn X, not a word',
  (await page.locator('#buildCancel svg').count()) === 1);
await page.screenshot({ path: path.join(OUT, 'antcity-8-build-cards.png') });
await page.locator('#room_nursery').click();
await page.waitForTimeout(500);
const ghosts = await page.evaluate(() => ({ room: ANTCITY_GAME.placing(), spots: ANTCITY_GAME.spots().length }));
check('picking a room lights up the spots it could go', ghosts.room === 'nursery' && ghosts.spots > 0, JSON.stringify(ghosts));
await page.screenshot({ path: path.join(OUT, 'antcity-9-build-ghosts.png') });
{
  const g3b = await page.evaluate(() => ANTCITY_GAME.geom());
  const spot = (await page.evaluate(() => ANTCITY_GAME.spots()))[0];
  await page.mouse.click(box.x + g3b.ox + spot.c * g3b.cs + g3b.cs / 2,
                         box.y + g3b.sky + spot.r * g3b.cs + g3b.cs / 2 - g3b.camY);
  await page.waitForTimeout(500);
  check('tapping a glowing spot puts the room there',
    (await page.evaluate(() => ANTCITY_GAME.placing())) === null);
  await watchHints('room placed');
}

console.log('\n--- AC6: the strategy layer, on screen ---');
// the build popup has to SAY whether this is a good spot, before the kid commits
await page.evaluate(() => {
  ANTCITY_GAME._reset(); ANTCITY_GAME.play(); ANTCITY_GAME._openAll();
  ANTCITY_GAME.assign('digger', 4); ANTCITY_GAME.digDown(8); ANTCITY_GAME.seconds(40);
  for (let i = 0; i < 30; i++) { ANTCITY_GAME.drop('food', 120); ANTCITY_GAME.assign('forager', 4); ANTCITY_GAME.seconds(6); }
});
// the camera eases back up from the deep swarm colony above, so give it time to
// settle before clicking a row, or the tap lands on solid dirt
await page.waitForTimeout(2200);
// hold the hammer, put the menu away, then tap a shallow tunnel: the cards come
// back for THAT spot, and storage there is the good spot
await page.locator('#actSwap').click();
await page.waitForTimeout(250);
await page.locator('#tool_build').click();
await page.waitForTimeout(350);
await page.locator('#buildCancel').click();
await page.waitForTimeout(250);
const geo2 = await page.evaluate(() => ANTCITY_GAME._cfg());
const cw2 = box.width / geo2.cols;
await page.mouse.click(box.x + box.width / 2, box.y + sky + 1.5 * cw2);
await page.waitForTimeout(400);
const spotText = await page.textContent('#roomList').catch(() => '');
check('the build popup says whether this spot is a good one', /trip|queen|deep|works here/i.test(spotText), spotText.slice(0, 120));
await page.screenshot({ path: path.join(OUT, 'antcity-6-build-spot.png') });
await page.locator('#buildCancel').click();

// the meadow grows the leaves the chain runs on, and the herd shows up on it
const built = await page.evaluate(() => {
  ANTCITY_GAME.assign('forager', 5); ANTCITY_GAME.seconds(90);
  ANTCITY_GAME.setAphids(true); ANTCITY_GAME.seconds(60);
  for (let i = 0; i < 40 && ANTCITY_GAME.dbg().food < 24; i++) {
    ANTCITY_GAME.drop('food', 120); ANTCITY_GAME.assign('forager', 5); ANTCITY_GAME.seconds(6);
  }
  const t = ANTCITY_GAME.openTunnel();
  const made = t ? ANTCITY_GAME.build(t.c, t.r, 'fungus') : false;
  ANTCITY_GAME.assign('builder', 5); ANTCITY_GAME.seconds(120);
  ANTCITY_GAME.assign('nursery', 5); ANTCITY_GAME.seconds(90);
  return made;
});
check('a garden can be built once the pantry can pay for it', built === true);
await page.waitForTimeout(600);
const chain = await page.evaluate(() => ({ c: ANTCITY_GAME.chain(), mix: ANTCITY_GAME.mix(), trend: ANTCITY_GAME.trend() }));
check('foragers really cut leaves', chain.c.cut > 0, JSON.stringify(chain.c));
check('a staffed garden really makes mushroom food', chain.c.gardens === 1 && chain.c.mush > 0, JSON.stringify(chain.c));
check('the herd is out on the meadow', chain.c.aphids === true && chain.c.dewGot > 0, `drunk ${chain.c.dewGot}`);
check('the job mix line is on screen in kid words', chain.mix.length > 8 && !/\d/.test(chain.mix), chain.mix);
check('the panel says what the mix is doing', (await page.textContent('#barMix')).length > 8, await page.textContent('#barMix'));
await page.screenshot({ path: path.join(OUT, 'antcity-7-chains.png') });

// --- AC9: a bad bug calls, and one soldier sees it off ------------------------
// The rules are proved headlessly in qa-antcity.mjs. What can only be checked here is
// whether the visitor reads as silly rather than scary, whether the red marker is
// findable, and whether a soldier looks like a soldier next to a worker.
console.log('');
for (const kind of ['beetle', 'caterpillar', 'grasshopper']) {
  const sent = await page.evaluate((k) => {
    ANTCITY_GAME._openAll();
    ANTCITY_GAME.assign('soldier', 0);
    const b = ANTCITY_GAME.sendBug(k);
    ANTCITY_GAME.seconds(200);                 // long enough that it has settled and napped
    return { bug: ANTCITY_GAME.bug(), sent: b };
  }, kind);
  await page.waitForTimeout(500);
  check(`a ${kind} turns up and naps with nobody on Soldiers`,
    !!sent.bug && sent.bug.state === 'nap', JSON.stringify(sent.bug));
  const mark = await page.evaluate(() => ANTCITY_GAME.bugMark());
  check(`the red marker says where the ${kind} is`, !!mark && mark.r > 0, JSON.stringify(mark));
  await page.screenshot({ path: path.join(OUT, `antcity-10-bug-${kind}.png`) });
  const done = await page.evaluate(() => {
    ANTCITY_GAME.assign('soldier', 1);
    let t = 0, marched = false;
    while (ANTCITY_GAME.bug() && t < 90) { ANTCITY_GAME.seconds(1); t++; if (ANTCITY_GAME.guards() > 0) marched = true; }
    return { t, marched, left: ANTCITY_GAME.bug(), scared: ANTCITY_GAME.bugsScared() };
  });
  check(`one soldier marches over and sees the ${kind} off`,
    done.marched && !done.left && done.t < 90, `${done.t}s`);
}
// the soldiers themselves, standing guard with nothing to see off
await page.evaluate(() => { ANTCITY_GAME.assign('soldier', 4); ANTCITY_GAME.seconds(10); });
await page.waitForTimeout(500);
check('the fifth job is on the strip', (await page.evaluate(() => ANTCITY_GAME.jobsList())).length === 5);
await page.evaluate(() => { const t = document.getElementById('jobsToggle'); if (t) t.click(); });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'antcity-11-soldiers.png') });

// the ? button replays the guide, and it does not block play
await page.evaluate(() => ANTCITY_GAME.showHow());
await page.waitForTimeout(400);
check('the ? button replays the guide', (await page.evaluate(() => ANTCITY_GAME.guide())).on === true);
await page.screenshot({ path: path.join(OUT, 'antcity-5-replay.png') });

console.log('');
check('never two hints on screen at any point', seenTwice.length === 0, seenTwice.slice(0, 3).join(' // '));
check('no page errors while playing', errs.length === 0, errs.slice(0, 3).join(' | '));
if (missedArt) console.log('NOTE  some art 404d locally (the /api/asset-studio worker poses live on the deployed site); the drawn ants stood in.');
console.log(`\npictures in ${OUT}/`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
