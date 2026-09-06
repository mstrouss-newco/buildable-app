// Headless QA for the Sound Machine (public/soundboard.html) — card QA9.
//
// Sound Machine is a LIVE tile on the Make shelf (`MAKE_CATALOG` id "sound"),
// and until this card it had no harness of any kind — QA-MAP.md §8a called it
// out as the most exposed of the sixteen uncovered pages.
//
// The failure this guards against: every pad on the board plays by asking
// /api/sfx?s=<key>. api/sfx.js answers 400 "unknown sound" for a key it does
// not know. So a pad whose key is not in the API's catalog is a silent dead
// button, and nothing anywhere would have told us.
//
//   A  REACHABILITY — routed ahead of the catch-all, local files exist, and the
//      Make tile still points here.
//   B  SHAPE — the ids the page's own script addresses, and no emoji.
//   C  THE CATALOG — every sound key on every pack exists in api/sfx.js.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const dir = process.argv[2] || '.';
let ok = true;
const fail = (m) => { console.log('FAIL: ' + m); ok = false; };
const pass = (m) => console.log('PASS: ' + m);

const PAGE = path.join(dir, 'public', 'soundboard.html');
if (!fs.existsSync(PAGE)) { console.log('FAIL: public/soundboard.html is missing'); process.exit(1); }
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
for (const p of ['/soundboard.html', '/sounds']) {
  if (routedBefore(p)) pass(p + ' is routed ahead of the catch-all');
  else fail(p + ' has no route ahead of the catch-all — kids would get landing.html');
}
const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((m) => m[1]))]
  .filter((r) => !/^\/api\//.test(r) && !r.startsWith('//'));
let missing = 0;
for (const r of refs) if (!fs.existsSync(path.join(dir, 'public', r.replace(/^\//, '')))) { fail('soundboard.html asks for ' + r + ', which is not in public/'); missing++; }
if (!missing) pass('every local file the page loads exists (' + refs.length + ' checked)');

const shell = fs.readFileSync(path.join(dir, 'src', 'BuildableKids.jsx'), 'utf8');
if (/soundboard|\/sounds/.test(shell)) pass('the Make shelf still opens the Sound Machine');
else fail('nothing in the shell opens /sounds any more — the Make tile is dead');

// ---------------- B. shape ----------------
console.log('--- B. shape ---');
for (const id of ['grid', 'tabs', 'muteBtn', 'muteLabel', 'sub']) {
  if (html.includes('id="' + id + '"')) pass('#' + id + ' is on the page');
  else fail('#' + id + ' is gone but the page script still addresses it');
}
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
if (emoji) fail('emoji found on the page (' + emoji.slice(0, 5).join(' ') + ') — the house rule is drawn SVG only');
else pass('no emoji anywhere on the page');

// ---------------- C. the catalog ----------------
console.log('--- C. every pad plays a sound the API knows ---');
const packSrc = html.slice(html.indexOf('var PACKS = ['));
let PACKS = null;
try {
  const end = packSrc.indexOf('\n];');
  const sandbox = {}; vm.createContext(sandbox);
  vm.runInContext(packSrc.slice(0, end + 3) + '\nglobalThis.__p = PACKS;', sandbox);
  PACKS = sandbox.__p;
} catch (e) { fail('could not read PACKS out of soundboard.html: ' + e.message); }

// Evaluate the SOUNDS literal itself rather than pattern-matching it, so a
// reformat of api/sfx.js cannot quietly turn this check into a no-op.
const api = fs.readFileSync(path.join(dir, 'api', 'sfx.js'), 'utf8');
let known = new Set();
try {
  const start = api.indexOf('const SOUNDS = {');
  const end = api.indexOf('\n};', start);
  const box = {}; vm.createContext(box);
  vm.runInContext(api.slice(start, end + 3) + '\nglobalThis.__s = SOUNDS;', box);
  known = new Set(Object.keys(box.__s || {}));
} catch (e) { fail('could not read the SOUNDS catalog out of api/sfx.js: ' + e.message); }
if (!known.size) fail('api/sfx.js lists no sounds — this harness is blind');
else pass('api/sfx.js knows ' + known.size + ' sounds');

if (PACKS && known.size) {
  let pads = 0; const dead = [];
  for (const pack of PACKS) {
    if (!pack.id || !pack.name || !Array.isArray(pack.sounds) || !pack.sounds.length) { fail('pack ' + (pack && pack.id) + ' is malformed'); continue; }
    for (const s of pack.sounds) {
      pads++;
      const key = Array.isArray(s) ? s[0] : s;
      if (!known.has(key)) dead.push(pack.id + '/' + key);
    }
  }
  if (dead.length) fail(dead.length + ' pad(s) play a sound api/sfx.js does not know, so they are silent dead buttons: ' + dead.slice(0, 10).join(', '));
  else pass('all ' + pads + ' pads across ' + PACKS.length + ' packs play a sound the API knows');
  const ids = PACKS.map((p) => p.id);
  if (new Set(ids).size === ids.length) pass('every pack id is unique');
  else fail('two packs share an id — the tab bar would select the wrong one');
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
