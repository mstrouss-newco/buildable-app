// /api/_thumbs.js — shared helpers to give every creation a thumbnail derived
// from its OWN art (see ASSET-LIBRARY.md). Read-only, no DB, safe fallbacks.

// World slugs that have a story-library background image.
const STORY_WORLDS = new Set([
  "snowy-village", "coral-reef", "enchanted-forest", "dragon-mountain",
  "dino-jungle", "space-station", "desert-oasis", "candy-land",
]);
// Themes that have a bundled chess-art thumbnail.
const CHESS_THEMES = new Set(["candy", "castle", "desert", "jungle", "ocean", "space"]);
// Map common world/theme words onto a chess-art thumb theme.
const THEME_ALIAS = {
  forest: "jungle", water: "ocean", waves: "ocean", underwater: "ocean",
  snow: "castle", snowy: "castle", ice: "castle", volcano: "desert",
  dino: "jungle", dinosaur: "jungle", reef: "ocean", dragon: "castle",
};

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "-");
}

// A shared-library thumbnail URL for a world/theme, or null if none fits.
export function thumbForWorld(world) {
  const w = norm(world);
  if (!w) return null;
  if (STORY_WORLDS.has(w)) return "/api/story-library?img=world:" + w + "&style=watercolor";
  if (CHESS_THEMES.has(w)) return "/chess-art/" + w + "_thumb.jpg";
  const base = w.split("-")[0];
  const a = THEME_ALIAS[w] || THEME_ALIAS[base];
  if (a) return "/chess-art/" + a + "_thumb.jpg";
  return null;
}

// The generated cover image for a song (what CoverThumb renders), as a URL.
export function songCover(vibe, theme) {
  return "/api/images?kind=cover&vibe=" + encodeURIComponent(vibe || "happy") +
    "&theme=" + encodeURIComponent(theme || "");
}
