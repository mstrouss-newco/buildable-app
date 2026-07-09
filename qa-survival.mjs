// Headless QA for public/survival-engine.html — MANIFEST-DRIVEN (Session 5A).
// Mirrors qa-breaker.mjs: it validates /survival/manifest.json, turns it into the
// engine config via the shared shell loader, applies it through the engine's real
// _applyManifest hook, and proves every MANIFEST level is winnable. This is the
// same path the browser takes, so a green run means the manifest is valid AND the
// manifest levels are beatable.
//
// Survival is a roguelite: hero upgrades carry forward level-to-level, so we test
// two ways and report both:
//   1) ISOLATED  — each level from base stats (SG.sim, carry=false): raw difficulty.
//   2) CAMPAIGN  — one run from L1 carrying upgrades forward (SG.campaign): the real
//      player experience; a stall here is a genuine winnability gap.
// Plus a render smoke test.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('survival-engine.html');
const libs=['buildable-renders.js','buildable-worlds.js','buildable-audio.js',
            'buildable-mechanics.js','buildable-startscreen.js','buildable-levelthumb.js'].map(read).join('\n');
const manifestLib=read('buildable-manifest.js');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
// Return null for #start so the engine's DOM menu init (wireMenus/showMenu/loadChar) is
// SKIPPED — headless drives levels directly through the game handle.
const documentStub={ getElementById:(id)=> id==='start'? null : el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const localStorageStub={ getItem:()=>null, setItem:noop, removeItem:noop };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop,
  localStorage:localStorageStub, fetch:()=>Promise.reject(new Error('no-net')).catch(()=>{}),
  performance:{now:()=>Date.now()}, URLSearchParams, location:{search:''}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);

// --- 1) shell loader: validate the manifest + build the engine config ---
vm.runInContext(manifestLib, sandbox, {filename:'buildable-manifest'});
const BM=sandbox.BuildableManifest;
if(!BM||!BM.validate){ console.error('FAIL: BuildableManifest not exposed'); process.exit(2); }
const manifest=JSON.parse(fs.readFileSync(dir+'/public/survival/manifest.json','utf8'));
const v=BM.validate(manifest);
console.log('--- MANIFEST: validate /survival/manifest.json ---');
console.log(`${v.ok?'PASS':'FAIL'}  ok=${v.ok} errors=${JSON.stringify(v.errors)} warnings=${JSON.stringify(v.warnings)}`);
if(!v.ok){ console.error('MANIFEST INVALID — aborting'); process.exit(2); }
const engCfg=BM.toEngineConfig(manifest);
console.log('manifest -> engine levels:', engCfg.levels.map(l=>`${l.name}[d${l.difficulty} dur${l.dur} eHp${l.eHp} boss${l.boss.hp}]`).join(', '));

// --- 2) load the engine (built-in GAME_CONFIG is the fallback), then apply manifest ---
vm.runInContext(libs+'\n'+engine, sandbox, {filename:'survival-engine'});
const SG=sandbox.BUILDABLE_GAME || sandbox.SURV_GAME;
let ok=true;
if(!SG){ console.error('FAIL: game handle (BUILDABLE_GAME/SURV_GAME) not exposed'); process.exit(2); }
console.log(sandbox.BUILDABLE_GAME ? 'PASS  BUILDABLE_GAME alias present (5A normalized)' : 'note: only SURV_GAME present');
if(!sandbox.BUILDABLE_GAME) ok=false;
if(typeof SG._cfg!=='function' || typeof SG._applyManifest!=='function'){ console.error('FAIL: 5A hooks _cfg/_applyManifest missing'); process.exit(2); }
SG._applyManifest(engCfg, manifest);
const cfg=SG._cfg();
const n=cfg.levels.length;
console.log(`--- APPLIED: engine now runs the manifest levels (${n} of ${manifest.levels.length}) ---`);
const namesMatch = cfg.levels.every((l,i)=>l.name===manifest.levels[i].name);
console.log(`${(n===manifest.levels.length&&namesMatch)?'PASS':'FAIL'}  count=${n} namesMatch=${namesMatch} :: ${cfg.levels.map(l=>l.name).join(', ')}`);
if(n!==manifest.levels.length || !namesMatch) ok=false;

const RUNS=5, CAP=12000;   // CAP ~200s @60fps — past the longest level (52s + boss)

console.log('--- ISOLATED: each manifest level from base stats, '+RUNS+' runs each ---');
for(let i=0;i<n;i++){ let winAll=true, worstF=0, wins=0, worstHp=99;
  for(let t=0;t<RUNS;t++){ const r=SG.sim(i,CAP);
    if(r.result==='win'){ wins++; } else { winAll=false; }
    worstF=Math.max(worstF,r.frames); worstHp=Math.min(worstHp,r.hpLeft); }
  if(!winAll){ ok=false; }
  console.log(`${winAll?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(15)} wins=${wins}/${RUNS} worst=${worstF}f (~${(worstF/60).toFixed(0)}s) minHpLeft=${worstHp}`); }

console.log('--- CAMPAIGN: one run from L1, upgrades carry forward (the real experience) ---');
const camp=SG.campaign(CAP);
let campCleared=0, campStall=null;
for(const cc of camp){ const pass=cc.result==='win';
  if(pass) campCleared++; else if(!campStall) campStall=cc.level;
  console.log(`${pass?'PASS':'FAIL'}  L${cc.level} result=${cc.result} frames=${cc.frames} (~${(cc.frames/60).toFixed(0)}s) powerLv=${cc.powerLv} hpLeft=${cc.hpLeft}`); }
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
