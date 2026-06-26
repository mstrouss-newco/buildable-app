// /api/game-art.js
// Curated, reusable library of WORLD-PIECES for the side-scrolling game engine:
// individual transparent watercolor cut-outs (trees, bushes, ferns, mushrooms,
// canopy, distant mist) that the engine scatters across parallax layers to build
// a living, MOVING world. Same model as the Stories library: generate ONCE,
// cache forever, serve free. A moving world costs ~$0 per play.
//
//   GET                                   -> manifest JSON (worlds + pieces)
//   GET ?build=1&world=&piece=&style=     -> generate that one piece if missing (cached)
//   GET ?img=<world>:<piece>&style=       -> serve the cached PNG bytes (CORS-open)
// Add ?force=1 to a build to regenerate. Env (by name only): OPENAI_API_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_KEY.
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const STYLES = {
  watercolor: "soft children's picture-book WATERCOLOR illustration, gentle washes, warm colors, rounded friendly shapes, hand-painted storybook",
  modern3d:   "modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded shapes, vibrant, glossy",
  papercut:   "layered CUT-PAPER COLLAGE illustration (Eric Carle style), textured construction-paper shapes, bold bright colors, visible paper edges",
  modern:     "clean MODERN flat children's-book illustration, bold simple shapes, smooth flat colors with subtle gradients, friendly and crisp",
};
function styleId(s) { return STYLES[s] ? s : "watercolor"; }
const CUT = "A SINGLE isolated element, centered, full and complete, on a FULLY TRANSPARENT background. No ground, no floor line, no cast shadow, no frame, no other objects, no characters, no people, no animals, no text.";
const SAFE = "age 4-8, wholesome, child-friendly";

const WORLDS = {
  "enchanted-forest": {
    name: "Enchanted Forest",
    pieces: {
      far:      "A soft band of distant misty forest: rows of faraway pale blue-green tree silhouettes fading into haze, very low contrast, dreamy depth, the top and bottom edges soft and feathered",
      tree_a:   "A single tall ancient enchanted-forest tree with a thick mossy trunk and a big lush rounded leafy canopy, soft glowing green, complete from base to treetop",
      tree_b:   "A single slender curving birch-like magical forest tree with delicate leaves and a few glowing motes, lighter and airier than a big oak",
      bush_a:   "A single rounded leafy forest bush, soft layered green foliage with a couple of tiny wildflowers",
      bush_b:   "A single small fern-and-leaf shrub clump, feathery green fronds",
      fern:     "A single large foreground fern frond, big feathery arching leaves, rich green, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing enchanted toadstool mushrooms with rounded caps, gentle bioluminescent blue-and-pink glow, mossy base",
      canopy:   "A horizontal swag of overhanging leafy branch and hanging vines with dangling leaves drooping down from the top of the frame, soft green, used to frame the top edge of a forest scene",
    },
  },
};

function pieceKey(world, piece, style) {
  return "ga:" + crypto.createHash("sha1").update(world + "|" + piece + "|" + styleId(style)).digest("hex");
}
function promptFor(world, piece, style) {
  const w = WORLDS[world];
  const desc = w && w.pieces[piece];
  if (!desc) return null;
  return `${desc}. ${CUT} ${STYLES[styleId(style)]}, ${SAFE}`;
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

async function genImage(prompt, openaiKey, timeoutMs = 44000) {
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
  for (let t = 0; t < 3; t++) {
    const r = await once({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "low", background: "transparent", output_format: "png" });
    if (r.b64) return r.b64;
    if (r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 4000 + t * 3000));
  }
  return null;
}

export default async function handler(req, res) {
  const { build, img, world = "enchanted-forest", piece, style = "watercolor", force } = req.query;

  if (img) {
    const [w, p] = String(img).split(":");
    const b64 = await cacheGet(pieceKey(w, p, style));
    if (!b64) { res.status(404).json({ error: "not built", world: w, piece: p }); return; }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(b64, "base64"));
    return;
  }

  if (build) {
    if (!WORLDS[world]) { res.status(400).json({ error: "unknown world", world }); return; }
    if (!piece || !WORLDS[world].pieces[piece]) { res.status(400).json({ error: "unknown piece", world, piece, have: Object.keys(WORLDS[world].pieces) }); return; }
    const key = pieceKey(world, piece, style);
    if (force) await cacheDel(key);
    else { const ex = await cacheGet(key); if (ex) { res.status(200).json({ ok: true, cached: true, world, piece, style: styleId(style) }); return; } }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) { res.status(500).json({ error: "no OPENAI_API_KEY" }); return; }
    const b64 = await genImage(promptFor(world, piece, style), openaiKey);
    if (!b64) { res.status(502).json({ error: "generation failed", world, piece }); return; }
    await cachePut(key, b64);
    res.status(200).json({ ok: true, cached: false, world, piece, style: styleId(style) });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    styles: Object.keys(STYLES),
    worlds: Object.fromEntries(Object.entries(WORLDS).map(([k, v]) => [k, { name: v.name, pieces: Object.keys(v.pieces) }])),
  });
}
