// /api/list-art.js — saved drawings for one profile (by kid_profile_id when signed
// in, else device_id), newest first. Read-only, service key. Mirrors list-stories.js.
// Omits the heavy image_b64/art from the LIST; ?artId=ID returns one full drawing.
import { thumbForWorld } from "./_thumbs.js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
  });
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ configured: false, art: [], count: 0, max: 40 });

  const deviceId = (req.query.deviceId || req.query.device_id || "").toString().trim();
  const kidProfileId = (req.query.kidProfileId || req.query.kid_profile_id || "").toString().trim();
  const artId = (req.query.artId || req.query.art_id || "").toString().trim();
  if (!deviceId && !kidProfileId && !artId) return res.status(400).json({ error: "deviceId or kidProfileId is required" });

  try {
    if (artId) {
      const r = await sb("saved_art?art_id=eq." + encodeURIComponent(artId) + "&select=art_id,title,theme,image_b64,art,created_at&limit=1");
      const rows = await r.json();
      return res.status(200).json({ ok: true, art: Array.isArray(rows) ? rows[0] || null : null });
    }
    const filter = kidProfileId ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId) : "device_id=eq." + encodeURIComponent(deviceId);
    const safeCols = "art_id,title,theme,created_at";
    // pull image_b64 so the real saved drawing shows as its own thumbnail (kid
    // galleries are capped at 40, so shipping the small PNGs is fine); fall back to
    // a lightweight theme thumb only when a drawing has no saved image.
    let r = await sb("saved_art?" + filter + "&select=" + safeCols + ",image_b64,published,play_count,heart_count&order=created_at.desc&limit=40");
    if (!r.ok) { r = await sb("saved_art?" + filter + "&select=" + safeCols + "&order=created_at.desc&limit=40"); }
    if (!r.ok) { const detail = await r.text(); return res.status(502).json({ error: "list failed", status: r.status, detail: detail.slice(0, 300) }); }
    let art = await r.json();
    if (Array.isArray(art)) art = art.map((row) => ({
      ...row,
      thumbnail: row.image_b64 ? row.image_b64 : (thumbForWorld(row.theme) || null),
      image_b64: undefined,
    }));
    return res.status(200).json({ ok: true, configured: true, art: Array.isArray(art) ? art : [], count: Array.isArray(art) ? art.length : 0, max: 40 });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
