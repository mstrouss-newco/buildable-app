// Headless QA for the Kidspedia layers-cutaway template (public/dive.html) — the
// scrollable-descent "dive", born with this template (Journey to the Deep).
//
// PART A — contract validation: every layers-cutaway exhibit file is checked
// against EXHIBIT-MANIFEST.md's shared shape plus the dive's own shape (zones +
// creatures), and the golden rule that only status:"approved" is servable.
//
// PART A2 — real-route check: the page at /explore/{id} resolves to dive.html
// (NOT the orbit template), its data loads as JSON through the real route, and
// every local script/style resolves to a real file (the class of bug that once
// blanked an exhibit on iPad).
//
// PART B — runtime check (Node vm sandbox, same pattern as the other qa-*.mjs):
// load the real dive.html script through the real route and prove — the exhibit
// renders (zones + creatures built, no fallback), every creature is tappable via
// open() and updates the fact sheet, facts cycle via nextFact(), the flashlight
// zone activates past the midnight line (darknessAt), read-aloud fires, the quiz
// button reaches the shell via quizRequest, and pause/resume are honored.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.';
let ok = true;
const fail = (msg) => { console.log('FAIL: ' + msg); ok = false; };
const pass = (msg) => console.log('PASS: ' + msg);
const TEMPLATE = 'layers-cutaway';
const TEMPLATE_FILE = 'dive.html';

// ---------------- PART A: contract validation ----------------
console.log('--- exhibit contract validation (EXHIBIT-MANIFEST.md + dive shape) ---');
const exploreDir = path.join(dir, 'public', 'explore');
const files = fs.readdirSync(exploreDir).filter((f) => f.endsWith('.json'));
const approved = [];
const candidates = []; // approved + in-review — runtime QA exercises these before approval
for (const f of files) {
  const raw = fs.readFileSync(path.join(exploreDir, f), 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { fail(f + ' is not valid JSON: ' + e.message); continue; }
  if (data.template !== TEMPLATE) continue; // this QA owns the dive template only
  const req = ['id', 'title', 'template', 'topic', 'ageBand', 'status', 'heroArt', 'zones', 'creatures'];
  const missing = req.filter((k) => data[k] === undefined);
  if (missing.length) { fail(f + ' missing required field(s): ' + missing.join(', ')); continue; }
  if (!['draft', 'in-review', 'approved'].includes(data.status)) fail(f + ' has invalid status "' + data.status + '"');
  if (data.id + '.json' !== f) fail(f + ': id "' + data.id + '" does not match filename');
  if (!Array.isArray(data.zones) || !data.zones.length) fail(f + ': zones must be a non-empty array');
  if (!Array.isArray(data.creatures) || !data.creatures.length) fail(f + ': creatures must be a non-empty array');
  const zoneIds = new Set((data.zones || []).map((z) => z.id));
  (data.zones || []).forEach((z, i) => { ['id', 'name'].forEach((k) => { if (z[k] === undefined) fail(`${f} zones[${i}]: missing "${k}"`); }); });
  (data.creatures || []).forEach((c, i) => {
    const label = `creatures[${i}] (${c && c.id})`;
    ['id', 'name', 'zone', 'fact', 'facts', 'stats', 'asks', 'quiz'].forEach((k) => { if (c[k] === undefined) fail(`${f} ${label}: missing "${k}"`); });
    if (c.zone !== undefined && !zoneIds.has(c.zone)) fail(`${f} ${label}: zone "${c.zone}" is not one of the exhibit's zones`);
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
if (!candidates.length) fail('no layers-cutaway exhibit files found in public/explore/ (nothing for the dive QA to check)');
if (ok) pass(`${candidates.length} dive exhibit(s) match the contract shape (${approved.length} approved: ${approved.map(a => a.data.id).join(', ') || 'none'})`);

// ---------------- REAL-ROUTE MODEL (mirrors qa-explore.mjs) ----------------
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
console.log('--- real-route check: /explore/{id} serves dive.html and every local asset resolves ---');
const templateHtml = fs.readFileSync(path.join(dir, 'public', TEMPLATE_FILE), 'utf8');
const inlineScript = [...templateHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail(TEMPLATE_FILE + ': could not extract the inline template script');
const scriptSrcs = [...templateHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...templateHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
for (const ex of candidates) {
  const base = `/explore/${ex.data.id}`;
  // the PAGE must resolve to the dive template (not the orbit template).
  const pageServed = serve(base);
  if (!pageServed || !pageServed.isHtml) fail(`${ex.data.id}: /explore/${ex.data.id} did not resolve to an HTML page`);
  else if (pageServed.body.indexOf(TEMPLATE) === -1) fail(`${ex.data.id}: /explore/${ex.data.id} did NOT resolve to ${TEMPLATE_FILE} (wrong template served — check vercel.json route order)`);
  else pass(`${ex.data.id}: /explore/${ex.data.id} serves the dive template (${TEMPLATE_FILE})`);
  // the DATA must load as JSON, not be swallowed to the HTML page.
  const jsonServed = serve(`/explore/${ex.data.id}.json`);
  if (!jsonServed || jsonServed.isHtml) fail(`${ex.data.id}: /explore/${ex.data.id}.json did NOT resolve to the JSON file through the real route`);
  else { try { const d = JSON.parse(jsonServed.body); if (!Array.isArray(d.creatures) || !d.creatures.length) fail(`${ex.data.id}: served JSON has no creatures`); else pass(`${ex.data.id}: exhibit data loads through the real route (${d.creatures.length} creatures)`); } catch (e) { fail(`${ex.data.id}: served /explore/${ex.data.id}.json is not parseable JSON`); } }
  // every local script/style the page loads must resolve to a real file.
  for (const ref of [...scriptSrcs, ...linkHrefs]) {
    const abs = resolveUrl(base, ref);
    if (abs === null) continue;
    const got = serve(abs);
    if (!got || got.isHtml) fail(`${TEMPLATE_FILE} at ${base}: asset "${ref}" resolves to ${abs} and is served the HTML page, not the file (use a root-absolute path)`);
  }
}

// ---------------- PART B: runtime check per candidate exhibit ----------------
console.log('--- runtime check: dive.html against each candidate exhibit, loaded through the real route ---');

async function runExhibit(exhibit) {
  const registry = {};
  const globalListeners = {};
  const postedMessages = [];
  const spoken = [];
  function makeEl(tag) {
    let _id = '';
    const el = {
      tagName: tag, className: '', textContent: '', innerHTML: '', disabled: false,
      onclick: null, src: '', crossOrigin: null, children: [], style: {}, dataset: {},
      scrollHeight: 60000,
      classList: {
        add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = el.classList.contains(c); const want = force === undefined ? !has : force; want ? el.classList.add(c) : el.classList.remove(c); },
        contains(c) { return el.className.split(' ').filter(Boolean).includes(c); },
      },
      appendChild(child) { el.children.push(child); return child; },
      addEventListener() {},
      removeEventListener() {},
      getContext: () => new Proxy({}, { get: () => (() => ({})) }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 460, bottom: 460, right: 720 }),
      querySelectorAll: () => [],
      clientWidth: 720, clientHeight: 460, width: 0, height: 0,
    };
    Object.defineProperty(el, 'id', { get: () => _id, set: (v) => { _id = v; if (v) registry[v] = el; } });
    return el;
  }
  ['app', 'pageTitle', 'back', 'world', 'fx', 'dark', 'sheetbg', 'cName', 'sayBtn',
    'cFact', 's1l', 's1', 's2l', 's2', 'qrow', 'depth', 'notready', 'notreadyTitle', 'notreadyMsg', 'notreadyBtn', 'pauseveil', 'toast'
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
    console, Math, Date, JSON, Array, Object,
  };
  sandbox.window = sandbox;
  sandbox.parent = fakeParent; // iframed() => true
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // load the nav helper the way the page does (root-absolute /buildable-gamenav.js).
  const navRef = scriptSrcs.find((s) => /buildable-gamenav\.js/.test(s));
  const navServed = navRef ? serve(resolveUrl(`/explore/${exhibit.data.id}`, navRef)) : null;
  if (navServed && !navServed.isHtml) { try { vm.runInContext(navServed.body, sandbox, { filename: 'buildable-gamenav.js' }); } catch (e) {} }
  vm.runInContext(inlineScript, sandbox, { filename: 'dive-inline' });
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));

  const r = { exhibit: exhibit.data.id };
  // boot rendered through the real route: app shown, world built, no fallback.
  r.bootRendered = registry.app.style.display === 'block' && registry.world.children.length > 0 && registry.notready.style.display !== 'flex';

  // every creature tappable: open() updates the fact sheet.
  r.itemChecks = [];
  for (const c of exhibit.data.creatures) {
    sandbox.open(c.id);
    const nameOk = registry.cName.textContent === c.name;
    const factOk = registry.cFact.textContent === c.fact;
    const s1Ok = registry.s1.textContent === (c.stats[0] && c.stats[0].value);
    const sheetOpen = registry.sheetbg.classList.contains('open');
    r.itemChecks.push({ id: c.id, ok: nameOk && factOk && s1Ok && sheetOpen });
  }
  // creatures-found counter reached the full roster as each was opened
  r.foundChecked = registry.foundN.textContent === String(exhibit.data.creatures.length);

  // facts cycle: a creature with >1 fact shows fact#1, then nextFact() advances.
  const multi = exhibit.data.creatures.find((c) => Array.isArray(c.facts) && c.facts.length > 1);
  if (multi) {
    sandbox.open(multi.id);
    const f0 = registry.cFact.textContent === multi.facts[0];
    sandbox.nextFact();
    const f1 = registry.cFact.textContent === multi.facts[1];
    r.factsChecked = f0 && f1;
  } else { r.factsChecked = false; }

  // read-aloud fires (factAudio clip rejects here, so it falls to the browser voice).
  sandbox.open(exhibit.data.creatures[0].id);
  spoken.length = 0;
  sandbox.readAloud();
  await new Promise((res) => setImmediate(res));
  r.readAloudChecked = spoken.length >= 1 && spoken[0].text.length > 0;

  // Session QZ1 — no quiz button while reading an exhibit.
  r.quizChecked = templateHtml.indexOf('Quick quiz') === -1 && templateHtml.indexOf('q quiz') === -1;

  // pause/resume honored (CARTRIDGE-CONTRACT.md).
  (globalListeners['message'] || []).forEach((fn) => fn({ data: { type: 'pause' } }));
  const pausedOk = registry.pauseveil.classList.contains('show');
  (globalListeners['message'] || []).forEach((fn) => fn({ data: { type: 'resume' } }));
  const resumedOk = !registry.pauseveil.classList.contains('show');
  r.pauseResumeChecked = pausedOk && resumedOk;

  // flashlight zone activates past the midnight line: darkness is 0 near the
  // surface and above the first sunlit zones, and > 0 once past the first dark zone.
  const ZH = 1500;
  const idx = exhibit.data.zones.findIndex((z) => z.dark);
  r.hasDarkZone = idx >= 0;
  if (idx >= 0) {
    const darkStart = ZH * (idx + 0.15);
    const atSurface = sandbox.darknessAt(0);
    const beforeDark = sandbox.darknessAt(darkStart - 400);
    const inDark = sandbox.darknessAt(darkStart + 650);
    r.flashlightChecked = atSurface === 0 && beforeDark === 0 && inDark > 0;
  } else { r.flashlightChecked = false; }

  // Session RP8 — the dive must never scroll sideways on a phone. Creature art
  // is sized by HEIGHT and keeps its aspect ratio, so a wide animal used to grow
  // off the right edge (the reef shark, 999x360 at artH 145, drew 400px across a
  // 390px screen and dragged the document 245px sideways). Two rules stop it,
  // and both are exercised here against a phone-width world.
  registry.world.clientWidth = 390;
  const mkImg = (nw, nh) => ({ naturalWidth: nw, naturalHeight: nh, style: {}, dataset: {} });
  // 1. art is never drawn wider than the world, and shrinks by height so the
  //    aspect ratio is untouched.
  const shark = mkImg(999, 360);
  sandbox.fitArtWidth(shark, 145);
  const sharkH = parseFloat(shark.style.height);
  const sharkW = sharkH * (999 / 360);
  const narrow = mkImg(199, 340);            // a jelly: already fits, must not be touched
  sandbox.fitArtWidth(narrow, 90);
  r.artFitChecked = sharkW <= 390 && sharkH < 145 && sharkH > 0 && parseFloat(narrow.style.height) === 90;

  // 2. a creature's centre is clamped so neither edge can leave the screen.
  const mkBtn = (cx, w) => ({ dataset: { cx: String(cx) }, offsetWidth: w, style: {} });
  const wide = mkBtn(88, 374), left = mkBtn(12, 300), ok = mkBtn(50, 60);
  [wide, left, ok].forEach((b) => sandbox.placeCreature(b));
  const edges = (b) => { const c = parseFloat(b.style.left); return [c - b.offsetWidth / 2, c + b.offsetWidth / 2]; };
  r.clampChecked = [wide, left, ok].every((b) => { const [l, rt] = edges(b); return l >= 0 && rt <= 390; });
  // an untouched creature (comfortably inside) keeps its natural anchor
  r.clampKeepsPlace = Math.round(parseFloat(ok.style.left)) === Math.round(0.5 * 390);

  // 3. art loads where the diver is, not all at once.
  r.lazyChecked = /function whenNear\(/.test(inlineScript) && inlineScript.indexOf('IntersectionObserver') !== -1
    && /whenNear\(b,/.test(inlineScript) && /whenNear\(d,/.test(inlineScript);

  return r;
}

for (const exhibit of candidates) {
  let r;
  try { r = await runExhibit(exhibit); } catch (e) { fail(`${exhibit.data.id}: threw during runtime check — ${e.message}`); continue; }
  if (!r.bootRendered) fail(`${r.exhibit}: exhibit did NOT render through the real route (data never loaded, or zones/creatures never built)`);
  else pass(`${r.exhibit}: renders through the real route — data loaded and the scene built (zones + creatures)`);
  const bad = r.itemChecks.filter((c) => !c.ok);
  if (bad.length) fail(`${r.exhibit}: creature(s) not tappable/correct: ${bad.map((b) => b.id).join(', ')}`);
  else pass(`${r.exhibit}: every creature (${r.itemChecks.length}) tappable and the fact sheet updates correctly`);
  if (!r.foundChecked) fail(`${r.exhibit}: creatures-found counter did not reach ${r.itemChecks.length} as each creature was opened`);
  else pass(`${r.exhibit}: creatures-found counter fills to ${r.itemChecks.length}/${r.itemChecks.length} as creatures are opened`);
  if (!r.factsChecked) fail(`${r.exhibit}: multiple-facts cycling failed ("Another fact")`);
  else pass(`${r.exhibit}: facts cycle via "Another fact" and the sheet updates`);
  if (!r.readAloudChecked) fail(`${r.exhibit}: read-aloud did not fire`);
  else pass(`${r.exhibit}: read-aloud fires (factAudio clip, then browser-voice fallback)`);
  if (!r.quizChecked) fail(`${r.exhibit}: a "Quick quiz" button is still in the exhibit — reading must not be interrupted by quizzes`);
  else pass(`${r.exhibit}: no quiz button while reading (Session QZ1)`);
  if (!r.pauseResumeChecked) fail(`${r.exhibit}: pause/resume from the shell was not honored`);
  else pass(`${r.exhibit}: honors pause/resume from the shell (CARTRIDGE-CONTRACT.md)`);
  if (!r.flashlightChecked) fail(`${r.exhibit}: flashlight zone did not activate correctly (dark past the midnight line, clear above it)`);
  else pass(`${r.exhibit}: flashlight zone activates past the midnight line (dark below, clear above)`);
  if (!r.artFitChecked) fail(`${r.exhibit}: wide creature art is not capped to the world width (RP8 — sideways scroll)`);
  else pass(`${r.exhibit}: wide creature art is capped to the world width, aspect ratio kept (RP8)`);
  if (!r.clampChecked) fail(`${r.exhibit}: a creature can still hang off the screen edge (RP8 — sideways scroll)`);
  else pass(`${r.exhibit}: every creature is clamped inside the screen, both edges (RP8)`);
  if (!r.clampKeepsPlace) fail(`${r.exhibit}: clamping moved a creature that already fitted`);
  else pass(`${r.exhibit}: a creature that already fits keeps its placement`);
  if (!r.lazyChecked) fail(`${r.exhibit}: zone backdrops and creatures are not lazily loaded (RP8 — load time)`);
  else pass(`${r.exhibit}: backdrops and creatures load as the diver reaches them (RP8)`);
}

// Static source checks (mirrors qa-explore.mjs): art-slot fallback, read-aloud, audio wiring.
if (inlineScript && /const SHAPES\s*=/.test(inlineScript) && /function loadCreatureArt\(/.test(inlineScript) && inlineScript.indexOf('.webp') !== -1)
  pass('art slots: real art swaps in over the drawn SVG fallback (loadCreatureArt / SHAPES)');
else fail('art-slot fallback (SHAPES + loadCreatureArt + webp) not found in source');
if (inlineScript && /function browserVoice\(/.test(inlineScript) && inlineScript.indexOf('factAudio') !== -1 && inlineScript.indexOf('/api/explore-audio') !== -1)
  pass('read-aloud: plays factAudio narration when present, falls back to the browser voice');
else fail('read-aloud factAudio + browser-voice fallback not found in source');
if (inlineScript && inlineScript.indexOf('/api/sfx?s=') !== -1 && /function startAmbient\(/.test(inlineScript) && /Feel\.tap/.test(inlineScript) && /BuildableGameNav\.register/.test(inlineScript))
  pass('audio wired: ambient bed (/api/sfx), Feel.tap tap feedback, and the shell Sound toggle');
else fail('audio wiring (ambient / Feel.tap / Sound toggle) not found in source');

if (inlineScript && /function scrollToZone\(/.test(inlineScript) && /function buildZoneJump\(/.test(inlineScript) && /function updateFound\(/.test(inlineScript))
  pass('navigation: depth-gauge zone jump + creatures-found counter present (scrollToZone / buildZoneJump / updateFound)');
else fail('depth-gauge zone jump / found counter not found in source');

// Session RP8 — the belt-and-braces guard behind the geometry: the descent is
// vertical, so a sideways scrollbar must be impossible even if new art misbehaves.
if (/html,body\{[^}]*overflow-x:hidden/.test(templateHtml) && /\.cr\{[^}]*translateX\(-50%\)/.test(templateHtml))
  pass('layout: page locked to the screen width and creatures anchored by their centre (RP8)');
else fail('RP8 layout guard missing (html,body overflow-x:hidden + .cr centre anchor)');

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
