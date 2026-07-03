// Headless QA for public/string-match.html — asserts every level is solvable without crossing.
// Runs the engine's pure-geometry perfect-player solver (window.STRINGMATCH_GAME) with no DOM.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const html=fs.readFileSync(dir+'/public/string-match.html','utf8');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const sandbox={ window:{}, document:{ getElementById:()=>null, addEventListener:noop, createElementNS:()=>({setAttribute:noop,appendChild:noop}) },
  requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, setTimeout:()=>0, clearTimeout:noop,
  localStorage:{getItem:()=>null,setItem:noop}, performance:{now:()=>Date.now()}, Math, Date, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(engine, sandbox, {filename:'string-match'});
const G=sandbox.STRINGMATCH_GAME;
if(!G){ console.error('FAIL: STRINGMATCH_GAME not exposed'); process.exit(2); }
const cfg=G._cfg(); let ok=true;
console.log('--- every level solvable without crossing ---');
for(let i=0;i<cfg.levels.length;i++){
  const r=G.sim(i); const pass=r.result==='win'; if(!pass) ok=false;
  console.log(`${pass?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(16)} pairs=${cfg.levels[i].pairs} -> ${r.result}`);
}
console.log('render smoke:', G._draw());
console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED');
process.exit(ok?0:1);
