// Headless QA for public/tennis.html — a perfect player must beat the bot on
// every difficulty (always-winnable rule). Stubs the browser globals the engine
// touches at load, then drives TENNIS_GAME.sim() in Node.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const html    = fs.readFileSync(dir + '/public/tennis.html', 'utf8');
const renders = fs.readFileSync(dir + '/public/buildable-renders.js', 'utf8');
const audio   = fs.readFileSync(dir + '/public/buildable-audio.js', 'utf8');
const mech    = fs.readFileSync(dir + '/public/buildable-mechanics.js', 'utf8');
const engine  = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

const noop = () => {};
const ctxStub = new Proxy({}, { get: (_, k) =>
  (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop })
  : (k === 'canvas' ? { width: 900, height: 1200 } : (typeof k === 'string' ? noop : undefined)) });
function makeEl() { return { style: {}, classList: { add: noop, remove: noop }, addEventListener: noop,
  getContext: () => ctxStub, appendChild: noop, set innerHTML(v){}, get innerHTML(){return '';},
  width: 900, height: 1200, naturalWidth: 0, naturalHeight: 0, complete: false,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 1200 }) }; }
class ImageStub { constructor(){ this.complete=false; this.naturalWidth=0; } set src(v){ this._src=v; } get src(){ return this._src; } addEventListener(){} }
class AudioStub { constructor(){} set src(v){} play(){ return { catch: noop }; } }
const documentStub = { getElementById: () => makeEl(), querySelector: () => makeEl(), addEventListener: noop, createElement: () => makeEl() };
const sandbox = { document: documentStub, window: {}, Image: ImageStub, Audio: AudioStub,
  requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop, removeEventListener: noop,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  Date, Math, console, devicePixelRatio: 1, innerWidth: 900, innerHeight: 1200 };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(renders + '\n' + audio + '\n' + mech + '\n' + engine, sandbox, { filename: 'tennis' });

const T = sandbox.TENNIS_GAME;
if (!T) { console.error('FAIL: TENNIS_GAME not exposed'); process.exit(2); }
const cfg = T._cfg(); let allWin = true;
for (let i = 0; i < cfg.levels.length; i++) {
  const r = T.sim(i, 60000);
  const ok = r.result === 'win';
  allWin = allWin && ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${cfg.levels[i].name.padEnd(8)} result=${r.result} score=${r.sB}-${r.sT} frames=${r.frames}`);
}
// render smoke test
T._begin(1); T._step(120); const d = T._draw(); console.log('render:', d);
let mok=true;
console.log('--- MANIFEST (Session 7B): /tennis/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(fs.readFileSync(dir+'/public/buildable-manifest.js','utf8'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/tennis/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log((mv.ok?'PASS':'FAIL')+'  manifest validates  errors='+JSON.stringify(mv.errors)); if(!mv.ok)mok=false;
console.log((manifest.category==='Sports'?'PASS':'FAIL')+'  category is Sports'); if(manifest.category!=='Sports')mok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
const lineUp = mcfg.stages.length===3 && mcfg.stages.every((st,i)=>st.name===manifest.levels[i].name);
console.log((lineUp?'PASS':'FAIL')+'  3 difficulty tiers line up (Gentle/Normal/Speedy)  ::  '+mcfg.stages.map(st=>st.name).join(', ')); if(!lineUp)mok=false;
console.log((mcfg.multiplayer==='realtime'&&mcfg.transport==='realtime'?'PASS':'FAIL')+'  multiplayer -> realtime lane (family play)'); if(!(mcfg.multiplayer==='realtime'&&mcfg.transport==='realtime'))mok=false;
const worldSlot=(manifest.customization||[]).find(c=>/world/i.test(c.slot));
console.log((worldSlot&&worldSlot.options.length===8?'PASS':'FAIL')+'  8-world loadout'); if(!(worldSlot&&worldSlot.options.length===8))mok=false;
console.log((/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("tennis"/.test(html)?'PASS':'FAIL')+'  engine loads the shared manifest'); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("tennis"/.test(html)))mok=false;


// --- SAME-DEVICE 2P (QA56) -------------------------------------------------
// Mike: "two-player on the same screen does not work". The root cause of the
// original report was the empty full-screen #menu overlay eating every tap
// (fixed 2026-08-29, see TN-FIX); what was left underneath was a half-ownership
// bug -- the paddle you drove was decided by where your finger was RIGHT NOW,
// so P1 reaching over the net stole P2's paddle and a bare mouse hover dragged
// whichever paddle it drifted across. A pointer now claims a half on press and
// keeps it until it lifts. These cases lock that in.
let tp = true;
const t2 = (name, cond, extra='') => { if (!cond) tp = false; console.log(`${cond?'PASS':'FAIL'}  ${name}${extra?'  ::  '+extra:''}`); };
console.log('--- SAME-DEVICE 2P (QA56) ---');
const near = (a, b) => Math.abs(a - b) < 0.02;

t2('2P mode starts a live match', T._2p() === 'play');

// two fingers, one per half, move their own paddle and nobody else's
T._setPads(0.5, 0.5);
T._touch('down', 0.20, 0.15, 1); T._touch('down', 0.80, 0.85, 2);
T._touch('move', 0.22, 0.15, 1); T._touch('move', 0.78, 0.85, 2);
let pads = T._pads();
t2('two fingers drive one paddle each', near(pads.topX, 0.22) && near(pads.bottomX, 0.78),
   `topX=${pads.topX.toFixed(3)} bottomX=${pads.bottomX.toFixed(3)}`);
T._lift(1); T._lift(2);

// P1 reaching across the net must NOT capture P2's paddle
T._setPads(0.20, 0.80);
T._touch('down', 0.80, 0.85, 3);
T._touch('move', 0.60, 0.60, 3);
T._touch('move', 0.50, 0.30, 3);           // well over the net into P2's half
pads = T._pads();
t2('a finger keeps the half it started in', near(pads.topX, 0.20) && near(pads.bottomX, 0.50),
   `topX=${pads.topX.toFixed(3)} (must stay 0.200) bottomX=${pads.bottomX.toFixed(3)}`);
T._lift(3);

// a move with no press behind it (desktop hover) must steer nothing
T._setPads(0.20, 0.80);
T._touch('move', 0.50, 0.15, 9);
pads = T._pads();
t2('a hover with no press steers nothing', near(pads.topX, 0.20) && near(pads.bottomX, 0.80),
   `topX=${pads.topX.toFixed(3)} bottomX=${pads.bottomX.toFixed(3)}`);

// P2's keyboard (A/D) must survive a stray hover in their half
T._setPads(0.50, 0.80);
T._keys['a'] = true; T._step(10); T._keys['a'] = false;
const afterKeys = T._pads().topX;
T._touch('move', 0.90, 0.10, 9);
pads = T._pads();
t2("P2's keys are not snapped away by a hover", pads.topX < 0.5 && near(pads.topX, afterKeys),
   `topX=${pads.topX.toFixed(3)} after A-key=${afterKeys.toFixed(3)}`);

// no bot may touch the top paddle in 2P
T._setPads(0.30, 0.70); T._step(90);
pads = T._pads();
t2('no bot moves a paddle in 2P', near(pads.topX, 0.30) && near(pads.bottomX, 0.70),
   `topX=${pads.topX.toFixed(3)} bottomX=${pads.bottomX.toFixed(3)}`);

// a 2P match must actually reach a winner (P2 tracks the ball, P1 parks)
t2('a 2P match plays through to a winner', T.sim2p(60000).over,
   JSON.stringify(T.sim2p(60000)));

const pass = allWin && d === 'ok' && mok && tp;
console.log(pass ? 'ALL DIFFICULTIES WINNABLE + MANIFEST OK + 2P SAME-DEVICE OK' : 'SOME FAILED');
process.exit(pass ? 0 : 1);
