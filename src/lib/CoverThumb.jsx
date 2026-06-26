import { useState } from "react";

// Generated song cover art, served by the reusable image library (/api/images,
// cached in image_cache). Falls back to the song's color swatch + 🎵 if the
// cover isn't generated yet, the API is off-budget, or there's no OpenAI key.
// Pass `size` for a fixed square, or `fill` for a responsive full-width square.
export default function CoverThumb({ vibe, theme, color, size = 48, radius = 10, fill = false, emoji = "🎵" }) {
  const [failed, setFailed] = useState(false);
  const src =
    "/api/images?kind=cover&vibe=" + encodeURIComponent(vibe || "happy") +
    "&theme=" + encodeURIComponent(theme || "");
  const box = fill
    ? { width: "100%", aspectRatio: "1", borderRadius: radius, overflow: "hidden",
        background: color || "#5B6CFF", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: "60px" }
    : { width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0,
        background: color || "#5B6CFF", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: Math.round(size * 0.5) };
  if (failed) return <div style={box}>{emoji}</div>;
  const imgStyle = fill
    ? { width: "100%", height: "100%", objectFit: "cover", display: "block" }
    : { width: size, height: size, objectFit: "cover", display: "block" };
  return (
    <div style={box}>
      <img src={src} alt="" loading="lazy" style={imgStyle} onError={() => setFailed(true)} />
    </div>
  );
}
