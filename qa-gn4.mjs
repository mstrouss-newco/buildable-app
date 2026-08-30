// Headless QA for GN4 — the bottom bar over a game's OWN level picker.
//
// GN1-GN3 put the bar on every deciding screen the SHELL draws. The last place a
// kid could still get stuck is a picker that lives INSIDE an engine, on the far
// side of the iframe: the engine's own title/level screen, reached by the shell's
// Menu button or after a game ends. Rule 0 was never about which side of an
// iframe a screen sits on — deciding is deciding — so the shell now floats the
// bar over the frame while the engine reports it is not playing, and drops it the
// instant play starts.
//
// Three things have to be true, and this harness proves each for real rather than
// by reading the source:
//   1. The BRIDGE (public/buildable-gamenav.js) notices the engine's state
//      changing WITHOUT the engine calling update(), publishes the reserved bottom
//      strip, and forwards a tap that iOS would otherwise swallow.
//   2. The SHELL (GameFrame) shows the bar only while the engine says "not
//      playing", and presses the real button when a forwarded tap arrives.
//   3. Every ENGINE that uses the bridge reports inGame, or is on an explicit,
//      reasoned exception list.
//
//   node qa-gn4.mjs .
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};

const BRIDGE = read('public/buildable-gamenav.js');
const SHELL = read('src/BuildableKids.jsx');
const START = read('public/buildable-startscreen.js');

// ------------------------------------------------------- 1) the shell side
console.log('--- GameFrame: the bar rides an engine picker, never play ---');
// (the destructure contains `iframeProps = {}`, so match the line, not a
// brace-balanced group)
const GF_SIG = (/^function GameFrame\(.*$/m.exec(SHELL) || [''])[0];
chk('GameFrame takes the shell nav handlers and a tab',
  /\bnav\b/.test(GF_SIG) && /navTab = "play"/.test(GF_SIG), GF_SIG.slice(0, 60) + '...');
chk('the bridge state is named apart from the nav prop (no shadowing)',
  /const \[bridge, setBridge\] = useState\(null\)/.test(SHELL));
chk('the bar is up only when the engine says it is NOT playing',
  /const barUp = !!\(nav && bridge && bridge\.inGame === false\);/.test(SHELL));
chk('the bar renders over the frame', /\{barUp && <BottomBar current=\{navTab\}/.test(SHELL));
chk('the shell tells the game when the bar is up (and how tall)',
  /postMessage\(\{ type: "nav:bar", on: barUp, h: NAV_BAR_H \}/.test(SHELL));
chk('a forwarded tap is hit-tested against the real bar, not re-derived geometry',
  /document\.elementFromPoint\(d\.x, d\.y\)[\s\S]{0,200}closest\("\[data-nv1-bottom-bar\] button\[data-tab\]"\)/.test(SHELL));
const frames = (SHELL.match(/<GameFrame\b/g) || []).length;
const framesWithNav = (SHELL.match(/<GameFrame nav=\{nav\}/g) || []).length;
chk('every GameFrame is handed nav', frames > 0 && frames === framesWithNav, framesWithNav + ' of ' + frames);

// ------------------------------------------------------- 2) the bridge side
console.log('--- The bridge: watch, publish, catch ---');
chk('the bridge watches inGame instead of trusting engines to call update()',
  /function watchInGame\(\)[\s\S]{0,300}if \(now === lastInGame\) return;[\s\S]{0,80}postState\(\);/.test(BRIDGE));
chk('the watcher is started on register', /setInterval\(watchInGame, \d+\)/.test(BRIDGE));
chk('the bridge publishes the reserved bottom strip as a CSS variable',
  /setProperty\("--bk-nav-bottombar"/.test(BRIDGE));
chk('the strip is 0 when the bar is down (gameplay loses no space)',
  /\(on \? \(h \|\| 76\) : 0\) \+ "px"/.test(BRIDGE));
chk('the touch catcher forwards COORDINATES, not a tab name',
  /type: "nav:barTap", x: pt\.clientX, y: pt\.clientY/.test(BRIDGE));
chk('the catcher exists only while the bar is up',
  /if \(!on\) \{ if \(z && z\.parentNode\) z\.parentNode\.removeChild\(z\); return; \}/.test(BRIDGE));

console.log('--- Pickers keep the bottom strip clear ---');
chk('the shared start screen pads clear of the bar',
  /\.bss-inner\{padding-bottom:calc\(28px \+ var\(--bk-nav-bottombar, 0px\)\)\}/.test(START));

// ------------------------------------------------------- 3) the engine sweep
console.log('--- Every engine on the bridge reports whether it is playing ---');
// Engines that use the bridge but deliberately never report a picker. Each needs
// a reason, and the reason has to be that a kid can never be parked there.
const NO_PICKER = {
  'survival-engine.html': 'loads the bridge but does not register: its homemade menus were retired in 5A and it is always deep-linked to a level',
  'connectfour-engine.html': 'registers through buildable-boardgame.js, which reports inGame',
  'dotsboxes-engine.html': 'registers through buildable-boardgame.js, which reports inGame',
  'tictactoe-engine.html': 'registers through buildable-boardgame.js, which reports inGame',
};
const pub = path.join(dir, 'public');
const engines = fs.readdirSync(pub).filter((f) => f.endsWith('.html'))
  .filter((f) => fs.readFileSync(path.join(pub, f), 'utf8').includes('buildable-gamenav.js'));
chk('engines using the nav bridge found', engines.length >= 15, engines.length + ' engines');
chk('buildable-boardgame.js (the board games\' bridge) reports inGame',
  /inGame: function \(\) \{ return ctrl\.state === "play"; \}/.test(read('public/buildable-boardgame.js')));
let reporting = 0, excused = 0;
for (const f of engines) {
  const src = fs.readFileSync(path.join(pub, f), 'utf8');
  const has = /\.register\(/.test(src) && /inGame\s*:/.test(src);
  if (has) { reporting++; continue; }
  if (NO_PICKER[f]) { excused++; continue; }
  chk(f + ' reports inGame (or is on the exception list with a reason)', false);
}
chk('every bridge engine either reports inGame or is excused with a reason',
  reporting + excused === engines.length, reporting + ' report, ' + excused + ' excused');
// The four this card fixed. Named so a revert is loud.
for (const f of ['bubble-engine.html', 'mathcannon-engine.html', 'runner-engine.html', 'tank-engine.html']) {
  chk(f + ' now reports inGame (it did not before GN4)',
    /inGame\s*:/.test(fs.readFileSync(path.join(pub, f), 'utf8')));
}

// ------------------------------------------------------- 4) THE REAL RUNS
console.log('--- Real run: the bridge, in a DOM, with a recording parent ---');

let JSDOM = null, esbuild = null;
try {
  ({ JSDOM } = await import('jsdom'));
  esbuild = await import('esbuild');
} catch (e) {
  chk('the live half ran (needs `npm install`: jsdom + esbuild)', false, 'DID NOT RUN — ' + e.message);
}

if (JSDOM) {
  try {
    const dom = new JSDOM('<!doctype html><html><body></body></html>',
      { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://buildable.test/' });
    const w = dom.window;
    const posted = [];
    w.parent = { postMessage: (m) => posted.push(m) };   // pretend we are in the shell's iframe
    w.eval(BRIDGE);
    const BN = w.BuildableGameNav;
    let playing = false;
    BN.register({ onSound() {}, onMenu() {}, soundOn: () => true, inGame: () => playing });

    const states = () => posted.filter((p) => p && p.type === 'nav:state');
    chk('the engine\'s "I am not playing" reaches the shell',
      states().length > 0 && states()[states().length - 1].inGame === false);
    chk('the page is marked in-shell', w.document.documentElement.classList.contains('bk-inshell'));

    const say = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));
    say({ type: 'nav:bar', on: true, h: 76 });
    await new Promise((r) => setTimeout(r, 20));
    chk('the shell saying "bar up" publishes the strip',
      w.document.documentElement.style.getPropertyValue('--bk-nav-bottombar') === '76px',
      w.document.documentElement.style.getPropertyValue('--bk-nav-bottombar') || 'unset');
    chk('and marks the page .bk-barup', w.document.documentElement.classList.contains('bk-barup'));
    const catcher = w.document.getElementById('bkNavBarCatcher');
    chk('and puts the touch catcher over the bar strip, exactly',
      !!catcher && catcher.style.position === 'fixed' && catcher.style.bottom === '0px'
      && catcher.style.height === '76px',
      catcher ? [catcher.style.position, catcher.style.bottom, catcher.style.height].join(' / ') : 'no catcher');

    posted.length = 0;
    catcher.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 120, clientY: 800 }));
    const taps = posted.filter((p) => p && p.type === 'nav:barTap');
    chk('a tap on the catcher forwards the viewport coordinates',
      taps.length === 1 && taps[0].x === 120 && taps[0].y === 800, JSON.stringify(taps));

    // The heart of it: play starts and the engine never calls update().
    posted.length = 0;
    playing = true;
    await new Promise((r) => setTimeout(r, 400));
    const after = posted.filter((p) => p && p.type === 'nav:state').map((p) => p.inGame);
    chk('play starting reaches the shell with NO update() call from the engine',
      after.length > 0 && after.every((v) => v === true), JSON.stringify(after));

    say({ type: 'nav:bar', on: false });
    await new Promise((r) => setTimeout(r, 20));
    chk('dropping the bar returns the strip to 0px',
      w.document.documentElement.style.getPropertyValue('--bk-nav-bottombar') === '0px');
    chk('...removes the catcher (so it can never eat a gameplay tap)',
      !w.document.getElementById('bkNavBarCatcher'));
    chk('...and unmarks .bk-barup', !w.document.documentElement.classList.contains('bk-barup'));
  } catch (e) {
    chk('the bridge run completed without throwing', false, (e && e.message || String(e)).slice(0, 120));
  }
}

console.log('--- Real run: GameFrame, mounted, driven by engine messages ---');
const tmpEntry = path.join(dir, 'src', '__qa_gn4_entry.jsx');
const tmpOut = path.join(dir, '__qa_gn4_bundle.mjs');
const tmpCss = path.join(dir, '__qa_gn4_bundle.css');
const cleanup = () => { for (const f of [tmpEntry, tmpOut, tmpCss]) { try { fs.unlinkSync(f); } catch (e) {} } };

if (JSDOM && esbuild) {
  try {
    fs.writeFileSync(tmpEntry, SHELL + '\nexport { GameFrame };\n');
    await esbuild.build({
      entryPoints: [tmpEntry], bundle: true, format: 'esm', platform: 'node',
      outfile: tmpOut, jsx: 'automatic', logLevel: 'silent',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      define: { 'import.meta.env': JSON.stringify({ MODE: 'test' }) },
    });
    const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>',
      { pretendToBeVisual: true, url: 'https://buildable.test/' });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
                     'MessageEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame',
                     'cancelAnimationFrame', 'localStorage', 'sessionStorage']) {
      const v = k === 'window' ? dom.window : dom.window[k];
      try { globalThis[k] = v; }
      catch (e) { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react-dom/test-utils');
    const { GameFrame } = await import(pathToFileURL(path.resolve(tmpOut)).href);

    const doc = dom.window.document;
    const pressed = [];
    const nav = { activeKid: { display_name: 'Riley' },
      onHome() { pressed.push('home'); }, onPlay() { pressed.push('play'); },
      onMake() { pressed.push('make'); }, onExplore() { pressed.push('explore'); },
      onMe() { pressed.push('me'); } };
    const say = async (data) => { await act(async () => { dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data })); }); };

    const host = doc.getElementById('r');
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(GameFrame, { title: 'Breaker', src: '/b.html', onHome() {}, nav })); });
    chk('before the engine reports anything, no bar (never a guess)',
      !/data-nv1-bottom-bar/.test(host.innerHTML));

    await say({ type: 'nav:state', sound: true, hasMenu: true, hasHelp: false, inGame: false });
    chk('engine says "on my picker" -> the bar appears over the frame',
      /data-nv1-bottom-bar/.test(host.innerHTML));
    chk('...with Play lit', /data-tab="play" data-selected="1"/.test(host.innerHTML));
    chk('...and the engine iframe is still there underneath', !!host.querySelector('iframe'));

    // jsdom has no layout, so stand in for the browser's hit test; what is being
    // proved is that the shell presses the REAL button the point lands on.
    const target = host.querySelector('button[data-tab="explore"] span') || host.querySelector('button[data-tab="explore"]');
    doc.elementFromPoint = () => target;
    await say({ type: 'nav:barTap', x: 120, y: 820 });
    chk('a tap forwarded from inside the game presses the real tab',
      pressed.length === 1 && pressed[0] === 'explore', JSON.stringify(pressed));

    await say({ type: 'nav:state', sound: true, hasMenu: true, hasHelp: false, inGame: true });
    chk('play starts -> the bar is gone', !/data-nv1-bottom-bar/.test(host.innerHTML));
    await act(async () => { root.unmount(); });

    // Safe by default: a frame with no nav handlers never draws a half-wired bar.
    const host2 = doc.createElement('div'); doc.body.appendChild(host2);
    const root2 = createRoot(host2);
    await act(async () => { root2.render(React.createElement(GameFrame, { title: 'B', src: '/b.html', onHome() {} })); });
    await say({ type: 'nav:state', inGame: false });
    chk('a GameFrame with no nav prop never shows a bar', !/data-nv1-bottom-bar/.test(host2.innerHTML));
    await act(async () => { root2.unmount(); });
  } catch (e) {
    chk('the GameFrame run completed without throwing', false,
      e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    cleanup();
  }
}

// ------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
