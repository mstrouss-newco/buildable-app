import { useState } from "react";

// A picker icon served by the reusable image library (/api/images?kind=icon).
// While the photo loads (and if it ever fails) it shows a faint music-note
// placeholder — never an emoji. Control options (Auto/None/Surprise) don't use
// this; MusicMaker draws those with a vector glyph instead.
function Note({ size }) {
  const s = Math.round(size * 0.6);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#6b6c93" strokeWidth="2" aria-hidden="true">
      <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="2.6" /><circle cx="16" cy="16" r="2.6" />
    </svg>
  );
}

export default function IconImg({ cat, id, size = 28, radius = 6 }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!cat || !id || failed) {
    return (
      <span style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Note size={size} />
      </span>
    );
  }
  const src =
    "/api/images?kind=icon&cat=" + encodeURIComponent(cat) + "&id=" + encodeURIComponent(id) + "&v=2";
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {!loaded && <Note size={size} />}
      <img
        src={src} alt="" width={size} height={size} loading="lazy"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        style={{ position: loaded ? "static" : "absolute", width: size, height: size, objectFit: "cover", borderRadius: radius, display: "block", opacity: loaded ? 1 : 0, transition: "opacity .25s" }}
      />
    </span>
  );
}
