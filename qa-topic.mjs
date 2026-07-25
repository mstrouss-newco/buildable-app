// Headless QA for the Kidspedia TOPIC-BOOK template (public/topic.html) and every
// topic-book exhibit file under public/explore/*.json. Born with the template
// (Session TB1), per the repo rule that a harness is written in the same session
// as the engine it guards.
//
// PART A — contract validation: every topic-book exhibit is checked against
// EXHIBIT-MANIFEST.md's shared fields plus the topic-book fields, including the
// rule that EVERY fact carries its own source (facts must be checkable), and the
// golden rule that only status:"approved" is ever servable to a kid.
//
// PART B — real-route check: the pretty URL /explore/{id} and every local asset
// the page needs resolve to real files through vercel.json's route order (the bug
// class that blanked an exhibit on iPad). Photos are reported honestly: a missing
// photo file is a WARN, not a silent pass, because the painted fallback hides it.
//
// PART C — runtime check (Node vm sandbox, same pattern as the other qa-*.mjs):
// the book boots through the real route, pages turn, facts cycle with their
// source line, read-aloud falls back to the browser voice, the dog-ear folds and
// reaches /api/saved-pages (cross-device, not localStorage-only), the quiz button
// reaches the shell, and pause/resume from the shell is honored.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.';
let ok = true;
const warns = [];
const fail = (msg) => { console.log('FAIL: ' + msg); ok = false; };
const pass = (msg) => console.log('PASS: ' + msg);
const warn = (msg) => { console.log('WARN: ' + msg); warns.push(msg); };

// ---------------- PART A: contract validation ----------------
console.log('--- topic-book contract validation (EXHIBIT-MANIFEST.md) ---');
const exploreDir = path.join(dir, 'public', 'explore');
const files = fs.readdirSync(exploreDir).filter((f) => f.endsWith('.json'));
const approved = [];
const candidates = []; // approved + in-review — the books runtime QA should exercise
for (const f of files) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(exploreDir, f), 'utf8')); }
  catch (e) { fail(f + ' is not valid JSON: ' + e.message); continue; }
  // This QA owns the topic-book template only; other templates carry their own.
  if (data.template !== 'topic-book') continue;

  const req = ['id', 'title', 'template', 'topic', 'ageBand', 'status', 'skills', 'heroArt', 'sources', 'cover', 'pages'];
  const missing = req.filter((k) => data[k] === undefined);
  if (missing.length) { fail(f + ' missing required field(s): ' + missing.join(', ')); continue; }
  if (!['draft', 'in-review', 'approved'].includes(data.status)) fail(f + ' has invalid status "' + data.status + '"');
  if (data.id + '.json' !== f) fail(f + ': id "' + data.id + '" does not match filename');
  if (!Array.isArray(data.sources) || !data.sources.length) fail(f + ': sources must be a non-empty array (facts must be human-verified)');
  if (!data.cover || !data.cover.art) fail(f + ': cover.art is required (the book needs a cover photo)');
  if (!Array.isArray(data.pages) || data.pages.length < 4 || data.pages.length > 5)
    fail(f + `: a topic book must have 4-5 pages (got ${Array.isArray(data.pages) ? data.pages.length : 'none'})`);

  const seen = new Set();
  (data.pages || []).forEach((p, i) => {
    const label = `pages[${i}]`;
    ['id', 'title', 'art', 'facts'].forEach((k) => { if (p[k] === undefined) fail(`${f} ${label}: missing "${k}"`); });
    if (p.id) { if (seen.has(p.id)) fail(`${f} ${label}: duplicate page id "${p.id}" (dog-ears are keyed on it)`); seen.add(p.id); }
    if (!Array.isArray(p.facts) || p.facts.length < 2 || p.facts.length > 3)
      fail(`${f} ${label}: each page needs 2-3 facts (got ${Array.isArray(p.facts) ? p.facts.length : 'none'})`);
    (p.facts || []).forEach((fact, k) => {
      if (!fact || typeof fact.text !== 'string' || !fact.text.trim()) fail(`${f} ${label}.facts[${k}]: text must be a non-empty string`);
      // The whole point of the book: a grown-up can check every single fact.
      if (!fact || typeof fact.source !== 'string' || !fact.source.trim()) fail(`${f} ${label}.facts[${k}]: every fact needs its own source`);
    });
    if (p.factAudio && !/^[a-z0-9-]+$/.test(p.factAudio)) fail(`${f} ${label}: factAudio "${p.factAudio}" must be a plain id (used in /api/explore-audio?id=)`);
    if (p.factAudio && p.factAudio !== `${data.id}-${p.id}`) warn(`${f} ${label}: factAudio "${p.factAudio}" is not the conventional "{exhibitId}-{pageId}"`);
    if (typeof p.art === 'string' && !p.art.startsWith('/')) fail(`${f} ${label}: art must be a root-absolute path (a relative path is swallowed by the /explore/(.*) route)`);
  });
  if (!data.finish || !data.finish.title) warn(f + ': no finish spread title — the template will make one up');

  if (data.status === 'approved') approved.push({ file: f, data });
  if (data.status === 'approved' || data.status === 'in-review') candidates.push({ file: f, data });
}
// ---- visit-the-exhibit tie-ins (Session TB2) ----
// Some topics have (or will have) a whole Kidspedia exhibit about the same
// subject, and the book must offer a way in. This map is the memory: a book on
// this list whose exhibit ALREADY exists must carry the link, so nobody has to
// remember it when the remaining books are written. null = that exhibit has not
// been built yet, so the book only gets a reminder, never a failure.
const TIE_INS = {
  'wild-weather': 'make-it-rain',   // the Weather Lab
  'deep-ocean': 'ocean-deep',       // Journey to the Deep
  volcanoes: null,                  // planner phase VL
  rainforest: null,                 // planner phase RT
  'plants-grow': null,              // planner phase GL
  'your-body': null,                // planner phase BA
};
for (const ex of candidates) {
  const id = ex.data.id;
  const t = ex.data.exhibit;
  const want = Object.prototype.hasOwnProperty.call(TIE_INS, id) ? TIE_INS[id] : undefined;
  if (t) {
    if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) fail(`${id}: exhibit.id "${t.id}" must be a plain exhibit id`);
    else {
      const target = path.join(exploreDir, t.id + '.json');
      if (!fs.existsSync(target)) warn(`${id}: links to exhibit "${t.id}", which does not exist yet — the button stays hidden until it does`);
      else {
        let td = {}; try { td = JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) {}
        if (td.status !== 'approved') warn(`${id}: links to exhibit "${t.id}", which is "${td.status}" — the button stays hidden until it is approved`);
        else pass(`${id}: visit-the-exhibit link points at approved exhibit "${t.id}"`);
      }
    }
  }
  if (want && (!t || t.id !== want)) fail(`${id}: must carry a visit-the-exhibit link to "${want}" (that exhibit is live) — add an "exhibit" block to ${id}.json`);
  if (want === null && !t) warn(`${id}: gets a visit-the-exhibit link once its exhibit is built (planner phase pending)`);
}

if (!candidates.length) fail('no topic-book exhibits found in public/explore/ — nothing to check');
if (ok) pass(`${candidates.length} topic book(s) match the contract shape (${approved.length} approved: ${approved.map((a) => a.data.id).join(', ') || 'none — still awaiting fact-check'})`);

// ---------------- REAL-ROUTE MODEL (same model as qa-explore.mjs) ----------------
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
function routeDest(urlPath) {                 // which route WOULD win, file or not
  const clean = (urlPath || '').split('?')[0];
  for (const r of vercelRoutes) {
    if (!r.src || !r.dest) continue;
    let re; try { re = new RegExp('^' + r.src + '$'); } catch (e) { continue; }
    if (clean.match(re)) return r.dest;
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
  if (/^[a-z]+:\/\//i.test(ref)) return null;  // external (CDN) — not our route to serve
  if (ref.startsWith('/')) return ref;
  return base.replace(/[^/]*$/, '') + ref;
}

// ---------------- PART B: real-route check ----------------
console.log('--- real-route check: /explore/{id} serves the book, and its assets resolve ---');
const templatePath = path.join(dir, 'public', 'topic.html');
if (!fs.existsSync(templatePath)) { fail('public/topic.html is missing — the topic-book template does not exist'); }
const templateHtml = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
const inlineScript = [...templateHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail('topic.html: could not extract the inline template script');
if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(templateHtml)) fail('topic.html contains an emoji — the product rule is drawn SVG only');

const scriptSrcs = [...templateHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...templateHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);

for (const ex of candidates) {
  const id = ex.data.id;
  const base = `/explore/${id}`;
  // 1) the pretty URL must reach THIS template, not the orbit catch-all.
  const dest = routeDest(base);
  if (dest !== '/topic.html') fail(`${id}: /explore/${id} routes to "${dest}" — it needs its own vercel route to /topic.html BEFORE the /explore/(.*) catch-all`);
  else pass(`${id}: /explore/${id} routes to the topic-book template`);
  // 2) the exhibit DATA must load as JSON through the real route.
  const jsonServed = serve(`/explore/${id}.json`);
  if (!jsonServed || jsonServed.isHtml) fail(`${id}: /explore/${id}.json did NOT resolve to the JSON file through the real route`);
  else {
    try { const d = JSON.parse(jsonServed.body); if (!Array.isArray(d.pages) || !d.pages.length) fail(`${id}: served JSON has no pages`); else pass(`${id}: book data loads through the real route (${d.pages.length} pages)`); }
    catch (e) { fail(`${id}: served /explore/${id}.json is not parseable JSON (route served the wrong file)`); }
  }
  // 3) every local script/style the page loads must resolve to the real asset.
  for (const ref of [...scriptSrcs, ...linkHrefs]) {
    const abs = resolveUrl(base, ref);
    if (abs === null) continue;
    const got = serve(abs);
    if (!got || got.isHtml) fail(`topic.html loaded at ${base}: asset "${ref}" resolves to ${abs} and is served the HTML page, not the file (use a root-absolute path)`);
  }
  // 4) the photos. Missing art is a WARN (the painted fallback hides it), but a
  //    photo path that the ROUTES would swallow is a hard FAIL.
  const artPaths = [ex.data.cover && ex.data.cover.art, ...(ex.data.pages || []).map((p) => p.art)].filter(Boolean);
  let missing = 0;
  for (const a of artPaths) {
    const d2 = routeDest(a);
    if (!fileUnderPublic(a) && d2 && d2.indexOf('.html') !== -1) fail(`${id}: photo "${a}" would be served the HTML page by route "${d2}" — it needs a static route before the /explore/(.*) catch-all`);
    if (!fileUnderPublic(a)) missing++;
  }
  if (missing) warn(`${id}: ${missing}/${artPaths.length} photo file(s) are not in the repo yet — the book renders its painted fallback until the WebP art lands`);
  else pass(`${id}: all ${artPaths.length} photos are in the repo and resolve through the real route`);
}

// ---------------- PART C: runtime ----------------
console.log('--- runtime check: topic.html against each candidate book, through the real route ---');

async function runBook(exhibit, opts) {
  const OPTS = opts || {};
  const registry = {};
  const globalListeners = {};
  const posted = [];
  const spoken = [];
  const apiCalls = [];
  const store = {};

  function makeEl(tag) {
    let _id = '';
    const el = {
      tagName: tag, className: '', textContent: '', innerHTML: '', disabled: false, type: '',
      onclick: null, src: '', children: [], style: {}, dataset: {}, offsetWidth: 620,
      classList: {
        add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
        toggle(c, force) { const has = el.classList.contains(c); const want = force === undefined ? !has : force; want ? el.classList.add(c) : el.classList.remove(c); return want; },
        contains(c) { return el.className.split(' ').filter(Boolean).includes(c); },
      },
      appendChild(child) { el.children.push(child); return child; },
      setAttribute() {}, removeAttribute() {},
      addEventListener() {}, removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 620, height: 460 }),
    };
    Object.defineProperty(el, 'id', { get: () => _id, set: (v) => { _id = v; if (v) registry[v] = el; } });
    return el;
  }
  // Ids the static HTML shell declares.
  ['app', 'pageTitle', 'back', 'book', 'pages', 'prev', 'next', 'pagecount', 'shelfBtn', 'earCount',
    'sheetbg', 'earlist', 'earSub', 'closeSheet', 'notready', 'notreadyTitle', 'notreadyMsg',
    'notreadyBtn', 'pauseveil', 'toast'].forEach((id) => { const e = makeEl('div'); e.id = id; });

  const documentStub = {
    body: makeEl('body'),
    // Auto-registering lookup: the template builds pages with innerHTML then asks
    // for the ids inside, so the first ask creates and remembers the stub.
    getElementById: (id) => registry[id] || (() => { const e = makeEl('div'); e.id = id; return e; })(),
    createElement: (tag) => makeEl(tag),
    querySelectorAll: () => [],
    addEventListener: (t, fn) => { (globalListeners['doc:' + t] = globalListeners['doc:' + t] || []).push(fn); },
    removeEventListener() {},
  };

  const kidId = '11111111-2222-3333-4444-555555555555';
  const localStorageStub = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  // A signed-in kid: dog-ears must take the KID lane, not a device lane.
  store['bk_active_kid_v1'] = JSON.stringify({ id: kidId, display_name: 'Riley' });

  const fakeParent = { postMessage: (msg) => posted.push(msg) };
  const sandbox = {
    document: documentStub,
    localStorage: localStorageStub,
    // Narrator clips are not generated yet, so the Audio element fails — which is
    // exactly the path that must fall through to the browser voice.
    Audio: class { constructor(src) { this.src = src; setImmediate(() => { if (this.onerror) this.onerror(); }); } play() { return { catch() {} }; } pause() {} },
    speechSynthesis: { cancel() {}, speak(u) { spoken.push(u); } },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    location: { pathname: `/explore/${exhibit.data.id}`, search: OPTS.search || '', href: `/explore/${exhibit.data.id}` },
    history: { length: 1, back() {} },
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    setTimeout: (fn) => { return 0; }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
    addEventListener: (type, fn) => { (globalListeners[type] = globalListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { if (globalListeners[type]) globalListeners[type] = globalListeners[type].filter((f) => f !== fn); },
    URLSearchParams,
    fetch: (url, init) => {
      // The dog-ear API: record the call rather than hitting Supabase.
      if (String(url).indexOf('/api/saved-pages') === 0) {
        let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) {}
        apiCalls.push({ url: String(url), method: (init && init.method) || 'GET', body });
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, pages: [] }) });
      }
      const got = serve(url);
      if (!got) return Promise.resolve({ ok: false, status: 404, json: async () => { throw new Error('404'); } });
      return Promise.resolve({ ok: true, status: 200, json: async () => {
        const d = JSON.parse(got.body);
        // This harness tests the TEMPLATE, so force the status the template needs
        // to boot; PART A separately enforces that only "approved" is servable.
        if (got.file && /\/explore\/[^/]+\.json$/.test(String(url))) d.status = 'approved';
        return d;
      } });
    },
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Set, Promise, isFinite, encodeURIComponent, decodeURIComponent,
  };
  sandbox.window = sandbox;
  sandbox.parent = fakeParent;  // iframed() => true
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const navRef = scriptSrcs.find((s) => /buildable-gamenav\.js/.test(s)) || '/buildable-gamenav.js';
  const navServed = serve(resolveUrl(`/explore/${exhibit.data.id}`, navRef));
  if (navServed && !navServed.isHtml) vm.runInContext(navServed.body, sandbox, { filename: 'buildable-gamenav.js' });
  vm.runInContext(inlineScript, sandbox, { filename: 'topic-inline' });
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));

  const r = { id: exhibit.data.id };
  const pages = exhibit.data.pages || [];
  const firstPageIdx = 1; // 0 is the cover

  // Booted through the real route: title set, page 1 rendered, no fallback.
  r.booted = registry.pageTitle.textContent === exhibit.data.title
    && registry.notready.style.display !== 'flex'
    && !!registry['ft-' + firstPageIdx]
    && registry['ft-' + firstPageIdx].textContent === pages[0].facts[0].text;

  // Session TB2 — arriving from a dog-ear on the bookshelf: the book must open
  // AT that page (not the cover), and Back must return to the bookshelf.
  if (OPTS.search) {
    r.deepLanded = registry.pagecount.textContent === 'Page ' + OPTS.expectPage + ' of ' + pages.length;
    sandbox.exitToShell();
    r.backToShelf = sandbox.location.href === '/explore/kidspedia';
  }
  // The visit-the-exhibit link only draws once its target is confirmed approved.
  r.tieIn = !exhibit.data.exhibit
    || (registry['tiein-finish'] && registry['tiein-finish'].style.display === 'inline-flex'
        && registry['tiein-cover'] && registry['tiein-cover'].style.display === 'inline-flex');

  // Every page renders its fact AND its source line.
  r.pageChecks = pages.map((p, k) => {
    const i = k + 1;
    const t = registry['ft-' + i], s = registry['fs-' + i];
    return { id: p.id, ok: !!t && t.textContent === p.facts[0].text && !!s && s.textContent === 'Source: ' + p.facts[0].source };
  });

  // Turning pages moves the book and the counter.
  sandbox.turn(1);
  const afterTurn = sandbox.pageIdx === undefined ? null : null; // pageIdx is module-scoped; check the visible counter instead
  r.turned = registry.pagecount.textContent === 'Page 1 of ' + pages.length;
  sandbox.turn(1);
  r.turnedTwice = registry.pagecount.textContent === 'Page 2 of ' + pages.length;
  sandbox.goTo(firstPageIdx);

  // "Another fact" cycles the fact AND its source together.
  const p1 = pages[0];
  if (p1.facts.length > 1) {
    sandbox.cycleFact(firstPageIdx);
    r.cycled = registry['ft-' + firstPageIdx].textContent === p1.facts[1].text
      && registry['fs-' + firstPageIdx].textContent === 'Source: ' + p1.facts[1].source;
    sandbox.cycleFact(firstPageIdx); // back around to fact 0 eventually
    while (registry['ft-' + firstPageIdx].textContent !== p1.facts[0].text) sandbox.cycleFact(firstPageIdx);
  } else r.cycled = true;

  // Read-aloud: the narrator clip is missing, so it must fall through to the voice.
  sandbox.readAloud(firstPageIdx);
  for (let i = 0; i < 4; i++) await new Promise((x) => setImmediate(x));
  r.readAloud = spoken.length >= 1 && spoken[0].text.indexOf(p1.facts[0].text) !== -1;

  // Dog-ear: folds, marks the corner, mirrors locally, AND pushes to the API on
  // the KID lane so it follows the kid across devices.
  const before = apiCalls.length;
  sandbox.toggleEar(firstPageIdx);
  const foldCall = apiCalls.slice(before).find((c) => c.method === 'POST');
  r.folded = registry['ear-' + firstPageIdx].classList.contains('on');
  r.foldPushed = !!foldCall && foldCall.body && foldCall.body.saved === true
    && foldCall.body.pageId === p1.id && foldCall.body.exhibitId === exhibit.data.id;
  r.foldKidLane = !!foldCall && /^kid:/.test((foldCall.body && foldCall.body.owner) || '')
    && (foldCall.body || {}).kidProfileId === kidId;
  r.foldMirrored = Object.keys(store).some((k) => k.indexOf('bk_dogears_v1:kid:') === 0 && store[k].indexOf(p1.id) !== -1);
  // Unfolding never deletes: it pushes saved:false.
  const before2 = apiCalls.length;
  sandbox.toggleEar(firstPageIdx);
  const unfold = apiCalls.slice(before2).find((c) => c.method === 'POST');
  r.unfoldSoft = !!unfold && unfold.body && unfold.body.saved === false;
  r.unfolded = !registry['ear-' + firstPageIdx].classList.contains('on');
  sandbox.toggleEar(firstPageIdx); // leave it folded for the shelf check

  // The dog-ear shelf lists the folded page.
  sandbox.openShelf();
  r.shelfListed = registry.sheetbg.classList.contains('open') && registry.earlist.children.length >= 1;
  sandbox.closeShelf();

  // A GET pulled the kid's saved pages on boot (cross-device, not local-only).
  r.pulled = apiCalls.some((c) => c.method === 'GET' && c.url.indexOf('owner=kid%3A') !== -1);

  // Quiz reaches the shell.
  sandbox.requestQuiz({ title: p1.title, quiz: p1.quiz || [] });
  const q = posted.find((m) => m && m.kind === 'quizRequest');
  r.quiz = !!q && q.exhibitId === exhibit.data.id && q.itemName === p1.title;

  // Pause/resume from the shell (CARTRIDGE-CONTRACT.md).
  (globalListeners.message || []).forEach((fn) => fn({ data: 'pause' }));
  const pausedVeil = registry.pauseveil.classList.contains('show');
  const counterBefore = registry.pagecount.textContent;
  sandbox.turn(1); // must be ignored while paused
  const frozen = registry.pagecount.textContent === counterBefore;
  (globalListeners.message || []).forEach((fn) => fn({ data: 'resume' }));
  r.pauseResume = pausedVeil && frozen && !registry.pauseveil.classList.contains('show');

  r.navRegistered = !!(sandbox.BuildableGameNav && sandbox.BuildableGameNav._registered !== undefined) || typeof sandbox.BuildableGameNav === 'object';
  return r;
}

for (const ex of candidates) {
  let r;
  try { r = await runBook(ex); } catch (e) { fail(`${ex.data.id}: threw during the runtime check — ${e.message}`); continue; }
  if (!r.booted) fail(`${r.id}: the book did NOT render through the real route (data never loaded, or the pages never built)`);
  else pass(`${r.id}: renders through the real route — cover plus ${(ex.data.pages || []).length} pages built`);
  const bad = r.pageChecks.filter((c) => !c.ok);
  if (bad.length) fail(`${r.id}: page(s) missing their fact or source line: ${bad.map((b) => b.id).join(', ')}`);
  else pass(`${r.id}: every page shows its fact with a visible source line`);
  if (!r.turned || !r.turnedTwice) fail(`${r.id}: page turning did not advance the book`);
  else pass(`${r.id}: pages turn forward and the page counter follows`);
  if (!r.cycled) fail(`${r.id}: "Another fact" did not cycle the fact and its source together`);
  else pass(`${r.id}: "Another fact" cycles fact and source together`);
  if (!r.readAloud) fail(`${r.id}: read-aloud did not fall back to the browser voice when the narrator clip is missing`);
  else pass(`${r.id}: read-aloud plays, falling back to the browser voice with no waiting`);
  if (!r.folded || !r.unfolded) fail(`${r.id}: the dog-ear corner did not fold/unfold`);
  else pass(`${r.id}: the corner folds and unfolds`);
  if (!r.foldPushed) fail(`${r.id}: folding a corner never reached /api/saved-pages — dog-ears would be local-only`);
  else pass(`${r.id}: folding a corner saves through /api/saved-pages`);
  if (!r.foldKidLane) fail(`${r.id}: the dog-ear was not saved on the kid lane (owner "kid:<id>") — it would not follow the kid across devices`);
  else pass(`${r.id}: dog-ears save on the kid lane, so they follow the kid across devices`);
  if (!r.foldMirrored) fail(`${r.id}: no local mirror written — the fold would not survive an offline reload`);
  else pass(`${r.id}: a local mirror is written so the fold is instant and works offline`);
  if (!r.unfoldSoft) fail(`${r.id}: unfolding did not push saved:false (it must never delete a row)`);
  else pass(`${r.id}: unfolding flips saved:false, never a delete`);
  if (!r.pulled) fail(`${r.id}: the book never asked the server for this kid's saved pages on open`);
  else pass(`${r.id}: on open, the book pulls this kid's saved pages from the server`);
  if (!r.shelfListed) fail(`${r.id}: the "My dog-ears" shelf did not list the folded page`);
  else pass(`${r.id}: the "My dog-ears" shelf lists folded pages and jumps back to them`);
  if (!r.quiz) fail(`${r.id}: the quiz button did not reach the shell (quizRequest)`);
  else pass(`${r.id}: "Quick quiz" opens the shell's quizRequest bridge`);
  if (!r.pauseResume) fail(`${r.id}: pause/resume from the shell was not honored (the book kept turning)`);
  else pass(`${r.id}: honors pause/resume from the shell (CARTRIDGE-CONTRACT.md)`);
  if (!r.tieIn) fail(`${r.id}: the visit-the-exhibit link never appeared even though its exhibit is approved`);
  else if (ex.data.exhibit) pass(`${r.id}: the visit-the-exhibit button appears on the cover and the last page`);
}

// ---- Session TB2: opening a book straight at a dog-eared page ----
{
  const ex = candidates[0];
  const target = (ex.data.pages || [])[1];
  if (!target) fail('the first book has no second page to deep-link to');
  else {
    let r;
    try { r = await runBook(ex, { search: `?page=${target.id}&from=shelf`, expectPage: 2 }); }
    catch (e) { fail(`${ex.data.id}: threw on the dog-ear deep link — ${e.message}`); r = null; }
    if (r) {
      if (!r.deepLanded) fail(`${ex.data.id}: /explore/${ex.data.id}?page=${target.id} did not open at that page`);
      else pass(`${ex.data.id}: a dog-ear link opens the book straight at the saved page`);
      if (!r.backToShelf) fail(`${ex.data.id}: coming from the bookshelf, Back did not return to the bookshelf`);
      else pass(`${ex.data.id}: arriving from the bookshelf, Back returns to the bookshelf`);
    }
  }
}

// Static source checks for paths the vm cannot flip mid-run.
if (inlineScript && /function browserVoice\(/.test(inlineScript) && inlineScript.indexOf('factAudio') !== -1 && inlineScript.indexOf('/api/explore-audio') !== -1)
  pass('read-aloud: plays the factAudio narrator clip when present, browser voice otherwise');
else fail('read-aloud factAudio + browser-voice fallback not found in topic.html');
if (inlineScript && /BuildableGameNav\.register/.test(inlineScript) && inlineScript.indexOf('/api/sfx?s=') !== -1 && /Feel\.tap/.test(inlineScript))
  pass('audio wired: ambient bed (/api/sfx), Feel.tap page-turn feedback, and the shell Sound toggle');
else fail('audio wiring (ambient / Feel.tap / BuildableGameNav) not found in topic.html');
if (inlineScript && inlineScript.indexOf('status !== "approved"') !== -1)
  pass('approved gate present: a book that is not approved shows the not-ready screen');
else fail('approved gate missing from topic.html — an unapproved book could reach a kid');

// The API and its table must exist, or the dog-ear promise is a lie.
if (fs.existsSync(path.join(dir, 'api', 'saved-pages.js'))) pass('api/saved-pages.js exists (the dog-ear endpoint)');
else fail('api/saved-pages.js is missing — dog-ears cannot follow a kid across devices');
const sqlPath = path.join(dir, 'db', 'create-saved-pages.sql');
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (/create table if not exists saved_pages/i.test(sql) && /unique \(owner_key, exhibit_id, page_id\)/i.test(sql)) pass('db/create-saved-pages.sql exists and is idempotent with the right uniqueness');
  else fail('db/create-saved-pages.sql does not create saved_pages idempotently with the (owner, exhibit, page) uniqueness');
} else fail('db/create-saved-pages.sql is missing — the dog-ear table has no migration');

if (warns.length) console.log(`(${warns.length} warning(s) — see WARN lines above)`);
console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
