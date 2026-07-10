// Headless QA for public/typing.html — LIGHT EMOJI FIX + MANIFEST + WIRING (Session 7B).
// Typing is a bespoke real-time canvas/DOM game with no headless logic hook, so this proves
// what can be checked deterministically: the light emoji fix landed (file is now emoji-free —
// hero faces + placeholders are drawn, real AI art stays primary), the manifest is valid and
// maps to the worlds, the engine reads its world names with a built-in fallback, and the shell
// contract signal (win postMessage) is present.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const html = read('public/typing.html');

// 1) THE LIGHT FIX: file is emoji-free, drawn replacements present
console.log('--- EMOJI FIX ---');
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const found = html.match(emojiRe) || [];
chk('no emoji glyphs remain (was ~40)', found.length===0, found.length?('still: '+[...new Set(found)].slice(0,8).join(' ')):'clean');
chk('foe/boss placeholder is a drawn dot, not an emoji', /el\.style\.background='radial-gradient/.test(html) && /el\.textContent='';el\.style\.backgroundImage=''/.test(html));
chk('fort + hero faces are drawn SVG', /class="fort" id="fort"><svg/.test(html) && /class=\\?"face\\?"><svg/.test(html));
chk('real AI art stays primary (kind=type)', /\/api\/images\?kind=type/.test(html));

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
