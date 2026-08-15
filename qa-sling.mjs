// Headless QA for public/sling-squad.html — MANIFEST-DRIVEN (Session 5B).
// Mirrors qa-survival.mjs: it validates /sling/manifest.json, turns it into the
// engine config via the shared shell loader, applies it through the engine's real
// _applyManifest hook, then proves a sensible-aim bot clears EVERY MANIFEST level
// (with slings to spare). Same path the browser takes, so a green run means the
// manifest is valid AND its levels are beatable. Plus a render smoke test.
import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2]||'.';
const read=f=>fs.readFileSync(dir+'/public/'+f,'utf8');
const html=read('sling-squad.html');
// shared libs + the vendored physics engine, loaded into the sandbox like the browser would.
// (buildable-hud.js is intentionally NOT loaded: with BuildableHUD undefined the engine's
//  HUD() returns a no-op, exactly like the browser would degrade — keeps QA headless-clean.)
const libs=['buildable-renders.js','buildable-audio.js','buildable-mechanics.js',
            'buildable-startscreen.js','buildable-gamenav.js','buildable-viewport.js','matter.min.js'].map(read).join('\n');
const manifestLib=read('buildable-manifest.js');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:960,height:600}:(typeof k==='string'?noop:undefined))});
function el(withAppend){ const e={ style:{setProperty:noop}, classList:{add:noop,remove:noop,contains:()=>false}, addEventListener:noop, removeEventListener:noop, getContext:()=>ctxStub, onclick:null, textContent:'', width:960, height:600, naturalWidth:0, complete:false, getBoundingClientRect:()=>({left:0,top:0,width:960,height:600}) };
  Object.defineProperty(e,'innerHTML',{set(){},get(){return''}}); if(withAppend){ e.appendChild=noop; e.removeChild=noop; } return e; }
class ImageStub{set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={ getElementById:(id)=> id==='start'? el(false): el(true), querySelector:()=>el(true), addEventListener:noop, createElement:()=>el(true), head:el(true), documentElement:el(true) };
const localStorageStub={ getItem:()=>null, setItem:noop, removeItem:noop };
const sandbox={ document:documentStub, Image:ImageStub, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  addEventListener:noop, removeEventListener:noop, setTimeout:()=>0, clearTimeout:noop, setInterval:()=>0, clearInterval:noop,
  localStorage:localStorageStub, fetch:()=>Promise.reject(new Error('no-net')).catch(()=>{}),
  performance:{now:()=>Date.now()}, Date, Math, console };
sandbox.window=sandbox; sandbox.globalThis=sandbox; sandbox.self=sandbox;
vm.createContext(sandbox);

// --- 1) shell loader: validate the manifest + build the engine config ---
vm.runInContext(manifestLib, sandbox, {filename:'buildable-manifest'});
const BM=sandbox.BuildableManifest;
if(!BM||!BM.validate){ console.error('FAIL: BuildableManifest not exposed'); process.exit(2); }
const manifest=JSON.parse(fs.readFileSync(dir+'/public/sling/manifest.json','utf8'));
const v=BM.validate(manifest);
console.log('--- MANIFEST: validate /sling/manifest.json ---');
console.log(`${v.ok?'PASS':'FAIL'}  ok=${v.ok} errors=${JSON.stringify(v.errors)} warnings=${JSON.stringify(v.warnings)}`);
if(!v.ok){ console.error('MANIFEST INVALID — aborting'); process.exit(2); }
const engCfg=BM.toEngineConfig(manifest);
console.log('manifest -> engine levels:', engCfg.levels.map(l=>`${l.name}[d${l.difficulty} slings${l.launches} blk${l.blocks.length} tgt${l.targets.length}]`).join(', '));

// --- 2) load the engine (built-in GAME_CONFIG is the fallback), then apply manifest ---
vm.runInContext(libs+'\n'+engine, sandbox, {filename:'sling-squad'});
const SG=sandbox.BUILDABLE_GAME; let ok=true;
if(!SG){ console.error('FAIL: BUILDABLE_GAME not exposed'); process.exit(2); }
if(sandbox.SLING_GAME!==SG){ console.error('FAIL: SLING_GAME alias missing'); process.exit(2); }
console.log('PASS  BUILDABLE_GAME + SLING_GAME alias present');
if(typeof SG._cfg!=='function' || typeof SG._applyManifest!=='function'){ console.error('FAIL: 5B hooks _cfg/_applyManifest missing'); process.exit(2); }
console.log('calibrated EFF_G =', SG.effG().toFixed(4));
SG._applyManifest(engCfg, manifest);
const cfg=SG._cfg();
const n=cfg.levels.length;
console.log(`--- APPLIED: engine now runs the manifest levels (${n} of ${manifest.levels.length}) ---`);
const namesMatch = cfg.levels.every((l,i)=>l.name===manifest.levels[i].name);
console.log(`${(n===manifest.levels.length&&namesMatch)?'PASS':'FAIL'}  count=${n} namesMatch=${namesMatch} :: ${cfg.levels.map(l=>l.name).join(', ')}`);
if(n!==manifest.levels.length || !namesMatch) ok=false;

// --- 3) a sensible-aim bot clears every manifest level (5 runs each), slings to spare ---
console.log('--- BOT clears every manifest level (5 runs each) ---');
for(let i=0;i<n;i++){ let win=true, worstUsed=0, worstFrames=0;
  for(let t=0;t<5;t++){ const r=SG.sim(i,20000);
    if(r.result!=='win'){ win=false; console.log(`   run${t} L${i+1} -> ${r.result} popped ${r.popped}/${r.targets} used ${r.launchesUsed}`); }
    worstUsed=Math.max(worstUsed,r.launchesUsed); worstFrames=Math.max(worstFrames,r.frames); }
  const lv=cfg.levels[i]; const spare=lv.launches-worstUsed;
  if(!win||spare<0) ok=false;
  console.log(`${(win&&spare>=0)?'PASS':'FAIL'}  L${i+1} ${lv.name.padEnd(15)} winAll5=${win} worstUsed=${worstUsed}/${lv.launches} spare=${spare} worst=${worstFrames}f`); }

// --- 3b) SD1: blocks made of something, with health that actually runs out ---
// Three things have to hold, or the phase's whole point is gone:
//   * levels 1-6 must carry NO material at all (the easy on-ramp is untouched)
//   * glass / wood / stone must behave differently under the same hit
//   * a tower must sit still and whole until something hits it
console.log('--- SD1: block materials + health ---');
const onramp = cfg.levels.slice(0,6).every(l=>l.blocks.every(b=>!b.m));
console.log(`${onramp?'PASS':'FAIL'}  levels 1-6 carry no material (on-ramp unchanged)`);
if(!onramp) ok=false;
const backHalf = cfg.levels.slice(6).filter(l=>l.blocks.some(b=>b.m)).length;
console.log(`${backHalf===cfg.levels.length-6?'PASS':'FAIL'}  every level 7-${cfg.levels.length} has breakable blocks (${backHalf}/${cfg.levels.length-6})`);
if(backHalf!==cfg.levels.length-6) ok=false;

// the trio layout is one post of each material, side by side — the clean test bench
const trio = cfg.levels.findIndex(l=>l.blocks.length===3 && l.blocks[0].m==='glass' && l.blocks[1].m==='wood' && l.blocks[2].m==='stone');
if(trio<0){ console.log('FAIL  no glass/wood/stone test layout found'); ok=false; }
else{
  const hitsToBreak=(i,spd)=>{ SG._begin(trio); for(let h=1;h<=40;h++){ const r=SG._hitBlock(i,spd,1); if(r.broken) return h; } return Infinity; };
  const soft=(i)=>{ SG._begin(trio); return SG._hitBlock(i,4,1); };
  const gGood=hitsToBreak(0,18), wGood=hitsToBreak(1,18), sGood=hitsToBreak(2,18);
  const gSoft=soft(0), wSoft=soft(1), sSoft=soft(2);
  // glass: gone on almost any hit, even a gentle one
  const glassOk = gGood===1 && gSoft.broken;
  console.log(`${glassOk?'PASS':'FAIL'}  glass shatters on almost any hit (good hit: ${gGood}, soft tap breaks it: ${gSoft.broken})`);
  // wood: cracks first, then breaks after a few good hits
  SG._begin(trio); const wFirst=SG._hitBlock(1,18,1);
  const woodOk = wGood>=2 && wGood<=5 && wFirst.cracked && !wFirst.broken && !wSoft.broken;
  console.log(`${woodOk?'PASS':'FAIL'}  wood cracks then breaks after a few good hits (cracked on hit 1: ${wFirst.cracked}, broke on hit ${wGood}, survives a soft tap: ${!wSoft.broken})`);
  // stone: has to be toppled, not smashed
  const stoneOk = sGood>12 && !sSoft.broken;
  console.log(`${stoneOk?'PASS':'FAIL'}  stone barely breaks — topple it instead (good hits needed: ${sGood===Infinity?'>40':sGood})`);
  if(!(glassOk&&woodOk&&stoneOk)) ok=false;
}
// nothing may fall apart on its own before the kid has taken a shot
let selfDamaged=[];
for(let i=0;i<n;i++){ SG._begin(i); SG._step(300);
  const bl=SG._blocks(); if(SG.dbg().smashed>0 || bl.some(b=>b.cracked)) selfDamaged.push(cfg.levels[i].name); }
console.log(`${selfDamaged.length===0?'PASS':'FAIL'}  every tower sits whole until it is hit${selfDamaged.length?' :: '+selfDamaged.join(', '):''}`);
if(selfDamaged.length) ok=false;
// and blocks really do get smashed during ordinary play
let smashedSomewhere=0;
for(let i=6;i<n;i++){ SG.sim(i,20000); if(SG._smashed()>0) smashedSomewhere++; }
console.log(`${smashedSomewhere>0?'PASS':'FAIL'}  blocks actually smash in real play (${smashedSomewhere}/${n-6} back-half levels)`);
if(!smashedSomewhere) ok=false;

// --- 3c) SD2: critters you cannot hit directly, and a pop rule with teeth ---
// The claim this phase makes is a strong one, so it gets checked twice over:
// once geometrically (no arc the slingshot can produce touches the critter) and
// once in real play (over five bot runs, that critter never dies by a direct
// hit — only by being crushed, thrown or dropped). A control target in the same
// level has to come back REACHABLE, or the sweep is just answering "no" to
// everything and proving nothing.
console.log('--- SD2: critters you cannot hit directly ---');
const rule = SG._popRule();
console.log(`pop rule: shoved ${rule.POP_MOVE}px or launched ${rule.POP_SPD} pops; squish ${rule.TGT_HP}, nudges under ${rule.TGT_MIN_SPD} do nothing`);

// a barely-nudged critter has to survive, and a real hit has to finish it
SG._begin(0);
const nudge = SG._nudge(0, rule.TGT_MIN_SPD, 1);          // right on the floor = nothing
SG._begin(0); const graze = SG._nudge(0, 5, 1);           // a pal that has nearly stopped
SG._begin(0); const solid = SG._nudge(0, 16, 1);          // a pal arriving properly
const popOk = nudge.alive && graze.alive && !solid.alive;
console.log(`${popOk?'PASS':'FAIL'}  a nudge survives, a graze survives, a real hit pops (nudge:${nudge.alive?'stands':'popped'} graze:${graze.alive?'stands':'popped'} hit:${solid.alive?'stands':'popped'})`);
if(!popOk) ok=false;
// and the old thresholds are genuinely gone
const tightened = rule.POP_MOVE>24 && rule.POP_SPD>5.4;
console.log(`${tightened?'PASS':'FAIL'}  pop thresholds tightened from 24 / 5.4`);
if(!tightened) ok=false;

// which levels hide a critter, and does the layout's promise hold
const sealedLevels=[];
for(let i=0;i<n;i++){ if((cfg.levels[i].targets||[]).some(t=>t.s)) sealedLevels.push(i); }
console.log(`${sealedLevels.length>=6?'PASS':'FAIL'}  at least six levels hide a critter (${sealedLevels.length}: ${sealedLevels.map(i=>'L'+(i+1)+' '+cfg.levels[i].name).join(', ')})`);
if(sealedLevels.length<6) ok=false;

for(const i of sealedLevels){
  SG._begin(i);
  const ts=SG._targets();
  const sealed=ts.filter(t=>t.sealed), open=ts.filter(t=>!t.sealed);
  // 1) geometry: no arc in the game touches a sealed critter...
  const reachable = sealed.filter(t=>SG._reach(t.i));
  // 2) ...but an ordinary critter in the same level is plainly reachable, which
  //    is what stops this from being a sweep that says "no" to everything.
  const control = open.length ? open.some(t=>SG._reach(t.i)) : null;
  // 3) real play: five bot runs, and no sealed critter may die to a pal while
  //    the building is still the one the sweep measured. Once the kid has
  //    smashed or shoved the structure open, a pal getting in is the reward for
  //    solving it — the seal only ever claimed the level AS IT STANDS.
  let byHit=[], cleared=0;
  for(let r=0;r<5;r++){ const res=SG.sim(i,20000); if(res.result==='win') cleared++;
    for(const t of SG._targets()) if(t.sealed && t.why==='hit' && t.intact) byHit.push(t.i); }
  const good = reachable.length===0 && control!==false && byHit.length===0 && cleared===5;
  console.log(`${good?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} sealed=${sealed.length} unreachable=${sealed.length-reachable.length}/${sealed.length} controlReachable=${control===null?'n/a':control} neverHitWhileIntact=${byHit.length===0} clears=${cleared}/5`);
  if(!good) ok=false;
}

// the on-ramp must NOT be sealed — levels 1-6 stay the confident easy start
const onrampSealed = cfg.levels.slice(0,6).some(l=>(l.targets||[]).some(t=>t.s));
console.log(`${!onrampSealed?'PASS':'FAIL'}  levels 1-6 hide nothing (on-ramp still a straight shot)`);
if(onrampSealed) ok=false;

// --- 3d) SD3: ground that is not one flat line -------------------------------
// The phase's claim is that a level's SHAPE now asks the question, not just its
// blocks. That splits into things that can each be checked rather than asserted:
// terrain exists and is genuinely fixed, it really does bend the arc a kid has
// to throw, the on-ramp is still flat, and the back half no longer hands out
// four to seven spare slings to fling at everything.
console.log('--- SD3: terrain ---');
const terr = cfg.levels.map((l,i)=>{ SG._begin(i); return SG._terrain(); });
const kindsOf = t => [...new Set(t.map(x=>x.k))].sort();
const withTerrain = terr.map((t,i)=>t.length?i:-1).filter(i=>i>=0);
const allKinds = kindsOf(terr.flat());
console.log(`${allKinds.length>=3?'PASS':'FAIL'}  all three kinds of ground are in play (${allKinds.join(', ')||'none'}) across ${withTerrain.length} levels`);
if(allKinds.length<3) ok=false;
// levels 1-6 stay one flat floor — the on-ramp is not where a kid learns terrain
const onrampFlat = terr.slice(0,6).every(t=>t.length===0);
console.log(`${onrampFlat?'PASS':'FAIL'}  levels 1-6 are still one flat floor`);
if(!onrampFlat) ok=false;
// terrain is scenery AND physics, and it must never move or break
let moved=[];
for(let i=0;i<n;i++){ if(!terr[i].length) continue;
  SG._begin(i); SG._step(400); if(!SG._terrainFixed()) moved.push(cfg.levels[i].name);
  SG.sim(i,20000); if(!SG._terrainFixed()) moved.push(cfg.levels[i].name+' (in play)'); }
console.log(`${moved.length===0?'PASS':'FAIL'}  terrain never shifts or breaks${moved.length?' :: '+moved.join(', '):''}`);
if(moved.length) ok=false;
// a pit really is a dip in the floor, not a picture of one
const pitLv = terr.map((t,i)=>t.some(x=>x.k==='pit')?i:-1).filter(i=>i>=0);
let pitOk = pitLv.length>0;
for(const i of pitLv){ SG._begin(i);
  const p = terr[i].find(x=>x.k==='pit');
  if(!(SG._floorY(p.x) > SG._floorY(10) )) pitOk=false;             // the floor is lower inside it
  if(Math.abs(SG._floorY(p.x) - (SG._floorY(10)+p.d)) > 0.5) pitOk=false; }
console.log(`${pitOk?'PASS':'FAIL'}  a pit really lowers the floor under it (${pitLv.length} level${pitLv.length===1?'':'s'})`);
if(!pitOk) ok=false;

// THE POINT OF THE PHASE: terrain changes how a kid has to play, and each kind
// changes it differently — so each kind is checked for its OWN promise rather
// than all three against one blunt number.
//
// A HILL forces a lob. `loft` is the flight time of the flattest shot that
// reaches a critter cleanly, and asking for it twice — once with the hill, once
// pretending the ground is flat — measures exactly what the hill costs. If the
// two answers are the same, the hill is scenery and the level is a lie.
const HILL_LIFT = 8;
const hillLv = terr.map((t,i)=>t.some(x=>x.k==='hill')?i:-1).filter(i=>i>=0);
let hillOk = hillLv.length>0;
for(const i of hillLv){ SG._begin(i);
  const deltas = SG._targets().map(t=>{ const w=SG._loft(t.i), f=SG._loft(t.i,true);
    return (w==null&&f!=null) ? Infinity : (w!=null&&f!=null) ? w-f : 0; });
  const best = Math.max(...deltas);
  const good = best>=HILL_LIFT; if(!good) hillOk=false;
  console.log(`${good?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} the hill lifts the arc it takes to win (+${best===Infinity?'blocks it entirely':best} flight time)`);
}
if(!hillOk) ok=false;

// A PIT hides a critter under the rim: its whole body sits below the ground
// line, so no shot along the flat can see it however hard it is thrown.
let pitHides = pitLv.length>0;
for(const i of pitLv){ SG._begin(i);
  const rim = SG._floorY(10);
  const down = SG._targets().filter(t=>t.y-17 > rim);
  const good = down.length>0; if(!good) pitHides=false;
  console.log(`${good?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} ${down.length} critter${down.length===1?'':'s'} sitting below the rim (ground y=${rim})`);
}
if(!pitHides) ok=false;

// A LEDGE stands the building off the floor with air underneath, so that taking
// ONE leg out brings the whole thing down instead of chipping a corner off it.
// That is a promise about what happens, so it is checked by making it happen:
// break a single wood leg, touch nothing else, and the critter riding the deck
// has to come down with it — a long way down, or off its perch altogether.
const ledgeLv = terr.map((t,i)=>t.some(x=>x.k==='ledge')?i:-1).filter(i=>i>=0);
let dropOk = ledgeLv.length>0;
for(const i of ledgeLv){
  SG._begin(i);
  const rider = SG._targets().reduce((a,b)=> b.y<a.y ? b : a);      // the one up on the deck
  const start = SG._blocks();
  let bestFall=0, popped=false;
  for(let b=0;b<start.length;b++){
    if(start[b].m!=='wood' || start[b].h<=start[b].w) continue;      // a leg, not a plank
    SG._begin(i);
    let broke=false;
    for(let h=0;h<40;h++){ const r=SG._hitBlock(b,20,2); if(r.broken){ broke=true; break; } }
    if(!broke) continue;
    SG._step(300);
    const after=SG._targets().find(t=>t.i===rider.i); if(!after) continue;
    if(!after.alive) popped=true; else bestFall=Math.max(bestFall, after.y-rider.y);
  }
  const good = popped || bestFall>=60; if(!good) dropOk=false;
  console.log(`${good?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} one leg out and the deck's critter comes down (${popped?'popped in the collapse':Math.round(bestFall)+'px'})`);
}
if(!dropOk) ok=false;

// --- 3e) SD3: levels 7-20 each ask for a different way to win -----------------
// A level's "ask" is the shape of its answer: the terrain it stands on, whether
// it hides a critter, and what its blocks are made of. Twelve identical towers
// with different names would be one ask repeated; these have to differ.
console.log('--- SD3: levels 7-20 each ask something different ---');
const askOf = i => { const l=cfg.levels[i];
  const t = kindsOf(terr[i]).join('+') || 'flat';
  const sealed = (l.targets||[]).filter(x=>x.s).length;
  const mats = [...new Set((l.blocks||[]).map(b=>b.m).filter(Boolean))].sort().join('/') || 'none';
  return `${t}|seal${sealed}|${mats}`; };
const asks = []; for(let i=6;i<n;i++) asks.push({ name:cfg.levels[i].name, ask:askOf(i) });
const distinct = [...new Set(asks.map(a=>a.ask))];
for(const a of asks) console.log(`   L${cfg.levels.findIndex(l=>l.name===a.name)+1} ${a.name.padEnd(16)} ${a.ask}`);
console.log(`${distinct.length>=8?'PASS':'FAIL'}  ${distinct.length} distinct asks across levels 7-${n} (want >= 8)`);
if(distinct.length<8) ok=false;
const commonest = Math.max(...distinct.map(d=>asks.filter(a=>a.ask===d).length));
console.log(`${commonest<=3?'PASS':'FAIL'}  no single ask is repeated more than 3 times (worst ${commonest})`);
if(commonest>3) ok=false;

// --- 3f) SD3: about one spare shot ------------------------------------------
// The old budget handed the back half four to seven spare slings, which is why
// it could be brute forced. Now difficulty buys the spare: 1-2 forgives a few
// bad shots so a six year old can finish the on-ramp, 3+ gives exactly one.
console.log('--- SD3: about one spare shot ---');
let budgetOk=true;
for(let i=0;i<n;i++){ const l=cfg.levels[i], spare=l.launches-l.targets.length;
  const want = l.difficulty<=1 ? 3 : l.difficulty<=2 ? 2 : 1;
  if(spare!==want){ budgetOk=false; console.log(`   FAIL L${i+1} ${l.name} d${l.difficulty} spare=${spare} want=${want}`); } }
console.log(`${budgetOk?'PASS':'FAIL'}  every level's budget is critters + the spare its difficulty buys`);
if(!budgetOk) ok=false;
const backHalfTight = cfg.levels.slice(6).every(l=>l.launches-l.targets.length===1);
console.log(`${backHalfTight?'PASS':'FAIL'}  levels 7-${n} give exactly one spare sling`);
if(!backHalfTight) ok=false;
const onrampKind = cfg.levels.slice(0,6).every(l=>l.launches-l.targets.length>=2);
console.log(`${onrampKind?'PASS':'FAIL'}  levels 1-6 still forgive two or more bad shots`);
if(!onrampKind) ok=false;
// and the bot must finish with something in hand, not on its very last sling
let noSpare=[];
for(let i=0;i<n;i++){ let worst=0;
  for(let t=0;t<3;t++){ const r=SG.sim(i,20000); worst=Math.max(worst,r.launchesUsed); }
  if(cfg.levels[i].launches-worst < 1) noSpare.push(`L${i+1} ${cfg.levels[i].name}`); }
console.log(`${noSpare.length===0?'PASS':'FAIL'}  the bot clears every level with a sling still in hand${noSpare.length?' :: '+noSpare.join(', '):''}`);
if(noSpare.length) ok=false;

// --- 3g) SD3: the level cards have to draw the ground too ---------------------
// The journey/level-select card is painted by the shared `towers` painter, which
// knew only about blocks and targets. A level that opens on a mountain, a hole
// or a plinth would have been advertised by a picture of a flat yard — so the
// painter is run for real here, on a context that records what it was asked to
// draw, and a terrain level has to produce strictly more drawing than the same
// level with its ground taken away.
console.log('--- SD3: level cards paint the terrain ---');
{
  const thumbSrc = read('buildable-levelthumb.js');
  const rec = () => { const calls=[]; const g=new Proxy({calls},{ get:(t,k)=>{
    if(k==='calls') return calls;
    if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:()=>{}});
    if(k==='measureText') return ()=>({width:10});
    if(typeof k==='string') return (...a)=>{ calls.push(k+':'+a.join(',')); };
    return undefined; }, set:()=>true }); return g; };
  const box={}; vm.runInContext(thumbSrc, (box.window=box, box.globalThis=box, vm.createContext(box), box));
  const P = box.BuildableLevelThumb && box.BuildableLevelThumb._painters;
  let paintOk = !!(P && P.towers);
  if(!paintOk) console.log('FAIL  towers painter not exposed');
  else {
    for(const i of withTerrain){
      const l=cfg.levels[i];
      const base={ blocks:l.blocks, targets:l.targets, sky:['#8fd0ff','#eaf8ff'], g0:'#73c364', g1:'#4e9a45', top:'#86d172', n:i+1 };
      let withT, without, threw=null;
      try{ const a=rec(); P.towers(a, Object.assign({}, base, { terrain:l.terrain })); withT=a.calls.length;
           const b=rec(); P.towers(b, base);                                        without=b.calls.length; }
      catch(e){ threw=e.message; }
      const good = !threw && withT>without;
      if(!good) paintOk=false;
      console.log(`${good?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(14)} card draws its ${[...new Set(terr[i].map(t=>t.k))].join('+')} (${threw?'THREW '+threw:`${withT} ops vs ${without} on flat ground`})`);
    }
    // and a level with no terrain must paint exactly as it always did
    const flat=cfg.levels[0];
    const base={ blocks:flat.blocks, targets:flat.targets, n:1 };
    const c1=rec(); P.towers(c1, base);
    const c2=rec(); P.towers(c2, Object.assign({}, base, { terrain:[] }));
    const same = c1.calls.join('|')===c2.calls.join('|');
    console.log(`${same?'PASS':'FAIL'}  a flat level's card is unchanged by the new painter`);
    if(!same) paintOk=false;
  }
  if(!paintOk) ok=false;
}

console.log('--- a clean run earns stars ---');
const s=SG.sim(0,20000); console.log(`stars(L1)=${s.stars}`);

console.log('--- render smoke ---');
SG._begin(Math.min(2,n-1)); SG._step(40); let d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  mid render: ${d}`); if(d!=='ok')ok=false;
SG._aimHeld(120,460); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  aim render: ${d}`); if(d!=='ok')ok=false;
SG.sim(0,20000); d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  win render: ${d}`); if(d!=='ok')ok=false;
// SD1 visuals: the cracked look and the shatter poof both have to paint. Crack a
// wood post without killing it, shatter the glass one, then draw the same frame.
if(trio>=0){ SG._begin(trio); SG._hitBlock(1,18,1); SG._hitBlock(0,18,1); SG._step(2);
  d=SG._draw(); console.log(`${d==='ok'?'PASS':'FAIL'}  cracked + shatter render: ${d}`); if(d!=='ok')ok=false; }

console.log(ok?'ALL CHECKS PASS':'SOME CHECKS FAILED'); process.exit(ok?0:1);
