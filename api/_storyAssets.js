// /api/_storyAssets.js
// Shared helper: bring the curated STORY library (story-library.js) into the
// SHARED asset library so story worlds + heroes can be reused by any project
// (games, future engines) — see ASSET-LIBRARY.md.
//
// SAFE BY DESIGN:
//  - Read-only. Touches nothing the story maker uses.
//  - Returns ONLY assets whose image is already built/cached, so a picker never
//    shows a broken image. As more story art gets built, more shows up (self-
//    healing). No pre-generation, no DB migration, no owner step.
//  - Degrades to [] on ANY error, so callers can merge it in without risk.
import crypto from "crypto";
import { WORLDS, CHARACTERS } from "./story-library.js";

// Story worlds carry a theme (a label, not a fence — see ASSET-LIBRARY.md).
// Story characters are theme-agnostic (a bunny isn't a theme), so they stay
// blank and show up in every unfiltered view, mixable anywhere.
const WORLD_THEME = {
  "snowy-village": "snow",
  "coral-reef": "ocean",
  "enchanted-forest": "forest",
  "dragon-mountain": "castle",
  "dino-jungle": "jungle",
  "space-station": "space",
  "desert-oasis": "desert",
  "candy-land": "candy",
};

// Must match story-library.js cacheKey(kind, slug, style).
function cacheKey(kind, slug, style) {
  return "lib:" + crypto.createHash("sha1").update(kind + "|" + slug + "|" + style).digest("hex");
}

// Return story assets of `kind` ("world" | "character") whose base image at
// `style` is already cached in narration_cache. Empty array on any problem.
export async function builtStoryAssets(kind, url, key, style = "watercolor") {
  try {
    if (!url || !key) return [];
    const list = kind === "world" ? WORLDS : CHARACTERS;
    const items = list.map((it) => ({ slug: it[0], name: it[1], k: cacheKey(kind, it[0], style) }));

    // One batched existence check (quoted values; cache_key contains a colon).
    const inList = items.map((x) => `"${x.k}"`).join(",");
    const r = await fetch(
      `${url}/rest/v1/narration_cache?cache_key=in.(${inList})&select=cache_key`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    const have = new Set((Array.isArray(rows) ? rows : []).map((x) => x.cache_key));

    return items
      .filter((x) => have.has(x.k))
      .map((x) => ({
        id: "story:" + kind + ":" + x.slug,
        slug: x.slug,
        name: x.name,
        theme: kind === "world" ? (WORLD_THEME[x.slug] || "") : "",
        imageUrl: `/api/story-library?img=${kind}:${x.slug}&style=${style}`,
        source: "story",
      }));
  } catch {
    return [];
  }
}
