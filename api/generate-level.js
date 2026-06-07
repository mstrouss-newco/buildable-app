// /api/generate-level.js
// NEW: Generates 5 reusable layers instead of 1 flat image
import crypto from "crypto";

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const LAYER_COST = 0.04; // per layer
const PREVIEW_COST = 0.04;

// Level name generation
const LEVEL_ADJECTIVES = ['Enchanted', 'Magical', 'Secret', 'Hidden', 'Mysterious', 'Ancient', 'Floating', 'Crystal', 'Golden', 'Silver', 'Emerald', 'Ruby', 'Moonlit', 'Sunny', 'Starry'];
const LEVEL_NOUNS = ['Forest', 'Castle', 'Mountain', 'Valley', 'Kingdom', 'Island', 'Garden', 'Temple', 'Palace', 'Cavern', 'Tower', 'Realm'];
const LEVEL_ACTIONS = ['Escape', 'Adventure', 'Quest', 'Challenge', 'Run', 'Explore', 'Discover', 'Journey'];

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function generateLevelName(description = '', theme = '', index = 0) {
    const hash = hashString(description + theme + index.toString());
    const adj = LEVEL_ADJECTIVES[hash % LEVEL_ADJECTIVES.length];
    const noun = LEVEL_NOUNS[(hash >> 8) % LEVEL_NOUNS.length];
    const action = LEVEL_ACTIONS[(hash >> 16) % LEVEL_ACTIONS.length];
    return `${adj} ${noun} ${action}`;
}

function levelHash(entity) {
  const stable = JSON.stringify({
    description: entity.description || "",
    theme: entity.theme || "",
    difficulty: entity.difficulty || "",
    style: entity.style || ""
  });
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildLayerPrompt(layerType, entity) {
  const theme = entity.theme || "forest";
  const difficulty = entity.difficulty || "easy";
  const desc = entity.description && entity.description.trim().length > 3 ? entity.description.trim().slice(0, 100) : '';
  
  const diffDescriptor = difficulty === "easy" ? "simple, gentle" : difficulty === "medium" ? "moderate, interesting" : "challenging, complex";

  const prompts = {
    sky: `A colorful sky for a ${theme} platformer game. ${diffDescriptor}. Bright colors, storybook illustration style, simple shapes. ${desc ? `Theme: ${desc}. ` : ''}1024x256 pixels, no text, no scary features, suitable for ages 5-12.`,
    
    midground: `Midground scenery for a ${theme} platformer game. Trees, hills, buildings, or landscape features. ${diffDescriptor}. Bright colors, storybook style. ${desc ? `Theme: ${desc}. ` : ''}1024x512 pixels, simple shapes, suitable for ages 5-12.`,
    
    platforms: `Walkable platforms and terrain for a ${theme} platformer game. ${diffDescriptor} level design with jumps. ${desc ? `Theme: ${desc}. ` : ''}Bright colors, storybook style. 1024x256 pixels, no text, suitable for ages 5-12.`,
    
    foreground: `Foreground decorative elements for a ${theme} platformer game. Flowers, plants, or theme-appropriate decor. ${diffDescriptor}. ${desc ? `Theme: ${desc}. ` : ''}Bright colors, storybook style. 1024x256 pixels, simple shapes, suitable for ages 5-12.`,
    
    preview: `A complete beautiful ${theme} platformer level background. ${diffDescriptor}. ${desc ? `${desc}. ` : ''}Bright colors, storybook illustration style, suitable for children ages 5-12. Centered composition, no text, no scary features. Full scene from sky to ground with platforms, scenery, and decorations. 1024x1024 pixels.`
  };

  return prompts[layerType] || prompts.midground;
}

async function checkBudget(supabaseUrl, supabaseKey, costNeeded) {
  if (!supabaseUrl || !supabaseKey) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${supabaseUrl}/rest/v1/usage_log?select=cost_usd&date=eq.${today}`, {headers: {"apikey": supabaseKey,"Authorization": `Bearer ${supabaseKey}`}});
    if (!r.ok) return true;
    const rows = await r.json();
    const total = rows.reduce((s, row) => s + (row.cost_usd || 0), 0);
    return total + costNeeded < DAILY_BUDGET_USD;
  } catch (e) { return true; }
}

async function logSpend(supabaseUrl, supabaseKey, cost) {
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${supabaseUrl}/rest/v1/usage_log`, {method: "POST", headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json"}, body: JSON.stringify({date: today, cost_usd: cost, kind: "image"})});
  } catch (e) {}
}

async function generateImage(prompt, openaiKey, timeoutMs = 35000) {
  const withTimeout = (p) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return { signal: ctrl.signal, done: () => clearTimeout(timer) };
  };
  try {
    // Try gpt-image-1 first (with a hard timeout)
    const t1 = withTimeout();
    let oaiRes1;
    try {
      oaiRes1 = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {"Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({model: "gpt-image-1", prompt, n: 1, size: "1024x1024"}),
        signal: t1.signal
      });
    } finally { t1.done(); }
    if (oaiRes1 && oaiRes1.ok) {
      const oai1 = await oaiRes1.json();
      const b64 = oai1.data?.[0]?.b64_json;
      if (b64) return `data:image/png;base64,${b64}`;
    }

    // Fall back to dall-e-3 (also time-boxed)
    const t2 = withTimeout();
    let oaiRes2;
    try {
      oaiRes2 = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {"Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json"},
        body: JSON.stringify({model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "url"}),
        signal: t2.signal
      });
    } finally { t2.done(); }
    if (oaiRes2 && oaiRes2.ok) {
      const oai2 = await oaiRes2.json();
      return oai2.data?.[0]?.url || null;
    }
    return null;
  } catch (e) {
    console.error('Image generation error:', e);
    return null;
  }
}

async function saveLayerToDb(supabaseUrl, supabaseKey, layer) {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/community_layers`, {
      method: "POST",
      headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation"},
      body: JSON.stringify(layer)
    });
    if (r.ok) {
      const data = await r.json();
      return data[0]?.id || null;
    }
  } catch (e) {
    console.error('Failed to save layer:', e);
  }
  return null;
}

async function saveLevelToDb(supabaseUrl, supabaseKey, level) {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/community_levels`, {
      method: "POST",
      headers: {"apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation"},
      body: JSON.stringify(level)
    });
    if (r.ok) {
      const data = await r.json();
      return data[0]?.id || null;
    }
  } catch (e) {
    console.error('Failed to save level:', e);
  }
  return null;
}

// How often to still generate a brand-new layer even when reusable ones exist,
// so the shared library keeps growing in variety instead of freezing.
const REFRESH_CHANCE = 0.25;

// Look up already-rendered, approved, reusable layers for this theme + layer type.
// This is what lets us SKIP DALL-E when the community has already made the art.
async function findReusableLayers(supabaseUrl, supabaseKey, layerType, theme) {
  if (!supabaseUrl || !supabaseKey || !theme) return [];
  try {
    const q = `${supabaseUrl}/rest/v1/community_layers?select=id,asset_id,image_url,parallax_speed`
      + `&layer_type=eq.${encodeURIComponent(layerType)}`
      + `&reusable=eq.true&moderation_status=eq.approved`
      + `&theme_tags=cs.{${encodeURIComponent(theme)}}`
      + `&limit=30`;
    const r = await fetch(q, { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.filter((x) => x && x.image_url) : [];
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  // Temporary diagnostic: GET /api/generate-level?debug=1&theme=Forest
  if (req.method === "GET" && req.query && req.query.debug) {
    const sUrl = process.env.SUPABASE_URL;
    const sKey = process.env.SUPABASE_SERVICE_KEY;
    const theme = req.query.theme || "Forest";
    const out = { build: "reuse-v2", hasOpenAI: !!process.env.OPENAI_API_KEY, hasSupabase: !!(sUrl && sKey) };
    if (sUrl && sKey) {
      const H = { apikey: sKey, Authorization: `Bearer ${sKey}`, "Content-Type": "application/json" };
      // 1) Read status of each table
      for (const t of ["community_layers", "creature_cache", "community_levels"]) {
        try {
          const r = await fetch(`${sUrl}/rest/v1/${t}?select=*&limit=3`, { headers: H });
          const body = await r.text();
          out[t] = { status: r.status, rows: (body.startsWith("[") ? JSON.parse(body).length : null), err: r.ok ? null : body.slice(0, 160) };
        } catch (e) { out[t] = { err: String(e).slice(0, 160) }; }
      }
      // 2) Try a test insert into community_layers to surface schema errors
      try {
        const testRow = { asset_id: "diag_test_" + Date.now(), layer_type: "sky", category: "sky", image_url: "data:test", parallax_speed: 0.15, theme_tags: ["DiagTest"], prompt_used: "diagnostic", has_transparency: true, reusable: true, created_by_device_id: "diagnostic", moderation_status: "approved" };
        const ins = await fetch(`${sUrl}/rest/v1/community_layers`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(testRow) });
        const insBody = await ins.text();
        out.testInsert = { status: ins.status, ok: ins.ok, body: insBody.slice(0, 220) };
      } catch (e) { out.testInsert = { err: String(e).slice(0, 200) }; }
    }
    return res.status(200).json(out);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { entity, deviceId } = req.body || {};
  if (!entity || (!entity.theme && !entity.description)) {
    return res.status(400).json({ error: "entity.theme or entity.description required" });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!openaiKey) return res.status(200).json({ previewUrl: null });

  // Check budget for 5 images (4 layers + 1 preview)
  const totalCost = (LAYER_COST * 4) + PREVIEW_COST;
  if (supabaseUrl && supabaseKey) {
    const inBudget = await checkBudget(supabaseUrl, supabaseKey, totalCost);
    if (!inBudget) return res.status(200).json({ previewUrl: null, reason: "daily_budget_reached" });
  }

  try {
    const levelName = generateLevelName(entity.description, entity.theme, Math.floor(Math.random() * 10000));
    const layerTypes = ['sky', 'midground', 'platforms', 'foreground'];
    const parallaxSpeeds = { sky: 0.15, midground: 0.6, platforms: 0.75, foreground: 1.0 };
    const categories = { sky: 'sky', midground: 'plants', platforms: 'ground', foreground: 'plants' };
    let totalSpent = 0;

    // For each layer: try the shared library FIRST, only call DALL-E if needed.
    const layerJobs = layerTypes.map((layerType) => (async () => {
      const pool = await findReusableLayers(supabaseUrl, supabaseKey, layerType, entity.theme);
      const hasCustom = !!(entity.description && entity.description.trim());
      // Reuse instantly when we have a match and aren't intentionally refreshing.
      // A custom typed description biases toward fresh art so it matches their words.
      const wantFresh = pool.length === 0 || hasCustom || Math.random() < REFRESH_CHANCE;
      if (pool.length > 0 && !wantFresh) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return { id: pick.id, assetId: pick.asset_id, layerType, imageUrl: pick.image_url, parallaxSpeed: parallaxSpeeds[layerType], reused: true };
      }
      // Generate a fresh layer and add it to the shared library for next time.
      try {
        const imageUrl = await generateImage(buildLayerPrompt(layerType, entity), openaiKey);
        if (imageUrl) {
          const assetId = `${layerType}_${(entity.theme || 'generic').toLowerCase().replace(/\s+/g, '_')}_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
          const layerData = {
            asset_id: assetId,
            layer_type: layerType,
            category: categories[layerType],
            image_url: imageUrl,
            parallax_speed: parallaxSpeeds[layerType],
            theme_tags: [entity.theme].filter(Boolean),
            prompt_used: buildLayerPrompt(layerType, entity),
            has_transparency: layerType !== 'platforms',
            reusable: true,
            created_by_device_id: deviceId || 'anonymous',
            moderation_status: 'approved'
          };
          const layerId = supabaseUrl && supabaseKey ? await saveLayerToDb(supabaseUrl, supabaseKey, layerData) : null;
          return { id: layerId, assetId, layerType, imageUrl, parallaxSpeed: parallaxSpeeds[layerType], reused: false, fresh: true };
        }
      } catch (e) {
        // fall through to library fallback
      }
      // Generation failed (or was skipped) — fall back to the library if possible.
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return { id: pick.id, assetId: pick.asset_id, layerType, imageUrl: pick.image_url, parallaxSpeed: parallaxSpeeds[layerType], reused: true, fallback: true };
      }
      return null;
    })());

    const layerResults = await Promise.allSettled(layerJobs);
    const validLayers = layerResults
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean);

    const freshCount = validLayers.filter((l) => l.fresh).length;
    const reusedCount = validLayers.filter((l) => l.reused).length;

    // Only spend on a preview image if we actually made fresh art this time.
    // If everything was reused, just use the first layer as the preview (free + instant).
    let previewUrl = null;
    let previewWasFresh = false;
    if (freshCount > 0) {
      previewUrl = await generateImage(buildLayerPrompt('preview', entity), openaiKey).catch(() => null);
      previewWasFresh = !!previewUrl;
    }

    // Be forgiving: as long as we got at least one image, we can show a world.
    if (!previewUrl) previewUrl = (validLayers[0] && validLayers[0].imageUrl) || null;
    if (!previewUrl && validLayers.length === 0) {
      return res.status(200).json({ previewUrl: null, error: "Couldn't make the world art this time — tap Generate to try again!" });
    }

    // Save level record (best effort).
    const levelIds = validLayers.map((l) => l.id).filter(Boolean);
    const levelData = {
      name: levelName,
      description: entity.description || '',
      theme_tags: [entity.theme].filter(Boolean),
      layer_ids: levelIds,
      preview_image_url: previewUrl,
      difficulty: entity.difficulty || 'easy',
      created_by_device_id: deviceId || 'anonymous',
      moderation_status: 'approved'
    };

    const levelId = supabaseUrl && supabaseKey ? await saveLevelToDb(supabaseUrl, supabaseKey, levelData) : null;

    // Only count what we actually paid DALL-E for.
    totalSpent = (LAYER_COST * freshCount) + (previewWasFresh ? PREVIEW_COST : 0);
    if (supabaseUrl && supabaseKey && totalSpent > 0) {
      await logSpend(supabaseUrl, supabaseKey, totalSpent);
    }

    return res.status(200).json({
      levelId,
      levelName,
      previewUrl,
      layers: validLayers,
      cached: freshCount === 0,
      reusedCount,
      freshCount,
      costUsd: totalSpent
    });
  } catch (e) {
    console.error("generate-level error:", e);
    return res.status(200).json({ previewUrl: null, error: e.message });
  }
}
