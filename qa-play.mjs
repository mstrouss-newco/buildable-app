// Headless QA for the Hop Heroes engine page (public/play.html) — card QA9.
//
// play.html is the engine behind the Hop Heroes tile in GAME_CATALOG (id
// "platformer"), mounted by PlatformerScreen in the shell. It is behind the
// coming-soon 1111 gate today, but it is a real kid-facing game page and it had
// no harness of any kind (QA-MAP.md §8a).
//
// It carries one trap worth guarding on its own: its only script tag is
// RELATIVE — src="buildable-wincard.js", not "/buildable-wincard.js". That
// resolves today because the page is served from the site root. Move the page
// under a folder, or serve it from a pretty route with a path, and the script
// 404s silently. So this harness resolves the tag the way a browser would.
//
//   A  REACHABILITY — routed ahead of the catch-all, every script resolves
//      relative to the page's own URL, and each one is itself routed.
//   B  SHAPE — the ids its script addresses, and no emoji.
//   C  WIRING — the shell still mounts it, and the tile still names it.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || '.';
let ok = true;
const fail = (m) => { console.log('FAIL: ' + m); ok = false; };
const pass = (m) => console.log('PASS: ' + m);

const PAGE = path.join(dir, 'public', 'play.html');
if (!fs.existsSync(PAGE)) { console.log('FAIL: public/play.html is missing'); process.exit(1); }
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
if (routedBefore('/play.html')) pass('/play.html is routed ahead of the catch-all');
else fail('/play.html has no route ahead of the catch-all — the kid would get landing.html');

// Resolve every script the way the browser does from /play.html, relative tags included.
const tags = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
  .filter((s) => !s.startsWith('//') && !/^https?:/.test(s));
if (!tags.length) fail('play.html loads no scripts at all — the engine cannot run');
for (const t of tags) {
  const abs = t.startsWith('/') ? t : '/' + t.replace(/^\.\//, '');   // page lives at the site root
  const clean = abs.split('?')[0];
  if (fs.existsSync(path.join(dir, 'public', clean.replace(/^\//, '')))) pass('<script src="' + t + '"> resolves to public' + clean);
  else fail('<script src="' + t + '"> resolves to ' + clean + ', which is not in public/');
  if (routedBefore(clean)) pass(clean + ' is routed ahead of the catch-all');
  else fail(clean + ' has no route — the browser would get HTML and throw "Unexpected token \'<\'" (this is the Practice bug)');
}
const styles = [...new Set([...html.matchAll(/<link[^>]*href="(\/[^"?#]+)"/g)].map((m) => m[1]))];
for (const s of styles) {
  if (fs.existsSync(path.join(dir, 'public', s.replace(/^\//, '')))) pass(s + ' exists');
  else fail('play.html asks for ' + s + ', which is not in public/');
}

// ---------------- B. shape ----------------
console.log('--- B. shape ---');
for (const id of ['c', 'actions', 'hint', 'howto', 'bMute', 'bMusic', 'bHelp']) {
  if (html.includes('id="' + id + '"')) pass('#' + id + ' is on the page');
  else fail('#' + id + ' is gone but the page script still addresses it');
}
if (/<canvas[^>]*id="c"/.test(html)) pass('the game canvas is a real <canvas>');
else fail('#c is not a <canvas> — the engine draws into it');
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
if (emoji) fail('emoji found on the page (' + emoji.slice(0, 5).join(' ') + ') — the house rule is drawn SVG only');
else pass('no emoji anywhere on the page');

// ---------------- C. wiring ----------------
console.log('--- C. wiring ---');
const shell = fs.readFileSync(path.join(dir, 'src', 'BuildableKids.jsx'), 'utf8');
if (/src="\/play\.html/.test(shell)) pass('the shell still mounts /play.html');
else fail('nothing in the shell mounts /play.html — the Hop Heroes tile would open nothing');
if (/id: "platformer"/.test(shell)) pass('the Hop Heroes tile is still in GAME_CATALOG');
else fail('the "platformer" tile is gone from GAME_CATALOG but play.html is still shipped');

// QA-MAP.md §8c.4 / card QA7: the page is still titled "Buildable Runner —
// engine" while a DIFFERENT page, runner-engine.html, is the actual runner.
// That is a naming defect with its own card, so this harness reports it and
// does NOT fail — it would go red on work that is already tracked elsewhere.
const title = (html.match(/<title>([^<]*)/) || [, ''])[1];
if (/runner/i.test(title)) console.log('NOTE: play.html is still titled "' + title.trim() + '" — card QA7, not a failure here');
else pass('the page title no longer says "Runner" (card QA7 looks done — update QA-MAP.md §8c.4)');

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
