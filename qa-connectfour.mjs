// Headless QA for public/connectfour-engine.html
//  - random vs random ALWAYS terminates with a valid result (no soft-lock)
//  - a smart player beats the easy AI a healthy share (beatable) and rarely loses
//  - gravity invariant: a disc only ever rests on the floor or another disc
//  - render smoke test
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('connectfour-engine.html');
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
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'connectfour'});
const CG=sandbox.BUILDABLE_GAME; if(!CG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.CONNECTFOUR_GAME!==CG){ console.error('FAIL: CONNECTFOUR_GAME alias missing'); process.exit(2); }
const COLS=7, ROWS=6; let ok=true;

console.log('--- random vs random: always terminates + valid (200 games) ---');
let fails=0;
for(let s=0;s<200;s++){ const r=CG.sim({mode:'two',seed:s+1}); const valid=(r.result==='over')&&(r.winner===0||r.winner===1||r.winner===2)&&(r.winner!==0||r.full); if(!valid){fails++; if(fails<4)console.log('  BAD',JSON.stringify(r));} }
console.log(`${fails===0?'PASS':'FAIL'}  fails=${fails}/200`); if(fails)ok=false;

console.log('--- gravity invariant: no floating discs (50 games) ---');
let floats=0;
for(let s=0;s<50;s++){ CG.sim({mode:'two',seed:s+500}); const G=CG._G(); const cells=G.cells;
  for(let c=0;c<COLS;c++) for(let r=0;r<ROWS-1;r++){ if(cells[r*COLS+c] && !cells[(r+1)*COLS+c]) floats++; } }
console.log(`${floats===0?'PASS':'FAIL'}  floating discs=${floats}`); if(floats)ok=false;

console.log('--- smart player vs easy AI: beatable + rarely loses (100 games) ---');
let wins=0,losses=0,draws=0;
for(let s=0;s<100;s++){ const r=CG.simVsAI(s*7+3); if(r.winner===1)wins++; else if(r.winner===2)losses++; else draws++; }
console.log(`smart-vs-AI  wins=${wins} draws=${draws} losses=${losses}`);
console.log(`${wins>=50?'PASS':'FAIL'}  AI is beatable (smart wins >=50)`); if(wins<50)ok=false;
console.log(`${losses<=25?'PASS':'WARN'}  smart player rarely loses (<=25)`); 

console.log('--- render smoke ---');
CG._begin('two'); CG._play(3); CG._play(3); CG._play(4); const d=CG._draw(); console.log('render:', d); if(d!=='ok')ok=false;

console.log('--- MANIFEST (Session 7B): /connectfour/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/connectfour/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log(`${mv.ok?'PASS':'FAIL'}  manifest validates  errors=${JSON.stringify(mv.errors)}`); if(!mv.ok)ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{tiers:[],worlds:[]};
console.log(`${manifest.category==='Classic'?'PASS':'FAIL'}  category is Classic`); if(manifest.category!=='Classic')ok=false;
const tunes=['easy','medium','hard'];
const tiersOk = mcfg.tiers.length===3 && mcfg.tiers.every(t=>tunes.includes(t.bot));
console.log(`${tiersOk?'PASS':'FAIL'}  3 tiers map to real AI levels  ::  ${mcfg.tiers.map(t=>t.name+'->'+t.bot).join(', ')}`); if(!tiersOk)ok=false;
const worldsOk = mcfg.worlds.length===6 && mcfg.worlds.every(w=>w.price===0);
console.log(`${worldsOk?'PASS':'FAIL'}  6 free worlds in loadout  ::  ${mcfg.worlds.map(w=>w.key).join(',')}`); if(!worldsOk)ok=false;
console.log(`${mcfg.multiplayer==='off'?'PASS':'FAIL'}  multiplayer off (hot-seat only, honest)`); if(mcfg.multiplayer!=='off')ok=false;
// engine exposes the tiers as start-screen choices, and honours applyManifestTiers via the shell preload
const choicesOk = Array.isArray(CG._choices()) && CG._choices().length===3;
console.log(`${choicesOk?'PASS':'FAIL'}  engine exposes 3 start-screen choices  ::  ${JSON.stringify(CG._choices().map(c=>c.value))}`); if(!choicesOk)ok=false;

console.log('--- per-tier: each level plays cleanly; easy clearly beatable; no unbeatable tier ---');
for(const lvl of ['easy','medium','hard']){
  CG.setLevel(lvl); let w=0,l=0,d=0,bad=0;
  for(let s=0;s<80;s++){ const r=CG.simVsAI(s*13+1); if(!(r.result==='over'))bad++; if(r.winner===1)w++; else if(r.winner===2)l++; else d++; }
  const clean=bad===0;
  const winnable = w>=1;                      // a smart player can still win at every tier (no unbeatable lose state)
  const easyBeatable = lvl!=='easy' || w>=48; // easy: smart wins the clear majority
  const pass = clean && winnable && easyBeatable;
  console.log(`${pass?'PASS':'FAIL'}  tier ${lvl}: smart wins=${w} draws=${d} losses=${l} (clean=${clean})`); if(!pass)ok=false;
}

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
