// ============================================================================
//  Buildable Viewport (BV) — fill-the-screen fit for FIXED-size canvas engines.
//  A wide game (e.g. 960x600) never fits a tall phone AND stays full-size. So,
//  like the classic mobile slingshot games, we FORCE LANDSCAPE:
//    - Device LANDSCAPE  -> scale the whole world to fill the screen (contain).
//    - Device PORTRAIT   -> rotate the game 90deg so it renders LANDSCAPE and
//                           fills the screen; the child just turns the phone.
//  Input is mapped back through the rotation, so dragging still lands where the
//  finger is. Physics/game logic stay in world coordinates — nothing about
//  gameplay, winnability, or headless QA changes; this only maps world -> screen.
//
//  Usage:
//    var VP = BuildableViewport.make(canvas, { worldW:960, worldH:600,
//                 forceLandscape:true, rotateEl:document.getElementById("stage") });
//    on load + resize + orientationchange:  VP.resize();
//    in draw(): setTransform(1,0,0,1,0,0); fill sky over VP.cw x VP.ch;
//               setTransform(VP.scale,0,0,VP.scale, VP.offx, VP.offy); ...draw world...
//    in input:  var w = VP.toWorld(clientX, clientY);   // -> world px, rotation-aware
//    VP.rotated is true while the game is force-rotated (device held upright).
//
//  Headless-safe: with no window it falls back to the raw world size (scale 1).
// ============================================================================
(function (g) {
  var BV = { version: "2.0.0" };

  BV.make = function (canvas, opts) {
    opts = opts || {};
    var W = opts.worldW || 960, H = opts.worldH || 600;
    var force = !!opts.forceLandscape;
    var host = opts.rotateEl || canvas;   // element that actually gets rotated (canvas or a wrapper)

    var VP = { scale: 1, offx: 0, offy: 0, cw: W, ch: H, portrait: false, rotated: false,
               W: W, H: H, _vw: W, _vh: H, _dpr: 1 };

    function px(n){ return Math.round(n) + "px"; }
    function contain(cw, ch){ var s = Math.min(cw / W, ch / H);
      VP.scale = s; VP.offx = (cw - W * s) / 2; VP.offy = (ch - H * s) / 2; }

    VP.resize = function () {
      if (!canvas) return VP;
      var vw = (typeof g !== "undefined" && g.innerWidth)  ? g.innerWidth  : W;
      var vh = (typeof g !== "undefined" && g.innerHeight) ? g.innerHeight : H;
      var dpr = (typeof g !== "undefined" && g.devicePixelRatio) ? g.devicePixelRatio : 1;
      VP._vw = vw; VP._vh = vh; VP._dpr = dpr;
      VP.portrait = vh > vw;
      VP.rotated = force && VP.portrait;
      var st = host && host.style;

      if (VP.rotated) {
        // landscape backing store: the phone's LONG side becomes the game's width
        var cw = Math.max(1, Math.round(vh * dpr)), ch = Math.max(1, Math.round(vw * dpr));
        canvas.width = cw; canvas.height = ch; VP.cw = cw; VP.ch = ch;
        if (st) {                       // size + rotate the stage to cover the upright screen
          st.position = "fixed"; st.top = "0px"; st.left = px(vw);
          st.width = px(vh); st.height = px(vw);
          st.transformOrigin = "left top"; st.transform = "rotate(90deg)";
        }
        if (host !== canvas && canvas.style) { canvas.style.width = "100%"; canvas.style.height = "100%"; }
        contain(cw, ch);
      } else {
        // device is landscape (or we're not forcing): fill normally, no rotation
        if (st) {
          st.transform = "none"; st.transformOrigin = "";
          st.position = "fixed"; st.top = "0px"; st.left = "0px"; st.width = "100%"; st.height = "100%";
        }
        var cw2 = Math.max(1, Math.round(vw * dpr)), ch2 = Math.max(1, Math.round(vh * dpr));
        canvas.width = cw2; canvas.height = ch2; VP.cw = cw2; VP.ch = ch2;
        if (host !== canvas && canvas.style) { canvas.style.width = "100%"; canvas.style.height = "100%"; }
        if (VP.portrait && !force) {     // portrait, not forced: fill width, anchor to bottom
          var sf = cw2 / W; VP.scale = sf; VP.offx = 0; VP.offy = ch2 - H * sf;
        } else {
          contain(cw2, ch2);
        }
      }
      return VP;
    };

    VP.toWorld = function (clientX, clientY) {
      if (VP.rotated) {
        // invert the rotate(90deg) placement (stage top-left at screen (vw,0))
        var lx = clientY, ly = VP._vw - clientX;   // CSS px on the (pre-rotation) stage
        var ix = lx * VP._dpr, iy = ly * VP._dpr;   // -> canvas backing px
        return { x: (ix - VP.offx) / VP.scale, y: (iy - VP.offy) / VP.scale };
      }
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
