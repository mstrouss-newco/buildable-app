// Headless QA for public/croctot.html — MANIFEST + WIRING + CONTRACT (Session 7B).
// Croc Tot is a real-time canvas action game with no headless logic hook, so this harness
// does NOT sim live gameplay. It proves what CAN be checked deterministically: the manifest
// is valid and maps to 5 ascending stages, the engine is wired to read it (with a built-in
// fallback so a manifest miss never breaks the game), and the shell contract signals it needs
// (shared nav + start screen + shared HUD + a win path) are present in the shipped file.
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };

// 1) manifest through the shared loader
console.log('--- MANIFEST: /croctot/manifest.json through the shared loader ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const manifest = JSON.parse(read('public/croctot/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('category is Action (honest — not a board Classic)', manifest.category==='Action');
const cfg = v.ok ? BM.toEngineConfig(manifest) : { stages:[] };
chk('5 ordered stages', cfg.stages.length===5, cfg.stages.map(s=>s.name).join(' > '));
const ascending = cfg.stages.every((s,i)=> s.difficulty===i+1);
chk('difficulty ramps 1..5 (a real journey)', ascending, cfg.stages.map(s=>s.difficulty).join(','));
chk('every stage names a theme + a boss', cfg.stages.every(s=>s.theme && s.boss), cfg.stages.map(s=>s.theme+'/'+s.boss).join(', '));
chk('single-player (multiplayer off)', cfg.multiplayer==='off');
// guardrail: no emoji anywhere in the manifest
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
chk('no emojis in the manifest', !emoji.test(read('public/croctot/manifest.json')));

// 2) engine wiring + fallback
console.log('--- ENGINE: reads the manifest, keeps a built-in fallback ---');
const html = read('public/croctot.html');
chk('engine loads the shared manifest loader', /buildable-manifest\.js/.test(html) && /BuildableManifest\.load\("croctot"/.test(html));
chk('manifest stages drive the level-select names', /LEVEL_NAMES\s*=\s*cfg\.stages\.map/.test(html));
// built-in fallback stage names still present AND consistent with the manifest
const fbMatch = html.match(/let LEVEL_NAMES=\[([^\]]*)\]/);
const fallbackNames = fbMatch ? fbMatch[1].split(',').map(x=>x.replace(/["']/g,'').trim()) : [];
const manifestNames = cfg.stages.map(s=>s.name);
chk('built-in fallback stage names present', fallbackNames.length===5, fallbackNames.join(' > '));
chk('fallback names match the manifest (no drift)', JSON.stringify(fallbackNames)===JSON.stringify(manifestNames), JSON.stringify(fallbackNames)+' vs '+JSON.stringify(manifestNames));

// 3) shell contract signals present in the shipped engine
console.log('--- CONTRACT: shell nav + start screen + HUD + win path ---');
chk('registers the shared game nav (Home exits to the hub)', /BuildableGameNav\.register\(/.test(html));
chk('mounts the shared start screen (BS)', /BS\.mount\(/.test(html));
chk('uses the shared HUD', /HUD\(\)\.(show|set)\(/.test(html));
chk('has a win path (stage advance + final win)', /advanceLevel\(\)/.test(html) && /YOU WIN/.test(html));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
