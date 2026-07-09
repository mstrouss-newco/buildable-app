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

  // ---- profile registry -----------------------------------------------------
  var PROFILES = { breaker: breakerProfile, survival: survivalProfile, sling: slingProfile };
  function profileFor(m){ var key = m && (m.levelProfile || m.id); return PROFILES[key] || breakerProfile; }

  // back-compat export (Breaker convention). Kept so anything importing
  // resolveAsset keeps resolving Breaker asset IDs exactly as before.
  function resolveAsset(id){ return breakerResolveAsset(id); }

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
    var levels = (m.levels||[]).map(prof.toLevel);
    return prof.toConfig(m, levels);
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

  var API = { validate:validate, resolveAsset:resolveAsset, toEngineConfig:toEngineConfig, load:load, TPL:TPL };
  root.BuildableManifest = API;
  if(typeof module!=="undefined" && module.exports) module.exports = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this));
