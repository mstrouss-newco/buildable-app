// Headless QA for TYPING — both halves of it.
//
// Typing is TWO pages since the rebuild: `public/typing.html` is the typing
// school (units, lessons, the practice tab) and `public/typing-game.html` is
// Defend the Castle, which used to BE typing.html and now lives behind the
// Games tab. This harness checked one file called typing.html and, when the
// castle game moved out from under it, every game-shaped check went red against
// a page that had never had a fort in it. The checks were right; they were
// pointed at the wrong file. They now name the file they mean.
//
// Typing is a bespoke real-time canvas/DOM game with no headless logic hook, so
// this proves what can be checked deterministically: NEITHER PAGE HAS AN EMOJI
// IN IT (hero faces, placeholders and every icon in the school are drawn, real
// AI art stays primary), the manifest is valid and maps to the worlds, the
// engine reads its world names with a built-in fallback, and the shell contract
// signal (win postMessage) is present.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const school = read('public/typing.html');          // the typing school
const html   = read('public/typing-game.html');     // Defend the Castle

// 1) NO EMOJI, ON EITHER PAGE.
// U+2300-U+23FF is in the range list because the stopwatch is U+23F1 and the
// old list stopped just short of it: typing.html shipped two of them and this
// harness reported the file clean apart from the stray variation selectors
// hanging off the end of them. A range that catches the accent but not the
// character is worse than no check, because it reads as a pass.
console.log('--- EMOJI FIX ---');
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const sniff = (name, text) => {
  const f = text.match(emojiRe) || [];
  chk('no emoji glyphs in ' + name, f.length === 0,
    f.length ? ('still: ' + [...new Set(f)].join(' ')) : 'clean');
};
sniff('the typing school (typing.html)', school);
sniff('Defend the Castle (typing-game.html)', html);
chk('foe/boss placeholder is a drawn dot, not an emoji', /el\.style\.background='radial-gradient/.test(html) && /el\.textContent='';el\.style\.backgroundImage=''/.test(html));
chk('fort + hero faces are drawn SVG', /class="fort" id="fort"><svg/.test(html) && /class=\\?"face\\?"><svg/.test(html));
chk('real AI art stays primary (kind=type)', /\/api\/images\?kind=type/.test(html));
// and the school's own icons are geometry, so nothing can quietly go back to
// being a glyph the day someone finds it quicker to type one
// ICO.lock was dropped when the school stopped locking lessons: a child can now
// start any lesson they like, so there is no padlock left to draw.
chk('the school draws its icons: the pills, the tiles and the stars are all SVG',
  /class="ic"/.test(school) && /var ICO=\{/.test(school) &&
  /ICO\.bolt/.test(school) && /ICO\.target/.test(school) &&
  /ICO\.starSmOpen/.test(school) && /ICO\.tick/.test(school));
chk('no lesson is locked — every one is startable',
  !/ICO\.lock/.test(school) && !/les lock/.test(school));

// 2) manifest
console.log('--- MANIFEST ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const manifest = JSON.parse(read('public/typing/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('no emoji in the manifest', !emojiRe.test(read('public/typing/manifest.json')));
chk('category is Classic', manifest.category==='Classic');
const cfg = v.ok ? BM.toEngineConfig(manifest) : { stages:[] };
chk('6 worlds as ordered levels', cfg.stages.length===6, cfg.stages.map(s=>s.name).join(' > '));
chk('single-player (multiplayer off)', cfg.multiplayer==='off');

// 3) engine wiring + fallback
console.log('--- ENGINE WIRING ---');
chk('engine loads the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\("typing"/.test(html));
chk('manifest world names flow into WORLDS (with built-in fallback)', /WORLDS\[i\]\.name = cfg\.stages\[i\]\.name/.test(html) && /const WORLDS=\[/.test(html));

// 4) contract
console.log('--- CONTRACT ---');
chk('reports a win to the shell', /postMessage\(\{source:"buildable",kind:"win"\}/.test(html));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
