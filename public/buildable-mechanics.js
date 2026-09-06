// ============================================================================
//  Buildable Mechanics — shared, reusable "juice"/FX library for game engines.
//  The third shared engine lib, alongside:
//    buildable-renders.js (BR — drawn art)  +  buildable-audio.js (BA — sound).
//
//  WHAT THIS IS: the FX/feel primitives that every hand-authored engine
//  (play.html, survival-engine, croc-engine, breaker-engine) was copy-pasting
//  on its own — particle bursts, screen shake, screen flash, floating pop text,
//  and a composed "explosion". Extracted here so a mechanic invented in one game
//  is instantly reusable in the next. This is the code side of MECHANICS.md.
//
//  DESIGN: stateless helpers that operate on arrays/state the ENGINE owns, so an
//  engine adopts them without changing its data model. Headless-safe (every
//  canvas call is guarded) so the QA sim (update() with no ctx) never breaks.
//
//  TIME MODEL: pass dt in SECONDS for dt-based engines (croc, survival v2). For
//  the older frame-stepped engines, omit dt (defaults to a 1/60s frame). Life is
//  always tracked in seconds internally.
//
//  Usage:  <script src="buildable-mechanics.js"></script>  then  BM = window.BuildableMechanics
//    const fx = { parts:[], pops:[], shake:0, flash:0, flashCol:"#fff" };
//    BM.burst(fx.parts, x, y, "#ff8800", 12);          // spawn particles
//    BM.pop(fx.pops, x, y, "-1", "#ff5555");            // floating text
//    BM.explode(fx, x, y, "#ffa500", { sfx, n:18 });    // burst + flash + shake (+sound)
//    BM.update(fx, dt);                                  // advance + cull every frame
//    BM.draw(ctx, fx, { W, H, font:"700 18px system-ui" }); // render (call inside draw())
//    // shake: read BM.shakeOffset(fx) -> {x,y} and translate the camera by it.
// ============================================================================
(function (g) {
  const BM = { version: "1.0.0" };

  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // normalize dt: seconds if given, else one 60fps frame.
  function sec(dt) { return (typeof dt === "number" && dt > 0) ? Math.min(dt, 0.05) : 1 / 60; }

  // ---- TEXTURES (Kenney particle pack): tinted, additive sprites ------------
  // BM.useTextures({ glow:"/fx/circle_05.png", spark:"/fx/star_01.png", ... })
  // White textures are tinted to any color (cached) and drawn additively for glow.
  BM.tex = {}; BM._tint = {};
  BM.useTextures = function (map) {
    if (typeof Image === "undefined" || !map) return;
    for (const k in map) { if (BM.tex[k]) continue; const im = new Image(); try { im.crossOrigin = "anonymous"; } catch (e) {} im._url = map[k]; im.src = map[k]; BM.tex[k] = im; }
  };
  BM.hasTex = function (role) { const im = BM.tex[role]; return !!(im && (im.naturalWidth || im.width)); };
  function tintedTex(im, col) {
    const key = (im._url || "") + "|" + col;
    if (BM._tint[key]) return BM._tint[key];
    if (typeof document === "undefined" || !(im.naturalWidth || im.width)) return null;
    const TS = 64, c = document.createElement("canvas"); c.width = c.height = TS; const x = c.getContext("2d");
    x.drawImage(im, 0, 0, TS, TS); x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.fillRect(0, 0, TS, TS);
    BM._tint[key] = c; return c;
  }

  // ---- PARTICLE BURST -------------------------------------------------------
  // Spawns n particles outward from (x,y). Mirrors the burst() every engine had.
  // opts: { spd:[min,max], life:[min,max], gravity, drag, r } (all optional)
  BM.burst = function (arr, x, y, col, n, opts) {
    if (!arr) return;
    n = n || 8; opts = opts || {};
    const sp = opts.spd || [60, 240];      // px/sec
    const lf = opts.life || [0.3, 0.5];    // seconds
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(sp[0], sp[1]);
      arr.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(lf[0], lf[1]), max: lf[1], col,
        r: opts.r || 3, gravity: opts.gravity || 0, drag: opts.drag != null ? opts.drag : 4.5,
        tex: opts.tex || null, add: !!opts.additive, rot: opts.tex ? Math.random() * TAU : 0
      });
    }
  };

  BM.updateParticles = function (arr, dt) {
    if (!arr || !arr.length) return arr;
    const s = sec(dt);
    for (const p of arr) {
      p.x += p.vx * s; p.y += p.vy * s;
      const d = Math.max(0, 1 - p.drag * s); p.vx *= d; p.vy *= d;
      if (p.gravity) p.vy += p.gravity * s;
      p.life -= s;
    }
    return _cull(arr);
  };

  BM.drawParticles = function (ctx, arr) {
    if (!ctx || !arr) return;
    for (const p of arr) {
      const a = Math.max(0, Math.min(1, p.life / (p.max || 0.5)));
      const im = p.tex && BM.tex[p.tex];
      if (im && (im.naturalWidth || im.width)) {
        const t = tintedTex(im, p.col || "#fff");
        if (t) { ctx.save(); ctx.globalAlpha = a; if (p.add) ctx.globalCompositeOperation = "lighter";
          const s = (p.r || 3) * 4; ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(p.rot); ctx.drawImage(t, -s / 2, -s / 2, s, s);
          ctx.restore(); continue; }
      }
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.col || "#fff";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 3, 0, TAU); ctx.fill(); ctx.restore();
    }
  };

  // ---- FLOATING POP TEXT ("-1", "+5", "BOOM!") ------------------------------
  BM.pop = function (arr, x, y, txt, col) {
    if (!arr) return;
    arr.push({ x, y, txt: String(txt), col: col || "#fff", life: 0.9, max: 0.9 });
  };
  BM.updatePops = function (arr, dt) {
    if (!arr || !arr.length) return arr;
    const s = sec(dt);
    for (const p of arr) { p.y -= 40 * s; p.life -= s; }
    return _cull(arr);
  };
  BM.drawPops = function (ctx, arr, font) {
    if (!ctx || !arr) return;
    ctx.save(); ctx.textAlign = "center"; ctx.font = font || "700 18px system-ui, sans-serif";
    ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(14,17,38,0.9)";  // dark outline so pop text shows on ANY color
    for (const p of arr) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max || 0.9)));
      ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y);
    }
    ctx.restore();
  };

  // ---- SCREEN SHAKE ---------------------------------------------------------
  // Engine keeps a single number `state.shake` (seconds remaining). Add to it to
  // kick; read shakeOffset() to translate the camera.
  BM.shake = function (state, amt) { if (state) state.shake = Math.max(state.shake || 0, amt || 0.25); };
  BM.shakeOffset = function (state) {
    const a = state && state.shake > 0 ? state.shake : 0;
    if (a <= 0) return { x: 0, y: 0 };
    const mag = Math.min(12, a * 28);
    return { x: rnd(-mag, mag), y: rnd(-mag, mag) };
  };

  // ---- SCREEN FLASH ---------------------------------------------------------
  // Engine keeps state.flash (0..1 strength) + state.flashCol. Kick with flash().
  BM.flash = function (state, col, amt) {
    if (!state) return;
    state.flash = Math.max(state.flash || 0, amt == null ? 0.3 : amt);
    state.flashCol = col || "#ffffff";
  };
  BM.drawFlash = function (ctx, state, W, H) {
    if (!ctx || !state || !(state.flash > 0)) return;
    ctx.save(); ctx.globalAlpha = Math.min(0.85, state.flash); ctx.fillStyle = state.flashCol || "#fff";
    ctx.fillRect(0, 0, W, H); ctx.restore();
  };

  // ---- COMPOSED: EXPLOSION --------------------------------------------------
  // The mechanic kids ask for by name. Burst + flash + shake (+ optional sound +
  // pop text). `fx` is a state bag holding {parts,pops,shake,flash,flashCol}.
  // opts: { n, sfx (fn or name+ba), shake, flash, pop, spd, life, gravity }
  BM.explode = function (fx, x, y, col, opts) {
    opts = opts || {}; const big = !!opts.big;
    if (BM.hasTex("spark")) {
      BM.burst(fx.parts, x, y, col, opts.n || (big ? 14 : 8), { tex: "smoke", additive: false, spd: [20, 90], life: [0.4, 0.8], r: big ? 16 : 9, drag: 3 });
      BM.burst(fx.parts, x, y, "#ffffff", big ? 16 : 8, { tex: "spark", additive: true, spd: [120, 360], life: [0.25, 0.5], r: big ? 6 : 4, drag: 5 });
      BM.burst(fx.parts, x, y, col, big ? 10 : 5, { tex: "star", additive: true, spd: [80, 240], life: [0.3, 0.55], r: big ? 7 : 5, drag: 5 });
      fx.parts.push({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, col: "#ffffff", r: big ? 26 : 14, drag: 0, gravity: 0, tex: "glow", add: true, rot: 0 });
      BM.ring(fx, x, y, big ? 170 : 60, col);
    } else {
      BM.burst(fx.parts, x, y, col, opts.n || 16, { spd: opts.spd, life: opts.life, gravity: opts.gravity, r: opts.r });
    }
    BM.flash(fx, opts.flashCol || col, opts.flash != null ? opts.flash : (big ? 0.3 : 0.18));
    BM.shake(fx, opts.shake != null ? opts.shake : (big ? 0.4 : 0.12));
    if (opts.pop) BM.pop(fx.pops, x, y, opts.pop, opts.popCol || col);
    if (typeof opts.sfx === "function") opts.sfx();
    else if (opts.sfx && g.BuildableAudio) g.BuildableAudio.sfx(opts.sfx);
  };

  // ---- MUZZLE FLASH: a quick bright flash at (x,y) (visual fire cue, no sound)
  BM.muzzle = function (fx, x, y, col) {
    if (!fx) return;
    if (BM.hasTex("muzzle")) fx.parts.push({ x, y, vx: 0, vy: 0, life: 0.1, max: 0.1, col: col || "#ffe27a", r: 12, drag: 0, gravity: 0, tex: "muzzle", add: true, rot: Math.random() * TAU });
    else BM.burst(fx.parts, x, y, col || "#ffe27a", 3, { spd: [40, 120], life: [0.08, 0.16], r: 2 });
  };

  // ---- SHOCKWAVE RING (nova / explosion) ------------------------------------
  BM.ring = function (fx, x, y, maxR, col) {
    if (!fx) return; if (!fx.rings) fx.rings = [];
    fx.rings.push({ x, y, r: Math.max(8, maxR * 0.18), max: maxR, life: 0.4, mlife: 0.4, col: col || "#ffe27a" });
  };
  BM.drawRings = function (ctx, arr) {
    if (!ctx || !arr) return;
    for (const r of arr) {
      const a = Math.max(0, r.life / (r.mlife || 0.4));
      const im = BM.tex && BM.tex.ring;
      if (im && (im.naturalWidth || im.width)) { const t = tintedTex(im, r.col); if (t) { ctx.save(); ctx.globalAlpha = a * 0.9; ctx.globalCompositeOperation = "lighter"; const s = r.r * 2; ctx.drawImage(t, r.x - s / 2, r.y - s / 2, s, s); ctx.restore(); continue; } }
      ctx.save(); ctx.globalAlpha = a * 0.7; ctx.strokeStyle = r.col; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke(); ctx.restore();
    }
  };

  // ---- ONE-CALL UPDATE + DRAW for the standard fx bag -----------------------
  // fx bag shape: { parts:[], pops:[], shake:0, flash:0, flashCol:"#fff" }
  BM.makeFx = function () { return { parts: [], pops: [], shake: 0, flash: 0, flashCol: "#fff", rings: [] }; };
  BM.update = function (fx, dt) {
    if (!fx) return;
    const s = sec(dt);
    fx.parts = BM.updateParticles(fx.parts, dt);
    fx.pops = BM.updatePops(fx.pops, dt);
    if (fx.rings && fx.rings.length) { for (const r of fx.rings) { r.r += (r.max - r.r) * Math.min(1, 12 * s); r.life -= s; } fx.rings = _cull(fx.rings); }
    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - s);
    if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - s * 1.6);
  };
  // Draw particles + pops + the flash overlay. Call shakeOffset() yourself before
  // drawing the world if you want the shake to move the camera.
  BM.draw = function (ctx, fx, o) {
    if (!ctx || !fx) return; o = o || {};
    BM.drawParticles(ctx, fx.parts);
    if (fx.rings) BM.drawRings(ctx, fx.rings);
    BM.drawPops(ctx, fx.pops, o.font);
    if (o.W && o.H) BM.drawFlash(ctx, fx, o.W, o.H);
  };


  // ==========================================================================
  //  RULES VOCABULARY v0 — LAYER TWO (Session CB2).
  // ==========================================================================
  //  Layer one is the manifest: art, dials, levels. It cannot say "when you grab
  //  a coin, say something". Layer two is a tiny vocabulary an engine opts into:
  //
  //      manifest.rules = [ { when:"onCollect", do:"sayLine", params:{ text:"Yum!" } } ]
  //
  //  EVENTS are things an engine already knows happen. ACTIONS are things the
  //  shared runtime can do about it. Both lists are SHORT on purpose: a kid's game
  //  is built by an AI, and a small closed vocabulary is what makes the result
  //  predictable. Anything outside these two lists is rejected by the strict
  //  validator in buildable-manifest.js, using the engine's cobuild sheet — the
  //  sheet says which of these an engine REALLY fires, so a rule is never quietly
  //  ignored.
  //
  //  An engine adopts this in two lines: build a runtime once, then fire events
  //  where they already happen.
  //
  //      var RULES = BM.rules.make(manifest, { sayLine:toast, playSound:sfx });
  //      RULES.fire("onCollect", { x:px, y:py });      // where a coin is scooped
  //      RULES.tick(dt);                                // once a frame, for everyNSeconds
  //
  //  The host is optional: with no host, sayLine and showText become floating pop
  //  text through the fx bag, playSound goes to BuildableAudio if it is loaded, and
  //  everything else is a no-op. Nothing here throws, ever — a bad rule must never
  //  be able to break a kid's game mid-play.
  //  Pure + headless-safe, so the QA robot fires the same rules the browser does.
  BM.RULE_EVENTS  = ["onLand", "onCollect", "onHit", "everyNSeconds", "onLevelStart", "onWin"];
  BM.RULE_ACTIONS = ["playSound", "sayLine", "spawn", "speedUp", "slowDown", "addPoints", "loseItem", "showText"];

  var RULE_LIMIT = 20;
  // The fx helpers clamp dt hard (0.05s) because a particle must never jump. A
  // rule timer is counting real seconds, so it uses its own, gentler clamp.
  function ruleSec(dt){ return (typeof dt==="number" && dt>0) ? Math.min(dt, 0.25) : 1/60; }

  function ruleErrors(rules, allowed) {
    var errors = [];
    if (rules == null) return errors;
    if (!Array.isArray(rules)) return ["'rules' must be a list"];
    if (rules.length > RULE_LIMIT) errors.push("'rules' has " + rules.length + " rules (max " + RULE_LIMIT + ")");
    var evs = (allowed && allowed.events) || BM.RULE_EVENTS;
    var acts = (allowed && allowed.actions) || BM.RULE_ACTIONS;
    rules.forEach(function (r, i) {
      var at = "rules[" + i + "]";
      if (!r || typeof r !== "object" || Array.isArray(r)) { errors.push(at + " is not a rule"); return; }
      if (evs.indexOf(r.when) === -1) errors.push(at + " does not know the moment '" + r.when + "'");
      if (acts.indexOf(r["do"]) === -1) errors.push(at + " does not know how to '" + r["do"] + "'");
      if (r.params != null && (typeof r.params !== "object" || Array.isArray(r.params))) errors.push(at + " 'params' must be an object");
      if (r.when === "everyNSeconds") {
        var n = r.params && r.params.seconds;
        if (typeof n !== "number" || n < 1 || n > 120) errors.push(at + " everyNSeconds needs params.seconds between 1 and 120");
      }
    });
    return errors;
  }

  BM.rules = {
    events: BM.RULE_EVENTS,
    actions: BM.RULE_ACTIONS,
    limit: RULE_LIMIT,
    // { ok, errors } — `allowed` is the engine's cobuild sheet `rules` block when
    // there is one, so an engine is only held to the moments it really fires.
    validate: function (rules, allowed) { var e = ruleErrors(rules, allowed); return { ok: e.length === 0, errors: e }; },

    // The runtime. `host` is whatever the engine can really do; anything it does
    // not provide falls back to something safe and visible, or to nothing.
    make: function (manifest, host) {
      host = host || {};
      var all = (manifest && Array.isArray(manifest.rules)) ? manifest.rules.slice(0, RULE_LIMIT) : [];
      var byEvent = {};
      all.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        if (BM.RULE_EVENTS.indexOf(r.when) === -1) return;      // unknown moment: never runs
        if (BM.RULE_ACTIONS.indexOf(r["do"]) === -1) return;    // unknown action: never runs
        (byEvent[r.when] = byEvent[r.when] || []).push(r);
      });
      var timers = (byEvent.everyNSeconds || []).map(function (r) {
        return { rule: r, every: Math.max(1, Math.min(120, (r.params && r.params.seconds) || 10)), left: Math.max(1, Math.min(120, (r.params && r.params.seconds) || 10)) };
      });

      // CB3: a line may carry a CLIP — the child's own voice, recorded in the
      // studio and stored through /api/cobuild-voice. When there is one it is
      // played AND the words still show, so a clip that will not load (a muted
      // tab, no network) degrades to exactly what it did before.
      var clips = {};
      function playClip(url) {
        if (!url || typeof Audio === "undefined") return;
        try {
          var a = clips[url] || (clips[url] = new Audio(url));
          a.currentTime = 0;
          var p = a.play();
          if (p && typeof p.catch === "function") p.catch(function () {});
        } catch (e) {}
      }
      function say(text, ctx, clip) {
        if (clip) playClip(clip);
        if (typeof host.sayLine === "function") return host.sayLine(text, ctx);
        if (host.fx) BM.pop(host.fx.pops, (ctx && ctx.x) || 0, (ctx && ctx.y) || 0, text, "#ffe680");
      }
      function run(r, ctx) {
        var p = r.params || {};
        switch (r["do"]) {
          case "playSound":
            if (typeof host.playSound === "function") host.playSound(String(p.sound || p.name || "select"), ctx);
            else if (g.BuildableAudio && g.BuildableAudio.sfx) g.BuildableAudio.sfx(String(p.sound || p.name || "select"));
            break;
          case "sayLine":  say(String(p.text || ""), ctx, p.clip); break;
          case "showText":
            if (typeof host.showText === "function") host.showText(String(p.text || ""), ctx);
            else say(String(p.text || ""), ctx, p.clip);
            break;
          case "spawn":     if (typeof host.spawn === "function") host.spawn(String(p.what || ""), ctx); break;
          case "speedUp":   if (typeof host.speedUp === "function") host.speedUp(+p.by || 1.1, ctx); break;
          case "slowDown":  if (typeof host.slowDown === "function") host.slowDown(+p.by || 0.9, ctx); break;
          case "addPoints": if (typeof host.addPoints === "function") host.addPoints(parseInt(p.points, 10) || 1, ctx); break;
          case "loseItem":  if (typeof host.loseItem === "function") host.loseItem(String(p.what || ""), ctx); break;
        }
      }
      var API = {
        count: all.length,
        has: function (ev) { return !!(byEvent[ev] && byEvent[ev].length); },
        // Fire one moment. Never throws: a broken rule must not break the game.
        fire: function (ev, ctx) {
          var list = byEvent[ev];
          if (!list || !list.length) return 0;
          var n = 0;
          // Count the rule as fired BEFORE running it: a rule whose action throws must
          // still be reported, and must never take the game down with it.
          for (var i = 0; i < list.length; i++) { n++; try { run(list[i], ctx || {}); } catch (e) {} }
          return n;
        },
        // Once a frame (seconds, like the rest of this file), for everyNSeconds.
        tick: function (dt, ctx) {
          if (!timers.length) return 0;
          var s = ruleSec(dt), n = 0;
          for (var i = 0; i < timers.length; i++) {
            timers[i].left -= s;
            if (timers[i].left <= 0) { timers[i].left = timers[i].every; n++; try { run(timers[i].rule, ctx || {}); } catch (e) {} }
          }
          return n;
        },
        reset: function () { for (var i = 0; i < timers.length; i++) timers[i].left = timers[i].every; }
      };
      return API;
    }
  };

  function _cull(arr) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i].life > 0) arr[w++] = arr[i];
    arr.length = w; return arr;
  }

  g.BuildableMechanics = BM;
  if (typeof module !== "undefined" && module.exports) module.exports = BM;
})(typeof window !== "undefined" ? window : globalThis);
