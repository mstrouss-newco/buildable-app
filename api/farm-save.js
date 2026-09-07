// /api/farm-save.js
// FM5 — THE FARM REMEMBERS HER. One row per kid in `farm_saves` holding the
// whole farm as a JSON blob. Service-key only, mirroring api/save-progress.js
// and api/saved-pages.js. Requires db/create-farm-save.sql.
//
//   GET  ?kidProfileId=<id>          -> { ok:true, data:{...}|null }
//   POST { kidProfileId, data }      -> { ok:true }
//
// BEST-EFFORT BY DESIGN. Every failure path answers 200 with ok:false rather
// than an error status, because the caller is a game a child is playing: the
// farm carries on from its localStorage copy and syncs on the next change. A
// save error is silent to the kid, always.
//
// There is no DELETE verb here, and there never will be: FM5's rule is that the
// farm is never reset by anything a child can reach.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TABLE = "farm_saves";
const MAX_BLOB = 200000;   // a whole farm is a few KB; this is a sanity ceiling

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Not configured: a clear NON-error answer, so the farm just uses its local
  // copy instead of showing a child anything at all.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, data: null });
  }

  if (req.method === "GET") {
    const kid = clean((req.query && req.query.kidProfileId) || "");
    if (!kid) return res.status(200).json({ ok: false, data: null, reason: "no-kid" });
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?kid_profile_id=eq.` +
          encodeURIComponent(kid) + `&select=data,updated_at`,
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
    const kid = clean(body.kidProfileId);
    const data = body && body.data;
    if (!kid) return res.status(200).json({ ok: false, reason: "no-kid" });
    if (!data || typeof data !== "object") return res.status(200).json({ ok: false, reason: "no-data" });
    let blob;
    try { blob = JSON.stringify(data); } catch { return res.status(200).json({ ok: false, reason: "bad-data" }); }
    if (blob.length > MAX_BLOB) return res.status(200).json({ ok: false, reason: "too-big" });

    try {
      // Upsert on the primary key, so a kid only ever has the one farm.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=kid_profile_id`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ kid_profile_id: kid, data, updated_at: new Date().toISOString() }),
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
