import { useState } from "react";

function Note({ s }) {
  const n = Math.round(s);
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" aria-hidden="true">
      <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="2.6" /><circle cx="16" cy="16" r="2.6" />
    </svg>
  );
}

// Generated song cover art (reusable image library, cached). Falls back to the
// song's color swatch + a vector music note if the cover isn't ready.
export default function CoverThumb({ vibe, theme, color, size = 48, radius = 10, fill = false }) {
  const [failed, setFailed] = useState(false);
  const src = "/api/images?kind=cover&vibe=" + encodeURIComponent(vibe || "happy") + "&theme=" + encodeURIComponent(theme || "");
  const box = fill
    ? { width: "100%", aspectRatio: "1", borderRadius: radius, overflow: "hidden", background: color || "#5B6CFF", display: "flex", alignItems: "center", justifyContent: "center" }
    : { width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0, background: color || "#5B6CFF", display: "flex", alignItems: "center", justifyContent: "center" };
  if (failed) return <div style={box}><Note s={fill ? 44 : Math.round(size * 0.5)} /></div>;
  const imgStyle = fill ? { width: "100%", height: "100%", objectFit: "cover", display: "block" } : { width: size, height: size, objectFit: "cover", display: "block" };
  return (<div style={box}><img src={src} alt="" loading="lazy" style={imgStyle} onError={() => setFailed(true)} /></div>);
}
