// Headless QA for GN2 — the bottom bar in the multiplayer lobby, and the rule
// that keeps a pending invite honest when a kid leaves by a tab.
//
// The lobby (src/GameLobby.jsx) has four screens. Three are DECIDING screens
// (mode select, friends list, waiting for a friend) and show the five-tab bar
// with Play lit; the fourth is PLAYING and must show no bar at all. See
// HUD-AND-NAV-RULES.md Rule 0.
//
// The half of this file that matters most is the ORDER proof. A kid waiting on
// an invite who taps Explore must cancel that invite BEFORE the shell navigates
// away, or their friend accepts into a match nobody is sitting in. Asserting
// that from source would only prove the code reads right, so this harness
// really mounts the lobby against a MOCK TRANSPORT (esbuild swaps every
// src/lib/* import for a recorder), drives it through friends -> invite ->
// waiting, taps a tab, and reads back the actual call order.
//
//   node qa-gn2.mjs .
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

const L = read('src/GameLobby.jsx');
const BAR = read('src/BottomBar.jsx');
const HELP = read('src/HelperReactions.jsx');
const SHELL = read('src/BuildableKids.jsx');

// ------------------------------------------------------- 1) the bar is shared
console.log('--- The bar lives in its own module so the lobby can show it ---');
chk('src/BottomBar.jsx exists and default-exports the bar',
  /export default function BottomBar\s*\(/.test(BAR));
chk('it also exports the one clearance number every consumer needs',
  /export const NAV_BAR_H\s*=\s*\d+/.test(BAR) && /export const navBarClear\s*=/.test(BAR));
chk('the lobby imports the bar (no import cycle back into the shell)',
  /import BottomBar, \{ navBarClear \} from "\.\/BottomBar\.jsx"/.test(L));
chk('the lobby does NOT import from BuildableKids (that would be a cycle)',
  !/from ["']\.\/BuildableKids/.test(L));
chk('the shell imports the bar from the same module',
  /import BottomBar, \{ navBarClear \} from "\.\/BottomBar\.jsx"/.test(SHELL));

// ------------------------------------------------------- 2) lobby wiring
console.log('--- Lobby wiring: nav in, bar out, padding for it ---');
chk('GameLobby takes a nav prop', /function GameLobby\(\{[^}]*\bnav\b[^}]*\}\)/.test(L));
chk('the bar is built once and lights Play', /const bar = nav \? \(\s*<BottomBar\s+current="play"/.test(L));
chk('all five tab handlers go through leaveForTab',
  (L.match(/leaveForTab\(nav\.on(Home|Play|Make|Explore|Me)\)/g) || []).length === 5);
chk('the deciding screens pad clear of the bar',
  /const padWithBar = \{ \.\.\.C\.pad, paddingBottom: navBarClear\(/.test(L) &&
  /const centerWithBar = \{ \.\.\.C\.center, paddingBottom: navBarClear\(/.test(L));
chk('the bar renders on exactly three screens', (L.match(/^\s*\{bar\}$/gm) || []).length === 3);
chk('every shell call site hands the lobby its nav',
  (SHELL.match(/<GameLobby\n\s+nav=\{bottomBarProps\}/g) || []).length ===
  (SHELL.match(/<GameLobby\b/g) || []).length,
  (SHELL.match(/<GameLobby\b/g) || []).length + ' call sites');

// ------------------------------------------------------- 3) cancel before nav
console.log('--- Source: cleanup runs before navigation ---');
chk('leaveForTab awaits the cleanup, THEN navigates',
  /async function leaveForTab\(go\) \{\s*await cancelPendingWork\(\);\s*if \(go\) go\(\);/.test(L));
chk('cancelPendingWork awaits cancelInvite for a pending invite',
  /if \(iv\) \{ setOutInvite\(null\); try \{ await cancelInvite\(iv\.id\); \} catch \(e\) \{\} \}/.test(L));
chk('cancelPendingWork also closes an open realtime channel',
  /async function cancelPendingWork\(\)[\s\S]{0,600}teardownRealtime\(\);/.test(L));
chk('a failed cancel still lets the kid leave (error swallowed, not rethrown)',
  /await cancelInvite\(iv\.id\); \} catch \(e\) \{\}/.test(L));

// ------------------------------------------------------- 4) the buddy toast
console.log('--- The buddy toast raises itself above the bar ---');
chk('the bar publishes its height on <html> while mounted',
  /root\.style\.setProperty\("--bk-bottom-bar", navBarClear\(0\)\)/.test(BAR));
chk('and removes it on unmount (so a screen with no bar is back to 0)',
  /root\.style\.removeProperty\("--bk-bottom-bar"\)/.test(BAR));
chk('the toast anchors off that variable, with a 0px fallback',
  /bottom: "calc\(var\(--bk-bottom-bar, 0px\) \+ 24px\)"/.test(HELP));
chk('the toast no longer hardcodes bottom: 24', !/bottom: 24,/.test(HELP));

// ------------------------------------------------------- 5) THE REAL MOUNT
console.log('--- Real mount against a mock transport ---');

let esbuild = null, JSDOM = null;
try {
  esbuild = await import('esbuild');
  ({ JSDOM } = await import('jsdom'));
} catch (e) {
  chk('mount half ran (needs `npm install`: esbuild + jsdom)', false, 'DID NOT RUN — ' + e.message);
}

// Every src/lib/* import the lobby makes is replaced by a recorder, so the
// harness owns the whole transport and can read the call order back.
const MOCKS = {
  './lib/accounts': `
    export const isSignedIn = () => true;
    export const getActiveKid = () => ({ id: 'kid-me', display_name: 'Riley' });
    export const getSession = () => ({ access_token: 'tok' });`,
  './lib/friends': `
    const R = (globalThis.__gn2 = globalThis.__gn2 || []);
    export const listFriends = async () => [{ kidId: 'kid-pal', name: 'Jack', online: true, group: 'family' }];
    export const inboxInvites = async () => [];
    export const sendInvite = async () => { R.push('sendInvite'); return { inviteId: 'inv-1', matchId: 'match-1' }; };
    export const cancelInvite = async (id) => {
      R.push('cancelInvite:start');
      // A real cancel is a network round trip. The delay is the point: if
      // leaveForTab did not await, navigate would land before this resolves.
      await new Promise((r) => setTimeout(r, 15));
      R.push('cancelInvite:done');
    };
    export const pollInvite = async () => ({ status: 'pending' });
    export const acceptInvite = async () => 'match-1';`,
  './lib/friendMatches': `
    export const getFriendMatch = async () => ({ id: 'match-1', host_kid: 'kid-me', state: {}, turn: 'w' });
    export const patchFriendMatch = async (id, p) => ({ id, ...p });
    export const roleFor = () => 'host';
    export const oppKidOf = () => 'kid-pal';`,
  './lib/realtimeChannel': `
    const R = (globalThis.__gn2 = globalThis.__gn2 || []);
    export const openChannel = () => ({ send() {}, close() { R.push('channelClosed'); } });`,
};

const tmpOut = path.join(dir, '__qa_gn2_bundle.mjs');
const tmpCss = path.join(dir, '__qa_gn2_bundle.css');
const cleanup = () => { for (const f of [tmpOut, tmpCss]) { try { fs.unlinkSync(f); } catch (e) {} } };

if (esbuild && JSDOM) {
  try {
    await esbuild.build({
      entryPoints: [path.join(dir, 'src/GameLobby.jsx')], bundle: true, format: 'esm',
      platform: 'node', outfile: tmpOut, jsx: 'automatic', logLevel: 'silent',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      define: { 'import.meta.env': JSON.stringify({ MODE: 'test' }) },
      plugins: [{
        name: 'gn2-mocks',
        setup(b) {
          b.onResolve({ filter: /^\.\/lib\// }, (a) => (MOCKS[a.path] ? { path: a.path, namespace: 'gn2mock' } : null));
          b.onLoad({ filter: /.*/, namespace: 'gn2mock' }, (a) => ({ contents: MOCKS[a.path], loader: 'js' }));
        },
      }],
    });

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node',
                     'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
      const v = k === 'window' ? dom.window : dom.window[k];
      try { globalThis[k] = v; }
      catch (e) { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); }
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    const React = (await import('react')).default;
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react-dom/test-utils');
    // The mock modules capture this array ONCE, at import time. Create it first
    // and only ever empty it in place -- reassigning globalThis.__gn2 would
    // leave the mocks recording into the old array and the nav handlers into
    // the new one, and the order proof would quietly read half the story.
    globalThis.__gn2 = [];
    const REC = globalThis.__gn2;
    const GameLobby = (await import(pathToFileURL(path.resolve(tmpOut)).href)).default;

    const doc = dom.window.document;
    const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };

    // ---- run 1: realtime lobby, the full friends -> waiting -> tab-tap path ----
    const nav = {
      activeKid: { display_name: 'Riley' },
      onHome() { REC.push('navigate:home'); },
      onPlay() { REC.push('navigate:play'); },
      onMake() { REC.push('navigate:make'); },
      onExplore() { REC.push('navigate:explore'); },
      onMe() { REC.push('navigate:me'); },
    };
    const host = doc.getElementById('root');
    const root = createRoot(host);
    const RT_GAME = { title: 'Tennis', slug: 'tennis', transport: 'realtime', url: '/tennis.html', msg: 'tennis' };
    await act(async () => {
      root.render(React.createElement(GameLobby, {
        game: RT_GAME, activeKid: { id: 'kid-me', display_name: 'Riley' },
        entry: 'friends', onHome() {}, onAddFriend() {}, nav,
      }));
    });
    await settle();

    const tabsOf = (html) => [...html.matchAll(/data-tab="([a-z]+)" data-selected="([01])"/g)]
      .map((m) => ({ id: m[1], sel: m[2] === '1' }));

    // FRIENDS
    chk('FRIENDS screen renders the friends list', /Family &amp; friends|Family & friends/.test(host.innerHTML));
    chk('FRIENDS screen shows data-nv1-bottom-bar', /data-nv1-bottom-bar/.test(host.innerHTML));
    let tabs = tabsOf(host.innerHTML);
    chk('FRIENDS bar has all five tabs with Play the only one lit',
      tabs.length === 5 && tabs.filter((t) => t.sel).length === 1 && tabs.find((t) => t.id === 'play').sel,
      tabs.filter((t) => t.sel).map((t) => t.id).join(',') || 'none');
    chk('the bar published --bk-bottom-bar on <html> while mounted',
      /calc\(env\(safe-area-inset-bottom/.test(doc.documentElement.style.getPropertyValue('--bk-bottom-bar')),
      doc.documentElement.style.getPropertyValue('--bk-bottom-bar') || 'not set');

    // WAITING (invite a friend on a realtime game -> live handshake)
    const inviteBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Invite');
    chk('the friends list offers an Invite button', !!inviteBtn);
    await act(async () => { inviteBtn.click(); });
    await settle();
    chk('WAITING screen reached through a real invite', /Waiting for/.test(host.textContent));
    chk('WAITING screen shows data-nv1-bottom-bar', /data-nv1-bottom-bar/.test(host.innerHTML));
    tabs = tabsOf(host.innerHTML);
    chk('WAITING bar still lights Play only',
      tabs.length === 5 && tabs.filter((t) => t.sel).length === 1 && tabs.find((t) => t.id === 'play').sel);

    // No emoji on a deciding screen. Four dingbat glyphs predate GN2 (the Back
    // arrows and the mode-select tile icons); they are named here so a NEW one
    // still fails this check, and they are logged for GN3's sweep to replace
    // with drawn SVG per the product guardrail.
    const PRE_GN2 = ['←', '↗', '▣', '☆'];
    const strip = (t) => PRE_GN2.reduce((acc, c) => acc.split(c).join(''), t);
    chk('no NEW emoji on the lobby deciding screens', !emoji.test(strip(host.textContent)));
    const navHtml = /<nav[^>]*data-nv1-bottom-bar[\s\S]*?<\/nav>/.exec(host.innerHTML);
    chk('no emoji anywhere in the bar itself', !!navHtml && !emoji.test(navHtml[0]));

    // ---- THE ORDER PROOF: tap a tab while the invite is still pending ----
    REC.length = 0;
    const exploreTab = host.querySelector('button[data-tab="explore"]');
    chk('the Explore tab is tappable from the waiting screen', !!exploreTab);
    await act(async () => { exploreTab.click(); });
    await settle();
    const order = REC.slice();
    const iCancelDone = order.indexOf('cancelInvite:done');
    const iNav = order.indexOf('navigate:explore');
    chk('tapping a tab cancelled the pending invite', iCancelDone !== -1, JSON.stringify(order));
    chk('tapping a tab navigated', iNav !== -1, JSON.stringify(order));
    chk('CANCEL COMPLETED BEFORE NAVIGATION (the whole point of this card)',
      iCancelDone !== -1 && iNav !== -1 && iCancelDone < iNav, JSON.stringify(order));
    // No channel is open yet on the waiting screen (one opens only when a match
    // starts), so there is nothing for the teardown to close here. Run 3 below
    // proves the channel really is closed, in the state where one exists.
    chk('nothing else fired on the way out (just cancel, then navigate)',
      order.length === 3, JSON.stringify(order));
    chk('--bk-bottom-bar is cleared once the bar unmounts',
      (await act(async () => { root.unmount(); }), !doc.documentElement.style.getPropertyValue('--bk-bottom-bar')),
      doc.documentElement.style.getPropertyValue('--bk-bottom-bar') || '(cleared)');

    // ---- run 2: a turn-based invite drops straight into PLAYING: no bar ----
    REC.length = 0;
    const host2 = doc.createElement('div'); doc.body.appendChild(host2);
    const root2 = createRoot(host2);
    const TURN_GAME = { title: 'Tic-Tac-Toe', slug: 'tictactoe', transport: 'turns', url: '/ttt.html', msg: 'bg' };
    await act(async () => {
      root2.render(React.createElement(GameLobby, {
        game: TURN_GAME, activeKid: { id: 'kid-me', display_name: 'Riley' },
        entry: 'friends', onHome() {}, onAddFriend() {}, nav,
      }));
    });
    await settle();
    chk('MODE/FRIENDS screen of a turn-based lobby shows the bar too',
      /data-nv1-bottom-bar/.test(host2.innerHTML));
    const startBtn = [...host2.querySelectorAll('button')].find((b) => b.textContent === 'Start game');
    chk('a turn-based game starts straight away (no waiting screen)', !!startBtn);
    await act(async () => { startBtn.click(); });
    await settle();
    chk('PLAYING screen reached (the board iframe is mounted)',
      !!host2.querySelector('iframe'));
    chk('PLAYING screen shows NO bottom bar (doing, not deciding)',
      !/data-nv1-bottom-bar/.test(host2.innerHTML));
    chk('PLAYING screen keeps the corner Back as the only way out',
      /&larr; Back|← Back/.test(host2.innerHTML));
    await act(async () => { root2.unmount(); });

    // ---- run 3: leaving a LIVE realtime match closes the channel ----
    // The waiting screen has no channel to close, so prove the teardown where a
    // channel actually exists: drop straight into a realtime match (the same
    // path a Home nudge takes), then leave by the corner Back.
    REC.length = 0;
    const host3 = doc.createElement('div'); doc.body.appendChild(host3);
    const root3 = createRoot(host3);
    await act(async () => {
      root3.render(React.createElement(GameLobby, {
        game: RT_GAME, activeKid: { id: 'kid-me', display_name: 'Riley' },
        entry: 'friends', autoJoin: { matchId: 'match-1' }, onHome() {}, onAddFriend() {}, nav,
      }));
    });
    await settle();
    chk('a realtime match opens straight into PLAYING with no bar',
      !!host3.querySelector('iframe') && !/data-nv1-bottom-bar/.test(host3.innerHTML));
    const backBtn = [...host3.querySelectorAll('button')].find((b) => /Back/.test(b.textContent));
    chk('the live match offers the corner Back', !!backBtn);
    await act(async () => { backBtn.click(); });
    await settle();
    chk('leaving a live realtime match CLOSES the channel',
      REC.indexOf('channelClosed') !== -1, JSON.stringify(REC));
    chk('and lands back on a deciding screen, bar and all',
      /data-nv1-bottom-bar/.test(host3.innerHTML));
    await act(async () => { root3.unmount(); });
  } catch (e) {
    chk('the mount completed without throwing', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  } finally {
    cleanup();
  }
}

// ------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
