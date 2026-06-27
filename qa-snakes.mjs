// Headless QA for public/snakes-engine.html — the game always ends in a win across player
// counts + all boards (pure luck never soft-locks), ladders/snakes resolve correctly, + render.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('snakes-engine.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-turns.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:720,height:1040}:(typeof k==='string'?noop:undefined))});
function el(){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, clientWidth:720, clientHeight:1040, width:720, height:1040, getBoundingClientRect:()=>({left:0,top:0,width:720,height:1040}), appendChild:noop, removeChild:noop }; Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); return e; }
class ImageStub{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;}get src(){return this._src;}}
const documentStub={ getElementById:(id)=>el(), querySelector:()=>el(), addEventListener:noop, createElement:()=>el(), head:el(), documentElement:el() };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, Audio:undefined, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, fetch:undefined, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'snakes'});
const G=sandbox.BUILDABLE_GAME; if(!G){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.SNAKES_GAME!==G){ console.error('FAIL: SNAKES_GAME alias missing'); process.exit(2); }
let ok=true;
console.log('--- menu-state render (match null, before any game) ---');
{ const dm=G._draw(); if(dm!=='ok'){ok=false;} console.log(`${dm==='ok'?'PASS':'FAIL'}  menu render=${dm}`); } const cfg=G._cfg();
console.log('--- game always ends in a win (40 runs each combo) ---');
for(const pl of [2,3,4]) for(let bi=0;bi<cfg.boards.length;bi++){
  let win=true,maxR=0,sumR=0,runs=40; for(let t=0;t<runs;t++){ const r=G.sim({players:pl,boardIdx:bi}); if(r.result!=='win'||r.winner<0) win=false; maxR=Math.max(maxR,r.rolls); sumR+=r.rolls; }
  if(!win)ok=false; console.log(`${win?'PASS':'FAIL'}  ${pl}p ${cfg.boards[bi].name.padEnd(13)} win=${win} avgRolls=${(sumR/runs).toFixed(0)} maxRolls=${maxR}`); }
console.log('--- jump tables resolve (ladders up, snakes down) ---');
G.begin({players:2,boardIdx:0});
let jok=true; for(const [a,b] of cfg.boards[0].ladders){ const j=G._jump(a); if(!j||j.to!==b||j.kind!=='ladder')jok=false; }
for(const [a,b] of cfg.boards[0].snakes){ const j=G._jump(a); if(!j||j.to!==b||j.kind!=='snake')jok=false; }
if(!jok)ok=false; console.log(`${jok?'PASS':'FAIL'}  jungle ladders/snakes map correctly`);
console.log('--- winners are distributed (not always seat 0) over 200 games, 4p board 0 ---');
const wins=[0,0,0,0]; for(let t=0;t<200;t++){ const r=G.sim({players:4,boardIdx:0}); if(r.winner>=0)wins[r.winner]++; }
const everyoneCanWin=wins.every(w=>w>0); if(!everyoneCanWin)ok=false;
console.log(`${everyoneCanWin?'PASS':'FAIL'}  seat win counts=[${wins.join(', ')}] (luck — all seats can win)`);
console.log('--- render smoke ---');
G._begin({players:3,boardIdx:1}); const d0=G._draw(); console.log('board render:',d0);
G.sim({players:2,boardIdx:2}); const d2=G._draw(); console.log('win render:',d2);
if(d0!=='ok'||d2!=='ok')ok=false;
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
