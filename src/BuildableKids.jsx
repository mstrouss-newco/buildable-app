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
import TopBoard from "./TopBoard.jsx";
import LoadingGames from "./LoadingGames";
import QuizGate from "./QuizGate";
import FamilyChess from "./FamilyChess";
import { listMyMatches } from "./lib/chessMatches";
import { setLearningSettings, saveCharacter, saveLevel, libraryCounts, onLibraryChange, reloadLearningForActiveKid, getLearningSettings } from "./store";
import { getActiveKid, setActiveKid, isSignedIn, completeOAuthRedirect, ensureFreshToken } from "./lib/accounts";

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
const SCREEN_GAME_PICKER = "game_picker";
const SCREEN_PLATFORMER = "platformer";
const SCREEN_SURVIVAL = "survival";
const SCREEN_BREAKER = "breaker";
const SCREEN_CHESS_FAMILY = "chess_family";
const SCREEN_TOP = "top";
const SCREEN_HELPER = "helper";
function LearningControl() {
  const [gate, setGate] = useState(false);
  const [ab, setAb] = useState({ a: 0, b: 0 });
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const [, force] = useState(0);
  let on = false;
  try { on = !!(getLearningSettings() && getLearningSettings().enabled); } catch (e) {}
  function open() { setAb({ a: 3 + Math.floor(Math.random() * 7), b: 3 + Math.floor(Math.random() * 7) }); setVal(""); setErr(false); setGate(true); }
  function submit(e) {
    e.preventDefault();
    if (parseInt(val, 10) === ab.a * ab.b) {
      const next = !on;
      try { setLearningSettings({ ...getLearningSettings(), enabled: next }); } catch (e2) {}
      setGate(false); force((x) => x + 1);
    } else { setErr(true); }
  }
  return (
    <>
      <button onClick={open} aria-label="Learning mode (grown-ups only)" style={{ position: "fixed", bottom: "calc(64px + env(safe-area-inset-bottom))", left: 16, zIndex: 9998, background: on ? "rgba(40,165,75,0.92)" : "rgba(18,12,34,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}>Learning: {on ? "On" : "Off"}</button>
      {gate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,5,18,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <form onSubmit={submit} style={{ background: "#1E1733", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, textAlign: "center", fontFamily: NUN }}>
            <p style={{ color: "#fff", fontFamily: FRED, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Grown-ups only</p>
            <p style={{ color: "#B6AED0", fontSize: 14, margin: "0 0 14px" }}>Quick check — what is {ab.a} × {ab.b}?</p>
            <input autoFocus type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Type the answer" style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none", padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333" }} />
            {err && <p style={{ color: "#ffd7d7", fontSize: 13, margin: "8px 0 0" }}>Not quite — ask a grown-up.</p>}
            <button type="submit" style={{ width: "100%", marginTop: 12, border: "none", borderRadius: 999, padding: 12, fontFamily: FRED, fontWeight: 700, fontSize: 15, color: "#fff", background: "linear-gradient(90deg,#8A6BFF,#E0578F)", cursor: "pointer" }}>Turn Learning {on ? "Off" : "On"}</button>
            <button type="button" onClick={() => setGate(false)} style={{ width: "100%", marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: 10, color: "#C9C2E0", fontFamily: NUN, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </form>
        </div>
      )}
    </>
  );
}

function GamePicker({ onHome, onPlatformer, onSurvival, onBreaker, onChess, onTyping }) {
  const tile = (grad, title, desc, onClick, soon, imgId) => (
    <button onClick={soon ? undefined : onClick} disabled={soon} style={{ position: "relative", textAlign: "left", padding: "16px", borderRadius: "24px", border: CARD_BORDER, background: CARD_BG, color: "#fff", cursor: soon ? "not-allowed" : "pointer", opacity: soon ? 0.55 : 1, fontFamily: NUN, display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: 20, background: grad, boxShadow: "0 12px 26px rgba(0,0,0,0.42)", overflow: "hidden" }}>
        {imgId && <img src={`/api/images?kind=game&id=${imgId}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      </div>
      {soon && <span style={{ position: "absolute", top: 28, right: 28, fontSize: 12, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", padding: "5px 12px", borderRadius: 999, background: "#D8D2EC", color: "#1a1330" }}>Coming soon</span>}
      <div style={{ padding: "0 8px 6px" }}>
        <div style={{ fontFamily: FRED, fontSize: 26, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 15, color: "#cfc9e6", marginTop: 8 }}>{desc}</div>
      </div>
    </button>
  );
  return (
    <div style={styles.container}>
      <div style={{ ...styles.introTopBar, justifyContent: "flex-start" }}>
        <button onClick={onHome} style={styles.backButton}>Home</button>
      </div>
      <h1 style={{ ...styles.logo, marginTop: 8 }}>Games</h1>
      <p style={styles.tagline}>Pick a game to play!</p>
      <div style={{ width: "100%", maxWidth: "620px", marginTop: 20, display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {tile("linear-gradient(160deg,#4FA6E8,#2F8FD6)", "Platformer", "Run, jump and reach the flag!", onPlatformer, false, "platformer")}
        {tile("linear-gradient(160deg,#9B7BFF,#67E8F9)", "Breaker", "Bounce the ball, smash every brick!", onBreaker, false, "breaker")}
        {tile("linear-gradient(160deg,#8A6BFF,#6A4FE0)", "Survival", "Dodge the swarm and beat the boss!", onSurvival, false, "survival")}
        {tile("linear-gradient(160deg,#FFC75A,#F0972A)", "Chess", "Play solo, 2-player, or with family!", onChess, false, "chess")}
        {tile("linear-gradient(160deg,#46D7C0,#1FA897)", "Typing", "Learn to type — defend the castle!", onTyping, false, "typing")}
      </div>
    </div>
  );
}

function SurvivalScreen({ onHome }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: 14, left: 14, zIndex: 2, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>Back</button>
      <iframe title="Buildable Survival" src="/survival-engine.html" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
    </div>
  );
}

function BreakerScreen({ onHome }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: 14, left: 14, zIndex: 2, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>Back</button>
      <iframe title="Buildable Breaker" src="/breaker-engine.html" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
    </div>
  );
}

function PlatformerScreen({ onHome }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: 14, left: 14, zIndex: 2, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>Back</button>
      <iframe title="Buildable Platformer" src="/play.html" onLoad={(e) => { try { e.currentTarget.contentWindow.focus(); } catch (_) {} }} style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
    </div>
  );
}

function GrownUpFab({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Open grown-ups area" style={{ position: "fixed", bottom: "calc(16px + env(safe-area-inset-bottom))", left: 16, zIndex: 9998, background: "rgba(18,12,34,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: "10px 16px", fontSize: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}>Grown-ups</button>
  );
}

export default function BuildableKids() {
  const [screen, setScreen] = useState(isSignedIn() ? SCREEN_GROWNUP : SCREEN_HOME);
  const [remixData, setRemixData] = useState(null);
  const startRemix = (item) => {
    setRemixData(item);
    setReturnTo(SCREEN_TOP);
    if (item.kind === "song") setScreen(SCREEN_MUSIC);
    else if (item.kind === "story") setScreen(SCREEN_STORY);
    else {
      setGameData((prev) => ({ ...prev, playerName: prev.playerName || (activeKid && activeKid.display_name) || "", gameType: null, character: null, level: null }));
      setScreen(SCREEN_GAME_TYPE);
    }
  };
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
        if (done) { setActiveKidState(getActiveKid()); reloadLearningForActiveKid(); setScreen(SCREEN_GROWNUP); }
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
  const __view = (() => {
  if (screen === SCREEN_HOME) {
    return (
      <HomeScreen
        activeKid={activeKid}
        onMusic={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_MUSIC); }}
        onTop={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_TOP); }}
        onGames={() => setScreen(SCREEN_GAME_PICKER)}
        onStories={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_STORY); }}
        onTyping={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_TYPING); }}
        onChess={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_CHESS); }}
        onMyStuff={() => openMyStuff(SCREEN_HOME)}
        onGrownUp={() => setScreen(SCREEN_GROWNUP)}
        onAdmin={() => setScreen(SCREEN_ADMIN)}
        onHelper={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_HELPER); }}
      />
    );
  }

  // ============ INTRO SCREEN ============
  if (screen === SCREEN_INTRO) {
    return (
      <IntroScreen
        onComplete={(name, age) => {
          setGameData((prev) => ({ ...prev, playerName: name, age }));
          setRemixData(null);
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
          initialDescription={remixData && remixData.kind === "game" ? remixData.character : undefined}
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
          initialTheme={remixData && remixData.kind === "game" ? remixData.theme : undefined}
          onLevelCreated={(level) => {
            saveLevel(level); // auto-save to My Levels
            setGameData((prev) => ({ ...prev, level }));
            setRemixData(null);
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
  if (screen === SCREEN_TOP) {
    return (
      <TopBoard
        onHome={() => { setRemixData(null); setScreen(SCREEN_HOME); }}
        onBack={() => { setRemixData(null); setScreen(returnTo || SCREEN_HOME); }}
        onRemix={startRemix}
      />
    );
  }

  if (screen === SCREEN_MUSIC) {
    return (
      <MusicMaker
        playerName={gameData.playerName}
        remix={remixData && remixData.kind === "song" ? remixData : null}
        onConsumeRemix={() => setRemixData(null)}
        onHome={() => { setRemixData(null); setScreen(SCREEN_HOME); }}
        onBack={() => { setRemixData(null); setScreen(returnTo || SCREEN_HOME); }}
      />
    );
  }

  if (screen === SCREEN_STORY) {
    return (
      <StoryMaker
        playerName={(activeKid && activeKid.display_name) || gameData.playerName}
        remix={remixData && remixData.kind === "story" ? remixData : null}
        onConsumeRemix={() => setRemixData(null)}
        onHome={() => { setRemixData(null); setScreen(SCREEN_HOME); }}
        onBack={() => { setRemixData(null); setScreen(returnTo || SCREEN_HOME); }}
      />
    );
  }

  if (screen === SCREEN_TYPING) {
    return <TypingScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }

  if (screen === SCREEN_GAME_PICKER) {
    return <GamePicker onHome={() => setScreen(SCREEN_HOME)} onPlatformer={() => setScreen(SCREEN_PLATFORMER)} onSurvival={() => setScreen(SCREEN_SURVIVAL)} onBreaker={() => setScreen(SCREEN_BREAKER)} onChess={() => { setReturnTo(SCREEN_GAME_PICKER); setScreen(SCREEN_CHESS); }} onTyping={() => { setReturnTo(SCREEN_GAME_PICKER); setScreen(SCREEN_TYPING); }} />;
  }
  if (screen === SCREEN_PLATFORMER) {
    return <PlatformerScreen onHome={() => setScreen(SCREEN_GAME_PICKER)} />;
  }
  if (screen === SCREEN_SURVIVAL) {
    return <SurvivalScreen onHome={() => setScreen(SCREEN_GAME_PICKER)} />;
  }
  if (screen === SCREEN_BREAKER) {
    return <BreakerScreen onHome={() => setScreen(SCREEN_GAME_PICKER)} />;
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
  if (screen === SCREEN_HELPER) {
    return (
      <HelperLabScreen
        activeKid={activeKid}
        onHome={goHome}
        onDone={(kid) => { if (kid) setActiveKidState(kid); setScreen(SCREEN_HOME); }}
      />
    );
  }

  if (screen === SCREEN_GROWNUP) {
    return (
      <GrownUpScreen
        onBack={() => setScreen(SCREEN_HOME)}
        onProfileChosen={(kid) => {
          setActiveKidState(kid);
          reloadLearningForActiveKid();
          setScreen(SCREEN_HOME);
        }}
      />
    );
  }

  if (screen === SCREEN_ADMIN) {
    return <AdminDashboard onExit={() => setScreen(SCREEN_HOME)} />;
  }
  })();

  return (
    <>
      {__view}
      {[SCREEN_HOME, SCREEN_GAME_PICKER, SCREEN_MY_STUFF, SCREEN_TOP, SCREEN_INTRO].includes(screen) && <><GrownUpFab onClick={() => setScreen(SCREEN_GROWNUP)} /><LearningControl /></>}
    </>
  );
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
          <button onClick={onHome} style={styles.backButton}>Home</button>
        )}
      </div>
      <button onClick={onMyStuff} style={styles.myStuffButton}>
        My Stuff{total ? ` (${total})` : ""}
      </button>
    </div>
  );
}

// ============ INTRO SCREEN COMPONENT ============
// ============ HOME HUB COMPONENT ============
// The new front door. Segments the three experiences (Music live, Games in
// beta, Stories coming soon) and surfaces the Grown-ups portal + My Stuff.
function HomeScreen({ activeKid, onMusic, onGames, onStories, onTyping, onChess, onMyStuff, onGrownUp, onAdmin, onTop, onHelper }) {
  // App-icon tiles: a colored squircle + a clean white glyph (no emoji).
  const AppIcon = ({ grad, size = 76, children }) => (
    <div style={{ position: "relative", width: size, height: size, borderRadius: Math.round(size * 0.26), background: grad, boxShadow: "0 8px 18px rgba(0,0,0,0.4)", overflow: "hidden", flexShrink: 0 }}>
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
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 11h4M8 9v4" />
      <line x1="15" y1="11" x2="15.01" y2="11" /><line x1="17.5" y1="13.5" x2="17.51" y2="13.5" />
      <path d="M5 16a4 4 0 0 1-1.3-3.6l.8-4.2A3.5 3.5 0 0 1 7.9 5.5h8.2a3.5 3.5 0 0 1 3.4 2.7l.8 4.2A4 4 0 0 1 16.5 16c-1 0-1.8-.5-2.3-1.3l-.5-.7h-3.4l-.5.7C9.3 15.5 8.5 16 7.5 16z" />
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
  const TrophyGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v3a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M9 13.5h6M8 20h8M12 13.5V20" />
    </svg>
  );
  // The greeting buddy: a friendly default face (real helper art lands in Phase 2).
  const BuddyGlyph = ({ size = 34 }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M11 12 l5 6 M37 12 l-5 6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="18.5" cy="23" r="3.4" fill="#fff" /><circle cx="29.5" cy="23" r="3.4" fill="#fff" />
      <path d="M17.5 31 q6.5 6 13 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );

  // ---- responsive: phone < 700, tablet 700-1023, desktop >= 1024 ----
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const phone = vw < 700;
  const tablet = vw >= 700 && vw < 1024;
  const maxW = phone ? "100%" : tablet ? 720 : 940;
  const makeCols = phone ? 2 : 4;

  // Notify on the Chess card when it's this kid's move in a family game.
  const [chessTurns, setChessTurns] = useState(0);
  const prevTurnsRef = useRef(0);
  const dingChime = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = new AC();
      [660, 990].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f;
        const t = c.currentTime + i * 0.13; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.start(t); o.stop(t + 0.2);
      });
    } catch (e) { /* ignore */ }
  };
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        if (!isSignedIn()) { if (alive) setChessTurns(0); return; }
        const me = getActiveKid();
        if (!me) { if (alive) setChessTurns(0); return; }
        const ms = await listMyMatches(me.id);
        const n = (ms || []).filter((m) => (m.turn || "w") === (m.white_kid === me.id ? "w" : "b")).length;
        if (alive) {
          if (n > prevTurnsRef.current) dingChime();
          prevTurnsRef.current = n;
          setChessTurns(n);
        }
      } catch (e) { /* ignore */ }
    }
    check();
    const t = setInterval(check, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [activeKid]);

  const PILL_COLORS = ["linear-gradient(160deg,#8A6BFF,#6A4FE0)","linear-gradient(160deg,#F2789E,#E0578F)","linear-gradient(160deg,#4FA6E8,#2F8FD6)","linear-gradient(160deg,#3DD06A,#2BB14F)","linear-gradient(160deg,#FFC75A,#F0972A)","linear-gradient(160deg,#46D7C0,#1FA897)"];
  const pillGrad = (name) => { let h = 0; const s = name || "?"; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PILL_COLORS[h % PILL_COLORS.length]; };
  const initial = (name) => { const n = (name || "").trim(); return n ? n[0].toUpperCase() : "?"; };

  function deviceId() {
    try {
      let id = localStorage.getItem("deviceId");
      if (!id) { id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); localStorage.setItem("deviceId", id); }
      return id;
    } catch { return "dev_anon"; }
  }

  // ---- Jump back in: this kid's most recent creations (songs/stories/games) ----
  const [jumpItems, setJumpItems] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const did = deviceId();
        const kid = getActiveKid();
        const kq = kid && kid.id ? "&kidProfileId=" + encodeURIComponent(kid.id) : "";
        const q = "?deviceId=" + encodeURIComponent(did) + kq;
        const [sg, st, gm] = await Promise.all([
          fetch("/api/list-songs" + q).then((r) => r.json()).catch(() => ({})),
          fetch("/api/list-stories" + q).then((r) => r.json()).catch(() => ({})),
          fetch("/api/list-games" + q).then((r) => r.json()).catch(() => ({})),
        ]);
        const items = [];
        (sg && sg.songs || []).forEach((s) => items.push({ kind: "song", id: s.song_id, title: s.title || "My song", thumbnail: s.thumbnail || null, color: s.cover_color || "#7a3b8f", created_at: s.created_at, open: onMusic }));
        (st && st.stories || []).forEach((s) => items.push({ kind: "story", id: s.story_id, title: s.title || "My story", thumbnail: s.thumbnail || null, color: s.cover_color || "#1d6e56", created_at: s.created_at, open: onStories }));
        (gm && gm.games || []).forEach((g) => items.push({ kind: "game", id: g.game_id || g.id, title: g.title || "My game", thumbnail: g.thumbnail || g.preview_image_url || null, color: "#274690", created_at: g.created_at, open: onGames }));
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        if (alive) setJumpItems(items.slice(0, 3));
      } catch (e) { if (alive) setJumpItems([]); }
    })();
    return () => { alive = false; };
  }, [activeKid]);

  // ---- Trending from other kids: top published creations across kinds ----
  const [trending, setTrending] = useState([]);
  const [trendingLoaded, setTrendingLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const kinds = ["game", "song", "story"];
        const lists = await Promise.all(kinds.map((k) =>
          fetch("/api/top-creations?kind=" + k + "&limit=6").then((r) => r.json()).then((d) => (d.items || [])).catch(() => [])
        ));
        const all = [].concat.apply([], lists);
        const score = (c) => (c.heart_count || 0) * 3 + (c.play_count || 0);
        all.sort((a, b) => score(b) - score(a) || (new Date(b.created_at || 0) - new Date(a.created_at || 0)));
        if (alive) { setTrending(all.slice(0, 5)); setTrendingLoaded(true); }
      } catch (e) { if (alive) { setTrending([]); setTrendingLoaded(true); } }
    })();
    return () => { alive = false; };
  }, []);

  const KIND_TAG = {
    game: { label: "Game", color: "#bfa6f5", bg: "rgba(155,126,221,0.18)" },
    song: { label: "Song", color: "#e98fb3", bg: "rgba(214,90,123,0.20)" },
    story: { label: "Story", color: "#7CF6B0", bg: "rgba(124,246,176,0.16)" },
  };

  const kidName = (activeKid && activeKid.display_name) || "friend";
  const helperLine = chessTurns > 0
    ? `It's your move in ${chessTurns} chess game${chessTurns > 1 ? "s" : ""} — want to play?`
    : (jumpItems[0] ? `Want to keep going with “${jumpItems[0].title}”? Or make something new!` : "What should we make today? Tap a tile and I'll help!");

  // ---- floating helper (bottom-right): the kid's own helper character ----
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperHidden, setHelperHidden] = useState(false);
  const [defaultHelperImg, setDefaultHelperImg] = useState(null);
  const [localHelper] = useState(() => { try { return JSON.parse(localStorage.getItem("bk_helper_v1") || "null"); } catch { return null; } });
  const helper = (activeKid && activeKid.helper) || localHelper || null;
  useEffect(() => { const t = setTimeout(() => setHelperOpen(true), 900); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (helper && helper.image) return; // already have a real helper image
    let alive = true;
    fetch("/api/list-characters?limit=1").then((r) => r.json()).then((d) => {
      const arr = (d && (d.characters || d.items)) || (Array.isArray(d) ? d : []);
      const img = arr && arr[0] && (arr[0].image_url || arr[0].image);
      if (alive && img) setDefaultHelperImg(img);
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const helperImg = (helper && helper.image) || defaultHelperImg || null;
  const helperName = (helper && helper.name) || "your buddy";

  // ---- a "make" tile: colored app-icon + label. 2-player chip sits BELOW the
  // text (a flow element) so it never overlaps the icon on narrow tiles. ----
  const MakeTile = ({ grad, glyph, title, sub, tag, onClick }) => (
    <button
      onClick={onClick}
      style={{
        borderRadius: 20, padding: phone ? "18px 12px 14px" : "22px 14px 16px",
        border: CARD_BORDER, background: CARD_BG, color: "#fff", cursor: "pointer", fontFamily: NUN,
        textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
        minHeight: phone ? 142 : 172,
      }}
    >
      <AppIcon grad={grad} size={phone ? 70 : 84}>{glyph}</AppIcon>
      <div style={{ fontFamily: FRED, fontSize: phone ? 16 : 19, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: phone ? 11.5 : 13, color: "#cfc9e6" }}>{sub}</div>
      {tag && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase",
          padding: "3px 9px", borderRadius: 999, background: "rgba(155,126,221,0.22)", color: "#cfc1f5",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M16 3.5a3 3 0 0 1 0 7M22 21v-1a5 5 0 0 0-4-4.9" /></svg>
          2-player
        </span>
      )}
    </button>
  );

  return (
    <div style={{ ...styles.container, padding: phone ? "16px 14px 90px" : "24px 20px 100px" }}>
      <div style={{ width: "100%", maxWidth: maxW, margin: "0 auto" }}>

        {/* top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            {activeKid && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 999, padding: "7px 14px 7px 7px", fontFamily: NUN, fontWeight: 800,
                fontSize: 14, color: "#fff",
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
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onMyStuff} style={styles.myStuffButton}>My Stuff</button>
            <button onClick={onGrownUp} style={styles.myStuffButton}>{activeKid ? "Switch kid" : "Grown-ups"}</button>
          </div>
        </div>

        {/* welcome */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: FRED, fontWeight: 700, fontSize: phone ? 28 : 36, lineHeight: 1.08,
            background: "linear-gradient(90deg,#bfa6f5,#e98fb3)", WebkitBackgroundClip: "text",
            backgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Welcome back, {kidName}!</div>
          <div style={{ fontSize: phone ? 14 : 16, color: "#b8b3d0", fontWeight: 600, marginTop: 4 }}>Let's make something fun today.</div>
        </div>

        {/* your move card (multiplayer) */}
        {chessTurns > 0 && (
          <button onClick={onChess} style={{
            width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18,
            display: "flex", gap: 12, alignItems: "center",
            background: "linear-gradient(135deg, rgba(255,214,107,0.16), rgba(214,90,123,0.16))",
            border: "1px solid rgba(255,214,107,0.45)", borderRadius: 16, padding: "12px 14px", color: "#fff", fontFamily: NUN,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#5B3FD6,#8B6CFF)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChessGlyph /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Your move in chess
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#FFD66B", color: "#5a3d00", padding: "2px 7px", borderRadius: 999 }}>Your turn</span>
              </div>
              <div style={{ fontSize: 12, color: "#d9cfb0" }}>{chessTurns} game{chessTurns > 1 ? "s" : ""} waiting on you</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FFD66B", color: "#5a3d00", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "8px 13px", flexShrink: 0 }}>Play →</span>
          </button>
        )}

        {/* jump back in */}
        {jumpItems.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#fff" }}>Jump back in</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${jumpItems.length}, 1fr)`, gap: 10, marginBottom: 22 }}>
              {jumpItems.map((it) => {
                const tag = KIND_TAG[it.kind];
                return (
                  <button key={it.kind + it.id} onClick={it.open} style={{
                    borderRadius: 15, overflow: "hidden", border: "1px solid rgba(155,126,221,0.22)",
                    background: "#13111f", cursor: "pointer", textAlign: "left", padding: 0, color: "#fff", fontFamily: NUN,
                  }}>
                    <div style={{ height: phone ? 64 : 80, position: "relative", background: it.thumbnail ? `center/cover no-repeat url(${it.thumbnail})` : it.color }}>
                      <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", color: tag.color, background: "rgba(0,0,0,0.45)", padding: "2px 7px", borderRadius: 999 }}>{tag.label}</span>
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: "#8e89a8" }}>Your {it.kind}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* what do you want to make */}
        <div style={{ fontFamily: FRED, fontWeight: 600, fontSize: 16, color: "#fff", marginBottom: 11 }}>What do you want to make?</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${makeCols}, 1fr)`, gap: 12, marginBottom: 26 }}>
          <MakeTile grad="linear-gradient(160deg,#3DD06A,#2BB14F)" glyph={<ControllerGlyph />} title="Make a game" sub="Build & play games" tag onClick={onGames} />
          <MakeTile grad="linear-gradient(160deg,#FFB13C,#F0972A)" glyph={<TrophyGlyph />} title="Play a top game" sub="Play it, then remix it" tag onClick={onTop} />
          <MakeTile grad="linear-gradient(160deg,#F2789E,#E0578F)" glyph={<BookGlyph />} title="Make a story" sub="A living picture book" onClick={onStories} />
          <MakeTile grad="linear-gradient(160deg,#8A6BFF,#6A4FE0)" glyph={<NoteGlyph />} title="Make a song" sub="Sing about anything" onClick={onMusic} />
        </div>

        {/* trending from other kids — always shown */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#fff" }}>Trending from other kids</span>
          {trending.length > 0 && <button onClick={onTop} style={{ background: "none", border: "none", color: "#bfa6f5", fontFamily: NUN, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>See all →</button>}
        </div>
        {trending.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {trending.map((it, i) => {
              const tag = KIND_TAG[it.kind] || KIND_TAG.game;
              return (
                <button key={it.kind + it.id} onClick={onTop} style={{
                  display: "flex", alignItems: "center", gap: 11, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)", borderRadius: 13, padding: "9px 11px",
                  cursor: "pointer", color: "#fff", fontFamily: NUN, textAlign: "left",
                }}>
                  <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 14, color: "#8e89a8", width: 14, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: it.thumbnail ? `center/cover no-repeat url(${it.thumbnail})` : (it.cover_color || tag.bg) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: "#8e89a8" }}>by {it.creator || "a kid"}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", color: tag.color, background: tag.bg, padding: "3px 8px", borderRadius: 999, flexShrink: 0 }}>{tag.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button onClick={onTop} style={{
            width: "100%", textAlign: "center", cursor: "pointer", color: "#cfc9e6", fontFamily: NUN,
            background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(155,126,221,0.35)", borderRadius: 14, padding: "20px 16px",
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", marginBottom: 4 }}>No top projects yet</div>
            <div style={{ fontSize: 13 }}>Make something and publish it to be the first on the board!</div>
          </button>
        )}

      </div>

      {/* floating helper — the kid's own helper character, friendly + floating */}
      {!helperHidden && (
        <div style={{ position: "fixed", right: phone ? 14 : 22, bottom: phone ? 14 : 22, zIndex: 9000, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, fontFamily: NUN }}>
          {helperOpen && (
            <div style={{ maxWidth: 250, background: "#1b1830", border: "1px solid rgba(155,126,221,0.4)", borderRadius: "16px 16px 4px 16px", padding: "12px 14px", color: "#e9e5f7", boxShadow: "0 12px 34px rgba(0,0,0,0.55)", position: "relative", animation: "bkpop 0.18s ease-out" }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Hi {kidName}!</div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{helperLine}</div>
              <button onClick={onHelper} style={{ marginTop: 9, background: "rgba(155,126,221,0.18)", border: "1px solid rgba(155,126,221,0.4)", color: "#cfc1f5", fontFamily: NUN, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: "6px 12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3l2.2 6.3L22 11l-6.8 1.7L13 19l-2.2-6.3L4 11l6.8-1.7z" /><path d="M5 4v3M3.5 5.5h3" /></svg>
                Helper Lab
              </button>
            </div>
          )}
          <div style={{ position: "relative" }}>
            <button onClick={() => setHelperOpen((o) => !o)} aria-label={"Talk to " + helperName} className="bk-float" style={{
              width: phone ? 66 : 76, height: phone ? 66 : 76, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.22)", cursor: "pointer", padding: 0, overflow: "hidden",
              background: helperImg ? `center/cover no-repeat url(${helperImg})` : "linear-gradient(135deg,#9b7edd,#6f5bd6)",
              boxShadow: "0 10px 28px rgba(155,126,221,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {!helperImg && <BuddyGlyph size={phone ? 32 : 36} />}
            </button>
            <button onClick={() => setHelperHidden(true)} aria-label="Hide helper" style={{ position: "absolute", top: -5, right: -5, width: 22, height: 22, borderRadius: "50%", border: "2px solid #0a0a14", background: "#3a3550", color: "#fff", fontSize: 13, lineHeight: "16px", cursor: "pointer", padding: 0 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HelperLabScreen({ activeKid, onHome, onDone }) {
  return (
    <div style={styles.container}>
      <div style={{ ...styles.introTopBar, justifyContent: "flex-start" }}>
        <button onClick={onHome} style={styles.backButton}>Home</button>
      </div>
      <h1 style={{ ...styles.logo, marginTop: 8 }}>Helper Lab</h1>
      <p style={styles.tagline}>Pick a buddy or make your own — they cheer you on!</p>
      <div style={{ width: "100%", maxWidth: 920 }}>
        <CharacterCreatorScreen
          onCharacterCreated={(c) => {
            const helper = { name: (c && c.name) || "Buddy", image: (c && c.image) || null, description: (c && c.description) || "" };
            try { localStorage.setItem("bk_helper_v1", JSON.stringify(helper)); } catch (e) {}
            if (activeKid) { const kid = { ...activeKid, helper }; setActiveKid(kid); onDone(kid); }
            else { onDone(null); }
          }}
        />
      </div>
    </div>
  );
}

function TypingScreen({ onHome }) {
  // Learning Mode: one quick question before the typing game opens. Shows once
  // per entry; Skip/pass both proceed so a kid is never trapped. Off by default.
  const [gate, setGate] = useState(() => getLearningSettings().enabled);
  if (gate) {
    return (
      <QuizGate
        goal={getLearningSettings().goal}
        gameType="typing"
        title="One quick question first!"
        onPass={() => setGate(false)}
      />
    );
  }
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
        src="/buildable-chess.html?v=2"
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
        <button onClick={onMyStuff} style={styles.myStuffButton}>My Stuff</button>
      </div>

      <div style={styles.gameIcon}><GameGlyph id="controller" size={72} /></div>
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

// Vector game icons (no emoji). Monochrome line marks for the game-type picker.
function GameGlyph({ id, size = 60 }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "#d7d0f0", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  if (id === "runner") return (<svg {...p}><circle cx="14" cy="5" r="2"/><path d="M13 8l-3 3 2 3-1 5"/><path d="M10 11l-4 1"/><path d="M12 14l4 2"/><path d="M9 22l3-4"/></svg>);
  if (id === "flying") return (<svg {...p}><path d="M12 2c3 2 4 6 4 9l-4 3-4-3c0-3 1-7 4-9z"/><circle cx="12" cy="9" r="1.6"/><path d="M8 16l-2 4 4-2M16 16l2 4-4-2"/></svg>);
  if (id === "maze") return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h6v6M21 9h-6M9 3v3M15 21v-6"/></svg>);
  if (id === "match") return (<svg {...p}><path d="M12 3l2.2 5.3L20 10.5l-5.8 2.2L12 18l-2.2-5.3L4 10.5l5.8-2.2z"/></svg>);
  if (id === "breakout") return (<svg {...p}><rect x="3" y="4" width="7" height="4" rx="0.6"/><rect x="11" y="4" width="10" height="4" rx="0.6"/><rect x="3" y="9" width="10" height="4" rx="0.6"/><rect x="14" y="9" width="7" height="4" rx="0.6"/><circle cx="12" cy="19" r="1.4"/></svg>);
  return (<svg {...p}><rect x="3" y="9" width="18" height="9" rx="4.5"/><path d="M7 12v3M5.5 13.5h3"/><circle cx="16" cy="12.5" r="0.9"/><circle cx="18" cy="14.5" r="0.9"/></svg>);
}

// ============ GAME TYPE PICKER COMPONENT ============
function GameTypeScreen({ playerName, onGameSelected, onBack, onMyStuff }) {
  const games = [
    { id: "runner", name: "Runner", description: "Jump and duck through obstacles!" },
    { id: "flying", name: "Flying", description: "Blast enemies while you fly!" },
    { id: "maze", name: "Maze", description: "Find keys, unlock doors, get treasure!" },
    { id: "match", name: "Match Magic", description: "Match 3 or more to make them POP!" },
    { id: "breakout", name: "Brick Breaker", description: "Bounce the ball to smash all the bricks!" },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <button onClick={onMyStuff} style={styles.myStuffButton}>My Stuff</button>
      </div>

      <h1 style={styles.heading}>Pick your game</h1>
      <p style={styles.tagline}>Five totally different ways to play!</p>

      <div style={styles.gameGrid}>
        {games.map((game) => (
          <button key={game.id} onClick={() => onGameSelected(game.id)} style={styles.gameCard}>
            <div style={styles.gameIcon}><GameGlyph id={game.id} /></div>
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
  const [publishedGameId, setPublishedGameId] = useState(null);
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
        setPublishedGameId(data.gameId || null);
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

  const unpublishGame = async () => {
    try {
      const deviceId = localStorage.getItem("deviceId");
      if (publishedGameId && deviceId) {
        await fetch("/api/publish-creation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "game", id: publishedGameId, deviceId, publish: false }) });
      }
    } catch (e) { /* ignore */ }
    setPublishedUrl(null); setPublishedGameId(null);
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
        <button onClick={onMyStuff} style={styles.myStuffButton}>My Stuff</button>
      </div>

      <h1 style={styles.heading}>
        {loading ? "Building your game" + dots : gameHtml ? "" + (gameData.level?.name || "Your Game") + "!" : "Uh oh!"}
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
            Building your game{dots}
          </p>
          <p style={{ fontSize: "15px", color: "#b0abc8" }}>
            Claude is writing custom game code for {gameData.character?.name || "your hero"} right now!
          </p>
        </div>
      )}

      {error && (
        <div style={styles.errorGame}>
          <p style={{ fontSize: "20px", color: "#ff9a9a" }}>{error}</p>
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
                {publishing ? "Publishing..." : "Publish my game!"}
              </button>
              {publishError && <p style={styles.error}>{publishError}</p>}
            </>
          ) : (
            <div style={styles.publishedBox}>
              <p style={styles.publishedTitle}>Published! Anyone can play it now.</p>
              <p style={styles.shareLabel}>Share link:</p>
              <code style={styles.shareLink}>{(typeof window !== "undefined" ? window.location.origin : "") + publishedUrl}</code>
              <button onClick={unpublishGame} style={{ marginTop: "14px", background: "rgba(255,255,255,0.10)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "999px", padding: "10px 20px", fontWeight: 800, fontFamily: NUN, cursor: "pointer" }}>Make private</button>
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
    fontSize: "clamp(26px, 7vw, 44px)",
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
    fontSize: "clamp(32px, 9vw, 64px)",
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
