// /src/BuildableKids.jsx
// Main app flow: intro -> pick game -> make character -> build world -> play.
// Now with: a top navigation bar, auto-saving of every character/world
// to "My Stuff", and the ability to reuse saved creations.
import { useState, useEffect, useRef } from "react";
import { CharacterCreatorScreen, LevelCreatorScreen } from "./CreatorScreen";
import MyStuffScreen from "./MyStuff";
import AdminDashboard from "./AdminDashboard";
import LoadingGames from "./LoadingGames";
import { saveCharacter, saveLevel, libraryCounts, onLibraryChange } from "./store";

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
  const [counts, setCounts] = useState(libraryCounts());
  useEffect(() => {
    const refresh = () => setCounts(libraryCounts());
    refresh();
    return onLibraryChange(refresh);
  }, []);
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
      <h1 style={styles.logo}>buildablekids.</h1>
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
                background: age === a ? GRAD : "rgba(255,255,255,0.07)",
                color: age === a ? "#fff" : "#cfc9e6",
                boxShadow: age === a ? "0 6px 18px rgba(155,126,221,0.5)" : "none",
                transform: age === a ? "scale(1.08)" : "none",
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
      <LoadingGames isLoading={loading} operationType="game" onComplete={() => {}} />
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
            <p style={{ fontSize: "12px", color: "#9c97b8" }}>({gameData.level.layers.length} layers)</p>
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
          <p style={{ fontSize: "22px", fontWeight: "bold", color: "#fff", margin: "20px 0 8px" }}>
            🎮 Building your game{dots}
          </p>
          <p style={{ fontSize: "15px", color: "#b0abc8" }}>
            Claude is writing custom game code for {gameData.character?.name || "your hero"} right now!
          </p>
        </div>
      )}

      {error && (
        <div style={styles.errorGame}>
          <p style={{ fontSize: "20px", color: "#ff9a9a" }}>😕 {error}</p>
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
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%)," +
  "#0a0a14";
const CARD_BG = "rgba(255,255,255,0.05)";
const CARD_BORDER = "1px solid rgba(155,126,221,0.22)";

const styles = {
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
    maxWidth: "1100px",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "30px",
    gap: "10px",
  },
  navInner: {
    width: "100%",
    maxWidth: "1100px",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "24px",
    gap: "10px",
  },
  introTopBar: {
    width: "100%",
    maxWidth: "1100px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginBottom: "24px",
  },
  backButton: {
    padding: "11px 20px",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: "14px",
    fontWeight: "700",
    fontSize: "15px",
    fontFamily: NUN,
    cursor: "pointer",
    backdropFilter: "blur(8px)",
  },
  myStuffButton: {
    padding: "11px 22px",
    background: GRAD,
    color: "#fff",
    border: "none",
    borderRadius: "14px",
    fontWeight: "800",
    fontSize: "15px",
    fontFamily: NUN,
    cursor: "pointer",
    boxShadow: "0 6px 22px rgba(155,126,221,0.45)",
  },
  logo: {
    fontFamily: FRED,
    fontSize: "clamp(44px, 9vw, 72px)",
    fontWeight: "700",
    background: "linear-gradient(90deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    letterSpacing: "-2px",
    textAlign: "center",
    margin: "0 0 6px",
    lineHeight: 1.05,
  },
  heading: {
    fontFamily: FRED,
    fontSize: "44px",
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: "14px",
    textShadow: "0 0 34px rgba(155,126,221,0.55)",
  },
  tagline: {
    fontSize: "19px",
    color: "#b8b3d0",
    textAlign: "center",
    marginBottom: "38px",
    fontWeight: "600",
  },
  savedNote: {
    fontSize: "15px",
    color: "#7ee6a6",
    background: "rgba(80,220,130,0.12)",
    border: "1px solid rgba(80,220,130,0.3)",
    padding: "10px 20px",
    borderRadius: "30px",
    marginBottom: "26px",
    fontWeight: "700",
  },
  gameIcon: {
    fontSize: "64px",
    textAlign: "center",
    marginBottom: "6px",
    filter: "drop-shadow(0 8px 22px rgba(155,126,221,0.5))",
  },
  formCard: {
    background: CARD_BG,
    border: CARD_BORDER,
    padding: "28px",
    borderRadius: "24px",
    marginBottom: "18px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    maxWidth: "500px",
    width: "100%",
    backdropFilter: "blur(12px)",
  },
  formHeading: {
    fontFamily: FRED,
    fontSize: "23px",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "16px",
  },
  textInput: {
    width: "100%",
    padding: "16px",
    fontSize: "16px",
    background: "rgba(0,0,0,0.28)",
    border: "2px solid rgba(155,126,221,0.4)",
    borderRadius: "16px",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#fff",
    outline: "none",
  },
  helpText: {
    fontSize: "13px",
    color: "#8e89a8",
    marginTop: "10px",
  },
  ageButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "center",
  },
  ageButton: {
    width: "52px",
    height: "52px",
    fontSize: "18px",
    fontWeight: "800",
    border: "none",
    borderRadius: "14px",
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: NUN,
  },
  primaryButton: {
    padding: "18px 44px",
    fontSize: "19px",
    fontWeight: "800",
    fontFamily: FRED,
    background: GRAD,
    color: "#fff",
    border: "none",
    borderRadius: "18px",
    cursor: "pointer",
    transition: "all 0.2s",
    maxWidth: "500px",
    width: "100%",
    boxShadow: "0 12px 32px rgba(155,126,221,0.5)",
    letterSpacing: "0.3px",
  },
  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "20px",
    maxWidth: "1000px",
    width: "100%",
    marginBottom: "30px",
  },
  gameCard: {
    padding: "32px 22px",
    background: CARD_BG,
    border: CARD_BORDER,
    borderRadius: "22px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    cursor: "pointer",
    fontSize: "16px",
    textAlign: "center",
    color: "#fff",
    backdropFilter: "blur(12px)",
  },
  gameCardTitle: {
    fontFamily: FRED,
    fontSize: "21px",
    fontWeight: "600",
    color: "#fff",
    margin: "14px 0 8px 0",
  },
  gameCardDescription: {
    fontSize: "14px",
    color: "#b0abc8",
    margin: 0,
  },
  gamePreview: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    maxWidth: "760px",
    width: "100%",
    marginBottom: "26px",
  },
  previewCard: {
    background: CARD_BG,
    border: CARD_BORDER,
    padding: "20px",
    borderRadius: "20px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    color: "#fff",
    backdropFilter: "blur(12px)",
  },
  previewImage: {
    width: "100%",
    borderRadius: "14px",
    marginBottom: "12px",
  },
  layerDisplay: {
    marginBottom: "20px",
  },
  loadingGame: {
    background: CARD_BG,
    border: CARD_BORDER,
    padding: "56px 40px",
    borderRadius: "24px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    textAlign: "center",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    color: "#fff",
    backdropFilter: "blur(12px)",
  },
  loadingSpinner: {
    width: "60px",
    height: "60px",
    border: "6px solid rgba(255,255,255,0.12)",
    borderTop: "6px solid #9b7edd",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  errorGame: {
    background: CARD_BG,
    border: "1px solid rgba(214,90,123,0.4)",
    padding: "40px",
    borderRadius: "24px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    textAlign: "center",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
    color: "#fff",
  },
  iframeWrapper: {
    maxWidth: "860px",
    width: "100%",
    borderRadius: "20px",
    overflow: "hidden",
    boxShadow: "0 16px 50px rgba(155,126,221,0.3)",
    border: "1px solid rgba(155,126,221,0.3)",
    marginBottom: "30px",
    background: "#0a0a14",
  },
  gameIframe: {
    width: "100%",
    height: "440px",
    border: "none",
    display: "block",
  },
};
