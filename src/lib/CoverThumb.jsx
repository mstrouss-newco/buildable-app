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
//
// THE WARMING TRAP: the first ever request for a given cover returns 503
// {"error":"warming"} while the image is generated, and on Vercel the background
// warm never finishes, so a plain <img> errored once and the cover stayed blank
// forever. Adding &wait=1 makes the server generate it inline (~25s) and cache
// it, so we retry with that on the first failure. After that one slow load the
// cover URL is cached and paints instantly everywhere it appears.
export default function CoverThumb({ url = "", vibe, theme, color, size = 48, radius = 10, fill = false, seed = "", label = "" }) {
  // stage: 0 = normal request, 1 = retry asking the server to wait, 2 = give up
  const [stage, setStage] = useState(0);
  // MM2 — prefer the exact cover URL saved with the song so the same art shows
  // everywhere. Fall back to a deterministic cover derived from the song's choices.
  const base = url || ("/api/images?kind=cover&vibe=" + encodeURIComponent(vibe || "happy") + "&theme=" + encodeURIComponent(theme || "") +
    (seed ? "&seed=" + encodeURIComponent(seed) : "") + (label ? "&label=" + encodeURIComponent(label) : ""));
  const src = stage === 0 ? base : base + (base.indexOf("?") >= 0 ? "&" : "?") + "wait=1";
  const box = fill
    ? { width: "100%", aspectRatio: "1", borderRadius: radius, overflow: "hidden", background: color || "#5B6CFF", display: "flex", alignItems: "center", justifyContent: "center" }
    : { width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0, background: color || "#5B6CFF", display: "flex", alignItems: "center", justifyContent: "center" };
  if (stage > 1) return <div style={box}><Note s={fill ? 44 : Math.round(size * 0.5)} /></div>;
  const imgStyle = fill ? { width: "100%", height: "100%", objectFit: "cover", display: "block" } : { width: size, height: size, objectFit: "cover", display: "block" };
  return (
    <div style={box}>
      <img key={src} src={src} alt="" loading="lazy" style={imgStyle} onError={() => setStage((v) => v + 1)} />
    </div>
  );
}
