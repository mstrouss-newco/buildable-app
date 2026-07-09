// ============================================================================
//  Buildable Feel Kit (Feel)  —  the ONE place every game gets "juice" from.
//  See GAME-FEEL.md for the six feel laws. This is a thin facade that wraps the
//  pieces games used to call one by one:
//    - sound    -> buildable-audio.js       (BuildableAudio / BA)
//    - effects  -> buildable-mechanics.js    (BuildableMechanics / BM)  + renders
//    - win card -> buildable-wincard.js      (BuildableWin / BW)
//    - haptics  -> navigator.vibrate
//  A game calls Feel.tap / coinBurst / explode / miss / celebrate / winCard
//  instead of reimplementing juice. Every call is a safe no-op if the piece it
//  needs isn't loaded (headless QA, a cold offline page) so nothing ever crashes.
//
//  Feel is PLATFORM LAW: the look/sound/size of feedback is identical across
//  games. The manifest exposes only three constrained presets (pace / celebration
//  / haptics); everything else lives here, the same for everyone.
//
//  Usage (engine):
//    Feel.configure({ accent:"#FF6B6B", feel:{pace:"normal",celebration:"big",haptics:"on"},
//                     sfxBase:"/api/sfx?s=", sfxMap:{ coin:"breaker_smash", ... } });
//    Feel.setFx(fx);                       // hand it the game's fx object once
//    Feel.tap();  Feel.coinBurst(x,y,15);  Feel.celebrate(W,H);
//    Feel.winCard(ctx, W, H, [{t:"You Win!",s:34}, {t:"Tap to finish",s:18,c:"#cfe"}]);
// ============================================================================
(function (g) {
  "use strict";
  var Feel = { version: "1.0.0" };

  // late-bound deps (they may load after this file)
  function BA(){ return g.BuildableAudio || null; }
  function BM(){ return g.BuildableMechanics || null; }
  function BW(){ return g.BuildableWin || null; }
  function BR(){ return g.BuildableRenders || null; }

  // ---- presets (platform-constrained; see manifest §5b) ----
  var P = { pace: "normal", celebration: "big", haptics: true, accent: "#FF6B6B" };
  var _fx = null;            // the game's fx object (particles/pops/shake/flash)
  // a game-agnostic confetti palette so the win burst never depends on game art
  var CONFETTI = ["#ff7aa8", "#ffd86b", "#7ee0a0", "#62d0ff", "#9b7bff", "#ffb04d"];

  function boolPreset(v, dflt){ if (v === "on" || v === true) return true; if (v === "off" || v === false) return false; return dflt; }

  Feel.setFeel = function (feel) {
    feel = feel || {};
    if (feel.pace) P.pace = feel.pace;
    if (feel.celebration) P.celebration = feel.celebration;
    if (feel.haptics != null) P.haptics = boolPreset(feel.haptics, P.haptics);
    return Feel;
  };
  Feel.setAccent = function (c) { if (c) P.accent = c; return Feel; };
  Feel.setFx = function (fx) { _fx = fx || _fx; return Feel; };
  Feel.getFeel = function () { return { pace: P.pace, celebration: P.celebration, haptics: P.haptics, accent: P.accent }; };

  // one call from the game when its manifest loads: wires sound + presets + accent
  Feel.configure = function (o) {
    o = o || {};
    var a = BA();
    if (a && a.configure && (o.sfxBase != null || o.sfxMap)) {
      a.configure({ sfxBase: o.sfxBase, map: o.sfxMap });
    }
    if (o.feel) Feel.setFeel(o.feel);
    if (o.accent) Feel.setAccent(o.accent);
    return Feel;
  };

  // ---- fx pipeline pass-throughs (one pipeline for every game) ----
  Feel.makeFx = function () { var m = BM(); return m ? m.makeFx() : { parts: [], pops: [], shake: 0, flash: 0, flashCol: "#fff" }; };
  Feel.update = function (fx, dt) { var m = BM(); if (m) m.update(fx || _fx, dt); };
  Feel.draw = function (ctx, fx, opts) { var m = BM(); if (m) m.draw(ctx, fx || _fx, opts); };
  Feel.shakeOffset = function (fx) { var m = BM(); return m ? m.shakeOffset(fx || _fx) : { x: 0, y: 0 }; };

  // ---- haptics ----
  var PATTERN = { light: 12, success: [16, 40, 24], warn: [26] };
  Feel.haptic = function (kind) {
    if (!P.haptics) return;
    try { if (g.navigator && g.navigator.vibrate) g.navigator.vibrate(PATTERN[kind] || PATTERN.light); } catch (e) {}
  };

  // ---- sound (shared palette by name; never a raw tone) ----
  Feel.sfx = function (name, opt) { var a = BA(); if (a) a.sfx(name, opt); };
  Feel.setMusic = function (url) { var a = BA(); if (a && a.setMusic) a.setMusic(url); };
  Feel.playMusic = function () { var a = BA(); if (a && a.playMusic) a.playMusic(); };
  Feel.stopMusic = function () { var a = BA(); if (a && a.stopMusic) a.stopMusic(); };
  Feel.toggleMute = function () { var a = BA(); return a && a.toggleMute ? a.toggleMute() : false; };
  Feel.isMuted = function () { var a = BA(); return !!(a && a.muted); };
  Feel.unlock = function () { var a = BA(); if (a && a.unlock) a.unlock(); };

  // ================= the six feel laws, as calls =================

  // LAW 1 — instant tap feedback: a sound + a light buzz on the same frame.
  Feel.tap = function () { Feel.sfx("select"); Feel.haptic("light"); };

  // LAW 5 — generous, kid-sized hitboxes: everyone forgives by the same slop.
  Feel.hitSlop = function () { return 10; };

  // small impact (a brick chip, a wall bounce): soft particle + a quiet tick.
  Feel.hit = function (x, y, color, opt) {
    var m = BM(); if (m && _fx) m.burst(_fx.parts, x, y, color || "#fff", (opt && opt.n) || 4);
    Feel.sfx((opt && opt.sound) || "select");
  };

  // LAW 3 — coins land with a burst: gold sparkle + rising coin chime + buzz.
  Feel.coinBurst = function (x, y, amount, opt) {
    var m = BM();
    if (m && _fx) {
      m.burst(_fx.parts, x, y, (opt && opt.color) || "#ffd86b", (opt && opt.n) || 8,
              { tex: "star", additive: true, spd: [40, 160], life: [0.3, 0.6], r: 5 });
      if (amount != null && m.pop) m.pop(_fx.pops, x, y, "+" + amount, "#ffffff");
    }
    Feel.sfx("coin", { tier: (opt && opt.tier) || 1 });
    Feel.haptic("light");
  };

  // big impact (a bomb, a powerup grab, a tough brick): scaled by the celebration
  // preset so "calm" games stay gentle and "big" games pop.
  Feel.explode = function (x, y, color, opt) {
    opt = opt || {}; var m = BM(); if (!m || !_fx) { if (opt.sound !== false) Feel.sfx(opt.sound || "boom"); return; }
    var big = P.celebration !== "calm";
    m.explode(_fx, x, y, color || "#ff6b6b", {
      n: opt.n || (big ? 18 : 10),
      pop: opt.pop, popCol: opt.popCol || "#fff",
      shake: opt.shake != null ? opt.shake : (big ? 0.28 : 0.14),
      flash: opt.flash != null ? opt.flash : (big ? 0.14 : 0),
      sfx: function () { if (opt.sound !== false) Feel.sfx(opt.sound || "boom"); }
    });
    if (opt.haptic !== false) Feel.haptic("light");
  };

  // LAW 4 — no punishing fail states: a gentle amber nudge, never a harsh red slam.
  Feel.miss = function (opt) {
    opt = opt || {}; var m = BM();
    if (m && _fx) { m.shake(_fx, opt.shake != null ? opt.shake : 0.26); m.flash(_fx, opt.color || "#ffb04d", opt.flash != null ? opt.flash : 0.16); }
    Feel.sfx(opt.sound || "hurt");
    Feel.haptic("warn");
  };

  // LAW 2 (fire) — the win moment: confetti + happy chime + success buzz.
  // Call ONCE when the game is won. Scaled by the celebration preset.
  Feel.celebrate = function (W, H, opt) {
    opt = opt || {}; var m = BM();
    var big = P.celebration !== "calm";
    if (m && _fx) {
      var rounds = big ? 3 : 2, per = big ? 22 : 12;
      for (var i = 0; i < rounds; i++) {
        m.burst(_fx.parts, W * (0.3 + 0.2 * i), H * 0.4, CONFETTI[(i * 2) % CONFETTI.length], per,
                { gravity: 18, spd: [2, 6], life: [0.7, 1.4] });
      }
      if (big) m.flash(_fx, "#ffffff", 0.2);
    }
    Feel.sfx(opt.sound || "win");
    Feel.haptic("success");
  };

  // LAW 2 (draw) — the ONE floating win/try-again card, drawn every frame while
  // the end screen shows. Never a full-screen grey overlay. Defensive so a
  // headless ctx stub can never crash the render.
  Feel.winCard = function (ctx, W, H, lines, opts) {
    var b = BW(); if (!b || !b.card) return;
    opts = opts || {};
    try { b.card(ctx, W, H, lines, { accent: opts.accent || P.accent, cx: opts.cx, cy: opts.cy, bg: opts.bg, font: opts.font }); } catch (e) {}
  };

  // ---- pace: a global tempo multiplier a game may apply to its own speeds ----
  Feel.paceScale = function () { return P.pace === "chill" ? 0.9 : P.pace === "zippy" ? 1.12 : 1.0; };

  g.BuildableFeel = Feel;
  if (typeof module !== "undefined" && module.exports) module.exports = Feel;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
