// ============================================================================
//  Buildable Renders — a SHARED, reusable library of canvas "renders".
//  One place every game type draws from, so we never reinvent art code.
//
//  Companion to the "How We Make Games Look Good" playbook. That doc covers the
//  side-scroller parallax world from generated cut-outs; this library is the
//  reusable DRAW side for ALL game types (top-down included): each render is a
//  named function that takes (ctx, ...args) and follows the same rules:
//    - no emojis ever — generated art or drawn shapes only
//    - image-OR-shape fallback: pass an Image and it's used; otherwise a clean
//      drawn shape renders, so a game always shows something and degrades nicely
//    - themeable: pass a palette / theme so the same render reskins per game
//
//  Usage (browser):  <script src="buildable-renders.js"></script>  then  BR = window.BuildableRenders
//  Usage (node QA):  the file assigns to globalThis so tests can require/eval it.
// ============================================================================
(function (g) {
  const BR = {};

  // ---- primitives ----
  BR.rrect = function (ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  // 8-point twinkle star (filled with current fillStyle)
  BR.sparkle = function (ctx, x, y, r, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = i % 2 ? r * 0.4 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  // balanced heart (width ~2s, height ~1.7s) so it never looks squished
  BR.heart = function (ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.38);
    ctx.bezierCurveTo(x, y, x - s, y - s * 0.05, x - s, y + s * 0.42);
    ctx.bezierCurveTo(x - s, y + s * 0.92, x - s * 0.45, y + s * 1.25, x, y + s * 1.62);
    ctx.bezierCurveTo(x + s * 0.45, y + s * 1.25, x + s, y + s * 0.92, x + s, y + s * 0.42);
    ctx.bezierCurveTo(x + s, y - s * 0.05, x, y, x, y + s * 0.38);
    ctx.closePath(); ctx.fill();
  };
  // --- small color helpers (parse hex, lighten, rgba) ---
  BR._hex = function (h) { h = (h || "#888888").replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  BR._rgba = function (c, a) { if (typeof c === "string" && c[0] === "#") { const [r, g, b] = BR._hex(c); return "rgba(" + r + "," + g + "," + b + "," + a + ")"; } return c; };
  BR._lighten = function (c, t) { const [r, g, b] = BR._hex(c[0] === "#" ? c : "#888888"); const m = v => Math.round(v + (255 - v) * t); return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")"; };

  // ---- themes (reskin the shared renders per game) ----
  BR.THEMES = {
    space: {
      sky: [[0, "#0a1030"], [0.45, "#121a40"], [0.8, "#1a1546"], [1, "#241152"]],
      nebula: [
        { x: 0.22, y: 0.28, r: 300, col: "rgba(124,92,210,0.22)" },
        { x: 0.80, y: 0.72, r: 340, col: "rgba(64,150,220,0.16)" },
        { x: 0.60, y: 0.08, r: 220, col: "rgba(210,90,170,0.12)" },
      ],
      planet: { x: 0.70, y: 0.22, r: 72, c1: "#8a6bd6", c2: "#33256a", ring: true },
      vignette: true,
    },
  };

  // ---- background: gradient sky + nebula + planet + twinkling/glowing stars + shooting star + vignette ----
  // stars: [{x,y,s,ph,sp}]   themeName: key into BR.THEMES (defaults to space)
  BR.background = function (ctx, W, H, stars, t, themeName) {
    const th = BR.THEMES[themeName] || BR.THEMES.space;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    for (const [stop, col] of th.sky) sky.addColorStop(stop, col);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // soft nebula clouds (radial, fade to transparent)
    for (const n of th.nebula) { const g = ctx.createRadialGradient(W * n.x, H * n.y, 0, W * n.x, H * n.y, n.r); g.addColorStop(0, n.col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    // planet with a ring, lit from upper-left
    if (th.planet) {
      const p = th.planet, px = W * p.x, py = H * p.y, r = p.r;
      if (p.ring) { ctx.save(); ctx.translate(px, py); ctx.rotate(-0.5); ctx.strokeStyle = "rgba(200,180,255,0.22)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75, r * 0.5, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.clip();
      const pg = ctx.createRadialGradient(px - r * 0.4, py - r * 0.5, r * 0.2, px, py, r * 1.2); pg.addColorStop(0, p.c1); pg.addColorStop(1, p.c2); ctx.fillStyle = pg; ctx.fillRect(px - r, py - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(8,6,24,0.40)"; ctx.beginPath(); ctx.arc(px + r * 0.55, py + r * 0.5, r * 1.05, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(200,180,255,0.22)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
    }
    // stars (big ones get a soft glow)
    if (stars) for (const st of stars) {
      const a = 0.4 + 0.5 * Math.abs(Math.sin(t * st.sp + st.ph));
      if (st.s > 1.9) { ctx.fillStyle = "rgba(180,210,255," + (a * 0.22).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(st.x, st.y, st.s * 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(255,255,255," + a.toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(st.x, st.y, st.s, 0, 7); ctx.fill();
    }
    // occasional shooting star (~every 7s)
    const cyc = 7, ph = (t % cyc) / cyc, seed = Math.floor(t / cyc);
    if (ph < 0.12) { const k = ph / 0.12, sx = (seed * 131) % W, sy = 30 + (seed * 71) % 140, x2 = sx + k * 320, y2 = sy + k * 120; ctx.strokeStyle = "rgba(255,255,255," + (0.7 * (1 - k)).toFixed(2) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 46, y2 - 17); ctx.stroke(); }
    // vignette (darken edges for depth)
    if (th.vignette) { const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
  };

  // ---- enemy / boss: a friendly wobbly blob with eyes (boss gets a crown) ----
  BR.enemy = function (ctx, x, y, r, col, wob, boss) {
    // soft ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(x, y + r * 0.92, r * 0.68, r * 0.24, 0, 0, 7); ctx.fill();
    // outer glow
    const hg = ctx.createRadialGradient(x, y, r * 0.55, x, y, r * 1.7); hg.addColorStop(0, BR._rgba(col, 0.35)); hg.addColorStop(1, BR._rgba(col, 0)); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, 7); ctx.fill();
    // wobbly body with a top-lit gradient
    ctx.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * 6.28; const rr = r * (1 + Math.sin(a * 3 + wob) * 0.08); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath();
    const bg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.1); bg.addColorStop(0, BR._lighten(col, 0.4)); bg.addColorStop(1, col); ctx.fillStyle = bg; ctx.fill();
    // glossy highlight
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.3, r * 0.16, -0.6, 0, 7); ctx.fill();
    // eyes + smile
    ctx.fillStyle = "rgba(255,255,255,.92)"; const ex = r * 0.34;
    ctx.beginPath(); ctx.arc(x - ex, y - r * 0.12, r * 0.22, 0, 7); ctx.arc(x + ex, y - r * 0.12, r * 0.22, 0, 7); ctx.fill();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x - ex + 1, y - r * 0.08, r * 0.1, 0, 7); ctx.arc(x + ex + 1, y - r * 0.08, r * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - ex + 2.4, y - r * 0.16, r * 0.045, 0, 7); ctx.arc(x + ex + 2.4, y - r * 0.16, r * 0.045, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(40,30,60,.5)"; ctx.lineWidth = Math.max(1.5, r * 0.06); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x, y + r * 0.28, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    if (boss) { ctx.fillStyle = "#ffd23f"; for (let i = -1; i <= 1; i++) { const bx = x + i * r * 0.4; ctx.beginPath(); ctx.moveTo(bx, y - r * 0.95); ctx.lineTo(bx + r * 0.12, y - r * 1.25); ctx.lineTo(bx + r * 0.24, y - r * 0.95); ctx.closePath(); ctx.fill(); } ctx.strokeStyle = "rgba(255,210,60,0.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, 7); ctx.stroke(); }
  };

  // ---- hero: astronaut. o = { img, palette, aim, blink, shield } ----
  // draw a transparent character cut-out keeping aspect, centered on (cx,cy)
  BR.sprite = function (ctx, img, cx, cy, h, o) {
    o = o || {}; const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return false; const w = h * (iw / ih);
    if (o.shadow) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.44, w * 0.34, h * 0.1, 0, 0, 7); ctx.fill(); }
    if (o.glow) { const gg = ctx.createRadialGradient(cx, cy, 2, cx, cy, h * 0.62); gg.addColorStop(0, o.glow); gg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, h * 0.62, 0, 7); ctx.fill(); }
    ctx.save(); if (o.blink) ctx.globalAlpha = 0.5;
    if (o.flip) { ctx.translate(cx, cy); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h / 2, w, h); }
    else ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = 1; ctx.restore(); return true;
  };
  // coin tiers: 1 (common), 2 (=5, rare), 3 (=10, boss). glowing + spinning + numbered.
  BR.COIN = { 1: { c: "#6ff0ff", r: 7 }, 2: { c: "#ffd23f", r: 9 }, 3: { c: "#c69bff", r: 11 } };
  BR.coin = function (ctx, x, y, t, tier, val) {
    const C = BR.COIN[tier] || BR.COIN[1];
    const pulse = 0.6 + 0.4 * Math.sin(t * 4 + x);
    const g = ctx.createRadialGradient(x, y, 1, x, y, C.r * 2.5); g.addColorStop(0, BR._rgba(C.c, 0.5 * pulse)); g.addColorStop(1, BR._rgba(C.c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, C.r * 2.5, 0, 7); ctx.fill();
    const sx = Math.abs(Math.cos(t * 3 + x)) * 0.55 + 0.45;   // coin "spin"
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    const cg = ctx.createRadialGradient(-C.r * 0.3, -C.r * 0.3, 1, 0, 0, C.r); cg.addColorStop(0, BR._lighten(C.c, 0.55)); cg.addColorStop(1, C.c); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, C.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, C.r, 0, 7); ctx.stroke();
    ctx.restore();
    if (tier >= 2 && sx > 0.66) { ctx.fillStyle = "#23204a"; ctx.font = "bold " + (C.r * 1.15 | 0) + "px Fredoka,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(val), x, y + 0.5); ctx.textBaseline = "alphabetic"; }
  };
  // draw a background image scaled to COVER the canvas (center-crop)
  BR.bgImage = function (ctx, img, W, H) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return false; const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); return true; };

  BR.hero = function (ctx, x, y, o) {
    o = o || {}; const P = o.palette || {};
    // soft hover glow under + halo
    ctx.fillStyle = "rgba(120,200,255,0.16)"; ctx.beginPath(); ctx.ellipse(x, y + 18, 12, 4, 0, 0, 7); ctx.fill();
    const hg = ctx.createRadialGradient(x, y, 4, x, y, 30); hg.addColorStop(0, "rgba(150,210,255,0.22)"); hg.addColorStop(1, "rgba(150,210,255,0)"); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.fill();
    if (o.img && (o.img.naturalWidth || o.img.width)) { BR.sprite(ctx, o.img, x, y - 2, 50, { shadow: true, blink: o.blink }); }
    else {
    if (o.blink) ctx.globalAlpha = 0.45;
      ctx.fillStyle = P.hero || "#eaf2ff"; BR.rrect(ctx, x - 13, y - 6, 26, 26, 11); ctx.fill();             // suit
      ctx.fillStyle = "#cdddf2"; BR.rrect(ctx, x - 13, y + 10, 26, 10, 7); ctx.fill();                       // boots
      ctx.fillStyle = P.hero || "#eaf2ff"; ctx.beginPath(); ctx.arc(x, y - 10, 14, 0, 7); ctx.fill();        // helmet
      const vg = ctx.createRadialGradient(x - 2, y - 13, 2, x + 2, y - 10, 11); vg.addColorStop(0, "#cdf3ff"); vg.addColorStop(1, P.visor || "#62d0ff"); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(x + 2, y - 10, 9, 0, 7); ctx.fill();  // visor
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(x - 1, y - 13, 2.6, 0, 7); ctx.fill();  // shine
    }
    if (typeof o.aim === "number") { ctx.fillStyle = P.spark || "#ffe27a"; BR.sparkle(ctx, x + Math.cos(o.aim) * 20, y + Math.sin(o.aim) * 20, 5, Date.now() / 120); }
    ctx.globalAlpha = 1;
    if (o.shield) { ctx.strokeStyle = "rgba(120,210,255,.9)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y + 2, 26, 0, 7); ctx.stroke(); const sg = ctx.createRadialGradient(x, y + 2, 14, x, y + 2, 26); sg.addColorStop(0, "rgba(120,210,255,0)"); sg.addColorStop(1, "rgba(120,210,255,0.22)"); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y + 2, 26, 0, 7); ctx.fill(); }
  };

  // ---- pickups / fx ----
  BR.gem = function (ctx, x, y, t, col) {
    col = col || "#6ff0ff";
    const g = ctx.createRadialGradient(x, y, 1, x, y, 12); g.addColorStop(0, BR._rgba(col, 0.5)); g.addColorStop(1, BR._rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + x);
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - 2, y - 2, 1.6, 0, 7); ctx.fill();
  };
  BR.projectile = function (ctx, x, y, r, col) {
    col = col || "#ffe27a";
    const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2); g.addColorStop(0, BR._rgba(col, 0.6)); g.addColorStop(1, BR._rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = col; BR.sparkle(ctx, x, y, r, Date.now() / 80 + x);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(x, y, r * 0.32, 0, 7); ctx.fill();
  };
  BR.particle = function (ctx, pt) {
    ctx.globalAlpha = Math.min(1, pt.life / 20); ctx.fillStyle = pt.col;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  };
  BR.orbiter = function (ctx, x, y, col) {
    ctx.fillStyle = "rgba(255,226,122,.35)"; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
    ctx.fillStyle = col || "#ffe27a"; BR.sparkle(ctx, x, y, 8, Date.now() / 100);
  };

  // ---- power-up icons (reused on cards + HUD). id-driven so games share them. ----
  BR.puIcon = function (ctx, id, x, y, P) {
    P = P || {}; const spark = (sx, sy, r, rot) => BR.sparkle(ctx, sx, sy, r, rot || 0);
    ctx.save(); ctx.translate(x, y);
    if (id === "fast") { ctx.fillStyle = P.spark; spark(0, 0, 20); spark(16, 4, 12, 0.5); }
    else if (id === "multi") { ctx.fillStyle = P.spark; spark(-12, 0, 13); spark(12, 0, 13); spark(0, -12, 13); }
    else if (id === "big") { ctx.fillStyle = P.spark; spark(0, 0, 26, 0.3); }
    else if (id === "pierce") { ctx.fillStyle = "rgba(255,226,122,.5)"; ctx.fillRect(-22, -3, 44, 6); ctx.fillStyle = P.spark; spark(-12, 0, 9); spark(4, 0, 9); spark(20, 0, 9); }
    else if (id === "orbit") { ctx.strokeStyle = "rgba(255,226,122,.5)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.stroke(); ctx.fillStyle = P.spark; spark(0, -20, 9); spark(0, 0, 12, 0.3); }
    else if (id === "nova") { ctx.strokeStyle = "rgba(255,226,122,.45)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.stroke(); ctx.fillStyle = P.spark; spark(0, 0, 12, 0.3); }
    else if (id === "frost") { ctx.strokeStyle = "#bfeaff"; ctx.lineWidth = 3; ctx.lineCap = "round"; for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.moveTo(0, -12); ctx.lineTo(-5, -16); ctx.moveTo(0, -12); ctx.lineTo(5, -16); ctx.stroke(); ctx.restore(); } }
    else if (id === "homing") { ctx.fillStyle = P.spark; spark(-10, 8, 9); ctx.strokeStyle = "#7ee0a0"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(10, -2, 12, -14); ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, -14); ctx.lineTo(8, -9); ctx.moveTo(12, -14); ctx.lineTo(16, -10); ctx.stroke(); }
    else if (id === "regen") { ctx.fillStyle = P.hp; BR.heart(ctx, -2, -14, 14); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(14, 6); ctx.lineTo(14, 18); ctx.moveTo(8, 12); ctx.lineTo(20, 12); ctx.stroke(); }
    else if (id === "swift") { ctx.strokeStyle = "#7ee0a0"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-16, 12); ctx.lineTo(2, -14); ctx.lineTo(-4, 0); ctx.lineTo(14, -2); ctx.stroke(); }
    else if (id === "magnet") { ctx.strokeStyle = P.gem; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, -2, 14, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-14, 16); ctx.moveTo(14, -2); ctx.lineTo(14, 16); ctx.stroke(); }
    else if (id === "heal") { ctx.fillStyle = P.hp; BR.heart(ctx, 0, -12, 16); }
    else if (id === "shield") { ctx.strokeStyle = P.visor; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(120,210,255,.25)"; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill(); }
    ctx.restore();
  };

  // ---- gear icons as SVG strings (for DOM cards in menus/lockers) ----
  BR.gearSVG = function (slot) {
    if (slot === "weapon") return '<svg width="40" height="40" viewBox="0 0 40 40"><polygon points="20,4 24,16 36,20 24,24 20,36 16,24 4,20 16,16" fill="#ffe27a"/></svg>';
    if (slot === "armor") return '<svg width="40" height="44" viewBox="0 0 40 44"><path d="M20 3 L35 9 V22 C35 33 28 39 20 42 C12 39 5 33 5 22 V9 Z" fill="#7ad0ff"/><path d="M20 9 L29 12 V22 C29 29 25 33 20 35 Z" fill="#bfe8ff"/></svg>';
    if (slot === "boots") return '<svg width="44" height="36" viewBox="0 0 44 36"><path d="M8 4 H18 V22 H34 C38 22 40 26 40 30 V32 H8 Z" fill="#7ee0a0"/></svg>';
    return '<svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="16" r="11" fill="#eaf2ff"/><circle cx="22" cy="16" r="7" fill="#62d0ff"/><rect x="9" y="25" width="22" height="12" rx="6" fill="#eaf2ff"/></svg>';
  };

  // a pointing-hand glyph (for wordless tutorials)
  BR.hand = function (ctx, x, y, s) {
    s = s || 1; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 32, 16, 5, 0, 0, 7); ctx.fill();   // shadow
    ctx.fillStyle = "#ffd9b8";                                                                              // hand
    BR.rrect(ctx, -14, -4, 28, 30, 13); ctx.fill();                                                         // palm
    BR.rrect(ctx, -6, -30, 12, 28, 6); ctx.fill();                                                          // index finger
    ctx.fillStyle = "#7ad0ff"; BR.rrect(ctx, -16, 22, 32, 11, 5); ctx.fill();                               // cuff
    ctx.restore();
  };

  // names of available renders (handy for docs / tooling)
  BR.list = function () { return ["rrect", "sparkle", "heart", "background", "enemy", "hero", "gem", "projectile", "particle", "orbiter", "puIcon", "gearSVG", "stroke", "mirror", "shape"]; };


  // ---- Drawing-studio behaviors (shared so the next maker reuses them) ----------
  // BR.stroke(ctx, {texture, points:[{x,y}], color, width, alpha}) — draws ONE textured
  // line. Behavior switches on `texture`: smooth | wet | waxy | fine | grain | spray | glow.
  BR.stroke = function (ctx, o) {
    var pts = o.points || []; if (!pts.length) return;
    var col = o.color || "#000", w = o.width || 10, a = o.alpha == null ? 1 : o.alpha, tex = o.texture || "smooth";
    ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = col; ctx.fillStyle = col;
    function line(jit, ww, alpha) {
      ctx.globalAlpha = alpha; ctx.lineWidth = ww; ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], jx = jit ? (Math.random() - 0.5) * jit : 0, jy = jit ? (Math.random() - 0.5) * jit : 0;
        if (i === 0) ctx.moveTo(p.x + jx, p.y + jy); else ctx.lineTo(p.x + jx, p.y + jy);
      }
      ctx.stroke();
    }
    if (tex === "ribbon") {          // calligraphy: width follows per-point .w (speed)
      for (var i = 0; i < pts.length; i++) { var p = pts[i], rw = (p.w != null ? p.w : w);
        ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, rw / 2), 0, 7); ctx.fill();
        if (i) { var q = pts[i-1]; ctx.lineWidth = Math.max(1, rw); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } }
    } else if (tex === "fur") {       // soft strands shooting off the path
      for (var i = 0; i < pts.length; i++) { var p = pts[i];
        for (var k = 0; k < Math.max(4, w / 2); k++) { var ang = Math.random() * 7, len = w * (0.4 + Math.random() * 0.8);
          ctx.globalAlpha = a * (0.4 + Math.random() * 0.5); ctx.lineWidth = 1.2; ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len); ctx.stroke(); } }
    } else if (tex === "dots") {      // sponge: clustered soft dots
      for (var i = 0; i < pts.length; i++) { var p = pts[i];
        for (var k = 0; k < Math.max(3, w / 4); k++) { ctx.globalAlpha = a * (0.5 + Math.random() * 0.4);
          ctx.beginPath(); ctx.arc(p.x + (Math.random() - 0.5) * w, p.y + (Math.random() - 0.5) * w, Math.random() * (w / 5) + 1, 0, 7); ctx.fill(); } }
    } else if (tex === "spray") {
      for (var i = 0; i < pts.length; i++) { var p = pts[i], n = Math.max(6, w);
        for (var k = 0; k < n; k++) { var ang = Math.random() * 7, rr = Math.random() * w; ctx.globalAlpha = a * 0.5;
          ctx.beginPath(); ctx.arc(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr, 0.9, 0, 7); ctx.fill(); } }
    } else if (tex === "grain") {           // chalk: scattered specks along the path
      for (var i = 0; i < pts.length; i++) { var p = pts[i];
        for (var k = 0; k < Math.max(4, w / 3); k++) { ctx.globalAlpha = a * (0.25 + Math.random() * 0.4);
          ctx.beginPath(); ctx.arc(p.x + (Math.random() - 0.5) * w, p.y + (Math.random() - 0.5) * w, Math.random() * 1.6 + 0.4, 0, 7); ctx.fill(); } }
    } else if (tex === "waxy") {            // crayon: a few jittered translucent passes
      line(w * 0.18, w, a * 0.6); line(w * 0.28, w * 0.7, a * 0.45); line(w * 0.12, w * 0.4, a * 0.6);
    } else if (tex === "fine") {            // pencil: thin, soft
      line(0.6, Math.max(1, w * 0.35), a * 0.85);
    } else if (tex === "glow") {            // neon: blurred halo + bright core
      ctx.shadowColor = col; ctx.shadowBlur = w * 1.6; line(0, w * 0.7, a * 0.9);
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; line(0, Math.max(1, w * 0.25), a * 0.9);
    } else {                                // smooth / wet (paint, marker, rainbow)
      line(0, w, a);
    }
    ctx.restore();
  };

  // BR.mirror(ctx, n, W, H, drawFn) — calls drawFn() n times rotated around the canvas
  // center (a kaleidoscope). n=1 just draws once. For n>1 it also draws a mirrored set,
  // so a single scribble becomes a symmetrical pattern.
  BR.mirror = function (ctx, n, W, H, drawFn) {
    var cx0 = W / 2, cy0 = H / 2;
    if (n === "V") {                    // left-right mirror across the vertical center
      drawFn();
      ctx.save(); ctx.translate(cx0, 0); ctx.scale(-1, 1); ctx.translate(-cx0, 0); drawFn(); ctx.restore(); return;
    }
    if (n === "H") {                    // top-bottom mirror across the horizontal center
      drawFn();
      ctx.save(); ctx.translate(0, cy0); ctx.scale(1, -1); ctx.translate(0, -cy0); drawFn(); ctx.restore(); return;
    }
    n = Math.max(1, n | 0);
    if (n === 1) { drawFn(); return; }
    var cx = W / 2, cy = H / 2, step = (Math.PI * 2) / n;
    for (var i = 0; i < n; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(step * i); ctx.translate(-cx, -cy); drawFn(); ctx.restore();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(step * i); ctx.scale(1, -1); ctx.translate(-cx, -cy); drawFn(); ctx.restore();
    }
  };


  // BR.shape(ctx, name, x, y, size, color) — drawn shape stamps for the "shapes" brush.
  BR.shape = function (ctx, name, x, y, size, color) {
    var r = size / 2; ctx.save(); ctx.translate(x, y); ctx.fillStyle = color || "#ff5d8f";
    if (name === "heart") {
      ctx.beginPath(); ctx.moveTo(0, r * 0.65);
      ctx.bezierCurveTo(r, -r * 0.3, r * 0.55, -r, 0, -r * 0.35);
      ctx.bezierCurveTo(-r * 0.55, -r, -r, -r * 0.3, 0, r * 0.65); ctx.fill();
    } else if (name === "star") {
      ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    } else if (name === "flower") {
      for (var p = 0; p < 6; p++) { var a2 = p * Math.PI / 3; ctx.beginPath();
        ctx.ellipse(Math.cos(a2) * r * 0.55, Math.sin(a2) * r * 0.55, r * 0.42, r * 0.26, a2, 0, 7); ctx.fill(); }
      ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, 7); ctx.fill();
    } else if (name === "diamond") {
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); ctx.fill();
    } else if (name === "triangle") {
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.88, r * 0.7); ctx.lineTo(-r * 0.88, r * 0.7); ctx.closePath(); ctx.fill();
    } else if (name === "circle") {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, 7); ctx.fill();
    } else if (name === "lightning") {
      ctx.beginPath(); ctx.moveTo(r * 0.15, -r); ctx.lineTo(-r * 0.5, r * 0.12); ctx.lineTo(-r * 0.05, r * 0.12);
      ctx.lineTo(-r * 0.2, r); ctx.lineTo(r * 0.55, -r * 0.18); ctx.lineTo(r * 0.05, -r * 0.18); ctx.closePath();
      ctx.fillStyle = color || "#ffd23f"; ctx.fill();
    } else if (name === "moon") {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.2, r * 0.8, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (name === "cloud") {
      ctx.beginPath(); ctx.arc(-r * 0.45, r * 0.1, r * 0.42, 0, 7); ctx.arc(0, -r * 0.15, r * 0.55, 0, 7);
      ctx.arc(r * 0.5, r * 0.1, r * 0.45, 0, 7); ctx.rect(-r * 0.55, r * 0.05, r * 1.1, r * 0.45); ctx.fill();
    } else {                            // dot
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    }
    ctx.restore();
  };

  g.BuildableRenders = BR;
})(typeof window !== "undefined" ? window : globalThis);
