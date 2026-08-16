// Headless QA for the Home screen — originally NV2 (five picture doors),
// rewritten in NV6 when those doors were deleted.
//
// THE RULE THIS FILE ENFORCES: never repeat the tab bar on the home screen.
// The bottom bar already IS the navigation, so a Play / Make / Explore / Learn /
// My Stuff strip on Home says the same five words twice on one page. A shortcut
// strip on Home is only allowed when it does a job the bar CANNOT (2 players /
// quick game / new this week). This script FAILS if NV2_DOORS or data-nv2-door
// ever come back, and it holds the replacement to its shape: every Home row is
// real content in a WRAPPING GRID with a small "See all" that lands on that
// row's own tab, and the section counts live on the SECTION PAGE headers.
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

// The Home component on its own. Several checks below are about what HOME does,
// and must not trip over the bottom bar (which legitimately owns the five tab
// words) or the coming-soon password modal that sits outside every row.
const homeFn = /function\s+HomeScreen\(props\)\s*\{[\s\S]*?\n\/\/ NV1 — the always-visible 5-tab bottom bar/.exec(S);
const H = homeFn ? homeFn[0] : '';

// Each <HomeRow ...> ... </HomeRow> block, opening tag included. Matched with a
// lazy scan rather than [^>]* because a seeAll arrow function contains ">".
const rowBlocks = H.match(/<HomeRow\s[\s\S]*?<\/HomeRow>/g) || [];
const rowTags = rowBlocks.map((b) => (/<HomeRow\s[\s\S]*?>\s*\n/.exec(b) || [''])[0]);

// ============================================================================
// 1) THE DOORS ARE GONE, AND MAY NEVER COME BACK
// ============================================================================
console.log('--- NV6 law: Home never repeats the tab bar ---');
chk('NV2_DOORS is gone (the five picture doors must never come back)',
  !/NV2_DOORS/.test(S), 'found NV2_DOORS');
chk('data-nv2-door is gone (no door tile markup anywhere)',
  !/data-nv2-door/.test(S), 'found data-nv2-door');
chk('the doors GRID hook data-nv2-doors is gone',
  !/data-nv2-doors/.test(S), 'found data-nv2-doors');
chk('no DoorTile component survives',
  !/DoorTile/.test(S), 'found DoorTile');

// The doors' real sin was the WORDS. Home may still link to a section (a "See
// all" does exactly that) but it may never render the tab bar's own five labels
// as a strip of big buttons. Guard the specific shape: a tile whose visible
// label is one of the tab words.
chk('HomeScreen block extracted', !!homeFn);
chk('no Home tile is labelled with a bottom-bar tab word (Play/Make/Explore/Learn/My Stuff)',
  !/label:\s*"(Play|Make|Explore|Learn|My Stuff)"/.test(H), 'found a tab-word tile label in HomeScreen');

// ============================================================================
// 2) HOME IS ROWS OF REAL CONTENT, EACH A GRID WITH A "See all"
// ============================================================================
console.log('--- Every Home row is a wrapping GRID with a small See all ---');
chk('root Home wrapper still carries data-nv2-home', /data-nv2-home/.test(S));
chk('slim header still carries data-nv2-header', /data-nv2-header/.test(S));

// One shared row component means one place to get the shape right.
const rowFn = /const\s+HomeRow\s*=\s*\(\{[\s\S]*?\n  \);\n/.exec(S);
chk('HomeRow row component exists', !!rowFn);
const rowSrc = rowFn ? rowFn[0] : '';
chk('HomeRow tags each row with data-nv6-row', /data-nv6-row=\{id\}/.test(rowSrc));
chk('HomeRow renders a See all button tagged data-nv6-see-all',
  /data-nv6-see-all=\{id\}[\s\S]{0,400}See all/.test(rowSrc));
chk('HomeRow See all is wired to the row\'s own destination (seeAll prop)',
  /onClick=\{seeAll\}/.test(rowSrc));
chk('HomeRow body is a GRID (display:grid + gridTemplateColumns)',
  /data-nv6-row-grid=\{id\}[\s\S]{0,200}display:\s*"grid"[\s\S]{0,120}gridTemplateColumns/.test(rowSrc));
chk('HomeRow grid NEVER scrolls sideways (no overflowX, no flex swipe row)',
  !/overflowX/.test(rowSrc) && !/flexDirection:\s*"row"/.test(rowSrc));

// Every row on Home must go through HomeRow, and every use must name both an id
// and a See all destination. A row without a See all is a dead end.
chk('Home renders rows through HomeRow', rowTags.length >= 5, 'rows=' + rowTags.length);
rowTags.forEach((u) => {
  const id = (/id="([a-z]+)"/.exec(u) || [])[1] || '?';
  chk('row "' + id + '" passes a See all destination', /seeAll=\{/.test(u));
  chk('row "' + id + '" passes an accent colour for its See all', /accent=/.test(u));
});

// The rows Mike asked for, by name. Keep playing stays the hero CARD above them
// (explicitly unchanged in NV6), so it is not a row and is exempt here.
const ROWS = ['games', 'kidspedia', 'make', 'friend', 'learn', 'kids'];
ROWS.forEach((id) => {
  chk('row "' + id + '" is rendered', new RegExp('<HomeRow\\s+id="' + id + '"').test(S));
});

// Each row's See all lands on THAT row's tab, not somewhere generic.
chk('Games row See all lands on the Play tab (onGames)',
  /<HomeRow\s+id="games"[^>]*seeAll=\{onGames\}/.test(S));
chk('Kidspedia row See all lands on the Explore tab (onExploreHub)',
  /<HomeRow\s+id="kidspedia"[^>]*seeAll=\{onExploreHub/.test(S));
chk('Make row See all lands on the Make tab (onMakeHub)',
  /<HomeRow\s+id="make"[^>]*seeAll=\{onMakeHub/.test(S));
chk('Friend row See all lands on the Play tab (onGames)',
  /<HomeRow\s+id="friend"[^>]*seeAll=\{onGames\}/.test(S));
chk('Learn row See all lands on Lessons (onLessons)',
  /<HomeRow\s+id="learn"[^>]*seeAll=\{onLessons\}/.test(S));
chk('Made-by-other-kids row See all lands on the top board (onTop)',
  /<HomeRow\s+id="kids"[^>]*seeAll=\{onTop\}/.test(S));

// ============================================================================
// 3) ROWS BUILD FROM THE CATALOGS AND RESPECT THE soon FLAG
// ============================================================================
console.log('--- Rows derive from the catalogs and respect soon / approved ---');
chk('MAKE_CATALOG still defined at module scope', /^const\s+MAKE_CATALOG\s*=\s*\[/m.test(S));
chk('Games row filters to live games (type==="game" && !soon)',
  /nv2Suggested[\s\S]{0,600}GAME_CATALOG\.filter\(\(g\)\s*=>\s*g\.type\s*===\s*"game"\s*&&\s*!g\.soon\)/.test(S));
chk('Games row trims to at most 4',
  /nv2Suggested[\s\S]{0,900}\.slice\(0,\s*4\)/.test(S));
chk('Games row sorts most-played first (per-kid stats)',
  /nv2PlayCount\[a\.id\][\s\S]{0,200}nv2PlayCount\[b\.id\][\s\S]{0,80}return\s+pb\s*-\s*pa/.test(S));
chk('Kidspedia row takes only APPROVED topic books (never an in-review cover)',
  /nv6Books\s*=\s*EXHIBIT_CATALOG[\s\S]{0,200}ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*===\s*"topic-book"/.test(S));
chk('Kidspedia row shows exactly 3 book covers',
  /nv6Books\s*=[\s\S]{0,320}\.slice\(-3\)/.test(S));
chk('Kidspedia cards paint the REAL cover art (heroArt), not a word',
  /data-nv6-book[\s\S]{0,240}art=\{b\.heroArt\}/.test(S));
chk('Make row filters to live studios (!soon)',
  /nv6Studios\s*=\s*MAKE_CATALOG\.filter\(\(m\)\s*=>\s*!m\.soon\)/.test(S));
chk('Friend row filters to LIVE 2-player games (!soon && multiplayer)',
  /nv6FriendGames\s*=\s*GAME_CATALOG[\s\S]{0,220}!g\.soon\s*&&\s*g\.multiplayer/.test(S));

// The friend row is the ONE shortcut Home is allowed, and only while it has
// something real to show.
chk('Friend row renders ONLY when a live 2-player game exists',
  /\{nv6FriendGames\.length\s*>\s*0\s*&&\s*\(\s*\n?\s*<HomeRow\s+id="friend"/.test(S));

// ============================================================================
// 4) LEARN JOINS AS A ROW ONLY WHEN THE SWITCH IS FLIPPED
// ============================================================================
console.log('--- Learn is a real row or nothing at all — never a dead Coming Soon tile ---');
chk('Learn row is gated on lessonsLive',
  /\{lessonsLive\s*&&\s*nv6Subjects\.length\s*>\s*0\s*&&\s*\(\s*\n?\s*<HomeRow\s+id="learn"/.test(S));
chk('Learn subjects are cleared when lessons are not live',
  /if\s*\(!lessonsLive\)\s*\{\s*setNv6Subjects\(\[\]\)/.test(S));
chk('Learn subjects come from the live lesson map, with the static file as fallback',
  /fetch\("\/api\/lesson-map"[\s\S]{0,400}\/lessons\/index\.json/.test(S));
chk('a subject only earns a card once it has an APPROVED lesson',
  /l\.status\s*===\s*"approved"[\s\S]{0,120}ready\.add\(p\.subject\)/.test(S));
chk('no "Coming soon" tile is rendered inside any Home row',
  rowBlocks.every((b) => !/Coming soon/i.test(b)),
  'offenders=' + rowBlocks.filter((b) => /Coming soon/i.test(b)).length);

// ============================================================================
// 5) THE COUNTS MOVED TO THE SECTION PAGE HEADERS
// ============================================================================
console.log('--- 20 games / 14 books / 3 studios live on the SECTION PAGE headers ---');
chk('Play page header carries the games count (data-nv6-count="play")',
  /data-nv6-count="play"[\s\S]{0,200}GAMES\.filter\(\(g\)\s*=>\s*!g\.soon\)\.length\}\s*games/.test(S));
chk('Make page header carries the studios count (data-nv6-count="make")',
  /data-nv6-count="make"[\s\S]{0,160}\{liveStudios\}\s*studios/.test(S));
chk('Explore page header carries labs + books (data-nv6-count="explore")',
  /data-nv6-count="explore"[\s\S]{0,200}\{labs\.length\}\s*labs\s*\+\s*\{books\.length\}\s*books/.test(S));
chk('no count string is hardcoded ("20 games")', !/["'`]20\s*games["'`]/.test(S));
chk('no count string is hardcoded ("3 studios")', !/["'`]3\s*studios["'`]/.test(S));
chk('no count string is hardcoded ("14 books")', !/["'`]14\s*books/.test(S));

// Sanity — today's catalogs ARE the numbers those headers print.
const CAT = /GAME_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
const gameEntries = (CAT ? CAT[1] : '').split('\n').filter((l) => /{\s*id:/.test(l));
const liveGames = gameEntries.filter((l) => /type:\s*"game"/.test(l) && !/soon:\s*true/.test(l));
chk('catalog TODAY has 20 live games (Play header)', liveGames.length === 20, 'live=' + liveGames.length);
const MC = /^const\s+MAKE_CATALOG\s*=\s*\[([\s\S]*?)\n\];/m.exec(S);
const mcEntries = (MC ? MC[1] : '').split('\n').filter((l) => /{\s*id:/.test(l));
const mcLive = mcEntries.filter((l) => !/soon:\s*true/.test(l));
chk('catalog TODAY has 3 live studios (Make header + Make row)', mcLive.length === 3, 'live=' + mcLive.length);
chk('MAKE_CATALOG still has at least 1 soon studio (so the soon flag is exercised)',
  mcEntries.length - mcLive.length >= 1);
const EX = /EXHIBIT_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
const exEntries = (EX ? EX[1] : '').split('\n').filter((l) => /{\s*id:/.test(l));
const approvedLabs = exEntries.filter((l) => /status:\s*"approved"/.test(l) && !/template:\s*"topic-book"/.test(l));
const approvedBooks = exEntries.filter((l) => /status:\s*"approved"/.test(l) && /template:\s*"topic-book"/.test(l));
chk('catalog TODAY has 3 approved labs (Explore header)', approvedLabs.length === 3, 'labs=' + approvedLabs.length);
chk('catalog TODAY has 14 approved books (Explore header)', approvedBooks.length === 14, 'books=' + approvedBooks.length);
chk('Kidspedia row has enough approved books to fill its 3 covers', approvedBooks.length >= 3);
const liveMultiplayer = gameEntries.filter((l) => /type:\s*"game"/.test(l) && !/soon:\s*true/.test(l) && /multiplayer:\s*true/.test(l));
chk('catalog TODAY has at least one live 2-player game (so the friend row shows)',
  liveMultiplayer.length >= 1, 'live 2p=' + liveMultiplayer.length);

// ============================================================================
// 6) KEEP PLAYING IS UNCHANGED — INCLUDING THE NV5 FRIEND-TURN ART FIX
// ============================================================================
console.log('--- Keep playing: unchanged hero card, notifications first ---');
chk('Keep-playing card still carries data-nv2-keep', /data-nv2-keep/.test(S));
chk('Keep-playing prefers a chess turn first',
  /keepPlaying\s*=[\s\S]{0,1200}chessTurns\s*>\s*0[\s\S]{0,600}kind:\s*"chess-turn"/.test(S));
chk('Keep-playing then a pending friend turn',
  /keepPlaying\s*=[\s\S]{0,2600}friendTurns[\s\S]{0,700}kind:\s*"friend-turn"/.test(S));
// NV5 fix: a friend turn shows THAT game's art. It used to draw a chess pawn on
// a purple chess gradient for every friend turn, including tic-tac-toe.
chk('NV5 fix held: friend turn looks its game up in GAME_CATALOG',
  /friendTurns\[0\][\s\S]{0,400}GAME_CATALOG\.find\(\(x\)\s*=>\s*x\.id\s*===\s*m\.game\)/.test(S));
chk('NV5 fix held: friend invite looks its game up in GAME_CATALOG too',
  /friendInvites\[0\][\s\S]{0,400}GAME_CATALOG\.find\(\(x\)\s*=>\s*x\.id\s*===\s*iv\.game\)/.test(S));
chk('NV5 fix held: no friend-turn/invite branch hardcodes <ChessGlyph />',
  !/kind:\s*"friend-(turn|invite)"[\s\S]{0,600}<ChessGlyph/.test(S));
chk('Keep-playing then a real-time (family) invite',
  /keepPlaying\s*=[\s\S]{0,4200}rtInvite[\s\S]{0,300}kind:\s*"rt-invite"/.test(S));
chk('Keep-playing then the most-recent creation (jumpItems)',
  /keepPlaying\s*=[\s\S]{0,5500}jumpItems[\s\S]{0,300}kind:\s*"recent-"/.test(S));
chk('Keep-playing then the favourite game',
  /keepPlaying\s*=[\s\S]{0,6800}favGame[\s\S]{0,300}kind:\s*"favourite-game"/.test(S));
chk('Keep-playing falls back to a "discover" default so the card never disappears',
  /keepPlaying\s*=[\s\S]{0,7500}kind:\s*"discover"/.test(S));

// ============================================================================
// 7) PRODUCT GUARDRAILS
// ============================================================================
console.log('--- Guardrails: no emoji anywhere in the Home block ---');
const homeBlock = /\/\/ NV6 — Home shows THINGS[\s\S]*?\n\/\/ NV1 — the always-visible 5-tab bottom bar/.exec(S);
chk('Home NV6 block extracted for emoji scan', !!homeBlock);
chk('no emoji in the Home NV6 block (product guardrail)',
  !!homeBlock && !emoji.test(homeBlock[0]));

// ============================================================================
// 8) SHELL WIRING UNCHANGED
// ============================================================================
console.log('--- Shell wiring: HomeScreen still gets its props + the bar is still there ---');
chk('shell still renders <HomeScreen with onGames->PLAY_HUB',
  /<HomeScreen[\s\S]{0,4000}onGames=\{\(\)\s*=>\s*setScreen\(SCREEN_PLAY_HUB\)\}/.test(S));
chk('shell still renders BottomBar current="home"', /<BottomBar\s+current="home"/.test(S));
chk('the bottom bar is still the navigation (5 tabs)',
  /TABS\s*=\s*\[[\s\S]{0,700}id:\s*"home"[\s\S]{0,700}id:\s*"play"[\s\S]{0,700}id:\s*"make"[\s\S]{0,700}id:\s*"explore"[\s\S]{0,700}id:\s*"me"/.test(S));

// ---------------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
