// /src/TopBoard.jsx
// The public "Top Creations" board — a reflection of the central library.
// Three tabs (Songs / Games / Stories). Real hearts + play counts from
// /api/top-creations. Kids can heart others' work, play it, and remix it.
import { useState, useEffect } from "react";
import SongPlayer from "./lib/SongPlayer";
import CoverThumb from "./lib/CoverThumb";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%)," +
  "#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}

const TABS = [
  { id: "song", label: "Songs" },
  { id: "game", label: "Games" },
  { id: "story", label: "Stories" },
];

function Heart({ filled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "#FF5468" : "none"} stroke={filled ? "#FF5468" : "#9a93b8"} strokeWidth="2" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}
function PlayTri() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>); }
function RankBadge({ n }) {
  const m = { 1: ["#FCEAD3", "#C2701C"], 2: ["#ECECEC", "#8A8A8A"], 3: ["#F4DEC9", "#A86B3C"] }[n];
  if (m) return (<div style={{ width: 30, height: 30, borderRadius: "50%", background: m[0], color: m[1], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontFamily: FRED, flexShrink: 0 }}>{n}</div>);
  return (<div style={{ width: 30, textAlign: "center", color: "#7d77a0", fontWeight: 800, flexShrink: 0 }}>{n}</div>);
}

// Gradient tile + glyph — the safe fallback when a creation has no usable art.
function GlyphTile({ item }) {
  const bg = item.cover_color || "#5B6CFF";
  return (
    <div style={{ width: 52, height: 52, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {item.kind === "story"
        ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6c-2-1.3-4.5-1.3-7 0v12c2.5-1.3 5-1.3 7 0 2-1.3 4.5-1.3 7 0V6c-2.5-1.3-5-1.3-7 0z"/><path d="M12 6v12"/></svg>
        : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="9" width="18" height="9" rx="4.5"/><path d="M7 12v3M5.5 13.5h3"/><circle cx="16" cy="12.5" r="0.9"/><circle cx="18" cy="14.5" r="0.9"/></svg>}
    </div>
  );
}

// A creation's own art as a 52px tile, falling back to the glyph if it fails.
function ArtThumb({ item, src }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <GlyphTile item={item} />;
  return <img src={src} alt="" width={52} height={52} loading="lazy" style={{ borderRadius: 12, objectFit: "cover", flexShrink: 0, background: item.cover_color || "#5B6CFF" }} onError={() => setFailed(true)} />;
}

function Thumb({ item }) {
  // Songs keep their generated cover (vibe/theme).
  if (item.kind === "song") return <CoverThumb vibe={item.vibe} theme={item.theme} color={item.cover_color} size={52} radius={12} seed={item.id} label={item.title} />;
  // Everything else: use the creation's OWN art (thumbnail), else the glyph tile.
  const art = item.thumbnail || item.preview_image_url;
  return art ? <ArtThumb item={item} src={art} /> : <GlyphTile item={item} />;
}

export default function TopBoard({ onHome, onBack, onRemix }) {
  const [tab, setTab] = useState("song");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const deviceId = getDeviceId();

  async function load(kind) {
    setLoading(true);
    try {
      const r = await fetch("/api/top-creations?kind=" + kind + "&deviceId=" + encodeURIComponent(deviceId));
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch { setItems([]); }
    setLoading(false);
  }
  useEffect(() => { load(tab); }, [tab]);

  async function toggleHeart(item) {
    const on = !item.hearted;
    setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, hearted: on, heart_count: Math.max(0, (x.heart_count || 0) + (on ? 1 : -1)) } : x));
    try {
      await fetch("/api/heart-creation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: tab, id: item.id, deviceId, on }) });
    } catch { /* keep optimistic */ }
  }
  function countPlay(item) {
    fetch("/api/play-creation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: tab, id: item.id }) }).catch(() => {});
  }
  function play(item) {
    countPlay(item);
    if (item.kind === "game") window.location.href = "/play/" + item.id;
    else if (item.kind === "story") window.location.href = "/story.html?id=" + encodeURIComponent(item.id);
  }

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button onClick={onBack} style={s.navBtn}>← Back</button>
        <button onClick={onHome} style={s.navBtn}>Home</button>
      </div>

      <h1 style={s.heading}>Top Creations</h1>
      <p style={s.tagline}>See what other kids made. Tap a heart, play it, or remix it into your own!</p>

      <div style={s.tabRow}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...s.tab, background: tab === t.id ? GRAD : "rgba(255,255,255,0.06)", boxShadow: tab === t.id ? "0 6px 18px rgba(155,126,221,0.45)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={s.board}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={s.empty}>
            No published {tab === "song" ? "songs" : tab === "game" ? "games" : "stories"} yet.<br />
            Make one and tap <b>Publish</b> to share it here!
          </div>
        ) : (
          items.map((item, i) => (
            <div key={item.id} style={s.row}>
              <RankBadge n={i + 1} />
              <Thumb item={item} />
              <div style={s.info}>
                <div style={s.title}>{item.title || "Untitled"}</div>
                <div style={s.creator}>by {item.creator}{item.kind === "game" && item.mechanic ? " · " + item.mechanic : ""}</div>
              </div>

              <div style={s.metric}><PlayTri /><span>{(item.play_count || 0).toLocaleString()}</span></div>

              <button style={s.heartBtn} onClick={() => toggleHeart(item)} aria-label="Heart this">
                <Heart filled={item.hearted} />
                <span style={{ color: item.hearted ? "#FF5468" : "#cfc9e6", fontWeight: 800 }}>{(item.heart_count || 0).toLocaleString()}</span>
              </button>

              <div style={s.actions}>
                {item.kind === "song" ? (
                  <div style={{ width: 150 }}><SongPlayer src={item.audio_url} color={item.cover_color || "#7C5CFC"} size={44} onPlay={() => countPlay(item)} /></div>
                ) : (
                  <button style={s.playBtn} onClick={() => play(item)}><PlayTri />{item.kind === "story" ? "Read" : "Play"}</button>
                )}
                <button style={s.remixBtn} onClick={() => onRemix && onRemix(item)}>Remix</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, padding: "20px 16px 60px", fontFamily: NUN, display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 900, display: "flex", justifyContent: "space-between", marginBottom: 8 },
  navBtn: { fontFamily: NUN, fontWeight: 800, fontSize: 15, color: "#fff", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  heading: { fontFamily: FRED, fontSize: "clamp(22px, 5.5vw, 34px)", fontWeight: 700, color: "#fff", margin: "10px 0 2px", textAlign: "center" },
  tagline: { color: "#bdb6d8", fontSize: 15, margin: "0 0 18px", textAlign: "center", maxWidth: 560 },
  tabRow: { display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", justifyContent: "center" },
  tab: { fontFamily: FRED, fontWeight: 600, fontSize: 17, color: "#fff", border: "none", borderRadius: 999, padding: "10px 26px", cursor: "pointer" },
  board: { width: "100%", maxWidth: 900, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 22, overflow: "hidden" },
  empty: { padding: "60px 24px", textAlign: "center", color: "#bdb6d8", fontSize: 16, lineHeight: 1.6 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: FRED, fontSize: 18, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  creator: { fontSize: 13, color: "#9b95ba" },
  metric: { display: "flex", alignItems: "center", gap: 5, color: "#9b95ba", fontWeight: 800, fontSize: 14, minWidth: 60, justifyContent: "flex-end" },
  heartBtn: { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: "6px 8px", minWidth: 64 },
  actions: { display: "flex", alignItems: "center", gap: 8 },
  playBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#7C5CFC", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: NUN },
  remixBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "9px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: NUN },
};
