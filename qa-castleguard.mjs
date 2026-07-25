// Headless QA for public/castle-guard.html
// Two guarantees, both must hold:
//   1) NO-LOSE floor: a full-coverage bot must WIN every level (design = always winnable).
//   2) REAL PRESSURE: a "kid" bot limited to few towers must NOT trivially ace it
//      (proves the game is no longer too easy) — the boss finale must be lost with 3 towers.
// Model: qa-breaker.mjs.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/public/' + f, 'utf8');
const html = read('castle-guard.html');
const libs = ['buildable-renders.js', 'buildable-audio.js', 'buildable-mechanics.js', 'buildable-startscreen.js', 'buildable-gamenav.js', 'buildable-wincard.js', 'buildable-manifest.js'].map(read).join('\n');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
const noop = () => {};
const ctxStub = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k === 'measureText' ? ((t)=>({width:(String(t||'').length*8)})) : (k === 'canvas' ? { width: 960, height: 600 } : (typeof k === 'string' ? noop : undefined))) });
function el(withAppend) {
  const e = { style: { setProperty: noop }, classList: { add: noop, remove: noop, contains: () => false }, addEventListener: noop, removeEventListener: noop, getContext: () => ctxStub, onclick: null, textContent: '', width: 960, height: 600, naturalWidth: 0, complete: false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
  Object.defineProperty(e, 'innerHTML', { set() {}, get() { return ''; } });
  if (withAppend) { e.appendChild = noop; e.removeChild = noop; }
  return e;
}
// KP1: the stub can now "load" an image, but ONLY for sources the test names in
// IMGSIM. With IMGSIM empty it behaves exactly as before: nothing ever loads.
const IMGSIM = {};
class ImageStub {
  constructor() { this._l = []; this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) { this._src = v; const s = IMGSIM[v]; if (s) { this.naturalWidth = s[0]; this.naturalHeight = s[1]; this.complete = true; this._l.slice().forEach(f => f()); } }
  get src() { return this._src; }
  addEventListener(t, f) { if (t === 'load') { this._l.push(f); if (this.complete) f(); } }
}
const documentStub = { getElementById: (id) => id === 'start' ? el(false) : el(true), querySelector: () => el(true), addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true) };
const sandbox = { document: documentStub, window: {}, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop, removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop, localStorage: { getItem: () => null, setItem: noop }, performance: { now: () => Date.now() }, Date, Math, console };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(libs + '\n' + engine, sandbox, { filename: 'castle-guard' });
const G = sandbox.BUILDABLE_GAME;
if (!G) { console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if (sandbox.CASTLEGUARD_GAME !== G) { console.error('FAIL: CASTLEGUARD_GAME alias missing'); process.exit(2); }
const cfg = G._cfg(); const n = cfg.levels.length; let ok = true;

// ---- a "kid" run: only N archers, placed on the best slots, NO retry safety ----
function kidRun(idx, N) {
  G.startLevel(idx);
  const ranked = G._rankSlots(); let placed = 0;
  let f = 0;
  while (f < 120000) {
    const st = G.state();
    if (st === 'play') {
      const S = G._S(); const cost = cfg.defenders[0].cost;
      while (placed < N && S.coins >= cost) { if (!G._place(ranked[placed], 'archer')) break; placed++; }
      G._step(1);
    } else if (st === 'wavebreak') { G._step(1); }
    else break; // win or retry(=kid ran out of hearts)
  }
  const S = G._S();
  return { result: G.state(), hearts: S ? S.hearts : 0 };
}

console.log('--- enemy variety: scout / brute + a boss must exist ---');
const kinds = Object.keys(cfg.baddies);
const hasBoss = Object.values(cfg.baddies).some(b => b.boss);
console.log(`kinds = [${kinds.join(', ')}]  boss=${hasBoss}`);
if (kinds.length < 4 || !hasBoss) { console.log('FAIL: need >=4 enemy kinds incl. a boss'); ok = false; }

console.log('--- NO-LOSE floor: a full-coverage bot wins EVERY level (5 runs each) ---');
for (let i = 0; i < n; i++) {
  let winAll = true, worst = 0, minHearts = 99;
  for (let t = 0; t < 5; t++) {
    const r = G.sim(i, 120000);
    if (r.result !== 'win') winAll = false;
    worst = Math.max(worst, r.frames); minHearts = Math.min(minHearts, r.hearts);
  }
  if (!winAll) ok = false;
  console.log(`${winAll ? 'PASS' : 'FAIL'}  L${i + 1} ${cfg.levels[i].name.padEnd(12)} winAll5=${winAll} worst=${worst}f (~${(worst / 60).toFixed(0)}s) fullHeartsLeft=${minHearts}`);
}

console.log('--- REAL PRESSURE: a 3-tower "kid" must LOSE the boss finale (game is not trivial) ---');
const bossIdx = n - 1;
let kidLost = false;
for (let t = 0; t < 4; t++) { if (kidRun(bossIdx, 3).result !== 'win') kidLost = true; }
console.log(`${kidLost ? 'PASS' : 'FAIL'}  3-tower kid cannot ace L${bossIdx + 1} ${cfg.levels[bossIdx].name}`);
if (!kidLost) { console.log('  (too easy — a 3-tower setup should not beat the boss level)'); ok = false; }

console.log('--- difficulty curve (kid endHearts, no retry) — informational ---');
for (const N of [3, 4, 5]) {
  const row = cfg.levels.map((_, i) => { const r = kidRun(i, N); return r.result === 'win' ? String(r.hearts) : 'X'; });
  console.log(`  ${N} towers: [ ${row.join('  ')} ]   (X = ran out of hearts)`);
}

console.log('--- render smoke (menu + mid-level + win overlay) ---');
console.log('menu render:', G._draw());
G._begin(1); G._step(120); console.log('play render:', G._draw());
const w = G.sim(0, 120000); const dw = G._draw(); console.log('post-win render:', dw);
if (G._draw() !== 'ok') ok = false;

console.log('--- KNIGHT smoke: melee defender runs headlessly without error (level 1) ---');
try {
  const k = G.simWith(0, 'knight', 120000);
  console.log(`knight run: result=${k.result} frames=${k.frames} defenders=${k.defenders} hearts=${k.hearts}`);
  if (!k || typeof k.frames !== 'number') ok = false;
} catch (e) { console.log('FAIL knight smoke:', e.message); ok = false; }

console.log('--- MANIFEST (Session 7B): /castleguard/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/castleguard/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log((mv.ok?'PASS':'FAIL')+'  manifest validates  errors='+JSON.stringify(mv.errors)); if(!mv.ok)ok=false;
console.log((manifest.category==='Strategy'?'PASS':'FAIL')+'  category is Strategy'); if(manifest.category!=='Strategy')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
const lineUp = mcfg.stages.length===n && mcfg.stages.every((s,i)=>s.name===manifest.levels[i].name);
console.log((lineUp?'PASS':'FAIL')+'  '+n+' levels line up with the engine  ::  '+mcfg.stages.map(s=>s.name).join(', ')); if(!lineUp)ok=false;
console.log((mcfg.multiplayer==='off'?'PASS':'FAIL')+'  single-player (multiplayer off)'); if(mcfg.multiplayer!=='off')ok=false;
console.log((/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("castleguard"/.test(html)?'PASS':'FAIL')+'  engine loads the shared manifest'); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("castleguard"/.test(html)))ok=false;

console.log('--- KP1 dressing: library art can replace props, and can never break the game ---');
{
  const say = (pass, msg) => { console.log((pass ? 'PASS' : 'FAIL') + '  ' + msg); if (!pass) ok = false; };
  const dress = sandbox.applyDressing;
  say(typeof dress === 'function', 'the engine exposes applyDressing');
  const snap = () => JSON.stringify(cfg.sprites);
  const built = snap();
  dress(null); dress({}); dress({ tree: '' });
  say(snap() === built, 'no dressing named -> the built-in art is untouched');

  const missing = '/kenney/kits/nope/not-here.png';
  dress({ tree: missing });
  say(snap() === built, 'a piece that never loads -> the built-in art is STILL used');

  const real = '/kenney/kits/2d-assets__tower-defense/tree-bushy.png';
  IMGSIM[real] = [124, 118];
  dress({ tree: real });
  const t = cfg.sprites.tree;
  say(!!(t && t.dressed && t.fw === 124 && t.fh === 118 && t.n === 1),
      'a piece that loads -> the slot is dressed, measured, single-frame  :: ' + JSON.stringify(t));
  say(snap() !== built, 'dressing really changed the sprite table');
  say(sandbox.drawSprite(ctxStub, 'tree', 0, 0, 60, 0) === true, 'a dressed prop draws');
  t.fw = 0;
  say(sandbox.drawSprite(ctxStub, 'tree', 0, 0, 60, 0) === false, 'unmeasured art draws NOTHING rather than NaN');

  // and the real thing: every slot this manifest dresses points at a file that is
  // actually in the repo, from a kit that is actually added.
  const art = manifest.art || {};
  const dressed = Object.keys(art).filter(k => /^\/kenney\/kits\//.test(String(art[k] || '')));
  say(dressed.length > 0, 'the manifest dresses ' + dressed.length + ' prop(s) from a kit  :: ' + dressed.join(', '));
  dressed.forEach(k => {
    const rel = String(art[k]).replace(/^\//, '');
    say(fs.existsSync(dir + '/public/' + rel), 'art.' + k + ' -> ' + rel + ' exists');
    const slug = rel.split('/')[2];
    say(fs.existsSync(dir + '/public/kenney/kits/' + slug + '/kit.json'), 'art.' + k + ' comes from an ADDED kit (' + slug + ')');
  });
  say(dressed.every(k => !/knight|archer|baddie|goblin/i.test(k)), 'the animated characters are NOT dressed with stills');

  // Session KP2: the kit grew from 38 pieces to 65, so prove the NEW ones dress
  // too — a whole-tile ground square and a cut-out sprite, into two different
  // slots, one after the other. Swapping a slot twice must leave it swapped once.
  const kitDir = dir + '/public/kenney/kits/2d-assets__tower-defense';
  const kp2 = ['plate-stone.png', 'turret-green.png', 'plane-green.png'];
  kp2.forEach(f => say(fs.existsSync(kitDir + '/' + f), 'KP2 piece ' + f + ' is in the kit'));
  const kit = JSON.parse(fs.readFileSync(kitDir + '/kit.json', 'utf8'));
  say(kit.pieces.length >= 50, 'the kit Castle Guard dresses from holds ' + kit.pieces.length + ' pieces');

  const ground = '/kenney/kits/2d-assets__tower-defense/plate-stone.png';
  IMGSIM[ground] = [128, 128];
  dress({ rock1: ground });
  const r1 = cfg.sprites.rock1;
  say(!!(r1 && r1.dressed && r1.fw === 128 && r1.fh === 128 && r1.n === 1),
      'a KP2 ground square dresses a prop slot  :: ' + JSON.stringify(r1));
  say(sandbox.drawSprite(ctxStub, 'rock1', 0, 0, 60, 0) === true, 'the KP2 ground square draws');

  const turret = '/kenney/kits/2d-assets__tower-defense/turret-green.png';
  IMGSIM[turret] = [95, 40];
  dress({ castle: turret });
  say(!!(cfg.sprites.castle && cfg.sprites.castle.dressed), 'a KP2 sprite dresses a second slot');
  say(cfg.sprites.rock1 && cfg.sprites.rock1.fw === 128, 'dressing a second slot leaves the first one alone');

  // swapping the same slot again must land on the new piece, not stack up
  const sprout = '/kenney/kits/2d-assets__tower-defense/plant-sprout.png';
  IMGSIM[sprout] = [70, 66];
  dress({ rock1: sprout });
  say(cfg.sprites.rock1.fw === 70 && cfg.sprites.rock1.n === 1, 'swapping a slot again replaces the piece, it does not stack');
  dress({ rock1: '' });
  say(cfg.sprites.rock1.fw === 70, 'clearing a slot in a later call cannot half-undo a swap');
}

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
