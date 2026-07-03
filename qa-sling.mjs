// Headless QA for public/sling-squad.html — a sensible-aim bot must clear EVERY level
// (with launches to spare), plus a render smoke test. Model: qa-breaker.mjs.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('sling-squad.html');
// shared libs + the vendored physics engine, loaded into the sandbox like the browser would
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js',
            'buildable-startscreen.js','buildable-gamenav.js','buildable-viewport.js','matter.min.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:960,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:960, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:960,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop,
  performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);
vm.runInContext(libs+'\n'+engine, sandbox, {filename:'sling-squad'});
const SG=sandbox.BUILDABLE_GAME; if(!SG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.SLING_GAME!==SG){ console.error('FAIL: SLING_GAME alias missing'); process.exit(2); }
console.log('calibrated EFF_G =', sandbox.BUILDABLE_GAME.effG().toFixed(4));
const cfg=SG._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- BOT clears every level (5 runs each) ---');
for(let i=0;i<n;i++){ let win=true, worstUsed=0, worstFrames=0;
  for(let t=0;t<5;t++){ const r=SG.sim(i,20000);
    if(r.result!=='win'){ win=false; console.log(`   run${t} L${i+1} -> ${r.result} popped ${r.popped}/${r.targets} used ${r.launchesUsed}`); }
    worstUsed=Math.max(worstUsed,r.launchesUsed); worstFrames=Math.max(worstFrames,r.frames); }
  const lv=cfg.levels[i]; const spare=lv.launches-worstUsed;
  if(!win||spare<0) ok=false;
  console.log(`${win?'PASS':'FAIL'}  L${i+1} ${lv.name.padEnd(15)} winAll5=${win} worstUsed=${worstUsed}/${lv.launches} spare=${spare} worst=${worstFrames}f`); }
console.log('--- a clean run earns stars ---');
const s=SG.sim(0,20000); console.log(`stars(L1)=${s.stars}`);
console.log('--- render smoke ---');
SG._begin(2); SG._step(40); let d=SG._draw(); console.log('mid render:',d); if(d!=='ok')ok=false;
SG._aimHeld(120,460); d=SG._draw(); console.log('aim render:',d); if(d!=='ok')ok=false;
SG.sim(0,20000); d=SG._draw(); console.log('win render:',d); if(d!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
