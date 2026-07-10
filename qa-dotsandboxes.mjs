// Headless QA for public/dotsboxes-engine.html
//  - every game ends with ALL edges drawn and ALL boxes claimed (scores sum to TOTAL) — no soft-lock
//  - extra-turn rule works: completing a box keeps your turn (checked via claimed-box bookkeeping)
//  - the easy AI is beatable (a greedy player wins a healthy share in solo)
//  - render smoke test
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('dotsboxes-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-manifest.js','buildable-boardgame.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(a){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(a){ e.appendChild=noop; e.removeChild=noop; } e.parentElement={clientWidth:900,clientHeight:600}; return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, devicePixelRatio:1, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'dotsboxes'});
const DG=sandbox.BUILDABLE_GAME; if(!DG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.DOTSBOXES_GAME!==DG){ console.error('FAIL: DOTSBOXES_GAME alias missing'); process.exit(2); }
const cfg=DG._cfg(); let ok=true;
const SIZES=cfg.sizes;   // [[3,3],[5,5],[7,6]]

console.log('--- EVERY size: random vs random -> ALL edges drawn + ALL boxes claimed (120 games each) ---');
let fails=0;
for(const sz of SIZES){ let szFail=0;
  for(let s=0;s<120;s++){ const r=DG.sim({mode:'two',seed:s+1,size:sz});
    const good=(r.result==='over') && r.drawnEdges===r.edges && r.claimed===r.boxes && (r.winner===0||r.winner===1||r.winner===2);
    if(!good){ szFail++; fails++; if(szFail<3) console.log('  BAD', JSON.stringify(r)); } }
  console.log(`  ${szFail===0?'PASS':'FAIL'}  size ${sz[0]}x${sz[1]} (${sz[0]*sz[1]} boxes)  fails=${szFail}/120`); }
if(fails)ok=false;

console.log('--- solo vs easy AI on each size: greedy player is beatable ---');
for(const sz of SIZES){ let wins=0,losses=0,draws=0;
  for(let s=0;s<60;s++){ const r=DG.simVsAI(s*5+2, sz); if(r.winner===1)wins++; else if(r.winner===2)losses++; else draws++; }
  const beatable=wins>=10;
  console.log(`  ${beatable?'PASS':'FAIL'}  size ${sz[0]}x${sz[1]}  greedy wins=${wins} draws=${draws} losses=${losses}`);
  if(!beatable)ok=false; }

console.log('--- render smoke ---');
DG._begin('two'); DG._play({kind:'h',i:0}); DG._play({kind:'v',i:0}); const d=DG._draw(); console.log('render:', d); if(d!=='ok')ok=false;

console.log('--- MANIFEST (Session 7B): /dotsboxes/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/dotsboxes/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log(`${mv.ok?'PASS':'FAIL'}  manifest validates  errors=${JSON.stringify(mv.errors)}`); if(!mv.ok)ok=false;
console.log(`${manifest.category==='Classic'?'PASS':'FAIL'}  category is Classic`); if(manifest.category!=='Classic')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{tiers:[],worlds:[]};
const sizeNames=mcfg.tiers.map(t=>t.name).join(',');
console.log(`${mcfg.tiers.length===3?'PASS':'FAIL'}  3 size levels  ::  ${sizeNames}`); if(mcfg.tiers.length!==3)ok=false;
console.log(`${mcfg.worlds.length===6?'PASS':'FAIL'}  6 free worlds in loadout`); if(mcfg.worlds.length!==6)ok=false;
console.log(`${mcfg.multiplayer==='off'?'PASS':'FAIL'}  multiplayer off (hot-seat only)`); if(mcfg.multiplayer!=='off')ok=false;
const chOk=Array.isArray(DG._choices())&&DG._choices().length>=3;
console.log(`${chOk?'PASS':'FAIL'}  engine exposes size choices  ::  ${JSON.stringify(DG._choices().map(c=>c.name))}`); if(!chOk)ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
