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
import StoryMaker from "./StoryMaker";
import LoadingGames from "./LoadingGames";
import FamilyChess from "./FamilyChess";
import { saveCharacter, saveLevel, libraryCounts, onLibraryChange } from "./store";
import { getActiveKid, isSignedIn, completeOAuthRedirect, ensureFreshToken } from "./lib/accounts";

// Screens
const SCREEN_HOME = "home";
const SCREEN_INTRO = "intro";
const SCREEN_GAME_TYPE = "game_type";
const SCREEN_CHARACTER_CREATOR = "character_creator";
const SCREEN_LEVEL_CREATOR = "level_creator";
const SCREEN_PLAY = "play";
const SCREEN_MY_STUFF = "my_stuff";
const SCREEN_ADMIN = "admin";
const SCREEN_MUSIC = "music";
const SCREEN_GROWNUP = "grownup";
const SCREEN_STORY = "story";
const SCREEN_TYPING = "typing";
const SCREEN_CHESS = "chess";
const SCREEN_CHESS_FAMILY = "chess_family";
export default function BuildableKids() {
  const [screen, setScreen] = useState(isSignedIn() ? SCREEN_GROWNUP : SCREEN_HOME);
  const [activeKid, setActiveKidState] = useState(getActiveKid());
  const [returnTo, setReturnTo] = useState(SCREEN_HOME);
  const [gameData, setGameData] = useState({
    playerName: "",
    age: null,
    gameType: null,
    character: null,
    level: null,
  });

  // Finish a Google sign-in no matter which screen we land on: if the return
  // tokens are in the URL, complete the session and go straight to "Who's playing?".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash || "";
    if (h.indexOf("access_token") !== -1) {
      completeOAuthRedirect().then((done) => {
        if (done) { setActiveKidState(getActiveKid()); setScreen(SCREEN_GROWNUP); }
      });
    }
  }, []);

  // Keep the signed-in session alive: refresh an expired token on load.
  useEffect(() => { ensureFreshToken(); }, []);

  // Allow opening the admin dashboard directly by URL: /admin or /admin.html
  useEffect(() => {
    if (typeof window !== "undefined" && /\/admin(\.html)?\/?$/i.test(window.location.pathname)) {
      setScreen(SCREEN_ADMIN);
    }
  }, []);

  const goHome = () => setScreen(SCREEN_HOME);
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

  // ============ HOME HUB ============
  if (screen === SCREEN_HOME) {
    return (
      <HomeScreen
        activeKid={activeKid}
        onMusic={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_MUSIC); }}
        onGames={() => setScreen(SCREEN_INTRO)}
        onStories={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_STORY); }}
        onTyping={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_TYPING); }}
        onChess={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_CHESS); }}
        onMyStuff={() => openMyStuff(SCREEN_HOME)}
        onGrownUp={() => setScreen(SCREEN_GROWNUP)}
        onAdmin={() => setScreen(SCREEN_ADMIN)}
      />
    );
  }

  // ============ INTRO SCREEN ============
  if (screen === SCREEN_INTRO) {
    return (
      <IntroScreen
        onComplete={(name, age) => {
          setGameData((prev) => ({ ...prev, playerName: name, age }));
          setScreen(SCREEN_GAME_TYPE);
        }}
        onHome={goHome}
        onMyStuff={() => openMyStuff(SCREEN_INTRO)}
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
        onHome={() => setScreen(SCREEN_HOME)}
        onBack={() => setScreen(returnTo || SCREEN_HOME)}
      />
    );
  }

  if (screen === SCREEN_STORY) {
    return (
      <StoryMaker
        playerName={(activeKid && activeKid.display_name) || gameData.playerName}
        onHome={() => setScreen(SCREEN_HOME)}
        onBack={() => setScreen(returnTo || SCREEN_HOME)}
      />
    );
  }

  if (screen === SCREEN_TYPING) {
    return <TypingScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }

  if (screen === SCREEN_CHESS) {
    return <ChessScreen onHome={() => setScreen(SCREEN_HOME)} onFamily={() => setScreen(SCREEN_CHESS_FAMILY)} />;
  }

  if (screen === SCREEN_CHESS_FAMILY) {
    return <FamilyChess activeKid={activeKid} onHome={() => setScreen(SCREEN_HOME)} />;
  }

  if (screen === SCREEN_MY_STUFF) {
    return <MyStuffScreen {...myStuffNav} />;
  }

  // ============ ADMIN DASHBOARD ============
  // ──────── GROWN-UPS (parent sign-in + kid profile picker) ────────
  if (screen === SCREEN_GROWNUP) {
    return (
      <GrownUpScreen
        onBack={() => setScreen(SCREEN_HOME)}
        onProfileChosen={(kid) => {
          setActiveKidState(kid);
          setScreen(SCREEN_HOME);
        }}
      />
    );
  }

  if (screen === SCREEN_ADMIN) {
    return <AdminDashboard onExit={() => setScreen(SCREEN_HOME)} />;
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
// ============ HOME HUB COMPONENT ============
// The new front door. Segments the three experiences (Music live, Games in
// beta, Stories coming soon) and surfaces the Grown-ups portal + My Stuff.
function HomeScreen({ activeKid, onMusic, onGames, onStories, onTyping, onChess, onMyStuff, onGrownUp, onAdmin }) {
  // App-icon tiles: a colored squircle + a clean white glyph (no emoji).
  const AppIcon = ({ grad, children }) => (
    <div style={{ position: "relative", width: 76, height: 76, borderRadius: 20, background: grad, boxShadow: "0 8px 18px rgba(0,0,0,0.4)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%)" }} />
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
  const NoteGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="17" cy="33" rx="7" ry="5.2" transform="rotate(-20 17 33)" fill="#fff" />
      <rect x="22.6" y="11" width="3.2" height="22.5" fill="#fff" />
      <path d="M25.8 11 q11 3 8.5 15 q.5 -8 -8.5 -9 z" fill="#fff" />
    </svg>
  );
  const ControllerGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="18" width="36" height="16" rx="8" fill="#fff" />
      <rect x="12" y="22.5" width="3.2" height="9" rx="1" fill="#2BB14F" />
      <rect x="9" y="25.5" width="9.2" height="3.2" rx="1" fill="#2BB14F" />
      <circle cx="32" cy="24.5" r="2.4" fill="#2BB14F" />
      <circle cx="37" cy="29" r="2.4" fill="#2BB14F" />
    </svg>
  );
  const BookGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 14 C18.5 10.5 12 10.5 8 12.3 V35.5 C12 33.7 18.5 33.7 24 37.2 Z" fill="#fff" />
      <path d="M24 14 C29.5 10.5 36 10.5 40 12.3 V35.5 C36 33.7 29.5 33.7 24 37.2 Z" fill="#fff" opacity="0.82" />
      <rect x="22.8" y="13.2" width="2.4" height="24" rx="1.2" fill="#fff" opacity="0.55" />
    </svg>
  );
  const KeyboardGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="14" width="36" height="22" rx="4.5" fill="#fff" />
      <rect x="10.5" y="18.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="16.5" y="18.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="22.5" y="18.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="28.5" y="18.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="34.5" y="18.5" width="3" height="4" rx="1" fill="#2F8FD6" />
      <rect x="10.5" y="24.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="16.5" y="24.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="22.5" y="24.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="28.5" y="24.5" width="4" height="4" rx="1" fill="#2F8FD6" /><rect x="34.5" y="24.5" width="3" height="4" rx="1" fill="#2F8FD6" />
      <rect x="14.5" y="30.5" width="19" height="3.5" rx="1.5" fill="#2F8FD6" />
    </svg>
  );
  const ChessGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="22.4" y="5" width="3.2" height="9" rx="1" fill="#fff" />
      <rect x="19.5" y="7.5" width="9" height="3.2" rx="1" fill="#fff" />
      <circle cx="24" cy="18" r="5" fill="#fff" />
      <path d="M16.5 22 h15 l-2.5 12 h-10 z" fill="#fff" />
      <rect x="13" y="33" width="22" height="6" rx="3" fill="#fff" />
    </svg>
  );

  const PILL_COLORS = ["linear-gradient(160deg,#8A6BFF,#6A4FE0)","linear-gradient(160deg,#F2789E,#E0578F)","linear-gradient(160deg,#4FA6E8,#2F8FD6)","linear-gradient(160deg,#3DD06A,#2BB14F)","linear-gradient(160deg,#FFC75A,#F0972A)","linear-gradient(160deg,#46D7C0,#1FA897)"];
  const pillGrad = (name) => { let h = 0; const s = name || "?"; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PILL_COLORS[h % PILL_COLORS.length]; };
  const initial = (name) => { const n = (name || "").trim(); return n ? n[0].toUpperCase() : "?"; };

  const ExperienceCard = ({ icon, title, desc, badge, badgeColor, onClick, disabled }) => (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        position: "relative", textAlign: "left", padding: "24px 22px",
        borderRadius: "22px", border: CARD_BORDER, background: CARD_BG,
        color: "#fff", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1, fontFamily: NUN,
        display: "flex", flexDirection: "column", gap: "12px", minHeight: "150px",
      }}
    >
      {badge && (
        <span style={{
          position: "absolute", top: "16px", right: "16px",
          fontSize: "12px", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase",
          padding: "5px 11px", borderRadius: "999px", background: badgeColor, color: "#1a1330",
        }}>{badge}</span>
      )}
      {icon}
      <div style={{ fontFamily: FRED, fontSize: "24px", fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: "15px", color: "#cfc9e6" }}>{desc}</div>
    </button>
  );

  return (
    <div style={styles.container}>
      <div style={{ ...styles.introTopBar, justifyContent: "space-between", alignItems: "center" }}>
        <div>
          {activeKid && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "999px", padding: "7px 14px 7px 7px", fontFamily: NUN, fontWeight: 800,
              fontSize: "15px", color: "#fff",
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", background: pillGrad(activeKid.display_name),
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontFamily: FRED, fontSize: 13, fontWeight: 700, color: "#fff",
              }}>{initial(activeKid.display_name)}</span>
              Playing as {activeKid.display_name}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onMyStuff} style={styles.myStuffButton}>My Stuff</button>
          <button onClick={onGrownUp} style={styles.myStuffButton}>
            {activeKid ? "Switch kid" : "Grown-ups"}
          </button>
        </div>
      </div>

      <h1 style={{ ...styles.logo, marginTop: "8px" }}>buildablekids.</h1>
      <p style={styles.tagline}>What do you want to make today?</p>

      <div style={{
        width: "100%", maxWidth: "920px", marginTop: "20px",
        display: "grid", gap: "18px",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}>
        <ExperienceCard
          icon={<AppIcon grad="linear-gradient(160deg,#8A6BFF,#6A4FE0)"><NoteGlyph /></AppIcon>}
          title="Music" desc="Make your own song. Ready to play right now!"
          badge="Ready" badgeColor="#7CF6B0" onClick={onMusic}
        />
        <ExperienceCard
          icon={<AppIcon grad="linear-gradient(160deg,#3DD06A,#2BB14F)"><ControllerGlyph /></AppIcon>}
          title="Games" desc="Build a game with your own hero and world."
          badge="Beta" badgeColor="#FFD66B" onClick={onGames}
        />
        <ExperienceCard
          icon={<AppIcon grad="linear-gradient(160deg,#F2789E,#E0578F)"><BookGlyph /></AppIcon>}
          title="Stories" desc="Turn your ideas into a living picture book."
          badge="New" badgeColor="#7CF6B0" onClick={onStories}
        />
        <ExperienceCard
          icon={<AppIcon grad="linear-gradient(160deg,#4FA6E8,#2F8FD6)"><KeyboardGlyph /></AppIcon>}
          title="Typing" desc="Learn to type by defending the castle!"
          badge="New" badgeColor="#7CF6B0" onClick={onTyping}
        />
        <ExperienceCard
          icon={<AppIcon grad="linear-gradient(160deg,#FFC75A,#F0972A)"><ChessGlyph /></AppIcon>}
          title="Chess" desc="Play your hero squad — solo or two players!"
          badge="New" badgeColor="#7CF6B0" onClick={onChess}
        />
      </div>
    </div>
  );
}

function TypingScreen({ onHome }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button
        onClick={onHome}
        style={{
          position: "absolute", top: "14px", left: "14px", zIndex: 2,
          fontFamily: NUN, fontWeight: 800, fontSize: "14px", color: "#fff",
          background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: "999px", padding: "8px 16px", cursor: "pointer",
        }}
      >← Home</button>
      <iframe
        title="Buildable Typing"
        src="/typing.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

function ChessScreen({ onHome, onFamily }) {
  const pillBtn = {
    fontFamily: NUN, fontWeight: 800, fontSize: "14px", color: "#fff",
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px", padding: "8px 16px", cursor: "pointer",
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: "14px", left: "14px", zIndex: 2, ...pillBtn }}>← Home</button>
      {onFamily && (
        <button onClick={onFamily} style={{ position: "absolute", top: "14px", right: "14px", zIndex: 2, ...pillBtn, background: "linear-gradient(135deg,#7C5CFC,#A78BFF)", border: "none" }}>Play a family member</button>
      )}
      <iframe
        title="Buildable Chess"
        src="/buildable-chess.html"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

function IntroScreen({ onComplete, onHome, onMyStuff, activeKid }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState(7);

  const handleClick = () => {
    if (name.trim()) {
      onComplete(name, age);
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.introTopBar, justifyContent: "space-between" }}>
        <button onClick={onHome} style={styles.backButton}>← Home</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>📦 My Stuff</button>
      </div>

      <div style={styles.gameIcon}>🎮</div>
      <h1 style={styles.logo}>Make a game</h1>
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
    const ak = getActiveKid();
    const kpId = ak && ak.id ? ak.id : null;
    fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId) + (kpId ? "&kidProfileId=" + encodeURIComponent(kpId) : ""))
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
