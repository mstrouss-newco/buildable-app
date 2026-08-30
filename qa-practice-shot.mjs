// qa-practice-shot.mjs — take a real picture of the Practice screens so a human
// can LOOK at the bird collection rather than trust a DOM count (Session PT2).
//
// jsdom proves the birds are there and that there is exactly one per mastered
// word. It cannot tell you whether they look like birds sitting on a wire or
// like a smear of purple blobs. This does: it drives a real Chromium, seeds a
// kid with a believable amount of progress, and writes PNGs.
//
// Separate from qa-practice.mjs on purpose — that one must stay dependency-free
// and always runnable. This needs Playwright, and SKIPS loudly without it so it
// can never be the reason a session claims a failure it did not really see.
//
//   node qa-practice-shot.mjs                 # writes to qa-shots/
//   node qa-practice-shot.mjs --out /tmp/x    # somewhere else
import fs from 'fs';
import path from 'path';
import http from 'http';

const args = process.argv.slice(2);
const OUT = (() => { const i = args.indexOf('--out'); return i >= 0 && args[i + 1] ? args[i + 1] : 'qa-shots'; })();

let chromium = null;
for (const spec of ['playwright', 'playwright-core', 'playwright/index.js']) {
  try {
    const m = await import(spec);
    chromium = m.chromium || (m.default && m.default.chromium) || null;
    if (chromium) break;
  } catch (e) { /* try the next */ }
}
if (!chromium) {
  console.log('SKIP  Playwright is not installed - no screenshots taken.');
  console.log('      qa-practice.mjs is the required harness and does not need it.');
  process.exit(0);
}

// Serve public/ with the handful of vercel.json routes this page actually uses.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/practice' || p === '/') p = '/practice.html';
  // No network in here: the TTS and the ledger are stubbed flat.
  if (p.startsWith('/api/')) { res.writeHead(204).end(); return; }
  const file = path.join('public', p);
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404).end('no'); }
});
await new Promise((r) => server.listen(0, r));
const base = 'http://127.0.0.1:' + server.address().port;

fs.mkdirSync(OUT, { recursive: true });

// A kid partway through: 34 pre-primer words mastered, so the flock is a real
// flock and the wire-packing has to actually cope.
const ppDeck = JSON.parse(fs.readFileSync('public/practice/decks/sight-words-pre-primer.json', 'utf8'));
const mastered = {};
ppDeck.items.slice(0, 34).forEach((it) => {
  mastered[it.id] = { box: 5, due: Date.now() + 8 * 86400000, seen: 9, right: 9, wrong: 0, last: Date.now() };
});
const addDeck = JSON.parse(fs.readFileSync('public/practice/decks/math-addition.json', 'utf8'));
const fluent = {};
addDeck.items.slice(0, 20).forEach((it, i) => {
  fluent[it.id] = { box: i < 18 ? 4 : 1, due: 0, seen: 5, right: 5, wrong: 0, last: 0 };
});
const seed = {
  kids: {
    'shot-kid': {
      placement: { done: true, at: 0, landingDeckId: 'sight-words-primer' },
      level: 'sight-words-pre-primer',
      settings: { sprintSeconds: 60, sprintTarget: 40 },
      decks: { 'sight-words-pre-primer': { items: mastered }, 'math-addition': { items: fluent } },
    },
  },
};

const browser = await chromium.launch(
  fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const shots = [];
async function shoot(name, width, height, prepare) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(([s, k]) => {
    localStorage.setItem('bk_practice_v1', s);
    localStorage.setItem('bk_active_kid_v1', k);
  }, [JSON.stringify(seed), JSON.stringify({ id: 'shot-kid', grade: 'K' })]);
  await page.goto(base + '/practice', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.PRACTICE_READY === true, null, { timeout: 8000 }).catch(() => {});
  if (prepare) await prepare(page);
  await page.waitForTimeout(500);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  const birds = await page.evaluate(() => document.querySelectorAll('#flock .bird').length);
  shots.push({ file, birds });
  console.log('  ' + file + '   ' + birds + ' birds drawn');
  await ctx.close();
}

console.log('Screenshots of the collection scene:');
await shoot('practice-phone', 390, 844);           // iPhone
await shoot('practice-ipad', 820, 1180);           // iPad portrait
await shoot('practice-numbers', 390, 844, async (page) => {
  await page.evaluate(() => window.PRACTICE_PAGE.setSubject('math'));
  await page.evaluate(() => window.PRACTICE_PAGE.setDeck('math-addition'));
  await page.waitForTimeout(400);
});

await browser.close();
server.close();

const bad = shots.filter((s) => !fs.existsSync(s.file) || fs.statSync(s.file).size < 4000);
if (bad.length) {
  console.log('FAIL  a screenshot came out empty or tiny: ' + bad.map((b) => b.file).join(', '));
  process.exit(1);
}
console.log('\nWrote ' + shots.length + ' screenshots to ' + OUT + '/ - open them and LOOK at the birds.');
