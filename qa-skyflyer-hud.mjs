// FL9 HUD/NAV GATE — the app's chrome and the game's HUD, MEASURED together.
//
// The bug this exists to stop: the shell draws Home (top-left) and a column of
// round buttons down the top-right OVER the game's iframe, and Sky Flyer kept
// drawing its coin count and its mini-map in exactly those two places. Nothing
// in the engine or in the shell is wrong on its own - the collision only exists
// when the two are on screen together, which is why no single-page harness ever
// saw it. So this script draws the shell's real chrome around the real engine
// and measures every HUD box against every button box.
//
//   npm i --no-save playwright-core        (it is NOT a repo dep)
//   (cd public && python3 -m http.server 8899)
//   node qa-skyflyer-hud.mjs               # run FROM the repo directory
//
// The shell mock is served by playwright itself (route interception) so it is
// same-origin with the engine and nothing has to be committed into public/.
// Its geometry is asserted against src/BuildableKids.jsx below, so the mock can
// never quietly drift away from the shell it is standing in for.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require_ = createRequire(process.cwd() + '/');
const { chromium } = require_('playwright-core');

const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.SKY_BASE || 'http://127.0.0.1:8899';
const dir = process.env.SKY_DIR || '.';
const read = f => fs.readFileSync(dir + '/' + f, 'utf8');

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

// ---------------------------------------------------------------------------
// 1) STATIC — the two halves of the contract agree with each other
// ---------------------------------------------------------------------------
console.log('--- STATIC: the reserved strip is published, used, and mirrored ---');
const navjs = read('public/buildable-gamenav.js');
const shelljsx = read('src/BuildableKids.jsx');
const engine = read('public/skyflyer-engine.html');

chk('the bridge marks the page in-shell', /classList\.add\("bk-inshell"\)/.test(navjs));
chk('the bridge publishes the whole band, not just a strip',
  ['--bk-band-h', '--bk-nav-left', '--bk-nav-right', '--bk-tier', '--bk-bottom-safe', '--bk-nav-bottom']
    .every(v => navjs.includes(v)));
chk('the band is sized to the tier and to the buttons THIS engine asked for',
  /cfg\.onMenu/.test(navjs) && /cfg\.onHelp/.test(navjs) && /function tierFor/.test(navjs));

// HD1: the one size table lives in three files and they must agree. The mock
// below stands in for the shell, so it reads the numbers rather than repeating them.
const TIER_NAMES = ['phone', 'tablet', 'computer'];
function tableOf(src) {
  const out = {};
  for (const t of TIER_NAMES) {
    const m = src.match(new RegExp(t + '\\s*:\\s*\\{([^}]*)\\}'));
    if (!m) continue;
    out[t] = {};
    for (const p of m[1].matchAll(/(\w+)\s*:\s*([\d.]+)/g)) out[t][p[1]] = parseFloat(p[2]);
  }
  return out;
}
const T_SHELL = tableOf(shelljsx), T_NAV = tableOf(navjs);
chk('the shell declares all three size tiers', TIER_NAMES.every(t => T_SHELL[t] && T_SHELL[t].band));
chk('the bridge mirrors every one of the shell\'s numbers',
  TIER_NAMES.every(t => ['band', 'btn', 'pad', 'gap', 'home'].every(k => T_SHELL[t] && T_NAV[t] && T_SHELL[t][k] === T_NAV[t][k])),
  JSON.stringify(T_NAV));
chk('the shell centres its buttons in the band and rows them from the right edge',
  /top: \(T\.band - T\.btn\) \/ 2, right: T\.pad \+ slot \* \(T\.btn \+ T\.gap\)/.test(shelljsx));
chk('shell Home is a dark-glass pill at the left of the band, the light variant retired',
  /left: T\.pad, zIndex: 3, width: T\.home/.test(shelljsx) && !/const homeStyle = light/.test(shelljsx));
chk('the shell draws nothing at the BOTTOM of a game any more',
  !/position: "absolute", bottom: \d+, right: \d+, zIndex: 3/.test(shelljsx));
chk('the mirrored geometry is flagged in the shell so it cannot drift alone',
  /MIRRORED IN public\/buildable-gamenav\.js/.test(shelljsx));

chk('Sky Flyer lays its right-hand column out against the published band',
  /\.bk-inshell \.pill/.test(engine) && /\.bk-inshell #minimap/.test(engine) && /\.bk-inshell #banked/.test(engine));
chk('those rules do NOT double up the safe-area inset',
  !/\.bk-inshell[^\n]*env\(safe-area-inset-top\)/.test(engine));
chk('the engine still asks the shell for Sound and Help',
  /onSound:function/.test(engine) && /onHelp:function/.test(engine) && !/onMenu:/.test(engine));

// ---------------------------------------------------------------------------
// 2) LIVE — the real engine, under the real chrome, measured
// ---------------------------------------------------------------------------
// Mirrors GameFrame/NavBtn in src/BuildableKids.jsx, using the very numbers read
// out of it above. Sky Flyer registers Sound and Help and no Menu, so on a phone
// the shell draws Sound + Menu (Help lives inside the Menu) and on a tablet or a
// computer it draws Sound + Help.
const MOCK = (T, tier, src) => {
  const top = (T.band - T.btn) / 2;
  const n = 2;   // Sky Flyer: two buttons at every tier (see above)
  let btns = '';
  for (let i = 0; i < n; i++)
    btns += `<button class="navbtn" id="shellBtn${i}" style="top:${top}px;right:${T.pad + i * (T.btn + T.gap)}px"></button>`;
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;height:100%;overflow:hidden;background:#7ecbff;
   font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
 .frame{position:fixed;inset:0;background:#7ecbff;z-index:50}
 iframe{width:100%;height:100%;border:none;display:block}
 #shellHome{position:absolute;top:${top}px;left:${T.pad}px;z-index:3;width:${T.home}px;height:${T.btn}px;
   border-radius:999px;background:rgba(18,18,38,.55);border:1px solid rgba(255,255,255,.25);
   color:#fff;font-weight:800;font-size:${T.font}px;padding:0}
 .navbtn{position:absolute;z-index:3;width:${T.btn}px;height:${T.btn}px;border-radius:50%;
   border:1px solid rgba(255,255,255,.25);background:rgba(18,18,38,.55);color:#fff;padding:0}
</style>
<div class="frame">
 <button id="shellHome">Home</button>
 ${btns}
 <iframe id="gf" src="${src}"></iframe>
</div>
<script>
var MSG = Object.assign({ type: "bk:band", tier: ${JSON.stringify(tier)} }, ${JSON.stringify(T)},
  { navLeft: ${T.pad + T.home + T.gap}, navRight: ${T.pad + n * T.btn + (n - 1) * T.gap + T.gap} });
document.getElementById("gf").addEventListener("load", function(){
  var w = this.contentWindow;
  var post = function(){ try { w.postMessage(MSG, "*"); } catch(e){} };
  post(); setTimeout(post, 200); setTimeout(post, 900);
});
</script>`;
};

const SIZES = [
  { name: 'iphone-se', w: 320, h: 568,  tier: 'phone' },
  { name: 'phone',     w: 390, h: 704,  tier: 'phone' },
  { name: 'landscape', w: 704, h: 390,  tier: 'tablet' },
  { name: 'tablet',    w: 820, h: 1024, tier: 'tablet' },
  { name: 'computer',  w: 1440, h: 900, tier: 'computer' },
];

// everything the HUD can put on screen while a kid is flying, transient pieces
// included - a message that only shows up near a landing pad is exactly the kind
// of thing a screenshot taken at second three never catches.
const SHOW_EVERYTHING = () => {
  const d = document.getElementById('gf').contentDocument;
  const set = (id, fn) => { const el = d.getElementById(id); if (el) fn(el); };
  set('padmsg', el => { el.style.opacity = 1; });
  set('banked', el => { el.style.opacity = 1; });
  set('minimap', el => { el.style.display = 'block'; });
  set('waypoint', el => { el.style.display = 'flex'; });
  set('wpName', el => { el.textContent = 'Post box'; });
  set('wpDist', el => { el.textContent = '240m'; });
  set('gJob', el => { el.style.display = 'flex'; el.textContent = 'Mail Run 2/5'; });
  set('gCarry', el => { el.style.display = 'flex'; el.textContent = 'Carrying 3'; });
  set('leaveJob', el => { el.style.display = 'block'; });
};

const MEASURE = () => {
  const box = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const shell = {};
  document.querySelectorAll('#shellHome,.navbtn').forEach(el => { shell[el.id] = box(el); });
  const d = document.getElementById('gf').contentDocument, w = d.defaultView;
  const hud = {};
  const pick = (n, el) => {
    if (!el) return;
    const cs = w.getComputedStyle(el), b = box(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || !b.w || !b.h) return;
    hud[n] = b;
  };
  pick('coin pill', d.querySelector('.pill'));
  for (const id of ['banked', 'minimap', 'worldName', 'rideName', 'padmsg', 'hint', 'takeoff', 'helpBtn'])
    pick(id, d.getElementById(id));
  // the goal chips one by one: the column's bounding box lies about which row is wide
  d.querySelectorAll('#goals > *').forEach(el => pick('goal chip ' + (el.id || el.className), el));
  const cs = w.getComputedStyle(d.documentElement);
  return { shell, hud, cls: d.documentElement.className,
    navBottom: cs.getPropertyValue('--bk-nav-bottom').trim(),
    bandH: cs.getPropertyValue('--bk-band-h').trim(),
    tier: cs.getPropertyValue('--bk-tier').trim() };
};

const overlap = (a, b) => {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (x > 0 && y > 0) ? (x + 'x' + y + 'px') : null;
};

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

async function openInShell(S) {
  const page = await browser.newPage({ viewport: { width: S.w, height: S.h } });
  page.on('pageerror', e => console.log('   PAGE ERROR ' + S.name + ': ' + e.message));
  await page.route('**/__qa_nav_shell', route => route.fulfill({
    contentType: 'text/html',
    body: MOCK(T_SHELL[S.tier], S.tier, '/skyflyer-engine.html?v=fl15&level=0'),
  }));
  await page.goto(BASE + '/__qa_nav_shell', { waitUntil: 'load' });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('iframe')).some(f => (f.contentWindow || {}).SKY),
    null, { timeout: 60000 });
  await page.waitForTimeout(5000);   // past the 3.2s world/ride intro fade
  return page;
}

console.log('\n--- LIVE: the engine under the shell\'s own chrome ---');
for (const S of SIZES) {
  const page = await openInShell(S);
  await page.evaluate(SHOW_EVERYTHING);
  await page.waitForTimeout(300);
  const r = await page.evaluate(MEASURE);

  const T = T_SHELL[S.tier];
  console.log('\n  [' + S.name + ' ' + S.w + 'x' + S.h + ']  html.class="' + r.cls.trim() + '"  tier=' + r.tier + '  band=' + r.bandH);
  chk('  ' + S.name + ': the bridge marked the game as running in the shell', /bk-inshell/.test(r.cls));
  chk('  ' + S.name + ': the game was handed the ' + S.tier + ' tier', r.tier === S.tier, r.tier);
  chk('  ' + S.name + ': the band is ' + T.band + 'px tall', r.bandH === T.band + 'px', r.bandH);
  chk('  ' + S.name + ': --bk-nav-bottom still works, and is the band depth',
    r.navBottom === T.band + 'px', r.navBottom);
  chk('  ' + S.name + ': the shell really drew Home and its button row', Object.keys(r.shell).length === 3);

  const clashes = [];
  for (const [hn, hb] of Object.entries(r.hud))
    for (const [sn, sb] of Object.entries(r.shell)) {
      const o = overlap(hb, sb);
      if (o) clashes.push(hn + ' under ' + sn + ' (' + o + ')');
    }
  chk('  ' + S.name + ': NOTHING in the HUD sits under the shell\'s Home or its button row',
    clashes.length === 0, clashes.join(' | ') || Object.keys(r.hud).length + ' HUD pieces measured');

  // the engine must never draw its own nav in the corners the shell owns
  chk('  ' + S.name + ': the engine\'s own help button stays hidden in-app', !r.hud.helpBtn);

  // and the right-hand column has to be BELOW the strip, not merely not-touching
  for (const n of ['coin pill', 'minimap'])
    chk('  ' + S.name + ': ' + n + ' clears the bottom of the band', r.hud[n] && r.hud[n].y >= T.band,
      r.hud[n] ? 'y=' + r.hud[n].y : 'MISSING');

  await page.close();
}

// ---------------------------------------------------------------------------
// 3) STANDALONE — opened directly, the engine is untouched by any of this
// ---------------------------------------------------------------------------
console.log('\n--- STANDALONE: the engine opened directly is unchanged ---');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 704 } });
  await page.goto(BASE + '/skyflyer-engine.html?v=fl15&level=0', { waitUntil: 'load' });
  await page.waitForFunction('window.SKY && SKY.state', null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => {
    const box = id => {
      const el = id === '.pill' ? document.querySelector('.pill') : document.getElementById(id);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { y: Math.round(b.y), x: Math.round(b.x) };
    };
    return { cls: document.documentElement.className, pill: box('.pill'), help: box('helpBtn') };
  });
  chk('standalone is NOT marked in-shell', !/bk-inshell/.test(r.cls), 'class="' + r.cls.trim() + '"');
  chk('standalone keeps the coin pill in the top-right corner', r.pill && r.pill.y === 12, JSON.stringify(r.pill));
  chk('standalone keeps its own help button', !!r.help, JSON.stringify(r.help));
  await page.close();
}

await browser.close();
console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'THERE ARE FAILURES ABOVE'));
process.exit(ok ? 0 : 1);
