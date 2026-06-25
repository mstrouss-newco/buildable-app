// /api/story-style-sample.js
// Serves ONE real example image per art style for the story-creator's style picker.
// Generated once per style (fixed sample scene) and cached: in narration_cache (key
// "stylesample:<id>") AND via a long-lived CDN cache header, so the picker shows true
// examples with essentially a one-time cost (~$0.04 per style). Returns the image bytes
// directly so the picker can use <img src="/api/story-style-sample?style=watercolor">.
// Falls back to a labeled SVG swatch when no key / off budget, so the picker is never empty.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

const STYLES = {
  watercolor: "soft children's picture-book WATERCOLOR illustration, gentle washes, warm colors, hand-painted storybook",
  modern3d:   "modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded characters, glossy",
  papercut:   "layered CUT-PAPER COLLAGE illustration (Eric Carle style), textured construction-paper shapes, bold bright colors",
  crayon:     "bright CRAYON and colored-pencil children's drawing, playful hand-drawn doodle look, paper texture",
  comic:      "bold flat CARTOON COMIC style, clean black outlines, vibrant flat colors, cel-shaded",
  claymation: "cute CLAYMATION plasticine stop-motion look, soft studio lighting, rounded clay characters",
};
const LABELS = { watercolor: "Watercolor", modern3d: "Modern 3D", papercut: "Paper cut-out", crayon: "Crayon", comic: "Comic", claymation: "Clay" };
const SCENE = "A cute grey bunny and a friendly brown owl together by a cozy snowy log cabin under a big glowing moon";

async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
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
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ cache_key: key, audio_b64: b64, word_timings: null }),
    });
  } catch { /* best-effort */ }
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

function sendPng(res, b64) {
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.status(200).end(buf);
}
function sendSwatch(res, id) {
  const colors = { watercolor: "#7fb3d5", modern3d: "#9b7edd", papercut: "#e8a13a", crayon: "#5ec27a", comic: "#d4537e", claymation: "#caa05a" };
  const c = colors[id] || "#9b7edd";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="16" fill="${c}"/><text x="80" y="86" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">${LABELS[id] || "Style"}</text></svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=600");
  return res.status(200).end(svg);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = (req.query.style || "watercolor").toString();
  if (!STYLES[id]) return sendSwatch(res, "watercolor");

  const key = "stylesample:" + id;
  const hit = await cacheGet(key);
  if (hit) return sendPng(res, hit);

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || !(await underBudget())) return sendSwatch(res, id);

  try {
    const prompt = `${SCENE}. ${STYLES[id]}, no text, no words, age 4-8, wholesome`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 40000);
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", signal: ctrl.signal,
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low" }),
    });
    clearTimeout(to);
    if (!r.ok) return sendSwatch(res, id);
    const data = await r.json();
    const b64 = data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return sendSwatch(res, id);
    await cachePut(key, b64);
    return sendPng(res, b64);
  } catch { return sendSwatch(res, id); }
}
