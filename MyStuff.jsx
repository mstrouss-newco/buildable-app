// /src/MyStuff.jsx
// The "My Stuff" library: shows everything a child has saved
// (characters, levels, and later sounds) so they can reuse it.
import { useState } from "react";
import {
  listCharacters,
  deleteCharacter,
  listLevels,
  deleteLevel,
  listSounds,
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

export default function MyStuffScreen({ onUseCharacter, onUseLevel, onBack, onHome, initialTab }) {
  const [tab, setTab] = useState(initialTab || "characters");
  const [characters, setCharacters] = useState(listCharacters());
  const [levels, setLevels] = useState(listLevels());
  const [sounds] = useState(listSounds());

  const removeCharacter = (id) => {
    deleteCharacter(id);
    setCharacters(listCharacters());
  };
  const removeLevel = (id) => {
    deleteLevel(id);
    setLevels(listLevels());
  };

  const tabs = [
    { id: "characters", label: "My Characters", icon: "🦸", count: characters.length },
    { id: "levels", label: "My Levels", icon: "🌍", count: levels.length },
    { id: "sounds", label: "My Sounds", icon: "🎵", count: sounds.length },
  ];

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button onClick={onBack} style={s.navBtn}>← Back</button>
        <button onClick={onHome} style={s.navBtn}>🏠 Home</button>
      </div>

      <h1 style={s.heading}>📦 My Stuff</h1>
      <p style={s.tagline}>Everything you've made. Tap "Use" to put it in a new game!</p>

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
            {t.icon} {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* ---------- Characters ---------- */}
      {tab === "characters" && (
        characters.length === 0 ? (
          <Empty text="No characters yet! Make one and it'll show up here." />
        ) : (
          <div style={s.grid}>
            {characters.map((c) => (
              <div key={c.id} style={s.card}>
                {c.image ? (
                  <img src={c.image} alt={c.name} style={s.cardImage} />
                ) : (
                  <div style={s.noImage}>🦸</div>
                )}
                <h3 style={s.cardTitle}>{c.name}</h3>
                <p style={s.cardDesc}>{c.description}</p>
                <div style={s.cardActions}>
                  <button style={s.useBtn} onClick={() => onUseCharacter && onUseCharacter(c)}>
                    Use ▶
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
          <Empty text="No worlds yet! Build one and it'll show up here." />
        ) : (
          <div style={s.grid}>
            {levels.map((l) => (
              <div key={l.id} style={s.card}>
                {l.image ? (
                  <img src={l.image} alt={l.name} style={s.cardImage} />
                ) : (
                  <div style={s.noImage}>🌍</div>
                )}
                <h3 style={s.cardTitle}>{l.name}</h3>
                <p style={s.cardDesc}>
                  {l.theme}{l.difficulty ? ` · ${l.difficulty}` : ""}
                </p>
                <div style={s.cardActions}>
                  <button style={s.useBtn} onClick={() => onUseLevel && onUseLevel(l)}>
                    Use ▶
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

      {/* ---------- Sounds (coming soon) ---------- */}
      {tab === "sounds" && (
        <Empty text="🎵 Music and sounds are coming soon! You'll be able to save them here too." />
      )}
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
