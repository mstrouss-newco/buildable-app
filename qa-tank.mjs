// Headless QA for public/tank-engine.html — perfect player clears every level; render smoke.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('tank-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'tank'});
const G=sandbox.BUILDABLE_GAME; if(!G){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.TANK_GAME!==G){ console.error('FAIL: TANK_GAME alias missing'); process.exit(2); }
const cfg=G._cfg(); const n=cfg.levels.length; let ok=true;
console.log('--- perfect player clears every level (8 runs each) ---');
for(let i=0;i<n;i++){ let win=true, worst=0, minPhp=999; for(let t=0;t<8;t++){ const r=G.sim(i,12000); if(r.result!=='win')win=false; worst=Math.max(worst,r.frames); minPhp=Math.min(minPhp,r.playerHp); } if(!win)ok=false;
  console.log(`${win?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(13)} winAll8=${win} worst=${worst}f (~${(worst/60).toFixed(1)}s) minPlayerHp=${minPhp}`); }
console.log('--- full campaign in one go ---');
const camp=G.campaign(12000); camp.forEach(r=>console.log(`  L${r.level} ${String(r.name).padEnd(13)} ${r.result} (enemyHp=${r.enemyHp}, playerHp=${r.playerHp})`));
if(camp.some(r=>r.result!=='win')) ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
