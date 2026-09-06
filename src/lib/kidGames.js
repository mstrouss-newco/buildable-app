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
//  It is keyed BY LEVEL ID, not by "have I run once": the Breaker maker still
//  keeps its own local shelf for standalone play, so a level saved there later
//  (or on another device) is carried over the next time Home loads rather than
//  being stranded behind a one-shot marker.
const MIGRATED_KEY = "bk_kidgames_migrated_v2";

// The board -> manifest step is NOT done here. The shared loader owns it
// (BuildableManifest.breakerBoardToManifest), the server calls that same function
// through api/_manifestLib.js, and the Breaker maker calls it in the browser — so
// the migration just posts the raw board it found and one piece of code decides
// what a kid's board becomes.
export async function saveBreakerBoard(board, opts) {
  const c = kidCtx();
  const j = await call({ op: "save", engine: "breaker", board, sourceGame: "breaker",
    name: String((board && board.name) || "My level").slice(0, 60), ...(opts || {}), ...c });
  return j.game;
}

// Reads the old lists (this kid's, plus the un-suffixed one a guest wrote) and
// saves each level as a kid game. A level that fails is simply not marked, so the
// next load tries it again, and nothing here ever breaks Home.
export async function migrateBreakerLevels() {
  let done = {};
  try { done = JSON.parse(localStorage.getItem(MIGRATED_KEY) || "{}") || {}; } catch { done = {}; }
  const c = kidCtx();

  const keys = ["bk_breaker_levels" + (c.kidId ? "_" + c.kidId : ""), "bk_breaker_levels"];
  const seen = new Set();
  const recs = [];
  for (const k of keys) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(k) || "[]"); } catch { list = []; }
    if (!Array.isArray(list)) continue;
    // rec.kgId means the maker already saved it across; done[] covers everything
    // migrated from an older shelf that predates that.
    for (const rec of list) { if (rec && rec.id && !rec.kgId && !seen.has(rec.id) && !done[rec.id]) { seen.add(rec.id); recs.push(rec); } }
  }
  if (!recs.length) return 0;

  let moved = 0;
  for (const rec of recs) {
    try {
      await saveBreakerBoard(rec);
      done[rec.id] = true;
      moved++;
    } catch { /* one bad level must never stop the rest */ }
  }
  if (moved) { try { localStorage.setItem(MIGRATED_KEY, JSON.stringify(done)); } catch { /* ignore */ } }
  return moved;
}
