// /api/cobuild-voice.js — THE KID'S OWN VOICE IN THEIR GAME (Session CB3).
//
// Hold the mic, say "GO GO GO", and the game says it in the child's voice at the
// moment they chose. The clip rides on a CB2 rule:
//
//   { "when":"onWin", "do":"sayLine", "params":{ "text":"GO GO GO", "clip":"/api/cobuild-voice?id=..&at=onWin" } }
//
// so nothing new had to be invented in the manifest, and the shared rules runtime
// plays the clip when it has one and shows the words when it does not.
//
//   POST { op:"save", gameId, at, b64, mime? }  -> { ok, url }
//   GET  ?id=<gameId>&at=<moment>               -> the audio bytes
//
// Storage is narration_cache (cache_key + audio_b64), the same table /api/say.js
// uses for spoken words, so there is no new migration and one place to clear.
// A clip is capped at a few seconds and one per moment per game, which is both a
// kindness to the database and a limit on what a child can record in one go.
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const MOMENTS = { onLevelStart: 1, onCollect: 1, onHit: 1, onLand: 1, onWin: 1, everyNSeconds: 1 };
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = { "audio/webm": "audio/webm", "audio/ogg": "audio/ogg", "audio/mp4": "audio/mp4", "audio/mpeg": "audio/mpeg" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64);
const keyFor = (gameId, at) => "cobuild:" + gameId + ":" + at;

async function get(k) {
  if (!URL_ || !KEY) return null;
  try {
    const r = await fetch(`${URL_}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(k)}&select=audio_b64,word_timings&limit=1`, { headers: H });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}
async function put(k, b64, mime) {
  if (!URL_ || !KEY) return false;
  try {
    await fetch(`${URL_}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(k)}`, { method: "DELETE", headers: H });
    const r = await fetch(`${URL_}/rest/v1/narration_cache`, { method: "POST", headers: H,
      body: JSON.stringify({ cache_key: k, audio_b64: b64, word_timings: { mime } }) });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
  if (req.method === "GET") {
    const id = slug(q.get("id")), at = String(q.get("at") || "");
    if (!id || !MOMENTS[at]) { res.setHeader("Cache-Control", "no-store"); return res.status(400).json({ ok: false, error: "id and at required" }); }
    const row = await get(keyFor(id, at));
    if (!row || !row.audio_b64) { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "no clip" }); }
    const mime = (row.word_timings && TYPES[row.word_timings.mime]) || "audio/webm";
    res.setHeader("Content-Type", mime);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    return res.status(200).send(Buffer.from(row.audio_b64, "base64"));
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "GET or POST" }); }
  if (!URL_ || !KEY) return res.status(503).json({ ok: false, error: "not configured" });
  try {
    const b = await readBody(req);
    const id = slug(b.gameId), at = String(b.at || "");
    if (!id) return res.status(400).json({ ok: false, error: "gameId required" });
    if (!MOMENTS[at]) return res.status(400).json({ ok: false, error: "at must be one of " + Object.keys(MOMENTS).join(", ") });
    const raw = String(b.b64 || "").replace(/^data:[^,]+,/, "");
    if (!raw) return res.status(400).json({ ok: false, error: "no audio" });
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length || bytes.length > MAX_BYTES) return res.status(400).json({ ok: false, error: "the recording must be a few seconds long" });
    const mime = TYPES[String(b.mime || "")] || "audio/webm";
    const ok = await put(keyFor(id, at), raw, mime);
    if (!ok) return res.status(500).json({ ok: false, error: "could not keep the recording" });
    return res.status(200).json({ ok: true, url: "/api/cobuild-voice?id=" + encodeURIComponent(id) + "&at=" + encodeURIComponent(at) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
