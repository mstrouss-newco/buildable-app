import { useState } from "react";

// A picker icon served by the reusable image library (/api/images?kind=icon).
// Shows the generated image; if it isn't generated yet, the API is off-budget,
// or the id has no icon (Auto/None/etc.), it falls back to the original emoji.
export default function IconImg({ cat, id, emoji, size = 28, radius = 6 }) {
  const [failed, setFailed] = useState(false);
  if (!cat || !id || failed) return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  const src =
    "/api/images?kind=icon&cat=" + encodeURIComponent(cat) + "&id=" + encodeURIComponent(id) + "&v=2";
  return (
    <img
      src={src} alt="" width={size} height={size} loading="lazy"
      style={{ width: size, height: size, objectFit: "cover", borderRadius: radius, display: "block" }}
      onError={() => setFailed(true)}
    />
  );
}
