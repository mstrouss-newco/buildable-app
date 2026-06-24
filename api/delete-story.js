// /api/delete-story.js — delete ONE story, scoped to the caller's device_id so a
// kid can only ever delete their own. Mirrors delete-song.js. (Non-destructive at
// the table level: a single scoped row delete, never DROP/TRUNCATE.)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}
export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Storage not configured" });
  const body = await readBody(req);
  const deviceId = (body.deviceId || req.query.deviceId || "").toString().trim();
  const storyId = (body.storyId || req.query.storyId || "").toString().trim();
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  if (!storyId) return res.status(400).json({ error: "storyId is required" });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/saved_stories?story_id=eq.` + encodeURIComponent(storyId) + "&device_id=eq." + encodeURIComponent(deviceId), {
      method: "DELETE",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: "return=representation" },
    });
    if (!r.ok) { const detail = await r.text(); return res.status(502).json({ error: "delete failed", detail: detail.slice(0, 200) }); }
    const removed = await r.json();
    return res.status(200).json({ ok: true, removed: Array.isArray(removed) ? removed.length : 0 });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
