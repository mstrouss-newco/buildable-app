// /src/lib/kidGames.js — Session CB1 (Cobuild): the shell's side of a KID-MADE GAME.
//
// A kid-made game is a manifest the kid owns pointed at an engine we already
// ship. The row lives in kid_games (db/create-kid-games.sql) and every read and
// write goes through /api/kid-game. Nothing here knows anything about a
// particular engine beyond the ENGINES table below, which is the one place a new
// Cobuild engine gets added.
//
// This module also owns the ONE-TIME MIGRATION of the old Breaker maker, whose
// levels were only ever in localStorage on one device (bk_breaker_levels_<kidId>).
// After the migration the engine's own list is left alone but the shell stops
// reading it: My Games is the home for a kid's games now.

export const ENGINES = {
  breaker:     { label: "Breaker",      entry: "/breaker-engine.html", color: "#7C5CFC" },
  sling:       { label: "Sling Squad",  entry: "/sling-squad.html",    color: "#3EB5F1" },
  castleguard: { label: "Castle Guard", entry: "/castle-guard.html",   color: "#2E7D4F" },
  skyflyer:    { label: "Sky Flyer",    entry: "/skyflyer-engine.html", color: "#F0972A" },
};

export function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}
function activeKid() {
  try { return JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); } catch { return null; }
}
// The grown-up's name is what turns a loading screen into "A GAME BY RILEY AND
// DAD". Cobuild asks for it; until then it is simply absent and the credit says
// just the kid, which is what buildable-manifest.js falls back to.
export function getGrownupName() {
  try { return (localStorage.getItem("bk_grownup_name") || "").trim() || null; } catch { return null; }
}
export function setGrownupName(name) {
  try { localStorage.setItem("bk_grownup_name", String(name || "").trim().slice(0, 40)); } catch { /* ignore */ }
}

// Who is saving. familyId is the device lane (one family, one tablet); kidId is
// the signed-in child when there is one, so a game follows them across devices.
export function kidCtx() {
  const k = activeKid();
  return {
    familyId: getDeviceId(),
    kidId: (k && k.id) || null,
    kidName: (k && (k.display_name || k.name)) || null,
    grownupName: getGrownupName(),
  };
}

async function call(payload) {
  const r = await fetch("/api/kid-game", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    const err = new Error((j && j.errors && j.errors.join("; ")) || (j && j.error) || "That did not work");
    err.errors = (j && j.errors) || [];
    throw err;
  }
  return j;
}

// The kid's games, newest first. Never throws — an empty shelf is the right
// answer when the network is out, not a broken Home screen.
export async function listKidGames() {
  try {
    const c = kidCtx();
    const q = c.kidId ? "kidId=" + encodeURIComponent(c.kidId) : "familyId=" + encodeURIComponent(c.familyId);
    const r = await fetch("/api/kid-game?op=list&" + q);
    const j = await r.json();
    return (j && j.ok && Array.isArray(j.games)) ? j.games : [];
  } catch { return []; }
}

export async function saveKidGame({ id, engine, name, manifest, cover, sourceGame, layer }) {
  const c = kidCtx();
  const j = await call({ op: "save", id, engine, name, manifest, cover, sourceGame, layer, ...c });
  return j.game;
}

// THE REMIX DOOR. `source` is one of our game ids (breaker/sling/castleguard/
// skyflyer) or another kid game's link.
export async function forkKidGame(source, name) {
  const c = kidCtx();
  const j = await call({ op: "fork", source, name, ...c });
  return j.game;
}

export async function deleteKidGame(id) {
  const c = kidCtx();
  await call({ op: "delete", id, familyId: c.familyId, kidId: c.kidId });
  return true;
}

export async function shareKidGame(id, { shared, isPublic } = {}) {
  const c = kidCtx();
  const body = { op: "share", id, familyId: c.familyId, kidId: c.kidId };
  if (shared != null) body.shared = shared;
  if (isPublic != null) body.public = isPublic;
  const j = await call(body);
  return j.game;
}

// Where a kid game is played inside the app, and where it is shared from.
export function kidGamePlayUrl(game) {
  const e = ENGINES[game && game.engine] || ENGINES.breaker;
  return e.entry + "?kg=" + encodeURIComponent(game.id) + "&screen=play";
}
export function kidGameShareUrl(game) {
  const base = (typeof location !== "undefined" && location.origin) ? location.origin : "https://buildablekids.com";
  return base + "/g/" + encodeURIComponent(game.id);
}
// A cover is a URL, a shared-studio asset, or nothing — in which case the
// engine's own key art stands in. Mirrors public/g.html and api/g.js.
export function kidGameCover(game) {
  const c = (game && game.cover) || "";
  if (/^https?:|^\//.test(c)) return c;
  if (c.startsWith("studio:")) return "/api/asset-studio?asset=" + encodeURIComponent(c.slice(7));
  if (c) return "/api/asset-studio?asset=" + encodeURIComponent(c);
  return "/api/images?kind=game&id=" + encodeURIComponent((game && game.engine) || "breaker");
}

// ---------------------------------------------------------------------------
//  ONE-TIME MIGRATION — the old Breaker maker's localStorage levels.
// ---------------------------------------------------------------------------
//  Every level a kid built in Breaker before CB1 lived in
//  bk_breaker_levels_<kidId> on ONE device: invisible everywhere else, gone with
//  the browser cache, unshareable. Each one becomes a kid_games row with a real
//  manifest, so it shows up in My Games, opens with ?kg= and can be shared.
//
//  Replace first, remove second: the localStorage list is left exactly where it
//  is (the engine's own maker still reads it), a marker records that this kid's
//  levels have been carried over, and the shell stops writing there.
const MIGRATED_KEY = "bk_kidgames_migrated_v1";

// A backdrop the kid picked -> the Breaker art theme that ships on disk.
const THEME_BY_BACKDROP = { meadow: "jungle", ocean: "ocean", space: "space", castle: "jungle", desert: "jungle", candy: "ocean" };
// The manifest names a LAYOUT, never raw cols/rows (manifest golden rule 2), so
// a painted board is matched to the template with the same board size.
const LAYOUTS = [
  { id: "full", cols: 10, rows: 6 }, { id: "pyramid", cols: 9, rows: 5 },
  { id: "checker", cols: 10, rows: 5 }, { id: "gaps", cols: 10, rows: 6 },
  { id: "columns", cols: 10, rows: 6 }, { id: "frame", cols: 11, rows: 7 },
  { id: "diamond", cols: 11, rows: 7 },
];
function layoutFor(cols, rows) {
  const c = cols || 10, r = rows || 6;
  const exact = LAYOUTS.find((l) => l.cols === c && l.rows === r);
  if (exact) return exact;
  const fits = LAYOUTS.filter((l) => l.cols >= c && l.rows >= r).sort((a, b) => (a.cols * a.rows) - (b.cols * b.rows));
  return fits[0] || LAYOUTS[LAYOUTS.length - 1];
}
const BRICK_TYPES = { ice: 1, wood: 1, metal: 1, candy: 1, star: 1, bomb: 1 };

// One saved Breaker level -> a manifest-v2 the shared loader accepts.
export function breakerLevelToManifest(rec) {
  const name = String((rec && rec.name) || "My level").slice(0, 60);
  const theme = THEME_BY_BACKDROP[(rec && rec.look && rec.look.backdrop) || "meadow"] || "jungle";
  const lay = layoutFor(rec && rec.cols, rec && rec.rows);
  const cells = (Array.isArray(rec && rec.cells) ? rec.cells : [])
    .filter((c) => c && BRICK_TYPES[c.type] && c.r >= 0 && c.c >= 0 && c.r < lay.rows && c.c < lay.cols)
    .map((c) => ({ r: c.r | 0, c: c.c | 0, type: c.type }));
  const diff = Math.max(1, Math.min(5, parseInt((rec && (rec.diffN || rec.flames)) || 3, 10) || 3));
  return {
    id: "breaker", name, type: "game", shellVersion: 2, color: "#7C5CFC",
    levels: [{
      id: "L1", name, difficulty: diff, unlocked: true, layout: lay.id,
      parts: { background: "breaker/bg/" + theme + "-v1", bricks: "breaker/bricks/" + theme + "-v1" },
      ...(cells.length ? { cells } : {}),
    }],
  };
}

// Reads the old lists (this kid's, plus the un-suffixed one a guest wrote) and
// saves each level as a kid game. Runs at most once per kid; a failure leaves the
// marker unset so the next load tries again, and never breaks Home.
export async function migrateBreakerLevels() {
  let done = {};
  try { done = JSON.parse(localStorage.getItem(MIGRATED_KEY) || "{}") || {}; } catch { done = {}; }
  const c = kidCtx();
  const who = c.kidId || c.familyId;
  if (done[who]) return 0;

  const keys = ["bk_breaker_levels" + (c.kidId ? "_" + c.kidId : ""), "bk_breaker_levels"];
  const seen = new Set();
  const recs = [];
  for (const k of keys) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(k) || "[]"); } catch { list = []; }
    if (!Array.isArray(list)) continue;
    for (const rec of list) { if (rec && rec.id && !seen.has(rec.id)) { seen.add(rec.id); recs.push(rec); } }
  }
  if (!recs.length) {
    try { done[who] = true; localStorage.setItem(MIGRATED_KEY, JSON.stringify(done)); } catch { /* ignore */ }
    return 0;
  }

  let moved = 0;
  for (const rec of recs) {
    try {
      await saveKidGame({
        engine: "breaker",
        name: String(rec.name || "My level").slice(0, 60),
        manifest: breakerLevelToManifest(rec),
        sourceGame: "breaker",
      });
      moved++;
    } catch { /* one bad level must never stop the rest */ }
  }
  if (moved) { try { done[who] = true; localStorage.setItem(MIGRATED_KEY, JSON.stringify(done)); } catch { /* ignore */ } }
  return moved;
}
