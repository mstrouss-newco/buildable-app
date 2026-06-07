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
              backgroundColor: tab === t.id ? "#1a1a3e" : "white",
              color: tab === t.id ? "white" : "#1a1a3e",
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
    background: "linear-gradient(135deg, #ffc107 0%, #ff9500 100%)",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  topBar: {
    width: "100%",
    maxWidth: "1000px",
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
  },
  navBtn: {
    padding: "10px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "20px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  heading: {
    fontSize: "44px",
    fontWeight: "900",
    color: "#1a1a3e",
    textAlign: "center",
    marginBottom: "10px",
  },
  tagline: {
    fontSize: "18px",
    color: "#333",
    textAlign: "center",
    marginBottom: "25px",
  },
  tabRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "30px",
  },
  tab: {
    padding: "12px 20px",
    borderRadius: "30px",
    border: "none",
    fontWeight: "700",
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "20px",
    maxWidth: "1000px",
    width: "100%",
  },
  card: {
    backgroundColor: "white",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
  },
  cardImage: {
    width: "100%",
    aspectRatio: "1",
    objectFit: "cover",
    backgroundColor: "#f5f5f5",
  },
  noImage: {
    width: "100%",
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "60px",
    backgroundColor: "#f5f5f5",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#1a1a3e",
    margin: "12px 14px 4px",
  },
  cardDesc: {
    fontSize: "13px",
    color: "#666",
    margin: "0 14px 12px",
    flex: 1,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardActions: {
    display: "flex",
    gap: "8px",
    padding: "0 14px 14px",
  },
  useBtn: {
    flex: 1,
    padding: "10px",
    backgroundColor: "#4CAF50",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "14px",
  },
  deleteBtn: {
    padding: "10px 14px",
    backgroundColor: "#f5f5f5",
    color: "#d32f2f",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
  },
  empty: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "50px 30px",
    textAlign: "center",
    color: "#666",
    fontSize: "17px",
    maxWidth: "600px",
    width: "100%",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
};
