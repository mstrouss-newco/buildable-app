// Headless QA for public/runner-engine.html — every town clears UNTOUCHED + render smoke.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('runner-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:540,height:820}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:540, height:820, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:540,height:820}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'runner'});
const RK=sandbox.BUILDABLE_GAME; if(!RK){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.RUNNER_GAME!==RK){ console.error('FAIL: RUNNER_GAME alias missing'); process.exit(2); }
const cfg=RK._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- every town clears, perfect driver takes 0 hits (5 runs each) ---');
for(let i=0;i<n;i++){ let win=true, perfect=true, maxF=0;
  for(let t=0;t<5;t++){ const r=RK.sim(i,60000); if(r.result!=='win')win=false; if(r.hurts>0)perfect=false; maxF=Math.max(maxF,r.frames); }
  if(!win||!perfect)ok=false;
  console.log(`${(win&&perfect)?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(16)} winAll5=${win} noHits=${perfect} worst=${maxF}f (~${(maxF/60).toFixed(0)}s)`); }
console.log('--- stars: a clean run earns 3 ---');
const s=RK.sim(0,60000); console.log(`stars(L1)=${s.stars} heartsLeft=${s.heartsLeft} treats=${s.treats}`); if(s.stars!==3)ok=false;
console.log('--- full campaign (all towns back to back) ---');
const camp=RK.campaign(60000); const allWin=camp.every(c=>c.result==='win')&&camp.length===n; if(!allWin)ok=false;
console.log(`${allWin?'PASS':'FAIL'}  campaign ${camp.map(c=>'L'+c.level+':'+c.result).join(' ')}`);
console.log('--- render smoke ---');
RK.sim(0,60000); const dw=RK._draw(); console.log('win render:',dw);
RK._begin(4); RK._step(300); const d1=RK._draw(); console.log('mid render:',d1);
if(dw!=='ok'||d1!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
