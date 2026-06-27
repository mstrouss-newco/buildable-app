// Headless QA for public/buildable-checkers.html
// Loads the engine's inline script with NO document (so HAS_DOM=false → pure rules + bot),
// then checks: opening legality, multi-jump, promotion, the bot is BEATABLE (a strong kid
// wins the clear majority vs the Easy robot), and every difficulty terminates cleanly.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const html = fs.readFileSync(dir + '/public/buildable-checkers.html', 'utf8');
const engine = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
const noop = () => {};
const sandbox = { window: {}, Math, Date, console, setTimeout: () => 0, clearTimeout: noop, URLSearchParams };
sandbox.window = sandbox; sandbox.globalThis = sandbox;   // NOTE: no `document` → engine stays headless
vm.createContext(sandbox);
vm.runInContext(engine, sandbox, { filename: 'checkers' });
const G = sandbox.CHECKERS_GAME;
let ok = true;
const check = (name, cond, extra='') => { if(!cond) ok = false; console.log(`${cond?'PASS':'FAIL'}  ${name}${extra?'  '+extra:''}`); };

if(!G){ console.error('FAIL: CHECKERS_GAME not exposed'); process.exit(2); }

// 1) opening position
const init = G.initialBoard();
check('12 red + 12 blue at start', G.countPieces(init.board,'r')===12 && G.countPieces(init.board,'b')===12);
check('red has 7 opening moves', G.allMoves(init.board,'r',false).length===7, '(got '+G.allMoves(init.board,'r',false).length+')');

// 2) multi-jump: a red man should be able to double-jump two blue men
function empty(){ return Array.from({length:8},()=>Array(8).fill(null)); }
let b = empty();
b[6][1] = {c:'r',k:false};
b[5][2] = {c:'b',k:false};   // jump to [4,3]
b[3][4] = {c:'b',k:false};   // then jump to [2,5]
const seqs = G.captureSeqs(b,6,1);
const dbl = seqs.some(s => s.caps.length===2);
check('double-jump found', dbl, '(sequences='+seqs.length+', maxCaps='+Math.max(0,...seqs.map(s=>s.caps.length))+')');

// 3) promotion: a red man reaching row 0 becomes a king
let p = empty(); p[1][2] = {c:'r',k:false};
const mv = G.allMoves(p,'r',false)[0];
const after = G.applyFullMove(p, mv);
const top = after[0].find ? null : null;
let crowned=false; for(let c=0;c<8;c++){ if(after[0][c] && after[0][c].c==='r' && after[0][c].k) crowned=true; }
check('man promotes to king on far row', crowned);

// 4) forced-capture: with mustJump ON, only captures are offered
let f = empty(); f[6][1]={c:'r',k:false}; f[5][2]={c:'b',k:false}; f[6][5]={c:'r',k:false};
const strict = G.allMoves(f,'r',true);
check('mustJump → only capturing moves', strict.every(m=>m.caps.length>0) && strict.length>0, '(moves='+strict.length+')');

// 5) the robot is BEATABLE — a strong kid (G.sim red=strong) beats Easy a clear majority
for(const mj of [false,true]){
  let redWins=0, games=40, crashes=0;
  for(let i=0;i<games;i++){ try{ const r=G.sim({difficulty:'easy',mustJump:mj,maxMoves:400}); if(r.winner==='r')redWins++; }catch(e){ crashes++; } }
  check(`Easy robot is beatable (mustJump=${mj})`, redWins>=games*0.7 && crashes===0, `redWins=${redWins}/${games} crashes=${crashes}`);
}

// 6) every difficulty terminates cleanly (no crash, reaches a result within the cap)
for(const d of ['easy','normal','tricky']){
  let okRun=true, sample=null;
  for(let i=0;i<12;i++){ try{ const r=G.sim({difficulty:d,mustJump:i%2===0,maxMoves:400}); sample=r; if(!r.winner)okRun=false; }catch(e){ okRun=false; } }
  check(`difficulty ${d} runs to a result`, okRun, sample?`(last: ${sample.winner} in ${sample.moves} moves, ${sample.reason})`:'');
}

console.log(ok ? '\nALL CHECKS PASS' : '\nSOME CHECKS FAILED');
process.exit(ok?0:1);
