// Headless QA for public/rileys-garden.html — ART + AUDIO + ENGINE + MANIFEST + STUB.
// Riley's Garden is a self-contained kid creation whose sprites used to be emojis.
// 7B proved the art pass; 7L added the audio and engine sections after a stuck
// looping sound was reported. This harness proves:
//   1. the file is 100% emoji-free (a WIDER net than 7B used — that regex had
//      holes the pause and alarm-clock glyphs slipped through)
//   2. the drawn vector sprites all run without error
//   3. the audio brakes that fix the looping sound are in place
//   4. the engine runs ONE animation loop, not two
//   5. the manifest is valid + maps to 5 ascending stages
//   6. the engine reads its stage names from the manifest with a built-in fallback
//   7. the identity stub (picker card + screen + route) exists in the app
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const html = read('public/rileys-garden.html');

// 1) THE ART PASS: no emojis anywhere in the shipped file
console.log('--- ART PASS: file is emoji-free ---');
// 7L widened this. The 7B version skipped U+2300-U+25FF and U+2900-U+2AFF, which
// is exactly how the pause glyph (U+23F8) and the alarm clock (U+23F0) survived
// the "100% emoji-free" claim for a year. Dingbats, arrows, geometric shapes and
// the misc-technical block are all in scope now. U+2500-U+257F (box drawing) is
// deliberately excluded: those are the ─ rules in the comment headers, which are
// code decoration, not product art.
const EMOJI_SET = '[\\u{1F000}-\\u{1FAFF}\\u{2300}-\\u{24FF}\\u{2580}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2900}-\\u{2AFF}\\u{2190}-\\u{21FF}\\u{FE0F}\\u{200D}\\u{20E3}]';
const emojiAll = new RegExp(EMOJI_SET, 'gu');            // for .match()
const hasEmoji = s => new RegExp(EMOJI_SET, 'u').test(s); // fresh each call: a /g regex keeps lastIndex and .test() would flip-flop
const found = html.match(emojiAll) || [];
chk('no emoji glyphs remain (was 96)', found.length===0, found.length?('still: '+[...new Set(found)].join(' ')):'clean');

// 2) the drawn vector sprites run without error
console.log('--- ART: drawn sprites execute ---');
const a = html.indexOf('/* ===== Session 7B art pass');
const b = html.indexOf('function drawFairy(');
chk('art module present', a>0 && b>a);
const artSrc = html.slice(a, b);
const noop = () => {};
const ctxStub = new Proxy({}, { get:(_,k)=> (k==='createRadialGradient'||k==='createLinearGradient') ? (()=>({addColorStop:noop})) : (typeof k==='symbol'?undefined:noop) });
const artSb = { ctx: ctxStub, Math, console }; vm.createContext(artSb);
vm.runInContext(artSrc, artSb, { filename:'rg-art' });
let ran = 0, threw = '';
for (const t of ['orange','apple','strawberry','blueberry','grapes','sunflower','rose','tulip','moonflower','unknown']) {
  try { artSb.drawItem(t, 50, 50, 36); ran++; } catch(e){ threw = t+': '+e.message; }
}
try { artSb.drawBeeBody(false); artSb.drawBeeBody(true); artSb.rgStar(0,0,6,4,'#fff'); artSb.rgLeaf(0,0,0,1,'#3a3'); ran+=4; } catch(e){ threw = 'helpers: '+e.message; }
chk('all 14 sprite draws run clean', ran===14 && !threw, threw||('ran '+ran));
// the sprite module must stay pure drawing — no wall-clock reads, or the QA
// sandbox and any future offscreen prerender break
chk('sprite module is time-free (no Date/performance)', !/\b(Date\.now|performance\.now)\b/.test(artSrc));

// 3) THE 7L SOUND BUG: the brakes that stop a one-shot from looping
console.log('--- AUDIO (Session 7L stuck-sound fix) ---');
// The actual reported bug: fruitGot was never spent, so once you passed the
// threshold every fruit re-armed the magnet and replayed its fanfare.
chk('magnet spends its fruit on activation (the looping fanfare)',
    /farmerOn=true;farmerT=FDUR;fruitGot=0;sfx\('farmer'\)/.test(html));
chk('per-sound cooldown table exists and covers the auto-weapon',
    /const SFX_GAP=\{/.test(html) && /wep0:\s*\d+/.test(html) && /t-prev<gap\/1000/.test(html));
chk('voice budget caps simultaneous oscillators',
    /VOICE_CAP\s*=\s*\d+/.test(html) && /if\(voices>=VOICE_CAP\)return/.test(html));
chk('every voice routes through the master bus, not straight to the speakers',
    /function bus\(\)/.test(html) && !/\bg\.connect\(a\.destination\)/.test(html));
chk('bee buzz tears down every node it created',
    /buzzNodes/.test(html) && /nodes\.forEach\(n=>\{try\{if\(n\.stop\)n\.stop\(\)/.test(html));
chk('audio stops when the page is hidden or closed',
    /visibilitychange/.test(html) && /pagehide/.test(html) && /function audioSleep/.test(html));

// 4) ENGINE: one animation loop, not two
console.log('--- ENGINE LOOP ---');
// mainLoop used to schedule loop AND call it, and loop schedules itself, so a
// started game ran two rAF chains for the rest of the session.
chk('mainLoop hands off without also calling loop',
    /function mainLoop\(ts\)\{[\s\S]*?raf=requestAnimationFrame\(loop\);\s*\n\}/.test(html) &&
    !/raf=requestAnimationFrame\(loop\);loop\(ts\)/.test(html));
chk('loop hands the frame back to the title screen',
    /if\(GS==='start'\)\{raf=requestAnimationFrame\(titleLoop\)/.test(html));
chk('boss fight does not rebuild the whole HUD every frame',
    !/if\(bossHitCool<=0&&D\(PL\.x,PL\.y,boss\.x,boss\.y\)<52\)\{bossHitCool=1400;hitPlayer\(\);\}\s*\n\s*updHUD\(\);/.test(html));
chk('best score is shown, not just saved', /Best so far/.test(html));
// dead weight from the emoji era must not creep back
chk('no leftover emoji-era scaffolding', !/drawEmoji|const EMJ=/.test(html));

// 5) manifest through the shared loader

// SCREEN FIT: the game must ZOOM to fit a tablet, not sit in a phone-width strip.
// Before this pass #gw was capped at 430px, so an iPad showed a narrow column with
// dead space either side. The engine now keeps its phone-tuned design units (W/H)
// and multiplies them by S on the way to the screen. These checks run the real
// rsz() in a sandbox at three real device sizes.
console.log('--- SCREEN FIT: scales up on a tablet ---');
{
  const src = html.match(/const DW=[\s\S]*?\nfunction rsz\(\)\{[\s\S]*?\n\}/);
  chk('rsz() carries a design size + scale factor', !!src);
  if (src) {
    const run = (vw, vh) => {
      const styles = {}, gwEl = { style: { setProperty:(k,v)=>{styles[k]=v;}, get width(){return styles.width;}, set width(v){styles.width=v;}, set height(v){styles.height=v;}, set maxWidth(v){styles.maxWidth=v;} } };
      const box = { W:0, H:0, S:1, DPR:1 };
      const ctxv = {
        window:{innerWidth:vw,innerHeight:vh,devicePixelRatio:2},
        Math, gw:gwEl, gc:{width:0,height:0},
        get W(){return box.W;}, set W(v){box.W=v;},
        get H(){return box.H;}, set H(v){box.H=v;},
        get S(){return box.S;}, set S(v){box.S=v;},
        get DPR(){return box.DPR;}, set DPR(v){box.DPR=v;},
      };
      vm.createContext(ctxv);
      vm.runInContext(src[0] + '\nrsz();', ctxv);
      return { S:box.S, W:box.W, H:box.H, boxW:parseInt(styles.width,10) };
    };
    const phone = run(390, 844), padP = run(820, 1180), padL = run(1180, 820);
    chk('a phone renders exactly as before (no zoom, full width)',
        phone.S === 1 && Math.round(phone.W) === 390 && Math.round(phone.H) === 844,
        JSON.stringify(phone));
    chk('an iPad in portrait fills the width and zooms in',
        padP.boxW === 820 && padP.S > 1.3, JSON.stringify(padP));
    chk('an iPad in landscape stays a sensible shape, not a stretched band',
        padL.W / padL.H <= 1.25 && padL.boxW <= 1180, JSON.stringify(padL));
  }
  chk('drawing is multiplied by the scale', /setTransform\(DPR\*S,0,0,DPR\*S,0,0\)/.test(html));
  chk('taps are divided back into game units', /\{x:\(cx-r\.left\)\/S,y:\(cy-r\.top\)\/S\}/.test(html));
  chk('the HUD and menus scale with the game', /transform:scale\(var\(--s\)\)/.test(html));
}
console.log('--- MANIFEST ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const manifest = JSON.parse(read('public/rileys-garden/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('no emoji in the manifest', !hasEmoji(read('public/rileys-garden/manifest.json')));
const cfg = v.ok ? BM.toEngineConfig(manifest) : { stages:[] };
chk('5 ordered stages, difficulty 1..5', cfg.stages.length===5 && cfg.stages.every((s,i)=>s.difficulty===i+1), cfg.stages.map(s=>s.name).join(' > '));

// 6) engine reads the manifest with a fallback
console.log('--- ENGINE WIRING ---');
chk('engine loads the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\("rileys-garden"/.test(html));
chk('manifest stage names flow into the level names', /LVS\[i\]\.nm = cfg\.stages\[i\]\.name/.test(html) && /const lvNames=LVS\.map/.test(html));

// 7) identity stub exists in the app
console.log('--- IDENTITY STUB (picker card + screen + route) ---');
const app = read('src/BuildableKids.jsx');
chk('GAME_CATALOG has a Riley card (handler onRileys)', /id:\s*"rileys-garden"[\s\S]*?handler:\s*"onRileys"/.test(app));
// 7L: this used to demand setScreen(SCREEN_RILEYS) on the handler. The shell moved
// to landing pages (openLanding) in a later session and the check has been failing
// ever since — it was asserting the OLD navigation, not a real break. Accept either.
chk('has a screen + render route',
    /function RileysScreen/.test(app) && /screen === SCREEN_RILEYS/.test(app) &&
    (/onRileys=\{\(\) => setScreen\(SCREEN_RILEYS\)\}/.test(app) || /onRileys=\{\(\) => openLanding\("rileys-garden"\)\}/.test(app)));
chk('vercel serves the manifest', /"src":\s*"\/rileys-garden\/manifest\.json"/.test(read('vercel.json')));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
