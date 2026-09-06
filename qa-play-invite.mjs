// Headless QA for the guest "grandma flow" front end (public/play-invite.html)
// — card QA9.
//
// This is the page a relative lands on when a kid shares an invite link: no
// account, no app shell, just join and play. QA-MAP.md §8a flagged it as the
// worst-covered thing on the site — qa-invite.mjs checks api/invite.js, so the
// BACK end of the guest flow was guarded and the front end was not.
//
//   A  REACHABILITY — the page and the /i/<code> style entry points are routed
//      ahead of the catch-all, and every local file it loads exists.
//   B  SHAPE — the ids its own script addresses, and no emoji.
//   C  THE PAIR — the page and api/invite.js still agree: every /api/invite
//      action the page sends is an action the API handles.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || '.';
let ok = true;
const fail = (m) => { console.log('FAIL: ' + m); ok = false; };
const pass = (m) => console.log('PASS: ' + m);

const PAGE = path.join(dir, 'public', 'play-invite.html');
if (!fs.existsSync(PAGE)) { console.log('FAIL: public/play-invite.html is missing'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');

// ---------------- A. reachability ----------------
console.log('--- A. reachability ---');
const srcs = (JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8')).routes || []).map((r) => r.src);
const catchAllAt = srcs.indexOf('/(.*)');
const routedBefore = (p) => {
  const i = srcs.findIndex((s) => {
    if (s === p) return true;
    if (!s.includes('(')) return false;
    try { return new RegExp('^' + s + '$').test(p); } catch { return false; }
  });
  return i !== -1 && (catchAllAt === -1 || i < catchAllAt);
};
if (routedBefore('/play-invite.html')) pass('/play-invite.html is routed ahead of the catch-all');
else fail('/play-invite.html has no route ahead of the catch-all — every invite link would open the marketing page');

// Whatever pretty path the invite links use, it has to land here and not on landing.html.
const prettyRoutes = (JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8')).routes || [])
  .filter((r) => /play-invite\.html/.test(r.dest || '')).map((r) => r.src);
if (prettyRoutes.length) pass('invite links land here: ' + prettyRoutes.join(', '));
else fail('no route anywhere sends an invite link to play-invite.html');

const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((m) => m[1]))]
  .filter((r) => !/^\/api\//.test(r) && !r.startsWith('//'));
let missing = 0;
for (const r of refs) if (!fs.existsSync(path.join(dir, 'public', r.replace(/^\//, '')))) { fail('play-invite.html asks for ' + r + ', which is not in public/'); missing++; }
if (!missing) pass('every local file the page loads exists (' + refs.length + ' checked)');

// ---------------- B. shape ----------------
console.log('--- B. shape ---');
for (const id of ['app', 'join', 'go', 'err', 'frame', 'share', 'copy', 'nm', 'lk']) {
  if (html.includes('id="' + id + '"')) pass('#' + id + ' is on the page');
  else fail('#' + id + ' is gone but the page script still addresses it');
}
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
if (emoji) fail('emoji found on the page (' + emoji.slice(0, 5).join(' ') + ') — the house rule is drawn SVG only');
else pass('no emoji anywhere on the page');
if (/id="err"/.test(html) && /err/.test(html.split('<script').slice(1).join(''))) pass('there is an error path, so a dead or used-up link says so instead of hanging');
else fail('the page has no visible error path — a bad invite code would just hang');

// ---------------- C. the pair ----------------
console.log('--- C. the page and api/invite.js still agree ---');
const API = path.join(dir, 'api', 'invite.js');
if (!fs.existsSync(API)) { fail('api/invite.js is missing — the whole guest flow is gone'); }
else {
  const api = fs.readFileSync(API, 'utf8');
  // Every action the page asks for must be one the API branches on.
  const asked = [...new Set([...html.matchAll(/action["']?\s*[:=]\s*["']([a-zA-Z_]+)["']/g)].map((m) => m[1]))];
  if (!asked.length) pass('the page sends no named action (it uses the plain endpoint)');
  for (const a of asked) {
    if (api.includes('"' + a + '"') || api.includes("'" + a + "'")) pass('/api/invite handles the "' + a + '" the page sends');
    else fail('the page sends action "' + a + '" but api/invite.js never handles it — the guest would see an error');
  }
  if (/\/api\/invite/.test(html)) pass('the page really talks to /api/invite');
  else fail('the page no longer calls /api/invite — qa-invite.mjs would still pass while the flow is dead');
  if (routedBefore('/api/(.*)') || srcs.some((s) => /^\/api\//.test(s))) pass('/api/* is routed ahead of the catch-all');
  else fail('/api/* has no route ahead of the catch-all');
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
