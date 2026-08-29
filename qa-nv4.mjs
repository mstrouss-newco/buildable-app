// Headless QA for NV4 — nav polish + phone-width discipline.
//
// What this file proves (source-analysis, always runs):
//   1) Every bottom-bar tap fires the shared Feel Kit (sound + haptic) and
//      squashes the pressed pill, so every tab press feels like the rest of
//      Buildable and not just a colour change.
//   2) Every tab has its own /app address (extends session 2E): /app,
//      /app/play, /app/make, /app/explore, /app/me — reload restores the tab,
//      Back steps through them. /app/creations still resolves to Me so an
//      older bookmark keeps working.
//   3) Every list of cards keeps the platform sort rule the card demands:
//      Coming Soon LAST, never above a real item. (Explore filters to
//      approved-only, so a soon item can't sneak into that page at all.)
//   4) No card row is longer than 8 items before a See All — that means every
//      horizontal shelf on Home is length-capped via .slice(0, N) with N <= 8,
//      and every full-grid section is a wrapping grid (which paginates itself
//      down the viewport rather than sideways).
//   5) No emoji sneaks into the NV4 changes (product guardrail).
//
// The extra assertions the card asks for that can only be seen at render time
// (a bottom cut-off cue on every page, no sideways document scroll, live
// screenshots at 390 x 844) live in qa-nv4-dom.mjs, which skips loudly when
// Playwright is not installed so this harness is never the reason a session
// claims a failure it did not see.
//
//   node qa-nv4.mjs .
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// GN2 moved the BottomBar (and its glyphs, colours and clearance number) out of
// BuildableKids.jsx into its own module so GameLobby could show it too. The NV
// assertions below are about the bar as a whole, not which file it sits in, so
// this harness reads both and checks them together.
const S = read('src/BuildableKids.jsx') + '\n' + read('src/BottomBar.jsx');

// -------------------------------------------------------- 1) Feel Kit + squash
console.log('--- Bottom-bar tap fires Feel.tap + squashes the pressed pill ---');
// Extract the BottomBar block so every assertion below is anchored inside it —
// unrelated Feel.tap calls in game screens must not accidentally satisfy the
// bar-only checks.
const barMatch = /function\s+BottomBar\([^)]*\)\s*\{[\s\S]*?\n\}\n/.exec(S);
chk('BottomBar block extractable', !!barMatch);
const bar = barMatch ? barMatch[0] : '';

chk('BottomBar tracks the pressed tab in local state',
  /const\s+\[pressed,\s*setPressed\]\s*=\s*useState\(null\)/.test(bar));
chk('press handler calls window.BuildableFeel.tap (shared Kit, safe no-op)',
  /window\.BuildableFeel\s*&&\s*window\.BuildableFeel\.tap\(\)/.test(bar));
chk('press handler releases the squash after a short beat (setTimeout)',
  /setTimeout\(\(\)\s*=>\s*setPressed\(/.test(bar));
chk('press handler still calls the tab handler after the squash starts',
  /if\s*\(t\.on\)\s*t\.on\(\)/.test(bar));
chk('the button onClick is the press handler (not the raw t.on)',
  /onClick=\{\(\)\s*=>\s*pressTab\(t\)\}/.test(bar));
// Visual squash: transform scales the pill down while pressed, and a spring-y
// transition rebounds it back. Colour transitions must survive.
chk('pressed pill scales down (transform: scale(0.88))',
  /transform:\s*isPressed\s*\?\s*"scale\(0\.88\)"\s*:\s*"scale\(1\)"/.test(bar));
chk('transition covers transform so the squash animates',
  /transition:[\s\S]{0,220}transform\s+0\.14s/.test(bar));
chk('every tab button carries a data-pressed hook (harness + CSS can target it)',
  /data-pressed=\{isPressed\s*\?\s*"1"\s*:\s*"0"\}/.test(bar));

// -------------------------------------------------------- 2) each tab -> /app
console.log('--- Every tab has its own /app address (session 2E extension) ---');
// Five tabs, five viewToPath rules — Home/Play/Make/Explore stay, Me now
// writes /app/me (matches the tab label). /app/creations is kept as an alias
// on the read side so an older bookmark still lands on Me.
chk('viewToPath maps SCREEN_HOME to "/app"',
  /screen\s*===\s*SCREEN_HOME\)\s*return\s*"\/app"/.test(S));
chk('viewToPath maps SCREEN_PLAY_HUB to "/app/play"',
  /screen\s*===\s*SCREEN_PLAY_HUB\)\s*return\s*"\/app\/play"/.test(S));
chk('viewToPath maps SCREEN_MAKE_HUB to "/app/make"',
  /screen\s*===\s*SCREEN_MAKE_HUB\)\s*return\s*"\/app\/make"/.test(S));
chk('viewToPath maps SCREEN_EXPLORE_HUB to "/app/explore"',
  /screen\s*===\s*SCREEN_EXPLORE_HUB\)\s*return\s*"\/app\/explore"/.test(S));
chk('viewToPath maps SCREEN_MY_STUFF to "/app/me" (NV4)',
  /screen\s*===\s*SCREEN_MY_STUFF\)\s*return\s*"\/app\/me"/.test(S));

chk('screenForPath maps "" (bare /app) to SCREEN_HOME',
  /if\s*\(!seg\)\s*return\s*\{\s*screen:\s*SCREEN_HOME\s*\}/.test(S));
chk('screenForPath maps "play" to SCREEN_PLAY_HUB',
  /seg\s*===\s*"play"\)\s*return\s*\{\s*screen:\s*SCREEN_PLAY_HUB\s*\}/.test(S));
chk('screenForPath maps "make" to SCREEN_MAKE_HUB',
  /seg\s*===\s*"make"\)\s*return\s*\{\s*screen:\s*SCREEN_MAKE_HUB\s*\}/.test(S));
chk('screenForPath maps "explore" (no id) to SCREEN_EXPLORE_HUB',
  /seg\s*===\s*"explore"\)\s*return\s*\{\s*screen:\s*SCREEN_EXPLORE_HUB\s*\}/.test(S));
chk('screenForPath maps "me" to SCREEN_MY_STUFF (NV4)',
  /seg\s*===\s*"me"\)\s*return\s*\{\s*screen:\s*SCREEN_MY_STUFF\s*\}/.test(S));
chk('screenForPath still maps "creations" to SCREEN_MY_STUFF (back-compat alias)',
  /seg\s*===\s*"creations"\)\s*return\s*\{\s*screen:\s*SCREEN_MY_STUFF\s*\}/.test(S));

// The reload/back plumbing itself has not regressed: the shell restores the
// screen the path names on mount, listens for popstate, and pushes on every
// screen change. NV1/NV3 introduced this via session 2E — NV4 extends it.
chk('shell restores the screen the /app path points at on mount',
  /const\s+parsed\s*=\s*screenForPath\(window\.location\.pathname\);\s*if\s*\(parsed\s*&&\s*parsed\.screen\s*!==\s*SCREEN_HOME\)/.test(S));
chk('shell listens for browser Back / Forward (popstate)',
  /window\.addEventListener\("popstate",\s*onPop\)/.test(S));
chk('shell pushes the /app path on every stable screen change',
  /window\.history\.pushState\(\{\s*screen\s*\},\s*"",\s*path\)/.test(S));

// The bottom-bar handlers each target the RIGHT screen — a tab press must land
// in the section whose address it wrote, not the old NV1 fallback.
chk('Home tab -> SCREEN_HOME',
  /onHome:\s*\(\)\s*=>\s*setScreen\(SCREEN_HOME\)/.test(S));
chk('Play tab -> SCREEN_PLAY_HUB',
  /onPlay:\s*\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)/.test(S));
chk('Make tab -> SCREEN_MAKE_HUB',
  /onMake:\s*\(\)\s*=>\s*setScreen\(SCREEN_MAKE_HUB\)/.test(S));
chk('Explore tab -> SCREEN_EXPLORE_HUB',
  /onExplore:\s*\(\)\s*=>\s*setScreen\(SCREEN_EXPLORE_HUB\)/.test(S));
chk('Me tab -> openMyStuff (SCREEN_MY_STUFF, whose path is /app/me)',
  /onMe:\s*\(\)\s*=>\s*openMyStuff\(SCREEN_HOME\)/.test(S));

// -------------------------------------------------------- 3) soon-last sort
console.log('--- Every card list sorts Coming Soon LAST (never above a real item) ---');
// Play + Make both sort with the same "soon short-circuits" rule. Explore's
// labs and books lists filter to status==="approved" only, so a soon item
// cannot appear there at all.
chk('PlayScreen sort: soon short-circuits to LAST',
  /function\s+PlayScreen[\s\S]{0,3000}if\s*\(!!a\.soon\s*!==\s*!!b\.soon\)\s*return\s*a\.soon\s*\?\s*1\s*:\s*-1/.test(S));
chk('MakeScreen sort: soon short-circuits to LAST',
  /function\s+MakeScreen[\s\S]{0,4000}if\s*\(!!a\.soon\s*!==\s*!!b\.soon\)\s*return\s*a\.soon\s*\?\s*1\s*:\s*-1/.test(S));
chk('Explore labs list filters to approved-only (no soon possible)',
  /labs\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*!==\s*"topic-book"\)/.test(S));
chk('Explore books list filters to approved-only (no soon possible)',
  /books\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*===\s*"topic-book"\)/.test(S));
// The Home suggested row filters live-only + slices to 4 (NV2 shipped this).
chk('Home suggested row filters to live games (!soon)',
  /nv2Suggested[\s\S]{0,600}GAME_CATALOG\.filter\(\(g\)\s*=>\s*g\.type\s*===\s*"game"\s*&&\s*!g\.soon\)/.test(S));

// -------------------------------------------------------- 4) 8-item ceiling
console.log('--- No row on any page shows more than 8 cards before a See All ---');
// Home NV2 suggested row: capped at 4 — well under 8. Same rule any future
// horizontal shelf must obey. The other lists are wrapping grids (they
// paginate DOWN, not sideways) so they do not need a slice cap.
chk('Home suggested row is capped at 4 (< 8) via slice(0, 4)',
  /nv2Suggested[\s\S]{0,900}\.slice\(0,\s*4\)/.test(S));
// Every full-page list of cards is a wrapping grid (gridTemplateColumns,
// display:grid). Guard against a future regression that turns any of the
// major card lists into a flex row that overflows sideways.
[
  ['Play page grid',    'data-nv1-grid'],
  ['Make page grid',    'data-nv3-make-grid'],
  ['Explore labs grid', 'data-nv3-labs-grid'],
  ['Explore books grid','data-nv3-books-grid'],
  ['Home doors grid',   'data-nv2-doors'],
].forEach(([name, hook]) => {
  const re = new RegExp(hook + '[\\s\\S]{0,900}display:\\s*"grid"[\\s\\S]{0,300}gridTemplateColumns');
  chk(name + ' uses display:grid + gridTemplateColumns (wraps, does not scroll sideways)', re.test(S));
});

// -------------------------------------------------------- 5) no emoji
console.log('--- Guardrail: no emoji in the NV4 additions ---');
chk('BottomBar block extracted for emoji scan (again)', !!bar);
chk('no emoji in the NV4-updated BottomBar', !!bar && !emoji.test(bar));

// -------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
