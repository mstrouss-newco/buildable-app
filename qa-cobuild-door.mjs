// qa-cobuild-door.mjs — drive the Cobuild landing page's Start buttons in a REAL browser
// and prove the money path, on both sides of the cobuild_live switch.
//
// WHY THIS FILE EXISTS. qa-grownups.mjs checks this by reading the source for the shapes
// CB4 wrote. That is a fair check and it did its job — it went red. But a later
// look-and-feel pass had rewritten the whole script block of public/cobuild.html and
// dropped the live-checkout wiring with it, so `cobuild_live` had nothing left reading
// it on the landing page: flipping the switch on would have done nothing at all, and the
// page would have gone on taking waitlist names forever. A source regex can only tell you
// the text changed. This clicks the button and follows where it actually goes.
//
// The three things it proves, each by clicking a real Start button:
//   1. Switch OFF  -> the waitlist form opens, the click is logged, the lead is posted.
//   2. Switch ON but checkout not configured -> it asks for a checkout, gets nothing, and
//      falls back to the waitlist. A grown-up never hits a dead end.
//   3. Switch ON with checkout configured -> the button really leaves for the checkout URL.
//
// /api/app-flags, /api/cobuild-lead and /api/cobuild-billing are stubbed by the little
// server below, so this never reaches Stripe, never reaches Supabase, and never needs a
// key. It only ever proves what the PAGE does with the answers it is given.
//
// Separate from qa-grownups.mjs on purpose — that one must stay dependency-free and always
// runnable. This needs Playwright and SKIPS loudly without it, so a session can never claim
// a check it did not really run. qa-all.mjs recognises the word "playwright" here and
// leaves this out unless you pass --with-browser.
//
//   node qa-cobuild-door.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { try { ({ chromium } = await import('playwright')); } catch {} }
if (!chromium) {
  console.log('SKIP  qa-cobuild-door needs Playwright, which is not installed.');
  process.exit(0);
}
const CANDIDATES = [process.env.BK_CHROME, '/opt/pw-browsers/chromium'].filter(Boolean);
const exe = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

// --- the page, and stubs for the three endpoints it talks to --------------------
const ROOT = path.resolve('public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
let FLAG = false;          // what /api/app-flags says cobuild_live is
let CHECKOUT = { ok: false };  // what /api/cobuild-billing answers a checkout with
let leads = [];            // every /api/cobuild-lead post, clicks and names alike
let bills = [];            // every /api/cobuild-billing post

const json = (r, body) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(body)); };
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/api/app-flags') return json(r, { ok: true, flags: { cobuild_live: FLAG } });
  if (u === '/api/cobuild-lead') { leads.push(u); return json(r, { ok: true }); }
  if (u === '/api/cobuild-billing') { bills.push(u); return json(r, CHECKOUT); }
  const f = path.join(ROOT, u === '/' ? 'cobuild.html' : u.replace(/^\//, ''));
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  try {
    const b = fs.readFileSync(f);
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  } catch { r.writeHead(404); r.end(); }
});
await new Promise((res) => srv.listen(0, res));
const PORT = srv.address().port;
const URL_ = `http://127.0.0.1:${PORT}/cobuild.html`;

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let fail = 0;
const errs = [];
const check = (label, ok, detail) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  ::  ' + detail : ''));
  if (!ok) fail++;
};
async function visit() {
  const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL_, { waitUntil: 'networkidle' });
  return p;
}

// --- 1) the switch is OFF: the fake door, exactly as it has always been ---------
console.log('--- cobuild_live OFF: the waitlist ---');
FLAG = false; leads = []; bills = [];
let page = await visit();
await page.click('a.btn:has-text("Start building, $10/month")');
await page.waitForTimeout(400);
check('a Start button opens the waitlist form',
  await page.locator('#modal.open #form').isVisible());
check('the click is logged, switch or no switch', leads.length >= 1, `${leads.length} posted`);
check('nothing is asked of the checkout', bills.length === 0);
await page.fill('#email', 'a@b.com');
await page.fill('#kidname', 'Riley');
await page.click('#form a.btn:has-text("Save my spot")');
await page.waitForTimeout(400);
check('the name goes in and she is thanked', await page.locator('#thanks').isVisible());
check('and the lead really posted, not just the click', leads.length >= 2, `${leads.length} posted`);
await page.close();

// --- 2) the switch is ON but the checkout is not set up yet ---------------------
// The one that matters most: the owner flips the switch before the Stripe keys are in,
// and a grown-up must still land somewhere rather than on a button that does nothing.
console.log('\n--- cobuild_live ON, checkout not configured: never a dead end ---');
FLAG = true; CHECKOUT = { ok: false }; leads = []; bills = [];
page = await visit();
await page.click('a.btn:has-text("Start with Premium")');
await page.waitForTimeout(600);
check('the button asks for a real checkout first', bills.length === 1, `${bills.length} asked`);
check('and falls back to the waitlist rather than a dead end',
  await page.locator('#modal.open #form').isVisible());
check('the click is still logged on this side of the switch too', leads.length >= 1, `${leads.length} posted`);
await page.close();

// --- 3) the switch is ON and the checkout answers ------------------------------
console.log('\n--- cobuild_live ON, checkout configured: the real door ---');
FLAG = true;
CHECKOUT = { ok: true, url: `http://127.0.0.1:${PORT}/cobuild.html?paid=1` };
leads = []; bills = [];
page = await visit();
await page.click('a.btn:has-text("Start with Cobuild")');
await page.waitForTimeout(900);
check('the button really leaves for the checkout', page.url().indexOf('paid=1') >= 0, page.url());
check('the fake-door number is still counted on the way out', leads.length >= 1, `${leads.length} posted`);
await page.close();

console.log('');
check('no page errors on any path', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
srv.close();
process.exit(fail ? 1 : 0);
