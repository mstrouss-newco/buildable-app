// qa-kidgames.mjs — Session CB1. The gate for KID-MADE GAMES.
//
// A kid-made game is a manifest the kid owns pointed at an engine we already
// ship. Nothing here needs a network or a browser: the shared loader
// (public/buildable-manifest.js) and the server's own gate (api/kid-game.js)
// are the SAME code the site runs, so they are run for real, in jsdom and in a
// vm sandbox, against all four Cobuild engines.
//
// What it proves, end to end:
//   1. SAVE     a kid manifest for each engine passes the server's gate.
//   2. VALIDATE the gate is the shared validator, so an engine's own level rules
//               (breaker layouts + painted cells, sling layouts, croc stages) apply.
//   3. REFUSE   junk is refused with errors, and never quietly stored: a manifest
//               for the wrong engine, an empty level list, an off-board brick, a
//               difficulty outside 1-5.
//   4. FORK     every stock manifest we ship is forkable (it passes the same
//               gate), and the ownership rule only opens a kid's game to its own
//               family or when it is public.
//   5. LOAD     ?kg=<id> really swaps the manifest, on all four engines, and the
//               loading screen reads the kid's game name and the credit line.
//   6. VIEWER   /g/<slug> is routed, server-rendered with OG tags, gated, and
//               never double-counts a play.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { JSDOM } from 'jsdom';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
// The CODE of a file, with its line comments stripped. A check that greps for a
// dead call must not be satisfied (or defeated) by a comment explaining why that
// call is gone.
const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|--)/.test(l)).join('\n');
const ENGINES = ['breaker', 'sling', 'castleguard', 'skyflyer'];
const ENGINE_FILE = {
  breaker: 'public/breaker-engine.html',
  sling: 'public/sling-squad.html',
  castleguard: 'public/castle-guard.html',
  skyflyer: 'public/skyflyer-engine.html',
};

let ok = true;
const chk = (name, pass, detail) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ::  ' + detail : ''}`); if (!pass) ok = false; };

// ---------------------------------------------------------------------------
// The shared loader, headless (the same way every other qa-*.mjs loads it).
// ---------------------------------------------------------------------------
const bmSrc = read('public/buildable-manifest.js');
const bmSb = { window: {}, console };
bmSb.globalThis = bmSb;
vm.createContext(bmSb);
vm.runInContext(bmSrc, bmSb, { filename: 'buildable-manifest' });
const BM = bmSb.window.BuildableManifest;
chk('the shared loader exposes the kid-game hooks', !!(BM && BM.rawManifest && BM.kidGame && BM.kidGameId));

const stock = {};
for (const e of ENGINES) stock[e] = JSON.parse(read(`public/${e}/manifest.json`));

// ---------------------------------------------------------------------------
// 1 + 2 + 4. The SERVER'S OWN GATE, for real (api/kid-game.js exports it).
// ---------------------------------------------------------------------------
const { checkManifest, validSlug, makeSlug, ownsRow, ENGINES: API_ENGINES } = await import(path.resolve(dir, 'api/kid-game.js'));

chk('the API knows all four Cobuild engines', ENGINES.every((e) => !!API_ENGINES[e]), Object.keys(API_ENGINES).join(','));

for (const e of ENGINES) {
  const r = await checkManifest(stock[e], e);
  chk(`save + fork: the stock ${e} manifest passes the server gate`, r.ok, (r.errors || []).slice(0, 2).join('; '));
}

// A kid's own Breaker board — a painted `cells` list, which is what the Breaker
// maker produces and what the migration writes.
const kidBreaker = {
  id: 'breaker', name: 'Pizza Dragon', type: 'game', shellVersion: 2,
  levels: [{
    id: 'L1', name: 'Pizza Dragon', difficulty: 3, unlocked: true, layout: 'full',
    parts: { background: 'breaker/bg/space-v1', bricks: 'breaker/bricks/space-v1' },
    cells: [{ r: 0, c: 0, type: 'ice' }, { r: 1, c: 2, type: 'bomb' }, { r: 3, c: 7, type: 'metal' }],
  }],
};
{
  const r = await checkManifest(kidBreaker, 'breaker');
  chk('save: a kid-painted Breaker board passes the gate', r.ok, (r.errors || []).join('; '));
  const cells = BM.toEngineConfig(kidBreaker).levels[0].cells;
  chk('validate: the painted bricks survive the trip to engine config', Array.isArray(cells) && cells.length === 3);
}

// 3. REFUSE. Each of these must come back with errors and never be stored.
const REFUSALS = [
  ['a manifest built for another engine', stock.breaker, 'sling'],
  ['a manifest with no levels', { id: 'sling', name: 'Empty', type: 'game', levels: [] }, 'sling'],
  ['a level with a difficulty outside 1-5', { id: 'sling', name: 'Too hard', type: 'game', levels: [{ id: 'a', name: 'a', difficulty: 9, layout: 'gate' }] }, 'sling'],
  ['a Breaker level naming a layout that does not exist', { id: 'breaker', name: 'Nope', type: 'game', levels: [{ id: 'a', name: 'a', difficulty: 2, layout: 'spiral', parts: { bricks: 'breaker/bricks/jungle-v1' } }] }, 'breaker'],
  ['a Breaker board with bricks off the board', { ...kidBreaker, levels: [{ ...kidBreaker.levels[0], cells: [{ r: 99, c: 0, type: 'ice' }] }] }, 'breaker'],
  ['a Breaker board with a brick type we do not ship', { ...kidBreaker, levels: [{ ...kidBreaker.levels[0], cells: [{ r: 0, c: 0, type: 'lava' }] }] }, 'breaker'],
  ['a manifest that is not an object', 'not a manifest', 'breaker'],
  ['an engine we do not ship', stock.breaker, 'minecraft'],
];
for (const [what, m, e] of REFUSALS) {
  const r = await checkManifest(m, e);
  chk(`refuse: ${what}`, r.ok === false && Array.isArray(r.errors) && r.errors.length > 0, (r.errors || []).slice(0, 1).join(''));
}

// Slugs: readable, and never something that could climb out of a URL.
chk('a game link is a readable slug', /^pizza-dragon-[a-z0-9]{4}$/.test(makeSlug('Pizza Dragon!')));
chk('a game link cannot be a path', !validSlug('../etc') && !validSlug('a/b') && validSlug('pizza-dragon-k3f9'));

// 4. Fork ownership: a kid's game opens to its own family, or when it is public.
chk('fork: a private game is not forkable by a stranger', !ownsRow({ family_id: 'devA', kid_id: 'k1' }, 'devB', 'k2'));
chk('fork: a private game IS forkable inside the family', ownsRow({ family_id: 'devA', kid_id: 'k1' }, 'devA', null));
chk('fork: the same kid on another device still owns it', ownsRow({ family_id: 'devA', kid_id: 'k1' }, 'devB', 'k1'));

// ---------------------------------------------------------------------------
// 5. LOAD BY ?kg= — the one shared change, proved on all four engines in jsdom.
// ---------------------------------------------------------------------------
function kgWindow(kgId, row, search) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://buildablekids.com/breaker-engine.html' + (search === undefined ? ('?kg=' + kgId) : search) });
  const w = dom.window;
  const calls = [];
  w.fetch = (url) => {
    calls.push(String(url));
    if (String(url).indexOf('/api/kid-game') === 0 || String(url).indexOf('/api/kid-game') > -1) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(row ? { ok: true, game: row } : { ok: false }) });
    }
    // The stock lane: /api/manifest?game=x then /x/manifest.json
    const m = /\/api\/manifest\?game=([a-z]+)/.exec(String(url)) || /^\/([a-z]+)\/manifest\.json/.exec(String(url));
    if (m && stock[m[1]]) return Promise.resolve({ ok: true, json: () => Promise.resolve(stock[m[1]]) });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
  };
  w.console = console;
  vm.createContext(w);
  vm.runInContext(bmSrc, w, { filename: 'buildable-manifest' });
  return { w, calls, dom };
}
const settle = () => new Promise((r) => setTimeout(r, 60));

for (const e of ENGINES) {
  const row = {
    id: 'pizza-dragon-k3f9', engine: e, name: "Riley's " + e,
    kid_name: 'Riley', grownup_name: 'Dad', plays: 3,
    manifest: { ...stock[e], name: "Riley's " + e },
  };
  const { w } = kgWindow(row.id, row);
  let landed = null;
  w.BuildableManifest.load(e, (cfg, raw) => { landed = raw; }, () => {});
  await settle();
  chk(`?kg= swaps the manifest on ${e}`, !!landed && landed.name === "Riley's " + e);

  // The loading screen is the KID'S: their title, and who made it with them.
  const cover = w.document.querySelector('[data-kid-cover]');
  const nameEl = cover && cover.querySelector('[data-kid-cover-name]');
  const byEl = cover && cover.querySelector('[data-kid-cover-by]');
  chk(`${e}: the loading screen shows the kid's game name`, !!nameEl && nameEl.textContent === "Riley's " + e, nameEl && nameEl.textContent);
  chk(`${e}: the loading screen credits the kid AND the grown-up`, !!byEl && byEl.textContent === 'A GAME BY Riley AND Dad', byEl && byEl.textContent);
}

// The credit falls back to just the kid when there is no grown-up yet.
chk('the credit falls back to the kid alone', BM.kidGameCredit({ kid_name: 'Riley' }) === 'A GAME BY Riley');
chk('the credit never invents a name', BM.kidGameCredit({}) === 'A GAME MADE RIGHT HERE');

// A ?kg= meant for another engine must NOT be played on this one.
{
  const row = { id: 'x-1234', engine: 'sling', name: 'Wrong engine', manifest: stock.sling };
  const { w } = kgWindow(row.id, row);
  let landed = null;
  w.BuildableManifest.load('breaker', (cfg, raw) => { landed = raw; }, () => {});
  await settle();
  chk('a kid game for another engine falls back to the stock manifest', !!landed && landed.id === 'breaker');
}

// No ?kg= at all: the stock lane is completely untouched, and no cover is drawn.
{
  const { w } = kgWindow(null, null, '');
  let landed = null;
  w.BuildableManifest.load('breaker', (cfg, raw) => { landed = raw; }, () => {});
  await settle();
  chk('without ?kg= the stock manifest still loads', !!landed && landed.id === 'breaker');
  chk('without ?kg= no kid cover is drawn', !w.document.querySelector('[data-kid-cover]'));
}

// rawManifest is the same door for an engine that reads its own file (Sky Flyer).
{
  const row = { id: 'sky-1234', engine: 'skyflyer', name: 'Riley Air', manifest: { ...stock.skyflyer, name: 'Riley Air' } };
  const { w } = kgWindow(row.id, row);
  let got = null;
  w.BuildableManifest.rawManifest('skyflyer', (m) => { got = m; });
  await settle();
  chk('rawManifest hands Sky Flyer the kid\'s manifest', !!got && got.name === 'Riley Air');
}

// The play count is counted once: the viewer counts server-side and says kgplay=0.
{
  const row = { id: 'p-1234', engine: 'breaker', name: 'Counted', manifest: stock.breaker };
  const a = kgWindow(row.id, row, '?kg=p-1234');
  a.w.BuildableManifest.kidGame(() => {});
  await settle();
  chk('opening a kid game counts a play', a.calls.some((u) => /op=load&play=1/.test(u)), a.calls[0]);
  const b = kgWindow(row.id, row, '?kg=p-1234&kgplay=0');
  b.w.BuildableManifest.kidGame(() => {});
  await settle();
  chk('the share viewer does not count the same open twice', b.calls.some((u) => /op=load&play=0/.test(u)), b.calls[0]);
}

// ---------------------------------------------------------------------------
// The engines themselves: every one must reach the manifest through the SHARED
// loader, or ?kg= can never get to it. (Sky Flyer used to read its own file.)
// ---------------------------------------------------------------------------
for (const e of ENGINES) {
  const html = read(ENGINE_FILE[e]);
  const hasLib = /buildable-manifest\.js/.test(html);
  const routed = new RegExp('BuildableManifest\\.(load|rawManifest)\\((["\'])' + e + '\\2').test(html);
  chk(`${e}: the engine ships the shared loader`, hasLib);
  chk(`${e}: the engine asks the shared loader for its manifest`, routed);
}
chk('Sky Flyer no longer fetches its own manifest file by hand',
  !/fetch\("\/skyflyer\/manifest\.json"\)\.then\(function\(r\)\{ return r\.ok\?r\.json\(\):null; \}\)\s*\n\s*\.then\(function\(j\)\{ if\(j\) readManifest\(j\); \}\)\.catch/.test(read(ENGINE_FILE.skyflyer))
  || /BuildableManifest\.rawManifest\("skyflyer"/.test(read(ENGINE_FILE.skyflyer)));
chk('Breaker plays a kid-painted board instead of the pattern generator',
  /if\(Array\.isArray\(L\.cells\) && L\.cells\.length\) return buildCustomBricks/.test(read(ENGINE_FILE.breaker)));

// ---------------------------------------------------------------------------
// 6. THE VIEWER — /g/<slug>
// ---------------------------------------------------------------------------
const gHtml = read('public/g.html');
chk('the viewer leaves a slot for server-rendered head tags', gHtml.includes('<!--BK_HEAD-->'));
chk('the viewer knows all four engines', ENGINES.every((e) => new RegExp('\\b' + e + ':\\s*\\{').test(gHtml)));
chk('the viewer plays the game full screen', /id="frame"[\s\S]*position:fixed;inset:0/.test(gHtml) || /#frame\{position:fixed;inset:0/.test(gHtml));
chk('the viewer stays behind the 1111 coming-soon gate', /"1111"/.test(gHtml));
chk('the viewer tells the engine not to double-count the play', /kgplay=0/.test(gHtml));
chk('the viewer needs no account', !/signIn|isSignedIn|parent_session/.test(gHtml));
chk('no emoji anywhere in the viewer', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(gHtml));
chk('no emoji in the kid cover the loader draws', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(bmSrc));

const gApi = read('api/g.js');
for (const tag of ['og:title', 'og:image', 'og:description', 'twitter:card']) {
  chk(`the share link previews with ${tag}`, gApi.includes(tag));
}
chk('the OG title reads "<name> by <kid_name>"', /\$\{game\.name[^}]*\} by \$\{game\.kid_name/.test(gApi));
chk('opening the share link counts a play', /plays: \(g\.plays \|\| 0\) \+ 1/.test(gApi));
chk('a deleted game is not served by its link', /deleted_at=is\.null/.test(gApi));

// Routing: /g/<slug> must reach the function, and g.html must be servable, both
// BEFORE the catch-all — the check that would have caught Practice shipping dead.
const routes = JSON.parse(read('vercel.json')).routes.map((r) => r.src);
const catchAll = routes.indexOf('/(.*)');
const at = (p) => routes.findIndex((src) => src === p);
chk('/g/<slug> is routed to the viewer function', at('/g/([A-Za-z0-9][A-Za-z0-9-]{1,63})') > -1 && (catchAll === -1 || at('/g/([A-Za-z0-9][A-Za-z0-9-]{1,63})') < catchAll));
chk('the viewer page itself is servable', at('/g.html') > -1 && (catchAll === -1 || at('/g.html') < catchAll));
chk('the viewer has its own favicon block', at('/g/favicon.ico') > -1 && at('/g/apple-touch-icon.png') > -1);
chk('the favicon block sits ahead of the slug route', at('/g/favicon.ico') < at('/g/([A-Za-z0-9][A-Za-z0-9-]{1,63})'));

// ---------------------------------------------------------------------------
// The shell: My Games, the library row, and the remix door.
// ---------------------------------------------------------------------------
const home = read('src/BuildableKids.jsx');
chk('Home has a My Games shelf', /data-cb1-mygames/.test(home));
chk('the My Games shelf carries a MINE badge', /data-cb1-mygames[\s\S]{0,3000}>Mine</.test(home));
chk('the My Games shelf sits above the Play row', home.indexOf('data-cb1-mygames') < home.indexOf('data-nv2-suggested'));
chk('My Games stays behind the 1111 coming-soon gate', /data-cb1-mygame=\{g\.id\}[\s\S]{0,400}setCatalogGate/.test(home));
chk('the old Breaker levels are carried over on first load', /migrateBreakerLevels\(\)/.test(home));
chk('a kid game opens in the shell\'s own frame', /screen === SCREEN_KIDGAME[\s\S]{0,300}kidGamePlayUrl/.test(home));

const stuff = code('src/MyStuff.jsx');
chk('My Stuff has a games row', /tab === "kidgames"/.test(stuff));
chk('the dead levels tab is gone', !/listLevels\(\)/.test(stuff) && !/tab === "levels"/.test(stuff));
chk('a kid game can be shared from the library', /shareKidGameLink/.test(stuff));

const top = code('src/TopBoard.jsx');
chk('the Top Board Remix button forks', /forkKidGame\(/.test(top));
chk('Remix no longer walks the AI maker road', !/SCREEN_GAME_TYPE/.test(top) && !/CreatorScreen/.test(top));
chk('a forked game opens with ?kg=', /onOpenKidGame\(mine\)/.test(top));

const lib = code('src/lib/kidGames.js');
chk('the shell never writes kid levels back to localStorage', !/localStorage\.setItem\("bk_breaker_levels/.test(lib));
chk('the migration reads both the per-kid and the guest list', /bk_breaker_levels" \+ \(c\.kidId/.test(lib));
chk('the migration is keyed by level, so a later level is not stranded', /!done\[rec\.id\]/.test(lib) && /!rec\.kgId/.test(lib));
chk('the shell posts the raw board, it does not build the manifest itself', /op: "save", engine: "breaker", board/.test(lib) && !/breakerLevelToManifest/.test(lib));

// The Breaker maker: a level a kid saves must reach kid_games, not just this
// browser. Without this, My Games would only ever show what predates CB1.
const brk = code('public/breaker-engine.html');
chk('the Breaker maker saves a new level as a kid game', /saveLevelAsKidGame\(rec\)/.test(brk) && /op:"save", engine:"breaker", board:rec/.test(brk));
chk('the Breaker maker posts the raw board, not a manifest it built', !/breakerBoardToManifest/.test(brk));

// One builder, two callers. If these ever disagree a kid's board becomes two
// different games depending on who saved it.
chk('the board-to-manifest builder lives in the shared loader', typeof BM.breakerBoardToManifest === 'function');
chk('the server builds a posted board with that same builder', /lib\.breakerBoardToManifest\(body\.board\)/.test(read('api/kid-game.js')));

// The migration end to end: a real saved Breaker level becomes a manifest the
// gate accepts. This is the one that decides whether a kid's old work survives.
{
  // ONE builder, in the shared loader: the maker calls it in the browser and the
  // server calls it through api/_manifestLib.js, so a board can only ever become
  // one thing. That is what this block exercises.
  const rec = { id: 'L1', name: 'Pizza Dragon', cols: 10, rows: 6, look: { backdrop: 'space', ball: 'glow', paddle: '#9b7bff' }, diffN: 4, flames: 4, cells: [{ r: 0, c: 0, type: 'ice' }, { r: 5, c: 9, type: 'star' }, { r: 40, c: 0, type: 'ice' }] };
  const mf = BM.breakerBoardToManifest(rec);
  const r = await checkManifest(mf, 'breaker');
  chk('migration: an old Breaker level becomes a manifest the gate accepts', r.ok, (r.errors || []).join('; '));
  chk('migration: the kid\'s title and difficulty come across', mf.name === 'Pizza Dragon' && mf.levels[0].difficulty === 4);
  chk('migration: an off-board brick is dropped, not stored', mf.levels[0].cells.length === 2);
  chk('migration: difficulty is a 1-5 preset, never raw tuning', mf.levels[0].difficulty >= 1 && mf.levels[0].difficulty <= 5 && !('speed' in mf.levels[0]) && !('tough' in mf.levels[0]));
}

// The migration must be additive: the SQL ships as a file and takes nothing away.
const sql = read('db/create-kid-games.sql');
chk('the table ships as an idempotent migration file', /create table if not exists kid_games/.test(sql));
chk('the table keeps RLS on', /enable row level security/.test(sql));
chk('the migration drops nothing', !/\b(drop table|truncate|delete from)\b/i.test(sql));
chk('delete is soft, so a kid never loses a game', /deleted_at/.test(sql) && /deleted_at/.test(read('api/kid-game.js')));

console.log(ok ? '\nALL GOOD  kid games save, refuse junk, fork, and load by ?kg= on all four engines.' : '\nSOMETHING IS WRONG  (see FAIL lines above)');
process.exit(ok ? 0 : 1);
