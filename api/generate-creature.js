// /api/generate-creature.js
import crypto from "crypto";

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const DALLE_COST_PER_IMAGE = 0.04;

// Character name generation
const CHARACTER_ADJECTIVES = ['Zappy', 'Wobbly', 'Sparkly', 'Bouncy', 'Zippy', 'Giggly', 'Fuzzy', 'Speedy', 'Silly', 'Twirly', 'Snappy', 'Chirpy', 'Wiggly', 'Jolly', 'Tickly', 'Mighty', 'Brave', 'Swift', 'Clever', 'Wild'];
const CHARACTER_NOUNS = ['McSparkle', 'Fang', 'Wings', 'Zoom', 'Bounce', 'Whirl', 'Dash', 'Splash', 'Thunder', 'Whisker', 'Fluff', 'Spark', 'Bolt', 'Claw', 'Stripe', 'Spot', 'Flame', 'Frost', 'Storm', 'Breeze'];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateCharacterName(description = '', existingCount = 0) {
  const hash = hashString(description + existingCount.toString());
  const adjIdx = hash % CHARACTER_ADJECTIVES.length;
  const nounIdx = (hash >> 8) % CHARACTER_NOUNS.length;
  return `${CHARACTER_ADJECTIVES[adjIdx]} ${CHARACTER_NOUNS[nounIdx]}`;
}

function entityHash(entity) {
  const stable = JSON.stringify({
    description: entity.description || "",
    color: entity.color || "",
    body: entity.body || "",
    feature: entity.feature || "",
    style: entity.style || "",
    accessory: entity.accessory || ""
  });
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildPrompt(entity) {
  if (entity.description && entity.description.trim().length > 3) {
    const desc = entity.description.trim().slice(0, 200);
    return `A cute, friendly cartoon character: ${desc}, child-friendly storybook illustration, bright colors, simple shapes, white background, centered, no text, no scary features, suitable for ages 5-12, kawaii style`;
  }
  const style = entity.style ? `${entity.style} ` : "";
  const color = entity.color === "rainbow" ? "rainbow-colored" : (entity.color || "colorful");
  const body = entity.body || "creature";
  const featureBits = [];
  if (entity.feature === "fire") featureBits.push("with cute flames");
  if (entity.feature === "ice") featureBits.push("with sparkly ice");
  if (entity.feature === "stars") featureBits.push("with magical sparkles");
  if (entity.feature === "crown") featureBits.push("wearing a tiny crown");
  if (entity.feature === "zap") featureBits.push("with friendly lightning");
  if (entity.feature === "heart") featureBits.push("with floating hearts");
  if (entity.accessory === "cape") featureBits.push("wearing a hero cape");
  if (entity.accessory === "wings") featureBits.push("with feathery wings");
  if (entity.accessory === "hat") featureBits.push("wearing a fun hat");
  if (entity.accessory === "sword") featureBits.push("holding a toy sword");
  const features = featureBits.join(", ");
  return `A cute, friendly cartoon ${style}${color} ${body} ${features}, child-friendly storybook illustration, bright colors, simple shapes, white background, centered, no text, no scary features, suitable for ages 5-12, kawaii style`.trim();
}

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

async function logSpend(supabaseUrl, supabaseKey, cost) {
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${supabaseUrl}/rest/v1/usage_log`, {
      method: "POST",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "image" })
    });
  } catch (e) {}
}

async function checkCache(supabaseUrl, supabaseKey, hash) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/creature_cache?select=image_url&hash=eq.${hash}`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.image_url || null;
  } catch (e) { return null; }
}

async function saveCache(supabaseUrl, supabaseKey, hash, url, entity) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/creature_cache`, {
      method: "POST",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ hash, image_url: url, color: entity.color, body: entity.body, feature: entity.feature, description: entity.description || null })
    });
  } catch (e) {}
}

async function logToCommunity(supabaseUrl, supabaseKey, name, description, imageUrl, deviceId) {
  if (!supabaseUrl || !supabaseKey) return null;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/community_characters`, {
      method: "POST",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation" },
      body: JSON.stringify({ name, description, image_url: imageUrl, created_by_device_id: deviceId, moderation_status: "approved" })
    });
    if (r.ok) {
      const data = await r.json();
      return data[0]?.id || null;
    }
  } catch (e) {
    console.error('logToCommunity error:', e.message);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { entity, deviceId } = req.body || {};
  if (!entity || (!entity.body && !entity.description)) return res.status(400).json({ error: "entity.body or entity.description required" });

  const hash = entityHash(entity);
  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!openaiKey) return res.status(200).json({ url: null });

  if (supabaseUrl && supabaseKey) {
    const cached = await checkCache(supabaseUrl, supabaseKey, hash);
    if (cached) {
      const characterName = generateCharacterName(entity.description, Math.floor(Math.random() * 10000));
      return res.status(200).json({ url: cached, cached: true, characterName });
    }
    const inBudget = await checkBudget(supabaseUrl, supabaseKey);
    if (!inBudget) return res.status(200).json({ url: null, reason: "daily_budget_reached" });
  }

  try {
    const prompt = buildPrompt(entity);
    let imageUrl = null;

    // Use dall-e-3 (no response_format param — url is the default)
    const oaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" })
    });

    if (oaiRes.ok) {
      const oaiData = await oaiRes.json();
      imageUrl = oaiData.data?.[0]?.url || null;
    } else {
      const errText = await oaiRes.text();
      console.error("OpenAI image generation failed:", oaiRes.status, errText.substring(0, 300));
      return res.status(200).json({ url: null, error: "image_gen_failed" });
    }

    if (!imageUrl) return res.status(200).json({ url: null });

    const characterName = generateCharacterName(entity.description, Math.floor(Math.random() * 10000));

    if (supabaseUrl && supabaseKey) {
      await saveCache(supabaseUrl, supabaseKey, hash, imageUrl, entity);
      await logSpend(supabaseUrl, supabaseKey, DALLE_COST_PER_IMAGE);
      await logToCommunity(supabaseUrl, supabaseKey, characterName, entity.description || '', imageUrl, deviceId || 'anonymous');
    }

    return res.status(200).json({ url: imageUrl, cached: false, characterName });
  } catch (e) {
    console.error("generate-creature error:", e);
    return res.status(200).json({ url: null, error: e.message });
  }
}
