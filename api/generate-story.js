// /api/generate-story.js  (v2 — LIBRARY model)
// Turns a kid's 3 picks (style + character + world) into a 6-page picture-book
// PLAN. The pictures are NOT generated per story — each page just names a library
// WORLD (background) + a core-5 EMOTION (the character's face). The reader layers
// the cached library art with motion, so a story costs ~$0 and is instant.
//
//   POST { style, characterSlug, characterName?, worldSlug, age?, deviceId?, kidProfileId?, priorStory? }
//     -> { ok, source, story }
//   story = { schema:2, title, style, character_slug, character_name, start_world,
//             pages:[{ text, world_slug, emotion, effect, effects:[effect] }], created_with }

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const STORY_COST_USD = parseFloat(process.env.STORY_COST_USD || "0.02");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Must stay in sync with src/lib/storyEffects.jsx STORY_EFFECTS and api/story-library.js.
const EFFECTS = [
  "fireplace_flicker", "snow_outside_window", "twinkling_stars", "candle_glow",
  "gentle_rain", "drifting_clouds", "magic_sparkles", "character_blink",
  "soft_glow", "floating_dust", "sun_pulse", "water_shimmer", "gentle_waves",
];
const EFFECT_SET = new Set(EFFECTS);

// The library worlds (slugs MUST match api/story-library.js).
const WORLDS = {
  "snowy-village":    { name: "Snowy Pine Village", desc: "a cozy snowy mountain village with little cabins and falling snow", fx: "snow_outside_window" },
  "coral-reef":       { name: "Coral Reef Kingdom", desc: "a bright underwater coral reef kingdom", fx: "water_shimmer" },
  "enchanted-forest": { name: "Enchanted Forest", desc: "a magical glowing forest with mushrooms and fireflies", fx: "magic_sparkles" },
  "dragon-mountain":  { name: "Dragon Mountain", desc: "a friendly fantasy mountain with a little castle and a glowing cave", fx: "soft_glow" },
  "dino-jungle":      { name: "Dino Jungle", desc: "a lush prehistoric jungle with ferns and a gentle volcano", fx: "floating_dust" },
  "space-station":    { name: "Starlight Space", desc: "a friendly outer-space scene with planets and twinkling stars", fx: "twinkling_stars" },
  "desert-oasis":     { name: "Golden Desert Oasis", desc: "a golden desert at sunset with a palm-tree oasis", fx: "sun_pulse" },
  "candy-land":       { name: "Candy Cloud Land", desc: "a whimsical candy land with lollipop trees and marshmallow clouds", fx: "magic_sparkles" },
};
const WORLD_SLUGS = Object.keys(WORLDS);

// The library characters (slugs MUST match api/story-library.js).
const CHARACTERS = {
  bunny:   { name: "Bramble the Bunny", desc: "a fluffy grey baby bunny with a cozy red scarf" },
  fox:     { name: "Pip the Fox", desc: "a little orange fox cub with a fluffy white-tipped tail" },
  bear:    { name: "Biscuit the Bear", desc: "a round brown bear cub" },
  penguin: { name: "Waddle the Penguin", desc: "a little penguin chick with a blue bowtie" },
  dragon:  { name: "Ember the Dragon", desc: "a friendly soft-green baby dragon with little wings" },
  owl:     { name: "Professor Owl", desc: "a small wise owl with round glasses" },
  turtle:  { name: "Shelby the Turtle", desc: "a tiny green turtle" },
  hedgehog:{ name: "Quill the Hedgehog", desc: "a little hedgehog with soft spikes" },
  koala:   { name: "Coco the Koala", desc: "a grey koala with big fluffy ears" },
  tiger:   { name: "Tilly the Tiger", desc: "a little tiger cub with soft stripes" },
  fawn:    { name: "Willow the Fawn", desc: "a baby deer fawn with white spots" },
  otter:   { name: "Ollie the Otter", desc: "a river otter with whiskers" },
  wizard:  { name: "Milo the Wizard", desc: "a little child wizard in a starry robe with a glowing wand" },
  fairy:   { name: "Petal the Fairy", desc: "a little flower fairy with sparkly wings" },
  robot:   { name: "Bolt the Robot", desc: "a small friendly round robot with glowing eyes" },
  mermaid: { name: "Marina the Mermaid", desc: "a little mermaid with a shimmering teal tail" },
};

const EMOS = ["happy", "surprised", "scared", "sad", "sleepy"];
const EMO_SET = new Set(EMOS);

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } }); });
}
function clampText(t, max) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, max); }

async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usage_log?select=cost_usd&date=eq.${today}`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
    if (!r.ok) return true;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, { method: "POST", headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ date: today, cost_usd: cost, kind: "story", model: CLAUDE_MODEL }) });
  } catch {}
}

function normalizeInput(body) {
  const style = ["watercolor", "modern3d", "papercut"].includes(body.style) ? body.style : "watercolor";
  const characterSlug = CHARACTERS[body.characterSlug] ? body.characterSlug : "bunny";
  const worldSlug = WORLDS[body.worldSlug] ? body.worldSlug : "enchanted-forest";
  const characterName = clampText(body.characterName, 28) || CHARACTERS[characterSlug].name;
  return { style, characterSlug, worldSlug, characterName };
}

function buildPrompt(inp, age) {
  const ch = CHARACTERS[inp.characterSlug];
  const w = WORLDS[inp.worldSlug];
  const worldList = WORLD_SLUGS.map((s) => `"${s}" (${WORLDS[s].desc})`).join(", ");
  return [
    `You are a beloved children's picture-book author writing for a child age ${age}.`,
    `Write a gentle, wholesome, age-appropriate 6-page story. NO violence, scary peril, romance, or anything a parent wouldn't want a young child to hear.`,
    `The hero is ${inp.characterName}, ${ch.desc}. The story BEGINS in ${w.name} (${w.desc}).`,
    `The story may move between these library worlds (use the exact slug): ${worldList}.`,
    `For EACH page choose the single emotion the hero feels, from EXACTLY this list: ${JSON.stringify(EMOS)}.`,
    `Shape a simple arc across the 6 pages: cozy/curious beginning, a surprise, a worry or scary moment, a low point, then it works out, and a calm ending — so the emotions vary naturally (e.g. happy, surprised, scared, sad, happy, sleepy).`,
    `Also choose one ambient "effect" per page from EXACTLY this list: ${JSON.stringify(EFFECTS)}.`,
    `Return ONLY raw JSON (no markdown), shape:`,
    `{"title": string (max 6 words), "pages": [ {"text": string (1-2 short simple sentences a ${age}-year-old can follow; refer to the hero as ${inp.characterName}), "world_slug": one of the world slugs above, "emotion": one of ${JSON.stringify(EMOS)}, "effect": one of the effect ids above } ]}`,
    `Use exactly 6 pages. Page 1 must use world_slug "${inp.worldSlug}". Keep every page kind and clear.`,
  ].join("\n");
}

function validateStory(obj, inp) {
  if (!obj || typeof obj !== "object") return null;
  const title = clampText(obj.title, 70);
  let pages = Array.isArray(obj.pages) ? obj.pages : null;
  if (!title || !pages || pages.length < 4) return null;
  pages = pages.slice(0, 6).map((p) => {
    const text = clampText(p && p.text, 240);
    const world_slug = WORLDS[p && p.world_slug] ? p.world_slug : inp.worldSlug;
    const emotion = EMO_SET.has(p && p.emotion) ? p.emotion : "happy";
    const effect = EFFECT_SET.has(p && p.effect) ? p.effect : WORLDS[world_slug].fx;
    if (!text) return null;
    return { text, world_slug, emotion, effect, effects: [effect] };
  });
  if (pages.some((p) => p === null) || pages.length < 4) return null;
  return wrap(title, pages, inp);
}

function wrap(title, pages, inp) {
  return {
    schema: 2, title, style: inp.style,
    character_slug: inp.characterSlug, character_name: inp.characterName,
    start_world: inp.worldSlug, pages,
    created_with: { style: inp.style, characterSlug: inp.characterSlug, characterName: inp.characterName, worldSlug: inp.worldSlug },
  };
}

// Hand-written safe fallback so the flow never dead-ends.
function fallbackStory(inp) {
  const ch = CHARACTERS[inp.characterSlug];
  const name = inp.characterName;
  const w0 = inp.worldSlug;
  // a second + third world that differ from the start, for a little travel
  const others = WORLD_SLUGS.filter((s) => s !== w0);
  const w1 = others[0], w2 = others[1] || others[0];
  const beats = [
    { t: `${name} woke up happy in ${WORLDS[w0].name}.`, w: w0, e: "happy" },
    { t: `Then ${name} saw something sparkle far away. What could it be?`, w: w0, e: "surprised" },
    { t: `The path led somewhere strange, and the shadows grew big.`, w: w1, e: "scared" },
    { t: `For a moment ${name} felt lost and alone.`, w: w1, e: "sad" },
    { t: `But a kind new friend showed ${name} the way, and everything was wonderful!`, w: w2, e: "happy" },
    { t: `Full of happy memories, ${name} headed home for a cozy rest.`, w: w0, e: "sleepy" },
  ];
  const pages = beats.map((b) => ({ text: b.t, world_slug: b.w, emotion: b.e, effect: WORLDS[b.w].fx, effects: [WORLDS[b.w].fx] }));
  return { ...wrap(`${name}'s Big Adventure`, pages, inp), fallback: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = await readBody(req);
  const inp = normalizeInput(body);
  const age = Math.max(3, Math.min(12, parseInt(body.age || 6, 10) || 6));

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeKey || !(await underBudget())) {
    return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(inp) });
  }
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1400, messages: [{ role: "user", content: buildPrompt(inp, age) }] }),
    });
    if (!resp.ok) return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(inp) });
    const data = await resp.json();
    let txt = (data && data.content && data.content[0] && data.content[0].text) || "";
    txt = txt.replace(/```json|```/g, "").trim();
    const first = txt.indexOf("{"), last = txt.lastIndexOf("}");
    let parsed = null;
    if (first !== -1 && last !== -1) { try { parsed = JSON.parse(txt.slice(first, last + 1)); } catch { parsed = null; } }
    const story = validateStory(parsed, inp);
    await logCost(STORY_COST_USD);
    if (!story) return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(inp) });
    return res.status(200).json({ ok: true, source: "ai", story });
  } catch {
    return res.status(200).json({ ok: true, source: "fallback", story: fallbackStory(inp) });
  }
}
