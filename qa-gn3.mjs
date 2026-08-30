// Headless QA for GN3 — the deciding/doing sweep.
//
// GN1 put the bar on the game front door and GN2 on the lobby. GN3 makes it a
// law: EVERY shell screen a kid can stand on between Home and play shows the
// five-tab bar with the right tab lit, and NO screen with a live engine iframe
// or an active making canvas shows it at all (HUD-AND-NAV-RULES.md Rule 0).
//
// The heart of this file is THE REGISTER below: every screen in the shell,
// classified, with the tab it lights. It is checked against the SCREEN_
// constants in src/BuildableKids.jsx, so adding a screen without classifying it
// fails this harness — that is the regression alarm the card asked for.
//
// Where a component owns its own bar, the check is a real render: the component
// is bundled and rendered, and the assertion reads the DOM attributes back.
// Where the shell renders the bar as a SIBLING of the screen (Home, Play, Make,
// Explore, Me), the check reads the shell source, because there is no single
// component to render.
//
//   node qa-gn3.mjs .
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

const SHELL = read('src/BuildableKids.jsx');

// ===========================================================================
//  THE REGISTER — every shell screen, classified.
//
//  tab: which tab lights (deciding screens only).
//  why: for a DOING screen, what makes it doing. Every one of these is either a
//       live engine iframe, an active making canvas, a first-run gate, or a
//       grown-up screen — the four things that never carry kid nav.
// ===========================================================================
const DECIDING = {
  // --- the five section pages: the shell renders the bar as a sibling ---
  SCREEN_HOME:        { tab: 'home',    by: 'shell' },
  SCREEN_PLAY_HUB:    { tab: 'play',    by: 'shell' },
  SCREEN_MAKE_HUB:    { tab: 'make',    by: 'shell' },
  SCREEN_EXPLORE_HUB: { tab: 'explore', by: 'shell' },
  SCREEN_MY_STUFF:    { tab: 'me',      by: 'shell' },
  // --- game front doors (GN1) ---
  SCREEN_GAME_LANDING:    { tab: 'play', by: 'GameLanding' },
  SCREEN_BREAKER_LANDING: { tab: 'play', by: 'GameLanding' },
  SCREEN_TENNIS_LANDING:  { tab: 'play', by: 'GameLanding' },
  SCREEN_CHESS_LANDING:   { tab: 'play', by: 'GameLanding' },
  SCREEN_MUSIC_LANDING:   { tab: 'make', by: 'GameLanding' }, // a studio front door
  // --- lobbies (GN2) ---
  SCREEN_FRIEND_MATCH:  { tab: 'play', by: 'GameLobby' },
  SCREEN_TTT_LOBBY:     { tab: 'play', by: 'GameLobby' },
  SCREEN_C4_LOBBY:      { tab: 'play', by: 'GameLobby' },
  SCREEN_DOTS_LOBBY:    { tab: 'play', by: 'GameLobby' },
  SCREEN_CHESS_LOBBY:   { tab: 'play', by: 'GameLobby' },
  SCREEN_CHECKERS_LOBBY:{ tab: 'play', by: 'GameLobby' },
  SCREEN_TENNIS_LOBBY:  { tab: 'play', by: 'GameLobby' },
  // --- pickers, loadouts, stores (GN3) ---
  SCREEN_WRAP_JOURNEY:      { tab: 'play', by: 'GameJourney' },
  SCREEN_BREAKER_JOURNEY:   { tab: 'play', by: 'GameJourney' },
  SCREEN_SLING_JOURNEY:     { tab: 'play', by: 'GameJourney' },
  SCREEN_BOARD_SOLO:        { tab: 'play', by: 'BoardSoloFrame' },
  SCREEN_CHESS_SOLO:        { tab: 'play', by: 'BoardSoloFrame' },
  SCREEN_GAME_LOADOUT:      { tab: 'play', by: 'BreakerLoadout' },
  SCREEN_BREAKER_LOADOUT:   { tab: 'play', by: 'BreakerLoadout' },
  SCREEN_TENNIS_LOADOUT:    { tab: 'play', by: 'BreakerLoadout' },
  SCREEN_MUSIC_LOADOUT:     { tab: 'make', by: 'BreakerLoadout' }, // a studio loadout
  SCREEN_SURVIVAL_UPGRADES: { tab: 'play', by: 'UpgradeStore' },
  SCREEN_GAME_TYPE:         { tab: 'make', by: 'GameTypeScreen' },
  SCREEN_TOP:               { tab: 'home', by: 'TopBoard' },
  // --- the family lane: matchmaking only, never the match view ---
  SCREEN_CHESS_FAMILY:    { tab: 'play', by: 'FamilyChess' },
  SCREEN_CHECKERS_FAMILY: { tab: 'play', by: 'FamilyCheckers' },
  SCREEN_TOWN_FAMILY:     { tab: 'play', by: 'FamilyTown' },
  SCREEN_TENNIS_FAMILY:   { tab: 'play', by: 'FamilyRealtime' },
};

const DOING = {
  // Every one of these embeds a live engine through GameFrame.
  SCREEN_PLATFORMER: 'engine iframe', SCREEN_SURVIVAL: 'engine iframe',
  SCREEN_BREAKER: 'engine iframe',    SCREEN_TANK: 'engine iframe',
  SCREEN_RUNNER: 'engine iframe',     SCREEN_TUMBLE: 'engine iframe',
  SCREEN_CASTLE: 'engine iframe',     SCREEN_SLING: 'engine iframe',
  SCREEN_CROC: 'engine iframe',       SCREEN_RILEYS: 'engine iframe',
  SCREEN_MAHJONG: 'engine iframe',    SCREEN_STRINGMATCH: 'engine iframe',
  SCREEN_BUBBLE: 'engine iframe',     SCREEN_MATHCANNON: 'engine iframe',
  SCREEN_SKYFLYER: 'engine iframe',   SCREEN_MEMORY: 'engine iframe',
  SCREEN_BINGO: 'engine iframe',      SCREEN_SNAKES: 'engine iframe',
  SCREEN_MAZE: 'engine iframe',       SCREEN_TYPING: 'engine iframe',
  SCREEN_TICTACTOE: 'engine iframe',  SCREEN_CONNECTFOUR: 'engine iframe',
  SCREEN_DOTSBOXES: 'engine iframe',  SCREEN_CHECKERS: 'engine iframe',
  SCREEN_CHESS: 'engine iframe',      SCREEN_TENNIS: 'engine iframe',
  SCREEN_TOWN: 'engine iframe',       SCREEN_PLAY: 'engine iframe',
  SCREEN_EXPLORE: 'exhibit iframe',   SCREEN_LESSONS: 'lessons iframe',
  SCREEN_SOUNDS: 'studio canvas',     SCREEN_ART: 'studio canvas',
  SCREEN_MUSIC: 'studio canvas',      SCREEN_STORY: 'studio canvas',
  // Active making canvas: leaving mid-flow loses the kid's work.
  SCREEN_CHARACTER_CREATOR: 'active making canvas',
  SCREEN_LEVEL_CREATOR: 'active making canvas',
  // A form mid-flow with its own Home + My Stuff nav.
  SCREEN_INTRO: 'creation-flow form',
  // First-run gates: one job, and a bar would let a kid skip it.
  SCREEN_HELPER: 'first-run gate',
  // Grown-up screens: a different audience. Kid nav does not belong there.
  SCREEN_GROWNUP: 'grown-up screen', SCREEN_GROWNUP_FRIENDS: 'grown-up screen',
  SCREEN_ADMIN: 'grown-up screen',
};

// ------------------------------------------------------- 1) the register holds
console.log('--- The register covers every screen in the shell ---');
const declared = (SHELL.match(/^const (SCREEN_[A-Z0-9_]+) = /gm) || [])
  .map((l) => /^const (SCREEN_[A-Z0-9_]+)/.exec(l)[1]);
chk('SCREEN_ constants found in the shell', declared.length > 40, declared.length + ' screens');
const classified = new Set([...Object.keys(DECIDING), ...Object.keys(DOING)]);
const unclassified = declared.filter((d) => !classified.has(d));
chk('every shell screen is classified deciding or doing', unclassified.length === 0,
  unclassified.join(', ') || 'all ' + declared.length + ' classified');
const stale = [...classified].filter((c) => !declared.includes(c));
chk('the register has no stale entries', stale.length === 0, stale.join(', ') || 'none');
const overlap = Object.keys(DECIDING).filter((d) => d in DOING);
chk('no screen is both deciding and doing', overlap.length === 0, overlap.join(', ') || 'none');
console.log('     ' + Object.keys(DECIDING).length + ' deciding, ' + Object.keys(DOING).length + ' doing');

// --------------------------------------------- 2) shell-sibling bars, by source
console.log('--- The five section pages: the shell renders the bar beside them ---');
for (const [screen, spec] of Object.entries(DECIDING)) {
  if (spec.by !== 'shell') continue;
  chk(screen + ' renders the bar with current="' + spec.tab + '"',
    new RegExp('<BottomBar\\s+current="' + spec.tab + '"').test(SHELL));
}

// ----------------------------------------- 3) doing screens carry no bar (src)
console.log('--- Doing screens: the shell never renders a bar beside them ---');
// GameFrame is the one wrapper every engine screen goes through.
const frame = /function\s+GameFrame\s*\([\s\S]*?\n\}\n/.exec(SHELL);
chk('GameFrame block found', !!frame);
chk('GameFrame renders no bar (so no engine screen can)', !!frame && !/<BottomBar/.test(frame[0]));
// And no doing screen may be wrapped in a fragment with a bar beside it.
for (const [screen, why] of Object.entries(DOING)) {
  const branch = new RegExp('screen === ' + screen + '\\b[\\s\\S]{0,1400}?(?=\\n  if \\(screen ===)').exec(SHELL);
  if (!branch) continue; // some screens are reached only through another branch
  chk(screen + ' (' + why + ') has no bar in its branch', !/<BottomBar/.test(branch[0]));
}

// ------------------------------------------------------- 4) THE REAL RENDERS
console.log('--- Real renders: each deciding component, and the tab it lights ---');

let esbuild = null, React = null, renderToStaticMarkup = null;
try {
  esbuild = await import('esbuild');
  React = (await import('react')).default;
  ({ renderToStaticMarkup } = await import('react-dom/server'));
} catch (e) {
  chk('render half ran (needs `npm install`)', false, 'DID NOT RUN — ' + e.message);
}

// The shell and the family modules read the browser at render time (the signed-in
// check hits localStorage). Rather than stub their modules -- which would swap out
// real code the render is meant to exercise -- give Node the two browser bits they
// touch. A cold, signed-out browser is a perfectly valid state to render in, and
// the bar has to be there in it too.
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
           removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};
for (const k of ['localStorage', 'sessionStorage']) {
  try { globalThis[k] = memStore(); }
  catch (e) { Object.defineProperty(globalThis, k, { value: memStore(), configurable: true, writable: true }); }
}

const tmpEntry = path.join(dir, 'src', '__qa_gn3_entry.jsx');
const tmpOut = path.join(dir, '__qa_gn3_bundle.mjs');
const tmpCss = path.join(dir, '__qa_gn3_bundle.css');
const cleanup = () => { for (const f of [tmpEntry, tmpOut, tmpCss]) { try { fs.unlinkSync(f); } catch (e) {} } };

if (esbuild && React && renderToStaticMarkup) {
  try {
    // One entry re-exporting everything: the shell's internal deciding screens
    // plus GameFrame (the doing wrapper), and the sibling modules.
    fs.writeFileSync(tmpEntry, read('src/BuildableKids.jsx')
      + '\nexport { GameLanding, GameJourney, BoardSoloFrame, BreakerLoadout, UpgradeStore, GameTypeScreen, GameFrame };'
      + '\nexport { default as FamilyChess } from "./FamilyChess.jsx";'
      + '\nexport { default as FamilyCheckers } from "./FamilyCheckers.jsx";'
      + '\nexport { default as FamilyTown } from "./FamilyTown.jsx";'
      + '\nexport { default as FamilyRealtime } from "./FamilyRealtime.jsx";'
      + '\nexport { default as TopBoard } from "./TopBoard.jsx";\n');
    await esbuild.build({
      entryPoints: [tmpEntry], bundle: true, format: 'esm', platform: 'node',
      outfile: tmpOut, jsx: 'automatic', logLevel: 'silent',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      define: { 'import.meta.env': JSON.stringify({ MODE: 'test' }) },
    });
    const M = await import(pathToFileURL(path.resolve(tmpOut)).href);

    const GAME = { id: 'breaker', name: 'Breaker', desc: 'Bricks', category: 'Arcade', color: '#F0972A', type: 'game' };
    const STUDIO = { id: 'music-maker', name: 'Music Maker', desc: 'Tunes', category: 'Studio', color: '#E0578F', type: 'studio' };
    const nav = { activeKid: { display_name: 'Riley' }, onHome() {}, onPlay() {}, onMake() {}, onExplore() {}, onMe() {} };
    const kid = { id: 'kid-me', display_name: 'Riley' };
    const noop = () => {};

    // name -> [component element, expected tab]. Every `by` in the register that
    // is not 'shell' or 'GameLobby' (qa-gn2 owns the lobby) appears here.
    const RENDERS = [
      ['GameLanding (game)',     React.createElement(M.GameLanding, { game: GAME, nav, onPlay: noop, onBack: noop }), 'play'],
      ['GameLanding (studio)',   React.createElement(M.GameLanding, { game: STUDIO, nav, onPlay: noop, onBack: noop }), 'make'],
      ['GameJourney',            React.createElement(M.GameJourney, { game: GAME, gameId: 'breaker', nav, onBack: noop, onPlay: noop }), 'play'],
      ['BoardSoloFrame',         React.createElement(M.BoardSoloFrame, { game: GAME, gameId: 'chess', nav, onBack: noop, onPlay: noop }), 'play'],
      ['BreakerLoadout (game)',  React.createElement(M.BreakerLoadout, { game: GAME, nav, onBack: noop, onPlay: noop }), 'play'],
      ['BreakerLoadout (studio)',React.createElement(M.BreakerLoadout, { game: STUDIO, nav, onBack: noop, onPlay: noop }), 'make'],
      ['UpgradeStore',           React.createElement(M.UpgradeStore, { game: GAME, nav, onBack: noop, onPlay: noop }), 'play'],
      ['GameTypeScreen',         React.createElement(M.GameTypeScreen, { playerName: 'Riley', nav, onGameSelected: noop, onBack: noop, onMyStuff: noop }), 'make'],
      ['TopBoard',               React.createElement(M.TopBoard, { nav, onHome: noop, onBack: noop, onRemix: noop }), 'home'],
      ['FamilyChess',            React.createElement(M.FamilyChess, { activeKid: kid, nav, onHome: noop }), 'play'],
      ['FamilyCheckers',         React.createElement(M.FamilyCheckers, { activeKid: kid, nav, onHome: noop }), 'play'],
      ['FamilyTown',             React.createElement(M.FamilyTown, { activeKid: kid, nav, onHome: noop }), 'play'],
      ['FamilyRealtime',         React.createElement(M.FamilyRealtime, { game: { slug: 'tennis', url: '/t.html', title: 'Tennis' }, activeKid: kid, nav, onHome: noop }), 'play'],
    ];

    for (const [name, el, want] of RENDERS) {
      let html = null;
      try { html = renderToStaticMarkup(el); } catch (e) { chk(name + ' renders', false, e.message.slice(0, 90)); continue; }
      const tabs = [...html.matchAll(/data-tab="([a-z]+)" data-selected="([01])"/g)].map((m) => ({ id: m[1], sel: m[2] === '1' }));
      const lit = tabs.filter((t) => t.sel).map((t) => t.id);
      chk(name + ' shows the bar', /data-nv1-bottom-bar/.test(html));
      chk(name + ' lights exactly "' + want + '"',
        tabs.length === 5 && lit.length === 1 && lit[0] === want, lit.join(',') || 'none');
    }

    // The other direction, for real: the wrapper every engine screen goes through.
    const frameHtml = renderToStaticMarkup(React.createElement(M.GameFrame, { title: 'Breaker', src: '/breaker.html', onHome: noop }));
    chk('GameFrame (every doing screen) renders NO bar', !/data-nv1-bottom-bar/.test(frameHtml));
    chk('GameFrame does render the engine iframe + corner Home',
      /<iframe/.test(frameHtml) && /aria-label="Home"/.test(frameHtml));

    // A component handed no nav must not draw a half-wired bar.
    const noNav = renderToStaticMarkup(React.createElement(M.FamilyChess, { activeKid: kid, onHome: noop }));
    chk('a deciding component with no nav prop renders no bar (never a dead bar)',
      !/data-nv1-bottom-bar/.test(noNav));
  } catch (e) {
    chk('the sweep completed without throwing', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    cleanup();
  }
}

// ------------------------------------------------------- 5) the bottom strip
console.log('--- Where the bar shows, it owns the bottom strip ---');
const BAR = read('src/BottomBar.jsx');
chk('one clearance number, exported for every consumer',
  /export const NAV_BAR_H\s*=\s*(\d+)/.test(BAR));
const H = parseInt(/export const NAV_BAR_H\s*=\s*(\d+)/.exec(BAR)[1], 10);
chk('the reserved strip is at least 70px deep (the rule in HUD-AND-NAV-RULES.md)',
  H >= 70, NAV_BAR_H_note(H));
function NAV_BAR_H_note(h) { return 'NAV_BAR_H=' + h; }
chk('which tab a game screen lights is derived from the catalog, not hardcoded',
  /export const navTabFor = \(game\) => \(\(game && game\.type === "studio"\) \? "make" : "play"\)/.test(BAR));

const RULES = read('HUD-AND-NAV-RULES.md');
chk('HUD-AND-NAV-RULES.md states the deciding-vs-doing rule',
  /Deciding shows the bar, doing never does/.test(RULES));
chk('...and that the bar owns the bottom strip',
  /owns the bottom strip/i.test(RULES));
chk('...and lists what is deliberately excluded',
  /first-run gate|grown-up/i.test(RULES));

// ------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
