// Headless QA for NV3 — every section (Make, Explore, Learn, Me) shares the
// Play page shape: back arrow, count, filter chips, wrapping grid. The Explore
// page splits into "Labs you can play with" (Weather Lab, Journey to the Deep,
// Solar System) and "Picture books" with topic chips. The Learn door on Home
// keeps opening the existing lessons path. Me = the existing My Stuff wrapped
// in the shared BottomBar so the Me tab lights up wherever a kid entered from.
//
//   node qa-nv3.mjs .
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

// ---------------------------------------------------------------- 1) constants + URL routing
console.log('--- NV3 constants + URL routing ---');
chk('SCREEN_MAKE_HUB constant defined', /const\s+SCREEN_MAKE_HUB\s*=\s*"make_hub"/.test(S));
chk('SCREEN_EXPLORE_HUB constant defined', /const\s+SCREEN_EXPLORE_HUB\s*=\s*"explore_hub"/.test(S));
chk('viewToPath maps SCREEN_MAKE_HUB to /app/make',
  /screen\s*===\s*SCREEN_MAKE_HUB[\s\S]{0,60}"\/app\/make"/.test(S));
chk('viewToPath maps SCREEN_EXPLORE_HUB to /app/explore',
  /screen\s*===\s*SCREEN_EXPLORE_HUB[\s\S]{0,60}"\/app\/explore"/.test(S));
chk('screenForPath maps "make" segment to SCREEN_MAKE_HUB',
  /seg\s*===\s*"make"[\s\S]{0,80}SCREEN_MAKE_HUB/.test(S));
chk('screenForPath maps "explore" (no id) to SCREEN_EXPLORE_HUB',
  /seg\s*===\s*"explore"[\s\S]{0,80}SCREEN_EXPLORE_HUB/.test(S));
chk('screenForPath still routes explore/<id> to SCREEN_EXPLORE (existing viewer)',
  /"explore\/"[\s\S]{0,300}SCREEN_EXPLORE[\s\S]{0,40}exploreId/.test(S));

// ---------------------------------------------------------------- 2) bottom-bar wiring (no more temporary fallbacks)
console.log('--- Bottom-bar tabs now route to their dedicated hubs (no NV1 fallbacks) ---');
chk('Make tab routes to SCREEN_MAKE_HUB',
  /onMake:\s*\(\)\s*=>\s*setScreen\(SCREEN_MAKE_HUB\)/.test(S));
chk('Explore tab routes to SCREEN_EXPLORE_HUB',
  /onExplore:\s*\(\)\s*=>\s*setScreen\(SCREEN_EXPLORE_HUB\)/.test(S));
chk('Me tab still opens My Stuff', /onMe:\s*\(\)\s*=>\s*openMyStuff/.test(S));
chk('Explore tab no longer jumps straight to Kidspedia (SCREEN_EXPLORE)',
  !/onExplore:[^,]*setExploreId\("kidspedia"\)/.test(S));

// ---------------------------------------------------------------- 3) shell renders the new hubs + BottomBar
console.log('--- Shell renders each hub with the shared BottomBar (current= its tab id) ---');
chk('shell renders SCREEN_MAKE_HUB branch with MakeScreen',
  /screen\s*===\s*SCREEN_MAKE_HUB[\s\S]{0,1200}<MakeScreen/.test(S));
chk('BottomBar current="make" on the Make hub',
  /<MakeScreen[\s\S]{0,1200}<BottomBar\s+current="make"/.test(S));
chk('shell renders SCREEN_EXPLORE_HUB branch with ExploreHubScreen',
  /screen\s*===\s*SCREEN_EXPLORE_HUB[\s\S]{0,1200}<ExploreHubScreen/.test(S));
chk('BottomBar current="explore" on the Explore hub',
  /<ExploreHubScreen[\s\S]{0,1200}<BottomBar\s+current="explore"/.test(S));
chk('Me = My Stuff wrapped with BottomBar current="me"',
  /screen\s*===\s*SCREEN_MY_STUFF[\s\S]{0,600}<MyStuffScreen[\s\S]{0,600}<BottomBar\s+current="me"/.test(S));

// ---------------------------------------------------------------- 4) MakeScreen: same shape as Play
console.log('--- Make page shape: back arrow, count, filter chips, wrapping grid ---');
chk('MakeScreen component defined', /function\s+MakeScreen\s*\(/.test(S));
chk('Make page root carries data-nv3-make-page', /data-nv3-make-page/.test(S));
chk('Make page has a back button (data-nv3-back)', /function\s+MakeScreen[\s\S]*?data-nv3-back[\s\S]*?function\s+ExploreHubScreen/s.test(S));
chk('Make page has a count line ("studios")', /\{liveStudios\}\s*studios/.test(S));
chk('Make page has filter chips (data-nv3-make-chips)', /data-nv3-make-chips/.test(S));
chk('Make page has a wrapping grid (data-nv3-make-grid)', /data-nv3-make-grid/.test(S));
chk('grid uses 2 columns on phone (repeat(2, 1fr))',
  /function\s+MakeScreen[\s\S]{0,4000}cols\s*=\s*phone\s*\?\s*2/.test(S));

// Sort: live first, Coming Soon LAST. Same rule as Play so soon never sits above a real studio.
chk('Make sort puts Coming Soon LAST (soon short-circuits)',
  /function\s+MakeScreen[\s\S]{0,4000}if\s*\(!!a\.soon\s*!==\s*!!b\.soon\)\s*return\s*a\.soon\s*\?\s*1\s*:\s*-1/.test(S));

// Chips: derived from MAKE_CATALOG.category (adding a studio with a new category
// = one row, no chip-list change). "All" is always present.
chk('Make chips derive from MAKE_CATALOG.category (not hardcoded)',
  /CATS\s*=\s*\["All"\]\.concat\(Array\.from\(new Set\(MAKE_CATALOG\.map\(\(m\)\s*=>\s*m\.category\)\)\)\)/.test(S));

// MAKE_CATALOG carries a category on every entry (chips are honest with the data).
console.log('--- MAKE_CATALOG carries a category on every entry (drives the chips) ---');
const MC = /^const\s+MAKE_CATALOG\s*=\s*\[([\s\S]*?)\n\];/m.exec(S);
chk('MAKE_CATALOG block extractable', !!MC);
const mcEntries = (MC ? MC[1] : '').split('\n').filter((l) => /{\s*id:/.test(l));
const withCat = mcEntries.filter((l) => /category:\s*"/.test(l));
chk('every MAKE_CATALOG entry names a category', mcEntries.length > 0 && withCat.length === mcEntries.length,
  'entries=' + mcEntries.length + ' withCategory=' + withCat.length);

// Coming Soon gate — the SAME 1111 that gates Home + Play. If the studio has
// soon: true, tapping opens a gate; the wrong password says so.
chk('Make page shows the 1111 preview gate for soon studios',
  /function\s+MakeScreen[\s\S]{0,5500}pw\s*===\s*"1111"/.test(S));

// ---------------------------------------------------------------- 5) ExploreHubScreen: labs + books with topic chips
console.log('--- Explore page shape: labs section + books section with topic chips ---');
chk('ExploreHubScreen component defined', /function\s+ExploreHubScreen\s*\(/.test(S));
chk('Explore page root carries data-nv3-explore-page', /data-nv3-explore-page/.test(S));
chk('Explore page has a back button (data-nv3-back inside ExploreHubScreen)',
  /function\s+ExploreHubScreen[\s\S]*?data-nv3-back[\s\S]*?const\s+HELPER_VOICES/s.test(S));
chk('Explore page count = "X labs + Y books" (derived from EXHIBIT_CATALOG)',
  /\{labs\.length\}\s*labs\s*\+\s*\{books\.length\}\s*books/.test(S));

// Labs section: three approved non-book exhibits today.
chk('Labs section carries the "Labs you can play with" heading',
  /data-nv3-labs-heading[\s\S]{0,120}Labs you can play with/.test(S));
chk('Labs grid carries data-nv3-labs-grid', /data-nv3-labs-grid/.test(S));
chk('Labs list filters EXHIBIT_CATALOG to approved non-books',
  /labs\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*!==\s*"topic-book"\)/.test(S));

// Books section: topic chips + wrapping grid.
chk('Books section carries the "Picture books" heading',
  /data-nv3-books-heading[\s\S]{0,120}Picture books/.test(S));
chk('Books chip row carries data-nv3-book-chips', /data-nv3-book-chips/.test(S));
chk('Books grid carries data-nv3-books-grid', /data-nv3-books-grid/.test(S));
chk('Books list filters EXHIBIT_CATALOG to approved topic-books',
  /books\s*=\s*EXHIBIT_CATALOG\.filter\(\(ex\)\s*=>\s*ex\.status\s*===\s*"approved"\s*&&\s*ex\.template\s*===\s*"topic-book"\)/.test(S));
chk('Book topic chips derive from books.topic (not hardcoded)',
  /TOPICS\s*=\s*\["All"\]\.concat\(Array\.from\(new Set\(books\.map\(\(b\)\s*=>\s*b\.topic\)\)\)\)/.test(S));

// Tapping a lab/book opens the existing /explore/<id> viewer through the shell.
chk('Explore page opens exhibits via onOpenExhibit (routes to /explore/<id>)',
  /onOpenExhibit\s*&&\s*onOpenExhibit\(ex\.id\)/.test(S));
chk('shell wires ExploreHubScreen onOpenExhibit -> SCREEN_EXPLORE with exploreId',
  /onOpenExhibit=\{\(id\)\s*=>\s*\{\s*setExploreId\(id\);\s*setScreen\(SCREEN_EXPLORE\)/.test(S));

// The card names three labs (Weather Lab, Journey to the Deep, Solar System) —
// prove EXHIBIT_CATALOG still has those exact ids approved today, so the labs
// section renders the promised three.
console.log('--- EXHIBIT_CATALOG today: the three labs the card names ---');
const EX = /EXHIBIT_CATALOG\s*=\s*\[([\s\S]*?)\n\];/.exec(S);
const exBody = EX ? EX[1] : '';
const hasApproved = (id) => new RegExp('id:\\s*"' + id + '"[\\s\\S]{0,400}status:\\s*"approved"').test(exBody);
chk('Solar System lab is approved', hasApproved('solar-system'));
chk('Journey to the Deep lab is approved', hasApproved('ocean-deep'));
chk('Weather Lab (make-it-rain) is approved', hasApproved('make-it-rain'));

// ---------------------------------------------------------------- 6) Home doors open the new hubs
console.log('--- Home Make + Explore doors open the new section hubs ---');
chk('HomeScreen destructures onMakeHub + onExploreHub props',
  /function\s+HomeScreen[\s\S]{0,600}onMakeHub[\s\S]{0,200}onExploreHub/.test(S));
chk('Make door onClick prefers onMakeHub',
  /id:\s*"make"[\s\S]{0,400}onClick:\s*onMakeHub/.test(S));
chk('Explore door onClick prefers onExploreHub',
  /id:\s*"explore"[\s\S]{0,400}onClick:\s*onExploreHub/.test(S));
chk('shell passes onMakeHub={() => setScreen(SCREEN_MAKE_HUB)}',
  /onMakeHub=\{\(\)\s*=>\s*setScreen\(SCREEN_MAKE_HUB\)\}/.test(S));
chk('shell passes onExploreHub={() => setScreen(SCREEN_EXPLORE_HUB)}',
  /onExploreHub=\{\(\)\s*=>\s*setScreen\(SCREEN_EXPLORE_HUB\)\}/.test(S));

// Learn door on Home still opens the existing lessons path (card says
// "Learn = the lessons path" — no new lessons UI is in scope for NV3).
chk('Learn door still routes to onLessons (the existing lessons path)',
  /id:\s*"learn"[\s\S]{0,600}onLessons/.test(S));

// ---------------------------------------------------------------- 7) guardrails
console.log('--- Guardrails: no emoji anywhere in the NV3 additions ---');
// Anchor to the actual function bodies (there are multiple "NV3 — the ..."
// comments in the file — the shell branches carry the same wording — so a
// comment-anchored extraction would capture unrelated code).
const nv3Make = /const\s+MakeGlyphSong\s*=[\s\S]*?function\s+ExploreHubScreen/.exec(S);
chk('NV3 Make block extracted for emoji scan', !!nv3Make);
chk('no emoji in the NV3 Make block', !!nv3Make && !emoji.test(nv3Make[0]));
const nv3Explore = /function\s+ExploreHubScreen[\s\S]*?(?=\nconst HELPER_VOICES\b)/.exec(S);
chk('NV3 Explore block extracted for emoji scan', !!nv3Explore);
chk('no emoji in the NV3 Explore block', !!nv3Explore && !emoji.test(nv3Explore[0]));

// ---------------------------------------------------------------- summary
console.log('---');
console.log(ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
