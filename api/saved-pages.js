// /api/saved-pages.js
// Kidspedia dog-ears (Session TB1): the pages a kid folded a corner on, stored
// server-side so they follow the kid to any device they sign in on. Service-key
// only, mirroring api/save-progress.js. Requires db/create-saved-pages.sql.
//
//   GET  ?owner=kid:<id>[&exhibitId=sharks]  -> { ok:true, pages:[...] }
//   POST { owner, kidProfileId?, deviceId?, exhibitId, exhibitTitle?, pageId,
//          pageTitle?, saved }                -> { ok:true, row }
//
// Unfolding sets saved=false rather than deleting the row, so this endpoint
// never issues a destructive statement.
//
// If the env isn't configured, both verbs return a clear NON-error JSON so the
// book falls back to its local mirror instead of showing a kid an error.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TABLE = "saved_pages";

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

// Ids come from the client, so keep them boring and bounded.
const clean = (v, max) => (v == null ? "" : String(v)).trim().slice(0, max || 120);
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, pages: [], note: "cloud sync off; using local only" });
  }

  // ---------- read a kid's dog-ears ----------
  if (req.method === "GET") {
    const owner = clean((req.query && req.query.owner) || "", 120);
    const exhibitId = clean((req.query && req.query.exhibitId) || "", 60);
    if (!owner) return res.status(400).json({ ok: false, error: "owner is required" });
    let q = `${TABLE}?owner_key=eq.${encodeURIComponent(owner)}&saved=is.true` +
            `&select=exhibit_id,exhibit_title,page_id,page_title,saved,updated_at&order=updated_at.desc&limit=500`;
    if (exhibitId) q += `&exhibit_id=eq.${encodeURIComponent(exhibitId)}`;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: sbHeaders() });
      if (!r.ok) {
        const detail = await r.text();
        return res.status(200).json({ ok: false, pages: [], error: "read failed", detail: detail.slice(0, 200) });
      }
      const rows = await r.json().catch(() => []);
      return res.status(200).json({
        ok: true,
        pages: (Array.isArray(rows) ? rows : []).map((x) => ({
          exhibitId: x.exhibit_id, exhibitTitle: x.exhibit_title,
          pageId: x.page_id, pageTitle: x.page_title, saved: x.saved !== false, updatedAt: x.updated_at,
        })),
      });
    } catch (e) {
      return res.status(200).json({ ok: false, pages: [], error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  // ---------- fold / unfold one page ----------
  const body = await readBody(req);
  const owner = clean(body.owner, 120);
  const exhibitId = clean(body.exhibitId, 60);
  const pageId = clean(body.pageId, 60);
  if (!owner) return res.status(400).json({ ok: false, error: "owner is required" });
  if (!exhibitId) return res.status(400).json({ ok: false, error: "exhibitId is required" });
  if (!pageId) return res.status(400).json({ ok: false, error: "pageId is required" });

  const kid = clean(body.kidProfileId, 60);
  const row = {
    owner_key: owner,
    kid_profile_id: isUuid(kid) ? kid : null,
    device_id: clean(body.deviceId, 80) || null,
    exhibit_id: exhibitId,
    exhibit_title: clean(body.exhibitTitle, 120) || null,
    page_id: pageId,
    page_title: clean(body.pageTitle, 160) || null,
    saved: body.saved !== false,
    updated_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=owner_key,exhibit_id,page_id`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(200).json({ ok: false, error: "save failed", detail: detail.slice(0, 300) });
    }
    const saved = await r.json().catch(() => null);
    return res.status(200).json({ ok: true, row: Array.isArray(saved) ? saved[0] : saved });
  } catch (e) {
    // Never fatal for the client — it always has its local mirror.
    return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
}
