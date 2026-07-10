// Headless QA for public/bingo-engine.html — a winner always emerges across player counts,
// both modes (pictures/words), both sizes + render smoke. Run: node qa-bingo.mjs .
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('bingo-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-turns.js','buildable-wincard.js','buildable-manifest.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='measureText'?((t)=>({width:(String(t||'').length*8)})):(k==='canvas'?{width:720,height:1040}:(typeof k==='string'?noop:undefined)))});
function el(){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, clientWidth:720, clientHeight:1040, width:720, height:1040, getBoundingClientRect:()=>({left:0,top:0,width:720,height:1040}), appendChild:noop, removeChild:noop }; Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); return e; }
class ImageStub{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;}get src(){return this._src;}}
const documentStub={ getElementById:(id)=> id==='start'? el(): el(), querySelector:()=>el(), addEventListener:noop, createElement:()=>el(), head:el(), documentElement:el() };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, Audio:undefined, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, fetch:undefined, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'bingo'});
const G=sandbox.BUILDABLE_GAME; if(!G){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.BINGO_GAME!==G){ console.error('FAIL: BINGO_GAME alias missing'); process.exit(2); }
let ok=true;
console.log('--- menu-state render (match null, before any game) ---');
{ const dm=G._draw(); if(dm!=='ok'){ok=false;} console.log(`${dm==='ok'?'PASS':'FAIL'}  menu render=${dm}`); } const cfg=G._cfg();
console.log('--- a winner always emerges (8 runs each combo) ---');
for(const pl of [2,3,4]) for(let mi=0;mi<cfg.modes.length;mi++) for(let si=0;si<cfg.sizes.length;si++){
  let win=true,maxC=0; for(let t=0;t<8;t++){ const r=G.sim({players:pl,modeIdx:mi,sizeIdx:si,themeIdx:t%6}); if(r.result!=='win'||r.winner<0) win=false; maxC=Math.max(maxC,r.calls); }
  if(!win)ok=false; console.log(`${win?'PASS':'FAIL'}  ${pl}p ${cfg.modes[mi].name.padEnd(8)} ${cfg.sizes[si].name.padEnd(6)} win=${win} maxCalls=${maxC}`); }
console.log('--- campaign sweep ---');
const camp=G.campaign(); const allWin=camp.every(c=>c.result==='win'); if(!allWin)ok=false;
console.log(`${allWin?'PASS':'FAIL'}  campaign ${camp.length} combos all win=${allWin}`);
console.log('--- render smoke (start, mid-call, win) ---');
G.begin({players:3,modeIdx:0,sizeIdx:1}); const d0=G._draw(); console.log('start render:',d0);
G.call(); G._step(10); const d1=G._draw(); console.log('mid-call render:',d1);
G.sim({players:2,modeIdx:1,sizeIdx:0}); const d2=G._draw(); console.log('win render:',d2);
if(d0!=='ok'||d1!=='ok'||d2!=='ok')ok=false;
console.log('--- MANIFEST (Session 7B): /bingo/manifest.json through the shared loader ---');
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(read('buildable-manifest.js'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync(dir+'/public/bingo/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log(`${mv.ok?'PASS':'FAIL'}  manifest validates  errors=${JSON.stringify(mv.errors)}`); if(!mv.ok)ok=false;
console.log(`${manifest.category==='Classic'?'PASS':'FAIL'}  category is Classic`); if(manifest.category!=='Classic')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
console.log(`${mcfg.stages.length===2?'PASS':'FAIL'}  2 board-size levels  ::  ${mcfg.stages.map(s=>s.name).join(', ')}`); if(mcfg.stages.length!==2)ok=false;
const cardsSlot=(manifest.customization||[]).find(c=>/cards/i.test(c.slot));
const worldSlot=(manifest.customization||[]).find(c=>/world/i.test(c.slot));
console.log(`${(cardsSlot&&cardsSlot.options.length===2)?'PASS':'FAIL'}  Cards loadout (Pictures/Words)`); if(!(cardsSlot&&cardsSlot.options.length===2))ok=false;
console.log(`${(worldSlot&&worldSlot.options.length===6)?'PASS':'FAIL'}  6-world loadout`); if(!(worldSlot&&worldSlot.options.length===6))ok=false;
console.log(`${/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("bingo"/.test(html)?'PASS':'FAIL'}  engine loads the shared manifest`); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("bingo"/.test(html)))ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
