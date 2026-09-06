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
  // Session CB1 — a KID-BUILT Breaker board. The campaign says "layout: pyramid"
  // and the engine draws the pattern; a board a child painted brick by brick is
  // an explicit `cells` list instead. It is OPTIONAL and additive: a level with
  // no cells is exactly the level it always was, and a level with cells still
  // names a layout so board size and the art pack still come from one place.
  var BRICK_CELL_TYPES = { ice:1, wood:1, metal:1, candy:1, star:1, bomb:1 };
  function validateCells(lv, at, errors){
    if(lv.cells==null) return;
    if(!Array.isArray(lv.cells) || !lv.cells.length){ errors.push(at+" 'cells' must be a non-empty array when present"); return; }
    if(lv.cells.length>400){ errors.push(at+" 'cells' has too many bricks (max 400)"); return; }
    var t = TPL[lv.layout] || TPL.full, bad = 0;
    lv.cells.forEach(function(c){
      if(!c || typeof c!=="object"){ bad++; return; }
      if(typeof c.r!=="number" || typeof c.c!=="number" || (c.r|0)!==c.r || (c.c|0)!==c.c){ bad++; return; }
      if(c.r<0 || c.c<0 || c.r>=t.rows || c.c>=t.cols){ bad++; return; }
      if(!BRICK_CELL_TYPES[c.type]){ bad++; }
    });
    if(bad) errors.push(at+" 'cells' has "+bad+" brick(s) that are off the board or not a known brick type");
  }
  var breakerProfile = {
    validateLevel: function(lv, at, errors){
      if(!lv.layout || !TPL[lv.layout]) errors.push(at+" 'layout' must be one of "+Object.keys(TPL).join("/")+" (got "+lv.layout+")");
      if(!lv.parts || typeof lv.parts!=="object") errors.push(at+" missing 'parts' object");
      else if(!lv.parts.bricks) errors.push(at+" parts.bricks is required");
      validateCells(lv, at, errors);
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
        cells: (Array.isArray(lv.cells) && lv.cells.length) ? lv.cells : null,   // CB1: a kid-painted board
        art: resolvePack(lv.parts, theme)
      };
    },
    toConfig: function(m, levels){
      return { id:m.id, name:m.name, levels:levels, brickColors:DEFAULT_BRICK_COLORS.slice(), _manifest:m };
    },
    resolveAsset: breakerResolveAsset
  };

  // A BOARD a kid painted in the Breaker maker -> a manifest-v2 it can be saved
  // as. Session CB1. This lives HERE, in the shared loader, on purpose: the
  // engine's maker calls it in the browser and the server calls it through
  // api/_manifestLib.js when it stores the row, so there is exactly ONE place
  // that decides what a kid's board becomes and the two can never drift.
  //
  // The manifest still NAMES A LAYOUT rather than carrying raw cols/rows
  // (manifest golden rule 2), and difficulty stays a 1-5 preset — the painted
  // bricks are the only thing that is per-board.
  var BREAKER_THEME_BY_BACKDROP = { meadow:"jungle", ocean:"ocean", space:"space", castle:"jungle", desert:"jungle", candy:"ocean" };
  function breakerLayoutFor(cols, rows){
    var c = cols||10, r = rows||6, keys = Object.keys(TPL), i, t, best = null;
    for(i=0;i<keys.length;i++){ t = TPL[keys[i]]; if(t.cols===c && t.rows===r) return keys[i]; }
    for(i=0;i<keys.length;i++){ t = TPL[keys[i]];
      if(t.cols>=c && t.rows>=r && (!best || (t.cols*t.rows) < (TPL[best].cols*TPL[best].rows))) best = keys[i]; }
    return best || "frame";
  }
  function breakerBoardToManifest(board){
    board = board || {};
    var name  = String(board.name || "My level").slice(0,60);
    var theme = BREAKER_THEME_BY_BACKDROP[(board.look && board.look.backdrop) || "meadow"] || "jungle";
    var lay   = breakerLayoutFor(board.cols, board.rows), t = TPL[lay];
    var diff  = clamp(parseInt(board.diffN || board.flames || 3, 10) || 3, 1, 5);
    var cells = (Array.isArray(board.cells) ? board.cells : []).filter(function(c){
      return c && BRICK_CELL_TYPES[c.type] && c.r>=0 && c.c>=0 && c.r<t.rows && c.c<t.cols;
    }).map(function(c){ return { r:c.r|0, c:c.c|0, type:c.type }; });
    var level = { id:"L1", name:name, difficulty:diff, unlocked:true, layout:lay,
      parts:{ background:"breaker/bg/"+theme+"-v1", bricks:"breaker/bricks/"+theme+"-v1" } };
    if(cells.length) level.cells = cells;
    return { id:"breaker", name:name, type:"game", shellVersion:2, color:"#FF6B6B", levels:[level] };
  }

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
        world: parts.world || null,                 // per-level art world (hero/enemies/boss/bg); null = whole-game set
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
  //
  // Session SD1 — a block may name a MATERIAL with `m`:
  //   "glass" shatters on almost any hit and vanishes
  //   "wood"  cracks, then breaks after a few good hits
  //   "stone" barely breaks at all — it has to be toppled instead
  // `m` is OPTIONAL and there is no default: a block with no `m` is the old
  // indestructible block, unchanged in weight, grip and look. That is why the
  // six layouts levels 1-6 use (gate/post/tower/double/hut/keep) carry no
  // materials at all — the on-ramp plays exactly as it did before.
  //
  // Session SD3 — a layout may also declare TERRAIN: the ground itself. Before
  // this every level happened on one flat floor at the same height, so every
  // shot was the same arc and a kid never had to think about aim. Terrain is
  // scenery AND fixed physics — it never moves and never breaks:
  //   { k:"hill",  x, w, h }  a mound. It blocks the straight line, so the only
  //                           way at what is behind it is a high lob.
  //   { k:"pit",   x, w, d }  a dip in the floor. A critter sitting down inside
  //                           one cannot be reached along the flat — you have to
  //                           drop something on it.
  //   { k:"ledge", x, w, h }  a raised plinth. Two of them with a gap between
  //                           make a floating deck: knock a leg out and the
  //                           whole thing falls through the gap.
  // `terrain` is OPTIONAL and there is no default. A layout that declares none
  // builds the one flat slab it always did — which is what keeps levels 1-6
  // playing exactly as they were.
  var SLING_LAYOUTS = {
    gate:   { blocks:[ {x:705,y:520,w:30,h:60},{x:775,y:520,w:30,h:60},{x:740,y:476,w:120,h:26} ],
              targets:[ {x:740,y:445} ] },
    tower:  { blocks:[ {x:690,y:520,w:32,h:60},{x:760,y:520,w:32,h:60},{x:725,y:476,w:110,h:26},{x:725,y:438,w:30,h:50} ],
              targets:[ {x:725,y:395},{x:600,y:530} ] },
    double: { blocks:[ {x:620,y:520,w:30,h:60},{x:620,y:474,w:64,h:24},{x:820,y:520,w:30,h:60},{x:820,y:474,w:64,h:24} ],
              targets:[ {x:620,y:444},{x:820,y:444} ] },
    keep:   { blocks:[ {x:660,y:520,w:30,h:60},{x:740,y:520,w:30,h:60},{x:700,y:476,w:130,h:26},{x:672,y:440,w:30,h:46},{x:728,y:440,w:30,h:46},{x:700,y:408,w:90,h:24} ],
              targets:[ {x:700,y:378},{x:560,y:530},{x:840,y:530} ] },
    // grand is level 9 (back half), so it carries materials; the five layouts
    // above it are the levels 1-6 on-ramp and stay material-free on purpose.
    grand:  { blocks:[ {x:700,y:520,w:34,h:60,m:"stone"},{x:780,y:520,w:34,h:60,m:"stone"},{x:740,y:476,w:128,h:26,m:"wood"},{x:712,y:440,w:30,h:46,m:"wood"},{x:768,y:440,w:30,h:46,m:"wood"},{x:740,y:408,w:96,h:24,m:"wood"},{x:740,y:376,w:30,h:42,m:"glass"} ],
              targets:[ {x:740,y:337},{x:600,y:530},{x:845,y:531},{x:480,y:531} ] },
    // --- expansion layouts (Session: 20-level ramp). Each keeps at least one
    // clearly-reachable arc per target so the sensible-aim QA bot clears them all.
    post:   { blocks:[ {x:740,y:520,w:34,h:60},{x:740,y:470,w:34,h:44} ],
              targets:[ {x:740,y:432} ] },
    hut:    { blocks:[ {x:700,y:520,w:30,h:60},{x:780,y:520,w:30,h:60},{x:740,y:478,w:112,h:24} ],
              targets:[ {x:740,y:452},{x:560,y:530} ] },
    // SD3 — ledge is now the FLOATING DECK, and the terrain is the point of it.
    // Two stone plinths stand with 120px of open air between them; a wood leg on
    // each plinth holds up a plank that bridges the gap, and a critter rides the
    // plank. Break either leg and the deck — critter and all — drops through the
    // gap to the floor far below. A stone screen on the near plinth kills the
    // flat shot at the deck, so the choice is a real lob or a broken leg.
    ledge:  { terrain:[ {k:"ledge",x:645,w:120,h:104},{k:"ledge",x:885,w:120,h:104} ],
              blocks:[ {x:600,y:379,w:20,h:130,m:"stone"},
                       {x:662,y:414,w:18,h:60,m:"wood"},{x:868,y:414,w:18,h:60,m:"wood"},
                       {x:765,y:373,w:236,h:22,m:"wood"} ],
              targets:[ {x:765,y:345},{x:420,y:531},{x:300,y:531} ] },
    // trio is the teaching level: one post of each material, side by side.
    trio:   { blocks:[ {x:600,y:520,w:26,h:60,m:"glass"},{x:740,y:520,w:26,h:60,m:"wood"},{x:860,y:520,w:26,h:60,m:"stone"} ],
              targets:[ {x:600,y:478},{x:740,y:478},{x:860,y:478} ] },
    // SD3 — wall is the TEACHING LEVEL FOR TERRAIN. The old stone wall is now a
    // grass hill, and a hill is not something you can smash: the flat shot dies
    // in the slope every time, so the only way at the yard behind it is over the
    // top. Everything worth hitting sits past the hill's far foot.
    wall:   { terrain:[ {k:"hill",x:570,w:220,h:140} ],
              blocks:[ {x:790,y:500,w:22,h:96,m:"wood"},{x:900,y:500,w:22,h:96,m:"wood"},
                       {x:845,y:442,w:150,h:20,m:"stone"} ],
              targets:[ {x:570,y:391},{x:740,y:531},{x:845,y:415} ] },
    // ===================================================================
    //  SD2 — SEALED LAYOUTS. A critter marked `s` sits inside a shell no
    //  arc in the game can reach: the walls beside it and the roof over it
    //  are wood or stone, and glass never covers it (a pal smashes straight
    //  through glass, so glass is a weak point, never a wall). The way in is
    //  always structural — break the leg and let the roof fall on it, or
    //  smash the stalk and let the whole pen come down. qa-sling proves both
    //  halves of that claim: it sweeps every arc the slingshot can make to
    //  show the critter is untouchable, then shows the bot still clears it.
    //
    //  Two rules these shapes obey, learned the hard way:
    //   - the crusher must be NARROWER than the pen it has to fall into, or
    //     it just wedges on the wall tops and nothing happens;
    //   - the roof must start clear of the critter's head, or it is already
    //     crushing it before the kid has taken a shot.
    // ===================================================================
    // bunker — the teaching seal: break a wood leg, the stone roof drops in.
    bunker: { blocks:[ {x:706,y:518,w:16,h:60,m:"wood"},{x:774,y:518,w:16,h:60,m:"wood"},
                       {x:740,y:474,w:124,h:26,m:"stone"} ],
              targets:[ {x:740,y:531,s:true},{x:560,y:531},{x:880,y:531} ] },
    // twinkeep — the pen is fine; the glass stalk holding it up is not.
    twinkeep:{ blocks:[ {x:740,y:516,w:76,h:64,m:"stone"},{x:740,y:450,w:28,h:68,m:"glass"},
                        {x:740,y:404,w:140,h:24,m:"wood"},
                        {x:710,y:370,w:14,h:44,m:"wood"},{x:770,y:370,w:14,h:44,m:"wood"},
                        {x:740,y:330,w:104,h:22,m:"stone"} ],
              targets:[ {x:740,y:375,s:true},{x:600,y:531},{x:880,y:531},{x:500,y:531} ] },
    // SD3 — spire is the TEACHING LEVEL FOR PITS. One critter sits down in a hole
    // in the floor: below the rim, so no shot along the flat can see it, and the
    // hole is too narrow to make a steep drop easy. The tall stack beside it is
    // the answer — topple it and let it fall in.
    spire:  { terrain:[ {k:"pit",x:790,w:120,d:32} ],
              blocks:[ {x:690,y:520,w:40,h:56,m:"stone"},{x:690,y:470,w:30,h:44,m:"wood"},{x:690,y:426,w:22,h:44,m:"wood"} ],
              targets:[ {x:690,y:387},{x:790,y:563},{x:910,y:531} ] },
    // fort — the flat shot is dead: a tall stone screen covers the low line, so
    // the only way at the wood column is a high lob dropping into the gap
    // behind the screen. (Or bowl the screen over onto the tower and let that
    // do it for you.)
    fort:   { blocks:[ {x:600,y:490,w:24,h:116,m:"stone"},
                       {x:700,y:512,w:18,h:72,m:"wood"},{x:782,y:512,w:18,h:72,m:"wood"},
                       {x:740,y:462,w:134,h:28,m:"stone"} ],
              targets:[ {x:740,y:531,s:true},{x:500,y:531},{x:870,y:531},{x:920,y:531} ] },
    // hideout — a stone box you cannot break. Snap the wood shelf across the
    // top and the stone block resting on it drops INSIDE, onto the critter.
    hideout:{ blocks:[ {x:704,y:516,w:14,h:64,m:"stone"},{x:776,y:516,w:14,h:64,m:"stone"},
                       {x:740,y:474,w:104,h:12,m:"wood"},{x:740,y:455,w:50,h:26,m:"stone"} ],
              targets:[ {x:740,y:531,s:true},{x:590,y:531},{x:880,y:531} ] },
    // SD3 — the whole keep now stands on a plinth, so the tower a kid already
    // knows starts 86px higher than their eye line and the arc that used to clear
    // it falls short. Same building, brand new aim.
    tallgrand:{ terrain:[ {k:"ledge",x:690,w:110,h:86},{k:"ledge",x:880,w:110,h:86} ],
                blocks:[ {x:700,y:435,w:18,h:54,m:"wood"},{x:870,y:435,w:18,h:54,m:"wood"},
                         {x:785,y:396,w:220,h:24,m:"stone"},
                         {x:750,y:357,w:28,h:54,m:"wood"},{x:820,y:357,w:28,h:54,m:"wood"},
                         {x:785,y:318,w:110,h:24,m:"wood"},{x:785,y:286,w:24,h:40,m:"glass"} ],
              targets:[ {x:785,y:249},{x:905,y:445},{x:560,y:531},{x:470,y:531} ] },
    // SD3 — two mounds with a narrow valley between them. Nothing here is behind
    // a wall you can break: the shots have to be threaded, one into the valley,
    // one clean over the far mound, and the ground critters read completely
    // differently depending on which side of a hill they stand on.
    gauntlet:{ terrain:[ {k:"hill",x:540,w:170,h:124},{k:"hill",x:845,w:150,h:104} ],
              blocks:[ {x:660,y:518,w:24,h:60,m:"wood"} ],
              targets:[ {x:660,y:471},{x:735,y:531},{x:845,y:427},{x:390,y:531} ] },
    // SD3 — the pit splits the yard in two. The critter in the hole is the
    // problem: a tower stands either side of it, and the way in is to bring one
    // of them down on top of it rather than to shoot into a slot.
    twintower:{ terrain:[ {k:"pit",x:750,w:132,d:32} ],
                blocks:[ {x:648,y:520,w:36,h:56,m:"stone"},{x:648,y:470,w:28,h:44,m:"wood"},{x:648,y:426,w:20,h:44,m:"glass"},
                         {x:855,y:520,w:36,h:56,m:"stone"},{x:855,y:470,w:28,h:44,m:"wood"},{x:855,y:426,w:20,h:44,m:"glass"} ],
              targets:[ {x:648,y:387},{x:855,y:387},{x:750,y:563},{x:450,y:531} ] },
    // citadel — two sealed critters at once, and the same move does not open
    // both: the left keep wants a leg broken, the right one wants its stalk gone.
    citadel:{ blocks:[ {x:600,y:518,w:16,h:60,m:"wood"},{x:668,y:518,w:16,h:60,m:"wood"},
                       {x:634,y:474,w:120,h:26,m:"stone"},
                       {x:850,y:516,w:64,h:64,m:"stone"},{x:850,y:450,w:26,h:68,m:"glass"},
                       {x:850,y:404,w:120,h:22,m:"wood"},
                       {x:822,y:372,w:14,h:42,m:"wood"},{x:878,y:372,w:14,h:42,m:"wood"},
                       {x:850,y:334,w:92,h:20,m:"stone"} ],
              targets:[ {x:634,y:531,s:true},{x:850,y:377,s:true},{x:740,y:531},{x:500,y:531} ] },
    // finale — every seal in the game in one yard: drop a block through a stone
    // box, and take a pedestal out from under a pen, with three loose critters
    // in between so there is no single shot that does it all.
    finale: { blocks:[ {x:704,y:516,w:14,h:64,m:"stone"},{x:776,y:516,w:14,h:64,m:"stone"},
                       {x:740,y:474,w:104,h:12,m:"wood"},{x:740,y:455,w:50,h:26,m:"stone"},
                       {x:890,y:516,w:60,h:64,m:"stone"},{x:890,y:450,w:24,h:68,m:"glass"},
                       {x:890,y:404,w:116,h:22,m:"wood"},
                       {x:864,y:372,w:14,h:42,m:"wood"},{x:916,y:372,w:14,h:42,m:"wood"},
                       {x:890,y:334,w:88,h:20,m:"stone"} ],
              targets:[ {x:740,y:531,s:true},{x:890,y:377,s:true},{x:560,y:531},{x:640,y:531},{x:480,y:531} ] }
  };
  // SD3 — the SHAPE of a piece of terrain, defined once for everybody. The
  // engine builds its physics body from these exact points and paints them; the
  // level-card painter draws the same points. Nobody re-derives the maths, so a
  // card can never quietly drift out of step with the level it advertises.
  // SLING_GY is the sling engine's ground line (`GY` in sling-squad.html).
  var SLING_GY = 548;
  function slingTerrainPoly(t){
    var half = t.w/2;
    if(t.k === "hill"){
      // a rounded mound with a flat crest wide enough to stand a critter on:
      // elliptical shoulders either side, which keeps the shape convex so it
      // builds as one clean physics body.
      var flat = half*0.30, sh = half-flat, N = 6, pts = [], i, a;
      pts.push({ x:t.x-half, y:SLING_GY });
      for(i=1;i<=N;i++){ a=(Math.PI/2)*(i/N);
        pts.push({ x:t.x-half+sh*(1-Math.cos(a)), y:SLING_GY-t.h*Math.sin(a) }); }
      pts.push({ x:t.x+flat, y:SLING_GY-t.h });
      for(i=N-1;i>=1;i--){ a=(Math.PI/2)*(i/N);
        pts.push({ x:t.x+half-sh*(1-Math.cos(a)), y:SLING_GY-t.h*Math.sin(a) }); }
      pts.push({ x:t.x+half, y:SLING_GY });
      return pts;
    }
    if(t.k === "ledge"){                       // a plinth: straight sides, slight batter
      var lt = SLING_GY-t.h;
      return [ {x:t.x-half,y:SLING_GY}, {x:t.x-half+5,y:lt}, {x:t.x+half-5,y:lt}, {x:t.x+half,y:SLING_GY} ];
    }
    return null;                               // a pit is a hole in the floor, not a shape
  }

  // How many slings a level hands out. Still derived from difficulty 1-5 and the
  // number of critters — never a raw number in a manifest.
  // SD3 — the SPARE is what difficulty now buys. It used to be four to seven
  // spare slings on the back half, which is why the whole game could be brute
  // forced by flinging pals at everything. From difficulty 3 up there is exactly
  // ONE spare, so a level has to be solved rather than out-shot; difficulty 1-2
  // (the levels 1-6 on-ramp) still forgives two or three bad shots, which is what
  // keeps the start of the game clearable by a six year old.
  function slingLaunches(d, tCount){ d=clamp(d,1,5);
    var spare = (d<=1) ? 3 : (d<=2) ? 2 : 1;
    return tCount + spare; }
  var slingProfile = {
    validateLevel: function(lv, at, errors){
      if(!lv.layout || !SLING_LAYOUTS[lv.layout]) errors.push(at+" 'layout' must be one of "+Object.keys(SLING_LAYOUTS).join("/")+" (got "+lv.layout+")");
      if(lv.parts!=null && typeof lv.parts!=="object") errors.push(at+" 'parts' must be an object");
    },
    toLevel: function(lv){
      var d = clamp(lv.difficulty,1,5);
      var geo = SLING_LAYOUTS[lv.layout] || SLING_LAYOUTS.gate;
      // `m` (SD1 material) rides along only when the layout sets one; a block with
      // no material reaches the engine exactly as it always did.
      var blocks  = geo.blocks.map(function(b){ var o={ x:b.x, y:b.y, w:b.w, h:b.h }; if(b.m) o.m=b.m; return o; });
      // `s` (SD2 sealed) rides along the same way `m` does: it marks a critter
      // the layout promises no arc can touch, so the engine and QA both know
      // which ones have to be reached by collapsing the building instead.
      var targets = geo.targets.map(function(t){ var o={ x:t.x, y:t.y }; if(t.s) o.s=true; return o; });
      // SD3 terrain rides along the same way: only when the layout declares it,
      // so a layout with no terrain reaches the engine exactly as it always did.
      var terrain = (geo.terrain||[]).map(function(t){
        var o={ k:t.k, x:t.x, w:t.w }; if(t.h!=null) o.h=t.h; if(t.d!=null) o.d=t.d; return o; });
      var parts = lv.parts || {};
      return {
        id: lv.id, name: lv.name, difficulty: d,
        launches: slingLaunches(d, targets.length),   // engine tuning derived from difficulty 1-5
        blocks: blocks, targets: targets, terrain: terrain,
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
        world: parts.world || parts.stage || parts.theme || null,   // per-level art world (null = built-in art)
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
  var PROFILES = { breaker: breakerProfile, survival: survivalProfile, sling: slingProfile, studio: studioProfile, chess: chessProfile, board: boardProfile, checkers: boardProfile, tictactoe: boardProfile, connectfour: boardProfile, dotsboxes: boardProfile, croc: crocProfile, croctot: crocProfile, "rileys-garden": crocProfile, mahjong: crocProfile, bingo: crocProfile, stringmatch: crocProfile, memory: crocProfile, typing: crocProfile, bubble: crocProfile, castleguard: crocProfile, tennis: crocProfile, skyflyer: crocProfile, mathcannon: mathProfile };
  // Studios always use the studio profile (they have no levelProfile/levels); every
  // other game keys off its id (or an explicit levelProfile), falling back to breaker.
  function profileFor(m){ if(m && m.type==="studio") return studioProfile; var key = m && (m.levelProfile || m.id); return PROFILES[key] || breakerProfile; }

  // ---------------------------------------------------------------------------
  //  LANDING KIND (Session 7E). The shell draws ONE landing for every game; this
  //  tells it which body to draw under the shared header + mode row:
  //    "studio"  -> no levels, no journey (type: studio; manifest-v2 section 7)
  //    "board"   -> board game: "levels" are OPPONENT tiers, so the landing shows a
  //                 simple pick-difficulty-and-play frame (chess/checkers/ttt/...)
  //    "journey" -> level game: "levels" are an ordered path, so the landing opens
  //                 the winding journey (breaker/survival/sling/croc/...)
  //  Derived from the same PROFILE registry the loader already uses, so there is
  //  ONE source of truth and zero per-game logic in the shell. Pure + headless-safe.
  // ---------------------------------------------------------------------------
  function landingKind(m){
    if(m && m.type==="studio") return "studio";
    var p = profileFor(m);
    if(p===boardProfile || p===chessProfile) return "board";
    return "journey";
  }

  // back-compat export (Breaker convention). Kept so anything importing
  // resolveAsset keeps resolving Breaker asset IDs exactly as before.
  function resolveAsset(id){
    if(typeof id==="string" && id.indexOf("studio:")===0) return "/api/asset-studio?asset="+encodeURI(id.slice(7));
    return breakerResolveAsset(id);
  }


  // ===========================================================================
  //  STRICT MODE — the COBUILD SHEET is the fence (Session CB2).
  // ===========================================================================
  //  A kid's game is built by an AI, so "valid" is not enough: the manifest must
  //  also stay inside what THIS engine can actually do. Every Cobuild engine ships
  //  a sheet at public/<engine>/cobuild.json listing its art slots, its dials with
  //  their range, the shape a level may take, the feel presets, the rules
  //  vocabulary it really fires, and a plain list of what it can NEVER do.
  //
  //  validate(m, { strict:true, sheet:sheetJson }) rejects ANY field, slot or
  //  value the sheet does not name. Without the flag validate() behaves exactly as
  //  it always has, so nothing we already ship changes.
  //
  //  Pure + headless-safe: the sheet is passed IN (this file never fetches), so the
  //  browser, the server (api/kid-game.js) and the QA robots all run the same code.
  // ---------------------------------------------------------------------------
  function readPath(o, path){
    var parts = String(path||"").split("."), cur = o, i;
    for(i=0;i<parts.length;i++){ if(cur==null || typeof cur!=="object") return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function inList(list, v){ for(var i=0;i<list.length;i++) if(list[i]===v) return true; return false; }

  // One dial's value, wherever it lives. "levels[].difficulty" is checked on every
  // level; anything else is a plain dotted path on the manifest.
  function checkDial(m, dial, errors){
    var key = String(dial.key||""), pre = "levels[].";
    var spots = [];
    if(key.indexOf(pre)===0){
      var sub = key.slice(pre.length);
      (Array.isArray(m.levels)?m.levels:[]).forEach(function(lv,i){ spots.push({ at:"levels["+i+"] "+sub, v:readPath(lv, sub) }); });
    } else spots.push({ at:key, v:readPath(m, key) });
    spots.forEach(function(s){
      if(s.v==null) return;                                  // not set is always fine; the default applies
      if(dial.type==="boolean"){ if(typeof s.v!=="boolean") errors.push(s.at+" must be yes or no (got "+JSON.stringify(s.v)+")"); return; }
      if(typeof s.v!=="number" || !isFinite(s.v)){ errors.push(s.at+" must be a number (got "+JSON.stringify(s.v)+")"); return; }
      if(dial.step===1 && (s.v|0)!==s.v) errors.push(s.at+" must be a whole number (got "+s.v+")");
      if(dial.min!=null && s.v<dial.min) errors.push(s.at+" is "+s.v+", lower than "+dial.min+" — "+(dial.label||key));
      if(dial.max!=null && s.v>dial.max) errors.push(s.at+" is "+s.v+", higher than "+dial.max+" — "+(dial.label||key));
    });
  }

  // rules:[{when,do,params}] — layer two. The SHEET says which events this engine
  // really fires and which actions it can really run, so a rule the engine would
  // silently ignore is an error rather than a disappointment.
  function checkRules(rules, sheet, errors){
    if(rules==null) return;
    if(!Array.isArray(rules)){ errors.push("'rules' must be a list"); return; }
    if(rules.length>20){ errors.push("'rules' has "+rules.length+" rules (max 20)"); return; }
    var vocab = sheet.rules || {}, evs = vocab.events||[], acts = vocab.actions||[];
    rules.forEach(function(r,i){
      var at = "rules["+i+"]";
      if(!r || typeof r!=="object" || Array.isArray(r)){ errors.push(at+" is not a rule"); return; }
      if(!inList(evs, r.when)) errors.push(at+" '"+r.when+"' is not something "+(sheet.label||sheet.engine)+" can tell you about (it knows "+evs.join(", ")+")");
      if(!inList(acts, r["do"])) errors.push(at+" '"+r["do"]+"' is not something "+(sheet.label||sheet.engine)+" can do (it can "+acts.join(", ")+")");
      if(r.params!=null && (typeof r.params!=="object" || Array.isArray(r.params))) errors.push(at+" 'params' must be an object");
      if(r.when==="everyNSeconds"){
        var n = r.params && r.params.seconds;
        if(typeof n!=="number" || n<1 || n>120) errors.push(at+" everyNSeconds needs params.seconds between 1 and 120");
      }
      Object.keys(r).forEach(function(k){ if(k!=="when" && k!=="do" && k!=="params") errors.push(at+" has a field nothing reads: '"+k+"'"); });
    });
  }

  function strictCheck(m, sheet, errors){
    if(!sheet || typeof sheet!=="object"){ errors.push("strict mode needs the engine's cobuild sheet, and none was given"); return; }
    var man = sheet.manifest || {}, L = sheet.level || {}, who = sheet.label || sheet.engine || "this engine";

    var okKeys = {}; (man.keys||[]).forEach(function(k){ okKeys[k]=1; });
    Object.keys(m).forEach(function(k){ if(!okKeys[k]) errors.push("'"+k+"' is not a field "+who+" reads"); });
    (man.required||[]).forEach(function(k){ if(m[k]==null) errors.push("missing '"+k+"'"); });
    var fixed = man.fixed || {};
    Object.keys(fixed).forEach(function(k){ if(m[k]!==fixed[k]) errors.push("'"+k+"' must be "+JSON.stringify(fixed[k])+" for "+who+" (got "+JSON.stringify(m[k])+")"); });

    if(m.feel!=null){
      if(typeof m.feel!=="object" || Array.isArray(m.feel)) errors.push("'feel' must be an object");
      else Object.keys(m.feel).forEach(function(k){
        var allowed = (sheet.feel||{})[k];
        if(!allowed) errors.push("feel."+k+" is not a feel "+who+" has");
        else if(!inList(allowed, m.feel[k])) errors.push("feel."+k+" must be one of "+allowed.join("/")+" (got "+JSON.stringify(m.feel[k])+")");
      });
    }

    var lv = Array.isArray(m.levels) ? m.levels : [];
    if(L.max!=null && lv.length>L.max) errors.push(who+" can have at most "+L.max+" levels (got "+lv.length+")");
    if(L.min!=null && lv.length<L.min) errors.push(who+" needs at least "+L.min+" level");

    var lvKeys = {}; (L.keys||[]).forEach(function(k){ lvKeys[k]=1; });
    var geo = L.geometry || {}, partSpec = L.parts || {};
    var partKeys = {}; (partSpec.keys||[]).forEach(function(k){ partKeys[k]=1; });
    var partRe = partSpec.pattern ? new RegExp(partSpec.pattern) : null;
    var layouts = geo.layouts ? (Array.isArray(geo.layouts) ? geo.layouts : Object.keys(geo.layouts)) : null;

    lv.forEach(function(x,i){
      var at = "levels["+i+"]";
      if(!x || typeof x!=="object"){ errors.push(at+" is not a level"); return; }
      Object.keys(x).forEach(function(k){ if(!lvKeys[k]) errors.push(at+" '"+k+"' is not a field "+who+" reads on a level"); });
      (L.required||[]).forEach(function(k){ if(x[k]==null) errors.push(at+" missing '"+k+"'"); });
      if(layouts && lvKeys.layout && !inList(layouts, x.layout)) errors.push(at+" 'layout' must be one of "+layouts.join("/")+" (got "+JSON.stringify(x.layout)+")");
      if(x.parts!=null){
        if(typeof x.parts!=="object" || Array.isArray(x.parts)) errors.push(at+" 'parts' must be an object");
        else Object.keys(x.parts).forEach(function(k){
          if(!partKeys[k]){ errors.push(at+" parts."+k+" is not a part "+who+" has"); return; }
          var v = x.parts[k];
          if(typeof v==="string" && partRe && !partRe.test(v)) errors.push(at+" parts."+k+" is not an art id "+who+" can resolve (got "+JSON.stringify(v)+")");
          if(typeof v==="string" && partSpec.themes && k==="theme" && !inList(partSpec.themes, v)) errors.push(at+" parts.theme must be one of "+partSpec.themes.join("/")+" (got "+JSON.stringify(v)+")");
        });
      }
      if(geo.maxCells!=null && Array.isArray(x.cells) && x.cells.length>geo.maxCells) errors.push(at+" has "+x.cells.length+" bricks (max "+geo.maxCells+")");
      if(geo.cellTypes && Array.isArray(x.cells)) x.cells.forEach(function(c){ if(c && !inList(geo.cellTypes, c.type)) errors.push(at+" has a brick kind "+who+" does not have: "+JSON.stringify(c && c.type)); });
      (L.constraints||[]).forEach(function(c){
        var a = readPath(x, c.left), b = readPath(x, c.right);
        if(typeof a!=="number" || typeof b!=="number") return;
        if(c.op==="<=" && a>b) errors.push(at+" "+(c.why || (c.left+" cannot be more than "+c.right)));
        if(c.op===">=" && a<b) errors.push(at+" "+(c.why || (c.left+" cannot be less than "+c.right)));
      });
    });

    (sheet.dials||[]).forEach(function(d){ checkDial(m, d, errors); });
    checkRules(m.rules, sheet, errors);
  }

  // ---- validation -----------------------------------------------------------
  // Returns { ok, errors:[...], warnings:[...] }. Errors block the manifest from
  // being applied (engine keeps its built-in levels); warnings just log. The
  // universal fields are checked here; per-game level fields are checked by the
  // active profile so each game type validates its own level shape.
  function validate(m, opts){
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
    // rules:[{when,do,params}] — the SHAPE is checked for everyone; WHICH events and
    // actions exist is a strict-mode question, because only the sheet knows.
    if(m.rules!=null){
      if(!Array.isArray(m.rules)) errors.push("'rules' must be a list");
      else m.rules.forEach(function(r,i){
        if(!r || typeof r!=="object" || Array.isArray(r)) errors.push("rules["+i+"] is not a rule");
        else if(typeof r.when!=="string" || typeof r["do"]!=="string") errors.push("rules["+i+"] needs a 'when' and a 'do'");
      });
    }
    // CB2 strict mode: also fence the manifest inside the engine's cobuild sheet.
    if(opts && opts.strict) strictCheck(m, opts.sheet, errors);
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

  // ===========================================================================
  //  KID GAMES (?kg=<id>) — Session CB1. ONE shared change, no per-engine code.
  // ===========================================================================
  //  A kid-made game is a manifest the kid owns pointed at an engine we already
  //  ship. So an engine does not learn anything new: it still asks this loader
  //  for "its" manifest. When the page carries ?kg=<id>, the loader hands back
  //  the KID'S manifest (from /api/kid-game) instead of the stock one, and puts
  //  the kid's own cover over the screen while it lands.
  //
  //  Because both entry points go through here — load() for the engines that use
  //  the shared loader, rawManifest() for an engine that fetches its own JSON —
  //  adding ?kg= to any engine's URL is all it takes. Nothing below is
  //  game-specific and nothing runs at all when the param is absent.
  //
  //  Headless-safe: with no document/fetch every function here no-ops.
  var KG_CACHE = null;          // the row, once
  var KG_PENDING = null;        // the in-flight promise-ish (array of callbacks)
  var KG_COVER = null;          // the cover element, while it is up

  function kidGameId(){
    try{
      if(typeof location==="undefined" || !location.search) return null;
      var m = /[?&]kg=([A-Za-z0-9][A-Za-z0-9-]{1,63})(?:&|$)/.exec(location.search);
      return m ? m[1] : null;
    }catch(e){ return null; }
  }

  // Fetch the kid's row ONCE, whoever asks first. cb(row|null).
  function kidGame(cb){
    var id = kidGameId();
    if(!id){ if(cb) cb(null); return; }
    if(KG_CACHE !== null){ if(cb) cb(KG_CACHE || null); return; }
    if(KG_PENDING){ if(cb) KG_PENDING.push(cb); return; }
    if(typeof fetch!=="function"){ if(cb) cb(null); return; }
    KG_PENDING = cb ? [cb] : [];
    var done = function(row){
      KG_CACHE = row || false;
      var waiting = KG_PENDING || []; KG_PENDING = null;
      for(var i=0;i<waiting.length;i++){ try{ waiting[i](row||null); }catch(e){} }
    };
    // Opening a kid's game counts as a play. The ONE exception is a page that has
    // already counted it server-side (the /g/<id> share viewer, which counts the
    // open while it builds the link preview) — it passes kgplay=0 so one visit is
    // never two plays.
    var count = "1";
    try{ if(/[?&]kgplay=0(?:&|$)/.test(location.search)) count = "0"; }catch(e){}
    fetch("/api/kid-game?op=load&play="+count+"&id="+encodeURIComponent(id))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ done(j && j.ok && j.game ? j.game : null); })
      .catch(function(){ done(null); });
  }

  // ---- the kid's cover (the loading screen) --------------------------------
  //  Drawn geometry only — no emoji anywhere, per the house rule. It goes up the
  //  moment the page knows it is playing a kid's game, fills in the title and the
  //  credit when the row lands, and comes down when the manifest is applied (or
  //  after a hard timeout, so a failure can never leave a kid staring at a card).
  function kgEsc(s){ return String(s==null?"":s).replace(/[<>&]/g,function(m){ return {"<":"&lt;",">":"&gt;","&":"&amp;"}[m]; }); }
  function kgCredit(row){
    var kid = (row && row.kid_name) ? String(row.kid_name).trim() : "";
    var up  = (row && row.grownup_name) ? String(row.grownup_name).trim() : "";
    if(kid && up) return "A GAME BY " + kid + " AND " + up;
    if(kid) return "A GAME BY " + kid;
    return "A GAME MADE RIGHT HERE";
  }
  function kgShowCover(){
    if(typeof document==="undefined" || !document.body || KG_COVER) return;
    var d = document.createElement("div");
    d.id = "bkKidCover";
    d.setAttribute("data-kid-cover","1");
    d.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;"+
      "align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;"+
      "background:radial-gradient(circle at 50% 18%,#2b2456,#14122b 70%);color:#fff;"+
      "font-family:'Nunito',system-ui,-apple-system,sans-serif;transition:opacity .45s ease";
    d.innerHTML =
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFD86B" stroke-width="1.6" '+
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
        '<path d="M12 2.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 8.9l6-.8z"/></svg>'+
      '<div data-kid-cover-name style="font-size:clamp(24px,7vw,40px);font-weight:900;line-height:1.1;max-width:14ch">Loading your game</div>'+
      '<div data-kid-cover-by style="font-size:clamp(11px,3vw,14px);font-weight:800;letter-spacing:2px;color:#B9AEEA">ONE MOMENT</div>'+
      '<div style="width:120px;height:6px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">'+
        '<div data-kid-cover-bar style="width:35%;height:100%;border-radius:99px;background:linear-gradient(90deg,#9B7BFF,#67E8F9)"></div></div>';
    document.body.appendChild(d);
    KG_COVER = d;
  }
  function kgFillCover(row){
    if(!KG_COVER || !row) return;
    var n = KG_COVER.querySelector("[data-kid-cover-name]");
    var b = KG_COVER.querySelector("[data-kid-cover-by]");
    if(n) n.innerHTML = kgEsc(row.name || "My game");
    if(b) b.innerHTML = kgEsc(kgCredit(row));
  }
  function kgHideCover(){
    if(!KG_COVER) return;
    var d = KG_COVER; KG_COVER = null;
    try{ d.style.opacity = "0"; }catch(e){}
    setTimeout(function(){ try{ if(d.parentNode) d.parentNode.removeChild(d); }catch(e){} }, 500);
  }
  // Put it up as early as the DOM allows, and never leave it up for good.
  function kgBoot(){
    if(!kidGameId() || typeof document==="undefined") return;
    var start = function(){
      kgShowCover();
      setTimeout(kgHideCover, 8000);                 // hard floor: never a stuck cover
      kidGame(function(row){
        if(row) kgFillCover(row); else kgHideCover(); // no row = nothing to announce
        // The kid gets a beat to read their own title before the game shows.
        if(row) setTimeout(kgHideCover, 1400);
      });
    };
    if(document.body) start();
    else if(document.addEventListener) document.addEventListener("DOMContentLoaded", start);
  }
  kgBoot();

  // ---- the RAW manifest for a game, honouring ?kg= --------------------------
  //  For an engine that reads its own manifest JSON rather than going through
  //  load() (Sky Flyer). cb(manifest|null) — the kid's when ?kg= names one on
  //  this engine, the stock file otherwise. Never throws.
  function rawManifest(id, cb){
    var finish = function(m){ try{ if(cb) cb(m||null); }catch(e){} };
    if(typeof fetch!=="function"){ finish(null); return; }
    var fallback = function(){
      fetch("/"+id+"/manifest.json").then(function(r){ return r.ok?r.json():null; }).then(finish).catch(function(){ finish(null); });
    };
    if(!kidGameId()){ fallback(); return; }
    kidGame(function(row){
      // A kid game only overrides the engine it was made for; a ?kg= meant for
      // another engine is ignored rather than played on the wrong one.
      if(row && row.engine===id && row.manifest && typeof row.manifest==="object"){ finish(row.manifest); return; }
      fallback();
    });
  }

  // ---- browser loader: fetch -> validate -> onReady(engineCfg, manifest) ----
  function load(id, onReady, onError){
    var hasFetch = (typeof fetch==="function");
    if(!hasFetch){ if(onError) onError(["fetch unavailable (headless) — skipping load"]); return; }

    function apply(m){
      var v = validate(m);
      if(v.warnings.length) try{ console.warn("["+id+"] manifest warnings:", v.warnings); }catch(e){}
      if(!v.ok){ if(onError) onError(v.errors); else try{ console.error("["+id+"] manifest invalid:", v.errors); }catch(e){} return; }
      if(onReady) onReady(toEngineConfig(m), m);
    }

    // Session 4A: the level editor can save a LIVE override, served by /api/manifest. Read that
    // first (an override wins; otherwise the endpoint returns the static file). If the endpoint is
    // unreachable, fall straight back to the static /<id>/manifest.json so the game always loads.
    function stock(){
      var apiUrl    = "/api/manifest?game=" + encodeURIComponent(id) + "&v=" + Date.now();
      var staticUrl = "/" + id + "/manifest.json?v=" + Date.now();
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

    // Session CB1 — ?kg=<id> means "play the KID'S game on this engine". The
    // engine asked for its own manifest and gets the kid's instead; everything
    // downstream (validate -> profile -> engine config) is unchanged, which is
    // why no engine needed a code change to play a kid-made game.
    if(kidGameId()){
      kidGame(function(row){
        if(row && row.engine===id && row.manifest && typeof row.manifest==="object"){ apply(row.manifest); return; }
        // Not this engine's game (or the row would not load): fall back to the
        // stock manifest so the engine still opens rather than sitting blank.
        stock();
      });
      return;
    }
    stock();
  }

  var API = { validate:validate, checkRules:checkRules, resolveAsset:resolveAsset, toEngineConfig:toEngineConfig, load:load, rawManifest:rawManifest, breakerBoardToManifest:breakerBoardToManifest, kidGame:kidGame, kidGameId:kidGameId, kidGameCredit:kgCredit, hideKidCover:kgHideCover, TPL:TPL, multiplayerMode:multiplayerMode, multiplayerTransport:multiplayerTransport, learningDefaults:learningDefaults, landingKind:landingKind, slingTerrainPoly:slingTerrainPoly };
  root.BuildableManifest = API;
  if(typeof module!=="undefined" && module.exports) module.exports = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this));
