// /api/transcribe.js — SPEECH TO TEXT, the fallback ear (Session CB3).
//
// The studio listens with the browser's own speech recognition, which is free,
// instant and private. Safari on an iPad and most Android browsers do not have
// it, so those children would be left typing. This is the fallback: the page
// records a few seconds with MediaRecorder and posts the audio here.
//
//   POST { b64, mime? }  ->  { ok, text }
//
// It is deliberately small and one-way. It never stores the audio: a child's
// voice goes to the transcriber and the bytes are dropped, and only the words
// come back (data minimisation, README's own rule for anything a child says).
// With no key it answers { ok:false, reason:"no_ear" } so the page can quietly
// fall back to the keyboard rather than showing a child an error.
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const MAX_BYTES = 8 * 1024 * 1024;   // a few seconds of speech, never a recording session

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a" };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "POST only" }); }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(200).json({ ok: false, reason: "no_ear" });
  try {
    const body = await readBody(req);
    const b64 = String(body.b64 || "").replace(/^data:[^,]+,/, "");
    if (!b64) return res.status(400).json({ ok: false, error: "no audio" });
    const buf = Buffer.from(b64, "base64");
    if (!buf.length || buf.length > MAX_BYTES) return res.status(400).json({ ok: false, error: "audio must be a few seconds long" });
    const mime = EXT[String(body.mime || "")] ? String(body.mime) : "audio/webm";

    const form = new FormData();
    form.append("file", new Blob([buf], { type: mime }), "speech." + (EXT[mime] || "webm"));
    form.append("model", MODEL);
    form.append("language", "en");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: "Bearer " + key }, body: form,
    });
    if (!r.ok) return res.status(200).json({ ok: false, reason: "ear_failed", status: r.status });
    const d = await r.json().catch(() => null);
    const text = (d && typeof d.text === "string") ? d.text.trim().slice(0, 500) : "";
    if (!text) return res.status(200).json({ ok: false, reason: "heard_nothing" });
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    return res.status(200).json({ ok: false, reason: "ear_error", detail: String((err && err.message) || err).slice(0, 120) });
  }
}
