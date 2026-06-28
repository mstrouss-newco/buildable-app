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

  g.BuildableGameNav = BN;
  if (typeof module !== "undefined" && module.exports) module.exports = BN;
})(typeof window !== "undefined" ? window : globalThis);
