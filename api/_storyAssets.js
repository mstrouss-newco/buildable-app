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

// Styles to look across (watercolor first = the story maker's default).
const STYLE_ORDER = ["watercolor", "modern3d", "modern", "papercut"];

// Return story assets of `kind` ("world" | "character") whose base image is
// already cached in narration_cache in ANY style. One asset per slug, using the
// first style that's built (so it surfaces real art no matter which style the
// kid used). Empty array on any problem — safe to merge into a picker.
export async function builtStoryAssets(kind, url, key) {
  try {
    if (!url || !key) return [];
    const list = kind === "world" ? WORLDS : CHARACTERS;

    // Every (slug, style) base key.
    const entries = [];
    for (const it of list) {
      for (const style of STYLE_ORDER) {
        entries.push({ slug: it[0], name: it[1], style, k: cacheKey(kind, it[0], style) });
      }
    }

    // Pull the set of cached base keys with a simple prefix filter (proven to
    // work; "lib:" base images are few) and match locally — robust and avoids
    // any long-URL / in() encoding pitfalls.
    const r = await fetch(
      `${url}/rest/v1/narration_cache?select=cache_key&cache_key=like.lib:%25&limit=2000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!r.ok) return [];
    const rows = await r.json().catch(() => []);
    const have = new Set((Array.isArray(rows) ? rows : []).map((x) => x.cache_key));

    // First built style per slug (STYLE_ORDER preference).
    const bySlug = new Map();
    for (const e of entries) {
      if (have.has(e.k) && !bySlug.has(e.slug)) bySlug.set(e.slug, e);
    }

    return [...bySlug.values()].map((e) => ({
      id: "story:" + kind + ":" + e.slug,
      slug: e.slug,
      name: e.name,
      theme: kind === "world" ? (WORLD_THEME[e.slug] || "") : "",
      imageUrl: `/api/story-library?img=${kind}:${e.slug}&style=${e.style}`,
      source: "story",
    }));
  } catch {
    return [];
  }
}
