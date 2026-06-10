// /api/list-songs.js
// Returns the saved songs for one kid/parent profile (by device_id), newest first.
// Read-only. Used by the kid-facing "My Songs" library and by games that want to
// reuse a previously created track. The 10-song cap is enforced on save, not here.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ configured: false, songs: [], count: 0, max: 10 });
  }

  const deviceId = (req.query.deviceId || req.query.device_id || "").toString().trim();
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }

  try {
    const q =
      "saved_songs?device_id=eq." +
      encodeURIComponent(deviceId) +
      "&select=song_id,title,prompt,vibe,theme,audio_url,cover_color,duration_sec,provider,created_at" +
      "&order=created_at.desc&limit=10";
    const r = await sb(q);
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "list failed", status: r.status, detail: detail.slice(0, 300) });
    }
    const songs = await r.json();
    return res.status(200).json({
      configured: true,
      songs: Array.isArray(songs) ? songs : [],
      count: Array.isArray(songs) ? songs.length : 0,
      max: 10,
    });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e && e.message || e).slice(0, 200) });
  }
}
