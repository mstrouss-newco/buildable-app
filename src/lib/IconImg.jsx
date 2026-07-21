import { useState } from "react";

// A picker icon for the Music Maker.
//
// Speed: icons can come from a pre-baked STATIC WebP file
// (/music-maker/icons/{cat}-{id}.webp) that loads instantly with no API round
// trip. Until a given icon has been baked, we fall back to the reusable image
// library (/api/images?kind=icon) exactly as before — so this never regresses
// the current behaviour. As icons are baked to static files, add their
// "{cat}-{id}" key to BAKED below and they switch to the instant path.
//
// While the photo loads (and if it ever fails) it shows a faint music-note
// placeholder — never an emoji. Control options (Auto/None/Surprise) don't use
// this; MusicMaker draws those with a vector glyph instead.

// Icons that have a static WebP baked under public/music-maker/icons/.
// (Empty for now — populate as files are baked so we never 404-then-API.)
const BAKED = new Set([
  // e.g. "vibe-happy", "style-pop", "topic-dog", ...
]);

const staticPath = (cat, id) => "/music-maker/icons/" + cat + "-" + id + ".webp";
const apiPath = (cat, id) =>
  "/api/images?kind=icon&cat=" + encodeURIComponent(cat) + "&id=" + encodeURIComponent(id) + "&v=2";

// Warm the browser/server cache for an icon (call on open). Uses the same source
// the component will render, so the <img> paints instantly afterwards.
export function preloadIcon(cat, id) {
  if (!cat || !id || typeof Image === "undefined") return;
  try {
    const img = new Image();
    img.src = BAKED.has(cat + "-" + id) ? staticPath(cat, id) : apiPath(cat, id);
  } catch {}
}

function Note({ size }) {
  const s = Math.round(size * 0.6);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6b6c93" strokeWidth="2" aria-hidden="true">
      <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="2.6" /><circle cx="16" cy="16" r="2.6" />
    </svg>
  );
}

export default function IconImg({ cat, id, size = 28, radius = 6 }) {
  // stage: 0 = static file, 1 = image library API, 2 = note glyph
  const firstStage = cat && id && BAKED.has(cat + "-" + id) ? 0 : 1;
  const [stage, setStage] = useState(firstStage);
  const [loaded, setLoaded] = useState(false);

  if (!cat || !id || stage > 1) {
    return (
      <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Note size={size} />
      </span>
    );
  }
  const src = stage === 0 ? staticPath(cat, id) : apiPath(cat, id);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {!loaded && <Note size={size} />}
      <img
        key={src}
        src={src} alt="" width={size} height={size} loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(false); setStage((s) => s + 1); }}
        style={{ position: loaded ? "static" : "absolute", width: size, height: size, objectFit: "cover", borderRadius: radius, display: "block", opacity: loaded ? 1 : 0, transition: "opacity .25s" }}
      />
    </span>
  );
}
