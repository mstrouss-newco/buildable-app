// /api/list-characters.js
// Returns a random assortment of reusable, kid-safe hero characters from the
// community_characters library so the creator screen can offer "Choose a hero"
// (pick an existing one) in addition to "create your own".
//
// Every character a kid generates via /api/generate-creature is already saved
// into community_characters (moderation_status: "approved"), so this endpoint
// makes that growing library reusable across kids/devices.
//
// GET /api/list-characters          -> a random assortment (default limit 12)
// GET /api/list-characters?limit=N  -> up to N characters
//
// Public read (no admin token): only approved rows with an image are returned.
// Clean hosted URLs are preferred; base64 (data:) images are still included so
// the library is not empty, but they are capped to keep the payload light.

async function sbGet(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

const hasImage = (u) => typeof u === "string" && u.length > 0;
const isClean = (u) => hasImage(u) && !u.startsWith("data:");

// Fisher-Yates shuffle for a fresh random assortment on every load.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cap how many heavy base64 images we return so the picker payload stays light.
const MAX_BASE64 = 8;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ configured: false, characters: [] });

  const rawLimit = parseInt((req.query.limit || "12").toString(), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 40) : 12;

  try {
    // Pull a generous pool of approved characters, then shuffle + trim so the
    // assortment varies between visits. created_at desc keeps the pool fresh.
    const rows = await sbGet(
      url,
      key,
      "community_characters?select=id,name,description,image_url,created_at&moderation_status=eq.approved&order=created_at.desc&limit=200"
    );

    const all = (Array.isArray(rows) ? rows : [])
      .filter((r) => hasImage(r.image_url))
      .map((r) => ({
        id: r.id,
        name: r.name || "Mystery Hero",
        description: r.description || "",
        image: r.image_url,
      }));

    // Prefer clean hosted URLs; backfill with a capped number of base64 images
    // so the library is populated even before hosted-URL art exists.
    const clean = shuffle(all.filter((c) => isClean(c.image)));
    const base64 = shuffle(all.filter((c) => !isClean(c.image))).slice(0, MAX_BASE64);
    const characters = shuffle([...clean, ...base64]).slice(0, limit);

    return res.status(200).json({
      configured: true,
      count: characters.length,
      characters,
    });
  } catch (e) {
    console.error("list-characters error:", e);
    return res.status(200).json({ configured: true, error: e.message, characters: [] });
  }
}
