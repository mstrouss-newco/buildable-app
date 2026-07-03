// Headless QA for public/string-match.html — every level solvable (no cross, no touching another character) across aspects.
import fs from "fs"; import vm from "vm";
const html=fs.readFileSync('public/string-match.html','utf8');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const sb={window:{},document:{getElementById:()=>null,addEventListener:noop,createElementNS:()=>({setAttribute:noop,appendChild:noop})},requestAnimationFrame:noop,addEventListener:noop,setTimeout:()=>0,localStorage:{getItem:()=>null,setItem:noop},Math,Date,console,Uint8Array,Int32Array};
sb.window=sb; sb.globalThis=sb; vm.createContext(sb); vm.runInContext(engine,sb,{filename:'sm'});
const G=sb.STRINGMATCH_GAME; let ok=true;
for(let i=0;i<G._cfg().levels.length;i++){ const r=G.sim(i); if(r.result!=='win')ok=false;
  console.log((r.result==='win'?'PASS':'FAIL')+'  L'+(i+1)+' '+G._cfg().levels[i].name.padEnd(16)+' pairs='+G._cfg().levels[i].pairs+' -> '+r.result); }
console.log(ok?'ALL PASS (solvable at square + portrait + landscape aspects)':'SOME FAILED'); process.exit(ok?0:1);
