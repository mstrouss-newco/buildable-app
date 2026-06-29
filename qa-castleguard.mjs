// Headless QA for public/castle-guard.html — a sensible-placement bot must beat EVERY level
// (no harsh loss; goblins poof and go home). Model: qa-breaker.mjs.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/public/' + f, 'utf8');
const html = read('castle-guard.html');
const libs = ['buildable-renders.js', 'buildable-audio.js', 'buildable-mechanics.js', 'buildable-startscreen.js', 'buildable-gamenav.js'].map(read).join('\n');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
const noop = () => {};
const ctxStub = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k === 'canvas' ? { width: 960, height: 600 } : (typeof k === 'string' ? noop : undefined)) });
function el(withAppend) {
  const e = { style: { setProperty: noop }, classList: { add: noop, remove: noop, contains: () => false }, addEventListener: noop, removeEventListener: noop, getContext: () => ctxStub, onclick: null, textContent: '', width: 960, height: 600, naturalWidth: 0, complete: false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
  Object.defineProperty(e, 'innerHTML', { set() {}, get() { return ''; } });
  if (withAppend) { e.appendChild = noop; e.removeChild = noop; }
  return e;
}
class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
const documentStub = { getElementById: (id) => id === 'start' ? el(false) : el(true), querySelector: () => el(true), addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true) };
const sandbox = { document: documentStub, window: {}, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop, removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop, localStorage: { getItem: () => null, setItem: noop }, performance: { now: () => Date.now() }, Date, Math, console };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(libs + '\n' + engine, sandbox, { filename: 'castle-guard' });
const G = sandbox.BUILDABLE_GAME;
if (!G) { console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if (sandbox.CASTLEGUARD_GAME !== G) { console.error('FAIL: CASTLEGUARD_GAME alias missing'); process.exit(2); }
const cfg = G._cfg(); const n = cfg.levels.length; let ok = true;

console.log('--- EVERY level beaten by a sensible-placement bot (5 runs each) ---');
for (let i = 0; i < n; i++) {
  let winAll = true, worst = 0, minHearts = 99;
  for (let t = 0; t < 5; t++) {
    const r = G.sim(i, 90000);
    if (r.result !== 'win') winAll = false;
    worst = Math.max(worst, r.frames); minHearts = Math.min(minHearts, r.hearts);
  }
  if (!winAll) ok = false;
  console.log(`${winAll ? 'PASS' : 'FAIL'}  L${i + 1} ${cfg.levels[i].name.padEnd(13)} winAll5=${winAll} worst=${worst}f (~${(worst / 60).toFixed(0)}s) minHeartsLeft=${minHearts}`);
}

console.log('--- a careful first level should keep most hearts (3 stars achievable) ---');
const s = G.sim(0, 90000);
console.log(`L1 stars=${s.stars} heartsLeft=${s.hearts} defenders=${s.defenders} retries=${s.retries}`);
if (s.stars < 1) ok = false;

console.log('--- render smoke (menu + mid-level + win overlay) ---');
console.log('menu render:', G._draw());
G._begin(1); G._step(120); console.log('play render:', G._draw());
const w = G.sim(0, 90000); const dw = G._draw(); console.log('post-win render:', dw);
if (G._draw() !== 'ok') ok = false;

console.log('--- KNIGHT smoke: melee defender runs headlessly without error (level 1) ---');
try {
  const k = G.simWith(0, 'knight', 90000);
  console.log(`knight run: result=${k.result} frames=${k.frames} defenders=${k.defenders} hearts=${k.hearts}`);
  if (!k || typeof k.frames !== 'number') ok = false;
} catch (e) { console.log('FAIL knight smoke:', e.message); ok = false; }

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
