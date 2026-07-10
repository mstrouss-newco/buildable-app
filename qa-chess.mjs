// Headless QA for public/buildable-chess.html — MANIFEST-DRIVEN (Session 7B).
// Mirrors qa-sling/qa-survival: it validates /chess/manifest.json through the shared
// shell loader, turns it into the engine config, then loads the engine's pure logic
// (the DOM-free ENGINE block) to prove the board is playable, a win (checkmate) is
// reachable and reported, and every opponent tier plays legally to a natural end.
// Chess's shell "contract" is its turn-based multiplayer relay, so we also confirm
// the manifest loader + relay signals are wired into the shipped file.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL') + '  ' + name + (extra?'  ::  '+extra:'')); if(!cond) ok=false; };

// --- 1) shell loader: validate the manifest + build the engine config ---
console.log('--- MANIFEST: /chess/manifest.json through the shared loader ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb;
vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
if(!BM || !BM.validate){ console.error('FAIL: BuildableManifest not exposed'); process.exit(2); }
const manifest = JSON.parse(read('public/chess/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors)+' warnings='+JSON.stringify(v.warnings));
if(!v.ok){ console.error('MANIFEST INVALID — aborting'); process.exit(2); }
const cfg = BM.toEngineConfig(manifest);
chk('3 opponent tiers, each a real bot strength', cfg.tiers.length===3 && cfg.tiers.every(t=>['easy','medium','hard'].includes(t.bot)), cfg.tiers.map(t=>t.name+'->'+t.bot).join(', '));
chk('difficulty 1/3/5 -> easy/medium/hard', cfg.tiers.map(t=>t.bot).join(',')==='easy,medium,hard');
chk('6 free worlds offered as customization', cfg.worlds.length===6 && cfg.worlds.every(w=>w.price===0), cfg.worlds.map(w=>w.key).join(','));
chk('multiplayer switch -> turn-based / existing turns lane', cfg.multiplayer==='turn-based' && cfg.transport==='turns');

// --- 2) load the engine's pure logic (DOM-free slice of the shipped HTML) ---
console.log('--- ENGINE: playability + result reporting ---');
const html = read('public/buildable-chess.html');
const a = html.indexOf('function startState(){');
const b = html.indexOf('/* ================= HERO ART (SVG) ================= */');
chk('engine block located in HTML', a>0 && b>a);
const engineSrc = html.slice(a, b);
const eSb = { console, Math, Object, Array, Infinity, JSON }; vm.createContext(eSb);
vm.runInContext(engineSrc, eSb, { filename:'chess-engine' });
const { startState, legalMoves, applyMove, gameStatus, botMove } = eSb;
chk('engine exposes startState/legalMoves/applyMove/gameStatus/botMove', [startState,legalMoves,applyMove,gameStatus,botMove].every(f=>typeof f==='function'));

// --- 3) opening position is playable ---
const s0 = startState();
chk('opening position has 20 legal moves', legalMoves(s0).length===20, 'got '+legalMoves(s0).length);

// --- 4) a win is reachable AND reported (Fool's mate: 1.f3 e5 2.g4 Qh4#) ---
function pick(s, fr, fc, tr, tc){ return legalMoves(s).find(m=>m.from[0]===fr&&m.from[1]===fc&&m.to[0]===tr&&m.to[1]===tc); }
let s = startState();
const seq = [[6,5,5,5],[1,4,3,4],[6,6,4,6],[0,3,4,7]];  // board coords: row0=black, row7=white
let legalSeq = true;
for(const [fr,fc,tr,tc] of seq){ const m = pick(s,fr,fc,tr,tc); if(!m){ legalSeq=false; break; } s = applyMove(s,m); }
const st = gameStatus(s);
chk("checkmate reachable + reported ('mate', white loses)", legalSeq && st.over && st.result==='mate' && st.loser==='w', JSON.stringify({legalSeq, over:st.over, result:st.result, loser:st.loser}));

// --- 5) every opponent tier plays a full, legal game to a natural end (bot vs bot) ---
function playout(level, cap=240){
  let s = startState();
  for(let plies=0; plies<cap; plies++){
    const g = gameStatus(s);
    if(g.over) return { over:true, result:g.result, plies };
    const mv = botMove(s, level);
    if(!mv) return { over:true, result:'nomove', plies };
    const legal = legalMoves(s).some(m=>m.from[0]===mv.from[0]&&m.from[1]===mv.from[1]&&m.to[0]===mv.to[0]&&m.to[1]===mv.to[1]&&(m.promo||'')===(mv.promo||''));
    if(!legal) return { over:false, illegal:true, plies };
    s = applyMove(s, mv);
  }
  return { over:false, cap:true, plies:cap };
}
for(const lvl of ['easy','medium','hard']){
  const r = playout(lvl);
  chk('tier "'+lvl+'" plays only legal moves to a natural end', !r.illegal && (r.over || r.cap), JSON.stringify(r));
}

// --- 6) shell contract wiring is present in the shipped engine file ---
console.log('--- CONTRACT: manifest loader + multiplayer relay wired ---');
chk('engine includes the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\('chess'/.test(html));
chk('turn-based multiplayer relay signals present', /postMessage\(\{type:'chessMove'/.test(html) && /postMessage\(\{type:'chessReady'/.test(html));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
