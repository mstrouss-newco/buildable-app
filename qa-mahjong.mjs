// Headless QA for public/mahjong-engine.html.
// Proves: every difficulty x set generates a SOLVABLE board (guaranteed-solution replay
// clears it with zero illegal moves), the "never stuck" greedy+mix player also clears,
// and a render call returns "ok".
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('mahjong-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'mahjong'});
const G=sandbox.MAHJONG_GAME; if(!G){ console.error('FAIL: MAHJONG_GAME not exposed'); process.exit(2); }
if(sandbox.BUILDABLE_GAME!==G){ console.error('FAIL: BUILDABLE_GAME alias missing'); process.exit(2); }

let ok=true;
console.log('--- every difficulty x set: solvable + never-stuck (5 fresh boards each) ---');
const cfg=G._cfg();
cfg.levels.forEach((lv,li)=>{ cfg.sets.forEach((st,si)=>{
  let pass=true, tiles=0, worstMix=0;
  for(let t=0;t<5;t++){
    const r=G.sim({lvlIdx:li,setIdx:si}); tiles=r.tiles;
    if(!r.cleared||r.illegal!==0) pass=false;
    const gr=G.simGreedy({lvlIdx:li,setIdx:si});
    if(!gr.cleared) pass=false; worstMix=Math.max(worstMix,gr.mixes);
  }
  if(!pass) ok=false;
  console.log(`${pass?'PASS':'FAIL'}  ${lv.name.padEnd(7)} ${st.name.padEnd(8)} tiles=${String(tiles).padStart(3)} worstMix=${worstMix}`);
}); });

console.log('--- render smoke ---');
G.begin({lvlIdx:2,setIdx:0}); const d=G._draw(); console.log('render:',d, 'remaining=',G._remaining()); if(d!=='ok') ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
