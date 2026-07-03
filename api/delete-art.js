// /api/delete-art.js
// Lets a kid remove ONE of their own saved drawings to make room (max 40 per kid).
// Scoped strictly to the caller's own profile: the delete only matches when the
// art_id matches AND it belongs to this kid_profile_id (when signed in) or device_id.
// This is the kid managing their own small gallery, not a bulk/admin operation.
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
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
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
  const deviceId = (body.deviceId || body.device_id || req.query.deviceId || "").toString().trim();
  const kidProfileId = (body.kidProfileId || body.kid_profile_id || req.query.kidProfileId || "").toString().trim();
  const artId = (body.artId || body.art_id || req.query.artId || "").toString().trim();

  if (!artId) return res.status(400).json({ error: "artId is required" });
  if (!deviceId && !kidProfileId) return res.status(400).json({ error: "deviceId or kidProfileId is required" });

  try {
    // Match this kid's own drawing: art_id AND (kid_profile_id when signed in, else device_id).
    const owner = kidProfileId
      ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId)
      : "device_id=eq." + encodeURIComponent(deviceId);
    let q = "saved_art?art_id=eq." + encodeURIComponent(artId) + "&" + owner;
    let r = await sb(q, { method: "DELETE", headers: { Prefer: "return=representation" } });
    let removed = r.ok ? await r.json() : [];
    // Fallback: older art rows may have been saved device-only (no kid_profile_id),
    // so if a signed-in kid's delete matched nothing, retry by device_id.
    if ((!Array.isArray(removed) || !removed.length) && kidProfileId && deviceId) {
      q = "saved_art?art_id=eq." + encodeURIComponent(artId) + "&device_id=eq." + encodeURIComponent(deviceId);
      r = await sb(q, { method: "DELETE", headers: { Prefer: "return=representation" } });
      removed = r.ok ? await r.json() : [];
    }
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "delete failed", status: r.status, detail: detail.slice(0, 300) });
    }
    const deletedCount = Array.isArray(removed) ? removed.length : 0;
    return res.status(200).json({ ok: true, deleted: deletedCount, message: deletedCount ? "Drawing removed." : "No matching drawing found." });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
