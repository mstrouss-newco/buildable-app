// /api/play-creation.js  POST {kind,id}  -> increments play_count.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const TABLE = { song: ["saved_songs", "song_id"], story: ["saved_stories", "story_id"], game: ["published_games", "game_id"] };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(200).json({ ok: false });
  const b = await readBody(req);
  const kind = (b.kind || "").toString(), id = (b.id || "").toString();
  if (!TABLE[kind] || !id) return res.status(400).json({ error: "kind,id required" });
  const [table, idcol] = TABLE[kind];
  try {
    const cur = await fetch(`${URL}/rest/v1/${table}?${idcol}=eq.${encodeURIComponent(id)}&select=play_count`, { headers: H });
    const rows = await cur.json();
    const pc = (rows[0] && rows[0].play_count) || 0;
    await fetch(`${URL}/rest/v1/${table}?${idcol}=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ play_count: pc + 1 }) });
    return res.status(200).json({ ok: true, play_count: pc + 1 });
  } catch (e) { return res.status(200).json({ ok: false }); }
}
