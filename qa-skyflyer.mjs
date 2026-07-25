// Headless QA for Sky Flyer (Session FL2) — MANIFEST + CONTRACT + A REAL FLIGHT.
//
// Two halves:
//   1. STATIC   — the manifest validates through the shared loader, the three
//      worlds are real journey stops with goals, and the shipped engine carries
//      every cartridge-contract signal (wallet announce, pause/resume, nav
//      chrome, buddy, no lose state, no emojis, no hardcoded art).
//   2. FLIGHT   — the point of FL2: the QA robot switches on the engine's
//      autopilot and actually FLIES each of the three worlds in a headless DOM,
//      proving each one is beatable (coin goal + landing goal) with the same two
//      steering numbers a kid's finger produces. It also proves coins land in
//      the wallet, that pause really freezes, and that a bounce is never a fail.
//
// Run:  node qa-skyflyer.mjs .
// The flight half needs jsdom (`npm i jsdom`). Without it this script FAILS
// loudly rather than quietly reporting a pass it never earned.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// ---------------------------------------------------------------------------
// 1) MANIFEST through the shared loader
// ---------------------------------------------------------------------------
console.log('--- MANIFEST: /skyflyer/manifest.json through the shared loader ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const mText = read('public/skyflyer/manifest.json');
const manifest = JSON.parse(mText);
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('type is game, engine is canvas', manifest.type==='game' && manifest.engine==='canvas');
chk('entry points at the shipped engine', manifest.entry==='/skyflyer-engine.html');
chk('the shell draws a journey for it (not a board picker)', BM.landingKind(manifest)==='journey');
chk('three worlds = three journey stops', Array.isArray(manifest.levels) && manifest.levels.length===3, manifest.levels.map(l=>l.name).join(' > '));
chk('difficulty ramps 1,2,3', manifest.levels.every((l,i)=>l.difficulty===i+1), manifest.levels.map(l=>l.difficulty).join(','));
chk('every world declares a coin goal AND a landing goal (so it is beatable)',
  manifest.levels.every(l=>l.parts && l.parts.goalCoins>0 && l.parts.goalLandings>0),
  manifest.levels.map(l=>l.parts.goalCoins+'c/'+l.parts.goalLandings+'l').join('  '));
chk('goals grow world by world', manifest.levels[0].parts.goalCoins < manifest.levels[2].parts.goalCoins);
chk('coins feature on (shared wallet)', !!(manifest.features && manifest.features.coins));
chk('single player (multiplayer off)', manifest.features.multiplayer==='off');
// --- the hangar (Session FL3) ---
const hangar = (manifest.customization||[])[0] || { options:[] };
const rideOpts = hangar.options || [];
chk('the hangar is a manifest customization slot (shell-owned, priced in the shell)',
  Array.isArray(manifest.customization) && hangar.slot==='Ride' && rideOpts.length===3,
  rideOpts.map(o=>o.name+' @'+o.price).join(', '));
chk('the starter ride really is free (a kid can always fly)', rideOpts[0] && rideOpts[0].price===0);
chk('the two extra rides cost shared-wallet coins', rideOpts[1] && rideOpts[1].price>0 && rideOpts[2] && rideOpts[2].price>rideOpts[1].price,
  rideOpts.map(o=>o.price).join(' / '));
chk('the hangar is three DIFFERENT things, not one thing three colours',
  /copter/i.test(JSON.stringify(rideOpts)) && /jetpack/i.test(JSON.stringify(rideOpts)),
  rideOpts.map(o=>o.name).join(', '));
chk('every ride has a picture to show on its tile (no naked colour blocks)',
  rideOpts.every(o=>typeof o.preview==='string' && o.preview) && rideOpts.every(o=>typeof o.blurb==='string' && o.blurb),
  rideOpts.map(o=>o.preview).join(', '));
chk('the customization screen calls itself the Hangar', manifest.loadoutTitle==='Hangar' && /before takeoff/i.test(manifest.loadoutBlurb||''));
chk('no emojis in the manifest', !emoji.test(mText));
const cfg = v.ok ? BM.toEngineConfig(manifest) : { levels:[] };
chk('loader turns it into 3 engine levels', cfg.levels.length===3);

// ---------------------------------------------------------------------------
// 2) ENGINE: the cartridge contract, in the shipped file
// ---------------------------------------------------------------------------
console.log('--- CONTRACT: wallet, pause/resume, nav chrome, buddy, no lose state ---');
const html = read('public/skyflyer-engine.html');
chk('announces coins to the SHARED wallet, never touches shell storage',
  /buildable-wallet\.js/.test(html) && /BuildableWallet\.add\(/.test(html) && !/bk_wallet_v1/.test(html));
chk('banking happens on a landing (land to keep your coins)', /function finishLanding\(/.test(html) && /announceCoins\(n\)/.test(html));
chk('honors the shell pause and resume messages', /kind==="pause"/.test(html) && /kind==="resume"/.test(html));
chk('registers the shared nav chrome (shell draws Home + Sound + Help)', /BuildableGameNav\.register\(/.test(html));
chk('does NOT offer a second level menu (the shell journey is the picker)', !/onMenu\s*:/.test(html));
chk('reports buddy moments (win / levelup)', /buddy\("win"\)/.test(html) && /buddy\("levelup"\)/.test(html));
chk('reads the world from ?level= (refresh-safe deep link)', /Q\.get\("level"\)/.test(html));
chk('reads the equipped ride from ?ride= (the shell owns the choice)', /Q\.get\("ride"\)/.test(html));
chk('has an attract demo for the landing card (?screen=demo)', /Q\.get\("screen"\)==="demo"/.test(html));
chk('autopilot flag for the QA robot (?auto=1)', /Q\.get\("auto"\)==="1"/.test(html));
chk('exposes the SKY handle with tick + autopilot + beaten', /window\.SKY\s*=/.test(html) && /tick:/.test(html) && /autopilot:/.test(html) && /beaten:/.test(html));
chk('a crash is a SOFT BOUNCE, never a fail state', /soft bounce/.test(html) && !/game over/i.test(html) && !/you lose/i.test(html));
chk('three worlds are declared in the engine', /sunny-islands/.test(html) && /snowy-peaks/.test(html) && /sunset-canyon/.test(html));
chk('three rides are declared in the engine (the hangar)', /RIDES=\[/.test(html) && (html.match(/id:"(puffin|copter|jetpack)"/g)||[]).length===3);
chk('each ride has its own body builder, not one mesh recoloured',
  /function buildPlane\(/.test(html) && /function buildCopter\(/.test(html) && /function buildJetpack\(/.test(html));
chk('each ride animates its own moving parts (propeller / rotors / jet flames)',
  /rideAnim\(dt,S\.mode,time\)/.test(html) && /rotor\.rotation\.y/.test(html) && /flameMat/.test(html));
chk('the ride drives the FEEL (turn, lean, bob), read from the ride not hardcoded',
  /S\.dx\*ride\.turn/.test(html) && /-S\.dx\*ride\.bankAmt/.test(html) && /Math\.sin\(time\*ride\.bobRate\)\*ride\.bob/.test(html));
chk('the autopilot turn circle follows the ride (a copter cuts inside a jetpack)',
  /TURN_R=46\*\(\(ride\.speed\/ride\.turn\)\/20\)/.test(html));
chk('the engine names the ride on screen (pick your ride, before takeoff)',
  /rideNameEl\.textContent=ride\.name/.test(html) && /function showRideName\(/.test(html));
chk('the engine still never learns a price (the shell owns the wallet)',
  !/price/i.test(html.slice(html.indexOf('var RIDES=['), html.indexOf('var ride=RIDES'))));
chk('progress saves in the shape the shell journey reads', /bk_skyflyer_prefs/.test(html));
chk('no baked-in art URLs (art rule)', !/https?:\/\/[^"'\s]+\.(png|jpg|jpeg|webp)/i.test(html));
chk('no emojis in the engine', !emoji.test(html));

// ---------------------------------------------------------------------------
// 3) SHELL + ROUTING wiring
// ---------------------------------------------------------------------------
console.log('--- SHELL: catalog + landing + journey + routes ---');
const jsx = read('src/BuildableKids.jsx');
chk('Sky Flyer is in the picker catalog', /id:\s*"skyflyer"/.test(jsx));
chk('routed through the shared landing + journey + loadout', /skyflyer:\s*\{\s*play:\s*SCREEN_SKYFLYER,\s*loadout:\s*true,\s*journey:\s*true/.test(jsx));
chk('the screen hands the engine the world and the ride', /SkyFlyerScreen/.test(jsx) && /readEquipped\("skyflyer"\)/.test(jsx) && /"&level="/.test(jsx));
chk('a ride bought before FL3 is not lost when the slot was renamed',
  /eq\.Ride === "number" \? eq\.Ride : \(typeof eq\.Plane === "number" \? eq\.Plane : 0\)/.test(jsx));
chk('the hangar tiles draw a real picture of each ride (SVG geometry, no emoji)',
  /const SLOT_PREVIEWS = \{/.test(jsx) && rideOpts.every(o=>jsx.indexOf('"'+o.preview+'"')>-1) && /function SlotPreview\(/.test(jsx));
chk('the loadout screen takes its title from the manifest (so it can be a Hangar)',
  /manifest\.loadoutTitle\) \|\| "Loadout"/.test(jsx) && /manifest\.loadoutBlurb\)/.test(jsx));
chk('no emojis in the shell hangar previews', !emoji.test(jsx.slice(jsx.indexOf('const SLOT_PREVIEWS'), jsx.indexOf('function SlotPreview'))));
chk('journey progress reads the default bk_{game}_prefs shape', /bk_"\s*\+\s*id\s*\+\s*"_prefs/.test(jsx));
const vercel = JSON.parse(read('vercel.json'));
const srcs = vercel.routes.map(r=>r.src);
const catchAll = srcs.indexOf('/(.*)');
const engineRoute = srcs.indexOf('/skyflyer-engine.html');
const manRoute = srcs.indexOf('/skyflyer/manifest.json');
chk('engine has a vercel route BEFORE the landing catch-all', engineRoute>-1 && engineRoute<catchAll, 'engine@'+engineRoute+' catchAll@'+catchAll);
chk('manifest has a vercel route before the catch-all', manRoute>-1 && manRoute<catchAll);
chk('short /skyflyer link works too', srcs.indexOf('/skyflyer')>-1 && srcs.indexOf('/skyflyer')<catchAll);
chk('the shared loader knows the skyflyer level profile', /skyflyer:\s*crocProfile/.test(read('public/buildable-manifest.js')));

// ---------------------------------------------------------------------------
// 4) THE FLIGHT PROOF — the robot flies all three worlds for real
// ---------------------------------------------------------------------------
console.log('--- FLIGHT: autopilot proves every world beatable ---');
let JSDOM = null;
try { ({ JSDOM } = await import('jsdom')); } catch (e) { JSDOM = null; }
if (!JSDOM) {
  chk('flight proof ran (needs jsdom: npm i jsdom)', false, 'jsdom not installed — the autopilot half of this harness DID NOT RUN');
} else {
  // inline the shared scripts so the page runs with no server
  const page = html.replace(/<script src="\/([^"]+)"><\/script>/g, (m, f) => {
    const p = dir + '/public/' + f;
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : '';
  });
  const fly = (level, params='') => {
    const dom = new JSDOM(page, { runScripts:'dangerously', pretendToBeVisual:false,
      url:'https://buildablekids.com/skyflyer-engine.html?level='+level+'&auto=1&nodraw=1&manual=1'+params });
    return dom;
  };
  const MAX = 9000;                       // 300 simulated seconds per world
  for (let i = 0; i < 3; i++) {
    const dom = fly(i);
    const w = dom.window;
    if (!w.SKY) { chk('world '+i+' engine booted', false, 'no SKY handle'); continue; }
    const name = w.SKY.world.name, goals = w.SKY.goals;
    let t = 0;
    for (; t < MAX; t++) { w.SKY.tick(1/30); if (w.SKY.beaten()) break; }
    const s = w.SKY.snapshot();
    chk('world '+i+' "'+name+'" BEATEN by autopilot', s.beaten,
      'goal '+goals.coins+' coins + '+goals.landings+' landings  ->  got '+s.worldCoins+' coins, '+s.landings+' landings in '+(t/30).toFixed(0)+'s of flight');
    chk('world '+i+' banked its coins into the wallet', s.banked>0 && (w.BuildableWallet.balance()>0), 'banked='+s.banked+' wallet='+w.BuildableWallet.balance());
    chk('world '+i+' unlocked the journey stop after it', (()=>{ try{ const p=JSON.parse(w.localStorage.getItem('bk_skyflyer_prefs')||'{}'); return p.stars && p.stars[i]===3; }catch(e){ return false; } })());
    // the sky never ends: keep flying long after the goal, still no fail state
    for (let k=0;k<3000;k++) w.SKY.tick(1/30);
    const after = w.SKY.snapshot();
    chk('world '+i+' keeps flying forever after the goal', ['fly','landing','landed','takeoff'].indexOf(after.mode)>-1 && after.worldCoins>=s.worldCoins);
    w.close();
  }
  // pause really freezes
  const dom = fly(0);
  const w = dom.window;
  for (let k=0;k<60;k++) w.SKY.tick(1/30);
  w.postMessage({ source:'buildable', type:'pause' }, '*');
  await new Promise(r=>setTimeout(r,0));
  const before = w.SKY.snapshot();
  for (let k=0;k<120;k++) w.SKY.tick(1/30);
  const during = w.SKY.snapshot();
  chk('pause freezes the plane on the spot', Math.abs(before.x-during.x)<0.001 && Math.abs(before.z-during.z)<0.001, 'moved '+Math.hypot(before.x-during.x,before.z-during.z).toFixed(4));
  w.postMessage({ source:'buildable', type:'resume' }, '*');
  await new Promise(r=>setTimeout(r,0));
  for (let k=0;k<60;k++) w.SKY.tick(1/30);
  const after = w.SKY.snapshot();
  chk('resume carries on exactly where it stopped', Math.hypot(after.x-during.x, after.z-during.z) > 1);
  w.close();
  // ------------------------------------------------------------------
  // THE HANGAR PROOF (Session FL3) — every ride in the hangar has to be a
  // real, flyable, world-beating ride. If a kid spends 120 coins on the
  // Jetpack Kid and it turns too wide to ever meet a coin goal, that is the
  // worst bug this game could have, so the robot buys each one and flies it.
  // ------------------------------------------------------------------
  console.log('--- HANGAR: every ride flies, and no ride is the "good" ride ---');
  const flown = [];
  for (let r = 0; r < 3; r++) {
    const dr = fly(0, '&ride=' + r);
    const wr = dr.window;
    if (!wr.SKY) { chk('ride '+r+' booted', false, 'no SKY handle'); continue; }
    const rd = wr.SKY.ride;
    chk('ride '+r+' is "'+rd.name+'" and has its own body + feel',
      rd.id === ['puffin','copter','jetpack'][r] && typeof rd.build === 'string' && typeof rd.turn === 'number',
      rd.build+'  speed '+rd.speed+'  turn '+rd.turn);
    chk('ride '+r+' "'+rd.name+'" matches the name the shell sells in the hangar',
      rideOpts[r] && rideOpts[r].name === rd.name, 'hangar says "'+(rideOpts[r]||{}).name+'"');
    let tr = 0;
    for (; tr < MAX; tr++) { wr.SKY.tick(1/30); if (wr.SKY.beaten()) break; }
    const sr = wr.SKY.snapshot();
    chk('ride '+r+' "'+rd.name+'" BEATS Sunny Islands (the ride is a look, not a handicap)', sr.beaten,
      sr.worldCoins+' coins, '+sr.landings+' landings in '+(tr/30).toFixed(0)+'s of flight');
    chk('ride '+r+' "'+rd.name+'" banks its coins into the SAME shared wallet',
      sr.banked>0 && wr.BuildableWallet.balance()>0, 'banked='+sr.banked);
    flown.push({ id: rd.id, name: rd.name, secs: tr/30, circle: rd.speed/rd.turn, coins: sr.worldCoins });
    wr.close();
  }
  // no ride may be strictly better: the fast one must turn wider than the slow one
  if (flown.length === 3) {
    const fast = flown.find(f=>f.id==='jetpack'), nimble = flown.find(f=>f.id==='copter');
    chk('the fast ride pays for it with a wider turn (no pay-to-win ride)',
      fast && nimble && fast.circle > nimble.circle,
      flown.map(f=>f.name+' turn circle '+f.circle.toFixed(0)).join('  |  '));
    const best = Math.min(...flown.map(f=>f.secs)), worst = Math.max(...flown.map(f=>f.secs));
    chk('no ride is more than 3x faster at the same goal (they are looks, not power)',
      worst <= best * 3, flown.map(f=>f.name+' '+f.secs.toFixed(0)+'s').join('  |  '));
  }
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok?0:1);
