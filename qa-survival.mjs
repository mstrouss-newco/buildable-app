// Headless QA for public/survival-engine.html — BASELINE (pre-5A conversion).
// Modeled on qa-breaker.mjs / qa-sling.mjs. Goal: prove every level is winnable
// plus a render smoke test, against Survival EXACTLY as it exists today, so we
// have an honest baseline before the Session 5A manifest conversion.
//
// Survival is a roguelite: hero upgrades carry forward level-to-level. So we test
// winnability two ways and report both:
//   1) ISOLATED  — each level from base stats (SURV_GAME.sim, carry=false). Shows a
//      level's raw difficulty. Late levels MAY fail here by design (they expect
//      accumulated upgrades); a failure is a data point, not automatically a bug.
//   2) CAMPAIGN  — one run from level 1 carrying upgrades forward (SURV_GAME.campaign).
//      This is the real player experience; a stall here is a genuine winnability gap.
// Plus a render smoke test. This harness only REPORTS — it fixes nothing.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('survival-engine.html');
// shared libs loaded into the sandbox exactly like the browser <script src> tags do
const libs=['buildable-renders.js','buildable-worlds.js','buildable-audio.js',
            'buildable-mechanics.js','buildable-startscreen.js','buildable-levelthumb.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
// Return null for #start so the engine's DOM menu init (wireMenus/showMenu/loadChar) is
// SKIPPED — headless drives levels directly through SURV_GAME. #c must be a real stub.
const documentStub={ getElementById:(id)=> id==='start'? null : el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const localStorageStub={ getItem:()=>null, setItem:noop, removeItem:noop };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop,
  localStorage:localStorageStub, fetch:()=>Promise.reject(new Error('no-net')).catch(()=>{}),
  performance:{now:()=>Date.now()}, URLSearchParams, location:{search:''}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);
// Harness-side shim (does NOT modify the game file): Survival exposes SURV_GAME but no
// `_cfg()` accessor like Breaker/Sling, and GAME_CONFIG is a top-level const (not a
// sandbox global), so we surface it for the level list. 5A should add a real _cfg().
const cfgShim='\n;try{window.__CFG=(typeof GAME_CONFIG!=="undefined")?GAME_CONFIG:null;}catch(e){window.__CFG=null;}';
vm.runInContext(libs+'\n'+engine+cfgShim, sandbox, {filename:'survival-engine'});

const SG=sandbox.SURV_GAME;
let ok=true;
if(!SG){ console.error('FAIL: SURV_GAME not exposed'); process.exit(2); }
// Pre-conversion note: Survival exposes the old `SURV_GAME` name, not the
// `BUILDABLE_GAME` convention Breaker/Sling adopted. 5A should normalize this.
if(sandbox.BUILDABLE_GAME) console.log('note: BUILDABLE_GAME alias present');
else console.log('note: no BUILDABLE_GAME alias — engine exposes SURV_GAME only (expected pre-5A)');

const cfg=sandbox.__CFG; if(!cfg||!cfg.levels){ console.error("FAIL: GAME_CONFIG.levels unreadable"); process.exit(2); }
const n=cfg.levels.length;
const RUNS=5, CAP=12000;   // CAP ~200s @60fps — comfortably past the longest level (52s + boss)

console.log('--- ISOLATED: each level from base stats, '+RUNS+' runs each ---');
const isoFail=[];
for(let i=0;i<n;i++){ let winAll=true, worstF=0, wins=0, worstHp=99;
  for(let t=0;t<RUNS;t++){ const r=SG.sim(i,CAP);
    if(r.result==='win'){ wins++; } else { winAll=false; }
    worstF=Math.max(worstF,r.frames); worstHp=Math.min(worstHp,r.hpLeft); }
  if(!winAll){ ok=false; isoFail.push(i+1); }
  console.log(`${winAll?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(15)} wins=${wins}/${RUNS} worst=${worstF}f (~${(worstF/60).toFixed(0)}s) minHpLeft=${worstHp}`); }

console.log('--- CAMPAIGN: one run from L1, upgrades carry forward (the real experience) ---');
const camp=SG.campaign(CAP);
let campCleared=0, campStall=null;
for(const c of camp){ const pass=c.result==='win';
  if(pass) campCleared++; else if(!campStall) campStall=c.level;
  console.log(`${pass?'PASS':'FAIL'}  L${c.level} result=${c.result} frames=${c.frames} (~${(c.frames/60).toFixed(0)}s) powerLv=${c.powerLv} hpLeft=${c.hpLeft}`); }
const campFull=campCleared===n;
if(!campFull) ok=false;
console.log(`campaign cleared ${campCleared}/${n}${campStall?` (stalled at L${campStall})`:''}`);

console.log('--- render smoke ---');
function smoke(label, i, steps){ SG._begin(i); SG._step(steps); const d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  ${label}: ${d}`); if(d!=='ok')ok=false; }
smoke('early L1', 0, 200);
smoke('mid L'+n, n-1, 400);
SG.sim(0,CAP); { const d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  post-sim render: ${d}`); if(d!=='ok')ok=false; }

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED');
process.exit(ok?0:1);
