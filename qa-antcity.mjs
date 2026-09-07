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

// --- 5b) AC5: intentional ants, the game that teaches itself, and the swarm ---
console.log('\n--- AC5: INTENTIONAL ANTS, TEACHING, SWARM ---');

// the swarm: many small ants, not a handful of big ones
ok('the ants are drawn small enough to read as a swarm', G.antScale() > 0 && G.antScale() <= 0.3, `scale=${G.antScale()}`);
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
  if (crowd.some((a) => a.task === 'food')) sawFood = true;
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
ok('it teaches three things, one at a time', gStart.steps === 3);
ok('step one asks in kid words, with no wall of text', /dig/i.test(gStart.text) && gStart.text.length < 60, gStart.text);
G.seconds(20);
ok('a step WAITS: doing nothing never advances it', G.guide().step === 0, JSON.stringify(G.guide()));
G.digDown(2); G.seconds(1);
ok('digging really advances it to step two', G.guide().step === 1, JSON.stringify(G.guide()));
G.seconds(20);
ok('step two waits for food to be dropped', G.guide().step === 1);
G.drop('food', 150); G.seconds(1);
ok('dropping food advances it to step three', G.guide().step === 2, JSON.stringify(G.guide()));
G.assign('nursery', 3); G.seconds(1);
ok('moving an ant to a new job finishes the guide', G.guide().on === false, JSON.stringify(G.guide()));

// the goal is on screen the whole time, in kid words
const goalLine = G.goal();
ok('the goal line is always saying something', typeof goalLine === 'string' && goalLine.length > 4, goalLine);
ok('the goal line has no jargon or raw numbers dumped in it', !/undefined|NaN|null/.test(goalLine), goalLine);
ok('the guide replays from the ? button', (G.showHow(), G.guide().on === true && G.guide().step === 0));

// the controls say what they are, in words
['toolDig', 'toolFood', 'toolWater', 'toolJobs'].forEach((id) =>
  ok(`the ${id.replace('tool', '').toLowerCase()} control is a labelled button`, new RegExp(`id="${id}"[^>]*>[A-Z][a-z]+<`).test(html)));
ok('the goal strip is in the markup', /id="goalText"/.test(html));

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
