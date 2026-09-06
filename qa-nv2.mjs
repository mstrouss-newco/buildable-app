// Headless QA for NV2 — the New Home screen. Screen 1 has to fit the whole
// app on the first phone view: slim header, one big Keep-playing card, five
// picture doors with LIVE counts (Play 20 games, Make 3 studios, Explore 3
// labs + 14 books, Learn, My Stuff), and four suggested games in a WRAPPING
// GRID. Counts must come from the catalogs and RESPECT the soon flag — never
// hardcoded. A "picture door" means real key art fills the tile; a flat colour
// panel with a small glyph is NOT a picture door and fails here.
//
//   node qa-nv2.mjs .
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

const S = read('src/BuildableKids.jsx');

// -------------------------------------------------------------- 1) MAKE_CATALOG
console.log('--- MAKE_CATALOG: module-scope, so counts are derivable without rendering ---');
chk('MAKE_CATALOG defined at module scope', /^const\s+MAKE_CATALOG\s*=\s*\[/m.test(S));
const MC = /^const\s+MAKE_CATALOG\s*=\s*\[([\s\S]*?)\n\];/m.exec(S);
chk('MAKE_CATALOG block extractable', !!MC);
const mcBody = MC ? MC[1] : '';
const mcEntries = mcBody.split('\n').filter((l) => /{\s*id:/.test(l));
const mcLive = mcEntries.filter((l) => !/soon:\s*true/.test(l));
const mcSoon = mcEntries.filter((l) => /soon:\s*true/.test(l));
chk('MAKE_CATALOG has exactly 3 live studios', mcLive.length === 3, 'live=' + mcLive.length);
chk('MAKE_CATALOG has at least 1 soon studio (soon flag matters)', mcSoon.length >= 1, 'soon=' + mcSoon.length);

// -------------------------------------------------------------- 2) counts derived, not typed
console.log('--- Counts pull from catalogs and respect the soon flag — never hardcoded ---');
chk('Play count = live games in GAME_CATALOG (type==="game" && !soon)',
  /nv2LiveGames\s*=\s*GAME_CATALOG\.filter\(\(g\)\s*=>\s*g\.type\s*===\s*"game"\s*&&\s*!g\.soon\)\.length/.test(S));
chk('Make count = live studios in MAKE_CATALOG (!soon)',
  /nv2LiveStudios\s*=\s*MAKE_CATALOG\.filter\(\(m\)\s*=>\s*!m\.soon\)\.length/.test(S));
chk('Explore labs count = approved non-book EXHIBIT_CATALOG entries',
  /nv2ApprovedLabs\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*!==\s*"topic-book"\)\.length/.test(S));
chk('Explore books count = approved topic-book EXHIBIT_CATALOG entries',
  /nv2ApprovedBooks\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*===\s*"topic-book"\)\.length/.test(S));

// Sanity — the today catalog IS the shipped numbers named on the card.
const CAT = /GAME_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
const catBody = CAT ? CAT[1] : '';
const gameEntries = catBody.split('\n').filter((l) => /{\s*id:/.test(l));
const liveGames = gameEntries.filter((l) => /type:\s*"game"/.test(l) && !/soon:\s*true/.test(l));
chk('catalog TODAY has 21 live games (Play door count today)', liveGames.length === 21, 'live=' + liveGames.length);   // FM3 added The Farm
const EX = /EXHIBIT_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
const exBody = EX ? EX[1] : '';
const exEntries = exBody.split('\n').filter((l) => /{\s*id:/.test(l));
const approvedLabs = exEntries.filter((l) => /status:\s*"approved"/.test(l) && !/template:\s*"topic-book"/.test(l));
const approvedBooks = exEntries.filter((l) => /status:\s*"approved"/.test(l) && /template:\s*"topic-book"/.test(l));
chk('catalog TODAY has 3 approved labs (Explore door labs count)', approvedLabs.length === 3, 'labs=' + approvedLabs.length);
chk('catalog TODAY has 14 approved books (Explore door books count)', approvedBooks.length === 14, 'books=' + approvedBooks.length);

// The door label MUST render the derived formula, not a hardcoded "20 games".
chk('Play door label composes from nv2LiveGames (no hardcoded number)',
  /nv2LiveGames\s*\+\s*"\s*games"/.test(S));
chk('Make door label composes from nv2LiveStudios (no hardcoded number)',
  /nv2LiveStudios\s*\+\s*"\s*studios"/.test(S));
chk('Explore door label composes labs + books (no hardcoded numbers)',
  /nv2ApprovedLabs\s*\+\s*"\s*labs\s*\+\s*"\s*\+\s*nv2ApprovedBooks\s*\+\s*"\s*books"/.test(S));
chk('no hardcoded "20 games" string sneaked into the door labels',
  !/["'`]20\s*games["'`]/.test(S));
chk('no hardcoded "3 studios" string sneaked into the door labels',
  !/["'`]3\s*studios["'`]/.test(S));
chk('no hardcoded "3 labs" string sneaked into the door labels',
  !/["'`]3\s*labs/.test(S));

// -------------------------------------------------------------- 3) NV2 layout DOM markers
console.log('--- Screen 1 layout: slim header, Keep playing, five doors, four suggested ---');
chk('root Home wrapper carries data-nv2-home', /data-nv2-home/.test(S));
chk('slim header carries data-nv2-header',     /data-nv2-header/.test(S));
chk('Keep-playing card carries data-nv2-keep', /data-nv2-keep/.test(S));
chk('doors grid carries data-nv2-doors',       /data-nv2-doors/.test(S));
chk('suggested-games row carries data-nv2-suggested', /data-nv2-suggested/.test(S));

// The five NV2 doors are named + rendered from NV2_DOORS. Grep by data-nv2-door=<id>.
['play', 'make', 'explore', 'learn', 'mystuff'].forEach((id) => {
  chk('door "' + id + '" is rendered from NV2_DOORS', new RegExp('id:\\s*"' + id + '"').test(S));
});
// PT1 added a sixth door (Practice, Coming Soon behind 1111 until PT2) between
// Learn and My Stuff. This check is about the five NV2 doors still being there,
// in order — a later session adding a door must not silently drop one of them.
chk('the five NV2 picture doors are all still there, in order',
  /NV2_DOORS\s*=\s*\[[\s\S]{0,4000}?id:\s*"play"[\s\S]{0,4000}?id:\s*"make"[\s\S]{0,4000}?id:\s*"explore"[\s\S]{0,4000}?id:\s*"learn"[\s\S]{0,4000}?id:\s*"mystuff"/.test(S));

// Doors carry the bottom-bar section colours so a door and its tab match.
chk('Play door uses NAV_TAB_COLORS.play',       /id:\s*"play"[\s\S]{0,400}NAV_TAB_COLORS\.play/.test(S));
chk('Make door uses NAV_TAB_COLORS.make',       /id:\s*"make"[\s\S]{0,400}NAV_TAB_COLORS\.make/.test(S));
chk('Explore door uses NAV_TAB_COLORS.explore', /id:\s*"explore"[\s\S]{0,400}NAV_TAB_COLORS\.explore/.test(S));
chk('My Stuff door uses NAV_TAB_COLORS.me',     /id:\s*"mystuff"[\s\S]{0,400}NAV_TAB_COLORS\.me/.test(S));

// A PICTURE door means real key art fills the tile. An earlier pass shipped flat
// gradient panels with a small centred glyph, which is what these pin down.
['play', 'make', 'explore', 'learn', 'mystuff'].forEach((id) => {
  chk('door "' + id + '" carries real key art (art:)', new RegExp('id:\\s*"' + id + '"[\\s\\S]{0,600}art:\\s*[^,]').test(S));
});
chk('DoorTile paints the art as a full-bleed <img>, gradient only as fallback',
  /DoorTile[\s\S]{0,1600}d\.art\s*&&\s*\([\s\S]{0,300}<img[\s\S]{0,400}objectFit:\s*"cover"/.test(S));
chk('DoorTile veils the art so the name stays readable',
  /DoorTile[\s\S]{0,2200}linear-gradient\(180deg,\s*rgba\(0,0,0/.test(S));
chk('Explore door art comes from an APPROVED book (never an in-review cover)',
  /nv2ExploreArt\s*=\s*\(EXHIBIT_CATALOG\.find\(\(e\)\s*=>\s*e\.status\s*===\s*"approved"/.test(S));
chk('doors are NOT flat panels with a centred glyph (no centre-stacked layout)',
  !/DoorTile[\s\S]{0,900}flexDirection:\s*"column",\s*alignItems:\s*"center",\s*justifyContent:\s*"center"/.test(S));

// -------------------------------------------------------------- 4) Learn door respects the soon gate
console.log('--- Learn door respects the lessons_live flag (soft-gates until owner flip) ---');
chk('Learn door count switches on lessonsLive',
  /id:\s*"learn"[\s\S]{0,400}count:\s*lessonsLive\s*\?/.test(S));
chk('Learn door onClick routes to onLessons directly when lessonsLive is true',
  /id:\s*"learn"[\s\S]{0,600}lessonsLive\s*\?\s*onLessons/.test(S));
chk('Learn door falls back to the 1111 preview gate when Lessons are NOT live',
  /id:\s*"learn"[\s\S]{0,900}setCatalogGate\(\(\)\s*=>\s*onLessons\)/.test(S));

// -------------------------------------------------------------- 5) Suggested games row
console.log('--- Suggested games row: exactly 4, live only, most-played first, NO sideways scroll ---');
chk('nv2Suggested filters to live games (type==="game" && !soon)',
  /nv2Suggested[\s\S]{0,600}GAME_CATALOG\.filter\(\(g\)\s*=>\s*g\.type\s*===\s*"game"\s*&&\s*!g\.soon\)/.test(S));
chk('nv2Suggested trims to at most 4 games',
  /nv2Suggested[\s\S]{0,900}\.slice\(0,\s*4\)/.test(S));
chk('nv2Suggested sorts most-played first (per-kid stats)',
  /nv2PlayCount\[a\.id\][\s\S]{0,200}nv2PlayCount\[b\.id\][\s\S]{0,80}return\s+pb\s*-\s*pa/.test(S));
// THE NV LAW: nothing on Home may require a sideways swipe. Kids stop after 3-4
// cards in a horizontal row and never reach the rest — that is the whole bug NV
// exists to fix. The suggested games WRAP into a grid instead, and the scroll
// cue is vertical (a row cut off by the bottom of the screen).
chk('suggested row is a wrapping GRID, not a swipe row',
  /data-nv2-suggested[\s\S]{0,400}display:\s*"grid"[\s\S]{0,300}gridTemplateColumns/.test(S));
chk('suggested row NEVER scrolls horizontally (no overflowX)',
  !/data-nv2-suggested[\s\S]{0,900}overflowX/.test(S));
chk('suggested row does NOT bleed past the page edge',
  !/data-nv2-suggested[\s\S]{0,900}marginRight:\s*phone\s*\?\s*-/.test(S));

// -------------------------------------------------------------- 6) Keep-playing priority order
console.log('--- Keep-playing card: notifications first, then recent, then favourite, then default ---');
chk('Keep-playing prefers a chess turn first',
  /keepPlaying\s*=[\s\S]{0,1200}chessTurns\s*>\s*0[\s\S]{0,600}kind:\s*"chess-turn"/.test(S));
chk('Keep-playing then a pending friend turn',
  /keepPlaying\s*=[\s\S]{0,2600}friendTurns[\s\S]{0,700}kind:\s*"friend-turn"/.test(S));
// A friend turn must show THAT GAME's art. It used to hardcode ChessGlyph + the
// chess purple, so "Your move in Tic-Tac-Toe" drew a chess pawn.
chk('friend turn looks its game up in GAME_CATALOG (no hardcoded chess art)',
  /kind:\s*"friend-turn"[\s\S]{0,200}/.test(S) &&
  /friendTurns\[0\][\s\S]{0,400}GAME_CATALOG\.find\(\(x\)\s*=>\s*x\.id\s*===\s*m\.game\)/.test(S));
chk('friend invite looks its game up in GAME_CATALOG too',
  /friendInvites\[0\][\s\S]{0,400}GAME_CATALOG\.find\(\(x\)\s*=>\s*x\.id\s*===\s*iv\.game\)/.test(S));
chk('no friend-turn/invite branch still hardcodes <ChessGlyph />',
  !/kind:\s*"friend-(turn|invite)"[\s\S]{0,600}<ChessGlyph/.test(S));
chk('Keep-playing then a pending friend invite',
  /keepPlaying\s*=[\s\S]{0,3300}friendInvites[\s\S]{0,300}kind:\s*"friend-invite"/.test(S));
chk('Keep-playing then a real-time (family) invite',
  /keepPlaying\s*=[\s\S]{0,4200}rtInvite[\s\S]{0,300}kind:\s*"rt-invite"/.test(S));
chk('Keep-playing then the most-recent creation (jumpItems)',
  /keepPlaying\s*=[\s\S]{0,5500}jumpItems[\s\S]{0,300}kind:\s*"recent-"/.test(S));
chk('Keep-playing then the favourite game',
  /keepPlaying\s*=[\s\S]{0,6800}favGame[\s\S]{0,300}kind:\s*"favourite-game"/.test(S));
chk('Keep-playing falls back to a "discover" default so the card never disappears',
  /keepPlaying\s*=[\s\S]{0,7500}kind:\s*"discover"/.test(S));

// -------------------------------------------------------------- 7) product guardrails
console.log('--- Guardrails: no emoji anywhere in the NV2 block ---');
const nv2Match = /\/\/ NV2 — the new above-the-fold layout[\s\S]*?\n  \);\s*\n\}\s*\n/.exec(S);
chk('NV2 block extracted for emoji scan', !!nv2Match);
chk('no emoji in the NV2 addition block (product guardrail)',
  !!nv2Match && !emoji.test(nv2Match[0]));

// The doors ARE inside the same block, and their labels are computed strings,
// so emojis would show up there if anyone tried. Belt-and-braces.
chk('NV2_DOORS block has no emoji',
  !emoji.test((/NV2_DOORS\s*=\s*\[[\s\S]*?\];/.exec(S) || ["", ""])[0]));

// -------------------------------------------------------------- 8) NV1 still wires through
console.log('--- Shell wiring unchanged: HomeScreen still gets all its NV1 props + is rendered ---');
chk('shell still renders <HomeScreen with onGames->PLAY_HUB (NV1 handoff)',
  /<HomeScreen[\s\S]{0,4000}onGames=\{\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)\}/.test(S));
chk('shell still renders BottomBar current="home"', /<BottomBar\s+current="home"/.test(S));

// -------------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
