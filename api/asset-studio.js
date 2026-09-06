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

/* ---------------- FLUX via fal.ai (reuses the FAL_KEY already set up) -------- */
// Same submit->poll pattern as animate-page.js. FLUX renders on white (no native
// transparency), which the browser keys out just like the gpt-image path.
async function generateFlux(prompt, { size = "tall" } = {}, timeoutMs = 180000) {
  const key = process.env.FAL_KEY;
  if (!key) return { err: "no_fal_key" };
  const MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux-pro/v1.1";
  const imgSize = size === "wide" ? "landscape_4_3" : size === "square" ? "square_hd" : "portrait_4_3";
  const auth = { Authorization: "Key " + key };
  const sub = await fetch("https://queue.fal.run/" + MODEL, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: imgSize, num_images: 1, output_format: "png", safety_tolerance: "5" }),
  });
  const sj = await sub.json().catch(() => ({}));
  if (!sub.ok || !sj.status_url) return { err: "fal_submit_failed", detail: JSON.stringify(sj).slice(0, 200) };
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const sr = await fetch(sj.status_url, { headers: auth });
    const st = await sr.json().catch(() => ({}));
    if (st.status === "COMPLETED") {
      const rr = await fetch(sj.response_url, { headers: auth });
      const result = await rr.json().catch(() => ({}));
      const url = result.images && result.images[0] && result.images[0].url;
      if (!url) return { err: "fal_no_image" };
      if (url.startsWith("data:")) return { b64: url.split(",")[1] };
      const ir = await fetch(url);
      const ab = await ir.arrayBuffer();
      return { b64: Buffer.from(ab).toString("base64") };
    }
    if (st.status && st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") return { err: "fal_bad_status", detail: st.status };
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { err: "fal_timeout" };
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
// AP3b: kept art is REPLACED in place under the same slug (see cachePut), so the
// URL alone can never tell a browser the picture changed. Serving it as
// "immutable for a year" meant a regenerated asset stayed invisible forever —
// the editor showed the new art while the live game kept painting the old one.
// Now: a request carrying a version stamp (?v=, minted from the row's created_at)
// is safe to cache hard, because replacing the art mints a new stamp and so a new
// URL. A request WITHOUT a stamp gets a short cache plus an ETag, so any older
// caller self-heals within a minute and pays only a 304, not a re-download.
function sendPng(req, res, b64) {
  const buf = Buffer.from(b64, "base64");
  const etag = '"' + crypto.createHash("sha1").update(b64).digest("hex").slice(0, 20) + '"';
  const versioned = !!(req && req.query && req.query.v);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", versioned
    ? "public, max-age=31536000, immutable"
    : "public, max-age=60, must-revalidate");
  const inm = req && req.headers && req.headers["if-none-match"];
  if (inm && inm.split(",").some((t) => t.trim() === etag)) return res.status(304).end();
  res.status(200).send(buf);
}
// AP3b: the public URL for a kept piece, stamped with WHEN that art was stored.
// Replacing art refreshes created_at (cachePut deletes then re-inserts), so the
// stamp changes, so every browser and the CDN fetch the new picture immediately.
function assetUrl(slug, createdAt) {
  const v = createdAt ? Date.parse(createdAt) : Date.now();
  return "/api/asset-studio?asset=" + slug + (v ? "&v=" + v : "");
}
// slug -> safe, predictable cache key. "breaker/bricks/jungle/ice_intact"
const cleanSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9/_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

// AP1: map a slot/type name to one of the shared-library "kinds" so every studio
// piece can be tagged (character | world | element). Backgrounds -> world, actors
// -> character, everything else -> element. Same intent as the library's KINDS.
function studioKindFromType(type) {
  const t = String(type || "").toLowerCase();
  if (/bg|background|world|sky|scene|backdrop|court|board|land|field|loading|hero|win/.test(t)) return "world";
  if (/char|hero|player|creature|pet|guy|enemy|boss|piece|avatar|monster|villain|pal|foe|face/.test(t)) return "character";
  return "element";
}
// AP1: a studio row's descriptor now carries the tags as JSON. Old rows stored the
// bare slug string; this reads both so nothing breaks.
function studioMeta(slug, descriptor) {
  let meta = {};
  try { const d = JSON.parse(descriptor); if (d && typeof d === "object") meta = d; } catch {}
  const parts = String(slug || "").split("/");
  const game = meta.game || parts[0] || "";
  const type = meta.type || parts[1] || "";
  const theme = meta.theme || parts[2] || "";
  const kind = meta.kind || studioKindFromType(type);
  return { game, type, theme, kind };
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const q = req.query || {};

  // --- serve a kept asset as image bytes: <img src="/api/asset-studio?asset=breaker/bricks/jungle/ice_intact"> ---
  if (req.method === "GET" && q.asset) {
    const key = "studio:" + cleanSlug(q.asset);
    const b64 = await cacheGet(key);
    if (!b64) return res.status(404).json({ error: "not_found" });
    return sendPng(req, res, b64);
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
        const m = studioMeta(slug, x.descriptor);
        return { slug, url: assetUrl(slug, x.created_at), source: "Studio",
          game: m.game, type: m.type, theme: m.theme, kind: m.kind,
          descriptor: x.descriptor, created_at: x.created_at };
      });
      return res.status(200).json({ assets });
    } catch { return res.status(200).json({ assets: [] }); }
  }

  // --- get the active world for a game: GET ?world=breaker -> {world} ---
  if (req.method === "GET" && q.world) {
    const v = await cacheGet("setting:world:" + cleanSlug(q.world));
    return res.status(200).json({ world: v ? Buffer.from(v, "base64").toString("utf8") : null });
  }

  // --- get a game's levels config: GET ?levels=breaker -> {levels:[...]} ---
  if (req.method === "GET" && q.levels) {
    const v = await cacheGet("setting:levels:" + cleanSlug(q.levels));
    let levels = [];
    if (v) { try { levels = JSON.parse(Buffer.from(v, "base64").toString("utf8")); } catch {} }
    return res.status(200).json({ levels: Array.isArray(levels) ? levels : [] });
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

  // --- set (or clear) the active world for a game (reskin the whole game) ---
  if (action === "set-world") {
    const game = cleanSlug(body.game || "");
    if (!game) return res.status(400).json({ error: "no_game" });
    const key = "setting:world:" + game;
    const world = body.world ? cleanSlug(body.world) : "";
    if (!world) { await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }); return res.status(200).json({ ok: true, world: null }); }
    const ok = await cachePut(key, "world:" + game, "setting", Buffer.from(world, "utf8").toString("base64"));
    return res.status(ok ? 200 : 502).json({ ok, world });
  }

  // --- save a game's levels config (name, world, template, difficulty per level) ---
  if (action === "set-levels") {
    const game = cleanSlug(body.game || "");
    if (!game) return res.status(400).json({ error: "no_game" });
    const levels = Array.isArray(body.levels) ? body.levels : [];
    const ok = await cachePut("setting:levels:" + game, "levels:" + game, "levels",
      Buffer.from(JSON.stringify(levels), "utf8").toString("base64"));
    return res.status(ok ? 200 : 502).json({ ok, count: levels.length });
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
    if (!(await underBudget())) return res.status(503).json({ error: "over_budget" });
    const engine = body.engine === "flux" ? "flux" : "openai";

    if (engine === "flux") {
      const out = await generateFlux(prompt, { size: body.size });
      if (out.err) return res.status(502).json({ error: out.err, detail: out.detail });
      await logCost(0.05);
      return res.status(200).json({ b64: out.b64, mime: "image/png", engine: "flux" });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });
    const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : "medium";
    const b64 = await generateSheet(prompt, openaiKey, {
      size: body.size, transparent: body.transparent !== false, quality,
    });
    if (!b64) return res.status(502).json({ error: "image_provider_failed" });
    await logCost(COST[quality] || 0.07);
    return res.status(200).json({ b64, mime: "image/png", engine: "openai" });
  }

  // --- CB3: THE KIDS LANE. One picture, painted and filed in one call. --------
  // The Create tab is a grown-up tool: it generates a SHEET, the browser slices
  // it, and a person names each piece. A child in the studio cannot do any of
  // that, so this lane does the whole job server-side:
  //
  //   1. LOOK IN THE LIBRARY FIRST. If we already have a picture of this kind and
  //      theme, it is reused and nothing is generated. That is the shared-asset
  //      rule (ASSET-LIBRARY.md) and it is also what stops a family paying for a
  //      picture the last family already made.
  //   2. Paint one piece, with the prompt wrapped in a kid-safe frame that the
  //      child's words cannot escape.
  //   3. File it back into the SAME shared library with a made-in-cobuild tag, so
  //      the next family reuses it.
  //
  // Always answers 200 with { ok:false, reason } rather than an error when there
  // is no key or no budget: a studio must still build a game with drawn art when
  // the picture machine is off. That is the read-on-render-with-a-fallback rule.
  if (action === "kid-art" || body.target === "kids") {
    const kind = ["character", "world", "element"].includes(body.kind) ? body.kind : "element";
    const theme = cleanSlug(body.theme || "jungle");
    const subject = (body.subject || "").toString().trim().slice(0, 200);
    const slot = cleanSlug(body.slot || kind);
    if (!subject) return res.status(400).json({ ok: false, error: "no_subject" });

    // 1. the library first
    if (body.reuse !== false && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const r = await sb("image_cache?select=cache_key,descriptor,created_at&kind=eq.studio&order=created_at.desc&limit=400");
        const rows = r.ok ? await r.json() : [];
        for (const row of rows) {
          const slug = (row.cache_key || "").replace(/^studio:/, "");
          const m = studioMeta(slug, row.descriptor);
          if (m.kind === kind && m.theme === theme && /^cobuild\//.test(slug)) {
            return res.status(200).json({ ok: true, reused: true, slug, url: assetUrl(slug, row.created_at), kind, theme });
          }
        }
      } catch {}
    }

    // 2. paint one. The child's words go in the middle of OUR sentence, never at
    // the start of it, and the frame carries the house style and the age rating.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(200).json({ ok: false, reason: "no_picture_machine" });
    if (!(await underBudget())) return res.status(200).json({ ok: false, reason: "over_budget" });
    const frame = kind === "world"
      ? "A gentle, colourful backdrop for a game for young children. It shows: "
      : "A single friendly character for a game for young children, full body, centred, on a plain background. It is: ";
    const tail = " Bright storybook style, soft shapes, no text, no words, no letters, no logos, nothing frightening, nothing violent.";
    const b64 = await generateSheet(frame + subject + "." + tail, openaiKey, {
      size: kind === "world" ? "wide" : "square", transparent: kind !== "world", quality: "low",
    });
    if (!b64) return res.status(200).json({ ok: false, reason: "picture_failed" });
    await logCost(COST.low);

    // 3. file it back, tagged, so the next family gets it for free
    const name = cleanSlug(subject.split(/\s+/).slice(0, 4).join("_")) || slot;
    const slug = `cobuild/${slot}/${theme}/${name}`;
    const descriptor = JSON.stringify({ slug, kind, theme, game: "cobuild", type: slot, madeIn: "cobuild", reusable: true });
    const ok = await cachePut("studio:" + slug, descriptor, "studio", b64);
    if (!ok) return res.status(200).json({ ok: true, reused: false, slug: null, url: null, b64, kind, theme, filed: false });
    return res.status(200).json({ ok: true, reused: false, slug, url: assetUrl(slug), kind, theme, filed: true });
  }

  // --- keep the sliced pieces (each already named by the browser from the recipe) ---
  if (action === "keep") {
    const game = cleanSlug(body.game || "misc");
    const type = cleanSlug(body.type || "asset");
    const theme = cleanSlug(body.theme || "default");
    const pieces = Array.isArray(body.pieces) ? body.pieces : [];
    if (!pieces.length) return res.status(400).json({ error: "no_pieces" });
    const kind = cleanSlug(body.kind || "") || studioKindFromType(type);
    const saved = [];
    for (const p of pieces) {
      const name = cleanSlug(p.slug || p.name || "piece");
      const slug = `${game}/${type}/${theme}/${name}`;
      const key = "studio:" + slug;
      // AP1: descriptor now carries the tags (kind + theme + game + type) as JSON.
      const descriptor = JSON.stringify({ slug, kind, theme, game, type });
      const ok = await cachePut(key, descriptor, "studio", stripDataUrl(p.b64));
      if (ok) saved.push({ slug, url: assetUrl(slug) });
    }
    return res.status(200).json({ saved, count: saved.length });
  }

  // --- AP1: import an existing library asset (URL or b64) into a game's slot ---
  // Copies any Browse/pack asset into the studio store under game/type/theme/name
  // so the engine loads it exactly like art generated in the editor. This is what
  // makes "assign any library asset to a fitting slot and go live" work.
  if (action === "import") {
    const game = cleanSlug(body.game || "misc");
    const type = cleanSlug(body.type || "asset");
    const theme = cleanSlug(body.theme || "library");
    const name = cleanSlug(body.name || "piece");
    const kind = cleanSlug(body.kind || "") || studioKindFromType(type);
    let b64 = null;
    if (body.b64) {
      b64 = stripDataUrl(body.b64);
    } else if (body.url) {
      let u = String(body.url);
      if (u.startsWith("data:")) {
        b64 = stripDataUrl(u);
      } else {
        if (u.startsWith("/")) {
          const host = req.headers["x-forwarded-host"] || req.headers.host;
          const proto = req.headers["x-forwarded-proto"] || "https";
          u = proto + "://" + host + u;
        }
        try {
          const r = await fetch(u);
          if (!r.ok) return res.status(502).json({ error: "fetch_failed", status: r.status });
          const ab = await r.arrayBuffer();
          b64 = Buffer.from(ab).toString("base64");
        } catch { return res.status(502).json({ error: "fetch_error" }); }
      }
    }
    if (!b64) return res.status(400).json({ error: "no_source" });
    const slug = `${game}/${type}/${theme}/${name}`;
    const descriptor = JSON.stringify({ slug, kind, theme, game, type, imported: true });
    const ok = await cachePut("studio:" + slug, descriptor, "studio", b64);
    return res.status(ok ? 200 : 502).json({ ok, slug, url: assetUrl(slug) });
  }

  return res.status(400).json({ error: "unknown_action" });
}
