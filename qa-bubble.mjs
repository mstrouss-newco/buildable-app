// Headless QA for public/bubble-engine.html.
// Proves: a greedy "perfect player" bot clears EVERY level (match-3 pop + floating drop),
// across several random seeds, and a render call returns "ok".
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('bubble-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:720,height:1040}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:720, height:1040, naturalWidth:0, complete:false, clientWidth:720, clientHeight:1040, getBoundingClientRect:()=>({left:0,top:0,width:720,height:1040}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, alert:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'bubble'});
const G=sandbox.BUBBLE_GAME; if(!G){ console.error('FAIL: BUBBLE_GAME not exposed'); process.exit(2); }
if(sandbox.BUILDABLE_GAME!==G){ console.error('FAIL: BUILDABLE_GAME alias missing'); process.exit(2); }

let ok=true;
const cfg=G._cfg();
console.log('--- every level cleared by the bot (5 seeds each) ---');
cfg.levels.forEach((lv,i)=>{
  let pass=true, worst=0;
  for(let s=0;s<5;s++){
    const r=G.sim(i, 1000+s*37, 500);
    if(r.result!=='win'){ pass=false; }
    worst=Math.max(worst, r.shots||0);
  }
  if(!pass) ok=false;
  console.log(`${pass?'PASS':'FAIL'}  L${i+1} ${lv.name.padEnd(14)} colors=${lv.colors} rows=${lv.rows} worstShots=${worst}`);
});

console.log('--- render smoke ---');
G._begin(0); const d=G._draw();
console.log('render:',d,'remaining=',G._remaining()); if(d!=='ok') ok=false;

console.log('--- MANIFEST (Session 7B): /bubble/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/bubble/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log(`${mv.ok?'PASS':'FAIL'}  manifest validates  errors=${JSON.stringify(mv.errors)}`); if(!mv.ok)ok=false;
console.log(`${manifest.category==='Arcade'?'PASS':'FAIL'}  category is Arcade`); if(manifest.category!=='Arcade')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
const eng=G._cfg().levels||G._cfg();
const engN=Array.isArray(eng)?eng.length:(eng.levels?eng.levels.length:0);
const lineUp = mcfg.stages.length===6 && mcfg.stages.every((s,i)=>s.name===manifest.levels[i].name);
console.log(`${lineUp?'PASS':'FAIL'}  6 levels line up  ::  ${mcfg.stages.map(s=>s.name).join(', ')}`); if(!lineUp)ok=false;
console.log(`${mcfg.multiplayer==='off'?'PASS':'FAIL'}  single-player (multiplayer off)`); if(mcfg.multiplayer!=='off')ok=false;
console.log(`${/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("bubble"/.test(html)?'PASS':'FAIL'}  engine loads the shared manifest`); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("bubble"/.test(html)))ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
