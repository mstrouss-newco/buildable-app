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
check('the goal strip carries the step', (await page.textContent('#goalText')).length > 8, await page.textContent('#goalText'));
await page.screenshot({ path: path.join(OUT, 'antcity-1-guide-dig.png') });

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
await page.screenshot({ path: path.join(OUT, 'antcity-2-guide-food.png') });

// step two: tap the grass
await page.mouse.click(box.x + box.width * 0.3, box.y + sky - 45);
await page.waitForTimeout(900);
const g2 = await page.evaluate(() => ANTCITY_GAME.guide());
check('tapping the grass really moves it on again', g2.step === 2, JSON.stringify(g2));

// step three: move an ant to another job with the panel button
await page.locator('#jobs button[data-j="nursery"][data-d="1"]').click();
await page.waitForTimeout(900);
const g3 = await page.evaluate(() => ANTCITY_GAME.guide());
check('giving an ant a new job finishes the guide', g3.on === false, JSON.stringify(g3));

console.log('\n--- ants that mean it ---');
await page.evaluate(() => { ANTCITY_GAME.assign('digger', 4); ANTCITY_GAME.digDown(5); ANTCITY_GAME.drop('food', 120); ANTCITY_GAME.drop('food', 300); });
let sawDig = false, sawFood = false, sawCarry = false, sawSurface = false, dirt = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(200);
  const crowd = await page.evaluate(() => ANTCITY_GAME.crowd());
  if (crowd.some((a) => a.task === 'dig')) sawDig = true;
  if (crowd.some((a) => a.task === 'food')) sawFood = true;
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
  for (let i = 0; i < 40; i++) { ANTCITY_GAME.drop('food', 80 + i * 5); ANTCITY_GAME.drop('water', 200); ANTCITY_GAME.digDown(3); ANTCITY_GAME.seconds(6); }
});
await page.waitForTimeout(900);
const big = await page.evaluate(() => ({ crowd: ANTCITY_GAME.crowd().length, dbg: ANTCITY_GAME.dbg(), goal: ANTCITY_GAME.goal() }));
check('a big colony shows a crowd, not a handful', big.crowd > 26, `${big.crowd} drawn of ${big.dbg.ants} ants`);
check('the goal strip still says something useful', big.goal.length > 8, big.goal);
await page.screenshot({ path: path.join(OUT, 'antcity-4-swarm.png') });

// the ? button replays the guide, and it does not block play
await page.evaluate(() => ANTCITY_GAME.showHow());
await page.waitForTimeout(400);
check('the ? button replays the guide', (await page.evaluate(() => ANTCITY_GAME.guide())).on === true);
await page.screenshot({ path: path.join(OUT, 'antcity-5-replay.png') });

console.log('');
check('no page errors while playing', errs.length === 0, errs.slice(0, 3).join(' | '));
if (missedArt) console.log('NOTE  some art 404d locally (the /api/asset-studio worker poses live on the deployed site); the drawn ants stood in.');
console.log(`\npictures in ${OUT}/`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);
