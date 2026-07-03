// /api/assign-creation.js
// Files an existing creation (song / game / story) under a specific kid profile
// by setting its kid_profile_id. Also used to UN-file (kidProfileId = null).
//
// Why this exists: songs saved in the no-login "device" lane have no kid tied
// to them (kid_profile_id is null). Row-level security only lets a signed-in
// parent touch rows that are ALREADY under one of their kids, so those unfiled
// device rows can't be organized through the parent token. This endpoint uses
// the service key (like the other device-lane endpoints) and proves ownership
// by matching the row's device_id to the caller's deviceId.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const KINDS = {
  song:  { table: "saved_songs",   idCol: "song_id" },
  game:  { table: "saved_games",   idCol: "game_id" },
  story: { table: "saved_stories", idCol: "story_id" },
};

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(503).json({ error: "Storage not configured" });

  const body = await readBody(req);
  const kind = (body.kind || "").toString().trim();
  const id = (body.id || "").toString().trim();
  const deviceId = (body.deviceId || "").toString().trim();
  const kidProfileId = (body.kidProfileId || "").toString().trim() || null;

  const spec = KINDS[kind];
  if (!spec) return res.status(400).json({ error: "kind must be song, game, or story" });
  if (!id) return res.status(400).json({ error: "id is required" });
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

  try {
    // 1) Look up the row and confirm it belongs to this device (ownership).
    const look = await sb(spec.table + "?" + spec.idCol + "=eq." + encodeURIComponent(id) +
      "&select=" + spec.idCol + ",device_id,kid_profile_id");
    if (!look.ok) {
      const detail = await look.text();
      return res.status(502).json({ error: "lookup failed", detail: detail.slice(0, 200) });
    }
    const rows = await look.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(404).json({ error: "not found" });
    if (row.device_id !== deviceId) {
      return res.status(403).json({ error: "This creation belongs to a different device." });
    }

    // 2) File it (or unfile it).
    const patch = await sb(spec.table + "?" + spec.idCol + "=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ kid_profile_id: kidProfileId }),
    });
    if (!patch.ok) {
      const detail = await patch.text();
      return res.status(502).json({ error: "update failed", detail: detail.slice(0, 200) });
    }
    const updated = await patch.json();
    return res.status(200).json({ ok: true, kind, id, kidProfileId, row: Array.isArray(updated) ? updated[0] : updated });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e && e.message || e).slice(0, 200) });
  }
}
