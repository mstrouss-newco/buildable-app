// ============================================================================
//  Buildable Game Nav — the shell-owned in-game chrome bridge.
//  Lets the React shell (GameFrame) render ONE consistent set of controls
//  (Home + Sound + Menu + Help) OUTSIDE the game, so no engine draws its own nav
//  buttons — nothing per-game to drift, clobber, or overlap.
//
//  IN-APP (game runs in the app's iframe): hides the engine's own nav buttons and
//  reports the engine's capabilities + sound state to the shell; the shell renders
//  the buttons and sends back nav:sound / nav:menu / nav:help, which call the
//  engine's handlers.
//  STANDALONE (engine opened directly): does nothing — the engine's own buttons
//  keep working, so the engine is still usable on its own.
//
//  Engine usage (after its own controls are wired, for standalone):
//    BuildableGameNav.register({
//      hide: ["muteBtn","helpBtn","backBtn"],   // the engine's own button ids to hide in-app
//      onSound: () => toggleMute(),             // shell Sound tapped
//      onMenu:  () => showMenu(),               // shell Menu tapped (back to level picker)
//      onHelp:  () => openHelp(),               // shell Help tapped
//      soundOn: () => !muted,                   // current sound state (for the icon)
//      inGame:  () => state === "play",         // show Menu only while actually playing
//    });
//    // call BuildableGameNav.update() whenever sound/inGame changes (start/return to menu).
// ============================================================================
(function (g) {
  const BN = { version: "2.0.0" };
  function iframed() { try { return g.parent && g.parent !== g; } catch (e) { return false; } }
  let cfg = null;

  function postState() {
    if (!cfg || !iframed()) return;
    try {
      g.parent.postMessage({
        type: "nav:state",
        sound: cfg.soundOn ? !!cfg.soundOn() : true,
        hasMenu: !!cfg.onMenu,
        hasHelp: !!cfg.onHelp,
        inGame: cfg.inGame ? !!cfg.inGame() : true,
      }, "*");
    } catch (e) {}
  }
  BN.update = postState;

  // --------------------------------------------------------------------------
  //  THE TOP BAND, published INTO the game (Session FL9, rebuilt in HD1).
  //  Hiding the engine's own buttons was never the whole job: the shell's buttons
  //  still float over the game, so a HUD that keeps drawing in those corners ends
  //  up UNDER a control it cannot see. Sky Flyer's coin count sat under the shell
  //  Sound button and its mini-map under the shell Help button on every phone.
  //
  //  So in-app we mark the page `.bk-inshell` and publish the band the shell draws
  //  as CSS variables, and a game's own stylesheet lays its HUD out around chrome
  //  it does not draw. Standalone none of this is set, so a game opened directly is
  //  untouched.
  //
  //    --bk-band-h      how tall the shell's top band is (52 / 60 / 68)
  //    --bk-nav-left    how far in from the LEFT the Home pill reaches
  //    --bk-nav-right   how far in from the RIGHT the button row reaches
  //    --bk-tier        phone | tablet | computer
  //    --bk-bottom-safe the phone home-indicator inset
  //    --bk-nav-bottom  kept working: the depth of the shell's chrome, which is now
  //                     simply the band height (the buttons are a row, not a column)
  //
  //  GEOMETRY IS MIRRORED FROM BK_BAND / NavBtn / GameFrame in src/BuildableKids.jsx
  //  and from buildable-hud.js. We compute it here from the window width so the very
  //  first frame is already right, and the shell then posts the numbers it ACTUALLY
  //  drew ({type:"bk:band"}) — it knows things this file cannot, such as a screen
  //  that added its own Menu item. The posted numbers always win.
  // --------------------------------------------------------------------------
  var BAND = {
    phone:    { band: 52, btn: 40, pad: 12, gap: 8,  home: 76 },
    tablet:   { band: 60, btn: 44, pad: 14, gap: 10, home: 84 },
    computer: { band: 68, btn: 48, pad: 16, gap: 12, home: 92 }
  };
  function tierFor(w) { return w < 600 ? "phone" : (w <= 1024 ? "tablet" : "computer"); }
  var applied = null;   // the band the shell posted, once it has

  function bandFor() {
    if (applied) return applied;
    var t = tierFor(g.innerWidth || 1440), T = BAND[t];
    // reserve the DEEPEST cluster this engine could ask for (capabilities, ignoring
    // inGame) so the band never shifts under a kid mid-play.
    var phone = t === "phone";
    var n = 1;                                            // Sound
    if (cfg && (cfg.onMenu || (phone && cfg.onHelp))) n++; // Menu
    if (cfg && !phone && cfg.onHelp) n++;                  // Help
    if (!cfg) n = 0;
    return {
      tier: t, band: T.band, btn: T.btn, pad: T.pad, gap: T.gap,
      navLeft: T.pad + T.home + T.gap,
      navRight: T.pad + (n ? n * T.btn + (n - 1) * T.gap + T.gap : 0)
    };
  }

  function publishStrip() {
    try {
      if (!iframed() || !g.document || !g.document.documentElement) return;
      var el = g.document.documentElement, b = bandFor();
      el.classList.add("bk-inshell");
      el.style.setProperty("--bk-tier", b.tier);
      el.style.setProperty("--bk-band-h", b.band + "px");
      el.style.setProperty("--bk-nav-left", b.navLeft + "px");
      el.style.setProperty("--bk-nav-right", b.navRight + "px");
      el.style.setProperty("--bk-nav-bottom", b.band + "px");
      el.style.setProperty("--bk-bottom-safe", "env(safe-area-inset-bottom, 0px)");
      el.setAttribute("data-bk-tier", b.tier);
    } catch (e) {}
  }
  BN.publishStrip = publishStrip;
  BN.band = bandFor;

  // the shell's own numbers, and a resize, both republish the band
  if (typeof window !== "undefined") {
    g.addEventListener("message", function (e) {
      var d = e && e.data;
      if (!d || d.type !== "bk:band") return;
      // fall back field by field: a shell that posts a partial band must never be
      // able to publish "undefinedpx" into a game and knock its HUD into a corner
      var own = bandFor();
      applied = null;
      var m = {
        tier: BAND[d.tier] ? d.tier : own.tier,
        band: +d.band || own.band, btn: +d.btn || own.btn,
        pad: +d.pad || own.pad, gap: +d.gap || own.gap,
        navLeft: +d.navLeft || own.navLeft, navRight: +d.navRight || own.navRight
      };
      applied = m;
      publishStrip();
      resizeHomeCatcher();
      try { g.dispatchEvent(new CustomEvent("bk:band", { detail: applied })); } catch (err) {}
    });
    g.addEventListener("resize", function () { if (!applied) publishStrip(); resizeHomeCatcher(); });
  }

  BN.register = function (c) {
    cfg = c || {};
    publishStrip();
    if (iframed() && g.document && cfg.hide) {
      cfg.hide.forEach(function (id) { const el = g.document.getElementById(id); if (el) el.style.display = "none"; });
    }
    g.addEventListener("message", function (e) {
      const d = e && e.data; if (!d || !d.type) return;
      if (d.type === "nav:sound" && cfg.onSound) { cfg.onSound(); postState(); }
      else if (d.type === "nav:menu" && cfg.onMenu) { cfg.onMenu(); postState(); }
      else if (d.type === "nav:help" && cfg.onHelp) { cfg.onHelp(); }
    });
    // announce now, and a few more times in case the shell mounts after the game loads
    postState();
    let n = 0; const iv = setInterval(function () { postState(); if (++n >= 6) clearInterval(iv); }, 350);
  };

  // --------------------------------------------------------------------------
  //  iOS Home-tap fix. In-app the shell draws the Home button (top-left) OUTSIDE
  //  this game, floating over our full-screen iframe. On iOS Safari a *touch* on
  //  an element that overlaps an iframe is routed INTO the iframe (it lands on our
  //  game canvas and moves the paddle) instead of the shell's button — so Home
  //  "does nothing" on iPhone while working fine with a desktop mouse. Fix: put an
  //  invisible catcher in the reserved top-left Home corner INSIDE the game (which
  //  reliably receives that stray touch) and forward nav:exit to the shell, which
  //  returns to the hub. The corner is already reserved for Home platform-wide, so
  //  this never steals a gameplay tap. Desktop clicks still land on the shell
  //  button directly; at worst both fire and onHome runs twice (harmless).
  function installHomeCatcher() {
    try {
      if (!iframed() || !g.document || !g.document.body) return;
      if (g.document.getElementById("bkNavHomeCatcher")) return;
      var z = g.document.createElement("div");
      z.id = "bkNavHomeCatcher";
      z.setAttribute("aria-hidden", "true");
      var b = bandFor();
      z.style.cssText = "position:fixed;top:0;left:0;width:" + b.navLeft + "px;height:" + b.band +
        "px;z-index:2147483000;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;";
      var last = 0;
      var fire = function (ev) {
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        var t = Date.now(); if (t - last < 500) return; last = t;   // one exit per tap
        try { g.parent.postMessage("nav:exit", "*"); } catch (e) {}
        try { g.parent.postMessage({ type: "nav:exit" }, "*"); } catch (e) {}
      };
      var shield = function (ev) { try { ev.stopPropagation(); } catch (e) {} };
      z.addEventListener("touchstart", shield, { passive: true });
      z.addEventListener("pointerdown", shield);
      z.addEventListener("touchend", fire, { passive: false });
      z.addEventListener("pointerup", fire);
      z.addEventListener("click", fire);
      g.document.body.appendChild(z);
    } catch (e) {}
  }
  function resizeHomeCatcher() {
    try {
      var z = g.document && g.document.getElementById("bkNavHomeCatcher");
      if (!z) return;
      var b = bandFor();
      z.style.width = b.navLeft + "px";
      z.style.height = b.band + "px";
    } catch (e) {}
  }
  BN.installHomeCatcher = installHomeCatcher;
  if (typeof document !== "undefined") {
    publishStrip();   // mark the page in-shell as early as the script runs
    if (document.body) installHomeCatcher();
    else document.addEventListener("DOMContentLoaded", installHomeCatcher);
  }

  g.BuildableGameNav = BN;
  if (typeof module !== "undefined" && module.exports) module.exports = BN;
})(typeof window !== "undefined" ? window : globalThis);
