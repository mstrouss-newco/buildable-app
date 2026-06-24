// /api/generate-story-art.js
// Generates ONE storybook illustration for a single story page, on demand.
// The Story Reader calls this lazily (current page first, prefetch the next) so
// a child never waits on a 6-image batch. If OpenAI is unavailable, off-budget,
// or errors, we return { placeholder:true } and the reader shows a calm gradient
// "scene" instead — the page is never blank and the flow never blocks.
//
// Mirrors the image fallback chain + usage_log cost pattern in generate-creature.js.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ART_COST_USD = parseFloat(process.env.STORY_ART_COST_USD || "0.04");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

const STYLE = "soft children's picture-book illustration, warm gentle colors, rounded friendly shapes, storybook watercolor, no text, no words, age 4-8, wholesome";

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

async function generateImage(prompt, openaiKey, timeoutMs = 28000) {
  const attempt = async (b) => {
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
        return b64 ? `data:image/png;base64,${b64}` : (url || null);
      }
      return null;
    } catch { clearTimeout(timer); return null; }
  };
  return (
    (await attempt({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard" })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" })) ||
    (await attempt({ model: "dall-e-2", prompt: prompt.slice(0, 1000), n: 1, size: "1024x1024" })) ||
    null
  );
}

export default async function handler(req, res) {
  // Safe diagnostic (booleans only, never secret values): GET /api/generate-story-art
  if (req.method === "GET") {
    // ?probe=art runs ONE real image call and reports success + any error text
    // (no secret values) so we can confirm the account can actually generate art.
    if (req.query && req.query.probe === "art") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return res.status(200).json({ ok: true, probe: true, gotImage: false, reason: "no_openai_key" });
      const out = {};
      for (const model of ["dall-e-3", "gpt-image-1", "dall-e-2"]) {
        try {
          const r = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, prompt: "a friendly cartoon star, storybook", n: 1, size: "1024x1024" }),
          });
          if (r.ok) { out[model] = "ok"; return res.status(200).json({ ok: true, probe: true, gotImage: true, worked: model, results: out }); }
          const t = await r.text();
          out[model] = `${r.status}: ${t.slice(0, 160)}`;
        } catch (e) { out[model] = "err: " + String((e && e.message) || e).slice(0, 120); }
      }
      return res.status(200).json({ ok: true, probe: true, gotImage: false, results: out });
    }
    return res.status(200).json({
      ok: true,
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      hasSupabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = await readBody(req);
  const artPrompt = (body.artPrompt || "").toString().slice(0, 320).trim();
  if (!artPrompt) return res.status(400).json({ error: "artPrompt is required" });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(200).json({ ok: true, placeholder: true, reason: "no_openai_key" });
  if (!(await underBudget())) return res.status(200).json({ ok: true, placeholder: true, reason: "over_daily_budget" });
  try {
    const prompt = `${artPrompt}. ${STYLE}`;
    const url = await generateImage(prompt, openaiKey);
    if (!url) return res.status(200).json({ ok: true, placeholder: true, reason: "image_provider_failed" });
    await logCost(ART_COST_USD, "image");
    return res.status(200).json({ ok: true, url });
  } catch (e) {
    return res.status(200).json({ ok: true, placeholder: true, reason: "error", detail: String((e && e.message) || e).slice(0, 120) });
  }
}
