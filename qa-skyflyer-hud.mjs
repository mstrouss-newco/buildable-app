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
chk('the bridge publishes the reserved strip',
  /--bk-nav-left/.test(navjs) && /--bk-nav-right/.test(navjs) && /--bk-nav-bottom/.test(navjs));
chk('the strip is sized to the buttons THIS engine asked for (not a fixed guess)',
  /cfg\.onMenu/.test(navjs) && /cfg\.onHelp/.test(navjs) && /14 \+ \(rows - 1\) \* 44 \+ 38/.test(navjs));

// the mock below, and the bridge's arithmetic, both stand in for these numbers
// the third slot is written `top={showMenuBtn ? 102 : 58}`, so read the numbers
// out of every top={...} the nav buttons are given rather than whole literals
const shellTops = [...shelljsx.matchAll(/<NavBtn[^>]*top=\{([^}]+)\}/g)]
  .flatMap(m => (m[1].match(/\d+/g) || []).map(Number));
chk('shell stacks its nav buttons at 14 / 58 / 102', [14, 58, 102].every(t => shellTops.includes(t)),
  'found ' + shellTops.join(','));
chk('shell nav buttons are 38px on the right edge at right:14',
  /width: 38, height: 38/.test(shelljsx) && /position: "absolute", top, right: 14, zIndex: 3/.test(shelljsx));
chk('shell Home sits top:14 left:14', /position: "absolute", top: 14, left: 14/.test(shelljsx));
chk('the mirrored geometry is flagged in the shell so it cannot drift alone',
  /MIRRORED IN public\/buildable-gamenav\.js/.test(shelljsx));

chk('Sky Flyer lays its right-hand column out against the published strip',
  /\.bk-inshell \.pill/.test(engine) && /\.bk-inshell #minimap/.test(engine) && /\.bk-inshell #banked/.test(engine));
chk('those rules do NOT double up the safe-area inset',
  !/\.bk-inshell[^\n]*env\(safe-area-inset-top\)/.test(engine));
chk('the engine still asks the shell for Sound and Help (so the strip is 96 deep)',
  /onSound:function/.test(engine) && /onHelp:function/.test(engine) && !/onMenu:/.test(engine));

// ---------------------------------------------------------------------------
// 2) LIVE — the real engine, under the real chrome, measured
// ---------------------------------------------------------------------------
// Mirrors GameFrame/NavBtn in src/BuildableKids.jsx. Sky Flyer registers Sound
// and Help and no Menu, so the shell draws Sound at top:14 and Help at top:58.
const MOCK = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 html,body{margin:0;height:100%;overflow:hidden;background:#7ecbff;
   font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
 .frame{position:fixed;inset:0;background:#7ecbff;z-index:50}
 iframe{width:100%;height:100%;border:none;display:block}
 #shellHome{position:absolute;top:14px;left:14px;z-index:3;font-weight:800;font-size:14px;
   color:#3B2C66;background:rgba(255,255,255,.9);border:2px solid #EBE3F5;border-radius:999px;
   padding:8px 16px}
 .navbtn{position:absolute;right:14px;z-index:3;width:38px;height:38px;border-radius:50%;
   border:1px solid rgba(255,255,255,.25);background:rgba(18,18,38,.55);color:#fff;
   display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;padding:0}
 #shellSound{top:14px} #shellHelp{top:58px}
</style>
<div class="frame">
 <button id="shellHome">Home</button>
 <button class="navbtn" id="shellSound">S</button>
 <button class="navbtn" id="shellHelp">?</button>
 <iframe id="gf" src="SRC"></iframe>
</div>`;

const SIZES = [
  { name: 'iphone-se', w: 320, h: 568 },
  { name: 'phone',     w: 390, h: 704 },
  { name: 'landscape', w: 704, h: 390 },
  { name: 'tablet',    w: 820, h: 1024 },
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
  for (const id of ['shellHome', 'shellSound', 'shellHelp']) {
    const el = document.getElementById(id);
    if (el) shell[id] = box(el);
  }
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
  return { shell, hud, navBottom: w.getComputedStyle(d.documentElement).getPropertyValue('--bk-nav-bottom').trim(), cls: d.documentElement.className };
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
    body: MOCK.replace('SRC', '/skyflyer-engine.html?v=fl9&level=0'),
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

  console.log('\n  [' + S.name + ' ' + S.w + 'x' + S.h + ']  html.class="' + r.cls.trim() + '"  --bk-nav-bottom=' + r.navBottom);
  chk('  ' + S.name + ': the bridge marked the game as running in the shell', /bk-inshell/.test(r.cls));
  chk('  ' + S.name + ': the strip is 96px deep (Sound + Help, no Menu)', r.navBottom === '96px', r.navBottom);
  chk('  ' + S.name + ': the shell really drew all three controls', Object.keys(r.shell).length === 3);

  const clashes = [];
  for (const [hn, hb] of Object.entries(r.hud))
    for (const [sn, sb] of Object.entries(r.shell)) {
      const o = overlap(hb, sb);
      if (o) clashes.push(hn + ' under ' + sn + ' (' + o + ')');
    }
  chk('  ' + S.name + ': NOTHING in the HUD sits under the shell\'s Home / Sound / Help',
    clashes.length === 0, clashes.join(' | ') || Object.keys(r.hud).length + ' HUD pieces measured');

  // the engine must never draw its own nav in the corners the shell owns
  chk('  ' + S.name + ': the engine\'s own help button stays hidden in-app', !r.hud.helpBtn);

  // and the right-hand column has to be BELOW the strip, not merely not-touching
  for (const n of ['coin pill', 'minimap'])
    chk('  ' + S.name + ': ' + n + ' clears the bottom of the strip', r.hud[n] && r.hud[n].y >= 96,
      r.hud[n] ? 'y=' + r.hud[n].y : 'MISSING');

  await page.close();
}

// ---------------------------------------------------------------------------
// 3) STANDALONE — opened directly, the engine is untouched by any of this
// ---------------------------------------------------------------------------
console.log('\n--- STANDALONE: the engine opened directly is unchanged ---');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 704 } });
  await page.goto(BASE + '/skyflyer-engine.html?v=fl9&level=0', { waitUntil: 'load' });
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
