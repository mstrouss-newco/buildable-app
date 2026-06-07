// /src/CreatorScreen.jsx
import { useState } from "react";

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
                    backgroundColor: theme === t ? "#ff9500" : "#e0e0e0",
                    color: theme === t ? "white" : "black"
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
                    backgroundColor: difficulty === d ? "#4CAF50" : "#e0e0e0",
                    color: difficulty === d ? "white" : "black"
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
              {levelLayers && <p style={{textAlign: 'center', fontSize: '12px', color: '#666'}}>{levelLayers.length} layers</p>}
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
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "30px 20px",
    fontFamily: "system-ui, -apple-system, sans-serif"
  },
  heading: {
    fontSize: "40px",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "10px",
    color: "#1a1a3e"
  },
  subtext: {
    fontSize: "18px",
    textAlign: "center",
    color: "#666",
    marginBottom: "30px"
  },
  contentArea: {
    display: "flex",
    gap: "30px",
    marginBottom: "30px",
    "@media (max-width: 900px)": {
      flexDirection: "column"
    }
  },
  inputSection: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "20px"
  },
  previewSection: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  textarea: {
    padding: "15px",
    fontSize: "16px",
    borderRadius: "12px",
    border: "3px solid #ffb700",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: "100px",
    backgroundColor: "white"
  },
  suggestedLabel: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#1a1a3e",
    marginBottom: "10px"
  },
  suggestedWords: {
    backgroundColor: "#f5f5f5",
    padding: "15px",
    borderRadius: "12px"
  },
  wordButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px"
  },
  wordButton: {
    padding: "6px 14px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "white",
    color: "#1a1a3e",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "13px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    transition: "all 0.2s"
  },
  selectorGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },
  label: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#1a1a3e"
  },
  buttonGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px"
  },
  themeButton: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.2s"
  },
  difficultyButton: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    fontWeight: "600",
    cursor: "pointer",
    fontSize: "14px",
    transition: "all 0.2s"
  },
  generateButton: {
    padding: "14px 24px",
    backgroundColor: "#4CAF50",
    color: "white",
    fontSize: "16px",
    fontWeight: "bold",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  continueButton: {
    padding: "16px 32px",
    backgroundColor: "#1a1a3e",
    color: "white",
    fontSize: "18px",
    fontWeight: "bold",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    textAlign: "center",
    transition: "all 0.2s"
  },
  regenerateButton: {
    padding: "10px 16px",
    backgroundColor: "#ffb700",
    color: "white",
    fontSize: "14px",
    fontWeight: "bold",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s"
  },
  previewImage: {
    width: "100%",
    borderRadius: "12px",
    backgroundColor: "#f5f5f5",
    objectFit: "cover"
  },
  placeholderBox: {
    width: "100%",
    aspectRatio: "1",
    backgroundColor: "#f5f5f5",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "3px dashed #ccc"
  },
  placeholderText: {
    fontSize: "60px",
    color: "#ccc",
    margin: 0
  },
  error: {
    color: "#d32f2f",
    fontSize: "14px",
    marginTop: "10px",
    padding: "10px",
    backgroundColor: "#ffebee",
    borderRadius: "8px"
  }
};

export default CharacterCreatorScreen;
