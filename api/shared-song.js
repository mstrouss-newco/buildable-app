// /api/shared-song.js
// PUBLIC, read-only fetch of ONE saved song for a share link (public/song.html).
// No auth: anyone with the unguessable song_id may listen. Returns only safe fields.
//   GET /api/shared-song?id=SONG_ID  ->  { song: { title, audio_url, cover_color, vibe, theme } }
const sbHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const id = (req.query && req.query.id ? String(req.query.id) : "").trim();
  if (!id) return res.status(400).json({ error: "id required" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: "not configured" });

  try {
    const url =
      supabaseUrl +
      "/rest/v1/saved_songs?song_id=eq." +
      encodeURIComponent(id) +
      "&select=title,audio_url,cover_color,vibe,theme&limit=1";
    const r = await fetch(url, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return res.status(502).json({ error: "lookup failed" });
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(404).json({ error: "not found" });
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.status(200).json({ song: row });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
