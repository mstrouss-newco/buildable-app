// Headless QA harness for public/play.html — runs BK_GAME.sim() in node.
// Stubs the browser globals the engine touches at load (document, Image,
// AudioContext, rAF, addEventListener). draw() is NOT called by sim(), so a
// no-op canvas context is enough. Every level must return result "win".
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const file = process.argv[2] || path.resolve('public/play.html');
const html = fs.readFileSync(file, 'utf8');
// concatenate every <script> block (the engine is one block, but be safe)
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');

// --- minimal DOM/canvas stubs ---
const noop = ()=>{};
const ctxStub = new Proxy({}, { get:(_,k)=> (k==='createLinearGradient'||k==='createRadialGradient')
  ? ()=>({addColorStop:noop}) : (typeof k==='string' ? noop : undefined) });
function makeEl(){ return { style:{}, addEventListener:noop, getContext:()=>ctxStub,
  width:900, height:540, naturalWidth:0, naturalHeight:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:540}) }; }
class ImageStub { constructor(){ this.complete=false; this.naturalWidth=0; this.naturalHeight=0; } set src(v){ this._src=v; } get src(){ return this._src; } addEventListener(){} }

const documentStub = {
  getElementById: ()=>makeEl(),
  querySelector: ()=>makeEl(),
  addEventListener: noop,
  createElement: ()=>makeEl(),
};
const sandbox = {
  document: documentStub,
  window: {},
  Image: ImageStub,
  requestAnimationFrame: noop,           // engine calls this once at load; sim drives update() itself
  cancelAnimationFrame: noop,
  addEventListener: noop,
  removeEventListener: noop,
  setTimeout: ()=>0, clearTimeout: noop, setInterval: ()=>0, clearInterval: noop,
  Date, Math, console,
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.window = sandbox;            // engine reads window.GAME_CONFIG / sets window.BK_GAME
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(scripts, sandbox, { filename:'play.html-engine' });

const BK = sandbox.BK_GAME || (sandbox.window && sandbox.window.BK_GAME);
if(!BK){ console.error('FAIL: BK_GAME not exposed'); process.exit(2); }

// how many levels?
const cfg = sandbox.GAME_CONFIG || (sandbox.window && sandbox.window.GAME_CONFIG);
const nLevels = (cfg && cfg.levels && cfg.levels.length) || 1;
// Two things have to hold for every level. (1) A perfect player wins it — the
// clearability guarantee buildLevel exists to provide. (2) At least 60% of the level's
// coins are reachable WITHOUT leaving the floor, because the bot never climbs: that is
// the HH3 promise that the rewards sit on the path a kid actually runs, rather than
// almost entirely on platforms a ground-running kid walks straight past.
// (3) The perfect player finishes UNHURT. Winning on the last heart means the level has
// spots even a flawless run cannot handle, which is one bad roll away from unclearable.
const COIN_FLOOR_PCT = 60;
let ok = true;
for(let i=0;i<nLevels;i++){
  const r = BK.sim(i, 20000);
  const won = r.result==='win';
  const unhurt = r.hearts === 3;
  const [got, of_] = String(r.coins).split('/').map(Number);
  const pct = of_ ? Math.round(got*100/of_) : 0;
  const coinsOk = pct >= COIN_FLOOR_PCT;
  ok = ok && won && coinsOk && unhurt;
  console.log(`${won?'PASS':'FAIL'}  level ${i}  result=${r.result}  frames=${r.frames} (~${(r.frames/60)|0}s)`);
  console.log(`${unhurt?'PASS':'FAIL'}  level ${i}  perfect player finishes unhurt  hearts=${r.hearts}/3`);
  console.log(`${coinsOk?'PASS':'FAIL'}  level ${i}  coins on the ground path ${got}/${of_} = ${pct}%  (need ${COIN_FLOOR_PCT}%)`);
}
console.log(ok ? 'ALL LEVELS WIN, UNHURT, COINS ON THE GROUND PATH ✓' : 'SOME LEVELS FAILED ✗');
process.exit(ok?0:1);
