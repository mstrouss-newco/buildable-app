// /api/kid-game.js — Session CB1 (Cobuild): a KID-OWNED GAME, saved, loaded,
// listed, deleted and FORKED.
//
// A kid-made game is not new engine code. It is a manifest the kid owns pointed
// at an engine we already ship. This endpoint is the only thing that touches the
// kid_games table (db/create-kid-games.sql); it carries the service key
// server-side and does its own ownership checks, which is why that table keeps
// RLS on with no policy. Same readBody / service-key shape as heart-creation.js.
//
//   POST { op:"save",   familyId, kidId, kidName, grownupName, engine, name,
//                       cover?, manifest, sourceGame?, id? }
//        -> { ok, game } | 400 { ok:false, errors:[...] }
//        The manifest is validated with the SHARED loader (universal fields PLUS
//        the engine's own level profile). An invalid manifest is REFUSED and the
//        errors come back — junk is never stored.
//   POST/GET { op:"load", id, play? }   -> { ok, game }  (play=1 counts a play)
//   POST/GET { op:"list", familyId?, kidId? } -> { ok, games:[...] } (no manifests)
//   POST { op:"delete", id, familyId?, kidId? } -> { ok }  (soft: stamps deleted_at)
//   POST { op:"fork",   source, familyId, kidId, kidName?, grownupName?, name? }
//        -> { ok, game }
//        THE REMIX DOOR. `source` is either one of OUR games (its manifest comes
//        from public/<game>/manifest.json) or another kid_games row — allowed
//        only when that row is public or belongs to the same family.
import fs from "fs";
import path from "path";
import { manifestLib } from "./_manifestLib.js";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// The Cobuild-ready engines. `engine` doubles as the id of the stock manifest a
// fork copies from, so adding an engine here is the whole job — no per-engine
// code anywhere in this file.
export const ENGINES = {
  breaker:     { label: "Breaker",      entry: "/breaker-engine.html" },
  sling:       { label: "Sling Squad",  entry: "/sling-squad.html" },
  castleguard: { label: "Castle Guard", entry: "/castle-guard.html" },
  skyflyer:    { label: "Sky Flyer",    entry: "/skyflyer-engine.html" },
};

// Everything a guest / the loader is allowed to see. family_id and kid_id never
// leave the server.
const PLAY_COLS = "id,engine,name,kid_name,grownup_name,cover,manifest,source_game,layer,plays,cleared,shared,public,created_at";
const LIST_COLS = "id,engine,name,kid_name,grownup_name,cover,source_game,layer,plays,cleared,shared,public,created_at";

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const str = (v) => (v == null ? "" : String(v)).trim();
const enc = encodeURIComponent;

// "Pizza Dragon!" -> "pizza-dragon-k3f9". Short, readable, and the tail keeps two
// kids who both make a "Pizza Dragon" from colliding.
export function makeSlug(name) {
  const base = str(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "game";
  const tail = Math.random().toString(36).slice(2, 6);
  return base + "-" + tail;
}
export const validSlug = (s) => /^[a-z0-9][a-z0-9-]{1,63}$/.test(s);

async function sb(pathAndQuery, init) { return fetch(`${URL_}/rest/v1/${pathAndQuery}`, { ...(init || {}), headers: { ...H, ...((init && init.headers) || {}) } }); }
async function rows(pathAndQuery) { const r = await sb(pathAndQuery); if (!r.ok) return null; const j = await r.json().catch(() => null); return Array.isArray(j) ? j : null; }

// One of OUR shipped manifests. Disk first (fast, works in QA), then over HTTP
// from this same deployment — the api/_lessonmap.js pattern, because public/ is
// not guaranteed to be on a function's disk.
async function stockManifest(game) {
  if (!ENGINES[game]) return null;
  const tries = [
    path.join(process.cwd(), "public", game, "manifest.json"),
    path.join(process.cwd(), game, "manifest.json"),
    path.join(process.cwd(), "..", "public", game, "manifest.json"),
  ];
  for (const p of tries) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  try { const r = await fetch(`${base}/${game}/manifest.json`, { headers: { "cache-control": "no-cache" } }); return r.ok ? await r.json() : null; } catch { return null; }
}

// The gate. Universal manifest fields + the engine's OWN level profile, run
// through the shared loader so the server can never disagree with the browser.
// Returns { ok, errors }.
export async function checkManifest(manifest, engine) {
  const errors = [];
  if (!ENGINES[engine]) return { ok: false, errors: ["engine must be one of " + Object.keys(ENGINES).join(", ") + " (got " + engine + ")"] };
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { ok: false, errors: ["manifest must be an object"] };
  const lib = await manifestLib();
  if (!lib) return { ok: false, errors: ["the shared manifest loader could not be read, so this game was not saved"] };
  // The profile is picked by levelProfile-or-id, so a kid game must still name
  // the engine it plays on. Anything else would validate against the WRONG
  // engine's level shape and pass while being unplayable.
  const key = str(manifest.levelProfile) || str(manifest.id);
  if (key !== engine && str(manifest.id) !== engine) errors.push("manifest id '" + str(manifest.id) + "' must be the engine id '" + engine + "'");
  const v = lib.validate(manifest);
  if (!v.ok) errors.push(...v.errors);
  if (!errors.length) {
    // Belt and braces: the profile must also be able to TRANSLATE it. A manifest
    // that validates but throws on the way to engine config is still junk.
    try {
      const cfg = lib.toEngineConfig(manifest);
      if (!cfg || (manifest.type === "game" && (!Array.isArray(cfg.levels) || !cfg.levels.length))) errors.push("the engine profile produced no levels from this manifest");
    } catch (e) { errors.push("the engine profile could not read this manifest: " + String((e && e.message) || e)); }
  }
  return { ok: errors.length === 0, errors };
}

// Ownership for the private lane. A row is yours if it carries your family id or
// your kid id. Public rows are readable by anyone (that is what public means).
export const ownsRow = (row, familyId, kidId) =>
  !!row && ((familyId && row.family_id === familyId) || (kidId && row.kid_id === kidId));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !KEY) return res.status(503).json({ ok: false, error: "not configured" });

  const qs = String(req.url || "").split("?")[1] || "";
  const q = new URLSearchParams(qs);
  const body = req.method === "POST" ? await readBody(req) : {};
  const get = (k) => (body && body[k] != null ? body[k] : q.get(k));
  const op = str(get("op")) || (req.method === "GET" ? "load" : "");

  try {
    // ---------------------------------------------------------------- load ---
    if (op === "load") {
      const id = str(get("id"));
      if (!validSlug(id)) return res.status(400).json({ ok: false, error: "id required" });
      const r = await rows(`kid_games?id=eq.${enc(id)}&deleted_at=is.null&select=${PLAY_COLS}&limit=1`);
      if (!r || !r[0]) return res.status(404).json({ ok: false, error: "no game with that link" });
      const game = r[0];
      if (str(get("play")) === "1") {
        // Fire and forget: a play count must never delay or fail the game opening.
        sb(`kid_games?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ plays: (game.plays || 0) + 1 }) }).catch(() => {});
        game.plays = (game.plays || 0) + 1;
      }
      return res.status(200).json({ ok: true, game });
    }

    // ---------------------------------------------------------------- list ---
    if (op === "list") {
      const familyId = str(get("familyId")), kidId = str(get("kidId"));
      if (!familyId && !kidId) return res.status(400).json({ ok: false, error: "familyId or kidId required" });
      const who = kidId ? `kid_id=eq.${enc(kidId)}` : `family_id=eq.${enc(familyId)}`;
      const r = await rows(`kid_games?${who}&deleted_at=is.null&select=${LIST_COLS}&order=created_at.desc&limit=200`);
      return res.status(200).json({ ok: true, games: r || [] });
    }

    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "POST only for " + (op || "this op") }); }

    // ---------------------------------------------------------------- save ---
    if (op === "save") {
      const engine = str(get("engine"));
      // A caller may hand over a finished manifest, or the RAW BOARD a kid painted
      // in the Breaker maker. The board is turned into a manifest by the shared
      // loader's own breakerBoardToManifest — the same function the engine calls in
      // the browser — so there is exactly one place that decides what a kid's board
      // becomes and the engine and the server can never drift apart.
      let manifest = body.manifest;
      if (!manifest && body.board) {
        const lib = await manifestLib();
        if (!lib || typeof lib.breakerBoardToManifest !== "function") return res.status(400).json({ ok: false, errors: ["the shared manifest loader could not be read, so this game was not saved"] });
        if (engine !== "breaker") return res.status(400).json({ ok: false, errors: ["only Breaker saves a raw board; every other engine sends a manifest"] });
        manifest = lib.breakerBoardToManifest(body.board);
      }
      const name = str(get("name")) || (manifest && str(manifest.name)) || "My game";
      const familyId = str(get("familyId")), kidId = str(get("kidId"));
      if (!familyId && !kidId) return res.status(400).json({ ok: false, errors: ["familyId or kidId required"] });

      const check = await checkManifest(manifest, engine);
      if (!check.ok) return res.status(400).json({ ok: false, errors: check.errors });

      const wanted = str(get("id"));
      const patch = {
        engine, name,
        kid_name: str(get("kidName")) || null,
        grownup_name: str(get("grownupName")) || null,
        cover: str(get("cover")) || null,
        manifest,
        updated_at: new Date().toISOString(),
      };

      // An id that already exists is an EDIT — and an edit is only allowed by the
      // family that owns it. Anything else creates a new game.
      if (wanted && validSlug(wanted)) {
        const cur = await rows(`kid_games?id=eq.${enc(wanted)}&select=id,family_id,kid_id,deleted_at&limit=1`);
        if (cur && cur[0]) {
          if (!ownsRow(cur[0], familyId, kidId)) return res.status(403).json({ ok: false, errors: ["that game belongs to someone else"] });
          const up = await sb(`kid_games?id=eq.${enc(wanted)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
          const out = await up.json().catch(() => null);
          if (!up.ok || !Array.isArray(out) || !out[0]) return res.status(500).json({ ok: false, errors: ["could not save"] });
          return res.status(200).json({ ok: true, game: out[0], created: false });
        }
      }

      const id = (wanted && validSlug(wanted)) ? wanted : makeSlug(name);
      const row = {
        ...patch, id,
        family_id: familyId || null, kid_id: kidId || null,
        source_game: str(get("sourceGame")) || null,
        layer: Math.max(1, parseInt(get("layer"), 10) || 1),
      };
      const ins = await sb("kid_games", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
      const out = await ins.json().catch(() => null);
      if (!ins.ok || !Array.isArray(out) || !out[0]) return res.status(500).json({ ok: false, errors: ["could not save"] });
      return res.status(200).json({ ok: true, game: out[0], created: true });
    }

    // -------------------------------------------------------------- delete ---
    // SOFT on purpose. A kid's Delete must not be an irreversible row removal in
    // a kids' product; the game leaves My Games and its share link stops working,
    // and nothing is lost. See db/create-kid-games.sql.
    if (op === "delete") {
      const id = str(get("id")), familyId = str(get("familyId")), kidId = str(get("kidId"));
      if (!validSlug(id)) return res.status(400).json({ ok: false, error: "id required" });
      const cur = await rows(`kid_games?id=eq.${enc(id)}&select=id,family_id,kid_id&limit=1`);
      if (!cur || !cur[0]) return res.status(404).json({ ok: false, error: "no game with that link" });
      if (!ownsRow(cur[0], familyId, kidId)) return res.status(403).json({ ok: false, error: "that game belongs to someone else" });
      const up = await sb(`kid_games?id=eq.${enc(id)}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString(), shared: false, public: false }) });
      if (!up.ok) return res.status(500).json({ ok: false, error: "could not delete" });
      return res.status(200).json({ ok: true, deleted: id });
    }

    // ---------------------------------------------------------------- fork ---
    // The remix door. Copy a manifest into a NEW row the forker owns.
    if (op === "fork") {
      const source = str(get("source")) || str(get("id"));
      const familyId = str(get("familyId")), kidId = str(get("kidId"));
      if (!source) return res.status(400).json({ ok: false, errors: ["source required"] });
      if (!familyId && !kidId) return res.status(400).json({ ok: false, errors: ["familyId or kidId required"] });

      let manifest = null, engine = "", layer = 1, fromName = "";
      if (ENGINES[source]) {
        // Forking one of OUR games.
        manifest = await stockManifest(source);
        engine = source; layer = 1;
        fromName = (manifest && str(manifest.name)) || ENGINES[source].label;
        if (!manifest) return res.status(404).json({ ok: false, errors: ["could not read the " + source + " manifest"] });
      } else {
        if (!validSlug(source)) return res.status(400).json({ ok: false, errors: ["source must be one of our games or a kid game link"] });
        const r = await rows(`kid_games?id=eq.${enc(source)}&deleted_at=is.null&select=id,engine,name,manifest,layer,public,family_id,kid_id&limit=1`);
        const src = r && r[0];
        if (!src) return res.status(404).json({ ok: false, errors: ["no game with that link"] });
        // A kid game may only be forked when it is PUBLIC, or when the forker is
        // in the same family. Anything else is someone else's private creation.
        if (!src.public && !ownsRow(src, familyId, kidId)) return res.status(403).json({ ok: false, errors: ["that game is not shared, so it cannot be remixed"] });
        manifest = src.manifest; engine = str(src.engine); layer = Math.max(1, (src.layer || 1) + 1); fromName = str(src.name);
      }

      const check = await checkManifest(manifest, engine);
      if (!check.ok) return res.status(400).json({ ok: false, errors: check.errors });

      const kidName = str(get("kidName"));
      const name = str(get("name")) || ((kidName ? kidName + "'s " : "My ") + (fromName || ENGINES[engine].label) + " remix").slice(0, 60);
      const row = {
        id: makeSlug(name), family_id: familyId || null, kid_id: kidId || null,
        kid_name: kidName || null, grownup_name: str(get("grownupName")) || null,
        engine, name, cover: str(get("cover")) || null,
        manifest: { ...manifest, name },   // the kid's title travels with the copy
        source_game: source, layer,
        updated_at: new Date().toISOString(),
      };
      const ins = await sb("kid_games", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
      const out = await ins.json().catch(() => null);
      if (!ins.ok || !Array.isArray(out) || !out[0]) return res.status(500).json({ ok: false, errors: ["could not fork"] });
      return res.status(200).json({ ok: true, game: out[0], forkedFrom: source });
    }

    // -------------------------------------------------------------- share ----
    // Flip the private share link / the public listing. Owner only.
    if (op === "share") {
      const id = str(get("id")), familyId = str(get("familyId")), kidId = str(get("kidId"));
      if (!validSlug(id)) return res.status(400).json({ ok: false, error: "id required" });
      const cur = await rows(`kid_games?id=eq.${enc(id)}&deleted_at=is.null&select=id,family_id,kid_id&limit=1`);
      if (!cur || !cur[0]) return res.status(404).json({ ok: false, error: "no game with that link" });
      if (!ownsRow(cur[0], familyId, kidId)) return res.status(403).json({ ok: false, error: "that game belongs to someone else" });
      const patch = { updated_at: new Date().toISOString() };
      if (get("shared") != null) patch.shared = str(get("shared")) !== "false" && get("shared") !== false;
      if (get("public") != null) patch.public = str(get("public")) !== "false" && get("public") !== false;
      const up = await sb(`kid_games?id=eq.${enc(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      const out = await up.json().catch(() => null);
      if (!up.ok || !Array.isArray(out) || !out[0]) return res.status(500).json({ ok: false, error: "could not update" });
      return res.status(200).json({ ok: true, game: out[0] });
    }

    return res.status(400).json({ ok: false, error: "unknown op '" + op + "'" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
