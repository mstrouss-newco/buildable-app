// Headless QA for public/memory-engine.html — every difficulty x player-count is clearable
// (a perfect-memory bot always wins) + render smoke. Run: node qa-memory.mjs .
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('memory-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-turns.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:720,height:1040}:(typeof k==='string'?noop:undefined))});
function el(withCtx){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, clientWidth:720, clientHeight:1040, width:720, height:1040, getBoundingClientRect:()=>({left:0,top:0,width:720,height:1040}), appendChild:noop, removeChild:noop }; Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); return e; }
class ImageStub{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;}get src(){return this._src;}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, fetch:undefined, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'memory'});
const G=sandbox.BUILDABLE_GAME; if(!G){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.MEMORY_GAME!==G){ console.error('FAIL: MEMORY_GAME alias missing'); process.exit(2); }
let ok=true;
console.log('--- menu-state render (match null, before any game) ---');
{ const dm=G._draw(); if(dm!=='ok'){ok=false;} console.log(`${dm==='ok'?'PASS':'FAIL'}  menu render=${dm}`); }
console.log('--- every size x player-count clears (perfect bot, 6 runs each) ---');
const counts=[{solo:true,players:1,lbl:'solo'},{players:2,lbl:'2p'},{players:3,lbl:'3p'},{players:4,lbl:'4p'}];
const cfg=G._cfg();
for(const pc of counts){ for(let si=0;si<cfg.sizes.length;si++){ let win=true,mv=0;
  for(let t=0;t<6;t++){ const r=G.sim(Object.assign({sizeIdx:si,themeIdx:t%6},pc)); if(r.result!=='win'||!r.cleared) win=false; mv=Math.max(mv,r.moves); }
  if(!win) ok=false; console.log(`${win?'PASS':'FAIL'}  ${pc.lbl} ${cfg.sizes[si].name.padEnd(7)} clears=${win} worstMoves=${mv}`); } }
console.log('--- campaign sweep ---');
const camp=G.campaign(); const allWin=camp.every(c=>c.result==='win'&&c.cleared); if(!allWin)ok=false;
console.log(`${allWin?'PASS':'FAIL'}  campaign ${camp.length} combos all win=${allWin}`);
console.log('--- render smoke (back, mid, win) ---');
G.begin({players:2,sizeIdx:1,themeIdx:0}); const d0=G._draw(); console.log('fresh board render:',d0);
G.flip(0); G._step(20); const d1=G._draw(); console.log('flipped render:',d1);
G.sim({players:2,sizeIdx:0,themeIdx:2}); const d2=G._draw(); console.log('win render:',d2);
if(d0!=='ok'||d1!=='ok'||d2!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
