// Headless QA for public/paper-route-engine.html (card PB1). House style, modelled
// on qa-antcity.mjs: build the engine in a vm with the shared libs, drive it FROM
// the manifest, and prove a perfect player rides the whole street and delivers
// every paper.
//
// What it asserts:
//   1. /paper-route/manifest.json is valid through the shared loader and is the
//      shape the engine reads (a street whose houses, obstacles, ramps, boosts and
//      bundles are pure data, difficulty 1-5 the only tuning dial).
//   2. The difficulty band really moves: papers, length, pace and obstacle density
//      all change with the dial, and no raw speed lives in the manifest.
//   3. A perfect-player bot finishes the street with EVERY subscriber delivered.
//   4. The ride is always winnable: a bump is a wobble and one dropped paper, and
//      there is no lose state, no timer and no lives anywhere in the engine.
//   5. Ramps carry you over what is on the road and an air throw pays double.
//   6. Cartridge contract: pause freezes and resume continues, coins are announced
//      to the shared wallet (never stored), win is signalled, the shared nav /
//      start screen / HUD are used, art is not baked in, no emoji anywhere.
//
//   node qa-paper-route.mjs .
import fs from 'fs'; import vm from 'vm';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(dir + '/public/' + f, 'utf8');
const html = read('paper-route-engine.html');
const libs = ['buildable-audio.js', 'buildable-startscreen.js', 'buildable-levelthumb.js',
  'buildable-manifest.js', 'buildable-hud.js', 'buildable-gamenav.js', 'buildable-wallet.js',
  'buildable-feel.js'].map(read).join('\n');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');

let fails = 0;
const ok = (name, pass, extra = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`); if (!pass) fails++; };

// --- 1) the manifest, through the shared loader --------------------------------
console.log('--- MANIFEST: /paper-route/manifest.json ---');
const manifestRaw = fs.readFileSync(dir + '/public/paper-route/manifest.json', 'utf8');
const manifest = JSON.parse(manifestRaw);
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb;
vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, { filename: 'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const v = BM.validate(manifest);
ok('manifest validates', v.ok, JSON.stringify(v.errors));
ok('names the engine entry', manifest.entry === '/paper-route-engine.html' && manifest.engine === 'canvas');
ok('type is game, coins on, journey on', manifest.type === 'game' && manifest.features.coins === true && manifest.features.journey === true);
ok('single-player (multiplayer off)', manifest.features.multiplayer === 'off');
ok('art is declared as SLOTS, never a baked file path',
  !!manifest.art && !!manifest.art.badge && !/\.(png|jpg|jpeg|webp|svg)\b/i.test(JSON.stringify(manifest.art)), JSON.stringify(manifest.art));
ok('the street is Maple Street at difficulty 1', manifest.levels.length === 1 && manifest.levels[0].id === 'maple-street' && manifest.levels[0].difficulty === 1);
ok('no emoji in the manifest', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(manifestRaw));

const p0 = manifest.levels[0].parts;
ok('houses, obstacles, ramps, boosts and bundles are all DATA',
  ['houses', 'obstacles', 'ramps', 'boosts', 'bundles'].every((k) => Array.isArray(p0[k]) && p0[k].length));
ok('every house is placed by a 0-1 position and a side',
  p0.houses.every((h) => typeof h.at === 'number' && h.at >= 0 && h.at <= 1 && (h.side === 1 || h.side === -1)));
ok('the street has red-flag subscribers to deliver to', p0.houses.filter((h) => h.sub).length >= 4, `${p0.houses.filter((h) => h.sub).length} subscribers`);
ok('no raw speed / length / paper count in the manifest (difficulty is the only dial)',
  !/"(speed|length|papers|obstacleDensity)"\s*:/.test(manifestRaw));

// --- 2) the difficulty band really moves ---------------------------------------
console.log('\n--- DIFFICULTY: the 1-5 dial is the only tuning knob ---');
const bands = [1, 2, 3, 4, 5].map((d) => {
  const m = JSON.parse(manifestRaw);
  m.levels[0].difficulty = d;
  return BM.toEngineConfig(m).streets[0];
});
ok('street gets longer with the dial', bands.every((b, i) => i === 0 || b.length > bands[i - 1].length), bands.map((b) => b.length).join(' < '));
ok('the ride gets quicker with the dial', bands.every((b, i) => i === 0 || b.speed > bands[i - 1].speed), bands.map((b) => b.speed).join(' < '));
ok('more of the obstacle set goes live with the dial', bands.every((b, i) => i === 0 || b.obstacleDensity >= bands[i - 1].obstacleDensity), bands.map((b) => b.obstacleDensity).join(' <= '));
ok('the bag never carries fewer papers than there are subscribers', bands.every((b) => b.papers >= b.subscribers), bands.map((b) => `${b.papers}>=${b.subscribers}`).join(', '));

// --- 3) build the engine in a sandbox ------------------------------------------
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
const documentStub = {
  getElementById: (id) => (id === 'start' ? el(false) : el(true)), querySelector: () => el(true),
  addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true), hidden: false,
  getElementsByTagName: () => [],
};
const posts = [];
const listeners = {};
const send = (data) => (listeners.message || []).forEach((fn) => fn({ data }));
const sandbox = {
  document: documentStub, window: {}, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop,
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop,
  setInterval: () => 0, clearInterval: noop, performance: { now: () => Date.now() },
  URLSearchParams, location: { search: '' }, Date, Math, JSON, console,
  postMessage: (d) => posts.push(d),
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.parent = sandbox;
vm.createContext(sandbox);
vm.runInContext(libs + '\n' + engine, sandbox, { filename: 'paper-route' });

const G = sandbox.BUILDABLE_GAME;
console.log('\n--- CONTRACT: the headless handle ---');
ok('BUILDABLE_GAME exposed', !!G);
ok('PAPERROUTE_GAME alias', sandbox.PAPERROUTE_GAME === G);
if (!G) { console.error('no game handle — aborting'); process.exit(2); }

// the engine reads its own manifest through the shared loader; there is no fetch in
// a vm, so hand it the same manifest the browser would have fetched
G._applyManifest(manifest);
const streets = G.streets();
ok('engine took its street from the manifest', streets.length === manifest.levels.length && streets[0].id === manifest.levels[0].id, streets.map((s) => s.id).join(','));
ok('built-in FALLBACK_STREETS present (a manifest miss never breaks play)', /FALLBACK_STREETS\s*=/.test(html));
const fbIds = ((html.match(/FALLBACK_STREETS\s*=\s*\[([\s\S]*?)\n  \];/) || [])[1] || '').match(/id:"([a-z0-9-]+)"/g) || [];
ok('the fallback street ids match the manifest (no drift)',
  JSON.stringify(fbIds.map((x) => x.replace(/id:"|"/g, ''))) === JSON.stringify(manifest.levels.map((l) => l.id)),
  fbIds.join(','));

// --- 4) the perfect player rides the street ------------------------------------
console.log('\n--- THE BOT RIDES MAPLE STREET ---');
const walletCalls = [];
const BWlib = sandbox.BuildableWallet;
if (BWlib && BWlib.awardOnce) { const real = BWlib.awardOnce; BWlib.awardOnce = (k, n) => { walletCalls.push({ k, n }); return real.call(BWlib, k, n); }; }
const runs = G.campaign(180);
runs.forEach((r, i) => {
  ok(`street ${i + 1} (${streets[i].name}) finishes`, !!r && r.done === true, JSON.stringify(r));
  ok(`street ${i + 1}: every subscriber gets a paper`, !!r && r.delivered === r.subs && r.subs > 0, `${r && r.delivered}/${r && r.subs}`);
  ok(`street ${i + 1}: never runs the bag dry`, !!r && r.papers >= 0 && r.delivered <= streets[i].papers + 20, `papers left ${r && r.papers}`);
  ok(`street ${i + 1}: the bot rides it in a kid-sized time`, !!r && r.seconds > 2 && r.seconds < 120, `${r && r.seconds && r.seconds.toFixed(1)}s`);
});

// --- 5) always winnable, and the ride's own rules --------------------------------
console.log('\n--- ALWAYS WINNABLE: a bump is a wobble, never a loss ---');
ok('no lose state anywhere in the engine', !/signal\("lose"/.test(html) && !/game\s*over/i.test(html));
// checked against CODE, not the comments that explain there are none of these
const code = engine.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('no lives, no timer, no penalty countdown', !/\blives\b/i.test(code) && !/timeLeft|timeUp|countdown/i.test(code));
// a bump: one dropped paper, a wobble, and the ride carries on
G.play(0);
G.steer(0);
let before = G.dbg();
const obstacles = streets[0].obstacles;
ok('the street really has obstacles to bump', obstacles.length > 0, `${obstacles.length}`);
// drive straight down the lane an obstacle sits in until something is hit
const target = obstacles[0];
G.steer(target.x);
let guard = 0, bumped = null;
while (guard++ < 60 * 60) { G.step(1 / 60); const d = G.dbg(); if (d.bumps > 0) { bumped = d; break; } if (d.done) break; }
ok('riding into an obstacle costs one paper and nothing else', !!bumped && bumped.bumps === 1 && bumped.papers === before.papers - 1, JSON.stringify(bumped && { bumps: bumped.bumps, papers: bumped.papers }));
ok('the ride keeps going after a bump', !!bumped && bumped.done === false);

// a ramp carries you clean over what is on the road, and an air throw pays double
console.log('\n--- RAMPS: over the top, and the air throw pays double ---');
const engineSrc = engine;
ok('a ramp puts the rider in the air', /run\.air\s*=\s*AIR_TIME/.test(engineSrc));
ok('nothing on the road can touch you while airborne', /if\(run\.air <= 0\)\{[\s\S]{0,220}bump\(o\)/.test(engineSrc));
ok('an air throw is worth double coins', /p\.air \? 4 : 2/.test(engineSrc));
ok('boost strips speed the ride up', /run\.boost\s*=\s*BOOST_TIME/.test(engineSrc) && /run\.boost>0 \? 1\.55/.test(engineSrc));
ok('a bundle refills the bag', /run\.papers = run\.papersMax/.test(engineSrc));
ok('a delivery lights the porch and waves a neighbour', /h\.light = 1; h\.wave =/.test(engineSrc));
ok('three in a row is a streak', /run\.streak % 3 === 0/.test(engineSrc));

// --- 6) the cartridge contract ---------------------------------------------------
console.log('\n--- CARTRIDGE CONTRACT ---');
G.play(0);
send({ type: 'pause' });
ok('pause freezes the game', G.paused() === true);
const zPaused = G.dbg().z;
for (let i = 0; i < 30; i++) G.step(1 / 60);
ok('nothing moves while paused', G.dbg().z === zPaused, `${zPaused} -> ${G.dbg().z}`);
send({ type: 'resume' });
ok('resume continues exactly where it was', G.paused() === false);
for (let i = 0; i < 30; i++) G.step(1 / 60);
ok('the ride carries on after resume', G.dbg().z > zPaused);

// a real (non-silent) route, so the coins and the win signal actually fire
posts.length = 0; walletCalls.length = 0;
G.play(0, false);
for (let i = 0; i < 60 * 120 && !(G.dbg() || {}).done; i++) { G.bot(1 / 60); G.step(1 / 60); }
const realRun = G.dbg();
ok('a real route delivers every paper and finishes', !!realRun && realRun.done && realRun.delivered === realRun.subs, JSON.stringify(realRun && { done: realRun.done, delivered: realRun.delivered, subs: realRun.subs }));
ok('coins go to the SHARED wallet, never into the game', walletCalls.length > 0 && /awardOnce/.test(html), `${walletCalls.length} awards`);
ok('finishing the street pays its completion bonus once', walletCalls.some((c) => /:finished$/.test(c.k)), walletCalls.map((c) => c.k).join(' '));
ok('a perfect route pays a perfect bonus once', walletCalls.some((c) => /:perfect$/.test(c.k)));
// replay the street: every award must reuse a key the wallet has already seen, so
// the shell's de-dupe covers it and a kid cannot farm coins by riding it again
const firstKeys = new Set(walletCalls.map((c) => c.k));
const firstCount = walletCalls.length;
G.play(0, false);
for (let i = 0; i < 60 * 120 && !(G.dbg() || {}).done; i++) { G.bot(1 / 60); G.step(1 / 60); }
const replayKeys = walletCalls.slice(firstCount);
ok('a replay cannot farm coins: every award reuses a key the wallet already paid',
  replayKeys.length > 0 && replayKeys.every((c) => firstKeys.has(c.k)),
  `${replayKeys.length} awards, all seen before: ${replayKeys.every((c) => firstKeys.has(c.k))}`);
ok('the win signal reaches the shell', posts.some((d) => d && d.source === 'buildable' && d.kind === 'win'), JSON.stringify(posts.filter((d) => d && d.kind).map((d) => d.kind)));
ok('every coin award is keyed so a replay cannot farm it', walletCalls.every((c) => /^paper-route:/.test(c.k)), walletCalls.slice(0, 3).map((c) => c.k).join(','));
ok('the game has no wallet of its own', !/localStorage[\s\S]{0,40}coins/i.test(html));
ok('it signals win to the shell (buddy + per-kid logging)', /signal\("win"/.test(html));
ok('it registers the shared game nav (Home exits to the hub)', /BuildableGameNav\.register\(/.test(html));
ok('it mounts the shared start screen', /BS\.mount\(/.test(html));
ok('it uses the ONE shared HUD', /BuildableHUD\.mount\(/.test(html) && /HUD\(\)\.set\(/.test(html));
ok('it honours the shell pause/resume messages', /t === "pause"/.test(html) && /t === "resume"/.test(html));
ok('it accepts a start message carrying a level', /t === "start"/.test(html));
ok('sound comes from clips we created, routed through /api/sfx', /\/api\/sfx\?s=/.test(html) && /pr_throw/.test(html) && /pr_clunk/.test(html) && /pr_streak/.test(html));
ok('the shared FL5 delivery sounds are reused, not re-made', /sky_pickup/.test(html) && /sky_deliver/.test(html));
ok('no art is baked into the engine', !/<img/i.test(html) && !/\.(png|jpg|jpeg|webp)\b/i.test(engineSrc));
ok('no emoji anywhere in the engine', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u.test(html));

// --- 7) shell + routing wiring ---------------------------------------------------
console.log('\n--- SHELL: catalog entry + screen + vercel routes ---');
const jsx = fs.readFileSync(dir + '/src/BuildableKids.jsx', 'utf8');
ok('Paper Route is in the picker catalog', /id: "paper-route"/.test(jsx) && /handler: "onPaperRoute"/.test(jsx));
ok('the tile is still Coming Soon behind the 1111 gate', /id: "paper-route"[^\n]*soon: true/.test(jsx));
ok('the shell has a screen that embeds the engine', /PaperRouteScreen/.test(jsx) && /paper-route-engine\.html/.test(jsx));
ok('plays are logged under its own slug', /\[SCREEN_PAPERROUTE\]: "paper-route"/.test(jsx));
const vjson = JSON.parse(fs.readFileSync(dir + '/vercel.json', 'utf8'));
const srcs = vjson.routes.map((r) => r.src);
ok('vercel routes the engine + the manifest (not swallowed by the catch-all)',
  srcs.includes('/paper-route-engine.html') && srcs.includes('/paper-route/manifest.json'));
const sfxSrc = fs.readFileSync(dir + '/api/sfx.js', 'utf8');
ok('the three new sounds are registered with a prompt AND a duration',
  ['pr_throw', 'pr_clunk', 'pr_streak'].every((k) => new RegExp(`${k}:\\s*"`).test(sfxSrc) && new RegExp(`${k}:\\s*[0-9.]+`).test(sfxSrc)));
const durs = ['pr_throw', 'pr_clunk', 'pr_streak'].map((k) => parseFloat((sfxSrc.match(new RegExp(`${k}:\\s*([0-9.]+)`)) || [])[1]));
ok('every new sound clears the 0.5s ElevenLabs floor', durs.every((d) => d >= 0.5), durs.join(','));

console.log('\n' + (fails ? `${fails} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(fails ? 1 : 0);
