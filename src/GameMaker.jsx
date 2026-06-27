// /src/GameMaker.jsx
// The Game Maker — a guided, picture-first builder that turns a few taps into a
// real playable game. Works exactly like Music Maker / Story Maker: the kid
// picks a hero, a world, how tricky it is, and the music; we assemble a
// GAME_CONFIG "recipe" and hand it to a fixed engine (the platformer or the
// survival engine) over the URL. Nothing is regenerated — same engine, new data.
import { useState, useEffect, useRef } from "react";
import { saveGame } from "./store";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const ART = "https://www.buildablekids.com/api/story-library?img=character:";
const STORY_WORLD = "https://www.buildablekids.com/api/story-library?img=world:";

// ---- the pick lists (kept small & friendly: 4 quick choices, then a name) ----
const HEROES = [
  ["bunny", "Bramble Bunny"], ["fox", "Pip Fox"], ["dragon", "Ember Dragon"],
  ["robot", "Bolt Robot"], ["tiger", "Tilly Tiger"], ["unicorn", "Sparkle Unicorn"],
  ["bear", "Biscuit Bear"], ["owl", "Professor Owl"],
];

// Each world bundles everything the two engines need: the platformer's painted
// backdrop (story-library world art), the survival engine's photo backdrop
// (chess-art), a music track, and a colour palette. All assets already exist.
const WORLDS = [
  { id: "forest", label: "Forest",  slug: "enchanted-forest", bg: "/chess-art/jungle_bg.jpg", music: "jungle",
    pal: { ground:"#6b9b4a", groundTop:"#8fc46a", dirt:"#5a4332", coin:"#ffd23f", obstacle:"#7a4a86", enemy:"#c0566f", flag:"#ffd23f", hud:"#ffffff" } },
  { id: "ocean",  label: "Ocean",   slug: "coral-reef",      bg: "/chess-art/ocean_bg.jpg",  music: "ocean",
    pal: { ground:"#2f8fb3", groundTop:"#56b8d8", dirt:"#1d5d77", coin:"#ffe27a", obstacle:"#2b5e86", enemy:"#ff8fb1", flag:"#ffe27a", hud:"#ffffff" } },
  { id: "space",  label: "Space",   slug: "space-station",   bg: "/chess-art/space_bg.jpg",  music: "space",
    pal: { ground:"#3a3a6e", groundTop:"#5b5bb0", dirt:"#23234a", coin:"#9be7ff", obstacle:"#6a4fe0", enemy:"#c69bff", flag:"#9be7ff", hud:"#ffffff" } },
  { id: "candy",  label: "Candy",   slug: "candy-land",      bg: "/chess-art/candy_bg.jpg",  music: "candy",
    pal: { ground:"#e06aa0", groundTop:"#ff9ec4", dirt:"#a83e70", coin:"#fff07a", obstacle:"#b15ad8", enemy:"#7a5cff", flag:"#fff07a", hud:"#ffffff" } },
  { id: "castle", label: "Castle",  slug: "dragon-mountain", bg: "/chess-art/castle_bg.jpg", music: "castle",
    pal: { ground:"#7a6a52", groundTop:"#a3906f", dirt:"#4a3f30", coin:"#ffd23f", obstacle:"#5e5147", enemy:"#c0566f", flag:"#ffd23f", hud:"#ffffff" } },
  { id: "desert", label: "Desert",  slug: "desert-oasis",    bg: "/chess-art/desert_bg.jpg", music: "desert",
    pal: { ground:"#c79a4a", groundTop:"#e6c46a", dirt:"#8a6a2f", coin:"#fff07a", obstacle:"#9a6a3a", enemy:"#c0566f", flag:"#fff07a", hud:"#ffffff" } },
];

const CHALLENGES = [
  ["easy",   "Easy",   "Gentle and fun"],
  ["medium", "Medium", "A nice challenge"],
  ["hard",   "Hard",   "For brave players"],
];

const MUSICS = [
  ["world",  "Match my world"],
  ["jungle", "Sunny"], ["ocean", "Dreamy"], ["space", "Starlight"],
  ["candy",  "Music box"], ["castle", "Fairytale"], ["desert", "Mellow"],
];

// survival's shared palette (the photo backdrop carries the theme)
const SURV_PAL = { hero:"#eaf2ff", visor:"#62d0ff", spark:"#ffe27a", gem:"#6ff0ff", hp:"#ff7aa8", xp:"#7ad0ff", boss:"#c69bff" };
const SURV_POWERS = ["fast","multi","big","pierce","orbit","nova","frost","homing","swift","magnet","heal","regen","shield"];
const SURV_BASE_LEVELS = [
  { name:"Comet Meadow",   dur:28, spawnEvery:46, maxAlive:8,  eSpeed:1.30, eHp:2, eDmg:1, colors:["#7ee0a0","#8fd0ff"],                     boss:{ hp:26,  spd:1.05, dmg:1 }, bossChar:"dragon"  },
  { name:"Nebula Drift",   dur:34, spawnEvery:40, maxAlive:11, eSpeed:1.45, eHp:3, eDmg:1, colors:["#ffd27a","#ff9ec4","#8fd0ff"],          boss:{ hp:42,  spd:1.15, dmg:1 }, bossChar:"tiger"   },
  { name:"Asteroid Twirl", dur:40, spawnEvery:36, maxAlive:13, eSpeed:1.55, eHp:4, eDmg:1, colors:["#a99cff","#7ee0a0","#ff9ec4"],          boss:{ hp:60,  spd:1.22, dmg:1 }, bossChar:"bear"    },
  { name:"Stardust Caves", dur:44, spawnEvery:34, maxAlive:14, eSpeed:1.62, eHp:4, eDmg:1, colors:["#8fd0ff","#a99cff","#ffd27a"],          boss:{ hp:74,  spd:1.26, dmg:1 }, bossChar:"unicorn" },
  { name:"Rocket Rapids",  dur:48, spawnEvery:32, maxAlive:15, eSpeed:1.68, eHp:5, eDmg:1, colors:["#ff9ec4","#7ee0a0","#8fd0ff"],          boss:{ hp:86,  spd:1.30, dmg:1 }, bossChar:"wizard"  },
  { name:"Galaxy Finale",  dur:52, spawnEvery:30, maxAlive:16, eSpeed:1.74, eHp:5, eDmg:1, colors:["#ff9ec4","#a99cff","#ffd27a","#8fd0ff"], boss:{ hp:104, spd:1.34, dmg:1 }, bossChar:"dragon"  },
];

const heroArt = (slug, style) => ART + slug + "&style=" + style + "&emo=happy";

// ---- turn the four picks into an engine recipe -----------------------------
function platformerLevels(diff) {
  // three rising stages; the engine guarantees gaps stay jumpable, so a level
  // can never become unclearable — difficulty just adds spice.
  const d = diff === "hard" ? 1 : diff === "easy" ? -1 : 0;
  const mk = (name, len, base, boss) => ({
    name, length: len,
    speed: +(3.0 + d * 0.35 + base * 0.15).toFixed(2),
    gapChance: Math.max(0.06, 0.12 + d * 0.04),
    gapMax: diff === "hard" ? 3 : 2,
    obstacleChance: Math.max(0.05, 0.09 + d * 0.03 + base * 0.01),
    enemyChance: Math.max(0.04, 0.08 + d * 0.03 + base * 0.01),
    lowChance: 0.10, coinChance: 0.34, powerupChance: 0.05,
    platformChance: 0.5, starCount: 3, movingPlatChance: 0.55, vineChance: 0.5,
    boss, bossHp: boss ? (diff === "hard" ? 4 : diff === "easy" ? 2 : 3) : 0,
  });
  return [
    mk("First Steps", diff === "easy" ? 110 : 130, 0, false),
    mk("Getting Tricky", diff === "easy" ? 130 : 160, 1, false),
    mk("The Big Finish", diff === "easy" ? 150 : 180, 2, true),
  ];
}

function survivalLevels(diff) {
  const m = diff === "hard"
    ? { sp:1.12, hp:1.35, spawn:0.82, alive:1.2, boss:1.3, dur:1.1 }
    : diff === "easy"
    ? { sp:0.9,  hp:0.7,  spawn:1.25, alive:0.8, boss:0.75, dur:0.85 }
    : { sp:1, hp:1, spawn:1, alive:1, boss:1, dur:1 };
  const r = (n) => Math.max(1, Math.round(n));
  return SURV_BASE_LEVELS.map((lv) => ({
    ...lv,
    dur: r(lv.dur * m.dur),
    spawnEvery: r(lv.spawnEvery * m.spawn),
    maxAlive: r(lv.maxAlive * m.alive),
    eSpeed: +(lv.eSpeed * m.sp).toFixed(2),
    eHp: r(lv.eHp * m.hp),
    boss: { ...lv.boss, hp: r(lv.boss.hp * m.boss), spd: +(lv.boss.spd * m.sp).toFixed(2) },
  }));
}

function buildConfig(engine, pick) {
  const world = WORLDS.find((w) => w.id === pick.world) || WORLDS[0];
  const musicKey = pick.music === "world" ? world.music : pick.music;
  const name = pick.name || (heroName(pick.hero) + "'s " + world.label + " Adventure");
  if (engine === "survival") {
    return {
      name, theme: world.id, artStyle: "modern3d",
      bgImg: world.bg, musicUrl: "/game-music/music_" + musicKey + ".mp3",
      heroUrl: heroArt(pick.hero, "modern3d"),
      palette: SURV_PAL,
      hero: { speed:2.7, hearts:4, fireCd:23, projSpeed:7.0, projDmg:1, projR:0, projPerShot:1, pierce:0, pickupR:115 },
      levels: survivalLevels(pick.difficulty),
      powerups: SURV_POWERS,
    };
  }
  return {
    name, world: world.slug, artStyle: "watercolor", musicKey,
    artBase: "https://www.buildablekids.com/api/game-art",
    heroUrl: heroArt(pick.hero, "watercolor"),
    bgUrl: STORY_WORLD + world.slug + "&style=watercolor",
    palette: world.pal,
    levels: platformerLevels(pick.difficulty),
    powerups: ["shield","magnet","spring","star"],
  };
}

function heroName(slug) { const h = HEROES.find((x) => x[0] === slug); return h ? h[1].split(" ")[0] : "Hero"; }
function b64url(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deviceId() {
  try { let id = localStorage.getItem("deviceId"); if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); } return id; } catch { return "dev_anon"; }
}
function kidProfileId() { try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; } }

// A tappable picture/word tile.
function Tile({ img, label, sub, on, onClick }) {
  return (
    <button onClick={onClick} style={{ ...s.tile, ...(on ? s.tileOn : {}) }}>
      {img && <img src={img} alt="" style={s.tileImg} loading="lazy" />}
      <span style={s.tileLabel}>{label}</span>
      {sub && <span style={s.tileSub}>{sub}</span>}
    </button>
  );
}

export default function GameMaker({ engine = "platformer", onBack, onHome, playerName, remix, onConsumeRemix }) {
  const isSurv = engine === "survival";
  const STYLE = isSurv ? "modern3d" : "watercolor";
  const STEPS = ["hero", "world", "difficulty", "music"];

  const [step, setStep] = useState(0);
  const [hero, setHero] = useState(HEROES[0][0]);
  const [world, setWorld] = useState(WORLDS[0].id);
  const [difficulty, setDifficulty] = useState("easy");
  const [music, setMusic] = useState("world");
  const [name, setName] = useState("");
  const [view, setView] = useState("make"); // make | naming | playing
  const [saved, setSaved] = useState(false);
  const [publishState, setPublishState] = useState("idle"); // idle | busy | done | err
  const builtCfg = useRef(null);

  // remix: a published game tapped on the Top board carries its hero/world back
  useEffect(() => {
    if (remix && remix.meta) {
      if (remix.meta.hero) setHero(remix.meta.hero);
      if (remix.meta.world) setWorld(remix.meta.world);
      if (remix.meta.difficulty) setDifficulty(remix.meta.difficulty);
      if (onConsumeRemix) onConsumeRemix();
    }
  }, [remix]);

  const atEnd = view === "naming";
  const pick = { hero, world, difficulty, music, name };
  const worldObj = WORLDS.find((w) => w.id === world) || WORLDS[0];

  function next() { if (step < STEPS.length - 1) setStep(step + 1); else setView("naming"); }
  function back() { if (view === "naming") setView("make"); else if (step > 0) setStep(step - 1); else onBack && onBack(); }

  function build() {
    const cfg = buildConfig(engine, pick);
    builtCfg.current = cfg;
    setSaved(false); setPublishState("idle");
    setView("playing");
  }

  function doSave() {
    const cfg = builtCfg.current || buildConfig(engine, pick);
    saveGame({
      engine, name: cfg.name, config: cfg,
      hero, world, difficulty,
      image: heroArt(hero, STYLE),
    });
    setSaved(true);
  }

  async function doPublish() {
    setPublishState("busy");
    const cfg = builtCfg.current || buildConfig(engine, pick);
    const enginePath = isSurv ? "/survival.html" : "/play.html";
    const playerHtml =
      "<!doctype html><html><head><meta charset=utf-8>" +
      "<meta name=viewport content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover'>" +
      "<title>" + escapeHtml(cfg.name) + "</title>" +
      "<style>html,body{margin:0;height:100%;background:#0a0a14;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head>" +
      "<body><iframe src='" + enginePath + "?cfg=" + b64url(cfg) + "' allow='autoplay'></iframe></body></html>";
    try {
      const r = await fetch("/api/publish-game", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: deviceId(), kidProfileId: kidProfileId(),
          html: playerHtml, title: cfg.name,
          theme: worldObj.label, mechanicName: isSurv ? "Survival" : "Platformer",
          characterName: heroName(hero), creatorName: playerName || null,
          previewImageUrl: heroArt(hero, STYLE),
        }),
      });
      const j = await r.json();
      setPublishState(j && j.gameId ? "done" : "err");
    } catch { setPublishState("err"); }
  }

  // -------- PLAYING: the live engine, driven by the chosen recipe -----------
  if (view === "playing") {
    const cfg = builtCfg.current;
    const enginePath = isSurv ? "/survival.html" : "/play.html";
    const src = enginePath + "?cfg=" + b64url(cfg);
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0a0a14", zIndex: 50 }}>
        <div style={s.playBar}>
          <button onClick={() => setView("naming")} style={s.barBtn}>← Edit</button>
          <div style={s.barTitle}>{cfg.name}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={doSave} style={{ ...s.barBtn, ...(saved ? s.barBtnDone : {}) }}>{saved ? "Saved ✓" : "Save"}</button>
            <button onClick={doPublish} style={{ ...s.barBtnPrimary, ...(publishState === "done" ? s.barBtnDone : {}) }}>
              {publishState === "busy" ? "Sharing…" : publishState === "done" ? "Shared ✓" : publishState === "err" ? "Try again" : "Publish"}
            </button>
          </div>
        </div>
        <iframe title="Your game" src={src} style={s.gameFrame} allow="autoplay" />
      </div>
    );
  }

  // -------- NAMING: last step — name it, then build -------------------------
  if (view === "naming") {
    const auto = heroName(hero) + "'s " + worldObj.label + " Adventure";
    return (
      <div style={s.page}>
        <Header onHome={onHome} onBack={back} title={isSurv ? "Survival Maker" : "Platformer Maker"} />
        <Dots steps={STEPS} step={STEPS.length} atEnd />
        <h2 style={s.q}>Name your game!</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={auto} style={s.input} maxLength={40} />
        <div style={s.summaryCard}>
          <img src={heroArt(hero, STYLE)} alt="" style={s.summaryHero} />
          <div>
            <div style={s.summaryName}>{heroName(hero)}</div>
            <div style={s.summarySub}>{worldObj.label} · {difficulty} · {music === "world" ? "world music" : (MUSICS.find((m) => m[0] === music) || [])[1]}</div>
          </div>
        </div>
        <button onClick={build} style={s.bigBtn}>Build my game!</button>
        <button onClick={back} style={s.ghostBtn}>← Back</button>
      </div>
    );
  }

  // -------- MAKE: the picker wizard -----------------------------------------
  const cur = STEPS[step];
  return (
    <div style={s.page}>
      <Header onHome={onHome} onBack={back} title={isSurv ? "Survival Maker" : "Platformer Maker"} />
      <Dots steps={STEPS} step={step} />

      {cur === "hero" && (
        <>
          <h2 style={s.q}>Pick your hero</h2>
          <div style={s.grid}>
            {HEROES.map(([slug, label]) => (
              <Tile key={slug} img={heroArt(slug, STYLE)} label={label.split(" ")[0]} on={hero === slug} onClick={() => setHero(slug)} />
            ))}
          </div>
        </>
      )}

      {cur === "world" && (
        <>
          <h2 style={s.q}>Pick your world</h2>
          <div style={s.grid}>
            {WORLDS.map((w) => (
              <Tile key={w.id} img={w.bg} label={w.label} on={world === w.id} onClick={() => setWorld(w.id)} />
            ))}
          </div>
        </>
      )}

      {cur === "difficulty" && (
        <>
          <h2 style={s.q}>How tricky?</h2>
          <div style={s.textGrid}>
            {CHALLENGES.map(([id, label, sub]) => (
              <Tile key={id} label={label} sub={sub} on={difficulty === id} onClick={() => setDifficulty(id)} />
            ))}
          </div>
        </>
      )}

      {cur === "music" && (
        <>
          <h2 style={s.q}>Pick the music</h2>
          <div style={s.textGrid}>
            {MUSICS.map(([id, label]) => (
              <Tile key={id} label={label} on={music === id} onClick={() => setMusic(id)} />
            ))}
          </div>
        </>
      )}

      {/* your-game-so-far strip */}
      <div style={s.sofar}>
        <Chip img={heroArt(hero, STYLE)} val={heroName(hero)} />
        <Chip img={worldObj.bg} val={worldObj.label} />
        <Chip val={difficulty} />
        <Chip val={music === "world" ? "world music" : (MUSICS.find((m) => m[0] === music) || [])[1]} />
      </div>

      <button onClick={next} style={s.bigBtn}>{step < STEPS.length - 1 ? "Next →" : "Almost done →"}</button>
    </div>
  );
}

function Header({ onHome, onBack, title }) {
  return (
    <div style={s.top}>
      <button onClick={onBack} style={s.navBtn}>← Back</button>
      <div style={s.logo}>{title}</div>
      <button onClick={onHome} style={s.navBtn}>Home</button>
    </div>
  );
}
function Dots({ steps, step, atEnd }) {
  return (
    <div style={s.dots}>
      {steps.map((_, i) => <span key={i} style={{ ...s.dot, ...(i === step ? s.dotOn : i < step ? s.dotDone : {}) }} />)}
      <span style={{ ...s.dot, ...(atEnd ? s.dotOn : {}) }} />
    </div>
  );
}
function Chip({ img, val }) {
  return (
    <div style={s.chip}>
      {img && <img src={img} alt="" style={s.chipImg} />}
      <div style={s.chipVal}>{val}</div>
    </div>
  );
}
function escapeHtml(t) { return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

const s = {
  page: { minHeight: "100vh", background: PAGE_BG, padding: "18px 16px 80px", fontFamily: NUN, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center" },
  top: { width: "100%", maxWidth: 760, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  logo: { fontFamily: FRED, fontSize: 24, fontWeight: 700, color: "#fff" },
  navBtn: { fontFamily: NUN, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  dots: { display: "flex", gap: 7, margin: "4px 0 16px" },
  dot: { width: 9, height: 9, borderRadius: "50%", background: "#39406e" },
  dotOn: { background: "#c06b99", width: 22, borderRadius: 6 },
  dotDone: { background: "#7aa2ff" },
  q: { fontFamily: FRED, fontSize: 26, fontWeight: 700, color: "#fff", margin: "2px 0 16px", textAlign: "center" },
  grid: { width: "100%", maxWidth: 720, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 },
  textGrid: { width: "100%", maxWidth: 560, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 },
  tile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 10, borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", fontFamily: NUN },
  tileOn: { border: "2px solid #ffe08a", boxShadow: "0 8px 22px rgba(255,224,138,0.3)", background: "rgba(255,224,138,0.12)" },
  tileImg: { width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 12, background: "rgba(0,0,0,0.3)" },
  tileLabel: { fontFamily: FRED, fontSize: 16, fontWeight: 600 },
  tileSub: { fontSize: 12, color: "#c9c2e0" },
  sofar: { width: "100%", maxWidth: 720, display: "flex", gap: 8, overflowX: "auto", padding: "16px 2px 4px", marginTop: 10 },
  chip: { flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 82, padding: "8px 6px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  chipImg: { width: 46, height: 46, objectFit: "cover", borderRadius: 10 },
  chipVal: { fontSize: 12, fontWeight: 700, textAlign: "center", textTransform: "capitalize" },
  bigBtn: { marginTop: 22, border: "none", borderRadius: 999, padding: "15px 44px", fontFamily: FRED, fontWeight: 700, fontSize: 19, color: "#fff", background: GRAD, boxShadow: "0 10px 26px rgba(155,126,221,0.45)", cursor: "pointer" },
  ghostBtn: { marginTop: 12, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "10px 22px", color: "#cfc9e6", fontFamily: NUN, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  input: { width: "100%", maxWidth: 420, boxSizing: "border-box", borderRadius: 14, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", padding: "14px 16px", fontSize: 17, fontFamily: NUN, textAlign: "center" },
  summaryCard: { display: "flex", alignItems: "center", gap: 14, margin: "20px 0 6px", padding: "12px 18px", borderRadius: 18, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  summaryHero: { width: 56, height: 56, borderRadius: 12, objectFit: "cover" },
  summaryName: { fontFamily: FRED, fontSize: 18, fontWeight: 700 },
  summarySub: { fontSize: 13, color: "#b9b9d0", textTransform: "capitalize" },
  playBar: { position: "absolute", top: 0, left: 0, right: 0, height: 52, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 12px", background: "rgba(10,10,20,0.82)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,0.1)" },
  barTitle: { flex: 1, textAlign: "center", fontFamily: FRED, fontSize: 15, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barBtn: { fontFamily: NUN, fontWeight: 800, fontSize: 13, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap" },
  barBtnPrimary: { fontFamily: NUN, fontWeight: 800, fontSize: 13, color: "#fff", background: GRAD, border: "none", borderRadius: 999, padding: "7px 16px", cursor: "pointer", whiteSpace: "nowrap" },
  barBtnDone: { background: "rgba(40,165,75,0.9)", border: "none" },
  gameFrame: { position: "absolute", top: 52, left: 0, width: "100%", height: "calc(100% - 52px)", border: "none", display: "block" },
};
