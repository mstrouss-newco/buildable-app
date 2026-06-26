import { useState } from "react";

// A picker icon served by the reusable image library (/api/images?kind=icon).
// Shows the original emoji INSTANTLY as a placeholder, then fades the generated
// photo in on top once it loads. If the photo can't load (no key / off-budget /
// unknown id like Auto/None), the emoji simply stays.
export default function IconImg({ cat, id, emoji, size = 28, radius = 6 }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!cat || !id || failed) {
    return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>;
  }
  const src =
    "/api/images?kind=icon&cat=" + encodeURIComponent(cat) + "&id=" + encodeURIComponent(id) + "&v=2";
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {!loaded && <span style={{ position: "absolute", fontSize: Math.round(size * 0.82), lineHeight: 1 }}>{emoji}</span>}
      <img
        src={src} alt="" width={size} height={size} loading="lazy"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        style={{ width: size, height: size, objectFit: "cover", borderRadius: radius, display: "block", opacity: loaded ? 1 : 0, transition: "opacity .25s" }}
      />
    </span>
  );
}
