// /src/CreatorScreen.jsx
import { useState, useEffect } from "react";
import QuickGame from "./QuickGame";
import { getLearningSettings } from "./store";

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// Shared: load the visual asset library (real art) so kids can TAP pictures
// instead of only typing. Falls back gracefully if the endpoint is empty.
// ---------------------------------------------------------------------------
function useAssets(theme) {
  const [assets, setAssets] = useState({ layers: [], sprites: [], loading: true });
  useEffect(() => {
    let alive = true;
    const q = theme ? "?theme=" + encodeURIComponent(theme) : "";
    fetch("/api/list-assets" + q)
      .then((r) => r.json())
      .then((d) => { if (alive) setAssets({ layers: d.layers || [], sprites: d.sprites || [], loading: false }); })
      .catch(() => { if (alive) setAssets({ layers: [], sprites: [], loading: false }); });
    return () => { alive = false; };
  }, [theme]);
  return assets;
}

// ---------------------------------------------------------------------------
// Shared: load a random assortment of heroes from the Buildable Kids library
// (community_characters). Lets kids CHOOSE an existing hero instead of always
// making a new one. Every hero a kid creates is saved back to this library
// (see /api/generate-creature), so the pool grows and is reusable across kids.
// ---------------------------------------------------------------------------
function useCharacters(limit = 12) {
  const [state, setState] = useState({ characters: [], loading: true });
  useEffect(() => {
    let alive = true;
    fetch("/api/list-characters?limit=" + encodeURIComponent(limit))
      .then((r) => r.json())
      .then((d) => { if (alive) setState({ characters: d.characters || [], loading: false }); })
      .catch(() => { if (alive) setState({ characters: [], loading: false }); });
    return () => { alive = false; };
  }, [limit]);
  return state;
}

// A tappable picture tile.
function AssetTile({ imageUrl, label, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      ...styles.assetTile,
      border: selected ? "3px solid #d65a7b" : "2px solid rgba(155,126,221,0.3)",
      boxShadow: selected ? "0 8px 22px rgba(214,90,123,0.5)" : "none",
    }}>
      <img src={imageUrl} alt={label} style={styles.assetTileImg} loading="lazy" />
      {label && <span style={styles.assetTileLabel}>{label}</span>}
    </button>
  );
}

export function CharacterCreatorScreen({ onCharacterCreated, initialDescription }) {
  const [description, setDescription] = useState(initialDescription || "a fluffy pink dragon with sparkly wings");
  const [characterImage, setCharacterImage] = useState(null);
  const [characterName, setCharacterName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState([]);

  // Heroes the kid can CHOOSE from the shared Buildable Kids library — a random
  // assortment loads each visit. They can also build their own below.
  const { characters: libraryHeroes, loading: heroesLoading } = useCharacters(12);
  const TRAITS = [
    { word: "fluffy" }, { word: "tiny" }, { word: "giant" },
    { word: "sparkly" }, { word: "magical" }, { word: "rainbow" },
    { word: "golden" }, { word: "icy" }, { word: "fire" },
    { word: "striped" }, { word: "glowing" }, { word: "friendly" },
  ];

  const toggleTrait = (word) => {
    setPicked((prev) => {
      const next = prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word];
      // Keep the text description in sync so generation still works the same way.
      setDescription(next.length ? next.join(" ") + " creature" : "a friendly creature");
      return next;
    });
  };

  const generateCharacter = async () => {
    setLoading(true); setError(null);
    try {
      const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}`;
      const response = await fetch("/api/generate-creature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: { description, body: "creature" }, deviceId })
      });
      const data = await response.json();
      if (data.url) { setCharacterImage(data.url); setCharacterName(data.characterName || "Mystery Creature"); }
      else { setError(data.reason === "daily_budget_reached" ? "Daily image budget reached. Please try again tomorrow!" : "Couldn't generate character. Try different words!"); }
    } catch (err) { setError("Something went wrong. Try again!"); console.error(err); }
    finally { setLoading(false); }
  };

  const handleContinue = () => onCharacterCreated({ name: characterName, description, image: characterImage });

  // Choosing a hero from the library uses it directly (skips generation).
  const chooseHero = (hero) => onCharacterCreated({
    name: hero.name, description: hero.description || hero.name, image: hero.image,
  });

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Make your hero!</h1>
      <p style={styles.subtext}>Choose a hero from our library — or build your own by tapping pictures and words!</p>

      <div style={styles.contentArea}>
        <div style={styles.inputSection}>
          {/* Choose a hero from the Buildable Kids library (random assortment) */}
          {(heroesLoading || libraryHeroes.length > 0) && (
            <div style={styles.pickerCard}>
              <p style={styles.pickerLabel}>Choose a hero:</p>
              {heroesLoading ? (
                <p style={styles.heroHint}>Loading heroes…</p>
              ) : (
                <div style={styles.tileWrap}>
                  {libraryHeroes.map((h) => (
                    <button key={h.id} onClick={() => chooseHero(h)} style={styles.heroTile} title={h.name}>
                      <img src={h.image} alt={h.name} style={styles.heroTileImg} loading="lazy" />
                      <span style={styles.assetTileLabel}>{h.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <p style={styles.heroHint}>Tap a hero to use it — or build your own below</p>
            </div>
          )}

          {/* Visual trait picker */}
          <div style={styles.pickerCard}>
            <p style={styles.pickerLabel}>Tap how your hero looks:</p>
            <div style={styles.tileWrap}>
              {TRAITS.map((t) => (
                <button key={t.word} onClick={() => toggleTrait(t.word)} style={{
                  ...styles.traitChip,
                  background: picked.includes(t.word) ? GRAD : "rgba(255,255,255,0.08)",
                  color: picked.includes(t.word) ? "#fff" : "#e9e6f5",
                }}>
                  <span>{t.word}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Optional words box (kept for kids who want to type) */}
          <details style={styles.detailsBox}>
            <summary style={styles.detailsSummary}>Or type your own words</summary>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., a tiny fluffy pink dragon with sparkly wings..." style={styles.textarea} />
          </details>

          <button onClick={generateCharacter} disabled={loading || !description.trim()}
            style={{ ...styles.generateButton, opacity: loading || !description.trim() ? 0.6 : 1,
              cursor: loading || !description.trim() ? "not-allowed" : "pointer" }}>
            {loading ? "Generating..." : "Make my character!"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.previewSection}>
          {characterImage ? (
            <>
              <img src={characterImage} alt="Your character" style={styles.previewImage} />
              {characterName && <p style={{textAlign: 'center', fontWeight: 'bold', marginTop: '10px'}}>{characterName}</p>}
              <button onClick={generateCharacter} style={styles.regenerateButton}>Regenerate</button>
            </>
          ) : (
            <div style={styles.placeholderBox}><p style={styles.placeholderText}>?</p></div>
          )}
        </div>
      </div>

      {characterImage && (
        <button onClick={handleContinue} style={styles.continueButton}>Next: Build your world! →</button>
      )}
    </div>
  );
}

export function LevelCreatorScreen({ onLevelCreated, characterData, initialTheme }) {
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState(["forest","castle","underwater","space","desert","volcano","candy kingdom"].includes(initialTheme) ? initialTheme : "forest");
  const [difficulty, setDifficulty] = useState("easy");
  const [levelImage, setLevelImage] = useState(null);
  const [levelLayers, setLevelLayers] = useState(null);
  const [levelName, setLevelName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const themeOptions = ["forest", "castle", "underwater", "space", "desert", "volcano", "candy kingdom"];
  const difficultyOptions = ["easy", "medium", "hard"];

  // Show real background art for the chosen theme so kids SEE the world.
  const { layers } = useAssets(theme);
  const previewLayer = layers.find((l) => /sky|background|midground/i.test(l.type || "")) || layers[0];

  const generateLevel = async () => {
    setLoading(true); setError(null);
    try {
      const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}`;
      const response = await fetch("/api/generate-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: { description, theme, difficulty }, deviceId })
      });
      const data = await response.json();
      if (data.previewUrl) { setLevelImage(data.previewUrl); setLevelLayers(data.layers || []); setLevelName(data.levelName || "Unnamed World"); }
      else { setError(data.reason === "daily_budget_reached" ? "Daily image budget reached. Please try again tomorrow!" : "Couldn't generate world. Try different words!"); }
    } catch (err) { setError("Something went wrong. Try again!"); console.error(err); }
    finally { setLoading(false); }
  };

  const [levelGate, setLevelGate] = useState(false);
  const doContinue = () => onLevelCreated({ name: levelName, description, theme, difficulty, previewImage: levelImage, layers: levelLayers, character: characterData });
  const handleContinue = () => {
    const ls = getLearningSettings();
    if (ls.enabled) { setLevelGate(true); return; } // one quick question before play
    doContinue();
  };

  if (levelGate) {
    return (
      <QuickGame
        goal={getLearningSettings().goal}
        gameType="level"
        title="One quick game before you play!"
        onPass={() => { setLevelGate(false); doContinue(); }}
      />
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Build your world!</h1>
      <p style={styles.subtext}>Tap a world to see it — pick the one you like best!</p>

      <div style={styles.contentArea}>
        <div style={styles.inputSection}>
          {/* Visual theme picker: each card shows the real sky art for that theme */}
          <div style={styles.selectorGroup}>
            <label style={styles.label}>Pick a world:</label>
            <div style={styles.themeGrid}>
              {themeOptions.map((t) => {
                return (
                  <ThemeCard key={t} theme={t}
                    selected={theme === t} onClick={() => setTheme(t)} />
                );
              })}
            </div>
          </div>

          {/* Difficulty as simple visual buttons */}
          <div style={styles.selectorGroup}>
            <label style={styles.label}>How hard should it be?</label>
            <div style={styles.buttonGroup}>
              {difficultyOptions.map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} style={{
                  ...styles.difficultyButton,
                  background: difficulty === d ? GRAD : "rgba(255,255,255,0.07)",
                  color: difficulty === d ? "#fff" : "#cfc9e6",
                  boxShadow: difficulty === d ? "0 6px 16px rgba(155,126,221,0.45)" : "none"
                }}>
                  <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", marginRight: "7px", verticalAlign: "middle", background: d === "easy" ? "#46d17f" : d === "medium" ? "#f5c451" : "#ef6b6b" }} />{d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Optional words box */}
          <details style={styles.detailsBox}>
            <summary style={styles.detailsSummary}>Or describe it in your own words</summary>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., a spooky haunted castle with floating ghosts..." style={styles.textarea} />
          </details>

          <button onClick={generateLevel} disabled={loading} style={{
            ...styles.generateButton, opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Building world..." : "Make my world!"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.previewSection}>
          {levelImage ? (
            <>
              <img src={levelImage} alt="Your level" style={styles.previewImage} />
              {levelName && <p style={{textAlign: 'center', fontWeight: 'bold', marginTop: '10px'}}>{levelName}</p>}
              {levelLayers && <p style={{textAlign: 'center', fontSize: '12px', color: '#9c97b8'}}>{levelLayers.length} layers</p>}
              <button onClick={generateLevel} style={styles.regenerateButton}>Regenerate</button>
            </>
          ) : previewLayer ? (
            <>
              <img src={previewLayer.imageUrl} alt="World preview" style={styles.previewImage} />
              <p style={{textAlign: 'center', fontSize: '13px', color: '#9c97b8'}}>Preview of your {theme} world</p>
            </>
          ) : (
            <div style={styles.placeholderBox}><p style={styles.placeholderText}>?</p></div>
          )}
        </div>
      </div>

      {levelImage && (
        <button onClick={handleContinue} style={styles.continueButton}>Next: Play your game! →</button>
      )}
    </div>
  );
}

// A theme card that loads and shows that theme's real sky art.
function ThemeGlyph({ theme, size = 40 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "#e6def7", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (theme) {
    case "forest": return (<svg {...p}><path d="M12 3l5 8h-3l3 5H7l3-5H7z"/><path d="M12 16v4"/></svg>);
    case "castle": return (<svg {...p}><path d="M4 21V9l2 1V7l2 1V6l2 1 2-1v2l2-1v3l2-1v12z"/><path d="M10 21v-4h4v4"/></svg>);
    case "underwater": return (<svg {...p}><path d="M3 8c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 13c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/><path d="M3 18c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/></svg>);
    case "space": return (<svg {...p}><circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(-20 12 12)"/></svg>);
    case "desert": return (<svg {...p}><path d="M12 21V6"/><path d="M12 12H9.5a2 2 0 0 1-2-2V9"/><path d="M12 14h2.5a2 2 0 0 0 2-2v-1"/></svg>);
    case "volcano": return (<svg {...p}><path d="M3 21l6-11 3 4 2-3 7 10z"/><path d="M9 10c0-2 2-2 2-4"/></svg>);
    case "candy kingdom": return (<svg {...p}><circle cx="10" cy="9" r="5"/><path d="M10 14v7"/></svg>);
    default: return (<svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>);
  }
}

function ThemeCard({ theme, selected, onClick }) {
  const { layers } = useAssets(theme);
  const art = layers.find((l) => /sky/i.test(l.type || "")) || layers[0];
  return (
    <button onClick={onClick} style={{
      ...styles.themeCard,
      border: selected ? "3px solid #d65a7b" : "2px solid rgba(155,126,221,0.3)",
      boxShadow: selected ? "0 8px 22px rgba(214,90,123,0.5)" : "none",
    }}>
      {art ? <img src={art.imageUrl} alt={theme} style={styles.themeCardImg} loading="lazy" />
           : <div style={styles.themeCardFallback}><ThemeGlyph theme={theme} size={40} /></div>}
      <span style={styles.themeCardLabel}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
    </button>
  );
}

const styles = {
  container: { maxWidth: "1100px", margin: "0 auto", padding: "10px 0 30px", fontFamily: NUN, color: "#fff" },
  heading: { fontFamily: FRED, fontSize: "clamp(24px, 6.5vw, 40px)", fontWeight: "700", textAlign: "center", marginBottom: "8px", color: "#fff", textShadow: "0 0 30px rgba(155,126,221,0.5)" },
  subtext: { fontSize: "18px", textAlign: "center", color: "#b8b3d0", marginBottom: "30px", fontWeight: "600" },
  contentArea: { display: "flex", gap: "26px", marginBottom: "26px", flexWrap: "wrap" },
  inputSection: { flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "18px" },
  previewSection: { flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "12px" },
  textarea: { padding: "16px", fontSize: "16px", borderRadius: "16px", border: "2px solid rgba(155,126,221,0.4)", fontFamily: "inherit", resize: "vertical", minHeight: "90px", background: "rgba(0,0,0,0.28)", color: "#fff", outline: "none", width: "100%", marginTop: "10px", boxSizing: "border-box" },
  pickerCard: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(155,126,221,0.2)", padding: "16px", borderRadius: "18px" },
  pickerLabel: { fontSize: "15px", fontWeight: "800", color: "#fff", marginBottom: "12px" },
  tileWrap: { display: "flex", flexWrap: "wrap", gap: "10px" },
  traitChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 14px", borderRadius: "16px", border: "1px solid rgba(155,126,221,0.3)", fontWeight: "700", cursor: "pointer", fontSize: "13px", fontFamily: NUN, minWidth: "70px" },
  assetTile: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "8px", borderRadius: "16px", background: "rgba(0,0,0,0.25)", cursor: "pointer" },
  assetTileImg: { width: "56px", height: "56px", objectFit: "contain", imageRendering: "pixelated" },
  assetTileLabel: { fontSize: "11px", fontWeight: "700", color: "#e9e6f5" },
  heroTile: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "8px", width: "92px", borderRadius: "16px", background: "rgba(0,0,0,0.25)", border: "2px solid rgba(155,126,221,0.3)", cursor: "pointer", fontFamily: NUN },
  heroTileImg: { width: "72px", height: "72px", objectFit: "contain", borderRadius: "12px", background: "rgba(255,255,255,0.06)" },
  heroHint: { fontSize: "12px", color: "#b8b3d0", fontWeight: "700", marginTop: "10px" },
  detailsBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(155,126,221,0.18)", borderRadius: "14px", padding: "10px 14px" },
  detailsSummary: { cursor: "pointer", fontWeight: "700", color: "#cfc9e6", fontSize: "14px" },
  selectorGroup: { display: "flex", flexDirection: "column", gap: "10px" },
  label: { fontSize: "16px", fontWeight: "700", color: "#fff" },
  buttonGroup: { display: "flex", flexWrap: "wrap", gap: "10px" },
  themeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px" },
  themeCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "6px", borderRadius: "16px", background: "rgba(0,0,0,0.25)", cursor: "pointer", overflow: "hidden" },
  themeCardImg: { width: "100%", height: "78px", objectFit: "cover", borderRadius: "10px" },
  themeCardFallback: { width: "100%", height: "78px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(155,126,221,0.18)" },
  themeCardLabel: { fontSize: "13px", fontWeight: "800", color: "#fff", paddingBottom: "4px" },
  difficultyButton: { padding: "10px 16px", borderRadius: "12px", border: "none", fontWeight: "700", cursor: "pointer", fontSize: "14px", fontFamily: NUN },
  generateButton: { padding: "16px 24px", background: GRAD, color: "#fff", fontSize: "17px", fontWeight: "800", fontFamily: FRED, borderRadius: "16px", border: "none", cursor: "pointer", boxShadow: "0 10px 28px rgba(155,126,221,0.45)" },
  continueButton: { padding: "18px 32px", background: GRAD, color: "#fff", fontSize: "19px", fontWeight: "800", fontFamily: FRED, borderRadius: "18px", border: "none", cursor: "pointer", textAlign: "center", boxShadow: "0 12px 32px rgba(155,126,221,0.5)", display: "block", margin: "0 auto", maxWidth: "420px", width: "100%" },
  regenerateButton: { padding: "11px 18px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", fontSize: "14px", fontWeight: "700", borderRadius: "12px", cursor: "pointer", fontFamily: NUN },
  previewImage: { width: "100%", borderRadius: "18px", background: "rgba(0,0,0,0.3)", objectFit: "cover", border: "1px solid rgba(155,126,221,0.25)" },
  placeholderBox: { width: "100%", aspectRatio: "1", background: "rgba(255,255,255,0.04)", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed rgba(155,126,221,0.35)" },
  placeholderText: { fontSize: "clamp(30px, 8.5vw, 60px)", color: "rgba(155,126,221,0.5)", margin: 0 },
  error: { color: "#ff9a9a", fontSize: "14px", marginTop: "10px", padding: "12px", background: "rgba(214,90,123,0.12)", border: "1px solid rgba(214,90,123,0.3)", borderRadius: "12px" }
};

export default CharacterCreatorScreen;
