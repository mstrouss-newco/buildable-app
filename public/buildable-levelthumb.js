/* buildable-levelthumb.js — shared level-preview thumbnail generator (BLT)
 *
 * ONE place that draws a little canvas "photo" of a level, so every game's
 * level-select cards show a real preview instead of a flat colour.
 *
 * Usage:
 *   <script src="buildable-levelthumb.js"></script>
 *   const BLT = window.BuildableLevelThumb;
 *   img: BLT.make("maze", { cols, rows, bg:[c1,c2], wall, pellet, hero }, key)
 *
 * make(type, data, key) -> a PNG data URL (cached by key so it's only drawn once).
 * Pass a stable `key` (e.g. level index + a version) so cards don't redraw every frame.
 * Locked levels can use the SAME call — the start screen dims them automatically.
 */
(function (global) {
  "use strict";
  var CW = 300, CH = 140;              // draw big, the card scales it down (cover)
  var cache = {};

  // ---- tiny colour helpers ----
  function hx(n){ n = Math.max(0, Math.min(255, Math.round(n))); var s = n.toString(16); return s.length < 2 ? "0" + s : s; }
  function parse(c){ c = (c || "#000") + ""; if (c[0] === "#") c = c.slice(1);
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    return [parseInt(c.slice(0,2),16)||0, parseInt(c.slice(2,4),16)||0, parseInt(c.slice(4,6),16)||0]; }
  function shade(c, amt){ var p = parse(c); return "#" + hx(p[0]+amt) + hx(p[1]+amt) + hx(p[2]+amt); }
  function hexOf(n){ n = n >>> 0; return "#" + ("000000" + (n & 0xffffff).toString(16)).slice(-6); }  // 0xRRGGBB int -> #hex
  function asHex(c){ return (typeof c === "number") ? hexOf(c) : c; }

  // ---- tiny drawing helpers ----
  function rr(g, x, y, w, h, r){ r = Math.min(r, w/2, h/2); g.beginPath();
    g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
  function grad(g, c1, c2){ var lg = g.createLinearGradient(0,0,0,CH); lg.addColorStop(0, c1); lg.addColorStop(1, c2); g.fillStyle = lg; g.fillRect(0,0,CW,CH); }
  function disc(g, x, y, r, col){ g.fillStyle = col; g.beginPath(); g.arc(x,y,r,0,6.2832); g.fill(); }
  // seeded RNG so a level always draws the same
  function rng(seed){ var s = (seed|0) || 1; return function(){ s = (s*1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; }; }

  // simple shape glyphs used by a few games (star/heart/diamond/dot/flower)
  function glyph(g, kind, x, y, r, col){
    g.fillStyle = col;
    if (kind === "dot"){ disc(g, x, y, r, col); return; }
    if (kind === "diamond"){ g.beginPath(); g.moveTo(x,y-r); g.lineTo(x+r,y); g.lineTo(x,y+r); g.lineTo(x-r,y); g.closePath(); g.fill(); return; }
    if (kind === "heart"){ g.beginPath(); g.moveTo(x,y+r*0.9); g.bezierCurveTo(x+r*1.4,y-r*0.3, x+r*0.5,y-r*1.1, x,y-r*0.25);
      g.bezierCurveTo(x-r*0.5,y-r*1.1, x-r*1.4,y-r*0.3, x,y+r*0.9); g.closePath(); g.fill(); return; }
    if (kind === "flower"){ for (var i=0;i<6;i++){ var a=i/6*6.2832; disc(g, x+Math.cos(a)*r*0.7, y+Math.sin(a)*r*0.7, r*0.42, col); } disc(g, x, y, r*0.42, "#fff8e0"); return; }
    // star (default)
    g.beginPath(); for (var k=0;k<10;k++){ var rad = k%2 ? r*0.45 : r; var an = -Math.PI/2 + k*Math.PI/5;
      var px = x+Math.cos(an)*rad, py = y+Math.sin(an)*rad; if (k===0) g.moveTo(px,py); else g.lineTo(px,py); } g.closePath(); g.fill();
  }

  // ============================ PAINTERS ============================
  var P = {
    // flat gradient + big level number (fallback / generic)
    plain: function(g, d){ var c = d.color || "#3a3466"; grad(g, shade(c, 40), shade(c, -60));
      if (d.n){ g.fillStyle = "rgba(255,255,255,.16)"; g.font = "900 96px Nunito,sans-serif"; g.textAlign="center"; g.textBaseline="middle"; g.fillText(d.n, CW/2, CH/2+4); } },

    // MAZE — walls grid + pellets + a muncher dot
    maze: function(g, d){ var bg = d.bg || ["#241152","#0a1030"]; grad(g, bg[0], bg[1]);
      var cols = Math.max(5, d.cols||8), rows = Math.max(4, d.rows||6);
      var padX=18, padY=16, gw=CW-padX*2, gh=CH-padY*2, cw=gw/cols, ch=gh/rows;
      var rand = rng(cols*31 + rows*7); var wall = d.wall || "#7c5cff", pel = d.pellet || "#cfe6ff";
      g.strokeStyle = shade(wall, -20); g.lineWidth = 4; g.lineCap = "round";
      for (var r=0;r<rows;r++) for (var c=0;c<cols;c++){ var x=padX+c*cw, y=padY+r*ch;
        if ((r+c)%2===0 && rand()<0.55){ g.beginPath();
          if (rand()<0.5){ g.moveTo(x+cw*0.15, y+ch*0.5); g.lineTo(x+cw*0.85, y+ch*0.5); }
          else { g.moveTo(x+cw*0.5, y+ch*0.15); g.lineTo(x+cw*0.5, y+ch*0.85); } g.stroke(); }
        else if (rand()<0.6){ disc(g, x+cw*0.5, y+ch*0.5, Math.max(1.6, cw*0.09), pel); } }
      disc(g, padX+cw*0.5, padY+ch*0.5, ch*0.34, d.hero || "#ffe27a"); },

    // BUBBLES — the real cluster (hex rows of coloured buddies)
    bubbles: function(g, d){ grad(g, "#243a63", "#101a30");
      var rowsArr = d.rows || [], cmap = d.colorMap || {}, nCols = 9;
      rowsArr.forEach(function(row){ nCols = Math.max(nCols, row.length); });
      var pad=16, rad=Math.min((CW-pad*2)/(nCols+0.5)/2, (CH-pad*2)/Math.max(rowsArr.length,1)/2)*0.98;
      var startY = (CH - rowsArr.length*rad*1.85)/2 + rad;
      rowsArr.forEach(function(row, r){ var off = (r%2)*rad; var y = startY + r*rad*1.85;
        for (var c=0;c<row.length;c++){ var ch2=row[c]; if (ch2==="."||ch2===" ") continue;
          var col = cmap[ch2] || "#8fb0d0"; var x = pad + rad + off + c*rad*2;
          disc(g, x, y, rad*0.94, col); disc(g, x-rad*0.28, y-rad*0.3, rad*0.24, "rgba(255,255,255,.5)"); } }); },

    // MEMORY — a grid of face-down cards, a couple flipped to theme shapes
    cards: function(g, d){ var c = d.color || "#3a2f6e"; grad(g, shade(c, 34), shade(c, -34));
      var cols=Math.max(3,d.cols||4), rows=Math.max(2,d.rows||3), faces=d.faces||[];
      var padX=20, padY=14, gap=5, gw=CW-padX*2, gh=CH-padY*2;
      var cw=(gw-gap*(cols-1))/cols, ch=(gh-gap*(rows-1))/rows; var rand=rng(cols*13+rows*29); var fi=0;
      for (var r=0;r<rows;r++) for (var col=0;col<cols;col++){ var x=padX+col*(cw+gap), y=padY+r*(ch+gap);
        var up = rand()<0.34; g.fillStyle = up ? "#fbf6ff" : shade(c, 60); rr(g,x,y,cw,ch,5); g.fill();
        if (up){ var f = faces[fi % Math.max(1,faces.length)] || ["star","#FFD23F"]; fi++;
          glyph(g, f[0], x+cw/2, y+ch/2, Math.min(cw,ch)*0.32, f[1]); } } },

    // BINGO — a 5x5 card with a few daubed spots
    bingo: function(g, d){ var c = d.color || "#3a2f6e"; grad(g, shade(c, 30), shade(c, -46));
      var n=5, m=Math.min(CW,CH)*0.62, cell=m/n, ox=(CW-m)/2, oy=(CH-m)/2;
      g.fillStyle="#fbf6ff"; rr(g, ox-6, oy-6, m+12, m+12, 10); g.fill(); var rand=rng(777);
      for (var r=0;r<n;r++) for (var col=0;col<n;col++){ var x=ox+col*cell, y=oy+r*cell;
        g.strokeStyle="#d7cbe8"; g.lineWidth=1.5; g.strokeRect(x,y,cell,cell);
        if ((r===2&&col===2) || rand()<0.34){ disc(g, x+cell/2, y+cell/2, cell*0.34, r===2&&col===2 ? "#F5D976" : (d.accent||"#ff6b9d")); } } },

    // SNAKES — a mini board with a ladder and a snake
    snakes: function(g, d){ var c=d.color||"#1f6f3a"; grad(g, shade(c,26), shade(c,-40));
      var n=5, m=Math.min(CW,CH)*0.72, cell=m/n, ox=(CW-m)/2, oy=(CH-m)/2;
      for (var r=0;r<n;r++) for (var col=0;col<n;col++){ var x=ox+col*cell, y=oy+r*cell;
        g.fillStyle = ((r+col)%2) ? (d.cellA||"#2e8b4f") : (d.cellB||"#256e40"); g.fillRect(x,y,cell,cell); }
      g.strokeStyle="rgba(0,0,0,.18)"; g.lineWidth=1; g.strokeRect(ox,oy,m,m);
      // ladder
      g.strokeStyle="#ffd27a"; g.lineWidth=3; g.lineCap="round";
      var lx=ox+cell*1.1, ly1=oy+m-cell*0.4, ly2=oy+cell*0.6;
      g.beginPath(); g.moveTo(lx-6,ly1); g.lineTo(lx-6+8,ly2); g.moveTo(lx+6,ly1); g.lineTo(lx+6+8,ly2); g.stroke();
      // ladder rungs
      g.lineWidth=2; for (var s=0;s<=3;s++){ var t=s/3; var yy=ly1+(ly2-ly1)*t; var xx=lx-6+8*t;
        g.beginPath(); g.moveTo(xx,yy); g.lineTo(xx+12,yy); g.stroke(); } g.lineWidth=3;
      // snake
      g.strokeStyle="#ff8fb1"; g.lineWidth=5; g.beginPath();
      var sx=ox+m-cell*1.1, sy=oy+cell*0.7; g.moveTo(sx,sy);
      g.bezierCurveTo(sx-cell, sy+cell, sx+cell*0.6, sy+cell*2, sx-cell*0.4, oy+m-cell*0.7); g.stroke();
      disc(g, sx, sy, 4.5, "#ff8fb1"); },

    // RUNNER — 3-lane road, a car and a treat
    lanes: function(g, d){ var sky=asHex(d.sky||0xbfe9ff), grass=asHex(d.grass||0x8fd98f);
      grad(g, shade(sky,20), sky); g.fillStyle=grass; g.fillRect(0,CH*0.42,CW,CH*0.58);
      // road as a trapezoid (perspective)
      g.fillStyle="#5a5566"; g.beginPath(); g.moveTo(CW*0.42,CH*0.42); g.lineTo(CW*0.58,CH*0.42); g.lineTo(CW*0.86,CH); g.lineTo(CW*0.14,CH); g.closePath(); g.fill();
      g.strokeStyle="rgba(255,255,255,.85)"; g.lineWidth=3; g.setLineDash([8,9]);
      g.beginPath(); g.moveTo(CW*0.478,CH*0.42); g.lineTo(CW*0.38,CH); g.moveTo(CW*0.522,CH*0.42); g.lineTo(CW*0.62,CH); g.stroke(); g.setLineDash([]);
      var col = (d.treatColors&&d.treatColors[0]) || "#ffd23f";
      disc(g, CW*0.5, CH*0.56, 6, col);                 // a treat up ahead
      // the car (near, big) — kept clear of the card's cropped bottom
      g.fillStyle = d.car || "#ff5a7a"; rr(g, CW*0.5-15, CH*0.70, 30, 20, 6); g.fill();
      g.fillStyle="#bfe9ff"; rr(g, CW*0.5-10, CH*0.725, 20, 7, 3); g.fill(); },

    // TANK — two green hills with tanks
    hill: function(g, d){ grad(g, "#bfe9ff", "#7fc4ea");
      var lH=(d.leftH||150), rH=(d.rightH||160), spread=(d.spread||110);
      var lTop=CH-(lH/220*CH*0.7), rTop=CH-(rH/220*CH*0.7), midDip=CH-8;
      g.fillStyle="#5bbf57"; g.beginPath(); g.moveTo(0,CH); g.lineTo(0,lTop);
      g.quadraticCurveTo(CW*0.28, lTop-6, CW*0.5, midDip);
      g.quadraticCurveTo(CW*0.72, rTop-6, CW, rTop); g.lineTo(CW,CH); g.closePath(); g.fill();
      g.fillStyle="rgba(255,255,255,.14)"; g.beginPath(); g.moveTo(0,lTop); g.quadraticCurveTo(CW*0.28,lTop-6,CW*0.5,midDip);
      g.quadraticCurveTo(CW*0.72,rTop-6,CW,rTop); g.lineTo(CW,rTop+8); g.quadraticCurveTo(CW*0.72,rTop+2,CW*0.5,midDip+8);
      g.quadraticCurveTo(CW*0.28,lTop+2,0,lTop+8); g.closePath(); g.fill();
      function tank(x,y,col){ g.fillStyle=col; rr(g,x-13,y-8,26,12,4); g.fill(); disc(g,x,y-8,7,shade(col,20));
        g.strokeStyle=shade(col,-30); g.lineWidth=4; g.lineCap="round"; g.beginPath(); g.moveTo(x,y-9); g.lineTo(x+ (col==="#3f7d38"? -14:14), y-16); g.stroke(); }
      tank(CW*0.14, lTop+2, "#3f7d38"); tank(CW*0.88, rTop+2, "#7d5a2f"); },

    // FAMILY TOWN — a square board loop with coloured spots
    town: function(g, d){ var c=d.color||"#2DD4A7"; grad(g, "#101a30", "#0a1122");
      var m=Math.min(CW,CH)-24, ox=(CW-m)/2, oy=(CH-m)/2, spots=6, sz=m/spots;
      var cols=["#2DD4A7","#7C5CFC","#FF7A9A","#FFD166","#5BD6FF","#A78BFF"];
      function spot(i,x,y){ g.fillStyle=cols[i%cols.length]; rr(g,x,y,sz-4,sz-4,4); g.fill();
        g.fillStyle="rgba(255,255,255,.25)"; g.fillRect(x+2,y+2,sz-8,2); }
      var i=0, k;
      for (k=0;k<spots;k++) spot(i++, ox+k*sz, oy);
      for (k=1;k<spots;k++) spot(i++, ox+(spots-1)*sz, oy+k*sz);
      for (k=spots-2;k>=0;k--) spot(i++, ox+k*sz, oy+(spots-1)*sz);
      for (k=spots-2;k>=1;k--) spot(i++, ox, oy+k*sz);
      g.fillStyle=shade(c,30); g.font="900 26px Nunito,sans-serif"; g.textAlign="center"; g.textBaseline="middle";
      g.fillText((d.laps||2)+" laps", CW/2, CH/2); },

    // SLING SQUAD — the level's REAL tower: same blocks, same targets, same
    // slingshot, drawn from the 960x600 world into the card. The visible slice is
    // world x 110..940 / y 300..570, which puts the ground band and every tower
    // inside the card's safe strip (the card crops ~20px top and bottom).
    towers: function(g, d){
      var S = CW / 830;                                   // world -> card scale
      function tx(x){ return (x - 110) * S; }
      function ty(y){ return 20 + (y - 300) * S; }
      var GY = ty(548), AX = tx(168), AY = ty(360);       // ground line, sling fork
      var sky = d.sky || ["#8fd0ff", "#eaf8ff"];
      var g0 = d.g0 || "#73c364", g1 = d.g1 || "#4e9a45", top = d.top || "#86d172";
      grad(g, sky[0], sky[1]);
      // far hills for depth
      g.fillStyle = shade(g0, 46); g.beginPath(); g.moveTo(-10, GY);
      g.quadraticCurveTo(CW * 0.22, GY - 34, CW * 0.48, GY); g.closePath(); g.fill();
      g.fillStyle = shade(g0, 28); g.beginPath(); g.moveTo(CW * 0.40, GY);
      g.quadraticCurveTo(CW * 0.70, GY - 44, CW + 10, GY); g.closePath(); g.fill();
      // ground band
      g.fillStyle = g1; g.fillRect(0, GY, CW, CH - GY);
      g.fillStyle = top; g.fillRect(0, GY, CW, 6);
      g.fillStyle = shade(g1, -18);
      for (var t = 0; t < 7; t++) g.fillRect(t * 44 + 9, GY + 12, 13, 3);
      // SD3 TERRAIN — the ground is no longer one flat line, so the card cannot
      // draw one, or it would promise a flat yard for a level that opens on a
      // mountain. A hill or a plinth arrives as `poly`: the very points the
      // engine collides with (BuildableManifest.slingTerrainPoly), so the card
      // cannot drift out of step with the level. A pit is a hole cut back out
      // of the ground band. Painted like the engine paints them — earth body,
      // grass over the top — so the card reads as the same place.
      (d.terrain || []).forEach(function (t) {
        var half = t.w / 2, k;
        if (t.k === "pit") {
          var px0 = tx(t.x - half), px1 = tx(t.x + half), fl = ty(548 + t.d);
          g.fillStyle = "#2d1806"; g.fillRect(px0, GY - 2, px1 - px0, CH - GY + 2);
          g.fillStyle = "#6d4512"; g.fillRect(px0, fl, px1 - px0, CH - fl);
          g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(px0, GY - 2, 3, fl - GY + 4); g.fillRect(px1 - 3, GY - 2, 3, fl - GY + 4);
          g.fillStyle = top; g.fillRect(px0 - 4, GY - 4, 7, 6); g.fillRect(px1 - 3, GY - 4, 7, 6);
          return;
        }
        var poly = t.poly;
        if (!poly || !poly.length) return;
        var lo = poly[0].y, hi = poly[0].y;
        for (k = 1; k < poly.length; k++) { if (poly[k].y < lo) lo = poly[k].y; if (poly[k].y > hi) hi = poly[k].y; }
        var cLo = ty(lo), cHi = ty(hi);
        g.beginPath(); g.moveTo(tx(poly[0].x), ty(poly[0].y));
        for (k = 1; k < poly.length; k++) g.lineTo(tx(poly[k].x), ty(poly[k].y));
        g.closePath();
        g.fillStyle = "#8a5214"; g.fill();
        g.save(); g.clip();
        g.fillStyle = top; g.fillRect(0, cLo - 1, CW, Math.max(4, (cHi - cLo) * 0.24));
        g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(tx(t.x), cLo, CW, cHi - cLo);
        g.restore();
        g.strokeStyle = "rgba(58,34,8,.42)"; g.lineWidth = 1.4; g.stroke();
      });
      // slingshot (matches the engine's drawn fallback shape)
      g.strokeStyle = "#7a4a25"; g.lineCap = "round";
      g.lineWidth = 5; g.beginPath(); g.moveTo(AX, GY + 3); g.lineTo(AX, AY + 6); g.stroke();
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(AX, AY + 9); g.lineTo(AX - 7, AY - 4); g.stroke();
      g.beginPath(); g.moveTo(AX, AY + 9); g.lineTo(AX + 7, AY - 4); g.stroke();
      g.strokeStyle = "rgba(60,34,16,.75)"; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(AX - 7, AY - 4); g.lineTo(AX + 7, AY - 4); g.stroke();
      disc(g, AX, AY - 2, 4.2, "#e08a4a");                // a pal loaded and ready
      disc(g, AX - 1.4, AY - 3.2, 1.5, "#fff"); disc(g, AX + 1.4, AY - 3.2, 1.5, "#fff");
      // the goofy critters you have to pop. SD2: a SEALED critter goes down
      // FIRST, so its cage paints over the top of it and the card tells the
      // truth — that one is behind the stonework, not standing in front of it.
      var cols = ["#8fd66a", "#f0a35e", "#c98fe0", "#6fc9e6", "#f2779a"];
      function critter(p, i){
        var x = tx(p.x), y = ty(p.y), r = 7.2, c = cols[i % cols.length];
        g.fillStyle = "rgba(0,0,0,.16)"; g.beginPath(); g.ellipse(x, y + r * 0.95, r * 0.9, r * 0.3, 0, 0, 6.2832); g.fill();
        disc(g, x, y, r, c);
        disc(g, x - r * 0.34, y - r * 0.18, r * 0.28, "#fff");
        disc(g, x + r * 0.34, y - r * 0.18, r * 0.28, "#fff");
        disc(g, x - r * 0.30, y - r * 0.14, r * 0.13, "#2a2340");
        disc(g, x + r * 0.38, y - r * 0.14, r * 0.13, "#2a2340");
        g.strokeStyle = shade(c, -60); g.lineWidth = 1.3; g.lineCap = "round";
        g.beginPath(); g.arc(x, y + r * 0.16, r * 0.42, 0.35, Math.PI - 0.35); g.stroke();
      }
      (d.targets || []).forEach(function (p, i) { if (p.s) critter(p, i); });
      // the tower — every block the kid will actually knock over
      (d.blocks || []).forEach(function (b) {
        var w = b.w * S, h = b.h * S, x = tx(b.x) - w / 2, y = ty(b.y) - h / 2;
        // A block that names a material (SD1) is painted as that material, so the
        // card tells the truth about what the kid is about to smash. A block with
        // no material keeps the old guess: beams and long walls read as stone.
        var m = b.m || ((b.w >= 100 || b.h >= 90) ? "stone" : "wood");
        var FILL = { glass: "#bfe9f7", wood: "#caa46a", stone: "#b9bcc4" };
        var EDGE = { glass: "#7fbfd6", wood: "#7d5c2e", stone: "#71747d" };
        g.fillStyle = "rgba(0,0,0,.16)"; rr(g, x + 1.5, y + 2, w, h, 2.5); g.fill();
        g.globalAlpha = (m === "glass") ? 0.6 : 1;
        g.fillStyle = FILL[m] || FILL.wood; rr(g, x, y, w, h, 2.5); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = EDGE[m] || EDGE.wood; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = "rgba(255,255,255,.30)"; g.fillRect(x + 1.4, y + 1.4, Math.max(0, w - 2.8), 1.4);
        g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x + 1.4, y + h - 2.6, Math.max(0, w - 2.8), 1.4);
      });
      (d.targets || []).forEach(function (p, i) { if (!p.s) critter(p, i); });
    },

    // CROC TOT — the stage sky and ground, the flying snacks that stage sends
    // at you, and the little croc's jaw open at the bottom edge.
    // d = { sky:[c1,c2], ground, groundTop, snacks:[etype,...], n }
    snacks: function(g, d){
      // The card shows a 300x87 slice of this canvas (thumb is 60px tall, cover),
      // so everything that matters lives between y 24 and y 116.
      var sky = d.sky || ["#123a92", "#7bbdff"];
      var gndY = 96, gnd = d.ground || "#3b8420", gtop = d.groundTop || "#4a9e2f";
      grad(g, sky[0], sky[1]);
      // ground band + a strip of light along its lip
      g.fillStyle = gnd; g.fillRect(0, gndY, CW, CH - gndY);
      g.fillStyle = gtop; g.fillRect(0, gndY, CW, 5);
      g.fillStyle = "rgba(0,0,0,.13)";
      for (var t = 0; t < 8; t++) g.fillRect(t * 40 + 14, gndY + 9, 15, 3);

      // ---- one flying snack ----
      function eyes(x, y, r, look){
        var o = (look == null) ? 0.34 : look;
        disc(g, x + r * o, y - r * 0.22, r * 0.30, "#fff");
        disc(g, x + r * o + r * 0.08, y - r * 0.22, r * 0.16, "#111");
      }
      function snack(kind, x, y, r){
        g.fillStyle = "rgba(0,0,0,.14)";
        g.beginPath(); g.ellipse(x, y + r * 1.15, r * 0.85, r * 0.26, 0, 0, 6.2832); g.fill();
        var i;
        if (kind === "broccoli"){
          g.fillStyle = "#228B22"; rr(g, x - r * 0.20, y, r * 0.40, r * 1.0, r * 0.16); g.fill();
          disc(g, x, y - r * 0.42, r * 0.52, "#1a6a1a");
          disc(g, x - r * 0.52, y - r * 0.16, r * 0.38, "#2b9b2b");
          disc(g, x + r * 0.52, y - r * 0.16, r * 0.38, "#2b9b2b");
          eyes(x, y - r * 0.30, r * 0.9, -0.34); eyes(x, y - r * 0.30, r * 0.9, 0.20); return;
        }
        if (kind === "snake"){
          g.strokeStyle = "#6dbf3e"; g.lineWidth = r * 0.52; g.lineCap = "round";
          g.beginPath(); g.moveTo(x - r, y + r * 0.35);
          g.bezierCurveTo(x - r * 0.2, y - r * 0.7, x + r * 0.3, y + r * 0.8, x + r, y - r * 0.25); g.stroke();
          disc(g, x + r, y - r * 0.25, r * 0.40, "#8ad557"); eyes(x + r, y - r * 0.32, r * 0.8, 0.18); return;
        }
        if (kind === "gator"){
          g.fillStyle = "#3A9A3A"; rr(g, x - r * 0.95, y - r * 0.42, r * 1.7, r * 0.86, r * 0.26); g.fill();
          g.fillStyle = "#2D7A2D";
          g.beginPath(); g.moveTo(x + r * 0.7, y - r * 0.35); g.lineTo(x + r * 1.35, y);
          g.lineTo(x + r * 0.7, y + r * 0.35); g.closePath(); g.fill();
          g.fillStyle = "#fff";
          for (i = 0; i < 3; i++){ g.beginPath(); g.moveTo(x - r * 0.6 + i * r * 0.4, y + r * 0.16);
            g.lineTo(x - r * 0.45 + i * r * 0.4, y + r * 0.52); g.lineTo(x - r * 0.3 + i * r * 0.4, y + r * 0.16); g.fill(); }
          disc(g, x - r * 0.15, y - r * 0.62, r * 0.34, "#4DB84D"); eyes(x - r * 0.15, y - r * 0.62, r * 0.7, 0); return;
        }
        if (kind === "fork"){
          g.fillStyle = "#c9ccd4"; rr(g, x - r * 0.18, y - r * 0.2, r * 0.36, r * 1.2, r * 0.14); g.fill();
          for (i = 0; i < 4; i++){ g.fillStyle = "#e2e5ec"; rr(g, x - r * 0.62 + i * r * 0.34, y - r, r * 0.20, r * 0.8, r * 0.08); g.fill(); }
          eyes(x, y + r * 0.15, r * 0.8, 0); return;
        }
        if (kind === "eggplant"){
          g.fillStyle = "#5b2d8e"; g.beginPath(); g.ellipse(x, y + r * 0.12, r * 0.72, r * 0.95, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#7b3dbe"; g.beginPath(); g.ellipse(x - r * 0.18, y - r * 0.1, r * 0.44, r * 0.6, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#228B22"; rr(g, x - r * 0.2, y - r * 1.1, r * 0.4, r * 0.5, r * 0.12); g.fill();
          eyes(x, y, r * 0.9, -0.3); eyes(x, y, r * 0.9, 0.3); return;
        }
        if (kind === "pepper"){
          g.fillStyle = "#dd1111"; g.beginPath(); g.moveTo(x, y + r);
          g.bezierCurveTo(x + r * 0.95, y + r * 0.2, x + r * 0.85, y - r * 0.7, x, y - r * 0.75);
          g.bezierCurveTo(x - r * 0.85, y - r * 0.7, x - r * 0.95, y + r * 0.2, x, y + r); g.fill();
          g.fillStyle = "#228B22"; rr(g, x - r * 0.16, y - r * 1.15, r * 0.32, r * 0.45, r * 0.1); g.fill();
          eyes(x, y - r * 0.1, r * 0.85, -0.28); return;
        }
        if (kind === "puffer"){
          disc(g, x, y, r * 0.8, "#ffaa00");
          g.fillStyle = "#ff6600";
          for (i = 0; i < 8; i++){ var a = i / 8 * 6.2832;
            disc(g, x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, r * 0.17, "#ff6600"); }
          disc(g, x, y, r * 0.52, "#cc8800"); eyes(x, y, r * 0.85, -0.3); return;
        }
        if (kind === "seaweed"){
          g.strokeStyle = "#228B22"; g.lineWidth = r * 0.42; g.lineCap = "round";
          g.beginPath(); g.moveTo(x - r * 0.3, y + r);
          g.bezierCurveTo(x + r * 0.5, y + r * 0.2, x - r * 0.5, y - r * 0.4, x + r * 0.2, y - r); g.stroke();
          disc(g, x - r * 0.35, y + r * 0.15, r * 0.28, "#33aa33");
          disc(g, x + r * 0.42, y - r * 0.45, r * 0.26, "#33aa33");
          eyes(x + r * 0.2, y - r * 0.95, r * 0.7, 0); return;
        }
        if (kind === "clam"){
          g.fillStyle = "#cc8866"; g.beginPath(); g.ellipse(x, y - r * 0.12, r * 0.9, r * 0.55, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#aaddff"; g.beginPath(); g.ellipse(x, y + r * 0.42, r * 0.9, r * 0.5, 0, 0, 6.2832); g.fill();
          disc(g, x, y + r * 0.12, r * 0.30, "#ffddcc"); eyes(x, y + r * 0.08, r * 0.8, -0.3); return;
        }
        if (kind === "flytrap"){
          g.fillStyle = "#228B22"; rr(g, x - r * 0.16, y + r * 0.2, r * 0.32, r * 0.9, r * 0.1); g.fill();
          g.fillStyle = "#cc2200"; g.beginPath(); g.ellipse(x, y - r * 0.5, r * 0.85, r * 0.42, 0, 0, 6.2832); g.fill();
          g.beginPath(); g.ellipse(x, y + r * 0.16, r * 0.85, r * 0.38, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#fff";
          for (i = 0; i < 4; i++) disc(g, x - r * 0.5 + i * r * 0.33, y - r * 0.16, r * 0.11, "#fff");
          eyes(x, y - r * 0.6, r * 0.8, -0.3); return;
        }
        if (kind === "corn"){
          g.fillStyle = "#ffcc00"; g.beginPath(); g.ellipse(x, y, r * 0.62, r * 0.95, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#ffaa00";
          for (var ry = 0; ry < 5; ry++) for (var cx2 = 0; cx2 < 3; cx2++)
            disc(g, x - r * 0.3 + cx2 * r * 0.3, y - r * 0.62 + ry * r * 0.32, r * 0.11, "#ffaa00");
          g.fillStyle = "#228B22";
          g.beginPath(); g.moveTo(x, y - r * 0.85); g.quadraticCurveTo(x + r * 0.9, y - r * 1.4, x + r * 0.25, y - r * 0.6); g.fill();
          eyes(x, y - r * 0.35, r * 0.8, -0.28); return;
        }
        if (kind === "crab"){
          g.fillStyle = "#dd4400"; g.beginPath(); g.ellipse(x, y, r * 0.78, r * 0.58, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#ff5500";
          g.beginPath(); g.ellipse(x - r * 0.85, y - r * 0.1, r * 0.3, r * 0.22, -0.5, 0, 6.2832); g.fill();
          g.beginPath(); g.ellipse(x + r * 0.85, y - r * 0.1, r * 0.3, r * 0.22, 0.5, 0, 6.2832); g.fill();
          g.strokeStyle = "#cc3300"; g.lineWidth = r * 0.13;
          for (i = 0; i < 3; i++){ var ly = y - r * 0.2 + i * r * 0.3;
            g.beginPath(); g.moveTo(x - r * 0.5, ly); g.lineTo(x - r * 0.95, ly + r * 0.22); g.stroke();
            g.beginPath(); g.moveTo(x + r * 0.5, ly); g.lineTo(x + r * 0.95, ly + r * 0.22); g.stroke(); }
          eyes(x, y - r * 0.15, r * 0.8, -0.32); eyes(x, y - r * 0.15, r * 0.8, 0.32); return;
        }
        // tomato (default)
        disc(g, x, y, r * 0.78, "#cc1111"); disc(g, x - r * 0.2, y - r * 0.2, r * 0.5, "#ee3333");
        g.fillStyle = "#228B22";
        for (i = 0; i < 4; i++){ g.save(); g.translate(x, y - r * 0.7); g.rotate(i * 1.5708 + 0.7854);
          g.beginPath(); g.ellipse(0, -r * 0.18, r * 0.13, r * 0.3, 0, 0, 6.2832); g.fill(); g.restore(); }
        eyes(x, y, r * 0.85, -0.3); eyes(x, y, r * 0.85, 0.3);
      }

      // the snacks THIS stage throws at you, spread across the sky
      var KIND = { croc:"gator", broccroc:"broccoli", aspsnake:"snake", fork:"fork",
        eggplant:"eggplant", pepgator:"pepper", puffer:"puffer", seaweed:"seaweed",
        clam:"clam", flytrap:"flytrap", cornsnake:"corn", pepper:"pepper",
        crab:"crab", tomatoad:"tomato", tomato:"tomato" };
      var list = d.snacks || ["croc"];
      var spots = [[122, 48], [188, 42], [250, 54]];
      for (var s = 0; s < spots.length; s++){
        var kd = KIND[list[s % list.length]] || "tomato";
        snack(kd, spots[s][0], spots[s][1], 14);
      }

      // the croc's jaw, open at the bottom-left, ready to blast
      var jx = 46, jy = gndY - 9;            // jy = the line the mouth closes on
      g.fillStyle = "rgba(0,0,0,.18)";
      g.beginPath(); g.ellipse(jx, gndY + 3, 32, 5, 0, 0, 6.2832); g.fill();
      g.fillStyle = "#5a1414";                // the dark inside of the mouth
      rr(g, jx - 30, jy - 15, 62, 20, 4); g.fill();
      g.fillStyle = "#2D7A2D"; rr(g, jx - 32, jy + 1, 66, 11, 5); g.fill();         // lower jaw
      g.fillStyle = "#fff";
      for (var k = 0; k < 4; k++){ g.beginPath(); g.moveTo(jx - 28 + k * 16, jy + 2);
        g.lineTo(jx - 20 + k * 16, jy - 7); g.lineTo(jx - 12 + k * 16, jy + 2); g.fill(); }
      g.fillStyle = "#3A9A3A"; rr(g, jx - 34, jy - 32, 70, 18, 6); g.fill();        // upper jaw
      g.fillStyle = "#4DB84D"; rr(g, jx - 32, jy - 30, 66, 7, 3); g.fill();
      g.fillStyle = "#fff";
      for (var k2 = 0; k2 < 4; k2++){ g.beginPath(); g.moveTo(jx - 29 + k2 * 16, jy - 15);
        g.lineTo(jx - 21 + k2 * 16, jy - 6); g.lineTo(jx - 13 + k2 * 16, jy - 15); g.fill(); }
      disc(g, jx + 15, jy - 38, 9.5, "#4DB84D");                                     // eye bump
      disc(g, jx + 16.5, jy - 39.5, 4, "#fff"); disc(g, jx + 17.8, jy - 39.5, 2.2, "#111");
      disc(g, jx - 24, jy - 35, 3.6, "#2D7A2D"); disc(g, jx - 16, jy - 36, 3.6, "#2D7A2D");  // snout bumps
    },

    // MATH CANNON — the stage's own sky and ground, the cannon, and the sums
    // this stage practises shown as real maths signs.
    // d = { sky:[c1,c2], ground, accent, ops:["+","-"], stars:bool, n }
    cannon: function(g, d){
      // Same visible slice as the snacks painter: keep it all between y 24 and 116.
      var sky = d.sky || ["#bfe9ff", "#eafbf0"];
      var gndY = 96, gnd = d.ground || "#7ec46a", acc = d.accent || "#2f8f4e";
      grad(g, sky[0], sky[1]);
      if (d.stars){                                  // space stages get their star field
        var rand = rng(4242);
        for (var s = 0; s < 30; s++){
          disc(g, rand() * CW, 8 + rand() * (gndY - 20),
               rand() < 0.25 ? 1.8 : 1.05, "rgba(255,255,255,.85)");
        }
      }
      g.fillStyle = gnd; g.fillRect(0, gndY, CW, CH - gndY);
      g.fillStyle = acc; g.fillRect(0, gndY, CW, 5);

      // the maths sign(s) this stage practises, on the same white banner the game uses
      var ops = (d.ops && d.ops.length) ? d.ops.slice(0, 3) : ["+"];
      var GL = { "+": "+", "-": "−", "x": "×", "*": "×", "÷": "÷" };
      var txt = ops.map(function (o){ return GL[o] || o; }).join(" ");
      g.font = "800 40px 'Baloo 2',Nunito,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      var bw = Math.max(72, g.measureText(txt).width + 40), bh = 52, bx = CW * 0.60 - bw / 2, by = 26;
      g.fillStyle = "rgba(0,0,0,.14)"; rr(g, bx + 2, by + 3, bw, bh, 16); g.fill();
      g.fillStyle = "rgba(255,255,255,.94)"; rr(g, bx, by, bw, bh, 16); g.fill();
      g.strokeStyle = acc; g.lineWidth = 4; rr(g, bx, by, bw, bh, 16); g.stroke();
      g.fillStyle = "#2a2450"; g.fillText(txt, bx + bw / 2, by + bh / 2 + 2);

      // the cannon, aimed up at the sign
      var cx = 54, cy = gndY - 16;
      g.fillStyle = "rgba(0,0,0,.16)";
      g.beginPath(); g.ellipse(cx, gndY + 3, 30, 5, 0, 0, 6.2832); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(-0.72);
      g.fillStyle = "#3a3550"; rr(g, 0, -11, 52, 22, 10); g.fill();
      g.fillStyle = "#565073"; rr(g, 34, -11, 14, 22, 6); g.fill();
      g.restore();
      disc(g, cx, cy, 24, "#2a2540");
      disc(g, cx, cy, 16, acc);
      disc(g, cx, cy, 5.8, "#2a2540");
    },

    // MAHJONG — a stacked tile pyramid
    tiles: function(g, d){ grad(g, "#1c3b2e", "#0e2018");
      var layers = d.layers || [[6,4],[4,3]]; var tileFace = d.face || "#f3ead2", edge = d.edge || "#cdbf9a";
      var maxC=0, maxR=0; layers.forEach(function(l){ maxC=Math.max(maxC,l[0]); maxR=Math.max(maxR,l[1]); });
      var tw=Math.min((CW-40)/maxC, (CH-30)/maxR)*0.92, th=tw*1.28;
      for (var li=layers.length-1; li>=0; li--){ var L=layers[li], cols=L[0], rows=L[1];
        var gw=cols*tw, gh=rows*th, ox=(CW-gw)/2 + li*2, oy=(CH-gh)/2 - li*4;
        for (var r=0;r<rows;r++) for (var c=0;c<cols;c++){ var x=ox+c*tw, y=oy+r*th;
          g.fillStyle="rgba(0,0,0,.18)"; rr(g,x+2,y+3,tw-2,th-2,3); g.fill();
          g.fillStyle=edge; rr(g,x,y,tw-2,th-2,3); g.fill();
          g.fillStyle=tileFace; rr(g,x+1.2,y+1,tw-4.4,th-5,2.4); g.fill(); } } },

    // TYPING — the world you are about to type your way through: its sky and
    // lane, the row of letter tiles you spell (first one lit, like the game's
    // glowing key), and the world's boss waiting at the end of the lane.
    // d = { sky:[c1,c2], lane:[c1,c2], word:"COMET", foe:"ufo", tint, accent }
    letters: function(g, d){
      var sky = d.sky || ["#3b1d6e", "#150d2e"];
      var lane = d.lane || ["#241456", "#10233f"];
      var tint = d.tint || "#7C5CFC", acc = d.accent || "#FFD479";
      var laneY = 100;
      grad(g, sky[0], sky[1]);
      // the lane the baddie walks down, lit along its lip
      var lg = g.createLinearGradient(0, laneY, 0, CH);
      lg.addColorStop(0, lane[0]); lg.addColorStop(1, lane[1]);
      g.fillStyle = lg; g.fillRect(0, laneY, CW, CH - laneY);
      g.fillStyle = shade(tint, 40); g.globalAlpha = 0.55; g.fillRect(0, laneY, CW, 3); g.globalAlpha = 1;
      // a soft glow of the world tint behind everything
      var rg = g.createRadialGradient(CW * 0.72, laneY - 26, 6, CW * 0.72, laneY - 26, 110);
      rg.addColorStop(0, "rgba(255,255,255,.16)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.fillRect(0, 0, CW, CH);

      // ---- the world's boss, standing at the end of the lane ----
      function eyes(x, y, r, col){
        disc(g, x - r * 0.34, y, r * 0.26, "#fff"); disc(g, x + r * 0.34, y, r * 0.26, "#fff");
        disc(g, x - r * 0.30, y + r * 0.03, r * 0.13, col || "#141024");
        disc(g, x + r * 0.38, y + r * 0.03, r * 0.13, col || "#141024");
      }
      function crown(x, y, r, col){
        g.fillStyle = col || "#FFD479"; g.beginPath();
        g.moveTo(x - r, y); g.lineTo(x - r, y - r * 0.72); g.lineTo(x - r * 0.5, y - r * 0.28);
        g.lineTo(x, y - r * 0.86); g.lineTo(x + r * 0.5, y - r * 0.28); g.lineTo(x + r, y - r * 0.72);
        g.lineTo(x + r, y); g.closePath(); g.fill();
      }
      function foe(kind, x, y, r){
        g.fillStyle = "rgba(0,0,0,.22)";
        g.beginPath(); g.ellipse(x, laneY + 8, r * 0.95, r * 0.22, 0, 0, 6.2832); g.fill();
        if (kind === "ufo"){
          disc(g, x, y - r * 0.30, r * 0.56, "#cfe6ff");                       // dome
          g.fillStyle = "#8fb6ff"; g.beginPath();
          g.ellipse(x, y + r * 0.10, r * 1.05, r * 0.34, 0, 0, 6.2832); g.fill();   // saucer
          g.fillStyle = "#5f7fd6"; g.beginPath();
          g.ellipse(x, y + r * 0.24, r * 0.72, r * 0.18, 0, 0, 6.2832); g.fill();
          for (var i = -1; i <= 1; i++) disc(g, x + i * r * 0.52, y + r * 0.12, r * 0.10, "#ffe27a");
          eyes(x, y - r * 0.34, r * 0.62); return;
        }
        if (kind === "gorilla"){
          disc(g, x - r * 0.78, y - r * 0.18, r * 0.30, "#3a2c26");             // ears
          disc(g, x + r * 0.78, y - r * 0.18, r * 0.30, "#3a2c26");
          disc(g, x, y, r * 0.86, "#4a382f");                                   // head
          g.fillStyle = "#c9a887"; g.beginPath();
          g.ellipse(x, y + r * 0.34, r * 0.50, r * 0.34, 0, 0, 6.2832); g.fill();  // muzzle
          disc(g, x - r * 0.16, y + r * 0.34, r * 0.07, "#4a382f");
          disc(g, x + r * 0.16, y + r * 0.34, r * 0.07, "#4a382f");
          eyes(x, y - r * 0.18, r * 0.70); crown(x, y - r * 0.74, r * 0.42); return;
        }
        if (kind === "whale"){
          g.fillStyle = "#4aa8e8"; g.beginPath();
          g.ellipse(x - r * 0.10, y + r * 0.10, r * 0.92, r * 0.62, 0, 0, 6.2832); g.fill();
          g.fillStyle = "#4aa8e8"; g.beginPath();                                // tail
          g.moveTo(x + r * 0.66, y + r * 0.08); g.lineTo(x + r * 1.28, y - r * 0.44);
          g.lineTo(x + r * 1.26, y + r * 0.58); g.closePath(); g.fill();
          g.fillStyle = "#bfe6ff"; g.beginPath();                                // belly
          g.ellipse(x - r * 0.22, y + r * 0.38, r * 0.56, r * 0.24, 0, 0, 6.2832); g.fill();
          g.strokeStyle = "#cfefff"; g.lineWidth = r * 0.16; g.lineCap = "round"; // spout
          g.beginPath(); g.moveTo(x - r * 0.44, y - r * 0.50); g.lineTo(x - r * 0.56, y - r * 0.98); g.stroke();
          eyes(x - r * 0.46, y - r * 0.02, r * 0.54); return;
        }
        if (kind === "lolly"){
          g.strokeStyle = "#f6ecd8"; g.lineWidth = r * 0.20; g.lineCap = "round"; // stick
          g.beginPath(); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 1.5); g.stroke();
          disc(g, x, y, r * 0.86, "#ffd6ec");                                     // swirl
          g.strokeStyle = "#e85aa8"; g.lineWidth = r * 0.22; g.beginPath();
          for (var a = 0; a < 14; a++){ var t = a / 13 * 9.4, rr2 = r * 0.10 + t * r * 0.075;
            var px = x + Math.cos(t) * rr2, py = y + Math.sin(t) * rr2;
            if (a === 0) g.moveTo(px, py); else g.lineTo(px, py); }
          g.stroke();
          eyes(x, y + r * 0.06, r * 0.66); crown(x, y - r * 0.74, r * 0.42); return;
        }
        if (kind === "yeti"){
          disc(g, x, y + r * 0.24, r * 0.82, "#eaf6ff");                         // body
          disc(g, x - r * 0.62, y + r * 0.10, r * 0.34, "#dcefff");
          disc(g, x + r * 0.62, y + r * 0.10, r * 0.34, "#dcefff");
          disc(g, x, y - r * 0.30, r * 0.62, "#f7fcff");                          // head
          eyes(x, y - r * 0.34, r * 0.58);
          g.fillStyle = "#7fc7ee"; g.beginPath();                                 // frosty tuft
          g.moveTo(x - r * 0.30, y - r * 0.82); g.lineTo(x, y - r * 1.24); g.lineTo(x + r * 0.30, y - r * 0.82);
          g.closePath(); g.fill(); return;
        }
        // lava lord (default) — a molten blob with a jagged crown of flame
        g.fillStyle = "#f0703c"; g.beginPath();
        g.moveTo(x - r * 0.92, y + r * 0.62);
        g.bezierCurveTo(x - r * 1.06, y - r * 0.36, x - r * 0.44, y - r * 0.94, x, y - r * 0.86);
        g.bezierCurveTo(x + r * 0.48, y - r * 0.96, x + r * 1.06, y - r * 0.34, x + r * 0.92, y + r * 0.62);
        g.closePath(); g.fill();
        g.fillStyle = "#ffb35c";
        for (var f = -1; f <= 1; f++){ g.beginPath();
          g.moveTo(x + f * r * 0.52 - r * 0.20, y - r * 0.74);
          g.lineTo(x + f * r * 0.52, y - r * 1.30);
          g.lineTo(x + f * r * 0.52 + r * 0.20, y - r * 0.74); g.closePath(); g.fill(); }
        eyes(x, y - r * 0.10, r * 0.62, "#5a1410");
      }
      foe(d.foe || "lava", CW * 0.845, laneY - 24, 30);

      // ---- the word, on the same key tiles the game spells with ----
      var word = (d.word || "type").toUpperCase().slice(0, 5);
      var tw = 34, th = 42, gap = 6;
      var ox = 16, oy = 44;
      g.textAlign = "center"; g.textBaseline = "middle";
      for (var i = 0; i < word.length; i++){
        var x = ox + i * (tw + gap), lit = (i === 0);
        g.fillStyle = "rgba(0,0,0,.26)"; rr(g, x + 2, oy + 3, tw, th, 8); g.fill();
        g.fillStyle = lit ? acc : "rgba(255,255,255,.93)"; rr(g, x, oy, tw, th, 8); g.fill();
        g.fillStyle = lit ? shade(acc, -70) : "rgba(255,255,255,.55)";
        rr(g, x, oy + th - 6, tw, 6, 8); g.fill();                        // key lip
        g.fillStyle = lit ? "#2a2450" : "#3a3466";
        g.font = "900 24px Nunito,sans-serif";
        g.fillText(word[i], x + tw / 2, oy + th / 2 - 1);
      }
    },

    // TENNIS — the world you play in, with the top-down court drawn on it:
    // the dashed net, both paddles and the ball, its streak longer the faster
    // the tier. `photo` is the world scene the game itself already loaded.
    // d = { bg:[sky,ground], net, me, opp, ball, tier:0..2, photo:<Image> }
    court: function(g, d){
      var bg = d.bg || ["#d8eff5", "#73914e"];
      grad(g, bg[0], bg[1]);
      if (d.photo){                                   // the same scene the game draws, cover-fit
        var iw = d.photo.naturalWidth || d.photo.width, ih = d.photo.naturalHeight || d.photo.height;
        if (iw && ih){
          var s = Math.max(CW / iw, CH / ih), bw = iw * s, bh = ih * s;
          g.imageSmoothingEnabled = true;
          g.drawImage(d.photo, (CW - bw) / 2, (CH - bh) / 2, bw, bh);
          g.fillStyle = "rgba(8,10,24,0.34)"; g.fillRect(0, 0, CW, CH);   // the game's readability scrim
        }
      }
      // the court itself — portrait and centred, like the game. The card shows a
      // 300x92-ish slice of this canvas, so the whole court lives in y 24..116.
      var cw = 86, chh = 92, cx = (CW - cw) / 2, cy = (CH - chh) / 2;
      g.fillStyle = "rgba(10,14,30,0.26)"; rr(g, cx, cy, cw, chh, 11); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2.5; rr(g, cx, cy, cw, chh, 11); g.stroke();
      // net across the middle
      g.strokeStyle = d.net || "#fff6cf"; g.globalAlpha = 0.85; g.lineWidth = 3.5;
      g.setLineDash([8, 6]); g.beginPath();
      g.moveTo(cx + 7, cy + chh / 2); g.lineTo(cx + cw - 7, cy + chh / 2); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
      // paddles — yours at the bottom, the bot's at the top
      function paddle(px, py, col){
        var pw = cw * 0.34, ph = 6, x = px - pw / 2, y = py - ph / 2;
        var pg = g.createLinearGradient(0, y, 0, y + ph);
        pg.addColorStop(0, "#ffffff"); pg.addColorStop(1, col);
        g.fillStyle = pg; rr(g, x, y, pw, ph, ph / 2); g.fill();
      }
      paddle(cx + cw * 0.60, cy + chh * 0.94, d.me || "#7ee0a0");
      paddle(cx + cw * 0.38, cy + chh * 0.06, d.opp || "#ff9ec4");
      // the ball mid-rally, its streak longer the faster the tier — the one thing
      // that tells the three difficulty cards apart, since the court is the same.
      var tier = Math.max(0, Math.min(2, d.tier || 0));
      var bxp = cx + cw * 0.54, byp = cy + chh * 0.50, ball = d.ball || "#ffe27a";
      var trail = [2, 6, 11][tier];
      for (var t = trail; t >= 1; t--){
        g.globalAlpha = 0.62 * (1 - t / (trail + 1));
        disc(g, bxp + t * 1.7, byp + t * 2.9, 4.4 - t * 0.16, ball);
      }
      g.globalAlpha = 1;
      disc(g, bxp, byp, 4.8, ball);
      disc(g, bxp - 1.4, byp - 1.5, 1.9, "#ffffff");
    }
  };

  function draw(type, data){
    var cv = (typeof document !== "undefined") ? document.createElement("canvas") : null;
    if (!cv || !cv.getContext) return "";
    cv.width = CW; cv.height = CH; var g = cv.getContext("2d");
    (P[type] || P.plain)(g, data || {});
    return cv.toDataURL("image/png");
  }

  function make(type, data, key){
    var k = type + "|" + (key != null ? key : JSON.stringify(data || {}));
    if (cache[k]) return cache[k];
    var url;
    try { url = draw(type, data); }
    catch (e) {
      // A painter that composited a hosted photo can taint the canvas, and a
      // tainted canvas refuses toDataURL. Redraw on the painter's own colours
      // rather than handing the card back nothing.
      url = "";
      if (data && data.photo){
        var bare = {}; for (var kk in data) if (kk !== "photo") bare[kk] = data[kk];
        try { url = draw(type, bare); } catch (e2) { url = ""; }
      }
    }
    cache[k] = url; return url;
  }

  global.BuildableLevelThumb = { make: make, CW: CW, CH: CH, _painters: P };
})(typeof window !== "undefined" ? window : this);
