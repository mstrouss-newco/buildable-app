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

const browser = await chromium.launch();

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

await browser.close();
server.close();
console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
