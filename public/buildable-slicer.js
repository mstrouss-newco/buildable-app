// ============================================================================
//  buildable-slicer.js  —  ONE shared image slicer for the whole platform.
//
//  Both the Asset Studio (/asset-library.html) and the Editor (/editor.html)
//  slice dropped-in / generated art through THESE functions, so the slicing
//  rules — including the sliver-trim fix — live in a single place.
//
//  window.BuildableSlicer = { loadImage, keyOutWhite, occRows, occCols,
//     splitBands, contentBox, cropFrom, sliceSheet, recomposeGrid }
//
//  Sliver fix (Session 4B): after trimming a cell TIGHT to its content, a thin,
//  gap-separated, low-ink STRIP at any edge is a sliver of a touching neighbour,
//  so it is shaved off before the 1px safety inset. Interior gaps and real
//  chunks (e.g. shatter debris) are preserved.
// ============================================================================
(function (root) {
  "use strict";

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("image load failed")); };
      im.src = src;
    });
  }

  function keyOutWhite(ctx, W, H) {
    var img = ctx.getImageData(0, 0, W, H), d = img.data, N = W * H;
    var seen = new Uint8Array(N), st = [];
    var isWhite = function (p) { var o = p * 4; return d[o] > 236 && d[o + 1] > 236 && d[o + 2] > 236 && d[o + 3] > 8; };
    var seed = function (x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return; var p = y * W + x; if (seen[p]) return; seen[p] = 1; if (isWhite(p)) st.push(p); };
    for (var x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (var y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
    while (st.length) {
      var p = st.pop(); d[p * 4 + 3] = 0; var px = p % W, py = (p / W) | 0;
      var nb = [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
      for (var k = 0; k < 4; k++) {
        var nx = nb[k][0], ny = nb[k][1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var np = ny * W + nx; if (seen[np]) continue; seen[np] = 1; if (isWhite(np)) st.push(np);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function occRows(ctx, x0, y0, w, h) { var d = ctx.getImageData(x0, y0, w, h).data, a = new Array(h).fill(0); for (var j = 0; j < h; j++) { var n = 0; for (var i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 60) n++; a[j] = n; } return a; }
  function occCols(ctx, x0, y0, w, h) { var d = ctx.getImageData(x0, y0, w, h).data, a = new Array(w).fill(0); for (var i = 0; i < w; i++) { var n = 0; for (var j = 0; j < h; j++) if (d[(j * w + i) * 4 + 3] > 60) n++; a[i] = n; } return a; }

  function splitBands(occ, n, minOcc) {
    minOcc = minOcc || 3;
    var L = occ.length, s = 0; while (s < L && occ[s] < minOcc) s++; var e = L - 1; while (e >= 0 && occ[e] < minOcc) e--;
    if (e <= s) return [[0, L]];
    var gaps = [], g = null;
    for (var k = s; k <= e; k++) { if (occ[k] < minOcc) { if (!g) g = { a: k, b: k }; else g.b = k; } else { if (g) { gaps.push(g); g = null; } } }
    if (g) gaps.push(g);
    var cuts;
    if (gaps.length >= n - 1) { cuts = gaps.slice().sort(function (x, y) { return (y.b - y.a) - (x.b - x.a); }).slice(0, n - 1).map(function (x) { return Math.round((x.a + x.b) / 2); }).sort(function (x, y) { return x - y; }); }
    else { cuts = []; for (var i = 1; i < n; i++) cuts.push(Math.round(s + (e - s + 1) * i / n)); }
    var bounds = [s].concat(cuts, [e + 1]), bands = []; for (var b = 0; b < n; b++) bands.push([bounds[b], bounds[b + 1]]); return bands;
  }

  function contentBox(ctx, x, y, w, h, transparent) {
    var d = ctx.getImageData(x, y, w, h).data;
    var isFg = function (i, j) { var o = (j * w + i) * 4; return transparent ? d[o + 3] > 40 : !(d[o] > 242 && d[o + 1] > 242 && d[o + 2] > 242 && d[o + 3] > 18); };
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) { if (isFg(i, j)) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (j < minY) minY = j; if (j > maxY) maxY = j; } }
    if (maxX < 0) return null;
    var cols = [], rows = [], total = 0, a, b;
    for (a = minX; a <= maxX; a++) { var cn = 0; for (b = minY; b <= maxY; b++) if (isFg(a, b)) cn++; cols.push(cn); total += cn; }
    for (b = minY; b <= maxY; b++) { var rn = 0; for (a = minX; a <= maxX; a++) if (isFg(a, b)) rn++; rows.push(rn); }
    var MAXW = 6, FRAC = 0.5;
    // Trim a thin, gap-separated sliver run off each end of an occupancy profile, then
    // skip any now-empty edge cells so the box hugs the sprite. A run is a sliver when it
    // is thin (<=MAXW), separated from the rest by an empty gap, and carries far less ink
    // than the sprite's main run (so a real, connected sprite edge is never trimmed).
    // Returns [lo,hi] indices into occ, or null if nothing is left.
    function trimEdges(occ) {
      var n = occ.length, i, runs = [], st = -1, ink = 0;
      for (i = 0; i < n; i++) { if (occ[i] > 0) { if (st < 0) { st = i; ink = 0; } ink += occ[i]; } else if (st >= 0) { runs.push([st, i, ink]); st = -1; } }
      if (st >= 0) runs.push([st, n, ink]);
      if (!runs.length) return null;
      var totalInk = 0; for (i = 0; i < runs.length; i++) totalInk += runs[i][2];
      var lo = runs[0][0], hi = runs[runs.length - 1][1] - 1;
      var first = runs[0]; if (runs.length > 1 && (first[1] - first[0]) <= MAXW && first[2] < FRAC * totalInk) lo = runs[1][0];
      var last = runs[runs.length - 1]; if (runs.length > 1 && (last[1] - last[0]) <= MAXW && last[2] < FRAC * totalInk) hi = runs[runs.length - 2][1] - 1;
      return hi < lo ? null : [lo, hi];
    }
    var tc = trimEdges(cols), tr = trimEdges(rows);
    if (tc && tr) { maxX = minX + tc[1]; minX = minX + tc[0]; maxY = minY + tr[1]; minY = minY + tr[0]; }
    var bw = maxX - minX + 1, bh = maxY - minY + 1, ix = bw > 4 ? 1 : 0, iy = bh > 4 ? 1 : 0;
    return { x: x + minX + ix, y: y + minY + iy, w: bw - 2 * ix, h: bh - 2 * iy };
  }

  function cropFrom(srcCanvas, box) {
    var c = document.createElement("canvas"); c.width = box.w; c.height = box.h;
    c.getContext("2d").drawImage(srcCanvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return c.toDataURL("image/png");
  }

  function asNames(v) {
    if (Array.isArray(v)) return v.slice();
    if (typeof v === "string") return v.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (typeof v === "number") { var a = []; for (var i = 0; i < v; i++) a.push("r" + (i + 1)); return a; }
    return [];
  }

  function sliceSheet(img, spec) {
    spec = spec || {};
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    var sc = document.createElement("canvas"); sc.width = W; sc.height = H;
    var sx = sc.getContext("2d", { willReadFrequently: true }); sx.drawImage(img, 0, 0);
    var transparent = spec.transparent !== false && spec.role !== "background";
    if (transparent) keyOutWhite(sx, W, H);
    var out = [];
    if (spec.mode === "single") {
      var box = transparent ? (contentBox(sx, 0, 0, W, H, true) || { x: 0, y: 0, w: W, h: H }) : { x: 0, y: 0, w: W, h: H };
      out.push({ name: spec.prefix || "main", dataURL: cropFrom(sc, box), w: box.w, h: box.h });
      return out;
    }
    var rowNames = asNames(spec.rows), colNames = asNames(spec.cols);
    var rows = rowNames.length || 1, cols = colNames.length || 1;
    var rBands = splitBands(occRows(sx, 0, 0, W, H), rows, 3);
    for (var r = 0; r < rows; r++) {
      var ry0 = rBands[r][0], rh = Math.max(1, rBands[r][1] - ry0);
      var cBands = splitBands(occCols(sx, 0, ry0, W, rh), cols, 3);
      for (var c = 0; c < cols; c++) {
        var cx0 = cBands[c][0], cw = Math.max(1, cBands[c][1] - cx0);
        var b = contentBox(sx, cx0, ry0, cw, rh, transparent) || { x: cx0, y: ry0, w: cw, h: rh };
        var name = cols > 1 ? (rowNames[r] + "_" + colNames[c]) : rowNames[r];
        out.push({ name: name, dataURL: cropFrom(sc, b), w: b.w, h: b.h });
      }
    }
    return out;
  }

  function recomposeGrid(pieces, rows, cols, cellW, cellH) {
    cellW = cellW || 256; cellH = cellH || 256;
    var pad = 8;
    var cvs = document.createElement("canvas"); cvs.width = cellW * cols; cvs.height = cellH * rows;
    var g = cvs.getContext("2d");
    return Promise.all(pieces.map(function (p) { return loadImage(p.dataURL); })).then(function (imgs) {
      for (var i = 0; i < imgs.length; i++) {
        var r = (i / cols) | 0, c = i % cols; if (r >= rows) break;
        var im = imgs[i]; var maxw = cellW - pad * 2, maxh = cellH - pad * 2;
        var s = Math.min(maxw / im.width, maxh / im.height, 1);
        var pw = Math.max(1, Math.round(im.width * s)), ph = Math.max(1, Math.round(im.height * s));
        g.drawImage(im, c * cellW + ((cellW - pw) >> 1), r * cellH + ((cellH - ph) >> 1), pw, ph);
      }
      return cvs.toDataURL("image/png");
    });
  }

  root.BuildableSlicer = {
    loadImage: loadImage, keyOutWhite: keyOutWhite, occRows: occRows, occCols: occCols,
    splitBands: splitBands, contentBox: contentBox, cropFrom: cropFrom,
    sliceSheet: sliceSheet, recomposeGrid: recomposeGrid
  };
})(typeof window !== "undefined" ? window : this);
