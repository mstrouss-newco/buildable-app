// /src/MyStuff.jsx
// The "My Stuff" library: shows everything a child has saved
// (characters, levels, and later sounds) so they can reuse it.
import { useState, useEffect } from "react";
import { shareCreation } from "./lib/shareSheet";
import CoverThumb from "./lib/CoverThumb";
import SongPlayer from "./lib/SongPlayer";
import {
  listCharacters,
  deleteCharacter,
  listLevels,
  deleteLevel,
  listSounds,
  onLibraryChange,
  getProgress,
  getLearningSettings,
  BADGES,
} from "./store";

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%)," +
  "#0a0a14";
const CARD_BG = "rgba(255,255,255,0.05)";
const CARD_BORDER = "1px solid rgba(155,126,221,0.22)";

function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("deviceId", id);
    }
    return id;
  } catch { return "dev_anon"; }
}
function getKidProfileId() {
  try {
    const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null");
    return k && k.id ? k.id : null;
  } catch { return null; }
}

export default function MyStuffScreen({ onUseCharacter, onUseLevel, onBack, onHome, initialTab }) {
  const [tab, setTab] = useState(initialTab || "characters");
  const [characters, setCharacters] = useState(listCharacters());
  const [levels, setLevels] = useState(listLevels());
  const [sounds, setSounds] = useState(listSounds());
  const [songs, setSongs] = useState([]);

  async function loadSongs() {
    try {
      const deviceId = getDeviceId();
      const kid = getKidProfileId();
      const r = await fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId) +
        (kid ? "&kidProfileId=" + encodeURIComponent(kid) : ""));
      const j = await r.json();
      setSongs(Array.isArray(j.songs) ? j.songs : []);
    } catch { /* ignore */ }
  }
  async function removeSong(songId) {
    try {
      await fetch("/api/delete-song", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), songId }),
      });
      setSongs((prev) => prev.filter((x) => x.song_id !== songId));
    } catch { /* ignore */ }
  }
  useEffect(() => { loadSongs(); }, []);

  // Refresh when the saved library finishes loading or anything is saved/deleted.
  useEffect(() => {
    const refresh = () => {
      setCharacters([...listCharacters()]);
      setLevels([...listLevels()]);
      setSounds([...listSounds()]);
    };
    refresh();
    return onLibraryChange(refresh);
  }, []);

  const removeCharacter = (id) => {
    deleteCharacter(id);
    setCharacters(listCharacters());
  };
  const removeLevel = (id) => {
    deleteLevel(id);
    setLevels(listLevels());
  };

  const tabs = [
    { id: "characters", label: "My Characters", count: characters.length },
    { id: "levels", label: "My Levels", count: levels.length },
    { id: "songs", label: "My Songs", count: songs.length },
  ];

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button onClick={onBack} style={s.navBtn}>← Back</button>
        <button onClick={onHome} style={s.navBtn}>Home</button>
      </div>

      <h1 style={s.heading}>My Stuff</h1>
      <p style={s.tagline}>Everything you've made. Tap "Use" to put it in a new game!</p>

      <BadgeShelf />

      <div style={s.tabRow}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              ...s.tab,
              background: tab === t.id ? GRAD : "rgba(255,255,255,0.06)",
              color: "#fff",
              boxShadow: tab === t.id ? "0 6px 18px rgba(155,126,221,0.45)" : "none",
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ---------- Characters ---------- */}
      {tab === "characters" && (
        characters.length === 0 ? (
          <div style={s.grid}><button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button></div>
        ) : (
          <div style={s.grid}>
            <button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button>
            {characters.map((c) => (
              <div key={c.id} style={s.card}>
                {c.image ? (
                  <img src={c.image} alt={c.name} style={s.cardImage} />
                ) : (
                  <div style={s.noImage}><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4.4 3.4-7 7.5-7s7.5 2.6 7.5 7"/></svg></div>
                )}
                <h3 style={s.cardTitle}>{c.name}</h3>
                <p style={s.cardDesc}>{c.description}</p>
                <div style={s.cardActions}>
                  <button style={s.useBtn} onClick={() => onUseCharacter && onUseCharacter(c)}>
                    Use
                  </button>
                  <button style={s.deleteBtn} onClick={() => removeCharacter(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ---------- Levels ---------- */}
      {tab === "levels" && (
        levels.length === 0 ? (
          <div style={s.grid}><button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button></div>
        ) : (
          <div style={s.grid}>
            <button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button>
            {levels.map((l) => (
              <div key={l.id} style={s.card}>
                {l.image ? (
                  <img src={l.image} alt={l.name} style={s.cardImage} />
                ) : (
                  <div style={s.noImage}><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18l5-6 4 4 3-4 6 6"/><circle cx="8" cy="7" r="2"/></svg></div>
                )}
                <h3 style={s.cardTitle}>{l.name}</h3>
                <p style={s.cardDesc}>
                  {l.theme}{l.difficulty ? ` · ${l.difficulty}` : ""}
                </p>
                <div style={s.cardActions}>
                  <button style={s.useBtn} onClick={() => onUseLevel && onUseLevel(l)}>
                    Use
                  </button>
                  <button style={s.deleteBtn} onClick={() => removeLevel(l.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ---------- Songs ---------- */}
      {tab === "songs" && (
        songs.length === 0 ? (
          <div style={s.grid}><button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button></div>
        ) : (
          <div style={s.grid}>
            <button style={s.addCard} onClick={onHome} aria-label="Make something new"><span style={s.addPlus}>+</span><span style={s.addText}>Make new</span></button>
            {songs.map((sg) => (
              <div key={sg.song_id} style={s.card}>
                <CoverThumb vibe={sg.vibe} theme={sg.theme} color={sg.cover_color} fill radius={0} />
                <h3 style={s.cardTitle}>{sg.title}</h3>
                <p style={s.cardDesc}>{[sg.vibe, sg.theme].filter(Boolean).join(" · ")}</p>
                <div style={{ padding: "0 14px 12px" }}><SongPlayer src={sg.audio_url} color={sg.cover_color || "#5B6CFF"} size={64} /></div>
                <div style={s.cardActions}>
                  <button style={s.useBtn} onClick={() => shareCreation({ kind: "song", id: sg.song_id, title: sg.title })}>Share</button>
                  <button style={s.deleteBtn} onClick={() => removeSong(sg.song_id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// Kid-facing badge shelf. Only appears when Learning Mode is on AND at least one
// badge is earned, so it never nags an empty shelf. Earned badges are full
// color; the rest are dimmed "still to earn". No emoji — SVG rosette marks.
function KidBadgeMark({ on, size = 56 }) {
  const ribbon = on ? "#FFC75A" : "rgba(255,255,255,0.08)";
  const ribbonEdge = on ? "#F0972A" : "rgba(255,255,255,0.16)";
  const check = on ? "#7a4b00" : "rgba(255,255,255,0.22)";
  const tail = on ? "#d65a7b" : "rgba(255,255,255,0.08)";
  const tailEdge = on ? "#b5396e" : "rgba(255,255,255,0.16)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="26" r="18" fill={ribbon} stroke={ribbonEdge} strokeWidth="2.5" />
      <path d="M24 26.5l5.5 5.5 11-12" fill="none" stroke={check} strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 41 L21 60 L32 53 L43 60 L39 41 Z" fill={tail} stroke={tailEdge} strokeWidth="1.5" />
    </svg>
  );
}

function BadgeShelf() {
  const learning = getLearningSettings();
  const p = getProgress();
  const earned = new Set(p.badges || []);
  if (!learning.enabled || earned.size === 0) return null;
  return (
    <div style={s.shelfWrap}>
      <h2 style={s.shelfHeading}>My Badges</h2>
      <div style={s.shelfRow}>
        {BADGES.map((b) => {
          const on = earned.has(b.id);
          return (
            <div key={b.id} style={s.shelfBadge} title={b.description}>
              <KidBadgeMark on={on} />
              <span style={{ ...s.shelfBadgeLabel, opacity: on ? 1 : 0.4 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={s.empty}>
      <p>{text}</p>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    background: PAGE_BG,
    padding: "24px 20px 60px",
    fontFamily: NUN,
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  topBar: {
    width: "100%",
    maxWidth: "1000px",
    display: "flex",
    gap: "10px",
    marginBottom: "22px",
  },
  navBtn: {
    padding: "11px 20px",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "14px",
    fontWeight: "700",
    fontFamily: NUN,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
  },
  heading: {
    fontFamily: FRED,
    fontSize: "44px",
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: "8px",
    textShadow: "0 0 34px rgba(155,126,221,0.55)",
  },
  tagline: {
    fontSize: "18px",
    color: "#b8b3d0",
    textAlign: "center",
    marginBottom: "26px",
    fontWeight: "600",
  },
  tabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "30px",
  },
  tab: {
    padding: "12px 22px",
    borderRadius: "30px",
    border: "1px solid rgba(155,126,221,0.25)",
    fontWeight: "800",
    fontSize: "15px",
    cursor: "pointer",
    fontFamily: NUN,
  },
  addCard: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 200, background: "rgba(155,126,221,0.08)", border: "2px dashed rgba(155,126,221,0.5)", borderRadius: 20, cursor: "pointer" },
  addPlus: { fontSize: 54, fontWeight: 300, lineHeight: 1, color: "#c9bff0" },
  addText: { fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FRED },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "20px",
    maxWidth: "1000px",
    width: "100%",
  },
  card: {
    background: CARD_BG,
    border: CARD_BORDER,
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column",
    backdropFilter: "blur(12px)",
  },
  cardImage: {
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover",
    background: "rgba(0,0,0,0.3)",
  },
  noImage: {
    width: "100%",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "60px",
    background: "rgba(0,0,0,0.25)",
  },
  cardTitle: {
    fontFamily: FRED,
    fontSize: "19px",
    fontWeight: "600",
    color: "#fff",
    margin: "14px 16px 4px",
  },
  cardDesc: {
    fontSize: "13px",
    color: "#aaa4c4",
    margin: "0 16px 12px",
    flex: 1,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardActions: {
    display: "flex",
    gap: "8px",
    padding: "0 16px 16px",
  },
  useBtn: {
    flex: 1,
    padding: "11px",
    background: GRAD,
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "14px",
    fontFamily: NUN,
    boxShadow: "0 6px 16px rgba(155,126,221,0.4)",
  },
  deleteBtn: {
    padding: "11px 15px",
    background: "rgba(255,255,255,0.06)",
    color: "#ff9a9a",
    border: "1px solid rgba(214,90,123,0.3)",
    borderRadius: "12px",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "14px",
    fontFamily: NUN,
  },
  shelfWrap: {
    width: "100%", maxWidth: "1000px", margin: "0 auto 24px",
    background: CARD_BG, border: CARD_BORDER, borderRadius: "20px",
    padding: "18px 20px", boxShadow: "0 16px 44px rgba(0,0,0,0.35)",
  },
  shelfHeading: {
    fontFamily: FRED, fontSize: "22px", fontWeight: "700", color: "#fff",
    textAlign: "center", margin: "0 0 14px",
  },
  shelfRow: { display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" },
  shelfBadge: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "84px" },
  shelfBadgeLabel: { fontSize: "12px", fontWeight: "700", textAlign: "center", lineHeight: 1.25, color: "#fff" },
  empty: {
    background: CARD_BG,
    border: CARD_BORDER,
    borderRadius: "20px",
    padding: "50px 30px",
    textAlign: "center",
    color: "#b8b3d0",
    fontSize: "17px",
    maxWidth: "600px",
    width: "100%",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
  },
};
