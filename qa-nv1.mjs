// Headless QA for NV1 — the always-visible 5-tab bottom bar (Home, Play, Make,
// Explore, Me) and the new Play page that turns the Home Play shelf into a full
// grid.
//
// The bar + page live inside src/BuildableKids.jsx (Vite bundle, no headless
// game loop), so this harness proves what CAN be checked deterministically:
// tabs and colours are present in the source, the Me tab uses the kid's own
// avatar (not a generic face), the Play page has filter chips + a wrapping
// 2-column grid, the sort is live-first / soon-last, and the shell wires both
// screens through with the BottomBar rendered.
//
//   node qa-nv1.mjs .
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

// ---------------------------------------------------------------- 1) constants
console.log('--- NV1 constants + URL routing ---');
chk('SCREEN_PLAY_HUB constant defined', /const\s+SCREEN_PLAY_HUB\s*=\s*"play_hub"/.test(S));
chk('viewToPath maps SCREEN_PLAY_HUB to /app/play', /SCREEN_PLAY_HUB.*"\/app\/play"/s.test(S));
chk('screenForPath maps "play" segment to SCREEN_PLAY_HUB',
  /seg\s*===\s*"play".*SCREEN_PLAY_HUB/s.test(S));

// ---------------------------------------------------------------- 2) BottomBar
console.log('--- BottomBar: 5 tabs, Set A shapes in Set C colours, never grey ---');
chk('BottomBar component defined', /function\s+BottomBar\s*\(/.test(S));
// The five tab colours from the card (Home orange, Play blue, Make pink,
// Explore green, Me purple). All five must be present verbatim.
const NAV = /NAV_TAB_COLORS\s*=\s*\{([^}]+)\}/.exec(S);
chk('NAV_TAB_COLORS block found', !!NAV);
const NAVstr = NAV ? NAV[1] : '';
chk('Home tab = orange F0972A',   /home\s*:\s*"#F0972A"/.test(NAVstr));
chk('Play tab = blue 2FB7D6',     /play\s*:\s*"#2FB7D6"/.test(NAVstr));
chk('Make tab = pink E0578F',     /make\s*:\s*"#E0578F"/.test(NAVstr));
chk('Explore tab = green 2E7D4F', /explore\s*:\s*"#2E7D4F"/.test(NAVstr));
chk('Me tab = purple 6A4FE0',     /me\s*:\s*"#6A4FE0"/.test(NAVstr));

// Resting tab keeps its colour on a soft tint, NEVER grey. Selected fills the
// pill with the tab colour. We prove this via the computed bg + fg values.
chk('resting background is the tab colour on a soft tint (never grey)',
  /const\s+bg\s*=\s*sel\s*\?\s*color\s*:\s*color\s*\+\s*"26"/.test(S));
chk('selected fills the pill with the tab colour',
  /const\s+bg\s*=\s*sel\s*\?\s*color\s*:/.test(S));
chk('selected glyph flips white',
  /const\s+fg\s*=\s*sel\s*\?\s*"#FFFFFF"\s*:\s*color/.test(S));
// The word is always under the icon: the tab pill uses flexDirection:"column",
// icon span first, label span second.
chk('word always under icon (column layout)', /flexDirection:\s*"column"/.test(S));
// Set A chunky solid shapes, and they are SPECIFIC shapes Mike picked off the
// mock: a house, a GAME CONTROLLER, a PAINT PALETTE, an OPEN BOOK. An earlier
// pass shipped a play triangle, a sparkle and a gem because this file only
// asserted "some filled path" — so each check below pins the actual geometry.
chk('Home glyph is a chunky solid house path', /NavHomeGlyph[\s\S]{0,200}<path[\s\S]{0,200}fill="currentColor"/.test(S));
// Controller = pill body + d-pad + 2 round buttons, cut out with evenodd.
chk('Play glyph is a GAME CONTROLLER, not a play triangle',
  /NavPlayGlyph[\s\S]{0,700}fillRule="evenodd"[\s\S]{0,700}A5\.375 5\.375/.test(S));
chk('Play glyph has a d-pad and two button cut-outs',
  /NavPlayGlyph[\s\S]{0,900}A1\.15 1\.15[\s\S]{0,300}A1\.15 1\.15/.test(S));
// Palette = blob + thumb notch + four paint wells cut out with evenodd.
chk('Make glyph is a PAINT PALETTE, not a sparkle',
  /NavMakeGlyph[\s\S]{0,700}fillRule="evenodd"[\s\S]{0,900}A1\.5 1\.5[\s\S]{0,400}A1\.5 1\.5[\s\S]{0,400}A1\.5 1\.5/.test(S));
// Open book = TWO page subpaths with a gap between them for the spine.
chk('Explore glyph is an OPEN BOOK (two page shapes), not a gem',
  /NavExploreGlyph[\s\S]{0,600}d="M11\.1 6\.9[\s\S]{0,400}M12\.9 6\.9/.test(S));
chk('Explore glyph is NOT the old disc-with-diamond compass',
  !/NavExploreGlyph[\s\S]{0,300}A10 10 0 1 0/.test(S));

// Me tab: card mandate — use the kid's own initial + gradient avatar circle,
// NOT a generic face glyph. If Mike later asks to flip it to a face glyph,
// remove NavMeAvatar and drop in a NavMeGlyph — that trigger is why we assert
// the avatar path here, not any specific face SVG.
chk('Me tab renders the kid avatar (initial + kid gradient) instead of a glyph',
  /isMe\s*\?\s*\([\s\S]{0,800}background:\s*kidGrad[\s\S]{0,800}\{kidInit\}/.test(S));
chk('the Me avatar gradient comes from the kid\'s own name (not a fixed palette)',
  /const\s+kidGrad\s*=\s*navPillGrad\(kidName\)/.test(S));
chk('Me tab has NO generic face SVG (no eyes/mouth path)', !/NavMeFaceGlyph|NavMeGlyph/.test(S));
chk('bottom bar is always-visible (position: fixed, bottom: 0)',
  /position:\s*"fixed"[\s\S]{0,300}bottom:\s*0/.test(S));

// ---------------------------------------------------------------- 3) PlayScreen
console.log('--- Play page: filter chips + wrapping 2-column grid ---');
chk('PlayScreen component defined', /function\s+PlayScreen\s*\(/.test(S));
chk('Play page has category filter chips',      /data-nv1-chips/.test(S));
chk('Play page renders a chip per category',    /GAMES\.map\(\(g\)\s*=>\s*g\.category\)/.test(S));
chk('Play page includes an "All" chip',         /CATS\s*=\s*\["All"\]/.test(S));
chk('Play page has a wrapping grid',            /data-nv1-grid/.test(S));
chk('grid uses 2 columns on phone (repeat(2, 1fr))', /cols\s*=\s*phone\s*\?\s*2/.test(S));

// Sort: live first, then most-played-first (per-kid), Coming Soon LAST.
chk('sort puts Coming Soon LAST (a.soon vs b.soon short-circuits first)',
  /if\s*\(!!a\.soon\s*!==\s*!!b\.soon\)\s*return\s*a\.soon\s*\?\s*1\s*:\s*-1/.test(S));
chk('sort ranks live games by most-played first (per-kid stats)',
  /playCount\[a\.id\][\s\S]{0,120}playCount\[b\.id\][\s\S]{0,80}return\s+pb\s*-\s*pa/.test(S));
chk('sort tiebreaker keeps catalog order (stable)',
  /catalogIndex\.get\(a\.id\)\s*-\s*catalogIndex\.get\(b\.id\)/.test(S));

// The grid must render every game in the catalog (type === "game"), NOT just
// the live subset — Coming Soon go LAST but they still ship.
chk('Play page filters to type==="game" (music-maker is a studio, not a game)',
  /GAMES\s*=\s*GAME_CATALOG\.filter\(\(g\)\s*=>\s*g\.type\s*===\s*"game"\)/.test(S));

// ---------------------------------------------------------------- 4) games list
console.log('--- GAME_CATALOG: at least 20 live games, some Coming Soon ---');
const CAT = /GAME_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
chk('GAME_CATALOG block found', !!CAT);
const catBody = CAT ? CAT[1] : '';
const entries = catBody.split('\n').filter((l) => /{\s*id:/.test(l));
const gameEntries = entries.filter((l) => /type:\s*"game"/.test(l));
const liveGames = gameEntries.filter((l) => !/soon:\s*true/.test(l));
const soonGames = gameEntries.filter((l) => /soon:\s*true/.test(l));
chk('at least 20 live games in the catalog', liveGames.length >= 20, 'live=' + liveGames.length);
chk('at least 1 Coming Soon game in the catalog (so the "soon last" sort matters)',
  soonGames.length >= 1, 'soon=' + soonGames.length);

// ---------------------------------------------------------------- 5) shell wiring
console.log('--- Shell wiring: BottomBar rendered on Home AND Play ---');
chk('shell renders BottomBar on Home (current="home")', /<BottomBar\s+current="home"/.test(S));
chk('shell renders SCREEN_PLAY_HUB branch with PlayScreen',
  /screen\s*===\s*SCREEN_PLAY_HUB[\s\S]{0,3000}<PlayScreen/.test(S));
chk('shell renders BottomBar on Play (current="play")', /<BottomBar\s+current="play"/.test(S));
chk('bottomBarProps carries activeKid (Me tab needs the kid gradient)',
  /const\s+bottomBarProps\s*=\s*\{[\s\S]{0,400}activeKid,/.test(S));
chk('Home tab wires to SCREEN_HOME',       /onHome:\s*\(\)\s*=>\s*setScreen\(SCREEN_HOME\)/.test(S));
chk('Play tab wires to SCREEN_PLAY_HUB',   /onPlay:\s*\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)/.test(S));
// NV3 shipped dedicated Make / Explore hubs. The Me tab still opens My Stuff
// (that IS the "Me" page). qa-nv3.mjs owns the assertions for the new hubs;
// this file just proves the Me + non-Kidspedia routing didn't regress.
chk('Me tab routes to My Stuff', /onMe:[^,]*openMyStuff/.test(S));
// The Home "Games" tile used to no-op (setScreen SCREEN_HOME); redirect it to
// the new Play page so the entry point is consistent with the bottom-bar tab.
chk('Home Games tile now opens the new Play page',
  /onGames=\{\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)\}/.test(S));

// ---------------------------------------------------------------- 6) guardrails
console.log('--- Guardrails: no emoji anywhere in the NV1 additions ---');
// NV1 added two things and GN2 split them across two files, so scan both:
// src/BottomBar.jsx IS the bar addition end to end, and the Play page runs from
// its marker comment down to just before HELPER_VOICES in the shell.
const BAR_FILE = read('src/BottomBar.jsx');
const playMatch = /\/\/ NV1 — the Play page[\s\S]*?(?=\nconst HELPER_VOICES\b)/.exec(read('src/BuildableKids.jsx'));
chk('NV1 Play-page block extracted for emoji scan', !!playMatch);
chk('no emoji in the bottom bar (product guardrail)', !emoji.test(BAR_FILE));
chk('no emoji in the NV1 Play page (product guardrail)',
  !!playMatch && !emoji.test(playMatch[0]));

// ---------------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
