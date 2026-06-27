// Headless QA for public/tictactoe-engine.html
//  - random vs random ALWAYS terminates with a valid result (no soft-lock)
//  - a PERFECT player never loses to the easy AI (always-winnable / pressure-free)
//  - the easy AI is beatable (a perfect player wins a healthy share)
//  - render smoke test
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/public/' + f, 'utf8');
const html = read('tictactoe-engine.html');
const libs = ['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-boardgame.js'].map(read).join('\n');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');

const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:900, height:600, getBoundingClientRect:()=>({left:0,top:0,width:900,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } e.parentElement={clientWidth:900,clientHeight:600}; return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const sandbox={ document:documentStub, window:{}, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, performance:{now:()=>Date.now()}, devicePixelRatio:1, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'tictactoe'});
const TG=sandbox.BUILDABLE_GAME; if(!TG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.TICTACTOE_GAME!==TG){ console.error('FAIL: TICTACTOE_GAME alias missing'); process.exit(2); }
let ok=true;

console.log('--- random vs random: always terminates + fills or wins (200 games) ---');
let termFails=0;
for(let s=0;s<200;s++){ const r=TG.sim({mode:'two',seed:s+1}); const valid=(r.result==='over') && (r.winner===0||r.winner===1||r.winner===2) && (r.winner!==0 || r.filled); if(!valid){ termFails++; if(termFails<4) console.log('  BAD', JSON.stringify(r)); } }
console.log(`${termFails===0?'PASS':'FAIL'}  termination/validity fails=${termFails}/200`); if(termFails)ok=false;

console.log('--- perfect player NEVER loses to the easy AI (120 games) ---');
let losses=0, wins=0, draws=0;
for(let s=0;s<120;s++){ const r=TG.simVsAI(s*3+1); if(r.winner===1)wins++; else if(r.winner===2){ losses++; if(losses<4) console.log('  LOST seed',s);} else draws++; }
console.log(`${losses===0?'PASS':'FAIL'}  perfect-vs-AI  wins=${wins} draws=${draws} losses=${losses}`); if(losses)ok=false;

console.log('--- easy AI is beatable (perfect player wins a healthy share) ---');
console.log(`${wins>=40?'PASS':'WARN'}  perfect player won ${wins}/120 (>=40 expected for a beatable AI)`); if(wins<20)ok=false;

console.log('--- render smoke ---');
TG._begin('two'); TG._play(0); TG._play(4); const d=TG._draw(); console.log('render:', d); if(d!=='ok')ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
