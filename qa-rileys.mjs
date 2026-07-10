// Headless QA for public/rileys-garden.html — ART PASS + MANIFEST + WIRING + STUB (Session 7B).
// Riley's Garden is a self-contained kid creation whose sprites used to be emojis. This harness
// proves: (1) the file is now 100% emoji-free (the art pass — the whole point), (2) the drawn
// vector sprites actually run without error, (3) the manifest is valid + maps to 5 ascending
// stages, (4) the engine reads its stage names from the manifest with a built-in fallback, and
// (5) the identity stub (picker card + screen + route) exists in the app.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const html = read('public/rileys-garden.html');

// 1) THE ART PASS: no emojis anywhere in the shipped file
console.log('--- ART PASS: file is emoji-free ---');
const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{2705}\u{2728}]/gu;
const found = html.match(emojiRe) || [];
chk('no emoji glyphs remain (was 96)', found.length===0, found.length?('still: '+[...new Set(found)].join(' ')):'clean');

// 2) the drawn vector sprites run without error
console.log('--- ART: drawn sprites execute ---');
const a = html.indexOf('/* ===== Session 7B art pass');
const b = html.indexOf('function drawEmoji(e,x,y,sz){');
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

// 3) manifest through the shared loader
console.log('--- MANIFEST ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const manifest = JSON.parse(read('public/rileys-garden/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('no emoji in the manifest', !emojiRe.test(read('public/rileys-garden/manifest.json')));
const cfg = v.ok ? BM.toEngineConfig(manifest) : { stages:[] };
chk('5 ordered stages, difficulty 1..5', cfg.stages.length===5 && cfg.stages.every((s,i)=>s.difficulty===i+1), cfg.stages.map(s=>s.name).join(' > '));

// 4) engine reads the manifest with a fallback
console.log('--- ENGINE WIRING ---');
chk('engine loads the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\("rileys-garden"/.test(html));
chk('manifest stage names flow into the level names', /LVS\[i\]\.nm = cfg\.stages\[i\]\.name/.test(html) && /const lvNames=LVS\.map/.test(html));

// 5) identity stub exists in the app
console.log('--- IDENTITY STUB (picker card + screen + route) ---');
const app = read('src/BuildableKids.jsx');
chk('GAME_CATALOG has a Riley card (handler onRileys)', /id:\s*"rileys-garden"[\s\S]*?handler:\s*"onRileys"/.test(app));
chk('has a screen + render route', /function RileysScreen/.test(app) && /screen === SCREEN_RILEYS/.test(app) && /onRileys=\{\(\) => setScreen\(SCREEN_RILEYS\)\}/.test(app));
chk('vercel serves the manifest', /"src":\s*"\/rileys-garden\/manifest\.json"/.test(read('vercel.json')));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
