// /api/publish-creation.js  POST {kind,id,deviceId,publish}
// Private-by-default publishing toggle. Songs/stories flip a flag on the saved row
// (ownership checked by device_id). Games toggle visibility of an already-published
// row (initial game publish still goes through /api/publish-game).
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(503).json({ error: "not configured" });
  const b = await readBody(req);
  const kind = (b.kind || "").toString(), id = (b.id || "").toString(), deviceId = (b.deviceId || "").toString();
  const publish = b.publish !== false;
  if (!id || !deviceId) return res.status(400).json({ error: "id,deviceId required" });
  try {
    if (kind === "song" || kind === "story" || kind === "art") {
      const [table, idcol] = kind === "song" ? ["saved_songs", "song_id"]
        : kind === "art" ? ["saved_art", "art_id"] : ["saved_stories", "story_id"];
      const patch = { published: publish, published_at: publish ? new Date().toISOString() : null };
      const r = await fetch(`${URL}/rest/v1/${table}?${idcol}=eq.${encodeURIComponent(id)}&device_id=eq.${encodeURIComponent(deviceId)}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(patch) });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: "not found or not yours" });
      return res.status(200).json({ ok: true, published: publish });
    }
    if (kind === "game") {
      const status = publish ? "approved" : "hidden";
      const r = await fetch(`${URL}/rest/v1/published_games?game_id=eq.${encodeURIComponent(id)}&device_id=eq.${encodeURIComponent(deviceId)}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ moderation_status: status }) });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: "not found or not yours" });
      return res.status(200).json({ ok: true, published: publish });
    }
    return res.status(400).json({ error: "bad kind" });
  } catch (e) { return res.status(500).json({ error: "failed" }); }
}
