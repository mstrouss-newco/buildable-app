// Headless QA for public/sling-squad.html — MANIFEST-DRIVEN (Session 5B).
// Mirrors qa-survival.mjs: it validates /sling/manifest.json, turns it into the
// engine config via the shared shell loader, applies it through the engine's real
// _applyManifest hook, then proves a sensible-aim bot clears EVERY MANIFEST level
// (with slings to spare). Same path the browser takes, so a green run means the
// manifest is valid AND its levels are beatable. Plus a render smoke test.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('sling-squad.html');
// shared libs + the vendored physics engine, loaded into the sandbox like the browser would.
// (buildable-hud.js is intentionally NOT loaded: with BuildableHUD undefined the engine's
//  HUD() returns a no-op, exactly like the browser would degrade — keeps QA headless-clean.)
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js',
            'buildable-startscreen.js','buildable-gamenav.js','buildable-viewport.js','matter.min.js'].map(read).join('\n');
const manifestLib=read('buildable-manifest.js');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:960,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:960, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:960,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const localStorageStub={ getItem:()=>null, setItem:noop, removeItem:noop };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop,
  localStorage:localStorageStub, fetch:()=>Promise.reject(new Error('no-net')).catch(()=>{}),
  performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);

// --- 1) shell loader: validate the manifest + build the engine config ---
vm.runInContext(manifestLib, sandbox, {filename:'buildable-manifest'});
const BM=sandbox.BuildableManifest;
if(!BM||!BM.validate){ console.error('FAIL: BuildableManifest not exposed'); process.exit(2); }
const manifest=JSON.parse(fs.readFileSync(dir+'/public/sling/manifest.json','utf8'));
const v=BM.validate(manifest);
console.log('--- MANIFEST: validate /sling/manifest.json ---');
console.log(`${v.ok?'PASS':'FAIL'}  ok=${v.ok} errors=${JSON.stringify(v.errors)} warnings=${JSON.stringify(v.warnings)}`);
if(!v.ok){ console.error('MANIFEST INVALID — aborting'); process.exit(2); }
const engCfg=BM.toEngineConfig(manifest);
console.log('manifest -> engine levels:', engCfg.levels.map(l=>`${l.name}[d${l.difficulty} slings${l.launches} blk${l.blocks.length} tgt${l.targets.length}]`).join(', '));

// --- 2) load the engine (built-in GAME_CONFIG is the fallback), then apply manifest ---
vm.runInContext(libs+'\n'+engine, sandbox, {filename:'sling-squad'});
const SG=sandbox.BUILDABLE_GAME; let ok=true;
if(!SG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.SLING_GAME!==SG){ console.error('FAIL: SLING_GAME alias missing'); process.exit(2); }
console.log('PASS  BUILDABLE_GAME + SLING_GAME alias present');
if(typeof SG._cfg!=='function' || typeof SG._applyManifest!=='function'){ console.error('FAIL: 5B hooks _cfg/_applyManifest missing'); process.exit(2); }
console.log('calibrated EFF_G =', SG.effG().toFixed(4));
SG._applyManifest(engCfg, manifest);
const cfg=SG._cfg();
const n=cfg.levels.length;
console.log(`--- APPLIED: engine now runs the manifest levels (${n} of ${manifest.levels.length}) ---`);
const namesMatch = cfg.levels.every((l,i)=>l.name===manifest.levels[i].name);
console.log(`${(n===manifest.levels.length&&namesMatch)?'PASS':'FAIL'}  count=${n} namesMatch=${namesMatch} :: ${cfg.levels.map(l=>l.name).join(', ')}`);
if(n!==manifest.levels.length || !namesMatch) ok=false;

// --- 3) a sensible-aim bot clears every manifest level (5 runs each), slings to spare ---
console.log('--- BOT clears every manifest level (5 runs each) ---');
for(let i=0;i<n;i++){ let win=true, worstUsed=0, worstFrames=0;
  for(let t=0;t<5;t++){ const r=SG.sim(i,20000);
    if(r.result!=='win'){ win=false; console.log(`   run${t} L${i+1} -> ${r.result} popped ${r.popped}/${r.targets} used ${r.launchesUsed}`); }
    worstUsed=Math.max(worstUsed,r.launchesUsed); worstFrames=Math.max(worstFrames,r.frames); }
  const lv=cfg.levels[i]; const spare=lv.launches-worstUsed;
  if(!win||spare<0) ok=false;
  console.log(`${(win&&spare>=0)?'PASS':'FAIL'}  L${i+1} ${lv.name.padEnd(15)} winAll5=${win} worstUsed=${worstUsed}/${lv.launches} spare=${spare} worst=${worstFrames}f`); }

console.log('--- a clean run earns stars ---');
const s=SG.sim(0,20000); console.log(`stars(L1)=${s.stars}`);

console.log('--- render smoke ---');
SG._begin(Math.min(2,n-1)); SG._step(40); let d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  mid render: ${d}`); if(d!=='ok')ok=false;
SG._aimHeld(120,460); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  aim render: ${d}`); if(d!=='ok')ok=false;
SG.sim(0,20000); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  win render: ${d}`); if(d!=='ok')ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
