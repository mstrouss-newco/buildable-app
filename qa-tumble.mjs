// Headless QA for public/tumble-engine.html (Tumble Blocks).
// A perfect El-Tetris bot must clear EVERY world's goal (adventure), Calm/endless
// must survive a long run without throwing (you can never lose), + render smoke.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('tumble-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-wincard.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>{ if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:noop}); if(k==='measureText') return (t)=>({width:(String(t||'').length*8)}); if(k==='canvas') return {width:600,height:820}; return (typeof k==='string')?noop:undefined; }});
const dropL={};
function el(withAppend,id){ const e={ style:{setProperty:noop,display:''}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:(t,fn)=>{ if(id==='bDrop'){ (dropL[t]=dropL[t]||[]).push(fn); } }, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:600, height:820, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:600,height:820}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
// "start" host lacks appendChild → BS.mount uses its headless stub
const documentStub={ getElementById:(id)=> id==='start'? el(false,id): el(true,id), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'tumble'});
const G=sandbox.BUILDABLE_GAME; if(!G){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.TUMBLE_GAME!==G){ console.error('FAIL: TUMBLE_GAME alias missing'); process.exit(2); }
const cfg=G._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- TITLE/menu state renders without crashing (the bug from the screenshot) ---');
const td=G._draw(); console.log('title render:',td); if(td!=='ok')ok=false;
console.log('--- ADVENTURE: the bot clears every world goal (3 runs each) ---');
for(let i=0;i<n;i++){ const w=cfg.worlds[i]; let win=true,worst=0; for(let t=0;t<3;t++){ const r=G.sim(i,120000); if(r.result!=='win')win=false; worst=Math.max(worst,r.frames); }
  if(!win)ok=false; console.log(`${win?'PASS':'FAIL'}  W${i+1} ${w.name.padEnd(14)} goal=${String(w.goalRows).padStart(2)} winAll3=${win} worstPieces=${worst}`); }
console.log('--- CALM (endless): survives a long run, never errors, keeps clearing ---');
for(let i=0;i<n;i++){ let res; try{ res=G.simEndless(i,3000); }catch(e){ res={result:'ERR:'+e.message,rows:0}; }
  const good = (res.result==='play'||res.result==='win') && res.rows>0; if(!good)ok=false;
  console.log(`${good?'PASS':'FAIL'}  W${i+1} endless rows=${res.rows} state=${res.result}`); }
console.log('--- render smoke (title + mid-play + win banner) ---');
G._begin(0,'adventure'); G._step(8); const d1=G._draw(); console.log('mid-play render:',d1); if(d1!=='ok')ok=false;
const wr=G.sim(0,120000); const d2=G._draw(); console.log(`win(W1) render: ${d2} (result=${wr.result} rows=${wr.rows}/${wr.goal})`); if(d2!=='ok')ok=false;
console.log('--- DOWN button: one tap drops exactly ONE piece (no double-fire) ---');
G.startWorld(0,'adventure');
{ const before=G._filled(); const ev={preventDefault:noop};
  (dropL['pointerdown']||[]).forEach(f=>f(ev)); (dropL['pointerup']||[]).forEach(f=>f(ev)); (dropL['pointerleave']||[]).forEach(f=>f(ev));
  const locked=(G._filled()-before)/4;
  console.log((locked===1?'PASS':'FAIL')+`  one tap locked ${locked} piece(s); next piece present=${G._cur()}`); if(locked!==1)ok=false; }
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
