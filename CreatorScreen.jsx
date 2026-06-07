// /src/CreatorScreen.jsx
import { useState } from "react";

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function CharacterCreatorScreen({ onCharacterCreated }) {
  const [description, setDescription] = useState("a fluffy pink dragon with sparkly wings");
  const [characterImage, setCharacterImage] = useState(null);
  const [characterName, setCharacterName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateCharacter = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}`;
      const response = await fetch("/api/generate-creature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: {
            description: description,
            body: "creature"
          },
          deviceId
        })
      });

      const data = await response.json();
      if (data.url) {
        setCharacterImage(data.url);
        setCharacterName(data.characterName || "Mystery Creature");
      } else {
        setError(data.reason === "daily_budget_reached" 
          ? "Daily image budget reached. Please try again tomorrow!" 
          : "Couldn't generate character. Try different words!");
      }
    } catch (err) {
      setError("Something went wrong. Try again!");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    onCharacterCreated({
      name: characterName,
      description,
      image: characterImage
    });
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Describe your hero!</h1>
      <p style={styles.subtext}>Type whatever you want — just like talking to an AI!</p>

      <div style={styles.contentArea}>
        <div style={styles.inputSection}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., a tiny fluffy pink dragon with sparkly wings..."
            style={styles.textarea}
          />

          <div style={styles.suggestedWords}>
            <p style={styles.suggestedLabel}>Stuck? Tap a word to add it:</p>
            <div style={styles.wordButtons}>
              {["fluffy", "tiny", "giant", "sparkly", "magical", "rainbow", "golden", "icy", "fire", "striped", "spotted", "glowing", "bouncy", "friendly"].map((word) => (
                <button
                  key={word}
                  onClick={() => setDescription(prev => `${prev} ${word}`)}
                  style={styles.wordButton}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generateCharacter}
            disabled={loading || !description.trim()}
            style={{
              ...styles.generateButton,
              opacity: loading || !description.trim() ? 0.6 : 1,
              cursor: loading || !description.trim() ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Generating... ✨" : "Generate my character!"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.previewSection}>
          {characterImage ? (
            <>
              <img src={characterImage} alt="Your character" style={styles.previewImage} />
              {characterName && <p style={{textAlign: 'center', fontWeight: 'bold', marginTop: '10px'}}>{characterName}</p>}
              <button onClick={generateCharacter} style={styles.regenerateButton}>
                Regenerate
              </button>
            </>
          ) : (
            <div style={styles.placeholderBox}>
              <p style={styles.placeholderText}>?</p>
            </div>
          )}
        </div>
      </div>

      {characterImage && (
        <button onClick={handleContinue} style={styles.continueButton}>
          Next: Build your world! →
        </button>
      )}
    </div>
  );
}

export function LevelCreatorScreen({ onLevelCreated, characterData }) {
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState("forest");
  const [difficulty, setDifficulty] = useState("easy");
  const [levelImage, setLevelImage] = useState(null);
  const [levelLayers, setLevelLayers] = useState(null);
  const [levelName, setLevelName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateLevel = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = localStorage.getItem('deviceId') || `device_${Date.now()}`;
      const response = await fetch("/api/generate-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: {
            description: description,
            theme: theme,
            difficulty: difficulty
          },
          deviceId
        })
      });

      const data = await response.json();
      if (data.previewUrl) {
        setLevelImage(data.previewUrl);
        setLevelLayers(data.layers || []);
        setLevelName(data.levelName || "Unnamed World");
      } else {
        setError(data.reason === "daily_budget_reached" 
          ? "Daily image budget reached. Please try again tomorrow!" 
          : "Couldn't generate world. Try different words!");
      }
    } catch (err) {
      setError("Something went wrong. Try again!");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    onLevelCreated({
      name: levelName,
      description,
      theme,
      difficulty,
      previewImage: levelImage,
      layers: levelLayers,
      character: characterData
    });
  };

  const themeOptions = ["forest", "castle", "underwater", "space", "desert", "volcano", "candy kingdom"];
  const difficultyOptions = ["easy", "medium", "hard"];

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Build your world!</h1>
      <p style={styles.subtext}>Describe the world where your character will play!</p>

      <div style={styles.contentArea}>
        <div style={styles.inputSection}>
          {/* Theme selector */}
          <div style={styles.selectorGroup}>
            <label style={styles.label}>Pick a theme:</label>
            <div style={styles.buttonGroup}>
              {themeOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  style={{
                    ...styles.themeButton,
                    background: theme === t ? GRAD : "rgba(255,255,255,0.07)",
                    color: theme === t ? "#fff" : "#cfc9e6",
                    boxShadow: theme === t ? "0 6px 16px rgba(155,126,221,0.45)" : "none"
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty selector */}
          <div style={styles.selectorGroup}>
            <label style={styles.label}>How hard should it be?</label>
            <div style={styles.buttonGroup}>
              {difficultyOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  style={{
                    ...styles.difficultyButton,
                    background: difficulty === d ? GRAD : "rgba(255,255,255,0.07)",
                    color: difficulty === d ? "#fff" : "#cfc9e6",
                    boxShadow: difficulty === d ? "0 6px 16px rgba(155,126,221,0.45)" : "none"
                  }}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Custom description */}
          <div style={styles.selectorGroup}>
            <label style={styles.label}>Or describe it in your own words:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., a spooky haunted castle with floating ghosts..."
              style={styles.textarea}
            />
          </div>

          <button
            onClick={generateLevel}
            disabled={loading}
            style={{
              ...styles.generateButton,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Generating world... ✨" : "Generate my world!"}
          </button>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.previewSection}>
          {levelImage ? (
            <>
              <img src={levelImage} alt="Your level" style={styles.previewImage} />
              {levelName && <p style={{textAlign: 'center', fontWeight: 'bold', marginTop: '10px'}}>{levelName}</p>}
              {levelLayers && <p style={{textAlign: 'center', fontSize: '12px', color: '#9c97b8'}}>{levelLayers.length} layers</p>}
              <button onClick={generateLevel} style={styles.regenerateButton}>
                Regenerate
              </button>
            </>
          ) : (
            <div style={styles.placeholderBox}>
              <p style={styles.placeholderText}>?</p>
            </div>
          )}
        </div>
      </div>

      {levelImage && (
        <button onClick={handleContinue} style={styles.continueButton}>
          Next: Play your game! →
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "10px 0 30px",
    fontFamily: NUN,
    color: "#fff"
  },
  heading: {
    fontFamily: FRED,
    fontSize: "40px",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: "8px",
    color: "#fff",
    textShadow: "0 0 30px rgba(155,126,221,0.5)"
  },
  subtext: {
    fontSize: "18px",
    textAlign: "center",
    color: "#b8b3d0",
    marginBottom: "30px",
    fontWeight: "600"
  },
  contentArea: {
    display: "flex",
    gap: "26px",
    marginBottom: "26px",
    flexWrap: "wrap"
  },
  inputSection: {
    flex: "1 1 320px",
    display: "flex",
    flexDirection: "column",
    gap: "18px"
  },
  previewSection: {
    flex: "1 1 280px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  textarea: {
    padding: "16px",
    fontSize: "16px",
    borderRadius: "16px",
    border: "2px solid rgba(155,126,221,0.4)",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: "110px",
    background: "rgba(0,0,0,0.28)",
    color: "#fff",
    outline: "none"
  },
  suggestedLabel: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#cfc9e6",
    marginBottom: "10px"
  },
  suggestedWords: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(155,126,221,0.2)",
    padding: "16px",
    borderRadius: "18px"
  },
  wordButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px"
  },
  wordButton: {
    padding: "7px 15px",
    borderRadius: "20px",
    border: "1px solid rgba(155,126,221,0.3)",
    background: "rgba(255,255,255,0.08)",
    color: "#e9e6f5",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: NUN
  },
  selectorGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },
  label: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#fff"
  },
  buttonGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px"
  },
  themeButton: {
    padding: "10px 16px",
    borderRadius: "12px",
    border: "none",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "14px",
    fontFamily: NUN
  },
  difficultyButton: {
    padding: "10px 16px",
    borderRadius: "12px",
    border: "none",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "14px",
    fontFamily: NUN
  },
  generateButton: {
    padding: "16px 24px",
    background: GRAD,
    color: "#fff",
    fontSize: "17px",
    fontWeight: "800",
    fontFamily: FRED,
    borderRadius: "16px",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(155,126,221,0.45)"
  },
  continueButton: {
    padding: "18px 32px",
    background: GRAD,
    color: "#fff",
    fontSize: "19px",
    fontWeight: "800",
    fontFamily: FRED,
    borderRadius: "18px",
    border: "none",
    cursor: "pointer",
    textAlign: "center",
    boxShadow: "0 12px 32px rgba(155,126,221,0.5)",
    display: "block",
    margin: "0 auto",
    maxWidth: "420px",
    width: "100%"
  },
  regenerateButton: {
    padding: "11px 18px",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: "14px",
    fontWeight: "700",
    borderRadius: "12px",
    cursor: "pointer",
    fontFamily: NUN
  },
  previewImage: {
    width: "100%",
    borderRadius: "18px",
    background: "rgba(0,0,0,0.3)",
    objectFit: "cover",
    border: "1px solid rgba(155,126,221,0.25)"
  },
  placeholderBox: {
    width: "100%",
    aspectRatio: "1",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px dashed rgba(155,126,221,0.35)"
  },
  placeholderText: {
    fontSize: "60px",
    color: "rgba(155,126,221,0.5)",
    margin: 0
  },
  error: {
    color: "#ff9a9a",
    fontSize: "14px",
    marginTop: "10px",
    padding: "12px",
    background: "rgba(214,90,123,0.12)",
    border: "1px solid rgba(214,90,123,0.3)",
    borderRadius: "12px"
  }
};

export default CharacterCreatorScreen;
