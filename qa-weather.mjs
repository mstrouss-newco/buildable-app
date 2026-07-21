// Headless QA for the Kidspedia weather-lab template (public/weather.html) — the
// live weather machine, born with this template (Make It Rain).
//
// PART A — contract validation: every weather-lab exhibit file is checked against
// EXHIBIT-MANIFEST.md's shared shape plus the weather lab's own shape (items with
// chips + recipes with slider targets), and the golden rule that only
// status:"approved" is servable.
//
// PART A2 — real-route check: the page at /explore/{id} resolves to weather.html
// (NOT the orbit or dive templates), its data loads as JSON through the real
// route, and every local script/style resolves to a real file.
//
// PART B — runtime check (Node vm sandbox, same pattern as qa-dive.mjs): load the
// real weather.html script and prove — the exhibit renders (recipes + chips
// built, no fallback), every discovery opens via open() and updates the fact
// sheet, chips unlock via trigger(), the found counter fills, facts cycle via
// nextFact(), read-aloud fires, recipes glide the sliders via scenario(), the
// quiz button reaches the shell via quizRequest, pause/resume are honored, and
// the PURE weather brain (weatherAt) makes rain/snow/storm/hail/rainbow under
// exactly the conditions the recipes dial in.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.';
let ok = true;
const fail = (msg) => { console.log('FAIL: ' + msg); ok = false; };
const pass = (msg) => console.log('PASS: ' + msg);
const TEMPLATE = 'weather-lab';
const TEMPLATE_FILE = 'weather.html';

// ---------------- PART A: contract validation ----------------
console.log('--- exhibit contract validation (EXHIBIT-MANIFEST.md + weather-lab shape) ---');
const exploreDir = path.join(dir, 'public', 'explore');
const files = fs.readdirSync(exploreDir).filter((f) => f.endsWith('.json'));
const approved = [];
const candidates = []; // approved + in-review — runtime QA exercises these before approval
for (const f of files) {
  const raw = fs.readFileSync(path.join(exploreDir, f), 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { fail(f + ' is not valid JSON: ' + e.message); continue; }
  if (data.template !== TEMPLATE) continue; // this QA owns the weather-lab template only
  const req = ['id', 'title', 'template', 'topic', 'ageBand', 'status', 'heroArt', 'items', 'recipes'];
  const missing = req.filter((k) => data[k] === undefined);
  if (missing.length) { fail(f + ' missing required field(s): ' + missing.join(', ')); continue; }
  if (!['draft', 'in-review', 'approved'].includes(data.status)) fail(f + ' has invalid status "' + data.status + '"');
  if (data.id + '.json' !== f) fail(f + ': id "' + data.id + '" does not match filename');
  if (!Array.isArray(data.items) || !data.items.length) fail(f + ': items must be a non-empty array');
  if (!Array.isArray(data.recipes) || !data.recipes.length) fail(f + ': recipes must be a non-empty array');
  (data.recipes || []).forEach((r, i) => {
    ['id', 'name', 'heat', 'temp', 'wind', 'line'].forEach((k) => { if (r[k] === undefined) fail(`${f} recipes[${i}]: missing "${k}"`); });
    ['heat', 'temp', 'wind'].forEach((k) => { const v = Number(r[k]); if (!isFinite(v) || v < 0 || v > 100) fail(`${f} recipes[${i}]: "${k}" must be a number 0-100`); });
  });
  (data.items || []).forEach((c, i) => {
    const label = `items[${i}] (${c && c.id})`;
    ['id', 'name', 'chip', 'fact', 'facts', 'stats', 'asks', 'quiz'].forEach((k) => { if (c[k] === undefined) fail(`${f} ${label}: missing "${k}"`); });
    if (Array.isArray(c.stats) && c.stats.length !== 2) fail(`${f} ${label}: stats must be exactly two (got ${c.stats.length})`);
    if (c.facts !== undefined) {
      if (!Array.isArray(c.facts) || !c.facts.length) fail(`${f} ${label}: facts must be a non-empty array when present`);
      else {
        if (c.facts.some((x) => typeof x !== 'string' || !x.trim())) fail(`${f} ${label}: every fact must be a non-empty string`);
        if (c.facts[0] !== c.fact) fail(`${f} ${label}: facts[0] must equal fact (keep the single-fact field in sync)`);
      }
    }
  });
  if (!Array.isArray(data.sources) || !data.sources.length) fail(f + ': sources must be a non-empty array (facts must be human-verified)');
  if (data.status === 'approved') approved.push({ file: f, data });
  if (data.status === 'approved' || data.status === 'in-review') candidates.push({ file: f, data });
}
if (!candidates.length) fail('no weather-lab exhibit files found in public/explore/ (nothing for the weather QA to check)');
if (ok) pass(`${candidates.length} weather-lab exhibit(s) match the contract shape (${approved.length} approved: ${approved.map(a => a.data.id).join(', ') || 'none'})`);

// ---------------- REAL-ROUTE MODEL (mirrors qa-dive.mjs / qa-explore.mjs) ----------------
const publicDir = path.join(dir, 'public');
const vercelRoutes = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8')).routes || []; }
  catch (e) { fail('could not read vercel.json routes: ' + e.message); return []; }
})();
function fileUnderPublic(urlPath) {
  const rel = (urlPath || '').replace(/^\/+/, '').split('?')[0];
  if (!rel) return null;
  const p = path.join(publicDir, rel);
  if (!p.startsWith(publicDir)) return null;
  try { return fs.statSync(p).isFile() ? p : null; } catch (e) { return null; }
}
function resolveRoute(urlPath) {
  const clean = (urlPath || '').split('?')[0];
  const direct = fileUnderPublic(clean);
  if (direct) return direct;
  for (const r of vercelRoutes) {
    if (!r.src || !r.dest) continue;
    let re; try { re = new RegExp('^' + r.src + '$'); } catch (e) { continue; }
    const m = clean.match(re);
    if (m) { const dest = r.dest.replace(/\$(\d+)/g, (_, n) => m[Number(n)] || ''); return fileUnderPublic(dest); }
  }
  return null;
}
function serve(urlPath) {
  const f = resolveRoute(urlPath);
  if (!f) return null;
  const body = fs.readFileSync(f, 'utf8');
  return { file: f, body, isHtml: /^\s*(<!doctype html|<html)/i.test(body) };
}
function resolveUrl(base, ref) {
  if (/^[a-z]+:\/\//i.test(ref)) return null; // external CDN
  if (ref.startsWith('/')) return ref;
  return base.replace(/[^/]*$/, '') + ref;
}

// ---------------- PART A2: the page + its assets resolve through the real route ----------------
console.log('--- real-route check: /explore/{id} serves weather.html and every local asset resolves ---');
const templateHtml = fs.readFileSync(path.join(dir, 'public', TEMPLATE_FILE), 'utf8');
const inlineScript = [...templateHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail(TEMPLATE_FILE + ': could not extract the inline template script');
const scriptSrcs = [...templateHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...templateHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
for (const ex of candidates) {
  const base = `/explore/${ex.data.id}`;
  const pageServed = serve(base);
  if (!pageServed || !pageServed.isHtml) fail(`${ex.data.id}: /explore/${ex.data.id} did not resolve to an HTML page`);
  else if (pageServed.body.indexOf(TEMPLATE) === -1) fail(`${ex.data.id}: /explore/${ex.data.id} did NOT resolve to ${TEMPLATE_FILE} (wrong template served — check vercel.json route order)`);
  else pass(`${ex.data.id}: /explore/${ex.data.id} serves the weather-lab template (${TEMPLATE_FILE})`);
  const jsonServed = serve(`/explore/${ex.data.id}.json`);
  if (!jsonServed || jsonServed.isHtml) fail(`${ex.data.id}: /explore/${ex.data.id}.json did NOT resolve to the JSON file through the real route`);
  else { try { const d = JSON.parse(jsonServed.body); if (!Array.isArray(d.items) || !d.items.length) fail(`${ex.data.id}: served JSON has no items`); else pass(`${ex.data.id}: exhibit data loads through the real route (${d.items.length} discoveries)`); } catch (e) { fail(`${ex.data.id}: served /explore/${ex.data.id}.json is not parseable JSON`); } }
  for (const ref of [...scriptSrcs, ...linkHrefs]) {
    const abs = resolveUrl(base, ref);
    if (abs === null) continue;
    const got = serve(abs);
    if (!got || got.isHtml) fail(`${TEMPLATE_FILE} at ${base}: asset "${ref}" resolves to ${abs} and is served the HTML page, not the file (use a root-absolute path)`);
  }
}

// ---------------- PART B: runtime check per candidate exhibit ----------------
console.log('--- runtime check: weather.html against each candidate exhibit, loaded through the real route ---');

async function runExhibit(exhibit) {
  const registry = {};
  const globalListeners = {};
  const postedMessages = [];
  const spoken = [];
  function makeEl(tag) {
    let _id = '';
    const el = {
      tagName: tag, className: '', textContent: '', innerHTML: '', disabled: false,
      onclick: null, oninput: null, src: '', value: '0', children: [], style: {
        setProperty() {},
      }, dataset: {},
      classList: {
        add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = el.classList.contains(c); const want = force === undefined ? !has : force; want ? el.classList.add(c) : el.classList.remove(c); },
        contains(c) { return el.className.split(' ').filter(Boolean).includes(c); },
      },
      appendChild(child) { el.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getContext: () => new Proxy({}, { get: () => (() => ({})) }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 460, bottom: 460, right: 720 }),
      querySelectorAll: () => [],
      clientWidth: 592, clientHeight: 430, width: 0, height: 0,
    };
    Object.defineProperty(el, 'id', { get: () => _id, set: (v) => { _id = v; if (v) registry[v] = el; } });
    return el;
  }
  ['app', 'pageTitle', 'back', 'stage', 'narr', 'scen', 'chips', 'found', 'foundN', 'foundT',
    'heat', 'temp', 'wind', 'heatv', 'tempv', 'windv', 'heatLabel', 'tempLabel', 'windLabel',
    'sheetbg', 'cName', 'sayBtn', 'cFact', 's1l', 's1', 's2l', 's2', 'qrow',
    'notready', 'notreadyTitle', 'notreadyMsg', 'notreadyBtn', 'pauseveil', 'toast'
  ].forEach((id) => { const e = makeEl('div'); e.id = id; });

  const documentStub = {
    body: makeEl('body'),
    getElementById: (id) => registry[id] || (() => { const e = makeEl('div'); e.id = id; return e; })(),
    createElement: (tag) => makeEl(tag),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  const fakeParent = { postMessage: (msg) => postedMessages.push(msg) };
  const sandbox = {
    document: documentStub,
    Image: class { constructor() { this.width = 0; this.height = 0; this.style = {}; this.alt = ""; } set src(v) { this._src = v; } get src() { return this._src; } },
    Audio: class { constructor(s) { this._s = s; } set src(v) { this._src = v; } play() { return Promise.reject(new Error('no clip')); } pause() {} },
    speechSynthesis: { cancel() {}, speak(u) { spoken.push(u); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    location: { pathname: `/explore/${exhibit.data.id}`, search: '' },
    history: { length: 1, back() {} },
    devicePixelRatio: 1, innerWidth: 820, innerHeight: 1180, scrollY: 0,
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    setTimeout: (fn) => { return 0; }, clearTimeout() {},
    addEventListener: (type, fn) => { (globalListeners[type] = globalListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { if (globalListeners[type]) globalListeners[type] = globalListeners[type].filter((f) => f !== fn); },
    URLSearchParams,
    fetch: (url) => {
      const got = serve(url);
      if (!got) return Promise.resolve({ ok: false, status: 404, json: async () => { throw new Error('404'); } });
      return Promise.resolve({ ok: true, status: 200, json: async () => {
        const d = JSON.parse(got.body);
        if (got.file && /\/explore\/[^/]+\.json$/.test(url)) d.status = 'approved'; // exercise in-review exhibits; PART A enforces servable=approved
        return d;
      } });
    },
    console, Math, Date, JSON, Array, Object, Number, isFinite,
  };
  sandbox.window = sandbox;
  sandbox.parent = fakeParent; // iframed() => true
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const navRef = scriptSrcs.find((s) => /buildable-gamenav\.js/.test(s));
  const navServed = navRef ? serve(resolveUrl(`/explore/${exhibit.data.id}`, navRef)) : null;
  if (navServed && !navServed.isHtml) { try { vm.runInContext(navServed.body, sandbox, { filename: 'buildable-gamenav.js' }); } catch (e) {} }
  vm.runInContext(inlineScript, sandbox, { filename: 'weather-inline' });
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));

  const r = { exhibit: exhibit.data.id };
  // boot rendered through the real route: app shown, recipes + chips built, no fallback.
  r.bootRendered = registry.app.style.display === 'block'
    && registry.scen.children.length === exhibit.data.recipes.length
    && registry.chips.children.length === exhibit.data.items.length
    && registry.notready.style.display !== 'flex';

  // every discovery opens: open() updates the fact sheet, and its chip unlocks via trigger().
  r.itemChecks = [];
  for (const c of exhibit.data.items) {
    sandbox.open(c.id);
    const nameOk = registry.cName.textContent === c.name;
    const factOk = registry.cFact.textContent === c.fact;
    const s1Ok = registry.s1.textContent === (c.stats[0] && c.stats[0].value);
    const sheetOpen = registry.sheetbg.classList.contains('open');
    const chipEl = registry['ch-' + c.id];
    const chipOn = !!chipEl && chipEl.classList.contains('on');
    r.itemChecks.push({ id: c.id, ok: nameOk && factOk && s1Ok && sheetOpen && chipOn });
  }
  r.foundChecked = registry.foundN.textContent === String(exhibit.data.items.length);

  // facts cycle via "Another fact".
  const multi = exhibit.data.items.find((c) => Array.isArray(c.facts) && c.facts.length > 1);
  if (multi) {
    sandbox.open(multi.id);
    const f0 = registry.cFact.textContent === multi.facts[0];
    sandbox.nextFact();
    const f1 = registry.cFact.textContent === multi.facts[1];
    r.factsChecked = f0 && f1;
  } else { r.factsChecked = false; }

  // read-aloud fires (factAudio clip rejects here, so it falls to the browser voice).
  sandbox.open(exhibit.data.items[0].id);
  spoken.length = 0;
  sandbox.readAloud();
  await new Promise((res) => setImmediate(res));
  r.readAloudChecked = spoken.length >= 1 && spoken[0].text.length > 0;

  // recipes drive the sliders: scenario() starts a glide toward the recipe's targets.
  const rec = exhibit.data.recipes[0];
  registry.heat.value = '0'; registry.temp.value = '100'; registry.wind.value = '0';
  sandbox.scenario(rec.id, null);
  let glideOk = true;
  for (let s = 0; s < 40; s++) sandbox.stepGlide(0.05);
  if (Number(registry.heat.value) !== Math.round(rec.heat)) glideOk = false;
  if (Number(registry.temp.value) !== Math.round(rec.temp)) glideOk = false;
  if (Number(registry.wind.value) !== Math.round(rec.wind)) glideOk = false;
  r.recipeChecked = glideOk;

  // quiz bridge: "Quick quiz" reaches the shell via quizRequest.
  const lastC = exhibit.data.items[exhibit.data.items.length - 1];
  sandbox.requestQuiz(lastC);
  const q = postedMessages.find((m) => m && m.kind === 'quizRequest');
  r.quizChecked = !!q && q.source === 'buildable' && q.itemName === lastC.name && q.exhibitId === exhibit.data.id;

  // pause/resume honored (CARTRIDGE-CONTRACT.md).
  (globalListeners['message'] || []).forEach((fn) => fn({ data: { type: 'pause' } }));
  const pausedOk = registry.pauseveil.classList.contains('show');
  (globalListeners['message'] || []).forEach((fn) => fn({ data: { type: 'resume' } }));
  const resumedOk = !registry.pauseveil.classList.contains('show');
  r.pauseResumeChecked = pausedOk && resumedOk;

  // the PURE weather brain: rain/snow/storm/hail/rainbow under the dialed conditions.
  const wa = sandbox.weatherAt;
  const brain = [];
  const chk = (label, got, want) => brain.push({ label, ok: Object.keys(want).every((k) => got[k] === want[k]) });
  chk('steady rain (warm sun, cool air)', wa(0.6, 0.4, 100), { rain: true, snow: false, hail: false, storm: false, rainbow: false });
  chk('snow (freezing air)', wa(0.6, 0.05, 100), { snow: true, rain: false, hail: false });
  chk('storm (blazing heat, huge cloud)', wa(0.95, 0.45, 200), { storm: true, rain: true, hail: false });
  chk('hail (hot storm, cold air aloft)', wa(0.85, 0.30, 150), { hail: true, rain: true });
  chk('rainbow (strong sun through light rain)', wa(0.72, 0.52, 120), { rainbow: true, rain: true, storm: false });
  chk('clear sunny day', wa(0.15, 0.75, 5), { clear: true, rain: false, snow: false });
  chk('no rainbow once the cloud is a storm', wa(0.95, 0.45, 200), { rainbow: false });
  chk('no rainbow on the way UP to a storm (cool stormy air)', wa(0.95, 0.45, 100), { rainbow: false, rain: true });
  r.brainChecks = brain;

  // wind chip unlocks via trigger (driven by the wind slider in the live loop).
  const windItem = exhibit.data.items.find((c) => c.id === 'wind');
  if (windItem) {
    sandbox.trigger('wind');
    r.windChipChecked = registry['ch-wind'] && registry['ch-wind'].classList.contains('on');
  } else r.windChipChecked = true; // exhibit without a wind discovery: nothing to check

  return r;
}

for (const exhibit of candidates) {
  let r;
  try { r = await runExhibit(exhibit); } catch (e) { fail(`${exhibit.data.id}: threw during runtime check — ${e.message}`); continue; }
  if (!r.bootRendered) fail(`${r.exhibit}: exhibit did NOT render through the real route (data never loaded, or recipes/chips never built)`);
  else pass(`${r.exhibit}: renders through the real route — recipes and discovery chips built`);
  const bad = r.itemChecks.filter((c) => !c.ok);
  if (bad.length) fail(`${r.exhibit}: discovery card(s) broken: ${bad.map((b) => b.id).join(', ')}`);
  else pass(`${r.exhibit}: every discovery (${r.itemChecks.length}) opens, unlocks its chip, and fills the fact sheet correctly`);
  if (!r.foundChecked) fail(`${r.exhibit}: discoveries-found counter did not reach ${r.itemChecks.length}`);
  else pass(`${r.exhibit}: discoveries counter fills to ${r.itemChecks.length}/${r.itemChecks.length}`);
  if (!r.factsChecked) fail(`${r.exhibit}: multiple-facts cycling failed ("Another fact")`);
  else pass(`${r.exhibit}: facts cycle via "Another fact" and the sheet updates`);
  if (!r.readAloudChecked) fail(`${r.exhibit}: read-aloud did not fire`);
  else pass(`${r.exhibit}: read-aloud fires (factAudio clip, then browser-voice fallback)`);
  if (!r.recipeChecked) fail(`${r.exhibit}: recipe buttons did not glide the sliders to their targets (scenario/stepGlide)`);
  else pass(`${r.exhibit}: recipe buttons glide the three sliders to the recipe's targets`);
  if (!r.quizChecked) fail(`${r.exhibit}: quiz button did not reach the shell (quizRequest)`);
  else pass(`${r.exhibit}: Quick quiz opens the shell's quizRequest bridge`);
  if (!r.pauseResumeChecked) fail(`${r.exhibit}: pause/resume from the shell was not honored`);
  else pass(`${r.exhibit}: honors pause/resume from the shell (CARTRIDGE-CONTRACT.md)`);
  const badBrain = r.brainChecks.filter((b) => !b.ok);
  if (badBrain.length) fail(`${r.exhibit}: weather brain wrong for: ${badBrain.map((b) => b.label).join('; ')}`);
  else pass(`${r.exhibit}: the weather brain makes rain, snow, storm, hail, rainbow and clear skies under the right conditions (${r.brainChecks.length} checks)`);
  if (!r.windChipChecked) fail(`${r.exhibit}: wind discovery chip did not unlock via trigger()`);
  else pass(`${r.exhibit}: wind discovery chip unlocks`);
}

// Static source checks (mirrors qa-dive.mjs): art slots, read-aloud, audio wiring.
if (inlineScript && /function loadSceneArt\(/.test(inlineScript) && /function drawSlot\(/.test(inlineScript) && /function paintLand\(/.test(inlineScript))
  pass('art slots: painted placeholders draw until real scene art fills the slots (loadSceneArt / drawSlot)');
else fail('scene art-slot fallback (loadSceneArt + drawSlot + painted placeholders) not found in source');
if (inlineScript && /function browserVoice\(/.test(inlineScript) && inlineScript.indexOf('factAudio') !== -1 && inlineScript.indexOf('/api/explore-audio') !== -1)
  pass('read-aloud: plays factAudio narration when present, falls back to the browser voice');
else fail('read-aloud factAudio + browser-voice fallback not found in source');
if (inlineScript && inlineScript.indexOf('/api/sfx?s=') !== -1 && /function startAmbient\(/.test(inlineScript) && /Feel\.tap/.test(inlineScript) && /BuildableGameNav\.register/.test(inlineScript))
  pass('audio wired: ambient bed (/api/sfx), Feel.tap tap feedback, and the shell Sound toggle');
else fail('audio wiring (ambient / Feel.tap / Sound toggle) not found in source');
if (inlineScript && /function weatherAt\(/.test(inlineScript) && /function trigger\(/.test(inlineScript) && /function updateFound\(/.test(inlineScript))
  pass('discovery machine: pure weather brain + chip unlocks + found counter present (weatherAt / trigger / updateFound)');
else fail('discovery machine (weatherAt / trigger / updateFound) not found in source');

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
