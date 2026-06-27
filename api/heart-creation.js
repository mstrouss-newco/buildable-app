// /api/heart-creation.js  POST {kind,id,deviceId,on}
// Toggles one device's heart on a creation; recounts and writes back heart_count.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const TABLE = { song: ["saved_songs", "song_id"], story: ["saved_stories", "story_id"], game: ["published_games", "game_id"] };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(503).json({ error: "not configured" });
  const b = await readBody(req);
  const kind = (b.kind || "").toString(), id = (b.id || "").toString(), deviceId = (b.deviceId || "").toString();
  const on = b.on !== false;
  if (!TABLE[kind] || !id || !deviceId) return res.status(400).json({ error: "kind,id,deviceId required" });
  const [table, idcol] = TABLE[kind];
  try {
    if (on) {
      await fetch(`${URL}/rest/v1/creation_hearts`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ kind, creation_id: id, device_id: deviceId }) });
    } else {
      await fetch(`${URL}/rest/v1/creation_hearts?kind=eq.${kind}&creation_id=eq.${encodeURIComponent(id)}&device_id=eq.${encodeURIComponent(deviceId)}`, { method: "DELETE", headers: H });
    }
    const cr = await fetch(`${URL}/rest/v1/creation_hearts?kind=eq.${kind}&creation_id=eq.${encodeURIComponent(id)}&select=id`, { headers: { ...H, Range: "0-0", Prefer: "count=exact" } });
    const range = cr.headers.get("content-range") || "*/0";
    const count = parseInt(range.split("/")[1], 10) || 0;
    await fetch(`${URL}/rest/v1/${table}?${idcol}=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ heart_count: count }) });
    return res.status(200).json({ ok: true, heart_count: count, hearted: on });
  } catch (e) { return res.status(200).json({ ok: false }); }
}
