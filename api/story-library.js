// /api/story-library.js
// Curated, reusable library of WORLDS (full backgrounds) and CHARACTERS
// (transparent cutouts). Built ONCE, cached forever, reused by every story —
// so per-story art cost is ~$0. Stories are assembled by layering a character
// cutout over a world background with the living-page motion effects.
//
//   GET                              -> manifest JSON (worlds, characters, styles)
//   GET ?build=1&kind=&slug=&style=  -> generate that one asset if missing (cached)
//   GET ?img=<kind>:<slug>&style=    -> serve the cached PNG bytes (short URL)
// Env (owner, by name only): OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY.
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// The handful of storybook "looks" a kid can filter by.
const STYLES = {
  watercolor: "soft children's picture-book WATERCOLOR illustration, gentle washes, warm colors, rounded friendly shapes, hand-painted storybook",
  modern3d:   "modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded characters, vibrant, glossy",
  papercut:   "layered CUT-PAPER COLLAGE illustration (Eric Carle style), textured construction-paper shapes, bold bright colors, visible paper edges",
};
const SAFE = "no text, no words, age 4-8, wholesome, child-friendly";

// Face/expression variants. Each is generated FROM the base character cutout so
// it stays the exact same character — only the face + body language changes.
const EMOS = {
  happy:     "a big happy joyful smile and bright cheerful eyes",
  surprised: "a surprised expression: wide open eyes, a small round open mouth, eyebrows raised",
  scared:    "a scared, frightened expression: worried wide eyes, a nervous shrinking pose",
  sleepy:    "a sleepy, drowsy expression: half-closed eyes and a gentle little yawn",
  sad:       "a sad expression: a downturned mouth and big watery eyes",
  excited:   "an excited, thrilled expression: sparkling wide eyes, open happy mouth, bouncy energetic pose",
  angry:     "a grumpy, pouty expression: gently furrowed brows (cartoonish and cute, never scary)",
  curious:   "a curious, inquisitive expression: head tilted, one eyebrow up, intrigued",
  proud:     "a proud, confident expression: chin up and a satisfied little smile",
};
const EMO_LIST = Object.keys(EMOS);

const WORLDS = [
  ["snowy-village",   "Snowy Pine Village", "A cozy snowy mountain village at dusk, little wooden cabins with warm glowing windows, snow-covered pine trees, soft falling snow, gentle northern lights in the sky"],
  ["coral-reef",      "Coral Reef Kingdom", "A bright underwater coral reef kingdom, colorful coral, swaying seaweed, sun rays shining through clear blue water, a tiny treasure chest on the sandy seafloor"],
  ["enchanted-forest","Enchanted Forest",   "A magical enchanted forest clearing, ancient mossy trees, glowing mushrooms, floating fireflies, soft shafts of golden light, a winding little path"],
  ["dragon-mountain", "Dragon Mountain",    "A friendly fantasy mountain landscape with rocky peaks, a winding path up to a small castle, a warm glowing cave entrance, dramatic colorful sky"],
  ["dino-jungle",     "Dino Jungle",        "A lush prehistoric jungle, giant ferns and leafy plants, a gentle steaming volcano in the distance, a calm winding river, warm sunlight"],
  ["space-station",   "Starlight Space",    "A friendly outer-space scene, colorful planets and ringed worlds, a swirl of twinkling stars, a drifting little asteroid, deep blue space"],
  ["desert-oasis",    "Golden Desert Oasis","A golden desert at warm sunset, rolling sand dunes, a small palm-tree oasis with a clear blue pool, distant ancient stone ruins"],
  ["candy-land",      "Candy Cloud Land",   "A whimsical candy land, pastel pink and blue sky, lollipop trees, fluffy marshmallow clouds, a winding candy path over gentle frosting hills"],
];

const CHARACTERS = [
  ["bunny",   "Bramble the Bunny",  "a cute fluffy grey baby bunny wearing a cozy red scarf, big friendly eyes, standing, full body"],
  ["fox",     "Pip the Fox",        "a cute little orange fox cub with a fluffy white-tipped tail, friendly smile, standing, full body"],
  ["bear",    "Biscuit the Bear",   "a cute round brown bear cub, soft fur, friendly, standing, full body"],
  ["penguin", "Waddle the Penguin", "a cute little penguin chick with a tiny blue bowtie, friendly, full body"],
  ["dragon",  "Ember the Dragon",   "a cute friendly baby dragon, soft green with little wings, big happy eyes, standing, full body"],
  ["owl",     "Professor Owl",      "a cute small wise owl with big round glasses, fluffy feathers, friendly, full body"],
  ["turtle",  "Shelby the Turtle",  "a cute tiny turtle with a patterned green shell, smiling, full body"],
  ["hedgehog","Quill the Hedgehog", "a cute little hedgehog with soft rounded spikes, tiny nose, standing, full body"],
  ["koala",   "Coco the Koala",     "a cute grey koala with big fluffy ears, friendly, full body"],
  ["tiger",   "Tilly the Tiger",    "a cute little tiger cub with soft orange stripes, playful, standing, full body"],
  ["fawn",    "Willow the Fawn",    "a cute baby deer fawn with white spots, gentle eyes, standing, full body"],
  ["otter",   "Ollie the Otter",    "a cute river otter holding a tiny shell, whiskers, sitting up, full body"],
  ["wizard",  "Milo the Wizard",    "a cute little child wizard in a starry blue robe and pointy hat, holding a small glowing wand, friendly, full body"],
  ["fairy",   "Petal the Fairy",    "a cute little flower fairy with delicate sparkly wings and a petal dress, friendly, full body"],
  ["robot",   "Bolt the Robot",     "a cute small friendly round robot with big glowing eyes and a little antenna, full body"],
  ["mermaid", "Marina the Mermaid", "a cute little mermaid child with a shimmering teal tail and a seashell top, friendly, full body"],
];

function styleId(s) { return STYLES[s] ? s : "watercolor"; }
function findItem(kind, slug) {
  const list = kind === "world" ? WORLDS : CHARACTERS;
  return list.find((x) => x[0] === slug) || null;
}
function promptFor(kind, item, style) {
  const look = STYLES[styleId(style)];
  if (kind === "world") {
    // Full-bleed scene, NO characters in it (the cutout goes on top later).
    return `${item[2]}. Wide storybook background scene, no people, no animals, no characters. ${look}, ${SAFE}`;
  }
  // Character: clean centered cutout on plain background (we strip it transparent).
  return `${item[2]}. A single character, centered, full body, simple plain background. ${look}, ${SAFE}`;
}
function cacheKey(kind, slug, style) {
  return "lib:" + crypto.createHash("sha1").update(kind + "|" + slug + "|" + styleId(style)).digest("hex");
}
function exprKey(slug, style, emo) {
  return "libx:" + crypto.createHash("sha1").update("char|" + slug + "|" + styleId(style) + "|" + emo).digest("hex");
}
function exprPrompt(item, emo) {
  return `Keep this the EXACT same character — identical colors, outfit, shapes and art style. Change only the face and body language to show ${EMOS[emo]}. A single character, centered, full body, plain background.`;
}

async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].audio_b64 : null;
  } catch { return null; }
}
async function cachePut(key, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`, { method: "POST", headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ cache_key: key, audio_b64: b64, word_timings: null }) }); } catch {}
}
async function cacheDel(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}`, { method: "DELETE", headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }); } catch {}
}

async function genImage(prompt, transparent, openaiKey, timeoutMs = 44000) {
  const once = async (b) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(b), signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return { b64: null, status: res.status };
      const data = await res.json();
      return { b64: data.data?.[0]?.b64_json || null, status: 200 };
    } catch { clearTimeout(timer); return { b64: null, status: 0 }; }
  };
  const tx = transparent ? { background: "transparent", output_format: "png" } : {};
  for (let t = 0; t < 3; t++) {
    const r = await once({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low", ...tx });
    if (r.b64) return r.b64;
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 4000 + t * 3000));
  }
  return null;
}

async function genExpression(baseB64, prompt, openaiKey, timeoutMs = 44000) {
  const attempt = async (useFidelity) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const fd = new FormData();
      fd.append("model", "gpt-image-1");
      fd.append("prompt", prompt);
      fd.append("size", "1024x1024");
      fd.append("quality", "low");
      fd.append("background", "transparent");
      fd.append("output_format", "png");
      if (useFidelity) fd.append("input_fidelity", "high");
      fd.append("image", new Blob([Buffer.from(baseB64, "base64")], { type: "image/png" }), "base.png");
      const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: fd, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) { const data = await res.json(); return { b64: data.data?.[0]?.b64_json || null, status: 200 }; }
      return { b64: null, status: res.status };
    } catch { clearTimeout(timer); return { b64: null, status: 0 }; }
  };
  // Try with input_fidelity (best identity match); fall back without it; retry once on 429.
  for (let t = 0; t < 3; t++) {
    let r = await attempt(true);
    if (!r.b64 && r.status === 400) r = await attempt(false);
    if (r.b64) return r.b64;
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 4000 + t * 3000));
  }
  return null;
}

// ---- SCENE prototype: redraw the base character INTO a full integrated scene ----
// Uses image-edit with the cutout as a reference (input_fidelity high) so the
// character stays on-model but is placed in the world, doing something, from a
// chosen angle — a real picture-book page instead of a pasted sticker.
const SCENE_LOOK = {
  watercolor: "soft children's picture-book watercolor illustration, gentle washes, warm light",
  modern3d:   "modern 3D animated-movie style, soft cinematic lighting",
  papercut:   "layered cut-paper collage illustration, bold bright colors",
};
const SHOTS = {
  establish: "Wide establishing shot of a magical ENCHANTED FOREST: glowing mushrooms, floating fireflies, tall ancient trees, a winding mossy path, soft golden light. Place THIS character skipping happily along the path, small within the big scene, clearly part of the world (not in front of it).",
  peek:      "Inside a magical ENCHANTED FOREST. THIS character peeks out shyly from BEHIND a giant glowing mushroom, only half of its body visible at the edge of the frame, curious eyes looking toward a soft light. Playful close composition with depth.",
  doorway:   "Seen from BEHIND, over the character's shoulder: THIS character stands small at the bottom of the frame before a tall shimmering doorway of light between two huge ancient trees in an enchanted forest, fireflies drifting, dramatic depth and scale.",
  companion: "A cozy clearing in a magical ENCHANTED FOREST. THIS character sits on the left meeting a friendly wise OWL perched on a mossy log on the right, glowing mushrooms and fireflies around them, warm light. Both clearly together in the same scene, interacting.",
  river:     "A magical ENCHANTED FOREST with a clear glowing STREAM running across the whole FOREGROUND over smooth pebbles, gentle reflections and ripples on the water, a little wooden bridge, fireflies and tall trees behind. THIS character stands on the near bank looking down at the water. Lots of water visible in the lower half of the frame.",
  underwater:"Deep in a colorful CORAL REEF KINGDOM, fully UNDERWATER: bright corals, swaying seaweed, soft sun-ray caustics shining down through blue-green water, a few little fish, bubbles rising. THIS character swims happily among the coral, clearly underwater.",
  candle:    "Inside a cozy wooden cabin at night: THIS character sits on a soft rug in the middle, a warm crackling stone FIREPLACE glowing on the RIGHT, and a single lit CANDLE in a brass holder glowing on a small wooden table on the LEFT, a frosty window behind. Snug golden interior light, magical and calm.",
  cozy:      "Night in a magical ENCHANTED FOREST. THIS character curls up sleepily at the base of a giant tree, nestled in soft moss, wrapped in a warm glow, fireflies like little lanterns, peaceful bedtime mood, cool blue night tones.",
};
function scenePrompt(shot, style) {
  return (SHOTS[shot] || SHOTS.establish) + " " + (SCENE_LOOK[styleId(style)] || SCENE_LOOK.watercolor) +
    ". Keep this the EXACT same character — same species, colors, and markings — but naturally integrated into the scene with believable lighting and shadow. A full rectangular scene illustration with foreground, midground and background. No text, age 4-8, wholesome.";
}
function sceneKey(slug, style, shot) {
  return "libsc:" + crypto.createHash("sha1").update(slug + "|" + styleId(style) + "|" + shot).digest("hex");
}
async function genScene(baseB64, prompt, openaiKey, timeoutMs = 44000) {
  const attempt = async (useFidelity) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const fd = new FormData();
      fd.append("model", "gpt-image-1");
      fd.append("prompt", prompt);
      fd.append("size", "1536x1024");        // landscape page
      fd.append("quality", "low");
      if (useFidelity) fd.append("input_fidelity", "high");
      fd.append("image", new Blob([Buffer.from(baseB64, "base64")], { type: "image/png" }), "base.png");
      const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: fd, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) { const data = await res.json(); return { b64: data.data?.[0]?.b64_json || null, status: 200 }; }
      return { b64: null, status: res.status };
    } catch { clearTimeout(timer); return { b64: null, status: 0 }; }
  };
  for (let t = 0; t < 3; t++) {
    let r = await attempt(true);
    if (!r.b64 && r.status === 400) r = await attempt(false);
    if (r.b64) return r.b64;
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 4000 + t * 3000));
  }
  return null;
}

export default async function handler(req, res) {
  const q = req.query || {};

  // --- serve a cached image as real PNG bytes (short URL for <img src>) ---
  if (q.img) {
    const [kind, slug] = q.img.toString().split(":");
    const style = styleId(q.style);
    const emo = (q.emo || "").toString();
    const key = (kind === "character" && emo && emo !== "base" && EMOS[emo]) ? exprKey(slug, style, emo) : cacheKey(kind, slug, style);
    const b64 = await cacheGet(key);
    if (!b64) { res.status(404).json({ ok: false, missing: true }); return; }
    const buf = Buffer.from(b64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(buf);
    return;
  }

  // --- serve a generated SCENE page (prototype) ---
  if (q.simg) {
    const b64 = await cacheGet(sceneKey((q.slug||"").toString(), q.style, (q.shot||"").toString()));
    if (!b64) { res.status(404).json({ ok: false, missing: true }); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(b64, "base64"));
    return;
  }

  // --- build one generated SCENE page (prototype) ---
  if (q.scene) {
    const slug = (q.slug || "").toString();
    const style = styleId(q.style);
    const shot = (q.shot || "establish").toString();
    if (!findItem("character", slug) || !SHOTS[shot]) return res.status(400).json({ ok: false, error: "bad slug or shot" });
    const k = sceneKey(slug, style, shot);
    const force = !!q.force;
    if (!force && await cacheGet(k)) return res.status(200).json({ ok: true, slug, shot, cached: true });
    const base = await cacheGet(cacheKey("character", slug, style));
    if (!base) return res.status(200).json({ ok: true, needBase: true });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(200).json({ ok: true, noKey: true });
    const b64 = await genScene(base, scenePrompt(shot, style), openaiKey);
    if (!b64) return res.status(200).json({ ok: true, slug, shot, failed: true });
    if (force) await cacheDel(k);
    await cachePut(k, b64);
    return res.status(200).json({ ok: true, slug, shot, generated: true });
  }

  // --- build one asset (idempotent; cached) ---
  if (q.build) {
    const kind = (q.kind || "").toString();
    const slug = (q.slug || "").toString();
    const style = styleId(q.style);
    const item = findItem(kind, slug);
    if (!item) return res.status(400).json({ ok: false, error: "unknown asset" });
    const key = cacheKey(kind, slug, style);
    const force = !!q.force;
    if (!force) { const have = await cacheGet(key); if (have) return res.status(200).json({ ok: true, kind, slug, style, cached: true }); }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(200).json({ ok: true, noKey: true });
    const b64 = await genImage(promptFor(kind, item, style), kind === "character", openaiKey);
    if (!b64) return res.status(200).json({ ok: true, kind, slug, style, failed: true });
    if (force) await cacheDel(key);
    await cachePut(key, b64);
    return res.status(200).json({ ok: true, kind, slug, style, generated: true });
  }

  // --- build one EXPRESSION (edited from the base character cutout) ---
  if (q.expr) {
    const slug = (q.slug || "").toString();
    const style = styleId(q.style);
    const emo = (q.emo || "").toString();
    const item = findItem("character", slug);
    if (!item || !EMOS[emo]) return res.status(400).json({ ok: false, error: "bad slug or emo" });
    const ekey = exprKey(slug, style, emo);
    const force = !!q.force;
    if (!force && await cacheGet(ekey)) return res.status(200).json({ ok: true, slug, style, emo, cached: true });
    const base = await cacheGet(cacheKey("character", slug, style));
    if (!base) return res.status(200).json({ ok: true, slug, style, emo, needBase: true });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(200).json({ ok: true, noKey: true });
    const b64 = await genExpression(base, exprPrompt(item, emo), openaiKey);
    if (!b64) return res.status(200).json({ ok: true, slug, style, emo, failed: true });
    if (force) await cacheDel(ekey);
    await cachePut(ekey, b64);
    return res.status(200).json({ ok: true, slug, style, emo, generated: true });
  }

  // --- manifest ---
  return res.status(200).json({
    ok: true,
    styles: Object.keys(STYLES),
    expressions: EMO_LIST,
    worlds: WORLDS.map(([slug, name]) => ({ slug, name })),
    characters: CHARACTERS.map(([slug, name]) => ({ slug, name })),
    imgUrl: "/api/story-library?img=<kind>:<slug>&style=<style>",
  });
}
