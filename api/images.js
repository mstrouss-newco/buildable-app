// /api/images.js
// Reusable AI image library: generate once (OpenAI gpt-image-1), cache the PNG in
// Postgres keyed by a deterministic hash of its descriptor, and SERVE it as real
// image bytes by a short URL. Identical requests reuse the cached row, so each
// unique image is billed once and reuse is free + instant.
//
//   <img src="/api/images?kind=cover&vibe=happy&theme=space">      // song cover art
//   <img src="/api/images?kind=icon&cat=drums&id=big">            // transparent UI icon
//   GET /api/images?...&force=1        -> regenerate (replace a bad one)
//   GET /api/images?manifest=1[&kind=] -> JSON list of what's cached
//
// On any miss it can't fill (no key / over budget / provider error) it returns a
// non-200 so the frontend's <img onError> falls back to its emoji / color swatch.

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IMG_COST_USD = parseFloat(process.env.IMAGE_COST_USD || "0.011");   // gpt-image-1 low 1024
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

export const config = { api: { bodyParser: false } };

/* ---------------- prompt builders (one per "kind") ---------------- */
const VIBE = { happy:"happy and sunny", epic:"epic and adventurous", spooky:"playful friendly-spooky",
  silly:"goofy and silly", chill:"calm and relaxed", dance:"energetic party" };
const WORLD = { space:"outer space with planets and stars", underwater:"a colorful underwater ocean reef",
  castle:"a magical fairytale castle", candy:"a sweet candy land", forest:"an enchanted forest",
  desert:"a sunny desert", volcano:"a glowing volcano" };

const COVER_STYLE = "vibrant playful square album-cover artwork, modern 3D glossy cartoon style, bright bold colors, fun and inviting, centered, no text, no words, no letters, child-friendly, ages 4-10";
const ICON_STYLE  = "Photorealistic studio product photograph, realistic materials and reflections, soft even studio lighting, sharp focus, high detail, clean and glossy like an Apple GarageBand instrument icon. Single subject, centered, filling the frame. Not a cartoon, not an illustration, not 3D-rendered, not flat. No text, no labels, no watermark.";

// Instrument / mood / world icon subjects (mirrors the Music Maker pickers).
const ICONS = {
  drums:  { big:"a complete colorful children's drum kit with a bass drum, two toms, a snare, a hi-hat and cymbals",
            soft:"a snare drum with a pair of wire jazz brushes resting on the drumhead",
            marching:"a marching-band snare drum with a shoulder strap and two wooden drumsticks",
            bongos:"a pair of polished wooden bongo drums",
            electro:"a modern electronic drum machine pad with glowing buttons" },
  guitar: { electric:"a glossy electric guitar with a vibrant solid body and chrome hardware",
            acoustic:"a warm natural-wood acoustic guitar",
            twangy:"a shiny chrome resonator guitar",
            bass:"a glossy electric bass guitar" },
  strings:{ violin:"a polished wooden violin with its bow",
            cello:"a polished wooden cello with its bow",
            harp:"an elegant golden concert harp",
            orchestra:"a row of violins from a string orchestra" },
  singer: { boy:"a happy young boy singing into a handheld studio microphone",
            girl:"a happy young girl singing into a studio microphone on a stand",
            group:"three happy kids singing together at studio microphones",
            both:"a boy and a girl singing a duet together at studio microphones",
            robot:"a friendly cute silver toy robot singing into a microphone" },
  vibe:   { happy:"a bright shiny sun in a clear blue sky",
            epic:"a dramatic glowing bolt of lightning",
            spooky:"a glowing carved Halloween jack-o-lantern pumpkin",
            silly:"a pair of novelty clown glasses with a big red nose",
            chill:"a pair of cool reflective sunglasses",
            dance:"a sparkling mirror-ball disco ball" },
  style:  { pop:"a shiny chrome studio vocal microphone",
            country:"a brown cowboy hat resting on a wooden acoustic guitar",
            hiphop:"a pair of modern DJ headphones with a thick gold chain",
            rock:"a glossy electric guitar",
            disco:"a sparkling mirror-ball disco ball with colorful dance-floor lights",
            sleepy:"a glowing crescent moon with stars in a deep-blue night sky",
            marching:"a marching-band bass drum with a tall plumed marching hat beside it",
            reggae:"an acoustic guitar painted with red, gold and green stripes",
            kpop:"a glossy K-pop stage microphone with colorful glowing concert lightsticks and bright neon stage lights" },
  world:  { space:"a colorful outer-space scene with planets, stars and a rocket",
            underwater:"a vibrant underwater coral reef with tropical fish and sunbeams",
            castle:"a majestic fairytale castle on a green hill under a bright sky",
            candy:"a whimsical candy land of giant lollipops, gumdrops and candy canes",
            forest:"a lush sunlit forest with tall trees and dappled light",
            desert:"a sunny desert with golden sand dunes and a cactus",
            volcano:"an erupting volcano with glowing orange lava and rocky terrain" },
  speed:  { slow:"a cute slow tortoise", medium:"a person casually walking",
            fast:"a fast running rabbit", superfast:"a speeding cheetah mid-run",
            groovy:"a colorful shiny bouncing rubber ball" },
};

// Typing-game characters (heroes, baddies, bosses). Transparent cut-outs.
const TYPE_STYLE = "cute friendly cartoon game-character mascot for a kids' typing game, " +
  "bold clean thick outlines, bright vibrant colors, big expressive eyes, full body, centered, " +
  "simple flat-shaded sprite, not scary, child-friendly ages 4-8, transparent background";
const TYPE_SUBJECTS = {
  hero: {
    rocket:"a heroic friendly rocket-ship mascot with a brave smile and little arms",
    fox:   "a brave heroic cartoon fox wearing a tiny superhero cape",
    dragon:"a cute brave baby dragon with small wings and a tiny friendly flame",
    wizard:"a young cartoon wizard kid in a purple robe and pointy hat holding a glowing wand",
    robot: "a friendly heroic cartoon robot with a glowing blue visor and little rocket boosters",
    knight:"a brave cartoon kid knight in shiny golden armor holding a small shield",
  },
  foe: {
    space_1:"a goofy purple alien space-invader blob with big silly eyes",
    space_2:"a goofy little cartoon UFO saucer with a cheeky face",
    space_3:"a goofy green three-eyed alien creature",
    space_4:"a goofy grinning cartoon comet with a sparkly tail",
    jungle_1:"a goofy friendly cartoon green snake with a silly grin",
    jungle_2:"a playful goofy cartoon monkey sticking out its tongue",
    jungle_3:"a small goofy cartoon crocodile with a toothy grin",
    jungle_4:"a chubby goofy cartoon rhino with a big horn",
    sea_1:"a goofy cartoon pufferfish with big eyes",
    sea_2:"a goofy cartoon crab waving its claws",
    sea_3:"a goofy cartoon octopus with a silly grin",
    sea_4:"a goofy friendly cartoon baby shark with a big grin, not scary",
    candy_1:"a goofy gummy-bear candy monster with a silly face",
    candy_2:"a goofy walking slice of pie with eyes and little legs",
    candy_3:"a goofy donut creature with sprinkles and a face",
    candy_4:"a goofy cupcake monster with frosting and googly eyes",
    ice_1:"a goofy cartoon penguin wearing a tiny scarf",
    ice_2:"a goofy fluffy snowy cartoon owl",
    ice_3:"a goofy cute cartoon seal pup",
    ice_4:"a goofy fluffy white snow-monster cub, cute not scary",
    volcano_1:"a goofy little cartoon lava lizard",
    volcano_2:"a goofy cartoon bat with big ears",
    volcano_3:"a goofy rolling cartoon rock creature with a face",
    volcano_4:"a goofy cute cartoon stone golem",
  },
  boss: {
    space:"a big goofy UFO mothership boss with glowing lights, a silly face and a tiny gold crown",
    jungle:"a big friendly cartoon gorilla king with a tiny gold crown, goofy not scary",
    sea:"a big friendly cartoon blue whale boss with a tiny gold crown, happy and goofy",
    candy:"a big goofy lollipop-king candy boss with a tiny gold crown",
    ice:"a big friendly cartoon snowman king boss with a tiny gold crown",
    volcano:"a big goofy friendly cartoon lava dragon boss with a tiny gold crown, not scary",
  },
};

function build(q) {
  const kind = (q.kind || "").toString();
  if (kind === "type") {
    const cat = (q.cat || "").toString();
    const id = (q.id || "").toString();
    const subject = TYPE_SUBJECTS[cat] && TYPE_SUBJECTS[cat][id];
    if (!subject) return null;
    return {
      descriptor: `type|${cat}|${id}`,
      prompt: `${subject}. ${TYPE_STYLE}`,
      transparent: true, quality: "medium",
    };
  }
  if (kind === "cover") {
    const vibe = (q.vibe || "happy").toString();
    const theme = (q.theme || "").toString();
    const mood = VIBE[vibe] || vibe;
    const setting = WORLD[theme] || (theme ? theme : "a fun imaginative world");
    return {
      descriptor: `cover|${vibe}|${theme}`,
      prompt: `Square album cover artwork for a children's song. Mood: ${mood}. Setting: ${setting}. ${COVER_STYLE}`,
      transparent: false, quality: "low",
    };
  }
  if (kind === "icon") {
    const cat = (q.cat || "").toString();
    const id = (q.id || "").toString();
    const subject = ICONS[cat] && ICONS[cat][id];
    if (!subject) return null;
    const transparent = !(cat === "world"); // worlds are full scenes; everything else is a cut-out
    return {
      descriptor: `icon|${cat}|${id}`,
      prompt: `${subject}. ${ICON_STYLE}`,
      transparent, quality: "medium",
    };
  }
  return null;
}

/* ---------------- cache (image_cache table) ---------------- */
const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
});
async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}&select=b64&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].b64 : null;
  } catch { return null; }
}
async function cachePut(key, descriptor, kind, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await sb("image_cache", { method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ cache_key: key, descriptor, kind, b64 }) });
  } catch {}
}
async function cacheDel(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }); } catch {}
}
async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await sb(`usage_log?select=cost_usd&date=eq.${today}`);
    if (!r.ok) return true;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await sb("usage_log", { method: "POST", body: JSON.stringify({ date: today, cost_usd: cost, kind: "image-lib", model: "gpt-image-1" }) });
  } catch {}
}

/* ---------------- OpenAI generation (same chain as generate-story-art) -------- */
async function generateImage(prompt, openaiKey, opts = {}, timeoutMs = 42000) {
  const once = async (b) => {
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
        return b64 || null;
      }
      return { status: res.status };
    } catch { clearTimeout(timer); return { status: 0 }; }
  };
  const attempt = async (b) => {
    for (let t = 0; t < 3; t++) {
      const r = await once(b);
      if (typeof r === "string") return r;
      if (!r || r.status !== 429) return null;
      await new Promise((res) => setTimeout(res, 4000 + t * 3000));
    }
    return null;
  };
  const q = opts.quality || "low";
  const tx = opts.transparent ? { background: "transparent", output_format: "png" } : {};
  return (
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: q, ...tx })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", ...tx })) ||
    null
  );
}

/* ---------------- handler ---------------- */
function sendPng(res, b64) {
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(buf);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const q = req.query || {};

  // Manifest: list what's cached (optionally by kind).
  if (q.manifest) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ images: [] });
    try {
      let url = "image_cache?select=cache_key,descriptor,kind,created_at&order=created_at.desc&limit=500";
      if (q.kind) url += `&kind=eq.${encodeURIComponent(q.kind)}`;
      const r = await sb(url);
      const rows = r.ok ? await r.json() : [];
      return res.status(200).json({ images: Array.isArray(rows) ? rows : [] });
    } catch { return res.status(200).json({ images: [] }); }
  }

  const spec = build(q);
  if (!spec) return res.status(400).json({ error: "unknown kind/params" });
  const key = "img:" + crypto.createHash("sha1").update(spec.descriptor + (spec.transparent ? "|t" : "")).digest("hex");

  // Force-regenerate: drop the cached row first.
  if (q.force) await cacheDel(key);
  else {
    const cached = await cacheGet(key);
    if (cached) return sendPng(res, cached);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });      // <img onError> -> fallback
  if (!(await underBudget())) return res.status(503).json({ error: "over_budget" });

  const b64 = await generateImage(spec.prompt, openaiKey, { transparent: spec.transparent, quality: spec.quality });
  if (!b64) return res.status(502).json({ error: "image_provider_failed" });
  await cachePut(key, spec.descriptor, (q.kind || "").toString(), b64);
  const COST = { low: 0.011, medium: 0.042, high: 0.167 };
  await logCost(COST[spec.quality] || IMG_COST_USD);
  return sendPng(res, b64);
}
