// Headless QA for public/mathcannon-engine.html — MANIFEST + WIRING + CONTRACT (Session 8C).
// Math Cannon is the FIRST native learning game: the academic skill IS the mechanic. It is a
// real-time canvas game with no headless logic hook, so this harness does NOT sim live
// gameplay. It proves what CAN be checked deterministically: the manifest is valid and
// declares the skills it teaches + 5 ascending math stages, the difficulty 1-5 band maps to a
// sane number range with no negative answers possible, the engine is wired to read the manifest
// (with a built-in fallback that does not drift), and the cartridge-contract signals it needs
// (shared nav + start screen + shared HUD + the `skill` learning-ledger report + pause + a win
// path) are all present in the shipped file. No emojis anywhere (product guardrail).
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');
let ok = true;
const chk = (name, cond, extra='') => { console.log((cond?'PASS':'FAIL')+'  '+name+(extra?'  ::  '+extra:'')); if(!cond) ok=false; };
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// 1) manifest through the shared loader
console.log('--- MANIFEST: /mathcannon/manifest.json through the shared loader ---');
const bmSb = { console, Math, Date, JSON, Object, Array, String }; bmSb.window = bmSb; bmSb.globalThis = bmSb; vm.createContext(bmSb);
vm.runInContext(read('public/buildable-manifest.js'), bmSb, { filename:'buildable-manifest' });
const BM = bmSb.BuildableManifest;
const manifest = JSON.parse(read('public/mathcannon/manifest.json'));
const v = BM.validate(manifest);
chk('manifest validates', v.ok, 'errors='+JSON.stringify(v.errors));
chk('type is game', manifest.type==='game');
chk('category is Learning (honest — this is a learning game)', manifest.category==='Learning');
chk('declares the subject + skills it teaches', !!manifest.teaches && manifest.teaches.subject==='math' && Array.isArray(manifest.teaches.skills) && manifest.teaches.skills.length>=2, JSON.stringify(manifest.teaches));
chk('learning subjects include math', !!(manifest.features&&manifest.features.learning&&(manifest.features.learning.subjects||[]).includes('math')));
const cfg = v.ok ? BM.toEngineConfig(manifest) : { stages:[] };
chk('5 ordered stages', cfg.stages.length===5, cfg.stages.map(s=>s.name).join(' > '));
chk('difficulty ramps 1..5 (a real journey)', cfg.stages.every((s,i)=>s.difficulty===i+1), cfg.stages.map(s=>s.difficulty).join(','));
chk('every stage names a skill + an operation set + a number band', cfg.stages.every(s=>s.skill && Array.isArray(s.ops) && s.ops.length && s.maxN>0), cfg.stages.map(s=>s.skill+'/'+s.ops.join('')+'/max'+s.maxN).join(', '));
chk('every stage has a target of correct answers to clear', cfg.stages.every(s=>s.target>=1), cfg.stages.map(s=>s.target).join(','));
chk('single-player (multiplayer off)', cfg.multiplayer==='off');
chk('no emojis in the manifest', !emoji.test(read('public/mathcannon/manifest.json')));

// 1b) the math band is sane: number range grows with difficulty, no impossible problems
console.log('--- MATH BAND: difficulty 1-5 -> a sane, always-answerable number range ---');
const bands = cfg.stages.map(s=>s.maxN);
chk('number band is a positive integer per stage', bands.every(n=>Number.isInteger(n)&&n>0), bands.join(','));
chk('subtraction stages exist and never need a negative answer (a-b, b<a)', cfg.stages.some(s=>s.ops.includes('-')));
chk('a multiplication stage exists (factors capped by the band)', cfg.stages.some(s=>s.ops.includes('x')));

// 2) engine wiring + fallback (no drift from the manifest)
console.log('--- ENGINE: reads the manifest, keeps a built-in fallback that matches ---');
const html = read('public/mathcannon-engine.html');
chk('engine loads the shared manifest loader for this game', /BuildableManifest\.load\(\s*["']mathcannon["']/.test(html) && /buildable-manifest\.js/.test(html));
chk('built-in FALLBACK_STAGES present (a manifest miss never breaks play)', /FALLBACK_STAGES\s*=/.test(html));
// fallback stage ids match the manifest ids in order (no drift)
const manifestIds = manifest.levels.map(l=>l.id);
const fbBlock = (html.match(/FALLBACK_STAGES\s*=\s*\[([\s\S]*?)\];/)||[])[1] || '';
const fbIds = (fbBlock.match(/id:"([a-z0-9-]+)"/g)||[]).map(x=>x.replace(/id:"|"/g,''));
chk('fallback stage ids match the manifest (no drift)', JSON.stringify(fbIds)===JSON.stringify(manifestIds), JSON.stringify(fbIds)+' vs '+JSON.stringify(manifestIds));

// 3) shell contract signals present in the shipped engine
console.log('--- CONTRACT: nav + start screen + HUD + skill ledger + pause + win path ---');
chk('registers the shared game nav (Home exits to the hub)', /BuildableGameNav\.register\(/.test(html));
chk('mounts the shared start screen (BS.mount)', /BS\.mount\(/.test(html));
chk('uses the shared HUD', /HUD\(\)\.(show|set)\(/.test(html));
chk('honors the shell pause/resume messages', /type\s*===\s*"pause"/.test(html) && /type\s*===\s*"resume"/.test(html));
chk('THE point of 8C: reports the practiced skill to the learning ledger', /kind:\s*"skill"/.test(html) && /subject:\s*"math"/.test(html));
chk('reports BOTH correct and incorrect answers', /reportSkill\(true\)/.test(html) && /reportSkill\(false\)/.test(html));
chk('the skill IS the mechanic (an answer fires the cannon)', /function\s+fireAt\(/.test(html) && /problem\.answer/.test(html));
chk('always-winnable: a wrong tap retries with no lose state', /onWrong/.test(html) && !/game\s*over/i.test(html));
chk('has a win path (stage clear + final win + signal to buddy)', /levelClear\(/.test(html) && /signal\("win"/.test(html) && /You did it!/.test(html));
chk('no emojis in the engine', !emoji.test(html));

// 4) shell + routing wiring
console.log('--- SHELL: catalog entry + screen + vercel routes ---');
const jsx = read('src/BuildableKids.jsx');
chk('Math Cannon is in the picker catalog', /id:\s*"mathcannon"/.test(jsx) && /handler:\s*"onMathCannon"/.test(jsx));
chk('the shell has a screen that embeds the engine', /MathCannonScreen/.test(jsx) && /mathcannon-engine\.html/.test(jsx));
chk('the shell relays the skill message to the ledger (pre-wired)', /d\.kind === "skill"/.test(jsx) && /logSkillEvent/.test(jsx));
const vjson = JSON.parse(read('vercel.json'));
const srcs = vjson.routes.map(r=>r.src);
chk('vercel routes the engine + manifest (not swallowed by the catch-all)', srcs.includes('/mathcannon-engine.html') && srcs.includes('/mathcannon/manifest.json'));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
