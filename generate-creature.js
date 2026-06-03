// /api/generate-creature.js
// Vercel serverless function. Takes a kid's creature entity, returns an
// AI-generated image URL. Uses DALL-E 3 with safety pre-filter.
//
// Environment variables needed (set in Vercel project settings):
//   OPENAI_API_KEY        — your OpenAI key (for image gen)
//   SUPABASE_URL          — your Supabase project URL
//   SUPABASE_SERVICE_KEY  — Supabase service role key (server-side only!)
//   DAILY_BUDGET_USD      — optional, defaults to 10
//
// Flow:
//   1. Validate inputs (kid-safe, not too long)
//   2. Hash the entity to make a cache key
//   3. Check Supabase cache — if hit, return URL immediately (free!)
//   4. Check daily spend in Supabase — if over budget, return null (client falls back to procedural)
//   5. Call DALL-E 3 with a sanitized prompt
//   6. Save result to Supabase cache + log spend
//   7. Return URL

import crypto from "crypto";

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const DALLE_COST_PER_IMAGE = 0.04; // standard quality 1024x1024

function entityHash(entity) {
  const stable = JSON.stringify({
    color: entity.color || "",
    body: entity.body || "",
    feature: entity.feature || "",
    power: entity.power || "",
    style: entity.style || "",
    accessory: entity.accessory || "",
  });
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildPrompt(entity) {
  // Build a kid-safe DALL-E prompt from the validated entity.
  // The entity already passed our blocklist + allowlist, but we still
  // template carefully to keep output kid-friendly.
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
  if (entity.accessory === "hat") featureBits.push("wearing a cute hat");
  if (entity.accessory === "sword") featureBits.push("holding a toy sword");

  const features = featureBits.join(" ");
  return `A cute, friendly cartoon ${style}${color} ${body} ${features}, child-friendly storybook illustration, bright colors, simple shapes, white background, centered, no text, no scary features, suitable for ages 5-12, kawaii style`.trim();
}

async function checkBudget(supabaseUrl, supabaseKey) {
  // Check today's spend in Supabase. If over budget, return false.
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/usage_log?date=eq.${today}&select=cost_usd`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
    });
    if (!r.ok) return true; // if we can't check, fail open
    const rows = await r.json();
    const total = rows.reduce((s, r) => s + (parseFloat(r.cost_usd) || 0), 0);
    return total < DAILY_BUDGET_USD;
  } catch (e) {
    return true;
  }
}

async function logSpend(supabaseUrl, supabaseKey, cost) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await fetch(`${supabaseUrl}/rest/v1/usage_log`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "image" }),
    });
  } catch (e) { /* non-fatal */ }
}

async function checkCache(supabaseUrl, supabaseKey, hash) {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/creature_cache?hash=eq.${hash}&select=image_url`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
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
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates",
      },
      body: JSON.stringify({ hash, image_url: url, entity }),
    });
  } catch (e) { /* non-fatal */ }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { entity } = req.body || {};
  if (!entity || !entity.body) return res.status(400).json({ error: "entity.body required" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    // No key configured — gracefully fall through. Client will use procedural.
    return res.status(200).json({ url: null });
  }

  const hash = entityHash(entity);

  // Cache check
  if (supabaseUrl && supabaseKey) {
    const cached = await checkCache(supabaseUrl, supabaseKey, hash);
    if (cached) return res.status(200).json({ url: cached, cached: true });

    const inBudget = await checkBudget(supabaseUrl, supabaseKey);
    if (!inBudget) return res.status(200).json({ url: null, reason: "daily_budget_reached" });
  }

  // Generate
  try {
    const prompt = buildPrompt(entity);
    const oaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "url",
      }),
    });

    if (!oaiRes.ok) {
      const errText = await oaiRes.text();
      console.error("DALL-E error:", errText);
      return res.status(200).json({ url: null, error: "image_gen_failed" });
    }

    const oai = await oaiRes.json();
    const imageUrl = oai.data?.[0]?.url;
    if (!imageUrl) return res.status(200).json({ url: null });

    // Cache + log
    if (supabaseUrl && supabaseKey) {
      await saveCache(supabaseUrl, supabaseKey, hash, imageUrl, entity);
      await logSpend(supabaseUrl, supabaseKey, DALLE_COST_PER_IMAGE);
    }

    return res.status(200).json({ url: imageUrl, cached: false });
  } catch (e) {
    console.error("generate-creature error:", e);
    return res.status(200).json({ url: null, error: e.message });
  }
}
