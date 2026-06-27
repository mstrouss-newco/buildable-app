// /api/list-characters.js
// Returns a random assortment of reusable, kid-safe hero characters from the
// community_characters library so the creator screen can offer "Choose a hero"
// (pick an existing one) in addition to "create your own".
//
// Every character a kid generates via /api/generate-creature is already saved
// into community_characters (moderation_status: "approved"), so this endpoint
// makes that growing library reusable across kids/devices.
//
// GET /api/list-characters            -> a random assortment (default limit 12)
// GET /api/list-characters?limit=N    -> up to N characters
// GET /api/list-characters?theme=jungle -> only heroes tagged with that theme
//
// THEME IS A LABEL, NOT A FENCE (see ASSET-LIBRARY.md): the theme filter is
// optional. With no theme, ALL approved heroes are returned so any project can
// mix freely. The endpoint is resilient: if the theme_tags column does not
// exist yet (before db/add-character-theme-tags.sql is run), it falls back to a
// plain select so the picker never breaks.
//
// Public read (no admin token): only approved rows with an image are returned.
// Clean hosted URLs are preferred; base64 (data:) images are capped.

import { builtStoryAssets } from "./_storyAssets.js";

// Try the rich select (with theme_tags); return null on failure (e.g. column
// missing) so the caller can fall back to the plain select.
async function fetchChars(url, key, withTheme) {
  const cols = withTheme
    ? "id,name,description,image_url,theme_tags,created_at"
    : "id,name,description,image_url,created_at";
  try {
    const r = await fetch(
      `${url}/rest/v1/community_characters?select=${cols}&moderation_status=eq.approved&order=created_at.desc&limit=200`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return null;
    return r.json().catch(() => []);
  } catch {
    return null;
  }
}

const hasImage = (u) => typeof u === "string" && u.length > 0;
const isClean = (u) => hasImage(u) && !u.startsWith("data:");

// Normalize a theme string to a single canonical key (lowercase, candy* -> candy).
function normTheme(t) {
  const x = String(t || "").trim().toLowerCase();
  if (x.startsWith("candy")) return "candy";
  return x;
}

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
  const theme = (req.query.theme || "").toString().trim();

  try {
    // Prefer the theme-aware select; fall back if the column isn't there yet.
    let rows = await fetchChars(url, key, true);
    if (rows === null) rows = (await fetchChars(url, key, false)) || [];

    // Optional theme filter. A hero with no theme_tags is only excluded when a
    // theme is explicitly requested; with no filter, everything is returned.
    const wantTheme = theme ? normTheme(theme) : null;
    const matchTheme = (r) => {
      if (!wantTheme) return true;
      const tags = (r.theme_tags || []).map((t) => normTheme(t));
      return tags.includes(wantTheme);
    };

    const fromCommunity = (Array.isArray(rows) ? rows : [])
      .filter((r) => hasImage(r.image_url) && matchTheme(r))
      .map((r) => ({
        id: r.id,
        name: r.name || "Mystery Hero",
        description: r.description || "",
        image: r.image_url,
        theme: (r.theme_tags && r.theme_tags[0]) || "",
        source: "community",
      }));

    // SHARED LIBRARY: also offer curated STORY heroes (only ones already built,
    // so no broken tiles). Story heroes are theme-agnostic, so they appear only
    // when no theme filter is set. Safe: returns [] on any failure.
    const story = wantTheme
      ? []
      : (await builtStoryAssets("character", url, key)).map((c) => ({
          id: c.id,
          name: c.name,
          description: "",
          image: c.imageUrl,
          theme: c.theme,
          source: "story",
        }));

    const all = [...fromCommunity, ...story];

    // Prefer clean hosted URLs; backfill with a capped number of base64 images.
    const clean = shuffle(all.filter((c) => isClean(c.image)));
    const base64 = shuffle(all.filter((c) => !isClean(c.image))).slice(0, MAX_BASE64);
    const characters = shuffle([...clean, ...base64]).slice(0, limit);

    return res.status(200).json({
      configured: true,
      theme: theme || null,
      count: characters.length,
      characters,
    });
  } catch (e) {
    console.error("list-characters error:", e);
    return res.status(200).json({ configured: true, error: e.message, characters: [] });
  }
}
