// /api/images.js
// Reusable AI image library: generate once (OpenAI gpt-image-1), cache the PNG in
// Postgres keyed by a deterministic hash of its descriptor, and SERVE it as real
// image bytes by a short URL. Identical requests reuse the cached row, so each
// unique image is billed once and reuse is free + instant.
//
//   <img src="/api/images?kind=cover&vibe=happy&theme=space">      // song cover art
//   <img src="/api/images?kind=icon&cat=drums&id=big">            // transparent UI icon
//   GET /api/images?...&force=1        -> regenerate (replace a bad one)
//   GET /api/images?manifest=1[&kind=] -> JSON list of what's cached
//
// On any miss it can't fill (no key / over budget / provider error) it returns a
// non-200 so the frontend's <img onError> falls back to its emoji / color swatch.

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IMG_COST_USD = parseFloat(process.env.IMAGE_COST_USD || "0.011");   // gpt-image-1 low 1024
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

export const config = { api: { bodyParser: false } };

/* ---------------- prompt builders (one per "kind") ---------------- */
const VIBE = { happy:"happy and sunny", epic:"epic and adventurous", spooky:"playful friendly-spooky",
  silly:"goofy and silly", chill:"calm and relaxed", dance:"energetic party" };
const WORLD = { space:"outer space with planets and stars", underwater:"a colorful underwater ocean reef",
  castle:"a magical fairytale castle", candy:"a sweet candy land", forest:"an enchanted forest",
  desert:"a sunny desert", volcano:"a glowing volcano" };

const COVER_STYLE = "vibrant playful square album-cover artwork, modern 3D glossy cartoon style, bright bold colors, fun and inviting, centered, no text, no words, no letters, child-friendly, ages 4-10";
const ICON_STYLE  = "glossy realistic Apple GarageBand app-icon aesthetic, single subject centered, brightly and softly lit, clean, vibrant, kid-friendly, no text, no labels, no watermark";

// Instrument / mood / world icon subjects (mirrors the Music Maker pickers).
const ICONS = {
  drums:  { big:"a full colorful kids' drum kit", soft:"a single snare drum with soft wire brushes on top",
            marching:"a marching-band snare drum with crossed drumsticks", bongos:"a pair of wooden bongo drums" },
  guitar: { electric:"a glossy cherry-red electric guitar", acoustic:"a warm honey-wood acoustic guitar",
            twangy:"a shiny chrome resonator steel guitar" },
  strings:{ violin:"a polished wooden violin with its bow", cello:"a polished wooden cello standing upright with its bow",
            harp:"an elegant golden concert harp" },
  singer: { boy:"a cheerful young boy singing into a microphone", girl:"a cheerful young girl singing into a microphone",
            group:"a happy group of kids singing together at microphones" },
  vibe:   { happy:"a glossy 3D smiling sun radiating sunshine", epic:"a glossy 3D golden lightning bolt with dramatic light",
            spooky:"a cute friendly glowing jack-o-lantern pumpkin", silly:"a goofy 3D face with googly eyes and a clown nose",
            chill:"a relaxed 3D crescent moon wearing sunglasses", dance:"a sparkling 3D disco ball with colorful light beams" },
  style:  { pop:"a shiny pop-star microphone with colorful stars", country:"a brown cowboy hat with a small acoustic guitar",
            hiphop:"modern headphones with a gold chain", rock:"a bright electric guitar with a lightning bolt",
            disco:"a shiny mirror disco ball with retro light rays", sleepy:"a golden crescent moon with little stars and a cloud",
            marching:"a marching-band bass drum with a plumed band hat", reggae:"an acoustic guitar with red, gold and green stripes" },
  world:  { space:"a colorful outer-space scene with a smiling planet and a cute rocket",
            underwater:"a bright underwater ocean scene with coral and friendly fish",
            castle:"a magical fairytale castle with towers and flags", candy:"a whimsical candy land with lollipops and gumdrops",
            forest:"a lush enchanted forest with friendly trees", desert:"a sunny desert scene with sand dunes and a cactus",
            volcano:"a playful but dramatic volcano with glowing lava" },
};

function build(q) {
  const kind = (q.kind || "").toString();
  if (kind === "cover") {
    const vibe = (q.vibe || "happy").toString();
    const theme = (q.theme || "").toString();
    const mood = VIBE[vibe] || vibe;
    const setting = WORLD[theme] || (theme ? theme : "a fun imaginative world");
    return {
      descriptor: `cover|${vibe}|${theme}`,
      prompt: `Square album cover artwork for a children's song. Mood: ${mood}. Setting: ${setting}. ${COVER_STYLE}`,
      transparent: false,
    };
  }
  if (kind === "icon") {
    const cat = (q.cat || "").toString();
    const id = (q.id || "").toString();
    const subject = ICONS[cat] && ICONS[cat][id];
    if (!subject) return null;
    const transparent = !(cat === "world"); // worlds are full scenes; everything else is a cut-out
    return {
      descriptor: `icon|${cat}|${id}`,
      prompt: `${subject}. ${ICON_STYLE}` + (cat === "world" ? "" : ", on a plain background"),
      transparent,
    };
  }
  return null;
}

/* ---------------- cache (image_cache table) ---------------- */
const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
});
async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}&select=b64&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].b64 : null;
  } catch { return null; }
}
async function cachePut(key, descriptor, kind, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await sb("image_cache", { method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ cache_key: key, descriptor, kind, b64 }) });
  } catch {}
}
async function cacheDel(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }); } catch {}
}
async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await sb(`usage_log?select=cost_usd&date=eq.${today}`);
    if (!r.ok) return true;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await sb("usage_log", { method: "POST", body: JSON.stringify({ date: today, cost_usd: cost, kind: "image-lib", model: "gpt-image-1" }) });
  } catch {}
}

/* ---------------- OpenAI generation (same chain as generate-story-art) -------- */
async function generateImage(prompt, openaiKey, opts = {}, timeoutMs = 42000) {
  const once = async (b) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(b), signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        return b64 || null;
      }
      return { status: res.status };
    } catch { clearTimeout(timer); return { status: 0 }; }
  };
  const attempt = async (b) => {
    for (let t = 0; t < 3; t++) {
      const r = await once(b);
      if (typeof r === "string") return r;
      if (!r || r.status !== 429) return null;
      await new Promise((res) => setTimeout(res, 4000 + t * 3000));
    }
    return null;
  };
  const tx = opts.transparent ? { background: "transparent", output_format: "png" } : {};
  return (
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low", ...tx })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", ...tx })) ||
    null
  );
}

/* ---------------- handler ---------------- */
function sendPng(res, b64) {
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(buf);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const q = req.query || {};

  // Manifest: list what's cached (optionally by kind).
  if (q.manifest) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ images: [] });
    try {
      let url = "image_cache?select=cache_key,descriptor,kind,created_at&order=created_at.desc&limit=500";
      if (q.kind) url += `&kind=eq.${encodeURIComponent(q.kind)}`;
      const r = await sb(url);
      const rows = r.ok ? await r.json() : [];
      return res.status(200).json({ images: Array.isArray(rows) ? rows : [] });
    } catch { return res.status(200).json({ images: [] }); }
  }

  const spec = build(q);
  if (!spec) return res.status(400).json({ error: "unknown kind/params" });
  const key = "img:" + crypto.createHash("sha1").update(spec.descriptor + (spec.transparent ? "|t" : "")).digest("hex");

  // Force-regenerate: drop the cached row first.
  if (q.force) await cacheDel(key);
  else {
    const cached = await cacheGet(key);
    if (cached) return sendPng(res, cached);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });      // <img onError> -> fallback
  if (!(await underBudget())) return res.status(503).json({ error: "over_budget" });

  const b64 = await generateImage(spec.prompt, openaiKey, { transparent: spec.transparent });
  if (!b64) return res.status(502).json({ error: "image_provider_failed" });
  await cachePut(key, spec.descriptor, (q.kind || "").toString(), b64);
  await logCost(IMG_COST_USD);
  return sendPng(res, b64);
}
