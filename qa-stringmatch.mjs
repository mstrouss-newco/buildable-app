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
// --- MANIFEST (Session 7B): /stringmatch/manifest.json through the shared loader ---
const bmSb={console,Math,Date,JSON,Object,Array,String}; bmSb.window=bmSb; bmSb.globalThis=bmSb; vm.createContext(bmSb);
vm.runInContext(fs.readFileSync('public/buildable-manifest.js','utf8'), bmSb, {filename:'buildable-manifest'});
const BM=bmSb.BuildableManifest;
const manifest=JSON.parse(fs.readFileSync('public/stringmatch/manifest.json','utf8'));
const mv=BM.validate(manifest);
console.log((mv.ok?'PASS':'FAIL')+'  manifest validates  errors='+JSON.stringify(mv.errors)); if(!mv.ok)ok=false;
console.log((manifest.category==='Classic'?'PASS':'FAIL')+'  category is Classic'); if(manifest.category!=='Classic')ok=false;
const mcfg=mv.ok?BM.toEngineConfig(manifest):{stages:[]};
const n=G._cfg().levels.length;
const lineUp = mcfg.stages.length===n && G._cfg().levels.every((lv,i)=>mcfg.stages[i]&&mcfg.stages[i].name===manifest.levels[i].name);
console.log((lineUp?'PASS':'FAIL')+'  '+n+' worlds line up with the engine  ::  '+mcfg.stages.map(s=>s.name).join(', ')); if(!lineUp)ok=false;
console.log((mcfg.multiplayer==='off'?'PASS':'FAIL')+'  single-player (multiplayer off)'); if(mcfg.multiplayer!=='off')ok=false;
console.log((/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("stringmatch"/.test(html)?'PASS':'FAIL')+'  engine loads the shared manifest'); if(!(/buildable-manifest\.js/.test(html)&&/BuildableManifest\.load\("stringmatch"/.test(html)))ok=false;

console.log(ok?'ALL PASS (solvable at square + portrait + landscape aspects)':'SOME FAILED'); process.exit(ok?0:1);
