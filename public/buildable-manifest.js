// ============================================================================
//  buildable-manifest.js  —  the SHELL's manifest loader + validator.
//  One shared contract (see buildable-manifest-v2.md). The shell reads a game's
//  manifest to build every screen around it; the engine reads it for its levels,
//  layouts, difficulty and art. Games never hardcode art or difficulty.
//
//  Per-game details (how a level's layout/parts read, how difficulty 1-5 becomes
//  engine tuning) live in a small PROFILE, keyed by the manifest's id (or an
//  explicit `levelProfile`). Breaker was the first; Session 5A adds Survival.
//  Adding a game = adding a profile here, never special-casing the loader.
//
//  Works in the browser (fetch) AND headless (Node/VM, no fetch) so the QA robot
//  can validate the same file and play the manifest's levels.
//  Exposes window.BuildableManifest = { validate, resolveAsset, toEngineConfig, load }.
// ============================================================================
(function(root){
  "use strict";
  function clamp(v,a,b){ v=+v; if(isNaN(v))v=a; return Math.max(a,Math.min(b,v)); }

  var COIN_BY_DIFF = { 1:10, 2:15, 3:20, 4:25, 5:30 };

  // ===========================================================================
  //  MULTIPLAYER switch (Session 6A). The manifest's features.multiplayer picks a
  //  LANE in the EXISTING multiplayer system (see MULTIPLAYER.md):
  //    off        -> single-player (no lane)
  //    turn-based -> poll-a-row      ("turns")
  //    realtime   -> Broadcast       ("realtime")
  //  Pure + headless-safe; reads ONLY features, so it also works for board games
  //  and studios that have no breaker-style levels.
  // ===========================================================================
  var MP_MODES        = { "off":1, "turn-based":1, "realtime":1 };
  var MP_TO_TRANSPORT = { "off":null, "turn-based":"turns", "realtime":"realtime" };
  function multiplayerMode(m){ var v = m && m.features && m.features.multiplayer; return MP_MODES[v] ? v : "off"; }
  function multiplayerTransport(m){ return MP_TO_TRANSPORT[multiplayerMode(m)]; }

  // ===========================================================================
  //  LEARNING switch (Session 6B). The manifest's features.learning declares the
  //  DEFAULTS for a game's learning moments. Parents override these per-kid from
  //  the grown-ups area (their setting wins); this only reads the game defaults.
  //    beforeUnlock  -> one skippable question before a new level unlocks
  //    coinTopUp     -> short on coins? 3 correct answers = 10 coins
  //    bonusAfterWin -> optional post-win question for extra coins
  //    subjects      -> which subjects to draw from (grade drives difficulty)
  //  Pure + headless-safe; reads ONLY features.
  // ===========================================================================
  var LEARN_SUBJECTS = { math:1, geometry:1, spelling:1, reading:1, mix:1 };
  function learningDefaults(m){
    var L = (m && m.features && m.features.learning) || {};
    var subs = Array.isArray(L.subjects) ? L.subjects.filter(function(s){ return LEARN_SUBJECTS[s]; }) : [];
    if(!subs.length) subs = ["math"];
    return {
      beforeUnlock:  !!L.beforeUnlock,          // default OFF: fewer interruptions
      coinTopUp:     L.coinTopUp !== false,      // default ON: practicing can always earn coins
      bonusAfterWin: !!L.bonusAfterWin,          // default OFF
      subjects:      subs
    };
  }

  // ===========================================================================
  //  BREAKER profile (brick layouts). Unchanged behaviour from Sessions 2A-4A.
  // ===========================================================================
  // Layout templates own geometry (cols/rows/pattern). Same table the engine uses,
  // so "layout" in the manifest == the engine's pattern + board size. One template,
  // one size — no raw cols/rows knobs live in the manifest (manifest golden rule 2).
  var TPL = {
    full:    { cols:10, rows:6, pattern:"full"    },
    pyramid: { cols:9,  rows:5, pattern:"pyramid" },
    checker: { cols:10, rows:5, pattern:"checker" },
    gaps:    { cols:10, rows:6, pattern:"gaps"    },
    columns: { cols:10, rows:6, pattern:"columns" },
    frame:   { cols:11, rows:7, pattern:"frame"   },
    diamond: { cols:11, rows:7, pattern:"diamond" }
  };
  var DEFAULT_BRICK_COLORS = ["#ff7aa8","#ffb04d","#ffd86b","#7ee0a0","#62d0ff","#9b7bff","#ff8fce"];
  var THEME_FALL = { jungle:"#2f6d3a", space:"#1b1650", ocean:"#1a6fa0" };

  // asset library ID -> URL (Breaker convention). e.g. "breaker/bg/jungle-v1"
  // -> "/breaker/jungle/bg.webp". Unknown IDs return null so the engine can fall
  // back to its built-in art rather than 404.
  function breakerResolveAsset(id){
    if(!id || typeof id!=="string") return null;
    // Editor drop-in / Library assets are stored in the shared studio; a "studio:"
    // id resolves to its served bytes. Works for every slot and every game.
    if(id.indexOf("studio:")===0) return "/api/asset-studio?asset="+encodeURI(id.slice(7));
    var m = /^breaker\/(bg|bricks|balls|paddle|shatter)\/([a-z0-9]+)-v\d+$/.exec(id);
    if(m){ return "/breaker/"+m[2]+"/"+m[1]+".webp"; }
    return null;
  }
  function themeFromParts(parts){
    parts = parts||{};
    var src = parts.background || parts.bricks || "";
    var m = /^breaker\/(?:bg|bricks)\/([a-z0-9]+)-v\d+$/.exec(src);
    return (m && m[1]) ? m[1] : "jungle";
  }
  function resolvePack(parts, theme){
    parts = parts||{};
    return {
      bg:      breakerResolveAsset(parts.background) || ("/breaker/"+theme+"/bg.webp"),
      bricks:  breakerResolveAsset(parts.bricks)     || ("/breaker/"+theme+"/bricks.webp"),
      balls:   breakerResolveAsset(parts.balls)      || ("/breaker/"+theme+"/balls.webp"),
      paddle:  breakerResolveAsset(parts.paddle)     || ("/breaker/"+theme+"/paddle.webp"),
      shatter: "/breaker/"+theme+"/shatter.webp",
      fall:    THEME_FALL[theme] || "#2f6d3a"
    };
  }
  var breakerProfile = {
    validateLevel: function(lv, at, errors){
      if(!lv.layout || !TPL[lv.layout]) errors.push(at+" 'layout' must be one of "+Object.keys(TPL).join("/")+" (got "+lv.layout+")");
      if(!lv.parts || typeof lv.parts!=="object") errors.push(at+" missing 'parts' object");
      else if(!lv.parts.bricks) errors.push(at+" parts.bricks is required");
    },
    toLevel: function(lv){
      var t = TPL[lv.layout] || TPL.full;
      var d = clamp(lv.difficulty,1,5);
      var theme = themeFromParts(lv.parts);
      return {
        id: lv.id, name: lv.name,
        cols: t.cols, rows: t.rows, pattern: t.pattern,
        difficulty: d,
        tough: (d-1)*0.12,          // engine tuning derived from difficulty 1-5
        speed: 3.8 + d*0.5,
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        theme: theme,
        unlocked: !!lv.unlocked,
        journeyBadge: lv.journeyBadge || null,
        parts: lv.parts || null,
        art: resolvePack(lv.parts, theme)
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, levels:levels, brickColors:DEFAULT_BRICK_COLORS.slice(), _manifest:m };
    },
    resolveAsset: breakerResolveAsset
  };

  // ===========================================================================
  //  SURVIVAL profile (survivor "recipes"). Session 5A.
  // ===========================================================================
  // Difficulty 1-5 is the ONLY tunable knob; the engine tuning (survive duration,
  // spawn cadence, enemy speed/hp, boss stats) is DERIVED here — no raw numbers
  // live in the manifest (golden rule 2). Art/content (which foes, which boss,
  // which sky) is declared per level in `parts`. The curve is calibrated to sit
  // at or under the pre-5A hand-tuned values (proven winnable), trending slightly
  // easier so the QA robot stays green.
  function survTune(d){
    d = clamp(d,1,5);
    return {
      dur:        22 + d*6,                       // d1..d5 = 28,34,40,46,52 s
      spawnEvery: 48 - d*3,                       // slower spawns as d rises stays fair
      maxAlive:   6 + d*2,                        // 8,10,12,14,16
      eSpeed:     +(1.20 + d*0.11).toFixed(2),    // kept under the hero's speed so kiting always works
      eHp:        Math.min(5, 1 + d),             // 2,3,4,5,5
      eDmg:       1,
      boss:       { hp: 8 + d*18, spd: +(1.00 + d*0.06).toFixed(2), dmg: 1 }
    };
  }
  var survivalProfile = {
    validateLevel: function(lv, at, errors){
      if(!lv.parts || typeof lv.parts!=="object"){ errors.push(at+" missing 'parts' object"); return; }
      if(!Array.isArray(lv.parts.foes) || !lv.parts.foes.length) errors.push(at+" parts.foes must be a non-empty array");
      if(!lv.parts.boss || typeof lv.parts.boss!=="string") errors.push(at+" parts.boss is required");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var t = survTune(d);
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        dur: t.dur, spawnEvery: t.spawnEvery, maxAlive: t.maxAlive,
        eSpeed: t.eSpeed, eHp: t.eHp, eDmg: t.eDmg,
        colors: (Array.isArray(lv.colors) && lv.colors.length) ? lv.colors : ["#8fd0ff","#7ee0a0","#ff9ec4"],
        foes: parts.foes || [],
        boss: t.boss,
        bossKey: parts.boss || "enemy_rock",
        bossName: lv.bossName || "Boss",
        bgKey: (parts.bgKey != null ? parts.bgKey : 1),
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        journeyBadge: lv.journeyBadge || null,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, color:m.color, levels:levels, _manifest:m };
    },
    resolveAsset: function(){ return null; }   // the survival engine maps its own art keys (enemy_*, bgKey)
  };

  // ===========================================================================
  //  SLING profile (slingshot towers). Session 5B.
  // ===========================================================================
  // Named tower LAYOUTS own the geometry (blocks + targets); the manifest never
  // stores raw coordinates (golden rule 2) — a level just NAMES a layout. The one
  // tunable is difficulty 1-5, which DERIVES how many slings the kid gets; the
  // floor keeps it at (targets + 2) so the sensible-aim bot always clears with a
  // sling to spare. Art (which backdrop scene) is declared per level in `parts`.
  var SLING_LAYOUTS = {
    gate:   { blocks:[ {x:705,y:520,w:30,h:60},{x:775,y:520,w:30,h:60},{x:740,y:476,w:120,h:26} ],
              targets:[ {x:740,y:445} ] },
    tower:  { blocks:[ {x:690,y:520,w:32,h:60},{x:760,y:520,w:32,h:60},{x:725,y:476,w:110,h:26},{x:725,y:438,w:30,h:50} ],
              targets:[ {x:725,y:395},{x:600,y:530} ] },
    double: { blocks:[ {x:620,y:520,w:30,h:60},{x:620,y:474,w:64,h:24},{x:820,y:520,w:30,h:60},{x:820,y:474,w:64,h:24} ],
              targets:[ {x:620,y:444},{x:820,y:444} ] },
    keep:   { blocks:[ {x:660,y:520,w:30,h:60},{x:740,y:520,w:30,h:60},{x:700,y:476,w:130,h:26},{x:672,y:440,w:30,h:46},{x:728,y:440,w:30,h:46},{x:700,y:408,w:90,h:24} ],
              targets:[ {x:700,y:378},{x:560,y:530},{x:840,y:530} ] },
    grand:  { blocks:[ {x:700,y:520,w:34,h:60},{x:780,y:520,w:34,h:60},{x:740,y:476,w:128,h:26},{x:712,y:440,w:30,h:46},{x:768,y:440,w:30,h:46},{x:740,y:408,w:96,h:24},{x:740,y:376,w:30,h:42} ],
              targets:[ {x:740,y:337},{x:600,y:530},{x:860,y:530} ] }
  };
  function slingLaunches(d, tCount){ d=clamp(d,1,5); return Math.max(3+d, tCount+2); }
  var slingProfile = {
    validateLevel: function(lv, at, errors){
      if(!lv.layout || !SLING_LAYOUTS[lv.layout]) errors.push(at+" 'layout' must be one of "+Object.keys(SLING_LAYOUTS).join("/")+" (got "+lv.layout+")");
      if(lv.parts!=null && typeof lv.parts!=="object") errors.push(at+" 'parts' must be an object");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var geo = SLING_LAYOUTS[lv.layout] || SLING_LAYOUTS.gate;
      var blocks  = geo.blocks.map(function(b){ return { x:b.x, y:b.y, w:b.w, h:b.h }; });
      var targets = geo.targets.map(function(t){ return { x:t.x, y:t.y }; });
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        launches: slingLaunches(d, targets.length),   // engine tuning derived from difficulty 1-5
        blocks: blocks, targets: targets,
        bg: (parts.scene || null),                    // which backdrop scene (engine falls back if art missing)
        world: (parts.world || null),                 // per-level art world (helpers/bad guys/background); null = whole-game set
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        journeyBadge: lv.journeyBadge || null,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, color:m.color, world:"castle", levels:levels, _manifest:m };
    },
    resolveAsset: function(){ return null; }   // the sling engine maps its own art keys (scene/pals/targets)
  };

  // ===========================================================================
  //  STUDIO profile (type: studio). Session 6C — Music Maker is the first.
  // ===========================================================================
  // Studios have NO levels and NO journey (manifest-v2 section 7). Instead they
  // declare `produces` (what creations come out) and `savesTo` (which library they
  // publish into). Everything else — badge, coins, customization (e.g. instrument
  // packs), learning moments — works exactly like a game and is read straight from
  // the manifest by the shell. This profile just gives the loader a clean studio
  // shape so a studio never gets pushed through the level-based game path.
  var studioProfile = {
    validateLevel: function(){},          // studios have no levels to validate
    toLevel: function(lv){ return lv; },  // defensive: a stray level passes through untouched
    toConfig: function(m, levels){
      return {
        id: m.id, name: m.name, color: m.color, type: "studio",
        produces: (m.produces || null),
        savesTo:  (m.savesTo  || null),
        customization: (m.customization || []),
        levels: levels,                   // normally [] for a studio
        _manifest: m
      };
    },
    resolveAsset: function(){ return null; }
  };

  // ===========================================================================
  //  CHESS profile (board game). Session 7B.
  // ===========================================================================
  // Chess has no brick-style levels; instead its manifest "levels" are OPPONENT
  // TIERS (a real journey: beat the friendly bot, unlock the clever one, then the
  // grandmaster). The one tunable is difficulty 1-5, which DERIVES the engine's bot
  // strength string (easy/medium/hard) — no raw search-depth numbers live in the
  // manifest (golden rule 2). Worlds (jungle/ocean/space/...) are picked freely, so
  // they are a customization slot, not an unlock chain; the engine keeps its own
  // world art (chess-art/, /api/images chesspiece) and falls back if a slot is missing.
  var CHESS_BOTS = { easy:1, medium:1, hard:1 };
  function chessBot(parts, d){
    var o = parts && parts.opponent;
    if(CHESS_BOTS[o]) return o;              // explicit tier wins
    d = clamp(d,1,5);
    return d<=1 ? "easy" : (d>=4 ? "hard" : "medium");   // else derive from difficulty 1-5
  }
  var chessProfile = {
    validateLevel: function(lv, at, errors){
      if(lv.parts!=null && typeof lv.parts!=="object"){ errors.push(at+" 'parts' must be an object"); return; }
      if(lv.parts && lv.parts.opponent!=null && !CHESS_BOTS[lv.parts.opponent])
        errors.push(at+" parts.opponent must be easy/medium/hard (got "+lv.parts.opponent+")");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        bot: chessBot(parts, d),                 // engine bot-strength string (easy/medium/hard)
        desc: lv.desc || "",
        world: parts.world || null,              // suggested world for this tier (engine falls back)
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      // Available worlds = the customization "World" slot options; the engine keeps its
      // own per-world art and just honours which world keys are offered (asset tail == key).
      var worlds = [];
      (m.customization||[]).forEach(function(slot){
        if(slot && /world/i.test(slot.slot||"")) (slot.options||[]).forEach(function(o){
          var key = String(o.asset||"").split("/").pop();
          if(key) worlds.push({ key:key, name:(o.name||key), price:(o.price||0) });
        });
      });
      return { id:m.id, name:m.name, color:m.color, tiers:levels, worlds:worlds, worldArt:(m.worldArt||{}), levels:levels, _manifest:m };
    },
    resolveAsset: function(){ return null; }   // chess maps its own art keys
  };

  // ===========================================================================
  //  BOARD profile (generic board games). Session 7B batch — Checkers, Connect
  //  Four, Tic-Tac-Toe. Like chess, a board game's manifest "levels" are OPPONENT
  //  TIERS (Easy / Medium / Hard, or a game's own words like Tricky). Difficulty
  //  1-5 DERIVES a bot-strength string; a level may also state its exact engine
  //  string in parts.opponent (no fixed vocabulary here — each engine names its
  //  own tiers). Worlds/themes are a free customization slot (loadout), not an
  //  unlock chain; engines keep their own art and fall back if a slot is missing.
  function boardBot(parts, d){
    var o = parts && parts.opponent;
    if(o && typeof o==="string") return o;   // engine's own tier word wins (easy/normal/tricky/...)
    d = clamp(d,1,5);
    return d<=1 ? "easy" : (d>=4 ? "hard" : "medium");   // else derive from difficulty 1-5
  }
  var boardProfile = {
    validateLevel: function(lv, at, errors){
      if(lv.parts!=null && typeof lv.parts!=="object"){ errors.push(at+" 'parts' must be an object"); return; }
      if(lv.parts && lv.parts.opponent!=null && typeof lv.parts.opponent!=="string")
        errors.push(at+" parts.opponent must be a string tier name");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        bot: boardBot(parts, d),                 // engine tier string
        desc: lv.desc || "",
        world: parts.world || null,
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      var worlds = [];
      (m.customization||[]).forEach(function(slot){
        if(slot && /world/i.test(slot.slot||"")) (slot.options||[]).forEach(function(o){
          var key = String(o.asset||"").split("/").pop();
          if(key) worlds.push({ key:key, name:(o.name||key), price:(o.price||0) });
        });
      });
      return { id:m.id, name:m.name, color:m.color, tiers:levels, worlds:worlds, worldArt:(m.worldArt||{}), levels:levels, _manifest:m };
    },
    resolveAsset: function(){ return null; }   // board engines map their own art keys
  };

  // ===========================================================================
  //  CROC profile (single-player ACTION journey). Session 7B batch — Croc Tot.
  //  Levels are ORDERED STAGES (a real journey), each a themed world with a boss.
  //  Difficulty 1-5 is the stage's slot on the ramp; the engine derives its own
  //  spawn/speed tuning from the running level (golden rule 2 — no raw knobs here).
  //  Art (backdrop, boss art, enemies) stays engine-owned with a fallback; the
  //  manifest just names the stages + their theme/boss so the shell/start-screen
  //  can build the level select. A play-assist mode (lives) stays engine-owned.
  var crocProfile = {
    validateLevel: function(lv, at, errors){
      if(lv.parts!=null && typeof lv.parts!=="object") errors.push(at+" 'parts' must be an object");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        theme: parts.theme || null,
        boss: parts.boss || null,
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, color:m.color, levels:levels, stages:levels, _manifest:m };
    },
    resolveAsset: function(){ return null; }   // croc maps its own art keys
  };

  // ===========================================================================
  //  MATH CANNON profile (Session 8C — first native learning game). The academic
  //  skill IS the mechanic: the manifest's "levels" are math STAGES. Each stage
  //  names a theme + which skill it practices (addition / subtraction /
  //  multiplication / mixed). Difficulty 1-5 (manifest golden rule) is the ONLY
  //  tuning knob — the profile translates it into a number band; nobody writes raw
  //  ranges in the manifest. The engine reads ops + maxN + target and generates
  //  fresh problems, reporting each answer to the learning ledger via the `skill`
  //  cartridge message. Pure + headless-safe.
  // ===========================================================================
  var MATH_BAND   = { 1:{ maxN:10 }, 2:{ maxN:20 }, 3:{ maxN:30 }, 4:{ maxN:12 }, 5:{ maxN:20 } };
  var SKILL_OPS   = { addition:["+"], subtraction:["-"], multiplication:["x"], mixed:["+","-"] };
  var DIFF_SKILL  = { 1:"addition", 2:"subtraction", 3:"mixed", 4:"multiplication", 5:"mixed" };
  function mathSkill(lv){ var parts=lv.parts||{}; return (parts.skill && SKILL_OPS[parts.skill]) ? parts.skill : (DIFF_SKILL[clamp(lv.difficulty,1,5)]||"addition"); }
  var mathProfile = {
    validateLevel: function(lv, at, errors){
      if(lv.parts!=null && typeof lv.parts!=="object"){ errors.push(at+" 'parts' must be an object"); return; }
      var sk = lv.parts && lv.parts.skill;
      if(sk!=null && !SKILL_OPS[sk]) errors.push(at+" parts.skill must be one of "+Object.keys(SKILL_OPS).join("/")+" (got "+sk+")");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var parts = lv.parts || {};
      var skill = mathSkill(lv);
      var ops = (skill==="mixed" && d>=5) ? ["+","-","x"] : SKILL_OPS[skill].slice();
      return {
        id: lv.id, name: lv.name, difficulty: d,
        theme: parts.theme || null,
        skill: skill,           // which academic skill this stage practices
        ops: ops,               // operation set the engine draws problems from
        maxN: MATH_BAND[d].maxN, // biggest operand/result for this difficulty band
        target: 5,              // correct answers needed to clear the stage
        coins: (lv.coins!=null ? lv.coins : COIN_BY_DIFF[d]),
        unlocked: !!lv.unlocked,
        parts: parts
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, color:m.color, levels:levels, stages:levels, teaches:(m.teaches||null), _manifest:m };
    },
    resolveAsset: function(){ return null; }   // math cannon draws its own art (geometry)
  };

  // ---- profile registry -----------------------------------------------------
  var PROFILES = { breaker: breakerProfile, survival: survivalProfile, sling: slingProfile, studio: studioProfile, chess: chessProfile, board: boardProfile, checkers: boardProfile, tictactoe: boardProfile, connectfour: boardProfile, dotsboxes: boardProfile, croc: crocProfile, croctot: crocProfile, "rileys-garden": crocProfile, mahjong: crocProfile, bingo: crocProfile, stringmatch: crocProfile, memory: crocProfile, typing: crocProfile, bubble: crocProfile, castleguard: crocProfile, tennis: crocProfile, mathcannon: mathProfile };
  // Studios always use the studio profile (they have no levelProfile/levels); every
  // other game keys off its id (or an explicit levelProfile), falling back to breaker.
  function profileFor(m){ if(m && m.type==="studio") return studioProfile; var key = m && (m.levelProfile || m.id); return PROFILES[key] || breakerProfile; }

  // back-compat export (Breaker convention). Kept so anything importing
  // resolveAsset keeps resolving Breaker asset IDs exactly as before.
  function resolveAsset(id){
    if(typeof id==="string" && id.indexOf("studio:")===0) return "/api/asset-studio?asset="+encodeURI(id.slice(7));
    return breakerResolveAsset(id);
  }

  // ---- validation -----------------------------------------------------------
  // Returns { ok, errors:[...], warnings:[...] }. Errors block the manifest from
  // being applied (engine keeps its built-in levels); warnings just log. The
  // universal fields are checked here; per-game level fields are checked by the
  // active profile so each game type validates its own level shape.
  function validate(m){
    var errors=[], warnings=[];
    if(!m || typeof m!=="object"){ return { ok:false, errors:["manifest is not an object"], warnings:warnings }; }
    if(!m.id || typeof m.id!=="string")   errors.push("missing string 'id'");
    if(!m.name || typeof m.name!=="string") errors.push("missing string 'name'");
    if(m.type!=="game" && m.type!=="studio") errors.push("'type' must be 'game' or 'studio'");
    if(m.shellVersion!==2) warnings.push("shellVersion is not 2 (got "+m.shellVersion+")");
    var prof = profileFor(m);

    if(m.features && ("multiplayer" in m.features) && !MP_MODES[m.features.multiplayer])
      errors.push("features.multiplayer must be off/turn-based/realtime (got "+m.features.multiplayer+")");
    if(m.features && m.features.learning && ("subjects" in m.features.learning) && !Array.isArray(m.features.learning.subjects))
      errors.push("features.learning.subjects must be an array");

    if(m.type==="studio"){
      if(!m.produces || typeof m.produces!=="string") errors.push("studio 'produces' must be a non-empty string");
      if(!m.savesTo  || typeof m.savesTo!=="string")  errors.push("studio 'savesTo' must be a non-empty string");
    }
    if(m.type==="game"){
      if(!Array.isArray(m.levels) || !m.levels.length){ errors.push("'levels' must be a non-empty array"); }
      else {
        var seen={};
        m.levels.forEach(function(lv,i){
          var at="levels["+i+"]";
          if(!lv || typeof lv!=="object"){ errors.push(at+" is not an object"); return; }
          if(!lv.id || typeof lv.id!=="string") errors.push(at+" missing string 'id'");
          else if(seen[lv.id]) errors.push(at+" duplicate id '"+lv.id+"'"); else seen[lv.id]=1;
          if(!lv.name || typeof lv.name!=="string") errors.push(at+" missing string 'name'");
          var d=lv.difficulty;
          if(typeof d!=="number" || d<1 || d>5 || (d|0)!==d) errors.push(at+" 'difficulty' must be an integer 1-5 (got "+d+")");
          if(prof.validateLevel) prof.validateLevel(lv, at, errors);
        });
      }
    }
    if(m.customization && !Array.isArray(m.customization)) errors.push("'customization' must be an array");
    return { ok: errors.length===0, errors: errors, warnings: warnings };
  }

  // ---- manifest -> engine config (pure; browser + Node safe) ----------------
  // The active profile turns each manifest level into the shape its engine wants
  // (Breaker: cols/rows/pattern/tough/speed/art pack; Survival: a survivor recipe)
  // and wraps them in that engine's config envelope.
  function toEngineConfig(m){
    var prof = profileFor(m);
    var levels = (Array.isArray(m.levels)?m.levels:[]).map(prof.toLevel);
    var cfg = prof.toConfig(m, levels);
    cfg.multiplayer = multiplayerMode(m);       // off | turn-based | realtime (the switch)
    cfg.transport   = multiplayerTransport(m);  // null | turns | realtime (the existing lane)
    cfg.learning    = learningDefaults(m);      // per-game learning-moment defaults (parents override)
    return cfg;
  }

  // ---- browser loader: fetch -> validate -> onReady(engineCfg, manifest) ----
  function load(id, onReady, onError){
    var hasFetch = (typeof fetch==="function");
    if(!hasFetch){ if(onError) onError(["fetch unavailable (headless) — skipping load"]); return; }
    // Session 4A: the level editor can save a LIVE override, served by /api/manifest. Read that
    // first (an override wins; otherwise the endpoint returns the static file). If the endpoint is
    // unreachable, fall straight back to the static /<id>/manifest.json so the game always loads.
    var apiUrl    = "/api/manifest?game=" + encodeURIComponent(id) + "&v=" + Date.now();
    var staticUrl = "/" + id + "/manifest.json?v=" + Date.now();
    function apply(m){
      var v = validate(m);
      if(v.warnings.length) try{ console.warn("["+id+"] manifest warnings:", v.warnings); }catch(e){}
      if(!v.ok){ if(onError) onError(v.errors); else try{ console.error("["+id+"] manifest invalid:", v.errors); }catch(e){} return; }
      if(onReady) onReady(toEngineConfig(m), m);
    }
    function fromStatic(){
      fetch(staticUrl).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
        .then(apply)
        .catch(function(err){ if(onError) onError([String(err && err.message || err)]);
          else try{ console.error("["+id+"] manifest load failed:", err); }catch(e){} });
    }
    fetch(apiUrl).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(d){
        var m = (d && d.manifest) ? d.manifest : d;
        if(!m || typeof m!=="object" || (!m.levels && m.type!=="studio")) throw new Error("no manifest");
        apply(m);
      })
      .catch(fromStatic);
  }

  var API = { validate:validate, resolveAsset:resolveAsset, toEngineConfig:toEngineConfig, load:load, TPL:TPL, multiplayerMode:multiplayerMode, multiplayerTransport:multiplayerTransport, learningDefaults:learningDefaults };
  root.BuildableManifest = API;
  if(typeof module!=="undefined" && module.exports) module.exports = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this));
