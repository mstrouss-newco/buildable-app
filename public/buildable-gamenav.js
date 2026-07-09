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
  const BN = { version: "1.0.0" };
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

  BN.register = function (c) {
    cfg = c || {};
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
      z.style.cssText = "position:fixed;top:0;left:0;width:96px;height:54px;z-index:2147483000;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;";
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
  BN.installHomeCatcher = installHomeCatcher;
  if (typeof document !== "undefined") {
    if (document.body) installHomeCatcher();
    else document.addEventListener("DOMContentLoaded", installHomeCatcher);
  }

  g.BuildableGameNav = BN;
  if (typeof module !== "undefined" && module.exports) module.exports = BN;
})(typeof window !== "undefined" ? window : globalThis);
