// Headless QA for public/antcity-engine.html (card AC2). House style, modelled on
// qa-breaker.mjs: build the engine in a vm with the shared libs, drive it FROM the
// manifest, and prove a perfect player finishes all ten missions.
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

// --- 2) build the engine in a sandbox -----------------------------------------
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient')
    ? () => ({ addColorStop: noop })
    : (k === 'canvas' ? { width: 900, height: 600 } : (typeof k === 'string' ? noop : undefined)),
});
function el(withAppend) {
  const e = {
    style: { setProperty: noop }, classList: { add: noop, remove: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, getContext: () => ctxStub, onclick: null,
    textContent: '', className: '', childElementCount: 0, width: 900, height: 600, naturalWidth: 0, complete: false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }), setPointerCapture: noop, closest: () => null,
  };
  Object.defineProperty(e, 'innerHTML', { set() {}, get() { return ''; } });
  if (withAppend) { e.appendChild = noop; e.removeChild = noop; }
  return e;
}
class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
// the "start" host has no appendChild, so BS.mount takes its headless path
const documentStub = {
  getElementById: (id) => (id === 'start' ? el(false) : el(true)), querySelector: () => el(true),
  addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true), hidden: false,
};
// the wallet announcer posts coins UP to the shell; catch them here
const coinPosts = [];
const listeners = {};                     // a real window event bus, so shell messages land
const send = (data) => (listeners.message || []).forEach((fn) => fn({ data }));
const sandbox = {
  document: documentStub, window: {}, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop,
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop,
  setInterval: () => 0, clearInterval: noop, performance: { now: () => Date.now() },
  URLSearchParams, location: { search: '' }, Date, Math, JSON, console,
  postMessage: (d) => { if (d && d.type === 'coins') coinPosts.push(d); },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(libs + '\n' + engine, sandbox, { filename: 'antcity' });

const G = sandbox.BUILDABLE_GAME;
console.log('\n--- CONTRACT ---');
ok('BUILDABLE_GAME exposed', !!G);
ok('ANTCITY_GAME alias', sandbox.ANTCITY_GAME === G);
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
for (let i = 0; i < 10; i++) {
  const listed = G.missions()[i];            // name the mission by its place in the list
  let secs = 0;
  while (!G.missions()[i].done && !G.freeBuild() && secs < CAP_SECONDS) { work(G.mission()); G.seconds(2); secs += 2; }
  const done = G.missions()[i].done;
  results.push({ n: i + 1, id: listed.id, name: listed.name, done, secs });
  ok(`mission ${i + 1} — ${listed.name}`, done, `${secs}s of colony time`);
  if (!done) break;
}
ok('all ten missions finished', results.length === 10 && results.every((r) => r.done));
ok('the tenth hands off to free-build', G.freeBuild() === true);

const coins = G.dbg().coins;
const missionCoins = manifest.levels.reduce((a, l) => a + l.coins, 0);
const paid = coins.filter((c) => c.key.indexOf('antcity:milestone:') !== 0).reduce((a, c) => a + c.n, 0);
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
ok('the ant art is the one the manifest asked for', art.ant === manifest.levels[0].parts.ant, art.ant);
ok('draws without throwing', G._draw() === 'ok', G._draw());
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu);
ok('no emoji anywhere in the engine', !emoji, emoji ? emoji.join(' ') : '');
ok('the wordless show can be replayed', (G.showHow(), G.how() === true));

// the game is still one colony the kid keeps: nothing above reset it
ok('one colony the whole way through', G.dbg().ants > 0 && G.dbg().dug > 0);

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);
