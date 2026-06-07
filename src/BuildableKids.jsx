// /src/BuildableKidsUpdated.jsx
// This shows the new flow with Character Creator and Level Creator wired together
import { useState } from "react";
import { CharacterCreatorScreen, LevelCreatorScreen } from "./CreatorScreen";

// Screens
const SCREEN_INTRO = "intro";
const SCREEN_GAME_TYPE = "game_type";
const SCREEN_CHARACTER_CREATOR = "character_creator";
const SCREEN_LEVEL_CREATOR = "level_creator";
const SCREEN_PLAY = "play";

export default function BuildableKids() {
  const [screen, setScreen] = useState(SCREEN_INTRO);
  const [gameData, setGameData] = useState({
    playerName: "",
    age: null,
    gameType: null,
    character: null,
    level: null
  });

  // ============ INTRO SCREEN ============
  if (screen === SCREEN_INTRO) {
    return (
      <IntroScreen
        onComplete={(name, age) => {
          setGameData(prev => ({ ...prev, playerName: name, age }));
          setScreen(SCREEN_GAME_TYPE);
        }}
      />
    );
  }

  // ============ GAME TYPE PICKER ============
  if (screen === SCREEN_GAME_TYPE) {
    return (
      <GameTypeScreen
        playerName={gameData.playerName}
        onGameSelected={(gameType) => {
          setGameData(prev => ({ ...prev, gameType }));
          setScreen(SCREEN_CHARACTER_CREATOR);
        }}
        onBack={() => setScreen(SCREEN_INTRO)}
      />
    );
  }

  // ============ CHARACTER CREATOR ============
  if (screen === SCREEN_CHARACTER_CREATOR) {
    return (
      <CharacterCreatorScreen
        onCharacterCreated={(character) => {
          setGameData(prev => ({ ...prev, character }));
          setScreen(SCREEN_LEVEL_CREATOR);
        }}
      />
    );
  }

  // ============ LEVEL CREATOR ============
  if (screen === SCREEN_LEVEL_CREATOR) {
    return (
      <LevelCreatorScreen
        characterData={gameData.character}
        onLevelCreated={(level) => {
          setGameData(prev => ({ ...prev, level }));
          setScreen(SCREEN_PLAY);
        }}
      />
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
            level: null
          });
          setScreen(SCREEN_INTRO);
        }}
      />
    );
  }
}

// ============ INTRO SCREEN COMPONENT ============
function IntroScreen({ onComplete }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState(7);

  const handleClick = () => {
    if (name.trim()) {
      onComplete(name, age);
    }
  };

  return (
    <div style={styles.container}>
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
                color: age === a ? "white" : "#333"
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
          cursor: !name.trim() ? "not-allowed" : "pointer"
        }}
      >
        Let's build! →
      </button>
    </div>
  );
}

// ============ GAME TYPE PICKER COMPONENT ============
function GameTypeScreen({ playerName, onGameSelected, onBack }) {
  const games = [
    {
      id: "runner",
      name: "Runner",
      icon: "🏃",
      description: "Jump and duck through obstacles!"
    },
    {
      id: "flying",
      name: "Flying",
      icon: "🚀",
      description: "Blast enemies while you fly!"
    },
    {
      id: "maze",
      name: "Maze",
      icon: "🗺️",
      description: "Find keys, unlock doors, get treasure!"
    },
    {
      id: "match",
      name: "Match Magic",
      icon: "✨",
      description: "Match 3 or more to make them POP!"
    }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <button style={styles.resetButton}>↻ Start Over</button>
      </div>

      <h1 style={styles.heading}>Pick your game</h1>
      <p style={styles.tagline}>Four totally different ways to play!</p>

      <div style={styles.gameGrid}>
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => onGameSelected(game.id)}
            style={styles.gameCard}
          >
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
function PlayGameScreen({ gameData, onBack }) {
  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
      </div>

      <h1 style={styles.heading}>Your Game is Ready! 🎮</h1>

      <div style={styles.gamePreview}>
        <div style={styles.previewCard}>
          <h3>Your Character</h3>
          {gameData.character?.image && (
            <img
              src={gameData.character.image}
              alt="Your character"
              style={styles.previewImage}
            />
          )}
          <p>{gameData.character?.description}</p>
        </div>

        <div style={styles.previewCard}>
          <h3>Your World</h3>
          {gameData.level?.image && (
            <img
              src={gameData.level.image}
              alt="Your level"
              style={styles.previewImage}
            />
          )}
          <p>{gameData.level?.theme || gameData.level?.description}</p>
        </div>
      </div>

      <div style={styles.placeholderGame}>
        <p style={{ fontSize: "20px" }}>
          🎮 Game Engine Loading... 🎮<br />
          <small>Your {gameData.gameType} game will appear here!</small>
        </p>
      </div>

      <button onClick={onBack} style={styles.primaryButton}>
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
    alignItems: "center"
  },
  topBar: {
    width: "100%",
    maxWidth: "1200px",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "30px",
    gap: "10px"
  },
  backButton: {
    padding: "10px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "20px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
  },
  resetButton: {
    padding: "10px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "20px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
  },
  heading: {
    fontSize: "48px",
    fontWeight: "900",
    color: "#1a1a3e",
    textAlign: "center",
    marginBottom: "15px",
    textShadow: "2px 2px 4px rgba(0,0,0,0.1)"
  },
  tagline: {
    fontSize: "20px",
    color: "#333",
    textAlign: "center",
    marginBottom: "40px"
  },
  gameIcon: {
    fontSize: "60px",
    textAlign: "center",
    marginBottom: "20px"
  },
  formCard: {
    backgroundColor: "white",
    padding: "30px",
    borderRadius: "20px",
    marginBottom: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    maxWidth: "500px",
    width: "100%"
  },
  formHeading: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1a1a3e",
    marginBottom: "15px"
  },
  textInput: {
    width: "100%",
    padding: "15px",
    fontSize: "16px",
    border: "3px solid #ffb700",
    borderRadius: "12px",
    boxSizing: "border-box",
    fontFamily: "inherit"
  },
  helpText: {
    fontSize: "13px",
    color: "#666",
    marginTop: "10px"
  },
  ageButtons: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "center"
  },
  ageButton: {
    width: "50px",
    height: "50px",
    fontSize: "18px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "all 0.2s"
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
    width: "100%"
  },
  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    maxWidth: "1000px",
    width: "100%",
    marginBottom: "30px"
  },
  gameCard: {
    padding: "30px 20px",
    backgroundColor: "white",
    border: "none",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    cursor: "pointer",
    transition: "all 0.3s",
    fontSize: "16px"
  },
  gameCardTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#1a1a3e",
    margin: "15px 0 10px 0"
  },
  gameCardDescription: {
    fontSize: "14px",
    color: "#666",
    margin: 0
  },
  gamePreview: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "30px",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px"
  },
  previewCard: {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
  },
  previewImage: {
    width: "100%",
    borderRadius: "8px",
    marginBottom: "15px"
  },
  placeholderGame: {
    backgroundColor: "white",
    padding: "60px 40px",
    borderRadius: "16px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    textAlign: "center",
    maxWidth: "800px",
    width: "100%",
    marginBottom: "30px",
    color: "#666"
  }
};
