// /api/narrate-story-page.js
// Premium read-aloud for one story page via ElevenLabs (text-to-speech WITH
// timestamps). Returns the audio plus WORD-LEVEL timings so the Story Reader can
// highlight each word exactly in sync. If ELEVENLABS_API_KEY is not set, returns
// { configured:false } and the reader uses the browser's built-in speech instead.
//
// OWNER SETUP (env in Vercel, by name only — never in code):
//   ELEVENLABS_API_KEY   (required to enable premium narration)
//   ELEVENLABS_VOICE_ID  (optional; defaults to a warm, clear voice)
//   ELEVENLABS_MODEL_ID  (optional; defaults to eleven_turbo_v2_5 — fast + cheap)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — clear, friendly
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}
async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usage_log?select=cost_usd&date=eq.${today}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!r.ok) return true;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "narration", model: "elevenlabs" }),
    });
  } catch { /* best-effort */ }
}

// Convert ElevenLabs char-level alignment to WORD-level timings the reader needs.
function toWordTimings(text, alignment) {
  try {
    const chars = alignment.characters || [];
    const starts = alignment.character_start_times_seconds || [];
    const ends = alignment.character_end_times_seconds || [];
    const words = [];
    let cur = null;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } continue; }
      if (!cur) cur = { w: "", start: starts[i] ?? 0, end: ends[i] ?? 0 };
      cur.w += ch;
      cur.end = ends[i] ?? cur.end;
    }
    if (cur) words.push(cur);
    return words;
  } catch { return null; }
}

export default async function handler(req, res) {
  // Safe diagnostic (boolean only, no secret value): GET /api/narrate-story-page
  if (req.method === "GET") {
    // ?probe=tts runs ONE tiny TTS call to confirm this key has speech access.
    if (req.query && req.query.probe === "tts") {
      const k = process.env.ELEVENLABS_API_KEY;
      if (!k) return res.status(200).json({ ok: true, gotAudio: false, reason: "no_key" });
      const vid = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
      try {
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/with-timestamps`, {
          method: "POST", headers: { "xi-api-key": k, "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Hello there!", model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5" }),
        });
        if (r.ok) { const d = await r.json(); return res.status(200).json({ ok: true, gotAudio: Boolean(d.audio_base64), hasTimings: Boolean(d.alignment) }); }
        const t = await r.text();
        return res.status(200).json({ ok: true, gotAudio: false, status: r.status, error: t.slice(0, 220) });
      } catch (e) { return res.status(200).json({ ok: true, gotAudio: false, error: String((e && e.message) || e).slice(0, 160) }); }
    }
    return res.status(200).json({ ok: true, hasElevenLabs: Boolean(process.env.ELEVENLABS_API_KEY) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(200).json({ ok: true, configured: false });
  if (!(await underBudget())) return res.status(200).json({ ok: true, configured: false, reason: "over_daily_budget" });

  const body = await readBody(req);
  const text = (body.text || "").toString().slice(0, 600).trim();
  if (!text) return res.status(400).json({ error: "text is required" });
  const voiceId = (body.voiceId || DEFAULT_VOICE).toString();

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(200).json({ ok: true, configured: false, reason: "tts_failed", detail: detail.slice(0, 160) });
    }
    const data = await r.json();
    const audio = data.audio_base64;
    if (!audio) return res.status(200).json({ ok: true, configured: false, reason: "no_audio" });
    const wordTimings = toWordTimings(text, data.alignment || data.normalized_alignment || {});
    await logCost(parseFloat(process.env.NARRATION_COST_USD || "0.01")); // rough per-page estimate
    return res.status(200).json({
      ok: true, configured: true,
      audioUrl: "data:audio/mpeg;base64," + audio,
      wordTimings,
    });
  } catch (e) {
    return res.status(200).json({ ok: true, configured: false, reason: "error", detail: String((e && e.message) || e).slice(0, 120) });
  }
}
