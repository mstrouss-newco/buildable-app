// /api/kid-save.js
// AC3 — ONE SAVED WORLD PER KID, PER GAME. The shared version of the mechanism
// api/farm-save.js proved on the Farm (FM5): one row per (game, kid) in
// `kid_game_saves` holding the whole world as a JSON blob. Service-key only.
// Requires db/create-kid-game-saves.sql.
//
//   GET  ?game=antcity&kidProfileId=<id>      -> { ok:true, data:{...}|null }
//   POST { game, kidProfileId, data }         -> { ok:true }
//
// BEST-EFFORT BY DESIGN. Every failure path answers 200 with ok:false rather
// than an error status, because the caller is a game a child is playing: the
// game carries on from its localStorage copy and syncs on the next change. A
// save error is silent to the kid, always.
//
// There is no DELETE verb here, and there never will be: a child's world is
// never reset by anything a child can reach.
//
// `game` is an ALLOWLIST, not free text, so this endpoint can never be used to
// park arbitrary rows in the database. Add a maker here when it moves onto the
// shared table. The Farm is deliberately NOT here yet: it is live on
// /api/farm-save and moves over only once a move is verified on the live site.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TABLE = "kid_game_saves";
const GAMES = ["antcity"];
const MAX_BLOB = 300000;   // a whole colony is a few KB; this is a sanity ceiling

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body || "{}")); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

const sbHeaders = (extra) => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
  ...(extra || {}),
});

const clean = (v, max) => (v == null ? "" : String(v)).trim().slice(0, max || 120);
const game = (v) => (GAMES.indexOf(clean(v, 40)) >= 0 ? clean(v, 40) : "");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Not configured: a clear NON-error answer, so the game just uses its local
  // copy instead of showing a child anything at all.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, data: null });
  }

  if (req.method === "GET") {
    const g = game(req.query && req.query.game);
    const kid = clean((req.query && req.query.kidProfileId) || "");
    if (!g) return res.status(200).json({ ok: false, data: null, reason: "unknown-game" });
    if (!kid) return res.status(200).json({ ok: false, data: null, reason: "no-kid" });
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?game=eq.` + encodeURIComponent(g) +
          `&kid_profile_id=eq.` + encodeURIComponent(kid) + `&select=data,updated_at`,
        { headers: sbHeaders() }
      );
      if (!r.ok) {
        const detail = await r.text();
        return res.status(200).json({ ok: false, data: null, detail: detail.slice(0, 300) });
      }
      const rows = await r.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      return res.status(200).json({ ok: true, data: (row && row.data) || null,
        updatedAt: (row && row.updated_at) || null });
    } catch (e) {
      return res.status(200).json({ ok: false, data: null,
        error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const g = game(body.game);
    const kid = clean(body.kidProfileId);
    const data = body && body.data;
    if (!g) return res.status(200).json({ ok: false, reason: "unknown-game" });
    if (!kid) return res.status(200).json({ ok: false, reason: "no-kid" });
    if (!data || typeof data !== "object") return res.status(200).json({ ok: false, reason: "no-data" });
    let blob;
    try { blob = JSON.stringify(data); } catch { return res.status(200).json({ ok: false, reason: "bad-data" }); }
    if (blob.length > MAX_BLOB) return res.status(200).json({ ok: false, reason: "too-big" });

    try {
      // Upsert on the primary key, so a kid only ever has the one world per game.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=game,kid_profile_id`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ game: g, kid_profile_id: kid, data,
                               updated_at: new Date().toISOString() }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return res.status(200).json({ ok: false, detail: detail.slice(0, 300) });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
