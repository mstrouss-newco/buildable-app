// /src/BuildableKids.jsx
// Main app flow: intro -> pick game -> make character -> build world -> play.
// Now with: a top navigation bar, auto-saving of every character/world
// to "My Stuff", and the ability to reuse saved creations.
import { useState, useEffect, useRef } from "react";
import { CharacterCreatorScreen, LevelCreatorScreen } from "./CreatorScreen";
import MyStuffScreen from "./MyStuff";
import AdminDashboard from "./AdminDashboard";
import { saveCharacter, saveLevel, libraryCounts } from "./store";

// Screens
const SCREEN_INTRO = "intro";
const SCREEN_GAME_TYPE = "game_type";
const SCREEN_CHARACTER_CREATOR = "character_creator";
const SCREEN_LEVEL_CREATOR = "level_creator";
const SCREEN_PLAY = "play";
const SCREEN_MY_STUFF = "my_stuff";
const SCREEN_ADMIN = "admin";

export default function BuildableKids() {
  const [screen, setScreen] = useState(SCREEN_INTRO);
  const [returnTo, setReturnTo] = useState(SCREEN_INTRO);
  const [gameData, setGameData] = useState({
    playerName: "",
    age: null,
    gameType: null,
    character: null,
    level: null,
  });

  const goHome = () => setScreen(SCREEN_INTRO);
  const openMyStuff = (from) => {
    setReturnTo(from);
    setScreen(SCREEN_MY_STUFF);
  };

  // When a child reuses a saved character from My Stuff
  const useSavedCharacter = (c) => {
    setGameData((prev) => ({
      ...prev,
      playerName: prev.playerName || "Friend",
      gameType: prev.gameType || "runner",
      character: { description: c.description, image: c.image },
    }));
    setScreen(SCREEN_LEVEL_CREATOR);
  };

  // When a child reuses a saved world from My Stuff
  const useSavedLevel = (l) => {
    setGameData((prev) => ({
      ...prev,
      playerName: prev.playerName || "Friend",
      gameType: prev.gameType || "runner",
      level: {
        description: l.description,
        theme: l.theme,
        difficulty: l.difficulty,
        image: l.image,
      },
    }));
    // need a character before playing
    setScreen(gameData.character ? SCREEN_PLAY : SCREEN_CHARACTER_CREATOR);
  };

  const myStuffNav = {
    onUseCharacter: useSavedCharacter,
    onUseLevel: useSavedLevel,
    onBack: () => setScreen(returnTo || SCREEN_INTRO),
    onHome: goHome,
  };

  // ============ INTRO SCREEN ============
  if (screen === SCREEN_INTRO) {
    return (
      <IntroScreen
        onComplete={(name, age) => {
          setGameData((prev) => ({ ...prev, playerName: name, age }));
          setScreen(SCREEN_GAME_TYPE);
        }}
        onMyStuff={() => openMyStuff(SCREEN_INTRO)}
        onAdmin={() => setScreen(SCREEN_ADMIN)}
      />
    );
  }

  // ============ GAME TYPE PICKER ============
  if (screen === SCREEN_GAME_TYPE) {
    return (
      <GameTypeScreen
        playerName={gameData.playerName}
        onGameSelected={(gameType) => {
          setGameData((prev) => ({ ...prev, gameType }));
          setScreen(SCREEN_CHARACTER_CREATOR);
        }}
        onBack={() => setScreen(SCREEN_INTRO)}
        onMyStuff={() => openMyStuff(SCREEN_GAME_TYPE)}
      />
    );
  }

  // ============ CHARACTER CREATOR ============
  if (screen === SCREEN_CHARACTER_CREATOR) {
    return (
      <div style={styles.container}>
        <TopNav
          onBack={() => setScreen(SCREEN_GAME_TYPE)}
          onHome={goHome}
          onMyStuff={() => openMyStuff(SCREEN_CHARACTER_CREATOR)}
        />
        <CharacterCreatorScreen
          onCharacterCreated={(character) => {
            saveCharacter(character); // auto-save to My Characters
            setGameData((prev) => ({ ...prev, character }));
            setScreen(SCREEN_LEVEL_CREATOR);
          }}
        />
      </div>
    );
  }

  // ============ LEVEL CREATOR ============
  if (screen === SCREEN_LEVEL_CREATOR) {
    return (
      <div style={styles.container}>
        <TopNav
          onBack={() => setScreen(SCREEN_CHARACTER_CREATOR)}
          onHome={goHome}
          onMyStuff={() => openMyStuff(SCREEN_LEVEL_CREATOR)}
        />
        <LevelCreatorScreen
          characterData={gameData.character}
          onLevelCreated={(level) => {
            saveLevel(level); // auto-save to My Levels
            setGameData((prev) => ({ ...prev, level }));
            setScreen(SCREEN_PLAY);
          }}
        />
      </div>
    );
  }

  // ============ PLAY GAME ============
  if (screen === SCREEN_PLAY) {
    return (
      <PlayGameScreen
        gameData={gameData}
        onBack={() => {
          setGameData({
            playerName: "",
            age: null,
            gameType: null,
            character: null,
            level: null,
          });
          setScreen(SCREEN_INTRO);
        }}
        onMyStuff={() => openMyStuff(SCREEN_PLAY)}
      />
    );
  }

  // ============ MY STUFF LIBRARY ============
  if (screen === SCREEN_MY_STUFF) {
    return <MyStuffScreen {...myStuffNav} />;
  }

  // ============ ADMIN DASHBOARD ============
  if (screen === SCREEN_ADMIN) {
    return <AdminDashboard onExit={() => setScreen(SCREEN_INTRO)} />;
  }
}

// ============ TOP NAVIGATION BAR ============
function TopNav({ onBack, onHome, onMyStuff }) {
  const counts = libraryCounts();
  const total = counts.characters + counts.levels + counts.sounds;
  return (
    <div style={styles.navInner}>
      <div style={{ display: "flex", gap: "10px" }}>
        {onBack && (
          <button onClick={onBack} style={styles.backButton}>← Back</button>
        )}
        {onHome && (
          <button onClick={onHome} style={styles.backButton}>🏠 Home</button>
        )}
      </div>
      <button onClick={onMyStuff} style={styles.myStuffButton}>
        📦 My Stuff{total ? ` (${total})` : ""}
      </button>
    </div>
  );
}

// ============ INTRO SCREEN COMPONENT ============
function IntroScreen({ onComplete, onMyStuff, onAdmin }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState(7);

  const handleClick = () => {
    if (name.trim()) {
      onComplete(name, age);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.introTopBar}>
        <button onClick={onAdmin} style={styles.myStuffButton}>🔐 Admin</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
      </div>

      <div style={styles.gameIcon}>🎮</div>
      <h1 style={styles.heading}>Buildable Kids</h1>
      <p style={styles.tagline}>Build your own game in 3 minutes!</p>

      <div style={styles.formCard}>
        <h2 style={styles.formHeading}>What's your name?</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your first name"
          style={styles.textInput}
          onKeyPress={(e) => e.key === "Enter" && handleClick()}
        />
        <p style={styles.helpText}>Just your first name — stays on this device.</p>
      </div>

      <div style={styles.formCard}>
        <h2 style={styles.formHeading}>How old are you?</h2>
        <div style={styles.ageButtons}>
          {[5, 6, 7, 8, 9, 10, 11, 12].map((a) => (
            <button
              key={a}
              onClick={() => setAge(a)}
              style={{
                ...styles.ageButton,
                backgroundColor: age === a ? "#ff9500" : "#e0e0e0",
                color: age === a ? "white" : "#333",
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleClick}
        disabled={!name.trim()}
        style={{
          ...styles.primaryButton,
          opacity: !name.trim() ? 0.6 : 1,
          cursor: !name.trim() ? "not-allowed" : "pointer",
        }}
      >
        Let's build! →
      </button>
    </div>
  );
}

// ============ GAME TYPE PICKER COMPONENT ============
function GameTypeScreen({ playerName, onGameSelected, onBack, onMyStuff }) {
  const games = [
    { id: "runner", name: "Runner", icon: "🏃", description: "Jump and duck through obstacles!" },
    { id: "flying", name: "Flying", icon: "🚀", description: "Blast enemies while you fly!" },
    { id: "maze", name: "Maze", icon: "🗺️", description: "Find keys, unlock doors, get treasure!" },
    { id: "match", name: "Match Magic", icon: "✨", description: "Match 3 or more to make them POP!" },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
      </div>

      <h1 style={styles.heading}>Pick your game</h1>
      <p style={styles.tagline}>Four totally different ways to play!</p>

      <div style={styles.gameGrid}>
        {games.map((game) => (
          <button key={game.id} onClick={() => onGameSelected(game.id)} style={styles.gameCard}>
            <div style={styles.gameIcon}>{game.icon}</div>
            <h3 style={styles.gameCardTitle}>{game.name}</h3>
            <p style={styles.gameCardDescription}>{game.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ PLAY GAME SCREEN COMPONENT ============
function PlayGameScreen({ gameData, onBack, onMyStuff }) {
  const [gameHtml, setGameHtml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dots, setDots] = useState(".");
  const iframeRef = useRef(null);

  // Animate the loading dots
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  // Auto-generate the game on mount
  useEffect(() => {
    let cancelled = false;

    const generateGame = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/generate-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameData }),
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        if (data.html) {
          setGameHtml(data.html);
        } else {
          setError("Couldn't generate the game. Try again!");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Game generation error:", err);
          setError("Something went wrong building your game. Try again!");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    generateGame();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject the generated HTML into the iframe
  useEffect(() => {
    if (gameHtml && iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(gameHtml);
        doc.close();
      }
    }
  }, [gameHtml]);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
      </div>

      <h1 style={styles.heading}>
        {loading ? "Building your game" + dots : gameHtml ? "🎮 " + (gameData.level?.name || "Your Game") + "!" : "Uh oh!"}
      </h1>

      {!loading && !error && (
        <p style={styles.savedNote}>✓ Saved to My Stuff — your character and world are kept!</p>
      )}

      {/* Character + World preview cards */}
      <div style={styles.gamePreview}>
        <div style={styles.previewCard}>
          <h3>Your Character</h3>
          {gameData.character?.image && (
            <img src={gameData.character.image} alt="Your character" style={styles.previewImage} />
          )}
          <p>{gameData.character?.name || gameData.character?.description}</p>
        </div>

        <div style={styles.previewCard}>
          <h3>Your World</h3>
          {gameData.level?.previewImage && (
            <img src={gameData.level.previewImage} alt="Your level" style={styles.previewImage} />
          )}
          {gameData.level?.image && !gameData.level?.previewImage && (
            <img src={gameData.level.image} alt="Your level" style={styles.previewImage} />
          )}
          <p>{gameData.level?.name || gameData.level?.theme || gameData.level?.description}</p>
          {gameData.level?.layers && (
            <p style={{ fontSize: "12px", color: "#666" }}>({gameData.level.layers.length} layers)</p>
          )}
        </div>
      </div>

      {/* World layers */}
      {gameData.level?.layers && gameData.level.layers.length > 0 && (
        <div style={styles.layerDisplay}>
          <h3 style={{ textAlign: "center", color: "white", marginTop: "20px" }}>World Layers</h3>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
            {gameData.level.layers.map((layer, i) => (
              <div key={i} style={{ backgroundColor: "rgba(255,255,255,0.9)", padding: "10px", borderRadius: "6px", textAlign: "center", fontSize: "12px" }}>
                <strong>{layer.layerType}</strong>
                <p style={{ margin: "4px 0", fontSize: "11px", color: "#666" }}>speed: {layer.parallaxSpeed}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game area */}
      {loading && (
        <div style={styles.loadingGame}>
          <div style={styles.loadingSpinner} />
          <p style={{ fontSize: "22px", fontWeight: "bold", color: "#1a1a3e", margin: "20px 0 8px" }}>
            🎮 Building your game{dots}
          </p>
          <p style={{ fontSize: "15px", color: "#555" }}>
            Claude is writing custom game code for {gameData.character?.name || "your hero"} right now!
          </p>
        </div>
      )}

      {error && (
        <div style={styles.errorGame}>
          <p style={{ fontSize: "20px", color: "#c0392b" }}>😕 {error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{ ...styles.primaryButton, marginTop: "20px", maxWidth: "300px" }}
          >
            Try Again
          </button>
        </div>
      )}

      {gameHtml && !loading && (
        <div style={styles.iframeWrapper}>
          <iframe
            ref={iframeRef}
            title="Your Game"
            style={styles.gameIframe}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      <button onClick={onBack} style={{ ...styles.primaryButton, marginTop: "30px" }}>
        Create a New Game
      </button>
    </div>
  );
}

// ============ STYLES ============
const styles = {
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
    maxWidth: "1200px",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "30px",
    gap: "10px",
  },
  navInner: {
    width: "100%",
    maxWidth: "1200px",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "20px",
    gap: "10px",
  },
  introTopBar: {
    width: "100%",
    maxWidth: "1200px",
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: "10px",
  },
  backButton: {
    padding: "10px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "20px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },
  myStuffButton: {
    padding: "10px 20px",
    backgroundColor: "#1a1a3e",
    color: "white",
    border: "none",
    borderRadius: "20px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  heading: {
    fontSize: "40px",
    fontWeight: "900",
    color: "#1a1a3e",
    textAlign: "center",
    marginBottom: "15px",
    textShadow: "2px 2px 4px rgba(0,0,0,0.1)",
  },
  tagline: {
    fontSize: "20px",
    color: "#333",
    textAlign: "center",
    marginBottom: "40px",
  },
  savedNote: {
    fontSize: "15px",
    color: "#1a6b2e",
    backgroundColor: "rgba(255,255,255,0.7)",
    padding: "8px 16px",
    borderRadius: "20px",
    marginBottom: "25px",
    fontWeight: "600",
  },
  gameIcon: {
    fontSize: "60px",
    textAlign: "center",
    marginBottom: "20px",
  },
  formCard: {
    backgroundColor: "white",
    padding: "30px",
    borderRadius: "20px",
    marginBottom: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    maxWidth: "500px",
    width: "100%",
  },
  formHeading: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1a1a3e",
    marginBottom: "15px",
  },
  textInput: {
    width: "100%",
    padding: "15px",
    fontSize: "16px",
    border: "3px solid #ffb700",
    borderRadius: "12px",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  helpText: {
    fontSize: "13px",
    color: "#666",
    marginTop: "10px",
  },
  ageButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "center",
  },
  ageButton: {
    width: "50px",
    height: "50px",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  primaryButton: {
    padding: "16px 40px",
    fontSize: "18px",
    fontWeight: "bold",
    backgroundColor: "#1a1a3e",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.2s",
    maxWidth: "500px",
    width: "100%",
  },
  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    maxWidth: "1000px",
    width: "100%",
    marginBottom: "30px",
  },
  gameCard: {
    padding: "30px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    cursor: "pointer",
    transition: "all 0.3s",
    fontSize: "16px",
  },
  gameCardTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1a1a3e",
    margin: "15px 0 10px 0",
  },
  gameCardDescription: {
    fontSize: "14px",
    color: "#666",
    margin: 0,
  },
  gamePreview: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "30px",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
  },
  previewCard: {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  previewImage: {
    width: "100%",
    borderRadius: "8px",
    marginBottom: "15px",
  },
  layerDisplay: {
    marginBottom: "20px",
  },
  loadingGame: {
    backgroundColor: "white",
    padding: "60px 40px",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    textAlign: "center",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  loadingSpinner: {
    width: "60px",
    height: "60px",
    border: "6px solid #f3f3f3",
    borderTop: "6px solid #ff9500",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  errorGame: {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    textAlign: "center",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
  },
  iframeWrapper: {
    maxWidth: "860px",
    width: "100%",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    marginBottom: "30px",
    background: "#111",
  },
  gameIframe: {
    width: "100%",
    height: "440px",
    border: "none",
    display: "block",
  },
};
