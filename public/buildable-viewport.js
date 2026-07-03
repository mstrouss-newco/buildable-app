// ============================================================================
//  Buildable Viewport (BV) — fill-the-screen fit for FIXED-size canvas engines.
//  A wide game (e.g. 960x600) on a tall phone can't show everything AND fill the
//  screen, so we split by orientation, the way Angry Birds does:
//    LANDSCAPE  -> the natural fit: scale the whole world to fill the screen
//                  (contain), so the full playfield is visible edge-to-edge with
//                  the game's own sky/scene filling any leftover.
//    PORTRAIT   -> keep the whole playfield visible, anchored to the BOTTOM, and
//                  let the engine show a "turn your phone sideways" hint.
//
//  Usage (engine keeps its own draw + input, just asks BV for the transform):
//    var VP = BuildableViewport.make(canvas, { worldW:960, worldH:600 });
//    function resize(){ VP.resize(); }                       // on load + resize/orientationchange
//    // in draw(): setTransform(1,0,0,1,0,0); fill sky over VP.cw x VP.ch;
//    //            setTransform(VP.scale,0,0,VP.scale, VP.offx, VP.offy); ...draw world...
//    // in input:  var w = VP.toWorld(clientX, clientY);     // -> world (worldW x worldH) px
//    // VP.portrait is true when the device is held upright (show the rotate hint).
//
//  Headless-safe: with no window it falls back to the raw world size (scale 1).
//  Physics/game logic stay in world coordinates, so nothing about gameplay,
//  winnability, or headless QA changes — this only maps world -> screen.
// ============================================================================
(function (g) {
  var BV = { version: "1.0.0" };

  BV.make = function (canvas, opts) {
    opts = opts || {};
    var W = opts.worldW || 960, H = opts.worldH || 600;
    var CML = opts.portraitCropLeft || 0;    // world px of empty margin to crop off each
    var CMR = opts.portraitCropRight || 0;    // side in portrait (lets the game scale up a bit)

    var VP = { scale: 1, offx: 0, offy: 0, cw: W, ch: H, portrait: false, W: W, H: H };

    VP.resize = function () {
      if (!canvas) return VP;
      var vw = (typeof g !== "undefined" && g.innerWidth)  ? g.innerWidth  : W;
      var vh = (typeof g !== "undefined" && g.innerHeight) ? g.innerHeight : H;
      var dpr = (typeof g !== "undefined" && g.devicePixelRatio) ? g.devicePixelRatio : 1;
      var cw = Math.max(1, Math.round(vw * dpr)), ch = Math.max(1, Math.round(vh * dpr));
      canvas.width = cw; canvas.height = ch;
      VP.cw = cw; VP.ch = ch;
      VP.portrait = vh > vw;

      if (VP.portrait) {
        // fill the screen WIDTH (to the content region), anchor the world to the bottom
        var contentW = Math.max(1, W - CML - CMR);
        var s = cw / contentW;
        VP.scale = s; VP.offx = -CML * s; VP.offy = ch - H * s;   // bottom-anchored (extra room = sky)
      } else {
        // landscape: contain the whole world, centered — fills edge-to-edge
        var s2 = Math.min(cw / W, ch / H);
        VP.scale = s2; VP.offx = (cw - W * s2) / 2; VP.offy = (ch - H * s2) / 2;
      }
      return VP;
    };

    VP.toWorld = function (clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      var bx = (clientX - r.left) * (VP.cw / (r.width  || 1));
      var by = (clientY - r.top)  * (VP.ch / (r.height || 1));
      return { x: (bx - VP.offx) / VP.scale, y: (by - VP.offy) / VP.scale };
    };

    VP.resize();
    return VP;
  };

  g.BuildableViewport = BV;
  if (typeof module !== "undefined" && module.exports) module.exports = BV;
})(typeof window !== "undefined" ? window : globalThis);
