// /api/get-progress.js
// Returns one kid's Learning Mode blob (if any) from the learning_progress
// table so progress can follow the kid across devices. Service-key only,
// mirroring api/save-song.js. Requires db/create-learning-progress.sql.
//
// GET ?kidProfileId=...
// Responds: { ok: true, data: {...} | null }  (data null when nothing saved yet)
// If env isn't configured, returns a clear non-error JSON so the client falls
// back to local-only. Guest mode never calls this.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Not configured: clear, non-error JSON so the client just uses local data.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, data: null });
  }

  const kidProfileId = ((req.query && req.query.kidProfileId) || "").toString().trim();
  if (!kidProfileId) return res.status(400).json({ error: "kidProfileId is required" });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/learning_progress?kid_profile_id=eq.` +
        encodeURIComponent(kidProfileId) + `&select=data,updated_at`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      // Treat as "no cloud data" so the client keeps its local copy.
      return res.status(200).json({ ok: false, data: null, detail: detail.slice(0, 300) });
    }
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return res.status(200).json({ ok: true, data: row && row.data ? row.data : null });
  } catch (e) {
    return res.status(200).json({ ok: false, data: null, error: String((e && e.message) || e).slice(0, 200) });
  }
}
