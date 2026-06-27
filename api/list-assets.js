// /api/list-assets.js
// Returns the library visual assets (background layers + object sprites) so the
// kid-facing creator screens can show TAPPABLE ART instead of only a text box.
// Reads real image_url values from community_layers / community_sprites (the
// generator's own libraries), so it works regardless of where the PNGs are hosted.
//
// GET /api/list-assets            -> all themes
// GET /api/list-assets?theme=forest -> just that theme (case-insensitive)
//
// Public read (no admin token): this is the same approved, kid-safe art the
// generator already uses. Heavy base64 image_urls are skipped to keep the
// picker light; clean URL rows (asset-pack / GitHub raw) are preferred.

import { builtStoryAssets } from "./_storyAssets.js";

async function sbGet(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}

const cleanUrl = (u) => typeof u === "string" && u.length > 0 && !u.startsWith("data:");

// Normalize a theme string to a single canonical key so the UI's short labels
// (e.g. "candy") match the library's tags (e.g. "Candy kingdom"), case-insensitively.
function normTheme(t) {
  const x = String(t || "").trim().toLowerCase();
  if (x.startsWith("candy")) return "candy";          // candy / Candy kingdom
  return x;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(200).json({ configured: false, layers: [], sprites: [] });

  const theme = (req.query.theme || "").toString().trim();
  // theme_tags hold capitalized values (Forest) but some legacy rows are lowercase;
  // we filter client-side after fetch to stay case-insensitive and simple.

  try {
    const [layerRows, spriteRows] = await Promise.all([
      sbGet(url, key, "community_layers?select=asset_id,layer_type,category,image_url,theme_tags&moderation_status=eq.approved&reusable=eq.true&limit=400"),
      sbGet(url, key, "community_sprites?select=asset_id,subject,category,image_url,theme_tags&moderation_status=eq.approved&reusable=eq.true&limit=400"),
    ]);

    const matchTheme = (row) => {
      if (!theme) return true;
      const tags = (row.theme_tags || []).map((t) => String(t).toLowerCase());
      const cat = String(row.category || "").toLowerCase();
      const wt = normTheme(theme);
      return tags.some((t) => normTheme(t) === wt) || normTheme(cat) === wt;
    };

    const communityLayers = (Array.isArray(layerRows) ? layerRows : [])
      .filter((r) => cleanUrl(r.image_url) && matchTheme(r))
      .map((r) => ({
        id: r.asset_id,
        type: r.layer_type,
        theme: (r.theme_tags && r.theme_tags[0]) || r.category || "",
        imageUrl: r.image_url,
        source: "community",
      }));

    // SHARED LIBRARY: also offer curated STORY worlds (full backgrounds) — only
    // ones already built, so no broken tiles. Story worlds carry a theme, so the
    // ?theme= filter applies. Safe: returns [] on any failure.
    const wt = normTheme(theme);
    const storyWorlds = (await builtStoryAssets("world", url, key))
      .filter((w) => !theme || normTheme(w.theme) === wt)
      .map((w) => ({ id: w.id, type: "background", theme: w.theme, imageUrl: w.imageUrl, source: "story" }));

    const layers = [...communityLayers, ...storyWorlds];

    const sprites = (Array.isArray(spriteRows) ? spriteRows : [])
      .filter((r) => cleanUrl(r.image_url) && matchTheme(r))
      .map((r) => ({
        id: r.asset_id,
        subject: r.subject,
        theme: (r.theme_tags && r.theme_tags[0]) || r.category || "",
        imageUrl: r.image_url,
      }));

    // distinct theme list for a theme picker
    const themeSet = new Set();
    [...layers, ...sprites].forEach((a) => a.theme && themeSet.add(String(a.theme)));

    return res.status(200).json({
      configured: true,
      theme: theme || null,
      themes: [...themeSet].sort(),
      counts: { layers: layers.length, sprites: sprites.length },
      layers,
      sprites,
    });
  } catch (e) {
    console.error("list-assets error:", e);
    return res.status(200).json({ configured: true, error: e.message, layers: [], sprites: [] });
  }
}
