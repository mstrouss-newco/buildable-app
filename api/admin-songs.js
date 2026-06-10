undefined// api/admin-songs.js
// Admin-only listing of ALL saved songs across every kid/device.
// Read-only. Service key stays server-side (Vercel env). No device filter.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!url || !key) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const select =
    "song_id,device_id,kid_name,title,prompt,vibe,theme,audio_url,cover_color,duration_sec,provider,created_at";
  const path =
    "saved_songs?select=" +
    encodeURIComponent(select) +
    "&order=created_at.desc&limit=" +
    limit;

  try {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
      },
    });
    if (!r.ok) {
      const body = await r.text();
      res.status(502).json({ error: "Upstream error", detail: body.slice(0, 300) });
      return;
    }
    const rows = await r.json();

    const byKid = {};
    for (const s of rows) {
      const k = (s.kid_name || "Unknown") + " | " + (s.device_id || "");
      if (!byKid[k]) byKid[k] = { kid_name: s.kid_name || "Unknown", device_id: s.device_id || "", count: 0 };
      byKid[k].count += 1;
    }

    res.status(200).json({
      total: rows.length,
      kids: Object.values(byKid).sort((a, b) => b.count - a.count),
      songs: rows,
    });
  } catch (e) {
    res.status(500).json({ error: "Request failed", detail: String(e).slice(0, 300) });
  }
}
