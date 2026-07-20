// /api/story-ambience.js
// Looping ambient soundbed for a story WORLD (forest birds, ocean waves, space
// hum, ...). Generated ONCE per world via ElevenLabs Sound Effects and cached in
// `narration_cache` (key "ambience:<world>"), so it's a one-time cost reused across
// every story in that world. GET so the CDN can cache it too (deterministic per world).
//
// Returns { configured:true, audioUrl } (a loopable mp3 data URL) when ELEVENLABS_API_KEY
// is set and has Sound Effects permission; otherwise { configured:false } and the reader
// simply plays no ambience. Owner: run db/create-narration-cache.sql to enable caching.

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

// Calm, loopable ambience per world. Kept gentle (background, not distracting).
// Keys MUST match the real story world slugs (story.start_world / page.world_slug)
// used by src/StoryMaker.jsx + api/story-library.js — otherwise ambience never plays.
const AMBIENCE = {
  "snowy-village":    "gentle calm winter wind softly blowing through snowy pine trees, peaceful, seamless loop",
  "coral-reef":       "calm underwater ambience, gentle bubbles and soft flowing water, peaceful, seamless loop",
  "enchanted-forest": "peaceful enchanted forest, gentle birdsong and soft rustling leaves, seamless loop",
  "dragon-mountain":  "soft airy high-altitude mountain wind with faint gentle magical chimes, dreamy, seamless loop",
  "dino-jungle":      "lush calm jungle ambience, distant soft birdcalls and gentle rustling leaves, peaceful, seamless loop",
  "space-station":    "soft calm ambient outer-space hum with faint twinkling tones, peaceful, seamless loop",
  "desert-oasis":     "warm gentle desert breeze with faint distant birds, calm, seamless loop",
  "candy-land":       "soft whimsical magical sparkle chimes, light playful and gentle, seamless loop",
  "city-town":        "gentle cheerful town ambience, soft distant birds and a light breeze, calm, seamless loop",
};
// Back-compat: old callers that still send legacy world names resolve to the real slug.
const ALIAS = {
  snowy_forest: "snowy-village", outer_space: "space-station", underwater: "coral-reef",
  candy_land: "candy-land", enchanted_woods: "enchanted-forest", desert_oasis: "desert-oasis",
  cloud_castle: "dragon-mountain", pirate_cove: "coral-reef",
};

async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].audio_b64 : null;
  } catch { return null; }
}
async function cachePut(key, audio_b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ cache_key: key, audio_b64, word_timings: null }),
    });
  } catch { /* best-effort */ }
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
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "ambience", model: "elevenlabs-sfx" }),
    });
  } catch { /* best-effort */ }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const raw = (req.query.world || "").toString();
  const world = ALIAS[raw] || raw;
  const prompt = AMBIENCE[world];
  if (!prompt) return res.status(200).json({ ok: true, configured: false, reason: "unknown_world" });

  const key = "ambience:" + world;
  const hit = await cacheGet(key);
  if (hit) return res.status(200).json({ ok: true, configured: true, cached: true, audioUrl: "data:audio/mpeg;base64," + hit });

  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) return res.status(200).json({ ok: true, configured: false });
  if (!(await underBudget())) return res.status(200).json({ ok: true, configured: false, reason: "over_daily_budget" });

  try {
    const r = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt, duration_seconds: 18, prompt_influence: 0.4, loop: true }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(200).json({ ok: true, configured: false, reason: "sfx_failed", detail: detail.slice(0, 160) });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const b64 = buf.toString("base64");
    await cachePut(key, b64);
    await logCost(parseFloat(process.env.AMBIENCE_COST_USD || "0.12"));
    return res.status(200).json({ ok: true, configured: true, cached: false, audioUrl: "data:audio/mpeg;base64," + b64 });
  } catch (e) {
    return res.status(200).json({ ok: true, configured: false, reason: "error", detail: String((e && e.message) || e).slice(0, 120) });
  }
}
