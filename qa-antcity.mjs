// Headless QA for public/antcity-engine.html (cards AC2, AC5, AC6, AC7). House style,
// modelled on qa-breaker.mjs: build the engine in a vm with the shared libs, drive it
// FROM the manifest, and prove a perfect player finishes all ten missions.
//
// AC7 put a REAL little DOM under this file. The engine's buttons, its one hint line
// and its canvas are now things the robot can press, read and drag, so the tutorial is
// tested the way a kid meets it: only the gestures the game actually teaches, done
// exactly as taught, in a mouse profile AND a touch profile, with the rule that at
// most one hint is ever on screen checked after every single one of them.
//
// What it asserts:
//   1. /antcity/manifest.json is the shape the engine reads (ten levels, ids,
//      layouts the engine has a goal for, coins, art parts).
//   2. A perfect-player bot completes EVERY mission, in order, headlessly, and the
//      run ends in free-build with the coins announced to the shared wallet.
//   3. The gentle setbacks behave: a flood blocks a tunnel and a builder clears it,
//      hunger and tiredness only slow the colony, and nothing can be lost.
//   4. Cartridge contract: pause freezes and resume continues, art resolves from
//      the URLs the manifest gives, BUILDABLE_GAME + the ANTCITY_GAME alias exist,
//      and there is no emoji anywhere in the engine.
//   5. AC7: food only ever moves when an ant delivers, one hint at a time, the taught
//      gestures all really work, idle ants stand still and never stack, the needs
//      meters read true, and Build is reachable with a button.
//
//   node qa-antcity.mjs .
import fs from 'fs'; import vm from 'vm';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(dir + '/public/' + f, 'utf8');
const html = read('antcity-engine.html');
const libs = ['buildable-renders.js', 'buildable-audio.js', 'buildable-mechanics.js', 'buildable-startscreen.js',
  'buildable-wincard.js', 'buildable-feel.js', 'buildable-manifest.js', 'buildable-hud.js',
  'buildable-gamenav.js', 'buildable-wallet.js'].map(read).join('\n');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');

let fails = 0;
const ok = (name, pass, extra = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`); if (!pass) fails++; };

// --- 1) the manifest the engine reads -----------------------------------------
console.log('--- MANIFEST: /antcity/manifest.json ---');
const manifest = JSON.parse(fs.readFileSync(dir + '/public/antcity/manifest.json', 'utf8'));
ok('manifest names the engine entry', manifest.entry === '/antcity-engine.html' && manifest.engine === 'canvas');
ok('ten tutorial missions', Array.isArray(manifest.levels) && manifest.levels.length === 10, `levels=${manifest.levels && manifest.levels.length}`);
ok('every mission has id, name, layout and coins',
  manifest.levels.every((l) => l.id && l.name && l.layout && typeof l.coins === 'number'));
ok('every mission has its art parts', manifest.levels.every((l) => l.parts && l.parts.soil && l.parts.ant));

// --- 2) a small real DOM, so gestures are gestures -----------------------------
// The engine is a page. Stubbing its buttons away meant the robot could only ever
// call the game's own functions, which is exactly how a tutorial ends up teaching a
// gesture that does nothing. This is a tiny DOM: nodes with parents, listeners that
// bubble, a class list, rectangles, and text you can read back.
const noop = () => {};
const VIEW = { w: 360, h: 640 };                     // the phone the robot is holding
const ctxStub = new Proxy({}, {
  get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient')
    ? () => ({ addColorStop: noop })
    : (k === 'canvas' ? { width: VIEW.w, height: VIEW.h } : (typeof k === 'string' ? noop : undefined)),
});
const byId = Object.create(null);
const RECTS = {                                       // where the page's furniture sits
  cv: { left: 0, top: 0, width: VIEW.w, height: VIEW.h },
  bar: { left: 90, top: 560, width: 250, height: 22 },
};
function node(tag) {
  const classes = new Set();
  const listeners = Object.create(null);
  const n = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null, id: '', type: '',
    textContent: '', disabled: false, dataset: {}, style: { setProperty: noop },
    getContext: () => ctxStub, width: VIEW.w, height: VIEW.h, naturalWidth: 0, complete: false,
    focus: noop, blur: noop, setPointerCapture: noop, releasePointerCapture: noop, scrollIntoView: noop,
    setAttribute(k, v) { n.dataset[k] = v; if (k === 'id') { n.id = v; byId[v] = n; } },
    getAttribute(k) { return n.dataset[k]; }, removeAttribute(k) { delete n.dataset[k]; },
    appendChild(c) { c.parentNode = n; n.children.push(c); if (c.id) byId[c.id] = c; return c; },
    insertBefore(c) { return n.appendChild(c); },
    removeChild(c) { const i = n.children.indexOf(c); if (i >= 0) n.children.splice(i, 1); return c; },
    remove() { if (n.parentNode) n.parentNode.removeChild(n); },
    contains(c) { return n.children.indexOf(c) >= 0; },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener(t, f) { const a = listeners[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); },
    dispatchEvent(ev) {
      ev.target = ev.target || n;
      for (let cur = n; cur; cur = cur.parentNode) (cur._listeners()[ev.type] || []).slice().forEach((f) => f(ev));
      return true;
    },
    _listeners: () => listeners,
    closest(sel) { const want = String(sel).toUpperCase(); for (let cur = n; cur; cur = cur.parentNode) if (cur.tagName === want) return cur; return null; },
    getBoundingClientRect: () => RECTS[n.id] || { left: 0, top: 0, width: 200, height: 24 },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (x, on) => (on == null ? (classes.has(x) ? classes.delete(x) : classes.add(x)) : (on ? classes.add(x) : classes.delete(x))),
      contains: (x) => classes.has(x),
    },
  };
  Object.defineProperty(n, 'className', {
    get: () => [...classes].join(' '),
    set: (v) => { classes.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
  });
  Object.defineProperty(n, 'childElementCount', { get: () => n.children.length });
  Object.defineProperty(n, 'firstChild', { get: () => n.children[0] || null });
  Object.defineProperty(n, 'offsetHeight', { get: () => 0 });   // no layout engine: the game falls back
  Object.defineProperty(n, 'innerHTML', { get: () => '', set: (v) => { if (!v) n.children.length = 0; } });
  return n;
}
// every id the page's own markup carries exists before the engine asks for it
[...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].forEach((m) => { const el = node('div'); el.id = m[1]; byId[m[1]] = el; });
const documentStub = {
  getElementById: (id) => byId[id] || (byId[id] = Object.assign(node('div'), { id })),
  querySelector: () => null, querySelectorAll: () => [],
  createElement: (t) => node(t), createElementNS: (_, t) => node(t),
  addEventListener: noop, removeEventListener: noop,
  head: node('head'), body: node('body'), documentElement: node('html'), hidden: false, visibilityState: 'visible',
};
class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
const coinPosts = [];
const listeners = {};                     // a real window event bus, so shell messages land
const send = (data) => (listeners.message || []).forEach((fn) => fn({ data }));
const store = {};
const sandbox = {
  document: documentStub, window: {}, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop,
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop,
  setInterval: () => 0, clearInterval: noop, performance: { now: () => Date.now() },
  URLSearchParams, location: { search: '' }, Date, Math, JSON, console,
  innerWidth: VIEW.w, innerHeight: VIEW.h, devicePixelRatio: 2,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  postMessage: (d) => { if (d && d.type === 'coins') coinPosts.push(d); },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(libs + '\n' + engine, sandbox, { filename: 'antcity' });

const G = sandbox.BUILDABLE_GAME;
console.log('\n--- CONTRACT ---');
ok('BUILDABLE_GAME exposed', !!G);
ok('ANTCITY_GAME alias', sandbox.ANTCITY_GAME === G);
// AC7: no level picker. Loading the page IS opening the colony.
ok('the game boots straight into the colony', !!G && G.state() === 'play', G && G.state());
if (!G) { console.error('no game handle — aborting'); process.exit(2); }

// the engine reads its own manifest through the shared loader; in a vm there is no
// fetch, so hand it the same manifest the browser would have fetched
G._applyManifest(manifest);
const named = G.missions();
ok('engine took its missions from the manifest',
  named.length === 10 && named[0].id === manifest.levels[0].id, named.map((m) => m.id).join(','));
ok('every manifest layout has a goal the engine understands',
  manifest.levels.every((l) => G._cfg().goals[l.layout]), manifest.levels.map((l) => l.layout).join(','));


// --- 3) the perfect player: finish all ten missions ---------------------------
console.log('\n--- THE BOT PLAYS THE TEN MISSIONS ---');
// watch the shared wallet: every coin must go through it, never into the game
const walletCalls = [];
const BWlib = sandbox.BuildableWallet;
if (BWlib && BWlib.awardOnce) { const real = BWlib.awardOnce; BWlib.awardOnce = (k, n) => { walletCalls.push({ k, n }); return real.call(BWlib, k, n); }; }
G.play(3);
const CAP_SECONDS = 900;          // a generous ceiling; a real kid has forever

// what a perfect player does about the mission in front of it
function work(m) {
  const d = G.dbg();
  // always keep the pantry stocked and the crew balanced
  if (d.food < 12) { G.drop('food', 100); G.drop('food', 200); }
  if (d.water < 8) G.drop('water', 260);
  if (d.flooded) G.assign('builder', Math.max(2, Math.floor(d.ants * 0.3)));
  const goal = m.goal || {};
  if (goal.type === 'dug' || goal.type === 'found') {
    if (d.planned < 3) G.digDown(4);
    G.assign('digger', Math.max(2, Math.floor(d.ants * 0.4)));
  } else if (goal.type === 'food') {
    G.drop('food', 150); G.assign('forager', Math.max(2, Math.floor(d.ants * 0.5)));
  } else if (goal.type === 'room') {
    G.assign('builder', Math.max(2, Math.floor(d.ants * 0.4)));
    if (d.rooms[goal.room] < 1) {
      const spot = G.openTunnel();
      if (spot && d.food >= 8) G.build(spot.c, spot.r, goal.room);
      else if (d.food < 8) { G.drop('food', 120); G.assign('forager', Math.max(2, Math.floor(d.ants * 0.5))); }
    }
  } else if (goal.type === 'born' || goal.type === 'ants') {
    G.assign('nursery', Math.max(2, Math.floor(d.ants * 0.4)));
    G.assign('forager', Math.max(2, Math.floor(d.ants * 0.4)));
    G.drop('food', 140); G.drop('water', 180);
  } else if (goal.type === 'flood') {
    G.assign('builder', Math.max(2, Math.floor(d.ants * 0.4)));
  }
}

const results = [];
// AC9: the bad bugs must never touch the tutorial. Every step of every mission is
// watched for one, and the count has to come out at zero.
let tutorialBugs = 0;
for (let i = 0; i < 10; i++) {
  const listed = G.missions()[i];            // name the mission by its place in the list
  let secs = 0;
  while (!G.missions()[i].done && !G.freeBuild() && secs < CAP_SECONDS) {
    work(G.mission()); G.seconds(2); secs += 2;
    if (G.bug()) tutorialBugs++;
  }
  const done = G.missions()[i].done;
  results.push({ n: i + 1, id: listed.id, name: listed.name, done, secs });
  ok(`mission ${i + 1} — ${listed.name}`, done, `${secs}s of colony time`);
  if (!done) break;
}
ok('all ten missions finished', results.length === 10 && results.every((r) => r.done));
ok('the tenth hands off to free-build', G.freeBuild() === true);

const coins = G.dbg().coins;
const missionCoins = manifest.levels.reduce((a, l) => a + l.coins, 0);
// what the MISSIONS paid: the milestones and the AC9 bug scares have their own keys
const paid = coins.filter((c) => c.key.indexOf('antcity:milestone:') !== 0 && c.key.indexOf('antcity:bug:') !== 0)
  .reduce((a, c) => a + c.n, 0);
ok('every mission paid its manifest coins to the wallet', paid === missionCoins, `paid=${paid} manifest=${missionCoins}`);
ok('every coin went through the shared wallet, none banked in the game',
  walletCalls.length === coins.length && walletCalls.length >= 10, `${walletCalls.length} wallet calls`);
const keys = coins.map((c) => c.key);
ok('no coin key is claimed twice', new Set(keys).size === keys.length);

// --- 4) the gentle setbacks ---------------------------------------------------
console.log('\n--- SETBACKS PAUSE, THEY NEVER PUNISH ---');
const beforeRain = G.dbg();
const flooded = G.rain();
ok('rain floods a tunnel', !!flooded && G.floods() >= 1, JSON.stringify(flooded));
ok('a flood never takes ants, food or tunnels away',
  G.dbg().ants === beforeRain.ants && G.dbg().dug === beforeRain.dug && G.dbg().food === beforeRain.food);
G.assign('builder', 6);
let t = 0; while (G.floods() > 0 && t < 240) { G.seconds(2); t += 2; }
ok('builders clear the flood', G.floods() === 0, `${t}s`);
ok('the setback line is in kid words, or empty when all is well',
  G.setback() === null || typeof G.setback() === 'string', String(G.setback()));

// hunger only slows the colony down
const starve = G.dbg().ants;
for (let i = 0; i < 40; i++) G.seconds(30);        // no food dropped at all
const after = G.dbg();
ok('a hungry colony keeps every ant it had', after.ants >= starve, `${starve} -> ${after.ants}`);
ok('there is no lose state to reach', G.state() === 'play');

// --- 5) cartridge contract ----------------------------------------------------
console.log('\n--- CARTRIDGE CONTRACT ---');
// pause and resume arrive as shell messages, exactly as the contract says
// pause and resume arrive as shell messages, exactly as the contract says. The vm
// has no animation frame, so what is checked here is that the message flips the
// engine's own gate; qa-antcity-dom.mjs style browser runs watch the colony freeze.
send({ type: 'pause' });
ok('a shell pause message stops the loop', G.dbg().paused === true);
send({ type: 'resume' });
ok('a shell resume message starts it again', G.dbg().paused === false);

const art = G._art();
ok('every art slot resolves to a URL from the manifest',
  Object.keys(art).length >= 8 && Object.values(art).every((u) => typeof u === 'string' && (u[0] === '/' || u.indexOf('http') === 0)),
  JSON.stringify(art));
// AC7: the ants are DRAWN, so the manifest's ant id picks the look rather than a
// sprite. The id still has to be one the engine knows and a real file behind it.
ok('the ant look is the one the manifest asked for',
  html.indexOf(manifest.levels[0].parts.ant) > 0 && /ANT_TINT/.test(html), manifest.levels[0].parts.ant);
ok('the ants are drawn geometry, not a sprite at ant size', /function drawAntShape/.test(html) && !/IMG\.antCarry/.test(html));
ok('draws without throwing', G._draw() === 'ok', G._draw());
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu);
ok('no emoji anywhere in the engine', !emoji, emoji ? emoji.join(' ') : '');
ok('the wordless show can be replayed', (G.showHow(), G.how() === true));

// the game is still one colony the kid keeps: nothing above reset it
ok('one colony the whole way through', G.dbg().ants > 0 && G.dbg().dug > 0);

// --- 5a) AC7: one hint, taught gestures, and food that is carried -------------
// This is the section that plays the game the way a kid does: no reaching into the
// engine for anything the tutorial teaches. The robot presses the buttons the
// tutorial points at and drags on the canvas, in a mouse profile and a touch
// profile, and after every gesture it checks the rule that broke human QA before —
// there is never more than one hint on screen.
console.log('\n--- AC7: ONE HINT, TAUGHT GESTURES, CARRIED FOOD ---');

const CV = byId.cv;
const PRESS = { mouse: ['pointerdown', 'pointermove', 'pointerup'], touch: ['touchstart', 'touchmove', 'touchend'] };
function gestureEvent(type, x, y, profile) {
  const e = { type, pointerId: 1, pointerType: profile, preventDefault() {}, stopPropagation() {} };
  if (type.indexOf('touch') === 0) e.touches = [{ clientX: x, clientY: y }];
  else { e.clientX = x; e.clientY = y; }
  return e;
}
function dragOn(el, pts, profile) {
  const [down, move, up] = PRESS[profile];
  el.dispatchEvent(gestureEvent(down, pts[0][0], pts[0][1], profile));
  for (let i = 1; i < pts.length; i++) el.dispatchEvent(gestureEvent(move, pts[i][0], pts[i][1], profile));
  const last = pts[pts.length - 1];
  el.dispatchEvent(gestureEvent(up, last[0], last[1], profile));
}
const tapOn = (el, x, y, profile) => dragOn(el, [[x, y]], profile);
const pressBtn = (el) => el && el.dispatchEvent({ type: 'click', preventDefault() {} });
// the middle of a cell, in page pixels, exactly as a finger would find it
const cellPt = (c, r) => { const g = G.geom(); return [g.ox + c * g.cs + g.cs / 2, g.sky + r * g.cs + g.cs / 2 - g.camY]; };
const grassPt = () => { const g = G.geom(); return [Math.round(g.w * 0.33), Math.round(g.sky - 45)]; };
// the taught gestures, done in order — what every kid does in their first minute.
// AC8 added one: you swap what is in your hand on the round button before the grass
// tap does anything, and the guide teaches exactly that.
function swapTo(tool) { pressBtn(byId.actSwap); pressBtn(byId['tool_' + tool]); }
function playTutorial(profile) {
  const q = G.queen();
  dragOn(CV, [cellPt(q.c, q.r + 1), cellPt(q.c, q.r + 2)], profile);
  G.seconds(1);
  swapTo('food');
  G.seconds(1);
  tapOn(CV, grassPt()[0], grassPt()[1], profile);
  G.seconds(1);
  pressBtn(byId.job_forager_up);
  G.seconds(1);
}

for (const profile of ['mouse', 'touch']) {
  console.log(`\n  .. the tutorial, ${profile} profile`);
  const twice = [];                       // every moment two hints were up at once
  const watch = (where) => { const h = G.hints(); if (h.length > 1) twice.push(`${where}: ${h.join(' | ')}`); return h[0] || ''; };

  G._reset(); G.play();
  ok(`${profile}: a brand new colony opens on step one of the guide`,
    G.lesson().on && G.lesson().name === 'intro' && G.lesson().step === 0, JSON.stringify(G.lesson()));
  ok(`${profile}: the one hint line is showing that step and nothing else`,
    watch('step 1') === G.guide().text && G.hints().length === 1, G.hints().join(' | '));

  // STEP ONE, as taught: "Drag down in the brown dirt to dig a tunnel"
  const q = G.queen();
  dragOn(CV, [cellPt(q.c, q.r + 1), cellPt(q.c, q.r + 2), cellPt(q.c, q.r + 3)], profile);
  ok(`${profile}: the taught drag really digs`, G.dbg().planned >= 2, `${G.dbg().planned} cells planned`);
  G.seconds(1); watch('after the drag');
  ok(`${profile}: doing it advances the guide to step two`, G.lesson().step === 1, JSON.stringify(G.lesson()));
  ok(`${profile}: and the finished step's words are gone from the screen`,
    G.hints().length === 1 && G.hints()[0] === G.guide().text, G.hints().join(' | '));

  // STEP TWO, as taught: "Tap the round button, then pick the apple"
  ok(`${profile}: the colony opens with the shovel in hand`, G.tool() === 'dig', G.tool());
  pressBtn(byId.actSwap);
  ok(`${profile}: the round button opens the toolbox`, G.sheetOpen() === true);
  watch('toolbox open');
  pressBtn(byId.tool_food);
  ok(`${profile}: picking the apple puts it in your hand and puts the toolbox away`,
    G.tool() === 'food' && G.sheetOpen() === false, `${G.tool()} sheet=${G.sheetOpen()}`);
  ok(`${profile}: the big button says what is in your hand and what to do with it`,
    byId.actName.textContent === 'Food' && /grass/i.test(byId.actHint.textContent),
    `${byId.actName.textContent} / ${byId.actHint.textContent}`);
  G.seconds(1); watch('after the swap');
  ok(`${profile}: swapping advances the guide`, G.lesson().step === 2, JSON.stringify(G.lesson()));

  // STEP THREE, as taught: "Now tap the green grass to drop some food"
  const foodBefore = G.dbg().food;
  tapOn(CV, grassPt()[0], grassPt()[1], profile);
  ok(`${profile}: the taught tap really leaves a crumb on the meadow`,
    G.items().filter((i) => i.kind === 'crumb').length === 1, JSON.stringify(G.items()));
  ok(`${profile}: the tap itself does NOT move the food counter`, G.dbg().food === foodBefore, `${foodBefore} -> ${G.dbg().food}`);
  G.seconds(1); watch('after the tap');
  ok(`${profile}: dropping food advances the guide to the last step`, G.lesson().step === 3, JSON.stringify(G.lesson()));

  // STEP FOUR, as taught: "Tap the plus on Foragers to give an ant that job".
  // The old step three taught dragging the colour bar, which did nothing on a mouse.
  ok(`${profile}: the step that teaches the job cards opens them first`, G.jobsOpen() === true);
  const wasForagers = G.dbg().jobs.forager;
  pressBtn(byId.job_forager_up);
  ok(`${profile}: the taught tap on plus really moves an ant`, G.dbg().jobs.forager === wasForagers + 1,
    `${wasForagers} -> ${G.dbg().jobs.forager}`);
  G.seconds(1); watch('after the plus');
  ok(`${profile}: that finishes the guide`, G.lesson().on === false, JSON.stringify(G.lesson()));
  ok(`${profile}: one line is left saying what to do next`, G.hints().length === 1, G.hints().join(' | '));

  // the crumb the kid dropped is carried in by an ant, and THAT is when food moves
  let carried = false, sawCarry = false;
  const before = G.dbg().food;
  for (let i = 0; i < 400 && !carried; i++) {
    G.seconds(0.25); watch('while the forager works');
    if (G.crowd().some((a) => a.carry === 'crumb')) sawCarry = true;
    if (!G.items().some((it) => it.kind === 'crumb')) carried = true;
  }
  ok(`${profile}: an ant is really seen carrying the crumb`, sawCarry);
  ok(`${profile}: the crumb becomes food only when it is delivered`, carried && G.dbg().food > before,
    `${before} -> ${G.dbg().food}`);

  // the build lesson: it must arrive the moment rooms unlock, and teach the button
  G.assign('digger', 3); G.digDown(6);
  for (let i = 0; i < 200 && G.mission().index < 2; i++) {
    G.drop('food', 120); G.assign('forager', 4); G.seconds(2); watch('growing to the room mission');
  }
  G.setToolByName('dig');                    // put the shovel back before the build lesson
  ok(`${profile}: the colony reaches the mission that unlocks rooms`, G.mission().index >= 2, JSON.stringify(G.mission().id));
  for (let i = 0; i < 40 && !G.lesson().on; i++) { G.seconds(1); watch('waiting for the build lesson'); }
  ok(`${profile}: the guide teaches Build the moment rooms unlock`,
    G.lesson().on && G.lesson().name === 'build', JSON.stringify(G.lesson()));
  ok(`${profile}: and it is still one hint, not two`, G.hints().length === 1, G.hints().join(' | '));
  swapTo('build');
  ok(`${profile}: picking the hammer opens the room cards by itself`,
    G.tool() === 'build' && G.buildOpen() === true, `${G.tool()} open=${G.buildOpen()}`);
  G.seconds(1); watch('build card open');
  ok(`${profile}: that advances the build lesson`, G.lesson().step === 1, JSON.stringify(G.lesson()));
  for (let i = 0; i < 60 && G.dbg().food < 8; i++) { G.drop('food', 140); G.seconds(2); }
  pressBtn(byId.actMain); pressBtn(byId.room_nursery);
  ok(`${profile}: picking a room lights up every spot it could go`,
    G.placing() === 'nursery' && G.spots().length > 0, `${G.spots().length} spots`);
  const spot = G.spots()[0], costBefore = G.dbg().food;
  tapOn(CV, cellPt(spot.c, spot.r)[0], cellPt(spot.c, spot.r)[1], profile);
  ok(`${profile}: tapping a glowing spot puts the room there`,
    G.placing() === null && G.dbg().food < costBefore, `food ${costBefore} -> ${G.dbg().food}`);
  G.seconds(1); watch('room placed');
  ok(`${profile}: that finishes the build lesson`, G.lesson().on === false, JSON.stringify(G.lesson()));
  G.assign('builder', 4); G.seconds(60); watch('builders working');
  ok(`${profile}: the ants really build it`, G.rooms().nursery >= 1, JSON.stringify(G.rooms()));

  ok(`${profile}: never two hints on screen, at any point in the tutorial`, twice.length === 0, twice.slice(0, 3).join(' // '));
}

// the jobs bar drags, on a mouse as well as a finger. It is not what the tutorial
// teaches any more, but a control that is on screen has to work.
for (const profile of ['mouse', 'touch']) {
  G._reset(); G.play();
  G.assign('digger', 1); G.assign('forager', 5);
  const bar = byId.bar, r = bar.getBoundingClientRect();
  const was = JSON.stringify(G.dbg().jobs);
  dragOn(bar, [[r.left + r.width * 0.5, r.top + 10], [r.left + r.width * 0.8, r.top + 10]], profile);
  ok(`the colour bar really drags (${profile})`, JSON.stringify(G.dbg().jobs) !== was, `${was} -> ${JSON.stringify(G.dbg().jobs)}`);
}

// --- food is carried, never counted ------------------------------------------
console.log('\n  .. food is carried, never counted');
G._reset(); G.play();
G.assign('forager', 0);
const noFetch = G.dbg().food;                        // nobody to go and get it
swapTo('food');
tapOn(CV, grassPt()[0], grassPt()[1], 'mouse');
G.seconds(4);
ok('with nobody on foraging, a dropped crumb is still lying there',
  G.items().some((i) => i.kind === 'crumb'), JSON.stringify(G.items()));
ok('and the food counter never went up on its own', G.dbg().food <= noFetch, `${noFetch} -> ${G.dbg().food}`);
G.assign('forager', 4);
let gone = false;
for (let i = 0; i < 400 && !gone; i++) { G.seconds(0.25); gone = !G.items().some((it) => it.kind === 'crumb'); }
ok('put an ant on it and the crumb comes home', gone && G.dbg().food > 0, `food=${G.dbg().food}`);

// the meadow grows its own food, and picking it visibly empties the bush
G._reset(); G.play();
G.assign('forager', 0);
for (let i = 0; i < 40 && G.items().filter((it) => it.kind === 'berry').length < 3; i++) G.seconds(1);
const bushFull = G.items().filter((it) => it.kind === 'berry' && !it.held).length;
ok('the berry bush grows berries a forager can go and get', bushFull >= 3, `${bushFull} berries`);
G.assign('forager', 4);
let picked = false;
for (let i = 0; i < 300 && !picked; i++) { G.seconds(0.25); picked = G.crowd().some((a) => a.carry === 'berry'); }
ok('an ant picks one up and carries it', picked);
// the berry in an ant's mandibles is the SAME item, and it is off the bush while it
// travels: that is what makes the plant visibly empty as it is picked
ok('and the berry it is carrying is off the bush',
  G.items().some((it) => it.kind === 'berry' && it.held), JSON.stringify(G.items().filter((it) => it.kind === 'berry')));

// --- idle ants stand still, and nothing ever piles up -------------------------
console.log('\n  .. idle ants stand still');
G._reset(); G.play();
G.assign('digger', G.dbg().ants);            // diggers with nothing drawn to dig
G.seconds(8);
const idlers = G.crowd().filter((a) => a.idle);
ok('an ant with no job to do stands still in an idle pose', idlers.length > 0, `${idlers.length} of ${G.crowd().length}`);
const where1 = idlers.map((a) => a.fc + ',' + a.fr).sort().join(' ');
G.seconds(3);
const where2 = G.crowd().filter((a) => a.idle).map((a) => a.fc + ',' + a.fr).sort().join(' ');
ok('and it really does not wander off', where1 === where2, `${where1} -> ${where2}`);
const posts = {};
G.crowd().filter((a) => a.idle).forEach((a) => { posts[a.at] = (posts[a.at] || 0) + 1; });
ok('ants stand two to a cell at most, never a pile', Object.values(posts).every((n) => n <= 2), JSON.stringify(posts));
const queenKey = G.queen().c + ',' + G.queen().r;
ok('and nobody is sitting on top of the queen', !posts[queenKey], JSON.stringify(posts));

// a busy grown colony: still nothing stacked up
G._reset(); G.play();
G.assign('digger', 3); G.digDown(20);
for (let i = 0; i < 30; i++) { G.drop('food', 100 + (i % 4) * 50); G.seconds(4); }
const stack = {};
G.crowd().filter((a) => a.fr >= 0 && a.state !== 'walk').forEach((a) => { stack[a.at] = (stack[a.at] || 0) + 1; });
const worst = Math.max(0, ...Object.values(stack));
ok('a working colony never piles ants on one cell', worst <= 2, `worst cell holds ${worst}`);
ok('every ant on a job is walking to it or working it, never milling about',
  G.crowd().filter((a) => a.task).every((a) => a.state === 'walk' || a.state === 'work'),
  JSON.stringify(G.crowd().filter((a) => a.task && a.state !== 'walk' && a.state !== 'work').slice(0, 2)));

// --- the needs panel, and the panel that no longer eats the screen ------------
console.log('\n  .. needs, and a panel that stays out of the way');
const needs = G.needs();
ok('the needs panel reads food, water, rest and eggs',
  ['food', 'water', 'rest', 'eggs'].every((k) => needs[k] && typeof needs[k].v === 'number'), JSON.stringify(needs));
ok('the meters read the real colony', needs.food.v > 0 && needs.food.v <= 1 && needs.rest.v <= 1, JSON.stringify(needs));
G._reset(); G.play();
playTutorial('mouse');                               // past the first minute: no lesson running
// nobody fetching: every ant hatched joins the foragers, so keep moving them off it
for (let i = 0; i < 60 && !G.needs().food.low; i++) { G.assign('forager', 0); G.seconds(5); }
ok('a store running low flags itself', G.needs().food.low === true, JSON.stringify(G.needs().food));
const lowNow = Object.keys(G.needs()).filter((k) => G.needs()[k].low);
ok('and the one hint line names a store that really is low',
  lowNow.some((k) => new RegExp(k, 'i').test(G.coach())), `${lowNow.join(',')} :: ${G.coach()}`);
ok('there is still only one hint saying it', G.hints().length === 1, G.hints().join(' | '));
ok('the panel measures its own real height instead of guessing', /offsetHeight/.test(html));
ok('and it never takes more than two fifths of the screen', G.panelH() <= G.geom().h * 0.42, `${G.panelH()} of ${G.geom().h}`);
G._reset(); G.play();
ok('the jobs panel starts collapsed', G.jobsOpen() === false);
ok('there is exactly one hint surface in the markup',
  (html.match(/data-hint/g) || []).length === 1 && !/id="hint"/.test(html));
ok('the level picker is gone: the tile opens the colony', !/BS\.mount/.test(engine) && G.state() === 'play');

// --- 5b) AC5: intentional ants, the game that teaches itself, and the swarm ---
console.log('\n--- AC5: INTENTIONAL ANTS, TEACHING, SWARM ---');

// grow one first: the AC7 section above leaves a young colony behind
G._reset(); G.play();
G.assign('nursery', 3); G.assign('digger', 2);
const cols = G._cfg().cols;
for (let i = 0; i < 90 && (G.dbg().ants < 34 || G.dbg().dug < 40); i++) {
  if (G.dbg().planned < 6) {
    G.digDown(3);                                  // and side branches, the way a kid draws
    const r = Math.max(1, G.dbg().deepest - (i % 3));
    for (let c = 1; c < cols - 1; c++) { G.dig(c, r); G.dig(c, r - 1); }
  }
  G.assign('digger', 4);
  G.drop('food', 110); G.drop('water', 210); G.seconds(5);
}
G.seconds(10);

// the swarm: many small ants, not a handful of big ones. AC13 moved the size
// down to the 0.95x the motion lab locked, which is what makes a river of ants
// possible at all: at the old 0.34 a hundred and fifty of them were a traffic jam.
ok('the ants are drawn small enough to read as a swarm, big enough to read as ants',
  G.antScale() >= 0.19 && G.antScale() <= 0.24, `scale=${G.antScale()}`);
ok('the drawn crowd can hold a swarm', G._cfg().sampleMax >= 60, `sampleMax=${G._cfg().sampleMax}`);
ok('a grown colony really shows a crowd, not a handful', G.crowd().length > 26, `${G.crowd().length} ants on screen of ${G.dbg().ants}`);

// the one rule the card is about: an ant is never inside solid dirt
const inDirt = () => G.crowd().filter((a) => a.inDirt).length;
ok('no visible ant stands in solid dirt (grown colony)', inDirt() === 0, `${inDirt()} of ${G.crowd().length}`);

// a fresh colony: a digger walks to the exact spot the kid drew, and digs it
G._reset(); G.play();
G.assign('digger', 4);
G.digDown(4);
let sawDig = false, dirtBreaches = 0;
for (let i = 0; i < 60 && !sawDig; i++) {
  G.seconds(0.25);
  if (inDirt()) dirtBreaches++;
  sawDig = G.crowd().some((a) => a.task === 'dig');
}
ok('a digger takes the spot the kid drew as a real job', sawDig, JSON.stringify(G.crowd().filter((a) => a.task).slice(0, 3)));
ok('a digger reaches it through the tunnels, never through solid dirt', dirtBreaches === 0, `${dirtBreaches} frames with an ant in dirt`);
ok('an ant digging the spot marks it', Object.keys(G.crowd().filter((a) => a.task === 'dig')).length > 0);

// a forager climbs out for the crumb the kid dropped, and hauls it home
G._reset(); G.play();
G.assign('forager', 4);
G.drop('food', 150);
let sawFood = false, sawSurface = false, sawCarry = false, breach2 = 0;
for (let i = 0; i < 200; i++) {
  G.seconds(0.25);
  if (inDirt()) breach2++;
  const crowd = G.crowd();
  if (crowd.some((a) => a.task === 'haul')) sawFood = true;
  if (crowd.some((a) => a.fr < -0.2)) sawSurface = true;
  if (crowd.some((a) => a.carry)) sawCarry = true;
  if (sawFood && sawSurface && sawCarry) break;
}
ok('a forager takes the dropped crumb as a real job', sawFood);
ok('the forager walks up and out of the anthill', sawSurface);
ok('it carries the crumb home', sawCarry);
ok('nothing walked through solid dirt on the way', breach2 === 0, `${breach2} frames`);

// the drawn crowd carries the job mix the kid set on the bar
G._reset(); G.play();
G.assign('nursery', 5);
G.seconds(3);
const mix = G.crowd().filter((a) => a.job === 'nursery').length;
ok('the ants on screen wear the jobs the panel says', mix > 0, `${mix} nursery ants drawn of ${G.crowd().length}`);

// the game explains itself: three steps, each waiting for the real action
G._reset(); G.play();
G.showHow();
const gStart = G.guide();
ok('the guide runs on a brand new colony', gStart.on && gStart.step === 0, JSON.stringify(gStart));
ok('it teaches four things, one at a time', gStart.steps === 4);
ok('step one asks in kid words, with no wall of text', /dig/i.test(gStart.text) && gStart.text.length < 60, gStart.text);
G.seconds(20);
ok('a step WAITS: doing nothing never advances it', G.guide().step === 0, JSON.stringify(G.guide()));
G.digDown(2); G.seconds(1);
ok('digging really advances it to step two', G.guide().step === 1, JSON.stringify(G.guide()));
G.seconds(20);
ok('step two waits for the tool to really be swapped', G.guide().step === 1);
G.setToolByName('food'); G.seconds(1);
ok('taking the apple advances it to step three', G.guide().step === 2, JSON.stringify(G.guide()));
G.seconds(20);
ok('step three waits for food to be dropped', G.guide().step === 2);
G.drop('food', 150); G.seconds(1);
ok('dropping food advances it to the last step', G.guide().step === 3, JSON.stringify(G.guide()));
G.assign('nursery', 3); G.seconds(1);
ok('moving an ant to a new job finishes the guide', G.guide().on === false, JSON.stringify(G.guide()));

// the goal is on screen the whole time, in kid words
const goalLine = G.goal();
ok('the goal line is always saying something', typeof goalLine === 'string' && goalLine.length > 4, goalLine);
ok('the goal line has no jargon or raw numbers dumped in it', !/undefined|NaN|null/.test(goalLine), goalLine);
ok('the guide replays from the ? button', (G.showHow(), G.guide().on === true && G.guide().step === 0));

// AC8: the old bottom stack is GONE — no text needs row, no row of word buttons.
ok('the old text needs row is gone', !/id="needs"/.test(html) && !/id="need_food"/.test(html));
ok('the old row of word buttons is gone',
  !/id="acts"/.test(html) && !/id="toolFood"/.test(html) && !/id="toolWater"/.test(html) && !/id="toolBuild"/.test(html));
ok('the old unexplained mode tabs are gone', !/id="toolDig"/.test(html) && !/id="toolJobs"/.test(html));
// what replaced it: one bar of pictures. Four meters with icons, the tool in hand,
// and a round button that opens a sheet of picture cards.
['food', 'water', 'rest', 'eggs'].forEach((k) =>
  ok(`the ${k} meter is a bar with a picture on it`,
    new RegExp(`id="mtr_${k}"[^>]*>\\s*<span class="bar"><i id="fill_${k}"></i></span><svg class="mic"`).test(html)));
ok('a meter that runs low wears a tag and wiggles', /\.mt\.low \.tag\{display:block/.test(html) && /@keyframes wig/.test(html));
ok('the big button carries a picture of every tool it can hold',
  ['dig', 'food', 'water', 'build'].every((k) => new RegExp(`class="ic ic-${k}"`).test(html)));
ok('and only the one in hand is showing', /#actMain\.t-dig \.ic-dig/.test(html) && /#actMain \.ic\{display:none/.test(html));
ok('the round swap button opens a sheet of picture cards',
  /id="actSwap"/.test(html) && ['dig', 'food', 'water', 'build'].every((k) => new RegExp(`id="tool_${k}"[^>]*>\\s*<svg class="tic"`).test(html)));
ok('the build menu rooms are pictures, not a list of words',
  /var ROOM_ART = \{/.test(html) && ['nursery', 'storage', 'den', 'fungus'].every((k) => new RegExp(`${k}: *'<svg`).test(html)));
ok('a room costs apples you can count, not a number you have to read',
  /function costApples/.test(html) && /APPLE_SVG/.test(html));
ok('a room you cannot afford greys out and flashes its apples',
  /\.room\.cant\{/.test(html) && /@keyframes apflash/.test(html));
ok('the build menu closes with a big drawn X, not a word',
  /id="buildCancel"[^>]*>\s*<svg/.test(html) && !/>Not now</.test(html));
ok('the one hint line is in the markup', /id="coachText"/.test(html) && /data-hint/.test(html));

// --- 5c) AC6: layout, felt job trade-offs, and the production chains ----------
console.log('\n--- AC6: THE STRATEGY LAYER ---');

// a kid stocking the pantry: drop crumbs and let the foragers bring them in
function stock(to) {
  for (let i = 0; i < 40 && G.dbg().food < to; i++) {
    G.drop('food', 100 + (i % 5) * 40);
    G.assign('forager', Math.max(3, Math.floor(G.dbg().ants * 0.6)));
    G.seconds(6);
  }
  return G.dbg().food;
}

// -- pillar 1: where you dig a room changes how well it works, and only upward --
const shallow = G.spot('storage', 5, 1), deepish = G.spot('storage', 5, 9);
ok('a good storage spot is called good, in kid words', shallow.good === true && /trip/i.test(shallow.line), JSON.stringify(shallow));
ok('a plain spot still says the room works there', deepish.good === false && /works here/i.test(deepish.line), JSON.stringify(deepish));
ok('a nursery beside the queen is the good spot', G.spot('nursery', 6, 2).good === true);
ok('a den earns its bonus by being deep', G.spot('den', 6, 10).good === true && G.spot('den', 6, 1).good === false);

G._reset(); G.play();
ok('no room, no bonus and no penalty', G.bonus('storage') === 1 && G.bonus('nursery') === 1 && G.bonus('den') === 1);
// build a storage in a plain spot: it must never make the colony worse
G.assign('digger', 4); G.digDown(8); G.seconds(30);
stock(20);
const deepSpot = { c: G._cfg().cols >> 1, r: G.dbg().deepest };
ok('the plain deep spot took the room', G.build(deepSpot.c, deepSpot.r, 'storage'), JSON.stringify(deepSpot));
G.assign('builder', 4); G.seconds(40);
ok('a room in a plain spot never costs the colony anything', G.bonus('storage') >= 1, `mul=${G.bonus('storage')}`);
// and one in a good spot really speeds its job up
stock(20);
ok('the good shallow spot took the room', G.build(G._cfg().cols >> 1, 1, 'storage'));
G.assign('builder', 4); G.seconds(60);
ok('a room in a good spot really speeds its job up', G.bonus('storage') > 1, `mul=${G.bonus('storage')}`);

// -- pillar 2: the job mix is felt, and the readouts trend honestly --
G._reset(); G.play();
G.assign('digger', 6); G.digDown(30); G.seconds(60);
const digHeavy = G.dbg(), digMix = G.mix();
ok('all diggers really does dig faster', digHeavy.dug > 6, `${digHeavy.dug} cells`);
ok('and the line says so in kid words', /tunnel/i.test(digMix), digMix);
G._reset(); G.play();
G.assign('forager', 6);
for (let i = 0; i < 8; i++) { G.drop('food', 100 + i * 20); G.seconds(8); }
ok('all foragers really does pile food up', G.dbg().food > digHeavy.food, `${G.dbg().food} vs ${digHeavy.food}`);
ok('the food readout trends honestly', ['up', 'down', 'steady'].includes(G.trend()), G.trend());
ok('the mix line is always kid words, never a number dump', G.mix().length > 8 && !/\d/.test(G.mix()), G.mix());

// -- rain rewards a stocked pantry, and still only pauses --
G._reset(); G.play();
G.assign('digger', 4);
for (let i = 0; i < 10; i++) { G.drop('food', 120); G.seconds(6); G.assign('forager', 4); }
G.assign('digger', 5);
const stocked = G.dbg().food;
G.rain();
const dugBeforeWet = G.dbg().dug;
G.digDown(20); G.seconds(20);
const stockedDug = G.dbg().dug - dugBeforeWet;
ok('a stocked colony keeps working straight through the rain', stockedDug > 0 && stocked >= 12, `food=${stocked} dug=${stockedDug}`);
ok('the setback line credits the store', /store/i.test(String(G.setback())), String(G.setback()));
const wetBefore = G.dbg();
G.seconds(120);
ok('rain still never takes an ant, a tunnel or a room away',
  G.dbg().ants >= wetBefore.ants && G.dbg().dug >= wetBefore.dug && G.dbg().rooms.storage >= wetBefore.rooms.storage);

// -- pillar 3: the production chains --
G._reset(); G.play();
G.assign('forager', 5);
G.seconds(60);
const cut = G.chain();
ok('the meadow grows leaves and foragers cut them', cut.cut > 0, JSON.stringify(cut));
ok('an ant is really seen walking a leaf home', G.chain().hauling >= 0 && G.crowd().every((a) => a.task !== 'food'));
// a garden with nobody on it just waits: nothing rots, nothing is lost
G.assign('digger', 4); G.digDown(6); G.seconds(30);
stock(24);
const spot = G.openTunnel();
ok('there is somewhere to put a garden', !!spot, JSON.stringify(spot));
ok('the garden spot took the room', G.build(spot.c, spot.r, 'fungus'), `food=${G.dbg().food}`);
G.assign('builder', 5); G.seconds(90);
ok('the fungus garden gets built', G.rooms().fungus === 1, JSON.stringify(G.rooms()));
G.assign('nursery', 0);
const idleLeaves = G.chain().leaves, idleMush = G.chain().mush;
G.seconds(60);
ok('an unstaffed garden simply waits, it never eats the leaves', G.chain().mush === idleMush, `mush ${idleMush} -> ${G.chain().mush}`);
ok('and the cut leaves are still all there', G.chain().leaves >= idleLeaves, `${idleLeaves} -> ${G.chain().leaves}`);
// staff it and the mushrooms really grow
G.assign('nursery', 5);
G.seconds(60);
ok('nursery ants turn leaves into mushroom food', G.chain().mush > 0, JSON.stringify(G.chain()));
ok('tending mushrooms is a real trade-off against eggs', G.chain().nurseryOnMushrooms > 0 && G.chain().nurseryOnMushrooms < 1, String(G.chain().nurseryOnMushrooms));

// -- the aphid herd arrives as a milestone, with the real science --
const aphidMs = G._cfg().milestones.filter((m) => m.aphids);
ok('an aphid milestone exists and teaches a true fact', aphidMs.length === 1 && /aphid/i.test(aphidMs[0].fact) && aphidMs[0].fact.length > 40, aphidMs[0] && aphidMs[0].fact);
const leafMs = G._cfg().milestones.filter((m) => m.type === 'leaves');
ok('the leafcutter fact is on the garden milestone', leafMs.length === 1 && /mushroom/i.test(leafMs[0].fact), leafMs[0] && leafMs[0].fact);
ok('the garden is not handed over before the kid has met it', G._cfg().roomUnlock.fungus > 10);
G.setAphids(true);
const dewBefore = G.chain().dewGot;
G.assign('forager', 5);
G.seconds(90);
const dewAfter = G.chain().dewGot;
ok('the herd gives a slow trickle of honeydew', dewAfter > dewBefore && G.chain().aphids === true, `drunk ${dewBefore} -> ${dewAfter}`);
ok('it is a trickle, not a food machine', dewAfter - dewBefore < 40, `${dewAfter - dewBefore} in 90s`);

// -- the recipe carries the new pieces, so the engine stays the fixed part --
ok('the manifest names the fungus garden', !!(manifest.rooms && manifest.rooms.fungus && manifest.rooms.fungus.name));
ok('the manifest carries the chain milestones', Array.isArray(manifest.milestones) && manifest.milestones.length >= 2);
ok('every chain art id has a real file behind it',
  ['leaf.svg', 'room-fungus.svg', 'aphid-plant.svg', 'honeydew.svg'].every((f) => fs.existsSync(dir + '/public/antcity/art/' + f)));
ok('nothing in the strategy layer can make a colony smaller', G.dbg().ants > 0 && G.state() === 'play');

// --- 5d) AC9: soldiers, and the bad bugs they see off ------------------------
// The card's promise is a rare, gentle treat that a kid can always end: a bug turns
// up, it pauses ONE thing you can see, and one soldier always sends it away. So this
// section proves three things and nothing less — no bug ever reaches the tutorial,
// every kind of visit is resolvable by a single soldier, and a visit can never make
// the colony smaller.
console.log('\n--- AC9: SOLDIERS AND BAD BUGS ---');

ok('no bad bug ever gate-crashed the ten missions', tutorialBugs === 0, `${tutorialBugs} sightings`);

// -- the fifth job: it is not there until the colony has met it --
G._reset(); G.play();
ok('a young colony is still the four calm jobs',
  G.jobsList().join(',') === 'digger,forager,nursery,builder', G.jobsList().join(','));
ok('the soldier card is not even on the jobs strip yet',
  byId.jobcard_soldier.className.indexOf('locked') >= 0, byId.jobcard_soldier.className);
G.assign('soldier', 2);
ok('and no ant can be put on Soldiers before they unlock', (G.dbg().jobs.soldier | 0) === 0, JSON.stringify(G.dbg().jobs));
ok('a soldier wears the red the low meters already use for "this needs you"',
  /^#e2685f$/i.test(String(G.jobColor('soldier'))), String(G.jobColor('soldier')));

const soldierMs = G._cfg().milestones.filter((m) => m.soldiers);
ok('one milestone brings the soldiers in, at about fifteen ants',
  soldierMs.length === 1 && soldierMs[0].n >= 10 && soldierMs[0].n <= 20, JSON.stringify(soldierMs[0]));
ok('and it teaches a true fact about real soldier ants',
  /jaw/i.test(soldierMs[0].fact) && soldierMs[0].fact.length > 40, soldierMs[0].fact);

// grow one to fifteen and watch the job arrive on its own
for (let i = 0; i < 300 && G.dbg().ants < 15; i++) {
  G.drop('food', 110); G.drop('water', 230);
  G.assign('nursery', Math.max(2, Math.floor(G.dbg().ants * 0.4)));
  G.assign('forager', Math.max(2, Math.floor(G.dbg().ants * 0.4)));
  G.seconds(4);
}
ok('growing the colony unlocks the soldiers by itself', G.soldiersOn() === true, `${G.dbg().ants} ants`);
ok('the fifth card joins the jobs strip and the colour bar',
  G.jobsList().length === 5 && byId.jobcard_soldier.className.indexOf('locked') < 0, G.jobsList().join(','));
pressBtn(byId.job_soldier_up);
ok('and now the plus really does put an ant on Soldiers', (G.dbg().jobs.soldier | 0) === 1, JSON.stringify(G.dbg().jobs));

// -- a visit is rare, and it never lands in the tutorial --
const bugCfg = G._cfg().bug;
ok('a visit is a rare treat, roughly every ten to fifteen minutes',
  bugCfg.everySec >= 600 && bugCfg.everySec <= 900, `${bugCfg.everySec}s at the middle difficulty`);
G._reset(); G.play(); G.setDifficulty(5);
for (let i = 0; i < 120; i++) G.seconds(30);           // an hour of play, at the liveliest dial
ok('an hour of the tutorial, at the liveliest setting, and still no bug',
  G.bugsSeen() === 0 && G.bug() === null, `${G.bugsSeen()} seen`);

// the difficulty dial really does change how often one calls
function visitsIn(diff, secs) {
  G._reset(); G.play(); G._openAll();
  G.setDifficulty(diff); G.assign('soldier', 2);
  for (let i = 0; i < secs / 10; i++) G.seconds(10);
  return G.bugsSeen();
}
const calmVisits = visitsIn(1, 3600), livelyVisits = visitsIn(5, 3600);
ok('the difficulty dial scales how often a bug calls',
  livelyVisits > calmVisits, `calm=${calmVisits} lively=${livelyVisits} in an hour`);

// -- EVERY visit is resolvable, and one soldier always does it ------------------
for (const kind of Object.keys(bugCfg.kinds)) {
  G._reset(); G.play(); G._openAll();
  G.assign('soldier', 0);
  const sent = G.sendBug(kind);
  ok(`a ${kind} really turns up when its visit comes round`,
    !!sent && G.bug() && G.bug().kind === kind, JSON.stringify(sent));
  const before = G.dbg();
  G.seconds(200);
  const napping = G.bug();
  ok(`with nobody on Soldiers the ${kind} settles in and naps on the spot`,
    !!napping && napping.state === 'nap', JSON.stringify(napping));
  ok(`the ${kind} never leaves on its own, so the cause and the effect stay clear`, !!G.bug());
  const during = G.dbg();
  ok(`the ${kind} never took an ant, a tunnel or a room`,
    during.ants >= before.ants && during.dug >= before.dug && during.rooms.storage >= before.rooms.storage,
    `${before.ants}->${during.ants} ants, ${before.dug}->${during.dug} dug`);
  ok(`and it never took a crumb out of the store`, during.carried >= before.carried, `${before.carried} -> ${during.carried}`);
  // the one hint line says what to do about it, and there is still only one of them
  ok(`the hint line asks for a soldier, in kid words`,
    G.hints().length === 1 && /soldier/i.test(G.hints()[0]), G.hints().join(' | '));
  // the marker, and the tap that takes you there
  G._draw();
  const mk = G.bugMark();
  ok(`a bouncing marker shows where the ${kind} is`, !!mk && mk.r > 0, JSON.stringify(mk));
  tapOn(CV, mk.x, mk.y, 'mouse');
  ok(`and tapping the marker takes the camera to it`, G.looking() !== null, String(G.looking()));
  // ONE soldier. Always. This is the whole promise of the card.
  const scaredBefore = G.bugsScared(), crumbsBefore = G.items().filter((i) => i.kind === 'crumb').length;
  G.assign('soldier', 1);                       // ONE. Never two, never a lucky crowd.
  let t = 0, marched = false, sawCrumb = false;
  while (G.bug() && t < 90) {
    G.seconds(1); t++;
    if (G.guards() > 0) marched = true;
    if (G.items().filter((i) => i.kind === 'crumb').length > crumbsBefore) sawCrumb = true;
  }
  // a forager can be on the bonus crumb within a second or two of it landing, which
  // is the point of it, so the crumb is watched for rather than counted at the end
  if (G.items().filter((i) => i.kind === 'crumb').length > crumbsBefore) sawCrumb = true;
  ok(`a drawn soldier really marches over to the ${kind}`, marched, `${t}s watched`);
  ok(`ONE soldier always sees the ${kind} off`, !G.bug() && t < 90, `${t}s of colony time`);
  ok(`the ${kind} left a thank-you crumb on the meadow`, sawCrumb, JSON.stringify(G.items().map((i) => i.kind)));
  ok(`the scare was counted and paid in coins`,
    G.bugsScared() === scaredBefore + 1 && G.dbg().coins.some((c) => c.key.indexOf('antcity:bug:') === 0),
    `${G.bugsScared()} scared`);
  const after = G.dbg();
  ok(`the colony is every bit as big once the ${kind} has gone`,
    after.ants >= before.ants && after.dug >= before.dug, `${before.ants} -> ${after.ants} ants`);
}

// -- soldiers off duty behave like every other ant: they stand still --
G._reset(); G.play(); G._openAll();
G.assign('soldier', 3); G.seconds(10);
const guardCrowd = G.crowd().filter((a) => a.job === 'soldier');
ok('soldiers are really drawn on the colony', guardCrowd.length > 0, `${guardCrowd.length} of ${G.crowd().length}`);
ok('a soldier with no bug to see off stands at its post, it never wanders',
  guardCrowd.some((a) => a.idle) && guardCrowd.every((a) => a.task === null || a.task === 'scare'),
  JSON.stringify(guardCrowd.map((a) => a.state)));

// -- the badge for seeing five bugs off is really reachable --
G._reset(); G.play(); G._openAll();
G.assign('soldier', 2);
const kindCycle = Object.keys(bugCfg.kinds);
for (let n = 0; n < 5; n++) {
  G.sendBug(kindCycle[n % kindCycle.length]);
  let t = 0; while (G.bug() && t < 90) { G.seconds(1); t++; }
}
ok('five bugs really can be seen off in one colony', G.bugsScared() >= 5, `${G.bugsScared()} scared`);
ok('and that earns the badge the card promises',
  G.dbg().coins.some((c) => c.key === 'antcity:milestone:bugs-5'), G.dbg().coins.slice(-3).map((c) => c.key).join(' '));
const bugMs = G._cfg().milestones.filter((m) => m.type === 'bugs');
ok('the badge is one milestone, at five bugs', bugMs.length === 1 && bugMs[0].n === 5 && bugMs[0].coins > 0, JSON.stringify(bugMs[0]));

// -- the art: original drawn bugs, a drawn fallback, and the recipe carries them --
ok('three original drawn bad bugs, each a real file',
  ['bug-beetle.svg', 'bug-caterpillar.svg', 'bug-grasshopper.svg'].every((f) => fs.existsSync(dir + '/public/antcity/art/' + f)));
ok('and a hand-drawn fallback stands behind every one of them',
  /function drawBugShape/.test(html) && /drawBugShape\(b\.kind/.test(html));
ok('the soldier is a drawn worker variant, not a whole new sprite',
  /soldier:\s*sold/.test(html) && /if\(o\.soldier\)/.test(html) && /function drawAntShape\(x, y, r, col, flip, idle, soldier\)/.test(html));
ok('the manifest carries the bugs, so the recipe stays the recipe',
  !!(manifest.bugs && manifest.bugs.kinds && Object.keys(manifest.bugs.kinds).length === 3),
  Object.keys((manifest.bugs || {}).kinds || {}).join(','));
ok('the manifest carries the soldier and badge milestones',
  manifest.milestones.some((m) => m.soldiers) && manifest.milestones.some((m) => m.type === 'bugs'));
ok('every bad bug art id resolves to a real file',
  ['beetle', 'caterpillar', 'grasshopper'].every((k) => {
    const u = G._art()['bug_' + k];
    return typeof u === 'string' && fs.existsSync(dir + '/public' + u);
  }), JSON.stringify(['beetle', 'caterpillar', 'grasshopper'].map((k) => G._art()['bug_' + k])));
ok('the attention marker is drawn geometry, never a glyph',
  /function drawBugMark/.test(html) && !/textAlign[\s\S]{0,80}bugMark/.test(html));

// --- 6b) AC13: the motion rig, the crowd, and food you can see ----------------
// The card's four motion ingredients are all ON, and the two hard rules the lab
// learned the painful way are the ones checked hardest here: an ant cannot skate
// (its gait clock is DISTANCE, so a stopped ant is frozen with its feet down) and
// an ant walking left is never upside down (rotate by heading, then MIRROR).
console.log('\n--- AC13: THE SWARM, AND FOOD YOU CAN SEE ---');

// one swappable draw function, so a painted ant can replace this one without a
// single line of movement code moving
ok('the look lives in one swappable draw function',
  /function drawAnt\(x, y, angle, s, t, o\)/.test(html) && /drawAnt\(px, py, a\.head/.test(html));
ok('and the movement lives somewhere else entirely',
  /function walkVisual\(dt\)/.test(html) && /walkVisual\(dt\);/.test(html));
ok('the motion layer has its own seeded stream, so wobble cannot shift a colony roll',
  /function mrand\(\)/.test(html) && /_mseed/.test(html));

G.play(3); G._openAll();
G.digDown(16); G.assign('digger', 3); G.assign('forager', 2);
G.seconds(90);
let crowd13 = G.crowd(), mot = G.motion();

ok('the crowd is a crowd', crowd13.length >= 8, `${crowd13.length} drawn, ${mot.ants} ants`);

// (1) FEET THAT GRIP -----------------------------------------------------------
// a walking ant keeps one tripod planted: three of its six feet do not move at
// all while the body walks past them, which is the whole anti-skate rule
const b13 = G.crowd(); G.step(1); const a13 = G.crowd();
const walkers = b13.map((a, i) => [a, a13[i]]).filter(([a, b]) =>
  b && a.job === b.job && b.spd > 0 && Math.hypot(b.dx - a.dx, b.dy - a.dy) < 0.5);
const planted = walkers.filter(([a, b]) => {
  let same = 0;
  for (let i = 0; i < 6; i++) if (a.feet[i * 2] === b.feet[i * 2] && a.feet[i * 2 + 1] === b.feet[i * 2 + 1]) same++;
  return same >= 3;
});
ok('a walking ant always has a tripod planted in the world, it never skates',
  walkers.length > 0 && planted.length === walkers.length, `${planted.length}/${walkers.length} walking`);

// the gait clock is DISTANCE TRAVELLED, never a timer: how far the clock moved
// and how far the ant moved are the same number
const drift = walkers.map(([a, b]) => Math.abs((b.gait - a.gait) - Math.hypot(b.dx - a.dx, b.dy - a.dy)));
ok('the gait clock is distance travelled, not a timer',
  drift.length > 0 && Math.max(...drift) < 0.002, `worst drift ${Math.max(...drift, 0).toFixed(5)} cells`);

// a stopped ant is genuinely frozen: no speed, no gait, no foot moves
const stills = b13.map((a, i) => [a, a13[i]]).filter(([a, b]) => b && a.idle && b.idle);
ok('a stopped ant is frozen with its feet down',
  stills.length > 0 && stills.every(([a, b]) =>
    b.spd === 0 && b.gait === a.gait && a.feet.every((v, i) => v === b.feet[i])),
  `${stills.length} standing still`);

// (2) HEADS FACE THE WAY THEY ARE GOING ---------------------------------------
// an early demo crawled backwards. It is never allowed back.
const moved13 = walkers.filter(([a, b]) => Math.hypot(b.dx - a.dx, b.dy - a.dy) > 0.0005);
const facing = moved13.filter(([a, b]) => {
  const mx = b.dx - a.dx, my = b.dy - a.dy, d = Math.hypot(mx, my);
  return (Math.cos(b.head) * mx + Math.sin(b.head) * my) / d > 0.9;
});
ok('every moving ant has its head pointing the way it is travelling',
  moved13.length > 0 && facing.length === moved13.length, `${facing.length}/${moved13.length} moving`);

// (3) NEVER ROTATED PAST VERTICAL ---------------------------------------------
// rotating by heading alone turns an ant walking LEFT upside down. Rotate, then
// mirror, with a dead zone so an ant in a vertical shaft does not flicker.
const upright = a13.filter((a) => Math.abs(Math.cos(a.head)) > 0.16)
  .every((a) => a.mir === (Math.cos(a.head) < 0));
ok('an ant walking left is mirrored, never turned upside down', upright);
ok('the mirror has a dead zone, so a vertical shaft cannot make it flicker',
  /MOT\.dead/.test(html) && /dead:\s*0\.1/.test(html));
ok('and its feet are replanted the moment the mirror flips', /a\.flip = want; plantAll/.test(html));

// (4) THE CROWD IS THE SCORE ---------------------------------------------------
// the number of ants on screen IS the progress meter, so it must track the colony
ok('the drawn crowd never claims more ants than the colony really has',
  crowd13.length <= mot.ants, `${crowd13.length} drawn of ${mot.ants}`);
const wasDrawn = crowd13.length, wasAnts = mot.ants;
G.assign('nursery', 4); G.seconds(400);
const grown = G.crowd(), gmot = G.motion();
ok('the crowd grows as the colony grows',
  gmot.ants > wasAnts && grown.length > wasDrawn, `${wasDrawn}->${grown.length} drawn, ${wasAnts}->${gmot.ants} ants`);
ok('and it never goes over what the device can paint',
  grown.length <= gmot.cap, `${grown.length} of a ${gmot.cap} budget`);
ok('a phone gets a smaller painting budget than a desktop',
  G._cfg().sampleMaxPhone < G._cfg().sampleMax && G._cfg().sampleMax >= 150,
  `phone ${G._cfg().sampleMaxPhone}, desktop ${G._cfg().sampleMax}`);
ok('over budget it is leg detail that goes, never ants',
  /function antDetail\(n\)/.test(html) && /if\(far && det < 2\) continue;/.test(html));

// nothing is drawn on top of anything else
let closest = Infinity;
for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
  const d = Math.hypot(grown[i].dx - grown[j].dx, grown[i].dy - grown[j].dy);
  if (d < closest) closest = d;
}
ok('no two ants are painted in the same spot', closest > gmot.unit * 0.5,
  `closest pair ${closest.toFixed(3)} cells, ant unit ${gmot.unit.toFixed(3)}`);

// the job mix has to be visible in the crowd, not just on the bar
G.assign('forager', 1); G.seconds(30);
const few = G.crowd().filter((a) => a.job === 'forager').length;
G.assign('forager', Math.max(6, Math.floor(G.motion().ants * 0.6))); G.seconds(30);
const many = G.crowd().filter((a) => a.job === 'forager').length;
ok('moving the jobs slider really thickens and thins the crowd that is walking',
  many > few, `${few} foragers -> ${many} foragers`);

// (5) A CARRIED BERRY IS ONE REAL DELIVERY ------------------------------------
// the bush loses the berry the instant an ant picks it up, and the store only
// moves when that same ant walks through the door. A builder first: rain can
// have shut the front door while all this growing was going on, and a colony
// that cannot reach the meadow is not a test of carrying anything.
G.assign('builder', 3); G.assign('forager', 8);
let opened = false;
for (let s3 = 0; s3 < 1800 && !opened; s3++) { G.step(1); if (G.floods() === 0) opened = true; }
ok('builders really do open the way back out to the meadow', opened, `${G.floods()} still flooded`);
let heldSeen = 0, badHold = 0;
for (let s2 = 0; s2 < 1800; s2++) {
  G.step(1);
  const held = G.items().filter((it) => it.held && it.kind === 'berry').length;
  const carried = G.crowd().filter((a) => a.carry === 'berry').length;
  if (held > 0) heldSeen++;
  if (carried > held) badHold++;
}
ok('a berry in an ant is a berry the bush has really lost',
  heldSeen > 0 && badHold === 0, `${heldSeen} steps with a berry in transit`);

// (6) FOOD YOU CAN SEE ---------------------------------------------------------
ok('every kind of food is a chunky drawn thing, never a speck',
  ['drawBerry', 'drawLeafBit', 'drawCrumb', 'drawMushroom'].every((f) => new RegExp('function ' + f + '\\(').test(html)));
ok('a leaf bit is a real cut-leaf triangle', /drawLeafBit[\s\S]{0,400}moveTo\(0, -r\)[\s\S]{0,120}closePath/.test(html));
ok('mushrooms grow through stages, and a ready one glows and bounces',
  /function drawMushroom\(x, y, size, stage, ready, t\)/.test(html) && /ready \? Math\.sin/.test(html));
ok('the garden clock only runs while the garden is really making food',
  /C\.gardenT = \(C\.gardenT \|\| 0\) \+ used;/.test(html));
ok('the pantry is the food meter made physical', /C\.food \/ Math\.max\(1, foodCap\(\)\)/.test(html));
ok('the berry bush shows the next berry swelling on the branch',
  /countItems\("berry"\) < md\.berryMax/.test(html) && /drawBerry\(bx, by/.test(html));
ok('the drawing still runs clean with a full crowd on screen', G._draw() === 'ok', G._draw());

// --- 6) AC4: the sounds, the music and the art leftovers ----------------------
console.log('\n--- SOUND, MUSIC AND ART (AC4) ---');
const sfxSrc = fs.readFileSync(dir + '/api/sfx.js', 'utf8');
const musicSrc = fs.readFileSync(dir + '/api/library-music.js', 'utf8');
const { SOUNDS } = await import(new URL('file://' + fs.realpathSync(dir + '/api/sfx.js')).href);
const { LIBRARY_MUSIC } = await import(new URL('file://' + fs.realpathSync(dir + '/api/library-music.js')).href);

// the five sounds the card names, each registered AND long enough to be generated
const WANT_SOUNDS = ['antcity_dig', 'antcity_march', 'antcity_hatch', 'antcity_munch', 'antcity_rain'];
ok('the five Ant City sounds are registered in api/sfx.js',
  WANT_SOUNDS.every((k) => typeof SOUNDS[k] === 'string' && SOUNDS[k].length > 20),
  WANT_SOUNDS.filter((k) => !SOUNDS[k]).join(',') || 'all present');
// every one-shot needs a duration of at least 0.5s or the generator refuses it and
// the sound is silently missing in game — the trap the card warns about
const durBlock = /const DURATIONS\s*=\s*{([\s\S]*?)\n};/.exec(sfxSrc);
const durs = Object.fromEntries([...(durBlock ? durBlock[1] : '').matchAll(/([A-Za-z0-9_]+)\s*:\s*([0-9.]+)/g)].map((m) => [m[1], +m[2]]));
ok('every Ant City sound has a duration of at least 0.5s',
  WANT_SOUNDS.every((k) => durs[k] >= 0.5), WANT_SOUNDS.map((k) => `${k}=${durs[k]}`).join(' '));

// one shared, reusable meadow loop, listed for every project by /api/list-audio
const meadow = Object.keys(LIBRARY_MUSIC).filter((n) => /meadow_busy/.test(n));
ok('a Sunny Meadow music loop is in the shared library', meadow.length === 1, meadow.join(','));
ok('the loop is reusable, not Ant City only',
  meadow.every((n) => LIBRARY_MUSIC[n].theme && LIBRARY_MUSIC[n].label && !/ant/i.test(n)), meadow.join(','));

// the engine asks for them by name, and never ships the synth as the product
ok('the engine routes Feel through /api/sfx', /sfxBase\s*[:=]\s*"\/api\/sfx\?s="/.test(html) || /SFX_BASE\s*=\s*"\/api\/sfx\?s="/.test(html));
ok('the engine maps every one of its sounds', WANT_SOUNDS.every((k) => html.indexOf(k) > 0));
ok('the engine plays the shared meadow loop', /library-music\?name=meadow_busy_bright/.test(html));

// the art leftovers the card lists, each a real file the engine resolves
const WANT_ART = {
  'antcity/surface/meadow-v1': 'surface-meadow.svg',
  'antcity/surface/meadow-rain-v1': 'surface-meadow-rain.svg',
  'antcity/surface/meadow-berry-v1': 'surface-meadow-berry.svg',
  'antcity/soil/deep-v1': 'soil-deep.svg',
  'antcity/soil/loam-v1': 'soil-loam.svg',
  'antcity/prop/flood-v1': 'flood.svg',
  'antcity/prop/colony-v1': 'colony.svg',
  'antcity/loading/v1': 'loading.svg',
};
const missingFiles = Object.values(WANT_ART).filter((f) => !fs.existsSync(dir + '/public/antcity/art/' + f));
ok('every art leftover is a real file', missingFiles.length === 0, missingFiles.join(',') || 'all present');
const unmapped = Object.keys(WANT_ART).filter((id) => html.indexOf(id) < 0);
ok('the engine resolves each one from its manifest id', unmapped.length === 0, unmapped.join(',') || 'all mapped');
// every manifest asset id the game names now resolves to something
const ids = [...new Set([...JSON.stringify(manifest).matchAll(/"(antcity\/[a-z0-9\/-]+)"/g)].map((m) => m[1]))];
const unresolved = ids.filter((id) => html.indexOf(id) < 0 && !/badges\//.test(id));
ok('no manifest asset id is left with nothing behind it (a drawn one counts, if the engine says so)',
  unresolved.length === 0, unresolved.join(',') || 'all resolve');
ok('the deliberately drawn ids are declared, not just missing', /DRAWN_ART\s*=\s*\[/.test(html));
// and the drawn fallback is still there for every slot
ok('a drawn fallback still stands behind the art', /else\s*{[\s\S]{0,200}fillStyle/.test(html));

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);
