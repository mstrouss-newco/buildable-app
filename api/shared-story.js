// /api/shared-story.js
// PUBLIC, read-only fetch of ONE saved story so it can be opened from a share link
// (public/story.html). No auth: anyone with the unguessable story_id may view it.
// Returns only the fields needed to render the book — never device_id / profile ids.
//   GET /api/shared-story?id=STORY_ID  ->  { story: { title, world, cover_color, story } }
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
      "/rest/v1/saved_stories?story_id=eq." +
      encodeURIComponent(id) +
      "&select=title,world,cover_color,story&limit=1";
    const r = await fetch(url, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return res.status(502).json({ error: "lookup failed" });
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(404).json({ error: "not found" });
    // Cache at the edge for a bit — shared books don't change.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.status(200).json({ story: row });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
}
