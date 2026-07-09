// Headless QA for the Music Maker STUDIO (Session 6C) — the first type:studio.
// A studio has no levels/journey, so there is nothing to "play" the way a game
// harness does. Instead this proves the STUDIO CONTRACT through the same shared
// shell loader the browser uses (buildable-manifest.js):
//   1) the manifest validates as a studio,
//   2) toEngineConfig() produces a studio-shaped config (produces + savesTo),
//   3) coins + instrument-pack customization + learning gates are present,
//   4) the loader refuses a malformed studio (missing produces/savesTo),
//   5) adding a studio did NOT regress the game manifests.
// Run: node qa-music.mjs [repoDir]
import fs from 'fs'; import vm from 'vm';
const dir = process.argv[2] || '.';
const readPub = f => fs.readFileSync(dir + '/public/' + f, 'utf8');

const sandbox = { console, Date, Math };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readPub('buildable-manifest.js'), sandbox, { filename: 'buildable-manifest' });
const BM = sandbox.BuildableManifest;
let ok = true;
const check = (pass, label) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; };

if (!BM || !BM.validate) { console.error('FAIL: BuildableManifest not exposed'); process.exit(2); }

// --- 1) validate the studio manifest ---
const m = JSON.parse(readPub('music-maker/manifest.json'));
const v = BM.validate(m);
console.log('--- STUDIO: validate /music-maker/manifest.json ---');
check(v.ok, `validate ok=${v.ok} errors=${JSON.stringify(v.errors)} warnings=${JSON.stringify(v.warnings)}`);
check(m.type === 'studio', `type is "studio" (got ${m.type})`);

// --- 2) toEngineConfig -> studio shape ---
const cfg = BM.toEngineConfig(m);
console.log('--- STUDIO: manifest -> engine config ---');
check(cfg.type === 'studio', `config type studio (got ${cfg.type})`);
check(cfg.produces === 'songs', `produces = songs (got ${cfg.produces})`);
check(cfg.savesTo === 'saved_songs', `savesTo = saved_songs (got ${cfg.savesTo})`);
check(Array.isArray(cfg.levels) && cfg.levels.length === 0, `studio has no levels (got ${cfg.levels.length})`);

// --- 3) coins + instrument-pack customization + learning ---
console.log('--- STUDIO: coins, customization, learning ---');
check(m.features && m.features.coins === true, 'coins enabled (features.coins)');
const packs = (cfg.customization || []).find(s => /instrument/i.test(s.slot));
check(!!packs, 'customization has an "Instrument packs" slot');
check(!!packs && packs.options.some(o => (o.price || 0) === 0), 'instrument packs include a free option (at least one)');
check(!!packs && packs.options.some(o => (o.price || 0) > 0), 'instrument packs include a priced (coin) unlock');
check(cfg.learning && cfg.learning.coinTopUp === true, 'learning coinTopUp on (3 right = 10 coins)');
check(cfg.learning && cfg.learning.beforeUnlock === true, 'learning beforeUnlock gate on');
check(cfg.learning && cfg.learning.subjects.length > 0, `learning subjects: ${JSON.stringify(cfg.learning && cfg.learning.subjects)}`);

// --- 4) loader rejects a malformed studio ---
console.log('--- STUDIO: contract is enforced ---');
const bad = JSON.parse(JSON.stringify(m)); delete bad.produces; delete bad.savesTo;
const bv = BM.validate(bad);
check(!bv.ok, `studio missing produces/savesTo is rejected (errors=${JSON.stringify(bv.errors)})`);

// --- 5) no regression: game manifests still validate ---
console.log('--- REGRESSION: existing game manifests still valid ---');
for (const g of ['breaker', 'survival', 'sling']) {
  const gm = JSON.parse(readPub(g + '/manifest.json'));
  const gv = BM.validate(gm);
  check(gv.ok, `${g} still validates (levels=${(BM.toEngineConfig(gm).levels || []).length})`);
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
