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
      coin:     "a single glowing round golden acorn coin standing upright, soft warm glow, a tiny sparkle highlight, simple and clean, facing the viewer",
      gem:      "a single small cluster of pointed glowing green bramble thorns and crystal shards poking up, glossy, a spiky little hazard",
      critter:  "a single cute round fuzzy little forest sprite with big friendly eyes and a tiny grumpy frown, mossy green with a small leaf on top, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant forest sprite wearing a little gold crown, mossy green with a small leaf on top, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "snowy-village": {
    name: "Snowy Village",
    pieces: {
      far:      "A soft band of distant snowy hills with faint pale rooftops and chimneys fading into a misty winter sky, very low contrast, dreamy depth, the top and bottom edges soft and feathered",
      tree_a:   "A single tall snow-covered evergreen pine tree, dark green branches heaped with soft white snow, complete from base to treetop",
      tree_b:   "A single slender bare birch tree lightly dusted with snow and a few delicate icicles, lighter and airier than the pine",
      bush_a:   "A single rounded snow-topped shrub, soft green foliage peeking out beneath a blanket of white snow",
      bush_b:   "A single small clump of snowy bushes with a few bright red winterberries",
      fern:     "A single large foreground tuft of frosty winter grass and a frozen fern frond, pale green tipped with white, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three little glowing lanterns on a snowy mound, gentle warm golden glow against the snow",
      canopy:   "A horizontal swag of snow-laden overhanging branches with dangling icicles drooping down from the top of the frame, used to frame the top edge of a winter scene",
      coin:     "a single shiny round gold coin with a tiny snowflake on its face, standing upright, soft cool glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed clear blue ice icicle spikes poking up, glossy frosty facets, a spiky little hazard",
      critter:  "a single cute round fluffy little snowball creature with big friendly eyes and a tiny grumpy frown, white with rosy cheeks and a tiny scarf, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant snowball creature wearing a little gold crown and a cozy scarf, rosy cheeks, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "coral-reef": {
    name: "Coral Reef",
    pieces: {
      far:      "A soft band of distant underwater reef silhouettes in pale blue-green, faraway coral shapes fading into deep-water haze with gentle light rays, very low contrast, dreamy depth, edges soft and feathered",
      tree_a:   "A single tall branching coral formation like an underwater tree, warm orange and pink, complete from base to top",
      tree_b:   "A single tall slender swaying strand of green-gold kelp seaweed with a few little air bubbles, lighter and airier",
      bush_a:   "A single rounded clump of soft purple brain coral and a gentle waving sea anemone",
      bush_b:   "A single small clump of pink sea-fan coral with a couple of tiny shells",
      fern:     "A single large foreground frond of feathery green sea grass arcing upward, the kind that frames the very front of an underwater scene",
      mushroom: "A small cluster of three glowing bioluminescent sea anemones with rounded soft tops, gentle blue-and-pink underwater glow",
      canopy:   "A horizontal swag of dangling kelp strands and drifting bubbles drooping down from the top of the frame, used to frame the top edge of an underwater scene",
      coin:     "a single shiny round golden pearl coin like a sand dollar standing upright, soft pearly glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed spiky sea-urchin spines and sharp coral shards poking up, glossy, a spiky little hazard",
      critter:  "a single cute round little orange crab with big friendly eyes and a tiny grumpy frown, rounded soft claws, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant orange crab wearing a little gold crown, rounded soft claws, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "dragon-mountain": {
    name: "Dragon Mountain",
    pieces: {
      far:      "A soft band of distant tall purple mountain peaks fading into a misty pale sky, very low contrast, dreamy depth, the top and bottom edges soft and feathered",
      tree_a:   "A single tall craggy grey stone rock spire with patches of soft green moss, complete from base to top",
      tree_b:   "A single slender twisted windswept mountain pine clinging to a little rock, airy and sparse",
      bush_a:   "A single rounded clump of hardy green mountain shrub nestled among a few small smooth boulders",
      bush_b:   "A single small clump of tiny purple alpine flowers and pebbles",
      fern:     "A single large foreground tuft of tough mountain grass and a hardy fern, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing amber crystal geode shards poking from a rock, gentle warm orange glow",
      canopy:   "A horizontal swag of an overhanging craggy rock ledge with dangling vines and a few hanging crystals drooping from the top of the frame, used to frame the top edge",
      coin:     "a single shiny round gold dragon coin with a tiny scale pattern, standing upright, warm glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed sharp jagged grey rock spikes poking up, a spiky little hazard",
      critter:  "a single cute round chubby baby dragon with big friendly eyes and a tiny grumpy frown, soft purple with little stubby wings, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant baby dragon wearing a little gold crown, soft purple with little stubby wings, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "dino-jungle": {
    name: "Dino Jungle",
    pieces: {
      far:      "A soft band of distant giant prehistoric jungle treetops with a faint friendly volcano fading into warm green haze, very low contrast, dreamy depth, edges soft and feathered",
      tree_a:   "A single huge prehistoric jungle tree with a thick trunk and giant broad leaves, lush deep green, complete from base to treetop",
      tree_b:   "A single tall slender palm-like prehistoric fern-tree with a crown of feathery fronds, lighter and airier",
      bush_a:   "A single rounded clump of huge tropical jungle leaves, deep glossy green",
      bush_b:   "A single small clump of giant ferns with a couple of bright prehistoric flowers",
      fern:     "A single large foreground giant prehistoric fern frond with big arching leaves, rich green, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing rounded prehistoric mushrooms with soft caps, gentle green bioluminescent glow, mossy base",
      canopy:   "A horizontal swag of overhanging giant jungle leaves and hanging vines drooping down from the top of the frame, used to frame the top edge of a jungle scene",
      coin:     "a single shiny round golden amber coin with a tiny fern leaf inside, standing upright, warm glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed sharp thorny vines and spiky leaves poking up, a spiky little hazard",
      critter:  "a single cute round chubby baby dinosaur with big friendly eyes and a tiny grumpy frown, soft green with little spots, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant baby dinosaur wearing a little gold crown, soft green with little spots, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "space-station": {
    name: "Space Station",
    pieces: {
      far:      "A soft band of a distant starry nebula with faint round planets and gentle glowing stars fading into deep space, very low contrast, dreamy depth, edges soft and feathered",
      tree_a:   "A single tall friendly metal antenna tower with soft glowing panels, like a sci-fi pylon, complete from base to top",
      tree_b:   "A single slender glowing energy crystal pillar, a luminous column of soft light, airy and bright",
      bush_a:   "A single rounded cluster of smooth metallic domes with little glowing buttons, like a small control pod",
      bush_b:   "A single small clump of glowing space rocks with a couple of tiny floating orbs",
      fern:     "A single large foreground curling glowing alien plant tendril, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing round energy cells on a small metal base, gentle blue-and-purple glow",
      canopy:   "A horizontal swag of overhanging space-station ceiling pipes and dangling cables with little blinking lights drooping from the top of the frame, used to frame the top edge",
      coin:     "a single shiny round glowing energy token coin shaped like a star, standing upright, soft blue glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed sharp glowing red laser-crystal spikes poking up, glossy, a spiky little hazard",
      critter:  "a single cute round little friendly robot blob with big friendly eyes and a tiny grumpy frown, soft teal metallic with little antenna, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant robot blob wearing a little gold crown, soft teal metallic with a little antenna, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "desert-oasis": {
    name: "Desert Oasis",
    pieces: {
      far:      "A soft band of distant pale golden sand dunes with a few faint palm silhouettes fading into warm desert haze, very low contrast, dreamy depth, edges soft and feathered",
      tree_a:   "A single tall date palm tree with a gently curved trunk and a leafy crown of green fronds, complete from base to top",
      tree_b:   "A single slender friendly saguaro cactus with a couple of rounded arms, tall and simple",
      bush_a:   "A single rounded clump of round green barrel cactus with a single bright desert flower",
      bush_b:   "A single small clump of dry golden desert grass with a few little pebbles",
      fern:     "A single large foreground tuft of spiky green agave leaves, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing blooming desert cactus flowers, gentle warm pink-and-gold glow",
      canopy:   "A horizontal swag of overhanging green palm fronds drooping down from the top of the frame, used to frame the top edge of a desert scene",
      coin:     "a single shiny round gold sun coin standing upright, warm golden glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed sharp cactus spines and sandstone spikes poking up, a spiky little hazard",
      critter:  "a single cute round chubby little desert armadillo with big friendly eyes and a tiny grumpy frown, sandy tan, rolled and rounded, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant desert armadillo wearing a little gold crown, sandy tan and rounded, big happy eyes and a gentle smile, cute and harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "candy-land": {
    name: "Candy Land",
    pieces: {
      far:      "A soft band of distant pastel candy hills and gumdrop mountains with fluffy cotton-candy clouds fading into a sweet pink haze, very low contrast, dreamy depth, edges soft and feathered",
      tree_a:   "A single tall lollipop tree with a swirly striped trunk and a big round candy-swirl top, bright pastel colors, complete from base to top",
      tree_b:   "A single slender peppermint candy-cane tree with a few little gumdrops, lighter and airier",
      bush_a:   "A single rounded clump of pastel gumdrops and swirly frosting, soft and sweet",
      bush_b:   "A single small clump of colorful jellybeans with a little swirl lollipop",
      fern:     "A single large foreground frond of soft licorice-strand leaves and candy grass, the kind that frames the very front of a scene",
      mushroom: "A small cluster of three glowing rounded candy mushrooms like shiny gumdrops, gentle pink-and-blue glow",
      canopy:   "A horizontal swag of overhanging dripping frosting and dangling candy strands drooping down from the top of the frame, used to frame the top edge of a candy scene",
      coin:     "a single shiny round gold chocolate coin wrapped in gold foil, standing upright, soft glow, a sparkle highlight, facing the viewer",
      gem:      "a single small cluster of pointed sharp striped candy-cane and rock-candy spikes poking up, glossy bright, a spiky little hazard",
      critter:  "a single cute round little gumdrop creature with big friendly eyes and a tiny grumpy frown, pastel pink and glossy, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      boss:     "a big friendly giant gumdrop creature wearing a little gold crown, glossy pastel pink, big happy eyes and a gentle smile, cute and round, harmless and royal, NEVER scary, a friendly game boss",
    },
  },
  "story-icons": {
    name: "Story Choice Icons",
    pieces: {
      lost_friend:     "a cute lost teddy bear sitting alone looking for a friend",
      hidden_treasure: "an open treasure chest overflowing with shiny gold coins and gems",
      missing_star:    "a single bright glowing golden five-point star with a little sparkle",
      magic_door:      "a small glowing magical doorway full of light and sparkles",
      help_creature:   "a pair of gentle cupped hands holding a tiny glowing baby creature",
      big_storm:       "a fluffy grey rain cloud with gentle raindrops and one small friendly lightning bolt",
      cozy:            "a steaming warm mug of cocoa wrapped in a cozy knitted blanket",
      silly:           "a goofy bright cartoon smiley face sticking its tongue out, playful",
      brave:           "a shiny round hero shield with a bright star on it",
      magical:         "a sparkly magic wand with a star tip and swirling sparkles",
      spooky:          "a cute friendly little smiling ghost, soft and not scary",
      happy:           "a big cheerful smiling sun with rosy cheeks",
      surprise:        "a colorful wrapped surprise gift box with a bow and confetti popping out",
      friendship:      "two little hearts joined together, warm and friendly",
      sleepy:          "a cozy crescent moon wearing a sleeping cap with little Zzz and stars",
      birthday:        "a cute birthday cake with lit candles and sprinkles",
      lost_toy:        "a cute well-loved soft teddy bear toy",
      first_day:       "a cute little school backpack",
      learn_brave:     "a brave little lion cub standing proudly",
      rainy_day:       "a cute colorful umbrella with a few raindrops",
      new_friend:      "two cute little hands waving hello to each other",
    },
  },
  "props": {
    name: "Game Props",
    pieces: {
      coin:    "a single shiny round gold coin standing upright, soft warm glow, a tiny sparkle highlight, simple and clean, facing the viewer",
      gem:     "a single small cluster of pointed amethyst purple crystal shards poking up, glossy facets, a spiky little hazard",
      critter: "a single cute round fuzzy little forest creature with big friendly eyes and a tiny grumpy frown, soft purple-pink, cartoonish and harmless, NEVER scary, a gentle game obstacle",
      vines:   "a tall vertical hanging curtain of leafy green vines and a mossy branch drooping straight down from above, dense leaves, like an overhead barrier to duck under, tall and narrow",
      spring:  "a single bright bouncy springy mushroom with a glossy domed rubbery teal-green cap and a short stalk, looks bouncy and fun",
      flag:    "a single cheerful little finish flag (a friendly triangular pennant) on a slim wooden pole, a goal marker, bright and inviting",
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
    // s-maxage: edge-cache the response so this function runs once globally per image.
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable, stale-while-revalidate=86400");
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
