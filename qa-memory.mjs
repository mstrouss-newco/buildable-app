// Headless QA for public/memory-engine.html — every difficulty x player-count is clearable
// (a perfect-memory bot always wins) + render smoke. Run: node qa-memory.mjs .
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('memory-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-turns.js','buildable-wincard.js','buildable-manifest.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='measureText'?((t)=>({width:(String(t||'').length*8)})):(k==='canvas'?{width:720,height:1040}:(typeof k==='string'?noop:undefined)))});
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
console.log('--- MANIFEST (Session 7B): /memory/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/memory/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log(`${mv.ok?'PASS':'FAIL'}  manifest validates  errors=${JSON.stringify(mv.errors)}`); if(!mv.ok)ok=false;
console.log(`${manifest.category==='Puzzle'?'PASS':'FAIL'}  category is Puzzle`); if(manifest.category!=='Puzzle')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
console.log(`${mcfg.stages.length===3?'PASS':'FAIL'}  3 size levels  ::  ${mcfg.stages.map(s=>s.name).join(', ')}`); if(mcfg.stages.length!==3)ok=false;
const worldSlot=(manifest.customization||[]).find(c=>/world/i.test(c.slot));
console.log(`${(worldSlot&&worldSlot.options.length===6)?'PASS':'FAIL'}  6-world loadout matches engine themes`); if(!(worldSlot&&worldSlot.options.length===6))ok=false;
console.log(`${mcfg.multiplayer==='off'?'PASS':'FAIL'}  multiplayer off (local pass-and-play)`); if(mcfg.multiplayer!=='off')ok=false;
console.log(`${/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("memory"/.test(html)?'PASS':'FAIL'}  engine loads the shared manifest`); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("memory"/.test(html)))ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
