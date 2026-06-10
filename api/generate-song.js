// /api/generate-song.js
// Provider-agnostic music generation for the kid-facing Music Maker.
//
// HOW THIS WORKS
// --------------
// The kid sends { vibe, theme, prompt, kidName }. We turn that into a friendly
// title + a music "brief", then call generateMusic(brief) which dispatches to
// whichever provider is configured via the MUSIC_PROVIDER env var.
//
// Until you choose a provider, MUSIC_PROVIDER is unset and we fall back to
// "demo" mode, which returns a short, royalty-free generated tone so the whole
// experience (create -> listen -> save) works end-to-end TODAY. When you sign up
// with a real provider and set the env vars in Vercel, real songs turn on with
// NO other code changes.
//
// TO GO LIVE WITH A REAL PROVIDER (you do this in Vercel, never in code):
//   - ElevenLabs Music:  set MUSIC_PROVIDER=elevenlabs and ELEVENLABS_API_KEY=...
//   - Replicate/MusicGen: set MUSIC_PROVIDER=replicate and REPLICATE_API_TOKEN=...
// Then fill in the matching adapter below (marked with TODO).

const MUSIC_PROVIDER = (process.env.MUSIC_PROVIDER || "demo").toLowerCase();

const VIBES = {
  happy:  { tempo: "upbeat",   color: "#FFD93D", mood: "cheerful, bright, playful" },
  epic:   { tempo: "cinematic",color: "#5B6CFF", mood: "heroic, adventurous, big drums" },
  spooky: { tempo: "eerie",    color: "#8E44AD", mood: "mysterious, spooky, fun-scary" },
  silly:  { tempo: "bouncy",   color: "#FF8FB1", mood: "goofy, comedic, wobbly" },
  chill:  { tempo: "mellow",   color: "#4FD1C5", mood: "calm, dreamy, gentle" },
  dance:  { tempo: "energetic",color: "#FF6B6B", mood: "danceable, funky, four-on-the-floor" },
};

function makeTitle(vibe, theme, prompt) {
  const p = (prompt || "").trim();
  if (p) {
    const words = p.split(/\s+/).slice(0, 5).join(" ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const v = vibe ? vibe.charAt(0).toUpperCase() + vibe.slice(1) : "My";
  return theme ? `${v} ${theme} Song` : `${v} Song`;
}

function buildBrief({ vibe, theme, prompt }) {
  const v = VIBES[vibe] || VIBES.happy;
  const parts = [v.mood, v.tempo];
  if (theme) parts.push(`themed around a ${theme} world`);
  if (prompt) parts.push(`about: ${prompt}`);
  parts.push("instrumental, kid-friendly, around 20-30 seconds, no explicit content");
  return parts.join(", ");
}

// --- The single dispatch point. Returns { audioUrl, durationSec, provider, meta }.
async function generateMusic(brief, opts) {
  switch (MUSIC_PROVIDER) {
    case "elevenlabs":
      return generateWithElevenLabs(brief, opts);
    case "replicate":
      return generateWithReplicate(brief, opts);
    case "demo":
    default:
      return generateDemo(brief, opts);
  }
}

// DEMO: returns a tiny WAV data URL (a pleasant chord) so the flow is playable now.
function generateDemo(brief, opts) {
  const seconds = 3;
  const rate = 8000;
  const n = seconds * rate;
  const freqs = { happy: [523, 659, 784], epic: [392, 523, 659], spooky: [330, 392, 466],
                  silly: [587, 740, 880], chill: [349, 440, 523], dance: [440, 554, 659] };
  const f = freqs[(opts && opts.vibe) || "happy"] || freqs.happy;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    for (const hz of f) s += Math.sin(2 * Math.PI * hz * t);
    const env = Math.min(1, t * 4) * Math.max(0, 1 - t / seconds);
    data[i] = Math.max(-1, Math.min(1, (s / f.length) * env)) * 32767 * 0.6;
  }
  const wav = encodeWav(data, rate);
  const b64 = Buffer.from(wav).toString("base64");
  return {
    audioUrl: "data:audio/wav;base64," + b64,
    durationSec: seconds,
    provider: "demo",
    meta: { brief, note: "Demo tone. Set MUSIC_PROVIDER + a key in Vercel for real songs." },
  };
}

function encodeWav(samples, rate) {
  const bytesPerSample = 2;
  const buf = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const dv = new DataView(buf);
  const wr = (off, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
  wr(0, "RIFF");
  dv.setUint32(4, 36 + samples.length * bytesPerSample, true);
  wr(8, "WAVE"); wr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * bytesPerSample, true);
  dv.setUint16(32, bytesPerSample, true);
  dv.setUint16(34, 16, true);
  wr(36, "data");
  dv.setUint32(40, samples.length * bytesPerSample, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * bytesPerSample, samples[i], true);
  return buf;
}

// TODO: ElevenLabs Music adapter. Fill in once you have ELEVENLABS_API_KEY.
async function generateWithElevenLabs(brief, opts) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return generateDemo(brief, opts);
  // TODO: call the ElevenLabs Music endpoint here, upload/return the hosted audio URL.
  // Keep the same return shape: { audioUrl, durationSec, provider:'elevenlabs', meta }.
  return generateDemo(brief, opts);
}

// TODO: Replicate / MusicGen adapter. Fill in once you have REPLICATE_API_TOKEN.
async function generateWithReplicate(brief, opts) {
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) return generateDemo(brief, opts);
  // TODO: create a prediction, poll for completion, return the output URL.
  return generateDemo(brief, opts);
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = await readBody(req);
  const vibe = (body.vibe || "happy").toString().toLowerCase().slice(0, 20);
  const theme = (body.theme || "").toString().slice(0, 40);
  const prompt = (body.prompt || "").toString().slice(0, 300);

  const title = makeTitle(vibe, theme, prompt);
  const brief = buildBrief({ vibe, theme, prompt });
  const v = VIBES[vibe] || VIBES.happy;

  try {
    const result = await generateMusic(brief, { vibe, theme, prompt });
    return res.status(200).json({
      ok: true,
      title,
      vibe,
      theme: theme || null,
      prompt: prompt || null,
      coverColor: v.color,
      audioUrl: result.audioUrl,
      durationSec: result.durationSec || null,
      provider: result.provider,
      meta: result.meta || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "generation failed", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
