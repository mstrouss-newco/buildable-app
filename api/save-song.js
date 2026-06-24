// /api/save-song.js
// Saves one AI-generated song to a kid/parent profile (by device_id).
// Enforces a hard cap of 10 songs per kid: if they already have 10, the save is
// rejected with a friendly message telling them to delete one to make room.
// Songs live centrally (Supabase) so they persist and can be reused in games.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MAX_SONGS = 10;

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: "Storage not configured" });
  }

  const body = await readBody(req);
  const deviceId = (body.deviceId || "").toString().trim();
  const kidProfileId = (body.kidProfileId || "").toString().trim() || null;
  const title = (body.title || "").toString().trim().slice(0, 120);
  const audioUrl = (body.audioUrl || "").toString().trim();

  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  if (!title) return res.status(400).json({ error: "title is required" });
  if (!audioUrl) return res.status(400).json({ error: "audioUrl is required" });

  try {
    // 1) Enforce the per-kid cap.
    const countRes = await sb(
      "saved_songs?device_id=eq." + encodeURIComponent(deviceId) + "&select=song_id",
      { headers: { Prefer: "count=exact" } }
    );
    const existing = await countRes.json();
    const current = Array.isArray(existing) ? existing.length : 0;
    if (current >= MAX_SONGS) {
      return res.status(409).json({
        error: "full",
        message: "You already have 10 songs! Delete one to make room for a new tune.",
        count: current,
        max: MAX_SONGS,
      });
    }

    // 2) Insert the new song.
    const songId =
      (body.songId || "").toString().trim() ||
      "song_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

    const row = {
      song_id: songId,
      device_id: deviceId,
      kid_profile_id: kidProfileId,
      kid_name: (body.kidName || "").toString().trim().slice(0, 60) || null,
      title,
      prompt: (body.prompt || "").toString().slice(0, 500) || null,
      vibe: (body.vibe || "").toString().slice(0, 30) || null,
      theme: (body.theme || "").toString().slice(0, 40) || null,
      audio_url: audioUrl,
      cover_color: (body.coverColor || "").toString().slice(0, 20) || null,
      duration_sec: Number.isFinite(+body.durationSec) ? +body.durationSec : null,
      provider: (body.provider || "demo").toString().slice(0, 30),
      meta: body.meta && typeof body.meta === "object" ? body.meta : null,
    };

    const insRes = await sb("saved_songs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!insRes.ok) {
      const detail = await insRes.text();
      // Resilience: a stale/guest kid_profile_id that isn't in the database
      // triggers a foreign-key error. Retry once without the profile link so the
      // song still saves (device lane) instead of hard-failing.
      if (kidProfileId) {
        const retry = await sb("saved_songs", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ ...row, kid_profile_id: null }),
        });
        if (retry.ok) {
          const savedRetry = await retry.json();
          return res.status(200).json({
            ok: true,
            song: Array.isArray(savedRetry) ? savedRetry[0] : savedRetry,
            count: current + 1, max: MAX_SONGS, note: "saved to device",
          });
        }
        const detail2 = await retry.text();
        return res.status(502).json({ error: "save failed", status: retry.status, detail: (detail2 || detail).slice(0, 300) });
      }
      return res.status(502).json({ error: "save failed", status: insRes.status, detail: detail.slice(0, 300) });
    }
    const saved = await insRes.json();
    return res.status(200).json({
      ok: true,
      song: Array.isArray(saved) ? saved[0] : saved,
      count: current + 1,
      max: MAX_SONGS,
    });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
