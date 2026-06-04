import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// BUILDABLE KIDS — MVP
// ============================================================
// Architecture: single-file React component. iPad-first experience.
// AI integration (Claude for quizzes, image gen for creatures) lands via
// Vercel serverless functions in /api/* (added in T19).
//
// All API calls go through buildableApi below. Today they fall back to
// procedural rendering / hardcoded quizzes if the server-side functions
// aren't wired up yet, so the app stays working through Sprint 3.
// ============================================================

// API client — single place where the React app talks to the backend.
// All methods return graceful fallbacks if the backend isn't reachable,
// so the app works offline and during deployment transitions.
const buildableApi = {
  // Generate a creature image from a kid's entity (color/body/feature/...).
  // Returns: { url: string } | null. null means fall back to procedural SVG.
  async generateCreatureImage(entity)     try {
      const res = await fetch("/api/generate-creature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url ? { url: data.url } : null;
    } catch (e) {
      return null;
    }
  },

  // Generate a quiz question for a given age + level + game type.
  // Returns: { type, question, choices, correctIndex, image?: emoji } | null
  async generateQuiz({ age, level, gameType, quizType }) {
    try {
      const res = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age, level, gameType, quizType }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // Save a game (hero/boss/world/goal combo) for the current anonymous device.
  // Returns: { gameId } | null
  async saveGame(payload) {
    try {
      const res = await fetch("/api/save-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, deviceId: getDeviceId() }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // List saved games for this device.
  async listMyGames() {
    try {
      const res = await fetch(`/api/list-games?deviceId=${encodeURIComponent(getDeviceId())}`);
      if (!res.ok) return [];
      return (await res.json()).games || [];
    } catch (e) {
      return [];
    }
  },

  // Load a single game by ID — used for remix flow (kid opens a shared URL).
  async loadGame(gameId) {
    try {
      const res = await fetch(`/api/load-game?id=${encodeURIComponent(gameId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  },
};

// Anonymous device ID for save state. Generated once per browser, stored
// in localStorage with a graceful fallback to in-memory if storage blocked.
// (This is the ONLY localStorage use in the app; everything else is in-memory.)
let __memoryDeviceId = null;
function getDeviceId() {
  if (__memoryDeviceId) return __memoryDeviceId;
  try {
    let id = window.localStorage.getItem("bk_device_id");
    if (!id) {
      id = "d_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem("bk_device_id", id);
    }
    __memoryDeviceId = id;
    return id;
  } catch (e) {
    // localStorage blocked (private mode, etc) — use in-memory ID for this session
    __memoryDeviceId = "d_session_" + Math.random().toString(36).slice(2);
    return __memoryDeviceId;
  }
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@700;900&display=swap');
.f-display { font-family: 'Fredoka', system-ui, sans-serif; font-weight: 700; letter-spacing: -0.015em; }
.f-body { font-family: 'Nunito', system-ui, sans-serif; font-weight: 700; }
@keyframes pop { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
@keyframes wiggle { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes float-y { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes bounce-in { 0% { transform: scale(0) rotate(-20deg); } 60% { transform: scale(1.2) rotate(8deg); } 100% { transform: scale(1) rotate(0); } }
@keyframes shake-x { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@keyframes confetti-fall { 0% { transform: translateY(-20px) rotate(0); opacity: 1; } 100% { transform: translateY(500px) rotate(900deg); opacity: 0; } }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(255,220,0,0.7); } 50% { box-shadow: 0 0 0 20px rgba(255,220,0,0); } }
@keyframes slide-up { 0% { transform: translateY(40px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes match-flash { 0%,100% { filter: brightness(1); transform: scale(1); } 50% { filter: brightness(1.5); transform: scale(1.15); } }
@keyframes boss-enter { 0% { transform: translateX(40px) scale(0.5); opacity: 0; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
.anim-pop { animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
.anim-wiggle { animation: wiggle 2.5s ease-in-out infinite; }
.anim-float { animation: float-y 2.8s ease-in-out infinite; }
.anim-bounce-in { animation: bounce-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1); }
.anim-shake { animation: shake-x 0.5s ease-in-out; }
.anim-pulse-glow { animation: pulse-glow 1.6s ease-in-out infinite; }
.anim-slide-up { animation: slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
.anim-match { animation: match-flash 0.35s ease-in-out; }
.anim-boss-enter { animation: boss-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.confetti-piece { position: absolute; width: 12px; height: 16px; border-radius: 2px; animation: confetti-fall 1.8s ease-in forwards; top: -20px; }
.card-3d { box-shadow: 0 8px 0 rgba(0,0,0,0.12), 0 12px 24px rgba(0,0,0,0.08); transition: transform 0.15s ease, box-shadow 0.15s ease; }
.card-3d:active { transform: translateY(4px); box-shadow: 0 4px 0 rgba(0,0,0,0.12), 0 6px 12px rgba(0,0,0,0.08); }
.btn-chunky { box-shadow: 0 6px 0 rgba(0,0,0,0.15); transition: all 0.1s ease; }
.btn-chunky:active { transform: translateY(4px); box-shadow: 0 2px 0 rgba(0,0,0,0.15); }
.no-tap { -webkit-tap-highlight-color: transparent; user-select: none; touch-action: manipulation; }
.draw-canvas { touch-action: none; cursor: crosshair; }
.game-canvas { touch-action: none; }
html, body { overscroll-behavior: contain; -webkit-text-size-adjust: 100%; }
@media (max-width: 500px) {
  .f-display.text-7xl { font-size: 3.5rem; }
  .f-display.text-6xl { font-size: 3rem; }
  .f-display.text-5xl { font-size: 2.25rem; }
}
`;

// ============================================================
// CATALOGS
// ============================================================
const GAME_TYPES = [
  { id: "runner",  emoji: "🏃",  name: "Runner",       desc: "Jump and duck through obstacles!",         color: "#FF8A3D" },
  { id: "flying",  emoji: "🚀",  name: "Flying",       desc: "Blast enemies while you fly!",             color: "#3DB8FF" },
  { id: "maze",    emoji: "🗺️",  name: "Maze",         desc: "Find keys, unlock doors, get treasure!",   color: "#2ECC71" },
  { id: "puzzle",  emoji: "✨",  name: "Match Magic",  desc: "Match 3 or more to make them POP!",        color: "#A855F7" },
];

const CHARACTERS = [
  { id: "robot",  emoji: "🤖", name: "Robot"   },
  { id: "fox",    emoji: "🦊", name: "Fox"     },
  { id: "astro",  emoji: "🧑‍🚀", name: "Explorer"},
  { id: "dino",   emoji: "🦖", name: "Dino"    },
  { id: "cat",    emoji: "🐱", name: "Kitten"  },
  { id: "frog",   emoji: "🐸", name: "Froggie" },
];

const WORLDS = [
  { id: "space",  emoji: "🌌", name: "Space",      sky: ["#1a0b3d","#3d0066","#0a0a1f"], ground: "#2a1a4a", tint: "#b794f4", candies: ["🪐","🌟","☄️","🌙","🚀"] },
  { id: "jungle", emoji: "🌴", name: "Jungle",     sky: ["#7fd86e","#4ab848","#2d8029"], ground: "#3d5a2b", tint: "#a8e6a3", candies: ["🍄","🌸","🍃","🌻","🥝"] },
  { id: "candy",  emoji: "🍭", name: "Candy",      sky: ["#ffb3d9","#ff85c1","#ff5fa8"], ground: "#d4568a", tint: "#ffd0ec", candies: ["🍭","🍬","🍪","🍩","🧁"] },
  { id: "ocean",  emoji: "🌊", name: "Underwater", sky: ["#4fc3f7","#1e88e5","#0d47a1"], ground: "#1e40af", tint: "#81d4fa", candies: ["🐠","🐚","🫧","🐙","🦀"] },
];

const GOALS = [
  { id: "collect",  emoji: "⭐", name: "Collect stars" },
  { id: "finish",   emoji: "🏁", name: "Reach the finish" },
  { id: "treasure", emoji: "💎", name: "Find the treasure" },
];

// Per-game-type goal configuration. Determines win-condition overlays,
// quotas, and in-game hints so picking a goal actually changes play.
// L1/L2 quotas tuned to feel achievable in the allotted time.
function goalConfig(goalId, gameType, level) {
  const G = {
    runner: {
      collect:  { quota: level === 1 ? 10 : 14, label: "⭐" },
      finish:   { distanceGoal: level === 1 ? 100 : 100, label: "🏁" }, // % of timer
      treasure: { spawnAtTimeLeft: level === 1 ? 8 : 10, label: "📦" },
    },
    flying: {
      collect:  { quota: level === 1 ? 10 : 14, label: "⭐" },
      finish:   { distanceGoal: 100, label: "🏁" },
      treasure: { spawnAtTimeLeft: level === 1 ? 8 : 12, label: "📦" },
    },
    maze:   {
      collect:  { quota: level === 1 ? 1 : 3, label: "💎" }, // gems to pick up
      finish:   { label: "🏁" },                              // default: reach goal
      treasure: { label: "💎" },                              // default: reach goal
    },
    puzzle: {
      collect:  { quota: level === 1 ? 100 : 180, label: "⭐" }, // score quota
      finish:   { label: "🏁" },
      treasure: { label: "💎" },
    },
  };
  return G[gameType]?.[goalId] || {};
}

// Human-readable banner text for the level-start overlay
function goalBanner(goalId, gameType, level) {
  const cfg = goalConfig(goalId, gameType, level);
  if (goalId === "collect" && cfg.quota) {
    if (gameType === "puzzle") return `Score ${cfg.quota} points!`;
    if (gameType === "maze")   return `Collect ${cfg.quota} 💎!`;
    return `Collect ${cfg.quota} ${cfg.label}!`;
  }
  if (goalId === "finish") return "Reach the finish! 🏁";
  if (goalId === "treasure") {
    if (gameType === "maze") return "Find the treasure! 💎";
    return "Find the treasure chest! 📦";
  }
  return "";
}

const WEAPONS = [
  { id: "bubble", emoji: "🫧", name: "Bubble Blaster", desc: "Big slow bubbles!",     rate: 360, speed: 7,  color: "#7dd3fc", size: 32, spread: 1 },
  { id: "star",   emoji: "⭐", name: "Star Shooter",   desc: "Fast zippy stars!",     rate: 260, speed: 10, color: "#FFD93D", size: 24, spread: 1 },
  { id: "heart",  emoji: "💖", name: "Heart Beam",     desc: "Three hearts at once!", rate: 480, speed: 7,  color: "#FF6B9D", size: 24, spread: 3 },
  { id: "music",  emoji: "🎵", name: "Music Notes",    desc: "Bouncy musical notes!", rate: 320, speed: 8,  color: "#A78BFA", size: 26, spread: 1 },
];

const UNLOCKS = [
  { id: "speed",   emoji: "⚡",  name: "Speed Boost",   desc: "You move faster!" },
  { id: "jump",    emoji: "🦘", name: "Double Jump",    desc: "Jump twice in mid-air!" },
  { id: "magnet",  emoji: "🧲", name: "Star Magnet",    desc: "Stars fly to you!" },
  { id: "shield",  emoji: "🛡️", name: "Power Shield",   desc: "Absorb one hit!" },
  { id: "rainbow", emoji: "🌈", name: "Rainbow Trail",  desc: "Double your points!" },
  { id: "slowmo",  emoji: "⏰", name: "Slow Motion",    desc: "Obstacles move slower!" },
  { id: "triple",  emoji: "🔱", name: "Triple Shot",    desc: "Fire three blasts at once!" },
  { id: "bombs",   emoji: "💣", name: "Boom Match",     desc: "Matches clear cells around them!" },
];

const UNLOCK_POOLS = {
  runner: ["speed","jump","magnet","shield","rainbow","slowmo"],
  flying: ["speed","magnet","shield","rainbow","slowmo","triple"],
  maze:   ["speed","magnet","rainbow","shield"],
  puzzle: ["speed","magnet","rainbow","bombs"],
};

function unlockDesc(unlockId, gameType) {
  const byGame = {
    puzzle: { speed: "+2 extra moves!", magnet: "+1 bonus point per match!", rainbow: "Double all your points!", bombs: "Matches clear cells around them!" },
    maze:   { speed: "Move 2 squares at once!", magnet: "Gems and keys fly to you!", rainbow: "Double all your points!", shield: "One wall bump is free!" },
    flying: { speed: "You and shots move faster!", magnet: "Pickups fly toward you!", shield: "Absorb one hit!", rainbow: "Double your points!", slowmo: "Enemies move slower!", triple: "Fire 3 shots at once!" },
    runner: { speed: "You move 22% faster!", jump: "Jump twice in mid-air!", magnet: "Stars fly to you!", shield: "Absorb one hit!", rainbow: "Double your star points!", slowmo: "Obstacles move slower!" },
  };
  return byGame[gameType]?.[unlockId] ?? UNLOCKS.find(u => u.id === unlockId)?.desc ?? "";
}

// Chip-based describe (prompt-like but safe). Later: swap COMPOSE_PREVIEW
// for an API call to a real image-gen service on Buildable Pro.
const BODY_CHIPS = [
  { id: "dragon",  emoji: "🐉", label: "dragon"  },
  { id: "octopus", emoji: "🐙", label: "octopus" },
  { id: "ghost",   emoji: "👻", label: "ghost"   },
  { id: "alien",   emoji: "👾", label: "alien"   },
  { id: "robot",   emoji: "🤖", label: "robot"   },
  { id: "monster", emoji: "👹", label: "monster" },
  { id: "unicorn", emoji: "🦄", label: "unicorn" },
  { id: "bear",    emoji: "🐻", label: "bear"    },
  { id: "snake",   emoji: "🐍", label: "snake"   },
];
const COLOR_CHIPS = [
  { id: "red",    label: "red",    tint: "#EF4444" },
  { id: "orange", label: "orange", tint: "#F97316" },
  { id: "yellow", label: "yellow", tint: "#FACC15" },
  { id: "green",  label: "green",  tint: "#22C55E" },
  { id: "blue",   label: "blue",   tint: "#3B82F6" },
  { id: "purple", label: "purple", tint: "#A855F7" },
  { id: "pink",   label: "pink",   tint: "#EC4899" },
  { id: "rainbow",label: "rainbow",tint: "#FFD93D" },
];
const FEATURE_CHIPS = [
  { id: "fire",   emoji: "🔥", label: "fiery breath"    },
  { id: "crown",  emoji: "👑", label: "a crown"         },
  { id: "ice",    emoji: "❄️", label: "icy powers"      },
  { id: "stars",  emoji: "✨", label: "sparkly magic"   },
  { id: "zap",    emoji: "⚡", label: "lightning"       },
  { id: "heart",  emoji: "💖", label: "a big heart"     },
];
const POWER_CHIPS = [  // boss-only
  { id: "tough", emoji: "💪", label: "super tough",   desc: "Needs extra hits!" },
  { id: "fast",  emoji: "💨", label: "super fast",    desc: "Zooms around!" },
  { id: "angry", emoji: "😡", label: "super angry",   desc: "Attacks harder!" },
];

// ============================================================
// SAFE-WORD ALLOWLIST (Option A prompt builder)
// ============================================================
// Kids type words into prompt blanks. Each typed word is lowercased,
// trimmed, and looked up here. If found, we resolve to the matching
// chip id (which drives the visual renderer + game stats). If not,
// the UI shows a gentle "try a different word" hint and suggestions.
//
// Only words in this dictionary are ever accepted. There is no
// blocklist — anything not allowlisted is simply "unknown".
// ============================================================
const SAFE_WORDS = {
  // COLORS → map to COLOR_CHIPS ids
  color: {
    red:     ["red", "crimson", "ruby", "cherry", "scarlet", "maroon", "burgundy", "brick", "blood", "tomato", "rose"],
    orange:  ["orange", "peach", "tangerine", "amber", "pumpkin", "apricot", "coral", "rust", "copper"],
    yellow:  ["yellow", "gold", "golden", "lemon", "sunny", "banana", "butter", "mustard", "honey", "dandelion", "cream", "canary"],
    green:   ["green", "lime", "emerald", "mint", "forest", "olive", "jade", "moss", "leaf", "leafy", "grass", "grassy", "pea", "apple", "seafoam"],
    blue:    ["blue", "cobalt", "navy", "sky", "azure", "teal", "turquoise", "cyan", "indigo", "sapphire", "ocean", "denim", "royal", "arctic", "ice-blue"],
    purple:  ["purple", "violet", "lavender", "plum", "magenta", "grape", "eggplant", "orchid", "lilac", "mauve", "amethyst"],
    pink:    ["pink", "fuchsia", "bubblegum", "salmon", "blush", "hotpink", "pinky"],
    rainbow: ["rainbow", "rainbowy", "multicolor", "multicolored", "colorful", "prismatic", "tiedye", "shimmering", "shimmery", "iridescent", "holographic", "holo", "sparkle", "sparkles", "sparkly", "glittery", "glitter", "shiny", "metallic", "neon", "fluorescent", "glowing"],
  },

  // BODY → map to BODY_CHIPS ids.
  // Many common creatures map to the closest existing silhouette until turn 11b adds real shapes.
  body: {
    // Dragon family — serpentine bodies + reptiles with long snouts
    dragon:  [
      "dragon", "wyvern", "drake", "dragoness", "lizard", "iguana", "chameleon", "gecko", "salamander", "komodo",
      // Crocodilians share the dragon silhouette's long snout + tail
      "crocodile", "croc", "alligator", "gator", "caiman",
      // Mythological dragon-adjacents
      "hydra", "basilisk", "serpentking"
    ],

    // NEW: Dinosaur family — upright stocky tail + big head
    dinosaur: [
      "dinosaur", "dino", "trex", "tyrannosaurus", "raptor", "velociraptor", "stegosaurus", "stego",
      "triceratops", "brontosaurus", "brachiosaurus", "diplodocus", "pterodactyl",
      "allosaurus", "spinosaurus", "ankylosaurus"
    ],

    // Octopus family — many-limbed or soft-bodied
    octopus: [
      "octopus", "squid", "kraken", "tentacle", "tentacles", "jellyfish", "jelly", "cuttlefish", "nautilus",
      // Other squishy sea things
      "slug", "snail", "amoeba"
    ],

    // NEW: Fish family — aquatic with fins
    fish: [
      "fish", "fishy", "goldfish", "shark", "whale", "dolphin", "tuna", "salmon",
      "trout", "minnow", "guppy", "koi", "betta", "clownfish", "pufferfish",
      "seahorse", "stingray", "manta",
      // Sea mammals with similar silhouette
      "orca", "killerwhale", "narwhal", "manatee", "dugong", "seal", "walrus",
      // Shellfish/crustaceans — close enough
      "crab", "lobster", "shrimp", "prawn", "crayfish",
      "starfish", "seastar"
    ],

    // Ghost family — ethereal / floaty
    ghost:   [
      "ghost", "phantom", "spirit", "specter", "spooky", "ghosty", "ghostie", "wraith", "boo", "ghoul",
      "zombie", "mummy", "skeleton", "skelly", "vampire", "werewolf", "demon"
    ],

    // Alien family — big-headed, otherworldly
    alien:   [
      "alien", "martian", "extraterrestrial", "spaceman", "spacewoman", "ufo",
      "xenomorph", "starchild", "spacealien"
    ],

    // Robot family — mechanical / angular
    robot:   [
      "robot", "bot", "android", "mech", "cyborg", "droid", "machine", "autobot", "decepticon",
      "mecha", "automaton", "roomba"
    ],

    // Monster family — the generic blob; catches lots of creature words
    monster: [
      "monster", "beast", "creature", "ogre", "troll", "goblin", "imp", "gremlin", "yeti", "sasquatch", "bigfoot",
      "blob", "slime", "thing", "critter",
      // Mythical creatures that don't have a better silhouette yet
      "mermaid", "merman", "minotaur", "cyclops", "chimera", "griffin", "gryphon", "manticore",
      "fairy", "pixie", "sprite", "elf", "dwarf", "gnome", "leprechaun",
      // Amphibians — round + lumpy = monster silhouette
      "frog", "froggy", "toad", "tadpole", "newt",
      // Reptiles with round bodies
      "turtle", "tortoise", "terrapin",
      // Small round mammals
      "hedgehog", "porcupine", "armadillo", "platypus", "opossum", "possum",
      "raccoon", "badger", "weasel", "ferret", "otter", "beaver", "mole",
      "skunk",
      // Insects / bugs
      "bug", "insect", "beetle", "ladybug", "caterpillar", "ant", "spider", "scorpion", "tarantula",
      "bumblebee", "bee", "wasp", "hornet", "moth", "butterfly", "dragonfly",
      "centipede", "millipede", "firefly", "cricket", "grasshopper", "mantis", "praying",
      // Flies and the simple "fly"/"flies" noun — was missing
      "fly", "flies", "housefly", "horsefly", "mayfly", "gnat", "mosquito", "mosquitos", "mosquitoes", "midge", "flea", "fleas", "tick", "ticks", "mite", "mites",
      "earwig", "silverfish", "termite", "termites", "aphid", "weevil", "roach", "cockroach", "cockroaches",
      // Large mammals that don't fit other silhouettes well
      "elephant", "rhino", "rhinoceros", "hippo", "hippopotamus",
      "camel", "llama", "alpaca", "bison", "buffalo", "yak", "ox",
      "pig", "piggy", "piglet", "hog", "boar",
      "sheep", "lamb", "goat", "ram",
      "cow", "calf", "bull",
      // Primates
      "monkey", "ape", "gorilla", "chimp", "chimpanzee", "orangutan", "baboon", "lemur",
      // Marsupials/unique
      "kangaroo", "wallaby", "joey", "sloth", "anteater", "meerkat", "mongoose",
      // Flying mammals
      "bat",
      // Humanoid role-play characters — accept as "creature"
      "wizard", "witch", "warlock", "sorcerer", "mage",
      "ninja", "samurai", "pirate", "viking",
      "knight", "warrior", "guardian", "hero", "heroine", "champion",
      "superhero", "supergirl", "superboy",
      "villain", "evildoer",
      "angel", "devil",
      "genie", "djinn"
    ],

    // Unicorn family — horse-shaped / four-legged with mane
    unicorn: [
      "unicorn", "pony", "horse", "pegasus", "alicorn", "stallion", "mare", "foal",
      "donkey", "mule", "zebra",
      // Other four-legged hoofed things that share the silhouette
      "deer", "reindeer", "moose", "elk", "gazelle", "antelope", "giraffe", "ibex", "bighorn"
    ],

    // Bear family — round-bodied bears only
    bear:    [
      "bear", "cub", "teddy", "grizzly", "polarbear", "panda", "koala"
    ],

    // NEW: Dog family — quadruped, long snout, floppy ears
    dog: [
      "dog", "puppy", "doggy", "doggie", "pup", "hound", "poodle", "beagle", "bulldog",
      "lab", "labrador", "retriever", "terrier", "shepherd", "dalmatian", "husky",
      "corgi", "chihuahua", "pomeranian", "samoyed", "shiba", "woofy", "pupper", "doggo",
      "puggle", "pug", "dachshund", "wiener",
      // Wild canines share the silhouette
      "fox", "wolf", "coyote", "jackal", "dingo", "hyena"
    ],

    // NEW: Cat family — quadruped, pointy ears, long tail
    cat: [
      "cat", "kitty", "kitten", "kittie", "tabby", "calico", "persian", "siamese",
      "meow", "kit", "maine", "coon",
      // Big cats share the silhouette (same body plan, scaled)
      "lion", "tiger", "leopard", "cheetah", "panther", "jaguar", "lynx", "bobcat", "cougar", "puma",
      "ocelot", "serval", "caracal"
    ],

    // NEW: Bunny family — round, upright ears, big back feet
    bunny: [
      "bunny", "rabbit", "bun", "hare", "jackrabbit", "cottontail", "bunbun",
      "hamster", "guinea", "guineapig", "gerbil", "rat", "mouse", "mice", "chinchilla",
      "squirrel", "chipmunk", "vole", "shrew"
    ],

    // NEW: Bird family — round body, wings, beak
    bird: [
      "bird", "birdie", "birdy", "chick", "chicken", "hen", "rooster", "cock",
      "duck", "ducky", "duckling", "goose", "gosling", "swan",
      "owl", "owlet", "hawk", "eagle", "falcon", "vulture", "kite", "buzzard",
      "parrot", "cockatoo", "macaw", "budgie", "parakeet", "lovebird",
      "penguin", "flamingo", "peacock", "peahen", "turkey",
      "crow", "raven", "robin", "sparrow", "bluebird", "cardinal", "bluejay", "jay",
      "hummingbird", "toucan", "pelican", "stork", "heron", "crane",
      "kiwi-bird", "puffin", "seagull", "gull", "dove", "pigeon",
      "phoenix", "thunderbird"
    ],

    // Snake family — long and wriggly
    snake:   [
      "snake", "serpent", "cobra", "python", "viper", "anaconda", "boa", "rattlesnake", "adder", "mamba",
      "worm", "earthworm", "inchworm",
      "eel", "eels", "sea-snake"
    ],
  },

  // FEATURE → map to FEATURE_CHIPS ids.
  // A kid's word lands on one of these if it maps; otherwise it's an
  // ACCEPTED_EXTRA (see below) — still green, just no visual.
  feature: {
    fire:  ["fire", "fiery", "flame", "flames", "flaming", "burning", "hot", "fireball", "lava", "lavalike", "volcano", "volcanic", "molten", "blazing", "sizzling", "smoking", "smoke", "ember", "embers"],
    crown: ["crown", "crowned", "royal", "royalty", "king", "queen", "prince", "princess", "tiara", "diadem", "noble", "fancy"],
    ice:   ["ice", "icy", "frozen", "cold", "frost", "frosty", "snow", "snowy", "snowflake", "snowflakes", "freezing", "chilly", "glacial", "winter", "arctic"],
    stars: ["star", "stars", "starry", "sparkle", "sparkles", "sparkly", "magic", "magical", "shiny", "shining", "glowing", "glow", "glittering", "glitter", "glittery", "shimmer", "shimmery", "twinkle", "twinkling", "cosmic", "celestial", "stardust"],
    zap:   ["lightning", "zap", "zapping", "zappy", "electric", "electricity", "thunder", "bolt", "bolts", "shock", "shocking", "static", "charged", "voltage", "energy"],
    heart: ["heart", "hearts", "love", "lovey", "loving", "kind", "friendly", "sweet", "sweetie", "cute", "cutie", "adorable", "precious", "nice", "caring", "gentle", "darling"],
  },

  // POWER (boss-only) → POWER_CHIPS ids
  power: {
    tough: ["tough", "strong", "mighty", "solid", "beefy", "buff", "powerful", "sturdy", "muscular", "hulking", "stout", "unstoppable", "invincible"],
    fast:  ["fast", "quick", "speedy", "zoomy", "swift", "zippy", "racing", "rapid", "turbo", "sonic", "blazing-fast", "lightning-fast"],
    angry: ["angry", "mad", "grumpy", "cross", "fierce", "mean", "grouchy", "furious", "raging", "irritated", "cranky", "irate", "wrathful", "biting", "bitey", "snappy", "snapping", "snarling", "growling", "roaring"],
  },

  // STYLE (cosmetic, optional) → modifies rendering only, no stats impact
  style: {
    tiny:    ["tiny", "teeny", "little", "small", "mini", "petite", "itty", "bitty", "miniature", "pocket-sized", "pocketsized"],
    big:     ["big", "giant", "huge", "massive", "enormous", "chonky", "large", "gigantic", "colossal", "mega", "titanic", "jumbo", "oversized"],
    fluffy:  ["fluffy", "fuzzy", "soft", "puffy", "plushy", "velvety", "downy", "feathery", "cloudlike", "cloudy", "cushiony", "cozy"],
    spiky:   ["spiky", "pointy", "sharp", "prickly", "thorny", "jagged", "spiny", "bristly", "pokey"],
    bumpy:   ["bumpy", "lumpy", "spotty", "spotted", "dotty", "speckled", "pockmarked", "knobby", "nubbly"],
    stripey: ["stripey", "striped", "stripes", "striping", "zebra-striped", "banded", "barred"],
    slimy:   ["slimy", "gooey", "sticky", "wet", "drippy", "oozy", "goopy", "slippery", "squishy"],
    silly:   ["silly", "goofy", "funny", "wacky", "wiggly", "derpy", "quirky", "kooky", "zany", "silly", "whimsical", "playful"],
  },
};

// ---- ACCEPTED EXTRAS ----
// Words we recognize as legitimate, kid-safe additions to a prompt but that
// don't map to any specific visual or stat. They show as green ✓ pills so
// the kid feels "heard" — the AI won't draw them specifically, but accepts
// them as part of the description. Covers clothes, accessories, places,
// feelings, sounds, etc.
const ACCEPTED_EXTRAS = new Set([
  // Wearable/accessory words (11b will add visual support for some)
  "cape", "capes", "hat", "hats", "helmet", "helmets", "mask", "masks",
  "scarf", "scarves", "bandana", "bandanna", "hood", "hoods",
  "glasses", "sunglasses", "goggles", "monocle",
  "bowtie", "necktie", "tie", "ties",
  "suit", "dress", "skirt", "pants", "shorts", "shirt", "tshirt", "tunic", "robe",
  "backpack", "purse", "bag",
  "boots", "shoes", "sneakers", "slippers", "sandals",
  "gloves", "mittens",
  "jewelry", "necklace", "bracelet", "ring", "earring", "earrings",
  "headband", "hairbow", "bow",
  "belt",
  "watch", "clock",
  "umbrella", "parasol",
  "wand", "staff",
  "wings", "wing", "feather", "feathers",
  "tail", "tails", "horn", "horns",
  "claws", "paws", "paw", "hooves", "hoof",
  "fangs", "fang", "teeth", "tooth",
  "whiskers", "whisker",
  "ears", "ear", "nose", "eye", "eyes",
  "beak", "snout",
  "fins", "fin", "flipper", "flippers",
  "antennae", "antenna",
  "sword", "shield", "bow", "arrow", "dagger",
  "gun", "blaster", "ray", "lasergun", "laser", "lasers",  // toy-gun context
  "hammer", "axe", "mallet",
  "pipe", "flute", "drum", "trumpet", "guitar",

  // Places and settings (not rendered, but accepted for context)
  "forest", "jungle", "woods", "meadow", "field", "garden",
  "desert", "tundra", "arctic", "snow", "snowy",
  "mountain", "mountains", "hill", "hills", "valley", "canyon",
  "ocean", "sea", "lake", "river", "pond", "waterfall", "beach", "shore",
  "sky", "cloud", "clouds",
  "space", "galaxy", "planet", "moon", "sun", "stars", "star",
  "cave", "cavern", "dungeon",
  "castle", "tower", "palace",
  "city", "town", "village", "farm", "barn",
  "volcano", "lava",
  "rainbow",
  "underwater",
  "home", "house", "room",
  "treehouse", "treetop",

  // Emotional / social words
  "happy", "sad", "sleepy", "tired", "brave", "shy", "bold", "clever", "smart",
  "wise", "old", "young", "baby", "grown", "grownup",
  "best", "favorite", "cool", "awesome", "amazing", "great", "wonderful",
  "friend", "friends", "buddy", "pal", "pals", "family", "mom", "dad",
  "brother", "sister",

  // Descriptor adjacents
  "round", "tall", "short", "long", "wide", "thin", "skinny",
  "soft", "hard", "smooth", "rough",
  "quiet", "loud",
  "warm", "cool",

  // Nature / food (accepted, don't render)
  "tree", "trees", "flower", "flowers", "rose", "daisy", "tulip", "sunflower", "poppy", "lily",
  "leaf", "leaves", "grass", "rock", "rocks", "stone", "pebble",
  "bush", "shrub", "cactus", "mushroom", "toadstool", "seaweed", "coral", "reef",
  "vine", "ivy", "fern", "palm", "pine", "oak", "maple", "willow", "bamboo",
  "berry", "berries",
  // Sweets / snacks
  "cupcake", "cake", "cookie", "cookies", "pizza", "apple", "banana",
  "lollipop", "candy", "candies", "chocolate", "donut", "doughnut",
  "brownie", "muffin", "pancake", "pancakes", "waffle", "waffles",
  "icecream", "icepop", "popsicle", "sundae", "smoothie", "milkshake",
  "pie", "tart", "cheesecake", "pudding", "jelly", "jam", "honey",
  // Everyday food
  "bread", "toast", "pasta", "noodle", "noodles", "spaghetti", "rice", "soup",
  "sandwich", "burger", "hamburger", "cheeseburger", "hotdog",
  "fries", "chips", "popcorn", "pretzel", "pretzels", "crackers",
  "taco", "burrito", "sushi", "dumpling", "dumplings", "rolls",
  "egg", "eggs", "bacon", "cheese", "butter",
  // Vegetables and fruits
  "broccoli", "carrot", "carrots", "corn", "potato", "potatoes", "tomato", "tomatoes",
  "onion", "lettuce", "spinach", "pepper", "peppers", "cucumber", "pickle", "pickles",
  "watermelon", "strawberry", "strawberries", "blueberry", "blueberries",
  "raspberry", "raspberries", "blackberry", "blackberries",
  "kiwi", "mango", "pineapple", "coconut", "avocado", "lime",
  "pear", "plum", "peach", "apricot", "fig",
  "pumpkin", "squash", "zucchini", "radish",
  "mushroom", "garlic", "ginger",
  // Drinks
  "milk", "juice", "water", "tea", "coffee", "lemonade", "soda", "cocoa", "hotchocolate",

  // Vehicles (accepted but not rendered)
  "car", "cars", "truck", "trucks", "van", "jeep",
  "train", "trains", "tractor", "bus",
  "plane", "airplane", "jet", "helicopter", "chopper",
  "boat", "boats", "ship", "ships", "submarine", "sub", "canoe", "kayak", "yacht", "raft",
  "rocket", "spaceship", "spacecraft", "spaceshuttle", "shuttle", "saucer",
  "bicycle", "bike", "tricycle", "scooter", "skateboard", "rollerskates", "skates",
  "wagon", "cart", "carriage",

  // Objects kids mention
  "ball", "balls", "book", "books", "phone", "computer", "laptop", "tablet", "screen",
  "tv", "television", "radio",
  "game", "games", "toy", "toys", "blocks", "puzzle",
  "gear", "cog", "wire", "wires", "battery", "batteries", "button", "buttons", "screw", "screws",
  "bolt", "nut",
  "box", "boxes", "chest", "present", "gift", "package",
  "key", "keys", "lock",
  "ladder", "stairs", "door", "doors", "window", "windows",
  "bucket", "basket", "jar", "bottle", "cup", "mug", "bowl", "plate",
  "spoon", "fork", "knife", "chopsticks",
  "telescope", "microscope", "binoculars", "camera",
  "map", "scroll", "letter", "note",
  "paintbrush", "paint", "crayon", "crayons", "pencil", "pencils", "marker", "markers",
  "coin", "coins", "treasure",

  // Fantasy / adventure extras
  "magic-wand", "spellbook", "potion", "potions", "elixir",
  "armor", "breastplate", "gauntlet", "gauntlets",
  "lightsaber", "plasma",
  "bandage", "bandages",
  "bone", "bones", "skull",
  "web", "cobweb",

  // Weather and nature forces
  "rain", "raindrop", "raindrops", "storm", "stormy",
  "wind", "windy", "breeze", "breezy", "gust",
  "sunshine", "sunny", "shadow", "shadows", "fog", "foggy", "mist", "misty",
  "hurricane", "tornado", "twister", "cyclone",
  "earthquake", "avalanche",
  "waves", "wave", "ripple", "ripples",
  "dew", "drops", "drip",

  // Body parts (accepted, don't render)
  "leg", "legs", "arm", "arms", "hand", "hands", "finger", "fingers",
  "foot", "feet", "toe", "toes",
  "head", "neck", "body", "chest", "belly", "tummy", "back", "butt",
  "hair", "fur",

  // Emotional / social words
  "happy", "sad", "sleepy", "tired", "brave", "shy", "bold", "clever", "smart",
  "wise", "old", "young", "baby", "grown", "grownup",
  "best", "favorite", "cool", "awesome", "amazing", "great", "wonderful", "epic", "legendary",
  "friend", "friends", "buddy", "pal", "pals", "family", "mom", "dad",
  "brother", "sister", "twin", "twins",
  "excited", "proud", "curious", "confused", "worried", "scared", "peaceful", "calm",
  "lonely", "cheerful", "jolly", "merry", "giggly",

  // Descriptor adjacents
  "round", "tall", "short", "long", "wide", "thin", "skinny",
  "soft", "hard", "smooth", "rough", "flat", "curvy",
  "quiet", "loud",
  "warm", "cool",
  "bright", "dark", "dim", "light",
  "new", "fresh", "ancient", "old",

  // Actions kids tack onto descriptions
  "flying", "running", "jumping", "hopping", "skipping", "dancing", "singing",
  "sleeping", "smiling", "laughing", "winking", "blinking",
  "walking", "swimming", "diving", "climbing", "riding", "reading", "eating",
  "drinking", "playing", "fighting", "hugging", "waving", "thinking",
  "dreaming", "building", "creating", "making",
  "sitting", "standing", "lying", "kneeling",
  "wearing", "holding", "carrying", "using", "breathing",
  "spinning", "rolling", "bouncing", "gliding", "zooming",
  "hunting", "chasing", "escaping", "exploring", "discovering",

  // More feeling/state words
  "hungry", "thirsty", "thirsty", "full", "cozy", "comfy",
  "busy", "lazy", "relaxed", "focused", "determined",
  "lucky", "unlucky", "clumsy", "graceful",
  "gentle", "tough", "soft-hearted", "fearless",

  // Sounds
  "roar", "roaring", "growl", "growling", "bark", "barking", "meow", "meowing",
  "tweet", "chirp", "chirping", "squeak", "squeaking", "woof",
  "boom", "bang", "pop", "zoom", "whoosh",
]);

// ---- STOP WORDS ----
// Words filtered out completely — they don't show in the pill feedback at all.
// Covers articles, prepositions, copulas, and filler.
const STOP_WORDS = new Set([
  "a", "an", "the",
  "and", "or", "but",
  "with", "without", "plus", "also",
  "that", "this", "those", "these", "which", "who",
  "is", "are", "was", "were", "be", "been", "being",
  "has", "have", "had",
  "can", "could", "should", "would", "will", "might", "may",
  "do", "does", "did",
  "not", "no", "n",  // keep simple
  "of", "for", "to", "in", "on", "at", "by", "from",
  "my", "your", "his", "her", "its", "their", "our",
  "me", "you", "him", "he", "she", "we", "us", "they", "them",
  "i", "am",
  "very", "really", "so", "quite", "kind", "sort",
  "just", "like", "as",
  "because", "if", "when", "where", "how", "why",
  "some", "any", "every", "all", "many", "much",
  "it", "its",
  "one", "two", "three", "four", "five",
  "here", "there",
]);

// ============================================================
// BLOCKLIST + INAPPROPRIATE-CONTENT DETECTION
// ============================================================
// This list is INTENTIONALLY NOT COMPREHENSIVE. Blocklists fail open.
// Kids will find ways around it. Treat this as a first line of defense,
// not a complete solution. Expand over time based on real usage.
//
// Covers:
//   - profanity (common English)
//   - bathroom words kids type constantly
//   - common slurs (derogatory terms)
//   - sexual terms
//   - violence / self-harm terms
//   - drug / alcohol terms
//   - a small set of common PII patterns (phone number shapes)
//
// Used by:
//   - welcome screen name input (reject as name)
//   - describe screen prompt (reject, ask kid to try different words)
//
// When a word hits the blocklist, the UI:
//   1. shows a gentle "let's try different words" message
//   2. does NOT render the word back to the kid (no "your word 'X' is not allowed")
//      — doing so would amplify the bad word on screen.
//   3. continues to render other (clean) words normally.
const BLOCKED_WORDS = new Set([
  // Bathroom — the most common kid-will-type category
  "poop","poo","poopy","poops","pooping","pooped","pooper",
  "pee","peed","peeing","peepee","pees","peeper",
  "fart","farts","farting","farted","farter","farty",
  "butt","butts","buttface","buttfaced","butthead","buttmunch","butthole","buttholes",
  "crap","crappy","crapper","craps","crapping",
  "fanny","tushy","booty","booties","dookie","doody","turd","turds",
  "wiener","weiner","wienie","weenie",
  // Profanity and common variants
  "damn","dammit","damned","damnit",
  "hell","hells","hellish",
  "ass","asses","asshat","asshole","assholes","asshead","jackass",
  "bitch","bitches","bitchy","bitching","biatch",
  "bastard","bastards",
  "shit","shits","shitty","shitted","shitting","bullshit","horseshit",
  "fuck","fucks","fucked","fucking","fucker","fuckers","motherfucker",
  "piss","pissed","pisser","pissing",
  "dick","dicks","dickhead","dickface",
  "cock","cocks","cocky","cocksucker",
  "prick","pricks",
  "douche","douchebag","douchey",
  "fag","fags","faggot","faggy",
  "slut","sluts","slutty","whore","whores","hoe","hoes","thot","thots",
  "retard","retarded","retards","retardo",
  // Slurs (general — not naming ethnic/racial ones explicitly)
  "gay","homo","lesbo","dyke","tranny",
  "nazi","hitler","kkk",
  // Sexual / body-inappropriate
  "sex","sexy","sexual","sexo","porn","porno","pornhub",
  "boob","boobs","boobies","booby","breasts","breast","tits","titty","titties",
  "nude","nudes","naked","stripper",
  "vagina","penis","testicle","testicles","balls","scrotum","nutsack",
  "horny","sexy","kinky","condom",
  // Violence / self-harm
  "kill","killed","killing","killer","murder","murdered","murdering",
  "suicide","suicidal",
  "rape","raped","raping","rapist",
  "shoot","shooting","shooter","shootout",
  "stab","stabbed","stabbing",
  "bomb","bombing","bomber","terrorist","terrorism",
  // Drugs / alcohol
  "drug","drugs","cocaine","heroin","meth","weed","marijuana","crack",
  "cigarette","cigarettes","smoking","vape","vaping",
  "beer","beers","drunk","drinking","wine","whiskey","whisky","vodka","liquor",
  "high","stoned","blazed",
  // A small set of common insults kids use to hurt each other
  "stupid","dumb","idiot","idiotic","moron","loser","losers","ugly",
  "hate","hates","hateful","hater",
  // Generic "bad thing" common obfuscations
  "wtf","wth","stfu","lmao","lmfao","rofl","omfg",
  // Explicit obfuscation variants that the normalizer won't catch on its own
  // (e.g. st00pid normalizes to "stoopid" then collapses to "stopid" — not "stupid").
  // List the collapsed / alternate-vowel forms we expect kids to try.
  "stoopid","stpid","stoop","idjit",
  "dummy","dumby","dumbass","dumass",
  "craap","crp","shiit","shyt","sht","fck","fuk","fukk","fuck","fuq",
  "biotch","btch","bch",
  "azz","a55","azzhole",
  "sux","sucks","suckz",
  "noob","newb","scrub",
  "jerk","jerks","loser",
  "kys",
  "boobz","titz","titzy",
]);

// Normalize a typed word for blocklist comparison.
// Reverses common leet-speak, strips punctuation inside words, and collapses
// tripled+ letters. Catches "p00p", "p-o-o-p", "pooooop", "p.o.o.p", "sh1t".
function normalizeForBlockCheck(raw) {
  if (!raw) return { expanded: "", collapsed: "", collapsedAfterLeet: "" };
  let s = raw.toLowerCase();
  // Strip punctuation/underscores/dashes inside words (p-o-o-p -> poop)
  s = s.replace(/[-_.,!?'"\s]/g, "");
  // Reverse common leet substitutions
  const leet = { "0":"o", "1":"i", "3":"e", "4":"a", "5":"s", "7":"t", "@":"a", "$":"s", "!":"i" };
  s = s.replace(/[0134578@$!]/g, c => leet[c] || c);
  // Collapse 3+ repeated characters to 2 (pooooop -> poop, but keep double letters)
  const expanded = s.replace(/(.)\1{2,}/g, "$1$1");
  // Also a fully-collapsed form for words where doubles don't exist normally
  // (st00pid -> stoopid -> stopid; catches doubled-letter obfuscation)
  const collapsed = expanded.replace(/(.)\1+/g, "$1");
  return { expanded, collapsed };
}

// Check if a single word is blocklisted. Checks both normalized forms.
function isBlockedWord(word) {
  if (!word || typeof word !== "string") return false;
  const { expanded, collapsed } = normalizeForBlockCheck(word);
  if (BLOCKED_WORDS.has(expanded)) return true;
  if (BLOCKED_WORDS.has(collapsed)) return true;
  // Also check if any blocklisted word's collapsed form matches this word's collapsed form
  // (catches st00pid -> stoopid -> stopid vs stupid -> stupid -> stupid). Compare collapsed-to-collapsed.
  for (const bw of BLOCKED_WORDS) {
    if (bw.length < 4) continue;
    const bwCollapsed = bw.replace(/(.)\1+/g, "$1");
    if (bwCollapsed === collapsed) return true;
  }
  // Also check if any blocklisted word is fully contained in the normalized form
  // (catches "superpoopyman" -> contains "poop"). Only when the word is long.
  if (expanded.length >= 6) {
    for (const bw of BLOCKED_WORDS) {
      if (bw.length >= 4 && expanded.includes(bw)) return true;
    }
  }
  return false;
}

// Check if text (possibly a full sentence) contains any blocklisted word.
// Returns true on first hit. Does not tell the caller WHICH word hit —
// intentional, so we don't echo bad content back.
function containsInappropriate(text) {
  if (!text) return false;
  const words = text.toLowerCase().split(/[^a-z0-9@$!]+/).filter(w => w.length > 0);
  for (const w of words) {
    if (isBlockedWord(w)) return true;
  }
  return false;
}


// Lookup: word (string) -> { bucket, id } | null
// Precomputed flat index for fast per-keystroke validation.
const WORD_INDEX = (() => {
  const idx = {};
  for (const bucket of Object.keys(SAFE_WORDS)) {
    for (const id of Object.keys(SAFE_WORDS[bucket])) {
      for (const word of SAFE_WORDS[bucket][id]) {
        idx[word.toLowerCase()] = { bucket, id };
      }
    }
  }
  return idx;
})();

// Sample suggestion words per bucket (short, kid-safe picks for stuck kids)
const SUGGESTIONS = {
  color:   ["red", "blue", "green", "purple", "rainbow", "golden"],
  body:    ["dragon", "robot", "monster", "alien", "unicorn", "octopus"],
  feature: ["fire", "sparkly", "icy", "lightning", "crown", "heart"],
  power:   ["tough", "fast", "angry", "mighty", "speedy", "grumpy"],
};

// Resolve a typed string to a chip id for a specific bucket.
// Returns null if the word isn't in the allowlist for that bucket.
function resolveWord(text, bucket) {
  if (!text) return null;
  const clean = text.trim().toLowerCase();
  if (!clean) return null;
  const hit = WORD_INDEX[clean];
  if (hit && hit.bucket === bucket) return hit.id;
  return null;
}

// ============================================================
// HERO / BOSS RENDER HELPERS
// ============================================================
// HeroData variants:
//   { kind: "preset",    charId }
//   { kind: "drawn",     dataURL }
//   { kind: "described", body, color, feature }
// BossData variants:
//   { kind: "drawn",     dataURL }
//   { kind: "described", body, color, feature, power }

function heroDisplayName(hero) {
  if (!hero) return "Your hero";
  if (hero.kind === "preset") return (CHARACTERS.find(c => c.id === hero.charId)?.name) || "Your hero";
  if (hero.kind === "drawn") return "Your drawn hero";
  if (hero.kind === "described") {
    const body = BODY_CHIPS.find(b => b.id === hero.body)?.label || "hero";
    const color = COLOR_CHIPS.find(c => c.id === hero.color)?.label || "";
    return [color, body].filter(Boolean).join(" ").trim() || "Your hero";
  }
  return "Your hero";
}
function bossDisplayName(boss) {
  if (!boss) return "The Boss";
  if (boss.kind === "drawn") return "Your Boss";
  if (boss.kind === "described") {
    const body = BODY_CHIPS.find(b => b.id === boss.body)?.label || "boss";
    const color = COLOR_CHIPS.find(c => c.id === boss.color)?.label || "";
    return `The ${[color, body].filter(Boolean).join(" ").trim() || "Boss"}`;
  }
  return "The Boss";
}

// Render (DOM) — describe composition as stacked emojis with tinted glow
// ============================================================
// PROCEDURAL CREATURE RENDERER
// ============================================================
// Builds a kid's creature from their prompt words as composed SVG.
// Every creature is drawn by code — no emoji, no pre-made images.
// Layers (bottom to top):
//   1. background glow (color tint)
//   2. body silhouette (body word picks shape)
//   3. body fill (color word fills it)
//   4. texture overlay (style word adds spikes/bumps/fluff/stripes)
//   5. eyes + expression (power word tunes mood)
//   6. feature accessory (feature word adds fire/ice/crown/etc.)
// Art quality note: these are geometric primitives for now. Turn 10b
// replaces each body's silhouette with a detailed hand-coded path.

const COLOR_MAP = {
  red: "#EF4444", orange: "#F97316", yellow: "#FACC15", green: "#22C55E",
  blue: "#3B82F6", purple: "#A855F7", pink: "#EC4899", rainbow: "#FFD93D",
};

function colorFillFor(colorId, { asId = false } = {}) {
  if (colorId === "rainbow") {
    // Rainbow needs a gradient — return an SVG reference. We'll define
    // a gradient with this id below.
    return asId ? "url(#rainbowFill)" : "#FFD93D";
  }
  return COLOR_MAP[colorId] || "#999";
}

// Darker shade for outlines / shading
function colorShadeFor(colorId) {
  const shades = {
    red: "#991B1B", orange: "#9A3412", yellow: "#854D0E", green: "#14532D",
    blue: "#1E3A8A", purple: "#581C87", pink: "#831843", rainbow: "#1a1a3a",
  };
  return shades[colorId] || "#1a1a3a";
}

// Hand-coded body silhouettes. Each returns SVG children that draw the body.
// Coords live inside a 100×100 viewBox so layering is simple.
// These are intentionally simple for now; turn 10b upgrades each with
// real hand-shaped detail.
function bodyPathsFor(bodyId, fill, stroke) {
  const common = { fill, stroke, strokeWidth: 3, strokeLinejoin: "round" };
  switch (bodyId) {
    case "dragon":
      return (
        <g>
          {/* Serpentine body */}
          <path {...common}
            d="M 20 60 Q 10 40 25 30 Q 40 22 55 30 Q 70 38 75 50 Q 80 65 65 72 Q 50 80 38 72 Q 28 65 30 55 Q 33 48 42 50 Q 50 52 50 60" />
          {/* Wing */}
          <path fill={fill} stroke={stroke} strokeWidth={2}
            d="M 55 32 Q 70 18 82 28 Q 78 38 65 40 Z" />
          {/* Head horn */}
          <path fill={stroke} d="M 18 32 L 14 22 L 22 28 Z" />
        </g>
      );
    case "octopus":
      return (
        <g>
          {/* Head */}
          <ellipse cx="50" cy="38" rx="26" ry="24" {...common} />
          {/* 6 tentacles */}
          {[-2, -1, 0, 1, 2].map((i) => {
            const x0 = 50 + i * 9;
            const sway = (i % 2 === 0) ? 6 : -6;
            return (
              <path key={i}
                fill={fill} stroke={stroke} strokeWidth={2}
                d={`M ${x0-4} 58 Q ${x0+sway} 72 ${x0+sway/2} 86 Q ${x0} 92 ${x0+4} 86 Q ${x0-sway+4} 74 ${x0+4} 58 Z`} />
            );
          })}
        </g>
      );
    case "ghost":
      return (
        <g>
          <path {...common}
            d="M 22 32 Q 22 14 50 14 Q 78 14 78 32 L 78 78 Q 74 86 68 80 Q 62 86 56 80 Q 50 86 44 80 Q 38 86 32 80 Q 26 86 22 78 Z" />
        </g>
      );
    case "alien":
      return (
        <g>
          {/* Big head */}
          <ellipse cx="50" cy="38" rx="28" ry="26" {...common} />
          {/* Body */}
          <rect x="40" y="58" width="20" height="26" rx="6" {...common} />
          {/* Antennas */}
          <line x1="38" y1="14" x2="34" y2="4" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <line x1="62" y1="14" x2="66" y2="4" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <circle cx="34" cy="4" r="3" fill={stroke} />
          <circle cx="66" cy="4" r="3" fill={stroke} />
        </g>
      );
    case "robot":
      return (
        <g>
          {/* Head */}
          <rect x="28" y="16" width="44" height="34" rx="6" {...common} />
          {/* Body */}
          <rect x="24" y="52" width="52" height="34" rx="4" {...common} />
          {/* Antenna */}
          <line x1="50" y1="16" x2="50" y2="6" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="5" r="3" fill={stroke} />
          {/* Chest panel lines */}
          <line x1="35" y1="62" x2="65" y2="62" stroke={stroke} strokeWidth="2" />
          <line x1="35" y1="72" x2="65" y2="72" stroke={stroke} strokeWidth="2" />
        </g>
      );
    case "monster":
      return (
        <g>
          {/* Lumpy blob */}
          <path {...common}
            d="M 22 56 Q 14 36 30 26 Q 42 18 50 24 Q 58 18 70 26 Q 86 36 78 56 Q 84 76 66 84 Q 50 90 34 84 Q 16 76 22 56 Z" />
          {/* Horns */}
          <path fill={stroke} d="M 30 24 L 26 12 L 36 22 Z" />
          <path fill={stroke} d="M 70 24 L 74 12 L 64 22 Z" />
        </g>
      );
    case "unicorn":
      return (
        <g>
          {/* Body */}
          <ellipse cx="50" cy="62" rx="28" ry="16" {...common} />
          {/* Head */}
          <ellipse cx="70" cy="42" rx="14" ry="12" {...common} />
          {/* Horn */}
          <path fill="#FACC15" stroke={stroke} strokeWidth="2"
            d="M 76 28 L 74 14 L 80 28 Z" />
          {/* Legs */}
          <rect x="32" y="70" width="6" height="14" {...common} />
          <rect x="44" y="70" width="6" height="14" {...common} />
          <rect x="58" y="70" width="6" height="14" {...common} />
          <rect x="70" y="70" width="6" height="14" {...common} />
          {/* Mane */}
          <path fill={stroke} d="M 58 32 Q 50 28 46 40 Q 52 38 58 38 Z" />
        </g>
      );
    case "bear":
      return (
        <g>
          {/* Body */}
          <ellipse cx="50" cy="60" rx="26" ry="22" {...common} />
          {/* Head */}
          <circle cx="50" cy="34" r="18" {...common} />
          {/* Ears */}
          <circle cx="36" cy="22" r="6" {...common} />
          <circle cx="64" cy="22" r="6" {...common} />
          {/* Snout */}
          <ellipse cx="50" cy="40" rx="7" ry="5" fill="#FEF3C7" stroke={stroke} strokeWidth="2" />
        </g>
      );
    case "dog":
      return (
        <g>
          {/* Body — elongated oval */}
          <ellipse cx="50" cy="60" rx="26" ry="16" {...common} />
          {/* Head — angled slightly */}
          <circle cx="68" cy="38" r="14" {...common} />
          {/* Snout */}
          <ellipse cx="80" cy="42" rx="8" ry="5" {...common} />
          {/* Floppy ears */}
          <ellipse cx="60" cy="28" rx="4" ry="10" fill={stroke} />
          <ellipse cx="72" cy="26" rx="4" ry="9" fill={stroke} />
          {/* Legs */}
          <rect x="30" y="70" width="5" height="12" {...common} />
          <rect x="42" y="70" width="5" height="12" {...common} />
          <rect x="58" y="70" width="5" height="12" {...common} />
          <rect x="68" y="70" width="5" height="12" {...common} />
          {/* Tail — curving up */}
          <path {...common} fill="none" strokeWidth="5" strokeLinecap="round"
            d="M 24 54 Q 14 46 18 36" />
          {/* Nose dot */}
          <circle cx="85" cy="40" r="2" fill="#1a1a3a" />
        </g>
      );
    case "cat":
      return (
        <g>
          {/* Body — sleeker than dog */}
          <ellipse cx="48" cy="62" rx="22" ry="14" {...common} />
          {/* Head */}
          <circle cx="64" cy="38" r="13" {...common} />
          {/* Pointy triangle ears */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 55 28 L 53 18 L 62 26 Z" />
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 73 26 L 75 16 L 66 24 Z" />
          {/* Inner ear pink */}
          <path fill="#EC4899" d="M 57 26 L 57 22 L 60 26 Z" />
          <path fill="#EC4899" d="M 71 24 L 71 20 L 68 24 Z" />
          {/* Legs — shorter */}
          <rect x="30" y="72" width="4" height="10" {...common} />
          <rect x="40" y="72" width="4" height="10" {...common} />
          <rect x="54" y="72" width="4" height="10" {...common} />
          <rect x="62" y="72" width="4" height="10" {...common} />
          {/* Long curving tail */}
          <path {...common} fill="none" strokeWidth="4" strokeLinecap="round"
            d="M 26 56 Q 12 50 16 30 Q 18 22 24 24" />
          {/* Whiskers */}
          <line x1="55" y1="40" x2="48" y2="39" stroke="#1a1a3a" strokeWidth="1" />
          <line x1="55" y1="42" x2="48" y2="43" stroke="#1a1a3a" strokeWidth="1" />
          <line x1="73" y1="40" x2="80" y2="39" stroke="#1a1a3a" strokeWidth="1" />
          <line x1="73" y1="42" x2="80" y2="43" stroke="#1a1a3a" strokeWidth="1" />
          {/* Nose triangle */}
          <path fill="#EC4899" d="M 64 40 L 62 42 L 66 42 Z" />
        </g>
      );
    case "bunny":
      return (
        <g>
          {/* Round body */}
          <ellipse cx="50" cy="62" rx="22" ry="18" {...common} />
          {/* Round head */}
          <circle cx="50" cy="38" r="15" {...common} />
          {/* Long upright ears */}
          <ellipse cx="42" cy="18" rx="4" ry="14" {...common} />
          <ellipse cx="58" cy="18" rx="4" ry="14" {...common} />
          {/* Inner ear pink */}
          <ellipse cx="42" cy="20" rx="1.5" ry="10" fill="#EC4899" />
          <ellipse cx="58" cy="20" rx="1.5" ry="10" fill="#EC4899" />
          {/* Big back feet */}
          <ellipse cx="36" cy="80" rx="8" ry="4" {...common} />
          <ellipse cx="64" cy="80" rx="8" ry="4" {...common} />
          {/* Front paws peeking out */}
          <ellipse cx="44" cy="78" rx="3" ry="3" {...common} />
          <ellipse cx="56" cy="78" rx="3" ry="3" {...common} />
          {/* Fluffy tail (behind) */}
          <circle cx="26" cy="60" r="5" fill="#fff" stroke={stroke} strokeWidth="1.5" />
          {/* Nose */}
          <path fill="#EC4899" d="M 50 40 L 48 42 L 52 42 Z" />
        </g>
      );
    case "fish":
      return (
        <g>
          {/* Oval body */}
          <ellipse cx="48" cy="50" rx="28" ry="18" {...common} />
          {/* Tail fin (behind, to left) */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 22 50 L 8 36 L 14 50 L 8 64 Z" />
          {/* Top dorsal fin */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 36 34 L 44 22 L 50 34 Z" />
          {/* Bottom fin */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 40 68 L 46 78 L 50 68 Z" />
          {/* Gill line */}
          <path fill="none" stroke={stroke} strokeWidth="1.5"
            d="M 58 42 Q 60 50 58 58" />
          {/* Side fin */}
          <path fill={fill} stroke={stroke} strokeWidth="1.5"
            d="M 50 52 Q 58 60 50 62 Z" />
          {/* Mouth */}
          <path fill="none" stroke={stroke} strokeWidth="1.5"
            d="M 72 52 Q 76 54 72 56" />
        </g>
      );
    case "bird":
      return (
        <g>
          {/* Round body */}
          <ellipse cx="50" cy="56" rx="22" ry="18" {...common} />
          {/* Head */}
          <circle cx="50" cy="32" r="14" {...common} />
          {/* Wing */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 52 46 Q 68 52 62 68 Q 48 66 46 54 Z" />
          {/* Beak */}
          <path fill="#F97316" stroke={stroke} strokeWidth="1.5"
            d="M 62 30 L 74 32 L 62 34 Z" />
          {/* Tail feathers */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 28 58 L 16 54 L 20 62 L 14 66 L 24 66 L 28 72 Z" />
          {/* Skinny legs */}
          <line x1="44" y1="74" x2="42" y2="84" stroke="#F97316" strokeWidth="2.5" />
          <line x1="54" y1="74" x2="56" y2="84" stroke="#F97316" strokeWidth="2.5" />
          {/* Feet */}
          <path fill="none" stroke="#F97316" strokeWidth="1.5"
            d="M 38 84 L 42 84 L 46 84" />
          <path fill="none" stroke="#F97316" strokeWidth="1.5"
            d="M 52 84 L 56 84 L 60 84" />
        </g>
      );
    case "dinosaur":
      return (
        <g>
          {/* Big rounded body */}
          <path {...common}
            d="M 24 60 Q 16 40 32 32 Q 44 26 54 34 Q 66 40 68 54 Q 70 72 60 78 Q 46 82 34 76 Q 22 72 24 60 Z" />
          {/* Head — forward/up */}
          <ellipse cx="78" cy="42" rx="14" ry="11" {...common} />
          {/* Open mouth */}
          <path fill="#1a1a3a" d="M 82 44 L 92 42 L 92 46 L 82 48 Z" />
          {/* Teeth */}
          <path fill="#fff" stroke="#1a1a3a" strokeWidth="0.5"
            d="M 85 44 L 86 47 L 87 44 Z" />
          <path fill="#fff" stroke="#1a1a3a" strokeWidth="0.5"
            d="M 89 44 L 90 47 L 91 44 Z" />
          {/* Back spikes */}
          <path fill={stroke} d="M 36 30 L 34 22 L 42 28 Z" />
          <path fill={stroke} d="M 48 28 L 46 20 L 54 26 Z" />
          <path fill={stroke} d="M 58 32 L 56 24 L 64 30 Z" />
          {/* Tail — long curving behind */}
          <path fill={fill} stroke={stroke} strokeWidth="2"
            d="M 22 62 Q 8 58 6 68 Q 10 74 24 68 Z" />
          {/* Legs */}
          <rect x="34" y="72" width="8" height="12" rx="2" {...common} />
          <rect x="54" y="72" width="8" height="12" rx="2" {...common} />
          {/* Little arms */}
          <ellipse cx="68" cy="56" rx="4" ry="3" {...common} />
        </g>
      );
    case "snake":
      return (
        <g>
          {/* Coiled S body */}
          <path {...common} fill="none" strokeWidth="18" strokeLinecap="round"
            d="M 20 78 Q 50 78 50 58 Q 50 38 80 38 Q 90 38 82 28" />
          {/* Head accent */}
          <circle cx="82" cy="28" r="10" {...common} />
          {/* Tongue */}
          <path fill="#EF4444"
            d="M 92 28 L 96 26 L 94 28 L 96 30 Z" />
        </g>
      );
    default:
      // Fallback blob
      return <circle cx="50" cy="50" r="32" {...common} />;
  }
}

// Eye positions per body — where to draw the eyes on each silhouette.
function eyePositionsFor(bodyId) {
  switch (bodyId) {
    case "dragon":  return [{ x: 28, y: 38, r: 3 }];
    case "octopus": return [{ x: 42, y: 34, r: 3 }, { x: 58, y: 34, r: 3 }];
    case "ghost":   return [{ x: 40, y: 38, r: 3 }, { x: 60, y: 38, r: 3 }];
    case "alien":   return [{ x: 38, y: 36, r: 4 }, { x: 62, y: 36, r: 4 }];
    case "robot":   return [{ x: 40, y: 30, r: 3 }, { x: 60, y: 30, r: 3 }];
    case "monster": return [{ x: 40, y: 46, r: 3 }, { x: 60, y: 46, r: 3 }];
    case "unicorn": return [{ x: 72, y: 40, r: 2 }];
    case "bear":    return [{ x: 44, y: 32, r: 2 }, { x: 56, y: 32, r: 2 }];
    case "snake":   return [{ x: 85, y: 26, r: 2 }];
    case "dog":     return [{ x: 64, y: 36, r: 2 }, { x: 72, y: 36, r: 2 }];
    case "cat":     return [{ x: 60, y: 36, r: 2 }, { x: 68, y: 36, r: 2 }];
    case "bunny":   return [{ x: 44, y: 38, r: 2 }, { x: 56, y: 38, r: 2 }];
    case "fish":    return [{ x: 60, y: 46, r: 3 }];
    case "bird":    return [{ x: 46, y: 30, r: 2 }, { x: 54, y: 30, r: 2 }];
    case "dinosaur":return [{ x: 76, y: 40, r: 2.5 }];
    default:        return [{ x: 45, y: 48, r: 3 }, { x: 55, y: 48, r: 3 }];
  }
}

// Render the eyes based on mood. Power word tunes expression.
function EyesFor({ bodyId, power }) {
  const positions = eyePositionsFor(bodyId);
  // Mood: angry/grumpy = narrow, tough = focused, fast = wide, default = friendly
  const mood = power === "angry" ? "angry"
             : power === "fast"  ? "wide"
             : power === "tough" ? "focused"
             : "friendly";
  return (
    <g>
      {positions.map((p, i) => {
        if (mood === "angry") {
          // Narrow diagonal eyes
          return <path key={i} stroke="#1a1a3a" strokeWidth="2.5" fill="none" strokeLinecap="round"
            d={`M ${p.x-3} ${p.y-2} L ${p.x+3} ${p.y+2}`} />;
        }
        if (mood === "wide") {
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={p.r + 1.5} fill="#fff" />
              <circle cx={p.x} cy={p.y} r={p.r - 0.5} fill="#1a1a3a" />
            </g>
          );
        }
        if (mood === "focused") {
          return (
            <g key={i}>
              <rect x={p.x - p.r} y={p.y - 1} width={p.r * 2} height="2" fill="#1a1a3a" />
            </g>
          );
        }
        // friendly
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.r} fill="#fff" stroke="#1a1a3a" strokeWidth="1" />
            <circle cx={p.x + 0.5} cy={p.y + 0.5} r={p.r * 0.55} fill="#1a1a3a" />
          </g>
        );
      })}
    </g>
  );
}

// Texture overlays from style descriptors.
function TextureFor({ styleId, bodyId }) {
  if (!styleId) return null;
  switch (styleId) {
    case "spiky":
      // Small triangle spikes around the top edge
      return (
        <g fill="#1a1a3a">
          {[20, 30, 40, 50, 60, 70, 80].map((x, i) => (
            <path key={i} d={`M ${x-3} 20 L ${x} 10 L ${x+3} 20 Z`} opacity="0.8" />
          ))}
        </g>
      );
    case "bumpy":
      // Polka dots scattered
      return (
        <g fill="rgba(0,0,0,0.18)">
          <circle cx="35" cy="45" r="3" />
          <circle cx="55" cy="55" r="3" />
          <circle cx="45" cy="65" r="3" />
          <circle cx="65" cy="40" r="3" />
          <circle cx="30" cy="60" r="3" />
          <circle cx="70" cy="65" r="3" />
        </g>
      );
    case "stripey":
      // Stripes across body
      return (
        <g stroke="rgba(0,0,0,0.25)" strokeWidth="3" fill="none">
          <line x1="22" y1="35" x2="78" y2="35" />
          <line x1="22" y1="50" x2="78" y2="50" />
          <line x1="22" y1="65" x2="78" y2="65" />
        </g>
      );
    case "fluffy":
      // Puffy cloud bumps around the outside
      return (
        <g fill="rgba(255,255,255,0.55)">
          {[ [22,40], [18,60], [30,78], [50,84], [70,78], [82,60], [78,36], [50,14] ].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r="6" />
          ))}
        </g>
      );
    case "slimy":
      // Gloss highlights + drip
      return (
        <g>
          <ellipse cx="38" cy="30" rx="8" ry="4" fill="rgba(255,255,255,0.5)" />
          <path d="M 50 82 Q 48 90 52 92 Q 56 90 54 82 Z" fill="rgba(0,0,0,0.15)" />
        </g>
      );
    default:
      return null;
  }
}

// Feature accessory from feature word.
function FeatureFor({ featureId, bodyId }) {
  if (!featureId) return null;
  switch (featureId) {
    case "fire":
      return (
        <g>
          {/* Flame near head */}
          <path fill="#F97316" stroke="#991B1B" strokeWidth="1.5"
            d="M 82 24 Q 78 14 84 6 Q 88 14 92 8 Q 96 18 90 26 Q 84 30 82 24 Z" />
          <path fill="#FACC15"
            d="M 85 22 Q 84 16 88 12 Q 90 18 88 24 Q 86 24 85 22 Z" />
        </g>
      );
    case "ice":
      return (
        <g fill="#7dd3fc" stroke="#0369a1" strokeWidth="1.2">
          {/* 3 snowflakes */}
          {[ [14,20], [80,14], [22,78] ].map(([x,y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <line x1="-4" y1="0" x2="4" y2="0" stroke="#0369a1" strokeWidth="1.5" />
              <line x1="0" y1="-4" x2="0" y2="4" stroke="#0369a1" strokeWidth="1.5" />
              <line x1="-3" y1="-3" x2="3" y2="3" stroke="#0369a1" strokeWidth="1.2" />
              <line x1="-3" y1="3" x2="3" y2="-3" stroke="#0369a1" strokeWidth="1.2" />
            </g>
          ))}
        </g>
      );
    case "stars":
      return (
        <g fill="#FACC15" stroke="#854D0E" strokeWidth="0.8">
          {[ [12,16], [86,22], [18,82], [84,78], [50,6] ].map(([x,y], i) => {
            const pts = [];
            for (let k = 0; k < 10; k++) {
              const r = k % 2 === 0 ? 4 : 1.6;
              const a = (Math.PI / 5) * k - Math.PI / 2;
              pts.push(`${x + Math.cos(a)*r},${y + Math.sin(a)*r}`);
            }
            return <polygon key={i} points={pts.join(" ")} />;
          })}
        </g>
      );
    case "crown":
      return (
        <g>
          <path fill="#FACC15" stroke="#854D0E" strokeWidth="1.5"
            d="M 30 18 L 34 10 L 42 14 L 50 6 L 58 14 L 66 10 L 70 18 L 68 26 L 32 26 Z" />
          <circle cx="50" cy="12" r="2" fill="#EF4444" />
        </g>
      );
    case "zap":
      return (
        <g fill="#FACC15" stroke="#854D0E" strokeWidth="1.2">
          <polygon points="10,10 18,14 14,18 22,32 12,22 16,20 8,18" />
          <polygon points="88,22 84,30 90,28 82,44 90,30 86,30 92,24" />
        </g>
      );
    case "heart":
      return (
        <g fill="#EC4899" stroke="#831843" strokeWidth="1">
          <path d="M 14 16 C 10 10 18 8 14 16 Z
                   M 14 16 C 14 10 20 12 14 20 Z
                   M 14 16 Q 10 10 14 8 Q 18 10 14 16 Q 18 22 14 22 Q 10 22 14 16 Z" />
          {/* Simpler: two little floating hearts */}
          <g transform="translate(14, 16) scale(0.35)">
            <path d="M 0 -4 C -10 -14 -18 -2 0 12 C 18 -2 10 -14 0 -4 Z" />
          </g>
          <g transform="translate(84, 78) scale(0.3)">
            <path d="M 0 -4 C -10 -14 -18 -2 0 12 C 18 -2 10 -14 0 -4 Z" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

// The main creature renderer. Takes a prompt-derived entity and draws it.
// Accessory renderer. Splits into layers so cape can go behind the body
// while wings/hat/sword render on top. Positions tuned for most bodies;
// slight visual offset on smaller bodies is acceptable for now.
function AccessoryFor({ accessoryId, bodyId, layer }) {
  if (!accessoryId) return null;
  if (accessoryId === "cape" && layer === "back") {
    // Billowing cape behind — red with a darker edge
    return (
      <g>
        <path fill="#DC2626" stroke="#7F1D1D" strokeWidth="1.5"
          d="M 30 32 Q 18 50 14 80 Q 34 74 50 78 Q 66 74 86 80 Q 82 50 70 32 Q 60 40 50 40 Q 40 40 30 32 Z" />
        {/* Collar knot */}
        <ellipse cx="50" cy="30" rx="5" ry="2" fill="#7F1D1D" />
      </g>
    );
  }
  if (layer !== "front") return null;
  switch (accessoryId) {
    case "wings":
      return (
        <g>
          {/* Left wing */}
          <path fill="rgba(255,255,255,0.85)" stroke="#4a3a6a" strokeWidth="1.5"
            d="M 22 44 Q 4 30 6 56 Q 14 52 24 56 Q 18 48 22 44 Z" />
          {/* Right wing */}
          <path fill="rgba(255,255,255,0.85)" stroke="#4a3a6a" strokeWidth="1.5"
            d="M 78 44 Q 96 30 94 56 Q 86 52 76 56 Q 82 48 78 44 Z" />
          {/* Feather accents */}
          <path fill="none" stroke="#4a3a6a" strokeWidth="0.8"
            d="M 10 38 L 18 48 M 14 44 L 20 52" />
          <path fill="none" stroke="#4a3a6a" strokeWidth="0.8"
            d="M 90 38 L 82 48 M 86 44 L 80 52" />
        </g>
      );
    case "hat":
      return (
        <g>
          {/* Top-hat style */}
          <rect x="38" y="0" width="24" height="18" fill="#1a1a3a" stroke="#000" strokeWidth="1" rx="1" />
          <rect x="32" y="16" width="36" height="4" fill="#1a1a3a" stroke="#000" strokeWidth="1" />
          {/* Hatband */}
          <rect x="38" y="12" width="24" height="4" fill="#FACC15" />
        </g>
      );
    case "sword":
      return (
        <g>
          {/* Sword on right side of body */}
          {/* Blade */}
          <rect x="86" y="30" width="4" height="34" fill="#E5E7EB" stroke="#374151" strokeWidth="1" />
          {/* Crossguard */}
          <rect x="80" y="62" width="16" height="4" fill="#854D0E" stroke="#451A03" strokeWidth="1" />
          {/* Hilt */}
          <rect x="86" y="64" width="4" height="10" fill="#451A03" />
          {/* Pommel */}
          <circle cx="88" cy="76" r="3" fill="#FACC15" stroke="#854D0E" strokeWidth="1" />
          {/* Tip detail */}
          <path d="M 86 30 L 88 26 L 90 30 Z" fill="#E5E7EB" stroke="#374151" strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}

function CreatureSVG({ entity, size = 120 }) {
  if (!entity?.body) return null;
  const fill = colorFillFor(entity.color, { asId: entity.color === "rainbow" });
  const stroke = colorShadeFor(entity.color);
  const scale = entity.style === "tiny" ? 0.75
              : entity.style === "big"  ? 1.15
              : 1;
  // Glow tint
  const glowColor = entity.color === "rainbow" ? "#FFD93D" : COLOR_MAP[entity.color] || "#999";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100"
         xmlns="http://www.w3.org/2000/svg" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="rainbowFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#EF4444" />
          <stop offset="25%"  stopColor="#FACC15" />
          <stop offset="50%"  stopColor="#22C55E" />
          <stop offset="75%"  stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0%"   stopColor={glowColor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 1. Soft glow behind creature */}
      <circle cx="50" cy="50" r="48" fill="url(#glow)" />
      {/* 1b. Cape — rendered BEHIND the body so it flows out the back */}
      <g transform={`translate(50,50) scale(${scale}) translate(-50,-50)`}>
        <AccessoryFor accessoryId={entity.accessory} bodyId={entity.body} layer="back" />
      </g>
      {/* 2-3. Body (scaled by size modifier, centered) */}
      <g transform={`translate(50,50) scale(${scale}) translate(-50,-50)`}>
        {bodyPathsFor(entity.body, fill, stroke)}
        {/* 4. Texture overlay */}
        <TextureFor styleId={entity.style} bodyId={entity.body} />
        {/* 5. Eyes */}
        <EyesFor bodyId={entity.body} power={entity.power} />
        {/* 6. Feature accessory (fire/ice/crown/etc) */}
        <FeatureFor featureId={entity.feature} bodyId={entity.body} />
        {/* 7. Accessory front — wings, hat, sword — on top of body */}
        <AccessoryFor accessoryId={entity.accessory} bodyId={entity.body} layer="front" />
      </g>
    </svg>
  );
}

// Thin wrapper that preserves the existing DescribedAvatar interface.
// All callers (live preview, boss HUD, maze cell, complete screen) keep working.
// In-memory cache of API-generated creature image URLs keyed by entity hash.
// Survives between renders but not page reloads. Persistent cache happens
// server-side via Supabase.
const __aiCreatureCache = new Map();

function DescribedAvatar({ entity, size = 72 }) {
  const [aiUrl, setAiUrl] = useState(null);
  const key = entity ? creatureCacheKey(entity) : null;

  useEffect(() => {
    if (!key) return;
    // Cache hit — use it
    if (__aiCreatureCache.has(key)) {
      setAiUrl(__aiCreatureCache.get(key));
      return;
    }
    // Mark "in flight" so we don't double-fetch
    __aiCreatureCache.set(key, null);
    // Fire and forget — fall back to procedural while loading
    let cancelled = false;
    buildableApi.generateCreatureImage(entity).then(result => {
      if (cancelled) return;
      if (result && result.url) {
        __aiCreatureCache.set(key, result.url);
        setAiUrl(result.url);
      }
    });
    return () => { cancelled = true; };
  }, [key]);

  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      {aiUrl ? (
        <img src={aiUrl} alt=""
          style={{
            width: size, height: size, objectFit: "contain",
            borderRadius: "50%", display: "block",
          }} />
      ) : (
        <CreatureSVG entity={entity} size={size} />
      )}
    </div>
  );
}


// Hero DOM display (handles all three kinds)
function HeroDisplay({ hero, size = 72, className = "" }) {
  if (!hero) return null;
  if (hero.kind === "preset") {
    const ch = CHARACTERS.find(c => c.id === hero.charId);
    return <span className={className} style={{ fontSize: size }}>{ch?.emoji}</span>;
  }
  if (hero.kind === "drawn") {
    return <img src={hero.dataURL} alt="" className={className} style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  if (hero.kind === "described") {
    return <DescribedAvatar entity={hero} size={size} />;
  }
  return null;
}
function BossDisplay({ boss, size = 72, className = "" }) {
  if (!boss) return null;
  if (boss.kind === "drawn") {
    return <img src={boss.dataURL} alt="" className={className} style={{ width: size, height: size, objectFit: "contain" }} />;
  }
  if (boss.kind === "described") {
    return <DescribedAvatar entity={boss} size={size} />;
  }
  return null;
}

// Canvas rendering for in-game
function canvasTintFor(entity) {
  if (!entity) return "#999";
  if (entity.color === "rainbow") return "#FFD93D";
  return COLOR_CHIPS.find(c => c.id === entity.color)?.tint || "#999";
}
function drawDescribedOnCanvas(ctx, entity, x, y, size) {
  // Draw the cached SVG if available; fall back to simple glow while loading.
  const img = getCreatureImage(entity);
  const tint = canvasTintFor(entity);
  const grad = ctx.createRadialGradient(x + size/2, y + size/2, 4, x + size/2, y + size/2, size/2);
  grad.addColorStop(0, tint + "55");
  grad.addColorStop(1, tint + "00");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2); ctx.fill();
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, size, size);
  }
}

// Cache SVG→image per entity so we don't rebuild every frame.
const __creatureCache = new Map();
function creatureCacheKey(entity) {
  return [entity.color, entity.body, entity.feature, entity.style || "", entity.power || "", entity.accessory || ""].join("|");
}
function getCreatureImage(entity) {
  if (!entity?.body) return null;
  const key = creatureCacheKey(entity);
  if (__creatureCache.has(key)) return __creatureCache.get(key);
  // Build SVG markup string matching CreatureSVG output.
  const markup = renderCreatureSVGMarkup(entity);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  __creatureCache.set(key, img);
  return img;
}

// Build raw SVG markup (string) matching what <CreatureSVG> renders.
// Kept as a mirror of the JSX version so canvas draws look identical.
// When the JSX version changes, update this too.
function renderCreatureSVGMarkup(entity) {
  const fillVal = entity.color === "rainbow" ? "url(#rainbowFill)" : (COLOR_MAP[entity.color] || "#999");
  const stroke = colorShadeFor(entity.color);
  const scale = entity.style === "tiny" ? 0.75
              : entity.style === "big"  ? 1.15
              : 1;
  const glowColor = entity.color === "rainbow" ? "#FFD93D" : (COLOR_MAP[entity.color] || "#999");
  const defs = `
    <defs>
      <linearGradient id="rainbowFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#EF4444"/>
        <stop offset="25%" stop-color="#FACC15"/>
        <stop offset="50%" stop-color="#22C55E"/>
        <stop offset="75%" stop-color="#3B82F6"/>
        <stop offset="100%" stop-color="#A855F7"/>
      </linearGradient>
      <radialGradient id="glow">
        <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${glowColor}" stop-opacity="0"/>
      </radialGradient>
    </defs>`;
  const body = bodyMarkup(entity.body, fillVal, stroke);
  const texture = textureMarkup(entity.style);
  const eyes = eyesMarkup(entity.body, entity.power);
  const feature = featureMarkup(entity.feature);
  const accessoryBack  = accessoryMarkup(entity.accessory, "back");
  const accessoryFront = accessoryMarkup(entity.accessory, "front");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    ${defs}
    <circle cx="50" cy="50" r="48" fill="url(#glow)"/>
    <g transform="translate(50,50) scale(${scale}) translate(-50,-50)">
      ${accessoryBack}
    </g>
    <g transform="translate(50,50) scale(${scale}) translate(-50,-50)">
      ${body}
      ${texture}
      ${eyes}
      ${feature}
      ${accessoryFront}
    </g>
  </svg>`;
}

// ---- Markup helpers (string-producing mirrors of the JSX layers) ----
function bodyMarkup(bodyId, fill, stroke) {
  const c = `fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"`;
  switch (bodyId) {
    case "dragon":
      return `<g>
        <path ${c} d="M 20 60 Q 10 40 25 30 Q 40 22 55 30 Q 70 38 75 50 Q 80 65 65 72 Q 50 80 38 72 Q 28 65 30 55 Q 33 48 42 50 Q 50 52 50 60"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 55 32 Q 70 18 82 28 Q 78 38 65 40 Z"/>
        <path fill="${stroke}" d="M 18 32 L 14 22 L 22 28 Z"/>
      </g>`;
    case "octopus": {
      const tents = [-2, -1, 0, 1, 2].map(i => {
        const x0 = 50 + i * 9;
        const sway = (i % 2 === 0) ? 6 : -6;
        return `<path fill="${fill}" stroke="${stroke}" stroke-width="2"
          d="M ${x0-4} 58 Q ${x0+sway} 72 ${x0+sway/2} 86 Q ${x0} 92 ${x0+4} 86 Q ${x0-sway+4} 74 ${x0+4} 58 Z"/>`;
      }).join("");
      return `<g>
        <ellipse cx="50" cy="38" rx="26" ry="24" ${c}/>
        ${tents}
      </g>`;
    }
    case "ghost":
      return `<path ${c} d="M 22 32 Q 22 14 50 14 Q 78 14 78 32 L 78 78 Q 74 86 68 80 Q 62 86 56 80 Q 50 86 44 80 Q 38 86 32 80 Q 26 86 22 78 Z"/>`;
    case "alien":
      return `<g>
        <ellipse cx="50" cy="38" rx="28" ry="26" ${c}/>
        <rect x="40" y="58" width="20" height="26" rx="6" ${c}/>
        <line x1="38" y1="14" x2="34" y2="4" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <line x1="62" y1="14" x2="66" y2="4" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="34" cy="4" r="3" fill="${stroke}"/>
        <circle cx="66" cy="4" r="3" fill="${stroke}"/>
      </g>`;
    case "robot":
      return `<g>
        <rect x="28" y="16" width="44" height="34" rx="6" ${c}/>
        <rect x="24" y="52" width="52" height="34" rx="4" ${c}/>
        <line x1="50" y1="16" x2="50" y2="6" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="50" cy="5" r="3" fill="${stroke}"/>
        <line x1="35" y1="62" x2="65" y2="62" stroke="${stroke}" stroke-width="2"/>
        <line x1="35" y1="72" x2="65" y2="72" stroke="${stroke}" stroke-width="2"/>
      </g>`;
    case "monster":
      return `<g>
        <path ${c} d="M 22 56 Q 14 36 30 26 Q 42 18 50 24 Q 58 18 70 26 Q 86 36 78 56 Q 84 76 66 84 Q 50 90 34 84 Q 16 76 22 56 Z"/>
        <path fill="${stroke}" d="M 30 24 L 26 12 L 36 22 Z"/>
        <path fill="${stroke}" d="M 70 24 L 74 12 L 64 22 Z"/>
      </g>`;
    case "unicorn":
      return `<g>
        <ellipse cx="50" cy="62" rx="28" ry="16" ${c}/>
        <ellipse cx="70" cy="42" rx="14" ry="12" ${c}/>
        <path fill="#FACC15" stroke="${stroke}" stroke-width="2" d="M 76 28 L 74 14 L 80 28 Z"/>
        <rect x="32" y="70" width="6" height="14" ${c}/>
        <rect x="44" y="70" width="6" height="14" ${c}/>
        <rect x="58" y="70" width="6" height="14" ${c}/>
        <rect x="70" y="70" width="6" height="14" ${c}/>
        <path fill="${stroke}" d="M 58 32 Q 50 28 46 40 Q 52 38 58 38 Z"/>
      </g>`;
    case "bear":
      return `<g>
        <ellipse cx="50" cy="60" rx="26" ry="22" ${c}/>
        <circle cx="50" cy="34" r="18" ${c}/>
        <circle cx="36" cy="22" r="6" ${c}/>
        <circle cx="64" cy="22" r="6" ${c}/>
        <ellipse cx="50" cy="40" rx="7" ry="5" fill="#FEF3C7" stroke="${stroke}" stroke-width="2"/>
      </g>`;
    case "dog":
      return `<g>
        <ellipse cx="50" cy="60" rx="26" ry="16" ${c}/>
        <circle cx="68" cy="38" r="14" ${c}/>
        <ellipse cx="80" cy="42" rx="8" ry="5" ${c}/>
        <ellipse cx="60" cy="28" rx="4" ry="10" fill="${stroke}"/>
        <ellipse cx="72" cy="26" rx="4" ry="9" fill="${stroke}"/>
        <rect x="30" y="70" width="5" height="12" ${c}/>
        <rect x="42" y="70" width="5" height="12" ${c}/>
        <rect x="58" y="70" width="5" height="12" ${c}/>
        <rect x="68" y="70" width="5" height="12" ${c}/>
        <path fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" d="M 24 54 Q 14 46 18 36"/>
        <circle cx="85" cy="40" r="2" fill="#1a1a3a"/>
      </g>`;
    case "cat":
      return `<g>
        <ellipse cx="48" cy="62" rx="22" ry="14" ${c}/>
        <circle cx="64" cy="38" r="13" ${c}/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 55 28 L 53 18 L 62 26 Z"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 73 26 L 75 16 L 66 24 Z"/>
        <path fill="#EC4899" d="M 57 26 L 57 22 L 60 26 Z"/>
        <path fill="#EC4899" d="M 71 24 L 71 20 L 68 24 Z"/>
        <rect x="30" y="72" width="4" height="10" ${c}/>
        <rect x="40" y="72" width="4" height="10" ${c}/>
        <rect x="54" y="72" width="4" height="10" ${c}/>
        <rect x="62" y="72" width="4" height="10" ${c}/>
        <path fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" d="M 26 56 Q 12 50 16 30 Q 18 22 24 24"/>
        <line x1="55" y1="40" x2="48" y2="39" stroke="#1a1a3a" stroke-width="1"/>
        <line x1="55" y1="42" x2="48" y2="43" stroke="#1a1a3a" stroke-width="1"/>
        <line x1="73" y1="40" x2="80" y2="39" stroke="#1a1a3a" stroke-width="1"/>
        <line x1="73" y1="42" x2="80" y2="43" stroke="#1a1a3a" stroke-width="1"/>
        <path fill="#EC4899" d="M 64 40 L 62 42 L 66 42 Z"/>
      </g>`;
    case "bunny":
      return `<g>
        <ellipse cx="50" cy="62" rx="22" ry="18" ${c}/>
        <circle cx="50" cy="38" r="15" ${c}/>
        <ellipse cx="42" cy="18" rx="4" ry="14" ${c}/>
        <ellipse cx="58" cy="18" rx="4" ry="14" ${c}/>
        <ellipse cx="42" cy="20" rx="1.5" ry="10" fill="#EC4899"/>
        <ellipse cx="58" cy="20" rx="1.5" ry="10" fill="#EC4899"/>
        <ellipse cx="36" cy="80" rx="8" ry="4" ${c}/>
        <ellipse cx="64" cy="80" rx="8" ry="4" ${c}/>
        <ellipse cx="44" cy="78" rx="3" ry="3" ${c}/>
        <ellipse cx="56" cy="78" rx="3" ry="3" ${c}/>
        <circle cx="26" cy="60" r="5" fill="#fff" stroke="${stroke}" stroke-width="1.5"/>
        <path fill="#EC4899" d="M 50 40 L 48 42 L 52 42 Z"/>
      </g>`;
    case "fish":
      return `<g>
        <ellipse cx="48" cy="50" rx="28" ry="18" ${c}/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 22 50 L 8 36 L 14 50 L 8 64 Z"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 36 34 L 44 22 L 50 34 Z"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 40 68 L 46 78 L 50 68 Z"/>
        <path fill="none" stroke="${stroke}" stroke-width="1.5" d="M 58 42 Q 60 50 58 58"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="1.5" d="M 50 52 Q 58 60 50 62 Z"/>
        <path fill="none" stroke="${stroke}" stroke-width="1.5" d="M 72 52 Q 76 54 72 56"/>
      </g>`;
    case "bird":
      return `<g>
        <ellipse cx="50" cy="56" rx="22" ry="18" ${c}/>
        <circle cx="50" cy="32" r="14" ${c}/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 52 46 Q 68 52 62 68 Q 48 66 46 54 Z"/>
        <path fill="#F97316" stroke="${stroke}" stroke-width="1.5" d="M 62 30 L 74 32 L 62 34 Z"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 28 58 L 16 54 L 20 62 L 14 66 L 24 66 L 28 72 Z"/>
        <line x1="44" y1="74" x2="42" y2="84" stroke="#F97316" stroke-width="2.5"/>
        <line x1="54" y1="74" x2="56" y2="84" stroke="#F97316" stroke-width="2.5"/>
        <path fill="none" stroke="#F97316" stroke-width="1.5" d="M 38 84 L 42 84 L 46 84"/>
        <path fill="none" stroke="#F97316" stroke-width="1.5" d="M 52 84 L 56 84 L 60 84"/>
      </g>`;
    case "dinosaur":
      return `<g>
        <path ${c} d="M 24 60 Q 16 40 32 32 Q 44 26 54 34 Q 66 40 68 54 Q 70 72 60 78 Q 46 82 34 76 Q 22 72 24 60 Z"/>
        <ellipse cx="78" cy="42" rx="14" ry="11" ${c}/>
        <path fill="#1a1a3a" d="M 82 44 L 92 42 L 92 46 L 82 48 Z"/>
        <path fill="#fff" stroke="#1a1a3a" stroke-width="0.5" d="M 85 44 L 86 47 L 87 44 Z"/>
        <path fill="#fff" stroke="#1a1a3a" stroke-width="0.5" d="M 89 44 L 90 47 L 91 44 Z"/>
        <path fill="${stroke}" d="M 36 30 L 34 22 L 42 28 Z"/>
        <path fill="${stroke}" d="M 48 28 L 46 20 L 54 26 Z"/>
        <path fill="${stroke}" d="M 58 32 L 56 24 L 64 30 Z"/>
        <path fill="${fill}" stroke="${stroke}" stroke-width="2" d="M 22 62 Q 8 58 6 68 Q 10 74 24 68 Z"/>
        <rect x="34" y="72" width="8" height="12" rx="2" ${c}/>
        <rect x="54" y="72" width="8" height="12" rx="2" ${c}/>
        <ellipse cx="68" cy="56" rx="4" ry="3" ${c}/>
      </g>`;
    case "snake":
      return `<g>
        <path fill="none" stroke="${fill}" stroke-width="18" stroke-linecap="round"
          d="M 20 78 Q 50 78 50 58 Q 50 38 80 38 Q 90 38 82 28"/>
        <circle cx="82" cy="28" r="10" ${c}/>
        <path fill="#EF4444" d="M 92 28 L 96 26 L 94 28 L 96 30 Z"/>
      </g>`;
    default:
      return `<circle cx="50" cy="50" r="32" ${c}/>`;
  }
}

function textureMarkup(styleId) {
  switch (styleId) {
    case "spiky":
      return [20,30,40,50,60,70,80].map(x =>
        `<path d="M ${x-3} 20 L ${x} 10 L ${x+3} 20 Z" fill="#1a1a3a" opacity="0.8"/>`).join("");
    case "bumpy":
      return `<g fill="rgba(0,0,0,0.18)">
        <circle cx="35" cy="45" r="3"/><circle cx="55" cy="55" r="3"/>
        <circle cx="45" cy="65" r="3"/><circle cx="65" cy="40" r="3"/>
        <circle cx="30" cy="60" r="3"/><circle cx="70" cy="65" r="3"/>
      </g>`;
    case "stripey":
      return `<g stroke="rgba(0,0,0,0.25)" stroke-width="3" fill="none">
        <line x1="22" y1="35" x2="78" y2="35"/>
        <line x1="22" y1="50" x2="78" y2="50"/>
        <line x1="22" y1="65" x2="78" y2="65"/>
      </g>`;
    case "fluffy":
      return [[22,40],[18,60],[30,78],[50,84],[70,78],[82,60],[78,36],[50,14]]
        .map(([x,y]) => `<circle cx="${x}" cy="${y}" r="6" fill="rgba(255,255,255,0.55)"/>`)
        .join("");
    case "slimy":
      return `<ellipse cx="38" cy="30" rx="8" ry="4" fill="rgba(255,255,255,0.5)"/>
              <path d="M 50 82 Q 48 90 52 92 Q 56 90 54 82 Z" fill="rgba(0,0,0,0.15)"/>`;
    default: return "";
  }
}

function eyesMarkup(bodyId, power) {
  const positions = eyePositionsFor(bodyId);
  const mood = power === "angry" ? "angry"
             : power === "fast"  ? "wide"
             : power === "tough" ? "focused"
             : "friendly";
  return positions.map(p => {
    if (mood === "angry") {
      return `<path stroke="#1a1a3a" stroke-width="2.5" fill="none" stroke-linecap="round"
        d="M ${p.x-3} ${p.y-2} L ${p.x+3} ${p.y+2}"/>`;
    }
    if (mood === "wide") {
      return `<circle cx="${p.x}" cy="${p.y}" r="${p.r+1.5}" fill="#fff"/>
              <circle cx="${p.x}" cy="${p.y}" r="${p.r-0.5}" fill="#1a1a3a"/>`;
    }
    if (mood === "focused") {
      return `<rect x="${p.x-p.r}" y="${p.y-1}" width="${p.r*2}" height="2" fill="#1a1a3a"/>`;
    }
    return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="#fff" stroke="#1a1a3a" stroke-width="1"/>
            <circle cx="${p.x+0.5}" cy="${p.y+0.5}" r="${p.r*0.55}" fill="#1a1a3a"/>`;
  }).join("");
}

function featureMarkup(featureId) {
  switch (featureId) {
    case "fire":
      return `<path fill="#F97316" stroke="#991B1B" stroke-width="1.5"
                d="M 82 24 Q 78 14 84 6 Q 88 14 92 8 Q 96 18 90 26 Q 84 30 82 24 Z"/>
              <path fill="#FACC15" d="M 85 22 Q 84 16 88 12 Q 90 18 88 24 Q 86 24 85 22 Z"/>`;
    case "ice":
      return [[14,20],[80,14],[22,78]].map(([x,y]) => `
        <g transform="translate(${x},${y})">
          <line x1="-4" y1="0" x2="4" y2="0" stroke="#0369a1" stroke-width="1.5"/>
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#0369a1" stroke-width="1.5"/>
          <line x1="-3" y1="-3" x2="3" y2="3" stroke="#0369a1" stroke-width="1.2"/>
          <line x1="-3" y1="3" x2="3" y2="-3" stroke="#0369a1" stroke-width="1.2"/>
        </g>`).join("");
    case "stars":
      return [[12,16],[86,22],[18,82],[84,78],[50,6]].map(([x,y]) => {
        const pts = [];
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? 4 : 1.6;
          const a = (Math.PI / 5) * k - Math.PI / 2;
          pts.push(`${x + Math.cos(a)*r},${y + Math.sin(a)*r}`);
        }
        return `<polygon points="${pts.join(" ")}" fill="#FACC15" stroke="#854D0E" stroke-width="0.8"/>`;
      }).join("");
    case "crown":
      return `<path fill="#FACC15" stroke="#854D0E" stroke-width="1.5"
                d="M 30 18 L 34 10 L 42 14 L 50 6 L 58 14 L 66 10 L 70 18 L 68 26 L 32 26 Z"/>
              <circle cx="50" cy="12" r="2" fill="#EF4444"/>`;
    case "zap":
      return `<polygon points="10,10 18,14 14,18 22,32 12,22 16,20 8,18" fill="#FACC15" stroke="#854D0E" stroke-width="1.2"/>
              <polygon points="88,22 84,30 90,28 82,44 90,30 86,30 92,24" fill="#FACC15" stroke="#854D0E" stroke-width="1.2"/>`;
    case "heart":
      return `<g transform="translate(14, 16) scale(0.35)">
                <path d="M 0 -4 C -10 -14 -18 -2 0 12 C 18 -2 10 -14 0 -4 Z" fill="#EC4899" stroke="#831843" stroke-width="1"/>
              </g>
              <g transform="translate(84, 78) scale(0.3)">
                <path d="M 0 -4 C -10 -14 -18 -2 0 12 C 18 -2 10 -14 0 -4 Z" fill="#EC4899" stroke="#831843" stroke-width="1"/>
              </g>`;
    default: return "";
  }
}

// String-SVG mirror of the JSX AccessoryFor. Two layers: "back" renders
// behind the body (cape), "front" renders on top (wings, hat, sword).
// Returns empty string when no accessory applies to the requested layer
// so the composer can safely interpolate the result.
function accessoryMarkup(accessoryId, layer) {
  if (!accessoryId) return "";
  if (accessoryId === "cape" && layer === "back") {
    return `<g>
      <path fill="#DC2626" stroke="#7F1D1D" stroke-width="1.5"
        d="M 30 32 Q 18 50 14 80 Q 34 74 50 78 Q 66 74 86 80 Q 82 50 70 32 Q 60 40 50 40 Q 40 40 30 32 Z"/>
      <ellipse cx="50" cy="30" rx="5" ry="2" fill="#7F1D1D"/>
    </g>`;
  }
  if (layer !== "front") return "";
  switch (accessoryId) {
    case "wings":
      return `<g>
        <path fill="rgba(255,255,255,0.85)" stroke="#4a3a6a" stroke-width="1.5"
          d="M 22 44 Q 4 30 6 56 Q 14 52 24 56 Q 18 48 22 44 Z"/>
        <path fill="rgba(255,255,255,0.85)" stroke="#4a3a6a" stroke-width="1.5"
          d="M 78 44 Q 96 30 94 56 Q 86 52 76 56 Q 82 48 78 44 Z"/>
        <path fill="none" stroke="#4a3a6a" stroke-width="0.8"
          d="M 10 38 L 18 48 M 14 44 L 20 52"/>
        <path fill="none" stroke="#4a3a6a" stroke-width="0.8"
          d="M 90 38 L 82 48 M 86 44 L 80 52"/>
      </g>`;
    case "hat":
      return `<g>
        <rect x="38" y="0" width="24" height="18" fill="#1a1a3a" stroke="#000" stroke-width="1" rx="1"/>
        <rect x="32" y="16" width="36" height="4" fill="#1a1a3a" stroke="#000" stroke-width="1"/>
        <rect x="38" y="12" width="24" height="4" fill="#FACC15"/>
      </g>`;
    case "sword":
      return `<g>
        <rect x="86" y="30" width="4" height="34" fill="#E5E7EB" stroke="#374151" stroke-width="1"/>
        <rect x="80" y="62" width="16" height="4" fill="#854D0E" stroke="#451A03" stroke-width="1"/>
        <rect x="86" y="64" width="4" height="10" fill="#451A03"/>
        <circle cx="88" cy="76" r="3" fill="#FACC15" stroke="#854D0E" stroke-width="1"/>
        <path d="M 86 30 L 88 26 L 90 30 Z" fill="#E5E7EB" stroke="#374151" stroke-width="1"/>
      </g>`;
    default:
      return "";
  }
}

// Preload an image (for drawn heroes/bosses)
function useImageRef(dataURL) {
  const ref = useRef(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!dataURL) { ref.current = null; return; }
    const img = new Image();
    img.onload = () => { ref.current = img; force(n => n + 1); };
    img.src = dataURL;
  }, [dataURL]);
  return ref;
}

function drawHeroOnCanvas(ctx, hero, imgRef, x, y, size) {
  if (!hero) return;
  if (hero.kind === "preset") {
    const ch = CHARACTERS.find(c => c.id === hero.charId);
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.textBaseline = "top";
    ctx.fillText(ch?.emoji || "❓", x, y);
  } else if (hero.kind === "drawn") {
    if (imgRef.current) ctx.drawImage(imgRef.current, x, y, size, size);
  } else if (hero.kind === "described") {
    drawDescribedOnCanvas(ctx, hero, x, y, size);
  }
}
function drawBossOnCanvas(ctx, boss, imgRef, x, y, size) {
  if (!boss) return;
  if (boss.kind === "drawn") {
    if (imgRef.current) ctx.drawImage(imgRef.current, x, y, size, size);
  } else if (boss.kind === "described") {
    drawDescribedOnCanvas(ctx, boss, x, y, size);
  }
}

// Boss stat derivation
function bossStatsFor(boss, gameType) {
  // Base values per game
  const base = {
    runner:  { hits: 3, scoreOnWin: 20 },
    flying:  { hits: 5, scoreOnWin: 25 },
    maze:    { heartsNeeded: 1, scoreOnWin: 15 },
    puzzle:  { armor: 10, scoreOnWin: 20 },
  }[gameType];
  if (!boss || boss.kind === "drawn") return base;
  const power = boss.power;
  const out = { ...base };
  if (power === "tough") {
    if (out.hits) out.hits += 2;
    if (out.armor) out.armor += 6;
    if (out.heartsNeeded) out.heartsNeeded += 1;
    out.scoreOnWin += 10;
  }
  if (power === "fast") {
    out.scoreOnWin += 5;
    out.fast = true;
  }
  if (power === "angry") {
    out.scoreOnWin += 5;
    out.angry = true;
  }
  return out;
}

// ============================================================
// QUESTIONS
// ============================================================
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function genMath(age) {
  let a, b, op, ans;
  if (age <= 6) { a = 1 + Math.floor(Math.random()*5); b = 1 + Math.floor(Math.random()*5); op="+"; ans=a+b; }
  else if (age <= 8) {
    a = 2 + Math.floor(Math.random()*10); b = 1 + Math.floor(Math.random()*8);
    op = Math.random() > 0.5 ? "+" : "−";
    if (op === "−" && b > a) [a,b] = [b,a];
    ans = op === "+" ? a+b : a-b;
  } else {
    if (Math.random() < 0.4) { a = 2+Math.floor(Math.random()*9); b = 2+Math.floor(Math.random()*8); op="×"; ans=a*b; }
    else { a = 5+Math.floor(Math.random()*20); b = 2+Math.floor(Math.random()*10); op = Math.random()>0.5?"+":"−"; if (op==="−"&&b>a)[a,b]=[b,a]; ans = op==="+"?a+b:a-b; }
  }
  const ds = new Set();
  while (ds.size < 2) { const d = ans + (Math.random()>0.5?1:-1)*(1+Math.floor(Math.random()*4)); if (d !== ans && d >= 0) ds.add(d); }
  return { type:"math", prompt:`${a} ${op} ${b}`, answer:String(ans), choices:shuffle([ans,...ds]).map(String) };
}
function genSpelling(age) {
  const pools = {
    young: [["C_T","A"],["D_G","O"],["S_N","U"],["B_G","A"],["H_T","A"],["P_G","I"]],
    mid:   [["JU_P","M"],["STA_","R"],["FR_G","O"],["MO_N","O"],["TRE_","E"],["PLA_","Y"]],
    old:   [["CAST_E","L"],["DRA_ON","G"],["ROC_ET","K"],["PLA_ET","N"],["JU_GLE","N"]],
  };
  const pool = age <= 6 ? pools.young : age <= 8 ? pools.mid : pools.old;
  const [word, letter] = pool[Math.floor(Math.random()*pool.length)];
  const letters = new Set([letter]);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (letters.size < 3) letters.add(abc[Math.floor(Math.random()*26)]);
  return { type:"spelling", prompt:word.replace("_","◯"), answer:letter, choices:shuffle([...letters]) };
}
function nextQuestion(age) { return Math.random() > 0.45 ? genMath(age) : genSpelling(age); }

// ============================================================
// SMALL UI
// ============================================================
function BackButton({ onClick, label = "Back" }) {
  return (
    <button onClick={onClick}
      className="f-display text-base bg-white/80 px-4 py-2 rounded-full btn-chunky"
      style={{ color: "#1a1a3a" }}>← {label}</button>
  );
}

// Top nav shown on every screen. onBack is optional; onStartOver is required.
// Clicking Start Over opens a tiny confirmation since it throws away progress.
function NavBar({ onBack, onStartOver, onShare, dimmed = false }) {
  const [confirmStart, setConfirmStart] = useState(false);
  return (
    <div className="w-full flex items-center justify-between gap-2 mb-2" style={{ opacity: dimmed ? 0.75 : 1 }}>
      <div>{onBack ? <BackButton onClick={onBack} /> : <span />}</div>
      <div className="flex items-center gap-2">
        {onShare && (
          <button onClick={onShare}
            className="f-display text-base bg-white/80 px-4 py-2 rounded-full btn-chunky"
            style={{ color: "#1a1a3a" }}>Share ↗</button>
        )}
        {onStartOver && (
          <button onClick={() => setConfirmStart(true)}
            className="f-display text-base bg-white/80 px-4 py-2 rounded-full btn-chunky"
            style={{ color: "#1a1a3a" }}>↻ Start Over</button>
        )}
      </div>
      {confirmStart && (
        <div className="fixed inset-0 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.4)", zIndex: 50 }}>
          <div className="bg-white rounded-3xl p-6 card-3d max-w-sm w-full text-center">
            <p className="f-display text-2xl mb-3" style={{ color: "#1a1a3a" }}>Start over?</p>
            <p className="text-base mb-5" style={{ color: "#4a3a6a" }}>
              You'll lose this game and go back to the beginning.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmStart(false)}
                className="f-display text-lg bg-amber-50 px-5 py-3 rounded-full btn-chunky"
                style={{ color: "#1a1a3a" }}>Keep playing</button>
              <button onClick={() => { setConfirmStart(false); onStartOver(); }}
                className="f-display text-lg text-white px-5 py-3 rounded-full btn-chunky"
                style={{ background: "#EF4444" }}>Yes, start over</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ROOT
// ============================================================
export default function BuildableKids() {
  const [screen, setScreen] = useState("welcome");
  const [age, setAge] = useState(7);
  const [kidName, setKidName] = useState("");
  const [gameType, setGameType] = useState(null);
  const [hero, setHero] = useState(null);
  const [weapon, setWeapon] = useState(null);
  const [boss, setBoss] = useState(null);
  const [world, setWorld] = useState(null);
  const [goal, setGoal] = useState(null);
  const [level, setLevel] = useState(1);
  const [unlocks, setUnlocks] = useState([]);
  const [totalScore, setTotalScore] = useState(0);
  const [question, setQuestion] = useState(null);
  const [unlockChoices, setUnlockChoices] = useState([]);
  const [pickedUnlock, setPickedUnlock] = useState(null);

  const worldObj  = WORLDS.find(w => w.id === world);
  const gtObj     = GAME_TYPES.find(g => g.id === gameType);
  const weaponObj = WEAPONS.find(w => w.id === weapon);

  const afterHero = () => setScreen(gameType === "flying" ? "weapon" : "boss");
  const afterWeapon = () => setScreen("boss");
  const afterBoss = () => setScreen("world");

  const startQuestion = () => {
    const q = nextQuestion(age);
    setQuestion(q);
    const pool = UNLOCK_POOLS[gameType] || [];
    const available = UNLOCKS.filter(u => pool.includes(u.id) && !unlocks.includes(u.id));
    setUnlockChoices(shuffle(available).slice(0, 3));
    setPickedUnlock(null);
    setScreen("question");
  };

  const handleQuestionCorrect = () => setScreen("pickUnlock");
  const handleUnlockPick = (u) => {
    setUnlocks(prev => [...prev, u.id]);
    setPickedUnlock(u);
    setTimeout(() => setScreen("play"), 1400);
  };

  const handleLevelComplete = (score) => {
    setTotalScore(s => s + score);
    if (level === 1) { setLevel(2); setTimeout(startQuestion, 400); }
    else { setScreen("complete"); }
  };

  const restart = () => {
    setScreen("welcome"); setGameType(null); setHero(null);
    setWeapon(null); setBoss(null); setWorld(null); setGoal(null);
    setLevel(1); setUnlocks([]); setTotalScore(0);
    setQuestion(null); setPickedUnlock(null); setUnlockChoices([]);
    setKidName("");
  };

  // Global back-target map: what screen should "back" take us to from here?
  // Screens where back is not offered: welcome, play (mid-game), generating (async).
  const backTargetFor = (s) => {
    const map = {
      type: "welcome",
      character: "type",
      heroPick: "character",
      heroDescribe: "character",
      weapon: "character",
      boss: gameType === "flying" ? "weapon" : "character",
      bossPick: "boss",
      bossDescribe: "boss",
      world: "boss",
      goal: "world",
      question: null,
      pickUnlock: null,
      play: null,
      generating: null,
      complete: null,
    };
    return map[s] ?? null;
  };
  const showStartOver = screen !== "welcome";
  const onBack = backTargetFor(screen) ? () => setScreen(backTargetFor(screen)) : null;

  return (
    <>
      <style>{STYLES}</style>
      <div className="no-tap f-body min-h-screen w-full flex flex-col items-center p-4"
           style={{ background: "radial-gradient(ellipse at top, #FFF3C4 0%, #FFE08A 40%, #FFC857 100%)" }}>
        <div className="w-full max-w-5xl">
          <NavBar onBack={onBack} onStartOver={showStartOver ? restart : null} />
          {screen === "welcome" && (
            <WelcomeScreen age={age} setAge={setAge} kidName={kidName} setKidName={setKidName} onNext={() => setScreen("type")} />
          )}
          {screen === "type" && (
            <GameTypeScreen onPick={(id) => { setGameType(id); setScreen("character"); }} />
          )}
          {screen === "character" && (
            <CharacterPicker
              onDescribe={() => setScreen("heroDescribe")}
              onPickElements={() => setScreen("heroPick")} />
          )}
          {screen === "heroPick" && (
            <PickElementsScreen kind="hero"
              onDone={(picks) => { setHero({ kind: "described", ...picks }); afterHero(); }} />
          )}
          {screen === "heroDescribe" && (
            <DescribeScreen kind="hero"
              onDone={(picks) => { setHero({ kind: "described", ...picks }); afterHero(); }} />
          )}
          {screen === "weapon" && (
            <WeaponPicker onPick={(id) => { setWeapon(id); afterWeapon(); }} />
          )}
          {screen === "boss" && (
            <BossBuilderIntro
              onDescribe={() => setScreen("bossDescribe")}
              onPickElements={() => setScreen("bossPick")} />
          )}
          {screen === "bossPick" && (
            <PickElementsScreen kind="boss"
              onDone={(picks) => { setBoss({ kind: "described", ...picks }); afterBoss(); }} />
          )}
          {screen === "bossDescribe" && (
            <DescribeScreen kind="boss"
              onDone={(picks) => { setBoss({ kind: "described", ...picks }); afterBoss(); }} />
          )}
          {screen === "world" && (
            <PickerScreen title="Pick your world" subtitle="Where does the story happen?"
              items={WORLDS} big
              onPick={(id) => { setWorld(id); setScreen("goal"); }} />
          )}
          {screen === "goal" && (
            <PickerScreen title="Pick your goal" subtitle="What will you do to win?"
              items={GOALS}
              onPick={(id) => { setGoal(id); setScreen("generating"); }} />
          )}
          {screen === "generating" && (
            <GeneratingScreen gtObj={gtObj} hero={hero} boss={boss} kidName={kidName}
              worldObj={worldObj} weaponObj={weaponObj} onDone={startQuestion} />
          )}
          {screen === "question" && (
            <QuestionScreen question={question} level={level} kidName={kidName} onCorrect={handleQuestionCorrect} />
          )}
          {screen === "pickUnlock" && (
            <UnlockPickerScreen choices={unlockChoices} picked={pickedUnlock} kidName={kidName}
              gameType={gameType} onPick={handleUnlockPick} />
          )}
          {screen === "play" && (
            <PlayScreen level={level} gameType={gameType} hero={hero} boss={boss} kidName={kidName}
              worldObj={worldObj} weaponObj={weaponObj} goalId={goal}
              unlocks={unlocks} onComplete={handleLevelComplete} />
          )}
          {screen === "complete" && (
            <CompleteScreen score={totalScore} unlocks={unlocks} hero={hero} boss={boss} kidName={kidName}
              worldObj={worldObj} gtObj={gtObj} onRestart={restart} />
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// SETUP SCREENS
// ============================================================
function WelcomeScreen({ age, setAge, kidName, setKidName, onNext }) {
  const device = useDeviceClass();
  // Keep input kid-safe: letters + spaces + apostrophes/hyphens only, max 12 chars.
  // Name stays in local React state — never leaves the device.
  const handleNameChange = (e) => {
    const cleaned = e.target.value.replace(/[^A-Za-z' \-]/g, "").slice(0, 12);
    setKidName(cleaned);
  };
  const trimmed = kidName.trim();
  const nameBlocked = trimmed.length > 0 && containsInappropriate(trimmed);
  const showGreeting = trimmed.length > 0 && !nameBlocked;
  const canProceed = !nameBlocked && age > 0;
  return (
    <div className="flex flex-col items-center text-center gap-6 anim-slide-up">
      {device.ready && device.isPhone && (
        <div className="w-full max-w-md bg-white/80 rounded-2xl px-4 py-3 text-sm flex items-center gap-2 card-3d"
             style={{ color: "#4a3a6a" }}>
          <span className="text-xl">📱</span>
          <span>Tip: Buildable Kids works best on iPad! Phone works too — just turn it sideways.</span>
        </div>
      )}
      <div className="anim-wiggle text-8xl">🎮</div>
      <div>
        <h1 className="f-display text-6xl md:text-7xl" style={{ color: "#1a1a3a" }}>Buildable Kids</h1>
        <p className="text-xl md:text-2xl mt-3" style={{ color: "#4a3a6a" }}>Build your own game in 3 minutes!</p>
      </div>
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md card-3d">
        <p className="f-display text-2xl mb-3" style={{ color: "#1a1a3a" }}>What's your name?</p>
        <input
          type="text"
          value={kidName}
          onChange={handleNameChange}
          placeholder="Your first name"
          aria-label="Your first name"
          autoComplete="off"
          spellCheck={false}
          className="f-display text-3xl w-full text-center py-3 rounded-2xl border-4 outline-none"
          style={{
            color: "#1a1a3a",
            background: nameBlocked ? "#FEE2E2" : "#FFFBEB",
            borderColor: nameBlocked ? "#EF4444" : "#FCD34D",
          }}
        />
        {nameBlocked ? (
          <p className="text-sm mt-2 f-display" style={{ color: "#B91C1C" }}>
            Try your real first name 😊
          </p>
        ) : (
          <p className="text-xs mt-2" style={{ color: "#8a7a9a" }}>Just your first name — stays on this device.</p>
        )}
      </div>
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md card-3d">
        <p className="f-display text-2xl mb-4" style={{ color: "#1a1a3a" }}>
          {showGreeting ? `How old are you, ${trimmed}?` : "How old are you?"}
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[5,6,7,8,9,10,11,12].map(a => (
            <button key={a} onClick={() => setAge(a)}
              className={`f-display text-3xl py-4 rounded-2xl btn-chunky transition ${age===a?"text-white":"bg-amber-50 text-amber-900"}`}
              style={age===a ? {background:"#FF8A3D"} : undefined}>{a}</button>
          ))}
        </div>
      </div>
      <button onClick={canProceed ? onNext : undefined}
        disabled={!canProceed}
        className="f-display text-3xl text-white px-14 py-5 rounded-full btn-chunky anim-pulse-glow disabled:opacity-40"
        style={{ background: "#1a1a3a" }}>
        {showGreeting ? `Let's build, ${trimmed}! →` : "Let's build! →"}
      </button>
    </div>
  );
}

function GameTypeScreen({ onPick }) {
  return (
    <div className="text-center anim-slide-up">
      <h2 className="f-display text-5xl md:text-6xl mb-2" style={{ color: "#1a1a3a" }}>Pick your game</h2>
      <p className="text-xl mb-8" style={{ color: "#4a3a6a" }}>Four totally different ways to play!</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {GAME_TYPES.map((gt, i) => (
          <button key={gt.id} onClick={() => onPick(gt.id)}
            className="p-6 rounded-3xl card-3d text-white flex flex-col items-center gap-2 anim-slide-up"
            style={{ background: gt.color, animationDelay: `${i * 0.06}s` }}>
            <div className="text-6xl anim-float">{gt.emoji}</div>
            <div className="f-display text-3xl">{gt.name}</div>
            <div className="text-sm opacity-95 px-1">{gt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CharacterPicker({ onDescribe, onPickElements }) {
  return (
    <div className="text-center anim-slide-up">
      <h2 className="f-display text-5xl md:text-6xl mb-2" style={{ color: "#1a1a3a" }}>Make your hero!</h2>
      <p className="text-xl mb-8" style={{ color: "#4a3a6a" }}>Two ways to build — pick whichever feels easier!</p>

      {/* Primary path: describe in words (the "talk to AI" experience) */}
      <button onClick={onDescribe}
        className="w-full p-6 md:p-8 rounded-3xl card-3d flex flex-col md:flex-row items-center gap-4 anim-slide-up text-white text-left"
        style={{ background: "linear-gradient(135deg, #A855F7 0%, #EC4899 100%)" }}>
        <div className="text-7xl md:text-8xl anim-float">💬</div>
        <div className="flex-1 text-center md:text-left">
          <div className="f-display text-3xl md:text-4xl">Describe it in words</div>
          <div className="text-base md:text-lg opacity-95 mt-1">Type whatever you want — just like talking to an AI!</div>
          <div className="text-sm opacity-80 mt-2">Try: "a tiny fluffy pink dragon with sparkly wings"</div>
        </div>
      </button>

      {/* Secondary path: pick from chips (faster for stuck kids) */}
      <button onClick={onPickElements}
        className="w-full p-5 md:p-6 mt-4 rounded-3xl card-3d flex items-center gap-4 anim-slide-up text-white text-left"
        style={{ background: "linear-gradient(135deg, #3DB8FF 0%, #2ECC71 100%)", animationDelay: "0.08s" }}>
        <div className="text-6xl anim-wiggle">🎨</div>
        <div className="flex-1">
          <div className="f-display text-2xl md:text-3xl">Pick from pictures</div>
          <div className="text-sm md:text-base opacity-95 mt-1">Tap a color, a creature, and a power — done!</div>
        </div>
      </button>
    </div>
  );
}

function WeaponPicker({ onPick }) {
  return (
    <div className="text-center anim-slide-up">
        <h2 className="f-display text-5xl md:text-6xl mb-2" style={{ color: "#1a1a3a" }}>Pick your blaster!</h2>
        <p className="text-xl mb-8" style={{ color: "#4a3a6a" }}>It shoots all by itself while you fly ✨</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {WEAPONS.map((w, i) => (
            <button key={w.id} onClick={() => onPick(w.id)}
              className="bg-white p-6 rounded-3xl card-3d flex flex-col items-center gap-2 anim-slide-up"
              style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="text-6xl anim-wiggle" style={{ color: w.color }}>{w.emoji}</div>
              <div className="f-display text-xl" style={{ color: "#1a1a3a" }}>{w.name}</div>
              <div className="text-sm" style={{ color: "#4a3a6a" }}>{w.desc}</div>
            </button>
          ))}
        </div>
    </div>
  );
}

function BossBuilderIntro({ onDescribe, onPickElements }) {
  return (
    <div className="text-center anim-slide-up">
      <h2 className="f-display text-5xl md:text-6xl mb-2" style={{ color: "#1a1a3a" }}>Make your bad guy!</h2>
      <p className="text-xl mb-4" style={{ color: "#4a3a6a" }}>
        They'll show up at the end of Level 2. You have to beat them!
      </p>
      <div className="flex justify-center mb-6 text-4xl gap-2 anim-wiggle">
        <span>😈</span><span>👾</span><span>🐉</span>
      </div>

      <button onClick={onDescribe}
        className="w-full p-6 md:p-8 rounded-3xl card-3d flex flex-col md:flex-row items-center gap-4 anim-slide-up text-white text-left"
        style={{ background: "linear-gradient(135deg, #7C2D12 0%, #A855F7 100%)" }}>
        <div className="text-7xl md:text-8xl anim-float">💬</div>
        <div className="flex-1 text-center md:text-left">
          <div className="f-display text-3xl md:text-4xl">Describe it in words</div>
          <div className="text-base md:text-lg opacity-95 mt-1">Type your scariest monster!</div>
          <div className="text-sm opacity-80 mt-2">Try: "a tough green dragon with fiery breath"</div>
        </div>
      </button>

      <button onClick={onPickElements}
        className="w-full p-5 md:p-6 mt-4 rounded-3xl card-3d flex items-center gap-4 anim-slide-up text-white text-left"
        style={{ background: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)", animationDelay: "0.08s" }}>
        <div className="text-6xl anim-wiggle">🎨</div>
        <div className="flex-1">
          <div className="f-display text-2xl md:text-3xl">Pick from pictures</div>
          <div className="text-sm md:text-base opacity-95 mt-1">Tap a color, a creature, a feature, and a power!</div>
        </div>
      </button>
    </div>
  );
}

// Shared "Draw" screen (used for hero AND boss)
function DrawScreen({ title, color, onDone }) {
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const [penColor, setPenColor] = useState("#1a1a3a");
  const [hasDrawn, setHasDrawn] = useState(false);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  const colors = ["#1a1a3a","#FF8A3D","#3DB8FF","#2ECC71","#FFD93D","#FF6B9D","#A78BFA","#EF4444"];

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 18;
  }, []);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const start = (e) => {
    e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true; const p = getPos(e); lastPtRef.current = p;
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = penColor; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI*2); ctx.fill();
    setHasDrawn(true);
  };
  const move = (e) => {
    if (!drawingRef.current) return; e.preventDefault();
    const ctx = canvasRef.current.getContext("2d"); const p = getPos(e);
    ctx.strokeStyle = penColor; ctx.beginPath();
    ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastPtRef.current = p;
  };
  const end = () => {
    drawingRef.current = false;
    if (previewRef.current && canvasRef.current) {
      const pctx = previewRef.current.getContext("2d");
      pctx.clearRect(0, 0, previewRef.current.width, previewRef.current.height);
      pctx.drawImage(canvasRef.current, 0, 0, previewRef.current.width, previewRef.current.height);
    }
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    if (previewRef.current) previewRef.current.getContext("2d").clearRect(0, 0, previewRef.current.width, previewRef.current.height);
    setHasDrawn(false);
  };
  const done = () => onDone(canvasRef.current.toDataURL("image/png"));

  return (
    <div className="text-center anim-slide-up flex flex-col items-center gap-4">
      <h2 className="f-display text-4xl md:text-5xl" style={{ color: "#1a1a3a" }}>{title}</h2>
      <div className="flex items-center gap-4 flex-wrap justify-center">
        <div className="bg-white p-2 rounded-3xl card-3d">
          <canvas ref={canvasRef} width={360} height={360}
            className="draw-canvas block rounded-2xl"
            style={{ background: "repeating-linear-gradient(45deg, #FFF9E6, #FFF9E6 12px, #FFF3C4 12px, #FFF3C4 24px)" }}
            onPointerDown={start} onPointerMove={move}
            onPointerUp={end} onPointerCancel={end}
            onPointerLeave={(e)=>{ if(drawingRef.current) end(e); }} />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="f-display text-sm" style={{ color: "#4a3a6a" }}>In-game size:</div>
          <div className="bg-white rounded-2xl p-2 card-3d">
            <canvas ref={previewRef} width={80} height={80} className="block rounded-xl"
              style={{ background: "linear-gradient(#7fd86e,#4ab848)" }} />
          </div>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap justify-center mt-2">
        {colors.map((col) => (
          <button key={col} onClick={() => setPenColor(col)}
            className={`w-12 h-12 rounded-full btn-chunky transition ${col===penColor?"ring-4 ring-amber-900 scale-110":""}`}
            style={{ background: col }} aria-label="Pick color" />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <button onClick={clear} className="f-display text-xl bg-white px-6 py-3 rounded-full btn-chunky" style={{ color: "#1a1a3a" }}>Clear ✖</button>
        <button onClick={done} disabled={!hasDrawn}
          className="f-display text-xl text-white px-8 py-3 rounded-full btn-chunky disabled:opacity-40"
          style={{ background: color }}>That's it! ✓</button>
      </div>
    </div>
  );
}

// Shared "Describe" screen — chip-based prompt builder
// New prompt-based describe flow. Kid types words into blanks.
// Each blank validates against SAFE_WORDS allowlist.
// Suggestions below each blank let a stuck kid tap-to-fill.
// Chip-based picker — the alternative to DescribeScreen for kids who prefer
// tapping over typing. Produces the same entity shape so downstream code
// (stats, rendering, save state) works identically.
function PickElementsScreen({ kind, onDone }) {
  const isBoss = kind === "boss";
  const [picks, setPicks] = useState({
    color: null,
    body: null,
    feature: null,
    power: null,
    accessory: null,
    style: null,
  });

  // Hero needs color + body. Boss needs color + body + feature + power.
  const complete = picks.color && picks.body && (!isBoss || (picks.feature && picks.power));

  const handleDone = () => {
    if (!complete) return;
    onDone(picks);
  };

  const setPick = (bucket, id) => {
    setPicks(p => ({ ...p, [bucket]: p[bucket] === id ? null : id }));
  };

  // Accessory chips (small inline list — same canonical ids as ACCESSORY_INDEX)
  const ACCESSORY_CHIPS = [
    { id: "cape",  emoji: "🦸",  label: "a cape" },
    { id: "wings", emoji: "🦋",  label: "wings"  },
    { id: "hat",   emoji: "🎩",  label: "a hat"  },
    { id: "sword", emoji: "⚔️",  label: "a sword"},
  ];

  // Style chips
  const STYLE_CHIPS = [
    { id: "tiny",    emoji: "🐭", label: "tiny"   },
    { id: "big",     emoji: "🦣", label: "big"    },
    { id: "fluffy",  emoji: "☁️", label: "fluffy" },
    { id: "spiky",   emoji: "🌵", label: "spiky"  },
    { id: "stripey", emoji: "🐅", label: "stripey"},
    { id: "silly",   emoji: "🤪", label: "silly"  },
  ];

  const previewEntity = picks.body ? picks : null;

  return (
    <div className="text-center anim-slide-up">
      <h2 className="f-display text-4xl md:text-5xl mb-1" style={{ color: "#1a1a3a" }}>
        {isBoss ? "Build your bad guy!" : "Build your hero!"}
      </h2>
      <p className="text-base mb-5" style={{ color: "#4a3a6a" }}>
        Tap to pick. You can change your mind anytime!
      </p>

      <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto items-start mb-4">
        <div className="md:col-span-2 bg-white rounded-3xl p-4 card-3d text-left space-y-4">
          {/* Creature chips */}
          <ChipPickSection
            title="Pick a creature"
            chips={BODY_CHIPS}
            selected={picks.body}
            onPick={(id) => setPick("body", id)}
            renderChip={(c) => <><span className="text-2xl">{c.emoji}</span><span className="ml-1">{c.label}</span></>}
          />

          {/* Color chips — color swatches */}
          <ChipPickSection
            title="Pick a color"
            chips={COLOR_CHIPS}
            selected={picks.color}
            onPick={(id) => setPick("color", id)}
            renderChip={(c) => (
              <>
                <span style={{
                  display:"inline-block", width:18, height:18, borderRadius:"50%",
                  background: c.id === "rainbow"
                    ? "conic-gradient(#EF4444,#F97316,#FACC15,#22C55E,#3B82F6,#A855F7,#EC4899,#EF4444)"
                    : c.tint,
                  verticalAlign:"middle", marginRight:6,
                }} />
                <span>{c.label}</span>
              </>
            )}
          />

          {/* Feature chips — optional for hero, required for boss */}
          <ChipPickSection
            title={isBoss ? "Pick a magic power" : "Pick a magic power (optional)"}
            chips={FEATURE_CHIPS}
            selected={picks.feature}
            onPick={(id) => setPick("feature", id)}
            renderChip={(c) => <><span className="text-2xl">{c.emoji}</span><span className="ml-1">{c.label}</span></>}
          />

          {/* Power chips — boss only */}
          {isBoss && (
            <ChipPickSection
              title="How tough are they?"
              chips={POWER_CHIPS}
              selected={picks.power}
              onPick={(id) => setPick("power", id)}
              renderChip={(c) => <><span className="text-2xl">{c.emoji}</span><span className="ml-1">{c.label}</span></>}
            />
          )}

          {/* Accessory chips — optional */}
          <ChipPickSection
            title="Add an accessory (optional)"
            chips={ACCESSORY_CHIPS}
            selected={picks.accessory}
            onPick={(id) => setPick("accessory", id)}
            renderChip={(c) => <><span className="text-2xl">{c.emoji}</span><span className="ml-1">{c.label}</span></>}
          />

          {/* Style chips — optional */}
          <ChipPickSection
            title="How does it look? (optional)"
            chips={STYLE_CHIPS}
            selected={picks.style}
            onPick={(id) => setPick("style", id)}
            renderChip={(c) => <><span className="text-2xl">{c.emoji}</span><span className="ml-1">{c.label}</span></>}
          />
        </div>

        {/* Live preview */}
        <div className="flex justify-center">
          <div className="bg-white rounded-3xl p-4 card-3d flex items-center justify-center sticky top-4"
               style={{ width: 160, height: 160 }}>
            {previewEntity
              ? <CreatureSVG entity={previewEntity} size={130} />
              : <span className="f-display text-5xl opacity-30">?</span>}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button onClick={handleDone} disabled={!complete}
          className="f-display text-2xl text-white px-10 py-4 rounded-full btn-chunky disabled:opacity-40"
          style={{ background: isBoss ? "#EF4444" : "#2ECC71" }}>
          {complete ? "Bring it to life! ✨" : isBoss ? "Pick a creature, color, power, and toughness" : "Pick a creature and color"}
        </button>
      </div>
    </div>
  );
}

// Single section of chip picker: title + a row of tappable chips.
// Selected chip is highlighted; tapping again deselects.
function ChipPickSection({ title, chips, selected, onPick, renderChip }) {
  return (
    <div>
      <div className="f-display text-base mb-2" style={{ color: "#1a1a3a" }}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {chips.map(c => {
          const isSelected = selected === c.id;
          return (
            <button key={c.id} onClick={() => onPick(c.id)}
              className="f-display text-sm px-3 py-2 rounded-full btn-chunky transition"
              style={{
                background: isSelected ? "#FFD93D" : "white",
                color: "#1a1a3a",
                border: `2px solid ${isSelected ? "#854D0E" : "#E5E7EB"}`,
                transform: isSelected ? "scale(1.05)" : "scale(1)",
              }}>
              {renderChip(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DescribeScreen({ kind, onDone }) {
  const isBoss = kind === "boss";
  const [text, setText] = useState("");
  const placeholder = isBoss
    ? "a tough purple monster with fire..."
    : "a fluffy pink dragon with sparkly wings...";

  // Parse the sentence: split into words, resolve each against the allowlist.
  // Each bucket is first-match-wins so the kid's order of words matters a little.
  const parsed = parsePrompt(text, isBoss);
  const resolved = {
    color: parsed.picks.color,
    body: parsed.picks.body,
    feature: parsed.picks.feature,
    power: parsed.picks.power,
    style: parsed.picks.style,
    accessory: parsed.picks.accessory,
  };
  // Hero needs color + body (feature is optional — some creatures don't need magic).
  // Boss needs color + body + feature + power (needs the full set for stats).
  // Style and accessory are always optional cosmetic extras.
  const complete = resolved.color && resolved.body
                   && (!isBoss || (resolved.feature && resolved.power))
                   && !parsed.hasBlocked;

  const handleChange = (e) => {
    // Kid-safe input hygiene: letters, spaces, basic punctuation. No digits, no
    // special chars, cap 60 chars total. Case preserved for display but parser
    // is case-insensitive.
    const cleaned = e.target.value.replace(/[^A-Za-z ,.!'-]/g, "").slice(0, 60);
    setText(cleaned);
  };

  const handleDone = () => {
    if (!complete) return;
    onDone({
      color: resolved.color,
      body: resolved.body,
      feature: resolved.feature,
      power: resolved.power,
      style: resolved.style,
      accessory: resolved.accessory,
    });
  };

  const pickSuggestion = (word) => {
    // Append the suggestion to the current text.
    const sep = text.length === 0 ? "" : (text.endsWith(" ") ? "" : " ");
    const next = (text + sep + word).slice(0, 60);
    setText(next);
  };

  const previewEntity = resolved.body ? {
    description: text,
    color: resolved.color, body: resolved.body,
    feature: resolved.feature, style: resolved.style,
    power: resolved.power, accessory: resolved.accessory,
  } : null;

  return (
    <div className="text-center anim-slide-up">
      <h2 className="f-display text-4xl md:text-5xl mb-1" style={{ color: "#1a1a3a" }}>
        {isBoss ? "Describe your bad guy!" : "Describe your hero!"}
      </h2>
      <p className="text-base mb-2" style={{ color: "#4a3a6a" }}>
        Type whatever you want — just like talking to an AI!
      </p>
      <p className="text-sm mb-5" style={{ color: "#8a7a9a" }}>
        💡 AI tip: add more words to make the picture better.
      </p>

      {/* Main textbox + live preview */}
      <div className="grid md:grid-cols-3 gap-4 items-start mb-4 max-w-3xl mx-auto">
        <div className="md:col-span-2 bg-white rounded-3xl p-5 card-3d text-left">
          <textarea
            value={text}
            onChange={handleChange}
            placeholder={placeholder}
            aria-label={isBoss ? "Describe your bad guy" : "Describe your hero"}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={2}
            className="f-display text-xl md:text-2xl w-full px-3 py-2 rounded-xl outline-none resize-none"
            style={{
              border: "3px solid #E5E7EB",
              background: "#F9FAFB",
              color: "#1a1a3a",
            }}
          />
          {/* Word-by-word feedback. Two pill states after the blocklist:
              - mapped: green ✓ (affects the visual)
              - extra:  teal ✓ (accepted but no visual mapping)
              Stop words and blocklisted words are filtered out — blocklisted
              words are intentionally NOT echoed back to avoid amplifying
              inappropriate input. */}
          {parsed.tokens.filter(t => t.state === "mapped" || t.state === "extra").length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {parsed.tokens.filter(t => t.state === "mapped" || t.state === "extra").map((tok, i) => {
                const style = tok.state === "mapped"
                  ? { bg: "#DCFCE7", text: "#166534", border: "#22C55E", mark: "✓" }
                  : { bg: "#CCFBF1", text: "#115E59", border: "#14B8A6", mark: "✓" };
                return (
                  <span key={i}
                    className="f-display text-sm px-2 py-1 rounded-full"
                    style={{ background: style.bg, color: style.text, border: `1.5px solid ${style.border}` }}>
                    {style.mark} {tok.word}
                  </span>
                );
              })}
            </div>
          )}
          {/* Blocklist banner — shown when any typed word hits the blocklist.
              We don't say WHICH word, just that some words need changing. */}
          {parsed.hasBlocked && (
            <div className="mt-3 p-3 rounded-xl f-display text-sm"
                 style={{ background: "#FEE2E2", color: "#991B1B", border: "1.5px solid #EF4444" }}>
              Let's try different words — pick kind, fun ones! 😊
            </div>
          )}
          {/* Missing-slot hints — tells kid what AI still needs */}
          {text.length > 0 && !complete && !parsed.hasBlocked && (
            <p className="text-sm mt-3" style={{ color: "#4a3a6a" }}>
              {!resolved.color && <span>✨ add a <b>color</b> · </span>}
              {!resolved.body && <span>✨ add a <b>creature</b> · </span>}
              {isBoss && !resolved.feature && <span>✨ add a <b>feature</b> · </span>}
              {isBoss && !resolved.power && <span>✨ add a <b>power</b></span>}
            </p>
          )}
        </div>
        <div className="flex justify-center">
          <div className="bg-white rounded-3xl p-4 card-3d flex items-center justify-center" style={{ width: 150, height: 150 }}>
            {previewEntity
              ? <CreatureSVG entity={previewEntity} size={120} />
              : <span className="f-display text-5xl opacity-30">?</span>}
          </div>
        </div>
      </div>

      {/* Rotating suggestions: tap to append */}
      <div className="max-w-3xl mx-auto mb-4">
        <div className="f-display text-sm mb-2" style={{ color: "#4a3a6a" }}>
          Stuck? Tap a word to add it:
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestionsForState(resolved, isBoss).map(w => (
            <button key={w} onClick={() => pickSuggestion(w)}
              className="f-display bg-white px-3 py-1 rounded-full btn-chunky text-base"
              style={{ color: "#1a1a3a" }}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <button onClick={handleDone} disabled={!complete}
          className="f-display text-2xl text-white px-10 py-4 rounded-full btn-chunky disabled:opacity-40"
          style={{ background: isBoss ? "#EF4444" : "#2ECC71" }}>
          {complete ? "Bring it to life! ✨" : "Keep describing..."}
        </button>
      </div>
    </div>
  );
}

// Tokenize a free-form prompt and classify each word into one of four states:
//   "mapped"  → word resolved to a SAFE_WORDS bucket (affects picks/visuals)
//   "extra"   → word in ACCEPTED_EXTRAS set (accepted, no visual effect)
//   "stop"    → word in STOP_WORDS (silently ignored, not shown in pills)
//   "unknown" → anything else (shown gently as "new word", not rejected)
// Returns { tokens: [{word, state, bucket?, id?}], picks: {...} }
// Visual accessories — a subset of ACCEPTED_EXTRAS that do have renderers.
// Synonyms map to canonical accessory ids.
const ACCESSORY_MAP = {
  cape:   ["cape", "capes", "cloak", "mantle"],
  wings:  ["wings", "wing", "pair-of-wings"],
  hat:    ["hat", "hats", "tophat", "cap", "beanie", "fedora"],
  sword:  ["sword", "swords", "blade", "katana", "sabre", "saber"],
};
const ACCESSORY_INDEX = (() => {
  const idx = {};
  for (const canonical of Object.keys(ACCESSORY_MAP)) {
    for (const syn of ACCESSORY_MAP[canonical]) idx[syn] = canonical;
  }
  return idx;
})();

function parsePrompt(raw, isBoss) {
  const words = raw.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 0);
  const picks = { color: null, body: null, feature: null, power: null, style: null, accessory: null };
  const tokens = [];
  let hasBlocked = false;
  for (const word of words) {
    // First line of defense: blocklist check. If a word is blocklisted, we
    // mark it as "blocked" but do NOT echo it back in the UI — the render
    // layer filters these out. The overall prompt gets a gentle banner.
    if (isBlockedWord(word)) {
      hasBlocked = true;
      tokens.push({ word, state: "blocked" });
      continue;
    }
    if (STOP_WORDS.has(word)) {
      tokens.push({ word, state: "stop" });
      continue;
    }
    const hit = WORD_INDEX[word];
    if (hit) {
      if (!picks[hit.bucket]) picks[hit.bucket] = hit.id;
      tokens.push({ word, state: "mapped", bucket: hit.bucket, id: hit.id });
      continue;
    }
    // Accessories count as a mapped pick (fills the accessory slot) so a
    // kid who types "cape" actually sees a cape rendered on the creature.
    const accessoryHit = ACCESSORY_INDEX[word];
    if (accessoryHit) {
      if (!picks.accessory) picks.accessory = accessoryHit;
      tokens.push({ word, state: "mapped", bucket: "accessory", id: accessoryHit });
      continue;
    }
    // Any word that's not mapped, not a stop word, and not blocklisted
    // counts as "heard" — accepted into the prompt with a teal ✓ pill.
    // No visual effect, but the kid feels their word was received.
    tokens.push({ word, state: "extra" });
  }
  return { tokens, picks, hasBlocked };
}

// Show suggestions targeted at what the kid is missing.
// Once a slot is filled, suggest words for the next unfilled slot.
function suggestionsForState(resolved, isBoss) {
  if (!resolved.body) return SUGGESTIONS.body || [];
  if (!resolved.color) return SUGGESTIONS.color || [];
  if (!resolved.feature) return SUGGESTIONS.feature || [];
  if (isBoss && !resolved.power) return SUGGESTIONS.power || [];
  // All filled — offer style descriptors to flavor the creature
  return ["tiny", "big", "fluffy", "spiky", "bumpy", "stripey", "slimy", "silly"];
}


// Single fill-in-the-blank input. Shows a ✓ when the word resolves,
// a gentle "?" with a hint when something's typed but not recognized.
function PromptBlank({ value, onChange, resolved, bucket, hint, placeholder, width = 120 }) {
  const isTyped = value.length > 0;
  const isValid = !!resolved;
  const showHint = isTyped && !isValid;
  // Color states: neutral (empty), green (valid), amber (unknown word)
  const borderColor = isValid ? "#22C55E" : showHint ? "#F59E0B" : "#E5E7EB";
  const bgColor = isValid ? "#DCFCE7" : showHint ? "#FEF3C7" : "#F9FAFB";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ position: "relative", display: "inline-block" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="f-display text-lg md:text-xl px-3 py-1 rounded-xl outline-none"
          style={{
            width,
            border: `3px solid ${borderColor}`,
            background: bgColor,
            color: "#1a1a3a",
            textAlign: "center",
          }}
        />
        {isValid && (
          <span style={{
            position: "absolute", right: -6, top: -10, fontSize: 18,
          }}>✓</span>
        )}
      </span>
      {showHint && (
        <span title={hint} className="f-display text-xs" style={{ color: "#B45309" }}>
          {hint}
        </span>
      )}
    </span>
  );
}

// Tappable suggestion pills. Fades out once the kid has filled this blank.
function SuggestionRow({ label, bucket, onPick, active }) {
  const suggestions = SUGGESTIONS[bucket] || [];
  return (
    <div className="max-w-3xl mx-auto mb-3" style={{ opacity: active ? 1 : 0.45 }}>
      <div className="f-display text-sm text-left mb-1" style={{ color: "#4a3a6a" }}>
        {label} {!active && "✓"}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {suggestions.map(w => (
          <button key={w} onClick={() => onPick(w)}
            className="f-display bg-white px-3 py-1 rounded-full btn-chunky text-base"
            style={{ color: "#1a1a3a" }}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

function WordSlot({ picked, chips }) {
  const chip = chips.find(c => c.id === picked);
  const style = picked && chips === COLOR_CHIPS
    ? { background: chip.tint, color: "#fff" }
    : picked
      ? { background: "#FFE08A", color: "#1a1a3a" }
      : { background: "#E5E7EB", color: "#9CA3AF", fontStyle: "italic" };
  return (
    <span className="inline-block px-3 py-1 rounded-xl f-display" style={style}>
      {chip ? (chip.emoji ? `${chip.emoji} ${chip.label}` : chip.label) : "_____"}
    </span>
  );
}

function ChipRow({ label, chips, picked, onPick, swatch = false }) {
  return (
    <div className="max-w-3xl mx-auto mb-3">
      <div className="f-display text-sm text-left mb-1" style={{ color: "#4a3a6a" }}>{label}</div>
      <div className="flex flex-wrap gap-2 justify-center">
        {chips.map(c => {
          const isSel = picked === c.id;
          return (
            <button key={c.id} onClick={() => onPick(c.id)}
              className={`f-display px-4 py-2 rounded-full btn-chunky transition flex items-center gap-2
                ${isSel ? "scale-110 text-white" : "bg-white"}`}
              style={isSel
                ? (c.tint ? { background: c.tint, color: "#fff" } : { background: "#1a1a3a" })
                : { color: "#1a1a3a" }}>
              {swatch && c.tint && (
                <span style={{
                  display: "inline-block", width: 16, height: 16, borderRadius: "50%",
                  background: c.tint, border: "2px solid white"
                }} />
              )}
              {c.emoji && <span className="text-xl">{c.emoji}</span>}
              <span className="text-base">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PickerScreen({ title, subtitle, items, onPick, big = false }) {
  return (
    <div className="text-center anim-slide-up">
        <h2 className="f-display text-5xl md:text-6xl mb-2" style={{ color: "#1a1a3a" }}>{title}</h2>
        <p className="text-xl mb-8" style={{ color: "#4a3a6a" }}>{subtitle}</p>
        <div className={`grid ${big?"grid-cols-2":"grid-cols-2 md:grid-cols-3"} gap-4`}>
          {items.map((it, i) => (
            <button key={it.id} onClick={() => onPick(it.id)}
              className="bg-white p-6 rounded-3xl card-3d flex flex-col items-center gap-2 anim-slide-up"
              style={{ animationDelay: `${i * 0.06}s` }}>
              <div className={`${big?"text-7xl":"text-6xl"} anim-float`}>{it.emoji}</div>
              <div className="f-display text-2xl" style={{ color: "#1a1a3a" }}>{it.name}</div>
            </button>
          ))}
        </div>
    </div>
  );
}

function GeneratingScreen({ gtObj, hero, boss, kidName, worldObj, weaponObj, onDone }) {
  const [step, setStep] = useState(0);
  const name = kidName?.trim();
  const steps = [
    name ? `Mixing ingredients for ${name}…` : "Mixing ingredients…",
    "Drawing the world…",
    "Teaching the hero…",
    "Waking the bad guy…",
    "Almost ready!",
  ];
  useEffect(() => {
    if (step >= steps.length) { setTimeout(onDone, 400); return; }
    const t = setTimeout(() => setStep(step + 1), 600);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <div className="text-center flex flex-col items-center gap-6 anim-slide-up">
      <div className="flex items-center justify-center gap-4">
        <div className="bg-white rounded-3xl p-4 card-3d anim-wiggle">
          <HeroDisplay hero={hero} size={72} />
        </div>
        <div className="text-3xl anim-pulse-glow rounded-full">⚔️</div>
        <div className="bg-white rounded-3xl p-4 card-3d anim-float">
          <BossDisplay boss={boss} size={72} />
        </div>
      </div>
      <div>
        <h2 className="f-display text-4xl md:text-5xl" style={{ color: "#1a1a3a" }}>
          {name ? `Building ${name}'s "${worldObj.name} ${gtObj.name}"…` : `Building "${worldObj.name} ${gtObj.name}"…`}
        </h2>
        <p className="text-xl mt-2" style={{ color: "#4a3a6a" }}>
          {heroDisplayName(hero)} vs {bossDisplayName(boss)}
          {weaponObj ? ` · ${weaponObj.emoji}` : ""}
        </p>
      </div>
      <div className="bg-white rounded-2xl px-6 py-4 card-3d min-w-[280px]">
        <p className="f-display text-xl" style={{ color: "#1a1a3a" }}>{steps[Math.min(step, steps.length - 1)]}</p>
      </div>
    </div>
  );
}

function QuestionScreen({ question, level, kidName, onCorrect }) {
  const [picked, setPicked] = useState(null);
  const [wrong, setWrong] = useState(false);
  const name = kidName?.trim();
  const handlePick = (choice) => {
    if (picked) return;
    setPicked(choice);
    if (choice === question.answer) setTimeout(onCorrect, 600);
    else { setWrong(true); setTimeout(() => { setPicked(null); setWrong(false); }, 800); }
  };
  return (
    <div className={`text-center flex flex-col items-center gap-6 ${wrong?"anim-shake":"anim-slide-up"}`}>
      <div className="f-display text-xl px-4 py-2 rounded-full text-white" style={{ background: "#1a1a3a" }}>
        ✨ Power Unlock · Level {level} ✨
      </div>
      <h2 className="f-display text-3xl md:text-4xl" style={{ color: "#1a1a3a" }}>
        {question.type === "math"
          ? (name ? `${name}, solve this to unlock a power!` : "Solve this to unlock a power!")
          : (name ? `${name}, pick the missing letter!` : "Pick the missing letter!")}
      </h2>
      <div className="bg-white rounded-3xl p-10 md:p-14 card-3d">
        <div className="f-display text-7xl md:text-8xl tracking-wider" style={{ color: "#FF8A3D" }}>{question.prompt}</div>
      </div>
      <div className="grid grid-cols-3 gap-4 w-full max-w-xl">
        {question.choices.map((c) => {
          const isPicked = picked === c;
          const isCorrect = isPicked && c === question.answer;
          const isWrong   = isPicked && c !== question.answer;
          return (
            <button key={c} onClick={() => handlePick(c)} disabled={!!picked}
              className={`f-display text-5xl py-8 rounded-3xl btn-chunky transition
                ${isCorrect ? "text-white anim-bounce-in" : isWrong ? "text-white" : "bg-white"}`}
              style={isCorrect ? { background: "#2ECC71" } : isWrong ? { background: "#E74C3C" } : { color: "#1a1a3a" }}>
              {c}
            </button>
          );
        })}
      </div>
      <p className="text-lg" style={{ color: "#4a3a6a" }}>
        {picked && picked !== question.answer
          ? (name ? `Almost, ${name}! Try again 💪` : "Almost! Try again 💪")
          : (name ? `You got this, ${name}!` : "You got this!")}
      </p>
    </div>
  );
}

function UnlockPickerScreen({ choices, picked, gameType, kidName, onPick }) {
  const colors = ["#FF8A3D","#3DB8FF","#2ECC71","#FFD93D","#FF6B9D","#A78BFA"];
  const name = kidName?.trim();
  return (
    <div className="relative text-center flex flex-col items-center gap-6 anim-bounce-in">
      {picked && Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="confetti-piece"
          style={{ left: `${Math.random()*100}%`, background: colors[i%colors.length], animationDelay: `${Math.random()*0.4}s` }} />
      ))}
      <div className="f-display text-2xl px-6 py-2 rounded-full text-white" style={{ background: "#2ECC71" }}>
        {name ? `🎉 YES ${name.toUpperCase()}! Pick your power!` : "🎉 CORRECT! Pick your power!"}
      </div>
      <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl">
        {choices.map((u, i) => {
          const isPicked = picked?.id === u.id;
          const isFaded  = picked && !isPicked;
          return (
            <button key={u.id} onClick={() => !picked && onPick(u)} disabled={!!picked}
              className={`bg-white p-6 rounded-3xl card-3d flex flex-col items-center gap-2 transition anim-slide-up
                ${isPicked ? "scale-110 anim-pulse-glow" : ""} ${isFaded ? "opacity-30" : ""}`}
              style={{ animationDelay: `${i*0.08}s` }}>
              <div className="text-7xl anim-float">{u.emoji}</div>
              <div className="f-display text-2xl" style={{ color: "#1a1a3a" }}>{u.name}</div>
              <div className="text-sm" style={{ color: "#4a3a6a" }}>{unlockDesc(u.id, gameType)}</div>
            </button>
          );
        })}
      </div>
      <p className="text-base" style={{ color: "#4a3a6a" }}>
        {picked ? "Unlocked! Here we go… ▶" : "Tap the power you want!"}
      </p>
    </div>
  );
}

function CompleteScreen({ score, unlocks, hero, boss, kidName, worldObj, gtObj, onRestart }) {
  const name = kidName?.trim();
  return (
    <div className="text-center flex flex-col items-center gap-6 anim-slide-up">
      <div className="text-8xl anim-wiggle">🏆</div>
      <h2 className="f-display text-5xl md:text-6xl" style={{ color: "#1a1a3a" }}>
        {name ? `You did it, ${name}!` : "You built it!"}
      </h2>
      <div className="flex items-center gap-3 text-xl" style={{ color: "#4a3a6a" }}>
        <HeroDisplay hero={hero} size={56} />
        <span>beat</span>
        <BossDisplay boss={boss} size={56} />
        <span>in the {worldObj.name}!</span>
      </div>
      <div className="bg-white rounded-3xl p-8 card-3d min-w-[320px]">
        <div className="f-display text-2xl" style={{ color: "#4a3a6a" }}>Total Score</div>
        <div className="f-display text-7xl" style={{ color: "#FF8A3D" }}>⭐ {score}</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {unlocks.map(u => {
            const unlock = UNLOCKS.find(x => x.id === u);
            return (
              <div key={u} className="bg-amber-100 rounded-2xl px-3 py-2 flex items-center gap-2">
                <span className="text-2xl">{unlock.emoji}</span>
                <span className="f-display" style={{ color: "#1a1a3a" }}>{unlock.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-white/70 rounded-2xl px-5 py-3 max-w-md">
        <p className="f-display text-lg" style={{ color: "#1a1a3a" }}>🔒 Keep building new worlds with Buildable Pro</p>
      </div>
      <button onClick={onRestart}
        className="f-display text-2xl text-white px-10 py-4 rounded-full btn-chunky"
        style={{ background: "#1a1a3a" }}>Build another! ↻</button>
    </div>
  );
}

// ============================================================
// PLAY ROUTER + SHARED HELPERS
// ============================================================

// Device detection. We treat the experience as iPad-first; phones get a
// gentle "best on iPad" hint but can play in landscape if they insist.
function useDeviceClass() {
  const [info, setInfo] = useState({ isPhone: false, isPortrait: false, ready: false });
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const shortest = Math.min(w, h);
      // Phones <= 500px on shortest side. iPad mini (744) and up are tablets.
      const isPhone = shortest <= 500;
      const isPortrait = h > w;
      setInfo({ isPhone, isPortrait, ready: true });
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return info;
}

function RotateToPlayPrompt({ onPlayAnyway }) {
  return (
    <div className="flex flex-col items-center justify-center text-center anim-slide-up py-12">
      <div className="text-8xl mb-4" style={{
        animation: "rotateHint 2s ease-in-out infinite",
        transformOrigin: "center",
      }}>📱</div>
      <style>{`@keyframes rotateHint { 0%, 100% { transform: rotate(-15deg); } 50% { transform: rotate(75deg); } }`}</style>
      <h2 className="f-display text-3xl mb-2" style={{ color: "#1a1a3a" }}>
        Rotate your phone!
      </h2>
      <p className="text-lg mb-2" style={{ color: "#4a3a6a" }}>
        Turn it sideways to play the game 👉
      </p>
      <p className="text-sm mt-4 mb-6" style={{ color: "#8a7a9a" }}>
        Buildable Kids works best on iPad.
      </p>
      {onPlayAnyway && (
        <button onClick={onPlayAnyway}
          className="f-display text-base bg-white/80 px-4 py-2 rounded-full btn-chunky"
          style={{ color: "#1a1a3a" }}>Play anyway →</button>
      )}
    </div>
  );
}

function PlayScreen(props) {
  const device = useDeviceClass();
  const [forcePlay, setForcePlay] = useState(false);
  // Only block on phone-portrait. Allow override.
  if (device.ready && device.isPhone && device.isPortrait && !forcePlay) {
    return <RotateToPlayPrompt onPlayAnyway={() => setForcePlay(true)} />;
  }
  if (props.gameType === "maze")   return <MazeGame {...props} />;
  if (props.gameType === "flying") return <FlyingGame {...props} />;
  if (props.gameType === "puzzle") return <Match3Game {...props} />;
  return <RunnerGame {...props} />;
}

// Shows the kid their goal + live progress above the game canvas.
// Supports: collect (quota bar), treasure (hint badge), finish (neutral text).
function GoalBanner({ goalId, goalTextShort, goalCfg, starsCollected, treasureFound }) {
  if (!goalTextShort) return null;
  const isCollect = goalId === "collect" && goalCfg?.quota;
  const isTreasure = goalId === "treasure";
  const pct = isCollect ? Math.min(100, (starsCollected / goalCfg.quota) * 100) : 0;
  return (
    <div className="w-full max-w-[720px] px-2">
      <div className="bg-white rounded-2xl px-4 py-2 card-3d flex items-center gap-3 flex-wrap">
        <div className="f-display text-lg" style={{ color: "#1a1a3a" }}>
          🎯 {goalTextShort}
        </div>
        {isCollect && (
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <div className="flex-1" style={{ height: 10, background: "#E5E7EB", borderRadius: 5, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#FFD93D",
                width: `${pct}%`, transition: "width 0.2s ease"
              }} />
            </div>
            <div className="f-display text-sm" style={{ color: "#4a3a6a" }}>
              {starsCollected}/{goalCfg.quota}
            </div>
          </div>
        )}
        {isTreasure && (
          <div className="f-display text-sm" style={{ color: treasureFound ? "#2ECC71" : "#4a3a6a" }}>
            {treasureFound ? "✓ Found it!" : "Watch for ✨📦"}
          </div>
        )}
      </div>
    </div>
  );
}

function GameHUD({ level, gameName, unlocks, weaponObj, bossName, bossHP, bossMaxHP }) {
  return (
    <div className="flex items-center justify-between w-full max-w-[720px] px-2 flex-wrap gap-2">
      <div className="f-display text-base md:text-2xl" style={{ color: "#1a1a3a" }}>Level {level} · {gameName}</div>
      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        {bossName && bossMaxHP > 0 && (
          <div className="flex items-center gap-2 bg-white rounded-full px-2 md:px-3 py-1 card-3d">
            <span className="text-base md:text-lg">👹</span>
            <div style={{ width: 60, height: 8, background: "#1a1a3a", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "#EF4444", transition: "width 0.25s ease",
                width: `${Math.max(0, (bossHP / bossMaxHP) * 100)}%`,
              }} />
            </div>
          </div>
        )}
        {weaponObj && <span className="text-xl md:text-2xl" title={weaponObj.name}>{weaponObj.emoji}</span>}
        {unlocks.map(u => {
          const un = UNLOCKS.find(x => x.id === u);
          return <span key={u} title={un.name} className="text-xl md:text-2xl">{un.emoji}</span>;
        })}
      </div>
    </div>
  );
}

// ============================================================
// RUNNER — L2 adds a boss sequence in the final 6s
// ============================================================
function RunnerGame({ level, hero, boss, worldObj, unlocks, goalId, onComplete }) {
  const canvasRef = useRef(null);
  const heroImgRef = useImageRef(hero?.kind === "drawn" ? hero.dataURL : null);
  const bossImgRef = useImageRef(boss?.kind === "drawn" ? boss.dataURL : null);

  const DURATION = level === 1 ? 20 : 26;     // L2 longer to accommodate boss
  const BOSS_START_AT = level === 2 ? 7 : -1; // boss appears with 7 seconds left
  const bossStats = bossStatsFor(boss, "runner");
  const bossMaxHits = bossStats.hits || 3;
  const goalCfg = goalConfig(goalId, "runner", level);
  const goalTextShort = goalBanner(goalId, "runner", level);

  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [ended, setEnded] = useState(false);
  const [bossHP, setBossHP] = useState(level === 2 ? bossMaxHits : 0);
  const scoreRef = useRef(0);
  const timeLeftRef = useRef(DURATION);
  const endedRef = useRef(false);

  // Goal tracking (visible in HUD): stars collected, treasure found
  const [starsCollected, setStarsCollected] = useState(0);
  const [treasureFound, setTreasureFound] = useState(false);

  const hasSpeed   = unlocks.includes("speed");
  const hasJump    = unlocks.includes("jump");
  const hasMagnet  = unlocks.includes("magnet");
  const hasShield  = unlocks.includes("shield");
  const hasRainbow = unlocks.includes("rainbow");
  const hasSlowmo  = unlocks.includes("slowmo");

  const baseSpeed = (level===1?3.0:3.6) * (hasSpeed?1.22:1) * (hasSlowmo?0.75:1);

  const gameRef = useRef({
    playerY: 0, vy: 0, jumps: 0, ducking: false,
    obstacles: [], coins: [], trails: [],
    running: true, shieldUp: hasShield, flashTimer: 0,
    speed: baseSpeed, maxJumps: hasJump ? 2 : 1,
    // boss
    bossActive: false, bossHP: level === 2 ? bossMaxHits : 0,
    bossX: 760, bossY: 200, bossAttacks: [], bossAttackTimer: 0,
    bossDefeated: false, bossBeatenParticles: [],
    // goal tracking
    stars: 0, treasure: null, treasureSpawned: false, treasureGrabbed: false,
    goalMet: false,
  });

  const jump = useCallback(() => {
    const s = gameRef.current;
    if (!s.running || s.ducking) return;
    if (s.jumps < s.maxJumps) { s.vy = -13.5; s.jumps++; }
  }, []);
  const setDuck = useCallback((on) => {
    const s = gameRef.current;
    if (!s.running) return;
    if (on && s.playerY < 0) return;
    s.ducking = on;
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
      if (e.code === "ArrowDown") { e.preventDefault(); setDuck(true); }
    };
    const up = (e) => { if (e.code === "ArrowDown") setDuck(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [jump, setDuck]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = 720, H = canvas.height = 320;
    const GROUND = H - 48;
    let raf;
    let lastGround = performance.now() + 800;
    let lastFlying = performance.now() + 2000;
    let lastCoin   = performance.now() + 400;

    const drawBg = () => {
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0, worldObj.sky[0]); g.addColorStop(0.7, worldObj.sky[1]); g.addColorStop(1, worldObj.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      const t = performance.now()/20;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let i=0;i<8;i++) { const x = (i*120 - t) % W; ctx.fillRect(x, GROUND-4, 40, 2); }
      ctx.fillStyle = worldObj.ground;
      ctx.fillRect(0, GROUND+32, W, H-GROUND-32);
    };

    const loop = (t) => {
      const s = gameRef.current;
      if (!s.running) return;

      // Activate boss when time crosses threshold
      if (level === 2 && !s.bossActive && !s.bossDefeated && timeLeftRef.current <= BOSS_START_AT) {
        s.bossActive = true;
        s.obstacles = []; // clear regular obstacles to give boss the stage
      }

      s.vy += 0.7; s.playerY += s.vy;
      if (s.playerY >= 0) { s.playerY = 0; s.vy = 0; s.jumps = 0; }

      // Spawn regular obstacles only when boss not active
      if (!s.bossActive && !s.bossDefeated) {
        const gInterval = level===1 ? 1700 : 1500;
        if (t - lastGround > gInterval) {
          const h = 32 + Math.floor(Math.random()*18);
          s.obstacles.push({ x: W, y: GROUND-h, w: 36, h, kind:"ground" });
          lastGround = t;
        }
        const fInterval = level===1 ? 3600 : 2800;
        if (t - lastFlying > fInterval) {
          s.obstacles.push({ x: W, y: GROUND-52, w: 44, h: 24, kind:"flying" });
          lastFlying = t;
        }
      }
      if (t - lastCoin > 900) {
        const cy = GROUND - 60 - Math.random()*100;
        s.coins.push({ x: W, y: cy, taken:false });
        lastCoin = t;
      }

      // Move obstacles / coins
      s.obstacles.forEach(o => o.x -= s.speed);
      s.coins.forEach(c => c.x -= s.speed);
      s.obstacles = s.obstacles.filter(o => o.x > -60);
      s.coins = s.coins.filter(c => c.x > -60 && !c.taken);

      // Boss logic
      if (s.bossActive && !s.bossDefeated) {
        // Boss slides in and holds at x ~ 540
        const targetX = 540;
        s.bossX += (targetX - s.bossX) * 0.06;
        s.bossY = 180 + Math.sin(t / 300) * 14;
        // Fire attacks periodically
        s.bossAttackTimer -= 16;
        const atkInterval = bossStats.angry ? 950 : 1250;
        if (s.bossAttackTimer <= 0) {
          s.bossAttackTimer = atkInterval;
          // Alternate high (duck under) vs low (jump over)
          const isHigh = Math.random() < 0.5;
          if (isHigh) {
            s.bossAttacks.push({ x: s.bossX, y: GROUND-52, w: 36, h: 24, kind: "flying" });
          } else {
            s.bossAttacks.push({ x: s.bossX, y: GROUND-36, w: 32, h: 36, kind: "ground" });
          }
        }
        const atkSpeed = bossStats.fast ? s.speed * 1.5 : s.speed * 1.15;
        s.bossAttacks.forEach(a => a.x -= atkSpeed);
        s.bossAttacks = s.bossAttacks.filter(a => a.x > -60);
      }

      // Player box
      const pw = 44, ph = s.ducking ? 24 : 44;
      const px = 90, py = GROUND - ph + s.playerY;

      if (s.flashTimer > 0) s.flashTimer -= 16;

      // Obstacle collisions
      const checkHit = (o, isBossAttack) => {
        if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
          if (s.shieldUp) { s.shieldUp = false; s.flashTimer = 400; o.x = -100; return; }
          if (s.flashTimer <= 0) {
            s.flashTimer = 600;
            scoreRef.current = Math.max(0, scoreRef.current - (isBossAttack ? 2 : 1));
            s.vy = -6; s.jumps = 1; s.ducking = false;
            o.x = -100;
          }
        }
        // If boss attack successfully passes behind player, dodge counts as a hit on boss
        if (isBossAttack && o.x + o.w < px && !o.counted) {
          o.counted = true;
          s.bossHP = Math.max(0, s.bossHP - 1);
          setBossHP(s.bossHP);
          if (s.bossHP <= 0) {
            s.bossDefeated = true;
            scoreRef.current += bossStats.scoreOnWin;
            // defeat particles
            for (let i=0;i<10;i++) {
              s.bossBeatenParticles.push({
                x: s.bossX, y: s.bossY,
                vx: (Math.random()-0.5)*6, vy: -Math.random()*6 - 2, life: 1,
              });
            }
          }
        }
      };
      s.obstacles.forEach(o => checkHit(o, false));
      s.bossAttacks.forEach(o => checkHit(o, true));

      // Coins
      const mag = hasMagnet ? 140 : 38;
      s.coins.forEach(c => {
        if (c.taken) return;
        const dx = (c.x + 14) - (px + pw/2);
        const dy = (c.y + 14) - (py + ph/2);
        const d = Math.sqrt(dx*dx + dy*dy);
        if (hasMagnet && d < mag) { c.x -= dx*0.14; c.y -= dy*0.14; }
        if (d < 32) {
          c.taken = true;
          scoreRef.current += hasRainbow?2:1;
          s.stars += 1;
          setStarsCollected(s.stars);
          // Collect-goal early win
          if (goalId === "collect" && goalCfg.quota && s.stars >= goalCfg.quota && !s.goalMet) {
            s.goalMet = true;
          }
        }
      });

      // Treasure-goal: spawn a 📦 crate once time crosses threshold
      if (goalId === "treasure" && !s.treasureSpawned && goalCfg.spawnAtTimeLeft != null
          && timeLeftRef.current <= goalCfg.spawnAtTimeLeft) {
        s.treasureSpawned = true;
        s.treasure = { x: W + 40, y: GROUND - 80 - Math.random() * 80, size: 44, taken: false };
      }
      if (s.treasure && !s.treasure.taken) {
        s.treasure.x -= s.speed;
        const tdx = (s.treasure.x + 22) - (px + pw/2);
        const tdy = (s.treasure.y + 22) - (py + ph/2);
        const td = Math.sqrt(tdx*tdx + tdy*tdy);
        if (td < 40) {
          s.treasure.taken = true;
          s.treasureGrabbed = true;
          setTreasureFound(true);
          scoreRef.current += 15;
          if (!s.goalMet) s.goalMet = true;
        } else if (s.treasure.x < -50) {
          // Missed — respawn once more from right
          s.treasure.x = W + 40;
          s.treasure.y = GROUND - 80 - Math.random() * 80;
        }
      }

      // Rainbow trails
      if (hasRainbow && t % 4 === 0) s.trails.push({ x:px+4, y:py+ph/2, life:1, hue:(t/6)%360 });
      s.trails.forEach(tr => tr.life -= 0.04);
      s.trails = s.trails.filter(tr => tr.life > 0);

      // Boss beaten particles
      s.bossBeatenParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life -= 0.02; });
      s.bossBeatenParticles = s.bossBeatenParticles.filter(p => p.life > 0);

      // ---- render ----
      drawBg();
      s.trails.forEach(tr => {
        ctx.fillStyle = `hsla(${tr.hue}, 90%, 65%, ${tr.life})`;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 8*tr.life+2, 0, Math.PI*2); ctx.fill();
      });
      // Boss
      if (s.bossActive && !s.bossDefeated) {
        drawBossOnCanvas(ctx, boss, bossImgRef, s.bossX, s.bossY, 80);
      }
      // Boss particles
      s.bossBeatenParticles.forEach(p => {
        ctx.fillStyle = `rgba(255, 220, 0, ${p.life})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
      });
      // Obstacles
      const drawObstacle = (o) => {
        ctx.font = `${o.w}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "top";
        ctx.fillText(o.kind === "ground" ? "🪨" : "🦅", o.x, o.y);
      };
      s.obstacles.forEach(drawObstacle);
      s.bossAttacks.forEach(drawObstacle);
      // Coins
      s.coins.forEach(c => {
        ctx.font = `28px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "top";
        ctx.fillText("⭐", c.x, c.y);
      });
      // Treasure crate (goal=treasure only)
      if (s.treasure && !s.treasure.taken && s.treasure.x < W + 80) {
        const bob = Math.sin(t / 200) * 6;
        ctx.font = `${s.treasure.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "top";
        ctx.fillText("📦", s.treasure.x, s.treasure.y + bob);
        // Sparkle indicator so kid knows it's special
        ctx.fillStyle = `rgba(255, 220, 0, ${0.4 + Math.sin(t/120)*0.3})`;
        ctx.font = "20px system-ui";
        ctx.fillText("✨", s.treasure.x - 14, s.treasure.y + bob - 4);
      }
      // Player
      ctx.save();
      if (s.flashTimer > 0 && Math.floor(s.flashTimer/80)%2) ctx.globalAlpha = 0.4;
      if (s.shieldUp) {
        ctx.strokeStyle = "rgba(60,200,255,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px+pw/2, py+ph/2, 32, 0, Math.PI*2); ctx.stroke();
      }
      drawHeroOnCanvas(ctx, hero, heroImgRef, px, py, pw);
      ctx.restore();

      // HUD
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0,0,W,34);
      ctx.fillStyle = "#fff"; ctx.font = "bold 20px Nunito, system-ui";
      ctx.fillText(`⭐ ${scoreRef.current}`, 16, 8);
      ctx.fillText(`⏱ ${timeLeftRef.current}s`, 140, 8);
      ctx.fillText(`Level ${level}`, W-100, 8);
      if (s.bossActive && !s.bossDefeated) {
        ctx.fillStyle = "#EF4444";
        ctx.font = "bold 22px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`BOSS! Dodge ${s.bossHP} more!`, W/2, 8);
        ctx.textAlign = "left";
      } else if (s.bossDefeated) {
        ctx.fillStyle = "#FFD93D";
        ctx.font = "bold 24px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`BOSS DEFEATED! +${bossStats.scoreOnWin}`, W/2, 8);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); gameRef.current.running = false; };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft(t => {
        const nt = t - 1; timeLeftRef.current = nt;
        if (nt <= 0 && !endedRef.current) {
          endedRef.current = true; gameRef.current.running = false; setEnded(true);
          setTimeout(() => onComplete(scoreRef.current), 900);
          clearInterval(iv); return 0;
        }
        return nt;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Early win when goal is met (quota reached or treasure grabbed).
  // L2 also requires beating the boss before the level completes.
  useEffect(() => {
    if (endedRef.current) return;
    const s = gameRef.current;
    if (!s.goalMet) return;
    const bossOk = level === 1 || s.bossDefeated;
    if (!bossOk) return;
    endedRef.current = true;
    s.running = false;
    setEnded(true);
    setTimeout(() => onComplete(scoreRef.current + 10 /* goal bonus */), 900);
  }, [starsCollected, treasureFound, bossHP, level]);

  const duckDown = (e) => { e.preventDefault(); setDuck(true); };
  const duckUp   = (e) => { e.preventDefault(); setDuck(false); };

  return (
    <div className="flex flex-col items-center gap-4 anim-slide-up">
      <GameHUD level={level} gameName="Running" unlocks={unlocks}
        bossName={level===2 ? bossDisplayName(boss) : null} bossHP={bossHP} bossMaxHP={bossMaxHits} />
      {/* Goal banner — tells the kid what they're trying to do, with live progress */}
      <GoalBanner
        goalId={goalId}
        goalTextShort={goalTextShort}
        goalCfg={goalCfg}
        starsCollected={starsCollected}
        treasureFound={treasureFound}
      />
      <div className="rounded-3xl overflow-hidden card-3d" style={{ lineHeight: 0 }}>
        <canvas ref={canvasRef} width={720} height={320} style={{ display:"block", width:"100%", maxWidth:720 }} />
      </div>
      <div className="flex gap-3 w-full max-w-[720px]">
        <button onClick={jump}
          className="f-display text-2xl text-white py-5 rounded-full btn-chunky flex-1"
          style={{ background: "#FF8A3D" }}>JUMP ⬆</button>
        <button
          onPointerDown={duckDown} onPointerUp={duckUp}
          onPointerLeave={duckUp} onPointerCancel={duckUp}
          className="f-display text-2xl text-white py-5 rounded-full btn-chunky flex-1"
          style={{ background: "#3DB8FF" }}>HOLD TO DUCK ⬇</button>
      </div>
      {ended && <div className="f-display text-3xl anim-bounce-in" style={{ color: "#2ECC71" }}>⭐ Level {level} complete!</div>}
    </div>
  );
}

// ============================================================
// FLYING — L2 boss enters at 12s left, has HP, takes hits from weapon
// ============================================================
function FlyingGame({ level, hero, boss, worldObj, weaponObj, unlocks, onComplete }) {
  const canvasRef = useRef(null);
  const heroImgRef = useImageRef(hero?.kind === "drawn" ? hero.dataURL : null);
  const bossImgRef = useImageRef(boss?.kind === "drawn" ? boss.dataURL : null);

  const DURATION = level === 1 ? 22 : 30;
  const BOSS_START_AT = level === 2 ? 12 : -1;
  const bossStats = bossStatsFor(boss, "flying");
  const bossMaxHP = bossStats.hits || 5;

  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [ended, setEnded] = useState(false);
  const [bossHP, setBossHP] = useState(level === 2 ? bossMaxHP : 0);

  const scoreRef = useRef(0);
  const timeLeftRef = useRef(DURATION);
  const endedRef = useRef(false);

  const hasSpeed   = unlocks.includes("speed");
  const hasMagnet  = unlocks.includes("magnet");
  const hasShield  = unlocks.includes("shield");
  const hasRainbow = unlocks.includes("rainbow");
  const hasSlowmo  = unlocks.includes("slowmo");
  const hasTriple  = unlocks.includes("triple");

  const scrollSpeed = (level===1?1.6:2.0) * (hasSpeed?1.15:1) * (hasSlowmo?0.7:1);

  const gameRef = useRef({
    playerY: 160, targetY: 160,
    playerX: 80, targetX: 80,
    bullets: [], enemies: [], rings: [], particles: [], trails: [],
    lastShot: 0, combo: 0,
    running: true, shieldUp: hasShield, flashTimer: 0,
    // boss
    bossActive: false, bossHP: level === 2 ? bossMaxHP : 0,
    bossX: 760, bossY: 140, bossShots: [], bossShotTimer: 0,
    bossDefeated: false, bossHitFlash: 0,
  });

  useEffect(() => {
    const down = (e) => {
      if (e.code === "ArrowUp")    { e.preventDefault(); gameRef.current.targetY = Math.max(30, gameRef.current.targetY - 22); }
      if (e.code === "ArrowDown")  { e.preventDefault(); gameRef.current.targetY = Math.min(290, gameRef.current.targetY + 22); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); gameRef.current.targetX = Math.max(20,  gameRef.current.targetX - 22); }
      if (e.code === "ArrowRight") { e.preventDefault(); gameRef.current.targetX = Math.min(440, gameRef.current.targetX + 22); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const draggingRef = useRef(false);
  const canvasCoord = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top)  * (c.height / rect.height),
    };
  };
  const setTargetsFromEvent = (e) => {
    const p = canvasCoord(e);
    // Clamp X so player stays in left ~60% of canvas (shots fly right)
    gameRef.current.targetX = Math.max(20, Math.min(440, p.x - 21));
    gameRef.current.targetY = Math.max(20, Math.min(290, p.y - 21));
  };
  const dragStart = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); draggingRef.current = true; setTargetsFromEvent(e); };
  const dragMove  = (e) => { if (!draggingRef.current) return; e.preventDefault(); setTargetsFromEvent(e); };
  const dragEnd   = () => { draggingRef.current = false; };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width = 720, H = canvas.height = 320;
    let raf;
    let lastEnemy = performance.now() + 800;
    let lastRing  = performance.now() + 1400;

    const drawBg = () => {
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0, worldObj.sky[0]); g.addColorStop(0.6, worldObj.sky[1]); g.addColorStop(1, worldObj.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      const t = performance.now()/40;
      for (let i=0;i<22;i++) {
        const x = (i*53 + t) % (W+40) - 20;
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath(); ctx.arc(x, 20 + (i*17) % 280, 2, 0, Math.PI*2); ctx.fill();
      }
    };

    const loop = (t) => {
      const s = gameRef.current;
      if (!s.running) return;

      // Boss activation
      if (level === 2 && !s.bossActive && !s.bossDefeated && timeLeftRef.current <= BOSS_START_AT) {
        s.bossActive = true;
        s.enemies = []; // clear mobs for boss focus
      }

      s.playerY += (s.targetY - s.playerY) * 0.18;
      if (s.playerY < 20) s.playerY = 20;
      if (s.playerY > H - 44) s.playerY = H - 44;
      s.playerX += (s.targetX - s.playerX) * 0.18;
      if (s.playerX < 20)  s.playerX = 20;
      if (s.playerX > 440) s.playerX = 440;

      const pw = 42, ph = 42;
      const px = s.playerX;
      const py = s.playerY;
      const pcx = px + pw/2, pcy = py + ph/2;

      // Autofire
      const rate = weaponObj.rate * (hasSpeed?0.85:1);
      if (t - s.lastShot > rate) {
        s.lastShot = t;
        const baseDx = weaponObj.speed * (hasSpeed?1.15:1);
        const totalShots = hasTriple ? Math.max(3, weaponObj.spread) : weaponObj.spread;
        for (let i = 0; i < totalShots; i++) {
          const off = totalShots === 1 ? 0 : (i - (totalShots-1)/2) * 0.18;
          s.bullets.push({
            x: px + pw - 6, y: pcy,
            dx: baseDx * Math.cos(off), dy: baseDx * Math.sin(off),
            emoji: weaponObj.emoji, size: weaponObj.size,
          });
        }
      }

      // Spawn regular enemies only when no boss
      if (!s.bossActive && !s.bossDefeated) {
        const eInterval = level===1 ? 1500 : 1150;
        if (t - lastEnemy > eInterval) {
          const types = [
            { emoji: "☁️", hp: 1, w: 48, h: 40 },
            { emoji: "🪨", hp: 1, w: 40, h: 40 },
            { emoji: "🛸", hp: 2, w: 48, h: 32 },
          ];
          const tp = types[Math.floor(Math.random()*types.length)];
          s.enemies.push({
            x: W + 20, y: 30 + Math.random() * (H - 100),
            w: tp.w, h: tp.h, hp: tp.hp, emoji: tp.emoji,
            wobble: Math.random() * Math.PI * 2,
          });
          lastEnemy = t;
        }
      }
      if (t - lastRing > (level===1?2200:1700)) {
        s.rings.push({ x: W+60, y: 60 + Math.random()*(H-160), r: 40, passed: false, missed: false, flash: 0 });
        lastRing = t;
      }

      // Move bullets
      s.bullets.forEach(b => { b.x += b.dx; b.y += b.dy; });
      s.bullets = s.bullets.filter(b => b.x < W + 40 && b.y > -20 && b.y < H + 20);

      // Move enemies
      const enemySpeed = scrollSpeed + 0.4;
      s.enemies.forEach(e => { e.x -= enemySpeed; e.wobble += 0.05; e.y += Math.sin(e.wobble) * 0.6; });
      s.enemies = s.enemies.filter(e => e.x > -60 && e.hp > 0);
      s.rings.forEach(r => r.x -= scrollSpeed + 1.2);
      s.rings = s.rings.filter(r => r.x > -80);

      // Boss movement + shots
      if (s.bossActive && !s.bossDefeated) {
        const targetX = 560;
        s.bossX += (targetX - s.bossX) * 0.04;
        s.bossY = 140 + Math.sin(t / 500) * 60;
        if (s.bossHitFlash > 0) s.bossHitFlash -= 16;
        // Boss shoots at player
        s.bossShotTimer -= 16;
        const shotInterval = bossStats.angry ? 800 : (bossStats.fast ? 900 : 1200);
        if (s.bossShotTimer <= 0) {
          s.bossShotTimer = shotInterval;
          const bcx = s.bossX + 40, bcy = s.bossY + 40;
          const dx = pcx - bcx, dy = pcy - bcy;
          const mag = Math.sqrt(dx*dx + dy*dy) || 1;
          const spd = bossStats.fast ? 5.5 : 4.2;
          s.bossShots.push({ x: bcx, y: bcy, dx: (dx/mag)*spd, dy: (dy/mag)*spd });
        }
        s.bossShots.forEach(bs => { bs.x += bs.dx; bs.y += bs.dy; });
        s.bossShots = s.bossShots.filter(bs => bs.x > -30 && bs.x < W + 30 && bs.y > -30 && bs.y < H + 30);
      }

      // Bullet→enemy + bullet→boss
      s.bullets.forEach(b => {
        if (b.dead) return;
        s.enemies.forEach(e => {
          if (e.hp <= 0) return;
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            e.hp -= 1; b.dead = true;
            if (e.hp <= 0) {
              scoreRef.current += 3 * (hasRainbow?2:1);
              s.particles.push({ x: e.x + e.w/2, y: e.y + e.h/2, life: 1, emoji: "💥" });
            }
          }
        });
        if (s.bossActive && !s.bossDefeated) {
          const bx = s.bossX, by = s.bossY, bw = 80, bh = 80;
          if (b.x > bx && b.x < bx + bw && b.y > by && b.y < by + bh) {
            b.dead = true;
            s.bossHP = Math.max(0, s.bossHP - 1);
            setBossHP(s.bossHP);
            s.bossHitFlash = 250;
            scoreRef.current += 1;
            if (s.bossHP <= 0) {
              s.bossDefeated = true;
              scoreRef.current += bossStats.scoreOnWin;
              for (let i = 0; i < 14; i++) {
                s.particles.push({ x: bx + 40, y: by + 40, life: 1, emoji: ["💥","✨","🎉"][i%3] });
              }
            }
          }
        }
      });
      s.bullets = s.bullets.filter(b => !b.dead);

      // Player↔enemy + player↔boss body + player↔boss shots
      if (s.flashTimer > 0) s.flashTimer -= 16;
      const checkPlayerHit = (obj) => {
        if (s.shieldUp) { s.shieldUp = false; s.flashTimer = 400; return true; }
        if (s.flashTimer <= 0) {
          s.flashTimer = 700;
          scoreRef.current = Math.max(0, scoreRef.current - 2);
          s.combo = 0;
          return true;
        }
        return false;
      };
      s.enemies.forEach(e => {
        if (e.hp <= 0) return;
        if (px < e.x + e.w && px + pw > e.x && py < e.y + e.h && py + ph > e.y) {
          if (checkPlayerHit(e)) e.hp = 0;
        }
      });
      if (s.bossActive && !s.bossDefeated) {
        // Don't body-slam into boss
        if (px < s.bossX + 80 && px + pw > s.bossX && py < s.bossY + 80 && py + ph > s.bossY) {
          checkPlayerHit(null);
        }
        s.bossShots.forEach((bs, idx) => {
          if (Math.abs(bs.x - pcx) < 22 && Math.abs(bs.y - pcy) < 22) {
            if (checkPlayerHit(null)) bs.dead = true;
          }
        });
        s.bossShots = s.bossShots.filter(bs => !bs.dead);
      }

      // Rings (combo)
      s.rings.forEach(r => {
        if (r.flash > 0) r.flash -= 16;
        if (!r.passed && !r.missed && Math.abs(r.x - pcx) < (scrollSpeed + 1.2) + 4) {
          const dy = Math.abs(r.y - pcy);
          if (dy < r.r - 8) {
            r.passed = true; r.flash = 400; s.combo += 1;
            scoreRef.current += (hasRainbow?2:1) * s.combo;
          }
        } else if (!r.passed && !r.missed && r.x < pcx - 20) {
          r.missed = true; if (s.combo > 0) s.combo = 0;
        }
      });

      s.particles.forEach(p => p.life -= 0.05);
      s.particles = s.particles.filter(p => p.life > 0);
      if (hasRainbow && t % 4 === 0) s.trails.push({ x:px+4, y:pcy, life:1, hue:(t/6)%360 });
      s.trails.forEach(tr => tr.life -= 0.04);
      s.trails = s.trails.filter(tr => tr.life > 0);

      // Render
      drawBg();
      s.trails.forEach(tr => {
        ctx.fillStyle = `hsla(${tr.hue}, 90%, 65%, ${tr.life})`;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 8*tr.life+2, 0, Math.PI*2); ctx.fill();
      });
      s.rings.forEach(r => {
        const color = r.passed ? "#2ECC71" : (r.missed ? "#9E9E9E" : "#FFD93D");
        ctx.strokeStyle = color; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();
        ctx.strokeStyle = r.flash > 0 ? "#fff" : "rgba(255,255,255,0.6)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r - 8, 0, Math.PI*2); ctx.stroke();
      });
      s.enemies.forEach(e => {
        ctx.font = `${e.w}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "top";
        ctx.fillText(e.emoji, e.x, e.y);
        if (e.hp > 1) {
          ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(e.x, e.y - 6, e.w, 3);
          ctx.fillStyle = "#2ECC71"; ctx.fillRect(e.x, e.y - 6, e.w * (e.hp/2), 3);
        }
      });
      // Boss
      if (s.bossActive && !s.bossDefeated) {
        ctx.save();
        if (s.bossHitFlash > 0 && Math.floor(s.bossHitFlash/60) % 2) ctx.globalAlpha = 0.5;
        drawBossOnCanvas(ctx, boss, bossImgRef, s.bossX, s.bossY, 80);
        ctx.restore();
        // Boss HP bar
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(s.bossX, s.bossY - 10, 80, 6);
        ctx.fillStyle = "#EF4444"; ctx.fillRect(s.bossX, s.bossY - 10, 80 * (s.bossHP/bossMaxHP), 6);
      }
      // Boss shots
      s.bossShots.forEach(bs => {
        ctx.font = "24px system-ui, 'Apple Color Emoji'";
        ctx.textBaseline = "middle";
        ctx.fillText("🔥", bs.x - 12, bs.y);
      });
      s.bullets.forEach(b => {
        ctx.font = `${b.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "middle";
        ctx.fillText(b.emoji, b.x, b.y);
      });
      s.particles.forEach(p => {
        ctx.font = `${32 * (2 - p.life)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        ctx.textBaseline = "middle"; ctx.globalAlpha = p.life;
        ctx.fillText(p.emoji, p.x - 16, p.y); ctx.globalAlpha = 1;
      });

      ctx.save();
      if (s.flashTimer > 0 && Math.floor(s.flashTimer/80)%2) ctx.globalAlpha = 0.4;
      if (s.shieldUp) {
        ctx.strokeStyle = "rgba(60,200,255,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(pcx, pcy, 32, 0, Math.PI*2); ctx.stroke();
      }
      const tilt = Math.max(-0.3, Math.min(0.3, (s.targetY - s.playerY) * 0.02));
      ctx.translate(pcx, pcy); ctx.rotate(tilt); ctx.translate(-pcx, -pcy);
      drawHeroOnCanvas(ctx, hero, heroImgRef, px, py, pw);
      ctx.restore();

      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0,0,W,34);
      ctx.fillStyle = "#fff"; ctx.font = "bold 20px Nunito, system-ui";
      ctx.fillText(`⭐ ${scoreRef.current}`, 16, 8);
      ctx.fillText(`⏱ ${timeLeftRef.current}s`, 140, 8);
      ctx.fillText(`Level ${level}`, W-100, 8);
      if (s.combo > 1 && !s.bossActive) {
        ctx.fillStyle = "#FFD93D"; ctx.font = "bold 44px Fredoka, system-ui";
        ctx.textAlign = "center"; ctx.fillText(`x${s.combo}`, W/2, 44); ctx.textAlign = "left";
      }
      if (s.bossDefeated) {
        ctx.fillStyle = "#FFD93D";
        ctx.font = "bold 24px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`BOSS DEFEATED! +${bossStats.scoreOnWin}`, W/2, 44);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); gameRef.current.running = false; };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setTimeLeft(t => {
        const nt = t - 1; timeLeftRef.current = nt;
        if (nt <= 0 && !endedRef.current) {
          endedRef.current = true; gameRef.current.running = false; setEnded(true);
          setTimeout(() => onComplete(scoreRef.current), 900);
          clearInterval(iv); return 0;
        }
        return nt;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const nudgeY = (dir) => { gameRef.current.targetY = Math.max(20, Math.min(290, gameRef.current.targetY + dir*40)); };
  const nudgeX = (dir) => { gameRef.current.targetX = Math.max(20, Math.min(440, gameRef.current.targetX + dir*40)); };

  return (
    <div className="flex flex-col items-center gap-4 anim-slide-up">
      <GameHUD level={level} gameName="Flying" unlocks={unlocks} weaponObj={weaponObj}
        bossName={level===2 ? bossDisplayName(boss) : null} bossHP={bossHP} bossMaxHP={bossMaxHP} />
      <div className="rounded-3xl overflow-hidden card-3d game-canvas" style={{ lineHeight: 0 }}
           onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <canvas ref={canvasRef} width={720} height={320} style={{ display:"block", width:"100%", maxWidth:720 }} />
      </div>
      <div className="flex items-center gap-4 w-full max-w-[720px] justify-center flex-wrap">
        {/* Hide d-pad on phones — drag-anywhere on canvas is enough, and
            d-pad eats vertical screen real estate on portrait phones. */}
        <div className="hidden md:grid grid-cols-3 gap-2" style={{ userSelect: "none" }}>
          <div></div>
          <button onClick={() => nudgeY(-1)}
            className="f-display text-2xl text-white w-14 h-14 rounded-2xl btn-chunky"
            style={{ background: "#3DB8FF" }}>⬆</button>
          <div></div>
          <button onClick={() => nudgeX(-1)}
            className="f-display text-2xl text-white w-14 h-14 rounded-2xl btn-chunky"
            style={{ background: "#3DB8FF" }}>⬅</button>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#E5E7EB" }}>
            <span className="text-xl">🚀</span>
          </div>
          <button onClick={() => nudgeX(1)}
            className="f-display text-2xl text-white w-14 h-14 rounded-2xl btn-chunky"
            style={{ background: "#3DB8FF" }}>➡</button>
          <div></div>
          <button onClick={() => nudgeY(1)}
            className="f-display text-2xl text-white w-14 h-14 rounded-2xl btn-chunky"
            style={{ background: "#3DB8FF" }}>⬇</button>
          <div></div>
        </div>
        <div className="f-display text-sm flex-1 min-w-[180px] text-center px-2" style={{ color: "#4a3a6a" }}>
          Drag anywhere on the sky to fly!<br/>Blasters fire by themselves 🔫
        </div>
      </div>
      {ended && <div className="f-display text-3xl anim-bounce-in" style={{ color: "#2ECC71" }}>⭐ Level {level} complete!</div>}
    </div>
  );
}

// ============================================================
// MAZE — L2 boss lives at the goal; kid must collect a ❤️ to beat it
// ============================================================
// 0=empty, 1=wall, 2=gem, 3=goal, 4=key, 5=door, 6=heart (L2 only)
const MAZE_1 = [
  [0, 0, 1, 0, 0, 0, 4],
  [1, 0, 1, 0, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 2, 1, 0],
  [0, 0, 0, 0, 0, 1, 1],
  [1, 1, 1, 1, 0, 5, 3],
];
// L2: key at (2,0), door at (6,6), goal (boss) at (6,7); heart at (0,6)
const MAZE_2 = [
  [0, 0, 0, 0, 1, 0, 6, 0],
  [1, 1, 1, 0, 1, 0, 1, 0],
  [4, 0, 0, 0, 0, 0, 1, 0],
  [1, 1, 1, 0, 1, 1, 1, 0],
  [0, 0, 0, 0, 2, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 5, 3],
];

function MazeGame({ level, hero, boss, worldObj, unlocks, onComplete }) {
  const maze = level === 1 ? MAZE_1 : MAZE_2;
  const rows = maze.length, cols = maze[0].length;
  const bossStats = bossStatsFor(boss, "maze");
  const heartsNeeded = level === 2 ? (bossStats.heartsNeeded || 1) : 0;

  const [pos, setPos] = useState({ r: 0, c: 0 });
  const [grid, setGrid] = useState(() => maze.map(r => [...r]));
  const [score, setScore] = useState(0);
  const [keys, setKeys] = useState(0);
  const [hearts, setHearts] = useState(0);
  const [bump, setBump] = useState(false);
  const [bossTaunt, setBossTaunt] = useState(false);
  const [done, setDone] = useState(false);

  const hasSpeed   = unlocks.includes("speed");
  const hasMagnet  = unlocks.includes("magnet");
  const hasRainbow = unlocks.includes("rainbow");
  const shieldRef  = useRef(unlocks.includes("shield"));

  const attemptMove = useCallback((dr, dc) => {
    if (done) return;
    const steps = hasSpeed ? 2 : 1;
    let cur = { r: pos.r, c: pos.c };
    let localKeys = keys, localHearts = hearts;
    const localGrid = grid.map(r => [...r]);
    let gained = 0, moved = false, bumped = false, reachedGoal = false;

    for (let s = 0; s < steps; s++) {
      const tr = cur.r + dr, tc = cur.c + dc;
      if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) { bumped = true; break; }
      const cell = localGrid[tr][tc];
      if (cell === 1) { bumped = true; break; }
      if (cell === 5) {
        if (localKeys > 0) { localKeys -= 1; localGrid[tr][tc] = 0; gained += 3; }
        else { bumped = true; break; }
      }
      // Goal/boss check
      if (cell === 3 && level === 2 && localHearts < heartsNeeded) {
        // Boss blocks passage — bump + taunt
        bumped = true;
        setBossTaunt(true);
        setTimeout(() => setBossTaunt(false), 500);
        break;
      }
      cur = { r: tr, c: tc };
      moved = true;
      const landed = localGrid[tr][tc];
      if (landed === 2) { localGrid[tr][tc] = 0; gained += 2; }
      if (landed === 4) { localGrid[tr][tc] = 0; localKeys += 1; gained += 1; }
      if (landed === 6) { localGrid[tr][tc] = 0; localHearts += 1; gained += 3; }
      if (landed === 3) {
        gained += 5 + (level === 2 ? bossStats.scoreOnWin : 0);
        reachedGoal = true;
      }
    }

    if (hasMagnet && moved) {
      for (let dd = -1; dd <= 1; dd++) for (let ee = -1; ee <= 1; ee++) {
        const rr = cur.r + dd, cc2 = cur.c + ee;
        if (rr>=0&&rr<rows&&cc2>=0&&cc2<cols) {
          if (localGrid[rr][cc2] === 2) { localGrid[rr][cc2] = 0; gained += 2; }
          if (localGrid[rr][cc2] === 4) { localGrid[rr][cc2] = 0; localKeys += 1; gained += 1; }
          if (localGrid[rr][cc2] === 6) { localGrid[rr][cc2] = 0; localHearts += 1; gained += 3; }
        }
      }
    }

    if (moved) {
      const delta = hasRainbow ? gained * 2 : gained;
      setPos(cur); setGrid(localGrid); setKeys(localKeys); setHearts(localHearts);
      setScore(prev => prev + delta);
      if (reachedGoal) setTimeout(() => setDone(true), 150);
    }
    if (bumped) {
      if (shieldRef.current) shieldRef.current = false;
      setBump(true); setTimeout(() => setBump(false), 250);
    }
  }, [pos, keys, hearts, grid, done, hasSpeed, hasMagnet, hasRainbow, rows, cols, level, heartsNeeded]);

  useEffect(() => { if (done) setTimeout(() => onComplete(score), 900); }, [done]);

  useEffect(() => {
    const h = (e) => {
      if (e.code === "ArrowUp")    { e.preventDefault(); attemptMove(-1, 0); }
      if (e.code === "ArrowDown")  { e.preventDefault(); attemptMove(1, 0); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); attemptMove(0, -1); }
      if (e.code === "ArrowRight") { e.preventDefault(); attemptMove(0, 1); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [attemptMove]);

  // Responsive cell sizing: fits both iPad and iPhone widths.
  // Board needs: cols*cellSize + (cols-1)*gap + padding (~32px). Fit to viewport.
  const [cellSize, setCellSize] = useState(54);
  useEffect(() => {
    const recalc = () => {
      const avail = Math.min(window.innerWidth - 40, 720); // leave 40px margin, cap at 720
      const perCell = Math.floor((avail - (cols - 1) * 4 - 32) / cols);
      setCellSize(Math.max(36, Math.min(64, perCell))); // clamp 36..64
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
    };
  }, [cols]);

  return (
    <div className="flex flex-col items-center gap-4 anim-slide-up">
      <div className="flex items-center justify-between w-full max-w-xl px-2 flex-wrap gap-2">
        <div className="f-display text-2xl" style={{ color: "#1a1a3a" }}>Level {level} · Maze</div>
        <div className="flex gap-3 items-center">
          {level === 2 && (
            <div className="f-display text-xl" style={{ color: "#EF4444" }}>
              ❤️ {hearts}/{heartsNeeded}
            </div>
          )}
          <div className="f-display text-2xl" style={{ color: "#FFD93D" }}>🔑 {keys}</div>
          <div className="f-display text-2xl" style={{ color: "#FF8A3D" }}>⭐ {score}</div>
        </div>
      </div>
      {level === 2 && (
        <div className="text-sm" style={{ color: "#4a3a6a" }}>
          {bossDisplayName(boss)} guards the goal. Find <span className="f-display">❤️</span> to beat it!
        </div>
      )}
      <div className={`rounded-3xl p-4 card-3d ${bump?"anim-shake":""}`} style={{ background: worldObj.ground }}>
        <div className="grid gap-1" style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        }}>
          {grid.map((row, r) => row.map((cell, c) => {
            const isPlayer = pos.r === r && pos.c === c;
            const isGoalBoss = cell === 3 && level === 2;
            const contentSize = Math.floor(cellSize * 0.55);
            const spriteSize = Math.floor(cellSize * 0.78);
            const emojiStyle = { fontSize: contentSize, lineHeight: 1 };
            let bg = worldObj.tint, content = null;
            if (cell === 1) bg = "#1a1a3a";
            if (cell === 2) content = <span style={emojiStyle}>💎</span>;
            if (cell === 3 && level === 1) { bg = "#FFD93D"; content = <span style={emojiStyle}>🏆</span>; }
            if (isGoalBoss) {
              bg = "#7f1d1d";
              content = (
                <div className={bossTaunt ? "anim-shake" : "anim-float"}>
                  <BossDisplay boss={boss} size={spriteSize} />
                </div>
              );
            }
            if (cell === 4) { bg = "#FFF3C4"; content = <span style={emojiStyle}>🔑</span>; }
            if (cell === 5) { bg = "#8B4513"; content = <span style={emojiStyle}>🚪</span>; }
            if (cell === 6) { bg = "#FCA5A5"; content = <span style={emojiStyle}>❤️</span>; }
            return (
              <div key={`${r}-${c}`}
                   className="rounded-lg flex items-center justify-center"
                   style={{ background: bg, width: cellSize, height: cellSize }}>
                {isPlayer ? (
                  <div className="anim-float"><HeroDisplay hero={hero} size={spriteSize} /></div>
                ) : content}
              </div>
            );
          }))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]" style={{ userSelect:"none" }}>
        <div></div>
        <button onClick={() => attemptMove(-1, 0)} className="f-display text-4xl bg-white py-4 rounded-2xl btn-chunky">▲</button>
        <div></div>
        <button onClick={() => attemptMove(0, -1)} className="f-display text-4xl bg-white py-4 rounded-2xl btn-chunky">◀</button>
        <button onClick={() => attemptMove(1, 0)}  className="f-display text-4xl bg-white py-4 rounded-2xl btn-chunky">▼</button>
        <button onClick={() => attemptMove(0, 1)}  className="f-display text-4xl bg-white py-4 rounded-2xl btn-chunky">▶</button>
      </div>
      {done && <div className="f-display text-3xl anim-bounce-in" style={{ color: "#2ECC71" }}>🏆 You beat it!</div>}
    </div>
  );
}

// ============================================================
// MATCH 3 — L2 boss has armor; matches chip it away
// ============================================================
const M3_SIZE = 6;

function m3FindMatches(grid) {
  const rows = grid.length, cols = grid[0].length;
  const hits = new Set();
  for (let r = 0; r < rows; r++) {
    let runStart = 0;
    for (let c = 1; c <= cols; c++) {
      const prev = grid[r][c-1];
      const at = c < cols ? grid[r][c] : null;
      if (c === cols || at !== prev || prev === null) {
        if (c - runStart >= 3 && grid[r][runStart] !== null) {
          for (let k = runStart; k < c; k++) hits.add(`${r},${k}`);
        }
        runStart = c;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    let runStart = 0;
    for (let r = 1; r <= rows; r++) {
      const prev = grid[r-1][c];
      const at = r < rows ? grid[r][c] : null;
      if (r === rows || at !== prev || prev === null) {
        if (r - runStart >= 3 && grid[runStart][c] !== null) {
          for (let k = runStart; k < r; k++) hits.add(`${k},${c}`);
        }
        runStart = r;
      }
    }
  }
  return [...hits].map(k => { const [r,c] = k.split(",").map(Number); return { r, c }; });
}

function m3Gravity(grid, palette) {
  const rows = grid.length, cols = grid[0].length;
  const out = grid.map(r => [...r]);
  for (let c = 0; c < cols; c++) {
    const stack = [];
    for (let r = 0; r < rows; r++) if (out[r][c] !== null) stack.push(out[r][c]);
    for (let r = rows - 1; r >= 0; r--) {
      if (stack.length > 0) out[r][c] = stack.pop();
      else out[r][c] = palette[Math.floor(Math.random()*palette.length)];
    }
  }
  return out;
}

function m3InitGrid(size, palette) {
  const g = Array(size).fill(0).map(() => Array(size).fill(null));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let choice, tries = 0;
      do {
        choice = palette[Math.floor(Math.random()*palette.length)];
        tries++;
      } while (tries < 20 && (
        (c >= 2 && g[r][c-1] === choice && g[r][c-2] === choice) ||
        (r >= 2 && g[r-1][c] === choice && g[r-2][c] === choice)
      ));
      g[r][c] = choice;
    }
  }
  return g;
}

function Match3Game({ level, hero, boss, worldObj, unlocks, onComplete }) {
  const palette = worldObj.candies;
  const hasSpeed = unlocks.includes("speed");
  const hasRainbow = unlocks.includes("rainbow");
  const hasMagnet = unlocks.includes("magnet");
  const hasBombs = unlocks.includes("bombs");

  const startMoves = (level === 1 ? 12 : 18) + (hasSpeed ? 2 : 0);
  const bossStats = bossStatsFor(boss, "puzzle");
  const bossMaxArmor = level === 2 ? (bossStats.armor || 10) : 0;

  // Responsive cell size: 6 cells wide
  const [m3CellSize, setM3CellSize] = useState(56);
  useEffect(() => {
    const recalc = () => {
      const avail = Math.min(window.innerWidth - 40, 500);
      const perCell = Math.floor((avail - (M3_SIZE - 1) * 4 - 24) / M3_SIZE);
      setM3CellSize(Math.max(42, Math.min(64, perCell)));
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
    };
  }, []);

  const [movesLeft, setMovesLeft] = useState(startMoves);
  const [grid, setGrid] = useState(() => m3InitGrid(M3_SIZE, palette));
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [matching, setMatching] = useState([]);
  const [badSwap, setBadSwap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [bossArmor, setBossArmor] = useState(bossMaxArmor);
  const [bossShake, setBossShake] = useState(false);
  const [bossDefeated, setBossDefeated] = useState(false);

  const scoreRef = useRef(0);
  const bossArmorRef = useRef(bossMaxArmor);
  const bossDefeatedRef = useRef(false);
  useEffect(() => { scoreRef.current = score; }, [score]);

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  const processCascade = async (startingGrid) => {
    setBusy(true);
    let working = startingGrid.map(r => [...r]);
    let chain = 0;
    while (true) {
      let matches = m3FindMatches(working);
      if (matches.length === 0) break;
      if (hasBombs) {
        const extra = new Set(matches.map(m => `${m.r},${m.c}`));
        matches.forEach(({r,c}) => {
          for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
            const rr = r+dr, cc = c+dc;
            if (rr>=0&&rr<M3_SIZE&&cc>=0&&cc<M3_SIZE && working[rr][cc] !== null) {
              extra.add(`${rr},${cc}`);
            }
          }
        });
        matches = [...extra].map(k => { const [r,c] = k.split(",").map(Number); return { r, c }; });
      }
      setMatching(matches.map(m => `${m.r},${m.c}`));
      await delay(280);
      chain += 1;
      const base = matches.length;
      const magnetBonus = hasMagnet ? matches.length : 0;
      const chainBonus = chain > 1 ? (chain - 1) * 2 : 0;
      const gained = (base + magnetBonus + chainBonus) * (hasRainbow ? 2 : 1);
      setScore(s => s + gained);

      // Boss damage (L2): every matched cell chips 1 off armor
      if (level === 2 && !bossDefeatedRef.current) {
        const dmg = matches.length;
        bossArmorRef.current = Math.max(0, bossArmorRef.current - dmg);
        setBossArmor(bossArmorRef.current);
        setBossShake(true);
        setTimeout(() => setBossShake(false), 300);
        if (bossArmorRef.current <= 0) {
          bossDefeatedRef.current = true;
          setBossDefeated(true);
          setScore(s => s + bossStats.scoreOnWin);
        }
      }

      matches.forEach(({r, c}) => working[r][c] = null);
      setGrid(working.map(r => [...r]));
      setMatching([]);
      await delay(140);
      working = m3Gravity(working, palette);
      setGrid(working.map(r => [...r]));
      await delay(200);
    }
    setBusy(false);
  };

  const handleTap = (r, c) => {
    if (busy || done) return;
    if (!selected) { setSelected({ r, c }); return; }
    const dr = Math.abs(selected.r - r), dc = Math.abs(selected.c - c);
    if (dr + dc !== 1) { setSelected({ r, c }); return; }
    const next = grid.map(row => [...row]);
    [next[selected.r][selected.c], next[r][c]] = [next[r][c], next[selected.r][selected.c]];
    const matches = m3FindMatches(next);
    const swapKeys = [`${selected.r},${selected.c}`, `${r},${c}`];
    if (matches.length === 0) {
      setBadSwap(swapKeys);
      setSelected(null);
      setTimeout(() => setBadSwap(null), 450);
      return;
    }
    setSelected(null);
    setGrid(next);
    setMovesLeft(m => m - 1);
    processCascade(next);
  };

  useEffect(() => {
    if (movesLeft <= 0 && !busy && !done) {
      setDone(true);
      setTimeout(() => onComplete(scoreRef.current), 1200);
    }
  }, [movesLeft, busy, done]);

  return (
    <div className="flex flex-col items-center gap-4 anim-slide-up">
      <div className="flex items-center justify-between w-full max-w-md px-2 flex-wrap gap-2">
        <div className="f-display text-2xl" style={{ color: "#1a1a3a" }}>Level {level} · Match Magic</div>
        <div className="flex gap-3">
          <div className="f-display text-2xl" style={{ color: "#A855F7" }}>🎯 {movesLeft}</div>
          <div className="f-display text-2xl" style={{ color: "#FF8A3D" }}>⭐ {score}</div>
        </div>
      </div>
      {level === 2 && (
        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-2 card-3d">
          <div className={bossShake ? "anim-shake" : bossDefeated ? "opacity-30" : ""}>
            <BossDisplay boss={boss} size={48} />
          </div>
          <div>
            <div className="f-display text-sm" style={{ color: "#1a1a3a" }}>
              {bossDisplayName(boss)} {bossDefeated ? "— DEFEATED!" : "— armor:"}
            </div>
            {!bossDefeated && (
              <div style={{ width: 160, height: 10, background: "#1a1a3a", borderRadius: 5, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: "#EF4444",
                  width: `${(bossArmor / bossMaxArmor) * 100}%`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            )}
          </div>
        </div>
      )}
      <div className="p-3 rounded-3xl card-3d"
           style={{ background: `linear-gradient(135deg, ${worldObj.sky[0]}, ${worldObj.sky[1]})` }}>
        <div className="grid gap-1"
             style={{ gridTemplateColumns: `repeat(${M3_SIZE}, ${m3CellSize}px)`, gridTemplateRows: `repeat(${M3_SIZE}, ${m3CellSize}px)` }}>
          {grid.map((row, r) => row.map((cell, c) => {
            const key = `${r},${c}`;
            const isSel = selected?.r === r && selected?.c === c;
            const isMatch = matching.includes(key);
            const isBad = badSwap?.includes(key);
            return (
              <button key={key} onClick={() => handleTap(r, c)}
                className={`rounded-xl flex items-center justify-center transition
                  ${isSel ? "ring-4 ring-amber-900 scale-110" : ""}
                  ${isMatch ? "anim-match" : ""}
                  ${isBad ? "anim-shake" : ""}`}
                style={{
                  width: m3CellSize, height: m3CellSize,
                  fontSize: Math.floor(m3CellSize * 0.62),
                  lineHeight: 1,
                  background: isMatch ? "#FFD93D" : isBad ? "#FCA5A5" : "rgba(255,255,255,0.92)",
                  boxShadow: isSel ? "0 0 0 3px #FF8A3D inset" : "0 2px 0 rgba(0,0,0,0.1)",
                }}>
                {cell}
              </button>
            );
          }))}
        </div>
      </div>
      <p className="text-base text-center max-w-md" style={{ color: "#4a3a6a" }}>
        {level === 2 && !bossDefeated
          ? "Match candies to crack the boss's armor!"
          : "Tap two next-to-each-other candies to swap. Match 3 or more!"}
      </p>
      {done && <div className="f-display text-3xl anim-bounce-in" style={{ color: "#2ECC71" }}>✨ Level {level} complete!</div>}
    </div>
  );
}
