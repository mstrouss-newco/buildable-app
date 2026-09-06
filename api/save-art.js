// /api/save-art.js
// Saves one drawing (finished PNG + replayable recipe) to a kid/parent profile by
// device_id (+ optional kid_profile_id so it follows the child across devices).
// Mirrors save-story.js: service-key writes, a per-profile cap, device-lane fallback.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_ART = 40;

function sb(path, init) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}),
    },
  });
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Storage not configured" });

  const body = await readBody(req);
  // engine sends snake_case (device_id, art_id, image_b64, art, ...)
  const deviceId = (body.device_id || body.deviceId || "").toString().trim();
  const kidProfileId = (body.kid_profile_id || body.kidProfileId || "").toString().trim() || null;
  const art = body.art && typeof body.art === "object" ? body.art : null;
  const title = (body.title || "").toString().trim().slice(0, 80) || "My masterpiece";

  if (!deviceId) return res.status(400).json({ error: "device_id is required" });
  if (!art || !Array.isArray(art.ops)) return res.status(400).json({ error: "valid art (with ops[]) is required" });

  try {
    const countRes = await sb("saved_art?device_id=eq." + encodeURIComponent(deviceId) + "&select=art_id");
    const existing = await countRes.json();
    const current = Array.isArray(existing) ? existing.length : 0;
    if (current >= MAX_ART) {
      return res.status(409).json({ error: "full", message: `You already have ${MAX_ART} drawings! Delete one to make room.`, count: current, max: MAX_ART });
    }

    const artId = (body.art_id || body.artId || "").toString().trim() ||
      "art_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const published = body.published === true || body.published === "true";

    const row = {
      art_id: artId, device_id: deviceId, kid_profile_id: kidProfileId,
      kid_name: (body.kid_name || body.kidName || "").toString().trim().slice(0, 60) || null,
      title, theme: (body.theme || "").toString().slice(0, 40) || null,
      image_b64: (body.image_b64 || "").toString() || null,
      art, published, published_at: published ? new Date().toISOString() : null,
    };

    // A stale/guest kid_profile_id that has no row in kid_profiles trips a
    // foreign-key error. Retrying without the link keeps the drawing (device
    // lane) instead of losing it -- but the answer must SAY that happened.
    // Silently returning ok:true is what let art-studio.html cheer "Saved to
    // your gallery!" while the gallery went on saying "No saved art yet".
    let lane = kidProfileId ? "kid" : "device";
    let insRes = await sb("saved_art", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
    if (!insRes.ok && kidProfileId) {
      insRes = await sb("saved_art", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...row, kid_profile_id: null }) });
      if (insRes.ok) lane = "device";
    }
    if (!insRes.ok) {
      const detail = await insRes.text();
      return res.status(502).json({ error: "save failed", status: insRes.status, detail: detail.slice(0, 300) });
    }
    const saved = await insRes.json();
    return res.status(200).json({
      ok: true, art: Array.isArray(saved) ? saved[0] : saved, count: current + 1, max: MAX_ART,
      lane, savedToKid: lane === "kid",
      ...(lane === "device" && kidProfileId ? { note: "saved to device", message: "Saved to this device, but not filed under this player yet." } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
