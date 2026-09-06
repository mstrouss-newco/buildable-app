// Headless QA for Hop Heroes (public/play.html) — the Mario-feel engine.
//
// qa/sim-node.mjs answers one question: does a perfect player still win? This
// answers the rest of them. It boots the engine in a vm sandbox with no browser,
// drives the hero one frame at a time through BK_GAME.test, and checks the things
// that HH1 to HH3 promised: a run-up rather than an instant top speed, coyote time,
// a jump buffer, a stomp that squashes and bounces, holes that really are holes,
// a camera that can never push the ground off the bottom of the screen, coins that
// sit on the path a ground-running kid actually takes, and the Mario furniture
// (bonk blocks, pipes, a flag pole).
//
// Dependency-free on purpose, like the other qa-*.mjs scripts, so qa-all.mjs can
// always run it. No network, no browser, no npm install.
//
//   node qa-hopheroes.mjs            # from the repo root
//   node qa-hopheroes.mjs /path/repo
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const dir = process.argv[2] || '.';
const file = path.resolve(dir, 'public/play.html');
const html = fs.readFileSync(file, 'utf8');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + label + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('FAIL  ' + label + (detail ? '  ' + detail : '')); }
  return ok;
}

// ---------------------------------------------------------------- the sandbox
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient')
    ? () => ({ addColorStop: noop })
    : (k === 'measureText' ? (t => ({ width: String(t || '').length * 8 }))
      : (typeof k === 'string' ? noop : undefined)),
});
function makeEl() {
  return { style: {}, addEventListener: noop, getContext: () => ctxStub, width: 900, height: 540,
    naturalWidth: 0, naturalHeight: 0, complete: false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 540 }) };
}
class ImageStub { constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
const sandbox = {
  document: { getElementById: () => makeEl(), querySelector: () => makeEl(),
    addEventListener: noop, createElement: () => makeEl() },
  window: {}, Image: ImageStub,
  requestAnimationFrame: noop, cancelAnimationFrame: noop,
  addEventListener: noop, removeEventListener: noop,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  Date, Math, console,
  BuildableWin: { card: noop },              // the shared win card, stubbed for the draw smoke
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(engine, sandbox, { filename: 'play.html-engine' });

const BK = sandbox.BK_GAME;
if (!BK) { console.error('FAIL: BK_GAME not exposed'); process.exit(2); }
const T = BK.test;
if (!T) { console.error('FAIL: BK_GAME.test hooks not exposed — qa-hopheroes cannot drive the hero'); process.exit(2); }
const K = T.consts();
const cfg = sandbox.GAME_CONFIG;
const nLevels = (cfg && cfg.levels && cfg.levels.length) || 1;

// ------------------------------------------------- 1. every level is clearable
console.log('--- a perfect player still clears every level ---');
for (let i = 0; i < nLevels; i++) {
  const r = BK.sim(i, 20000);
  check(`level ${i} wins`, r.result === 'win', `frames=${r.frames} (~${(r.frames / 60) | 0}s) coins=${r.coins}`);
  // A kid should take two to three minutes, so the perfect run wants to stay near
  // 45 seconds. Too fast means the level got shorter when the hero got faster.
  // Winning on the last heart means the level has spots even a flawless run cannot
  // handle. That is one unlucky roll away from a level that cannot be cleared at all.
  check(`level ${i} perfect player finishes unhurt`, r.hearts === 3, `hearts=${r.hearts}/3`);
  check(`level ${i} length is still kid-sized`, r.frames > 2000 && r.frames < 4200, `${r.frames} frames, want 2000-4200`);
  const [got, of_] = r.coins.split('/').map(Number);
  const pct = of_ ? Math.round(got * 100 / of_) : 0;
  check(`level ${i} coins sit on the ground path`, pct >= 60, `${pct}% of ${of_} collected by a bot that never leaves the floor`);
}

// A long stretch of empty floor to test movement on: no pipe, no crystal, no critter,
// no hole for 700px, so nothing interrupts the run-up.
function clearRun() {
  T.boot(0);
  const L = T.level(), pits = T.pits();
  for (let x = 400; x < L.goalX - 900; x += 40) {
    const busy = L.pipes.some(p => p.x > x - 80 && p.x < x + 760)
      || L.obstacles.some(o => o.x > x - 80 && o.x < x + 760)
      || L.enemies.some(e => e.x > x - 80 && e.x < x + 760)
      || L.lowBars.some(b => b.x > x - 80 && b.x < x + 760)
      || pits.some(p => p.x0 > x - 80 && p.x0 < x + 760);
    if (!busy) return x;
  }
  return 400;
}

// ------------------------------------------------------------ 2. the run-up
console.log('--- movement: a run-up, not an instant top speed ---');
{
  const rx = clearRun();
  T.boot(0); T.set({ x: rx, y: K.GROUND_Y - 60, vy: 0, onGround: true, vx: 0, right: true });
  T.step(1); const after1 = Math.abs(T.get().vx);
  T.step(4); const after5 = Math.abs(T.get().vx);
  T.step(40); const top = Math.abs(T.get().vx);
  const want = T.level().speed * K.TOP_MULT;
  check('one frame of input is a nudge, not full speed', after1 < want * 0.25, `vx=${after1.toFixed(2)} of ${want.toFixed(2)}`);
  check('still accelerating after five frames', after5 < want * 0.85, `vx=${after5.toFixed(2)}`);
  check('reaches the new top speed', top > want * 0.97, `vx=${top.toFixed(2)} vs top ${want.toFixed(2)}`);
  check('top speed really is faster than the recipe speed', want > T.level().speed * 1.3, `${want.toFixed(2)} vs ${T.level().speed}`);
  T.set({ right: false });
}

// --------------------------------------------------------------- 3. the skid
console.log('--- skid: pushing the other way bleeds momentum instead of stopping dead ---');
{
  const rx = clearRun();
  T.boot(0); T.set({ x: rx, y: K.GROUND_Y - 60, vy: 0, onGround: true, vx: 0, right: true }); T.step(40);
  const before = T.get().vx;
  T.set({ right: false, left: true }); T.step(1);
  const g = T.get();
  check('a turn-around is flagged as a skid', g.skid > 0, `skid=${g.skid}`);
  check('momentum bleeds, it does not reverse instantly', g.vx > 0 && g.vx < before, `${before.toFixed(2)} -> ${g.vx.toFixed(2)}`);
  T.step(24);
  check('the hero does come around', T.get().vx < 0, `vx=${T.get().vx.toFixed(2)}`);
  T.set({ left: false });
}

// -------------------------------------------------------- 4. coyote + buffer
console.log('--- coyote time and the jump buffer ---');
{
  // Walk off the end of the world's first solid stretch, then jump a few frames late.
  T.boot(0);
  const pits = T.pits(), L0 = T.level();
  check('the level has holes to fall down', pits.length > 0, `${pits.length} pits`);
  // Pick a hole with no vine hanging over it: grabbing the vine is correct behaviour,
  // but it is a different jump and would mask what this check is asking about.
  const pit = pits.find(p => !(L0.swings || []).some(w => w.ax > p.x0 - 140 && w.ax < p.x1 + 140)) || pits[0];
  T.set({ x: pit.x0 - 30, y: K.GROUND_Y - 60, vx: 3, vy: 0, onGround: true, right: true });
  let leftGround = -1;
  for (let f = 0; f < 60 && leftGround < 0; f++) { T.step(1); if (!T.get().onGround) leftGround = f; }
  check('the hero does walk off the ledge', leftGround >= 0, `frame ${leftGround}`);
  const coy = T.get().coyote;
  check('coyote grace is running', coy > 0 && coy <= K.COYOTE_FRAMES, `coyote=${coy}/${K.COYOTE_FRAMES}`);
  T.step(2); T.jump();
  check('a late jump off a ledge still fires', T.get().vy < K.JUMP * 0.9, `vy=${T.get().vy.toFixed(1)} (a real ground jump is ${K.JUMP})`);
}
{
  // Jump pressed a few frames before touching down: it must be remembered and fire on
  // landing, not be thrown away. The window is short on purpose, so press inside it.
  T.boot(0);
  T.set({ x: 300, y: K.GROUND_Y - 240, vx: 0, vy: 2, onGround: false });
  T.step(K.COYOTE_FRAMES + 2);                  // fall long enough that the coyote grace is spent
  T.set({ y: K.GROUND_Y - 100, vy: 8 });        // now drop him a few frames above the floor
  T.jump();                                     // nothing to push off — this must buffer
  const g = T.get();
  check('a jump with nothing to push off is remembered', g.buf > 0 && g.buf <= K.BUFFER_FRAMES, `buffer=${g.buf}/${K.BUFFER_FRAMES}`);
  let fired = false, landed = false;
  for (let f = 0; f < K.BUFFER_FRAMES + 4; f++) { T.step(1); const st = T.get(); if (st.onGround) landed = true; if (st.vy < -5) { fired = true; break; } }
  check('the buffered jump fires the moment the feet touch down', fired, landed ? '' : 'never reached the floor');
}
{
  // The double jump is untouched by all of the above.
  T.boot(0);
  T.set({ x: 300, y: K.GROUND_Y - 60, vx: 0, vy: 0, onGround: true });
  T.jump(); const first = T.get().vy;
  T.step(3); T.jump(); const second = T.get().vy;
  check('the double jump still works', first < -5 && second < -5, `first=${first.toFixed(1)} second=${second.toFixed(1)}`);
  T.step(3); T.jump();
  check('there is no triple jump', T.get().vy > second, 'a third press does nothing');
}

// ------------------------------------------------------------- 5. the stomp
console.log('--- the stomp squashes and bounces ---');
{
  T.boot(0);
  const e = T.level().enemies.find(x => !x.dead);
  check('the level has an enemy to stomp', !!e);
  if (e) {
    T.set({ x: e.x - 24, y: e.y - 60, vx: 0, vy: 6, onGround: false });
    let bounced = false;
    for (let f = 0; f < 12 && !bounced; f++) { T.step(1); if (T.get().vy < -3) bounced = true; }
    check('landing on an enemy bounces the hero', bounced, `vy=${T.get().vy.toFixed(1)}`);
    check('the enemy is squashed flat, then fades', e.dead === true && e.squash > 0, `dead=${e.dead} squash=${e.squash}`);
  }
}

// --------------------------------------------------- 6. holes really are holes
console.log('--- pits ---');
{
  T.boot(0);
  const pits = T.pits();
  let bad = 0;
  for (const p of pits) {
    for (let x = p.x0 + 2; x < p.x1 - 2; x += 8) if (T.groundAt(x) != null) bad++;
    if (T.groundAt(p.x0 - 6) == null || T.groundAt(p.x1 + 6) == null) bad++;
  }
  check('every drawn pit is a real hole with solid ground either side', bad === 0, `${bad} bad samples across ${pits.length} pits`);
}

// ------------------------------------- 7. the camera can never lose the ground
console.log('--- camera ---');
{
  const views = [[900, 540], [1440, 900], [390, 844], [820, 1180]];
  let worst = '';
  let ok = true;
  for (const [vw, vh] of views) {
    T.boot(0); T.view(vw, vh);
    // fling the hero as high as a bounce pad can, then let the camera settle
    T.set({ x: 300, y: K.GROUND_Y - 60, vx: 0, vy: K.JUMP * 1.55, onGround: false });
    for (let f = 0; f < 90; f++) { T.step(1); T.paint(); }
    const g = T.get();
    const groundScreenY = g.skyPad + K.GROUND_Y + g.camY;
    if (!(groundScreenY < g.VH - 20)) { ok = false; worst = `${vw}x${vh}: ground at ${groundScreenY.toFixed(0)} of ${g.VH}`; }
  }
  check('the ground band stays on screen at every size, even off a bounce pad', ok, worst || 'checked 900x540, 1440x900, 390x844, 820x1180');
  T.boot(0); T.view(900, 540);
  T.set({ x: 90, vx: -4, left: true }); T.step(30); T.paint();
  check('the camera never scrolls left of the start', T.get().camX >= 0, `camX=${T.get().camX.toFixed(1)}`);
  T.set({ left: false });
}

// --------------------------------------------- 8. the Mario furniture (HH3)
console.log('--- the Mario ingredients ---');
{
  T.boot(0);
  const lv = T.level();
  check('there are bonk blocks to hit from below', lv.blocks && lv.blocks.length > 0, `${(lv.blocks || []).length} blocks`);
  const qBlocks = (lv.blocks || []).filter(b => b.kind === 'q');
  check('some of them are question blocks', qBlocks.length > 0, `${qBlocks.length} of ${(lv.blocks || []).length}`);
  let overAir = 0;
  for (const b of (lv.blocks || [])) if (T.groundAt(b.x + b.w / 2) == null) overAir++;
  check('every block sits over solid ground, so the floor path stays clearable', overAir === 0, `${overAir} over a hole`);
  check('there are pipes marking the start of the danger', lv.pipes && lv.pipes.length > 0, `${(lv.pipes || []).length} pipes`);
  let pipeAir = 0;
  for (const p of (lv.pipes || [])) if (T.groundAt(p.x + p.w / 2) == null) pipeAir++;
  check('every pipe stands on solid ground', pipeAir === 0, `${pipeAir} over a hole`);
  check('the finish is a flag pole', typeof lv.poleX === 'number' && lv.poleX > 0, `poleX=${lv.poleX}`);
  // a coin arc over a gap: at least one coin above each pit
  let arced = 0;
  const pits2 = T.pits();
  for (const p of pits2) if (lv.coins.some(c => c.x > p.x0 - 120 && c.x < p.x1 + 120 && c.y < K.GROUND_Y - 60)) arced++;
  check('every gap has a coin arc over it', arced === pits2.length, `${arced} of ${pits2.length} pits`);
}

// ------------------------------------------------------ 9. the file's own rules
console.log('--- the rules the file has to keep ---');
{
  const src = html;
  const emoji = src.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
  check('no emojis anywhere in the engine', !emoji, emoji ? `found ${[...new Set(emoji)].join(' ')}` : '');
  check('the shared HUD strip is loaded', /src="buildable-hud\.js"/.test(src));
  check('the shared nav bridge is loaded', /src="buildable-gamenav\.js"/.test(src));
  check('the shared win card is loaded', /src="buildable-wincard\.js"/.test(src));
  check('the old unreadable canvas HUD text is gone', !/ctx\.fillText\(L\.name/.test(src));
  check('background trees are skipped over a hole', /for\(const m of SC\.mid\)[\s\S]{0,220}groundUnder\(m\.x\)==null/.test(src));
  check('background bushes are skipped over a hole', /for\(const nr of SC\.near\)[\s\S]{0,260}groundUnder\(nr\.x\)==null/.test(src));
  check('the hero is drawn after the canopy and ferns, never under them',
    src.indexOf('LAYER 6') > 0 && src.indexOf('LAYER 6') < src.indexOf('// hero — HH1 animation'));
  check('the world height is a constant, so baked level geometry can never move', /const H=540/.test(src));
}

// ------------------------------------------------------------- 10. draw smoke
console.log('--- render smoke ---');
{
  let threw = null;
  try { T.boot(0); T.view(1440, 900); for (let f = 0; f < 40; f++) { T.step(1); T.paint(); }
        T.view(390, 844); for (let f = 0; f < 40; f++) { T.step(1); T.paint(); } }
  catch (e) { threw = String(e && e.message || e); }
  check('the engine draws a frame without throwing, on a desktop and on a phone', !threw, threw || '');
}

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
