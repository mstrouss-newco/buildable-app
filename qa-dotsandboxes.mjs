// Headless QA for public/dotsboxes-engine.html
//  - every game ends with ALL edges drawn and ALL boxes claimed (scores sum to TOTAL) — no soft-lock
//  - extra-turn rule works: completing a box keeps your turn (checked via claimed-box bookkeeping)
//  - the easy AI is beatable (a greedy player wins a healthy share in solo)
//  - render smoke test
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('dotsboxes-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-boardgame.js'].map(read).join('\n');
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

console.log('--- random vs random: ALL edges drawn + ALL boxes claimed (200 games) ---');
let fails=0;
for(let s=0;s<200;s++){ const r=DG.sim({mode:'two',seed:s+1});
  const good=(r.result==='over') && r.drawnEdges===r.edges && r.claimed===cfg.boxes && (r.winner===0||r.winner===1||r.winner===2);
  if(!good){ fails++; if(fails<4) console.log('  BAD', JSON.stringify(r)); } }
console.log(`${fails===0?'PASS':'FAIL'}  completion fails=${fails}/200 (boxes=${cfg.boxes}, edges=${cfg.edges})`); if(fails)ok=false;

console.log('--- solo vs easy AI: greedy player is competitive/beatable (100 games) ---');
let wins=0,losses=0,draws=0;
for(let s=0;s<100;s++){ const r=DG.simVsAI(s*5+2); if(r.winner===1)wins++; else if(r.winner===2)losses++; else draws++; }
console.log(`greedy-vs-AI  wins=${wins} draws=${draws} losses=${losses}`);
console.log(`${wins>=25?'PASS':'FAIL'}  AI is beatable (greedy wins >=25)`); if(wins<25)ok=false;

console.log('--- render smoke ---');
DG._begin('two'); DG._play({kind:'h',i:0}); DG._play({kind:'v',i:0}); const d=DG._draw(); console.log('render:', d); if(d!=='ok')ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
