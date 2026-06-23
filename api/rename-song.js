// /api/rename-song.js
// Lets a kid/parent rename ONE of their own saved songs in their library.
// Scoped strictly to the caller's own songs: the update only matches when the
// song_id AND the owner lane match (kid_profile_id when signed in, else
// device_id), mirroring delete-song.js. A kid can never rename another kid's
// song. This is the owner managing their own small library, not an admin op.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_TITLE = 120;

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
    if (req.method !== "POST" && req.method !== "PATCH") {
          return res.status(405).json({ error: "Method not allowed" });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
          return res.status(503).json({ error: "Storage not configured" });
    }

  const body = await readBody(req);
    const songId = (body.songId || "").toString().trim();
    const deviceId = (body.deviceId || "").toString().trim();
    const kidProfileId = (body.kidProfileId || "").toString().trim();
    const title = (body.title || "").toString().trim().slice(0, MAX_TITLE);

  if (!songId) return res.status(400).json({ error: "songId is required" });
    if (!deviceId && !kidProfileId) {
          return res.status(400).json({ error: "deviceId or kidProfileId is required" });
    }
    if (!title) return res.status(400).json({ error: "title is required" });

  try {
        // Scope to the caller's own song. Prefer kid_profile_id (follows the kid
      // across devices) when signed in; otherwise fall back to the device lane.
      const ownerFilter = kidProfileId
          ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId)
              : "device_id=eq." + encodeURIComponent(deviceId);
        const q =
                "saved_songs?song_id=eq." + encodeURIComponent(songId) + "&" + ownerFilter;

      const r = await sb(q, {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify({ title }),
      });
        if (!r.ok) {
                const detail = await r.text();
                return res.status(502).json({ error: "rename failed", status: r.status, detail: detail.slice(0, 300) });
        }
        const updated = await r.json();
        const count = Array.isArray(updated) ? updated.length : 0;
        return res.status(200).json({
                ok: true,
                renamed: count,
                song: count ? updated[0] : null,
                message: count ? "Song renamed." : "No matching song found.",
        });
  } catch (e) {
        return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
