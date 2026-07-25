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
import GameLobby from "./GameLobby";
import GrownUpFriends from "./GrownUpFriends";
import FamilyTown from "./FamilyTown";
import FamilyCheckers from "./FamilyCheckers";
import FamilyRealtime from "./FamilyRealtime";
import { listMyMatches } from "./lib/chessMatches";
import { listInvitesForKid } from "./lib/rtMatch";
import { startPresence, stopPresence, inboxInvites } from "./lib/friends";
import { listActiveFriendMatches, roleFor } from "./lib/friendMatches";
import { setLearningSettings, saveCharacter, saveLevel, libraryCounts, onLibraryChange, reloadLearningForActiveKid, getLearningSettings, getProgress, dailyLearningProgress, effectiveLearning } from "./store";
import { getActiveKid, setActiveKid, saveKidHelper, getKidHelper, isSignedIn, completeOAuthRedirect, ensureFreshToken, listKidProfiles } from "./lib/accounts";
import { registerAudio } from "./lib/audioUnlock";
import { playVoiceUrl, stopVoice } from "./lib/voiceBus";
import { setCurrentGame, logGameEvent, logSkillEvent } from "./lib/gameLog";

// Screens
const SCREEN_HOME = "home";
const SCREEN_FRIEND_MATCH = "friend_match"; // open a friend game straight from a home nudge
const SCREEN_INTRO = "intro";
const SCREEN_GAME_TYPE = "game_type";
const SCREEN_CHARACTER_CREATOR = "character_creator";
const SCREEN_LEVEL_CREATOR = "level_creator";
const SCREEN_PLAY = "play";
const SCREEN_MY_STUFF = "my_stuff";
const SCREEN_ADMIN = "admin";
const SCREEN_MUSIC = "music";
const SCREEN_MUSIC_LANDING = "music_landing"; // Session 6C: studio front door (shell-generated)
const SCREEN_MUSIC_LOADOUT = "music_loadout"; // Session 6C: studio loadout (instrument packs)
const SCREEN_GROWNUP = "grownup";
const SCREEN_STORY = "story";
const SCREEN_TYPING = "typing";
const SCREEN_CHESS = "chess";
const SCREEN_PLATFORMER = "platformer";
const SCREEN_SURVIVAL = "survival";
const SCREEN_SURVIVAL_UPGRADES = "survival_upgrades"; // Session 9B: shell gameplay-upgrade store
const SCREEN_BREAKER = "breaker";
const SCREEN_BREAKER_LANDING = "breaker_landing";
const SCREEN_BREAKER_JOURNEY = "breaker_journey";
const SCREEN_BREAKER_LOADOUT = "breaker_loadout";
const SCREEN_TANK = "tank";
const SCREEN_RUNNER = "runner";
const SCREEN_TUMBLE = "tumble";
const SCREEN_SOUNDS = "sounds";
const SCREEN_CHESS_FAMILY = "chess_family";
const SCREEN_CHESS_LOBBY = "chess_lobby";
const SCREEN_CHESS_LANDING = "chess_landing"; // Session 7E: chess uses the one shell landing (board frame)
const SCREEN_CHESS_SOLO = "chess_solo";       // Session 7E: board "pick difficulty & play" frame
const SCREEN_GROWNUP_FRIENDS = "grownup_friends";
const SCREEN_CHECKERS = "checkers";
const SCREEN_CHECKERS_FAMILY = "checkers_family";
const SCREEN_CHECKERS_LOBBY = "checkers_lobby";
const SCREEN_TENNIS = "tennis";
const SCREEN_TENNIS_FAMILY = "tennis_family";
const SCREEN_TENNIS_LOBBY = "tennis_lobby";
const SCREEN_TOWN = "town";
const SCREEN_TOWN_FAMILY = "town_family";
const SCREEN_TICTACTOE = "tictactoe";
const SCREEN_TTT_LOBBY = "ttt_lobby";
const SCREEN_CONNECTFOUR = "connectfour";
const SCREEN_C4_LOBBY = "c4_lobby";
const SCREEN_DOTSBOXES = "dotsboxes";
const SCREEN_DOTS_LOBBY = "dots_lobby";
const SCREEN_CASTLE = "castle";
const SCREEN_SLING = "sling";
const SCREEN_SLING_JOURNEY = "sling_journey"; // Sling uses the shared winding Journey picker (like Breaker)
const SCREEN_CROC = "croc";
const SCREEN_RILEYS = "rileys";
const SCREEN_MAHJONG = "mahjong";
const SCREEN_STRINGMATCH = "stringmatch";
const SCREEN_BUBBLE = "bubble";
const SCREEN_MATHCANNON = "mathcannon";
const SCREEN_GAME_LANDING = "game_landing";   // Session 7F: shared landing as the front door for every keeper
const SCREEN_GAME_LOADOUT = "game_loadout";   // Session 7F: shared "Make it mine" loadout for the landed game
const SCREEN_TENNIS_LANDING = "tennis_landing"; // Session 7F: Tennis on the shared landing (mode row + court skins)
const SCREEN_TENNIS_LOADOUT = "tennis_loadout"; // Session 7F: Tennis court skins in the shared loadout
const SCREEN_EXPLORE = "explore"; // Session 8G: Kidspedia exhibit viewer (orbit-explorer template)

// Which screens are games (for per-kid play/win/lose logging). Family variants
// log under the base game; SCREEN_PLAY = a generated "Make a game" creation.
const GAME_SLUGS = {
  [SCREEN_PLATFORMER]: "platformer",
  [SCREEN_SURVIVAL]: "survival",
  [SCREEN_BREAKER]: "breaker",
  [SCREEN_CASTLE]: "castle",
  [SCREEN_CROC]: "croc",
  [SCREEN_MATHCANNON]: "mathcannon",
  [SCREEN_RILEYS]: "rileys",
  [SCREEN_TUMBLE]: "tumble",
  [SCREEN_CHESS]: "chess",
  [SCREEN_CHESS_FAMILY]: "chess",
  [SCREEN_TYPING]: "typing",
  [SCREEN_TENNIS]: "tennis",
  [SCREEN_TENNIS_FAMILY]: "tennis",
  [SCREEN_TOWN]: "town",
  [SCREEN_TOWN_FAMILY]: "town",
  [SCREEN_TICTACTOE]: "tictactoe",
  [SCREEN_CONNECTFOUR]: "connectfour",
  [SCREEN_DOTSBOXES]: "dotsboxes",
  [SCREEN_SLING]: "sling",
  [SCREEN_TANK]: "tank",
  [SCREEN_MAHJONG]: "mahjong",
  [SCREEN_STRINGMATCH]: "stringmatch",
  [SCREEN_BUBBLE]: "bubble",
  [SCREEN_PLAY]: "generated",
};
const SCREEN_TOP = "top";
const SCREEN_HELPER = "helper";
const SCREEN_ART = "art";
const SCREEN_MEMORY = "memory";
const SCREEN_BINGO = "bingo";
const SCREEN_SNAKES = "snakes";
const SCREEN_MAZE = "maze";
const SCREEN_WRAP_JOURNEY = "wrapjourney";   // Session 7I: the ONE shared journey for every wrapped game
const SCREEN_BOARD_SOLO = "boardsolo";       // Session 7I: the ONE shared board difficulty picker (non-chess)

// Session 7F — shared-landing wrap table. Each keeper's Play launches its existing
// engine screen (engines untouched); loadout:true means the manifest carries a
// "Make it mine" slot. Adding a game to the shared front door is one data row here,
// not new screen code. (Breaker/Chess/Music/Tennis keep their own richer blocks.)
// Session 7I adds per-game `journey` (Play routes to the shared GameJourney and the
// engine is deep-linked with ?level=) and `demo` (the landing demo box URL — every
// engine now has a Breaker-style ?screen=demo attract mode). Games without `demo`
// show no demo box at all (never an empty box that implies gameplay).
const LANDING_WRAP = {
  survival: { play: SCREEN_SURVIVAL, loadout: true, journey: true, demo: "/survival-engine.html?v=9c&screen=demo" },
  sling: { play: SCREEN_SLING, loadout: true, journey: true, demo: "/sling-squad.html?v=hud3&screen=demo" },
  tictactoe: { play: SCREEN_TICTACTOE, loadout: true, demo: "/tictactoe-engine.html?v=hud2&screen=demo" },
  connectfour: { play: SCREEN_CONNECTFOUR, loadout: true, demo: "/connectfour-engine.html?v=hud2&screen=demo" },
  dotsboxes: { play: SCREEN_DOTSBOXES, loadout: true, demo: "/dotsboxes-engine.html?v=hud2&screen=demo" },
  checkers: { play: SCREEN_CHECKERS, loadout: true, demo: "/buildable-checkers.html?v=3&screen=demo" },
  memory: { play: SCREEN_MEMORY, loadout: true, journey: true, demo: "/memory-engine.html?v=hud2&screen=demo" },
  mahjong: { play: SCREEN_MAHJONG, loadout: true, journey: true, demo: "/mahjong-engine.html?v=hud2&screen=demo" },
  bingo: { play: SCREEN_BINGO, loadout: true },
  croctot: { play: SCREEN_CROC, loadout: true, journey: true, demo: "/croctot.html?v=hud2&screen=demo" },
  stringmatch: { play: SCREEN_STRINGMATCH, journey: true, demo: "/string-match.html?v=2&screen=demo" },
  bubble: { play: SCREEN_BUBBLE, journey: true, demo: "/bubble-engine.html?v=hud2&screen=demo" },
  castleguard: { play: SCREEN_CASTLE, journey: true, demo: "/castle-guard.html?v=hud2&screen=demo" },
  tumble: { play: SCREEN_TUMBLE, journey: true, demo: "/tumble-engine.html?v=1&screen=demo" },
  "rileys-garden": { play: SCREEN_RILEYS, journey: true, demo: "/rileys-garden.html?v=art2&screen=demo" },
  typing: { play: SCREEN_TYPING, journey: true, demo: "/typing.html?v=2&screen=demo" },
  mathcannon: { play: SCREEN_MATHCANNON, journey: true, demo: "/mathcannon-engine.html?v=2&screen=demo" },
  platformer: { play: SCREEN_PLATFORMER },
  town: { play: SCREEN_TOWN },
  runner: { play: SCREEN_RUNNER },
  tank: { play: SCREEN_TANK },
  maze: { play: SCREEN_MAZE },
};

// Session 7H — the four board games that get a multiplayer mode row on the shared
// landing (Solo / Same device / Play a friend), matching Chess and Tennis. Solo and
// Same device enter the engine's own menu (the Phase-2 ?diff deep-links are not in
// yet); Play a friend opens the shared GameLobby. TTT + Checkers already had lobbies;
// Connect Four + Dots use the same board harness online path via gameSpecFor (7H).
const BOARD_MP_LANDING = {
  tictactoe:   { play: SCREEN_TICTACTOE,   lobby: SCREEN_TTT_LOBBY },
  connectfour: { play: SCREEN_CONNECTFOUR, lobby: SCREEN_C4_LOBBY },
  dotsboxes:   { play: SCREEN_DOTSBOXES,   lobby: SCREEN_DOTS_LOBBY },
  checkers:    { play: SCREEN_CHECKERS,    lobby: SCREEN_CHECKERS_LOBBY },
};
// ---------------------------------------------------------------------------
// GAME_CATALOG — the picker's manifest/identity layer (Session 3A). Every card on
// the picker is GENERATED from this list, never hand-placed. Each entry is the
// identity slice of a game's manifest: badge art (imgId), display name, category,
// signature color, and whether it is a game or a studio. Breaker's identity mirrors
// its real /breaker/manifest.json; the rest are lightweight stubs that get enriched
// into full manifests as each game converts (Phase 5+). `handler` is the shell
// callback prop that opens the game; `soon` keeps the coming-soon password gate.
// ---------------------------------------------------------------------------
const GAME_CATALOG = [
  { id: "breaker",     name: "Breaker",          category: "Arcade",   color: "#FF6B6B", type: "game", imgId: "breaker",     handler: "onBreaker",     desc: "Bounce the ball, smash every brick!" },
  { id: "music-maker", name: "Music Maker",      category: "Studio",   color: "#37B6F5", type: "studio", imgId: "music",     handler: "onMusicMaker",  desc: "Make your own songs — pick a vibe and press go!" },
  { id: "chess",       name: "Chess",            category: "Board",    color: "#F0972A", type: "game", imgId: "chess",       handler: "onChess",       desc: "Play solo, 2-player, or with family!" },
  { id: "sling",       name: "Sling Squad",      category: "Action",   color: "#7BD0FF", type: "game", imgId: "sling",       handler: "onSling",       desc: "Fling your pals, topple every tower!" },
  { id: "tictactoe",   name: "Tic-Tac-Toe",      category: "Classic",  color: "#5B8CFF", type: "game", imgId: "tictactoe",   handler: "onTicTacToe",   desc: "Three in a row — solo or 2 players!" },
  { id: "survival",    name: "Survival",         category: "Action",   color: "#8A6BFF", type: "game", imgId: "survival",    handler: "onSurvival",    desc: "Dodge the swarm and beat the boss!" },
  { id: "stringmatch", name: "String Match",     category: "Classic",  color: "#57A93F", type: "game", imgId: "stringmatch", handler: "onStringMatch", desc: "Draw a string to connect the matching buddies!" },
  { id: "bubble",      name: "Bubble Buddies",   category: "Arcade",   color: "#5BC0EB", type: "game", imgId: "bubble",      handler: "onBubble",      desc: "Aim and pop — match 3 buddies to set them free!" },
  { id: "tennis",      name: "Tennis",           category: "Sports",   color: "#34D399", type: "game", imgId: "tennis",      handler: "onTennis",      desc: "Bounce it back — solo, 2 players, or family!" },
  { id: "castleguard", name: "Castle Guard",     category: "Strategy", color: "#2E8B57", type: "game", imgId: "castleguard", handler: "onCastle",      desc: "Place archers and knights to stop the silly goblins!" },
  { id: "tumble",      name: "Tumble Blocks",    category: "Puzzle",   color: "#67C7FF", type: "game", imgId: "tetris",      handler: "onTumble",      desc: "Fill a row and watch it tumble away!" },
  { id: "croctot",     name: "Croc Tot",         category: "Action",   color: "#3AA655", type: "game", imgId: "croctot",     handler: "onCroc",        desc: "Blast the goofy flying snacks and beat the boss!" },
  { id: "rileys-garden", name: "Riley's Garden",    category: "Action",   color: "#4CAF50", type: "game", imgId: "rileys",      handler: "onRileys",      desc: "Grow a garden, blast the bees, beat the bear!" },
  { id: "connectfour", name: "Connect Four",     category: "Classic",  color: "#FF5A6E", type: "game", imgId: "connectfour", handler: "onConnectFour", desc: "Drop discs, line up four to win!" },
  { id: "dotsboxes",   name: "Dots and Boxes",   category: "Classic",  color: "#36D6C3", type: "game", imgId: "dotsboxes",   handler: "onDotsBoxes",   desc: "Close a box to claim it — most wins!" },
  { id: "checkers",    name: "Checkers",         category: "Classic",  color: "#8E6BFF", type: "game", imgId: "checkers",    handler: "onCheckers",    desc: "Hop, jump and crown your kings!" },
  { id: "typing",      name: "Typing",           category: "Classic",  color: "#1FA897", type: "game", imgId: "typing",      handler: "onTyping",      desc: "Learn to type — defend the castle!" },
  { id: "memory",      name: "Memory Match",     category: "Puzzle",   color: "#A78BFF", type: "game", imgId: "memory",      handler: "onMemory",      desc: "Flip cards, find the pairs — solo or 2-4!" },
  { id: "mahjong",     name: "Mahjong",          category: "Classic",  color: "#F0B429", type: "game", imgId: "mahjong",     handler: "onMahjong",     desc: "Match free tiles in pairs to clear the board!" },
  { id: "mathcannon",  name: "Math Cannon",      category: "Learning", color: "#F4A63B", type: "game", imgId: "mathcannon",  handler: "onMathCannon",  desc: "Solve the problem and fire the cannon at the right answer!" },
  { id: "platformer",  name: "Hop Heroes",       category: "Action",   color: "#2F8FD6", type: "game", imgId: "platformer",  handler: "onPlatformer",  desc: "Run, jump and reach the flag!", soon: true },
  { id: "town",        name: "Family Town",      category: "Board",    color: "#7C5CFC", type: "game", imgId: "town",        handler: "onTown",        desc: "Roll, move, collect coins — 3-4 players!", soon: true },
  { id: "runner",      name: "Sunny Town Drive", category: "Arcade",   color: "#FF8FB1", type: "game", imgId: "runner",      handler: "onRunner",      desc: "Drive through town, dodge and grab treats!", soon: true },
  { id: "tank",        name: "Hilltop Tanks",    category: "Action",   color: "#4F9A44", type: "game", imgId: "tank",        handler: "onTank",        desc: "Aim across the hills and knock out the computer tank!", soon: true },
  { id: "maze",        name: "Maze Munchers",    category: "Arcade",   color: "#F0577E", type: "game", imgId: "maze",        handler: "onMaze",        desc: "Gobble the treats, dodge the chasers!", soon: true },
  { id: "bingo",       name: "Bingo",            category: "Classic",  color: "#FFD23F", type: "game", imgId: "bingo",       handler: "onBingo",       desc: "The device calls — daub a line to win, 2-4!", soon: true },
];

// ===========================================================================
//  Session 2E — reload-safe addresses inside /app. The shell mirrors every
//  STABLE destination (Home, a game's landing, Kidspedia, Creations) into the
//  address bar so a refresh restores that spot and the browser Back button steps
//  back through screens. Transient screens (in-game play, journeys, lobbies, the
//  make-a-game build flow, grown-ups, admin) get NO address of their own, so a
//  reload on them falls back to the last stable address — a game's landing, or
//  Home — never deeper. (Saving mid-build progress is a later job.) Hosting
//  already routes /app/(.*) to the shell, so no vercel/routing change is needed.
// ===========================================================================
const URL_STABLE_LANDINGS = {
  [SCREEN_BREAKER_LANDING]: "breaker",
  [SCREEN_BREAKER_JOURNEY]: "breaker/journey",
  [SCREEN_BREAKER_LOADOUT]: "breaker/loadout",
  [SCREEN_TENNIS_LANDING]: "tennis",
  [SCREEN_CHESS_LANDING]: "chess",
  [SCREEN_MUSIC_LANDING]: "music-maker",
};
// screen (+ its params) -> the /app path it should show, or null when the screen
// is transient (keep the last stable address instead of writing a new one).
function viewToPath(screen, landingId, exploreId) {
  if (screen === SCREEN_HOME) return "/app";
  if (screen === SCREEN_MY_STUFF) return "/app/creations";
  if (screen === SCREEN_EXPLORE) return "/app/explore" + (exploreId ? "/" + exploreId : "");
  if (URL_STABLE_LANDINGS[screen]) return "/app/" + URL_STABLE_LANDINGS[screen];
  if (screen === SCREEN_GAME_LANDING && landingId) return "/app/" + landingId;
  return null;
}
// The reverse: an /app path -> which stable screen (+ params) to restore. Returns
// null for anything outside /app or not a recognized stable address, so the other
// deep-link paths (?bk=, /admin, OAuth) and every transient screen are left alone.
function screenForPath(pathname) {
  if (typeof pathname !== "string" || !/^\/app(\/|$)/.test(pathname)) return null;
  const seg = pathname.replace(/^\/app\/?/, "").replace(/\/+$/, "");
  if (!seg) return { screen: SCREEN_HOME };
  if (seg === "creations") return { screen: SCREEN_MY_STUFF };
  if (seg === "explore" || seg.indexOf("explore/") === 0) {
    const id = seg.split("/")[1];
    return { screen: SCREEN_EXPLORE, exploreId: id || undefined };
  }
  if (seg === "breaker") return { screen: SCREEN_BREAKER_LANDING };
  if (seg === "breaker/journey") return { screen: SCREEN_BREAKER_JOURNEY };
  if (seg === "breaker/loadout") return { screen: SCREEN_BREAKER_LOADOUT };
  if (seg === "tennis") return { screen: SCREEN_TENNIS_LANDING };
  if (seg === "chess") return { screen: SCREEN_CHESS_LANDING };
  if (seg === "music-maker") return { screen: SCREEN_MUSIC_LANDING };
  const id = seg.split("/")[0];
  if (GAME_CATALOG.some((g) => g.id === id) && LANDING_WRAP[id]) return { screen: SCREEN_GAME_LANDING, landingId: id };
  return null;
}

// EXHIBIT_CATALOG — Kidspedia exhibits for the Home Explore shelf (Session 8G).
// Mirrors EXHIBIT-MANIFEST.md's shared fields. Only status:"approved" exhibits ever
// appear here or are servable at /explore/{id} (the template itself re-checks this
// against the live JSON file, so this list is a display-only convenience, not the
// source of truth).
const EXHIBIT_CATALOG = [
  { id: "solar-system", title: "Our Solar System", topic: "space", color: "#4C6FE0", heroArt: "explore-solar-system-hero", status: "approved" },
  // Journey to the Deep (layers-cutaway dive template). Stays hidden from kids until
  // Mike fact-checks the roster and flips BOTH this status and ocean-deep.json to "approved".
  { id: "ocean-deep", title: "Journey to the Deep", topic: "ocean", color: "#1173B4", heroArt: "/api/asset-studio?asset=explore/scene/ocean-photo/reef", status: "approved" },
  // Make It Rain (weather-lab template, the live weather machine). Approved by Mike 2026-07-21.
  { id: "make-it-rain", title: "Weather Lab", topic: "weather", color: "#37B6F5", heroArt: "/api/asset-studio?asset=explore/scene/make-it-rain/hero", status: "approved" },
  // Kidspedia topic books (Session TB1, topic-book template). Photo-real picture
  // books: cover + 4 photo pages, every fact carries its own source. They stay
  // hidden from kids until Mike fact-checks each book and flips BOTH this status
  // and the exhibit JSON to "approved".
  { id: "sharks", title: "Sharks", topic: "ocean", color: "#1173B4", heroArt: "/explore/topic-photos/sharks/sharks-cover.webp", status: "in-review", template: "topic-book" },
  { id: "dinosaurs", title: "Dinosaurs", topic: "dinosaurs", color: "#6B8E23", heroArt: "/explore/topic-photos/dinosaurs/dinosaurs-cover.webp", status: "in-review", template: "topic-book" },
  { id: "moon", title: "The Moon", topic: "space", color: "#4C6FE0", heroArt: "/explore/topic-photos/moon/moon-cover.webp", status: "in-review", template: "topic-book" },
];

// Session TB2 — the bookshelf card. Topic books do NOT each get their own Home
// card: they live behind ONE "Kidspedia Books" card that opens the bookshelf
// (/explore/kidspedia), so the Explore row stays short as all 20 books land.
// The card only exists once a book is actually approved, so a kid never taps
// through to an empty shelf. The bookshelf re-checks every book's own file, so
// this list stays a display convenience and never the gate.
const BOOKSHELF_CARD = { id: "kidspedia", title: "Kidspedia Books", topic: "books", color: "#B8562F", heroArt: "", status: "approved" };
function exploreShelfItems() {
  const approvedBooks = EXHIBIT_CATALOG.filter((ex) => ex.status === "approved" && ex.template === "topic-book");
  const items = EXHIBIT_CATALOG.filter((ex) => ex.status === "approved" && ex.template !== "topic-book");
  if (approvedBooks.length) items.push({ ...BOOKSHELF_CARD, heroArt: approvedBooks[0].heroArt || "" });
  return items;
}

// Games that support the zero-account "play a friend by link" flow (the grandma flow).
// Maps a catalog id -> the /api/invite game code. Add a game here once play-invite.html
// speaks its online contract (chess relay + ttt server-referee are wired today).
const GUEST_SHAREABLE = { chess: "chess", tictactoe: "ttt" };

// Create a guest invite tied to the signed-in kid, then hand this device the host
// seat on the standalone link page (where the "send link" buttons live).
async function startGuestLink(catalogId) {
  const code = GUEST_SHAREABLE[catalogId];
  if (!code) return;
  const kid = getActiveKid();
  let dev = localStorage.getItem("bk_guest_device");
  if (!dev) { dev = "g_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("bk_guest_device", dev); }
  const name = (kid && kid.display_name) || "Me";
  localStorage.setItem("bk_guest_name", name);
  try {
    const r = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", game: code, name, device: dev, world: "jungle", hostKid: kid && kid.id }) });
    const j = await r.json().catch(() => ({}));
    if (j && j.token) window.location.href = "/play-invite.html?t=" + encodeURIComponent(j.token) + "&g=" + code;
  } catch (e) { /* offline: silently no-op */ }
}

// One picker card, generated entirely from a GAME_CATALOG entry (badge art, name,
// category, signature color, studio tag). No card is hand-placed anymore.
function PickerCard({ g, onOpen, onShare }) {
  const accent = g.color;
  return (
    <button onClick={onOpen} style={{ position: "relative", textAlign: "left", padding: "16px", borderRadius: "24px", border: `1px solid ${accent}55`, background: CARD_BG, color: "#fff", cursor: "pointer", opacity: g.soon ? 0.6 : 1, fontFamily: NUN, display: "flex", flexDirection: "column", gap: "14px", boxShadow: "0 10px 26px rgba(0,0,0,0.4)" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: 20, background: `linear-gradient(160deg, ${accent}, ${accent}88)`, boxShadow: "0 12px 26px rgba(0,0,0,0.42)", overflow: "hidden" }}>
        {g.imgId && <img src={`/api/images?kind=game&id=${g.imgId}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        {g.type === "studio" && <span style={{ position: "absolute", top: 10, left: 10, fontSize: 11, fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999, background: "rgba(12,10,24,0.72)", color: "#fff" }}>Studio</span>}
        {onShare && !g.soon && <span role="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onShare(); }} style={{ position: "absolute", top: 10, right: 10, fontSize: 11, fontWeight: 900, letterSpacing: "0.3px", padding: "6px 11px", borderRadius: 999, background: "rgba(12,10,24,0.8)", color: "#fff", border: `1px solid ${accent}`, cursor: "pointer" }}>Play a friend</span>}
      </div>
      {g.soon && <span style={{ position: "absolute", top: 28, right: 28, fontSize: 12, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", padding: "5px 12px", borderRadius: 999, background: "#D8D2EC", color: "#1a1330" }}>Coming soon</span>}
      <div style={{ padding: "0 8px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: accent, flex: "0 0 auto", boxShadow: `0 0 10px ${accent}` }} />
          <div style={{ fontFamily: FRED, fontSize: 26, fontWeight: 700 }}>{g.name}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: accent, marginTop: 7 }}>{g.category}{g.type === "studio" && g.category !== "Studio" ? " · Studio" : ""}</div>
        <div style={{ fontSize: 15, color: "#cfc9e6", marginTop: 6 }}>{g.desc}</div>
      </div>
    </button>
  );
}

// Legacy GamePicker removed (Session 7G): Home is the single front door (its Play
// shelf maps the whole GAME_CATALOG). The coming-soon password gate now lives on
// the Home shelf cards. Nothing renders or routes to the old picker anymore.
// ---- ONE consistent game frame for every full-screen game/maker ----
// Home is always top-left; games never draw their own back button (BS showBack:false).
// Also returns to the hub on a nav:exit message (string, {type:"nav:exit"}, or legacy bk:home).
function NavBtn({ kind, muted, top, onClick }) {
  const sv = { stroke: "#fff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  let icon = null;
  if (kind === "sound") icon = muted
    ? <g {...sv}><path d="M5 9v6h4l5 4V5L9 9z" /><path d="M22 9l-6 6M16 9l6 6" /></g>
    : <g {...sv}><path d="M5 9v6h4l5 4V5L9 9z" /><path d="M17 8a5 5 0 0 1 0 8" /></g>;
  else if (kind === "menu") icon = <g {...sv}><path d="M4 7h16M4 12h16M4 17h16" /></g>;
  return (
    <button onClick={onClick} aria-label={kind} style={{ position: "absolute", top, right: 14, zIndex: 3, width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.25)", background: "rgba(18,18,38,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: NUN, fontWeight: 800, fontSize: 17, padding: 0 }}>
      {kind === "help" ? "?" : <svg width="20" height="20" viewBox="0 0 24 24">{icon}</svg>}
    </button>
  );
}

// One shell-owned game wrapper. Home is always top-left. If a game opts into the
// shared nav bridge (buildable-gamenav.js -> posts "nav:state"), the shell also renders
// its Sound/Menu/Help cluster top-right and the game draws NO nav buttons of its own
// (nothing per-game to drift or overlap). Games that don't opt in render exactly as before.
function GameFrame({ title, src, onHome, bg = "#0F0E17", light = false, right = null, iframeProps = {}, onChildMessage = null, overlay = null }) {
  const ref = useRef(null);
  const [nav, setNav] = useState(null);
  useEffect(() => {
    const h = (e) => {
      const d = e && e.data;
      if (d === "nav:exit" || d === "bk:home" || (d && d.type === "nav:exit")) { onHome(); return; }
      if (d && d.type === "nav:state") setNav({ sound: !!d.sound, hasMenu: !!d.hasMenu, hasHelp: !!d.hasHelp, inGame: d.inGame !== false });
      // CARTRIDGE-CONTRACT `skill`: any embedded game reports a practiced skill; the
      // shell relays it into the shared learning_events ledger (one record per kid,
      // same source the quiz gates write to). Best-effort, never blocks play.
      if (d && d.source === "buildable" && d.kind === "skill") {
        try { logSkillEvent({ subject: d.subject, skill: d.skill, correct: d.correct, questionId: d.questionId, quizType: d.quizType, grade: (getLearningSettings() || {}).grade || null, game: d.game }); } catch (e) {}
      }
      if (onChildMessage) { try { onChildMessage(d, (msg) => { try { ref.current && ref.current.contentWindow && ref.current.contentWindow.postMessage(msg, "*"); } catch (e) {} }); } catch (e) {} }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [onHome, onChildMessage]);
  // Shell-level background pause: when the tab/app is hidden (iOS screen-lock or
  // app-switch), freeze whatever is embedded via the cartridge pause path so games
  // stop cleanly; resume on return. Audio is stopped in-frame by the shared audio
  // system + the exhibit's own visibility handler, so this handler only drives the
  // freeze/continue contract (CARTRIDGE-CONTRACT.md: pause on tab switches).
  useEffect(() => {
    const post = (type) => { try { ref.current && ref.current.contentWindow && ref.current.contentWindow.postMessage({ type }, "*"); } catch (e) {} };
    const onVis = () => post(document.hidden ? "pause" : "resume");
    const onHide = () => post("pause");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, []);
  const send = (type) => { try { ref.current && ref.current.contentWindow && ref.current.contentWindow.postMessage({ type }, "*"); } catch (e) {} };
  const homeStyle = light
    ? { position: "absolute", top: 14, left: 14, zIndex: 3, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#3B2C66", background: "rgba(255,255,255,0.9)", border: "2px solid #EBE3F5", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }
    : { position: "absolute", top: 14, left: 14, zIndex: 3, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" };
  const showMenuBtn = nav && nav.hasMenu && nav.inGame;
  return (
    <div style={{ position: "fixed", inset: 0, background: bg, zIndex: 50 }}>
      <button onClick={onHome} style={homeStyle} aria-label="Home">Home</button>
      {right}
      {nav && <NavBtn kind="sound" muted={!nav.sound} top={14} onClick={() => send("nav:sound")} />}
      {showMenuBtn && <NavBtn kind="menu" top={58} onClick={() => send("nav:menu")} />}
      {nav && nav.hasHelp && <NavBtn kind="help" top={showMenuBtn ? 102 : 58} onClick={() => send("nav:help")} />}
      <iframe ref={ref} title={title} src={src} {...iframeProps} style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
      {overlay}
    </div>
  );
}

function familyBtn(onFamily) {
  return <button onClick={onFamily} style={{ position: "absolute", top: 14, right: 14, zIndex: 3, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)", border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>Play a sibling</button>;
}

// Session 9B: hand the kid's equipped GAMEPLAY upgrades to the engine as tiny
// launch params (the same handoff the loadout uses for looks) — the shell owns the
// purchases, the engine just reads which power id is equipped and applies its effect.
// The "Gear up" button opens the shell upgrade store (bottom-right so it clears the
// engine's own Home / mute / help / hint controls).
const SURV_TRACK_SLOT = { Weapon: "weapon", Armor: "armor", Boots: "boots", Hero: "hero" };
function survivalUpParam() {
  const eq = readEquippedUpgrades("survival");
  const pairs = Object.keys(SURV_TRACK_SLOT)
    .map((t) => (eq[t] ? SURV_TRACK_SLOT[t] + ":" + eq[t] : null))
    .filter(Boolean);
  return pairs.length ? "&up=" + encodeURIComponent(pairs.join(",")) : "";
}
function SurvivalScreen({ onHome, onUpgrades, level }) {
  const src = "/survival-engine.html?v=9c" + survivalUpParam() + (level != null ? "&level=" + level : "");
  const right = onUpgrades ? (
    <button onClick={onUpgrades} style={{ position: "absolute", bottom: 14, right: 14, zIndex: 3, fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)", border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>Gear up</button>
  ) : null;
  return <GameFrame title="Buildable Survival" src={src} onHome={onHome} right={right} />;
}

// Kidspedia exhibit viewer (Session 8G). One shell wrapper for every orbit-explorer
// exhibit: same GameFrame as a game, same quizRequest/pause/resume bridge as Breaker
// (CARTRIDGE-CONTRACT.md), except the quiz is kid-initiated ("Quick quiz" tap inside
// the exhibit) rather than a level-unlock gate, so it always shows — no Learning
// Mode gating check, matching the existing kid-initiated coin top-up quiz flow.
// Answers log to learning_events (the Session 6B ledger) via QuizGate's existing
// api/log-learning-event call, tagged gameType="explore" so Kidspedia practice is
// visible in the parent skills dashboard alongside game quiz gates.
function ExploreScreen({ onHome, exhibitId }) {
  const [quiz, setQuiz] = useState(null); // { reply, itemName } while the quiz gate is showing
  const onChildMessage = (d, post) => {
    if (!d || d.source !== "buildable" || d.kind !== "quizRequest") return;
    post({ type: "pause" }); // cartridge contract: freeze the exhibit while the quiz gate is up
    setQuiz({ reply: post, itemName: d.itemName });
  };
  const finish = () => { if (quiz && quiz.reply) { quiz.reply({ type: "resume" }); quiz.reply({ type: "bk:quizDone" }); } setQuiz(null); };
  const overlay = quiz ? (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(12,12,30,0.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <QuizGate goal="reading" gameType="explore" title={`Quick quiz: ${quiz.itemName || "Kidspedia"}!`} onPass={finish} />
    </div>
  ) : null;
  return <GameFrame title="Kidspedia" src={`/explore/${encodeURIComponent(exhibitId)}`} onHome={onHome} onChildMessage={onChildMessage} overlay={overlay} bg="#0B0A18" />;
}
// Session 7F: the shared landing hands Tennis its mode ("solo" | "local") and the
// equipped court from the shared loadout, so the engine skips its own start screen
// and court picker. TENNIS_COURTS mirrors the manifest "World" slot order. With no
// mode (opened directly) the engine still falls back to its built-in menu.
const TENNIS_COURTS = ["beach", "space", "jungle", "ocean", "candy", "snow", "volcano", "city"];
function TennisScreen({ onHome, onPlayFriend, start }) {
  useEffect(() => {
    function onMsg(e) { if (e && e.data && e.data.type === "tennisPlayFriend") { if (onPlayFriend) onPlayFriend(); } }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onPlayFriend]);
  let src = "/tennis.html?v=7f";
  if (start) {
    const court = TENNIS_COURTS[(readEquipped("tennis").World) || 0] || "beach";
    src += "&mode=" + (start === "local" ? "two" : "solo") + "&world=" + court;
  }
  return <GameFrame title="Buildable Tennis" src={src} onHome={onHome} />;
}
function BreakerScreen({ onHome, entry = "journey" }) {
  const [quiz, setQuiz] = useState(null); // { reply } while a learning gate is showing
  const onChildMessage = (d, post) => {
    if (!d || d.source !== "buildable" || d.kind !== "quizRequest") return;
    // Session 6B: parent settings OVERRIDE the game's manifest default. The
    // engine passes its manifest default (manifestBeforeUnlock); effectiveLearning
    // merges the parent's per-kid toggle on top. Nothing gates unless the parent
    // has Learning Mode on AND the resolved beforeUnlock moment is on.
    let eff = null;
    try { eff = effectiveLearning({ beforeUnlock: d.manifestBeforeUnlock, subjects: d.subjects }); } catch (e) {}
    if (!eff || !eff.enabled || !eff.beforeUnlock) { post({ type: "bk:quizDone" }); return; }
    post({ type: "pause" }); // cartridge contract: freeze the game while the quiz gate is up
    setQuiz({ reply: post, goal: eff.goal });
  };
  const finish = () => { if (quiz && quiz.reply) { quiz.reply({ type: "resume" }); quiz.reply({ type: "bk:quizDone" }); } setQuiz(null); };
  const overlay = quiz ? (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(12,12,30,0.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <QuizGate goal={(quiz && quiz.goal) || getLearningSettings().goal} gameType="breaker" title="Quick question to unlock the next level!" onPass={finish} />
    </div>
  ) : null;
  // hand the kid's equipped loadout (Session 3C) to the engine as tiny params so
  // gameplay reflects their picks; the shell owns the choices, the engine just reads.
  const eq = readEquipped("breaker");
  const eqParams = (typeof eq.Paddle === "number" ? `&pad=${eq.Paddle}` : "") +
                   (typeof eq.Ball === "number" ? `&ball=${eq.Ball}` : "") +
                   (typeof eq.Trail === "number" ? `&trail=${eq.Trail}` : "");
  let src;
  if (typeof entry === "string" && entry.indexOf("play:") === 0) {
    src = `/breaker-engine.html?v=3c&screen=play&level=${encodeURIComponent(entry.slice(5))}${eqParams}`;
  } else {
    src = `/breaker-engine.html?v=3c&screen=${entry}`;
  }
  return <GameFrame title="Buildable Breaker" src={src} onHome={onHome} onChildMessage={onChildMessage} overlay={overlay} />;
}

// Shell-generated game landing (Session 3A) — a converted game's front door.
// Everything here is manifest/identity-driven (badge art, name, category, signature
// color). The demo panel embeds the game's own engine in a self-playing "attract"
// mode (?screen=demo, input disabled). This REPLACES the engine's homemade start
// screen + Play/Make hub. Generic — any converted game can use it.
// ============================================================================
//  GameLanding — the ONE shell landing every game shows (Sessions 3A, 7E).
//  Header + demo are the same for all games. The Play area has two shapes:
//    - single-player (manifest features.multiplayer "off"): one big Play button
//      (level games open the journey; board games open the pick-difficulty frame)
//    - multiplayer (turn-based / realtime): a MODE ROW (Solo / Same device /
//      Play a friend) driven straight off the manifest switch (Session 6A). A
//      button only appears when the shell was handed its callback, so nothing
//      per-game is hardcoded here — the router wires each manifest's modes.
// ============================================================================
function GameLanding({ game, demoSrc, onPlay, onMake, onLoadout, onBack, multiplayer, onSolo, onSameDevice, onPlayFriend }) {
  const accent = game.color;
  const modeOn = (multiplayer === "turn-based" || multiplayer === "realtime") && (onSolo || onSameDevice || onPlayFriend);
  const modeBtnStyle = (primary) => ({
    flex: 1, minWidth: 0, borderRadius: 16, padding: "14px 8px", cursor: "pointer",
    fontFamily: NUN, fontWeight: 800, fontSize: 15,
    color: primary ? "#12102a" : "#fff",
    background: primary ? `linear-gradient(160deg, #fff, ${accent})` : `linear-gradient(160deg, ${accent}55, ${accent}22)`,
    border: primary ? "none" : `1px solid ${accent}88`,
    boxShadow: primary ? `0 10px 24px ${accent}44, 0 5px 14px rgba(0,0,0,0.25)` : "none",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
  });
  return (
    <div style={{ ...styles.container, justifyContent: "flex-start" }}>
      <div style={{ ...styles.introTopBar, justifyContent: "flex-start" }}>
        <button onClick={onBack} style={styles.backButton}>Home</button>
      </div>
      <div style={{ width: "100%", maxWidth: 540, marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent }}>{game.category}{game.type === "studio" && game.category !== "Studio" ? " \u00b7 Studio" : ""}</div>
        <h1 style={{ ...styles.logo, margin: "2px 0 0" }}>{game.name}</h1>
        <p style={{ ...styles.tagline, margin: "4px 0 10px" }}>{game.desc}</p>
        {demoSrc && <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", maxHeight: "50vh", borderRadius: 26, overflow: "hidden", border: `2px solid ${accent}66`, boxShadow: `0 18px 44px rgba(0,0,0,0.5), 0 0 0 4px ${accent}22`, background: `linear-gradient(160deg, ${accent}, ${accent}66)` }}>
          {demoSrc && <iframe title={`${game.name} demo`} src={demoSrc} scrolling="no" style={{ width: "100%", height: "100%", border: "none", display: "block", pointerEvents: "none" }} />}
          <span style={{ position: "absolute", top: 12, left: 12, fontSize: 11, fontWeight: 900, letterSpacing: "0.5px", textTransform: "uppercase", padding: "5px 11px", borderRadius: 999, background: "rgba(12,10,24,0.66)", color: "#fff" }}>Demo</span>
        </div>}
        {!modeOn && <button onClick={onPlay} style={{ marginTop: 18, width: "100%", maxWidth: 360, border: "none", borderRadius: 18, padding: "16px 22px", fontFamily: FRED, fontWeight: 700, fontSize: 22, color: "#12102a", background: `linear-gradient(160deg, #fff, ${accent})`, boxShadow: `0 12px 28px ${accent}44, 0 6px 16px rgba(0,0,0,0.28)`, cursor: "pointer" }}>Play</button>}
        {modeOn && (
          <div style={{ width: "100%", maxWidth: 360, marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: accent, textAlign: "center", marginBottom: 8 }}>Pick a way to play</div>
            <div style={{ display: "flex", gap: 10 }}>
              {onSolo && <button onClick={onSolo} style={modeBtnStyle(true)}><span>Solo</span><span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>vs computer</span></button>}
              {onSameDevice && <button onClick={onSameDevice} style={modeBtnStyle(false)}><span>Same device</span><span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>2 players</span></button>}
              {onPlayFriend && <button onClick={onPlayFriend} style={modeBtnStyle(false)}><span>Play a friend</span><span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>online</span></button>}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 360, marginTop: 12 }}>
          {onLoadout && <button onClick={onLoadout} style={{ flex: 1, borderRadius: 16, padding: "13px 12px", fontFamily: NUN, fontWeight: 800, fontSize: 16, color: "#fff", background: `linear-gradient(160deg, ${accent}55, ${accent}22)`, border: `1px solid ${accent}88`, cursor: "pointer" }}>Make it mine</button>}
          {onMake && <button onClick={onMake} style={{ flex: 1, borderRadius: 16, padding: "13px 12px", fontFamily: NUN, fontWeight: 800, fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}>Make a level</button>}
        </div>
      </div>
    </div>
  );
}
// ============================================================================
//  GameJourney (Session 3B; generalized 7E) — the SHELL-generated winding level path.
//  Replaces the engine's homemade level menu. Reads /breaker/manifest.json for
//  the ordered level list; reads the same localStorage the engine writes for
//  unlock + star progress. Stops show theme art (placeholder badge until the new
//  journeyBadge art lands), 0-3 stars, and a lock on levels not yet reached. The
//  path weaves left/right down a vertical scroll — tight vertical on phones, a
//  wider wander on iPad/desktop. The current level auto-scrolls into view.
// ============================================================================
function readBreakerProgress(gameId) {
  // Session 7I: the journey mirrors each engine's OWN save (most engines predate the
  // shared bk_{game}_prefs shape), so nothing a kid could already play ever locks.
  try {
    const id = gameId || "breaker";
    // free-choice games: their menus never locked levels, so every stop stays open
    if (id === "croctot" || id === "memory" || id === "mahjong" || id === "rileys-garden" || id === "typing") return { unlocked: 9999, stars: {} };
    if (id === "survival") {
      const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null");
      const d = JSON.parse(localStorage.getItem("bk_survival_char" + (k && k.id ? ("_" + k.id) : "")) || "null");
      return { unlocked: (d && d.unlocked) || 0, stars: {} };
    }
    if (id === "stringmatch") {
      let st = {}; try { st = JSON.parse(localStorage.getItem("sm_stars") || "{}") || {}; } catch (e) {}
      return { unlocked: parseInt(localStorage.getItem("sm_unlocked") || "0", 10) || 0, stars: st };
    }
    if (id === "castleguard") {
      const d = JSON.parse(localStorage.getItem("castleguard") || "null");
      return { unlocked: (d && d.unlocked) || 0, stars: (d && d.stars) || {} };
    }
    if (id === "tumble") {
      const d = JSON.parse(localStorage.getItem("tumble_prefs") || "null");
      const st = {}; if (d && d.cleared) Object.keys(d.cleared).forEach((i) => { if (d.cleared[i]) st[i] = 3; });
      return { unlocked: (d && d.unlocked) || 0, stars: st };
    }
    if (id === "mathcannon") {
      const d = JSON.parse(localStorage.getItem("bk_mathcannon") || "null");
      const st = {}; if (d && d.cleared) Object.keys(d.cleared).forEach((i) => { if (d.cleared[i]) st[i] = 3; });
      return { unlocked: (d && d.unlocked) || 0, stars: st };
    }
    // default (breaker, sling, bubble...): the shared bk_{game}_prefs shape
    const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null");
    const key = "bk_" + id + "_prefs" + (k && k.id ? ("_" + k.id) : "");
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (s) return { unlocked: Math.max(0, s.unlocked || 0), stars: (s.stars && typeof s.stars === "object") ? s.stars : {} };
  } catch (e) {}
  return { unlocked: 0, stars: {} };
}
function breakerLevelTheme(level) {
  const src = (level.parts && (level.parts.background || level.parts.bricks)) || "";
  const m = /^breaker\/(?:bg|bricks)\/([a-z0-9]+)-v\d+$/.exec(src);
  return (m && m[1]) || "jungle";
}
function JourneyStar({ filled, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }} aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 18.9 6.1 21.2l1.3-6.6L2.5 9.9l6.6-.8z"
        fill={filled ? "#FFD24A" : "rgba(255,255,255,0.14)"}
        stroke={filled ? "#E0A200" : "rgba(255,255,255,0.28)"} strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
function JourneyBadgeImg({ srcs }) {
  const [idx, setIdx] = useState(0);
  if (!srcs.length || idx >= srcs.length) return null;
  return (
    <img src={srcs[idx]} alt="" onError={() => setIdx((n) => n + 1)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
  );
}
function JourneyLock({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" fill="rgba(15,14,30,0.82)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" />
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.7" fill="#fff" />
    </svg>
  );
}
// Session 4A: read a game's manifest through /api/manifest so an editor-saved override shows
// live in the shell too (journey, loadout); if that endpoint is unreachable, fall back to the
// static file so screens always load. Resolves to the manifest object.
function loadGameManifest(id) {
  const stamp = "?v=" + Date.now();
  return fetch("/api/manifest?game=" + encodeURIComponent(id) + "&v=" + Date.now())
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => (d && d.manifest ? d.manifest : Promise.reject()))
    .catch(() => fetch("/" + id + "/manifest.json" + stamp).then((r) => r.json()));
}
function GameJourney({ game, gameId = "breaker", onBack, onPlay }) {
  const accent = (game && game.color) || "#FF6B6B";
  const [manifest, setManifest] = useState(null);
  const [prog, setProg] = useState(() => readBreakerProgress(gameId));
  const currentRef = useRef(null);
  useEffect(() => {
    let live = true;
    loadGameManifest(gameId)
      .then((m) => { if (live) setManifest(m); })
      .catch(() => {});
    setProg(readBreakerProgress(gameId)); // re-read on (re)entry so a fresh clear lights the path
    return () => { live = false; };
  }, [gameId]);
  const levels = (manifest && Array.isArray(manifest.levels)) ? manifest.levels : [];
  const lastIdx = Math.max(0, levels.length - 1);
  const currentIdx = Math.min(prog.unlocked, lastIdx);
  useEffect(() => {
    if (currentRef.current) { try { currentRef.current.scrollIntoView({ block: "center" }); } catch (e) {} }
  }, [manifest]);

  const ROW = 150;                   // px of scroll height per stop
  const V_PER_ROW = 26;              // viewBox units per stop (path coordinate space)
  const totalV = levels.length ? levels.length * V_PER_ROW : V_PER_ROW;
  const xPctAt = (i) => 50 + 30 * Math.sin(i * 1.05);   // 20%..80% weave
  const yVAt = (i) => 13 + i * V_PER_ROW;
  // smooth vertical S-curve path through the stops (control handles at mid-height)
  let pathD = "";
  levels.forEach((_, i) => {
    const x = xPctAt(i), y = yVAt(i);
    if (i === 0) { pathD += `M ${x} ${y}`; }
    else {
      const px = xPctAt(i - 1), py = yVAt(i - 1), my = (py + y) / 2;
      pathD += ` C ${px} ${my}, ${x} ${my}, ${x} ${y}`;
    }
  });

  return (
    <div style={{ ...styles.container, padding: "18px 14px 0", height: "100vh", overflow: "hidden" }}>
      <div style={{ ...styles.introTopBar, justifyContent: "space-between", alignItems: "center", marginBottom: 10, maxWidth: 680 }}>
        <button onClick={onBack} style={styles.backButton}>Games</button>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent }}>Journey</div>
          <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{(game && game.name) || "Breaker"}</div>
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 680, flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", paddingBottom: 40 }}>
        {!manifest && <div style={{ textAlign: "center", opacity: 0.7, marginTop: 40, fontWeight: 700 }}>Loading your journey...</div>}
        {manifest && (
          <div style={{ position: "relative", width: "100%", height: levels.length * ROW }}>
            <svg viewBox={`0 0 100 ${totalV}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              <path d={pathD} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="0.6 3.2" vectorEffect="non-scaling-stroke" />
            </svg>
            {levels.map((lv, i) => {
              const theme = breakerLevelTheme(lv);
              const locked = i > prog.unlocked;
              const isCurrent = i === currentIdx;
              const stars = Math.max(0, Math.min(3, prog.stars[i] || 0));
              const badgeSrcs = [];
              if (lv.journeyBadge && /^(https?:|\/)/.test(lv.journeyBadge)) badgeSrcs.push(lv.journeyBadge);
              badgeSrcs.push(`/${gameId}/${theme}/bg.webp`);
              const leftPct = xPctAt(i);
              const topPx = i * ROW + ROW / 2;
              return (
                <div key={lv.id || i} ref={isCurrent ? currentRef : null}
                  style={{ position: "absolute", top: topPx, left: `${leftPct}%`, transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", width: 148 }}>
                  <button
                    onClick={() => { if (!locked) onPlay(lv, i); }}
                    disabled={locked}
                    aria-label={lv.name + (locked ? " (locked)" : "")}
                    style={{
                      position: "relative", width: 96, height: 96, borderRadius: "50%", padding: 0, overflow: "hidden",
                      border: isCurrent ? `4px solid ${accent}` : "4px solid rgba(255,255,255,0.35)",
                      boxShadow: isCurrent ? `0 0 0 6px ${accent}44, 0 12px 26px rgba(0,0,0,0.45)` : "0 8px 18px rgba(0,0,0,0.4)",
                      cursor: locked ? "default" : "pointer", background: `linear-gradient(160deg, ${accent}, ${accent}55)`,
                      filter: locked ? "grayscale(0.7) brightness(0.6)" : "none", transition: "transform .12s",
                    }}>
                    <JourneyBadgeImg srcs={badgeSrcs} />
                    <span style={{ position: "absolute", top: 4, left: 6, fontFamily: FRED, fontWeight: 700, fontSize: 22, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.7)" }}>{i + 1}</span>
                    {locked && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><JourneyLock /></span>}
                  </button>
                  <div style={{ marginTop: 7, fontFamily: NUN, fontWeight: 800, fontSize: 13, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)", textAlign: "center", maxWidth: 140 }}>{lv.name}</div>
                  {!locked && (
                    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                      {[0, 1, 2].map((s) => <JourneyStar key={s} filled={s < stars} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Difficulty as the 1-5 preset, drawn as five pips (manifest golden rule: nobody
// edits raw knobs; the level's difficulty 1-5 is the only tuning the kid sees).
function DiffPips({ n, accent }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= n ? accent : "rgba(255,255,255,0.18)" }} />
      ))}
    </div>
  );
}
// ============================================================================
//  BoardSoloFrame (Session 7E) — the "simple mode-and-play frame" for BOARD
//  games (chess, checkers, tic-tac-toe...). A board game has no journey path;
//  its manifest "levels" are opponent tiers, so Solo just picks a difficulty
//  (the existing 1-5 preset) and plays. Reads the tiers straight from the
//  manifest — no per-game content lives here. onPlay hands the chosen tier
//  (with its difficulty + parts) back to the shell to launch the engine.
// ============================================================================
function BoardSoloFrame({ game, gameId, onBack, onPlay }) {
  const accent = (game && game.color) || "#F0972A";
  const [manifest, setManifest] = useState(null);
  useEffect(() => {
    let live = true;
    loadGameManifest(gameId).then((m) => { if (live) setManifest(m); }).catch(() => {});
    return () => { live = false; };
  }, [gameId]);
  const tiers = (manifest && Array.isArray(manifest.levels)) ? manifest.levels : [];
  return (
    <div style={{ ...styles.container, justifyContent: "flex-start" }}>
      <div style={{ ...styles.introTopBar, justifyContent: "flex-start" }}>
        <button onClick={onBack} style={styles.backButton}>Back</button>
      </div>
      <div style={{ width: "100%", maxWidth: 480, marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent }}>Solo</div>
        <h1 style={{ ...styles.logo, margin: "2px 0 2px" }}>Pick your level</h1>
        <p style={{ ...styles.tagline, margin: "0 0 14px" }}>How tricky should {(game && game.name) || "the game"} be?</p>
        {!manifest && <div style={{ opacity: 0.7, marginTop: 20, fontWeight: 700 }}>Loading...</div>}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          {tiers.map((lv, i) => (
            <button key={lv.id || i} onClick={() => onPlay(lv, i)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", width: "100%", borderRadius: 16, padding: "14px 16px", cursor: "pointer", color: "#fff", background: `linear-gradient(160deg, ${accent}44, ${accent}18)`, border: `1px solid ${accent}77` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 20 }}>{lv.name}</div>
                {lv.desc && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>{lv.desc}</div>}
              </div>
              <DiffPips n={Math.max(1, Math.min(5, lv.difficulty || 1))} accent={accent} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
//  Loadout store (Session 3C) — the kid's owned + equipped customization, owned
//  by the SHELL (never the engine). Keyed per game + per kid. Options are stored
//  by their index in the manifest's customization slot, so the engine can be told
//  the equipped look with tiny params and the store never hardcodes art. Coins are
//  spent through the shell-owned wallet (window.BuildableWallet, loaded in index.html).
// ============================================================================
function loadoutKey(gameId) {
  let kid = "";
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); if (k && k.id) kid = "_" + k.id; } catch (e) {}
  return "bk_loadout_v1_" + gameId + kid;
}
function readLoadout(gameId, slots) {
  let store = { owned: {}, equipped: {} };
  try { const s = JSON.parse(localStorage.getItem(loadoutKey(gameId)) || "null"); if (s && typeof s === "object") store = { owned: s.owned || {}, equipped: s.equipped || {} }; } catch (e) {}
  (slots || []).forEach((slot) => {
    const name = slot.slot, opts = slot.options || [];
    const owned = new Set(store.owned[name] || []);
    opts.forEach((o, i) => { if ((o.price || 0) === 0) owned.add(i); }); // free options are always owned
    store.owned[name] = Array.from(owned).sort((a, b) => a - b);
    if (store.equipped[name] == null || !store.owned[name].includes(store.equipped[name])) {
      store.equipped[name] = store.owned[name].length ? store.owned[name][0] : 0; // default-equip first owned
    }
  });
  return store;
}
function writeLoadout(gameId, store) { try { localStorage.setItem(loadoutKey(gameId), JSON.stringify(store)); } catch (e) {} }
function readEquipped(gameId) { try { const s = JSON.parse(localStorage.getItem(loadoutKey(gameId)) || "null"); return (s && s.equipped) || {}; } catch (e) { return {}; } }
function walletBalance() { try { return (window.BuildableWallet && window.BuildableWallet.balance()) || 0; } catch (e) { return 0; } }

// ============================================================================
//  Upgrade store (Session 9B) — the kid's owned + equipped GAMEPLAY upgrades,
//  owned by the SHELL (never the engine), keyed per game + per kid. Unlike the
//  cosmetics loadout (which stores by option index), upgrades are stored by the
//  manifest option's STABLE id, because that id is what the shell hands the engine
//  so it can apply the power's effect. Coins spend through the shared wallet, the
//  same one that buys looks (the owner's one-wallet economy — see manifest doc 5c).
// ============================================================================
function upgradeKey(gameId) {
  let kid = "";
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); if (k && k.id) kid = "_" + k.id; } catch (e) {}
  return "bk_upgrades_v1_" + gameId + kid;
}
function readUpgrades(gameId, tracks) {
  let store = { owned: {}, equipped: {} };
  try { const s = JSON.parse(localStorage.getItem(upgradeKey(gameId)) || "null"); if (s && typeof s === "object") store = { owned: s.owned || {}, equipped: s.equipped || {} }; } catch (e) {}
  (tracks || []).forEach((tr) => {
    const name = tr.track, opts = tr.options || [];
    const owned = new Set(store.owned[name] || []);
    opts.forEach((o) => { if (o.id && (o.price || 0) === 0) owned.add(o.id); }); // free power is always owned
    store.owned[name] = Array.from(owned);
    if (!store.equipped[name] || !store.owned[name].includes(store.equipped[name])) {
      store.equipped[name] = store.owned[name].length ? store.owned[name][0] : null; // default-equip first owned
    }
  });
  return store;
}
function writeUpgrades(gameId, store) { try { localStorage.setItem(upgradeKey(gameId), JSON.stringify(store)); } catch (e) {} }
function readEquippedUpgrades(gameId) { try { const s = JSON.parse(localStorage.getItem(upgradeKey(gameId)) || "null"); return (s && s.equipped) || {}; } catch (e) { return {}; } }

function CoinGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="10" fill="#FFD24A" stroke="#E0A200" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#E0A200" strokeWidth="1.1" opacity="0.7" />
      <path d="M12 8.2l1.1 2.3 2.5.3-1.85 1.75.5 2.5L12 15.9l-2.25 1.15.5-2.5L8.4 10.8l2.5-.3z" fill="#B67A00" />
    </svg>
  );
}
// ============================================================================
//  TopUpGate (Session 6B) — "short on coins? practice to earn some". Reuses the
//  QuizGate; the passive top-up rule (every 3rd correct = 10 coins, see
//  QuizGate/store) does the crediting, so this just presents questions and
//  celebrates when the shared wallet balance goes up. A Done button always exits.
// ============================================================================
function TopUpGate({ onClose }) {
  const [round, setRound] = useState(0);
  const [earned, setEarned] = useState(0);
  const startBal = useRef(walletBalance());
  useEffect(() => {
    const onW = () => {
      const now = walletBalance();
      if (now > startBal.current) { setEarned(now - startBal.current); }
    };
    window.addEventListener("bk-wallet", onW);
    return () => window.removeEventListener("bk-wallet", onW);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(12,12,30,0.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 460 }}>
        <button onClick={onClose} style={{ position: "absolute", top: -6, right: -6, zIndex: 2, background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 999, padding: "6px 14px", fontWeight: 800, cursor: "pointer" }}>Done</button>
        {earned > 0 ? (
          <div style={{ background: "#1b1b3a", border: "1px solid rgba(255,210,74,0.4)", borderRadius: 20, padding: "28px 22px", textAlign: "center" }}>
            <div style={{ fontFamily: FRED, fontSize: 24, fontWeight: 900, color: "#FFD98A" }}>You earned {earned} coins!</div>
            <p style={{ opacity: 0.85, marginTop: 8 }}>Nice practicing. Keep going for more, or tap Done.</p>
            <button onClick={() => { startBal.current = walletBalance(); setEarned(0); setRound((r) => r + 1); }} style={{ marginTop: 12, background: "#FFD24A", color: "#5a3d00", border: "none", borderRadius: 14, padding: "10px 20px", fontWeight: 900, cursor: "pointer" }}>Keep practicing</button>
          </div>
        ) : (
          <QuizGate key={round} goal={getLearningSettings().goal} gameType="topup" title="Answer 3 to earn 10 coins!" onPass={() => setRound((r) => r + 1)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  BreakerLoadout (Session 3C; Feel Kit polish Session 7C) — the SHELL-generated
//  customization screen, built straight from the manifest's `customization` slots.
//  Free looks are owned; priced looks unlock by spending coins from the shell-owned
//  wallet; a tap equips. The kid's picks live in the shell loadout store, and are
//  handed to the engine as tiny equip params when a level launches. Generic enough
//  for any converted game (Breaker + Music Maker today). Session 7C wired the
//  shared Feel Kit in: tap feedback on every button, a gentle miss nudge when
//  short on coins, and a real celebration (particles + sound + haptic + a glow on
//  the tile) when a look unlocks — see GAME-FEEL.md.
// ============================================================================
function BreakerLoadout({ game, onBack, onPlay }) {
  const accent = (game && game.color) || "#FF6B6B";
  const gameId = (game && game.id) || "breaker";
  const [manifest, setManifest] = useState(null);
  const [coins, setCoins] = useState(() => walletBalance());
  const [store, setStore] = useState({ owned: {}, equipped: {} });
  const [flash, setFlash] = useState("");
  const [topUp, setTopUp] = useState(null); // {slotName,i,price} when offering a practice top-up
  const [justUnlocked, setJustUnlocked] = useState(null); // "slot|i" — brief glow on the tile just bought
  const fxCanvasRef = useRef(null);
  const fxRef = useRef(null);
  const fxRafRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadGameManifest(gameId)
      .then((m) => { if (!live) return; setManifest(m); setStore(readLoadout(gameId, m.customization || [])); })
      .catch(() => {});
    const onWallet = () => setCoins(walletBalance());
    window.addEventListener("bk-wallet", onWallet);
    setCoins(walletBalance());
    return () => { live = false; window.removeEventListener("bk-wallet", onWallet); };
  }, [gameId]);

  // Session 7C: wire the shared Feel Kit into the loadout — the SAME sounds,
  // haptics and celebration presets every game uses (GAME-FEEL.md), so unlocking
  // a look here feels like the rest of Buildable, not a bare menu. Every call is
  // a safe no-op if the Kit isn't loaded (buildable-feel.js degrades gracefully).
  useEffect(() => {
    if (!manifest) return;
    try {
      const Feel = window.BuildableFeel;
      if (!Feel) return;
      Feel.configure({ accent, feel: manifest.feel, sfxBase: "/api/sfx?s=" });
      if (!fxRef.current) fxRef.current = Feel.makeFx();
      Feel.setFx(fxRef.current);
    } catch (e) {}
  }, [manifest, accent]);
  useEffect(() => () => { if (fxRafRef.current) cancelAnimationFrame(fxRafRef.current); }, []);

  function feelTap() { try { window.BuildableFeel && window.BuildableFeel.tap(); } catch (e) {} }
  function feelMiss() { try { window.BuildableFeel && window.BuildableFeel.miss(); } catch (e) {} }
  // The loadout's one celebration moment: a kid spent coins and got a new look.
  // Fires from the tile itself — this is the Kit's documented "powerup grab" case
  // (GAME-FEEL.md), not a bespoke effect, scaled by the manifest's celebration
  // preset. The canvas overlay runs for a bounded time only, never in the background.
  function celebrateUnlock(evt, key) {
    setJustUnlocked(key);
    setTimeout(() => setJustUnlocked((k) => (k === key ? null : k)), 900);
    try {
      const Feel = window.BuildableFeel; const c = fxCanvasRef.current;
      if (!Feel || !c || !evt || !evt.currentTarget) return;
      const r = evt.currentTarget.getBoundingClientRect();
      c.width = window.innerWidth; c.height = window.innerHeight;
      Feel.explode(r.left + r.width / 2, r.top + r.height / 2, accent, { sound: "powerup", pop: "Unlocked!", popCol: "#fff" });
      const ctx = c.getContext("2d");
      let last = performance.now(); const end = last + 1100;
      if (fxRafRef.current) cancelAnimationFrame(fxRafRef.current);
      const tick = (ts) => {
        const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        ctx.clearRect(0, 0, c.width, c.height);
        Feel.update(fxRef.current, dt); Feel.draw(ctx, fxRef.current, { W: c.width, H: c.height });
        if (ts < end) fxRafRef.current = requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height);
      };
      fxRafRef.current = requestAnimationFrame(tick);
    } catch (e) {}
  }

  const slots = (manifest && Array.isArray(manifest.customization)) ? manifest.customization : [];
  function equip(slotName, i) {
    feelTap();
    setStore((prev) => { const next = { owned: { ...prev.owned }, equipped: { ...prev.equipped, [slotName]: i } }; writeLoadout(gameId, next); return next; });
  }
  function buy(slotName, i, price, evt) {
    // Session 6B: short on coins? If the parent's "Earn coins by practicing"
    // toggle is on, offer a practice top-up instead of a dead-end message.
    if (coins < (price || 0)) {
      let eff = null; try { eff = effectiveLearning({}); } catch (e) {}
      if (eff && eff.enabled && eff.coinTopUp) { feelTap(); setTopUp({ slotName, i, price }); return; }
      feelMiss(); setFlash("Not enough coins yet — beat more levels to earn them!"); setTimeout(() => setFlash(""), 2400); return;
    }
    let ok = false;
    try { ok = window.BuildableWallet ? window.BuildableWallet.spend(price) : false; } catch (e) { ok = false; }
    if (!ok) { feelMiss(); setFlash("Not enough coins yet — beat more levels to earn them!"); setTimeout(() => setFlash(""), 2400); return; }
    setStore((prev) => {
      const owned = { ...prev.owned }; const list = (owned[slotName] || []).slice(); if (!list.includes(i)) list.push(i);
      owned[slotName] = list.sort((a, b) => a - b);
      const next = { owned, equipped: { ...prev.equipped, [slotName]: i } }; writeLoadout(gameId, next); return next;
    });
    setCoins(walletBalance());
    celebrateUnlock(evt, slotName + "|" + i);
  }

  return (
    <div style={{ ...styles.container, padding: "18px 14px 44px", justifyContent: "flex-start" }}>
      <style>{"@keyframes bkUnlockPop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}@keyframes bkUnlockGlow{0%{box-shadow:0 0 0 0 rgba(255,217,138,0)}40%{box-shadow:0 0 0 4px rgba(255,217,138,.9),0 0 26px rgba(255,217,138,.75)}100%{box-shadow:0 0 0 2px rgba(255,217,138,.5)}}"}</style>
      <canvas ref={fxCanvasRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "none" }} />
      {topUp && <TopUpGate onClose={() => { setTopUp(null); setCoins(walletBalance()); }} />}
      <div style={{ ...styles.introTopBar, justifyContent: "space-between", alignItems: "center", marginBottom: 12, maxWidth: 680 }}>
        <button onClick={() => { feelTap(); onBack(); }} style={styles.backButton}>Back</button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "rgba(245,217,118,.16)", border: "1px solid rgba(245,217,118,.4)", fontWeight: 900, color: "#FFE08A" }}>
          <CoinGlyph size={18} /> {coins}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 680, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent }}>Make it mine</div>
        <h1 style={{ ...styles.logo, fontSize: "clamp(32px,7vw,52px)", margin: "2px 0 4px" }}>Loadout</h1>
        <p style={{ ...styles.tagline, fontSize: 15, marginBottom: 16 }}>Spend coins to unlock looks, then tap to equip.</p>
        {flash && <div style={{ margin: "0 auto 14px", maxWidth: 380, background: "rgba(255,176,77,.16)", border: "1px solid rgba(255,176,77,.45)", color: "#FFE0B0", borderRadius: 12, padding: "9px 14px", fontWeight: 800 }}>{flash}</div>}
      </div>

      {!manifest && <div style={{ textAlign: "center", opacity: 0.7, marginTop: 30, fontWeight: 700 }}>Getting your looks ready...</div>}

      <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 20 }}>
        {slots.map((slot) => {
          const name = slot.slot, opts = slot.options || [];
          const owned = new Set(store.owned[name] || []);
          const eq = store.equipped[name];
          return (
            <div key={name}>
              <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 20, margin: "0 0 8px" }}>{name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                {opts.map((o, i) => {
                  const isOwned = owned.has(i) || (o.price || 0) === 0;
                  const isEq = eq === i;
                  const canAfford = coins >= (o.price || 0);
                  const key = name + "|" + i;
                  const glowing = justUnlocked === key;
                  return (
                    <div key={i} style={{
                      borderRadius: 16, padding: "12px 12px 10px",
                      background: isEq ? `linear-gradient(160deg, ${accent}44, ${accent}18)` : "rgba(255,255,255,0.05)",
                      border: isEq ? `2px solid ${accent}` : "1px solid rgba(255,255,255,0.14)",
                      animation: glowing ? "bkUnlockPop .5s ease-out, bkUnlockGlow .9s ease-out" : "none",
                    }}>
                      <div style={{ height: 54, borderRadius: 12, marginBottom: 9, background: `linear-gradient(160deg, ${accent}, ${accent}55)`, opacity: isOwned ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{o.name}</div>
                      {isOwned ? (
                        <button onClick={() => equip(name, i)} disabled={isEq} style={{
                          width: "100%", borderRadius: 11, padding: "9px 0", fontFamily: NUN, fontWeight: 800, fontSize: 14, cursor: isEq ? "default" : "pointer",
                          border: "none", color: isEq ? "#12102a" : "#fff",
                          background: isEq ? `linear-gradient(160deg,#fff,${accent})` : "rgba(255,255,255,0.1)",
                        }}>{isEq ? "Equipped" : "Equip"}</button>
                      ) : (
                        <button onClick={(e) => buy(name, i, o.price || 0, e)} disabled={!canAfford} style={{
                          width: "100%", borderRadius: 11, padding: "9px 0", fontFamily: NUN, fontWeight: 800, fontSize: 14, cursor: canAfford ? "pointer" : "not-allowed",
                          border: "none", color: canAfford ? "#12102a" : "#9a97b5",
                          background: canAfford ? "linear-gradient(160deg,#FFE08A,#FFD24A)" : "rgba(255,255,255,0.06)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}><CoinGlyph size={15} /> {o.price}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onPlay && manifest && <button onClick={() => { feelTap(); onPlay(); }} style={{ marginTop: 26, width: "100%", maxWidth: 360, border: "none", borderRadius: 18, padding: "15px 22px", fontFamily: FRED, fontWeight: 700, fontSize: 20, color: "#12102a", background: `linear-gradient(160deg, #fff, ${accent})`, boxShadow: `0 12px 28px ${accent}44, 0 6px 16px rgba(0,0,0,0.28)`, cursor: "pointer" }}>Play with this look</button>}
    </div>
  );
}

// ============================================================================
//  UpgradeStore (Session 9B) — the SHELL-generated GAMEPLAY-power store, built
//  straight from the manifest's `upgrades` tracks. It is the loadout's twin, but
//  for POWER instead of looks: the shell draws it, spends the SHARED wallet on a
//  buy, and remembers what each kid owns + has equipped (per game + per kid). The
//  engine is only handed which id is equipped (as launch params) and owns what the
//  power actually does — the shell never knows an effect. Same Feel Kit celebration
//  on unlock and same practice top-up when short on coins as the loadout, so power
//  shopping feels like the rest of Buildable, not a bare menu.
// ============================================================================
function UpgradeStore({ game, onBack, onPlay }) {
  const accent = (game && game.color) || "#8A6BFF";
  const gameId = (game && game.id) || "survival";
  const [manifest, setManifest] = useState(null);
  const [coins, setCoins] = useState(() => walletBalance());
  const [store, setStore] = useState({ owned: {}, equipped: {} });
  const [flash, setFlash] = useState("");
  const [topUp, setTopUp] = useState(null);
  const [justUnlocked, setJustUnlocked] = useState(null);
  const fxCanvasRef = useRef(null);
  const fxRef = useRef(null);
  const fxRafRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadGameManifest(gameId)
      .then((m) => { if (!live) return; setManifest(m); setStore(readUpgrades(gameId, m.upgrades || [])); })
      .catch(() => {});
    const onWallet = () => setCoins(walletBalance());
    window.addEventListener("bk-wallet", onWallet);
    setCoins(walletBalance());
    return () => { live = false; window.removeEventListener("bk-wallet", onWallet); };
  }, [gameId]);

  useEffect(() => {
    if (!manifest) return;
    try {
      const Feel = window.BuildableFeel;
      if (!Feel) return;
      Feel.configure({ accent, feel: manifest.feel, sfxBase: "/api/sfx?s=" });
      if (!fxRef.current) fxRef.current = Feel.makeFx();
      Feel.setFx(fxRef.current);
    } catch (e) {}
  }, [manifest, accent]);
  useEffect(() => () => { if (fxRafRef.current) cancelAnimationFrame(fxRafRef.current); }, []);

  function feelTap() { try { window.BuildableFeel && window.BuildableFeel.tap(); } catch (e) {} }
  function feelMiss() { try { window.BuildableFeel && window.BuildableFeel.miss(); } catch (e) {} }
  function celebrateUnlock(evt, key) {
    setJustUnlocked(key);
    setTimeout(() => setJustUnlocked((k) => (k === key ? null : k)), 900);
    try {
      const Feel = window.BuildableFeel; const c = fxCanvasRef.current;
      if (!Feel || !c || !evt || !evt.currentTarget) return;
      const r = evt.currentTarget.getBoundingClientRect();
      c.width = window.innerWidth; c.height = window.innerHeight;
      Feel.explode(r.left + r.width / 2, r.top + r.height / 2, accent, { sound: "powerup", pop: "Unlocked!", popCol: "#fff" });
      const ctx = c.getContext("2d");
      let last = performance.now(); const end = last + 1100;
      if (fxRafRef.current) cancelAnimationFrame(fxRafRef.current);
      const tick = (ts) => {
        const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        ctx.clearRect(0, 0, c.width, c.height);
        Feel.update(fxRef.current, dt); Feel.draw(ctx, fxRef.current, { W: c.width, H: c.height });
        if (ts < end) fxRafRef.current = requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height);
      };
      fxRafRef.current = requestAnimationFrame(tick);
    } catch (e) {}
  }

  const tracks = (manifest && Array.isArray(manifest.upgrades)) ? manifest.upgrades : [];
  function equip(trackName, id) {
    feelTap();
    setStore((prev) => { const next = { owned: { ...prev.owned }, equipped: { ...prev.equipped, [trackName]: id } }; writeUpgrades(gameId, next); return next; });
  }
  function buy(trackName, id, price, evt) {
    if (coins < (price || 0)) {
      let eff = null; try { eff = effectiveLearning({}); } catch (e) {}
      if (eff && eff.enabled && eff.coinTopUp) { feelTap(); setTopUp({ trackName, id, price }); return; }
      feelMiss(); setFlash("Not enough coins yet — beat more levels to earn them!"); setTimeout(() => setFlash(""), 2400); return;
    }
    let ok = false;
    try { ok = window.BuildableWallet ? window.BuildableWallet.spend(price) : false; } catch (e) { ok = false; }
    if (!ok) { feelMiss(); setFlash("Not enough coins yet — beat more levels to earn them!"); setTimeout(() => setFlash(""), 2400); return; }
    setStore((prev) => {
      const owned = { ...prev.owned }; const list = (owned[trackName] || []).slice(); if (!list.includes(id)) list.push(id);
      owned[trackName] = list;
      const next = { owned, equipped: { ...prev.equipped, [trackName]: id } }; writeUpgrades(gameId, next); return next;
    });
    setCoins(walletBalance());
    celebrateUnlock(evt, trackName + "|" + id);
  }

  return (
    <div style={{ ...styles.container, padding: "18px 14px 44px", justifyContent: "flex-start" }}>
      <style>{"@keyframes bkUnlockPop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}@keyframes bkUnlockGlow{0%{box-shadow:0 0 0 0 rgba(255,217,138,0)}40%{box-shadow:0 0 0 4px rgba(255,217,138,.9),0 0 26px rgba(255,217,138,.75)}100%{box-shadow:0 0 0 2px rgba(255,217,138,.5)}}"}</style>
      <canvas ref={fxCanvasRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 9990, pointerEvents: "none" }} />
      {topUp && <TopUpGate onClose={() => { setTopUp(null); setCoins(walletBalance()); }} />}
      <div style={{ ...styles.introTopBar, justifyContent: "space-between", alignItems: "center", marginBottom: 12, maxWidth: 680 }}>
        <button onClick={() => { feelTap(); onBack(); }} style={styles.backButton}>Back</button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: "rgba(245,217,118,.16)", border: "1px solid rgba(245,217,118,.4)", fontWeight: 900, color: "#FFE08A" }}>
          <CoinGlyph size={18} /> {coins}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 680, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent }}>Power up</div>
        <h1 style={{ ...styles.logo, fontSize: "clamp(32px,7vw,52px)", margin: "2px 0 4px" }}>Gear Up</h1>
        <p style={{ ...styles.tagline, fontSize: 15, marginBottom: 16 }}>Spend coins to unlock power, then tap to equip.</p>
        {flash && <div style={{ margin: "0 auto 14px", maxWidth: 380, background: "rgba(255,176,77,.16)", border: "1px solid rgba(255,176,77,.45)", color: "#FFE0B0", borderRadius: 12, padding: "9px 14px", fontWeight: 800 }}>{flash}</div>}
      </div>

      {!manifest && <div style={{ textAlign: "center", opacity: 0.7, marginTop: 30, fontWeight: 700 }}>Getting your gear ready...</div>}
      {manifest && !tracks.length && <div style={{ textAlign: "center", opacity: 0.7, marginTop: 30, fontWeight: 700 }}>This game has no gear to buy yet.</div>}

      <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 20 }}>
        {tracks.map((tr) => {
          const name = tr.track, opts = tr.options || [];
          const owned = new Set(store.owned[name] || []);
          const eq = store.equipped[name];
          return (
            <div key={name}>
              <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 20, margin: "0 0 8px" }}>{name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {opts.map((o) => {
                  const id = o.id;
                  const isOwned = owned.has(id) || (o.price || 0) === 0;
                  const isEq = eq === id;
                  const canAfford = coins >= (o.price || 0);
                  const key = name + "|" + id;
                  const glowing = justUnlocked === key;
                  return (
                    <div key={id} style={{
                      borderRadius: 16, padding: "12px 12px 10px",
                      background: isEq ? `linear-gradient(160deg, ${accent}44, ${accent}18)` : "rgba(255,255,255,0.05)",
                      border: isEq ? `2px solid ${accent}` : "1px solid rgba(255,255,255,0.14)",
                      animation: glowing ? "bkUnlockPop .5s ease-out, bkUnlockGlow .9s ease-out" : "none",
                    }}>
                      <div style={{ height: 54, borderRadius: 12, marginBottom: 8, background: `linear-gradient(160deg, ${accent}, ${accent}55)`, opacity: isOwned ? 1 : 0.4, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 13, textAlign: "center", padding: "0 6px", textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{o.name}</div>
                      {o.desc && <div style={{ fontSize: 11.5, lineHeight: 1.25, opacity: 0.8, minHeight: 30, margin: "0 0 8px" }}>{o.desc}</div>}
                      {isOwned ? (
                        <button onClick={() => equip(name, id)} disabled={isEq} style={{
                          width: "100%", borderRadius: 11, padding: "9px 0", fontFamily: NUN, fontWeight: 800, fontSize: 14, cursor: isEq ? "default" : "pointer",
                          border: "none", color: isEq ? "#12102a" : "#fff",
                          background: isEq ? `linear-gradient(160deg,#fff,${accent})` : "rgba(255,255,255,0.1)",
                        }}>{isEq ? "Equipped" : "Equip"}</button>
                      ) : (
                        <button onClick={(e) => buy(name, id, o.price || 0, e)} disabled={!canAfford} style={{
                          width: "100%", borderRadius: 11, padding: "9px 0", fontFamily: NUN, fontWeight: 800, fontSize: 14, cursor: canAfford ? "pointer" : "not-allowed",
                          border: "none", color: canAfford ? "#12102a" : "#9a97b5",
                          background: canAfford ? "linear-gradient(160deg,#FFE08A,#FFD24A)" : "rgba(255,255,255,0.06)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}><CoinGlyph size={15} /> {o.price}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onPlay && manifest && <button onClick={() => { feelTap(); onPlay(); }} style={{ marginTop: 26, width: "100%", maxWidth: 360, border: "none", borderRadius: 18, padding: "15px 22px", fontFamily: FRED, fontWeight: 700, fontSize: 20, color: "#12102a", background: `linear-gradient(160deg, #fff, ${accent})`, boxShadow: `0 12px 28px ${accent}44, 0 6px 16px rgba(0,0,0,0.28)`, cursor: "pointer" }}>Play with this power</button>}
    </div>
  );
}

function CastleGuardScreen({ onHome, level }) { return <GameFrame title="Castle Guard" src={"/castle-guard.html?v=hud2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#2e7d32" />; }
function TumbleScreen({ onHome, level }) { return <GameFrame title="Tumble Blocks" src={"/tumble-engine.html?v=1" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#0c1230" />; }
function BoardGameScreen({ onHome, title, src, onPlayFriend }) {
  useEffect(() => {
    if (!onPlayFriend) return;
    function onMsg(e) { if (e && e.data && e.data.type === "bgPlayFriend") onPlayFriend(); }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onPlayFriend]);
  return <GameFrame title={title} src={src} onHome={onHome} bg="#0b1030" />;
}
function MazeScreen({ onHome }) { return <GameFrame title="Maze Munchers" src="/maze-engine.html?v=hud1" onHome={onHome} iframeProps={{ onLoad: (e) => { try { e.currentTarget.contentWindow.focus(); } catch (_) {} } }} />; }
function SlingScreen({ onHome, level }) { const lv = (typeof level === "number") ? `&level=${level}` : ""; return <GameFrame title="Sling Squad" src={`/sling-squad.html?v=hud3${lv}`} onHome={onHome} bg="#7fc7ff" iframeProps={{ onLoad: (e) => { try { e.currentTarget.contentWindow.focus(); } catch (_) {} } }} />; }
function TankScreen({ onHome }) { return <GameFrame title="Hilltop Tanks" src="/tank-engine.html?v=hud1" onHome={onHome} bg="#8fd0f2" iframeProps={{ onLoad: (e) => { try { e.currentTarget.contentWindow.focus(); } catch (_) {} } }} />; }
function CrocScreen({ onHome, level }) { return <GameFrame title="Croc Tot" src={"/croctot.html?v=hud2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#7fc7ff" />; }
function MathCannonScreen({ onHome, level }) { return <GameFrame title="Math Cannon" src={"/mathcannon-engine.html?v=2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#12102a" />; }
function RileysScreen({ onHome, level }) { return <GameFrame title="Riley's Garden" src={"/rileys-garden.html?v=art2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#87CEEB" />; }
function StringMatchScreen({ onHome, level }) { return <GameFrame title="String Match" src={"/string-match.html?v=2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#bfe3f5" light />; }
function BubbleScreen({ onHome, level }) { return <GameFrame title="Bubble Buddies" src={"/bubble-engine.html?v=hud2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#0e1830" />; }
function SunnyTownScreen({ onHome }) { return <GameFrame title="Sunny Town Drive" src="/runner-engine.html?v=hud1" onHome={onHome} />; }
function SoundboardScreen({ onHome }) { return <GameFrame title="Buildable Sound Machine" src="/soundboard.html" onHome={onHome} bg="#FBF6EC" light />; }
function ArtStudioScreen({ onHome }) { return <GameFrame title="Buildable Art Studio" src="/art-studio.html?v=2" onHome={onHome} bg="#0b1030" />; }
function MemoryScreen({ onHome, level }) { return <GameFrame title="Buildable Memory Match" src={"/memory-engine.html?v=hud2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#131229" />; }
function MahjongScreen({ onHome, level }) { return <GameFrame title="Buildable Mahjong" src={"/mahjong-engine.html?v=hud2" + (level != null ? "&level=" + level : "")} onHome={onHome} bg="#101a2e" />; }
function BingoScreen({ onHome }) { return <GameFrame title="Buildable Bingo" src="/bingo-engine.html?v=hud1" onHome={onHome} bg="#131229" />; }
function SnakesScreen({ onHome }) { return <GameFrame title="Buildable Snakes and Ladders" src="/snakes-engine.html?v=hud1" onHome={onHome} bg="#131229" />; }
function PlatformerScreen({ onHome }) { return <GameFrame title="Buildable Platformer" src="/play.html?v=hud1" onHome={onHome} iframeProps={{ onLoad: (e) => { try { e.currentTarget.contentWindow.focus(); } catch (_) {} } }} />; }
function TownScreen({ onHome, onFamily }) { return <GameFrame title="Family Town" src="/family-town.html?v=1" onHome={onHome} right={familyBtn(onFamily)} />; }

// Shared slim icon-button style for the home top-nav (My Stuff / Grown-ups /
// Friends). Keeping one style object here is what makes the three controls look
// consistent instead of three different chunky buttons.
const NAV_ICON_BTN = {
  width: 40, height: 40, borderRadius: 12, padding: 0, position: "relative",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)",
  color: "#fff", cursor: "pointer",
};
const NAV_ICON_BADGE = {
  position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 999,
  padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 11, fontWeight: 900, color: "#fff", background: "#E0609A", border: "2px solid #0d0b14",
};

// Shared top-nav Grown-ups control. Replaces the floating GrownUpFab + LearningControl
// pills. One parent-gated button (math check) opens a small menu that collapses BOTH
// controls: the Learning On/Off toggle and Open grown-ups area. `fixed` renders it as a
// top-right overlay (hub screens); without it, inline (grouped with My Stuff in a header).
// `compact` renders it as a slim icon-only button for the home top-nav.
function GrownUpButton({ onGrownUp, fixed, compact }) {
  const [step, setStep] = useState(null); // null | "gate" | "menu"
  const [ab, setAb] = useState({ a: 0, b: 0 });
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const [, force] = useState(0);
  let on = false;
  try { on = !!(getLearningSettings() && getLearningSettings().enabled); } catch (e) {}
  function openGate() { setAb({ a: 3 + Math.floor(Math.random() * 7), b: 3 + Math.floor(Math.random() * 7) }); setVal(""); setErr(false); setStep("gate"); }
  function submitGate(e) { e.preventDefault(); if (parseInt(val, 10) === ab.a * ab.b) { setStep("menu"); } else { setErr(true); } }
  function toggleLearning() { try { setLearningSettings({ ...getLearningSettings(), enabled: !on }); } catch (e) {} force((x) => x + 1); }
  // compact is ONLY used by the Home header (light background), so it gets its
  // own light chip chrome instead of the dark NAV_ICON_BTN used elsewhere.
  const btnStyle = compact
    ? { width: 42, height: 42, borderRadius: 13, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(58,46,77,0.12)", color: "#3A2E4D", cursor: "pointer", boxShadow: "0 3px 10px rgba(58,46,77,0.08)" }
    : fixed
    ? { position: "fixed", top: "calc(14px + env(safe-area-inset-top))", right: 14, zIndex: 9998, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(18,12,34,0.9)", color: "#fff", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: "9px 15px", fontSize: 14, fontWeight: 800, fontFamily: NUN, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }
    : { ...styles.myStuffButton, display: "inline-flex", alignItems: "center", gap: 6 };
  const Shield = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" /></svg>
  );
  const overlay = { position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,5,18,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
  const card = { background: "#1E1733", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, textAlign: "center", fontFamily: NUN };
  const menuBtn = { width: "100%", marginTop: 10, border: "none", borderRadius: 999, padding: 13, fontFamily: FRED, fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer" };
  const cancelBtn = { width: "100%", marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: 10, color: "#C9C2E0", fontFamily: NUN, fontSize: 13, cursor: "pointer" };
  return (
    <>
      <button onClick={openGate} aria-label="Grown-ups" style={btnStyle}><Shield />{!compact && "Grown-ups"}</button>
      {step === "gate" && (
        <div style={overlay}>
          <form onSubmit={submitGate} style={card}>
            <p style={{ color: "#fff", fontFamily: FRED, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Grown-ups only</p>
            <p style={{ color: "#B6AED0", fontSize: 14, margin: "0 0 14px" }}>Quick check — what is {ab.a} × {ab.b}?</p>
            <input autoFocus type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Type the answer" style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none", padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333" }} />
            {err && <p style={{ color: "#ffd7d7", fontSize: 13, margin: "8px 0 0" }}>Not quite — ask a grown-up.</p>}
            <button type="submit" style={{ ...menuBtn, background: "linear-gradient(90deg,#8A6BFF,#E0578F)" }}>Continue</button>
            <button type="button" onClick={() => setStep(null)} style={cancelBtn}>Cancel</button>
          </form>
        </div>
      )}
      {step === "menu" && (
        <div style={overlay}>
          <div style={card}>
            <p style={{ color: "#fff", fontFamily: FRED, fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>Grown-ups</p>
            <button onClick={toggleLearning} style={{ ...menuBtn, marginTop: 0, background: on ? "rgba(40,165,75,0.92)" : "rgba(255,255,255,0.12)" }}>Learning: {on ? "On" : "Off"}</button>
            <button onClick={() => { setStep(null); if (onGrownUp) onGrownUp(); }} style={{ ...menuBtn, background: "linear-gradient(90deg,#8A6BFF,#E0578F)" }}>Open grown-ups area</button>
            <button onClick={() => setStep(null)} style={cancelBtn}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Friends pill — a small always-present nav control that shows who's waiting on
// you: your turn in a family game, plus real-time play invites. It uses the same
// data as the big home cards, but lives in the top nav so it follows the child
// on the home screen. Click a row to jump straight into that game.
// ---------------------------------------------------------------------------
function StuffGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" /></svg>
  );
}

// Switch-player icon: two heads + a swap arrow. No emoji (drawn SVG geometry).
function SwitchPlayerGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M4.5 19a3.5 3.5 0 017 0" />
      <path d="M12.5 19a3.5 3.5 0 017 0" />
    </svg>
  );
}

function FriendsPill({ chessTurns = 0, onChess, rtInvite, onJoinInvite, friendInvites = [], friendTurns = [], onJoinFriendInvite, onOpenFriendMatch, compact }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const FTITLES = { chess: "Chess", checkers: "Checkers", tictactoe: "Tic-Tac-Toe", tennis: "Tennis" };
  const count = (chessTurns > 0 ? chessTurns : 0) + (rtInvite ? 1 : 0) + (friendInvites ? friendInvites.length : 0) + (friendTurns ? friendTurns.length : 0);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const People = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9z" />
      <path d="M10.5 20a1.7 1.7 0 003 0" />
    </svg>
  );
  const Chess = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2l1 5h-2l1-5zm-3 7h6l1 11H8L9 9z" /></svg>
  );
  const Controller = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 6h10a3 3 0 013 3v6a3 3 0 01-3 3H7a3 3 0 01-3-3V9a3 3 0 013-3z" /></svg>
  );

  const pillBtn = {
    position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    background: GRAD, color: "#fff", border: "none",
    borderRadius: 14, padding: "11px 22px", fontSize: 15, fontWeight: 800, fontFamily: NUN, cursor: "pointer",
    boxShadow: "0 6px 22px rgba(155,126,221,0.45)",
  };
  // Compact icon button (Home header only): a light "bell" chip, ink-colored icon
  // on a soft cream chip so it reads on the light Home background.
  const compactBtn = {
    width: 42, height: 42, borderRadius: 13, padding: 0, position: "relative",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "#fff", border: "1px solid rgba(58,46,77,0.12)",
    color: "#3A2E4D", cursor: "pointer", boxShadow: "0 3px 10px rgba(58,46,77,0.08)",
  };
  const compactBadge = {
    position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 999,
    padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 900, color: "#fff", background: "#E0578F", border: "2px solid #FFF8EE",
  };
  const badge = {
    minWidth: 20, height: 20, borderRadius: 999, padding: "0 6px", display: "inline-flex",
    alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#b3457f",
    background: "#fff",
  };
  const liveDot = {
    position: "absolute", top: 6, left: 28, width: 8, height: 8, borderRadius: "50%",
    background: "#34D399", border: "2px solid #fff",
  };
  const menu = {
    position: "absolute", top: "calc(100% + 8px)", right: 0, width: 320, zIndex: 9999,
    background: "#FFFFFF", border: "1px solid rgba(58,46,77,0.10)", borderRadius: 18,
    boxShadow: "0 24px 60px rgba(58,46,77,0.22)", overflow: "hidden", fontFamily: NUN,
  };
  const rowWrap = { padding: "6px 10px 12px", display: "flex", flexDirection: "column", gap: 8 };
  const row = {
    display: "flex", gap: 11, alignItems: "flex-start", textAlign: "left", width: "100%",
    background: "#FFF8EE", border: "1px solid rgba(58,46,77,0.08)",
    borderRadius: 14, padding: "11px 12px", color: "#3A2E4D", cursor: "pointer", fontFamily: NUN,
  };
  const chip = (bg, fg) => ({ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: bg, color: fg, padding: "2px 7px", borderRadius: 999 });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications" style={compact ? compactBtn : pillBtn}>
        <People />{!compact && "Friends"}
        {count > 0 && <span style={compact ? compactBadge : badge}>{count}</span>}
        {!compact && (rtInvite || (friendInvites && friendInvites.length > 0)) && <span style={liveDot} />}
      </button>
      {open && (
        <div style={menu}>
          <div style={{ padding: "14px 16px 4px" }}>
            <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 17, color: "#3A2E4D" }}>Notifications</span>
          </div>
          <div style={rowWrap}>
            {chessTurns > 0 && (
              <button style={row} onClick={() => { setOpen(false); onChess && onChess(); }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#5B3FD6,#8B6CFF)", display: "flex", alignItems: "center", justifyContent: "center" }}><Chess /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>Your move in chess</span>
                    <span style={chip("#FFD66B", "#5a3d00")}>Your turn</span>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#8B84A0", marginTop: 2 }}>{chessTurns} game{chessTurns > 1 ? "s" : ""} waiting on you</span>
                </span>
              </button>
            )}
            {rtInvite && onJoinInvite && (
              <button style={row} onClick={() => { setOpen(false); onJoinInvite(rtInvite.match); }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#34D399,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center" }}><Controller /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{rtInvite.hostName} wants to play {rtInvite.gameTitle}</span>
                    <span style={chip("rgba(52,211,153,0.20)", "#7CF6B0")}>Invite</span>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#8B84A0", marginTop: 2 }}>Tap to join and play together</span>
                </span>
              </button>
            )}
            {friendInvites && friendInvites.map((iv) => (
              <button key={"fi_" + iv.id} style={row} onClick={() => { setOpen(false); onJoinFriendInvite && onJoinFriendInvite(iv); }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#34D399,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center" }}><Controller /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{iv.fromName} wants to play {FTITLES[iv.game] || "a game"}</span>
                    <span style={chip("rgba(52,211,153,0.20)", "#7CF6B0")}>Join</span>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#8B84A0", marginTop: 2 }}>Tap to join and play together</span>
                </span>
              </button>
            ))}
            {friendTurns && friendTurns.map((m) => (
              <button key={"ft_" + m.id} style={row} onClick={() => { setOpen(false); onOpenFriendMatch && onOpenFriendMatch(m); }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#5B3FD6,#8B6CFF)", display: "flex", alignItems: "center", justifyContent: "center" }}><Chess /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>Your move in {FTITLES[m.game] || "a game"}</span>
                    <span style={chip("#FFD66B", "#5a3d00")}>Your turn</span>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "#8B84A0", marginTop: 2 }}>A friend is waiting on you</span>
                </span>
              </button>
            ))}
            {count === 0 && (
              <div style={{ textAlign: "center", color: "#8B84A0", fontSize: 13, fontWeight: 600, padding: "20px 10px 24px" }}>
                All caught up — no one's waiting on you right now.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Lobby props for each friend-playable game, keyed by the invite/match `game`.
// Mirrors the inline specs in the SCREEN_*_LOBBY blocks so a home nudge can open
// ANY friend game without knowing its screen. Keep url/version in sync with them.
// ── Multiplayer switch (Session 6A): manifest features.multiplayer -> lane ──
// A game's multiplayer LANE now comes from its manifest, not a hardcoded string.
// features.multiplayer: off -> no lane, turn-based -> "turns" (poll-a-row),
// realtime -> "realtime" (Broadcast). We warm a tiny cache from the manifest at
// startup so the synchronous gameSpecFor can read it; the hardcoded value stays
// a fallback so a missing/late manifest never breaks play. This is the one switch
// the shell reads to open the turn-based lobby vs the realtime lane (MULTIPLAYER.md).
const MP_TO_TRANSPORT = { "off": null, "turn-based": "turns", "realtime": "realtime" };
const mpTransportCache = {}; // slug -> "turns" | "realtime" | null (once its manifest is read)
function mpTransport(slug, fallback) { return (slug in mpTransportCache) ? mpTransportCache[slug] : fallback; }
function warmMultiplayerSwitch(slug) {
  return loadGameManifest(slug)
    .then((m) => {
      const v = m && m.features && m.features.multiplayer;
      mpTransportCache[slug] = Object.prototype.hasOwnProperty.call(MP_TO_TRANSPORT, v) ? MP_TO_TRANSPORT[v] : null;
    })
    .catch(() => {});
}

function gameSpecFor(slug) {
  if (slug === "chess") return { slug: "chess", title: "Buildable Chess", url: "/buildable-chess.html?online=1&v=6", transport: "turns" };
  if (slug === "checkers") {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r < 3) b[r][c] = { c: "b", k: false };
      else if (r > 4) b[r][c] = { c: "r", k: false };
    }
    return { slug: "checkers", title: "Buildable Checkers", url: "/buildable-checkers.html?online=1&v=3", transport: "turns", msg: "checkers", initialState: { board: b, turn: "r" } };
  }
  if (slug === "tictactoe") return { slug: "tictactoe", title: "Buildable Tic-Tac-Toe", url: "/tictactoe-engine.html?online=1&v=4", transport: mpTransport("tictactoe", "turns"), msg: "bg", initialState: { G: { cells: [0, 0, 0, 0, 0, 0, 0, 0, 0] }, turn: "w" } };
  // Session 7H: Connect Four + Dots and Boxes share the buildable-boardgame.js harness
  // (msg "bg"), so the generic GameLobby drives their online play with no engine edits.
  // The seed state is each engine's fresh S.init() board (Connect Four: an empty 7x6
  // grid; Dots and Boxes: the default 3x3 board the engine boots to in online mode).
  if (slug === "connectfour") return { slug: "connectfour", title: "Buildable Connect Four", url: "/connectfour-engine.html?online=1&v=hud2", transport: "turns", msg: "bg", initialState: { G: { cells: new Array(42).fill(0), fall: {} }, turn: "w" } };
  if (slug === "dotsboxes") return { slug: "dotsboxes", title: "Buildable Dots and Boxes", url: "/dotsboxes-engine.html?online=1&v=hud2", transport: "turns", msg: "bg", initialState: { G: { cols: 3, rows: 3, NH: 12, NV: 12, total: 9, h: new Array(12).fill(0), v: new Array(12).fill(0), owner: new Array(9).fill(0), scores: [0, 0], last: null }, turn: "w" } };
  if (slug === "tennis") return { slug: "tennis", title: "Buildable Tennis", url: "/tennis.html?online=1&v=4", transport: "realtime" };
  return null;
}
const FRIEND_GAME_TITLES = { chess: "Chess", checkers: "Checkers", tictactoe: "Tic-Tac-Toe", tennis: "Tennis" };

export default function BuildableKids() {
  // RETURN EXPERIENCE (Session 6F): a returning visit boots straight to the
  // last kid's Home -- never re-ask "who's playing?". If a kid was restored
  // (bk_active_kid_v1, also written for guests), open on Home; otherwise the
  // first-time flow opens the picker. Switching kids is manual via the Home
  // header "Switch player" entry. A fresh Google sign-in still routes to the
  // picker (see the OAuth-redirect effect below).
  const [screen, setScreen] = useState(getActiveKid() ? SCREEN_HOME : SCREEN_GROWNUP);
  // Background = silence, for shell-side speech too. The landed audio fix stops game
  // music and the exhibit read-aloud in-frame, but the Home buddy's spoken lines
  // (voiceBus) + browser read-aloud play outside any game frame. Stop them when the app
  // is hidden (screen-lock / app-switch) and never auto-restart them on return.
  useEffect(() => {
    const hush = () => { try { stopVoice(); } catch (e) {} try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} };
    const onVis = () => { if (document.hidden) hush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", hush);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", hush); };
  }, []);
  // The top-nav "Grown-ups" button already runs its own math check before it
  // opens this area. When it does, mark the visit pre-verified so the Grown-ups
  // screen does NOT ask a SECOND math question (one gate, not two).
  const [grownVerified, setGrownVerified] = useState(false);
  const openGrownups = () => { setGrownVerified(true); setScreen(SCREEN_GROWNUP); };
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
  const [breakerEntry, setBreakerEntry] = useState("journey"); // which engine screen the Breaker landing launches into
  const [chessStart, setChessStart] = useState(null); // Session 7E: deep-link params handed to the chess engine (solo tier / same-device)
  const [landingId, setLandingId] = useState(null); // Session 7F: which game the shared landing is showing
  const [tennisStart, setTennisStart] = useState(null); // Session 7F: "solo" | "local" handoff to the Tennis engine
  const [slingLevel, setSlingLevel] = useState(null); // which level index the Sling Journey launched into
  const [wrapLevel, setWrapLevel] = useState(null); // Session 7I: level index the shared journey hands to a wrapped engine (?level=)
  const [boardDiff, setBoardDiff] = useState(null); // Session 7I: manifest tier index the shared board picker hands to a board engine (?diff=)
  const openLanding = (id) => { setLandingId(id); setScreen(SCREEN_GAME_LANDING); };
  const [exploreId, setExploreId] = useState("solar-system"); // which Kidspedia exhibit is open (Session 8G)
  const [friendsReturn, setFriendsReturn] = useState(SCREEN_GROWNUP);
  const [rtAutoJoin, setRtAutoJoin] = useState(null);
  const [friendAutoJoin, setFriendAutoJoin] = useState(null); // { game, inviteId? , matchId? }
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

  // Read the multiplayer switch from each manifest-driven game's manifest once,
  // so gameSpecFor / the lobby open exactly the lane the manifest declares (6A).
  useEffect(() => { warmMultiplayerSwitch("tictactoe"); }, []);

  // ---- APP-WIDE PRESENCE ----------------------------------------------------
  // Stamp kid_profiles.last_seen every ~30s for as long as a kid is active in
  // the app -- ANYWHERE, not just inside a game lobby. This is what makes a
  // friend show "online" to someone else while they're playing/making things.
  useEffect(() => {
    if (isSignedIn() && activeKid && activeKid.id) startPresence(activeKid);
    else stopPresence();
  }, [activeKid]);
  useEffect(() => () => stopPresence(), []);

  // Allow opening the admin dashboard directly by URL: /admin or /admin.html
  useEffect(() => {
    if (typeof window !== "undefined" && /\/admin(\.html)?\/?$/i.test(window.location.pathname)) {
      setScreen(SCREEN_ADMIN);
    }
  }, []);

  // Open a Breaker shell screen directly from a shared link. The front-door
  // Breaker URLs (/breaker, /breaker/journey, /breaker/loadout) 308-redirect to
  // /app?bk=... (see vercel.json), so a shared link lands straight on the shell
  // screen with no profile pick required -- the shell now owns these front doors
  // instead of the engine's old in-game menu (Session 7D). Mirrors the /admin
  // deep-link above. The engine still serves /breaker/play/{id} (actual play).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let bk = "";
    try { bk = (new URLSearchParams(window.location.search)).get("bk") || ""; } catch (e) {}
    if (bk === "journey") setScreen(SCREEN_BREAKER_JOURNEY);
    else if (bk === "loadout") setScreen(SCREEN_BREAKER_LOADOUT);
    else if (bk === "landing") setScreen(SCREEN_BREAKER_LANDING);
  }, []);

  // ---- Session 2E: reload-safe addresses inside /app -------------------------
  // Mirror every STABLE screen (Home, a game landing, Kidspedia, Creations) into
  // the address bar; restore that spot on load; let Back step through screens.
  const urlHydratedRef = useRef(false);   // block the write until we've read the URL
  const fromPopRef = useRef(false);        // a change caused BY Back/forward must not re-push
  const firstWriteRef = useRef(true);      // skip the mount write so a deep link isn't clobbered

  // LOAD: restore the stable screen the address points at (shared links + refresh).
  useEffect(() => {
    if (typeof window === "undefined") { urlHydratedRef.current = true; return; }
    try {
      const parsed = screenForPath(window.location.pathname);
      if (parsed && parsed.screen !== SCREEN_HOME) {
        if (parsed.landingId != null) setLandingId(parsed.landingId);
        if (parsed.exploreId != null) setExploreId(parsed.exploreId);
        setScreen(parsed.screen);
      }
    } catch (e) {}
    urlHydratedRef.current = true;
  }, []);

  // BACK / FORWARD: map the address the browser popped back onto a screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      const parsed = screenForPath(window.location.pathname) || { screen: SCREEN_HOME };
      fromPopRef.current = true;
      if (parsed.landingId != null) setLandingId(parsed.landingId);
      if (parsed.exploreId != null) setExploreId(parsed.exploreId);
      setScreen(parsed.screen);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // WRITE: on every stable screen change, push its address. Transient screens
  // write nothing, so a refresh on them returns to the last stable address.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (firstWriteRef.current) { firstWriteRef.current = false; return; } // URL already matches reality on mount
    if (fromPopRef.current) { fromPopRef.current = false; return; }       // change came FROM Back/forward
    const path = viewToPath(screen, landingId, exploreId);
    if (!path) return;
    try { if (window.location.pathname !== path) window.history.pushState({ screen }, "", path); } catch (e) {}
  }, [screen, landingId, exploreId]);

  const goHome = () => setScreen(SCREEN_HOME);

  // Open a friend game straight from a home nudge. An invite -> accept + play;
  // an existing match ("your move") -> reopen it. Works for every friend game.
  const openFriendInvite = (inv) => { if (!inv || !gameSpecFor(inv.game)) return; setFriendAutoJoin({ game: inv.game, inviteId: inv.id }); setScreen(SCREEN_FRIEND_MATCH); };
  const openFriendMatch = (m) => { if (!m || !gameSpecFor(m.game)) return; setFriendAutoJoin({ game: m.game, matchId: m.id }); setScreen(SCREEN_FRIEND_MATCH); };
  // Open a REAL-TIME invite (tennis / family town) straight from a nudge, same as
  // the home "your move" card does. Mirrors HomeScreen's onJoinInvite.
  const openRtInvite = (m) => { if (!m) return; setRtAutoJoin(m.id); setReturnTo(SCREEN_HOME); setScreen(m.game === "town" ? SCREEN_TOWN_FAMILY : SCREEN_TENNIS_FAMILY); };

  // Per-kid game telemetry: log a "play" when a game screen opens, and remember
  // the current game so win/lose results get attributed to it (see gameLog +
  // HelperReactions). Best-effort; never blocks the UI.
  useEffect(() => {
    const slug = GAME_SLUGS[screen] || null;
    setCurrentGame(slug);
    if (slug) logGameEvent("play", slug);
  }, [screen]);
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
  // Safety net for the profile gate: Home must never render without an
  // active kid profile, no matter which code path set the screen. If that
  // ever happens, fall through to the picker instead of a blank "friend".
  const __view = (() => {
  if (screen === SCREEN_HOME && !activeKid) {
    return (
      <GrownUpScreen
        preVerified={false}
        onBack={() => setScreen(SCREEN_GROWNUP)}
        onOpenFriends={() => { setFriendsReturn(SCREEN_GROWNUP); setScreen(SCREEN_GROWNUP_FRIENDS); }}
        onProfileChosen={(kid) => {
          setActiveKidState(kid);
          // Load this kid's learning scope, THEN stamp their onboarding grade so
          // it drives the learning level (Session 6B). Self-corrects each open.
          reloadLearningForActiveKid().then(() => { try { if (kid && kid.grade) setLearningSettings({ grade: kid.grade }); } catch (e) {} });
          setScreen(getKidHelper(kid) ? SCREEN_HOME : SCREEN_HELPER);
        }}
      />
    );
  }
  if (screen === SCREEN_HOME) {
    return (
      <HomeScreen
        activeKid={activeKid}
        onMusic={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_MUSIC); }}
        onTop={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_TOP); }}
        onGames={() => setScreen(SCREEN_HOME)}
        onMakeGame={() => setScreen(SCREEN_INTRO)}
        onSounds={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_SOUNDS); }}
        onStories={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_STORY); }}
        onArt={() => setScreen(SCREEN_ART)}
        onTyping={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_TYPING); }}
        onChess={() => { setChessStart(null); setReturnTo(SCREEN_HOME); setScreen(SCREEN_CHESS_LANDING); }}
        onChessResume={() => { setChessStart(null); setReturnTo(SCREEN_HOME); setScreen(SCREEN_CHESS); }}
        onMyStuff={() => openMyStuff(SCREEN_HOME)}
        onGrownUp={openGrownups}
        onSwitchPlayer={() => { setGrownVerified(false); setScreen(SCREEN_GROWNUP); }}
        onAdmin={() => setScreen(SCREEN_ADMIN)}
        onHelper={() => { setReturnTo(SCREEN_HOME); setScreen(SCREEN_HELPER); }}
        onJoinInvite={(m) => { setRtAutoJoin(m.id); setReturnTo(SCREEN_HOME); setScreen(m.game === "town" ? SCREEN_TOWN_FAMILY : SCREEN_TENNIS_FAMILY); }}
        onJoinFriendInvite={openFriendInvite}
        onOpenFriendMatch={openFriendMatch}
        onPlatformer={() => openLanding("platformer")}
        onSurvival={() => openLanding("survival")}
        onBreaker={() => setScreen(SCREEN_BREAKER_LANDING)}
        onTumble={() => openLanding("tumble")}
        onRunner={() => openLanding("runner")}
        onCheckers={() => openLanding("checkers")}
        onTennis={() => { setTennisStart(null); setScreen(SCREEN_TENNIS_LANDING); }}
        onTown={() => openLanding("town")}
        onTicTacToe={() => openLanding("tictactoe")}
        onConnectFour={() => openLanding("connectfour")}
        onDotsBoxes={() => openLanding("dotsboxes")}
        onMemory={() => openLanding("memory")}
        onMahjong={() => openLanding("mahjong")}
        onBingo={() => openLanding("bingo")}
        onSnakes={() => setScreen(SCREEN_SNAKES)}
        onMaze={() => openLanding("maze")}
        onCastle={() => openLanding("castleguard")}
        onSling={() => openLanding("sling")}
        onCroc={() => openLanding("croctot")} onMathCannon={() => openLanding("mathcannon")}
        onRileys={() => openLanding("rileys-garden")}
        onStringMatch={() => openLanding("stringmatch")}
        onTank={() => openLanding("tank")}
        onBubble={() => openLanding("bubble")}
        onExplore={(id) => { setExploreId(id || "solar-system"); setScreen(SCREEN_EXPLORE); }}
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

  if (screen === SCREEN_MUSIC_LANDING) {
    const st = GAME_CATALOG.find((g) => g.id === "music-maker");
    // Studio front door: same shell landing every converted game uses. No demo
    // engine (studios have no attract mode) and no "Make a level" — just Play
    // (open the maker) and "Make it mine" (instrument-pack loadout).
    return <GameLanding game={st}
      onPlay={() => { setReturnTo(SCREEN_MUSIC_LANDING); setScreen(SCREEN_MUSIC); }}
      onLoadout={() => setScreen(SCREEN_MUSIC_LOADOUT)}
      onBack={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_MUSIC_LOADOUT) {
    const st = GAME_CATALOG.find((g) => g.id === "music-maker");
    // Same shell-generated loadout as games; reads the studio manifest's
    // customization (instrument packs), spends shared-wallet coins to unlock.
    return <BreakerLoadout game={st}
      onBack={() => setScreen(SCREEN_MUSIC_LANDING)}
      onPlay={() => { setReturnTo(SCREEN_MUSIC_LANDING); setScreen(SCREEN_MUSIC); }} />;
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
    return <TypingScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }

  // ============ SHARED LANDING (Session 7F) ============
  // Every keeper game now enters through the ONE shell landing (GameLanding) instead
  // of a bespoke start screen. The engines are untouched -- Play just launches the
  // existing engine screen (see LANDING_WRAP). "Make it mine" opens the same shared
  // loadout used by Breaker/Chess/Music, reading the game's manifest customization.
  if (screen === SCREEN_GAME_LANDING) {
    const g = GAME_CATALOG.find((x) => x.id === landingId);
    const cfg = g && LANDING_WRAP[landingId];
    if (!g || !cfg) { setTimeout(() => setScreen(SCREEN_HOME), 0); return null; }
    // Session 7H: board games show the Solo / Same device / Play a friend mode row
    // (their manifest multiplayer is turn-based). Everyone else keeps one Play button.
    const mp = BOARD_MP_LANDING[landingId];
    if (mp) {
      return <GameLanding game={g} demoSrc={cfg.demo}
        multiplayer="turn-based"
        onSolo={() => { setBoardDiff(null); setScreen(SCREEN_BOARD_SOLO); }}
        onSameDevice={() => { setBoardDiff(null); setScreen(mp.play); }}
        onPlayFriend={() => setScreen(mp.lobby)}
        onLoadout={cfg.loadout ? () => setScreen(SCREEN_GAME_LOADOUT) : undefined}
        onBack={() => setScreen(SCREEN_HOME)} />;
    }
    return <GameLanding game={g} demoSrc={cfg.demo}
      onPlay={() => { if (cfg.journey) { setWrapLevel(null); setScreen(SCREEN_WRAP_JOURNEY); } else setScreen(cfg.play); }}
      onLoadout={cfg.loadout ? () => setScreen(SCREEN_GAME_LOADOUT) : undefined}
      onBack={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_GAME_LOADOUT) {
    const g = GAME_CATALOG.find((x) => x.id === landingId);
    const cfg = g && LANDING_WRAP[landingId];
    if (!g || !cfg) { setTimeout(() => setScreen(SCREEN_HOME), 0); return null; }
    return <BreakerLoadout game={g}
      onBack={() => setScreen(SCREEN_GAME_LANDING)}
      onPlay={() => { if (cfg.journey) { setWrapLevel(null); setScreen(SCREEN_WRAP_JOURNEY); } else setScreen(cfg.play); }} />;
  }
  // Session 7I — ONE journey and ONE board picker for every wrapped game. Picking a
  // stop deep-links the engine (?level= / ?diff=), so the engine's own menu never
  // shows in-app; it stays reachable standalone as the replace-first fallback.
  if (screen === SCREEN_WRAP_JOURNEY) {
    const g = GAME_CATALOG.find((x) => x.id === landingId);
    const cfg = g && LANDING_WRAP[landingId];
    if (!g || !cfg) { setTimeout(() => setScreen(SCREEN_HOME), 0); return null; }
    return <GameJourney game={g} gameId={landingId}
      onBack={() => setScreen(SCREEN_GAME_LANDING)}
      onPlay={(lv, i) => { setWrapLevel(i); setScreen(cfg.play); }} />;
  }
  if (screen === SCREEN_BOARD_SOLO) {
    const g = GAME_CATALOG.find((x) => x.id === landingId);
    const mp = g && BOARD_MP_LANDING[landingId];
    if (!g || !mp) { setTimeout(() => setScreen(SCREEN_HOME), 0); return null; }
    return <BoardSoloFrame game={g} gameId={landingId}
      onBack={() => setScreen(SCREEN_GAME_LANDING)}
      onPlay={(tier, i) => { setBoardDiff(i == null ? 0 : i); setScreen(mp.play); }} />;
  }
  // Tennis (Session 7F): the shared landing replaces Tennis's own start screen; its
  // "Choose your court" picker becomes court skins in the shared loadout. multiplayer
  // is "realtime" so the mode row shows Solo / Same device / Play a friend.
  if (screen === SCREEN_TENNIS_LANDING) {
    const tn = GAME_CATALOG.find((g) => g.id === "tennis");
    return <GameLanding game={tn}
      multiplayer="realtime"
      onSolo={() => { setTennisStart("solo"); setScreen(SCREEN_TENNIS); }}
      onSameDevice={() => { setTennisStart("local"); setScreen(SCREEN_TENNIS); }}
      onPlayFriend={() => setScreen(SCREEN_TENNIS_LOBBY)}
      onLoadout={() => setScreen(SCREEN_TENNIS_LOADOUT)}
      onBack={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_TENNIS_LOADOUT) {
    const tn = GAME_CATALOG.find((g) => g.id === "tennis");
    return <BreakerLoadout game={tn}
      onBack={() => setScreen(SCREEN_TENNIS_LANDING)}
      onPlay={() => { setTennisStart("solo"); setScreen(SCREEN_TENNIS); }} />;
  }
  if (screen === SCREEN_PLATFORMER) {
    return <PlatformerScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_SURVIVAL) {
    return <SurvivalScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} onUpgrades={() => setScreen(SCREEN_SURVIVAL_UPGRADES)} />;
  }
  if (screen === SCREEN_SURVIVAL_UPGRADES) {
    const sv = GAME_CATALOG.find((g) => g.id === "survival");
    return <UpgradeStore game={sv}
      onBack={() => setScreen(SCREEN_SURVIVAL)}
      onPlay={() => setScreen(SCREEN_SURVIVAL)} />;
  }
  if (screen === SCREEN_BREAKER_LANDING) {
    const bk = GAME_CATALOG.find((g) => g.id === "breaker");
    return <GameLanding game={bk} demoSrc="/breaker-engine.html?v=3c&screen=demo"
      onPlay={() => setScreen(SCREEN_BREAKER_JOURNEY)}
      onLoadout={() => setScreen(SCREEN_BREAKER_LOADOUT)}
      onMake={() => { setBreakerEntry("maker"); setScreen(SCREEN_BREAKER); }}
      onBack={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_BREAKER_JOURNEY) {
    const bk = GAME_CATALOG.find((g) => g.id === "breaker");
    return <GameJourney game={bk} gameId="breaker"
      onBack={() => setScreen(SCREEN_BREAKER_LANDING)}
      onPlay={(lv) => { setBreakerEntry("play:" + lv.id); setScreen(SCREEN_BREAKER); }} />;
  }
  if (screen === SCREEN_BREAKER_LOADOUT) {
    const bk = GAME_CATALOG.find((g) => g.id === "breaker");
    return <BreakerLoadout game={bk}
      onBack={() => setScreen(SCREEN_BREAKER_LANDING)}
      onPlay={() => setScreen(SCREEN_BREAKER_JOURNEY)} />;
  }
  if (screen === SCREEN_BREAKER) {
    const backToJourney = typeof breakerEntry === "string" && breakerEntry.indexOf("play:") === 0;
    return <BreakerScreen entry={breakerEntry} onHome={() => setScreen(backToJourney ? SCREEN_BREAKER_JOURNEY : SCREEN_BREAKER_LANDING)} />;
  }
  if (screen === SCREEN_EXPLORE) {
    return <ExploreScreen exhibitId={exploreId} onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_CASTLE) {
    return <CastleGuardScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_TUMBLE) {
    return <TumbleScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_TICTACTOE) {
    return <BoardGameScreen title="Buildable Tic-Tac-Toe" src={"/tictactoe-engine.html?v=hud2" + (boardDiff != null ? "&diff=" + boardDiff : "")} onHome={() => { const d = boardDiff != null; setBoardDiff(null); setScreen(d ? SCREEN_GAME_LANDING : SCREEN_HOME); }} onPlayFriend={mpTransport("tictactoe", "turns") ? () => setScreen(SCREEN_TTT_LOBBY) : undefined} />;
  }
  if (screen === SCREEN_FRIEND_MATCH && friendAutoJoin) {
    const spec = gameSpecFor(friendAutoJoin.game);
    if (!spec) return null; // never happens: openFriend* only route known games
    return (
      <GameLobby
        game={spec}
        activeKid={activeKid}
        entry="friends"
        autoJoin={friendAutoJoin}
        onHome={() => { setFriendAutoJoin(null); setScreen(SCREEN_HOME); }}
        onAddFriend={() => { setFriendsReturn(SCREEN_HOME); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  if (screen === SCREEN_TTT_LOBBY) {
    return (
      <GameLobby
        game={gameSpecFor("tictactoe")}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_TICTACTOE)}
        onAddFriend={() => { setFriendsReturn(SCREEN_TTT_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  // Session 7H: Connect Four + Dots and Boxes online lobbies. Same shared GameLobby +
  // board "bg" protocol as Tic-Tac-Toe; opened from the landing's Play a friend button.
  if (screen === SCREEN_C4_LOBBY) {
    return (
      <GameLobby
        game={gameSpecFor("connectfour")}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_CONNECTFOUR)}
        onAddFriend={() => { setFriendsReturn(SCREEN_C4_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }
  if (screen === SCREEN_DOTS_LOBBY) {
    return (
      <GameLobby
        game={gameSpecFor("dotsboxes")}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_DOTSBOXES)}
        onAddFriend={() => { setFriendsReturn(SCREEN_DOTS_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  if (screen === SCREEN_CONNECTFOUR) {
    return <BoardGameScreen title="Buildable Connect Four" src={"/connectfour-engine.html?v=hud2" + (boardDiff != null ? "&diff=" + boardDiff : "")} onHome={() => { const d = boardDiff != null; setBoardDiff(null); setScreen(d ? SCREEN_GAME_LANDING : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_DOTSBOXES) {
    return <BoardGameScreen title="Buildable Dots and Boxes" src={"/dotsboxes-engine.html?v=hud2" + (boardDiff != null ? "&diff=" + boardDiff : "")} onHome={() => { const d = boardDiff != null; setBoardDiff(null); setScreen(d ? SCREEN_GAME_LANDING : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_MAZE) {
    return <MazeScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_SLING_JOURNEY) {
    const sl = GAME_CATALOG.find((g) => g.id === "sling");
    return <GameJourney game={sl} gameId="sling"
      onBack={() => setScreen(SCREEN_GAME_LANDING)}
      onPlay={(lv, i) => { setSlingLevel(i); setScreen(SCREEN_SLING); }} />;
  }
  if (screen === SCREEN_SLING) {
    const slv = wrapLevel != null ? wrapLevel : slingLevel;
    return <SlingScreen level={slv}
      onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : (slingLevel != null ? SCREEN_SLING_JOURNEY : SCREEN_HOME)); }} />;
  }
  if (screen === SCREEN_TANK) {
    return <TankScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_CROC) {
    return <CrocScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_MATHCANNON) {
    return <MathCannonScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_RILEYS) {
    return <RileysScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_STRINGMATCH) {
    return <StringMatchScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_BUBBLE) {
    return <BubbleScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_RUNNER) {
    return <SunnyTownScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_MEMORY) {
    return <MemoryScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_MAHJONG) {
    return <MahjongScreen level={wrapLevel} onHome={() => { const j = wrapLevel != null; setWrapLevel(null); setScreen(j ? SCREEN_WRAP_JOURNEY : SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_BINGO) {
    return <BingoScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_SNAKES) {
    return <SnakesScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_SOUNDS) {
    return <SoundboardScreen onHome={() => setScreen(returnTo || SCREEN_HOME)} />;
  }
  if (screen === SCREEN_ART) {
    return <ArtStudioScreen onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_TENNIS) {
    return <TennisScreen start={tennisStart} onHome={() => setScreen(SCREEN_HOME)} onPlayFriend={() => setScreen(SCREEN_TENNIS_LOBBY)} />;
  }
  if (screen === SCREEN_TENNIS_LOBBY) {
    return (
      <GameLobby
        game={{ slug: "tennis", title: "Buildable Tennis", url: "/tennis.html?online=1&v=4", transport: "realtime" }}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_TENNIS_LANDING)}
        onAddFriend={() => { setFriendsReturn(SCREEN_TENNIS_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  if (screen === SCREEN_TENNIS_FAMILY) {
    return <FamilyRealtime game={{ slug: "tennis", url: "/tennis.html?online=1&v=4", title: "Buildable Tennis" }} activeKid={activeKid} autoJoinId={rtAutoJoin} onHome={() => { setRtAutoJoin(null); setScreen(SCREEN_HOME); }} />;
  }
  if (screen === SCREEN_TOWN) {
    return <TownScreen onHome={() => setScreen(SCREEN_HOME)} onFamily={() => setScreen(SCREEN_TOWN_FAMILY)} />;
  }
  if (screen === SCREEN_TOWN_FAMILY) {
    return <FamilyTown activeKid={activeKid} onHome={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_CHESS_LANDING) {
    // Session 7E: chess enters through the one shell landing. multiplayer is
    // "turn-based" in its manifest, so the mode row shows Solo / Same device /
    // Play a friend. Solo opens the board frame (pick difficulty); Same device
    // launches the engine in pass-and-play; Play a friend opens the lobby.
    const cg = GAME_CATALOG.find((g) => g.id === "chess");
    return <GameLanding game={cg}
      multiplayer="turn-based"
      onSolo={() => setScreen(SCREEN_CHESS_SOLO)}
      onSameDevice={() => { setChessStart("start=local"); setScreen(SCREEN_CHESS); }}
      onPlayFriend={() => setScreen(SCREEN_CHESS_LOBBY)}
      onBack={() => setScreen(SCREEN_HOME)} />;
  }
  if (screen === SCREEN_CHESS_SOLO) {
    const cg = GAME_CATALOG.find((g) => g.id === "chess");
    return <BoardSoloFrame game={cg} gameId="chess"
      onBack={() => setScreen(SCREEN_CHESS_LANDING)}
      onPlay={(tier) => {
        const bot = (tier && tier.parts && tier.parts.opponent) || "medium";
        const world = (tier && tier.parts && tier.parts.world) || "";
        setChessStart("start=solo&bot=" + bot + (world ? ("&world=" + world) : ""));
        setScreen(SCREEN_CHESS);
      }} />;
  }
  if (screen === SCREEN_CHESS) {
    return <ChessScreen start={chessStart} onHome={() => setScreen(SCREEN_CHESS_LANDING)} onPlayFriend={() => setScreen(SCREEN_CHESS_LOBBY)} />;
  }

  if (screen === SCREEN_CHESS_LOBBY) {
    return (
      <GameLobby
        game={{ slug: "chess", title: "Buildable Chess", url: "/buildable-chess.html?online=1&v=6", transport: "turns" }}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_CHESS_LANDING)}
        onGuestLink={() => startGuestLink("chess")}
        onAddFriend={() => { setFriendsReturn(SCREEN_CHESS_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  if (screen === SCREEN_CHESS_FAMILY) {
    return <FamilyChess activeKid={activeKid} onHome={() => setScreen(SCREEN_HOME)} />;
  }

  if (screen === SCREEN_CHECKERS) {
    return <CheckersScreen diff={boardDiff} onHome={() => { const d = boardDiff != null; setBoardDiff(null); setScreen(d ? SCREEN_GAME_LANDING : SCREEN_HOME); }} onPlayFriend={() => setScreen(SCREEN_CHECKERS_LOBBY)} />;
  }

  if (screen === SCREEN_CHECKERS_LOBBY) {
    const checkersInitial = (() => {
      const b = Array.from({ length: 8 }, () => Array(8).fill(null));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 1) continue;
        if (r < 3) b[r][c] = { c: "b", k: false };
        else if (r > 4) b[r][c] = { c: "r", k: false };
      }
      return { board: b, turn: "r" };
    })();
    return (
      <GameLobby
        game={{ slug: "checkers", title: "Buildable Checkers", url: "/buildable-checkers.html?online=1&v=3", transport: "turns", msg: "checkers", initialState: checkersInitial }}
        activeKid={activeKid}
        entry="friends"
        onHome={() => setScreen(SCREEN_CHECKERS)}
        onAddFriend={() => { setFriendsReturn(SCREEN_CHECKERS_LOBBY); setScreen(SCREEN_GROWNUP_FRIENDS); }}
      />
    );
  }

  if (screen === SCREEN_CHECKERS_FAMILY) {
    return <FamilyCheckers activeKid={activeKid} onHome={() => setScreen(SCREEN_HOME)} />;
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
        preVerified={grownVerified}
        onBack={() => { setGrownVerified(false); setScreen(activeKid ? SCREEN_HOME : SCREEN_GROWNUP); }}
        onOpenFriends={() => { setFriendsReturn(SCREEN_GROWNUP); setScreen(SCREEN_GROWNUP_FRIENDS); }}
        onProfileChosen={(kid) => {
          setActiveKidState(kid);
          // Load this kid's learning scope, THEN stamp their onboarding grade so
          // it drives the learning level (Session 6B). Self-corrects each open.
          reloadLearningForActiveKid().then(() => { try { if (kid && kid.grade) setLearningSettings({ grade: kid.grade }); } catch (e) {} });
          setScreen(getKidHelper(kid) ? SCREEN_HOME : SCREEN_HELPER);
        }}
      />
    );
  }

  if (screen === SCREEN_GROWNUP_FRIENDS) {
    return <GrownUpFriends onBack={() => setScreen(friendsReturn || SCREEN_GROWNUP)} />;
  }

  if (screen === SCREEN_ADMIN) {
    return <AdminDashboard onExit={() => setScreen(SCREEN_HOME)} />;
  }
  })();

  return (
    <>
      {__view}
      {[SCREEN_MY_STUFF, SCREEN_TOP, SCREEN_INTRO].includes(screen) && <GrownUpButton onGrownUp={openGrownups} fixed />}
      {/* App-wide "someone invited you to play" alert. Floats at the top of ANY
          screen (except Home, which already shows invites on its own cards), and
          auto-goes-away if ignored -- or the kid can tap the x to dismiss it. */}
      <GlobalInviteAlert
        activeKid={activeKid}
        hidden={screen === SCREEN_HOME || screen === SCREEN_FRIEND_MATCH}
        onOpenFriendInvite={openFriendInvite}
        onOpenRtInvite={openRtInvite}
      />
    </>
  );
}

// ============ APP-WIDE INVITE ALERT ============
// A single floating banner that surfaces "X wants to play Y!" no matter where the
// kid is in the app. It polls the SAME shared invite sources the Home hub uses
// (inboxInvites for turn-based friend games + listInvitesForKid for real-time
// tennis/town), so there is one consistent invite pipeline everywhere. It rings a
// soft chime, slides down, and disappears on its own after a few seconds if
// ignored -- or the kid taps the x. A dismissed/ignored invite won't nag again.
const RT_GAME_TITLES = { tennis: "Tennis", town: "Family Town" };
function GlobalInviteAlert({ activeKid, hidden, onOpenFriendInvite, onOpenRtInvite }) {
  const [alert, setAlert] = useState(null); // { key, kind:'friend'|'rt', from, game, payload }
  const shownKeyRef = useRef(null);
  const dismissedRef = useRef(new Set()); // keys the kid ignored/closed -> never nag again
  const hideTimerRef = useRef(null);

  const clearBanner = (permanent) => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (permanent && shownKeyRef.current) dismissedRef.current.add(shownKeyRef.current);
    shownKeyRef.current = null;
    setAlert(null);
  };

  const chime = () => {
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

  const raise = (a) => {
    if (shownKeyRef.current === a.key) return; // already showing this exact invite
    shownKeyRef.current = a.key;
    setAlert(a);
    chime();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // Ignored == goes away by itself (and won't pop back for this invite).
    hideTimerRef.current = setTimeout(() => clearBanner(true), 9000);
  };

  useEffect(() => {
    if (hidden) { clearBanner(false); return; }
    let alive = true;
    async function check() {
      try {
        if (!isSignedIn()) return;
        const meK = getActiveKid(); if (!meK || !meK.id) return;
        // 1) turn-based friend games (chess / checkers / tic-tac-toe)
        const inv = await inboxInvites().catch(() => []);
        const fInv = (inv || []).find((i) => i.toKid === meK.id && gameSpecFor(i.game) && !dismissedRef.current.has("f_" + i.id));
        if (fInv) { if (alive) raise({ key: "f_" + fInv.id, kind: "friend", from: fInv.fromName, game: fInv.game, payload: fInv }); return; }
        // 2) real-time invites (tennis / family town)
        const rts = await listInvitesForKid(meK.id).catch(() => []);
        const rInv = (rts || []).find((m) => !dismissedRef.current.has("r_" + m.id));
        if (rInv) { if (alive) raise({ key: "r_" + rInv.id, kind: "rt", from: null, game: rInv.game, payload: rInv }); }
      } catch (e) { /* ignore */ }
    }
    check();
    const iv = setInterval(check, 5000);
    return () => { alive = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKid, hidden]);

  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  if (!alert) return null;
  const title = FRIEND_GAME_TITLES[alert.game] || RT_GAME_TITLES[alert.game] || "a game";
  const who = alert.from || "A friend";
  const join = () => {
    const a = alert;
    clearBanner(false); // they said yes -> clear, but don't blacklist
    if (a.kind === "friend") onOpenFriendInvite(a.payload);
    else onOpenRtInvite(a.payload);
  };
  return (
    <div style={GIA.wrap}>
      <style>{"@keyframes giaDrop{from{transform:translateY(-120%);opacity:0}to{transform:translateY(0);opacity:1}}"}</style>
      <div style={GIA.card}>
        <span style={GIA.ava}>{(who || "?").trim().charAt(0).toUpperCase()}</span>
        <span style={GIA.text}><b>{who}</b> wants to play <b>{title}</b>!</span>
        <button style={GIA.join} onClick={join}>Join</button>
        <button style={GIA.close} aria-label="Dismiss" onClick={() => clearBanner(true)}>&times;</button>
      </div>
    </div>
  );
}
const GIA = {
  wrap: { position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, display: "flex", justifyContent: "center", pointerEvents: "none", padding: "10px 12px" },
  card: { pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12, maxWidth: 460, width: "calc(100% - 24px)", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)", color: "#fff", borderRadius: 16, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,0.35)", fontFamily: "'Nunito',sans-serif", animation: "giaDrop 0.35s cubic-bezier(.2,.9,.3,1.3)" },
  ava: { width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flex: "0 0 auto" },
  text: { flex: 1, fontSize: 15, lineHeight: 1.25 },
  join: { fontFamily: "'Fredoka',sans-serif", fontWeight: 800, fontSize: 15, color: "#5a3fd6", background: "#fff", border: "none", borderRadius: 12, padding: "9px 16px", cursor: "pointer", flex: "0 0 auto" },
  close: { flex: "0 0 auto", width: 30, height: 30, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.22)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer", fontWeight: 700 },
};

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
        <StuffGlyph />My Stuff{total ? ` (${total})` : ""}
      </button>
    </div>
  );
}

// ============ INTRO SCREEN COMPONENT ============
// ============ HOME HUB COMPONENT ============
// The new front door. Segments the three experiences (Music live, Games in
// beta, Stories coming soon) and surfaces the Grown-ups portal + My Stuff.
function HomeScreen(props) {
  const { activeKid, onMusic, onGames, onMakeGame, onStories, onArt, onTyping, onChess, onChessResume, onMyStuff, onGrownUp, onSwitchPlayer, onAdmin, onTop, onHelper, onSounds, onJoinInvite, onJoinFriendInvite, onOpenFriendMatch } = props;
  // ---------------------------------------------------------------------------
  // Session 3E — Home screen redesign. Cream/light theme ONLY on this screen
  // (no dark mode toggle, no dark palette). Everything below re-presents data
  // that already existed (turns/invites, jump-back-in, trending) plus three new
  // pieces: a dismissible "buddy moment" card, a Learning-Mode "Brain Boost"
  // card, and manifest-driven Play/Make shelves. No emojis — every icon here is
  // hand-drawn SVG or an art slot (/api/images?kind=...&id=...).
  // ---------------------------------------------------------------------------
  const HOME_BG =
    "radial-gradient(circle at 10% -8%, rgba(155,126,221,0.16), transparent 42%)," +
    "radial-gradient(circle at 90% 108%, rgba(240,151,42,0.14), transparent 46%)," +
    "#FFF8EE";
  const HOME_CARD = "#FFFFFF";
  const HOME_CARD_BORDER = "1px solid rgba(58,46,77,0.10)";
  const HOME_SHADOW = "0 8px 22px rgba(58,46,77,0.09)";
  const HOME_INK = "#3A2E4D";
  const HOME_SUB = "#8B84A0";

  // App-icon tiles: a colored squircle + a clean white glyph (no emoji).
  const AppIcon = ({ grad, size = 76, children }) => (
    <div style={{ position: "relative", width: size, height: size, borderRadius: Math.round(size * 0.26), background: grad, boxShadow: "0 8px 18px rgba(58,46,77,0.28)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)" }} />
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
  const SpeakerGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 19h6l9-7v24l-9-7H9z" fill="#fff" stroke="#fff" strokeLinejoin="round" />
      <path d="M30 18c3 2.4 3 9.6 0 12M35 13c5 4 5 18 0 22" />
    </svg>
  );
  const NoteGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="17" cy="33" rx="7" ry="5.2" transform="rotate(-20 17 33)" fill="#fff" />
      <rect x="22.6" y="11" width="3.2" height="22.5" fill="#fff" />
      <path d="M25.8 11 q11 3 8.5 15 q.5 -8 -8.5 -9 z" fill="#fff" />
    </svg>
  );
  const ArtGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="27" y="9" width="6.5" height="20" rx="3" transform="rotate(38 30 19)" fill="#fff" />
      <path d="M18 30 q-3 2 -4 7 q5 -1 7 -4 z" fill="#fff" />
      <circle cx="14" cy="14" r="3.4" fill="#fff" /><circle cx="22" cy="11" r="2.4" fill="#fff" opacity="0.8" />
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
  const ChessGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="22.4" y="5" width="3.2" height="9" rx="1" fill="#fff" />
      <rect x="19.5" y="7.5" width="9" height="3.2" rx="1" fill="#fff" />
      <circle cx="24" cy="18" r="5" fill="#fff" />
      <path d="M16.5 22 h15 l-2.5 12 h-10 z" fill="#fff" />
      <rect x="13" y="33" width="22" height="6" rx="3" fill="#fff" />
    </svg>
  );
  const WandGlyph = () => (
    <svg width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 9 l3.6 9.8 L37.4 22 l-9.8 3.6 L24 35 l-3.6-9.4 L11 22 l9.8-3.2 Z" fill="#fff" />
      <circle cx="38" cy="11" r="2.4" fill="#fff" /><circle cx="11" cy="35" r="1.8" fill="#fff" />
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
  // Ink-colored glyphs, drawn to sit directly on cream/white cards (not on a
  // colored badge), so they use currentColor rather than a fixed white fill.
  const StreakGlyph = ({ size = 15, color = "#F0972A" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12.3 2c1.1 3.3-2.6 4.6-2.6 8.3a3.4 3.4 0 006.8 0c0-1.2-.4-1.9-.7-2.3.6 2.2-.6 3.5-1.4 3.9.9-3.6-2.2-5.6-2.1-9.9z" />
      <path d="M8.4 12.8A5.4 5.4 0 0012 21.8a5.4 5.4 0 003.7-9.3c.3 2.9-1.5 4.6-1.5 4.6a2.6 2.6 0 01-4.4-1.9c0-.9.3-1.6.6-2.4z" />
    </svg>
  );
  const HeartGlyph = ({ size = 14, color = "#E0578F" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 20.5s-7.6-4.6-10-9.2C.4 7.7 2.6 4 6.3 4c2 0 3.6 1.1 4.5 2.6a1.5 1.5 0 002.4 0C14.1 5.1 15.7 4 17.7 4 21.4 4 23.6 7.7 22 11.3 19.6 15.9 12 20.5 12 20.5z" />
    </svg>
  );
  const BellGlyph = ({ size = 20, color = "#3A2E4D" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 9a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9z" />
      <path d="M10.5 20a1.7 1.7 0 003 0" />
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

  // Notify on the Chess card when it's this kid's move in a family game.
  const [chessTurns, setChessTurns] = useState(0);
  const prevTurnsRef = useRef(0);
  const [rtInvite, setRtInvite] = useState(null);
  // NEW cross-account system (game_invites + friend_matches), polled app-wide so
  // a kid sees "X wants to play" / "your move" ANYWHERE they open the home hub,
  // not only inside a game's friends screen.
  const [friendInvites, setFriendInvites] = useState([]); // pending invites TO this kid
  const [friendTurns, setFriendTurns] = useState([]);     // turn-based matches where it's this kid's move
  const prevFriendCountRef = useRef(0);
  useEffect(() => {
    let alive = true;
    async function checkFriends() {
      try {
        if (!isSignedIn()) { if (alive) { setFriendInvites([]); setFriendTurns([]); } return; }
        const meK = getActiveKid(); if (!meK || !meK.id) { if (alive) { setFriendInvites([]); setFriendTurns([]); } return; }
        const [inv, matches] = await Promise.all([
          inboxInvites().catch(() => []),
          listActiveFriendMatches(meK.id).catch(() => []),
        ]);
        if (!alive) return;
        const invs = (inv || []).filter((i) => i.toKid === meK.id);
        const acceptedMatchIds = new Set(); // hide a "your move" that still has a live invite
        invs.forEach((i) => { if (i.matchId) acceptedMatchIds.add(i.matchId); });
        // Is it THIS kid's move? Host is always the first player. Turn is stored
        // as "host"/"guest" before the board seeds, then as the board's own side
        // token afterwards (chess/tic-tac-toe: w/b, checkers: r/b). Match the
        // lobby's authority: host = first player (host|w|r), guest = (guest|b).
        const isMyTurn = (m) => {
          const role = roleFor(m, meK.id);
          const t = String(m.turn || "host").toLowerCase();
          return role === "host" ? (t === "host" || t === "w" || t === "r") : (t === "guest" || t === "b");
        };
        const turns = (matches || []).filter((m) => isMyTurn(m) && !acceptedMatchIds.has(m.id));
        setFriendInvites(invs);
        setFriendTurns(turns);
        const total = invs.length + turns.length;
        if (total > prevFriendCountRef.current) dingChime();
        prevFriendCountRef.current = total;
      } catch (e) { /* ignore */ }
    }
    checkFriends();
    const iv = setInterval(checkFriends, 6000);
    return () => { alive = false; clearInterval(iv); };
  }, [activeKid]);
  useEffect(() => {
    let alive = true;
    async function checkInvites() {
      try {
        if (!isSignedIn()) { if (alive) setRtInvite(null); return; }
        const meK = getActiveKid(); if (!meK) { if (alive) setRtInvite(null); return; }
        const invs = await listInvitesForKid(meK.id);
        if (!alive) return;
        if (!invs || !invs.length) { setRtInvite(null); return; }
        const m = invs[0];
        let hostName = "A family member";
        try { const ks = await listKidProfiles(); const h = (ks || []).find((k) => k.id === m.host_kid); if (h) hostName = h.display_name; } catch (e) {}
        const titles = { tennis: "Tennis", town: "Family Town" };
        if (alive) setRtInvite({ match: m, hostName, gameTitle: titles[m.game] || "a game" });
      } catch (e) { /* ignore */ }
    }
    checkInvites();
    const iv = setInterval(checkInvites, 6000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
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

  // ---- coins (shell-owned wallet; see public/buildable-wallet.js) ----
  const [coins, setCoins] = useState(() => walletBalance());
  useEffect(() => {
    const onWallet = () => setCoins(walletBalance());
    window.addEventListener("bk-wallet", onWallet);
    setCoins(walletBalance());
    return () => window.removeEventListener("bk-wallet", onWallet);
  }, [activeKid]);

  // ---- streak (Learning Mode progress store; safe default when off/empty) ----
  const progress = (() => { try { return getProgress(); } catch (e) { return null; } })();
  const streakDays = (progress && progress.streakDays) || 0;

  // ---- Jump back in: this kid's most recent creations (songs/stories/games) ----
  const [jumpItems, setJumpItems] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const kid = getActiveKid();
        // Show ONLY the selected kid's own creations. Never fall back to the
        // shared device list — that leaks other family members' songs onto a
        // profile (e.g. a kid's songs showing up on the Dad profile).
        if (!kid || !kid.id) { if (alive) setJumpItems([]); return; }
        const q = "?kidProfileId=" + encodeURIComponent(kid.id);
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
    game: { label: "Game", color: "#6A4FE0", bg: "rgba(138,107,255,0.14)" },
    song: { label: "Song", color: "#C23E72", bg: "rgba(224,87,143,0.14)" },
    story: { label: "Story", color: "#1C8F5A", bg: "rgba(52,211,153,0.18)" },
  };

  // Favorite game (from per-kid telemetry) -> the buddy nudges toward it.
  const [favGame, setFavGame] = useState(null);
  useEffect(() => {
    let alive = true;
    const did = deviceId();
    const kid = getActiveKid();
    const q = kid && kid.id ? "?kidProfileId=" + encodeURIComponent(kid.id) : "?deviceId=" + encodeURIComponent(did);
    fetch("/api/kid-game-stats" + q).then((r) => r.json()).then((d) => { if (alive && d && d.favorite && d.favorite.plays >= 2) setFavGame(d.favorite); }).catch(() => {});
    return () => { alive = false; };
  }, [activeKid]);
  const GAME_NAMES = { platformer: "Platformer", castle: "Castle Guard", survival: "Survival", breaker: "Breaker", chess: "Chess", typing: "Typing", tennis: "Tennis", runner: "Sunny Town Drive", generated: "your own game" };
  const favLine = favGame ? (favGame.game === "generated"
    ? "You love making your own games — want to build another?"
    : ((GAME_NAMES[favGame.game] || favGame.game) + " is your favorite — want to play it again?")) : null;

  const kidName = (activeKid && activeKid.display_name) || "friend";

  // ---- Today's Brain Boost (Learning Mode only) ----
  const learningOn = (() => { try { return !!(getLearningSettings() && getLearningSettings().enabled); } catch (e) { return false; } })();
  const brainBoost = (() => { try { return dailyLearningProgress(); } catch (e) { return { count: 0, goal: 3, done: false, todayKey: "" }; } })();
  useEffect(() => {
    // Award the daily coin bonus exactly once per day, per kid — awardOnce keys
    // on "brainboost:<date>" so refreshing the page can't farm it.
    if (!learningOn || !brainBoost.done || !brainBoost.todayKey) return;
    try { window.BuildableWallet && window.BuildableWallet.awardOnce("brainboost:" + brainBoost.todayKey, 10); } catch (e) {}
  }, [learningOn, brainBoost.done, brainBoost.todayKey]);

  // ---- "Buddy moment" card: conditional, dismissible, day-scoped in localStorage ----
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const [buddyTick, setBuddyTick] = useState(0);
  const buddyDismissKey = (id) => `bk_buddy_dismiss_${(activeKid && activeKid.id) || "guest"}_${todayStr()}_${id}`;
  const isBuddyDismissed = (id) => { try { return localStorage.getItem(buddyDismissKey(id)) === "1"; } catch (e) { return false; } };
  const dismissBuddy = (id) => { try { localStorage.setItem(buddyDismissKey(id), "1"); } catch (e) {} setBuddyTick((t) => t + 1); };
  const buddyMoment = (() => {
    void buddyTick; // read to keep this recomputed after a dismiss
    const candidates = [];
    if (learningOn && brainBoost.done) candidates.push({ id: "brainboost-done", text: "You finished today's Brain Boost! Amazing work today." });
    if (streakDays >= 5 && streakDays % 5 === 0) candidates.push({ id: `streak-${streakDays}`, text: `Wow, ${streakDays} days in a row! You're on fire.` });
    if (favLine) candidates.push({ id: "fav-" + todayStr(), text: "Welcome back, " + kidName + "! " + favLine });
    return candidates.find((c) => !isBuddyDismissed(c.id)) || null;
  })();

  // (Buddy 2.0) The persistent floating helper was removed. In-game moments
  // now come from the event-driven buddy (HelperReactions + lib/buddy.js);
  // the Home welcome-back/streak moment is the dismissible card below.

  // ---- Play shelf (manifest-driven from GAME_CATALOG) + its coming-soon gate ----
  const [catalogGate, setCatalogGate] = useState(null);
  const [catalogPw, setCatalogPw] = useState("");
  const [catalogErr, setCatalogErr] = useState(false);
  const openCatalogGame = (g) => {
    const fn = props[g.handler];
    if (!fn) { onGames && onGames(); return; }
    if (g.soon) { setCatalogGate(() => fn); setCatalogPw(""); setCatalogErr(false); return; }
    fn();
  };
  const submitCatalogPw = () => {
    if (catalogPw === "1111") { const go = catalogGate; setCatalogGate(null); setCatalogPw(""); setCatalogErr(false); if (go) go(); }
    else setCatalogErr(true);
  };

  // ---- shelf card (Play): art-slot image from GAME_CATALOG, no hardcoded art ----
  const shelfCardStyle = {
    flex: "0 0 auto", width: phone ? 150 : 176, textAlign: "left", padding: 0, borderRadius: 18,
    border: HOME_CARD_BORDER, background: HOME_CARD, color: HOME_INK, cursor: "pointer", fontFamily: NUN,
    overflow: "hidden", boxShadow: HOME_SHADOW, scrollSnapAlign: "start",
  };
  const PlayShelfCard = ({ g }) => (
    <button onClick={() => openCatalogGame(g)} style={{ ...shelfCardStyle, opacity: g.soon ? 0.65 : 1 }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: `linear-gradient(160deg, ${g.color}, ${g.color}99)` }}>
        {g.imgId && <img src={`/api/images?kind=game&id=${g.imgId}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        {g.soon && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "rgba(58,46,77,0.82)", color: "#fff" }}>Soon</span>}
      </div>
      <div style={{ padding: "9px 11px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flex: "0 0 auto" }} />
          <div style={{ fontFamily: FRED, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: HOME_SUB, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{g.category}</div>
      </div>
    </button>
  );

  // ---- shelf card (Make): the creation tools this Home already exposes ----
  const MAKE_ITEMS = [
    // Stories is COMING SOON while the art relaunch finishes: the tile stays visible
    // but opens the same 1111 preview gate the Play shelf uses (owner QA only).
    { id: "story", title: "Make a story", sub: "Coming soon", grad: "linear-gradient(160deg,#F2789E,#E0578F)", glyph: <BookGlyph />, soon: true, gated: true, onClick: () => { setCatalogGate(() => onStories); setCatalogPw(""); setCatalogErr(false); } },
    { id: "song", title: "Make a song", sub: "Sing about anything", grad: "linear-gradient(160deg,#8A6BFF,#6A4FE0)", glyph: <NoteGlyph />, onClick: onMusic },
    { id: "sound", title: "Sound Machine", sub: "Silly sounds & explosions", grad: "linear-gradient(160deg,#FF8FB1,#F0577E)", glyph: <SpeakerGlyph />, onClick: onSounds },
    { id: "art", title: "Make art", sub: "Draw, stamp & mirror", grad: "linear-gradient(160deg,#22B8CF,#1098AD)", glyph: <ArtGlyph />, onClick: onArt },
    { id: "game", title: "Make a game", sub: "Coming soon", grad: "linear-gradient(160deg,#A06BFF,#7A4FE0)", glyph: <WandGlyph />, onClick: onMakeGame, soon: true },
  ];
  const MakeShelfCard = ({ item }) => (
    <button
      onClick={item.soon && !item.gated ? undefined : item.onClick}
      disabled={item.soon && !item.gated}
      style={{ ...shelfCardStyle, opacity: item.soon ? 0.6 : 1, padding: phone ? "16px 12px 14px" : "20px 14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", cursor: item.soon && !item.gated ? "default" : "pointer" }}
    >
      {item.soon && <span style={{ position: "absolute", marginTop: -6, fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "rgba(58,46,77,0.10)", color: HOME_INK, alignSelf: "flex-end" }}>Soon</span>}
      <AppIcon grad={item.grad} size={phone ? 62 : 74}>{item.glyph}</AppIcon>
      <div style={{ fontFamily: FRED, fontSize: phone ? 14 : 16, fontWeight: 700 }}>{item.title}</div>
      <div style={{ fontSize: phone ? 10.5 : 12, color: HOME_SUB }}>{item.sub}</div>
    </button>
  );

  // ---- shelf card (Explore): Kidspedia exhibits, art-slot hero image (Session 8G) ----
  const approvedExhibits = exploreShelfItems();
  const ExploreShelfCard = ({ ex }) => (
    <button onClick={() => props.onExplore && props.onExplore(ex.id)} style={shelfCardStyle}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: `linear-gradient(160deg, ${ex.color}, ${ex.color}99)` }}>
        <img src={/^(\/|https?:)/.test(ex.heroArt) ? ex.heroArt : `/api/images?kind=explore&id=${encodeURIComponent(ex.heroArt)}`} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ padding: "9px 11px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: ex.color, flex: "0 0 auto" }} />
          <div style={{ fontFamily: FRED, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.title}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: HOME_SUB, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{ex.id === "kidspedia" ? "Books" : "Kidspedia"}</div>
      </div>
    </button>
  );

  const sectionTitle = { fontFamily: FRED, fontWeight: 700, fontSize: 17, color: HOME_INK };
  const shelfRow = { display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollSnapType: "x proximity", paddingBottom: 6, marginBottom: 26 };

  return (
    <div style={{ minHeight: "100vh", background: HOME_BG, padding: phone ? "16px 14px 96px" : "24px 20px 108px", fontFamily: NUN, color: HOME_INK }}>
      <div style={{ width: "100%", maxWidth: maxW, margin: "0 auto" }}>

        {/* ---- 1. Header: avatar, name, streak, bell (notifications), coins ---- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{
              width: 52, height: 52, borderRadius: "50%", background: pillGrad(activeKid && activeKid.display_name),
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontFamily: FRED, fontSize: 22, fontWeight: 700, color: "#fff", boxShadow: "0 6px 16px rgba(58,46,77,0.22)",
            }}>{initial(activeKid && activeKid.display_name)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: phone ? 20 : 24, color: HOME_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hi, {kidName}!</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, fontSize: 13, fontWeight: 700, color: HOME_SUB }}>
                <StreakGlyph />
                {streakDays > 0 ? `${streakDays} day streak` : "Start a streak today"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button onClick={onHelper} aria-label="Your buddy" style={{ width: 42, height: 42, borderRadius: 13, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#9b7edd,#6f5bd6)", border: "1px solid rgba(58,46,77,0.12)", cursor: "pointer", boxShadow: "0 3px 10px rgba(58,46,77,0.08)" }}><BuddyGlyph size={22} /></button>
            {onSwitchPlayer && (
              <button onClick={onSwitchPlayer} aria-label="Switch player" title="Switch player" style={{ width: 42, height: 42, borderRadius: 13, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(58,46,77,0.12)", color: HOME_INK, cursor: "pointer", boxShadow: "0 3px 10px rgba(58,46,77,0.08)" }}><SwitchPlayerGlyph /></button>
            )}
            <button onClick={onMyStuff} aria-label="My Stuff" style={{ width: 42, height: 42, borderRadius: 13, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid rgba(58,46,77,0.12)", color: HOME_INK, cursor: "pointer", boxShadow: "0 3px 10px rgba(58,46,77,0.08)" }}><StuffGlyph /></button>
            <GrownUpButton onGrownUp={onGrownUp} compact />
            <FriendsPill chessTurns={chessTurns} onChess={onChessResume || onChess} rtInvite={rtInvite} onJoinInvite={onJoinInvite} friendInvites={friendInvites} friendTurns={friendTurns} onJoinFriendInvite={onJoinFriendInvite} onOpenFriendMatch={onOpenFriendMatch} compact />
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, background: "#fff",
              border: "1px solid rgba(240,151,42,0.30)", borderRadius: 999, padding: "9px 14px",
              fontFamily: NUN, fontWeight: 800, fontSize: 15, color: "#8A5A00", boxShadow: "0 3px 10px rgba(58,46,77,0.08)",
            }}><CoinGlyph size={18} />{coins}</span>
          </div>
        </div>

        {/* ---- 2. Buddy moment: conditional + dismissible, never a permanent fixture ---- */}
        {buddyMoment && (
          <div style={{
            position: "relative", display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 18,
            background: "linear-gradient(135deg, rgba(155,126,221,0.10), rgba(224,87,143,0.10))",
            border: "1px solid rgba(155,126,221,0.28)", borderRadius: 18, padding: "14px 40px 14px 14px",
          }}>
            <span style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#9b7edd,#6f5bd6)", display: "flex", alignItems: "center", justifyContent: "center" }}><BuddyGlyph size={24} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 14, color: HOME_INK }}>Hi {kidName}!</div>
              <div style={{ fontSize: 13, color: "#5C5470", marginTop: 2, lineHeight: 1.4 }}>{buddyMoment.text}</div>
            </div>
            <button onClick={() => dismissBuddy(buddyMoment.id)} aria-label="Dismiss" style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(58,46,77,0.10)", color: HOME_INK, fontSize: 13, lineHeight: "14px", cursor: "pointer", padding: 0 }}>×</button>
          </div>
        )}

        {/* ---- 3. Your move: pending multiplayer turns/invites ---- */}
        {chessTurns > 0 && (
          <button onClick={onChessResume || onChess} style={{
            width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 14,
            display: "flex", gap: 12, alignItems: "center",
            background: "#FFF6E9", border: "1px solid rgba(240,151,42,0.35)", borderRadius: 16, padding: "12px 14px", color: HOME_INK, fontFamily: NUN,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#5B3FD6,#8B6CFF)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChessGlyph /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Your move in chess
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#FFD66B", color: "#5a3d00", padding: "2px 7px", borderRadius: 999 }}>Your turn</span>
              </div>
              <div style={{ fontSize: 12, color: HOME_SUB }}>{chessTurns} game{chessTurns > 1 ? "s" : ""} waiting on you</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FFD66B", color: "#5a3d00", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "8px 13px", flexShrink: 0 }}>Play →</span>
          </button>
        )}

        {rtInvite && onJoinInvite && (
          <button onClick={() => onJoinInvite(rtInvite.match)} style={{
            width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 14,
            display: "flex", gap: 12, alignItems: "center",
            background: "#EAFBF3", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 16, padding: "12px 14px", color: HOME_INK, fontFamily: NUN,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#34D399,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center" }}><ControllerGlyph /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {rtInvite.hostName} wants to play {rtInvite.gameTitle}!
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#34D399", color: "#053d2b", padding: "2px 7px", borderRadius: 999 }}>Invite</span>
              </div>
              <div style={{ fontSize: 12, color: HOME_SUB }}>Tap to join and play together</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#34D399", color: "#053d2b", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "8px 13px", flexShrink: 0 }}>Join →</span>
          </button>
        )}

        {friendInvites && friendInvites.map((iv) => (
          <button key={"fic_" + iv.id} onClick={() => onJoinFriendInvite && onJoinFriendInvite(iv)} style={{
            width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 14,
            display: "flex", gap: 12, alignItems: "center",
            background: "#EAFBF3", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 16, padding: "12px 14px", color: HOME_INK, fontFamily: NUN,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#34D399,#0EA5E9)", display: "flex", alignItems: "center", justifyContent: "center" }}><ControllerGlyph /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {iv.fromName} wants to play {FRIEND_GAME_TITLES[iv.game] || "a game"}!
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#34D399", color: "#053d2b", padding: "2px 7px", borderRadius: 999 }}>Invite</span>
              </div>
              <div style={{ fontSize: 12, color: HOME_SUB }}>Tap to join and play together</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#34D399", color: "#053d2b", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "8px 13px", flexShrink: 0 }}>Join &rarr;</span>
          </button>
        ))}

        {friendTurns && friendTurns.map((m) => (
          <button key={"ftc_" + m.id} onClick={() => onOpenFriendMatch && onOpenFriendMatch(m)} style={{
            width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 14,
            display: "flex", gap: 12, alignItems: "center",
            background: "#FFF6E9", border: "1px solid rgba(240,151,42,0.35)", borderRadius: 16, padding: "12px 14px", color: HOME_INK, fontFamily: NUN,
          }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#5B3FD6,#8B6CFF)", display: "flex", alignItems: "center", justifyContent: "center" }}><ChessGlyph /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Your move in {FRIEND_GAME_TITLES[m.game] || "a game"}
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#FFD66B", color: "#5a3d00", padding: "2px 7px", borderRadius: 999 }}>Your turn</span>
              </div>
              <div style={{ fontSize: 12, color: HOME_SUB }}>A friend is waiting on you</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FFD66B", color: "#5a3d00", fontWeight: 800, fontSize: 13, borderRadius: 999, padding: "8px 13px", flexShrink: 0 }}>Play &rarr;</span>
          </button>
        ))}

        {/* ---- 4. Jump back in: this kid's most recent creations ---- */}
        {jumpItems.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <span style={sectionTitle}>Jump back in</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${jumpItems.length}, 1fr)`, gap: 10, marginBottom: 24 }}>
              {jumpItems.map((it) => {
                const tag = KIND_TAG[it.kind];
                return (
                  <button key={it.kind + it.id} onClick={it.open} style={{
                    borderRadius: 15, overflow: "hidden", border: HOME_CARD_BORDER,
                    background: HOME_CARD, cursor: "pointer", textAlign: "left", padding: 0, color: HOME_INK, fontFamily: NUN, boxShadow: HOME_SHADOW,
                  }}>
                    <div style={{ height: phone ? 64 : 80, position: "relative", background: it.thumbnail ? `center/cover no-repeat url(${it.thumbnail})` : it.color }}>
                      <span style={{ position: "absolute", top: 6, left: 6, fontSize: 8, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", color: tag.color, background: "#fff", padding: "2px 7px", borderRadius: 999 }}>{tag.label}</span>
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: HOME_SUB }}>Your {it.kind}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ---- 5. Today's Brain Boost: Learning Mode only, "done" state stays visible ---- */}
        {learningOn && (
          <div style={{ marginBottom: 26, background: HOME_CARD, border: HOME_CARD_BORDER, borderRadius: 18, padding: "16px 16px 14px", boxShadow: HOME_SHADOW }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#FFC75A,#F0972A)", display: "flex", alignItems: "center", justifyContent: "center" }}><TrophyGlyph /></span>
                <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 16, color: HOME_INK }}>Today's Brain Boost</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FFF6E9", border: "1px solid rgba(240,151,42,0.3)", borderRadius: 999, padding: "5px 10px", fontWeight: 800, fontSize: 12, color: "#8A5A00" }}>
                <CoinGlyph size={14} />+10
              </span>
            </div>
            <div style={{ marginTop: 12, height: 10, borderRadius: 999, background: "rgba(58,46,77,0.08)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 999, width: `${Math.min(100, Math.round((brainBoost.count / Math.max(1, brainBoost.goal)) * 100))}%`, background: "linear-gradient(90deg,#F0972A,#FFC75A)", transition: "width 0.3s ease" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: HOME_SUB }}>{Math.min(brainBoost.count, brainBoost.goal)} of {brainBoost.goal} questions today</span>
              {brainBoost.done && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", background: "#DFF6E8", color: "#1C8F5A", padding: "3px 9px", borderRadius: 999 }}>Done for today</span>}
            </div>
          </div>
        )}

        {/* ---- 6. Play shelf: manifest-driven from GAME_CATALOG, side-scrolling ---- */}
        <div style={{ marginBottom: 12 }}><span style={sectionTitle}>Play</span></div>
        <div style={shelfRow}>
          {GAME_CATALOG.filter((g) => g.type === "game").map((g) => <PlayShelfCard key={g.id} g={g} />)}
        </div>

        {/* ---- 7. Make shelf: creation tools, same side-scrolling treatment ---- */}
        <div style={{ marginBottom: 12 }}><span style={sectionTitle}>Make</span></div>
        <div style={shelfRow}>
          {MAKE_ITEMS.map((item) => <MakeShelfCard key={item.id} item={item} />)}
        </div>

        {/* ---- 7b. Explore shelf: Kidspedia exhibits, only when there is at least one approved ---- */}
        {approvedExhibits.length > 0 && (
          <>
            <div style={{ marginBottom: 12 }}><span style={sectionTitle}>Explore</span></div>
            <div style={shelfRow}>
              {approvedExhibits.map((ex) => <ExploreShelfCard key={ex.id} ex={ex} />)}
            </div>
          </>
        )}

        {/* ---- 8. Trending from other kids ---- */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={sectionTitle}>Trending from other kids</span>
          {trending.length > 0 && <button onClick={onTop} style={{ background: "none", border: "none", color: "#6A4FE0", fontFamily: NUN, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>See all →</button>}
        </div>
        {trending.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {trending.map((it, i) => {
              const tag = KIND_TAG[it.kind] || KIND_TAG.game;
              return (
                <button key={it.kind + it.id} onClick={onTop} style={{
                  display: "flex", alignItems: "center", gap: 11, background: HOME_CARD,
                  border: HOME_CARD_BORDER, borderRadius: 13, padding: "9px 11px", boxShadow: HOME_SHADOW,
                  cursor: "pointer", color: HOME_INK, fontFamily: NUN, textAlign: "left",
                }}>
                  <span style={{ fontFamily: FRED, fontWeight: 700, fontSize: 14, color: HOME_SUB, width: 14, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: it.thumbnail ? `center/cover no-repeat url(${it.thumbnail})` : (it.cover_color || tag.bg) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: HOME_SUB }}>by {it.creator || "a kid"}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.4px", textTransform: "uppercase", color: tag.color, background: tag.bg, padding: "3px 8px", borderRadius: 999, flexShrink: 0 }}>{tag.label}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 12, fontWeight: 800, color: "#C23E72" }}><HeartGlyph />{it.heart_count || 0}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <button onClick={onTop} style={{
            width: "100%", textAlign: "center", cursor: "pointer", color: HOME_SUB, fontFamily: NUN,
            background: HOME_CARD, border: "1px dashed rgba(58,46,77,0.22)", borderRadius: 14, padding: "20px 16px",
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: HOME_INK, marginBottom: 4 }}>No top projects yet</div>
            <div style={{ fontSize: 13 }}>Make something and publish it to be the first on the board!</div>
          </button>
        )}

      </div>

      {/* coming-soon gate for the Play shelf (same 1111 QA gate as the full picker) */}
      {catalogGate && (
        <div onClick={() => setCatalogGate(null)} style={{ position: "fixed", inset: 0, background: "rgba(58,46,77,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9500, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#fff", border: HOME_CARD_BORDER, borderRadius: 24, padding: "26px 22px", fontFamily: NUN, color: HOME_INK, boxShadow: "0 18px 50px rgba(58,46,77,0.30)" }}>
            <div style={{ fontFamily: FRED, fontSize: 22, fontWeight: 700, textAlign: "center" }}>Coming soon</div>
            <div style={{ fontSize: 14, color: HOME_SUB, textAlign: "center", marginTop: 8 }}>Enter the password to preview this game.</div>
            <input value={catalogPw} onChange={(e) => { setCatalogPw(e.target.value); setCatalogErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") submitCatalogPw(); }} type="password" inputMode="numeric" autoFocus placeholder="Password" style={{ width: "100%", boxSizing: "border-box", marginTop: 16, padding: "12px 14px", borderRadius: 14, border: catalogErr ? "2px solid #E0578F" : "1px solid rgba(58,46,77,0.2)", background: "#FFF8EE", color: HOME_INK, fontFamily: NUN, fontSize: 18, textAlign: "center", letterSpacing: "4px" }} />
            {catalogErr && <div style={{ color: "#C23E72", fontSize: 13, textAlign: "center", marginTop: 8 }}>Wrong password. Try again.</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setCatalogGate(null)} style={{ flex: 1, padding: "12px", borderRadius: 14, border: "1px solid rgba(58,46,77,0.2)", background: "transparent", color: HOME_SUB, fontFamily: NUN, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Cancel</button>
              <button onClick={submitCatalogPw} style={{ flex: 1, padding: "12px", borderRadius: 14, border: "none", background: "linear-gradient(160deg,#9B7BFF,#67E8F9)", color: "#12102a", fontFamily: NUN, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Enter</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const HELPER_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Calm",   sample: "Hi there! I'm your calm and friendly helper." },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Gentle", sample: "Hello! I'll be right here to help you make things." },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Peppy",  sample: "Hi hi hi! Let's make something super fun together!" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Silly",  sample: "Hiya! Wanna make something totally goofy? Let's go!" },
];

function HelperLabScreen({ activeKid, onHome, onDone }) {
  const [step, setStep] = useState("character");
  const [pending, setPending] = useState(null);
  const [voice, setVoice] = useState(HELPER_VOICES[0].id);
  const prevRef = useRef(null);
  const preview = (vid) => {
    const v = HELPER_VOICES.find((x) => x.id === vid) || HELPER_VOICES[0];
    fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: v.sample, voiceId: vid }) })
      .then((r) => r.json())
      .then((j) => { if (j && j.configured && j.audioUrl) playVoiceUrl(j.audioUrl); })
      .catch(() => {});
  };
  const finish = () => {
    const helper = { name: (pending && pending.name) || "Buddy", image: (pending && pending.image) || null, description: (pending && pending.description) || "", voice };
    // saveKidHelper logs + rethrows a failed DB save so it is visible; the local
    // copy is already written, so let the UI proceed and just catch the reject.
    Promise.resolve(saveKidHelper(activeKid, helper)).catch(() => {});
    onDone(activeKid ? { ...activeKid, helper } : null);
  };
  const PlayDot = () => (<svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true" style={{ marginRight: 4 }}><path d="M2 1 L9 5 L2 9 Z" fill="currentColor" /></svg>);
  return (
    <div style={styles.container}>
      <div style={{ ...styles.introTopBar, justifyContent: "flex-start" }}>
        <button onClick={onHome} style={styles.backButton}>Home</button>
      </div>
      <h1 style={{ ...styles.logo, marginTop: 8 }}>Helper Lab</h1>
      {step === "character" ? (
        <>
          <p style={styles.tagline}>Pick a buddy or make your own — they cheer you on!</p>
          <div style={{ width: "100%", maxWidth: 920 }}>
            <CharacterCreatorScreen
              onCharacterCreated={(c) => { setPending({ name: (c && c.name) || "Buddy", image: (c && c.image) || null, description: (c && c.description) || "" }); setStep("voice"); }}
            />
          </div>
        </>
      ) : (
        <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <p style={styles.tagline}>Now pick {(pending && pending.name) || "your buddy"}'s voice!</p>
          {pending && pending.image && (
            <img src={pending.image} alt="" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(155,126,221,0.5)" }} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>
            {HELPER_VOICES.map((v) => (
              <button key={v.id} onClick={() => { setVoice(v.id); preview(v.id); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 16px", borderRadius: 14, cursor: "pointer",
                border: voice === v.id ? "2px solid #9b7edd" : CARD_BORDER, background: voice === v.id ? "rgba(155,126,221,0.18)" : CARD_BG, color: "#fff", fontFamily: NUN, fontWeight: 800, fontSize: 16,
              }}>
                {v.label}
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, color: "#bfa6f5", fontWeight: 800 }}><PlayDot />hear</span>
              </button>
            ))}
          </div>
          <button onClick={finish} style={{ ...styles.primaryButton, maxWidth: 360 }}>That's my helper!</button>
          <button onClick={() => setStep("character")} style={styles.backButton}>Pick a different character</button>
        </div>
      )}
    </div>
  );
}

function TypingScreen({ onHome, level }) {
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
        src={"/typing.html?v=2" + (level != null ? "&level=" + level : "")}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

function ChessScreen({ onHome, onPlayFriend, start }) {
  useEffect(() => {
    function onMsg(e) { if (e && e.data && e.data.type === "chessPlayFriend") { if (onPlayFriend) onPlayFriend(); } }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onPlayFriend]);
  const pillBtn = {
    fontFamily: NUN, fontWeight: 800, fontSize: "14px", color: "#fff",
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px", padding: "8px 16px", cursor: "pointer",
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: "14px", left: "14px", zIndex: 2, ...pillBtn }}>← Home</button>
      <iframe
        title="Buildable Chess"
        src={"/buildable-chess.html?v=6" + (start ? ("&" + start) : "")}
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}

function CheckersScreen({ onHome, onPlayFriend, diff }) {
  useEffect(() => {
    function onMsg(e) { if (e && e.data && e.data.type === "checkersPlayFriend") { if (onPlayFriend) onPlayFriend(); } }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onPlayFriend]);
  const pillBtn = {
    fontFamily: NUN, fontWeight: 800, fontSize: "14px", color: "#fff",
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "999px", padding: "8px 16px", cursor: "pointer",
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0F0E17", zIndex: 50 }}>
      <button onClick={onHome} style={{ position: "absolute", top: "14px", left: "14px", zIndex: 2, ...pillBtn }}>← Home</button>
      <iframe
        title="Buildable Checkers"
        src={"/buildable-checkers.html?v=3" + (diff != null ? "&diff=" + diff : "")}
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
        <button onClick={onMyStuff} style={styles.myStuffButton}><StuffGlyph />My Stuff</button>
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
        <button onClick={onMyStuff} style={styles.myStuffButton}><StuffGlyph />My Stuff</button>
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
    const ak = getActiveKid();
    const kpId = ak && ak.id ? ak.id : null;
    // Only ever show the selected kid's own songs — no shared device fallback,
    // which would mix in other kids' songs.
    if (!kpId) { setSongs([]); return; }
    fetch("/api/list-songs?kidProfileId=" + encodeURIComponent(kpId))
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
        <button onClick={onMyStuff} style={styles.myStuffButton}><StuffGlyph />My Stuff</button>
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
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
