// ============================================================================
//  buildable-recipes.js — THE RECIPE BOOK (Session CB2).
//
//  WHAT THIS IS. A kid's game is a manifest (see buildable-manifest-v2.md). When
//  a kid says "make it harder" or "put it at night", the AI does NOT hand-write a
//  new manifest — it names a RECIPE, and the recipe makes the edit. Every recipe
//  is a small, named, DETERMINISTIC function:
//
//        apply(manifest, params, sheet) -> a NEW manifest
//
//  Same input, same output, every time. Nothing is mutated: the manifest handed
//  in comes back untouched, so a recipe can be tried and thrown away.
//
//  WHY. Free-form editing is how an AI ships a game nobody can play. A recipe can
//  only move things the engine's COBUILD SHEET (public/<engine>/cobuild.json)
//  already allows, and it clamps to the sheet's own limits, so the result is
//  inside the fence by construction — before validate() even looks at it.
//
//  Each recipe declares which ENGINES it works on. Asking for a recipe an engine
//  does not have is an honest "no" plus the reason, never a silent no-op — that
//  is what lets the AI offer the nearest thing instead of pretending.
//
//  Pure + headless-safe (no DOM, no fetch), so the browser, the server and the QA
//  robots all run the same code. This file is the code side of MECHANICS.md.
// ============================================================================
(function (root) {
  "use strict";

  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var clamp = function (v, a, b) { v = +v; if (isNaN(v)) v = a; return Math.max(a, Math.min(b, v)); };
  var levelsOf = function (m) { return Array.isArray(m.levels) ? m.levels : []; };
  var engineOf = function (m, sheet) { return (sheet && sheet.engine) || (m && (m.levelProfile === "croc" ? m.id : m.id)) || ""; };

  // The sheet's own numbers, with a safe answer when no sheet was handed over.
  function dial(sheet, key, field, fallback) {
    var ds = (sheet && sheet.dials) || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].key === key) return ds[i][field] != null ? ds[i][field] : fallback;
    return fallback;
  }
  function maxLevels(sheet) { return (sheet && sheet.level && sheet.level.max) || 12; }
  function minLevels(sheet) { return (sheet && sheet.level && sheet.level.min) || 1; }
  function themesFor(sheet, key) {
    var slots = (sheet && sheet.art) || [];
    for (var i = 0; i < slots.length; i++) if (slots[i].key === key && Array.isArray(slots[i].themes)) return slots[i].themes;
    return null;
  }
  function okTheme(sheet, key, theme) {
    var list = themesFor(sheet, key);
    if (!list || list.indexOf("*") !== -1) return true;
    return list.indexOf(theme) !== -1;
  }
  // A fresh level id that cannot collide with one already in the game.
  function freeId(m, base) {
    var used = {}, i = 2, id = base;
    levelsOf(m).forEach(function (l) { used[l && l.id] = 1; });
    while (used[id]) { id = base + "-" + i; i++; }
    return id;
  }

  // Where each engine keeps its "hero" and its "world", so one recipe covers all
  // of them without a per-engine branch anywhere else in the codebase.
  var BREAKER_PART = function (slot, theme) { return "breaker/" + slot + "/" + theme + "-v1"; };

  // --------------------------------------------------------------------------
  //  THE RECIPES
  // --------------------------------------------------------------------------
  var RECIPES = {

    rename: {
      label: "Give it a new name",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [{ key: "name", type: "text", max: 60, label: "The new name" }],
      apply: function (m, p) {
        var out = clone(m);
        out.name = String((p && p.name) || out.name || "My game").slice(0, 60);
        return out;
      }
    },

    swapHero: {
      label: "Change who you play as",
      engines: ["breaker", "sling"],
      why: { castleguard: "Castle Guard's knights and archers are animated sheets, so there is no single hero to swap. Try a new boss instead.",
             skyflyer: "Sky Flyer's flyer is chosen in the game, not in the manifest. Try a new world instead." },
      params: [{ key: "theme", type: "theme", label: "Which set the hero comes from" }],
      apply: function (m, p, sheet) {
        var out = clone(m), theme = String((p && p.theme) || "jungle");
        var eng = engineOf(out, sheet);
        levelsOf(out).forEach(function (lv) {
          lv.parts = lv.parts || {};
          if (eng === "breaker") { if (okTheme(sheet, "levels[].parts.paddle", theme)) lv.parts.paddle = BREAKER_PART("paddle", theme); }
          else if (okTheme(sheet, "levels[].parts.world", theme)) lv.parts.world = theme;
        });
        return out;
      }
    },

    swapWorld: {
      label: "Change where it happens",
      engines: ["breaker", "sling", "skyflyer"],
      why: { castleguard: "Castle Guard's paths belong to the engine, so the place cannot change. Try a different wave." },
      params: [{ key: "theme", type: "theme", label: "The new place" }],
      apply: function (m, p, sheet) {
        var out = clone(m), theme = String((p && p.theme) || "jungle"), eng = engineOf(out, sheet);
        levelsOf(out).forEach(function (lv) {
          lv.parts = lv.parts || {};
          if (eng === "breaker") {
            if (!okTheme(sheet, "levels[].parts.bricks", theme)) return;
            lv.parts.background = BREAKER_PART("bg", theme);
            lv.parts.bricks = BREAKER_PART("bricks", theme);
            if (lv.parts.balls) lv.parts.balls = BREAKER_PART("balls", theme);
            if (lv.parts.paddle) lv.parts.paddle = BREAKER_PART("paddle", theme);
          } else if (eng === "sling") {
            if (okTheme(sheet, "levels[].parts.scene", theme)) lv.parts.scene = theme;
          } else if (eng === "skyflyer") {
            var allowed = (sheet && sheet.level && sheet.level.parts && sheet.level.parts.themes) || null;
            if (!allowed || allowed.indexOf(theme) !== -1) lv.parts.theme = theme;
          }
        });
        return out;
      }
    },

    recolor: {
      label: "Change the game's colour",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [{ key: "color", type: "color", label: "The new colour" }],
      apply: function (m, p) {
        var out = clone(m), c = String((p && p.color) || "");
        if (/^#[0-9a-fA-F]{6}$/.test(c)) out.color = c.toUpperCase();
        return out;
      }
    },

    moreCollectibles: {
      label: "More coins to collect",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return shiftCoins(m, +1, p, sheet); }
    },

    fewerCollectibles: {
      label: "Fewer coins to collect",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return shiftCoins(m, -1, p, sheet); }
    },

    harder: {
      label: "Make it harder",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return shiftDifficulty(m, +((p && p.by) || 1), sheet); }
    },

    easier: {
      label: "Make it easier",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return shiftDifficulty(m, -((p && p.by) || 1), sheet); }
    },

    addBoss: {
      label: "Put a big boss at the end",
      engines: ["castleguard"],
      why: { breaker: "Breaker has no boss to fight. The nearest thing is a level full of metal bricks.",
             sling: "Sling Squad has no boss with health bars. The nearest thing is a tougher building.",
             skyflyer: "Sky Flyer has no enemies at all, so it cannot have a boss. Try a world with a bigger coin goal." },
      params: [{ key: "name", type: "text", max: 30, label: "What the boss is called" }],
      apply: function (m, p) {
        var out = clone(m), ls = levelsOf(out);
        if (!ls.length) return out;
        var last = ls[ls.length - 1];
        last.parts = last.parts || {};
        last.parts.boss = String((p && p.name) || "Goblin King").slice(0, 30);
        return out;
      }
    },

    removeBoss: {
      label: "Take the boss away",
      engines: ["castleguard"],
      apply: function (m) {
        var out = clone(m);
        levelsOf(out).forEach(function (lv) { if (lv.parts && lv.parts.boss != null) delete lv.parts.boss; });
        return out;
      }
    },

    nightMode: {
      label: "Make it night time",
      engines: ["breaker", "skyflyer"],
      why: { sling: "Sling Squad's backdrops are daytime scenes, so there is no night. Try the forest scene for a darker look.",
             castleguard: "Castle Guard's path art has no night version yet." },
      apply: function (m, p, sheet) { return dayNight(m, "night", sheet); }
    },

    dayMode: {
      label: "Make it day time",
      engines: ["breaker", "skyflyer"],
      apply: function (m, p, sheet) { return dayNight(m, "day", sheet); }
    },

    zoomier: {
      label: "Make everything faster",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return setFeel(m, "zippy", sheet); }
    },

    calmer: {
      label: "Make everything calmer",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      apply: function (m, p, sheet) { return setFeel(m, "chill", sheet); }
    },

    addLevel: {
      label: "Add one more level",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [{ key: "name", type: "text", max: 40, label: "What the new level is called" }],
      apply: function (m, p, sheet) {
        var out = clone(m), ls = levelsOf(out);
        if (!ls.length) return out;
        if (ls.length >= maxLevels(sheet)) return out;               // the sheet's ceiling wins
        var copy = clone(ls[ls.length - 1]);
        copy.name = String((p && p.name) || ("Level " + (ls.length + 1))).slice(0, 40);
        copy.id = freeId(out, String(copy.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || ("level-" + (ls.length + 1)));
        copy.unlocked = false;
        var hi = dial(sheet, "levels[].difficulty", "max", 5);
        if (typeof copy.difficulty === "number") copy.difficulty = clamp(copy.difficulty + 1, 1, hi);
        out.levels = ls.concat([copy]);
        return out;
      }
    },

    removeLevel: {
      label: "Take a level away",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [{ key: "id", type: "text", label: "Which level (leave empty for the last one)" }],
      apply: function (m, p, sheet) {
        var out = clone(m), ls = levelsOf(out);
        if (ls.length <= minLevels(sheet)) return out;               // never empty the game
        var id = p && p.id;
        var keep = id ? ls.filter(function (l) { return l.id !== id; }) : ls.slice(0, -1);
        if (keep.length === ls.length) return out;                   // no such level: nothing happens
        if (!keep.some(function (l) { return l.unlocked; })) keep[0].unlocked = true;
        out.levels = keep;
        return out;
      }
    },

    mathGate: {
      label: "Answer a question before you play",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [{ key: "on", type: "boolean", label: "Ask questions before a new level unlocks" }],
      apply: function (m, p) {
        var out = clone(m), on = (p && p.on) === false ? false : true;
        out.features = out.features || {};
        var L = out.features.learning || {};
        L.beforeUnlock = on;
        L.coinTopUp = L.coinTopUp !== false;
        var subs = Array.isArray(L.subjects) ? L.subjects.slice() : [];
        if (on && subs.indexOf("math") === -1) subs.push("math");
        L.subjects = subs;
        out.features.learning = L;
        return out;
      }
    },

    voiceLine: {
      label: "Say something out loud",
      engines: ["breaker", "sling", "castleguard", "skyflyer"],
      params: [
        { key: "when", type: "event", label: "When to say it" },
        { key: "text", type: "text", max: 80, label: "What to say" }
      ],
      apply: function (m, p, sheet) {
        var out = clone(m);
        var evs = (sheet && sheet.rules && sheet.rules.events) || ["onWin"];
        var when = (p && p.when) || "onWin";
        if (evs.indexOf(when) === -1) return out;                    // an event this engine never fires: no-op
        var text = String((p && p.text) || "Nice one!").slice(0, 80);
        var rules = Array.isArray(out.rules) ? out.rules.slice() : [];
        if (rules.length >= 20) return out;
        rules.push({ when: when, "do": "sayLine", params: { text: text } });
        out.rules = rules;
        return out;
      }
    }
  };

  // ---- shared moves the recipes above are made of --------------------------
  function shiftDifficulty(m, by, sheet) {
    var out = clone(m);
    var lo = dial(sheet, "levels[].difficulty", "min", 1), hi = dial(sheet, "levels[].difficulty", "max", 5);
    levelsOf(out).forEach(function (lv) {
      if (typeof lv.difficulty === "number") lv.difficulty = clamp(lv.difficulty + by, lo, hi);
    });
    return out;
  }
  // "Collectibles" means the coin goal on Sky Flyer (what you must scoop to beat a
  // world) and the coin payout everywhere else. Both are sheet dials, so both clamp.
  function shiftCoins(m, dir, p, sheet) {
    var out = clone(m), eng = engineOf(out, sheet);
    var step = Math.max(1, Math.abs(parseInt((p && p.by), 10) || 0) || (eng === "skyflyer" ? 4 : 5));
    if (eng === "skyflyer") {
      var lo = dial(sheet, "levels[].parts.goalCoins", "min", 4), hi = dial(sheet, "levels[].parts.goalCoins", "max", 40);
      levelsOf(out).forEach(function (lv) {
        lv.parts = lv.parts || {};
        var cur = typeof lv.parts.goalCoins === "number" ? lv.parts.goalCoins : dial(sheet, "levels[].parts.goalCoins", "default", 12);
        lv.parts.goalCoins = clamp(cur + dir * step, lo, hi);
      });
      return out;
    }
    var clo = dial(sheet, "levels[].coins", "min", 0), chi = dial(sheet, "levels[].coins", "max", 60);
    var byDiff = { 1: 10, 2: 15, 3: 20, 4: 25, 5: 30 };
    levelsOf(out).forEach(function (lv) {
      var cur = typeof lv.coins === "number" ? lv.coins : (byDiff[clamp(lv.difficulty, 1, 5)] || 20);
      lv.coins = clamp(cur + dir * step, clo, chi);
    });
    return out;
  }
  // Night and day are a THEME move, not a filter: Breaker goes to its space set and
  // back to jungle; Sky Flyer's world theme goes to space and back to its ocean day.
  function dayNight(m, mode, sheet) {
    var out = clone(m), eng = engineOf(out, sheet);
    var theme = mode === "night" ? "space" : (eng === "breaker" ? "jungle" : "ocean");
    levelsOf(out).forEach(function (lv) {
      lv.parts = lv.parts || {};
      if (eng === "breaker") {
        if (!okTheme(sheet, "levels[].parts.bricks", theme)) return;
        lv.parts.background = BREAKER_PART("bg", theme);
        lv.parts.bricks = BREAKER_PART("bricks", theme);
        if (lv.parts.balls) lv.parts.balls = BREAKER_PART("balls", theme);
        if (lv.parts.paddle) lv.parts.paddle = BREAKER_PART("paddle", theme);
      } else if (eng === "skyflyer") {
        var allowed = (sheet && sheet.level && sheet.level.parts && sheet.level.parts.themes) || null;
        if (!allowed || allowed.indexOf(theme) !== -1) lv.parts.theme = theme;
        if (lv.palette && mode === "night") { lv.palette.sky = "#101A3A"; lv.palette.fog = "#2A3568"; lv.palette.sun = "#FFF3C4"; }
      }
    });
    return out;
  }
  function setFeel(m, pace, sheet) {
    var out = clone(m);
    var allowed = (sheet && sheet.feel && sheet.feel.pace) || ["chill", "normal", "zippy"];
    if (allowed.indexOf(pace) === -1) return out;
    out.feel = out.feel || {};
    out.feel.pace = pace;
    return out;
  }

  // --------------------------------------------------------------------------
  //  THE DOOR. One way in, so nothing anywhere else picks a recipe by hand.
  // --------------------------------------------------------------------------
  //  apply("harder", manifest, params, sheet)
  //    -> { ok:true, manifest }                          the edit, as a new manifest
  //    -> { ok:false, error, nearest? }                  an honest no, with the reason
  function apply(id, manifest, params, sheet) {
    var r = RECIPES[id];
    if (!r) return { ok: false, error: "there is no recipe called '" + id + "'" };
    if (!manifest || typeof manifest !== "object") return { ok: false, error: "there is no game to change" };
    var eng = (sheet && sheet.engine) || (manifest && manifest.id) || "";
    if (r.engines.indexOf(eng) === -1) {
      var why = (r.why && r.why[eng]) || ((sheet && sheet.label) || eng || "this game") + " cannot do '" + id + "'.";
      return { ok: false, error: why, nearest: nearestFor(eng) };
    }
    var out;
    try { out = r.apply(manifest, params || {}, sheet || null); }
    catch (e) { return { ok: false, error: "the recipe could not be applied: " + String((e && e.message) || e) }; }
    return { ok: true, manifest: out };
  }

  function list(engine) {
    return Object.keys(RECIPES)
      .filter(function (k) { return !engine || RECIPES[k].engines.indexOf(engine) !== -1; })
      .map(function (k) { return { id: k, label: RECIPES[k].label, engines: RECIPES[k].engines.slice(), params: (RECIPES[k].params || []).slice() }; });
  }
  function supports(id, engine) { return !!(RECIPES[id] && RECIPES[id].engines.indexOf(engine) !== -1); }
  function nearestFor(engine) { return list(engine).map(function (r) { return r.id; }); }

  var API = { version: "1.0.0", apply: apply, list: list, supports: supports, ids: function () { return Object.keys(RECIPES); }, _recipes: RECIPES };
  root.BuildableRecipes = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
