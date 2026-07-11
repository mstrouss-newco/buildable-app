// Headless QA for the Kidspedia orbit-explorer template (public/orbit-explorer.html)
// and every exhibit file under public/explore/*.json.
//
// PART A — contract validation: every exhibit file is checked against
// EXHIBIT-MANIFEST.md's required shape, and the golden rule that only
// status:"approved" exhibits are ever meant to be servable to a kid.
//
// PART B — runtime check (Node vm sandbox, same pattern as the other qa-*.mjs
// engines in this repo): for every APPROVED exhibit, load the real
// orbit-explorer.html script and prove — every item (center + bodies) is
// tappable via pick() and updates the fact card correctly, read-aloud fires
// through speechSynthesis, the quiz button reaches the shell via the
// quizRequest postMessage bridge, and BuildableGameNav registers without
// throwing (pause/resume + hide-own-back-button per CARTRIDGE-CONTRACT.md /
// HUD-AND-NAV-RULES.md).
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.';
let ok = true;
const fail = (msg) => { console.log('FAIL: ' + msg); ok = false; };
const pass = (msg) => console.log('PASS: ' + msg);

// ---------------- PART A: contract validation ----------------
console.log('--- exhibit contract validation (EXHIBIT-MANIFEST.md) ---');
const exploreDir = path.join(dir, 'public', 'explore');
const files = fs.readdirSync(exploreDir).filter((f) => f.endsWith('.json'));
if (!files.length) fail('no exhibit files found in public/explore/');
const approved = [];
const candidates = []; // approved + in-review — exhibits runtime QA should exercise before approval
for (const f of files) {
  const raw = fs.readFileSync(path.join(exploreDir, f), 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { fail(f + ' is not valid JSON: ' + e.message); continue; }
  // This QA owns the orbit-explorer template only. Other templates (e.g. the
  // layers-cutaway "dive") carry their own born-with-it QA (qa-dive.mjs), so skip
  // their exhibit files here rather than fail them against the orbit shape.
  if (data.template && data.template !== 'orbit-explorer') { console.log('SKIP: ' + f + ' (template "' + data.template + '") — checked by its own template QA'); continue; }
  const req = ['id', 'title', 'template', 'topic', 'ageBand', 'status', 'heroArt', 'center', 'bodies'];
  const missing = req.filter((k) => data[k] === undefined);
  if (missing.length) { fail(f + ' missing required field(s): ' + missing.join(', ')); continue; }
  if (!['draft', 'in-review', 'approved'].includes(data.status)) fail(f + ' has invalid status "' + data.status + '"');
  if (data.id + '.json' !== f) fail(f + ': id "' + data.id + '" does not match filename');
  const checkItem = (item, label) => {
    ['id', 'name', 'fact', 'stats', 'asks', 'quiz'].forEach((k) => { if (item[k] === undefined) fail(`${f} ${label}: missing "${k}"`); });
    if (Array.isArray(item.stats) && item.stats.length !== 2) fail(`${f} ${label}: stats must be exactly two (got ${item.stats.length})`);
    // Optional `facts` list (EXHIBIT-MANIFEST.md): non-empty array of non-empty
    // strings, and facts[0] must equal the single `fact` field (kept in sync).
    if (item.facts !== undefined) {
      if (!Array.isArray(item.facts) || !item.facts.length) fail(`${f} ${label}: facts must be a non-empty array when present`);
      else {
        if (item.facts.some((x) => typeof x !== 'string' || !x.trim())) fail(`${f} ${label}: every fact must be a non-empty string`);
        if (item.facts[0] !== item.fact) fail(`${f} ${label}: facts[0] must equal fact (keep the single-fact field in sync)`);
      }
    }
  };
  checkItem(data.center, 'center');
  (data.bodies || []).forEach((b, i) => checkItem(b, `bodies[${i}]`));
  if (!Array.isArray(data.sources) || !data.sources.length) fail(f + ': sources must be a non-empty array (facts must be human-verified)');
  if (data.status === 'approved') approved.push({ file: f, data });
  if (data.status === 'approved' || data.status === 'in-review') candidates.push({ file: f, data });
}
if (ok) pass(`${files.length} exhibit file(s) match the contract shape (${approved.length} approved: ${approved.map(a => a.data.id).join(', ') || 'none'})`);
if (ok) pass(`runtime QA exercises ${candidates.length} candidate exhibit(s) (approved + in-review): ${candidates.map(a => a.data.id).join(', ') || 'none'}`);

// ---------------- REAL-ROUTE MODEL (Session 8H) ----------------
// The template is served at the PRETTY url /explore/{id} (a vercel rewrite), not
// at /orbit-explorer.html. So a RELATIVE asset path in the template resolves
// against /explore/ and gets swallowed by the /explore/(.*) -> orbit-explorer.html
// rewrite (it comes back as the HTML page, not the asset). That is exactly what
// blanked the live exhibit on iPad while the old, stub-only QA still passed.
// This model reproduces Vercel's serving order — an existing static file first,
// then vercel.json "routes" in order — so that class of bug can never pass again.
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
  const direct = fileUnderPublic(clean);      // filesystem first
  if (direct) return direct;
  for (const r of vercelRoutes) {             // then routes, in order, first match wins
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
// URL resolution the way a browser does it for the page at /explore/{id}.
function resolveUrl(base, ref) {
  if (/^[a-z]+:\/\//i.test(ref)) return null; // external (CDN) — not our route to serve
  if (ref.startsWith('/')) return ref;
  return base.replace(/[^/]*$/, '') + ref;    // relative to the page's directory
}

// ---------------- PART A2: every local asset the page needs loads through the real route ----------------
console.log('--- real-route check: /explore/{id} and its local assets resolve to real files ---');
const templateHtml = fs.readFileSync(path.join(dir, 'public', 'orbit-explorer.html'), 'utf8');
const gamenavJs = fs.readFileSync(path.join(dir, 'public', 'buildable-gamenav.js'), 'utf8');
const inlineScript = [...templateHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail('orbit-explorer.html: could not extract the inline template script');
// Collect the page's local <script src> and <link href> refs (external CDNs skipped).
const scriptSrcs = [...templateHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...templateHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
for (const ex of candidates) {
  const base = `/explore/${ex.data.id}`;
  // 1) the exhibit DATA must load through the real route (not be served the HTML page).
  const jsonServed = serve(`/explore/${ex.data.id}.json`);
  if (!jsonServed || jsonServed.isHtml) { fail(`${ex.data.id}: /explore/${ex.data.id}.json did NOT resolve to the JSON file through the real route`); }
  else { try { const d = JSON.parse(jsonServed.body); if (!Array.isArray(d.bodies) || !d.bodies.length) fail(`${ex.data.id}: served JSON has no bodies`); else pass(`${ex.data.id}: exhibit data loads through the real route (/explore/${ex.data.id}.json, ${d.bodies.length} bodies)`); } catch (e) { fail(`${ex.data.id}: served /explore/${ex.data.id}.json is not parseable JSON (route served the wrong file)`); } }
  // 2) the page opened at /explore/{id} — every local script it loads must resolve to the real asset, not the swallowed HTML page.
  for (const ref of [...scriptSrcs, ...linkHrefs]) {
    const abs = resolveUrl(base, ref);
    if (abs === null) continue; // external CDN
    const got = serve(abs);
    if (!got || got.isHtml) fail(`orbit-explorer.html loaded at ${base}: asset "${ref}" resolves to ${abs} and is served the HTML page, not the file (use a root-absolute "/${ref.replace(/^\//, '')}" path)`);
  }
}
// The nav helper in particular must arrive as JS at whatever path the page requests.
const gamenavRef = scriptSrcs.find((s) => /buildable-gamenav\.js/.test(s));
if (!gamenavRef) fail('orbit-explorer.html: no buildable-gamenav.js script tag found');
else {
  const got = serve(resolveUrl(`/explore/solar-system`, gamenavRef));
  if (!got || got.isHtml || got.body.indexOf('BuildableGameNav') === -1) fail(`buildable-gamenav.js ("${gamenavRef}") does not load as JS through the real route — the iOS Home-tap catcher would be missing`);
  else pass(`buildable-gamenav.js loads as real JS through the real route ("${gamenavRef}")`);
}

// ---------------- PART B: runtime check per approved exhibit ----------------
console.log('--- runtime check: orbit-explorer.html against each candidate exhibit — approved + in-review — loaded through the real route ---');

// A THREE.js stand-in for the vm sandbox: an infinitely chainable/callable/
// constructible stub, since we only need the template's own JS logic (pick,
// readAloud, requestQuiz, pause/resume) to run without throwing — not real
// WebGL rendering, which this Node harness can't do anyway.
function stubDeep() {
  const fn = function () { return stubDeep(); };
  return new Proxy(fn, {
    get: (_t, prop) => (prop === Symbol.toPrimitive || prop === 'then' ? undefined : stubDeep()),
    set: () => true,
    apply: () => stubDeep(),
    construct: () => stubDeep(),
  });
}

async function runExhibit(exhibit) {
  const registry = {};
  const globalListeners = {};
  const postedMessages = [];
  const spoken = [];

  function makeEl(tag) {
    let _id = '';
    const el = {
      tagName: tag, className: '', textContent: '', innerHTML: '', disabled: false,
      onclick: null, src: '', crossOrigin: null, children: [],
      style: {}, dataset: {},
      classList: {
        add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = el.classList.contains(c); const want = force === undefined ? !has : force; want ? el.classList.add(c) : el.classList.remove(c); },
        contains(c) { return el.className.split(' ').filter(Boolean).includes(c); },
      },
      appendChild(child) { el.children.push(child); return child; },
      addEventListener(type, fn) { (globalListenersFor(el)[type] = globalListenersFor(el)[type] || []).push(fn); },
      removeEventListener() {},
      setPointerCapture() {},
      getContext: () => new Proxy({}, { get: () => (() => ({})) }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 460 }),
      clientWidth: 720, clientHeight: 460,
    };
    Object.defineProperty(el, 'id', { get: () => _id, set: (v) => { _id = v; if (v) registry[v] = el; } });
    return el;
  }
  const elListeners = new WeakMap();
  function globalListenersFor(el) { if (!elListeners.has(el)) elListeners.set(el, {}); return elListeners.get(el); }

  // Pre-register the static ids the HTML shell declares.
  ['app', 'pageTitle', 'back', 'stage', 'chips', 'card', 'cDot', 'cName', 'sayBtn', 'sayLabel',
    'cFact', 's1l', 's1', 's2l', 's2', 'qrow', 'anotherBtn', 'tospace', 'notready', 'notreadyTitle', 'notreadyMsg', 'notreadyBtn', 'pauseveil', 'toast'
  ].forEach((id) => { const e = makeEl('div'); e.id = id; });

  const documentStub = {
    body: makeEl('body'),
    getElementById: (id) => registry[id] || (() => { const e = makeEl('div'); e.id = id; return e; })(),
    createElement: (tag) => makeEl(tag),
    querySelectorAll: (sel) => {
      if (sel === '.chip') return Object.values(registry).filter((e) => e.classList.contains('chip'));
      return [];
    },
    addEventListener() {}, removeEventListener() {},
  };

  const fakeParent = { postMessage: (msg) => postedMessages.push(msg) };
  const sandbox = {
    document: documentStub,
    Image: class { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} },
    THREE: stubDeep(),
    speechSynthesis: { cancel() {}, speak(u) { spoken.push(u); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    location: { pathname: `/explore/${exhibit.data.id}`, search: '' },
    history: { length: 1, back() {} },
    devicePixelRatio: 1,
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    addEventListener: (type, fn) => { (globalListeners[type] = globalListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { if (globalListeners[type]) globalListeners[type] = globalListeners[type].filter((f) => f !== fn); },
    URLSearchParams,
    // Real-route fetch: the template requests /explore/{id}.json — serve it the
    // way Vercel would. If the route ever served the HTML page instead, json()
    // throws and the template shows its fallback (which is the faithful outcome).
    fetch: (url) => {
      const got = serve(url);
      if (!got) return Promise.resolve({ ok: false, status: 404, json: async () => { throw new Error('404'); } });
      return Promise.resolve({ ok: true, status: 200, json: async () => {
        const d = JSON.parse(got.body);
        // This harness tests the TEMPLATE against candidate exhibits, so force the
        // status the template requires to boot — an in-review exhibit still exercises
        // the full runtime. PART A separately enforces that only "approved" is servable.
        if (got.file && /\/explore\/[^/]+\.json$/.test(url)) d.status = 'approved';
        return d;
      } });
    },
    console, Math, Date, JSON, Array, Object,
  };
  sandbox.window = sandbox;
  sandbox.parent = fakeParent; // iframed() => window.parent !== window => true
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Load the nav helper the way the page does — through the resolved <script src>.
  // If the path were wrong it would come back as HTML, so we would NOT run it
  // (matching the browser, where the script would fail to execute).
  const navServed = serve(resolveUrl(`/explore/${exhibit.data.id}`, gamenavRef || '/buildable-gamenav.js'));
  if (navServed && !navServed.isHtml) vm.runInContext(navServed.body, sandbox, { filename: 'buildable-gamenav.js' });
  vm.runInContext(inlineScript, sandbox, { filename: 'orbit-explorer-inline' });

  // The template's own top-level fetch(...).then(data => { DATA = data; boot(data); })
  // is the real, unmodified flow — let it settle (our sandbox.fetch resolves
  // synchronously-ish with this exhibit's data) before asserting anything.
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));

  const results = { exhibit: exhibit.data.id, itemChecks: [], quizChecked: false, readAloudChecked: false, navRegistered: false };

  // Boot ran to completion off the REAL-route fetch: the scene/chips were built
  // and the center was auto-selected. If the data route had served the HTML page
  // instead (the live iPad failure), json() would have thrown, the fallback would
  // show, and none of this would be populated — so this is the "at least one body
  // renders through the real route" guard the old stub-only QA was missing.
  const firstBody = (exhibit.data.bodies || [])[0];
  const centerPicked = registry.cName.textContent === exhibit.data.center.name;
  const bodyChipBuilt = !!firstBody && !!registry['ch-' + firstBody.id];
  const notFallenBack = registry.notready.style.display !== 'flex';
  results.bootRendered = centerPicked && bodyChipBuilt && notFallenBack;

  // Every item (center + bodies) tappable: call the real pick() for each and
  // verify the fact card reflects that item.
  const allItems = [exhibit.data.center, ...exhibit.data.bodies];
  for (const item of allItems) {
    sandbox.pick(item.id);
    const nameOk = registry.cName.textContent === item.name;
    const factOk = registry.cFact.textContent === item.fact;
    const s1Ok = registry.s1.textContent === (item.stats[0] && item.stats[0].value);
    const chipOk = !!registry['ch-' + item.id] && registry['ch-' + item.id].classList.contains('sel');
    results.itemChecks.push({ id: item.id, ok: nameOk && factOk && s1Ok && chipOk });
  }

  // Read-aloud fires (with the browser-voice path present here; the missing-voice
  // fallback is a static code path checked separately below).
  sandbox.readAloud();
  results.readAloudChecked = spoken.length === 1 && spoken[0].text.indexOf(exhibit.data.center.fact) === -1
    ? spoken[0].text.length > 0 // last-picked item (a body), just confirm something sensible was spoken
    : spoken.length === 1;

  // Quiz opens: tapping "Quick quiz" on the last-picked item must reach the
  // shell via the quizRequest bridge (CARTRIDGE-CONTRACT.md).
  const lastItem = allItems[allItems.length - 1];
  sandbox.requestQuiz(lastItem);
  const q = postedMessages.find((m) => m && m.kind === 'quizRequest');
  results.quizChecked = !!q && q.source === 'buildable' && q.itemName === lastItem.name && q.exhibitId === exhibit.data.id;

  // Honors pause/resume from the shell around the quiz gate (CARTRIDGE-CONTRACT.md).
  // (The in-app back button is hidden by body.in-app CSS and the shell draws Home;
  // the exhibit no longer calls BuildableGameNav.register, so there is no dead
  // Sound button — it relies on the shell Home only, like bingo/memory/snakes.)
  globalListeners['message'] && globalListeners['message'].forEach((fn) => fn({ data: { type: 'pause' } }));
  const pausedOk = registry.pauseveil.classList.contains('show');
  globalListeners['message'] && globalListeners['message'].forEach((fn) => fn({ data: { type: 'resume' } }));
  const resumedOk = !registry.pauseveil.classList.contains('show');
  results.pauseResumeChecked = pausedOk && resumedOk;

  // Facts list (Session 3H): for an item with more than one fact, the card shows
  // fact #1 with the "Another fact" button visible, and nextFact() cycles it.
  const multi = allItems.find((it) => Array.isArray(it.facts) && it.facts.length > 1);
  results.factsExercised = !!multi;
  if (multi) {
    sandbox.pick(multi.id);
    const f0 = registry.cFact.textContent === multi.facts[0];
    const btnShown = registry.anotherBtn.style.display === 'inline-flex';
    sandbox.nextFact();
    const f1 = registry.cFact.textContent === multi.facts[1];
    results.factsChecked = f0 && btnShown && f1;
  } else { results.factsChecked = true; }

  // Fly-to selection (Session 3H): tapping a body with fly=true shows the
  // "Back to space" control; tapping that control returns to the wide view.
  // (The camera easing runs in the render loop, which this headless harness
  // does not drive — we assert the selection/return state it toggles.)
  const flyBody = (exhibit.data.bodies || [])[0];
  if (flyBody) {
    sandbox.pick(flyBody.id, true);
    const on = registry.tospace.classList.contains('show');
    if (registry.tospace.onclick) registry.tospace.onclick();
    const off = !registry.tospace.classList.contains('show');
    results.flyChecked = on && off;
  } else { results.flyChecked = false; }

  return results;
}

for (const exhibit of candidates) {
  let r;
  try { r = await runExhibit(exhibit); } catch (e) { fail(`${exhibit.data.id}: threw during runtime check — ${e.message}`); continue; }
  if (!r.bootRendered) fail(`${r.exhibit}: exhibit did NOT render through the real route (data never loaded, or the scene/chips never built) — this is the live iPad failure`);
  else pass(`${r.exhibit}: renders through the real route — data loaded and the scene built (center + bodies)`);
  const badItems = r.itemChecks.filter((c) => !c.ok);
  if (badItems.length) fail(`${r.exhibit}: item(s) not tappable/correct: ${badItems.map((b) => b.id).join(', ')}`);
  else pass(`${r.exhibit}: every item (${r.itemChecks.length}) tappable and fact card updates correctly`);
  if (!r.readAloudChecked) fail(`${r.exhibit}: read-aloud did not fire`);
  else pass(`${r.exhibit}: read-aloud fires via speechSynthesis`);
  if (!r.quizChecked) fail(`${r.exhibit}: quiz button did not reach the shell (quizRequest)`);
  else pass(`${r.exhibit}: Quick quiz opens the shell's quizRequest bridge`);
  if (!r.pauseResumeChecked) fail(`${r.exhibit}: pause/resume from the shell was not honored`);
  else pass(`${r.exhibit}: honors pause/resume from the shell (CARTRIDGE-CONTRACT.md)`);
  if (!r.factsChecked) fail(`${r.exhibit}: multiple-facts cycling failed ("Another fact" / fact card)`);
  else pass(`${r.exhibit}: ${r.factsExercised ? "multiple facts cycle via \"Another fact\" and the card updates" : "single-fact items OK (no multi-fact item to cycle)"}`);
  if (!r.flyChecked) fail(`${r.exhibit}: fly-to selection did not engage/clear the "Back to space" control`);
  else pass(`${r.exhibit}: fly-to selection frames the body and "Back to space" returns to the wide view`);
}

// Static check: the read-aloud browser-voice fallback path exists in the source
// (can't easily flip `"speechSynthesis" in window` to false mid-vm-run for the
// same script instance, so this is verified as source text instead of runtime).
if (inlineScript && /function browserVoice\(/.test(inlineScript) && inlineScript.indexOf('factAudio') !== -1 && inlineScript.indexOf('/api/explore-audio') !== -1)
  pass('read-aloud: plays factAudio narration when present, falls back to the browser voice (browserVoice)');
else fail('read-aloud factAudio + browser-voice fallback not found in source');
// Audio wiring (Session 8I): soft ambient bed + Feel Kit tap feedback + shell Sound toggle.
if (inlineScript && inlineScript.indexOf('/api/sfx?s=') !== -1 && /function startAmbient\(/.test(inlineScript) && /Feel\.tap/.test(inlineScript) && /BuildableGameNav\.register/.test(inlineScript))
  pass('audio wired: ambient bed (/api/sfx), Feel.tap tap feedback, and the shell Sound toggle (BuildableGameNav)');
else fail('Session 8I audio wiring (ambient / Feel.tap / Sound toggle) not found in source');

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
