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

async function generateImage(prompt, openaiKey) {
  try {
    // Try gpt-image-1 first
    const oaiRes1 = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {"Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify({model: "gpt-image-1", prompt, n: 1, size: "1024x1024"})
    });
    if (oaiRes1.ok) {
      const oai1 = await oaiRes1.json();
      const b64 = oai1.data?.[0]?.b64_json;
      if (b64) return `data:image/png;base64,${b64}`;
    }
    
    // Fall back to dall-e-3
    const oaiRes2 = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {"Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json"},
      body: JSON.stringify({model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "url"})
    });
    if (oaiRes2.ok) {
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

export default async function handler(req, res) {
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
    const layerIds = [];
    let totalSpent = 0;

    // Generate all layers in parallel
    const layerPromises = layerTypes.map(async (layerType) => {
      const prompt = buildLayerPrompt(layerType, entity);
      const imageUrl = await generateImage(prompt, openaiKey);
      
      if (!imageUrl) return null;

      const parallaxSpeeds = { sky: 0.15, midground: 0.6, platforms: 0.75, foreground: 1.0 };
      const categories = { sky: 'sky', midground: 'plants', platforms: 'ground', foreground: 'plants' };

      const assetId = `${layerType}_${(entity.theme || 'generic').toLowerCase().replace(/\s+/g, '_')}_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const layerData = {
        asset_id: assetId,
        layer_type: layerType,
        category: categories[layerType],
        image_url: imageUrl,
        parallax_speed: parallaxSpeeds[layerType],
        theme_tags: [entity.theme].filter(Boolean),
        prompt_used: prompt,
        has_transparency: layerType !== 'platforms',
        reusable: true,
        created_by_device_id: deviceId || 'anonymous',
        moderation_status: 'approved'
      };

      // Save to database if Supabase is available
      const layerId = supabaseUrl && supabaseKey ? await saveLayerToDb(supabaseUrl, supabaseKey, layerData) : null;
      
      return { id: layerId, assetId, layerType, imageUrl, parallaxSpeed: parallaxSpeeds[layerType] };
    });

    const layers = await Promise.all(layerPromises);
    const validLayers = layers.filter(Boolean);

    if (validLayers.length < 4) {
      return res.status(200).json({ previewUrl: null, error: "Failed to generate all layers" });
    }

    // Generate preview image
    const previewPrompt = buildLayerPrompt('preview', entity);
    const previewUrl = await generateImage(previewPrompt, openaiKey);

    if (!previewUrl) {
      return res.status(200).json({ previewUrl: null, error: "Failed to generate preview" });
    }

    // Save level record
    const levelIds = validLayers.map(l => l.id).filter(Boolean);
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

    totalSpent = (LAYER_COST * 4) + PREVIEW_COST;
    if (supabaseUrl && supabaseKey) {
      await logSpend(supabaseUrl, supabaseKey, totalSpent);
    }

    return res.status(200).json({
      levelId,
      levelName,
      previewUrl,
      layers: validLayers,
      cached: false,
      costUsd: totalSpent
    });
  } catch (e) {
    console.error("generate-level error:", e);
    return res.status(200).json({ previewUrl: null, error: e.message });
  }
}
