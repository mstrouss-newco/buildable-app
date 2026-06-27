// Headless QA for public/breaker-engine.html — solo (all levels win) + pong (a winner emerges) + render smoke.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('breaker-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
// "start" host lacks appendChild → BS.mount uses its headless stub (no DOM needed)
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'breaker'});
const BK=sandbox.BUILDABLE_GAME; if(!BK){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.BREAKER_GAME!==BK){ console.error('FAIL: BREAKER_GAME alias missing'); process.exit(2); }
const cfg=BK._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- SOLO: every level clears (5 runs each) ---');
for(let i=0;i<n;i++){ let win=true,maxF=0; for(let t=0;t<5;t++){ const r=BK.sim(i,60000); if(r.result!=='win')win=false; maxF=Math.max(maxF,r.frames); } if(!win)ok=false; console.log(`${win?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(15)} winAll5=${win} worst=${maxF}f (~${(maxF/60).toFixed(0)}s)`); }
console.log('--- stars: a clean run earns 3 ---');
const s=BK.sim(0,40000); console.log(`stars(L1)=${s.stars} livesLeft=${s.livesLeft}`);
console.log('--- PONG: a winner emerges (3 runs) ---');
for(let t=0;t<3;t++){ const p=BK.simPong(80000); const good=p.result==='win'&&p.winner>0; if(!good)ok=false; console.log(`${good?'PASS':'FAIL'}  pong winner=P${p.winner} score=${p.s1}-${p.s2} frames=${p.frames}`); }
console.log('--- render smoke (both modes) ---');
BK.sim(0,40000); const dw=BK._draw(); console.log('solo WIN render:',dw); BK._begin(5); BK._step(150); const d1=BK._draw(); console.log('solo render:',d1); if(dw!=='ok')ok=false;
BK._beginPong(); BK._step(150); const d2=BK._draw(); console.log('pong render:',d2);
if(d1!=='ok'||d2!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
