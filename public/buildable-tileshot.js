/* buildable-tileshot.js — the shared Tile Shots rig (Session TS0).
 *
 * Every game tile on the site currently shows an AI painting. TS replaces those
 * with a staged screenshot of the REAL game, taken by the game itself. This file
 * is the one-time rig each game plugs into, so TS1-TS3 add a photo mode per game
 * without re-inventing the flag, the wash or the "hold still" signal.
 *
 * A game opts in like this:
 *
 *   <script src="/buildable-tileshot.js"></script>
 *   ...
 *   if (BuildableTileShot.on) { stageMyRecipeScene(); }        // pose, then freeze
 *   // at the very end of the draw loop, every frame:
 *   BuildableTileShot.finish(ctx, W, H, "#7C4DFF");
 *
 * The recipe (Mike, 2026-09-06): hero just left of centre, 2-3 bad guys or
 * targets entering from the right, one thing frozen mid-flight, one coin or star
 * treat, NO words or buttons (HUD hidden), no empty corners, and a signature-
 * colour wash rising from the bottom. The game uses its OWN real art — never a
 * hand-drawn stand-in.
 *
 * Launch flags:
 *   ?tileshot=1            photo mode on
 *   ?tileshot=1&wash=0     same shot with no colour wash (for comparing looks)
 *   ?tileshot=1&shotlevel=2  pose on a different level (0-based)
 *
 * The camera (scripts/tile-shot.mjs) waits for window.TILESHOT_READY before it
 * presses the shutter, so a shot can never catch a half-loaded sprite.
 */
(function () {
  var q = {};
  try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }

  var on = q.get("tileshot") === "1";
  var washOn = q.get("wash") !== "0";
  var lvlRaw = q.get("shotlevel");
  var level = (lvlRaw != null && lvlRaw !== "" && !isNaN(+lvlRaw)) ? Math.max(0, Math.floor(+lvlRaw)) : 0;

  // The wash is the D2 look: the game's own signature colour rising out of the
  // bottom edge, strong enough to bind the tile to its colour dot, soft enough
  // that the art still reads. Kept here so all 20 tiles share one recipe.
  function wash(ctx, W, H, color) {
    if (!on || !washOn || !ctx || !color) return;
    var rgb = hexToRgb(color);
    if (!rgb) return;
    var g = ctx.createLinearGradient(0, H, 0, H * 0.30);
    g.addColorStop(0, "rgba(" + rgb + ",0.80)");
    g.addColorStop(0.35, "rgba(" + rgb + ",0.38)");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
  }

  // A tile shows the GAME, never the app around it. Everything on the page that
  // is not the canvas (or an ancestor of it) is hidden before the shutter: the
  // shared Home/Sound nav, the drag-to-move hint, the start overlay. That is the
  // "no words or buttons" half of the recipe, and it works for every game
  // without each one having to remember what chrome it mounts.
  var hidden = false;
  function hideChrome() {
    if (hidden || !on || typeof document === "undefined" || !document.body) return;
    var cv = document.querySelector("canvas");
    if (!cv) return;
    var all = document.body.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === cv || el.contains(cv)) continue;
      var tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK") continue;
      try { el.style.setProperty("display", "none", "important"); } catch (e) {}
    }
    try { document.body.style.setProperty("background", "#000", "important"); } catch (e) {}
    hidden = true;
  }

  // Held still for two painted frames before the shutter, so every sprite the
  // pose asked for has actually been drawn once.
  var settled = 0;
  function ready() {
    if (!on) return;
    hideChrome();
    if (++settled >= 2) { try { window.TILESHOT_READY = true; } catch (e) {} }
  }

  // The camera: a still tile wants the busy, pretty middle of the game, not the
  // whole playfield with the hero as a speck. Zooms about a focus point and
  // clamps so the frame never slides off the painted world.
  function camera(ctx, W, H, z, fx, fy) {
    if (!on || !ctx) return;
    var halfW = W / (2 * z), halfH = H / (2 * z);
    var cx = Math.max(halfW, Math.min(W - halfW, fx == null ? W / 2 : fx));
    var cy = Math.max(halfH, Math.min(H - halfH, fy == null ? H / 2 : fy));
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
  }

  // One call at the end of a game's draw loop: wash, then signal.
  function finish(ctx, W, H, color) {
    if (!on) return;
    wash(ctx, W, H, color);
    ready();
  }

  window.BuildableTileShot = { on: on, washOn: washOn, level: level, wash: wash,
    camera: camera, hideChrome: hideChrome, ready: ready, finish: finish };
})();
