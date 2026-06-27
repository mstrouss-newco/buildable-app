// Headless QA for public/word-buddies.html.
// Asserts the engine is ALWAYS-WINNABLE: the Helper finds a valid, connected, in-
// dictionary word on every opening (across many seeds) and through whole auto-played
// games, and the manual-submit validator accepts a real Helper move.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('word-buddies.html');
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js','buildable-startscreen.js','buildable-buddy.js'].map(read).join('\n');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
// getElementById returns null for everything => engine's HAS_DOM is false => no DOM/canvas/RAF path runs, only the QA hooks are defined.
const documentStub={ getElementById:()=>null, querySelector:()=>null, addEventListener:noop, createElement:()=>({style:{setProperty:noop},appendChild:noop,classList:{add:noop,remove:noop}}), head:{appendChild:noop}, documentElement:{appendChild:noop} };
const sandbox={ document:documentStub, window:{}, requestAnimationFrame:noop, cancelAnimationFrame:noop, addEventListener:noop, removeEventListener:noop, setTimeout:(fn)=>{ return 0; }, clearTimeout:noop, performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox); vm.runInContext(libs+'\n'+engine, sandbox, {filename:'word-buddies'});
const WB=sandbox.BUILDABLE_GAME;
let ok=true;
if(!WB){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.WORD_BUDDIES_GAME!==WB){ console.error('FAIL: WORD_BUDDIES_GAME alias missing'); ok=false; }

console.log('--- ALWAYS-WINNABLE: a Helper move exists on the opening turn (300 seeds) ---');
const g=WB.guarantee(300);
console.log(`${g.result}  openingMoveMissing=${g.openingMoveMissing}/${g.tried} ${g.badSeeds.length?('bad='+g.badSeeds.join(',')):''}`);
if(g.result!=='PASS') ok=false;

console.log('--- WHOLE GAMES: Helper auto-plays every turn; all words real, no sparse dead-end (10 seeds) ---');
for(let s=0;s<10;s++){ const r=WB.sim(s, 200);
  if(r.result!=='PASS') ok=false;
  console.log(`${r.result}  seed=${s} turns=${r.turns} words=${r.words.length} fill=${r.fillRatio} bagLeft=${r.bagLeft} allValid=${r.allValid} stuckSparse=${r.stuckSparse} sample=[${r.words.slice(0,6).join(', ')}]`);
}

console.log('--- VALIDATOR: a real Helper placement passes the gentle hand-built check ---');
const v=WB.checkValidator();
console.log(`${v.result}  word="${v.word}" ${v.reason?('reason='+v.reason):''}`);
if(v.result!=='PASS') ok=false;

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED');
process.exit(ok?0:1);
