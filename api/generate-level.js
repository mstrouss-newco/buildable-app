// /api/generate-level.js
// LIBRARY-DRIVEN VERSION.
// Builds a level by pulling background LAYERS from the LEVEL library
// (community_layers) instead of calling DALL-E on every build.
// Layers can be mixed and matched (even across themes).
// DALL-E is used ONLY as a last-resort gap-filler when no library layer
// exists for a requested layer type, and every such gap is flagged in the
// response under "gaps" so the team can fill the library.
import crypto from "crypto";

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const LAYER_COST = 0.04;

const LEVEL_ADJECTIVES = ['Enchanted','Magical','Secret','Hidden','Mysterious','Ancient','Floating','Crystal','Golden','Silver','Emerald','Ruby','Moonlit','Sunny','Starry'];
const LEVEL_NOUNS = ['Forest','Castle','Mountain','Valley','Kingdom','Island','Garden','Temple','Palace','Cavern','Tower','Realm'];
const LEVEL_ACTIONS = ['Escape','Adventure','Quest','Challenge','Run','Explore','Discover','Journey'];

const LAYER_TYPES = ['sky','midground','platforms','foreground'];
const PARALLAX = { sky: 0.15, midground: 0.6, platforms: 0.75, foreground: 1.0 };
const CATEGORIES = { sky: 'sky', midground: 'plants', platforms: 'ground', foreground: 'plants' };

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
  return Math.abs(hash);
}

function generateLevelName(description = '', theme = '', index = 0) {
  const hash = hashString(description + theme + index.toString());
  const adj = LEVEL_ADJECTIVES[hash % LEVEL_ADJECTIVES.length];
  const noun = LEVEL_NOUNS[(hash >> 8) % LEVEL_NOUNS.length];
  const action = LEVEL_ACTIONS[(hash >> 16) % LEVEL_ACTIONS.length];
  return adj + ' ' + noun + ' ' + action;
}

const sbHeaders = (key) => ({ "apikey": key, "Authorization": "Bearer " + key });

// Pull all reusable+approved layers of a given type that match the theme.
// Case-insensitive theme match (library uses capitalized tags like "Forest";
// older rows may be lowercase). Returns [] if none.
async function findLayers(supabaseUrl, supabaseKey, layerType, theme) {
  if (!supabaseUrl || !supabaseKey || !theme) return [];
  try {
    const q = supabaseUrl + "/rest/v1/community_layers?select=id,asset_id,image_url,parallax_speed,theme_tags,layer_type"
      + "&layer_type=eq." + encodeURIComponent(layerType)
      + "&reusable=eq.true&moderation_status=eq.approved&limit=200";
    const r = await fetch(q, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows)) return [];
    const want = String(theme).toLowerCase();
    return rows.filter((x) => x && x.image_url
      && Array.isArray(x.theme_tags)
      && x.theme_tags.some((t) => String(t).toLowerCase() === want));
  } catch (e) { return []; }
}

// Optional DALL-E gap-filler (kept ONLY for missing library coverage).
async function generateImage(prompt, openaiKey, timeoutMs = 55000) {
  const attempt = async (body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Authorization": "Bearer " + openaiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        const url = data.data?.[0]?.url;
        return { url: b64 ? ("data:image/png;base64," + b64) : (url || null), error: null };
      }
      return { url: null, error: res.status + ": " + (await res.text()).slice(0, 200) };
    } catch (e) { clearTimeout(timer); return { url: null, error: e.message }; }
  };
  const r1 = await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" });
  if (r1.url) return r1;
  const r2 = await attempt({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" });
  if (r2.url) return r2;
  const r3 = await attempt({ model: "dall-e-2", prompt: prompt.slice(0, 1000), n: 1, size: "1024x1024" });
  if (r3.url) return r3;
  return { url: null, error: "all image models failed" };
}

async function checkBudget(supabaseUrl, supabaseKey, costNeeded) {
  if (!supabaseUrl || !supabaseKey) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(supabaseUrl + "/rest/v1/usage_log?select=cost_usd&date=eq." + today, { headers: sbHeaders(supabaseKey) });
    if (!r.ok) return true;
    const rows = await r.json();
    const total = rows.reduce((s, row) => s + (row.cost_usd || 0), 0);
    return total + costNeeded < DAILY_BUDGET_USD;
  } catch (e) { return true; }
}

async function logSpend(supabaseUrl, supabaseKey, cost) {
  if (!supabaseUrl || !supabaseKey || !cost) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(supabaseUrl + "/rest/v1/usage_log", {
      method: "POST",
      headers: { ...sbHeaders(supabaseKey), "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "image" }),
    });
  } catch (e) {}
}

async function saveLevelToDb(supabaseUrl, supabaseKey, level) {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(supabaseUrl + "/rest/v1/community_levels", {
      method: "POST",
      headers: { ...sbHeaders(supabaseKey), "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify(level),
    });
    if (r.ok) { const data = await r.json(); return data[0]?.id || null; }
  } catch (e) {}
  return null;
}

function gapPrompt(layerType, theme) {
  return "A " + layerType + " background layer for a " + (theme || "forest")
    + " platformer game. Bright colors, storybook illustration style, no text, suitable for ages 5-12.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { entity, deviceId } = req.body || {};
  if (!entity || (!entity.theme && !entity.description)) {
    return res.status(400).json({ error: "entity.theme or entity.description required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const theme = entity.theme || "forest";

  // Optional mixing: caller may pass entity.layerThemes = { sky:'Space', platforms:'Forest', ... }
  const layerThemes = (entity.layerThemes && typeof entity.layerThemes === 'object') ? entity.layerThemes : {};

  try {
    const levelName = generateLevelName(entity.description, theme, Math.floor(Math.random() * 10000));
    const gaps = [];

    const layerJobs = LAYER_TYPES.map((layerType) => (async () => {
      const wantTheme = layerThemes[layerType] || theme;
      const pool = await findLayers(supabaseUrl, supabaseKey, layerType, wantTheme);
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return {
          id: pick.id, assetId: pick.asset_id, layerType,
          imageUrl: pick.image_url, parallaxSpeed: pick.parallax_speed ?? PARALLAX[layerType],
          theme: wantTheme, source: "library",
        };
      }
      // No library asset for this layer/theme -> flag the gap.
      gaps.push({ layerType, theme: wantTheme });
      // Only spend on DALL-E if a key + budget allow it; otherwise return null.
      if (openaiKey) {
        const inBudget = await checkBudget(supabaseUrl, supabaseKey, LAYER_COST);
        if (inBudget) {
          const { url } = await generateImage(gapPrompt(layerType, wantTheme), openaiKey);
          if (url) {
            await logSpend(supabaseUrl, supabaseKey, LAYER_COST);
            return { id: null, assetId: layerType + "_gap", layerType, imageUrl: url, parallaxSpeed: PARALLAX[layerType], theme: wantTheme, source: "dalle_gap_fill" };
          }
        }
      }
      return null;
    })());

    const settled = await Promise.allSettled(layerJobs);
    const validLayers = settled.map((r) => (r.status === "fulfilled" ? r.value : null)).filter(Boolean);

    const fromLibrary = validLayers.filter((l) => l.source === "library").length;
    const gapFilled = validLayers.filter((l) => l.source === "dalle_gap_fill").length;
    const previewUrl = (validLayers.find((l) => l.layerType === "platforms") || validLayers[0])?.imageUrl || null;

    const levelData = {
      name: levelName,
      description: entity.description || '',
      theme_tags: [theme].filter(Boolean),
      layer_ids: validLayers.map((l) => l.id).filter(Boolean),
      preview_image_url: previewUrl,
      difficulty: entity.difficulty || 'easy',
      created_by_device_id: deviceId || 'anonymous',
      moderation_status: 'approved',
    };
    const levelId = await saveLevelToDb(supabaseUrl, supabaseKey, levelData);

    return res.status(200).json({
      levelId, levelName, previewUrl,
      layers: validLayers,
      source: "library",
      fromLibrary, gapFilled,
      gaps,                       // <- flagged missing-library coverage
      costUsd: gapFilled * LAYER_COST,
    });
  } catch (e) {
    console.error("generate-level error:", e);
    return res.status(200).json({ previewUrl: null, error: e.message });
  }
}
