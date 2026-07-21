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

import crypto from "crypto";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const STORY_COST_USD = parseFloat(process.env.STORY_COST_USD || "0.02");
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Must stay in sync with src/lib/storyEffects.jsx STORY_EFFECTS and api/story-library.js.
const EFFECTS = [
  "fireplace_flicker", "snow_outside_window", "twinkling_stars", "candle_glow",
  "gentle_rain", "drifting_clouds", "magic_sparkles", "character_blink",
  "soft_glow", "floating_dust", "sun_pulse",
  "shooting_stars", "falling_petals",
];
const EFFECT_SET = new Set(EFFECTS);

// The library worlds (slugs MUST match api/story-library.js).
const WORLDS = {
  "snowy-village":    { name: "Snowy Pine Village", desc: "a cozy snowy mountain village with little cabins and falling snow", fx: "snow_outside_window" },
  "coral-reef":       { name: "Coral Reef Kingdom", desc: "a bright underwater coral reef kingdom", fx: "bubbles" },
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
  unicorn: { name: "Sparkle the Unicorn", desc: "a little rainbow unicorn with a pastel rainbow mane and a golden horn" },
  builder: { name: "Bo the Builder", desc: "a cheerful kid builder in a yellow hard hat and tool-belt overalls" },
};

const EMOS = ["happy", "surprised", "scared", "sad", "sleepy"];
const EMO_SET = new Set(EMOS);

// Optional flavor the kid picks (all have safe defaults).
const QUESTS = {
  lost_friend:     "find a lost friend",
  hidden_treasure: "search for a hidden treasure",
  missing_star:    "find a star that has gone missing",
  magic_door:      "open a magical door that won't budge",
  help_creature:   "help a small creature who needs a hand",
  big_storm:       "get everyone safely through a big (cozy, never scary) storm",
};
const MOODS = {
  cozy: "cozy and warm", silly: "silly and giggly", brave: "brave and adventurous",
  magical: "dreamy and magical", spooky: "a tiny bit spooky but always safe and friendly",
};
const ENDINGS = {
  happy: "a happy ending", surprise: "a delightful surprise ending",
  friendship: "an ending all about friendship", sleepy: "a calm, sleepy bedtime ending",
};
// Quietly woven in — never named to the child.
const LESSONS = [
  "being kind to others", "sharing", "being brave even when you feel scared",
  "never giving up and trying again", "telling the truth", "being grateful",
  "working together as a team", "taking slow deep breaths to feel calm",
];
const BLOCKED = ["kill","blood","gun","knife","sexy","naked","drug","hate","die","dead","stupid","weapon"];
function sparkSafe(t){ const low=String(t||"").toLowerCase(); return !BLOCKED.some(w=>low.includes(w)); }

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } }); });
}
function clampText(t, max) { return String(t || "").replace(/\s+/g, " ").trim().slice(0, max); }
// Like clampText but NEVER cuts mid-word: trim back to the last full sentence that
// fits (a "." "!" "?"), or if there's no sentence break, to the last whole word.
function trimToSentence(t, max) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentEnd = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (sentEnd >= max * 0.5) return cut.slice(0, sentEnd + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

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

function pickCompanion(heroSlug){ const ks=Object.keys(CHARACTERS).filter((k)=>k!==heroSlug); return ks[Math.floor(Math.random()*ks.length)] || heroSlug; }
function normalizeInput(body) {
  const style = ["watercolor", "modern3d", "papercut", "modern"].includes(body.style) ? body.style : "watercolor";
  const characterSlug = CHARACTERS[body.characterSlug] ? body.characterSlug : "bunny";
  const worldSlug = WORLDS[body.worldSlug] ? body.worldSlug : "enchanted-forest";
  const characterName = clampText(body.characterName, 28) || CHARACTERS[characterSlug].name;
  const quest = QUESTS[body.quest] ? body.quest : "";
  const mood = MOODS[body.mood] ? body.mood : "";
  const ending = ENDINGS[body.ending] ? body.ending : "";
  let spark = clampText(body.spark, 140); if (!sparkSafe(spark)) spark = "";
  const favColor = clampText(body.favColor, 24);
  const favFood = clampText(body.favFood, 24);
  const petName = clampText(body.petName, 24);
  const lesson = LESSONS[Math.floor(Math.random() * LESSONS.length)];
  const companionSlug = (CHARACTERS[body.companionSlug] && body.companionSlug !== characterSlug) ? body.companionSlug : pickCompanion(characterSlug);
  const companionName = ((CHARACTERS[companionSlug] && CHARACTERS[companionSlug].name) || "a friend").split(" ")[0];

  // ---- Sequel / "What happens next?" continuation ----
  // When a sequel is requested we carry the previous chapter forward: the same
  // hero + friend + world + style, a short recap so the writer CONTINUES instead
  // of repeating, and series bookkeeping (series_id + chapter number) so My
  // stories can group them and show a "Chapter 2" ribbon.
  const chapter = Math.max(1, Math.min(20, parseInt(body.chapter || 1, 10) || 1));
  const priorTitle = clampText(body.priorTitle, 70);
  const priorPages = Array.isArray(body.priorPages)
    ? body.priorPages.map((t) => clampText(t, 320)).filter(Boolean).slice(-6)
    : [];
  const isSequel = chapter > 1 && priorPages.length > 0;
  // A stable id for the whole series. Reuse the one passed in; otherwise mint one
  // so this chapter (and any later chapters made from it) share the same id.
  const seriesId = clampText(body.seriesId, 60) ||
    (isSequel ? "series_" + crypto.createHash("sha1").update((priorTitle || characterName) + "|" + characterSlug).digest("hex").slice(0, 12) : null);

  return { style, characterSlug, worldSlug, characterName, quest, mood, ending, spark, favColor, favFood, petName, lesson, companionSlug, companionName, chapter, priorTitle, priorPages, isSequel, seriesId };
}

function buildPrompt(inp, age) {
  const ch = CHARACTERS[inp.characterSlug];
  const w = WORLDS[inp.worldSlug];
  const worldList = WORLD_SLUGS.map((s) => `"${s}" (${WORLDS[s].desc})`).join(", ");
  return [
    `You are a beloved children's picture-book author writing for a child age ${age}.`,
    `Write a gentle, wholesome, age-appropriate 6-page story. NO violence, scary peril, romance, or anything a parent wouldn't want a young child to hear.`,
    inp.isSequel ? `THIS IS CHAPTER ${inp.chapter} of an ongoing series${inp.priorTitle ? ` that began with "${inp.priorTitle}"` : ""}. Here is what happened in the previous chapter (a short recap): ${inp.priorPages.join(" ")}` : ``,
    inp.isSequel ? `CONTINUE the SAME adventure with the SAME hero and friend — pick up where it left off. Do NOT retell or repeat the earlier events. Bring a fresh little problem or discovery for this chapter and resolve it warmly by the end. Give this chapter its own new short title (never "Part 2" or "Chapter 2" — a real title).` : ``,
    `The hero is ${inp.characterName}, ${ch.desc}. The story BEGINS in ${w.name} (${w.desc}).`,
    `${inp.characterName} has a best friend named ${inp.companionName} (${(CHARACTERS[inp.companionSlug]||{}).desc||"a friendly companion"}) who shares the whole adventure. Mention ${inp.companionName} BY NAME on at least 3 of the pages, doing things together with ${inp.characterName} — never leave the friend behind.`,
    `The story may move between these library worlds (use the exact slug): ${worldList}.`,
    `For EACH page choose the single emotion the hero feels, from EXACTLY this list: ${JSON.stringify(EMOS)}.`,
    inp.quest ? `The adventure: ${inp.characterName} must ${QUESTS[inp.quest]}.` : ``,
    inp.mood ? `Overall feeling: ${MOODS[inp.mood]}.` : ``,
    inp.ending ? `End with ${ENDINGS[inp.ending]}.` : ``,
    inp.spark ? `Gently build the story around this idea from the child (if wholesome): "${inp.spark}".` : ``,
    (inp.favColor || inp.favFood || inp.petName) ? `Where it fits NATURALLY (don't force it), sprinkle in the child's favorites: ${[inp.favColor && ("favorite color " + inp.favColor), inp.favFood && ("favorite food " + inp.favFood), inp.petName && ("a pet named " + inp.petName)].filter(Boolean).join(", ")}.` : ``,
    `Quietly teach a gentle lesson about ${inp.lesson} through what the characters DO — never state the lesson outright, never be preachy; it should just be felt.`,
    `Shape a simple arc across the 6 pages: cozy/curious beginning, a surprise, a worry or scary moment, a low point, then it works out, and a calm ending — so the emotions vary naturally (e.g. happy, surprised, scared, sad, happy, sleepy).`,
    `Also choose one ambient "effect" per page from EXACTLY this list: ${JSON.stringify(EFFECTS)}.`,
    `Make the pages LIVELY: on most pages have ${inp.characterName} and ${inp.companionName} actually TALK to each other in quotation marks, and make clear who is speaking, like: ${inp.characterName} said, "..." and ${inp.companionName} replied, "...". Keep lines short, simple and kind.`,
    `Also return "sfx": an array of 0-2 sound cues that fit the page, chosen ONLY from this list: ["door","knock","thunder","firewhoosh","splash","magic","pop","whoosh","footsteps","bell","rustle","sparkle"]. Use them only where they clearly fit (a door opening, a storm, a campfire, a splash, a bit of magic). Leave empty if none fit.`,
    `Return ONLY raw JSON (no markdown), shape:`,
    `{"title": string (max 6 words), "pages": [ {"text": string (the page as a flowing paragraph for on-screen reading; refer to the hero as ${inp.characterName}), "sfx": ["..."], "world_slug": one of the world slugs above, "emotion": one of ${JSON.stringify(EMOS)}, "effect": one of the effect ids above } ]}`,
    `Use exactly 6 pages. Page 1 must use world_slug "${inp.worldSlug}". Keep every page kind and clear.`,
  ].filter(Boolean).join("\n");
}

function validateStory(obj, inp) {
  if (!obj || typeof obj !== "object") return null;
  const title = clampText(obj.title, 70);
  let pages = Array.isArray(obj.pages) ? obj.pages : null;
  if (!title || !pages || pages.length < 4) return null;
  const WHO = new Set(["narrator", "hero", "friend", "other"]);
  const SFX_OK = new Set(["door","knock","thunder","firewhoosh","splash","magic","pop","whoosh","footsteps","bell","rustle","sparkle"]);
  pages = pages.slice(0, 6).map((p) => {
    const world_slug = WORLDS[p && p.world_slug] ? p.world_slug : inp.worldSlug;
    const emotion = EMO_SET.has(p && p.emotion) ? p.emotion : "happy";
    const effect = EFFECT_SET.has(p && p.effect) ? p.effect : WORLDS[world_slug].fx;
    const sfx = Array.isArray(p && p.sfx) ? p.sfx.filter((x) => SFX_OK.has(x)).slice(0, 2) : [];
    const text = trimToSentence(p && p.text, 320);
    if (!text) return null;
    return { text, world_slug, emotion, effect, effects: [effect], sfx };
  });
  if (pages.some((p) => p === null) || pages.length < 4) return null;
  return wrap(title, pages, inp);
}

function wrap(title, pages, inp) {
  const scene_token = "st" + crypto.createHash("sha1").update((inp.characterSlug||"")+"|"+(inp.companionSlug||"")+"|"+(inp.style||"")+"|"+pages.map((p)=>p.text).join("\u00a7")).digest("hex").slice(0,16);
  return {
    schema: 2, title, style: inp.style, scene_token,
    character_slug: inp.characterSlug, character_name: inp.characterName,
    companion_slug: inp.companionSlug, companion_name: inp.companionName,
    start_world: inp.worldSlug, pages,
    // Series bookkeeping so "What happens next?" chapters can be grouped and the
    // cover can show a "Chapter N" ribbon. chapter 1 (a normal story) has no series_id.
    series_id: inp.seriesId || null,
    chapter: inp.chapter || 1,
    created_with: { style: inp.style, characterSlug: inp.characterSlug, characterName: inp.characterName, companionSlug: inp.companionSlug, worldSlug: inp.worldSlug, quest: inp.quest, mood: inp.mood, ending: inp.ending, spark: inp.spark, favColor: inp.favColor, favFood: inp.favFood, petName: inp.petName },
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
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 38000);
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 3200, messages: [{ role: "user", content: buildPrompt(inp, age) }] }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
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
