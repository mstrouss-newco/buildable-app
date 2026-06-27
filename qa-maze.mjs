// Headless QA for public/maze-engine.html — a perfect-player BFS bot must clear
// EVERY maze (always-winnable), plus a render smoke test. Mirrors qa-breaker.mjs.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('maze-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function elx(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, querySelectorAll:()=>[], onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
// 'start' host lacks appendChild => BS.mount uses its headless stub (no DOM needed)
const documentStub={ getElementById:(id)=> id==='start'? elx(false): elx(true), querySelector:()=>elx(true), querySelectorAll:()=>[], addEventListener:noop, createElement:()=>elx(true), head:elx(true), documentElement:elx(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'maze'});
const MZ=sandbox.MAZE_GAME; if(!MZ){ console.error('FAIL: MAZE_GAME not exposed'); process.exit(2); }
if(sandbox.BUILDABLE_GAME!==MZ){ console.error('FAIL: BUILDABLE_GAME alias missing'); process.exit(2); }
const cfg=MZ._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- a perfect player clears every maze (3 runs each) ---');
for(let i=0;i<n;i++){ let win=true, worst=0, lostMin=99;
  for(let t=0;t<3;t++){ const r=MZ.sim(i,60000); if(r.result!=='win')win=false; worst=Math.max(worst,r.frames); lostMin=Math.min(lostMin,r.lives); }
  if(!win)ok=false;
  console.log(`${win?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} winAll3=${win} worst=${worst}f (~${(worst/60).toFixed(0)}s) minLivesLeft=${lostMin}`);
}
console.log('--- full campaign (one run, all worlds) ---');
const camp=MZ.campaign(60000); const campOk=camp.length===n && camp.every(r=>r.result==='win'); if(!campOk)ok=false;
console.log(`${campOk?'PASS':'FAIL'}  campaign cleared ${camp.filter(r=>r.result==='win').length}/${n}`);
console.log('--- render smoke ---');
MZ._begin(0); MZ._step(120); const d0=MZ._draw(); console.log('mid-play render:', d0); if(d0!=='ok')ok=false;
const wr=MZ.sim(0,60000); MZ._draw(); const dw=MZ._draw(); console.log('post-win render:', dw); if(dw!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
