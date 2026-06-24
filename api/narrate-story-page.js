// /api/narrate-story-page.js
// TODO (owner action): real read-aloud via ElevenLabs.
// MVP: the Story Reader narrates with the browser's built-in speech (Web Speech
// API) and highlights words on an estimated cadence — zero keys, zero cost.
// When the owner adds ELEVENLABS_API_KEY in Vercel, implement here:
//   1. POST the page text to ElevenLabs TTS (with timestamps endpoint).
//   2. Return { audioUrl, wordTimings: [{ w, start, end }] } so the reader can
//      highlight each word exactly in time and the page audio is high quality.
// Until then this returns { configured:false } and the reader uses its fallback.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(200).json({ ok: true, configured: false });
  // Placeholder for the real implementation (kept inert until wired + tested).
  return res.status(200).json({ ok: true, configured: false, note: "ElevenLabs key present — implement TTS here." });
}
