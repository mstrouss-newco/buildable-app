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

// --- 3b) SD1: blocks made of something, with health that actually runs out ---
// Three things have to hold, or the phase's whole point is gone:
//   * levels 1-6 must carry NO material at all (the easy on-ramp is untouched)
//   * glass / wood / stone must behave differently under the same hit
//   * a tower must sit still and whole until something hits it
console.log('--- SD1: block materials + health ---');
const onramp = cfg.levels.slice(0,6).every(l=>l.blocks.every(b=>!b.m));
console.log(`${onramp?'PASS':'FAIL'}  levels 1-6 carry no material (on-ramp unchanged)`);
if(!onramp) ok=false;
const backHalf = cfg.levels.slice(6).filter(l=>l.blocks.some(b=>b.m)).length;
console.log(`${backHalf===cfg.levels.length-6?'PASS':'FAIL'}  every level 7-${cfg.levels.length} has breakable blocks (${backHalf}/${cfg.levels.length-6})`);
if(backHalf!==cfg.levels.length-6) ok=false;

// the trio layout is one post of each material, side by side — the clean test bench
const trio = cfg.levels.findIndex(l=>l.blocks.length===3 && l.blocks[0].m==='glass' && l.blocks[1].m==='wood' && l.blocks[2].m==='stone');
if(trio<0){ console.log('FAIL  no glass/wood/stone test layout found'); ok=false; }
else{
  const hitsToBreak=(i,spd)=>{ SG._begin(trio); for(let h=1;h<=40;h++){ const r=SG._hitBlock(i,spd,1); if(r.broken) return h; } return Infinity; };
  const soft=(i)=>{ SG._begin(trio); return SG._hitBlock(i,4,1); };
  const gGood=hitsToBreak(0,18), wGood=hitsToBreak(1,18), sGood=hitsToBreak(2,18);
  const gSoft=soft(0), wSoft=soft(1), sSoft=soft(2);
  // glass: gone on almost any hit, even a gentle one
  const glassOk = gGood===1 && gSoft.broken;
  console.log(`${glassOk?'PASS':'FAIL'}  glass shatters on almost any hit (good hit: ${gGood}, soft tap breaks it: ${gSoft.broken})`);
  // wood: cracks first, then breaks after a few good hits
  SG._begin(trio); const wFirst=SG._hitBlock(1,18,1);
  const woodOk = wGood>=2 && wGood<=5 && wFirst.cracked && !wFirst.broken && !wSoft.broken;
  console.log(`${woodOk?'PASS':'FAIL'}  wood cracks then breaks after a few good hits (cracked on hit 1: ${wFirst.cracked}, broke on hit ${wGood}, survives a soft tap: ${!wSoft.broken})`);
  // stone: has to be toppled, not smashed
  const stoneOk = sGood>12 && !sSoft.broken;
  console.log(`${stoneOk?'PASS':'FAIL'}  stone barely breaks — topple it instead (good hits needed: ${sGood===Infinity?'>40':sGood})`);
  if(!(glassOk&&woodOk&&stoneOk)) ok=false;
}
// nothing may fall apart on its own before the kid has taken a shot
let selfDamaged=[];
for(let i=0;i<n;i++){ SG._begin(i); SG._step(300);
  const bl=SG._blocks(); if(SG.dbg().smashed>0 || bl.some(b=>b.cracked)) selfDamaged.push(cfg.levels[i].name); }
console.log(`${selfDamaged.length===0?'PASS':'FAIL'}  every tower sits whole until it is hit${selfDamaged.length?' :: '+selfDamaged.join(', '):''}`);
if(selfDamaged.length) ok=false;
// and blocks really do get smashed during ordinary play
let smashedSomewhere=0;
for(let i=6;i<n;i++){ SG.sim(i,20000); if(SG._smashed()>0) smashedSomewhere++; }
console.log(`${smashedSomewhere>0?'PASS':'FAIL'}  blocks actually smash in real play (${smashedSomewhere}/${n-6} back-half levels)`);
if(!smashedSomewhere) ok=false;

console.log('--- a clean run earns stars ---');
const s=SG.sim(0,20000); console.log(`stars(L1)=${s.stars}`);

console.log('--- render smoke ---');
SG._begin(Math.min(2,n-1)); SG._step(40); let d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  mid render: ${d}`); if(d!=='ok')ok=false;
SG._aimHeld(120,460); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  aim render: ${d}`); if(d!=='ok')ok=false;
SG.sim(0,20000); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  win render: ${d}`); if(d!=='ok')ok=false;
// SD1 visuals: the cracked look and the shatter poof both have to paint. Crack a
// wood post without killing it, shatter the glass one, then draw the same frame.
if(trio>=0){ SG._begin(trio); SG._hitBlock(1,18,1); SG._hitBlock(0,18,1); SG._step(2);
  d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  cracked + shatter render: ${d}`); if(d!=='ok')ok=false; }

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
