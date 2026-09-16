// /api/typing-voice.js — short spoken coaching lines for the typing school via
// ElevenLabs TTS, cached forever in narration_cache, served as mp3.
//
//   GET ?text=Move your left middle finger up to E.    -> audio/mpeg
//   GET ?text=...&force=1                              -> regenerate
//
// The page sends the SENTENCE rather than a line id, because the lines are
// generated from the finger map and the lesson list and would otherwise have to
// be kept in step in two files. The cache key is a hash of the sentence, so a
// line is paid for once, the first time any child hears it, and then kept.
//
// Two guards keep that honest: a length cap, and a character whitelist that
// rejects digits. A sentence with a score in it ("twenty one words a minute")
// would be a different sentence every run, so the page never speaks numbers.
//
// If ELEVENLABS_API_KEY is not set the endpoint answers 503 with
// {configured:false} and the page falls back to the browser's own voice, so
// read-aloud never goes silent.
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, friendly
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

const MAX_LEN = 120;
// letters, spaces and the punctuation a coaching line needs. No digits.
const OK_TEXT = /^[A-Za-z ,.'!?;:-]+$/;

async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].audio_b64 : null;
  } catch { return null; }
}
async function cachePut(key, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify({ cache_key: key, audio_b64: b64, word_timings: null }),
    });
  } catch {}
}
async function cacheDel(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
  } catch {}
}

export default async function handler(req, res) {
  const text = (req.query.text || "").toString().trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_LEN || !OK_TEXT.test(text)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ ok: false, error: "bad text" });
  }
  const key = "typingvoice:" + crypto.createHash("sha1").update(VOICE + "|" + text.toLowerCase()).digest("hex");

  if (req.query.force) await cacheDel(key);
  let b64 = req.query.force ? null : await cacheGet(key);

  if (!b64) {
    const elKey = process.env.ELEVENLABS_API_KEY;
    if (!elKey) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ ok: false, configured: false });
    }
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
        method: "POST",
        headers: { "xi-api-key": elKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          // Warm and steady. A teaching line should not be performed.
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
        }),
      });
      if (!r.ok) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({
          ok: false, failed: true, status: r.status,
          detail: (await r.text().catch(() => "")).slice(0, 200),
        });
      }
      b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
      await cachePut(key, b64);
    } catch (e) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ ok: false, error: String(e && e.message).slice(0, 160) });
    }
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64, "base64"));
}
