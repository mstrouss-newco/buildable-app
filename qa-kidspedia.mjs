// Headless QA for the Kidspedia BOOKSHELF (public/kidspedia.html), born with the
// page in Session TB2 per the repo rule that a harness ships with the thing it
// guards.
//
// PART A — shelf-order contract: public/explore/bookshelf.json lists every topic
// id exactly once, and each of those ids really does route to the topic-book
// template through vercel.json's route order (before the /explore/(.*) catch-all).
//
// PART B — real-route check: /explore/kidspedia serves the bookshelf page, and
// every local asset it loads resolves to a real file.
//
// PART C — runtime (Node vm sandbox, same pattern as qa-topic.mjs): the shelf
// shows ONLY approved books, an in-review book is invisible, "My dog-ears" reads
// the kid lane of /api/saved-pages and each row deep-links straight to that page.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const dir = process.argv[2] || '.';
let ok = true;
const warns = [];
const fail = (msg) => { console.log('FAIL: ' + msg); ok = false; };
const pass = (msg) => console.log('PASS: ' + msg);
const warn = (msg) => { console.log('WARN: ' + msg); warns.push(msg); };

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
function routeDest(urlPath) {
  const clean = (urlPath || '').split('?')[0];
  for (const r of vercelRoutes) {
    if (!r.src || !r.dest) continue;
    let re; try { re = new RegExp('^' + r.src + '$'); } catch (e) { continue; }
    if (clean.match(re)) return r.dest;
  }
  return null;
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
  if (/^[a-z]+:\/\//i.test(ref)) return null;
  if (ref.startsWith('/')) return ref;
  return base.replace(/[^/]*$/, '') + ref;
}

// ---------------- PART A: the shelf order ----------------
console.log('--- bookshelf order (public/explore/bookshelf.json) ---');
const indexPath = path.join(publicDir, 'explore', 'bookshelf.json');
let index = null;
if (!fs.existsSync(indexPath)) fail('public/explore/bookshelf.json is missing — the bookshelf has no shelf order');
else {
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); }
  catch (e) { fail('bookshelf.json is not valid JSON: ' + e.message); }
}
const listed = [];
if (index) {
  if (!Array.isArray(index.shelves) || !index.shelves.length) fail('bookshelf.json: shelves must be a non-empty array');
  (index.shelves || []).forEach((s, i) => {
    if (!s || !s.title) fail(`bookshelf.json shelves[${i}]: needs a title (kids read it)`);
    if (!Array.isArray(s.books) || !s.books.length) { fail(`bookshelf.json shelves[${i}]: needs a non-empty books list`); return; }
    s.books.forEach((id) => {
      if (!/^[a-z0-9-]+$/.test(id)) fail(`bookshelf.json: "${id}" is not a plain url id`);
      if (listed.includes(id)) fail(`bookshelf.json: "${id}" is listed on more than one shelf`);
      listed.push(id);
    });
  });
  if (ok) pass(`shelf order lists ${listed.length} topic id(s) across ${index.shelves.length} shelves, no duplicates`);
  // Every listed id must reach the topic-book template, whether or not its file
  // exists yet — otherwise a book added in a later session would 404 silently.
  const misrouted = listed.filter((id) => routeDest('/explore/' + id) !== '/topic.html');
  if (misrouted.length) fail(`these listed ids do NOT route to /topic.html (the /explore/(.*) catch-all would swallow them): ${misrouted.join(', ')}`);
  else pass('every listed topic id routes to the topic-book template');
  // And every book file that exists must be on a shelf, or it is unreachable.
  const bookFiles = fs.readdirSync(path.join(publicDir, 'explore')).filter((f) => f.endsWith('.json'));
  const orphans = [];
  for (const f of bookFiles) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(publicDir, 'explore', f), 'utf8')); } catch (e) { continue; }
    if (d.template === 'topic-book' && d.id && !listed.includes(d.id)) orphans.push(d.id);
  }
  if (orphans.length) fail(`topic book(s) missing from bookshelf.json, so no kid could ever find them: ${orphans.join(', ')}`);
  else pass('every topic book in the repo has a place on a shelf');
}

// ---------------- PART B: the page and its route ----------------
console.log('--- real-route check: /explore/kidspedia serves the bookshelf ---');
const pagePath = path.join(publicDir, 'kidspedia.html');
if (!fs.existsSync(pagePath)) fail('public/kidspedia.html is missing — there is no bookshelf');
const pageHtml = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(pageHtml)) fail('kidspedia.html contains an emoji — the product rule is drawn SVG only');
if (routeDest('/explore/kidspedia') !== '/kidspedia.html') fail('/explore/kidspedia does not route to /kidspedia.html before the /explore/(.*) catch-all');
else pass('/explore/kidspedia routes to the bookshelf page');
const indexServed = serve('/explore/bookshelf.json');
if (!indexServed || indexServed.isHtml) fail('/explore/bookshelf.json is served the HTML page, not the file');
else pass('/explore/bookshelf.json loads as JSON through the real route');

const inlineScript = [...pageHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();
if (!inlineScript) fail('kidspedia.html: could not extract the inline script');
const scriptSrcs = [...pageHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
const linkHrefs = [...pageHtml.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
for (const ref of [...scriptSrcs, ...linkHrefs]) {
  const abs = resolveUrl('/explore/kidspedia', ref);
  if (abs === null) continue;
  const got = serve(abs);
  if (!got || got.isHtml) fail(`kidspedia.html: asset "${ref}" resolves to ${abs} and is served the HTML page, not the file`);
}

// ---------------- PART C: runtime ----------------
console.log('--- runtime check: the shelf, the approved gate, and My dog-ears ---');
// One book is force-approved in the stub so the shelf has something real to show;
// the others stay in-review, which is exactly the gate this check proves.
const APPROVE = 'sharks';
const EAR_BOOK = 'sharks';
// The books that must stay INVISIBLE are read from the repo, not hardcoded: as
// each book earns its photos and gets approved, this list shrinks on its own
// instead of turning into a stale failure (Session TB5).
const exploreDir = path.join(dir, 'public', 'explore');
const GATED_BOOKS = fs.readdirSync(exploreDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(exploreDir, f), 'utf8')); } catch (e) { return null; } })
  .filter((d) => d && d.template === 'topic-book' && d.status !== 'approved' && d.id !== APPROVE)
  .map((d) => d.id);

async function runShelf() {
  const registry = {};
  const apiCalls = [];
  const store = {};
  function makeEl(tag) {
    let _id = '';
    const el = {
      tagName: tag, className: '', textContent: '', innerHTML: '', style: {}, children: [], onclick: null,
      classList: {
        add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
        remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
        contains(c) { return el.className.split(' ').filter(Boolean).includes(c); },
        toggle(c, f) { const want = f === undefined ? !el.classList.contains(c) : f; want ? el.classList.add(c) : el.classList.remove(c); return want; },
      },
      appendChild(c) { el.children.push(c); return c; },
      setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, removeEventListener() {},
      querySelectorAll: () => [],
    };
    Object.defineProperty(el, 'id', { get: () => _id, set: (v) => { _id = v; if (v) registry[v] = el; } });
    return el;
  }
  ['back', 'wrap', 'empty', 'emptyBtn'].forEach((id) => { const e = makeEl('div'); e.id = id; });
  const documentStub = {
    body: makeEl('body'),
    getElementById: (id) => registry[id] || (() => { const e = makeEl('div'); e.id = id; return e; })(),
    createElement: (t) => makeEl(t),
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  const kidId = '11111111-2222-3333-4444-555555555555';
  store['bk_active_kid_v1'] = JSON.stringify({ id: kidId, display_name: 'Riley' });

  // The book we will pretend the kid dog-eared, taken from the real file so the
  // check breaks if a page id is ever renamed out from under a saved page.
  const earBook = JSON.parse(fs.readFileSync(path.join(publicDir, 'explore', EAR_BOOK + '.json'), 'utf8'));
  const earPage = earBook.pages[1];

  const sandbox = {
    document: documentStub,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { pathname: '/explore/kidspedia', search: '', href: '/explore/kidspedia' },
    history: { length: 1, back() {} },
    setTimeout: () => 0, clearTimeout() {},
    addEventListener() {}, removeEventListener() {},
    URLSearchParams,
    fetch: (url) => {
      const u = String(url);
      if (u.indexOf('/api/saved-pages') === 0) {
        apiCalls.push(u);
        return Promise.resolve({ ok: true, status: 200, json: async () => ({
          ok: true,
          pages: [
            { exhibitId: EAR_BOOK, exhibitTitle: earBook.title, pageId: earPage.id, pageTitle: earPage.title, saved: true },
            // A dog-ear in a book that is NOT approved must never reach the shelf.
            { exhibitId: 'dinosaurs', exhibitTitle: 'Dinosaurs', pageId: 'ghost-page', pageTitle: 'Hidden', saved: true },
          ],
        }) });
      }
      const got = serve(u);
      if (!got) return Promise.resolve({ ok: false, status: 404, json: async () => { throw new Error('404'); } });
      return Promise.resolve({ ok: true, status: 200, json: async () => {
        const d = JSON.parse(got.body);
        if (d && d.id === APPROVE) d.status = 'approved';   // the one live book
        return d;
      } });
    },
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Set, Promise, encodeURIComponent, decodeURIComponent,
  };
  sandbox.window = sandbox;
  sandbox.parent = sandbox;   // not iframed
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(inlineScript, sandbox, { filename: 'kidspedia-inline' });
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));

  const html = registry.wrap.innerHTML || '';
  const r = {};
  r.shelfRendered = html.indexOf('data-book="' + APPROVE + '"') !== -1;
  r.gated = GATED_BOOKS.every((id) => html.indexOf('data-book="' + id + '"') === -1);
  r.notEmpty = registry.empty.style.display !== 'flex';
  r.earPulled = apiCalls.some((u) => u.indexOf('owner=kid%3A') !== -1);
  // The dog-ear row markup is written into the #ears row inside the shelf.
  const earHtml = (registry.ears && registry.ears.innerHTML) || '';
  r.earListed = earHtml.indexOf('data-p="' + earPage.id + '"') !== -1 && earHtml.indexOf(earPage.title) !== -1
    && (registry.earsec && registry.earsec.style.display === 'block');
  r.earGated = earHtml.indexOf('ghost-page') === -1;
  // A dog-ear opens the book AT that page, coming from the shelf.
  sandbox.openBook(EAR_BOOK, earPage.id);
  r.deepLink = sandbox.location.href === '/explore/' + EAR_BOOK + '?from=shelf&page=' + earPage.id;
  return r;
}

if (inlineScript && index) {
  let r;
  try { r = await runShelf(); } catch (e) { fail('the bookshelf threw during the runtime check — ' + e.message); r = null; }
  if (r) {
    if (!r.shelfRendered || !r.notEmpty) fail('the bookshelf did not render the approved book');
    else pass('the bookshelf renders an approved book cover on its shelf');
    if (!r.gated) fail('an in-review book appeared on the bookshelf — kids must only ever see approved books');
    else if (GATED_BOOKS.length) pass(`in-review books stay hidden behind the approved gate (${GATED_BOOKS.length} still waiting: ${GATED_BOOKS.join(', ')})`);
    else pass('the approved gate holds — every topic book in the repo is approved, so nothing is being hidden');
    if (!r.earPulled) fail('the bookshelf never asked /api/saved-pages for this kid\'s dog-ears');
    else pass('My dog-ears reads the kid lane of /api/saved-pages (so saved pages follow the kid)');
    if (!r.earListed) fail('the kid\'s saved page was not listed on the My dog-ears shelf');
    else pass('My dog-ears lists the kid\'s saved page with its book');
    if (!r.earGated) fail('a dog-ear pointing at a book that is not approved reached the shelf');
    else pass('dog-ears in unapproved (or renamed) pages are dropped, never a dead link');
    if (!r.deepLink) fail('a dog-ear did not build the deep link /explore/{book}?from=shelf&page={page}');
    else pass('a dog-ear jumps straight to that page in the book');
  }
}

// Static checks the vm cannot cover.
if (inlineScript && inlineScript.indexOf('status === "approved"') !== -1) pass('approved gate present in the bookshelf source');
else fail('the bookshelf does not check status === "approved" — an unapproved book could reach a kid');
const topicHtml = fs.existsSync(path.join(publicDir, 'topic.html')) ? fs.readFileSync(path.join(publicDir, 'topic.html'), 'utf8') : '';
if (/DEEP_PAGE/.test(topicHtml) && /FROM_SHELF/.test(topicHtml)) pass('topic.html accepts ?page= deep links and remembers it came from the shelf');
else fail('topic.html has no ?page= deep link support — dog-ears could not jump to a page');

if (warns.length) console.log(`(${warns.length} warning(s) — see WARN lines above)`);
console.log(ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
