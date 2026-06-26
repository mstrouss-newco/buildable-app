// /api/generate-song.js
// Provider-agnostic music generation for the kid-facing Music Maker.
//
// Providers are selected via the MUSIC_PROVIDER env var (set in Vercel):
//   - ElevenLabs Music: MUSIC_PROVIDER=elevenlabs + ELEVENLABS_API_KEY=...
//   - Replicate/MusicGen: MUSIC_PROVIDER=replicate + REPLICATE_API_TOKEN=...
// If unset (or a key is missing) we fall back to "demo" mode (a short tone)
// so the create -> listen -> save flow always works.
//
// COST TRACKING: real generations log a row into Supabase `usage_log`
// ({ date, cost_usd, kind:"song", model }) using SUPABASE_URL +
// SUPABASE_SERVICE_KEY, the same table the admin-stats endpoint reads. A
// daily budget guard (DAILY_BUDGET_USD) is enforced before spending.

const MUSIC_PROVIDER = (process.env.MUSIC_PROVIDER || "demo").toLowerCase();

// Song length cap. Kept at 90s for now (set MAX_SONG_SECONDS in Vercel to change).
const MAX_SONG_SECONDS = Math.max(3, Math.min(600, parseInt(process.env.MAX_SONG_SECONDS || "90", 10)));
// Rough cost estimate per generated song (USD). ElevenLabs music bills by credits;
// this is an approximation for the daily-budget guard + admin cost breakdown.
const SONG_COST_USD = parseFloat(process.env.SONG_COST_USD || "0.30");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

const VIBES = {
    happy: { tempo: "upbeat",   color: "#FFD93D", mood: "cheerful, bright, playful" },
    epic: { tempo: "cinematic",color: "#5B6CFF", mood: "heroic, adventurous, big drums" },
    spooky: { tempo: "eerie",   color: "#8E44AD", mood: "mysterious, spooky, fun-scary" },
    silly: { tempo: "bouncy",   color: "#FF8FB1", mood: "goofy, comedic, wobbly" },
    chill: { tempo: "mellow",   color: "#4FD1C5", mood: "calm, dreamy, gentle" },
    dance: { tempo: "energetic",color: "#FF6B6B", mood: "danceable, funky, four-on-the-floor" },
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

const GENRE_DESC = {
    pop: "pop", country: "country with a twang", hiphop: "hip hop with a beat",
    rock: "rock", disco: "funky disco", sleepy: "soft sleepy-time lullaby",
    marching: "marching-band style", reggae: "laid-back reggae",
    kpop: "upbeat K-pop with bright synths and a catchy sing-along hook",
};
const SINGER_DESC = {
    none: "instrumental (no singer)", boy: "a boy singing",
    girl: "a girl singing", group: "a group of kids singing together",
    both: "boy and girl singing together", robot: "a fun robot voice",
};
const DRUM_DESC = {
    big: "big booming drums", soft: "soft gentle beats",
    marching: "marching drums", bongos: "bongo drums", electro: "electronic drum-machine beats",
};
const GUITAR_DESC = {
    electric: "electric guitar", acoustic: "acoustic guitar",
    twangy: "twangy country guitar", bass: "deep bass guitar", none: "no guitar",
};
const STRING_DESC = {
    violin: "violin", cello: "deep cello strings", harp: "gentle harp", orchestra: "a sweeping string orchestra", none: "no strings",
};
const SPEED_DESC = { slow: "slow", medium: "medium-paced", fast: "fast and energetic", superfast: "super fast and high-energy", groovy: "a groovy mid-tempo bounce" };

function buildBrief(c) {
    const v = VIBES[c.vibe] || VIBES.happy;
    const parts = [v.mood, c.speed ? SPEED_DESC[c.speed] || v.tempo : v.tempo];
    if (c.genre && GENRE_DESC[c.genre]) parts.push(GENRE_DESC[c.genre] + " style");
    if (c.singer && SINGER_DESC[c.singer]) parts.push(SINGER_DESC[c.singer]);
    const instruments = [];
    if (c.drums && DRUM_DESC[c.drums]) instruments.push(DRUM_DESC[c.drums]);
    if (c.guitar && GUITAR_DESC[c.guitar]) instruments.push(GUITAR_DESC[c.guitar]);
    if (c.strings && STRING_DESC[c.strings]) instruments.push(STRING_DESC[c.strings]);
    if (instruments.length) parts.push("featuring " + instruments.join(", "));
    if (c.theme) parts.push(`themed around a ${c.theme} world`);
    if (c.prompt) parts.push(`about: ${c.prompt}`);
    parts.push(`kid-friendly, up to ${MAX_SONG_SECONDS} seconds, no explicit content`);
    return parts.join(", ");
}

function makeRecipe(c) {
    const bits = [];
    const vibeLabel = c.vibe ? c.vibe.charAt(0).toUpperCase() + c.vibe.slice(1) : "Happy";
    bits.push(vibeLabel);
    if (c.genre && GENRE_DESC[c.genre]) bits.push(GENRE_DESC[c.genre]);
    if (c.singer && c.singer !== "none" && SINGER_DESC[c.singer]) bits.push(SINGER_DESC[c.singer]);
    const inst = [];
    if (c.drums && DRUM_DESC[c.drums]) inst.push(DRUM_DESC[c.drums]);
    if (c.guitar && c.guitar !== "none" && GUITAR_DESC[c.guitar]) inst.push(GUITAR_DESC[c.guitar]);
    if (c.strings && c.strings !== "none" && STRING_DESC[c.strings]) inst.push(STRING_DESC[c.strings]);
    if (inst.length) bits.push(inst.join(" + "));
    return "\u{1F3B5} " + bits.join(" \u00B7 ");
}

// ---- Cost tracking (mirrors the usage_log pattern used by generate-creature.js) ----
async function checkBudget(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) return true;
    try {
          const today = new Date().toISOString().slice(0, 10);
          const r = await fetch(`${supabaseUrl}/rest/v1/usage_log?select=cost_usd&date=eq.${today}`, {
                  headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
          });
          if (!r.ok) return true;
          const rows = await r.json();
          const total = rows.reduce((s, row) => s + (row.cost_usd || 0), 0);
          return total < DAILY_BUDGET_USD;
    } catch (e) { return true; }
}

async function logSpend(supabaseUrl, supabaseKey, cost, model) {
    if (!supabaseUrl || !supabaseKey) return;
    try {
          const today = new Date().toISOString().slice(0, 10);
          await fetch(`${supabaseUrl}/rest/v1/usage_log`, {
                  method: "POST",
                  headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ date: today, cost_usd: cost, kind: "song", model: model || "music" })
          });
    } catch (e) {}
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
    const o = opts || {};
    const speed = o.speed || "";
    const seconds = speed === "slow" ? 4 : speed === "fast" ? 2 : 3;
    const rate = 8000;
    const n = seconds * rate;
    const freqs = { happy: [523, 659, 784], epic: [392, 523, 659], spooky: [330, 392, 466],
                       silly: [587, 740, 880], chill: [349, 440, 523], dance: [440, 554, 659] };
    const f = freqs[o.vibe || "happy"] || freqs.happy;
    const addBass = !!(o.drums || o.strings);
    const data = new Int16Array(n);
    for (let i = 0; i < n; i++) {
          const t = i / rate;
          let s = 0;
          for (const hz of f) s += Math.sin(2 * Math.PI * hz * t);
          if (addBass) s += 0.5 * Math.sin(2 * Math.PI * (f[0] / 2) * t);
          const env = Math.min(1, t * 4) * Math.max(0, 1 - t / seconds);
          const div = f.length + (addBass ? 0.5 : 0);
          data[i] = Math.max(-1, Math.min(1, (s / div) * env)) * 32767 * 0.6;
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

// ElevenLabs Music adapter. Calls POST https://api.elevenlabs.io/v1/music,
// which returns the raw audio bytes; we inline them as a base64 data URL.
// TODO(later): upload to Supabase Storage and return a hosted URL instead of
// inlining, to keep saved_songs rows small.
async function generateWithElevenLabs(brief, opts) {
    const o = opts || {};
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return generateDemo(brief, o);

  // Budget guard before spending.
  if (o.supabaseUrl && o.supabaseKey) {
        const inBudget = await checkBudget(o.supabaseUrl, o.supabaseKey);
        if (!inBudget) {
                const demo = generateDemo(brief, o);
                demo.meta = { ...(demo.meta || {}), reason: "daily_budget_reached" };
                return demo;
        }
  }

  const model = (process.env.ELEVENLABS_MUSIC_MODEL || "music_v1").toLowerCase();
    const lengthMs = Math.max(3000, Math.min(MAX_SONG_SECONDS * 1000, 600000));

  const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
          const res = await fetch("https://api.elevenlabs.io/v1/music", {
                  method: "POST",
                  headers: {
                            "xi-api-key": key,
                            "Content-Type": "application/json",
                            "Accept": "audio/mpeg",
                  },
                  body: JSON.stringify({
                            prompt: brief.slice(0, 4000),
                            music_length_ms: lengthMs,
                            model_id: model,
                  }),
                  signal: ctrl.signal,
          });
          clearTimeout(timer);

      if (!res.ok) {
              const errText = await res.text().catch(() => "");
              const demo = generateDemo(brief, o);
              demo.meta = { ...(demo.meta || {}), elevenlabs_error: `${res.status}: ${errText.slice(0, 200)}` };
              return demo;
      }

      const buf = Buffer.from(await res.arrayBuffer());
          const b64 = buf.toString("base64");
          const audioUrl = "data:audio/mpeg;base64," + b64;

      // Log the spend so it shows up in the admin cost breakdown.
      if (o.supabaseUrl && o.supabaseKey) {
              await logSpend(o.supabaseUrl, o.supabaseKey, SONG_COST_USD, model);
      }

      return {
              audioUrl,
              durationSec: Math.round(lengthMs / 1000),
              provider: "elevenlabs",
              meta: { brief, model, songId: res.headers.get("song-id") || null, costUsd: SONG_COST_USD },
      };
    } catch (e) {
          clearTimeout(timer);
          const demo = generateDemo(brief, o);
          demo.meta = { ...(demo.meta || {}), elevenlabs_error: String((e && e.message) || e).slice(0, 200) };
          return demo;
    }
}

// TODO: Replicate / MusicGen adapter. Fill in once you have REPLICATE_API_TOKEN.
async function generateWithReplicate(brief, opts) {
    const key = process.env.REPLICATE_API_TOKEN;
    if (!key) return generateDemo(brief, opts);
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
    const clean = (x, n) => (x || "").toString().toLowerCase().slice(0, n);
    const choices = {
          vibe: clean(body.vibe, 20) || "happy",
          genre: clean(body.genre, 20),
          singer: clean(body.singer, 20),
          drums: clean(body.drums, 20),
          guitar: clean(body.guitar, 20),
          strings: clean(body.strings, 20),
          speed: clean(body.speed, 20),
          theme: (body.theme || "").toString().slice(0, 40),
          prompt: (body.prompt || "").toString().slice(0, 300),
    };

  const title = makeTitle(choices.vibe, choices.theme, choices.prompt);
    const brief = buildBrief(choices);
    const recipe = makeRecipe(choices);
    const v = VIBES[choices.vibe] || VIBES.happy;

  const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  try {
        const result = await generateMusic(brief, { ...choices, recipe, supabaseUrl, supabaseKey });
        return res.status(200).json({
                ok: true,
                title,
                vibe: choices.vibe,
                genre: choices.genre || null,
                singer: choices.singer || null,
                drums: choices.drums || null,
                guitar: choices.guitar || null,
                strings: choices.strings || null,
                speed: choices.speed || null,
                theme: choices.theme || null,
                prompt: choices.prompt || null,
                coverColor: v.color,
                audioUrl: result.audioUrl,
                durationSec: result.durationSec || null,
                provider: result.provider,
                meta: { ...(result.meta || {}), recipe, choices },
        });
  } catch (e) {
        return res.status(500).json({ error: "generation failed", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
