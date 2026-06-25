// /api/generate-story.js
// Buildable Stories — turns a kid's guided choices into a structured, age-safe
// picture-book PLAN (title + 5-8 pages of text, art prompts, and ONE ambient
// effect per page chosen from a fixed allow-list). Text only -> fast + cheap.
// Page ART and NARRATION are produced later/lazily by separate endpoints so the
// child never waits on a long batch image job.
//
// Conventions mirrored from the rest of the repo:
//   - Claude via raw fetch (Haiku = cheap/fast) ; ANTHROPIC_API_KEY by name only.
//   - Daily budget guard (DAILY_BUDGET_USD) + usage_log cost row (kind:"story").
//   - VALIDATE-BEFORE-SERVE: if the model's JSON is malformed or unsafe, we serve
//     a hand-written fallback story so the create->read->save flow always works.
//   - Controlled vocabulary inputs (tap choices) keep free text — and moderation
//     surface — tiny. Any optional free-text "twist" is blocklist-checked.

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const STORY_COST_USD = parseFloat(process.env.STORY_COST_USD || "0.02");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

// Must stay in sync with src/lib/storyEffects.jsx STORY_EFFECTS.
const EFFECTS = [
  "fireplace_flicker", "snow_outside_window", "twinkling_stars", "candle_glow",
  "gentle_rain", "drifting_clouds", "magic_sparkles", "character_blink",
  "soft_glow", "floating_dust",
];
const EFFECT_SET = new Set(EFFECTS);

// Controlled vocab -> descriptive phrases for the prompt. The frontend offers
// these same ids as tap choices.
const HEROES = {
  bunny: "a brave little bunny", dragon: "a friendly baby dragon", robot: "a curious robot",
  kitten: "a clever kitten", astronaut: "a young astronaut", mermaid: "a kind mermaid",
  fox: "a quick little fox", knight: "a gentle knight",
};
const WORLDS = {
  snowy_forest: "a snowy forest with a cozy cabin", outer_space: "a sparkly outer-space adventure",
  underwater: "a colorful underwater kingdom", candy_land: "a sweet candy land",
  enchanted_woods: "an enchanted woodland", desert_oasis: "a sunny desert oasis",
  cloud_castle: "a castle in the clouds", pirate_cove: "a friendly pirate cove",
};
const PROBLEMS = {
  lost_friend: "needs to find a lost friend", missing_star: "a special star has gone missing",
  big_storm: "a big storm is coming", locked_door: "a magical door won't open",
  hungry_creature: "a sad, hungry creature needs help", broken_bridge: "a broken bridge blocks the path",
};
const HELPERS = {
  wise_owl: "a wise owl", talking_map: "a talking map", glowing_firefly: "a glowing firefly",
  old_turtle: "a slow but clever turtle", friendly_ghost: "a friendly little ghost",
  singing_bird: "a cheerful singing bird",
};
const TONES = {
  cozy: "cozy and warm", funny: "silly and funny", adventurous: "exciting and adventurous",
  magical: "dreamy and magical", brave: "brave and heartwarming",
};
const ENDINGS = {
  happy: "a happy, satisfying ending", surprise: "a gentle, delightful surprise ending",
  friendship: "an ending all about friendship", cozy_sleep: "a calm, sleepy bedtime ending",
};

// Tiny server-side blocklist for the optional free-text twist (defense in depth;
// most input is controlled tap choices).
const BLOCKED = ["kill", "blood", "gun", "knife", "sexy", "naked", "drug", "hate", "die", "dead", "stupid"];
function twistIsSafe(t) {
  if (!t) return true;
  const low = String(t).toLowerCase();
  return !BLOCKED.some((w) => low.includes(w));
}

function pick(map, id, fallbackId) {
  return map[id] || map[fallbackId];
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

// ---- cost tracking (mirrors generate-song.js) ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true; // no logging configured -> allow
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
      body: JSON.stringify({ date: today, cost_usd: cost, kind: "story", model: model || CLAUDE_MODEL }),
    });
  } catch { /* best-effort */ }
}

// ---- validate-before-serve ----
function clampText(t, max) {
  return String(t || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function validateStory(obj, choices) {
  if (!obj || typeof obj !== "object") return null;
  const title = clampText(obj.title, 70);
  if (!title) return null;
  const sheet = clampText(obj.character_sheet, 240);
  let pages = Array.isArray(obj.pages) ? obj.pages : null;
  if (!pages || pages.length < 4) return null;
  pages = pages.slice(0, 8).map((p, i) => {
    const text = clampText(p && p.text, 260);
    const scene = clampText(p && p.art_prompt, 300) || (title + " storybook scene");
    const effect = EFFECT_SET.has(p && p.effect) ? p.effect : "soft_glow";
    if (!text) return null;
    // Prepend the fixed character sheet to every page so the hero looks identical.
    const art_prompt = (sheet ? "CHARACTERS (draw EXACTLY the same every page): " + sheet + " " : "") + "SCENE: " + scene;
    return { n: i + 1, text, art_prompt, effect, art_url: null, audio_url: null, word_timings: null };
  });
  if (pages.some((p) => p === null) || pages.length < 4) return null;
  return { schema: 1, title, world: choices.world, character_sheet: sheet, pages, created_with: choices };
}

// Hand-written safe fallback so the flow never dead-ends.
function fallbackStory(c) {
  const hero = pick(HEROES, c.hero, "bunny");
  const world = pick(WORLDS, c.world, "enchanted_woods");
  const helper = pick(HELPERS, c.helper, "wise_owl");
  const name = clampText(c.heroName, 24) || "Pip";
  const sheet = "The hero is " + name + ", " + hero + " (always drawn with the same look, colors, and outfit on every page)" + (helper ? "; the helper is " + helper + ", drawn the same each time" : "") + ".";
  const P = (text, effect, art) => ({ n: 0, text, effect,
    art_prompt: "CHARACTERS (draw EXACTLY the same every page): " + sheet + " SCENE: " + art,
    art_url: null, audio_url: null, word_timings: null });
  const pages = [
    P(`Once upon a time, ${name}, ${hero}, lived in ${world}.`, "soft_glow", `${hero} in ${world}, soft storybook illustration`),
    P(`One morning, ${name} discovered something was wrong and set off to help.`, "drifting_clouds", `${hero} setting off on a path, storybook`),
    P(`Along the way, ${name} met ${helper}, who offered to come along.`, "twinkling_stars", `${hero} meeting ${helper}, warm storybook`),
    P(`Together they were brave and kind, and they thought of a clever plan.`, "magic_sparkles", `${hero} and ${helper} making a plan, cozy storybook`),
    P(`With a little courage and a lot of friendship, everything turned out wonderfully.`, "candle_glow", `${hero} happy ending in ${world}, glowing storybook`),
    P(`And ${name} went home with a happy heart. The End.`, "fireplace_flicker", `${hero} cozy at home, warm storybook`),
  ].map((p, i) => ({ ...p, n: i + 1 }));
  return { schema: 1, title: `${name} and the ${pick(TONES, c.tone, "magical").split(" ")[0]} Day`, world: c.world, character_sheet: sheet, pages, created_with: c, fallback: true };
}

function buildPrompt(c, age) {
  const hero = pick(HEROES, c.hero, "bunny");
  const world = pick(WORLDS, c.world, "enchanted_woods");
  const problem = pick(PROBLEMS, c.problem, "lost_friend");
  const helper = pick(HELPERS, c.helper, "wise_owl");
  const tone = pick(TONES, c.tone, "cozy");
  const ending = pick(ENDINGS, c.ending, "happy");
  const name = clampText(c.heroName, 24) || "the hero";
  const twist = twistIsSafe(c.twist) ? clampText(c.twist, 120) : "";
  return [
    `You are a beloved children's picture-book author writing for a child age ${age || 6}.`,
    `Write a gentle, wholesome, age-appropriate story. Absolutely NO violence, scary peril, romance, or anything a parent wouldn't want a young child to hear.`,
    `Hero: ${name}, ${hero}. World: ${world}. The problem: ${problem}. A helper appears: ${helper}. Tone: ${tone}. Ending: ${ending}.`,
    twist ? `Gently weave in this idea if it is wholesome: "${twist}".` : ``,
    `Return ONLY raw JSON (no markdown fences) of this exact shape:`,
    `{"character_sheet": string (1-2 sentences fixing the hero's EXACT look — species, colors, distinctive features, outfit — and any recurring helper, so an illustrator draws them IDENTICALLY on every page), "title": string (max 6 words), "pages": [ {"text": string (1-2 short simple sentences a ${age || 6}-year-old can follow), "art_prompt": string (describe ONLY the SCENE/action for this page — do NOT redescribe the characters' appearance, that comes from character_sheet; NO text/words in the image), "effect": one of ${JSON.stringify(EFFECTS)} } ]}`,
    `Use 6 pages. Keep the hero's appearance 100% consistent via character_sheet. Choose the single best-fitting "effect" id per page. Keep every page kind and clear.`,
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = await readBody(req);
  const c = (body.choices && typeof body.choices === "object") ? body.choices : {};
  const age = Math.max(3, Math.min(12, parseInt(body.age || 6, 10) || 6));

  // Moderation: reject an unsafe free-text twist outright (controlled choices are safe by construction).
  if (!twistIsSafe(c.twist)) {
    return res.status(200).json({ ok: true, moderated: true, story: fallbackStory(c) });
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  // If no key or over budget -> serve the safe fallback story (still magical, $0).
  if (!claudeKey || !(await underBudget())) {
    return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(c) });
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1600, messages: [{ role: "user", content: buildPrompt(c, age) }] }),
    });
    if (!resp.ok) {
      return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(c) });
    }
    const data = await resp.json();
    let txt = (data && data.content && data.content[0] && data.content[0].text) || "";
    // strip code fences + isolate the JSON object
    txt = txt.replace(/```json|```/g, "").trim();
    const first = txt.indexOf("{"), last = txt.lastIndexOf("}");
    let parsed = null;
    if (first !== -1 && last !== -1) { try { parsed = JSON.parse(txt.slice(first, last + 1)); } catch { parsed = null; } }
    const story = validateStory(parsed, c);
    await logCost(STORY_COST_USD, CLAUDE_MODEL);
    if (!story) return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(c) });
    return res.status(200).json({ ok: true, source: "ai", story });
  } catch (e) {
    return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(c) });
  }
}
