// OPTIONAL live-DOM QA for the Lessons player (Session LS1).
//
// qa-lessons.mjs is the house-style harness and is the one that must pass. This
// one is the honesty check on top of it: it boots a real browser, serves public/
// with vercel.json's routes simulated, stubs the two APIs, and plays the sample
// lesson end to end twice — once mastering it, once deliberately missing — then
// asserts what a kid would actually experience and what the ledger actually
// received.
//
// It needs Playwright (same hardcoded global path as qa-ap2-use-in-game.mjs). If
// Playwright is not installed it SKIPS loudly and exits 0 — it must never be the
// reason a session claims a failure it did not really see.
//
//   node qa-lessons-dom.mjs .
import fs from 'fs';
import path from 'path';
import http from 'http';

const dir = process.argv[2] || '.';
let chromium = null;
const PW_SPECS = ['playwright', 'playwright/index.js',
  '/home/claude/.npm-global/lib/node_modules/playwright/index.js'];
for (const spec of PW_SPECS) {
  try {
    const m = await import(spec);
    chromium = m.chromium || (m.default && m.default.chromium) || null;   // CJS build exposes it on default
    if (chromium) break;
  } catch (e) { /* try next */ }
}
if (!chromium) {
  console.log('SKIP  Playwright not installed - live-DOM QA did not run (qa-lessons.mjs is the required harness)');
  process.exit(0);
}

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

const lesson = JSON.parse(fs.readFileSync(path.join(dir, 'public/lessons/g1-making-ten.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };

// What the stubbed ledger received.
let ledger = [];
// Practice questions the stubbed bank hands back (tagged source:"bank" so we can
// prove the player prefers the approved bank over its own fallback).
const bankQs = [1, 2, 3, 4, 5, 6].map((i) => ({
  id: 'bank-' + i, type: 'math', question: `What is ${i} + ${10 - i}?`,
  choices: ['10', '11', '12'], correctIndex: 0, skill: lesson.skill, source: 'bank',
}));

// Session LS3 stub state (empty until run 5).
let BANK_MAP = null;
let BANK_LESSONS = {};
// Session LS4 stub state: what /api/placement hands back (null until run 6).
let PLACEMENT = null;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/lesson-questions') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, banked: 6, filled: 0, source: 'bank', questions: bankQs }));
  }
  if (u.pathname === '/api/log-learning-event') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { try { ledger.push(JSON.parse(body)); } catch (e) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
    return;
  }
  if (u.pathname === '/api/say') { res.writeHead(503); return res.end(''); } // force browser-voice fallback
  // ---- Session LS3: the two endpoints that serve lessons out of lesson_bank.
  // BANK_MAP / BANK_LESSONS start empty, so runs 1-4 see exactly what they saw
  // before (a 404 sends the player to the static index.json, as in production
  // when Supabase is unset). Run 5 fills them to prove the bank path.
  if (u.pathname === '/api/lesson-map') {
    if (!BANK_MAP) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(BANK_MAP));
  }
  if (u.pathname === '/api/placement') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(PLACEMENT || { ok: true, subject: '', grade: '', total: 0, steps: [] }));
  }
  if (u.pathname === '/api/lesson') {
    const key = u.searchParams.get('key');
    const preview = u.searchParams.get('preview');
    const row = BANK_LESSONS[key];
    // The real endpoint only serves an approved lesson unless the owner code is
    // present. The stub enforces the same rule so QA proves the gate, not the UI.
    if (!row || (row.status !== 'approved' && preview !== '1025')) { res.writeHead(404); return res.end('{"ok":false}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ...row.payload, status: row.status, fromBank: true }));
  }
  const rel = u.pathname === '/lessons' ? '/lessons.html' : u.pathname;
  const root = path.resolve(dir, 'public');
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

// Some sandboxes ship a Chromium build that does not match the installed
// Playwright's expected revision. PW_CHROMIUM lets the harness point straight at
// the browser that IS there, instead of silently not running.
const PW_EXE = process.env.PW_CHROMIUM || '';
const browser = await chromium.launch(PW_EXE ? { executablePath: PW_EXE } : {});

async function playLesson({ deliberatelyMiss }) {
  ledger = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  // Ignore the resource errors caused by our own offline route block (fonts).
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return;
    errors.push('console: ' + m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('bk_active_kid_v1', JSON.stringify({ id: 'qa-kid-1', display_name: 'QA Kid', grade: '1' }));
    localStorage.removeItem('bk_wallet_v1:qa-kid-1');
    localStorage.removeItem('bk_lessons_v1:qa-kid-1');
    // The lesson must not depend on a working voice.
    window.speechSynthesis = undefined;
  });
  // Nothing outside the box: the lesson must work with no internet beyond our origin.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return u.startsWith(base) ? route.continue() : route.abort();
  });
  await page.goto(base + '/lessons?id=g1-making-ten', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button.big', { timeout: 15000 });

  const seen = { steps: new Set(), bankQuestions: 0 };
  const readStep = async () => (await page.locator('.stepname').first().textContent().catch(() => '')) || '';

  // Step 1 -> teach cards -> guided -> solo -> check, tapping through.
  seen.steps.add(((await readStep()) || '').split(' - ')[0].trim());
  await page.getByRole('button', { name: /let's learn/i }).click();

  for (let guard = 0; guard < 60; guard++) {
    const step = await readStep();
    if (step) seen.steps.add(step.split(' - ')[0].trim());

    // teach cards
    const next = page.locator('button.big', { hasText: /^(Next|Try it with me)$/ });
    if (await next.count()) { await next.first().click(); continue; }

    const sub = (await page.locator('.sub').first().textContent().catch(() => '')) || '';
    if (/approved question bank/i.test(sub)) seen.bankQuestions++;

    const answers = page.locator('.ans button:not([disabled])');
    const n = await answers.count();
    if (!n) break;

    // Work out the right answer from the visible question so the run is real.
    const qText = ((await page.locator('.card h2').first().textContent()) || '').trim();
    const labels = [];
    for (let i = 0; i < n; i++) labels.push(((await answers.nth(i).textContent()) || '').trim());
    let want = null;
    let m = /^(\d+)\s*\+\s*(\d+)\s*=\s*\?$/.exec(qText) || /^What is (\d+) \+ (\d+)\?$/.exec(qText);
    if (m) want = String(Number(m[1]) + Number(m[2]));
    else if ((m = /^(\d+)\s*\+\s*\?\s*=\s*(\d+)$/.exec(qText))) want = String(Number(m[2]) - Number(m[1]));
    else if ((m = /^(\d+) needs how many to make (\d+)\?$/.exec(qText))) want = String(Number(m[2]) - Number(m[1]));

    const isCheck = /Step 5 of 5/.test(step);
    let pick = want !== null ? labels.indexOf(want) : -1;
    if (pick < 0) pick = 0;
    if (isCheck && deliberatelyMiss) pick = labels.findIndex((l) => l !== want); // miss every star-check question

    await answers.nth(Math.max(0, pick)).click();
    await page.waitForTimeout(1300);
  }

  await page.waitForTimeout(500);
  const html = await page.locator('main').innerHTML();
  const coins = await page.locator('#coinN').textContent();
  const progress = await page.evaluate(() => localStorage.getItem('bk_lessons_v1:qa-kid-1'));
  await page.close();
  return { seen, html, coins, progress, errors };
}

console.log('--- LIVE RUN 1: a kid who masters the lesson ---');
const win = await playLesson({ deliberatelyMiss: false });
chk('the lesson runs with no javascript errors', win.errors.length === 0, win.errors.slice(0, 2).join(' | '));
chk('the kid passes through all five steps', win.seen.steps.size === 5, [...win.seen.steps].join(', '));
chk('step 4 served the APPROVED bank questions, not the lesson fallback',
  win.seen.bankQuestions === lesson.solo.count, 'bank questions shown=' + win.seen.bankQuestions);
chk('mastering shows the star and the mastered headline',
  /star-mastered/.test(win.html) && win.html.includes(lesson.mastered.headline), '');
chk('mastering pays the coins into the shared wallet', String(win.coins) === String(lesson.reward.coins), 'coins=' + win.coins);
chk('mastery is written where the LS2 path map will read it',
  !!win.progress && JSON.parse(win.progress)[lesson.id] && JSON.parse(win.progress)[lesson.id].mastered === true, win.progress);
const total = lesson.guided.length + lesson.solo.count + lesson.check.length;
chk('EVERY answer reached the learning ledger', ledger.length === total, `logged=${ledger.length} expected=${total}`);
chk('every ledger row carries the kid, the grade and the exact skill',
  ledger.every((r) => r.kidProfileId === 'qa-kid-1' && r.grade === '1' && r.skill === lesson.skill && r.game === 'lessons'));
chk('the ledger can tell guided, practice and star-check answers apart',
  new Set(ledger.map((r) => r.quizType)).size === 3, [...new Set(ledger.map((r) => r.quizType))].join(','));
chk('bank questions log their question id so the dashboard can trace them',
  ledger.filter((r) => r.quizType === 'lesson-practice').every((r) => /^bank-/.test(String(r.questionId))));

console.log('\n--- LIVE RUN 2: a kid who misses the star check ---');
const miss = await playLesson({ deliberatelyMiss: true });
chk('the missed run also has no javascript errors', miss.errors.length === 0, miss.errors.slice(0, 2).join(' | '));
chk('a miss shows the gentle re-teach, not a shame screen',
  miss.html.includes(lesson.reteach.headline) && /star is still waiting/i.test(miss.html));
chk('a miss offers both another look and another go at the star check',
  miss.html.includes(lesson.reteach.cta) && /Try the star check again/.test(miss.html));
chk('a miss pays no coins', String(miss.coins) === '0', 'coins=' + miss.coins);
chk('a miss is recorded as an attempt but NOT as mastered',
  !!miss.progress && JSON.parse(miss.progress)[lesson.id].mastered === false &&
  JSON.parse(miss.progress)[lesson.id].attempts >= 1, miss.progress);
chk('the missed answers still reached the ledger', ledger.length === total, `logged=${ledger.length} expected=${total}`);

console.log('\n--- LIVE RUN 3: the path — picker, units, locks, grades (Session LS2) ---');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.addInitScript(() => {
    localStorage.setItem('bk_active_kid_v1', JSON.stringify({ id: 'qa-kid-2', display_name: 'QA Kid', grade: '1' }));
    localStorage.removeItem('bk_lessons_v1:qa-kid-2');
    window.speechSynthesis = undefined;
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return u.startsWith(base) ? route.continue() : route.abort();
  });

  await page.goto(base + '/lessons', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.subject', { timeout: 15000 });
  const subs = await page.$$eval('.subject', (els) => els.map((e) => ({
    t: (e.querySelector('h3') || {}).textContent, soon: e.classList.contains('soon'), disabled: !!e.disabled,
    tag: ((e.querySelector('.tag') || {}).textContent || ''),
  })));
  chk('the front door is the subject picker', subs.length >= 4, subs.map((s) => s.t).join(','));
  const math = subs.find((s) => s.t === 'Math');
  chk('Math is open because it has a ready lesson', !!math && !math.soon && /ready|mastered/i.test(math.tag), JSON.stringify(math));
  chk('subjects with nothing ready are greyed and cannot be opened (no empty promises)',
    subs.filter((s) => s.t !== 'Math').every((s) => s.soon && s.disabled && /coming soon/i.test(s.tag)));

  await page.locator('.subject', { hasText: 'Math' }).first().click();
  await page.waitForSelector('.node', { timeout: 10000 });
  chk('the header names the subject the kid picked', (await page.locator('#title').textContent()) === 'Math');
  chk('the address is reload-safe', /subject=math&grade=1/.test(page.url()), page.url());
  chk('the kid landed on their OWN grade from their profile',
    (await page.locator('.grades button.on').textContent()) === '1');
  const units = await page.$$eval('.unit', (els) => els.map((e) => e.textContent.trim()));
  chk('the path is grouped into units', units.length >= 2, units.join(' | '));
  const nodes = await page.$$eval('.node', (els) => els.map((e) => ({
    tag: e.tagName, cls: e.className, name: (e.querySelector('.nm') || {}).textContent,
    sub: (e.querySelector('.ds') || {}).textContent,
  })));
  const start = nodes.find((n) => n.name === 'Making ten');
  chk('the kid\'s next lesson is the tappable one, marked START',
    !!start && start.tag === 'BUTTON' && /minutes/.test(start.sub), JSON.stringify(start));
  chk('lessons that are not built yet are greyed and are not buttons at all',
    nodes.filter((n) => n.name !== 'Making ten').every((n) => n.tag === 'DIV' && /soon|locked/.test(n.cls)));

  // Run ahead: a kid may look at any grade, and an empty grade says so honestly.
  await page.locator('.grades button', { hasText: 'K' }).first().click();
  await page.waitForTimeout(200);
  chk('a kid can run ahead or back to any grade', (await page.locator('.grades button.on').textContent()) === 'K');
  chk('a grade with nothing ready says so instead of looking broken',
    /still being written/i.test(await page.locator('main').innerText()));
  await page.locator('.grades button', { hasText: '1' }).first().click();
  await page.waitForSelector('button.node', { timeout: 10000 });

  // Into the lesson and back out again.
  await page.locator('button.node').first().click();
  await page.waitForSelector('.stepname', { timeout: 15000 });
  chk('tapping the lesson opens step 1 of the player',
    /Step 1 of 5/.test(await page.locator('.stepname').first().textContent()));
  await page.locator('#back').click();
  await page.waitForSelector('.node', { timeout: 10000 });
  chk('Back from a lesson returns to the path, not out of the section',
    (await page.locator('.node').count()) > 1);
  await page.locator('#back').click();
  await page.waitForSelector('.subject', { timeout: 10000 });
  chk('Back from the path returns to the subject picker', (await page.locator('.subject').count()) >= 4);
  chk('the path screens threw no javascript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

console.log('\n--- LIVE RUN 4: the lock really locks (mastery unlocks the next lesson) ---');
{
  // The shipped map has ONE approved lesson today, so the lock cannot be seen with
  // real data yet. Serve a doctored map with two approved lessons (both pointing at
  // the sample lesson file) and prove the rule: locked until the one before it is
  // mastered, unlocked the moment it is.
  const realMap = JSON.parse(fs.readFileSync(path.join(dir, 'public/lessons/index.json'), 'utf8'));
  const twoApproved = JSON.parse(JSON.stringify(realMap));
  const g1 = twoApproved.paths.find((p) => p.subject === 'math' && String(p.grade) === '1');
  const unit = g1.units.find((u) => (u.lessons || []).some((l) => l.status === 'approved'));
  const first = unit.lessons.find((l) => l.status === 'approved');
  const second = unit.lessons.find((l) => l.status === 'planned');
  second.status = 'approved'; second.file = first.file; second.reviewedBy = 'qa';

  async function openPath(mastered) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((seed) => {
      localStorage.setItem('bk_active_kid_v1', JSON.stringify({ id: 'qa-kid-3', display_name: 'QA Kid', grade: '1' }));
      localStorage.setItem('bk_lessons_v1:qa-kid-3', seed);
      window.speechSynthesis = undefined;
    }, mastered ? JSON.stringify({ [first.key]: { attempts: 1, best: 5, mastered: true } }) : '{}');
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (!u.startsWith(base)) return route.abort();
      if (u.indexOf('/lessons/index.json') >= 0) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(twoApproved) });
      }
      return route.continue();
    });
    await page.goto(base + '/lessons?subject=math&grade=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.node', { timeout: 15000 });
    const rows = await page.$$eval('.node', (els) => els.map((e) => ({
      tag: e.tagName, cls: e.className, name: (e.querySelector('.nm') || {}).textContent,
      sub: (e.querySelector('.ds') || {}).textContent,
    })));
    await page.close();
    return rows;
  }

  const before = await openPath(false);
  const b1 = before.find((r) => r.name === first.title);
  const b2 = before.find((r) => r.name === second.title);
  chk('with nothing mastered, lesson 1 is open and lesson 2 is LOCKED',
    b1.tag === 'BUTTON' && b2.tag === 'DIV' && /locked/.test(b2.cls), JSON.stringify([b1, b2]));
  chk('the lock explains itself in kid words rather than just being dead',
    /unlock/i.test(b2.sub), b2.sub);

  const after = await openPath(true);
  const a1 = after.find((r) => r.name === first.title);
  const a2 = after.find((r) => r.name === second.title);
  chk('mastering lesson 1 unlocks lesson 2', a2.tag === 'BUTTON' && !/locked/.test(a2.cls), JSON.stringify(a2));
  chk('the mastered lesson keeps its star and can be played again',
    /done/.test(a1.cls) && /Mastered/i.test(a1.sub) && a1.tag === 'BUTTON', JSON.stringify(a1));
}

/* =========================================================================
   LIVE RUN 5 (Session LS3) — a lesson that lives in lesson_bank, not in a file.
   This is the whole point of LS3: the owner approves a lesson and it appears on
   the path and plays, with no code push. So: draft the real Kindergarten batch
   through the real factory code, serve ONE of them as approved through the
   stubbed /api/lesson-map + /api/lesson, and play it end to end. Then prove the
   gate by serving one as PENDING and checking a kid cannot reach it.
   ========================================================================= */
console.log('\n--- LIVE RUN 5: a lesson served from the review-approved bank (Session LS3) ---');
{
  const gen = await import('./api/_lessongen.js');
  const fac = await import('./api/generate-lessons.js');
  const staticMap = JSON.parse(fs.readFileSync(path.join(dir, 'public/lessons/index.json'), 'utf8'));
  const kTargets = fac.targetsFromMap(staticMap).filter((t) => t.grade === 'k' && t.pathSubject === 'math' && !t.hasFile);

  const drafts = [];
  for (const t of kTargets) { const r = await gen.makeLesson(t, null); if (r.ok) drafts.push(r.lesson); }
  chk('the factory drafted the Kindergarten Math batch', drafts.length >= 10, 'drafted=' + drafts.length);

  const approvedL = drafts[0];                 // the owner approved this one
  const pendingL = drafts[1];                  // this one is still waiting
  BANK_LESSONS = {
    [approvedL.id]: { status: 'approved', payload: approvedL },
    [pendingL.id]: { status: 'pending', payload: pendingL },
  };
  // Build the map the real api/lesson-map.js would build: ONLY the approved row
  // is upgraded, and it carries no file - it must be fetched from the bank.
  BANK_MAP = JSON.parse(JSON.stringify(staticMap));
  for (const p of BANK_MAP.paths) for (const u of p.units) {
    u.lessons = u.lessons.map((l) => (l.key === approvedL.id ? { ...l, status: 'approved', fromBank: true } : l));
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.addInitScript(() => {
    localStorage.setItem('bk_active_kid_v1', JSON.stringify({ id: 'qa-kid-5', display_name: 'QA K', grade: 'k' }));
    localStorage.removeItem('bk_lessons_v1:qa-kid-5');
    window.speechSynthesis = undefined;
  });
  await page.goto(base + '/lessons?subject=math&grade=k', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.node', { timeout: 15000 });
  const rows = await page.$$eval('.node', (els) => els.map((e) => ({
    tag: e.tagName, cls: e.className, name: (e.querySelector('.nm') || {}).textContent,
  })));
  const approvedRow = rows.find((r) => r.name === approvedL.title);
  const pendingRow = rows.find((r) => r.name === pendingL.title);
  chk('an APPROVED bank lesson appears on the path as playable',
    !!approvedRow && approvedRow.tag === 'BUTTON' && !/soon|locked/.test(approvedRow.cls), JSON.stringify(approvedRow));
  chk('a lesson still WAITING for review stays greyed out for a kid',
    !!pendingRow && pendingRow.tag !== 'BUTTON' && /soon/.test(pendingRow.cls), JSON.stringify(pendingRow));

  // Play it: the JSON came from the bank, so this proves the player renders a
  // bank lesson exactly like a file lesson.
  await page.click('.node:has-text("' + approvedL.title + '")');
  await page.waitForSelector('.card h2', { timeout: 15000 });
  const head = await page.textContent('.card h2');
  chk('tapping a bank lesson opens step 1 of the player', head.trim() === approvedL.title, head);

  await page.click('.big');                                   // Let's learn
  for (let i = 0; i < approvedL.teach.length; i++) {
    await page.waitForSelector('.card h2');
    const shown = await page.$$eval('.shaperow, .frames', (e) => e.length);
    if (i === 0) chk('a bank lesson still draws its picture on the teach card', shown >= 1, 'pictures=' + shown);
    await page.click('.big');
  }
  // Guided, then practice, then the star check - always tap the correct answer.
  const tapCorrect = async (list, ix) => {
    const q = list[ix];
    const btns = await page.$$('.ans button');
    await btns[q.correctIndex].click();
  };
  for (let i = 0; i < approvedL.guided.length; i++) {
    await page.waitForSelector('.ans button');
    await tapCorrect(approvedL.guided, i);
    await page.waitForTimeout(750);
  }
  // Step 4 is served by the stubbed bank of six; answer index 0 each time.
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector('.ans button', { timeout: 10000 });
    const btns = await page.$$('.ans button');
    await btns[0].click();
    await page.waitForTimeout(750);
  }
  for (let i = 0; i < approvedL.check.length; i++) {
    await page.waitForSelector('.ans button', { timeout: 10000 });
    await tapCorrect(approvedL.check, i);
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('.won', { timeout: 10000 });
  const won = await page.textContent('.won');
  chk('a bank lesson can be mastered, star and all', /mastered/i.test(won), won.trim());
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('bk_lessons_v1:qa-kid-5') || '{}'));
  chk('mastery is stored under the bank lesson\'s key, so the path unlocks the next one',
    !!(prog[approvedL.id] && prog[approvedL.id].mastered), JSON.stringify(prog));
  chk('playing a bank lesson threw no javascript errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();

  // THE GATE. A kid asking for the pending lesson by name must be refused.
  const gate = await browser.newPage();
  const asKid = await gate.goto(base + '/api/lesson?key=' + pendingL.id);
  chk('asking for an unapproved lesson without the owner code is refused', asKid.status() === 404, 'status=' + asKid.status());
  const asOwner = await gate.goto(base + '/api/lesson?key=' + pendingL.id + '&preview=1025');
  chk('the owner CAN open the same draft to review it', asOwner.status() === 200, 'status=' + asOwner.status());
  const draftJson = await asOwner.json();
  chk('the draft is clearly stamped as pending, not approved', draftJson.status === 'pending');
  await gate.close();

  BANK_MAP = null; BANK_LESSONS = {};
}


/* ------------------------------------------------------------------
   LIVE RUN 6 (Session LS4) - a real kid takes the quick check.

   This is the run that proves placement is safe. A robot opens the Reading
   path, taps "Find my spot", deliberately answers the first two rungs RIGHT and
   then gets one WRONG, and we check where it put her: after the last rung she
   passed, never past the one she missed. Then we check the two things that
   could quietly corrupt the record - that skipped lessons are marked PLACED and
   not mastered, and that every placement answer reached the ledger.
------------------------------------------------------------------- */
console.log('\n--- LIVE RUN 6: the placement quick check (Session LS4) ---');
{
  const gen = await import('./api/_lessongen.js');
  const fac = await import('./api/generate-lessons.js');
  const staticMap = JSON.parse(fs.readFileSync(path.join(dir, 'public/lessons/index.json'), 'utf8'));
  const rTargets = fac.targetsFromMap(staticMap).filter((t) => t.pathSubject === 'reading' && t.grade === 'k');

  const drafts = [];
  for (const t of rTargets) { const r = await gen.makeLesson(t, null); if (r.ok) drafts.push(r.lesson); }
  chk('the factory drafted the Kindergarten Reading batch', drafts.length >= 7, 'drafted=' + drafts.length);

  // Every one approved, so the whole K reading path is playable.
  BANK_LESSONS = {};
  drafts.forEach((L) => { BANK_LESSONS[L.id] = { status: 'approved', payload: L }; });
  BANK_MAP = JSON.parse(JSON.stringify(staticMap));
  for (const p of BANK_MAP.paths) for (const u of p.units) {
    u.lessons = u.lessons.map((l) => (BANK_LESSONS[l.key] ? { ...l, status: 'approved', fromBank: true } : l));
  }
  // The real /api/placement would build these off the same approved rows. The
  // stub does exactly that, in path order, so the run tests the PLAYER's half.
  PLACEMENT = {
    ok: true, subject: 'reading', grade: 'k', total: drafts.length,
    steps: drafts.map((L, i) => ({
      key: L.id, title: L.title, grade: 'k', unit: L.unit, subject: L.subject, skill: L.skill, at: i,
      question: L.check[0].question, choices: L.check[0].choices, correctIndex: L.check[0].correctIndex,
    })),
  };

  ledger = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.addInitScript(() => {
    localStorage.setItem('bk_active_kid_v1', JSON.stringify({ id: 'qa-kid-6', display_name: 'QA R', grade: 'k' }));
    localStorage.removeItem('bk_lessons_v1:qa-kid-6');
    window.speechSynthesis = undefined;
  });
  await page.goto(base + '/lessons?subject=reading&grade=k');
  await page.waitForSelector('.node, .findme', { timeout: 8000 });

  const offer = await page.locator('.findme h3').first().textContent().catch(() => null);
  chk('a kid with no history is offered the quick check', (offer || '').includes('Find my spot'), offer || 'no card');

  await page.getByRole('button', { name: 'Find my spot' }).click();
  await page.waitForSelector('.ans button', { timeout: 8000 });

  // Answer rung 1 and 2 right, rung 3 wrong, rung 4 wrong -> stops on two misses.
  const plan = [true, true, false, false];
  const asked = [];
  for (let i = 0; i < plan.length; i++) {
    const q = await page.locator('.q').first().textContent();
    asked.push(q);
    const step = PLACEMENT.steps.find((s) => s.question === q);
    if (!step) { chk('placement asked a question from a real lesson', false, q); break; }
    const want = plan[i] ? step.correctIndex : (step.correctIndex + 1) % step.choices.length;
    await page.locator('.ans button').nth(want).click();
    await page.waitForTimeout(950);
    if (await page.locator('.findme h3').count()) break;      // it finished
  }

  chk('the check asks lessons in teaching order',
    asked.every((q, i) => i === 0 || PLACEMENT.steps.findIndex((s) => s.question === q) >
      PLACEMENT.steps.findIndex((s) => s.question === asked[i - 1])));
  chk('the check stops after two misses in a row rather than grinding on',
    asked.length === 4, 'asked=' + asked.length);

  const landing = await page.locator('.findme h3').first().textContent();
  const expected = PLACEMENT.steps[2].title;   // straight after the last rung she PASSED (rung 2)
  chk('the kid lands straight after the last rung she got RIGHT',
    (landing || '').includes(expected), `${landing} :: expected ${expected}`);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bk_lessons_v1:qa-kid-6') || '{}'));
  const placedKeys = Object.keys(stored).filter((k) => !k.startsWith('_') && stored[k].placed);
  chk('the lessons she proved are marked PLACED', placedKeys.length === 2, placedKeys.join(','));
  chk('placement NEVER writes mastered - a star still has to be earned',
    Object.keys(stored).every((k) => k.startsWith('_') || !stored[k].mastered),
    JSON.stringify(stored).slice(0, 160));
  chk('the landing lesson itself is NOT marked placed', !stored[PLACEMENT.steps[2].key]);
  chk('the result is remembered, so a kid is not asked again every visit',
    !!(stored._placement && stored._placement['reading:k'] && stored._placement['reading:k'].at));

  chk('every placement answer reached the learning ledger', ledger.length === 4, 'logged=' + ledger.length);
  chk('placement answers are tagged so the dashboard can tell them from real practice',
    ledger.every((e) => e.quizType === 'placement' && e.game === 'lessons'),
    ledger.map((e) => e.quizType).join(','));
  chk('placement answers carry the kid and the exact skill',
    ledger.every((e) => e.kidProfileId === 'qa-kid-6' && !!e.skill));

  // Back on the path: the placed lessons are open but starless, and the landing
  // lesson is the one being pointed at.
  await page.getByRole('button', { name: 'See my path' }).click();
  await page.waitForSelector('.node', { timeout: 8000 });
  const nodes = await page.evaluate(() => Array.from(document.querySelectorAll('.node')).map((n) => ({
    cls: n.className, name: (n.querySelector('.nm') || {}).textContent, sub: (n.querySelector('.ds') || {}).textContent,
    star: !!n.querySelector('svg.end'),
  })));
  chk('a placed lesson is open but wears no star', nodes[0] && /placed/.test(nodes[0].cls) && !nodes[0].star,
    JSON.stringify(nodes[0] || {}));
  chk('the landing lesson is the kid\'s next step, not locked',
    nodes[2] && !/locked|soon|placed|done/.test(nodes[2].cls), JSON.stringify(nodes[2] || {}));
  chk('the quick check is not offered again once it has been answered',
    (await page.locator('.findme').count()) === 0);

  // And a reading lesson really plays, drawn type and all.
  await page.locator('.node').nth(2).click();
  await page.waitForSelector('.q, .card, h2', { timeout: 8000 });
  await page.getByRole('button', { name: /Let/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const artKinds = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.tiles .tile').length,
    words: document.querySelectorAll('.wordrow .wordcard').length,
    story: document.querySelectorAll('.storycard').length,
  }));
  chk('a reading teach card draws letters or words, not counters',
    (artKinds.tiles + artKinds.words + artKinds.story) > 0, JSON.stringify(artKinds));
  chk('the placement run and the reading lesson threw no javascript errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await page.close();
  BANK_MAP = null; BANK_LESSONS = {}; PLACEMENT = null;
}

await browser.close();
server.close();
console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
