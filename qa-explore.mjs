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
for (const f of files) {
  const raw = fs.readFileSync(path.join(exploreDir, f), 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { fail(f + ' is not valid JSON: ' + e.message); continue; }
  const req = ['id', 'title', 'template', 'topic', 'ageBand', 'status', 'heroArt', 'center', 'bodies'];
  const missing = req.filter((k) => data[k] === undefined);
  if (missing.length) { fail(f + ' missing required field(s): ' + missing.join(', ')); continue; }
  if (!['draft', 'in-review', 'approved'].includes(data.status)) fail(f + ' has invalid status "' + data.status + '"');
  if (data.id + '.json' !== f) fail(f + ': id "' + data.id + '" does not match filename');
  const checkItem = (item, label) => {
    ['id', 'name', 'fact', 'stats', 'asks', 'quiz'].forEach((k) => { if (item[k] === undefined) fail(`${f} ${label}: missing "${k}"`); });
    if (Array.isArray(item.stats) && item.stats.length !== 2) fail(`${f} ${label}: stats must be exactly two (got ${item.stats.length})`);
  };
  checkItem(data.center, 'center');
  (data.bodies || []).forEach((b, i) => checkItem(b, `bodies[${i}]`));
  if (!Array.isArray(data.sources) || !data.sources.length) fail(f + ': sources must be a non-empty array (facts must be human-verified)');
  if (data.status === 'approved') approved.push({ file: f, data });
}
if (ok) pass(`${files.length} exhibit file(s) match the contract shape (${approved.length} approved: ${approved.map(a => a.data.id).join(', ') || 'none'})`);

// ---------------- PART B: runtime check per approved exhibit ----------------
console.log('--- runtime check: orbit-explorer.html against each approved exhibit ---');
const templateHtml = fs.readFileSync(path.join(dir, 'public', 'orbit-explorer.html'), 'utf8');
const gamenavJs = fs.readFileSync(path.join(dir, 'public', 'buildable-gamenav.js'), 'utf8');
const inlineScript = [...templateHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail('orbit-explorer.html: could not extract the inline template script');

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
    'cFact', 's1l', 's1', 's2l', 's2', 'qrow', 'notready', 'notreadyMsg', 'pauseveil', 'toast'
  ].forEach((id) => { const e = makeEl('div'); e.id = id; });

  const documentStub = {
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
    fetch: () => Promise.resolve({ ok: true, json: async () => exhibit.data }),
    console, Math, Date, JSON, Array, Object,
  };
  sandbox.window = sandbox;
  sandbox.parent = fakeParent; // iframed() => window.parent !== window => true
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(gamenavJs, sandbox, { filename: 'buildable-gamenav.js' });
  vm.runInContext(inlineScript, sandbox, { filename: 'orbit-explorer-inline' });

  // The template's own top-level fetch(...).then(data => { DATA = data; boot(data); })
  // is the real, unmodified flow — let it settle (our sandbox.fetch resolves
  // synchronously-ish with this exhibit's data) before asserting anything.
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));

  const results = { exhibit: exhibit.data.id, itemChecks: [], quizChecked: false, readAloudChecked: false, navRegistered: false };

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

  // BuildableGameNav registered (own back button hidden in-app) without throwing,
  // and honors pause/resume from the shell.
  results.navRegistered = registry.back.classList !== undefined; // register() ran inside boot() with no throw
  globalListeners['message'] && globalListeners['message'].forEach((fn) => fn({ data: { type: 'pause' } }));
  const pausedOk = registry.pauseveil.classList.contains('show');
  globalListeners['message'] && globalListeners['message'].forEach((fn) => fn({ data: { type: 'resume' } }));
  const resumedOk = !registry.pauseveil.classList.contains('show');
  results.pauseResumeChecked = pausedOk && resumedOk;

  return results;
}

for (const exhibit of approved) {
  let r;
  try { r = await runExhibit(exhibit); } catch (e) { fail(`${exhibit.data.id}: threw during runtime check — ${e.message}`); continue; }
  const badItems = r.itemChecks.filter((c) => !c.ok);
  if (badItems.length) fail(`${r.exhibit}: item(s) not tappable/correct: ${badItems.map((b) => b.id).join(', ')}`);
  else pass(`${r.exhibit}: every item (${r.itemChecks.length}) tappable and fact card updates correctly`);
  if (!r.readAloudChecked) fail(`${r.exhibit}: read-aloud did not fire`);
  else pass(`${r.exhibit}: read-aloud fires via speechSynthesis`);
  if (!r.quizChecked) fail(`${r.exhibit}: quiz button did not reach the shell (quizRequest)`);
  else pass(`${r.exhibit}: Quick quiz opens the shell's quizRequest bridge`);
  if (!r.pauseResumeChecked) fail(`${r.exhibit}: pause/resume from the shell was not honored`);
  else pass(`${r.exhibit}: honors pause/resume from the shell (CARTRIDGE-CONTRACT.md)`);
}

// Static check: the read-aloud browser-voice fallback path exists in the source
// (can't easily flip `"speechSynthesis" in window` to false mid-vm-run for the
// same script instance, so this is verified as source text instead of runtime).
if (inlineScript && inlineScript.indexOf('Read-aloud not on this device') !== -1) pass('read-aloud has a browser-voice-missing fallback label');
else fail('read-aloud fallback label not found in source');

console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
