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

console.log((allWin && d === 'ok' && mok) ? 'ALL DIFFICULTIES WINNABLE + MANIFEST OK' : 'SOME FAILED');
process.exit(allWin && d === 'ok' && mok ? 0 : 1);
