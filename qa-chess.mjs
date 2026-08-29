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
const exists = f => fs.existsSync(dir + '/' + f);
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

// --- 5b) the two sides are clearly different colours (Session 7M) ---
// The world art is drawn once per piece and shared by both armies, so the side's
// colour has to come from the engine: a named team palette, a per-side art request,
// and the CSS pad + outline that carry the colour onto whatever artwork loads.
console.log('--- SIDES: telling the two armies apart ---');
const teamBlock = (html.match(/const TEAMS=\{[\s\S]*?\};/)||[''])[0];
const hexes = (teamBlock.match(/#[0-9A-Fa-f]{6}/g)||[]).map(h=>h.toLowerCase());
const teamNames = (teamBlock.match(/name:'([A-Za-z]+)'/g)||[]).map(s=>s.slice(6,-1));
chk('both teams declare a colour and a name kids can say', teamNames.length===2 && hexes.length>=6, teamNames.join(' vs '));
function hueOf(hex){
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  if(!d) return 0;
  let h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4;
  return (h*60+360)%360;
}
// main colours are the 1st hex of each team's { name, main, dark, lite } block
const mains = [hexes[0], hexes[3]];
const apart = Math.abs(((hueOf(mains[0])-hueOf(mains[1]))+540)%360-180);
chk('the two team colours are far apart on the colour wheel (>=90 degrees)', apart>=90,
    mains.join(' / ')+' -> '+Math.round(apart)+' degrees');
chk('each side asks for its own piece art (&side=)', /kind=chesspiece[\s\S]{0,120}?&side='\+p\.c/.test(html));
chk('the art API paints each side its own colour', /chesspiece\|\$\{world\}\|\$\{piece\}\|\$\{side\}/.test(read('api/images.js')));
// ---- CP2: the clean-chess piece set, the dots, the movement, the hi-def worlds ----
const imgs = read('api/images.js');
chk('the board asks for the CLEAN CHESS set, not the leaf-covered one',
    /kind=chesspiece2&style=a&world='\+sceneKey/.test(html));
chk('the clean-chess prompt forbids anything covering the shape',
    /no leaves, no vines, no plants/.test(imgs) && /readable when the image is shrunk/.test(imgs));
chk('every piece has a height in its prompt, so a pawn is not a queen',
    /the SHORTEST piece on the board/.test(imgs) && /the TALLEST piece on the board/.test(imgs));
chk('the white rank dots are gone for good', !/withBadge|rankBadge|RANKGL/.test(html));
chk('a picked-up piece lifts AND tilts', /\.piece\.lift\{transform:scale\(1\.14\) rotate\(-6deg\)/.test(html));
chk('a piece squashes when it lands', /@keyframes landsquash/.test(html) && /classList\.add\('landing'\)/.test(html));
chk('a captured piece spins away', /scale\(0\) rotate\(150deg\)/.test(html));
chk('the hi-def world scenes are wired in and un-blurred when they load',
    /kind=chessworld&world='\+key/.test(html) && /\.world\.hidef \.scene-bg\{filter:blur\(\.6px\)/.test(html));
chk('a hi-def scene only replaces the old one once it has decoded',
    /im\.onload=function\(\)\{ if\(sceneKey!==key\)return;/.test(html));
chk('the chess mocks are gone from public/ and from vercel.json',
    !exists('public/chess-look-mock.html') && !exists('public/chess-pieces-mock.html')
    && !/chess-(look|pieces)-mock/.test(read('vercel.json')));
chk('pieces carry their side onto shared art (team class + pad + outline)',
    /el\.className='piece team-'\+p\.c/.test(html) && /\.piece\.team-w\{--team:/.test(html) && /\.piece\.team-b\{--team:/.test(html)
    && /drop-shadow\(2px 0 0 var\(--team\)\)/.test(html));

// --- 6) shell contract wiring is present in the shipped engine file ---
console.log('--- CONTRACT: manifest loader + multiplayer relay wired ---');
chk('engine includes the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\('chess'/.test(html));
chk('turn-based multiplayer relay signals present', /postMessage\(\{type:'chessMove'/.test(html) && /postMessage\(\{type:'chessReady'/.test(html));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
