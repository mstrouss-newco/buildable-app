// /api/generate-level.js
import crypto from "crypto";

const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const DALLE_COST_PER_IMAGE = 0.04;

function levelHash(entity) {
  // Include description in the hash so free-text descriptions get unique images
  const stable = JSON.stringify({
    description: entity.description || "",
    theme: entity.theme || "",
    difficulty: entity.difficulty || "",
    style: entity.style || ""
  });
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function buildLevelPrompt(entity) {
  // If the kid typed a free-text description, use it directly as the main subject
  if (entity.description && entity.description.trim().length > 3) {
    const desc = entity.description.trim().slice(0, 200);
    return `A colorful, kid-friendly game level background: ${desc}, bright colors, simple shapes, clean design, suitable for a side-scrolling platformer game, no text, no scary features, suitable for ages 5-12, storybook illustration style, white or light background`;
  }

  // Fallback: build from theme and difficulty
  const theme = entity.theme || "forest";
  const difficulty = entity.difficulty || "easy";
  const style = entity.style ? `${entity.style} ` : "";

  const difficultyDescriptor = difficulty === "easy" ? "simple, gentle" : difficulty === "medium" ? "interesting, varied" : "complex, challenging";

  return `A colorful, kid-friendly game level background for a ${difficulty} ${style}${theme} world, ${difficultyDescriptor} terrain with platforms and obstacles, bright colors, simple shapes, clean design, suitable for a side-scrolling platformer game, no text, no scary features, suitable for ages 5-12, storybook illustration style, white or light background, centered composition`.trim();
}

async function checkBudget(supabaseUrl, supabaseKey) {
  if (!supabaseUrl || !supabaseKey) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(
      `${supabaseUrl}/rest/v1/usage_log?select=cost_usd&date=eq.${today}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );
    if (!r.ok) return true;
    const rows = await r.json();
    const total = rows.reduce((s, row) => s + (row.cost_usd || 0), 0);
    return total < DAILY_BUDGET_USD;
  } catch (e) {
    return true;
  }
}

async function logSpend(supabaseUrl, supabaseKey, cost) {
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${supabaseUrl}/rest/v1/usage_log`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        date: today,
        cost_usd: cost,
        kind: "image"
      })
    });
  } catch (e) {}
}

async function checkCache(supabaseUrl, supabaseKey, hash) {
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/level_cache?select=image_url&hash=eq.${hash}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.image_url || null;
  } catch (e) {
    return null;
  }
}

async function saveCache(supabaseUrl, supabaseKey, hash, url, entity) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/level_cache`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        hash,
        image_url: url,
        theme: entity.theme,
        difficulty: entity.difficulty,
        description: entity.description || null
      })
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { entity } = req.body || {};
  if (!entity || (!entity.theme && !entity.description)) {
    return res
      .status(400)
      .json({ error: "entity.theme or entity.description required" });
  }

  const hash = levelHash(entity);
  const openaiKey = process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!openaiKey) {
    return res.status(200).json({ url: null });
  }

  if (supabaseUrl && supabaseKey) {
    const cached = await checkCache(supabaseUrl, supabaseKey, hash);
    if (cached) return res.status(200).json({ url: cached, cached: true });

    const inBudget = await checkBudget(supabaseUrl, supabaseKey);
    if (!inBudget) {
      return res
        .status(200)
        .json({ url: null, reason: "daily_budget_reached" });
    }
  }

  try {
    const prompt = buildLevelPrompt(entity);
    let imageUrl = null;

    // Try gpt-image-1 first (newer model, returns b64_json)
    const oaiRes1 = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024"
      })
    });

    if (oaiRes1.ok) {
      const oai1 = await oaiRes1.json();
      const b64 = oai1.data?.[0]?.b64_json;
      if (b64) {
        imageUrl = `data:image/png;base64,${b64}`;
      }
    } else {
      // Fall back to dall-e-3
      const oaiRes2 = await fetch(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            response_format: "url"
          })
        }
      );

      if (oaiRes2.ok) {
        const oai2 = await oaiRes2.json();
        imageUrl = oai2.data?.[0]?.url || null;
      } else {
        const errText = await oaiRes2.text();
        console.error("Both models failed:", errText.substring(0, 300));
        return res.status(200).json({
          url: null,
          error: "image_gen_failed",
          detail: errText.substring(0, 200)
        });
      }
    }

    if (!imageUrl) return res.status(200).json({ url: null });

    if (supabaseUrl && supabaseKey) {
      await saveCache(supabaseUrl, supabaseKey, hash, imageUrl, entity);
      await logSpend(supabaseUrl, supabaseKey, DALLE_COST_PER_IMAGE);
    }

    return res.status(200).json({ url: imageUrl, cached: false });
  } catch (e) {
    console.error("generate-level error:", e);
    return res.status(200).json({ url: null, error: e.message });
  }
}
