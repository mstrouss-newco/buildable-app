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
console.log('--- FL5b: a job a four year old can answer, follow and find ---');
chk('the offer is answered with a TICK and a CROSS, not with the words "Do it"',
  /class="ans yes" id="ofStart"/.test(html) && /class="ans no" id="ofNo"/.test(html) &&
  !/id="ofStart">Do it</.test(html) && !/id="ofNo">Not now</.test(html));
chk('the two answers are a green circle and a red circle, set far apart from each other',
  /\.ans\.yes\{background:linear-gradient\(#57d06b/.test(html) &&
  /\.ans\.no\{background:linear-gradient\(#ff8a75/.test(html) &&
  /\.answers\{[^}]*gap:34px/.test(html) && /\.ans\{width:86px;height:86px;border-radius:50%/.test(html));
chk('the words stay underneath, small, for the grown-up and the reader',
  /class="anslab"><span>Yes please<\/span><span>Not now<\/span>/.test(html) &&
  /\.anslab\{[^}]*font-size:12px/.test(html));
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
chk('the offer shows the job as ONE picture: what you carry, an arrow, where it goes',
  /ofStoryEl\.innerHTML=jobStrip\(m,m\.targets\.length>3\?26:32,null,null,-1\)/.test(html) && /id="ofStory"/.test(html) &&
  /function icoArrowGlyph\(/.test(html));
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
const kitFiles = [...html.matchAll(/^\s*(\w+):"([\w\-\/\.]+\.glb)",?$/gm)].map(m=>m[2]);
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
chk('an island is a rounded sand hill, not a cone (the shape is built, not a primitive)',
  /function makeIslandGeo\(/.test(html) && /ISLE_GEO/.test(html));
// read the numbers out of the ISLANDS branch only - the other two worlds are
// allowed their peaks and mesas, and matching the wrong branch would have this
// check quietly passing on somebody else's terrain
const isleBranch = (html.split('} else { // islands')[1]||'').slice(0, 1400);
const isleNums = (() => {
  const m = isleBranch.match(/rad=big\?\(([\d.]+)\+r\(\)\*([\d.]+)\)[\s\S]{0,80}?hh=big\?\(([\d.]+)\+r\(\)\*([\d.]+)\)/);
  return m && { radMin:+m[1], radMax:+m[1]+ +m[2], hhMin:+m[3], hhMax:+m[3]+ +m[4] };
})();
chk('islands are WIDER than they are tall (a spire is not an island)',
  !!isleNums && isleNums.hhMax <= isleNums.radMax && isleNums.hhMin <= isleNums.radMin,
  isleNums ? ('across '+isleNums.radMin+'-'+isleNums.radMax+'  high '+isleNums.hhMin+'-'+isleNums.hhMax)
           : 'could not read the island numbers');
chk('the sand carries on below the waterline into a shelf (the sea cuts its own beach)',
  /-0\.55\*t\*t\*t/.test(html) && /function isleY\(/.test(html) &&
  /Math\.min\(t\/0\.68,1\)/.test(html));
chk('the island is ONE surface in three bands: grass, dry sand, WET sand',
  /GREEN_RINGS/.test(html) && /WET_RINGS/.test(html) &&
  /g\.addGroup\(0,gEnd,0\)/.test(html) &&
  /new THREE\.Mesh\(shape,\[topMat,M\.rock,M\.rock2\]\)/.test(html));
chk('the land is shaded, not faceted, and carries grain like the models do',
  /function grainTexture\(/.test(html) && /M\.rock\.map=sandTex/.test(html) &&
  /M\.cap\.map=grassTex/.test(html) && /m\.flatShading=false/.test(html));
chk('the grain sheet is WHITE too, so the palette still owns the land colour',
  (html.match(/x\.fillStyle="#ffffff"; x\.fillRect\(0,0,256,256\)/g)||[]).length >= 2);
chk('the island has a coastline, not a silhouette (enough segments to read close up)',
  /var RINGS=11, SEGS=26/.test(html));
chk('the landing pad sits on a real island, not a ten-sided cylinder',
  /baseGeo\?new THREE\.Mesh\(baseGeo,\[M\.rock,M\.rock,M\.rock2\]\)/.test(html));
chk('the Quaternius models already in the repo are actually USED, not left on a shelf',
  (()=>{ const q=[...html.matchAll(/^\s*(q\w+):"\.\.\/nature\/([\w\-]+\.gltf)"/gm)];
         return q.length>=6 &&
           q.every(m=>fs.existsSync(dir+'/public/models/nature/'+m[2])) &&
           q.some(m=>(html.split('function dressIsle(')[1]||'').indexOf('"'+m[1]+'"')>=0); })());
chk('a low sandbar stays bare sand, only a real island grows anything',
  /var topMat=\(hh>\d+\)\?\(r\(\)>0\.5\?M\.cap:M\.cap2\):M\.rock/.test(html));
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
  /halo\.scale\.set\(rad\*3\.6/.test(html) && /halo\.renderOrder=3/.test(html) &&
  /createRadialGradient/.test(html));
chk('the sea has a moving surface, painted in code (nothing to download)',
  /function makeRippleTexture\(/.test(html) && /CanvasTexture/.test(html) &&
  /M\.ground\.map\.offset\.set/.test(html));
chk('the ripple sheet is WHITE, so the manifest still owns the sea colour',
  /x\.fillStyle="#ffffff"; x\.fillRect\(0,0,256,256\)/.test(html));
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
chk('gold is lit from inside and takes a hot highlight, so it reads as metal',
  /emissive:0x3A2700/.test(html) && /shininess:220/.test(html));
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
    let t = 0;
    for (; t < MAX; t++) { w.SKY.tick(1/30); if (w.SKY.beaten()) break; }
    const s = w.SKY.snapshot();
    if (i === 0) {
      // AR1: this DOM has no WebGL at all. The kit must refuse to start and the
      // island must still be a whole island built from the stand-in shapes.
      const kit = w.SKY.kit(), dr = w.SKY.dressed();
      chk('AR1: with no renderer the model kit never starts', kit.started===false && kit.on===false);
      chk('AR1: the world is still full of islands without a single model loaded',
        dr.isles > 0 && dr.dressed === 0, dr.isles+' islands, '+dr.dressed+' dressed');
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
    chk('engine reports itself as FL5b', w4.SKY.version === 'FL5b', w4.SKY.version);
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
    chk('this world\'s job is standing out there waiting to be found',
      sc.length===1 && sc[0].id==='mail-run' && sc[0].x===0 && sc[0].z===-190, JSON.stringify(sc));
    // fly straight at it, the way a kid who spotted the beam would
    const S = wk.SKY.state; S.pos.x=0; S.pos.z=-60; S.pos.y=30; S.yaw=0;
    let t=0, seen=null;
    for (; t<600; t++){ wk.SKY.tick(1/30); const o=wk.SKY.offer(); if(o.up){ seen=o; break; } }
    chk('swooping low over it offers the job by name', !!seen && seen.id==='mail-run',
      'asked after '+(t/30).toFixed(1)+'s of flying at it');
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
    for (let k=0;k<600;k++){ wa.SKY.tick(1/30); if (wa.SKY.offer().up) break; }
    chk('"Do it" starts the job the kid found', wa.SKY.acceptOffer()===true && wa.SKY.mode()==='job' && wa.SKY.job().id==='mail-run');
    chk('once a job is on, its start point is not doubled up in the world', wa.SKY.scouts().length===0);
    wa.SKY.autopilot(true);
    for (let k=0;k<900;k++) wa.SKY.tick(1/30);
    const partway = wa.SKY.job();
    chk('leaving a job halfway is one tap and goes back to flying',
      partway.done>0 && wa.SKY.leaveJob()===true && wa.SKY.mode()==='free',
      'left at '+partway.done+'/'+partway.of);
    chk('and the job goes back out into the world to be found again', wa.SKY.scouts().length===1);
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
    chk('a world with two jobs has two of them out there (Snowy Peaks)', s2.length===2, s2.map(s=>s.id).join(' + '));
    chk('the help button lists this world\'s jobs for a kid who cannot find one', wf.SKY.helpJobs()===2);
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
    for (let k=0;k<600;k++){ wp.SKY.tick(1/30); if (wp.SKY.offer().up) break; }
    chk('the offer that came up is the one a non-reader can answer',
      wp.SKY.offer().up===true && wp.SKY.offer().id==='mail-run');
    const a = wp.SKY.answers();
    chk('the two answers really are a tick and a cross, not the words Do it / Not now',
      !!a && /ans yes/.test(a.yes) && /ans no/.test(a.no) && a.tick===1 && a.cross===1,
      JSON.stringify(a));
    chk('the small word labels are still there underneath, for the grown-up',
      a.labels === 'Yes pleaseNot now' || a.labels === 'Yes please Not now', a.labels);
    // THE POINT OF THE WHOLE BLOCK: the strip is COUNTED off the live DOM and
    // has to match the recipe's own numbers, not a number typed into a drawing.
    const recipe = wp.SKY.missions().filter(m=>m.id==='mail-run')[0];
    const strip = wp.SKY.offerStrip();
    chk('the picture strip is generated from the recipe: one cargo, one icon per target',
      strip.cargo===1 && strip.targets===recipe.targets.length && strip.arrows===1,
      strip.cargo+' cargo + '+strip.targets+' targets (recipe says '+recipe.targets.length+')');
    chk('the tick really is the yes: it starts the job the kid was shown',
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
    for (let k=0;k<900;k++){ wl.SKY.tick(1/30); if (wl.SKY.offer().up) break; }
    const st = wl.SKY.offerStrip();
    chk('a job with NOTHING to carry draws you as the thing that travels, and all four lanterns',
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
      jobs.every(m=>{ const p=m.depot||m.targets[0];
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
    for (let k=0;k<600;k++){ wn.SKY.tick(1/30); if (wn.SKY.offer().up) break; }
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
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok?0:1);
