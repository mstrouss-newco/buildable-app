// HD1 HUD GATE — every game page, at every size, with the shell's real chrome
// drawn around it, MEASURED.
//
// The bug this exists to stop is the one qa-skyflyer-hud.mjs caught for exactly
// one game: the shell draws Home and a row of buttons OVER the game's iframe, and
// a game that keeps drawing its own chips in that band ends up UNDERNEATH a
// control the kid cannot see. Nothing in the engine or in the shell is wrong on
// its own — the collision only exists when the two are on screen together, which
// is why no single-page harness ever sees it.
//
// So for EVERY page in public/ that loads buildable-gamenav.js or
// buildable-hud.js, this opens the page inside a mock of the real shell at the
// three sizes the shell has tiers for, reads the rectangle of every shell button
// and every .hud-chip, and fails if any two overlap or a chip escapes its band.
//
//   npm i --no-save playwright-core        (it is NOT a repo dep)
//   node scripts/qa-hud-all.mjs            # run FROM the repo directory
//
// The mock is served by playwright itself (route interception) so it is
// same-origin with the engine and nothing has to be committed into public/. Its
// geometry is asserted against BK_BAND in src/BuildableKids.jsx, BAND in
// public/buildable-gamenav.js and TIERS in public/buildable-hud.js, so the mock
// can never quietly drift away from the shell it stands in for.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require_ = createRequire(ROOT + '/');
const { chromium } = require_('playwright-core');

const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let ok = true;
const rows = [];
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

// ---------------------------------------------------------------------------
// 1) STATIC — the three copies of the size table agree with each other
// ---------------------------------------------------------------------------
console.log('--- STATIC: one size table, in three files ---');
const TIER_NAMES = ['phone', 'tablet', 'computer'];
function tableOf(src, label) {
  const out = {};
  for (const t of TIER_NAMES) {
    const m = src.match(new RegExp(t + '\\s*:\\s*\\{([^}]*)\\}'));
    if (!m) continue;
    const fields = {};
    for (const p of m[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) fields[p[1]] = parseFloat(p[2]);
    out[t] = fields;
  }
  chk(label + ' declares all three tiers', TIER_NAMES.every((t) => out[t]),
    Object.keys(out).join(','));
  return out;
}
const T_SHELL = tableOf(read('src/BuildableKids.jsx'), 'the shell (BK_BAND)');
const T_NAV = tableOf(read('public/buildable-gamenav.js'), 'the nav bridge (BAND)');
const T_HUD = tableOf(read('public/buildable-hud.js'), 'the info bar (TIERS)');
for (const t of TIER_NAMES) {
  const a = T_SHELL[t] || {}, b = T_NAV[t] || {}, c = T_HUD[t] || {};
  chk('  ' + t + ': the bridge mirrors the shell exactly',
    ['band', 'btn', 'pad', 'gap', 'home'].every((k) => a[k] === b[k]),
    JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  chk('  ' + t + ': the info bar mirrors the shell\'s band and padding',
    ['band', 'pad', 'gap'].every((k) => a[k] === c[k]),
    JSON.stringify(c));
}
const navjs = read('public/buildable-gamenav.js');
chk('the bridge marks the page in-shell', /classList\.add\("bk-inshell"\)/.test(navjs));
for (const v of ['--bk-band-h', '--bk-nav-left', '--bk-nav-right', '--bk-tier', '--bk-bottom-safe', '--bk-nav-bottom'])
  chk('the bridge publishes ' + v, navjs.includes(v));
chk('the shell posts the band it actually drew into the game',
  /bk:band/.test(navjs) && /bk:band/.test(read('src/BuildableKids.jsx')));
chk('the shell no longer draws anything at the BOTTOM of a game',
  !/position: "absolute", bottom: \d+, right: \d+, zIndex: 3/.test(read('src/BuildableKids.jsx')));
chk('the light Home variant is gone', !/const homeStyle = light/.test(read('src/BuildableKids.jsx')));

// ---------------------------------------------------------------------------
// 2) LIVE — every page, under the shell's own chrome, measured
// ---------------------------------------------------------------------------
const PUBLIC = path.join(ROOT, 'public');
const PAGES = fs.readdirSync(PUBLIC)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => /buildable-(gamenav|hud)\.js/.test(fs.readFileSync(path.join(PUBLIC, f), 'utf8')))
  .sort();

const SIZES = [
  { name: 'phone', w: 390, h: 844, tier: 'phone' },
  { name: 'tablet', w: 820, h: 1180, tier: 'tablet' },
  { name: 'computer', w: 1440, h: 900, tier: 'computer' },
];

// The mock. It IS GameFrame/NavBtn: a Home pill of a known width on the left and a
// ROW of round buttons on the right, both centred in a band whose height comes from
// the tier — and, like the real shell, it draws no right-hand button until the game
// has said what it needs (nav:state), then publishes the band it actually drew.
// A mock that always drew the deepest cluster would fail games that ask for less.
const mockHTML = (src, T, tier) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;height:100%;overflow:hidden;background:#0F0E17;
   font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
 .frame{position:fixed;inset:0;z-index:50}
 iframe{width:100%;height:100%;border:none;display:block}
 #shellHome{position:absolute;top:${(T.band - T.btn) / 2}px;left:${T.pad}px;z-index:3;
   width:${T.home}px;height:${T.btn}px;border-radius:999px;background:rgba(18,18,38,0.55);
   border:1px solid rgba(255,255,255,0.25);color:#fff;font-weight:800;font-size:${T.font}px;padding:0}
 .navbtn{position:absolute;top:${(T.band - T.btn) / 2}px;z-index:3;width:${T.btn}px;height:${T.btn}px;
   border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(18,18,38,0.55);
   color:#fff;padding:0}
</style>
<div class="frame">
 <button id="shellHome">Home</button>
 <div id="cluster"></div>
 <iframe id="gf" src="${src}"></iframe>
</div>
<script>
var T = ${JSON.stringify(T)}, TIER = ${JSON.stringify(tier)}, PHONE = TIER === "phone";
var nav = null;
function draw() {
  // exactly GameFrame's rule: Sound whenever the game registered; Menu when the game
  // has one, or on a phone to hold Help; Help as its own button off the phone.
  var cluster = [];
  if (nav) cluster.push("sound");
  if (nav && (nav.hasMenu || (PHONE && nav.hasHelp))) cluster.push("menu");
  if (nav && !PHONE && nav.hasHelp) cluster.push("help");
  var host = document.getElementById("cluster"), html = "";
  for (var i = 0; i < cluster.length; i++) {
    var slot = cluster.length - 1 - i;
    html += '<button class="navbtn" id="shellBtn' + i + '" style="right:' + (T.pad + slot * (T.btn + T.gap)) + 'px"></button>';
  }
  host.innerHTML = html;
  var n = cluster.length;
  var msg = Object.assign({ type: "bk:band", tier: TIER }, T, {
    navLeft: T.pad + T.home + T.gap,
    navRight: T.pad + (n ? n * T.btn + (n - 1) * T.gap + T.gap : 0)
  });
  try { document.getElementById("gf").contentWindow.postMessage(msg, "*"); } catch (e) {}
}
addEventListener("message", function (e) {
  var d = e && e.data;
  if (d && d.type === "nav:state") {
    nav = { hasMenu: !!d.hasMenu, hasHelp: !!d.hasHelp, inGame: d.inGame !== false };
    draw();
  }
});
document.getElementById("gf").addEventListener("load", function () { draw(); setTimeout(draw, 300); });
</script>`;

const MEASURE = () => {
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const vis = (w, el) => {
    const cs = w.getComputedStyle(el), b = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0 && b.width > 0 && b.height > 0;
  };
  const shell = {};
  document.querySelectorAll('#shellHome,.navbtn').forEach((el) => { shell[el.id] = box(el); });
  const f = document.getElementById('gf');
  const d = f.contentDocument, w = f.contentWindow;
  if (!d) return { shell, chips: [], vars: {}, err: 'no document' };
  const chips = [];
  d.querySelectorAll('.hud-chip').forEach((el, i) => {
    if (!vis(w, el)) return;
    const bar = el.closest('.hud');
    chips.push({ n: 'chip' + i, row2: !!(bar && bar.classList.contains('hud-row2')), ...box(el) });
  });
  const cs = w.getComputedStyle(d.documentElement);
  return {
    shell, chips,
    vars: {
      tier: cs.getPropertyValue('--bk-tier').trim(),
      band: cs.getPropertyValue('--bk-band-h').trim(),
      left: cs.getPropertyValue('--bk-nav-left').trim(),
      right: cs.getPropertyValue('--bk-nav-right').trim(),
      bottom: cs.getPropertyValue('--bk-nav-bottom').trim(),
    },
    cls: d.documentElement.className,
  };
};

const overlap = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (x > 1 && y > 1) ? (x + 'x' + y + 'px') : null;
};

// a tiny static server, so pages that fetch a manifest are not on file:// rules
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  const f = path.join(PUBLIC, u === '/' ? '/index.html' : u);
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  const ext = path.extname(f);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--mute-audio'],
});

console.log('\n--- LIVE: ' + PAGES.length + ' pages x ' + SIZES.length + ' sizes, under the shell\'s chrome ---');
// 75 page loads one after another took nine minutes, which is long enough that a
// release gate stops being run. Four at a time brings it under three.
const JOBS = [];
for (const page of PAGES) for (const S of SIZES) JOBS.push({ page, S });
const LANES = 4;

async function measureOne({ page, S }) {
    const T = T_SHELL[S.tier];
    const p = await browser.newPage({ viewport: { width: S.w, height: S.h } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    let r = null;
    try {
      // Nothing off this machine. A game page pulls Google Fonts and an audio API
      // it cannot reach from a sandbox, and waiting for those to time out is what
      // made this gate a nine-minute job. Layout does not depend on either.
      // Registered FIRST on purpose: playwright gives the LAST matching route
      // precedence, so the mock below has to be registered after this one.
      await p.route('**', (route) => {
        const u = route.request().url();
        if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
        return route.abort();
      });
      await p.route('**/__qa_hud_shell', (route) => route.fulfill({
        contentType: 'text/html', body: mockHTML('/' + page, T, S.tier),
      }));
      await p.goto(BASE + '/__qa_hud_shell', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(2500);
      r = await p.evaluate(MEASURE);
    } catch (e) {
      errs.push(e.message);
    }
    await p.close();

    const row = { page, size: S.name, chips: 0, clashes: [], outside: [], errs: errs.slice(0, 1) };
    if (r) {
      row.chips = r.chips.length;
      row.tier = r.vars.tier;
      for (const c of r.chips) {
        for (const [sn, sb] of Object.entries(r.shell)) {
          const o = overlap(c, sb);
          if (o) row.clashes.push(c.n + ' under ' + sn + ' (' + o + ')');
        }
        // a chip lives in the band, or — world layout on a phone — in the second
        // row directly under it. Never anywhere else.
        const band = parseFloat(r.vars.band) || T_SHELL[S.tier].band;
        const lo = c.row2 ? band : 0, hi = c.row2 ? band * 2 + 12 : band;
        if (c.y < lo - 1 || c.y + c.h > hi + 1)
          row.outside.push(c.n + ' at y=' + c.y + '..' + (c.y + c.h) + ' outside ' + lo + '..' + hi);
      }
      // in-shell pages must have been handed the band
      if (/bk-inshell/.test(r.cls || '')) {
        if (r.vars.tier !== S.tier) row.errs.push('tier=' + r.vars.tier + ' expected ' + S.tier);
        if (parseFloat(r.vars.band) !== T_SHELL[S.tier].band) row.errs.push('band=' + r.vars.band + ' expected ' + T_SHELL[S.tier].band);
      }
    } else row.errs.push('did not load');
    return row;
}

{
  const queue = JOBS.slice();
  const out = [];
  await Promise.all(Array.from({ length: LANES }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      out.push(await measureOne(job));
    }
  }));
  // one stable order, whatever order the lanes finished in
  const key = (r) => r.page + '|' + SIZES.findIndex((s) => s.name === r.size);
  out.sort((a, b) => key(a) < key(b) ? -1 : 1);
  rows.push(...out);
}
await browser.close();
server.close();

// ---------------------------------------------------------------------------
// 3) ONE TABLE
// ---------------------------------------------------------------------------
console.log('\n' + 'page'.padEnd(28) + 'size'.padEnd(10) + 'tier'.padEnd(10) + 'chips'.padEnd(7) + 'verdict');
console.log('-'.repeat(96));
for (const r of rows) {
  const bad = [...r.clashes, ...r.outside, ...r.errs];
  console.log(
    r.page.slice(0, 27).padEnd(28) +
    r.size.padEnd(10) +
    String(r.tier || '-').padEnd(10) +
    String(r.chips).padEnd(7) +
    (bad.length ? 'FAIL  ' + bad.join(' | ') : 'ok'));
}
// ---------------------------------------------------------------------------
// Games not converted yet, and why. HD1 converted three pilots; the rest still
// hand-roll their chips, and Ant City is the clearest case — three counters and a
// name forced through the `action` layout, which cannot fit them on a phone. That
// is exactly what the `world` layout is for, and it is HD2's card.
//
// This waiver is self-cleaning: a page listed here that PASSES fails the gate, so
// the entry has to be deleted the moment the game is converted. It can never rot
// into a permanent excuse.
// ---------------------------------------------------------------------------
const NOT_YET = {
  'antcity-engine.html@phone': 'HD2 — a name plus three counters cannot fit the `action` bar at 390px; it needs the `world` layout',
};

const bad = (r) => r.clashes.length || r.outside.length || r.errs.length;
const waiver = (r) => NOT_YET[r.page + '@' + r.size];
const failed = rows.filter((r) => bad(r) && !waiver(r));
const waivedButFine = rows.filter((r) => !bad(r) && waiver(r));
for (const [pg, why] of Object.entries(NOT_YET))
  console.log('waived: ' + pg + '  ::  ' + why);
chk('\nno HUD chip anywhere sits under a shell button or escapes its band',
  failed.length === 0, failed.length + ' of ' + rows.length + ' page/size combinations failed');
chk('every waived game is still actually broken, so the list cannot rot',
  waivedButFine.length === 0,
  waivedButFine.map((r) => r.page + '@' + r.size + ' passes now — delete it from NOT_YET').join(' | '));

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'THERE ARE FAILURES ABOVE'));
process.exit(ok ? 0 : 1);
