// /api/list-audio.js
// The SHARED AUDIO catalog: one place that lists every reusable music track and
// sound effect across all projects, tagged the same way art is (kind/theme/url/
// source) so any project can pull audio by theme. See ASSET-LIBRARY.md.
//
// GET /api/list-audio            -> all music + sfx
// GET /api/list-audio?theme=jungle -> only audio tagged with that theme
//
// THEME IS A LABEL, NOT A FENCE: theme is optional; with no theme everything is
// returned and any project may mix freely. Read-only, no DB, never breaks.
import { SOUNDS } from "./sfx.js";
import { CHESS_MUSIC_WORLDS } from "./chess-music.js";

// Reusable mood-music loops shipped as static files (public/music-library/).
const MUSIC_LIB = [
  ["lofi_chill_beat", "Lo-fi Chill Beat", "warm lo-fi beat", ""],
  ["dreamy_ambient", "Dreamy Ambient", "soft floating pads", ""],
  ["spacey_ambient", "Spacey Ambient", "deep warm cosmic pads", "space"],
  ["cozy_piano", "Cozy Piano", "gentle warm piano", ""],
  ["cozy_marimba", "Cozy Marimba", "warm acoustic marimba", ""],
  ["playful_musicbox", "Playful Music Box", "soft bouncy music box", "candy"],
];

// Themes for the ambience sound effects (a label, not a fence).
const SFX_THEME = {
  water: "water", fire: "fire", waves: "ocean", forest: "forest",
  crickets: "forest", wind: "snow", jungle: "jungle", space: "space",
  candy: "candy", rain: "rain",
};

const norm = (t) => String(t || "").trim().toLowerCase();
const pretty = (s) => String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const theme = norm(req.query.theme);

  // ---- MUSIC ----
  const music = [];
  // Per-world themed music (ElevenLabs, cached) — strongest theme match.
  for (const world of Object.keys(CHESS_MUSIC_WORLDS || {})) {
    music.push({
      id: "music:world:" + world,
      name: pretty(world) + " Music",
      kind: "music",
      theme: world,
      url: "/api/chess-music?world=" + encodeURIComponent(world),
      source: "elevenlabs",
    });
  }
  // Mood loops (static files) — theme optional.
  for (const [file, name, mood, th] of MUSIC_LIB) {
    music.push({
      id: "music:lib:" + file,
      name, kind: "music", theme: th, mood,
      url: "/music-library/" + file + ".mp3",
      source: "library",
    });
  }

  // ---- SFX ----
  const sfx = [];
  for (const key of Object.keys(SOUNDS || {})) {
    const isChess = key.startsWith("chess_");
    let th = SFX_THEME[key] || "";
    if (!th && isChess) {
      const m = key.match(/^chess_capture_(\w+)$/);
      if (m) th = m[1]; // capture sound themed by world
    }
    sfx.push({
      id: "sfx:" + key,
      name: pretty(key),
      kind: "sfx",
      theme: th,
      role: isChess ? "one-shot" : "ambience",
      url: "/api/sfx?s=" + encodeURIComponent(key),
      source: isChess ? "chess" : "library",
    });
  }

  // Optional theme filter (label, not fence): with no theme, return everything.
  const matches = (a) => !theme || norm(a.theme) === theme;
  const m = music.filter(matches);
  const s = sfx.filter(matches);

  const themes = [...new Set([...music, ...sfx].map((a) => a.theme).filter(Boolean))].sort();

  return res.status(200).json({
    configured: true,
    theme: theme || null,
    themes,
    counts: { music: m.length, sfx: s.length },
    music: m,
    sfx: s,
  });
}
