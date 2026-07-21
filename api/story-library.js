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
  modern:     "clean MODERN flat children's-book illustration, bold simple shapes, smooth flat colors with subtle gradients, minimal contemporary vector look, friendly and crisp",
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
  ["city-town",       "Sunny City",         "A cheerful friendly cartoon city, colorful low-rise buildings with bright awnings, a clean sunny street with little trees and lampposts, soft fluffy clouds, warm and welcoming"],
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
  ["unicorn", "Sparkle the Unicorn", "a cute little rainbow unicorn with a soft pastel rainbow mane and tail and a tiny golden horn, friendly, full body"],
  ["builder", "Bo the Builder", "a cheerful little kid builder wearing a yellow hard hat and blue tool-belt overalls, friendly, full body"],
  // --- Croc Tot game cast (added for croc-engine.html) ---
  ["croctot",          "Croc Tot",          "a cute happy little green crocodile-shaped tater tot character with tiny arms, big friendly eyes, a little snout, standing, full body"],
  ["homework-monster", "Homework Monster",  "a big goofy floating monster made of a messy stack of homework papers and a pencil, with a grumpy but silly cartoon face, friendly-funny not scary, full body"],
  ["evil-pot",         "The Evil Pot",      "a big silly cartoon cooking pot character with grumpy eyebrows and little arms holding a wooden ladle, friendly-funny not scary, full body"],
  ["captain-spud",     "Captain Spud",      "a goofy cartoon pirate potato captain with an eyepatch and a tiny pirate hat, friendly, full body"],
  ["mosquito-max",     "Mosquito Maximus",  "a big silly cartoon mosquito with a long goofy nose and friendly googly eyes, friendly-funny not scary, full body"],
  ["jelly-dragon",     "Jelly Dragon",      "a big friendly round wobbly purple jelly dragon with tiny wings and a happy smile, full body"],

  // ---- Space Sparkles (survival) — bespoke space-critter enemies ----
  ["star-slime", "Star Slime", "a cute round wobbly glowing green space slime alien with two big friendly eyes and tiny antennae, soft and squishy, full body"],
  ["comet-bug",  "Comet Bug",  "a cute little blue space bug alien with big friendly eyes, tiny wings and a glowing sparkly tail, full body"],
  ["puff-blob",  "Puff Blob",  "a cute fluffy round pink space gas-blob creature with big sparkly eyes and a tiny smile, full body"],
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
  modern:     "clean modern flat illustration, bold simple shapes, smooth flat colors, contemporary",
};
const SHOTS = {
  establish: "Wide establishing shot of a magical ENCHANTED FOREST: glowing mushrooms, floating fireflies, tall ancient trees, a winding mossy path, soft golden light. Place THIS character skipping happily along the path, small within the big scene, clearly part of the world (not in front of it).",
  peek:      "Inside a magical ENCHANTED FOREST. THIS character peeks out shyly from BEHIND a giant glowing mushroom, only half of its body visible at the edge of the frame, curious eyes looking toward a soft light. Playful close composition with depth.",
  doorway:   "Seen from BEHIND, over the character's shoulder: THIS character stands small at the bottom of the frame before a tall shimmering doorway of light between two huge ancient trees in an enchanted forest, fireflies drifting, dramatic depth and scale.",
  companion: "A cozy clearing in a magical ENCHANTED FOREST. THIS character sits on the left meeting a friendly wise OWL perched on a mossy log on the right, glowing mushrooms and fireflies around them, warm light. Both clearly together in the same scene, interacting.",
  river:     "A magical ENCHANTED FOREST. THIS character stands on the grassy LEFT BANK in the UPPER-MIDDLE of the frame, ABOVE the water (never standing in the water). A calm clear shallow STREAM flows in a clean HORIZONTAL BAND across the entire BOTTOM THIRD of the picture, gentle reflections, a few pebbles at the edge. Tall trees and fireflies behind.",
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
async function genScene(refs, prompt, openaiKey, timeoutMs = 44000) {
  const arr = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
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
      const field = arr.length > 1 ? "image[]" : "image";
      arr.forEach((b, i) => fd.append(field, new Blob([Buffer.from(b, "base64")], { type: "image/png" }), (i === 0 ? "base" : "friend" + i) + ".png"));
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

// ---- ART-DIRECTION SAMPLES (prototype for the story-art relaunch) ----
// Three complete storybook pages in three different looks, painted for real by
// the same image model that paints story pages. Used by the direction mock so
// the owner judges actual output, not hand-drawn stand-ins. Additive only.
const DIRECTIONS = {
  dusk:  "Cinematic children's storybook illustration at dramatic dusk. A small cloaked child holding a glowing lantern stands on a dark grassy cliff at the left edge, seen from behind, looking across a calm darkening sea toward a tall old lighthouse on a rocky point at the far right, its lamp unlit. Deep indigo sky fading to burnt orange at the horizon, the first stars, a huge low moon. Painterly and atmospheric like a still from a prestige animated film, rich shadow, warm rim light from the lantern, high detail. Clear foreground cliff, midground sea, background sky. Wide landscape composition. No text, no words. Wholesome, ages 6-10.",
  paper: "Bold cut-paper collage illustration, wide panorama. A tiny girl in an orange coat and her small dark dog walk a winding cream footpath from the lower left, across huge rolling layered green paper hills, past a light-blue paper river carrying a little folded paper boat in the middle distance, toward an enormous ink-blue castle with warm mustard windows and one golden, slightly open door at the far right. Flat layered construction-paper shapes with visible paper texture and torn edges, limited palette of cream, teal green, burnt orange, mustard and ink blue, strong graphic composition, dramatic scale contrast between the tiny hero and the giant castle. No text, no words. Wholesome, ages 6-10.",
  deep:  "Luminous deep-ocean illustration, near dark and mysterious. In the left third a drifting meadow of softly glowing teal jellyfish. In the center a small round vintage exploration submarine with three lit portholes and one warm headlight beam. In the right third a rocky trench wall with a small glowing golden door carved into it near the sea floor. Bioluminescent particles floating everywhere, faint blue light rays from far above, deep blue-black water, painterly detail, beautiful and calm rather than scary. Wide landscape composition. No text, no words. Wholesome, ages 6-10.",
};
async function genArt(prompt, openaiKey, timeoutMs = 44000) {
  // Landscape page painting (same model + quality as production story pages).
  // Falls back landscape -> square (like api/images.js) and reports the last
  // upstream status so failures are diagnosable instead of silent.
  let lastStatus = null, lastMsg = "";
  const once = async (body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        let msg = "";
        try { const e = await res.json(); msg = (e && e.error && e.error.message) || ""; } catch {}
        return { b64: null, status: res.status, msg: String(msg).slice(0, 220) };
      }
      const data = await res.json();
      return { b64: data.data?.[0]?.b64_json || null, status: 200 };
    } catch { clearTimeout(timer); return { b64: null, status: 0 }; }
  };
  const attempt = async (body) => {
    for (let t = 0; t < 3; t++) {
      const r = await once(body);
      lastStatus = r.status;
      if (r.msg) lastMsg = r.msg;
      if (r.b64) return r.b64;
      if (r.status !== 429) break;
      await new Promise((res) => setTimeout(res, 4000 + t * 3000));
    }
    return null;
  };
  const b64 =
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1536x1024", quality: "low" })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low" })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" }));
  return { b64, status: lastStatus, msg: lastMsg };
}
function dirKey(k){ return "libdir:" + k + ":v1"; }

function readBody(req){if(req.body&&typeof req.body==="object")return Promise.resolve(req.body);return new Promise((resolve)=>{let raw="";req.on("data",c=>raw+=c);req.on("end",()=>{try{resolve(JSON.parse(raw||"{}"));}catch{resolve({});}});});}
const CAM=[
  "Wide establishing shot, the hero small within a big scene.",
  "The hero placed to one side of the frame, foreground elements adding depth.",
  "A closer, cozy view of the hero in the moment.",
  "A low angle looking up, wondrous and dramatic.",
  "Seen from behind, over the hero's shoulder, looking into the scene.",
  "A warm medium shot focused on the hero and the key thing happening.",
];
function worldDesc(slug){const w=WORLDS.find(x=>x[0]===slug);return w?w[2]:"";}
function shotFor(i,emo){
  if(i===0) return "Wide cinematic establishing shot that sets the scene, the hero small within a big beautiful world.";
  if(emo==="scared") return "A dramatic low angle looking up, suspenseful but still gentle, the hero small in the frame.";
  if(emo==="sad") return "A tender, quiet close-up of the hero in the moment.";
  if(emo==="surprised"||emo==="excited") return "A dynamic shot capturing the big exciting moment, the hero reacting with energy.";
  if(emo==="sleepy") return "A cozy, warm close view with a calm bedtime mood.";
  return CAM[i%CAM.length];
}
function pageScenePrompt(action,world,style,i,emo,compName){
  const feel = emo && emo!=="happy" ? ` The hero clearly feels ${emo}, shown gently in their face and body language.` : "";
  const glowy = /candle|lantern|lamp|fire|flame|ember|hearth|fireplace|glow|glowing|firefl|star|starlight|moon|window|magic|spark|torch|\blit\b|light/i.test(action);
  const glowLine = glowy ? ` Paint any candles, lanterns, fireplaces, glowing windows, fireflies, stars or magic as bright WARM GLOWING light sources with a soft luminous halo, clearly casting warm light into the scene.` : "";
  const hasCompany = /friend|friends|owl|fox|bird|fish|dragon|fairy|bear|bunny|rabbit|together|\bmet\b|meets|join|companion|buddy|family|mother|father|\bmom\b|\bdad\b|sister|brother|\bthey\b|\bthem\b|creature|animal|someone|village|crew|crowd|everyone/i.test(action);
  const compLine = (hasCompany && !compName) ? ` Show the friends or creatures from this moment too, interacting warmly with the hero so the page feels alive — the hero is not alone.` : "";
  const compLine2 = compName ? ` The hero's best friend ${compName} (the SECOND reference image) is also in this scene — keep ${compName} EXACTLY on-model: same species, colors and markings as that reference, the same size relation, interacting warmly with the hero.` : "";
  return `Children's picture-book illustration depicting THIS exact moment: "${action}".${feel}${glowLine}${compLine}${compLine2} ${shotFor(i,emo)} Setting: ${worldDesc(world)}. ${SCENE_LOOK[styleId(style)]||SCENE_LOOK.watercolor}. The hero is THIS exact character from the reference image — keep its species, colors and markings identical, integrated naturally into the scene with believable light and shadow, NOT pasted on top. A full rectangular scene with clear foreground, midground and background. No text or words. Age 4-8, wholesome.`;
}
function pageSceneKey(ck){return "libpg:"+crypto.createHash("sha1").update(ck).digest("hex");}

export default async function handler(req, res) {
  // --- PRODUCTION page scene: edit the hero (by emotion) INTO this page's moment ---
  if (req.method === "POST") {
    const body = await readBody(req);
    if (!body.pageScene) return res.status(400).json({ ok:false, error:"unknown POST" });
    const slug=(body.slug||"").toString(), style=styleId(body.style), emo=(body.emo||"").toString();
    const companion=(body.companion||"").toString();
    const world=(body.world||"").toString(), action=(body.action||"").toString().slice(0,400);
    const i=parseInt(body.pageIndex||0,10)||0, ck=(body.cacheKey||"").toString();
    if(!findItem("character",slug)||!action||!ck) return res.status(400).json({ ok:false, error:"bad input" });
    const k=pageSceneKey(ck);
    if(!body.force && await cacheGet(k)) return res.status(200).json({ ok:true, cached:true });
    const openaiKey=process.env.OPENAI_API_KEY;
    if(!openaiKey) return res.status(200).json({ ok:true, noKey:true });
    // Resolve a character reference for THIS style; lazily make the style's base
    // cutout if it doesn't exist yet (so new styles work without pre-generation).
    let ref = EMOS[emo] ? await cacheGet(exprKey(slug,style,emo)) : null;
    if(!ref) ref = await cacheGet(cacheKey("character",slug,style));
    if(!ref){
      const item = findItem("character", slug);
      if(item){
        const bp = item[2] + ". A single character, centered, full body, simple plain background. " + (STYLES[styleId(style)]||STYLES.watercolor) + ", " + SAFE;
        const nb = await genImage(bp, true, openaiKey);
        if(nb){ await cachePut(cacheKey("character",slug,styleId(style)), nb); ref = nb; }
      }
    }
    if(!ref) ref = EMOS[emo] ? await cacheGet(exprKey(slug,"watercolor",emo)) : await cacheGet(cacheKey("character",slug,"watercolor"));
    if(!ref) return res.status(200).json({ ok:true, needBase:true });
    // RECURRING SIDEKICK: if this page mentions the friend, add a 2nd on-model reference
    let companionRef=null, compName="";
    if(companion && companion!==slug && findItem("character",companion)){
      const ci=findItem("character",companion); const nm=(ci[1]||"").split(" ")[0];
      const onPage = (nm && action.indexOf(nm)>=0) || /friend|friends|together|\bthey\b|\bthem\b|\bmet\b|join|companion|buddy|everyone|each other/i.test(action);
      if(onPage){
        companionRef = (EMOS["happy"] ? await cacheGet(exprKey(companion,style,"happy")) : null) || await cacheGet(cacheKey("character",companion,style));
        if(!companionRef){
          const cbp = ci[2] + ". A single character, centered, full body, simple plain background. " + (STYLES[styleId(style)]||STYLES.watercolor) + ", " + SAFE;
          const cnb = await genImage(cbp, true, openaiKey);
          if(cnb){ await cachePut(cacheKey("character",companion,styleId(style)), cnb); companionRef=cnb; }
        }
        if(!companionRef) companionRef = await cacheGet(cacheKey("character",companion,"watercolor"));
        if(companionRef) compName = nm;
      }
    }
    const refs = companionRef ? [ref, companionRef] : [ref];
    const b64=await genScene(refs, pageScenePrompt(action,world,style,i,emo,compName), openaiKey);
    if(!b64) return res.status(200).json({ ok:true, failed:true });
    if(body.force) await cacheDel(k);
    await cachePut(k,b64);
    return res.status(200).json({ ok:true, generated:true });
  }
  const q = req.query || {};

  // --- build one ART-DIRECTION sample page (idempotent; cached) ---
  if (q.dirSample) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const key = (q.dirSample || "").toString();
    if (!DIRECTIONS[key]) return res.status(400).json({ ok: false, error: "unknown direction" });
    const ck = dirKey(key);
    if (!q.force && await cacheGet(ck)) return res.status(200).json({ ok: true, key, cached: true });
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(200).json({ ok: true, noKey: true });
    const r = await genArt(DIRECTIONS[key], openaiKey);
    if (!r.b64) return res.status(200).json({ ok: true, key, failed: true, upstream: r.status, why: r.msg || "" });
    if (q.force) await cacheDel(ck);
    await cachePut(ck, r.b64);
    return res.status(200).json({ ok: true, key, generated: true });
  }

  // --- serve an ART-DIRECTION sample page as PNG ---
  if (q.dimg) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const b64 = await cacheGet(dirKey((q.dimg || "").toString()));
    if (!b64) { res.status(404).json({ ok: false, missing: true }); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=604800");
    res.status(200).send(Buffer.from(b64, "base64"));
    return;
  }

  // --- read-only diagnostic: how many story pictures are actually cached? ---
  // Returns COUNTS only (no image data, no secrets). lib: = base cutouts/worlds,
  // libx: = expression variants, libpg: = full page scenes.
  if (q.stats) {
    async function countLike(prefix) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/narration_cache?select=cache_key&cache_key=like.${encodeURIComponent(prefix + "%")}`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: "count=exact", Range: "0-0" } }
        );
        const cr = r.headers.get("content-range") || "";
        const total = cr.includes("/") ? parseInt(cr.split("/")[1], 10) : NaN;
        return Number.isFinite(total) ? total : 0;
      } catch { return 0; }
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ ok: true, configured: false });
    const [base, expr, scenes] = await Promise.all([countLike("lib:"), countLike("libx:"), countLike("libpg:")]);
    return res.status(200).json({ ok: true, storyCache: { base, expr, scenes, total: base + expr + scenes } });
  }


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
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=604800");
    res.status(200).send(buf);
    return;
  }

  // --- serve a generated PAGE SCENE (production) ---
  if (q.pimg) {
    const b64=await cacheGet(pageSceneKey((q.k||"").toString()));
    if(!b64){ res.status(404).json({ ok:false, missing:true }); return; }
    res.setHeader("Content-Type","image/png"); res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Cache-Control","public, max-age=3600, stale-while-revalidate=604800");
    res.status(200).send(Buffer.from(b64,"base64")); return;
  }

  // --- serve a generated SCENE page (prototype) ---
  if (q.simg) {
    const b64 = await cacheGet(sceneKey((q.slug||"").toString(), q.style, (q.shot||"").toString()));
    if (!b64) { res.status(404).json({ ok: false, missing: true }); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=604800");
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

// Named exports so the SHARED asset library (list-characters / list-assets / any
// future /api/library) can reuse this curated catalog WITHOUT duplicating it.
// Stories keep using the default handler exactly as before — this is additive.
export { WORLDS, CHARACTERS, STYLES };
