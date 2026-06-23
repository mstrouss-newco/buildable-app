// /src/BuildableKids.jsx
// Main app flow: intro -> pick game -> make character -> build world -> play.
// Now with: a top navigation bar, auto-saving of every character/world
// to "My Stuff", and the ability to reuse saved creations.
import { useState, useEffect, useRef } from "react";
import { CharacterCreatorScreen, LevelCreatorScreen } from "./CreatorScreen";
import MyStuffScreen from "./MyStuff";
import MusicMaker from "./MusicMaker";
import AdminDashboard from "./AdminDashboard";
import GrownUpScreen from "./GrownUpScreen";
import LoadingGames from "./LoadingGames";
import { saveCharacter, saveLevel, libraryCounts, onLibraryChange } from "./store";
import { getActiveKid } from "./lib/accounts";

// Screens
const SCREEN_INTRO = "intro";
const SCREEN_GAME_TYPE = "game_type";
const SCREEN_CHARACTER_CREATOR = "character_creator";
const SCREEN_LEVEL_CREATOR = "level_creator";
const SCREEN_PLAY = "play";
const SCREEN_MY_STUFF = "my_stuff";
const SCREEN_ADMIN = "admin";
const SCREEN_MUSIC = "music";
const SCREEN_GROWNUP = "grownup";
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
          onMusic={() => setScreen(SCREEN_MUSIC)}
        onAdmin={() => setScreen(SCREEN_ADMIN)}
        onGrownUp={() => setScreen(SCREEN_GROWNUP)}
        activeKid={activeKid}
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
      <>
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
      <GameMusicPicker />
      </>
    );
  }

  // ============ MY STUFF LIBRARY ============
  if (screen === SCREEN_MUSIC) {
    return (
      <MusicMaker
        playerName={gameData.playerName}
        onHome={() => setScreen(SCREEN_INTRO)}
        onBack={() => setScreen(returnTo || SCREEN_INTRO)}
      />
    );
  }

  if (screen === SCREEN_MY_STUFF) {
    return <MyStuffScreen {...myStuffNav} />;
  }

  // ============ ADMIN DASHBOARD ============
  // ──────── GROWN-UPS (parent sign-in + kid profile picker) ────────
  if (screen === SCREEN_GROWNUP) {
    return (
      <GrownUpScreen
        onBack={() => setScreen(SCREEN_INTRO)}
        onProfileChosen={(kid) => {
          setActiveKidState(kid);
          setScreen(SCREEN_INTRO);
        }}
      />
    );
  }

  if (screen === SCREEN_ADMIN) {
    return <AdminDashboard onExit={() => setScreen(SCREEN_INTRO)} />;
  }
}

// ============ TOP NAVIGATION BAR ============
function TopNav({ onBack, onHome, onMyStuff }) {
  const [counts, setCounts] = useState(libraryCounts());
  const [activeKid, setActiveKidState] = useState(getActiveKid());
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
function IntroScreen({ onComplete, onMyStuff, onAdmin, onMusic, onGrownUp, activeKid }) {
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
        <button onClick={onMusic} style={styles.myStuffButton}>🎵 Music</button>
          <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
        <button onClick={onGrownUp} style={styles.myStuffButton}>{activeKid ? `${activeKid.avatar || "🙂"} ${activeKid.display_name}` : "👨‍👩‍👧 Grown-ups"}</button>
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
    { id: "breakout", name: "Brick Breaker", icon: "🧱", description: "Bounce the ball to smash all the bricks!" },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
      </div>

      <h1 style={styles.heading}>Pick your game</h1>
      <p style={styles.tagline}>Five totally different ways to play!</p>

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
function GameMusicPicker() {
  const [open, setOpen] = useState(false);
  const [songs, setSongs] = useState([]);
  const [current, setCurrent] = useState(null);
  const audioRef = useRef(null);

  function getDeviceId() {
    try {
      let id = localStorage.getItem("deviceId");
      if (!id) {
        id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        localStorage.setItem("deviceId", id);
      }
      return id;
    } catch {
      return "dev_anon";
    }
  }

  useEffect(() => {
    const deviceId = getDeviceId();
    fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId))
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.songs)) setSongs(d.songs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (current && current.audio_url) {
      a.src = current.audio_url;
      a.loop = true;
      a.volume = 0.5;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [current]);

  if (songs.length === 0) return <audio ref={audioRef} style={{ display: "none" }} />;

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 9999,
        fontFamily: "inherit",
      }}
    >
      <audio ref={audioRef} style={{ display: "none" }} />
      {open && (
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
            padding: 14,
            width: 240,
            marginBottom: 10,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#5b3fa6" }}>
            Background music
          </div>
          <button
            onClick={() => setCurrent(null)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              marginBottom: 6,
              borderRadius: 10,
              border: current ? "1px solid #eee" : "2px solid #7c5cd6",
              background: current ? "#fafafa" : "#f1ecff",
              cursor: "pointer",
            }}
          >
            Off
          </button>
          {songs.map((s) => (
            <button
              key={s.song_id}
              onClick={() => setCurrent(s)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                marginBottom: 6,
                borderRadius: 10,
                border:
                  current && current.song_id === s.song_id
                    ? "2px solid #7c5cd6"
                    : "1px solid #eee",
                background:
                  current && current.song_id === s.song_id ? "#f1ecff" : "#fafafa",
                cursor: "pointer",
              }}
            >
              {s.title || "My song"}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "#7c5cd6",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          fontSize: 15,
          fontWeight: 700,
          boxShadow: "0 4px 14px rgba(124,92,214,0.5)",
          cursor: "pointer",
        }}
      >
        {current ? "Music: " + (current.title || "On") : "Add music"}
      </button>
    </div>
  );
}

function PlayGameScreen({ gameData, onBack, onMyStuff }) {
  const [gameHtml, setGameHtml] = useState(null);
  const [gameMechanic, setGameMechanic] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState(null);
  const [publishError, setPublishError] = useState(null);
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
        // Strip heavy base64 images before sending — the server only needs
        // text (names/descriptions/theme). Sending full images blows past
        // Vercel's hard 4.5MB request-body limit and causes a 413.
        const slimGameData = {
          playerName: gameData.playerName,
          gameType: gameData.gameType,
          character: gameData.character
            ? { ...gameData.character, image: undefined }
            : gameData.character,
          level: gameData.level
            ? {
                ...gameData.level,
                image: undefined,
                previewImage: undefined,
                layers: gameData.level.layers
                  ? gameData.level.layers.map((l) => ({ ...l, image: undefined, imageUrl: undefined }))
                  : gameData.level.layers,
              }
            : gameData.level,
        };

        const response = await fetch("/api/generate-game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameData: slimGameData }),
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        if (data.html) {
          setGameHtml(data.html);
          if (data.mechanic) setGameMechanic(data.mechanic);
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

  // Publish the finished game to the PUBLIC gallery.
  const publishGame = async () => {
    if (!gameHtml || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const deviceId = localStorage.getItem("deviceId") || (`device_${Date.now()}`);
      localStorage.setItem("deviceId", deviceId);
      const title = (gameData.level && (gameData.level.name || gameData.level.theme)) || "My Game";
      const layerIds = (gameData.level && gameData.level.layers)
        ? gameData.level.layers.map((l) => l.id).filter(Boolean)
        : null;
      const response = await fetch("/api/publish-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          html: gameHtml,
          title,
          theme: gameData.level && gameData.level.theme,
          mechanicSlug: gameMechanic && gameMechanic.slug,
          mechanicName: gameMechanic && gameMechanic.name,
          characterName: gameData.character && (gameData.character.name || gameData.character.description),
          creatorName: gameData.playerName,
          layerIds,
          previewImageUrl: (gameData.level && (gameData.level.previewImage || gameData.level.image)) || null,
        }),
      });
      const data = await response.json();
      if (response.ok && data.shareUrl) {
        setPublishedUrl(data.shareUrl);
      } else {
        setPublishError("Couldn't publish your game. Try again!");
      }
    } catch (err) {
      console.error("publish error:", err);
      setPublishError("Something went wrong publishing. Try again!");
    } finally {
      setPublishing(false);
    }
  };

  // Inject the generated HTML into the iframe.
  // NOTE: we deliberately use a Blob URL (iframe.src) instead of the old
  // doc.open()/doc.write()/doc.close() approach. document.write() does not
  // give the iframe a proper browsing context, so Phaser 3 would
  // intermittently fail to initialize and the canvas rendered blank.
  // A Blob URL gives the game a real document + origin so Phaser/WebGL
  // boot reliably. The object URL is revoked on cleanup to avoid leaks.
  useEffect(() => {
    if (!gameHtml || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const blob = new Blob([gameHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
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

      {/* Publish to the public gallery */}
      {gameHtml && !loading && (
        <div style={styles.publishCard}>
          {!publishedUrl ? (
            <>
              <p style={styles.publishHeading}>Love it? Share it with everyone!</p>
              <button
                onClick={publishGame}
                disabled={publishing}
                style={{ ...styles.primaryButton, opacity: publishing ? 0.6 : 1, cursor: publishing ? "not-allowed" : "pointer" }}
              >
                {publishing ? "Publishing... ✨" : "🚀 Publish my game!"}
              </button>
              {publishError && <p style={styles.error}>{publishError}</p>}
            </>
          ) : (
            <div style={styles.publishedBox}>
              <p style={styles.publishedTitle}>🎉 Published! Anyone can play it now.</p>
              <p style={styles.shareLabel}>Share link:</p>
              <code style={styles.shareLink}>{(typeof window !== "undefined" ? window.location.origin : "") + publishedUrl}</code>
            </div>
          )}
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
  publishCard: {
    background: CARD_BG,
    border: CARD_BORDER,
    padding: "26px",
    borderRadius: "22px",
    boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
    maxWidth: "560px",
    width: "100%",
    textAlign: "center",
    marginBottom: "10px",
    backdropFilter: "blur(12px)",
  },
  publishHeading: {
    fontFamily: FRED,
    fontSize: "20px",
    fontWeight: "600",
    color: "#fff",
    marginBottom: "16px",
  },
  publishedBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
  },
  publishedTitle: {
    fontSize: "18px",
    fontWeight: "800",
    color: "#7ee6a6",
  },
  shareLabel: {
    fontSize: "13px",
    color: "#b0abc8",
    margin: 0,
  },
  shareLink: {
    fontSize: "14px",
    color: "#cbb8f5",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(155,126,221,0.35)",
    borderRadius: "10px",
    padding: "8px 12px",
    wordBreak: "break-all",
  },
  error: {
    color: "#ff9a9a",
    marginTop: "12px",
    fontWeight: "700",
  },
};
