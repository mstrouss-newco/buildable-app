// /api/delete-song.js
// Lets a kid remove ONE of their own saved songs to make room (max 10 per kid).
// Scoped strictly to the caller's own profile: the delete only matches when BOTH
// song_id AND device_id match, so a kid can never delete another kid's song.
// This is the kid managing their own small library, not a bulk/admin operation.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sb(path, init) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: "Storage not configured" });
  }

  const body = await readBody(req);
  const deviceId = (body.deviceId || req.query.deviceId || "").toString().trim();
  const songId = (body.songId || req.query.songId || "").toString().trim();

  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  if (!songId) return res.status(400).json({ error: "songId is required" });

  try {
    // Delete only the caller's own song (both filters must match).
    const q =
      "saved_songs?song_id=eq." + encodeURIComponent(songId) +
      "&device_id=eq." + encodeURIComponent(deviceId);
    const r = await sb(q, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "delete failed", status: r.status, detail: detail.slice(0, 300) });
    }
    const removed = await r.json();
    const deletedCount = Array.isArray(removed) ? removed.length : 0;
    return res.status(200).json({
      ok: true,
      deleted: deletedCount,
      message: deletedCount ? "Song removed." : "No matching song found.",
    });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
