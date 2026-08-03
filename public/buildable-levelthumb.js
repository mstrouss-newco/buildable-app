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
      // the tower — every block the kid will actually knock over
      (d.blocks || []).forEach(function (b) {
        var w = b.w * S, h = b.h * S, x = tx(b.x) - w / 2, y = ty(b.y) - h / 2;
        var stone = (b.w >= 100 || b.h >= 90);            // beams and long walls read as stone
        g.fillStyle = "rgba(0,0,0,.16)"; rr(g, x + 1.5, y + 2, w, h, 2.5); g.fill();
        g.fillStyle = stone ? "#b9bcc4" : "#caa46a"; rr(g, x, y, w, h, 2.5); g.fill();
        g.strokeStyle = stone ? "#71747d" : "#7d5c2e"; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = "rgba(255,255,255,.30)"; g.fillRect(x + 1.4, y + 1.4, Math.max(0, w - 2.8), 1.4);
        g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x + 1.4, y + h - 2.6, Math.max(0, w - 2.8), 1.4);
      });
      // the goofy critters you have to pop
      var cols = ["#8fd66a", "#f0a35e", "#c98fe0", "#6fc9e6", "#f2779a"];
      (d.targets || []).forEach(function (p, i) {
        var x = tx(p.x), y = ty(p.y), r = 7.2, c = cols[i % cols.length];
        g.fillStyle = "rgba(0,0,0,.16)"; g.beginPath(); g.ellipse(x, y + r * 0.95, r * 0.9, r * 0.3, 0, 0, 6.2832); g.fill();
        disc(g, x, y, r, c);
        disc(g, x - r * 0.34, y - r * 0.18, r * 0.28, "#fff");
        disc(g, x + r * 0.34, y - r * 0.18, r * 0.28, "#fff");
        disc(g, x - r * 0.30, y - r * 0.14, r * 0.13, "#2a2340");
        disc(g, x + r * 0.38, y - r * 0.14, r * 0.13, "#2a2340");
        g.strokeStyle = shade(c, -60); g.lineWidth = 1.3; g.lineCap = "round";
        g.beginPath(); g.arc(x, y + r * 0.16, r * 0.42, 0.35, Math.PI - 0.35); g.stroke();
      });
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
          g.fillStyle=tileFace; rr(g,x+1.2,y+1,tw-4.4,th-5,2.4); g.fill(); } } }
  };

  function make(type, data, key){
    var k = type + "|" + (key != null ? key : JSON.stringify(data || {}));
    if (cache[k]) return cache[k];
    var url;
    try {
      var cv = (typeof document !== "undefined") ? document.createElement("canvas") : null;
      if (!cv || !cv.getContext) return "";
      cv.width = CW; cv.height = CH; var g = cv.getContext("2d");
      (P[type] || P.plain)(g, data || {});
      url = cv.toDataURL("image/png");
    } catch (e) { url = ""; }
    cache[k] = url; return url;
  }

  global.BuildableLevelThumb = { make: make, CW: CW, CH: CH, _painters: P };
})(typeof window !== "undefined" ? window : this);
