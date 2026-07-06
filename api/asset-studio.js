// /api/asset-studio.js
// Backend for the Asset Studio (the "Create" tab in /asset-library.html).
//
// The old way: prompt DALL-E by hand, download, rename, upload. This endpoint
// removes all of that. It generates a whole ASSET SHEET in one gpt-image-1 call
// (many bricks / balls / crops on one page), the browser slices the sheet into
// individual named pieces, and "Keep" stores each piece here keyed by a slug so
// a game can load it by URL. Nothing to name, save, or upload.
//
//   POST {action:"generate", prompt, size, transparent}         -> {b64, mime}   (preview, uncached)
//   POST {action:"keep", game, type, theme, pieces:[{slug,b64}]} -> {saved:[{slug,url}]}
//   GET  ?asset=<slug>                                           -> the PNG bytes (for games/<img>)
//   GET  ?manifest=1[&game=breaker]                              -> JSON list of kept assets
//
// Storage reuses images.js's image_cache table (cache_key, descriptor, kind, b64),
// so there is NO new database migration. Kept studio assets use kind="studio" and
// cache_key="studio:<game>/<type>/<theme>/<name>".

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

/* ---------------- Supabase REST (same shape as images.js) ---------------- */
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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false;
  try {
    // upsert: keeping the same slug replaces the old art (merge-duplicates on cache_key)
    await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
    const r = await sb("image_cache", { method: "POST",
      body: JSON.stringify({ cache_key: key, descriptor, kind, b64 }) });
    return r.ok;
  } catch { return false; }
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
    await sb("usage_log", { method: "POST",
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "asset-studio", model: "gpt-image-1" }) });
  } catch {}
}

/* ---------------- OpenAI generation (sheet-aware: size can be wide/tall) -------- */
const SIZES = { square: "1024x1024", wide: "1536x1024", tall: "1024x1536" };
// rough gpt-image-1 cost by quality for logging the daily budget
const COST = { low: 0.02, medium: 0.07, high: 0.19 };

async function generateSheet(prompt, key, { size = "wide", transparent = true, quality = "medium" } = {}, timeoutMs = 120000) {
  const px = SIZES[size] || SIZES.wide;
  const body = {
    model: "gpt-image-1", prompt, n: 1, size: px, quality,
    ...(transparent ? { background: "transparent", output_format: "png" } : {}),
  };
  const once = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) { const d = await res.json(); return d.data?.[0]?.b64_json || null; }
      return { status: res.status };
    } catch { clearTimeout(timer); return { status: 0 }; }
  };
  for (let t = 0; t < 3; t++) {
    const r = await once();
    if (typeof r === "string") return r;
    if (!r || r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 4000 + t * 3000));
  }
  return null;
}

/* ---------------- helpers ---------------- */
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}
const stripDataUrl = (s) => String(s || "").replace(/^data:image\/\w+;base64,/, "");
function sendPng(res, b64) {
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(buf);
}
// slug -> safe, predictable cache key. "breaker/bricks/jungle/ice_intact"
const cleanSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9/_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const q = req.query || {};

  // --- serve a kept asset as image bytes: <img src="/api/asset-studio?asset=breaker/bricks/jungle/ice_intact"> ---
  if (req.method === "GET" && q.asset) {
    const key = "studio:" + cleanSlug(q.asset);
    const b64 = await cacheGet(key);
    if (!b64) return res.status(404).json({ error: "not_found" });
    return sendPng(res, b64);
  }

  // --- manifest: what has been made (optionally for one game) ---
  if (req.method === "GET" && q.manifest) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ assets: [] });
    try {
      let url = "image_cache?select=cache_key,descriptor,created_at&kind=eq.studio&order=created_at.desc&limit=1000";
      const r = await sb(url);
      let rows = r.ok ? await r.json() : [];
      if (q.game) rows = rows.filter((x) => (x.cache_key || "").startsWith("studio:" + cleanSlug(q.game) + "/"));
      const assets = rows.map((x) => {
        const slug = (x.cache_key || "").replace(/^studio:/, "");
        return { slug, url: "/api/asset-studio?asset=" + slug, descriptor: x.descriptor, created_at: x.created_at };
      });
      return res.status(200).json({ assets });
    } catch { return res.status(200).json({ assets: [] }); }
  }

  // --- list saved game recipes (built by the New Game form) ---
  if (req.method === "GET" && q.recipes) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ recipes: {} });
    try {
      const r = await sb("image_cache?select=cache_key,b64&kind=eq.recipe&order=created_at.desc&limit=200");
      const rows = r.ok ? await r.json() : [];
      const recipes = {};
      for (const row of rows) {
        const slug = (row.cache_key || "").replace(/^recipe:/, "");
        try { recipes[slug] = JSON.parse(Buffer.from(row.b64, "base64").toString("utf8")); } catch {}
      }
      return res.status(200).json({ recipes });
    } catch { return res.status(200).json({ recipes: {} }); }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const body = await readBody(req);
  const action = body.action;

  // --- AI auto-suggest a recipe from a one-line game description ---
  if (action === "suggest-recipe") {
    const name = (body.name || "").toString().trim();
    const desc = (body.description || "").toString().trim();
    if (!desc) return res.status(400).json({ error: "no_description" });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });
    const sys = "You design asset recipes for a children's game asset generator. " +
      "Given a game description, return STRICT JSON describing the art pieces needed. " +
      "Shape: {\"label\":string,\"assets\":{ <assetKey>:{ \"label\":string, \"mode\":\"sheet\"|\"single\", " +
      "\"size\":\"wide\"|\"tall\"|\"square\", \"transparent\":boolean, \"role\":\"background\"|\"sprite\", " +
      "\"rows\":[string],\"cols\":[string], \"subject\":string } } }. " +
      "Use mode 'sheet' with rows (variants) and cols (states/frames like intact/hit or idle) for anything with multiple " +
      "variants; use 'single' for one-off items (a single paddle, one full background). Backgrounds: mode 'single', " +
      "transparent false, role 'background', size 'tall' or 'wide'. Sprites/sheets: transparent true, role 'sprite'. " +
      "In 'subject' write a vivid art description and use the token {theme} where the world theme belongs. " +
      "Keep 3-6 assets. assetKeys and row/col names must be short lowercase slugs. Return ONLY the JSON.";
    try {
      const rr = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.5,
          response_format: { type: "json_object" },
          messages: [ { role: "system", content: sys },
            { role: "user", content: `Game name: ${name || "(unnamed)"}\nDescription: ${desc}` } ] }),
      });
      if (!rr.ok) return res.status(502).json({ error: "suggest_failed" });
      const d = await rr.json();
      const txt = d.choices?.[0]?.message?.content || "{}";
      let recipe; try { recipe = JSON.parse(txt); } catch { return res.status(502).json({ error: "bad_json" }); }
      return res.status(200).json({ recipe });
    } catch { return res.status(502).json({ error: "suggest_error" }); }
  }

  // --- save a recipe (from the New Game form) so it persists + shows in the dropdown ---
  if (action === "save-recipe") {
    const slug = cleanSlug(body.slug || body.recipe?.label || "game");
    const recipe = body.recipe;
    if (!recipe || !recipe.assets) return res.status(400).json({ error: "no_recipe" });
    const b64 = Buffer.from(JSON.stringify(recipe), "utf8").toString("base64");
    const ok = await cachePut("recipe:" + slug, recipe.label || slug, "recipe", b64);
    return res.status(ok ? 200 : 502).json({ ok, slug });
  }

  // --- generate a sheet for preview (not stored; the browser slices it) ---
  if (action === "generate") {
    const prompt = (body.prompt || "").toString().trim();
    if (!prompt) return res.status(400).json({ error: "no_prompt" });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });
    if (!(await underBudget())) return res.status(503).json({ error: "over_budget" });
    const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : "medium";
    const b64 = await generateSheet(prompt, openaiKey, {
      size: body.size, transparent: body.transparent !== false, quality,
    });
    if (!b64) return res.status(502).json({ error: "image_provider_failed" });
    await logCost(COST[quality] || 0.07);
    return res.status(200).json({ b64, mime: "image/png" });
  }

  // --- keep the sliced pieces (each already named by the browser from the recipe) ---
  if (action === "keep") {
    const game = cleanSlug(body.game || "misc");
    const type = cleanSlug(body.type || "asset");
    const theme = cleanSlug(body.theme || "default");
    const pieces = Array.isArray(body.pieces) ? body.pieces : [];
    if (!pieces.length) return res.status(400).json({ error: "no_pieces" });
    const saved = [];
    for (const p of pieces) {
      const name = cleanSlug(p.slug || p.name || "piece");
      const slug = `${game}/${type}/${theme}/${name}`;
      const key = "studio:" + slug;
      const ok = await cachePut(key, slug, "studio", stripDataUrl(p.b64));
      if (ok) saved.push({ slug, url: "/api/asset-studio?asset=" + slug });
    }
    return res.status(200).json({ saved, count: saved.length });
  }

  return res.status(400).json({ error: "unknown_action" });
}
