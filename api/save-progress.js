// /api/save-progress.js
// Upserts one kid's Learning Mode blob (settings + progress + review queue) into
// the learning_progress table so it follows the kid across devices. Service-key
// only, mirroring api/save-song.js. Requires db/create-learning-progress.sql.
//
// POST JSON: { kidProfileId, data }
//   - kidProfileId (required): the kid profile id.
//   - data: the full { settings, progress, review } blob (stored as jsonb).
// Guest mode never calls this (the client only pushes when signed in).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Not configured: return a clear, non-error JSON so the client falls back to local.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, note: "cloud sync off; using local only" });
  }

  const body = await readBody(req);
  const kidProfileId = (body.kidProfileId || "").toString().trim();
  const data = body.data && typeof body.data === "object" ? body.data : null;
  if (!kidProfileId) return res.status(400).json({ error: "kidProfileId is required" });
  if (!data) return res.status(400).json({ error: "data is required" });

  const row = { kid_profile_id: kidProfileId, data, updated_at: new Date().toISOString() };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/learning_progress`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        // Upsert on the kid_profile_id primary key.
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ ok: false, error: "save failed", detail: detail.slice(0, 300) });
    }
    const saved = await r.json().catch(() => null);
    return res.status(200).json({ ok: true, row: Array.isArray(saved) ? saved[0] : saved });
  } catch (e) {
    // Never make the client treat this as fatal — it always has local data.
    return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
}
