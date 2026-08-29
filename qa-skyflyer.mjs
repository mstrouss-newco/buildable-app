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
chk('reports buddy moments (win / levelup)', /buddyMoment\("win","win"/.test(html) && /buddy\("levelup"\)/.test(html));
chk('reads the world from ?level= (refresh-safe deep link)', /Q\.get\("level"\)/.test(html));
chk('reads the equipped ride from ?ride= (the shell owns the choice)', /Q\.get\("ride"\)/.test(html));
chk('has an attract demo for the landing card (?screen=demo)', /Q\.get\("screen"\)==="demo"/.test(html));
chk('autopilot flag for the QA robot (?auto=1)', /Q\.get\("auto"\)==="1"/.test(html));
chk('exposes the SKY handle with tick + autopilot + beaten', /window\.SKY\s*=/.test(html) && /tick:/.test(html) && /autopilot:/.test(html) && /beaten:/.test(html));
chk('a crash is a SOFT BOUNCE, never a fail state', /soft bounce/.test(html) && !/game over/i.test(html) && !/you lose/i.test(html));
chk('three worlds are declared in the engine', /sunny-islands/.test(html) && /snowy-peaks/.test(html) && /sunset-canyon/.test(html));
// FL6 rewrote this rather than deleting it: TRANSFORMS also carries id:"puffin",
// so counting ids across the whole file now finds four and would have passed on
// a hangar that had lost a ride. Count inside the RIDES block only.
const RIDES_SRC = html.slice(html.indexOf('var RIDES=['), html.indexOf('var ride=RIDES['));
chk('three rides are declared in the engine (the hangar)',
  /var RIDES=\[/.test(html) && (RIDES_SRC.match(/id:"(puffin|copter|jetpack)"/g)||[]).length===3,
  (RIDES_SRC.match(/id:"[a-z]+"/g)||[]).join(' '));
chk('each ride has its own body builder, not one mesh recoloured',
  /function buildPlane\(/.test(html) && /function buildCopter\(/.test(html) && /function buildJetpack\(/.test(html));
chk('each ride animates its own moving parts (propeller / rotors / jet flames)',
  /rideAnim\(dt,S\.mode,time\)/.test(html) && /rotor\.rotation\.y/.test(html) && /flameMat/.test(html));
// FL6: the five feel numbers are now read through FEEL_NOW, which IS the ride
// until a quest lends you a body. Rewritten to pin the new name AND to prove the
// flight model no longer reads `ride` directly — if it did, a transform would be
// a costume with the plane's handling underneath it.
chk('the ride drives the FEEL (turn, lean, bob), read from what is flying, not hardcoded',
  /S\.dx\*FEEL_NOW\.turn/.test(html) && /-S\.dx\*FEEL_NOW\.bankAmt/.test(html) &&
  /Math\.sin\(time\*FEEL_NOW\.bobRate\)\*FEEL_NOW\.bob/.test(html) &&
  /var FEEL_NOW=ride;/.test(html));
chk('...and the flight model reads NOTHING off `ride` any more (or a body swap is a costume)',
  (function(){ const step = html.slice(html.indexOf('function stepSim(dt){'), html.indexOf('updateChunks(S.pos.x,S.pos.z);'));
    return !/\bride\.(speed|turn|bankAmt|pitchAmt|bob|bobRate)\b/.test(step); })());
chk('the autopilot turn circle follows what is flying (a copter cuts inside a jetpack)',
  /function turnR\(\)\{ return 46\*\(\(FEEL_NOW\.speed\/FEEL_NOW\.turn\)\/20\); \}/.test(html));
chk('the engine names the ride on screen (pick your ride, before takeoff)',
  /rideNameEl\.textContent=ride\.name/.test(html) && /function showRideName\(/.test(html));
chk('the engine still never learns a price (the shell owns the wallet)',
  !/price/i.test(html.slice(html.indexOf('var RIDES=['), html.indexOf('var ride=RIDES'))));
chk('progress saves in the shape the shell journey reads', /bk_skyflyer_prefs/.test(html));
chk('no baked-in art URLs (art rule)', !/https?:\/\/[^"'\s]+\.(png|jpg|jpeg|webp)/i.test(html));
chk('no emojis in the engine', !emoji.test(html));

// ---------------------------------------------------------------------------
// 2b) FL4 POLISH + LEARNING — sound, music, manifest colours, buddy, gate
// ---------------------------------------------------------------------------
console.log('--- FL4: Feel Kit sound, music slot, manifest colours, buddy, learning ---');
const sfxSrc  = read('api/sfx.js');
const musSrc  = read('api/library-music.js');
const imgSrc  = read('api/images.js');
chk('the engine loads the shared Feel Kit + shared audio (no bespoke juice)',
  /buildable-feel\.js/.test(html) && /buildable-audio\.js/.test(html));
// GAME-FEEL law 6 is about SOUND EFFECTS: a game triggers palette names and
// never synthesises a tone. FL5b added SPOKEN WORDS, which are a different
// thing and belong to the shared narration library (/api/say), exactly as
// Castle Guard and Bingo already play it — through one <audio> element. So the
// ban stays absolute for effects, and the ONE audio element allowed has to be
// the narration one and nothing else.
chk('every sound EFFECT is a PALETTE NAME through the Kit, never a raw tone (GAME-FEEL law 6)',
  /FEEL\.sfx\(name,opt\)/.test(html) && !/oscillator/i.test(html) &&
  !/new Audio\(\)[^]{0,400}?\/api\/sfx/.test(html));
chk('the only raw audio element in the file is the shared narration library',
  (html.match(/new Audio\(/g)||[]).length===1 && /_sayEl=new Audio\(\)/.test(html) &&
  /_sayEl\.src="\/api\/say\?t="/.test(html));
chk('the Kit is configured from the manifest feel presets', /FEEL\.configure\(\{/.test(html) && /sfxBase:"\/api\/sfx\?s="/.test(html));
const skyKeys = (html.match(/"(sky_[a-z]+)"/g)||[]).map(s=>s.replace(/"/g,''));
chk('Sky Flyer created its OWN sounds (a new engine type grows the library)',
  skyKeys.length>=6 && skyKeys.every(k=>new RegExp('\\b'+k+':').test(sfxSrc)),
  [...new Set(skyKeys)].join(', '));
chk('those sounds are registered in the shared audio catalog for every project to reuse',
  /sky_coin:\s*"flight"/.test(read('api/list-audio.js')));
chk('the music bed is a MANIFEST SLOT, not a hardcoded track',
  !!(manifest.audio && manifest.audio.music) && /audio\.music/.test(html) && /library-music\?name=/.test(html));
const musicNames = [manifest.audio.music, ...manifest.levels.map(l=>l.music).filter(Boolean)];
chk('every music track the manifest names really exists in the shared library',
  musicNames.every(n=>new RegExp('\\b'+n+':\\s*\\{').test(musSrc)), [...new Set(musicNames)].join(', '));
chk('at least one world picks its own mood (proves the per-level music slot works)',
  new Set(manifest.levels.map(l=>l.music)).size>1);
chk('sky and world colours are a manifest art slot on EVERY world',
  manifest.levels.every(l=>l.palette && l.palette.sky && l.palette.ground && l.palette.rock),
  manifest.levels.map(l=>l.palette.sky).join(' '));
chk('the engine repaints itself from that palette (colours editable with no code)',
  /function applyPalette\(/.test(html) && /fetch\("\/skyflyer\/manifest\.json"\)/.test(html));
chk('a half-filled palette can never break a world (missing keys keep the built-in colour)',
  /if\(c==null\|\|!mat\|\|!mat\.color\) return;/.test(html));
chk('buddy moments are rare and specific, not chatter (once each, floor between them)',
  /function buddyMoment\(/.test(html) && /buddySaid\[id\]/.test(html) && /\(time-buddyLastAt\)<12/.test(html));
chk('the win moment goes through the Kit celebration (one shared win everywhere)',
  /FEEL\.celebrate\(W,H\)/.test(html) && /haptic\("success"\)/.test(html));
chk('learning: beforeUnlock is declared ON in the manifest', !!(manifest.features.learning||{}).beforeUnlock);
chk('learning: coinTopUp stays on (practising can always earn coins)', (manifest.features.learning||{}).coinTopUp !== false);
chk('the engine ASKS the shell before the next world unlocks (parent toggle wins)',
  /kind:"quizRequest"/.test(html) && /moment:"beforeUnlock"/.test(html) && /gameType:"skyflyer"/.test(html));
chk('beating a world and unlocking the next are now separate (the gate sits between)',
  /function markBeaten\(/.test(html) && /function markUnlockNext\(/.test(html) && /kind==="bk:quizDone"/.test(html));
chk('journey badges are real art URLs on every world (not a colour circle)',
  manifest.levels.every(l=>/^\/api\/images\?kind=skybadge&id=/.test(l.journeyBadge||'')),
  manifest.levels.map(l=>l.journeyBadge).join('  '));
chk('the picker card has badge + hero art wired through the manifest',
  /^\//.test(manifest.art.badge||'') && /^\//.test(manifest.art.hero||''));
chk('every badge the manifest asks for has a prompt in the art library',
  [...manifest.levels.map(l=>l.journeyBadge), manifest.art.badge]
    .map(u=>(String(u).match(/id=([a-z0-9-]+)/)||[])[1])
    .every(id=>id && new RegExp('"'+id+'":').test(imgSrc.slice(imgSrc.indexOf('kind === "skybadge"'), imgSrc.indexOf('kind === "explore"')))));

// ---------------------------------------------------------------------------
// 2c) FL5 MISSIONS — one engine, four jobs, and a law that nothing can be failed
// ---------------------------------------------------------------------------
console.log('--- FL5: missions mode, aircraft jobs, no fail state ---');
const JOB_IDS = ['mail-run','supply-drop','lost-explorer','lantern-lighter'];
// FL6: a transform quest is a job with a body, so it lives in the same table and
// is proved by the same harness. Kept as its own list only because the extra
// things worth checking about one (the body, the feel swap, the gathering flow)
// do not apply to a plain job.
const FL6_QUEST_IDS = ['busy-bee','puffin-parent','hummingbird-hover'];
const FL7_QUEST_IDS = ['goose-squad','owl-night-flight','eagle-glider'];
const QUEST_IDS = FL6_QUEST_IDS.concat(FL7_QUEST_IDS);
// How many bodies the engine declares. Every per-body assertion below counts
// THIS rather than the 3 it was born with — FL7 added three more and every one
// of those checks failed on the number instead of on the thing it was guarding.
const BODY_IDS = (function(){
  const T = html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform('));
  return (T.match(/id:"[a-z-]+"/g)||[]).map(x=>x.slice(4,-1));
})();
chk('a job is something you FIND: its start point stands in the world under a beam',
  /function showScouts\(/.test(html) && /function buildScoutFor\(/.test(html) && /function jobStartPoint\(/.test(html));
chk('nothing starts without a tap - swooping over one only ASKS',
  /function scoutStep\(/.test(html) && /function openOffer\(/.test(html) && /id="offerCard"/.test(html) &&
  /id="ofStart"/.test(html) && /id="ofNo"/.test(html));
chk('there is no card on arrival any more (you are just flying)', !/modeCard|openModeCard/.test(html));
chk('saying no is remembered for a moment, so the same dock never nags',
  /declined\[m\.id\]=time/.test(html) && /\(time-declined\[m\.id\]\)<20/.test(html));
chk('leaving a job is one tap, costs nothing, and puts the jobs back in the world',
  /function leaveJob\(/.test(html) && /id="leaveJob"/.test(html) && /showScouts\(\);\s*\n\s*paintGoals\(\);/.test(html));
chk('a job never adds a second LEVEL picker (the shell journey is still the one)',
  !/onMenu\s*:/.test(html));
chk('a quiet list under the help button can show a kid where a job is',
  /function paintHelpJobs\(/.test(html) && /id="helpJobs"/.test(html) && /guideJob=m/.test(html));
chk('being shown a job can never drag the QA robot off course (autopilot ignores it)',
  /function arrowTarget\(/.test(html) && /var ob=arrowTarget\(\);/.test(html) &&
  /var ob=jobObjective\(\);\n  if\(ob\)\{\n    var jgx/.test(html));
chk('there is ONE mission engine, not four little ones',
  /function jobStep\(/.test(html) && /function startJob\(/.test(html) && /function deliverTo\(/.test(html) &&
  (html.match(/function jobStep\(/g)||[]).length===1);
chk('all four aircraft jobs are declared as recipes', JOB_IDS.every(id=>new RegExp('id:"'+id+'"').test(html)), JOB_IDS.join(', '));
chk('a recipe is DATA, so a new job is a data edit and no new code',
  /var MISSIONS=\[/.test(html) && /function mergeMissions\(/.test(html));
chk('every job answers the five questions (world, what you carry, where from, where to, one fact)',
  /world:"sunny-islands", name:"Mail Run"/.test(html) &&
  /cargo:\{name:"letter"/.test(html) && /depot:\{x:0,z:-190,label:"Post Dock"/.test(html) &&
  (html.match(/fact:"/g)||[]).length>=4 && (html.match(/targets:\[/g)||[]).length>=4);
// Looks for the CODE shapes a fail state needs (a countdown, a life counter, an
// expiry), not the English words - the file says out loud that it has none of
// them, and a prose ban would only ban talking about it.
chk('THE FL5 LAW: no job can be failed - no timer, no lives, no expiry anywhere',
  !/\b(timeLeft|timeLimit|timer|countdown|lives|attemptsLeft|expiresAt)\s*[:=]/.test(html) &&
  !/game over/i.test(html) && !/you lose/i.test(html) && /NOTHING HERE CAN FAIL/.test(html));
chk('dropped things respawn: the depot never runs out, so flying off mid-job costs nothing',
  /The dock NEVER runs out/.test(html) && /JS\.carrying<JOB\.capacity/.test(html));
chk('the controls never change (still one finger, drag to steer)',
  /function pdown\(/.test(html) && !/keydown/.test(html) && /S\.dx=clamp\(/.test(html));
chk('a job adds exactly one arrow pointing at the next thing to do',
  /function jobObjective\(/.test(html) && /arrowLbl\.textContent=aimLabel/.test(html));
chk('one job asks you to hover, and the tight-turning ride is the one it suits',
  /hold:2\.6/.test(html) && /Rescue Copter is made for this/.test(html));
chk('every job ends with a Did You Know card, coins to the SHARED wallet and a badge sticker',
  /function showFactCard\(/.test(html) && /announceCoins\(JOB\.coins\)/.test(html) &&
  /markBadge\(JOB\.id\)/.test(html) && /function badgeSticker\(/.test(html));
// FL10: the do-it-again / keep-flying MENU is gone. A four-year-old cannot pick
// between two nearly-identical buttons at the end of a small win, so the reward
// beat plays and then drops back to free flight on its own. The quest is still
// standing in the world; playing it again is finding it and saying yes, exactly
// like finding it the first time. The card is a beat, not a decision.
chk('FL10: no end-of-quest menu - no Do it again, no Keep flying buttons',
  !/Do it again/.test(html) && !/Keep flying/.test(html) &&
  !/id="fcAgain"/.test(html) && !/id="fcFree"/.test(html) &&
  !/fcAgain\s*=\s*D\.getElementById/.test(html) && !/fcFree\s*=\s*D\.getElementById/.test(html));
chk('FL10: the reward card closes on its own after a beat, then drops back into free flight',
  /function endFactCard\(/.test(html) && /setTimeout\(endFactCard,\s*FACT_BEAT_MS\)/.test(html) &&
  // endFactCard is the single close path: it clears the timer, marks the quest
  // as asked-recently and calls endJob so the world is free-flight again.
  /endFactCard[\s\S]{0,180}closeFactCard\(\);\s*endJob\(\)/.test(html));
chk('FL10: a tap on the reward card skips the beat (in case the grown-up is done)',
  /factCard\.addEventListener\("click",\s*function\(\)\{\s*endFactCard\(\)/.test(html));
chk('FL10: the just-finished quest is still there to be found again',
  // endJob rebuilds every scout from WORLD_JOBS - the quest that just finished
  // is one of them, so the beam is back in the sky the moment the card closes.
  /function endJob\([\s\S]{0,1200}showScouts\(\)/.test(html) &&
  /function showScouts\([\s\S]{0,600}WORLD_JOBS\.forEach/.test(html));
chk('badges are kept per kid, in the same prefs the journey already reads',
  /p\.badges\[id\]=true/.test(html) && /bk_skyflyer_prefs/.test(html));
chk('a job can be deep-linked and survives a refresh (?mission=)', /Q\.get\("mission"\)/.test(html) && /Q\.get\("mode"\)/.test(html));
chk('the three new job sounds are palette names through the Kit, and really exist',
  /pickup:\s*"sky_pickup"/.test(html) && /deliver:\s*"sky_deliver"/.test(html) && /mission:\s*"sky_mission"/.test(html) &&
  ['sky_pickup','sky_deliver','sky_mission'].every(k=>new RegExp('\\b'+k+':').test(sfxSrc)));
chk('the new sounds are registered in the shared catalog for any delivery game to reuse',
  /sky_pickup:\s*"flight"/.test(read('api/list-audio.js')) && /sky_deliver:\s*"flight"/.test(read('api/list-audio.js')));
chk('the manifest declares missions and every world carries its jobs',
  manifest.features.missions === true && manifest.levels.every(l=>Array.isArray(l.missions) && l.missions.length>0),
  manifest.levels.map(l=>l.name+': '+l.missions.map(m=>m.id).join('+')).join('  |  '));
const mfJobs = manifest.levels.flatMap(l=>l.missions);
chk('every job the manifest names is a real recipe in the engine',
  mfJobs.every(m=>JOB_IDS.indexOf(m.id)>-1) && mfJobs.length===4, mfJobs.map(m=>m.id).join(', '));
chk('every job carries a fun fact, a badge and a price in the manifest (all editable with no code)',
  mfJobs.every(m=>typeof m.fact==='string' && m.fact.length>40 && m.badge && m.coins>0),
  mfJobs.map(m=>m.badge+' @'+m.coins).join(', '));
chk('the new job sounds are listed in the manifest audio slot',
  ['sky_pickup','sky_deliver','sky_mission'].every(s=>manifest.audio.sfx.indexOf(s)>-1));
chk('no emojis anywhere in the jobs', !emoji.test(mText) && !emoji.test(html));

// ---------------------------------------------------------------------------
// 2d) FL5b MISSIONS A NON-READER CAN PLAY — pictures instead of words
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  FL6 STATIC — the transform bodies and the quests that lend them out
// ---------------------------------------------------------------------------
console.log('--- FL6: transform quests (a body + a recipe) ---');
chk('three bodies are declared, separately from the three rides',
  /var TRANSFORMS=\[/.test(html) &&
  (function(){ const T = html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform('));
    return ['bee','puffin','hummingbird'].every(id=>new RegExp('id:"'+id+'"').test(T)); })());
chk('a body signs the SAME FL3 contract a ride does (a look plus a feel, never power)',
  (function(){ const T = html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform('));
    return BODY_IDS.length >= 3 && ['speed','turn','bankAmt','pitchAmt','bob','bobRate'].every(k=>
      (T.match(new RegExp(k+':','g'))||[]).length === BODY_IDS.length); })(),
  BODY_IDS.length+' bodies, each signing all six feel numbers');
chk('no body is THE good body: the fast one turns wide and the nimble one is slow',
  (function(){ const T = html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform('));
    const sp = (T.match(/speed:(\d+)/g)||[]).map(x=>+x.split(':')[1]);
    const tn = (T.match(/turn:([\d.]+)/g)||[]).map(x=>+x.split(':')[1]);
    if (sp.length!==BODY_IDS.length) return false;
    const fast = sp.indexOf(Math.max(...sp)), nimble = tn.indexOf(Math.max(...tn));
    // and the real anti-dominance claim, now that there are six: NOBODY is top
    // of both lists, and the fastest body is in the slowest half for turning.
    const rank = [...tn].sort((a,b)=>b-a).indexOf(tn[fast]);
    return fast !== nimble && rank >= Math.floor(BODY_IDS.length/2); })(),
  BODY_IDS.length+' bodies: fastest is '+BODY_IDS[(function(){const T=html.slice(html.indexOf('var TRANSFORMS=['),html.indexOf('function findTransform('));const sp=(T.match(/speed:(\d+)/g)||[]).map(x=>+x.split(':')[1]);return sp.indexOf(Math.max(...sp));})()]);
// AR1R's lesson, made a rule: a bird a kid is INSIDE, seen from an arm's length
// behind, cannot be four vertices in a V. These are real models.
chk('the bodies are REAL MODELS out of the animal library, not primitives in a V',
  fs.existsSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb') &&
  /TB_URL="\/models\/skyflyer\/animals\/flyer-bodies\.glb"/.test(html) &&
  /model:"Bee"/.test(html) && /model:"Hummingbird"/.test(html) && /model:"Gull"/.test(html));
chk('...and the little glb really carries Bee, Hummingbird and Gull with COLOR_0 on each',
  (function(){
    const d = fs.readFileSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb');
    const len = d.readUInt32LE(12);
    const j = JSON.parse(d.subarray(20, 20+len).toString('utf8'));
    const names = j.nodes.map(n=>n.name);
    const everyPrimHasColour = j.meshes.every(m=>m.primitives.every(p=>p.attributes.COLOR_0!=null));
    return ['Bee','Hummingbird','Gull'].every(n=>names.includes(n)) && everyPrimHasColour &&
      d.length < 400000;              // a body kit, never the 12.8MB library
  })(),
  (fs.statSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb').size/1024).toFixed(0)+'KB');
chk('the cut is a script in the repo, so the next body is one command away',
  fs.existsSync(dir+'/scripts/cut-animal-subset.mjs') &&
  /COLOR_0/.test(read('scripts/cut-animal-subset.mjs')));
chk('the wingbeat is written in CODE, because nothing in the file has a bone',
  /function tbRig\(mesh\)/.test(html) && /function tbBeat\(R,amp,t\)/.test(html) &&
  /if\(TB_ANIM\) TB_ANIM\(dt,S\.mode,time\)/.test(html));
chk('...and the body gets its OWN geometry, or every bee in the world flaps with it',
  /flat\.geometry=flat\.geometry\.clone\(\);/.test(html));
chk('the fast wings wear a blur, the way the propeller does (50 beats a second cannot be drawn)',
  /function tbBlur\(/.test(html) && /blur:true/.test(html) && /blur:false/.test(html));
chk('there is no puffin in the library, so the gull is REPAINTED into one and given the beak',
  /function tbRepaint\(mesh,rule\)/.test(html) && /rule!=="puffin"/.test(html) &&
  /puffinBeak/.test(html) && /function tbExtras\(kind,D\)/.test(html) &&
  /function tbShortenWings\(geo,amount\)/.test(html) && /wingShort:0\.45/.test(html));
// The trap this cost an afternoon to find: everything bolted on used to be sized
// off the model's LONGEST dimension, which on a bird IS THE WINGSPAN, so the
// beak came out floating a wingspan in front of the face.
chk('...and a beak, a scarf and a wing blur are all sized off the BODY, never the wingspan',
  /wrap\.userData\.dims=\{/.test(html) &&
  (function(){ const parts = html.slice(html.indexOf('function tbExtras(kind,D){'), html.indexOf('function tbRig(mesh){'));
    return /D\.lenZ/.test(parts) && !/D\.halfX/.test(parts.slice(0, parts.indexOf('function tbBlur'))); })());
chk('the kid\'s own ride is still on show under the feathers (its palette slots come along)',
  /function tbTrim\(D\)/.test(html) && /color:ride\.body/.test(html) && /color:ride\.trim/.test(html));
chk('what you are carrying is scaled to the BODY, not left at aeroplane size',
  /cargoGroup\.scale\.setScalar\(k\);/.test(html) && /var k=t\.size\/10;/.test(html) &&
  /cargoAt:\[2\.6,1\.9\]/.test(html));    // the puffin's row of fish rides in the beak
chk('the creature on the GO pill is drawn SIDE ON, like every ride glyph beside it',
  (function(){ const g = html.slice(html.indexOf('function icoCreature(n,glyph){'), html.indexOf('function icoGo(n,m){'));
    const boxes = g.match(/viewBox="[^"]+"/g)||[];
    // EVERY glyph in there is side-on, and there is one for every body that asks
    // for one by name — a body whose glyph is not drawn silently falls back to
    // the seabird, which is how a goose would have ended up looking like a puffin.
    const glyphs = [...new Set((html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform(')).match(/glyph:"[a-z]+"/g)||[]).map(x=>x.slice(7,-1)))];
    return boxes.length >= glyphs.length && boxes.every(b=>b==='viewBox="0 0 50 31"') &&
      glyphs.every(gl=>new RegExp('glyph==="'+gl+'"').test(g) || gl==='seabird'); })(),
  'all side-on');
chk('the ride is HIDDEN, never rebuilt, so leaving and rejoining a quest costs nothing',
  /var RIDE_PARTS=plane\.children\.slice\(\);/.test(html) &&
  /RIDE_PARTS\[i\]\.visible=false/.test(html) && /RIDE_PARTS\[i\]\.visible=true/.test(html));

chk('every transform quest is declared as a recipe', QUEST_IDS.every(id=>new RegExp('id:"'+id+'"').test(html)), QUEST_IDS.join(', '));
chk('each one lends a body, and the body it names really exists',
  (function(){ const M = html.slice(html.indexOf('var MISSIONS=['), html.indexOf('function pickWorld('));
    return BODY_IDS.every(id=>new RegExp('transform:"'+id+'"').test(M)); })(),
  BODY_IDS.join(', '));
chk('a quest is FOUND exactly like a job: a beam, and a LOW SWOOP, never a landing',
  /function scoutColor\(m\)/.test(html) && /if\(m\.transform\) return 0x9B7BE8;/.test(html) &&
  // FL15: the swoop still comes out of the recipe's own radius and ceiling, and
  // nothing anywhere waits for S.mode==="landed" to offer
  /function offerRad\(m\)\{ return \(m\.radius\|\|30\); \}/.test(html) &&
  /function offerCeil\(m\)\{ return Math\.max\(\(m\.ceiling\|\|45\)\*0\.7,30\); \}/.test(html) &&
  !/mode==="landed"[^\n]*openOffer/.test(html));
// FL15 - Mike: "the game hits side quest too fast, let kids fly around and find
// them on their own." Two halves, and both are asserted here rather than left
// as good intentions, because the failure mode is a later session quietly
// wiring openOffer back into the flight loop.
chk('FL15: a low swoop RAISES A PILL - it can never open the card by itself',
  /function showFindPill\(m\)/.test(html) && /function tapFindPill\(\)/.test(html) &&
  /id="findPill"/.test(html) &&
  /findPill\.addEventListener\("click",tapFindPill\)/.test(html) &&
  // scoutStep raises the pill and NOTHING else; openOffer is reached through the tap
  /showFindPill\(best\.job\);/.test(html) &&
  (function(){ const b = html.slice(html.indexOf('function scoutStep(){'),
                                   html.indexOf('// ---------- "show me where it is"'));
    return !/openOffer\(/.test(b); })());
chk('FL15: the swoop is genuinely LOW now, not most of the sky',
  // the old test was radius+10 wide and ceiling+25 high, which on the Mail Run
  // was 40 units across and 85 up - a kid heading north out of the pad set it off
  !/d>\(m\.radius\+10\)/.test(html) && !/S\.pos\.y>\(m\.ceiling\+25\)/.test(html));
chk('FL15: the pill is drawn from the RECIPE, never per job (the FL5b law)',
  /fpIco\.innerHTML=targetIcon\(scoutStyle\(m\),30,false\)/.test(html) &&
  /fpName\.textContent=m\.name/.test(html));
chk('THE FL5 LAW STILL HOLDS: nothing in a quest can be failed, run out or expire',
  (function(){ const g = html.slice(html.indexOf('function gatherStep(dt,px,pz,py){'), html.indexOf('//  FL5 — JOBS ARE THINGS YOU FIND'));
    return !/timer|expire|lives|fail|lose|penalt/i.test(g); })());
chk('a gathering quest runs the OTHER WAY ROUND: many to collect from, one to go home to',
  /function gatherStep\(dt,px,pz,py\)/.test(html) && /function gatherFrom\(i\)/.test(html) &&
  /function dropLoad\(\)/.test(html) && /if\(JOB\.gather\)\{ gatherStep\(dt,px,pz,py\); return; \}/.test(html));
chk('...and a delivery and a pick-up share ONE piece of code for going green',
  /function markStop\(i\)/.test(html) &&
  (html.match(/markStop\(i\);/g)||[]).length === 2);
chk('THE FL5b LAW HOLDS FOR THE NEW ART TOO: no drawing anywhere knows a quest by name',
  !new RegExp('(' + QUEST_IDS.join('|') + ')').test(
    html.slice(html.indexOf('var ICON_FILL='), html.indexOf('function saySplit('))));
chk('the five new places are STYLES, drawn once and used by the picture and the world',
  ['bFlower','bCactusFlower','bFish','bHive','bNest'].every(f=>new RegExp('function '+f+'\\(').test(html)) &&
  /function styleBody\(style\)/.test(html) &&
  ['flower','cactusflower','fish','hive','nest'].every(st=>
    new RegExp('style==="'+st+'"').test(html.slice(html.indexOf('function styleBody(style){')))));
chk('the manifest can edit a quest too (a hive is a slot, not a number in the code)',
  /"transform","gather","dropStyle","dropVerb"/.test(html) &&
  /if\(edit\.dropAt&&typeof edit\.dropAt\.x==="number"\) m\.dropAt=edit\.dropAt;/.test(html) &&
  /if\(m\.transform&&!findTransform\(m\.transform\)\) m\.transform=null;/.test(html));
chk('THE SPACING RULE is a number in the engine, not a good intention in a comment',
  /var BEAM_GAP=240;/.test(html) && /function beamSpacing\(\)/.test(html) &&
  /marker\(built,scoutColor\(m\),220,hasBadge\(m\.id\)\)/.test(html));

// ---------------------------------------------------------------------------
//  FL11 — the puffin's fish look like fish, not cubes
// ---------------------------------------------------------------------------
console.log('--- FL11: what a puffin carries is a fish ---');
// The recipe names the SHAPE, not a piece of drawing code — same law as `style`
// picks a target body. That means a future card can hand any cargo a shape and
// buildCargo will draw it without touching the engine.
chk('the puffin quest cargo names a carry SHAPE the engine can look up',
  /cargo:\{name:"fish",plural:"fish",color:0xBFE9F5,carry:"fish"\}/.test(html));
chk('buildCargo dispatches on cargo.carry (not on which quest this is)',
  (function(){ const bc = html.slice(html.indexOf('function buildCargo('), html.indexOf('function paletteSnapshot('));
    return /var carry=cargo&&cargo\.carry/.test(bc) &&
           /if\(carry==="fish"\)/.test(bc) &&
           // FL5b: no drawing anywhere may know a quest by name
           !new RegExp('(' + QUEST_IDS.join('|') + ')').test(bc); })());
chk('the AR1Q hand-built fish is what a puffin carries — one fish, both places',
  /function buildCargoFishOne\(hex\)\{[\s\S]*?hbGet\("fish"\)/.test(html) &&
  /f=buildCargoFishOne\(col\)/.test(html));
chk('the cargo fish has its OWN shiny material so a kid can spot it from the air',
  /function cargoFishMat\(hex\)/.test(html) &&
  /shininess:110/.test(html) && /specular:0xFFFFFF/.test(html) &&
  /emissive:hex/.test(html));
chk('what is in your beak is ALIVE: a tail-wiggle runs every sim step',
  /function wiggleCargo\(\)/.test(html) &&
  /wiggleCargo\(\);/.test(html.slice(html.indexOf('function stepSim'), html.indexOf('function wiggleCargo'))) &&
  /cargoGroup\.userData\.wiggle/.test(html) &&
  /rotation\.y=c\.baseY \+ Math\.sin\(time\*5\.0/.test(html));
chk('boxes NEVER wiggle — only what asked for it in buildCargo does',
  (function(){ const w = html.slice(html.indexOf('function wiggleCargo(){'), html.indexOf('function wiggleCargo(')+400);
    return /!cargoGroup\.userData\.wiggle/.test(w); })());
chk('buildCargo is CALLED with the full cargo recipe, not just a colour',
  /cargoGroup=buildCargo\(m\.cargo,m\.capacity\)/.test(html));
chk('the fallback for an unknown carry is the old coloured box (nothing regressed)',
  (function(){ const bc = html.slice(html.indexOf('function buildCargo('), html.indexOf('function paletteSnapshot('));
    return /new THREE\.BoxGeometry\(2\.1,1\.3,2\.7\)/.test(bc); })());

// ---------------------------------------------------------------------------
//  FL12 — Sky trails: rings to fly through, per world, all out of a recipe
// ---------------------------------------------------------------------------
console.log('--- FL12: sky trails - lines of rings, four shapes, no id in the draw ---');
const TRAIL_IDS = ['si-ribbon','si-dipper','sp-ribbon','sp-arch','sp-climb','sc-arch','sc-dipper'];
const TRAIL_SHAPES = ['ribbon','dipper','arch','climb'];
const audio = read('public/buildable-audio.js');
chk('the trails table is declared as data — a new trail is a data edit, no code',
  /var TRAILS_SPEC\s*=\s*\[/.test(html) && TRAIL_IDS.every(id=>new RegExp('id:"'+id+'"').test(html)),
  TRAIL_IDS.join(', '));
chk('every world carries at least TWO trails (two-or-three-per-world)',
  (function(){
    const S = html.slice(html.indexOf('var TRAILS_SPEC'), html.indexOf('function pickWorld('));
    return ['sunny-islands','snowy-peaks','sunset-canyon'].every(w=>{
      const n = (S.match(new RegExp('world:"'+w+'"','g'))||[]).length;
      return n >= 2 && n <= 3;
    });
  })(),
  'sunny/snowy/sunset');
chk('each trail names one of the four shapes, and every shape appears somewhere',
  (function(){
    const S = html.slice(html.indexOf('var TRAILS_SPEC'), html.indexOf('function pickWorld('));
    const shapes = (S.match(/shape:"[a-z]+"/g)||[]).map(x=>x.slice(7,-1));
    return shapes.every(s=>TRAIL_SHAPES.indexOf(s)>=0) &&
      TRAIL_SHAPES.every(s=>shapes.indexOf(s)>=0);
  })(),
  TRAIL_SHAPES.join(', '));
chk('all four shape builders exist, and one dispatch turns a shape into a line of rings',
  ['trailShapeRibbon','trailShapeDipper','trailShapeArch','trailShapeClimb']
    .every(f=>new RegExp('function '+f+'\\(').test(html)) &&
  /function trailShape\s*\(\s*shape\s*,\s*anchor\s*,\s*seed\s*,\s*sample\s*\)/.test(html) &&
  TRAIL_SHAPES.every(s=>new RegExp('shape\\s*===\\s*"'+s+'"').test(html)));
chk('THE FL12 LAW: no drawing anywhere knows a trail by name',
  // Slice from the very first ring-drawing function all the way through the
  // trail-step, which is every line of code that touches a ring on screen.
  !new RegExp('(' + TRAIL_IDS.join('|') + ')').test(
    html.slice(html.indexOf('function trailPaletteFor('), html.indexOf('// what YOU look like on a job'))));
chk('the traps note is real code: rings SAMPLE ground height at placement',
  /function trailGroundSample\(x,\s*z\)\{/.test(html) &&
  // every shape passes that sampler in and lifts the ring above it
  ['trailShapeRibbon','trailShapeDipper','trailShapeArch','trailShapeClimb'].every(f=>{
    const body = html.slice(html.indexOf('function '+f+'('), html.indexOf('function ', html.indexOf('function '+f+'(')+1));
    return /var g = sample \? sample\(x, z\) : 0;/.test(body) && /Math\.max\(/.test(body);
  }));
chk('the ring is FAT (a thin torus seen edge on is invisible from the low camera)',
  /var TR_RING_TUBE\s*=\s*0\.9/.test(html) && /new THREE\.TorusGeometry\(TR_RING_MAJOR, TR_RING_TUBE/.test(html));
chk('the ring COLOUR comes out of the level palette (world.cap / world.leaf), not a hardcoded hex',
  /function trailPaletteFor\(\)/.test(html) &&
  /world\.terrain==="peaks"\) \? world\.leaf : world\.cap/.test(html));
chk('the FIRST ring stands under a soft beam (discovery, exactly like the job scouts)',
  (function(){
    const st = html.slice(html.indexOf('function showTrails('), html.indexOf('function hideTrails('));
    return /new THREE\.CylinderGeometry\(1\.4, 1\.4, 220/.test(st) &&
      /var first = rings\[0\];/.test(st) && /beam\.position\.set\(first\.pos\.x/.test(st);
  })());
chk('lighting the first ring PUTS THE BEAM OUT and brightens the whole line',
  (function(){
    const ts = html.slice(html.indexOf('function trailStep(){'), html.indexOf('// what YOU look like on a job'));
    return /if \(!tr\.found\)/.test(ts) && /tr\.beam\.visible = false/.test(ts) && /brightenTrail\(tr\)/.test(ts);
  })());
chk('one ring hit = one note of a rising tune (pitch steps up per ring)',
  /sfx\("coin", \{ rate: 1\.0 \+ i \* 0\.07 \}\)/.test(html));
chk('the audio library accepts opt.rate so any caller can pitch a coin (backwards compatible)',
  /opt && typeof opt\.rate === "number"/.test(audio) &&
  // and the old tier path still works when no rate is passed
  /tier>=3\?1\.16:tier>=2\?1\.08:1\.0/.test(audio));
chk('the LAST ring earns the sparkle cascade, a coin burst and a sticker (same pattern a job uses)',
  (function(){
    const ts = html.slice(html.indexOf('function trailStep(){'), html.indexOf('// what YOU look like on a job'));
    return /if \(tr\.lit >= tr\.rings\.length && !tr\.done\)/.test(ts) &&
      /sfx\("collect"\)/.test(ts) && /burst\(r\.pos, 18\)/.test(ts) &&
      /markBadge\(tr\.id\)/.test(ts);
  })());
chk('NOTHING in a trail can be failed — no timer, no expiry, no lose in the ring code',
  (function(){
    const zone = html.slice(html.indexOf('function trailPaletteFor('), html.indexOf('// what YOU look like on a job'));
    return !/\b(timeLeft|timeLimit|timer|countdown|lives|attemptsLeft|expiresAt|failed?)\b/i.test(zone) &&
      !/game over/i.test(zone) && !/you lose/i.test(zone);
  })());
chk('the arch shape threads through something REAL — it picks the tallest landmark near the anchor',
  /function trailPickLandmark\(anchor,\s*within\)/.test(html) &&
  /var peak = trailPickLandmark\(anchor, 200\)/.test(html));
chk('trails join the mini-map: a small ring blip, faint until you have lit the first ring',
  /kind==="trail"/.test(html) && /icoRingGlyph\(n,!!p\.done\)/.test(html) &&
  /stroke:none|stroke="/.test(html.slice(html.indexOf('function blipIcon('), html.indexOf('function paintMinimap('))) &&
  /if\(p\.kind==="trail"\)\{/.test(html));
chk('a trail can be pinned, exactly like a job (one pin at a time, outlives the flight)',
  /function pinTrail\(tr\)/.test(html) && /id:"trail:"\+tr\.id,kind:"trail"/.test(html));
chk('the trails go up AFTER the first chunks are built (or a dipper cannot sample the ground)',
  /updateChunks\(0,0\);\s*\n\/\/ FL12: the trails go up here[\s\S]{0,300}showTrails\(\);/.test(html));
chk('and the trailStep runs every sim tick, right after scoutStep',
  /scoutStep\(\);\s*\n\s*trailStep\(\);/.test(html));

// ---------------------------------------------------------------------------
//  FL7 STATIC — three harder bodies, three new places, and the flock
// ---------------------------------------------------------------------------
console.log('--- FL7: the harder transforms (goose, owl, eagle) ---');
chk('the three FL7 quests are declared, in the two worlds that were asked for',
  (function(){ const M = html.slice(html.indexOf('var MISSIONS=['), html.indexOf('function pickWorld('));
    return /id:"goose-squad"[\s\S]{0,80}world:"snowy-peaks"/.test(M) &&
           /id:"owl-night-flight"[\s\S]{0,80}world:"snowy-peaks"/.test(M) &&
           /id:"eagle-glider"[\s\S]{0,80}world:"sunset-canyon"/.test(M); })());
chk('...and the glb really carries Goose, SnowyOwl and Eagle, still with COLOR_0 on every one',
  (function(){
    const d = fs.readFileSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb');
    const j = JSON.parse(d.subarray(20, 20+d.readUInt32LE(12)).toString('utf8'));
    const names = j.nodes.map(n=>n.name);
    return ['Goose','SnowyOwl','Eagle'].every(n=>names.includes(n)) &&
      j.meshes.every(m=>m.primitives.every(p=>p.attributes.COLOR_0!=null)) &&
      d.length < 400000; })(),
  'six bodies in '+(fs.statSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb').size/1024).toFixed(0)+'KB');
// THE LIBRARY HAS NO "Owl". It has a SnowyOwl and nothing else with the word in
// it, so a body asking for model:"Owl" loads nothing and the quest silently
// hands a kid an invisible bird. Every model name is checked against the file.
chk('every body names a model the file actually contains',
  (function(){
    const d = fs.readFileSync(dir+'/public/models/skyflyer/animals/flyer-bodies.glb');
    const j = JSON.parse(d.subarray(20, 20+d.readUInt32LE(12)).toString('utf8'));
    const names = j.nodes.map(n=>n.name);
    const T = html.slice(html.indexOf('var TRANSFORMS=['), html.indexOf('function findTransform('));
    const want = (T.match(/model:"[A-Za-z]+"/g)||[]).map(x=>x.slice(7,-1));
    return want.length === BODY_IDS.length && want.every(n=>names.includes(n)); })());
// THE FOUR-PLACE RULE. A new style has to be wired into the world (3D), the
// offer card (a drawing), the checklist (an icon) AND the dispatch, and missing
// any one of the four is invisible until a kid is looking at a blank square.
chk('each new place is wired into ALL FOUR of the places a style has to exist',
  ['seed','mousering','thermal'].every(st => {
    const cap = st.charAt(0).toUpperCase()+st.slice(1).replace('ring','Ring');
    const B = {seed:'bSeed',mousering:'bMouseRing',thermal:'bThermal'}[st];
    const I = {seed:'icoSeed',mousering:'icoMouseRing',thermal:'icoThermal'}[st];
    const W = {seed:'buildSeedPatch',mousering:'buildMouseRing',thermal:'buildThermal'}[st];
    return new RegExp('function '+B+'\\(').test(html) &&
           new RegExp('function '+I+'\\(').test(html) &&
           new RegExp('function '+W+'\\(').test(html) &&
           new RegExp('style==="'+st+'"[^\\n]*'+B).test(html) &&
           new RegExp('style==="'+st+'"[^\\n]*'+I).test(html) &&
           new RegExp('style==="'+st+'"[^\\n]*'+W).test(html); }),
  'seed, mousering, thermal');
chk('a sound and a column of warm air stay VISIBLE when the night palette drops',
  (function(){ const F = html.slice(html.indexOf('function fl7mats(){'), html.indexOf('function buildSeedPatch('));
    return (F.match(/fog:false/g)||[]).length >= 3; })());
// THE FLOCK. Two claims, and the second one is the whole feature.
chk('the flock is asked for by a FLAG ON THE BODY, never by checking which body it is',
  /var companions=t\.flock\?buildCompanionGeese\(t\):null;/.test(html) &&
  /flock:true/.test(html) &&
  !/t\.id==="goose"/.test(html) &&
  /if\(!TB\[t\.model\]\) return null;/.test(html));
// The bug this is here to stop coming back: the chase camera sits BEHIND the
// body, so a flock placed behind it is a flock nobody ever sees.
chk('every companion flies AHEAD of the kid, where the chase camera can see it',
  (function(){ const F = html.slice(html.indexOf('function buildCompanionGeese(t){'), html.indexOf('// ---------- become it'));
    const dz = (F.match(/dz:\s*(-?[\d.]+)/g)||[]).map(x=>+x.split(':')[1]);
    const dx = (F.match(/dx:\s*(-?[\d.]+)/g)||[]).map(x=>+x.split(':')[1]);
    const back = (html.match(/camBack:12,/)||[]).length;   // the goose's camera
    return dz.length === 5 && dz.every(v=>v > 0) &&
      // and inside the picture: nothing further off to the side than it is ahead
      dx.every((v,i)=>Math.abs(v) < dz[i]) && back === 1; })(),
  'five birds, all in front');
chk('...and each one has its OWN geometry and its OWN wingbeat, or the V is a decal',
  (function(){ const F = html.slice(html.indexOf('function buildCompanionGeese(t){'), html.indexOf('// ---------- become it'));
    return /tbPrep\(TB\[t\.model\],t\.size\)/.test(F) && /tbRig\(wrap\.userData\.mesh\)/.test(F) &&
      /ph:0\.00/.test(F) && (F.match(/ph:[\d.]+/g)||[]).length === 5 &&
      new Set((F.match(/ph:[\d.]+/g)||[])).size === 5 &&      // no two in phase
      /tbBeat\(g\.userData\.rig/.test(F); })());
// The formation is placed in world units but hangs off a body tbPrep has scaled.
chk('the formation undoes the body\'s scaling, or a 34-unit gap comes out miles wide',
  /group\.userData\.fix=function\(k\)/.test(html) &&
  /companions\.group\.userData\.fix\(wrap\.scale\.x\);/.test(html));
chk('a map blip is the SAME PICTURE as the thing standing under the beam',
  /style:scoutStyle\(s\.job\)/.test(html) && !/style:s\.job\.depot\?"dock":s\.job\.style/.test(html));
chk('the FL5b law holds for the FL7 art too: no drawing knows a quest by name',
  !new RegExp('(' + FL7_QUEST_IDS.join('|') + ')').test(
    html.slice(html.indexOf('var ICON_FILL='), html.indexOf('function saySplit('))));
chk('every FL7 quest still ends on one true fun fact a grown-up would not know',
  (function(){ const M = html.slice(html.indexOf('var MISSIONS=['), html.indexOf('function pickWorld('));
    return FL7_QUEST_IDS.every(id=>{
      const at = M.indexOf('id:"'+id+'"'); const nxt = M.indexOf('{ id:"', at+5);
      const blk = M.slice(at, nxt<0?M.length:nxt);
      const f = blk.match(/fact:"([^"]+)"/);
      return f && f[1].length > 60; }); })());

console.log('--- FL5b: a job a four year old can answer, follow and find ---');
// AR1R — REWRITTEN, NOT DELETED. This used to pin the FL5b/FL5c bottom sheet:
// align-items:flex-end, full width, square corners at the sides. Mike measured
// the live card at 100% of the screen width and 290px tall (41% of a 704px
// viewport) and asked for a pop-up. A check guarding a shape that no longer
// exists passes forever, so it now pins the SHAPE HE ASKED FOR instead.
chk('AR1R: THE OFFER IS A FLOATING POP-UP - centred, capped, rounded all round',
  /#offerCard\{align-items:center;padding:18px/.test(html) &&
  /#offerCard \.inner\{max-width:340px;width:100%;padding:0;border-radius:26px;/.test(html) &&
  // no square-cornered welded-to-the-bottom sheet may come back
  !/#offerCard\{align-items:flex-end/.test(html) &&
  !/border-radius:26px 26px 0 0/.test(html) &&
  /id="ofBand"/.test(html) && /id="ofScene"/.test(html));
chk('...and it matches the factCard pop-up rather than being a third look',
  (()=>{ const sheet=html.slice(html.indexOf('.sheet{position:absolute'), html.indexOf('.sheet h2'));
         return /align-items:center/.test(sheet) && /max-width:380px/.test(sheet); })());
chk('AR1R: the picture band came DOWN from 150px, and the scrim lightened',
  /#offerCard \.band\{position:relative;height:110px/.test(html) &&
  /#offerCard \.band svg\.scene\{display:block;width:100%;height:110px/.test(html) &&
  /#offerCard\{align-items:center;padding:18px;background:rgba\(18,52,74,\.30\)/.test(html) &&
  !/height:150px/.test(html));
chk('AR1R: the band is drawn to the CARD width, not the screen width',
  /var OF_MAXW=340, OF_BANDH=110;/.test(html) &&
  /function offerBandW\(\)/.test(html) &&
  /ofSceneEl\.innerHTML=jobScene\(m,offerBandW\(\),OF_BANDH\)/.test(html) &&
  // a 340-wide card handed the whole viewport width would squash the drawing
  !/jobScene\(m,Math\.max\(280,W\),150\)/.test(html));
chk('...and the picture SCALES with the band, so a shorter band is not a cropped one',
  (()=>{ const b=html.slice(html.indexOf('function jobScene(m,W,H)'), html.indexOf('// ---- recipe -> picture'));
         return /var SK=Math\.max\(0\.55,Math\.min\(1,H\/150\)\)/.test(b) &&
                /R=function\(v\)\{ return Math\.round\(v\*SK\); \}/.test(b) &&
                /scale\('\+dsc\.toFixed\(3\)\+'\)/.test(b) && /hop:R\(26\)/.test(b); })());
chk('...and the one-shot hop follows the band height instead of a fixed 26px',
  /--hop/.test(html) && /translateY\(calc\(var\(--y0\) - var\(--hop\)\)\)/.test(html) &&
  /f\.style\.setProperty\("--hop"/.test(html));
chk('AR1R: the card reports its own measured SHAPE, so it cannot quietly grow back',
  /shape:box/.test(html) && /getBoundingClientRect\(\)/.test(html) &&
  /measured:b\.width>0&&vw>0/.test(html));
chk('the answer is the game\'s own GO pill, not a tick and a cross',
  /id="ofStart"><span id="ofRide"><\/span>LET'S GO<\/button>/.test(html) &&
  /id="ofNo"><span id="ofCloud"><\/span>Later<\/button>/.test(html) &&
  // the interface symbols are gone for good
  !/class="ans yes"|class="ans no"|class="anslab"/.test(html) &&
  !/M10 22 L18 30 L32 13/.test(html) && !/M12 12 L30 30 M30 12 L12 30/.test(html));
chk('...and it is the SAME pill shape as TAKE OFF, which a kid has already pressed',
  (()=>{ const go=html.slice(html.indexOf('#ofStart{'), html.indexOf('#ofStart:active'));
         const to=html.slice(html.indexOf('#takeoff{'), html.indexOf('#takeoff:active'));
         return /linear-gradient\(#57d06b,#2fae4d\)/.test(go) && /linear-gradient\(#57d06b,#2fae4d\)/.test(to) &&
                /border-radius:999px/.test(go) && /box-shadow:0 6px 0 #1f8038/.test(go) && /0 6px 0 #1f8038/.test(to); })());
chk('NOTHING on the offer is red - saying no is free and must not look like a mistake',
  (()=>{ const card=html.slice(html.indexOf('/* -- AR1R: THE OFFER CARD IS A FLOATING POP-UP'), html.indexOf('/* -- progress as objects'));
         return !/#e8552f|#ff8a75|#b93b1b|#FF5A3C/i.test(card); })());
chk('saying no is a drifting cloud, which is what "not now" actually is here',
  /function icoCloud\(/.test(html) && /ofCloudEl\.innerHTML=icoCloud\(/.test(html));
// FL6: the pill still carries the kid's own ride, UNLESS the offer is going to
// lend them a body — in which case it has to show the creature, because that is
// what they are actually saying yes to. One dispatch, icoGo, and it is keyed off
// the BODY (per glyph) and never off a quest id.
chk('the go pill carries THE RIDE THE KID PICKED, drawn from ride.build',
  /function icoRide\(/.test(html) && /ride\.build==="copter"/.test(html) &&
  /ride\.build==="jetpack"/.test(html) && /ofRideEl\.innerHTML=icoGo\(44,m\)/.test(html) &&
  /return t\?icoCreature\(n,t\.glyph\):icoRide\(n\);/.test(html));
chk('...and a quest that lends you a body puts THAT on the pill instead',
  /function icoCreature\(n,glyph\)/.test(html) && /glyph==="bee"/.test(html) &&
  /glyph==="hummingbird"/.test(html));
chk('WHAT YOU GET is on the offer now: the coins and the sticker still to win',
  /id="ofReward"/.test(html) && /function icoCoin\(/.test(html) && /function icoSticker\(/.test(html) &&
  /icoSticker\(36,hasBadge\(m\.id\)\)/.test(html) && /\+'\+m\.coins\+'/.test(html));
chk('the 190px of grown-up words folded into a drawer, shut by default',
  /id="ofWords"/.test(html) && /#ofWords\{display:none/.test(html) &&
  /id="ofInfo"/.test(html) && /function openWords\(/.test(html) && /function closeWords\(/.test(html) &&
  /closeWords\(\);\s*\n\s*offerCard\.style\.display="flex"/.test(html));
chk('the picture walks itself once when the card opens, with no words at all',
  /function flyThePicture\(/.test(html) && /@keyframes ofFlyX/.test(html) && /@keyframes ofFlyY/.test(html) &&
  /if\(DEMO\|\|NODRAW\|\|!offered\) return;/.test(html));
chk('...and it is pure CSS once placed, so no second animation loop runs beside the game\'s',
  !/requestAnimationFrame/.test(html.slice(html.indexOf('function flyThePicture('), html.indexOf('function closeOffer('))));
chk('a "Hear it" speaker reads the job through the SHARED narration library',
  /id="ofSay"/.test(html) && /function sayJob\(/.test(html) && /\/api\/say\?t="/.test(html) &&
  /function saySplit\(/.test(html));
chk('...and it is split into short lines, because /api/say caps one at 60 characters',
  /\(cur\+" "\+w\)\.length>52/.test(html) && /\.slice\(0,5\)/.test(html));
chk('THE FL5b LAW: no icon is drawn per job - every picture comes out of the recipe',
  /function jobStrip\(/.test(html) && /function targetIcon\(style,n,done\)/.test(html) &&
  /function cargoIcon\(m,n,ghost\)/.test(html) &&
  // not one mention of a job id anywhere in the drawing code
  !/(mail-run|supply-drop|lost-explorer|lantern-lighter)/.test(
    html.slice(html.indexOf('var ICON_FILL='), html.indexOf('function saySplit('))));
// FL6 fixed a check that could not fail: it sliced from jobScene FORWARD to
// SCENE_F, which is declared BEFORE it, so the slice was the empty string and
// that clause was always false-y in a way that happened to still pass. Sliced
// properly now, and extended to the gathering picture.
chk('the offer shows the job as ONE picture: a little MAP of it, built from the recipe',
  (function(){ const scene = html.slice(html.indexOf('function jobScene(m,W,H){'),
                                        html.indexOf('// ---- recipe -> picture.'));
    return /function jobScene\(m,W,H\)/.test(html) && /ofSceneEl\.innerHTML=jobScene\(m,/.test(html) &&
      /m\.targets\.length/.test(scene) && /m\.depot\?bDock\(/.test(scene) &&
      /targetBody\(m\.style,SCENE_F,SCENE_S,false\)/.test(scene); })());
chk('FL6: a gathering quest draws the OTHER WAY ROUND - the many left, the one place right',
  (function(){ const g = html.slice(html.indexOf('function gatherScene(m,W,H){'),
                                    html.indexOf('function jobScene(m,W,H){'));
    return /if\(m\.gather&&m\.dropAt\) return gatherScene\(m,W,H\);/.test(html) &&
      /targetBody\(m\.dropStyle\|\|"hive",SCENE_F,SCENE_S,false\)/.test(g) &&
      /jobScene\.last=\{x0:lastT\+4,x1:sx-12/.test(g) &&        // pollen flies flower -> hive
      !/(busy-bee|puffin-parent|hummingbird)/.test(g); })());
chk('...and both pictures share ONE sky, so they cannot drift apart',
  /function sceneSky\(W,H,hz,R\)/.test(html) &&
  (html.match(/sceneSky\(W,H,hz,R\)/g)||[]).length===3);
chk('the band and the progress chip share ONE source of art (a body per shape)',
  ['bHouse','bAnimal','bFlare','bLantern','bDock'].every(f=>new RegExp('function '+f+'\\(').test(html)) &&
  /function targetBody\(style,f,s,d,post\)/.test(html) &&
  // the wrappers must delegate, or the drawing has been forked in two
  /function icoHouse\(n,d\)\{ return svgWrap\(n,"0 0 26 26",bHouse\(/.test(html));
chk('every recipe style has a drawing, so a new style is the only thing a new job needs',
  ['animal','flare','lantern','dock'].every(s=>new RegExp('style==="'+s+'"').test(
    html.slice(html.indexOf('function targetIcon('), html.indexOf('function cargoIcon(')))) &&
  ['icoHouse','icoAnimal','icoFlare','icoLantern','icoDock'].every(f=>new RegExp('function '+f+'\\(').test(html)));
chk('PROGRESS IS OBJECTS, NOT TEXT: "Delivered 1/3 - Carrying 2" is gone',
  /gCarryEl\.innerHTML=/.test(html) && !/line=word\+" "\+JS\.done/.test(html) &&
  !/Carrying "\+JS\.carrying;/.test(html) && /jobStrip\(JOB,18,JS\.carrying,JS\.doneMap/.test(html));
chk('...but the same words survive for a screen reader and a grown-up',
  /gCarryEl\.setAttribute\("aria-label"/.test(html));
chk('a finished drop turns green and gets a tick, so "what is left" needs no reading',
  /function doneBadge\(/.test(html) && /ICON_DFILL="#57D06B"/.test(html));
chk('the job name chip is untouched, exactly as agreed',
  /gJobEl\.textContent=JOB\.name/.test(html));
chk('THE WAYPOINT: one pin at a time, in the top bar, with a live distance and an X',
  /id="waypoint"/.test(html) && /id="wpDist"/.test(html) && /id="wpDrop"/.test(html) &&
  /var WP=null/.test(html) && /function setWaypoint\(p\)/.test(html) && /function dropWaypoint\(/.test(html));
chk('the big orange arrow follows the pin when there is no job on',
  /if\(WP&&MODE!=="job"\) return \{x:WP\.x,z:WP\.z,label:WP\.label\};/.test(html));
chk('the offer card, the mini-map and the help list all set the pin the SAME way',
  /function pinJob\(m\)/.test(html) &&
  (html.match(/pinJob\(m\)/g)||[]).length>=3 &&          // declaration + decline + help list
  /setWaypoint\(this\.__pt\)/.test(html));
chk('nothing but the X and arriving ever takes the pin away (it survives leaving a job)',
  /if\(WP && Math\.hypot\(S\.pos\.x-WP\.x,S\.pos\.z-WP\.z\)<45\) dropWaypoint\(\)/.test(html) &&
  !/function endJob\(\)[^]{0,900}dropWaypoint/.test(html) &&
  !/function leaveJob\(\)[^]{0,400}dropWaypoint/.test(html));
chk('A MAP, NOT A COMPASS: you are a triangle in the middle and the map turns with you',
  /id="minimap"/.test(html) && /class="mmme"/.test(html) && /function paintMinimap\(/.test(html) &&
  /var mx=\(dx\*cy-dz\*sy\)\*MM_SCALE, my=\(dx\*sy\+dz\*cy\)\*MM_SCALE;/.test(html));
// The compass ribbon was in the mock for comparison and was DROPPED: a compass
// asks a child to understand a heading, which is abstract. Nothing that reads a
// heading off a tape may creep back in.
chk('the compass ribbon really was dropped (no heading tape anywhere)',
  !/id="compass"|class="compass"|id="tape"|\.compass\s*\{/.test(html));
chk('gold dot = a job you found, faint dot = something out there you have not been to',
  /function blipIcon\(p\)/.test(html) && /#F7C948/.test(html) && /rgba\(51,86,110,\.26\)/.test(html) &&
  /if\(d<260\) foundPts\[m\.id\]=true;/.test(html));
chk('orange ring = a landing pad, and every blip is tappable to pin it',
  /stroke="#FF8A3C" stroke-width="2\.6"/.test(html) && /el\.addEventListener\("click"/.test(html));
chk('the map never steals a drag from the one-finger controls',
  /minimapEl\.addEventListener\("pointerdown",function\(e\)\{ e\.stopPropagation\(\); \}\)/.test(html) &&
  /el\.addEventListener\("pointerdown",function\(e\)\{ e\.stopPropagation\(\); \}\)/.test(html));
chk('the attract demo is still pure scenery - no map, no pin',
  /minimapEl\.style\.display="none";waypointEl\.style\.display="none";/.test(html));
chk('the getting-warmer chime speeds up as you close on a job you have not found',
  /function warmerStep\(/.test(html) && /var gap=0\.26\+\(Math\.min\(best,620\)\/620\)\*1\.5/.test(html) &&
  /if\(foundPts\[scouts\[i\]\.job\.id\]\) continue;/.test(html));
chk('the buddy says the job out loud once when it starts', /sayJob\(m\);\s+\/\/ FL5b/.test(html));
chk('every FL5b picture is drawn SVG - still not one emoji anywhere', !emoji.test(html));

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
chk('the shell hosts the Sky Flyer learning gate (FL4)',
  /gameType="skyflyer"/.test(jsx) && /skyflyer-engine\.html\?v=\w+/.test(jsx),
  (jsx.match(/skyflyer-engine\.html\?v=(\w+)/)||[])[1]);
// AR1e: Mike reported a bug that was already fixed - he was being served a
// CACHED engine. The bust had not moved since FL5 and the route sent no
// cache-control at all. Both halves are checked now.
chk('every link to the engine carries the SAME cache-bust (one stale link is enough)',
  (()=>{ const v=[...jsx.matchAll(/skyflyer-engine\.html\?v=(\w+)/g)].map(m=>m[1]);
         return v.length>0 && v.every(x=>x===v[0]); })(),
  [...new Set([...jsx.matchAll(/skyflyer-engine\.html\?v=(\w+)/g)].map(m=>m[1]))].join(' '));
chk('the engine route tells the browser to revalidate, so it can never go stale',
  (()=>{ const r=JSON.parse(read('vercel.json')).routes
           .find(r=>r.src==='/skyflyer-engine.html');
         return !!(r&&r.headers&&/no-cache/.test(r.headers['cache-control']||'')); })());
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
// ---------------------------------------------------------------------------
// AR1) REAL 3D MODELS — the art layer for Sunny Islands.
//
// The rule this half defends: the models are ART SITTING ON TOP of a world that
// still works without them. Every check below is either "the art really ships"
// or "the world survives the art not arriving".
// ---------------------------------------------------------------------------
console.log('--- AR1: real Kenney models dress Sunny Islands ---');
// AR1M: the terrain shelf lives under its own base (kitterrain/), so its names
// are bare filenames in the source. Fold them in here rather than letting them
// fall through as "pirate/..." and fail the folder checks for the wrong reason.
const terraFiles = [...((html.match(/var TERRA_FILES=\{[\s\S]*?\};/)||[''])[0]
  .matchAll(/"([\w\-\.]+\.glb)"/g))].map(m => 'kitterrain/' + m[1]);
const kitFiles = [...new Set([
  ...[...html.matchAll(/^\s*(\w+):"([\w\-\/]+\/[\w\-\.]+\.glb)",?$/gm)].map(m=>m[2]),
  ...terraFiles])];
chk('the engine names a real model kit (not a placeholder list)', kitFiles.length >= 10,
  kitFiles.length+' models');
const missing = kitFiles.filter(f => !fs.existsSync(dir+'/public/models/skyflyer/'+f));
chk('every model the engine asks for is actually in the repo', missing.length===0, missing.join(' '));
const kitDirs = [...new Set(kitFiles.map(f=>f.split('/')[0]))];
chk('every kit ships its CC0 licence next to the models (Kenney terms)',
  kitDirs.every(d => fs.existsSync(dir+'/public/models/skyflyer/'+d+'/License.txt')), kitDirs.join(', '));
const texNeeded = kitDirs.filter(d => kitFiles.some(f=>f.startsWith(d+'/')) &&
  fs.readdirSync(dir+'/public/models/skyflyer/'+d).includes('Textures'));
chk('a textured kit keeps its OWN colour atlas (kits never share one by accident)',
  texNeeded.every(d => fs.existsSync(dir+'/public/models/skyflyer/'+d+'/Textures/colormap.png')),
  texNeeded.join(', '));
const vercelAR = read('vercel.json');
chk('the models are actually served in production (/models route, before the catch-all)',
  /"src":\s*"\/models\/\(\.\*\)"/.test(vercelAR) &&
  vercelAR.indexOf('"/models/(.*)"') < vercelAR.indexOf('"src": "/(.*)"'));
chk('the engine loads a GLTF loader to read them', /<script src="\/GLTFLoader\.js"><\/script>/.test(html));
chk('ONLY the islands world is dressed (the other two journey stops cannot move)',
  /world\.terrain!=="islands"\|\|!renderer/.test(html));
chk('the hand-built stand-in shapes are still there as the fallback (replace first, remove second)',
  /function buildPalm\(/.test(html) && /function buildFeature\(/.test(html) && /d\.mock\[i\]\.visible=false/.test(html));
chk('models are flattened to one draw call each before they are cloned (iPad budget)',
  /function mergeByMaterial\(/.test(html) && /flat=mergeByMaterial\(root\)/.test(html));
chk('an untextured model borrows the world palette, so FL4 recolouring still reaches it',
  /o\.material=M\.stone;/.test(html));
chk('the art can never hold the world hostage (the kit load has a timeout)',
  /setTimeout\(function\(\)\{ left=0; finish\(\); \},\s*\d+\)/.test(html));
chk('the boats are decoration only — nothing new to crash into',
  !/floaters.*hitR|hitR.*floaters/.test(html));

// ---------------------------------------------------------------------------
// AR1b) THE LOOK PASS. Sand islands, water with a surface, real buildings and
// real coins. These checks exist because every one of them was a note from
// Mike on the first pass, and a note that is only fixed is a note that comes
// back.
// ---------------------------------------------------------------------------
console.log('--- AR1b: sand, water, buildings, coins ---');
// AR1M: THE WOBBLED CONE IS GONE from the islands world. An island is a plan of
// FLAT TIERS, because a cone has no flat ground and every one of Mike's notes
// about huts on stilts and camps crowding a summit came out of that one fact.
// These checks guard the new shape; the old ones guarded a shape that no longer
// exists and would have passed forever without noticing.
chk('an island is TERRACED FLAT TIERS, not a cone (the mix Mike picked)',
  /function tierPlan\(/.test(html) && /function buildTerraces\(/.test(html) &&
  /function buildTier\(/.test(html) && !/var shape=ISLE_GEO\[/.test(html));
chk('the coastline is LOW FREQUENCY only, so a thin spur cannot be built',
  /function outlineR\(a,R,ph\)/.test(html) &&
  /1\+0\.075\*Math\.sin\(2\*a\+ph\)\+0\.05\*Math\.sin\(3\*a\+ph\*1\.7\+0\.9\)\+0\.028\*Math\.sin\(5\*a\+0\.6\)/.test(html) &&
  // no high harmonic and no big amplitude anywhere in the outline
  !/Math\.sin\(([7-9]|1\d)\*a/.test(html));
chk('islands are WIDER than they are tall (a spire is not an island)',
  /var coast=rad\*1\.10;/.test(html) && /hh=Math\.min\(hh,coast\*0\.52\);/.test(html),
  'height is capped at 0.52 of the coast radius, so width is at least 3.8x height');
chk('the land carries on below the waterline into a shelf',
  /var plan=\[\], prev=-7;/.test(html) && /bottom:prev/.test(html));
chk('a tier is a flat cap plus a CUT wall, and the beach wall is the wet shelf',
  /out\.push\(new THREE\.Mesh\(cap,t\.sand\?M\.beach:M\.tier\)\)/.test(html) &&
  /out\.push\(new THREE\.Mesh\(wall,t\.sand\?M\.rock2:M\.cliff\)\)/.test(html));
// The two traps the bake-off mock found, both of which look like a colour bug
// and are actually geometry: walls wound the other way face INWARD and render
// as khaki back-faces, and smooth normals around a rim average into an olive
// sheen under the green ground bounce.
chk('cliff walls are wound OUTWARD (b0,t0,b1 / t0,t1,b1), not inward',
  /wp\.push\.apply\(wp,b0\); wp\.push\.apply\(wp,q0\); wp\.push\.apply\(wp,b1\);/.test(html) &&
  /wp\.push\.apply\(wp,q0\); wp\.push\.apply\(wp,q1\); wp\.push\.apply\(wp,b1\);/.test(html));
chk('cliff walls are FACETED - every segment its own cut face, no shared verts',
  /wall\.setAttribute\("position"/.test(html) && !/wall\.setIndex/.test(html));
chk('the cliff has its own palette slot and its OWN map, never the sand grain',
  /cliff:0xDDAE62/.test(html) && /function cliffTexture\(/.test(html) &&
  /if\(cliffTex\) M\.cliff\.map=cliffTex/.test(html) &&
  !/M\.cliff\.map=sandTex/.test(html));
chk('the tier caps are read RADIALLY, and as RINGS - a fan spirals the map',
  /var SEG=64, RINGS=7/.test(html) && /Math\.pow\(ri\/RINGS,1\.7\)/.test(html) &&
  /uv\.push\(f, s\/SEG\*4\)/.test(html));
chk('the beach carries a TIDE LINE and grain that thickens at the waterline',
  /function radialTexture\(/.test(html) && /createLinearGradient\(194,0,256,0\)/.test(html) &&
  /dens=0\.06\+0\.20\*\(gx\/256\)/.test(html));
chk('the grass tiers carry a worn dirt path',
  /rgba\(120,96,52,/.test(html));
chk('every new surface map is WHITE-based, so the manifest still owns the colour',
  (html.match(/x\.fillStyle="#ffffff"; x\.fillRect\(0,0,(256,256|256,128)\)/g)||[]).length >= 4);
chk('the land is shaded, not faceted, and carries grain like the models do',
  /function grainTexture\(/.test(html) && /M\.rock\.map=sandTex/.test(html) &&
  /M\.cap\.map=grassTex/.test(html) && /m\.flatShading=false/.test(html));
chk('the island has a coastline, not a silhouette (enough segments to read close up)',
  /var SEG=64, RINGS=7/.test(html));
chk('the landing pad stands on the same terraced land, deck never buried',
  /var PAD_PLAN=/.test(html) && /\{r:25,ph:1\.9,bottom:1\.6,top:8\.4,sand:false,i:1\}/.test(html) &&
  /var PAD_R=16, PAD_TOP=10;/.test(html));
chk('a low sandbar is the beach ring on its own, bare sand',
  /function tierCount\(rad,hh,big\)\{ return big\?\(hh>=12\?4:3\):\(rad>=12\?2:1\); \}/.test(html) &&
  /1:\[1\]/.test(html));
// THE ONE QUESTION EVERY PROP ASKS. It used to be isleSurf() on the cone. If a
// second way of answering it ever appears, props start floating again.
chk('there is ONE function that says how high the land is, and it is landTop()',
  /function landTop\(plan,x,z\)/.test(html) &&
  !/isleSurf\(/.test(html.split('function dressIsle(')[1]||'') &&
  !/isleSurf\(/.test((html.split('} else { // islands')[1]||'').slice(0,3000)));
chk('a prop that lands in the sea is NOT placed, never fudged onto the surface',
  /var y=landTop\(plan,x,z\);\s*\n\s*if\(y==null\) return null;/.test(html));
chk('placement measures the outline AT THAT ANGLE, not the nominal radius',
  /function ringAt\(i,frac,ang\)/.test(html) &&
  /var outer=outlineR\(ang,plan\[i\]\.r,plan\[i\]\.ph\)/.test(html));
// AR1M: the Kenney feature blocks. Their carved faces point -Z, so a block that
// is not turned shows a plain back - that is what the bake-off's debug view was
// for, and it is worth a check because the mistake is invisible in code review.
chk('the feature blocks turn their CARVED FACE outward',
  /p\.rotation\.y=Math\.PI\/2-a\+Math\.PI;/.test(html));
chk('waterfall, steps and cave are loaded from the repo, not from a stranger',
  /var TERRA_BASE="\/models\/skyflyer\/kitterrain\/"/.test(html) &&
  ['cliff_waterfallTop_rock.glb','cliff_steps_rock.glb','cliff_blockCave_rock.glb']
    .every(f => html.indexOf(f)>=0 && fs.existsSync(dir+'/public/models/skyflyer/kitterrain/'+f)));
chk('the terrain blocks are remapped in the right ORDER (water first, dirtDark before dirt)',
  (()=>{ const m=(html.match(/var TERRA_REMAP=\[[\s\S]*?\];/)||[''])[0];
    return m.indexOf('^water$') >= 0 && m.indexOf('^water$') < m.indexOf('dirtDark')
        && m.indexOf('dirtDark') < m.lastIndexOf('/dirt/i'); })());
chk('a feature block costs NO extra draw call - it joins the island buckets',
  /addIsleFeatures\(d\.raw,plan,r\);/.test(html) &&
  /var remerged=mergeByMaterial\(d\.raw\);/.test(html));
// AR1M: the scale ruler, written down in the engine so it stops drifting.
chk('THE SCALE RULER is in the engine: plane : palm : hut = 10 : 10 : 4.5',
  /plane : palm : hut = 10 : 10 : 4\.5/.test(html));
chk('the camp shrank to the ruler (homes 3.2-4.8u, not the 5.5-9u giants)',
  /inst\(pick\(r,camp\.homes\), 3\.2\+r\(\)\*1\.6\)/.test(html) &&
  !/inst\(pick\(r,camp\.homes\), 5\.5\+r\(\)\*3\.5\)/.test(html));
// AR1M: a real sky. Both new slots are OPTIONAL - a world that declares neither
// gets exactly what it had, which is how Snowy Peaks and Sunset Canyon stay
// untouched until AR2.
chk('the sky is a GRADIENT dome with a sun halo, built in code',
  /function skyGradientTexture\(/.test(html) && /side:THREE\.BackSide/.test(html) &&
  /THREE\.AdditiveBlending/.test(html));
// FL8 rewrote the halo colour: 0xFFF3CC has a full blue channel, and an ADDITIVE
// blend onto a sky that is already at full blue can only push the result cyan,
// which is why the sun read as a cold flashbulb. FL8b then went further on
// Mike's pick - warmer still, and WIDE AND FAINT so the warmth spreads across
// the sun's half of the sky instead of sitting in a tight ring.
chk('the sky colours are MANIFEST SLOTS with safe built-in fallbacks',
  /skyTop:0x2C7BCE, skyHigh:0x3E9AE0, skyMid:0x5FB6EC/.test(html) &&
  /skyLow:0x9FD8F2, skyPale:0xE2F3F0, skyHorizon:0xFFE6C6/.test(html) &&
  /sunGlow:0xFFD9A0, sunGlowSize:700, sunGlowStrength:0\.30/.test(html) &&
  /if\(world\.skyTop==null\) return;/.test(html) &&
  /for\(sbi=0;sbi<SKY_BANDS\.length;sbi\+\+\)\{\s*\n\s*var sv=hexNum\(p\[SKY_BANDS\[sbi\]\[0\]\]\)/.test(html));

// ==========================================================================
//  FL8b - THE SKY IS A LADDER, AND EVERY RUNG SITS ABOVE THE WATERLINE.
//  This is the check that exists because of a real bug, not a preference.
//  On the dome v=0.5 IS the horizon, so a gradient stop past 0.50 is painted
//  UNDER THE SEA. The original two stops were at 0.46 and 0.78, which meant
//  the only colour a kid ever saw was the first one - the sky was literally a
//  one-colour gradient. If a rung ever drifts past 0.50 again, that is back.
// ==========================================================================
const SKY_BAND_POS = [...html.matchAll(/\["(sky\w+)",\s*([0-9.]+)\]/g)]
  .map(m => [m[1], parseFloat(m[2])]);
chk('FL8b: the sky ladder has six named rungs',
  SKY_BAND_POS.length === 6 &&
  ['skyTop','skyHigh','skyMid','skyLow','skyPale','skyHorizon']
    .every((k,i) => SKY_BAND_POS[i] && SKY_BAND_POS[i][0] === k),
  SKY_BAND_POS.map(b=>b[0]+'@'+b[1]).join(' '));
chk('FL8b: EVERY rung is above the waterline (past 0.50 is under the sea)',
  SKY_BAND_POS.length > 0 && SKY_BAND_POS.every(b => b[1] <= 0.50),
  'lowest rung at ' + Math.max(...SKY_BAND_POS.map(b=>b[1])));
chk('FL8b: the rungs climb, and they are spread rather than bunched',
  SKY_BAND_POS.every((b,i) => i === 0 || b[1] > SKY_BAND_POS[i-1][1]) &&
  SKY_BAND_POS.filter(b => b[1] < 0.50).length >= 5);
chk('FL8b: the two-slot fallback ramp was fixed too, so AR2 cannot inherit it',
  !/g\.addColorStop\(0\.46,/.test(html) && !/g\.addColorStop\(0\.78,/.test(html) &&
  /g\.addColorStop\(0\.42,hx\(t\)\)/.test(html) &&
  /g\.addColorStop\(0\.50,hx\(h\)\)/.test(html));
chk('FL8b: the halo went WIDE AND FAINT - same light, spread out',
  /sunGlowSize:700/.test(html) && /sunGlowStrength:0\.30/.test(html) &&
  /var GA=world\.sunGlowStrength!=null\?world\.sunGlowStrength:0\.50;/.test(html) &&
  /var GS=world\.sunGlowSize!=null\?world\.sunGlowSize:320;/.test(html) &&
  /new THREE\.PlaneGeometry\(GS,GS\)/.test(html));
// ==========================================================================
//  FL8c - THE SEA GETS DEPTH. Same complaint as the sky, other half of the
//  screen. The colour has to live in the VERTICES because a multiply map can
//  only darken (look rule 9) and a shallow has to be BRIGHTER than the sea.
// ==========================================================================
chk('FL8c: the sea colour lives in the VERTICES, and the material is held WHITE',
  /M\.ground\.vertexColors=true/.test(html) &&
  /groundGeo\.setAttribute\("color"/.test(html) &&
  /M\.ground\.color\.setHex\(0xFFFFFF\)/.test(html));
// The trap that cost a render: applyPalette writes the sea colour back onto the
// MATERIAL about a second after load, and material x vertex multiplies the sea
// by itself. If this guard goes, the whole ocean turns navy on the live site
// and looks fine in every screenshot taken before the manifest lands.
chk('FL8c: the double-multiply guard is there (material x vertex = navy ocean)',
  /if\(M\.ground\.color\.getHex\(\)!==0xFFFFFF\)\{/.test(html) &&
  /seaRange\(M\.ground\.color\.getHex\(\)\)/.test(html));
chk('FL8c: the manifest still owns the sea - every shade is derived from ONE slot',
  /function seaRange\(midHex\)\{/.test(html) &&
  /SEA_MID\.getHSL\(h\)/.test(html) &&
  /SEA_DEEP\.setHSL\(/.test(html) && /SEA_SHAL\.setHSL\(/.test(html) &&
  /seaRange\(world\.ground\)/.test(html) &&
  /world\.seaDeep!=null/.test(html) && /world\.seaShallow!=null/.test(html));
chk('FL8c: the range goes BOTH WAYS round the manifest colour, or the sea goes navy',
  /if\(n<0\.5\) _seaC\.copy\(SEA_DEEP\)\.lerp\(SEA_MID,n\*2\);/.test(html) &&
  /else\s+_seaC\.copy\(SEA_MID\)\.lerp\(SEA_LIGHT,\(n-0\.5\)\*2\);/.test(html));
chk('FL8c: the depth patches are pinned to the WORLD, not to the camera',
  /var wx=gBase\[i\*3\]\+S\.pos\.x, wz=gBase\[i\*3\+2\]\+S\.pos\.z;/.test(html) &&
  /function seaNoise\(x,z\)\{ return seaVN\(x\/230,z\/230\)/.test(html));
chk('FL8c: the island list is on a slow tick, not per vertex per frame',
  /if\(\(_seaTick\+\+ % 30\)===0\) seaIsleList\(\)/.test(html) &&
  /if\(dx\*dx\+dz\*dz>820\*820\) continue;/.test(html));
chk('FL8c: only the islands world gets it (AR2 untouched)',
  /if\(!SEA\|\|!groundGeo\.attributes\.color\) return;/.test(html) &&
  /^if\(SEA\)\{\n  seaRange\(world\.ground\);/m.test(html));
chk('FL8c: a parked camera recolours the sea too, or the shot is a frame stale',
  (()=>{ const l=html.slice(html.indexOf('look:function(pos,at)'),html.indexOf('release:function()'));
         return /stepSeaColour\(\)/.test(l); })());

chk('FL8b: repainting the sky feeds the WHOLE world to the gradient, not two colours',
  /function skyGradientTexture\(w\)\{/.test(html) &&
  /skyGradientTexture\(world\)/.test(html) &&
  !/skyGradientTexture\(nt,nh\)/.test(html));
chk('the halo sits BEHIND the disc on the camera ray (coplanar it pinwheels)',
  /function placeSunGlow\(\)/.test(html) && /vx\/L\*60/.test(html));
chk('AR2 is still untouched: only the islands world declares a sky dome',
  (html.match(/skyTop:0x/g)||[]).length === 1);

// ==========================================================================
//  FL8 - SOFT CLOUDS AND SUN RAYS. AR1M did the dome and the halo; this is the
//  half it did not do. Everything here is guarded on the SHAPE of the fix, not
//  on the words in the comment, because a check that guards a shape which no
//  longer exists passes forever.
// ==========================================================================
chk('FL8: a cloud is no longer a bag of hard SPHERES',
  /function buildClouds\(/.test(html) && /function cloudPuffTexture\(/.test(html) &&
  !/var puff=new THREE\.SphereGeometry\(1,7,5\)/.test(html) &&
  !/clouds\.push\(g\)/.test(html));
chk('FL8: every cloud in the sky is ONE mesh and ONE draw call',
  (()=>{ const b=html.slice(html.indexOf('function buildClouds('),html.indexOf('function driftClouds('));
         return (b.match(/new THREE\.Mesh\(/g)||[]).length===1 &&
                /scene\.add\(CLOUDS\)/.test(b) &&
                (html.match(/scene\.add\(CLOUDS\)/g)||[]).length===1; })());
chk('FL8: the puffs are QUADS turned to face the camera, not gl_PointSize',
  /function stepClouds\(/.test(html) && /camera\.matrixWorld\.elements/.test(html) &&
  !/CLOUDS=new THREE\.Points\(/.test(html));
chk('FL8: the LIGHT is baked into the puff picture - that is what gives it volume',
  (()=>{ const t=html.slice(html.indexOf('function cloudPuffTexture('),html.indexOf('// The wind.'));
         return /createImageData/.test(t) && /var lit=/.test(t) && /Math\.pow\(1-r,/.test(t); })());
chk('FL8: a fair-weather cloud is nearly white (a dark underside reads as smog)',
  /d\[k\]  =Math\.round\(255\*\(0\.82\+0\.18\*lit\)\)/.test(html));
chk('FL8: the sky wraps around the kid, so an endless world never runs out of clouds',
  /function driftClouds\(/.test(html) && /driftClouds\(dt\);/.test(html) &&
  /if\(C\.x-px>560\) C\.x-=1120/.test(html));
chk('FL8: the wind is ONE number, so a shadow and the cloud casting it agree',
  /var WIND=\{x:3\.2,z:1\.1\}/.test(html) &&
  /C\.x\+=dt\*WIND\.x\*C\.sp/.test(html) &&
  (html.match(/C\.x\+=dt\*3\.2/g)||[]).length===0);
chk('FL8: ONE SHADOW PER CLOUD - a shadow now belongs to something',
  /SHAD_N=CLUMPS\.length\|\|16/.test(html) &&
  /if\(C\.src\)\{ C\.x=C\.src\.x; C\.z=C\.src\.z; \}/.test(html));
// The AR1M pinwheel trap, one layer further out. Coplanar with the sun disc,
// anything additive z-fights into spokes from every camera that is not the
// plane's. The halo sits 60 behind; the rays have to sit BEHIND THE HALO.
chk('FL8: the rays sit behind the disc AND behind the halo on the camera ray',
  /function placeSunRays\(/.test(html) && /vx\/L\*95/.test(html) &&
  /vx\/L\*60/.test(html));
chk('FL8: the ray fan is a smooth angular function, never drawn triangles',
  (()=>{ const t=html.slice(html.indexOf('function sunRayTexture('),html.indexOf('var SKY_DOME='));
         return /Math\.atan2\(uy,ux\)/.test(t) && /Math\.cos\(ang\*17/.test(t) &&
                !/lineTo/.test(t) && !/moveTo/.test(t); })());
chk('FL8: the fan TURNS by rotating the picture, because lookAt owns the mesh',
  /t\.center\.set\(0\.5,0\.5\)/.test(html) &&
  /SUN_RAYS\.material\.map\.rotation=t\*0\.035/.test(html));
chk('FL8: the two new colours are optional manifest slots, wired to repaint live',
  /sunRays:0xFFDF96, cloud:0xFFFFFF/.test(html) &&
  /world\.sunRays!=null\?world\.sunRays:/.test(html) &&
  /world\.cloud!=null\?world\.cloud:0xFFFFFF/.test(html) &&
  /var sr=hexNum\(p\.sunRays\)/.test(html) && /var cl=hexNum\(p\.cloud\)/.test(html));
chk('FL8: AR2 is STILL untouched - only the islands world gets rays',
  (html.match(/sunRays:0x/g)||[]).length === 1);
chk('FL8: a parked camera re-faces the billboards, or every screenshot is empty',
  (()=>{ const l=html.slice(html.indexOf('look:function(pos,at)'),html.indexOf('release:function()'));
         return /stepClouds\(0\)/.test(l) && /placeSunRays\(time\)/.test(l); })());
chk('the Quaternius models already in the repo are actually USED, not left on a shelf',
  (()=>{ const q=[...html.matchAll(/^\s*(q\w+):"\.\.\/nature\/([\w\-]+\.gltf)"/gm)];
         return q.length>=6 &&
           q.every(m=>fs.existsSync(dir+'/public/models/nature/'+m[2])) &&
           q.some(m=>(html.split('function dressIsle(')[1]||'').indexOf('"'+m[1]+'"')>=0); })());
// THE ONE THAT KEEPS COMING BACK. See-through water was tried at 0.74 and again
// at 0.90 and Mike rejected it BOTH times, plus once more before that: at a
// grazing angle a flat sheet lying across a beach always reads as glass and the
// land looks like it dissolves. There is no opacity that fixes it. The sea is
// opaque, and this check exists so no future session re-litigates it.
chk('THE SEA IS OPAQUE (see-through water was rejected three times)',
  /M\.ground\.transparent=false/.test(html) && /M\.ground\.opacity=1/.test(html) &&
  /M\.ground\.depthWrite=true/.test(html) && !/groundMesh\.renderOrder/.test(html));
// And the other half of the same complaint - "the water is on the land and
// coming up". A tall swell has nothing to stop it at a beach, so it climbs the
// sand. The sea moves by TEXTURE now, which has no height and cannot flood.
chk('the swell is too small to climb a beach (the texture carries the movement)',
  /if\(SEA\) h\*=0\.34;/.test(html) && /M\.ground\.map\.offset\.set/.test(html));
chk('the lagoon lies ON a calm surface, not floating clear of a swell',
  /halo\.position\.y=0\.45/.test(html));
chk('nothing that floats is left sitting under the surface',
  !/position\.set\([^)]*,-0\.4,[^)]*\)/.test(html.split('function dressPads(')[1]||'') &&
  /fo\.position\.y=0\.30\+/.test(html) && /boat\.position\.set\(bx,0\.55,bz\)/.test(html));
chk('the lagoon is a soft gradient laid ON the water, keyed to the island size',
  /halo\.scale\.set\(plan\.coast\*4\.26/.test(html) && /halo\.renderOrder=3/.test(html) &&
  /createRadialGradient/.test(html));
// AR1g: the lagoon is a RING, never a filled disc. A tinted CENTRE glazes the
// beach from a low camera and the island reads as see-through - that was the
// last live piece of Mike's "islands are see through" report after the sea
// went opaque. The two inner stops must stay at alpha 0.
chk('the lagoon is a RING - fully clear over the island and the beach',
  /addColorStop\(0\.00,"rgba\(214,250,252,0\)"\)/.test(html) &&
  /addColorStop\(0\.44,"rgba\(214,250,252,0\)"\)/.test(html));
// AR1g: Kenney Nature Kit "leafsGreen"/"grass" factors render MINT TURQUOISE in
// this renderer (no sRGB output stage) - the ghost cyan palm in Mike's photo.
// Named foliage borrows the manifest's leaf colour, same cure as the rocks.
chk('untextured foliage borrows the world leaf colour (no mint palms)',
  /leafs\?\|grass/.test(html) && /o\.material=M\.leaf/.test(html) &&
  /woodbark/i.test(html) && /o\.material=M\.trunk/.test(html));
// AR1g: the crown coin ring used to thread THROUGH the summit camp at a fixed
// radius 7 - Mike photographed a coin inside the lookout roof. It must scale
// with the island so it circles outside the buildings.
chk('crown coins circle OUTSIDE the summit camp, not through it',
  /var ringR=Math\.max\(10,isle\.userData\.hitR\*0\.72\)/.test(html) &&
  !/makeCoin\(ix\+Math\.cos\(a\)\*7,/.test(html));
chk('the sea has a moving surface, painted in code (nothing to download)',
  /function makeRippleTexture\(/.test(html) && /CanvasTexture/.test(html) &&
  /M\.ground\.map\.offset\.set/.test(html));
chk('the ripple sheet is WHITE, so the manifest still owns the sea colour',
  /x\.fillStyle="#ffffff"; x\.fillRect\(0,0,256,256\)/.test(html));
// AR1M: NO MINT. Kenney's linear colours render turquoise here, and the terrain
// blocks bring two more named materials in ("grass" is the mint one). If a raw
// mint value ever appears in this file as a colour, something skipped the remap.
chk('no mint turquoise is hard-coded anywhere in the engine',
  !/0x2[0-9A-Fa-f]D9B8|0x2BD9B8|0x2ED9C0|0x3FD9C4/.test(html) &&
  /\[\/grass\/i,\s*function\(\)\{ return M\.tier;/.test(html));
chk('only the islands world got the water treatment (other stops cannot move)',
  /var SEA=\(world\.terrain==="islands"\)/.test(html) && /if\(SEA\) h\*=/.test(html) &&
  /^if\(SEA\)\{$/m.test(html));
chk('every island sits in a soft lagoon, not a hard-edged disc',
  /function makeShallowTexture\(/.test(html));
// The note that started this pass: "you have the whole kenney kit and we are
// only using a few of one type." So the shelf SIZE is the check.
const kitNames = [...html.matchAll(/^\s*(\w+):"([\w\-\/\.]+\.glb)",?$/gm)].map(m=>m[1]);
const kitPaths = [...html.matchAll(/^\s*(\w+):"([\w\-\/\.]+\.glb)",?$/gm)].map(m=>m[2]);
const kitsUsed = [...new Set(kitPaths.map(f=>f.split('/')[0]))];
chk('the prop shelf is DEEP, not three models repeated', kitNames.length >= 40,
  kitNames.length+' models');
chk('the shelf draws on several Kenney kits, not one folder', kitsUsed.length >= 4,
  kitsUsed.join(', '));
chk('palms alone come in enough shapes that a beach is not one tree copied',
  kitNames.filter(n=>/^palm/i.test(n)).length >= 5,
  kitNames.filter(n=>/^palm/i.test(n)).join(' '));
const camps = (html.match(/var CAMPS=\[[\s\S]*?\n\];/)||[''])[0];
chk('a big island rolls a CHARACTER, so two islands are not the same camp twice',
  (camps.match(/name:"/g)||[]).length >= 4 && /homes:\[/.test(camps) && /props:\[/.test(camps),
  (camps.match(/name:"(\w+)"/g)||[]).join(' '));
chk('a camp is homes PLUS the clutter that makes a place look used',
  ['barrel','crate','logs','fire','chest','shovel','idol','mast'].every(k=>camps.indexOf('"'+k+'"')>=0));
chk('boats on the open water come in many shapes too',
  ['shipA','shipB','tug','sail','fish','speed','row','rowB'].every(k=>
    new RegExp('inst\\("'+k+'"').test(html)));
chk('ONLY rock is repainted by the palette, so Kenney greens and reds survive',
  /var KIT_TINT=\{rock/.test(html) && /!m\.map&&KIT_TINT\[name\]/.test(html));
chk('NO castle art on a tropical beach (the grey towers are gone for good)',
  !/tower-watch|tower-complete/.test(html) &&
  !fs.existsSync(dir+'/public/models/skyflyer/pirate/tower-watch.glb'));
chk('the kit rock clusters that read as mud on sand are gone too',
  !/rocks-sand/.test(html));
chk('a coin is turned with a raised middle and a rim, not a flat token',
  /function makeCoinGeo\(/.test(html) && /LatheGeometry/.test(html) &&
  /T\*1\.35/.test(html));
chk('the coin is two-tone for FREE (vertex colour, not a second object)',
  /g\.setAttribute\("color"/.test(html) && /vertexColors:true/.test(html));
// AR1Q: Mike asked for Sonic-bright, so the coin got bigger and hotter and the
// SHINE now comes from an additive halo. Guarding the new shape, not the old
// numbers - a check that guards a shape which no longer exists passes forever.
chk('gold is lit from inside and takes a hot highlight, so it reads as metal',
  /emissive:0x6A4600/.test(html) && /shininess:300/.test(html));
chk('AR1Q: the coin SHINES - an additive halo behind every one of them',
  /function coinGlow\(/.test(html) && /AdditiveBlending/.test(html) &&
  /COIN_GLOWTEX/.test(html));
chk('...and the halo is ONE point cloud per chunk, never a sprite per coin',
  /new THREE\.Points\(g,new THREE\.PointsMaterial\(\{size:[\d.]+,map:COIN_GLOWTEX/.test(html) &&
  /coinGlow\(g,coins\)/.test(html));
chk('coins shimmer along a trail instead of flashing in lockstep',
  /ph:\(Math\.abs\(x\*0\.7\+z\*1\.3\)%6\.283\)/.test(html) &&
  /rotation\.y=spin\+cc\.ph/.test(html));
// scope to the pad-dressing function: props are picked with ternaries, so a
// literal inst("name" prefix misses them - this is the SECOND check that got
// caught by that, hence doing it by function body from here on
const padBody = (html.split('function dressPads(')[1]||'').split('\nfunction ')[0];
chk('the landing pad is a place: dock, boat, buoys, palms, a hut and a flag',
  ['dock','deck','buoy','buoyB','palm','hutOpen','flag','crate','barrel']
    .every(k => padBody.indexOf(k) >= 0));
chk('...but the ORANGE RING, THE BEAM AND THE WINDSOCK still outrank the art',
  /padRing/.test(html) && /beam\.position\.y=100/.test(html) &&
  /color:0xFF8A3C/.test(html) && /sock\.rotation\.z=Math\.PI\/2/.test(html));

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
  // the same page WITHOUT the robot's autopilot: what a kid actually opens, which
  // is the only way to see the Free Flight / Jobs card the way they see it.
  const flyKid = (level, params='') => new JSDOM(page, { runScripts:'dangerously', pretendToBeVisual:false,
    url:'https://buildablekids.com/skyflyer-engine.html?level='+level+'&nodraw=1&manual=1'+params });
  const MAX = 9000;                       // 300 simulated seconds per world
  for (let i = 0; i < 3; i++) {
    const dom = fly(i);
    const w = dom.window;
    if (!w.SKY) { chk('world '+i+' engine booted', false, 'no SKY handle'); continue; }
    const name = w.SKY.world.name, goals = w.SKY.goals;
    // ---------- FL8 LIVE: the sky the engine ACTUALLY BUILT ----------
    // This harness has NO 2D canvas, so none of the sky PICTURES can be painted.
    // That is worth asserting in its own right: the correct behaviour with no
    // picture is nothing at all, because an untextured additive plane or an
    // untextured dome is a solid white shape swallowing the screen.
    const canvas2d = !!(w.document.createElement('canvas').getContext('2d'));
    const sky0 = w.SKY.sky();
    chk('FL8 ['+name+']: the cloudscape carries a real number of puffs',
      sky0.clumps >= 14 && sky0.puffs >= 300,
      sky0.clumps+' clouds, '+sky0.puffs+' puffs, '+sky0.cloudMeshes+' mesh');
    // the ladder and the halo size are world VALUES, not pictures, so they are
    // readable even in a harness that cannot paint anything
    if (i === 0) chk('FL8b [islands]: the sky declares all six rungs and the wide halo',
      sky0.bands === 6 && sky0.glowSize === 700,
      sky0.bands+' rungs, halo '+sky0.glowSize);
    else chk('FL8b ['+name+']: AR2 untouched - no ladder, halo size left at the default',
      sky0.bands === 0 && sky0.glowSize === 320,
      sky0.bands+' rungs, halo '+sky0.glowSize);
    // FL8c: the sea. seaFlat true would mean the material is carrying a colour
    // again, which is the navy-ocean bug about to happen.
    if (i === 0) chk('FL8c [islands]: the sea is vertex-coloured and not double-multiplied',
      sky0.seaVerts > 1000 && sky0.seaFlat === false,
      sky0.seaVerts+' sea points, material white: '+(!sky0.seaFlat));
    else chk('FL8c ['+name+']: AR2 untouched - no vertex-coloured water',
      sky0.seaVerts === 0, sky0.seaVerts+' sea points');
    if (canvas2d) {
      chk('FL8 ['+name+']: every cloud in the sky is one mesh', sky0.cloudMeshes === 1);
      if (i === 0) {
        chk('FL8 [islands]: dome, halo and rays are all there',
          sky0.dome === true && sky0.glow === true && sky0.rays === true);
        chk('FL8 [islands]: rays sit BEHIND the halo which sits BEHIND the disc',
          sky0.raySep > sky0.glowSep && sky0.glowSep > 0,
          'disc 0 < halo '+sky0.glowSep+' < rays '+sky0.raySep);
      } else {
        chk('FL8 ['+name+']: AR2 untouched - no dome, no halo, no rays',
          sky0.dome === false && sky0.glow === false && sky0.rays === false);
      }
    } else {
      chk('FL8 ['+name+']: with no 2D canvas the sky draws NOTHING (never a white ball)',
        sky0.cloudMeshes === 0 && sky0.dome === false && sky0.glow === false && sky0.rays === false);
    }
    let t = 0;
    for (; t < MAX; t++) { w.SKY.tick(1/30); if (w.SKY.beaten()) break; }
    // Fly a very long way and the sky has to still be overhead. Before FL8 the
    // clouds sat in a fixed box the kid could simply leave behind.
    const s1 = w.SKY.snapshot();
    const sky1 = w.SKY.sky();
    chk('FL8 ['+name+']: the sky follows the kid across an endless world',
      sky1.nearestCloud < 620 && Math.hypot(s1.x, s1.z) > 200,
      'flew '+Math.round(Math.hypot(s1.x,s1.z))+'u out, nearest cloud '+sky1.nearestCloud+'u');
    const s = w.SKY.snapshot();
    if (i === 0) {
      // AR1: this DOM has no WebGL at all. The kit must refuse to start and the
      // island must still be a whole island built from the stand-in shapes.
      const kit = w.SKY.kit(), dr = w.SKY.dressed();
      chk('AR1: with no renderer the model kit never starts', kit.started===false && kit.on===false);
      chk('AR1: the world is still full of islands without a single model loaded',
        dr.isles > 0 && dr.dressed === 0, dr.isles+' islands, '+dr.dressed+' dressed');
      // ------------------------------------------------------------------
      // AR1M LIVE: the three checks the rebuild exists for. These read the
      // ISLANDS THE ENGINE ACTUALLY BUILT, not the source text, because the
      // whole point of terraced land is a property of the built shape.
      // ------------------------------------------------------------------
      const shapes = [];
      for (let k = 0; k < 24; k++) { const sh = w.SKY.isleShape(k); if (sh) shapes.push(sh); }
      // ===================== AR1Q - THE LIVING ISLAND =====================
chk('AR1Q: the plane is TURNED AND LOFTED - not one box left in the starter ride',
  /function turnedBody\(/.test(html) && /function wingLoft\(/.test(html) &&
  /function loftRibs\(/.test(html) &&
  !/new THREE\.BoxGeometry\(span,0\.42,2\.6\)/.test(html));
chk('...and it still fits the scale ruler: 10u long, 13u across',
  /\[0\.02,-4\.9\]/.test(html) && /\[0\.02,4\.82\]/.test(html) &&
  /wingSpan:13/.test(html));
chk('...and the kid in the cockpit is a real face on the screen',
  /function kidPilot\(/.test(html) && /kidPilot\(0\.96,2\.05,0\.92\)/.test(html));
chk('...and the control surfaces move with the stick, so it reads as FLYING',
  /surf\.ailL\.rotation\.x= bank\*0\.9/.test(html) &&
  /surf\.rud\.rotation\.y = -bank\*0\.55/.test(html));
chk('AR1Q: WHEELS, not floats - nothing may promise a water landing',
  /THE UNDERCARRIAGE|WHEELS\. Spats in the WING colour/.test(html) === false ||
  (/tWheel/.test(html) && !/float|pontoon/i.test(html.split('function buildPlane(')[1].split('function buildCopter(')[0])));
chk('AR1Q: the animals are ONE draw call each - merged, and the colour survives',
  /function anmMerge\(/.test(html) && /g\.attributes\.color/.test(html) &&
  /vertexColors:true/.test(html));
chk('...the kit has no crab, parrot or fish, so those three are built in code',
  /HB_BUILD=\{[\s\S]{0,400}crab:/.test(html) && /parrot:function/.test(html) &&
  /fish:function/.test(html));
chk('AR1Q: nothing has a skeleton, so the legs are bent HERE - five gaits',
  ['walk','hop','crawl','plod','flap'].every(g => new RegExp(g+':function\\(R,t,pa').test(html)));
chk('...and the leg-bending is BUDGETED, because vertices are CPU not draw calls',
  /PUP_BUDGET=\d+/.test(html) && /slice\(0,PUP_BUDGET\)/.test(html));
chk('...and a puppeted animal gets its OWN geometry or the species moves in lockstep',
  /mesh\.geometry=mesh\.geometry\.clone\(\)/.test(html));
chk('AR1Q: every animal is placed by landTop, exactly like every other prop',
  (() => { const b=(html.split('function dressAnimals(')[1]||'').split('\nfunction dressLiving')[0];
    return /y=landTop\(plan,x,z\)/.test(b) && /if\(y==null\) return null/.test(b); })());
chk('AR1Q: the far animals are hidden, or forty-five islands of them would show up',
  /PET_SEE2/.test(html) && /if\(!near\)\{ if\(o\.visible\) o\.visible=false; continue; \}/.test(html));
chk('AR1Q: all the smoke in the world is ONE mesh',
  /SMOKE=new THREE\.Points/.test(html));
// AR1R — THE FLOCK IS GONE AND MUST NOT COME BACK AS TRIANGLES. The old pair of
// checks pinned the shape of a four-vertex gull; a check guarding a shape that
// no longer exists passes forever, so they are REWRITTEN into their opposite.
// Mike played AR1Q and said the birds looked like flying triangles, which is
// exactly what four vertices are. If birds return they have to be real models.
chk('AR1R: the four-vertex triangle flock is GONE, in the code and in the loop',
  !/GULLS/.test(html) && !/GULL_N|GULL_ST/.test(html) &&
  !/function buildGulls\(/.test(html) && !/function stepGulls\(/.test(html) &&
  !/stepGulls\(dt,t\)/.test(html) && !/buildGulls\(\);/.test(html));
chk('...and the reason is WRITTEN DOWN, so nobody re-adds a flock of Vs blind',
  /AR1R: THE FLOCK IS GONE, AND HERE IS WHY/.test(html) &&
  /DO NOT RE-ADD THE FOUR-VERTEX FLOCK/.test(html) &&
  /ONE DRAW/.test(html) && /CALL PER BIRD/.test(html));
chk('...and the rest of the world-life layer is untouched by the bird removal',
  /stepSmoke\(dt\); stepShadows\(dt\); stepWakes\(\);/.test(html) &&
  /buildSmoke\(\); buildShadows\(\); buildWakes\(\);/.test(html) &&
  /SWAY\.push/.test(html) && /WAVERS\.push/.test(html) && /SURF\.push/.test(html) &&
  /function startTravel\(/.test(html));
chk('AR1Q: flat meshes on the water are DOUBLE SIDED, or they face down and vanish',
  (() => { const sh=(html.split('function buildShadows(')[1]||'').split('\nfunction ')[0];
    const wk=(html.split('function buildWakes(')[1]||'').split('\nfunction ')[0];
    return /side:THREE\.DoubleSide/.test(sh) && /side:THREE\.DoubleSide/.test(wk); })());
chk('AR1Q: a travelling boat never sails onto its own island',
  (() => { const b=(html.split('function startTravel(')[1]||'').split('\nfunction ')[0];
    return /landTop\(pp\.plan,f\.position\.x,f\.position\.z\)!=null\) continue/.test(b) &&
           /d<pp\.plan\.coast\*1\.25\) continue/.test(b); })());
chk('AR1Q: the sway, the flags and the surf are FREE - they move what is already there',
  /SWAY\.push/.test(html) && /WAVERS\.push/.test(html) && /SURF\.push/.test(html) &&
  /o\.material===M_HALO/.test(html));
chk('AR1Q: the living layer is SUNNY ISLANDS ONLY - the other two worlds are AR2',
  /function stepIslandLife\(dt,t\)\{\s*\n?\s*if\(world\.terrain!=="islands"\) return;/.test(html) &&
  /function startLife\(\)\{\s*\n?\s*if\(world\.terrain!=="islands"/.test(html));
chk('AR1M: every island is FLAT TIERS, and a sandbar is the beach on its own',
        shapes.length > 0 && shapes.every(sh => sh.tiers >= 1 && sh.tiers <= 4) &&
        shapes.some(sh => sh.tiers >= 3) && shapes.every(sh => sh.big || sh.tiers <= 2),
        shapes.length + ' islands, tiers ' + [...new Set(shapes.map(sh=>sh.tiers))].sort().join('/'));
      chk('AR1M: NEVER TALLER THAN WIDE - measured on the built island, not the roll',
        shapes.length > 0 && shapes.every(sh => sh.height < sh.widest * 2),
        'worst height:width is 1:' + Math.min(...shapes.map(sh => sh.widest*2/sh.height)).toFixed(1));
      // A spur is a place where the coast pinches in far below its own average.
      // The generator cannot make one, and this proves it on the built outline.
      chk('AR1M: NO THIN SPUR - the coastline never pinches below 0.8 of its widest',
        shapes.length > 0 && shapes.every(sh => sh.narrowest / sh.widest > 0.78),
        'tightest pinch ' + Math.min(...shapes.map(sh => sh.narrowest/sh.widest)).toFixed(2));
      // FLAT GROUND UNDER EVERY STRUCTURE. This is the note that started the
      // rebuild: on the cone, huts perched on slopes. Every prop the engine
      // placed must be standing on the flat top of a tier - or, for the things
      // that belong there (docks, boats, buoys, offshore rocks), out on the water
      // on purpose. Nothing may be in between and nothing may hover.
      const stood = [];
      for (let k = 0; k < 24; k++) { const st = w.SKY.isleStand(k); if (st) stood.push(...st); }
      const onLand = stood.filter(o => !o.water);
      const hovering = onLand.filter(o => Math.abs(o.y - o.land) > 1.6);
      chk('AR1M: FLAT GROUND UNDER EVERY STRUCTURE - nothing perched, nothing hovering',
        onLand.length > 0 && hovering.length === 0,
        onLand.length + ' props on land, ' + hovering.length + ' off the ground, ' +
        (stood.length - onLand.length) + ' out on the water on purpose');
    }
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
  // THE FL4 PROOF — the polish layer has to actually work, live: the manifest
  // really repaints a world, the music slot really switches, the buddy really
  // speaks (and rarely), and the learning gate never traps a kid who has no
  // parent app around it.
  // ------------------------------------------------------------------
  console.log('--- FL4 LIVE: manifest colours, music slot, buddy, learning gate ---');
  {
    const d4 = fly(0); const w4 = d4.window;
    chk('engine reports itself as FL9', w4.SKY.version === 'FL9', w4.SKY.version);
    const before = w4.SKY.paletteNow();
    const applied = w4.SKY.applyManifest(manifest);
    const after = w4.SKY.paletteNow();
    chk('the manifest palette really lands on the world', typeof after.sky === 'number' &&
      after.ground === parseInt(manifest.levels[0].palette.ground.slice(1),16) &&
      after.rock === parseInt(manifest.levels[0].palette.rock.slice(1),16),
      'ground #'+after.ground.toString(16)+'  rock #'+after.rock.toString(16));
    // change a colour in the manifest ONLY and prove the world follows it
    const recoloured = JSON.parse(JSON.stringify(manifest));
    recoloured.levels[0].palette.sky = '#112233';
    recoloured.levels[0].palette.ground = '#445566';
    w4.SKY.applyManifest(recoloured);
    const rec = w4.SKY.paletteNow();
    chk('changing a colour in the MANIFEST alone recolours the sky (no code change)',
      rec.sky === 0x112233 && rec.ground === 0x445566,
      'sky #'+rec.sky.toString(16)+' (was #'+before.sky.toString(16)+')');
    chk('a broken colour is ignored, not fatal', (()=>{ try{ w4.SKY.applyPalette({sky:'not-a-colour',ground:null}); return true; }catch(e){ return false; } })());
    chk('the music slot follows the manifest', applied.music === manifest.levels[0].music, 'world 1 plays '+applied.music);
    const canyon = w4.SKY.applyManifest({ levels:[{ music:'sky_soar_bright' }] });
    chk('a per-level music override really switches the bed', canyon.music === 'sky_soar_bright');
    chk('learning defaults come from the manifest', applied.learning.beforeUnlock === true && applied.learning.coinTopUp === true);
    w4.close();
  }
  {
    // a cold standalone link has no parent app: it must unlock with no gate and
    // never sit there waiting for a question nobody can answer.
    const d5 = fly(0); const w5 = d5.window;
    for (let k=0;k<MAX;k++){ w5.SKY.tick(1/30); if(w5.SKY.beaten()) break; }
    const g = w5.SKY.gate();
    chk('a cold standalone link is never trapped by the learning gate', g.pending === false && g.unlocked >= 1,
      'pending='+g.pending+' unlocked='+g.unlocked);
    const said = w5.SKY.buddyLog();
    chk('the buddy spoke on the win, and stayed rare', said.indexOf('win')>-1 && said.length <= 6, said.join(', '));
    w5.close();
  }

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

  // ------------------------------------------------------------------
  //  THE FL5 PROOF — the robot does every job for real. A job that cannot be
  //  finished is worse than no job at all, so every recipe gets flown: loaded
  //  up, delivered, paid into the shared wallet, badge kept, fact card shown.
  // ------------------------------------------------------------------
  console.log('--- FL5 LIVE: the robot does all four aircraft jobs ---');
  const JOB_WORLD = { 'mail-run':0, 'supply-drop':1, 'lost-explorer':1, 'lantern-lighter':2 };
  const JOB_MAX = 15000;                      // 500 simulated seconds is a huge allowance
  for (const id of JOB_IDS) {
    const dj = fly(JOB_WORLD[id], '&auto=1'); const wj = dj.window;
    if (!wj.SKY) { chk('job '+id+' booted', false, 'no SKY handle'); continue; }
    chk('job "'+id+'" starts from the mission engine', wj.SKY.startMission(id) === true && wj.SKY.mode() === 'job');
    const recipe = wj.SKY.mission();
    let t = 0;
    for (; t < JOB_MAX; t++) { wj.SKY.tick(1/30); if (wj.SKY.job().complete) break; }
    const j = wj.SKY.job();
    chk('job "'+recipe.name+'" FINISHED by autopilot', j.complete,
      j.done+'/'+j.of+' '+(recipe.verb||'').replace('!','').toLowerCase()+' in '+(t/30).toFixed(0)+'s of flight');
    chk('job "'+recipe.name+'" is about a minute of flying, not ten', (t/30) < 120, (t/30).toFixed(0)+'s for the robot');
    chk('job "'+recipe.name+'" paid its coins into the ONE shared wallet',
      j.paid === recipe.coins && wj.BuildableWallet.balance() >= recipe.coins, '+'+j.paid+' -> wallet '+wj.BuildableWallet.balance());
    chk('job "'+recipe.name+'" left a badge sticker behind', wj.SKY.badges()[id] === true, recipe.badge);
    chk('job "'+recipe.name+'" ends on a Did You Know card with a real fact',
      j.factUp === true && typeof recipe.fact === 'string' && recipe.fact.length > 40);
    chk('job "'+recipe.name+'" never asked a kid to hurry (no timer ran at all)',
      wj.SKY.state.paused === false && !('timeLeft' in wj.SKY.state) && !('lives' in wj.SKY.state));
    wj.close();
  }
  // a job cannot be lost: wander off in the middle of one and the dock is still
  // loaded and every drop point is still waiting when you come back.
  {
    const dw = fly(0, '&auto=1'); const ww = dw.window;
    ww.SKY.startMission('mail-run');
    for (let k=0;k<600;k++) ww.SKY.tick(1/30);
    const mid = ww.SKY.job();
    ww.SKY.autopilot(false);                             // let go of the controls and drift
    for (let k=0;k<900;k++) ww.SKY.tick(1/30);
    const drifted = ww.SKY.job();
    ww.SKY.autopilot(true);
    let t=0; for (; t<JOB_MAX; t++){ ww.SKY.tick(1/30); if (ww.SKY.job().complete) break; }
    chk('flying off in the middle of a job loses nothing at all',
      mid.done>0 && drifted.done>=mid.done && ww.SKY.job().complete,
      'delivered '+mid.done+' -> hands off the controls for 30s -> came back and finished');
    // and the dock genuinely never runs dry: do the whole job a second time in
    // the same flight and it loads up and finishes exactly the same way.
    ww.SKY.endMission(); ww.SKY.startMission('mail-run');
    let t2=0; for (; t2<JOB_MAX; t2++){ ww.SKY.tick(1/30); if (ww.SKY.job().complete) break; }
    chk('the dock never runs dry (the same job can be flown again straight away)',
      ww.SKY.job().complete && ww.SKY.job().done===3, 'second run finished in '+(t2/30).toFixed(0)+'s');
    ww.close();
  }
  // DISCOVERY — arriving asks nothing. The jobs are out there to be found, and
  // flying over one only ever asks.
  {
    const dk = flyKid(0, ''); const wk = dk.window;
    chk('arriving at a stop asks a kid nothing at all - they are just flying',
      wk.SKY.mode()==='free' && wk.SKY.offer().up===false && wk.SKY.state.picking===false);
    const sc = wk.SKY.scouts();
    // FL6: this stop now has THREE things standing out there, not one — the mail
    // dock, the hive and the cliff nest — so the check moved from "is it the one"
    // to "is it among them, and are they far enough apart to not be an airport".
    chk('this world\'s jobs are standing out there waiting to be found',
      sc.length===3 && sc.some(s=>s.id==='mail-run'&&s.x===0&&s.z===-190) &&
      sc.some(s=>s.id==='busy-bee') && sc.some(s=>s.id==='puffin-parent'), JSON.stringify(sc));
    // fly straight at it, the way a kid who spotted the beam would
    const S = wk.SKY.state; S.pos.x=0; S.pos.z=-60; S.pos.y=30; S.yaw=0;
    let t=0, seen=null;
    for (; t<600; t++){ wk.SKY.tick(1/30); const o=wk.SKY.findPill(); if(o.up){ seen=o; break; } }
    // FL15: the swoop RAISES A HAND. Nothing has opened, nothing has stopped.
    chk('swooping low over it raises the pill, by name', !!seen && seen.id==='mail-run',
      'pill up after '+(t/30).toFixed(1)+'s of flying at it');
    chk('FL15: the pill does NOT stop the game - the kid is still flying',
      wk.SKY.offer().up===false && wk.SKY.state.picking===false && wk.SKY.mode()==='free');
    // and flying on past it puts the hand back down, with nothing asked
    const zAway = wk.SKY.state.pos.z;
    for (let k=0;k<400 && wk.SKY.findPill().up;k++) wk.SKY.tick(1/30);
    chk('FL15: flying on past it lowers the pill again and asks nothing',
      wk.SKY.findPill().up===false && wk.SKY.offer().up===false &&
      wk.SKY.state.pos.z < zAway - 40);
    // come back round; the tap is the only door into the card
    wk.SKY.state.pos.x=0; wk.SKY.state.pos.z=-60; wk.SKY.state.pos.y=30; wk.SKY.state.yaw=0;
    for (let k=0;k<600;k++){ wk.SKY.tick(1/30); if (wk.SKY.findPill().up) break; }
    chk('FL15: tapping the pill is what opens the card',
      wk.SKY.tapPill()===true && wk.SKY.offer().up===true && wk.SKY.offer().id==='mail-run');
    chk('the sky waits while the kid decides', wk.SKY.state.picking===true);
    chk('"Not now" starts nothing at all', wk.SKY.declineOffer()===true && wk.SKY.mode()==='free' && wk.SKY.state.picking===false);
    let nagged=false;
    for (let k=0;k<250;k++){ wk.SKY.tick(1/30); if (wk.SKY.offer().up){ nagged=true; break; } }
    chk('and the same dock does not nag a kid who said no', nagged===false);
    wk.close();
  }
  {
    // "Do it" -> the job runs -> leaving costs nothing and it starts fresh next time
    const da = flyKid(0, ''); const wa = da.window;
    const S = wa.SKY.state; S.pos.x=0; S.pos.z=-60; S.pos.y=30; S.yaw=0;
    for (let k=0;k<600;k++){ wa.SKY.tick(1/30); if (wa.SKY.findPill().up) break; }
    wa.SKY.tapPill();   // FL15: the pill is the one door into the offer card
    chk('"Do it" starts the job the kid found', wa.SKY.acceptOffer()===true && wa.SKY.mode()==='job' && wa.SKY.job().id==='mail-run');
    chk('once a job is on, its start point is not doubled up in the world', wa.SKY.scouts().length===0);
    wa.SKY.autopilot(true);
    for (let k=0;k<900;k++) wa.SKY.tick(1/30);
    const partway = wa.SKY.job();
    chk('leaving a job halfway is one tap and goes back to flying',
      partway.done>0 && wa.SKY.leaveJob()===true && wa.SKY.mode()==='free',
      'left at '+partway.done+'/'+partway.of);
    chk('and the job goes back out into the world to be found again', wa.SKY.scouts().length===3);
    wa.SKY.startMission('mail-run');
    chk('coming back to it later starts fresh, as agreed', wa.SKY.job().done===0 && wa.SKY.job().carrying===0);
    wa.close();
  }
  {
    const dr = fly(0, '&auto=1'); const wr = dr.window;
    chk('the QA robot and the attract demo are never interrupted by an offer',
      wr.SKY.offer().up===false && wr.SKY.mode()==='free');
    wr.close();
    const dd = flyKid(0, '&mission=mail-run'); const wd = dd.window;
    chk('a job deep link starts straight away and survives a refresh',
      wd.SKY.mode()==='job' && wd.SKY.job().id==='mail-run' && wd.SKY.offer().up===false);
    wd.close();
    const dfree = flyKid(0, '&mode=free'); const wfree = dfree.window;
    chk('?mode=free is pure free flight - no jobs in the sky at all',
      wfree.SKY.scouts().length===0 && wfree.SKY.mode()==='free');
    wfree.close();
    const df = flyKid(1, ''); const wf = df.window;
    const s2 = wf.SKY.scouts();
    chk('every job in a world is out there to be found (Snowy Peaks)', s2.length===4, s2.map(s=>s.id).join(' + '));
    chk('the help button lists this world\'s jobs for a kid who cannot find one', wf.SKY.helpJobs()===4, wf.SKY.helpJobs()+' listed');
    const g = wf.SKY.guide('lost-explorer');
    chk('"Show me" points the one arrow at that job, without starting it',
      !!g && g.label==='Lost Explorer' && wf.SKY.mode()==='free', JSON.stringify(g));
    wf.close();
  }
  // ------------------------------------------------------------------
  //  THE FL5b PROOF — the pictures really come out of the recipe, the pin
  //  really pins, and the map blips really stand where the world says.
  //  A picture that is right for Mail Run and wrong for Lantern Lighter is a
  //  drawing, not a system, so every claim here is made against TWO recipes
  //  with different shapes: one that hands you cargo and one that does not.
  // ------------------------------------------------------------------
  console.log('--- FL5b LIVE: pictures, the pin and the map ---');
  {
    const dp = flyKid(0, ''); const wp = dp.window;
    const S = wp.SKY.state; S.pos.x=0; S.pos.z=-60; S.pos.y=30; S.yaw=0;
    for (let k=0;k<600;k++){ wp.SKY.tick(1/30); if (wp.SKY.findPill().up) break; }
    wp.SKY.tapPill();   // FL15: the pill is the one door into the offer card
    chk('the offer that came up is the one a non-reader can answer',
      wp.SKY.offer().up===true && wp.SKY.offer().id==='mail-run');
    const a = wp.SKY.offerCard();
    chk('the answer really is the GO pill and a quiet cloud, not a tick and a cross',
      !!a && /LET'S GO/.test(a.go.text) && a.go.ride===1 &&
      /Later/.test(a.later.text) && a.later.cloud===1,
      a ? a.go.text+'  /  '+a.later.text : 'no card');
    chk('the pill carries the ride this kid is actually flying',
      a.go.rideBuild === wp.SKY.ride.build, a.go.rideBuild);
    chk('the reward is on the card, and the sticker shows as still-to-win',
      a.reward.coins===1 && /\+15/.test(a.reward.label) && /Post Pilot/.test(a.reward.label) &&
      a.reward.stickerEarned===false, a.reward.label);
    chk('Hear it sits ON the picture, where a non-reader will find it',
      a.hearOnPicture===true);
    chk('the grown-up words start folded away, and the i opens them',
      a.wordsOpen===false && wp.SKY.tapInfo()===true && wp.SKY.tapInfo()===false);
    // THE POINT OF THE WHOLE BLOCK: the strip is COUNTED off the live DOM and
    // has to match the recipe's own numbers, not a number typed into a drawing.
    const recipe = wp.SKY.missions().filter(m=>m.id==='mail-run')[0];
    const strip = wp.SKY.offerStrip();
    chk('the picture is generated from the recipe: one start point, one stop per target',
      strip.cargo===1 && strip.targets===recipe.targets.length && strip.arrows===1,
      strip.targets+' stops drawn (recipe says '+recipe.targets.length+')');
    chk('the GO pill really is the yes: it starts the job the kid was shown',
      wp.SKY.acceptOffer()===true && wp.SKY.mode()==='job' && wp.SKY.job().id==='mail-run');
    // ---- progress as objects, live, as the deliveries actually happen ----
    const p0 = wp.SKY.progressStrip();
    chk('progress starts as a ghost cargo and three untouched places',
      p0.cargo===1 && p0.targets===recipe.targets.length && p0.done===0,
      JSON.stringify(p0));
    wp.SKY.autopilot(true);
    let seenCarry=0, seenDone=0;
    for (let k=0;k<15000;k++){
      wp.SKY.tick(1/30);
      const p = wp.SKY.progressStrip();
      if (p.cargo>seenCarry) seenCarry=p.cargo;
      if (p.done>seenDone) seenDone=p.done;
      if (wp.SKY.job().complete) break;
    }
    chk('loading up really puts more than one thing in your hands, as a picture',
      seenCarry>=2, seenCarry+' cargo icons at the fullest');
    const pEnd = wp.SKY.progressStrip();
    chk('every place turns green with a tick as it is done - no reading needed',
      seenDone===recipe.targets.length && pEnd.done===recipe.targets.length,
      pEnd.done+'/'+recipe.targets.length+' ticked');
    chk('...and the words survive underneath for a screen reader',
      /3\/3/.test(wp.SKY.state ? dp.window.document.getElementById('gCarry').getAttribute('aria-label')||'' : ''),
      dp.window.document.getElementById('gCarry').getAttribute('aria-label'));
    wp.close();
  }
  {
    // the SAME code, a recipe with a different shape: nothing to carry, four
    // lanterns instead of three houses. If the strip were a drawing this breaks.
    const dl = flyKid(2, ''); const wl = dl.window;
    const S = wl.SKY.state; const lp = wl.SKY.missions().filter(m=>m.id==='lantern-lighter')[0];
    const pt = lp.targets[0]; S.pos.x=pt.x; S.pos.z=pt.z+70; S.pos.y=30; S.yaw=0;
    for (let k=0;k<900;k++){ wl.SKY.tick(1/30); if (wl.SKY.findPill().up) break; }
    wl.SKY.tapPill();   // FL15: the pill is the one door into the offer card
    const st = wl.SKY.offerStrip();
    chk('a job with NOTHING to carry draws its first stop as the start, and all four lanterns',
      wl.SKY.offer().id==='lantern-lighter' && st.cargo===1 && st.targets===lp.targets.length,
      st.cargo+' + '+st.targets+' (recipe says '+lp.targets.length+' targets, capacity '+lp.capacity+')');
    wl.close();
  }
  {
    // ---- THE PIN ----
    const dw = flyKid(1, ''); const ww = dw.window;
    chk('nothing is pinned when a kid arrives', ww.SKY.waypoint()===null);
    const pinned = ww.SKY.pinJob('lost-explorer');
    const wpNow = ww.SKY.waypoint();
    const jobPt = ww.SKY.missions().filter(m=>m.id==='lost-explorer')[0].targets[0];
    chk('pinning a job puts it in the top bar with its real place and a live distance',
      !!wpNow && wpNow.up===true && wpNow.label==='Lost Explorer' &&
      wpNow.x===jobPt.x && wpNow.z===jobPt.z && wpNow.dist>0,
      JSON.stringify(wpNow));
    chk('and the big orange arrow follows the pin', (()=>{ const t=ww.SKY.arrowTarget();
      return !!t && t.x===jobPt.x && t.z===jobPt.z && t.label==='Lost Explorer'; })());
    const second = ww.SKY.pinJob('supply-drop');
    chk('ONE pin at a time: pinning another replaces it, it does not stack',
      ww.SKY.waypoint().label==='Supply Drop', JSON.stringify(second&&second.label));
    chk('the X drops the pin and the arrow goes back to a landing pad',
      ww.SKY.dropWaypoint()===true && ww.SKY.waypoint()===null && ww.SKY.arrowTarget()===null);
    // the pin OUTLIVES a job — that is the whole reason it exists
    ww.SKY.pinJob('lost-explorer');
    ww.SKY.startMission('supply-drop');
    const during = ww.SKY.waypoint();
    chk('starting a DIFFERENT job leaves the pin alone (the job just wins the arrow)',
      !!during && during.label==='Lost Explorer' && ww.SKY.arrowTarget().label!=='Lost Explorer');
    ww.SKY.autopilot(true);
    for (let k=0;k<600;k++) ww.SKY.tick(1/30);
    ww.SKY.leaveJob();
    chk('leaving the job hands the arrow straight back to the pin',
      ww.SKY.waypoint().label==='Lost Explorer' && ww.SKY.arrowTarget().label==='Lost Explorer');
    // pinning the job you are about to fly is pointless, so it retires itself
    ww.SKY.pinJob('supply-drop'); ww.SKY.startMission('supply-drop');
    chk('pinning a job and then doing it retires the pin', ww.SKY.waypoint()===null);
    ww.close();
  }
  {
    // ---- THE MAP. Every blip has to stand where the WORLD says it stands. ----
    const dm = flyKid(1, ''); const wm = dm.window;
    const S = wm.SKY.state; S.pos.x=0; S.pos.z=0; S.pos.y=40; S.yaw=0;
    const blips = wm.SKY.blips();
    const pads = wm.SKY.pads, jobs = wm.SKY.worldJobs();
    chk('the map shows this world\'s landing pads AND both of its jobs',
      blips.filter(b=>b.kind==='pad').length===pads.length &&
      blips.filter(b=>b.kind==='job').length===jobs.length,
      blips.map(b=>b.kind+':'+b.id).join(' '));
    chk('every blip carries the REAL world coordinate of the thing it stands for',
      jobs.every(m=>{ const p=(m.gather&&m.dropAt)||m.depot||m.targets[0];
        const b=blips.filter(x=>x.id==='job:'+m.id)[0];
        return b && b.x===p.x && b.z===p.z; }) &&
      pads.every((p,i)=>{ const b=blips.filter(x=>x.id==='pad'+i)[0]; return b && b.x===p.x && b.z===p.z; }));
    // and it is rotated into the plane's frame: ahead is UP, whichever way you face
    const SC = 0.055;
    const ahead = blips.filter(b=>b.z < 0 && !b.edge)[0];
    chk('with yaw 0, a thing in front of you sits ABOVE the triangle on the dial',
      !!ahead && ahead.my < 0 && Math.abs(ahead.mx - ahead.x*SC) < 0.01,
      ahead ? ahead.id+' at map ('+ahead.mx.toFixed(1)+','+ahead.my.toFixed(1)+')' : 'none');
    S.yaw = Math.PI/2;                                  // now pointing down -X
    const turned = wm.SKY.blips().filter(b=>b.id===ahead.id)[0];
    chk('turn the plane and the MAP turns with it, so up is always where you point',
      Math.abs(turned.mx - (ahead.x*Math.cos(S.yaw) - ahead.z*Math.sin(S.yaw))*SC) < 0.01 &&
      Math.abs(turned.my - (ahead.x*Math.sin(S.yaw) + ahead.z*Math.cos(S.yaw))*SC) < 0.01,
      '('+turned.mx.toFixed(1)+','+turned.my.toFixed(1)+')');
    S.yaw = 0;
    chk('a job you have not been to yet is a FAINT dot - the map saying there is more out there',
      wm.SKY.blips().every(b=>b.kind!=='job'||b.found===false));
    // fly to one and it goes gold
    const first = jobs[0], fp = first.depot||first.targets[0];
    S.pos.x=fp.x; S.pos.z=fp.z+200;
    for (let k=0;k<10;k++) wm.SKY.tick(1/30);
    chk('...and once you have been near it, it turns gold',
      wm.SKY.blips().filter(b=>b.id==='job:'+first.id)[0].found===true);
    chk('tapping a dot on the map pins it, exactly like the offer card and the help list',
      wm.SKY.tapBlip('job:'+first.id)===true && wm.SKY.waypoint().x===fp.x && wm.SKY.waypoint().z===fp.z);
    chk('the pinned dot is the one marked on the dial',
      wm.SKY.blips().filter(b=>b.pinned).length===1);
    // on a job the map becomes the JOB: the dock and one dot per drop point
    wm.SKY.startMission('supply-drop');
    const jb = wm.SKY.blips();
    const sd = jobs.filter(m=>m.id==='supply-drop')[0];
    chk('on a job the map shows the dock and one dot per drop point, at their real places',
      jb.filter(b=>b.kind==='depot').length===1 &&
      jb.filter(b=>b.kind==='drop').length===sd.targets.length &&
      sd.targets.every((t,i)=>{ const b=jb.filter(x=>x.id==='t'+i)[0]; return b&&b.x===t.x&&b.z===t.z; }),
      jb.map(b=>b.kind).join(' '));
    wm.SKY.autopilot(true);
    for (let k=0;k<15000;k++){ wm.SKY.tick(1/30); if (wm.SKY.job().done>0) break; }
    chk('a drop point that is done turns green on the map too',
      wm.SKY.blips().filter(b=>b.kind==='drop'&&b.done).length===wm.SKY.job().done);
    wm.close();
  }
  {
    // "Not now" is not "never": it pins the thing so a kid can come back to it
    const dn = flyKid(0, ''); const wn = dn.window;
    const S = wn.SKY.state; S.pos.x=0; S.pos.z=-60; S.pos.y=30; S.yaw=0;
    for (let k=0;k<600;k++){ wn.SKY.tick(1/30); if (wn.SKY.findPill().up) break; }
    wn.SKY.tapPill();   // FL15: the pill is the one door into the offer card
    chk('saying no pins it, so "not now" really can mean not now',
      wn.SKY.declineOffer()===true && wn.SKY.mode()==='free' &&
      !!wn.SKY.waypoint() && wn.SKY.waypoint().label==='Mail Run');
    wn.close();
    const dh = flyKid(1, ''); const wh = dh.window;
    wh.SKY.helpJobs();
    dh.window.document.querySelectorAll('#helpJobs .hj')[1].click();
    chk('"Show me" in the help list pins it too - three doors, one thing behind them',
      !!wh.SKY.waypoint() && wh.SKY.mode()==='free', JSON.stringify(wh.SKY.waypoint()));
    wh.close();
  }
  {
    // narration: short enough lines for /api/say, and never a wall of them
    const dv = flyKid(0, ''); const wv = dv.window;
    const m = wv.SKY.missions()[0];
    const lines = wv.SKY.sayLines(m.name+'. '+m.tip);
    chk('Hear it is chopped into lines the shared narration library will accept',
      lines.length>1 && lines.every(l=>l.length<=60) && lines.join(' ').indexOf(m.name)===0,
      lines.length+' lines, longest '+Math.max(...lines.map(l=>l.length)));
    wv.close();
  }

  // jobs are editable data, exactly like the palette and the music bed
  {
    const de = flyKid(0, '&mode=free'); const we = de.window;
    const edited = JSON.parse(JSON.stringify(manifest));
    edited.levels[0].missions[0].name = 'Island Post';
    edited.levels[0].missions[0].coins = 99;
    edited.levels[0].missions[0].fact = 'A brand new fact, written in the manifest and nowhere else at all.';
    we.SKY.applyManifest(edited);
    const j = we.SKY.missions().find(m=>m.id==='mail-run');
    chk('renaming a job, repricing it and rewriting its fact is a MANIFEST edit, no code',
      j.name==='Island Post' && j.coins===99 && /brand new fact/.test(j.fact));
    we.SKY.mergeMissions([{ id:'mail-run', coins:'not a number', targets:'broken' }], 'sunny-islands');
    const j2 = we.SKY.missions().find(m=>m.id==='mail-run');
    chk('a half-written manifest job can never break a job', Array.isArray(j2.targets) && j2.targets.length===3);
    we.close();
  }
  // a job that repaints the sky has to put it back
  {
    const dp = fly(2, '&auto=1'); const wp = dp.window;
    const before = wp.SKY.paletteNow();
    wp.SKY.startMission('lantern-lighter');
    const dusk = wp.SKY.paletteNow();
    wp.SKY.endMission();
    const after = wp.SKY.paletteNow();
    chk('Lantern Lighter really turns the canyon dusky, and puts it back afterwards',
      dusk.sky !== before.sky && after.sky === before.sky && after.ground === before.ground,
      'day #'+before.sky.toString(16)+' -> dusk #'+dusk.sky.toString(16)+' -> day #'+after.sky.toString(16));
    wp.close();
  }
  // free flight is exactly what it always was
  {
    const dv = fly(0, '&auto=1&mode=free'); const wv = dv.window;
    let t=0; for(; t<MAX; t++){ wv.SKY.tick(1/30); if (wv.SKY.beaten()) break; }
    chk('Missions changed nothing about Free Flight (world 1 still beatable the old way)',
      wv.SKY.beaten() && wv.SKY.mode()==='free', 'beaten in '+(t/30).toFixed(0)+'s');
    wv.close();
  }
  // every ride can do the hover job — a hangar choice may suit it better, never gate it
  {
    const times = [];
    for (let r=0;r<3;r++){
      const dh = fly(1, '&auto=1&ride='+r); const wh = dh.window;
      wh.SKY.startMission('lost-explorer');
      let t=0; for(; t<JOB_MAX; t++){ wh.SKY.tick(1/30); if (wh.SKY.job().complete) break; }
      chk('ride '+r+' "'+wh.SKY.ride.name+'" can finish the hover job (a ride never locks a job out)',
        wh.SKY.job().complete, (t/30).toFixed(0)+'s');
      times.push({ name: wh.SKY.ride.name, circle: wh.SKY.ride.speed/wh.SKY.ride.turn, secs: t/30 });
      wh.close();
    }
    const wide = times.find(x=>/Jetpack/.test(x.name)), tight = times.find(x=>/Copter/.test(x.name));
    chk('the widest-turning ride pays for it on the hover job (the hangar choice matters)',
      wide && tight && wide.secs > tight.secs,
      times.map(x=>x.name+' turn circle '+x.circle.toFixed(0)+' -> '+x.secs.toFixed(0)+'s').join('  |  '));
  }

// ------------------------------------------------------------------
//  FL6 — TRANSFORM QUESTS. A quest is a body plus a recipe, so it gets
//  proved in both halves: the STATIC half checks the body really is a real
//  model wired to the FL3 contract, and the LIVE half flies all three with
//  the robot and then leaves one halfway to prove the ride comes back.
// ------------------------------------------------------------------
console.log('--- FL6 + FL7 LIVE: the robot flies every transform quest ---');
{
  const QUEST_WORLD = { 'busy-bee':0, 'puffin-parent':0, 'hummingbird-hover':2,
                        'goose-squad':1, 'owl-night-flight':1, 'eagle-glider':2 };
  for (const id of QUEST_IDS) {
    const dq = fly(QUEST_WORLD[id], '&auto=1'); const wq = dq.window;
    if (!wq.SKY) { chk('quest '+id+' booted', false, 'no SKY handle'); continue; }
    const before = wq.SKY.flying();
    chk('quest "'+id+'" starts from the mission engine',
      wq.SKY.startMission(id) === true && wq.SKY.mode() === 'job');
    const recipe = wq.SKY.mission(), body = wq.SKY.flying();
    // THE BODY SWAP IS A FEEL SWAP, not a costume: if these numbers were still
    // the plane's, a kid would be flying an aeroplane wearing a bee.
    chk('quest "'+recipe.name+'" LENDS you a body, and its feel comes with it',
      body.isTransform === true && body.id === recipe.transform &&
      body.feel.speed !== before.feel.speed && body.feel.turn !== before.feel.turn,
      before.name+' (turns in '+before.feel.circle+') -> '+body.name+' (turns in '+body.feel.circle+')');
    chk('...and the chase camera comes in close enough to see it',
      body.feel.camBack < before.feel.camBack, before.feel.camBack+' -> '+body.feel.camBack+' units back');
    let t = 0;
    for (; t < JOB_MAX; t++) { wq.SKY.tick(1/30); if (wq.SKY.job().complete) break; }
    const j = wq.SKY.job();
    chk('quest "'+recipe.name+'" FINISHED by autopilot', j.complete,
      j.done+'/'+j.of+' in '+(t/30).toFixed(0)+'s of flight');
    chk('quest "'+recipe.name+'" is about a minute of flying, not ten', (t/30) < 150, (t/30).toFixed(0)+'s');
    chk('quest "'+recipe.name+'" paid into the ONE shared wallet',
      j.paid === recipe.coins && wq.BuildableWallet.balance() >= recipe.coins,
      '+'+j.paid+' -> wallet '+wq.BuildableWallet.balance());
    chk('quest "'+recipe.name+'" left a badge sticker behind', wq.SKY.badges()[id] === true, recipe.badge);
    chk('quest "'+recipe.name+'" ends on ONE TRUE FUN FACT', j.factUp === true && recipe.fact.length > 60);
    // and everything a gathering quest picked up really did get home
    if (recipe.gather) {
      const g = wq.SKY.gather();
      chk('gathering quest "'+recipe.name+'" took every last one home to the '+recipe.dropAt.label,
        g.on && g.picked === g.stops && g.banked === g.stops && g.carrying === 0,
        'picked '+g.picked+'/'+g.stops+', banked '+g.banked+', still holding '+g.carrying);
    }
    wq.close();
  }
}
{
  // LEAVING IS FREE, AND YOU GET YOUR OWN RIDE BACK. The one thing that would
  // really hurt is a kid stuck as a bee on the way home from a quest they left.
  const dl = fly(0, '&auto=1'); const wl = dl.window;
  wl.SKY.startMission('busy-bee');
  for (let k=0;k<600;k++) wl.SKY.tick(1/30);
  const mid = wl.SKY.job(), asBee = wl.SKY.flying();
  chk('a quest can be left halfway, exactly like a job', mid.done > 0 && wl.SKY.leaveJob() === true);
  const after = wl.SKY.flying();
  chk('...and you get YOUR OWN RIDE back the moment you do',
    asBee.isTransform === true && after.isTransform === false &&
    after.id === wl.SKY.ride.id && after.ridePartsHidden === 0,
    asBee.name+' -> '+after.name);
  chk('coming back to it later starts fresh, as agreed',
    wl.SKY.startMission('busy-bee') === true && wl.SKY.gather().picked === 0 && wl.SKY.gather().carrying === 0);
  // LANDING MUST NEVER GATE A QUEST. It is how coins are banked and it has to
  // stay exactly what it has always been. The autopilot is switched OFF for this
  // one, because on a quest the robot flies the QUEST — which is itself the
  // proof that a quest never sends a kid to a pad to get on with it.
  const S = wl.SKY.state;
  const pad = wl.SKY.pads[0];
  wl.SKY.autopilot(false);
  S.pos.x = pad.x; S.pos.z = pad.z; S.pos.y = 12; S.coins = 5; S.dx = 0; S.dy = 0;
  const wallet0 = wl.BuildableWallet.balance();
  let landed = false;
  for (let k=0;k<900;k++){
    S.pos.x = pad.x; S.pos.z = pad.z;            // hold it over the pad, as a finger would
    wl.SKY.tick(1/30);
    if (S.mode === 'landed'){ landed = true; break; }
  }
  chk('you can still land and bank coins in the middle of a quest',
    landed && wl.SKY.mode() === 'job' && wl.BuildableWallet.balance() > wallet0,
    landed ? ('landed as a bee, +'+(wl.BuildableWallet.balance()-wallet0)+' banked, quest still on')
           : 'never reached a pad');
  chk('...and the quest is still running when you take off again', wl.SKY.job().complete === false);
  wl.close();
}
{
  // THE SPACING RULE, measured in every world rather than promised in a comment.
  for (let i=0;i<3;i++){
    const ds = flyKid(i, ''); const ws = ds.window;
    const sp = ws.SKY.spacing();
    chk('world '+i+' ('+ws.SKY.world.name+') is not an airport: every beam stands well clear',
      sp.ok, sp.beams+' beams, closest pair '+sp.min+' units apart (rule: '+sp.gap+')');
    ws.close();
  }
  // and a beam over something already earned STOPS SHOUTING, so the sky thins
  // out as a kid works through a stop
  const dd = flyKid(0, ''); const wd = dd.window;
  const bright = wd.SKY.beams();
  wd.SKY.startMission('busy-bee'); wd.SKY.autopilot(true);
  for (let k=0;k<JOB_MAX;k++){ wd.SKY.tick(1/30); if (wd.SKY.job().complete) break; }
  wd.SKY.endMission();
  const after = wd.SKY.beams();
  const beeBefore = bright.find(b=>b.id==='busy-bee'), beeAfter = after.find(b=>b.id==='busy-bee');
  const otherAfter = after.find(b=>b.id==='mail-run');
  chk('a beam over something already done goes dim, so the sky thins out',
    beeBefore && beeAfter && beeBefore.dim === false && beeAfter.dim === true &&
    beeAfter.beamH < beeBefore.beamH && beeAfter.opacity < beeBefore.opacity,
    beeBefore ? (beeBefore.beamH+'u at '+beeBefore.opacity+' -> '+beeAfter.beamH+'u at '+beeAfter.opacity) : 'no bee beam');
  chk('...and the ones still to do are as bright as they ever were',
    otherAfter && otherAfter.dim === false, otherAfter ? 'mail-run still full height' : 'mail-run beam missing');
  wd.close();
}

// ------------------------------------------------------------------
//  FL12 LIVE — the trails really stand in the world, light up ring by
//  ring when flown through, never fail if a ring is missed, and pay out
//  once at the end with a sticker.
// ------------------------------------------------------------------
console.log('--- FL12 LIVE: rings are placed, flying through them lights and pays ---');
{
  // Every world carries two or three trails, and every trail carries a
  // real line of rings at real coordinates. This proves showTrails ran
  // and that the recipe grew a shape rather than a fixed row.
  for (let i = 0; i < 3; i++) {
    const dt = flyKid(i, '&mode=free'); const wt = dt.window;
    const trs = wt.SKY.trails();
    chk('world '+i+' ('+wt.SKY.world.name+') carries 2-3 trails, each with 4-6 rings',
      trs.length >= 2 && trs.length <= 3 && trs.every(t=>t.rings >= 4 && t.rings <= 6),
      trs.map(t=>t.shape+':'+t.rings).join(', '));
    // Every trail is placed AT real coordinates — none stacked on the
    // spawn, none stacked on top of each other.
    const spread = trs.every(t=>Math.hypot(t.x,t.z) > 120);
    chk('world '+i+' trails sit out in the world (never on the spawn)', spread,
      trs.map(t=>Math.round(Math.hypot(t.x,t.z))).join('u, ')+'u out');
    // Every ring is off the ground: fly-through requires it. This is the
    // Traps note: a ring buried in a hill is invisible AND unreachable.
    const ringsOK = trs.every(t=>t.ringPts.every(r=>r.y >= 6 && r.y <= 90));
    chk('world '+i+' every ring stands 6-90u above the ground (never buried, never in orbit)',
      ringsOK, 'min '+Math.min(...trs.flatMap(t=>t.ringPts.map(r=>r.y))).toFixed(0)+
                'u, max '+Math.max(...trs.flatMap(t=>t.ringPts.map(r=>r.y))).toFixed(0)+'u');
    wt.close();
  }
}
{
  // Fly through the whole trail in order — every ring lights, the beam
  // goes out, the sticker is kept, and the coin chime plays per ring.
  const df = flyKid(0, '&mode=free'); const wf = df.window;
  const S = wf.SKY.state;
  const tr = wf.SKY.trails()[0];
  chk('first ring stands under its beam (nothing lit yet)',
    tr && tr.found === false && tr.done === false && tr.beamVisible === true,
    JSON.stringify({found:tr.found, done:tr.done, beam:tr.beamVisible}));
  // Count coin sfx calls: this proves the rising tune actually fires.
  let coinCalls = 0, rates = [], collectCalls = 0;
  const origSfx = wf.BuildableAudio.sfx.bind(wf.BuildableAudio);
  wf.BuildableAudio.sfx = function(name, opt){
    if (name === 'coin' && opt && typeof opt.rate === 'number') { coinCalls++; rates.push(+opt.rate.toFixed(2)); }
    if (name === 'collect') collectCalls++;
    return origSfx(name, opt);
  };
  // Warp the plane to each ring one at a time and step: the magnet handles it.
  for (let i = 0; i < tr.ringPts.length; i++) {
    const r = tr.ringPts[i];
    S.pos.x = r.x; S.pos.y = r.y; S.pos.z = r.z; S.dx = 0; S.dy = 0;
    wf.SKY.tick(1/30);
  }
  const after = wf.SKY.trails()[0];
  chk('flying through every ring lit them all up in order',
    after.lit === after.rings && after.done === true && after.beamVisible === false,
    'lit '+after.lit+'/'+after.rings+', beam '+(after.beamVisible?'on':'off'));
  chk('one chime per ring, EACH ONE PITCHED (a rising tune, not five of the same note)',
    coinCalls === tr.ringPts.length &&
    // strictly rising: 1.00, 1.07, 1.14, 1.21, 1.28 for a 5-ring trail
    rates.every((r,i)=>i===0 || r > rates[i-1]) &&
    Math.abs(rates[0] - 1.00) < 0.01,
    coinCalls+' notes at rates '+rates.join(' -> '));
  chk('the last ring plays the sparkle cascade (the trail-finished sound)',
    collectCalls === 1, collectCalls+' cascade(s)');
  chk('finishing a trail leaves a sticker (kept per kid, same table the jobs use)',
    wf.SKY.badges()[tr.id] === true, tr.id);
  wf.BuildableAudio.sfx = origSfx;
  wf.close();
}
{
  // A trail can NEVER be failed. Miss a ring: nothing happens, it stays
  // lit and waits. There is no timer and no expiry anywhere in the trail
  // engine — this proves it live: hit ring 0 and ring 2 only, leave 1
  // untouched forever, and prove ring 1 still waits.
  const dm = flyKid(1, '&mode=free'); const wm = dm.window;
  const S = wm.SKY.state;
  const tr = wm.SKY.trails()[0];
  const hit = (i)=>{ const r=tr.ringPts[i]; S.pos.x=r.x; S.pos.y=r.y; S.pos.z=r.z; wm.SKY.tick(1/30); };
  hit(0); hit(2);                          // skip 1 on purpose
  // Fly away and wait a "long time" (many sim ticks). Ring 1 must NEVER
  // decay, expire, or auto-light. Nothing anywhere may fail a trail.
  S.pos.x = 5000; S.pos.y = 40; S.pos.z = 5000;
  for (let k = 0; k < 900; k++) wm.SKY.tick(1/30);
  const after = wm.SKY.trails()[0];
  chk('missing a ring does nothing — it stays waiting, no timer, no expiry',
    after.ringPts[0].lit === true && after.ringPts[2].lit === true &&
    after.ringPts[1].lit === false && after.done === false && after.lit === 2,
    'lit '+after.lit+'/'+after.rings+' after 30s of drifting away');
  // Come back and hit the missing ring: it still lights, and the rest of
  // the trail carries on from where it was.
  const still = tr.ringPts[1]; S.pos.x = still.x; S.pos.y = still.y; S.pos.z = still.z;
  wm.SKY.tick(1/30);
  const then = wm.SKY.trails()[0];
  chk('...and a ring that was missed can be hit later, whenever the kid feels like it',
    then.ringPts[1].lit === true && then.lit === 3,
    'lit '+then.lit+'/'+then.rings+' after coming back');
  wm.close();
}
{
  // The mini-map shows every trail, and pinning one puts the arrow on the
  // first ring — exactly like a job. Three doors, one thing behind them.
  const dp = flyKid(2, '&mode=free'); const wp = dp.window;
  const trs = wp.SKY.trails();
  const blips = wp.SKY.blips().filter(b=>b.kind==='trail');
  chk('every trail in this world shows up as a small ring blip on the map',
    blips.length === trs.length && trs.every(t=>blips.some(b=>b.id==='trail:'+t.id && b.x===t.x && b.z===t.z)),
    blips.length+' trail blips (world has '+trs.length+')');
  const pinned = wp.SKY.pinTrail(trs[0].id);
  const wpt = wp.SKY.waypoint();
  chk('pinning a trail puts it in the top bar with its real place and a live distance',
    !!wpt && wpt.kind === 'trail' && wpt.x === trs[0].x && wpt.z === trs[0].z && wpt.dist > 0,
    JSON.stringify(wpt));
  chk('the big orange arrow follows a pinned trail, just like it follows a pinned job',
    (()=>{ const t = wp.SKY.arrowTarget(); return !!t && t.x === trs[0].x && t.z === trs[0].z; })());
  wp.close();
}

// ==========================================================================
//  FL13 LIVE — the plane flies low, the world reacts. Each check drives the
//  sim into a specific STATE (low over water, high overhead, still on a pad)
//  and reads what actually fired through SKY.reactions() / SKY.noticed().
// ==========================================================================
console.log('--- FL13 LIVE: one rule, three reactions, real numbers ---');
{
  // ---- THE ONE RULE holds for every point in every world ----
  const d = new JSDOM(page, { runScripts:'dangerously', pretendToBeVisual:false,
    url:'https://buildablekids.com/skyflyer-engine.html?level=0&auto=0&nodraw=1&manual=1' });
  const w = d.window;
  // Drop the plane at 8 units above (0,0) - very low over the origin.
  w.SKY.state.pos.x = 0; w.SKY.state.pos.y = 8; w.SKY.state.pos.z = 0;
  const near = w.SKY.noticed(0, 0);
  chk('FL13: right under a low pass, look AND react are both hot',
    near.look > 0.6 && near.react > 0.6 && near.d < 1 && near.alt < 20,
    'd='+near.d.toFixed(1)+' alt='+near.alt.toFixed(1)+' look='+near.look.toFixed(2)+' react='+near.react.toFixed(2));
  // A thing 200 units away hears nothing at all
  const far = w.SKY.noticed(200, 200);
  chk('FL13: 200 units away, the ONE RULE gives zero for both signals (no ambient jitter)',
    far.look === 0 && far.react === 0);
  // A high pass right overhead notices the least - this is the "how low"
  // question, and it must actually gate the reactions.
  w.SKY.state.pos.y = 100;
  const high = w.SKY.noticed(0, 0);
  chk('FL13: high overhead (100u), the same point notices nothing - low matters',
    high.look === 0 && high.react === 0,
    'alt='+high.alt.toFixed(0)+' look='+high.look.toFixed(2)+' react='+high.react.toFixed(2));
  // Speed factor is inside the sensible band [0.5..1.4]
  chk('FL13: the speed factor is bounded (no runaway startle when the plane spikes)',
    near.speed >= 0.5 && near.speed <= 1.4, 'speed='+near.speed.toFixed(2));
  w.close();
}
{
  // ---- A LOW PASS OVER OPEN WATER: fish spawn behind the plane ----
  const d = fly(0, '');            // Sunny Islands, autopilot ON
  const w = d.window;
  w.SKY.autopilot(false);
  const S = w.SKY.state;
  // Put the plane over open water, off the spawn - the water at (400,400)
  // is well away from every island, so a fish spawn there proves the rule
  // works far from any hand-placed spot.
  S.pos.x = 400; S.pos.z = 400; S.pos.y = 12; S.yaw = 0; S.speed = 22;
  for (let k = 0; k < 1400; k++) {
    // keep the plane pinned low over water
    S.pos.x = 400 + Math.sin(k*0.02) * 60;
    S.pos.z = 400 + Math.cos(k*0.02) * 60;
    S.pos.y = 12; S.speed = 22;
    w.SKY.tick(1/30);
    const rs = w.SKY.reactions();
    if (rs.fish >= 3) break;
  }
  const rs = w.SKY.reactions();
  chk('FL13: a low pass over open water woke reactive fish up',
    rs.fish >= 3, rs.fish+' fish reactions in a 40s low pass');
  // Throttle really works: the counter has NOT run away.
  chk('FL13: fish jumps are throttled - a 40s pass is a scatter, not a torrent',
    rs.fish <= 60, rs.fish+' spawns in 1400 ticks (~40s)');
  w.close();
}
{
  // ---- A HIGH PASS: nothing happens (the ONE rule is the gate) ----
  const d = fly(0, '');
  const w = d.window;
  w.SKY.autopilot(false);
  const S = w.SKY.state;
  S.pos.x = 400; S.pos.z = 400; S.pos.y = 100; S.yaw = 0; S.speed = 18;
  for (let k = 0; k < 900; k++){
    S.pos.x = 400 + Math.sin(k*0.02) * 60;
    S.pos.z = 400 + Math.cos(k*0.02) * 60;
    S.pos.y = 100;
    w.SKY.tick(1/30);
  }
  const rs = w.SKY.reactions();
  chk('FL13: high overhead, THE ONE RULE stays cold - no fish, no dust',
    rs.fish === 0 && rs.dust === 0,
    'fish='+rs.fish+' dust='+rs.dust);
  w.close();
}
{
  // ---- LANDED ON A PAD: no reactions at all (S.mode is not fly) ----
  const d = fly(0, '');
  const w = d.window;
  w.SKY.autopilot(false);
  w.SKY.state.mode = 'landed';
  w.SKY.state.pos.x = 400; w.SKY.state.pos.z = 400; w.SKY.state.pos.y = 10;
  for (let k = 0; k < 300; k++) w.SKY.tick(1/30);
  const rs = w.SKY.reactions();
  chk('FL13: parked on the ground, nothing fires - reactions are for FLYING only',
    rs.fish === 0 && rs.dust === 0,
    'fish='+rs.fish+' dust='+rs.dust);
  w.close();
}
{
  // ---- SANITY: the handle wires up and reports numbers for every field ----
  const d = fly(0, '');
  const w = d.window;
  w.SKY.autopilot(true);
  for (let k = 0; k < 300; k++) w.SKY.tick(1/30);
  const rs = w.SKY.reactions();
  chk('FL13: the reactions handle answers with real numbers in every field',
    typeof rs.fish === 'number' && typeof rs.dust === 'number' &&
    typeof rs.scatter === 'number' && typeof rs.look === 'number' &&
    typeof rs.poolSize === 'number' && typeof rs.poolActive === 'number',
    JSON.stringify(rs));
  w.close();
}
}

// ==========================================================================
//  FL13 — THE WORLD NOTICES YOU. The static half locks in the ONE RULE: every
//  reaction reads it through the same noticed(x,z), and the drawing code never
//  learns a reaction by name. The live half proves each reaction really fires
//  when the plane is low and close, and never when it is high and far.
// ==========================================================================
console.log('--- FL13 STATIC: one rule, three reactions, no hand-placed triggers ---');
chk('FL13: THE ONE RULE is one function everyone reads (close + fast + low)',
  /function noticed\(x, z\)\{/.test(html) &&
  /var d\s*=\s*Math\.sqrt\(dx\*dx \+ dz\*dz\)/.test(html) &&
  /alt\s*=\s*Math\.max\(0,\s*S\.pos\.y\)/.test(html) &&
  /return \{ d:d,\s*alt:alt,\s*look:look,\s*react:react,\s*speed:speedK \}/.test(html));
chk('FL13: nothing in a reaction has a special-case zone - drawing dispatches only on noticed()',
  // Strip comments first (they are notes, not code). Then guard that no
  // reaction CODE ever hardcodes an island id, a job id, or a place id.
  (function(){
    var r = html.slice(html.indexOf('FL13 — THE WORLD NOTICES YOU'),
                      html.indexOf('function stepReactions'));
    r = r.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return !/"sunny-islands"|"snowy-peaks"|"sunset-canyon"|"mail-run"|"puffin-parent"|"busy-bee"|"hummingbird-hover"/.test(r);
  })());
chk('FL13: the ONE reaction sound is a palette name, never a per-animal call',
  /react:\s+"sky_splash"/.test(html) &&
  // only ONE sfx("react") call in the whole engine, and it lives in the reaction block
  (html.match(/sfx\("react"/g)||[]).length === 1);
chk('FL13: FISH JUMP reuses the FL11 hand-built fish, one draw call each, pooled and recycled',
  /function reactBuildFishPool\(\)/.test(html) &&
  /hbGet\("fish"\)/.test(html.slice(html.indexOf('function reactBuildFishPool'), html.indexOf('function reactFishStep'))) &&
  /puppet\(f,\s*"fish"\)/.test(html.slice(html.indexOf('function reactBuildFishPool'), html.indexOf('function reactFishStep'))) &&
  /var REACT_FISH_POOL_SIZE\s*=\s*\d+/.test(html));
chk('FL13: a reactive fish is ONE ARC AND OUT, never a loop (else the pool would jam)',
  /kind==="reactJump"/.test(html) &&
  /if\(!P\.active\)\{ if\(o\.visible\) o\.visible=false; continue; \}/.test(html) &&
  /\} else \{ o\.visible=false; P\.active=false; P\.spl=0; \}/.test(html));
chk('FL13: FISH JUMP never spawns over land - landUnder() is the gate',
  /function landUnder\(x, z\)/.test(html) &&
  /if\(landUnder\(bx, bz\) != null\) return/.test(html));
chk('FL13: ANIMALS SCATTER reuses the AR1Q ground orbit; startle offsets its ang, then decays',
  /P\.startle = \(P\.startle \|\| 0\) \+ sign \* push \* dt \* 6/.test(html) &&
  /P\.startle \*= Math\.pow\(0\.35, dt\)/.test(html) &&
  // the ground loop reads startle
  /var startle = P\.startle \|\| 0/.test(html) &&
  /P\.ang\+Math\.sin\(t\*0\.5\+P\.ph\)\*P\.arc \+ startle/.test(html));
chk('FL13: LAND animals look UP toward the plane while noticed (a look, not a chase)',
  /var toward = 0/.test(html) &&
  /toward = Math\.atan2\(dzp, dxp\)/.test(html) &&
  /toward = toward \* Math\.min\(0\.35, look \* 0\.7\)/.test(html));
chk('FL13: DUST fires only over land, throttled to a few puffs a second, never a fog bank',
  /function reactDustStep\(dt, t\)/.test(html) &&
  /if\(S\.pos\.y > 22\) return/.test(html) &&
  /if\(t - REACT\.lastDust < 0\.28\) return/.test(html) &&
  /var y = landUnder\(S\.pos\.x, S\.pos\.z\)/.test(html) &&
  /if\(y == null\) return/.test(html));
chk('FL13: THE BUDGET IS HELD - pool of 6 reactive fish rides inside the 8-puppet ceiling',
  /var REACT_FISH_POOL_SIZE\s*=\s*6/.test(html) && /PUP_BUDGET=8/.test(html));
chk('FL13: BIRDS LIFT OFF is skipped deliberately, and the AR1R triangle-flock ban still holds',
  // No new bird PET kind, no re-added GULLS/gulls flock system
  !/GULLS|GULL_N|function buildGulls|function stepGulls/.test(html) &&
  // the reaction block has a note explaining why #4 is not shipping
  /BIRDS LIFT OFF — SKIPPED/.test(html));
chk('FL13: reactions run in the SIM (stepSim), so a headless QA sees them fire',
  /function stepReactions\(dt, t\)\{[\s\S]{0,400}reactFishStep\(dt, t\);[\s\S]{0,400}reactDustStep\(dt, t\);[\s\S]{0,400}reactScatterStep\(dt, t\);/.test(html) &&
  /stepReactions\(dt, time\)/.test(html.slice(html.indexOf('function stepSim'), html.indexOf('function stepIslandLife'))));
chk('FL13: reactions are ISLANDS-ONLY, so AR2 stays untouched',
  /function stepReactions\(dt, t\)\{\s*\n\s*if\(world\.terrain !== "islands"\) return;/.test(html));
chk('FL13: nothing here can be hit, nothing chases, no lose state',
  // Strip comments before scanning. The check guards CODE (no life counter,
  // no chase target, no attack radius, no expiry field), not the English
  // words in a note about the LAWS.
  (function(){
    var r = html.slice(html.indexOf('FL13 — THE WORLD NOTICES YOU'),
                       html.indexOf('function drawScene'));
    r = r.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return !/\b(lives|timeLeft|timeLimit|damage|attackR|chaseR|expiresAt|attemptsLeft)\b/.test(r);
  })());

// ==========================================================================
//  FM1 — THE FARM CORNER (public/skyflyer-farm.html). Same engine style, but
//  a separate self-contained scene: fenced field of dirt patches, seed picker
//  pop-up in the AR1R shape, three crops made from the AR1P recipe, growth
//  through sprout/mid/ready stages, harvest by walking through them, and THE
//  STACK — no cap, whip-lag and amplitude scaling with height, never falls.
//  This block is STATIC only (structure + laws in the file); a look-gate
//  screenshot pass is a follow-up because the farm scene doesn't ship a
//  jsdom-safe autopilot.
// ==========================================================================
console.log('\n--- FM1 STATIC: the farm scene is built to the recipe ---');
const farm = read('public/skyflyer-farm.html');
chk('FM1: the farm scene ships as its own file next to the engine',
  farm.length > 4000 && /FM1 — the farm corner of Sunny Islands/.test(farm));
chk('FM1: no emojis anywhere in the farm scene (repo law)',
  !emoji.test(farm));
chk('FM1: uses the repo three.min.js — same library as the flying engine',
  /src="\/three\.min\.js"/.test(farm));
chk('FM1: hand-built models per the AR1P recipe (lathes + lofts + balls, one shared vertexColors material)',
  /function hbTurn\(profile,c,tf,sg\)\{/.test(farm) &&
  /function hbBall\(r,c,tf,sg\)\{/.test(farm) &&
  /function hbTube\(r1,r2,h,c,tf,sg\)\{/.test(farm) &&
  /function hbBake\(parts\)\{/.test(farm) &&
  /MeshPhongMaterial\(\{vertexColors:true/.test(farm));
chk('FM1: no textures (no ImageLoader / TextureLoader / .jpg / .png loaded in-page)',
  !/TextureLoader|ImageLoader|loadTexture/.test(farm));
chk('FM1: three crop recipes — corn, carrot, wheat, no fourth crop',
  /CROP_RECIPES\s*=\s*\{[\s\S]*?corn:[\s\S]*?carrot:[\s\S]*?wheat:/.test(farm) &&
  (farm.match(/^\s{2}(corn|carrot|wheat|potato|tomato|apple|berry):\s*\{/gm)||[]).length === 3);
chk('FM1: each crop has a coin price and a coin reward',
  /price:\s*\d+/.test(farm) && /reward:\s*\d+/.test(farm));
chk('FM1: growth is 30-60 seconds max per the card',
  (function(){
    var m = farm.match(/growSec:\s*(\d+)/g) || [];
    if(m.length!==3) return false;
    return m.every(function(s){
      var n = parseInt(s.replace(/[^0-9]/g,''),10);
      return n>=30 && n<=60;
    });
  })());
chk('FM1: FL5b law — the icon comes from the same recipe as the 3D crop (one source of art)',
  /parts:function\(s\)\{/.test(farm) && /svg:function\(size\)\{/.test(farm));
chk('FM1: seed picker card matches the AR1R offer-card shape (floating, max 340px, rounded)',
  (function(){
    var m = farm.match(/#seedCard\s*\{[^}]*\}/);
    if(!m) return false;
    var css = m[0];
    return /max-width:\s*340px/.test(css) && /border-radius:\s*\d+px/.test(css) &&
           /left:\s*50%/.test(css) && /top:\s*50%/.test(css) &&
           !/bottom:\s*0/.test(css);
  })());
chk('FM1: seed picker has three picture buttons and each button has a coin price chip',
  /className\s*=\s*"seed"/.test(farm) && /class="price"/.test(farm) && /class="art"/.test(farm));
chk('FM1: empty patches show a dashed glowing ring (the tap affordance)',
  /function buildDashRing\(\)/.test(farm) && /P\.ring\.rotation\.y \+= dt/.test(farm));
chk('FM1: ready crops wobble and sparkle',
  /state="ready"/.test(farm) && /wob = Math\.sin/.test(farm) &&
  /!P\.halo/.test(farm) && /TorusGeometry/.test(farm));
chk('FM1: harvest is by walking through the crop (kid position vs patch position)',
  /kd=Math\.hypot\(kid\.position\.x-P\.x, kid\.position\.z-P\.z\)/.test(farm) &&
  /pushOntoStack\(P\.seed/.test(farm));
chk('FM1: THE STACK has no cap — a plain array push, never a length gate',
  /stack\.push\(it\)/.test(farm) &&
  !/stack\.length\s*[<>]\s*\d+/.test(farm.slice(farm.indexOf('pushOntoStack'), farm.indexOf('function sampleHistory'))));
chk('FM1: the stack whip-lags (each item follows a delayed sample of the kid position)',
  /STACK_HISTORY/.test(farm) && /sampleHistory\(delaySec, now\)/.test(farm) &&
  /it\.userData\.tOffset\s*=\s*STACK_LAG_PER\s*\*\s*stack\.length/.test(farm));
chk('FM1: the wobble amplitude scales with height (a tall stack sways more than a short one)',
  /heightScale\s*=\s*Math\.sqrt\(i\+1\)\s*\*\s*0\.06/.test(farm));
chk('FM1: the stack never falls — items lerp toward their target Y every frame, no gravity term',
  /it\.position\.y = lerp\(it\.position\.y, targetY,/.test(farm) &&
  !/it\.position\.y \-= .*gravity|GRAVITY|it\.vel\.y/.test(farm));
chk('FM1: harvest = a bounce onto the stack (arc from ground to head-top)',
  /hopT/.test(farm) && /Math\.sin\(u\*Math\.PI\) \* 1\.6/.test(farm));
chk('FM1: the field is fenced (posts + rails around a 3x3 dirt-patch grid)',
  /function buildFencePost\(\)/.test(farm) && /function buildFenceRail\(len\)/.test(farm) &&
  /for\(j=-1;j<=1;j\+\+\)\{\s*for\(i=-1;i<=1;i\+\+\)\{/.test(farm));
chk('FM1: hand-built kid character (head + torso + arms + legs, all baked to one draw call)',
  /function buildKid\(\)/.test(farm) && /kid\.userData\.headTopY/.test(farm));
chk('FM1: a QA handle (window.FARM) exposes patches, stack and seed picker so a robot can play it',
  /window\.FARM\s*=\s*\{/.test(farm) &&
  /patches:\s*function\(\)/.test(farm) &&
  /stack:\s*function\(\)/.test(farm) &&
  /openSeedPicker:\s*function/.test(farm));
chk('FM1: the shell cache-bust is bumped on BOTH engine links in BuildableKids.jsx (v=fl15)',
  (function(){
    const jsx = read('src/BuildableKids.jsx');
    const hits = jsx.match(/skyflyer-engine\.html\?v=fl15/g) || [];
    return hits.length >= 2 && !/skyflyer-engine\.html\?v=(fm1|fl13|fl8c)\b/.test(jsx);
  })());

// FL9. The real gate for this is qa-skyflyer-hud.mjs, which draws the shell's
// chrome around the engine and MEASURES the two together — a source check can
// never see an overlap. These are the cheap static guards that stop the wiring
// being taken apart by a later session that is not looking at a phone.
console.log('\n--- FL9: nav bar + HUD do not overlap on mobile ---');
chk('FL9: the engine tags <html> in-shell before <body>, so the HUD never paints in the corner the shell is about to cover',
  /classList\.add\(['"]bk-inshell['"]\)/.test(html) &&
  /window\.parent[^;]*!==\s*window/.test(html));
chk('FL9: the right-hand column hangs off the strip the nav bridge publishes, not off hardcoded numbers',
  /\.bk-inshell\s+\.pill\s*\{[^}]*var\(--bk-nav-bottom/.test(html) &&
  /\.bk-inshell\s+#minimap\s*\{[^}]*var\(--bk-nav-bottom/.test(html) &&
  /\.bk-inshell\s+#banked\s*\{[^}]*var\(--bk-nav-bottom/.test(html));
chk('FL9: the fallback depth is 96px — Sky Flyer asks for Sound + Help and no Menu, so the strip is two buttons deep',
  (html.match(/var\(--bk-nav-bottom,\s*96px\)/g) || []).length === 3 &&
  /onSound:function/.test(html) && /onHelp:function/.test(html) && !/onMenu:/.test(html));
chk('FL9: no doubled safe-area inset — --bk-nav-bottom is already in the shell coordinate space this iframe fills',
  !/\.bk-inshell[^\n]*env\(safe-area-inset-top\)/.test(html));
chk('FL9: the pad message is centred clear of the right-hand column, so moving the map down did not trade one overlap for another',
  /#padmsg\{position:absolute;left:calc\(50% - 59px\)/.test(html) &&
  /#padmsg\{[^}]*max-width:calc\(100% - 190px\)/.test(html));
chk('FL9: standalone (opened directly) keeps the original top positions — no shift outside the shell',
  /\.pill\{position:absolute;top:calc\(12px/.test(html) &&
  /#minimap\{position:absolute;top:calc\(62px/.test(html));

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok?0:1);
