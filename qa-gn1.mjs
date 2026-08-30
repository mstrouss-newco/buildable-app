// Headless QA for GN1 — the NV1 five-tab bottom bar on the GAME FRONT DOOR
// (GameLanding: the Solo / Same device / Play a friend screen).
//
// GN1's rule is deciding-vs-doing: while a kid is still choosing HOW to play,
// the bar rides along so they can hop to any section; once they are playing, the
// bar is gone. This harness proves the deciding half on the front door, and the
// two things that break when a fixed bar lands on a screen that wasn't expecting
// it: content hiding under the bar, and a floating pill sitting in the bar strip.
//
// Unlike qa-nv1.mjs (source-only), this one REALLY RENDERS GameLanding: it
// bundles src/BuildableKids.jsx with esbuild, renders the component to static
// markup with react-dom/server, and reads the resulting DOM attributes. Source
// checks stay as the first half so a rename that keeps the render working still
// gets flagged.
//
//   node qa-gn1.mjs .
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
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// GN2 moved the bar and its clearance number into src/BottomBar.jsx. GN1's
// assertions are about the bar as a whole, not which file it sits in, so read
// both. (The render half below still bundles the shell, which imports it.)
const S = read('src/BuildableKids.jsx') + '\n' + read('src/BottomBar.jsx');

// ------------------------------------------------------- 1) the shared clearance
console.log('--- One bar-clearance number, shared by every screen that shows the bar ---');
chk('NAV_BAR_H defined (the bar height above the safe-area inset)',
  /const\s+NAV_BAR_H\s*=\s*\d+/.test(S));
const NAV_BAR_H = parseInt((/const\s+NAV_BAR_H\s*=\s*(\d+)/.exec(S) || [])[1], 10);
chk('NAV_BAR_H is a real bar height, not a token value', NAV_BAR_H >= 60 && NAV_BAR_H <= 120,
  'NAV_BAR_H=' + NAV_BAR_H);
chk('navBarClear() helper defined', /const\s+navBarClear\s*=\s*\(extra\s*=\s*0\)\s*=>/.test(S));
// The bar already carries safe-area-inset-bottom, so the clearance must add the
// SAME inset — otherwise the padding is right on a desktop and short on a phone.
chk('navBarClear adds the same safe-area inset the bar itself carries',
  /navBarClear\s*=\s*\(extra\s*=\s*0\)\s*=>\s*`calc\(env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*\$\{NAV_BAR_H\s*\+\s*extra\}px\)`/.test(S));
chk('the bar\'s own padding uses that same inset',
  /data-nv1-bottom-bar[\s\S]{0,400}padding:\s*"8px 8px calc\(env\(safe-area-inset-bottom, 0px\) \+ 8px\)"/.test(S));

// ------------------------------------------------------- 2) GameLanding wiring
console.log('--- GameLanding: the bar rides the front door, Play lit ---');
chk('GameLanding takes a nav prop (the shared bottomBarProps)',
  /function\s+GameLanding\s*\(\{[^}]*\bnav\b[^}]*\}\)/.test(S));
chk('GameLanding renders the bar with current="play"',
  /<BottomBar\s+current="play"\s+\{\.\.\.\(nav\s*\|\|\s*\{\}\)\}\s*\/>/.test(S));
chk('GameLanding pads its content clear of the bar',
  /\.\.\.styles\.container[\s\S]{0,120}paddingBottom:\s*navBarClear\(/.test(S));

// Every GameLanding in the shell must be handed the same handlers, or a tab on
// one game's front door would mean something different from the next.
const landings = S.match(/<GameLanding\b/g) || [];
const landingsWithNav = S.match(/<GameLanding\s+game=\{[a-z]+\}\s+nav=\{bottomBarProps\}/g) || [];
chk('every GameLanding call site is handed nav={bottomBarProps}',
  landings.length > 0 && landings.length === landingsWithNav.length,
  landingsWithNav.length + ' of ' + landings.length);
// The five handlers must be the same targets the Play hub tabs use.
chk('nav handlers route to the five section screens',
  /const\s+bottomBarProps\s*=\s*\{[\s\S]{0,600}onHome:\s*\(\)\s*=>\s*setScreen\(SCREEN_HOME\)[\s\S]{0,400}onPlay:\s*\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)[\s\S]{0,400}onMake:\s*\(\)\s*=>\s*setScreen\(SCREEN_MAKE_HUB\)[\s\S]{0,400}onExplore:\s*\(\)\s*=>\s*setScreen\(SCREEN_EXPLORE_HUB\)[\s\S]{0,400}onMe:[^,]*openMyStuff/.test(S));

// ------------------------------------------------------- 3) deciding vs doing
console.log('--- Deciding shows the bar; doing never does ---');
const frame = /function\s+GameFrame\s*\([\s\S]*?\n\}\n/.exec(S);
chk('GameFrame block found', !!frame);
// GN4 amended GN1's blanket "never inside GameFrame": deciding vs doing is about
// what the kid is doing, not which side of an iframe the screen is on. A frame now
// shows the bar when -- and ONLY when -- the engine reports through the nav bridge
// that it is on its own picker. What must still never happen is a bar over live
// play, which is exactly what the barUp condition guarantees. qa-gn4.mjs drives it
// against a real DOM; this check pins the condition.
chk('the bar renders inside GameFrame only while the engine says it is NOT playing',
  !!frame && /const barUp = !!\(nav && bridge && bridge\.inGame === false\);/.test(frame[0]));
chk('...and never unconditionally (no bar over live play)',
  !!frame && !/[^&] <BottomBar/.test(frame[0].replace(/\{barUp && <BottomBar/g, '')));

// ------------------------------------------------------- 4) the Gear up pill
console.log('--- Gear up pill clears the bar on screens that show both ---');
chk('Gear up is one shared helper, not a copy per screen',
  /function\s+gearUpBtn\s*\(onUpgrades,\s*overBar\)/.test(S));
chk('gearUpBtn lifts above the bar when overBar is set',
  /bottom:\s*overBar\s*\?\s*navBarClear\(\d+\)\s*:\s*14/.test(S));
chk('only ONE Gear up button exists in the shell',
  (S.match(/>Gear up<\/button>/g) || []).length === 1);
chk('the Survival play screen (a doing screen) passes overBar=false',
  /gearUpBtn\(onUpgrades,\s*false\)/.test(S));

// ------------------------------------------------------- 5) THE REAL RENDER
console.log('--- Headless render of GameLanding (real React, real DOM attributes) ---');

let esbuild = null, React = null, renderToStaticMarkup = null;
try {
  esbuild = await import('esbuild');
  React = (await import('react')).default;
  ({ renderToStaticMarkup } = await import('react-dom/server'));
} catch (e) {
  chk('render half ran (needs `npm install`: esbuild + react + react-dom)', false,
    'DID NOT RUN — ' + e.message);
}

const tmpEntry = path.join(dir, 'src', '__qa_gn1_entry.jsx');
const tmpOut = path.join(dir, '__qa_gn1_bundle.mjs');
// esbuild also drops a .css sidecar next to the bundle (the app imports a
// stylesheet), so sweep that too — a QA run must leave no files behind.
const tmpCss = path.join(dir, '__qa_gn1_bundle.css');
const cleanup = () => { for (const f of [tmpEntry, tmpOut, tmpCss]) { try { fs.unlinkSync(f); } catch (e) {} } };

if (esbuild && React && renderToStaticMarkup) {
  try {
    // GameLanding is internal to the shell module, so bundle a throwaway copy of
    // the file with the three symbols re-exported. The copy lives beside the
    // original so every relative import still resolves, and is deleted after.
    fs.writeFileSync(tmpEntry, read('src/BuildableKids.jsx')
      + '\nexport { GameLanding, gearUpBtn };'
      + '\nexport { NAV_BAR_H as BAR_H } from "./BottomBar.jsx";\n');
    await esbuild.build({
      entryPoints: [tmpEntry], bundle: true, format: 'esm', platform: 'node',
      outfile: tmpOut, jsx: 'automatic', logLevel: 'silent',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      loader: { '.js': 'jsx' },
      // Vite injects these at build time; the module reads them at import time.
      define: { 'import.meta.env': JSON.stringify({ MODE: 'test' }) },
    });
    const mod = await import(pathToFileURL(path.resolve(tmpOut)).href);
    chk('GameLanding bundled and imported', typeof mod.GameLanding === 'function');

    const GAME = { id: 'chess', name: 'Chess', desc: 'A thinking game',
      category: 'Board', color: '#7C5CFC', type: 'game' };
    const NAV = { activeKid: { display_name: 'Riley' },
      onHome() {}, onPlay() {}, onMake() {}, onExplore() {}, onMe() {} };
    const html = renderToStaticMarkup(React.createElement(mod.GameLanding, {
      game: GAME, multiplayer: 'turn-based',
      onSolo() {}, onSameDevice() {}, onPlayFriend() {},
      onLoadout() {}, onBack() {}, nav: NAV,
    }));

    // -- the bar is there --
    chk('rendered front door shows data-nv1-bottom-bar', /data-nv1-bottom-bar/.test(html));
    chk('the bar is fixed to the bottom of the screen',
      /data-nv1-bottom-bar[^>]*style="[^"]*position:fixed[^"]*bottom:0/.test(html));

    // -- five tabs, Play lit, nothing else lit --
    const tabs = [...html.matchAll(/data-tab="([a-z]+)"\s+data-selected="([01])"/g)]
      .map((m) => ({ id: m[1], sel: m[2] === '1' }));
    chk('all five tabs render', tabs.length === 5,
      tabs.map((t) => t.id).join(',') || 'none');
    chk('tab order is Home, Play, Make, Explore, Me',
      tabs.map((t) => t.id).join(',') === 'home,play,make,explore,me');
    const playTab = tabs.find((t) => t.id === 'play');
    chk('the Play tab is lit (data-selected="1")', !!playTab && playTab.sel);
    chk('exactly one tab is lit (a you-are-here sign, not a row of them)',
      tabs.filter((t) => t.sel).length === 1);
    chk('Play tab is marked aria-current="page" for screen readers',
      /data-tab="play"[^>]*aria-current="page"/.test(html));

    // -- the last button is not hidden under the bar --
    const rootStyle = (/^<div style="([^"]*)"/.exec(html) || [])[1] || '';
    const pad = /padding-bottom:calc\(env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*(\d+)px\)/.exec(rootStyle);
    chk('front door reserves bottom padding for the bar', !!pad, rootStyle.slice(0, 120));
    chk('that padding clears the bar with room to spare',
      !!pad && parseInt(pad[1], 10) > mod.BAR_H,
      pad ? pad[1] + 'px vs bar ' + mod.BAR_H + 'px' : 'no padding');
    chk('the padding carries the same safe-area inset the bar does',
      /padding-bottom:calc\(env\(safe-area-inset-bottom/.test(rootStyle));

    // -- the mode row the card names actually renders --
    chk('the Solo / Same device / Play a friend mode row is on the front door',
      /Solo/.test(html) && /Same device/.test(html) && /Play a friend/.test(html));

    // -- guardrail: no emoji in what a kid sees --
    chk('no emoji anywhere in the rendered front door', !emoji.test(html));

    // -- the Gear up pill, rendered both ways --
    const overBar = renderToStaticMarkup(mod.gearUpBtn(() => {}, true));
    const onPlayScreen = renderToStaticMarkup(mod.gearUpBtn(() => {}, false));
    const gp = /bottom:calc\(env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*(\d+)px\)/.exec(overBar);
    chk('Gear up over the bar uses a bar-aware bottom offset', !!gp, overBar.slice(0, 160));
    chk('Gear up bottom offset clears the bar',
      !!gp && parseInt(gp[1], 10) > mod.BAR_H,
      gp ? gp[1] + 'px vs bar ' + mod.BAR_H + 'px' : 'no offset');
    chk('Gear up on a play screen keeps its normal 14px offset (no wasted room)',
      /bottom:14px/.test(onPlayScreen));
    chk('no emoji on the Gear up pill', !emoji.test(overBar));
  } catch (e) {
    chk('headless render completed without throwing', false, e.message);
  } finally {
    cleanup();
  }
}

// ------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
