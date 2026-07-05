// ============================================================================
//  Buildable Win Card — ONE floating "You win / Game over" card for every game.
//  No full-screen dim: draws a compact rounded card centered on the play area,
//  so the win message reads as a deliberate popup (never a half-shaded screen).
//
//  Usage (canvas games):
//    BuildableWin.card(ctx, W, H, [
//      { t:"You Win!",          s:34, w:800, c:"#ffffff" },
//      { t:"Tap to play again", s:18, w:600, c:"#cfd3ff" },
//    ]);
//  Each line: { t:text, s:fontSize, w:fontWeight, c:color }.
//  opts (optional): { cx, cy } center override, { accent } border color,
//                   { bg } card fill, { font } font family.
// ============================================================================
(function (g) {
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  var BW = { version: "1.0.0" };

  BW.card = function (c, W, H, lines, opts) {
    if (!c || !lines || !lines.length) return;
    opts = opts || {};
    var fam = opts.font || "Fredoka, 'Baloo 2', Nunito, system-ui, sans-serif";
    var scale = Math.max(0.72, Math.min(1.25, Math.min(W, H) / 520));
    // measure
    c.save();
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    var gap = Math.round(10 * scale);
    var maxW = 0, totalH = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var fs = Math.round((ln.s || 20) * scale);
      ln._fs = fs;
      c.font = (ln.w || 700) + " " + fs + "px " + fam;
      var w = c.measureText(ln.t || "").width;
      if (w > maxW) maxW = w;
      totalH += fs + (i ? gap : 0);
    }
    var padX = Math.round(30 * scale), padY = Math.round(24 * scale);
    var cw = Math.min(W - 24, maxW + padX * 2);
    var ch = totalH + padY * 2;
    var cx = (opts.cx != null ? opts.cx : W / 2);
    var cy = (opts.cy != null ? opts.cy : H / 2);
    var x = cx - cw / 2, y = cy - ch / 2;
    // soft drop shadow
    c.shadowColor = "rgba(0,0,0,0.38)";
    c.shadowBlur = 26 * scale;
    c.shadowOffsetY = 10 * scale;
    rr(c, x, y, cw, ch, Math.round(22 * scale));
    c.fillStyle = opts.bg || "rgba(20,22,52,0.96)";
    c.fill();
    // reset shadow before stroke/text
    c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.lineWidth = 2;
    c.strokeStyle = opts.accent || "rgba(255,255,255,0.22)";
    rr(c, x, y, cw, ch, Math.round(22 * scale));
    c.stroke();
    // text lines, stacked
    var ty = y + padY;
    for (var j = 0; j < lines.length; j++) {
      var l = lines[j];
      ty += l._fs;
      c.font = (l.w || 700) + " " + l._fs + "px " + fam;
      c.fillStyle = l.c || "#ffffff";
      c.fillText(l.t || "", cx, ty - Math.round(l._fs * 0.16));
      ty += gap;
    }
    c.restore();
  };

  g.BuildableWin = BW;
  if (typeof module !== "undefined" && module.exports) module.exports = BW;
})(typeof window !== "undefined" ? window : globalThis);
