// /api/generate-story-art.js
// Generates ONE storybook illustration for a single story page, on demand.
// The Story Reader calls this lazily (current page first, prefetch the next) so
// a child never waits on a 6-image batch. If OpenAI is unavailable, off-budget,
// or errors, we return { placeholder:true } and the reader shows a calm gradient
// "scene" instead — the page is never blank and the flow never blocks.
//
// Mirrors the image fallback chain + usage_log cost pattern in generate-creature.js.

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ART_COST_USD = parseFloat(process.env.STORY_ART_COST_USD || "0.04");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

// A few distinct storybook "looks" the kid can choose from.
const STYLES = {
  watercolor: "soft children's picture-book WATERCOLOR illustration, gentle washes, warm colors, rounded friendly shapes, hand-painted storybook",
  modern3d:   "modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded characters, vibrant, glossy",
  papercut:   "layered CUT-PAPER COLLAGE illustration (Eric Carle style), textured construction-paper shapes, bold bright colors, visible paper edges",
  crayon:     "bright CRAYON and colored-pencil children's drawing, playful hand-drawn doodle look, paper texture",
  comic:      "bold flat CARTOON COMIC style, clean black outlines, vibrant flat colors, cel-shaded",
  claymation: "cute CLAYMATION plasticine stop-motion look, soft studio lighting, rounded clay characters, tactile",
};
const STYLE_SUFFIX = "no text, no words, age 4-8, wholesome, child-friendly";
function styleFor(id) { return (STYLES[id] || STYLES.watercolor) + ", " + STYLE_SUFFIX; }

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
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
    const total = (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0);
    return total < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost, model) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "story-art", model: model || "image" }),
    });
  } catch { /* best-effort */ }
}

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
        const url = data.data?.[0]?.url;
        return { url: b64 ? `data:image/png;base64,${b64}` : (url || null), status: 200 };
      }
      return { url: null, status: res.status };
    } catch { clearTimeout(timer); return { url: null, status: 0 }; }
  };
  // Retry up to twice on 429 (rate limit) with backoff — the throttled client still
  // bursts a little, and gpt-image-1 per-minute limits are low on smaller tiers.
  const attempt = async (b) => {
    for (let tries = 0; tries < 3; tries++) {
      const r = await once(b);
      if (r.url) return r.url;
      if (r.status !== 429) return null;
      await new Promise((res) => setTimeout(res, 4000 + tries * 3000));
    }
    return null;
  };
  const tx = opts.transparent ? { background: "transparent", output_format: "png" } : {};
  return (
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low", ...tx })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", ...tx })) ||
    (opts.transparent ? null : await attempt({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" })) ||
    null
  );
}

async function imgCacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }); if (!r.ok) return null; const rows = await r.json(); return Array.isArray(rows) && rows[0] ? rows[0].audio_b64 : null; } catch { return null; }
}
async function imgCachePut(key, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`, { method: "POST", headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ cache_key: key, audio_b64: b64, word_timings: null }) }); } catch {}
}

export default async function handler(req, res) {
  // Safe diagnostic (booleans only, never secret values): GET /api/generate-story-art
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = await readBody(req);
  const artPrompt = (body.artPrompt || "").toString().slice(0, 1200).trim();
  if (!artPrompt) return res.status(400).json({ error: "artPrompt is required" });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(200).json({ ok: true, placeholder: true, reason: "no_openai_key" });
  if (!(await underBudget())) return res.status(200).json({ ok: true, placeholder: true, reason: "over_daily_budget" });
  try {
    const prompt = `${artPrompt}. ${styleFor(body.style)}`;
    const cacheKey = "img:" + crypto.createHash("sha1").update(prompt + (body.transparent ? "|t" : "")).digest("hex");
    const cached = await imgCacheGet(cacheKey);
    if (cached) return res.status(200).json({ ok: true, url: "data:image/png;base64," + cached, cached: true });
    const url = await generateImage(prompt, openaiKey, { transparent: !!body.transparent });
    if (url && typeof url === "string" && url.startsWith("data:")) { try { await imgCachePut(cacheKey, url.split(",")[1]); } catch {} }
    if (!url) return res.status(200).json({ ok: true, placeholder: true, reason: "image_provider_failed" });
    await logCost(ART_COST_USD, "image");
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    return res.status(200).json({ ok: true, placeholder: true, reason: "error", detail: String((e && e.message) || e).slice(0, 120) });
  }
}
