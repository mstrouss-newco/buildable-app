// ============================================================================
//  Buildable Mechanics — shared, reusable "juice"/FX library for game engines.
//  The third shared engine lib, alongside:
//    buildable-renders.js (BR — drawn art)  +  buildable-audio.js (BA — sound).
//
//  WHAT THIS IS: the FX/feel primitives that every hand-authored engine
//  (play.html, survival-engine, croc-engine, breaker-engine) was copy-pasting
//  on its own — particle bursts, screen shake, screen flash, floating pop text,
//  and a composed "explosion". Extracted here so a mechanic invented in one game
//  is instantly reusable in the next. This is the code side of MECHANICS.md.
//
//  DESIGN: stateless helpers that operate on arrays/state the ENGINE owns, so an
//  engine adopts them without changing its data model. Headless-safe (every
//  canvas call is guarded) so the QA sim (update() with no ctx) never breaks.
//
//  TIME MODEL: pass dt in SECONDS for dt-based engines (croc, survival v2). For
//  the older frame-stepped engines, omit dt (defaults to a 1/60s frame). Life is
//  always tracked in seconds internally.
//
//  Usage:  <script src="buildable-mechanics.js"></script>  then  BM = window.BuildableMechanics
//    const fx = { parts:[], pops:[], shake:0, flash:0, flashCol:"#fff" };
//    BM.burst(fx.parts, x, y, "#ff8800", 12);          // spawn particles
//    BM.pop(fx.pops, x, y, "-1", "#ff5555");            // floating text
//    BM.explode(fx, x, y, "#ffa500", { sfx, n:18 });    // burst + flash + shake (+sound)
//    BM.update(fx, dt);                                  // advance + cull every frame
//    BM.draw(ctx, fx, { W, H, font:"700 18px system-ui" }); // render (call inside draw())
//    // shake: read BM.shakeOffset(fx) -> {x,y} and translate the camera by it.
// ============================================================================
(function (g) {
  const BM = { version: "1.0.0" };

  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // normalize dt: seconds if given, else one 60fps frame.
  function sec(dt) { return (typeof dt === "number" && dt > 0) ? Math.min(dt, 0.05) : 1 / 60; }

  // ---- PARTICLE BURST -------------------------------------------------------
  // Spawns n particles outward from (x,y). Mirrors the burst() every engine had.
  // opts: { spd:[min,max], life:[min,max], gravity, drag, r } (all optional)
  BM.burst = function (arr, x, y, col, n, opts) {
    if (!arr) return;
    n = n || 8; opts = opts || {};
    const sp = opts.spd || [60, 240];      // px/sec
    const lf = opts.life || [0.3, 0.5];    // seconds
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(sp[0], sp[1]);
      arr.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(lf[0], lf[1]), max: lf[1], col,
        r: opts.r || 3, gravity: opts.gravity || 0, drag: opts.drag != null ? opts.drag : 4.5
      });
    }
  };

  BM.updateParticles = function (arr, dt) {
    if (!arr || !arr.length) return arr;
    const s = sec(dt);
    for (const p of arr) {
      p.x += p.vx * s; p.y += p.vy * s;
      const d = Math.max(0, 1 - p.drag * s); p.vx *= d; p.vy *= d;
      if (p.gravity) p.vy += p.gravity * s;
      p.life -= s;
    }
    return _cull(arr);
  };

  BM.drawParticles = function (ctx, arr) {
    if (!ctx || !arr) return;
    for (const p of arr) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max || 0.5)));
      ctx.fillStyle = p.col || "#fff";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };

  // ---- FLOATING POP TEXT ("-1", "+5", "BOOM!") ------------------------------
  BM.pop = function (arr, x, y, txt, col) {
    if (!arr) return;
    arr.push({ x, y, txt: String(txt), col: col || "#fff", life: 0.9, max: 0.9 });
  };
  BM.updatePops = function (arr, dt) {
    if (!arr || !arr.length) return arr;
    const s = sec(dt);
    for (const p of arr) { p.y -= 40 * s; p.life -= s; }
    return _cull(arr);
  };
  BM.drawPops = function (ctx, arr, font) {
    if (!ctx || !arr) return;
    ctx.save(); ctx.textAlign = "center"; ctx.font = font || "700 18px system-ui, sans-serif";
    for (const p of arr) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max || 0.9)));
      ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y);
    }
    ctx.restore();
  };

  // ---- SCREEN SHAKE ---------------------------------------------------------
  // Engine keeps a single number `state.shake` (seconds remaining). Add to it to
  // kick; read shakeOffset() to translate the camera.
  BM.shake = function (state, amt) { if (state) state.shake = Math.max(state.shake || 0, amt || 0.25); };
  BM.shakeOffset = function (state) {
    const a = state && state.shake > 0 ? state.shake : 0;
    if (a <= 0) return { x: 0, y: 0 };
    const mag = Math.min(12, a * 28);
    return { x: rnd(-mag, mag), y: rnd(-mag, mag) };
  };

  // ---- SCREEN FLASH ---------------------------------------------------------
  // Engine keeps state.flash (0..1 strength) + state.flashCol. Kick with flash().
  BM.flash = function (state, col, amt) {
    if (!state) return;
    state.flash = Math.max(state.flash || 0, amt == null ? 0.3 : amt);
    state.flashCol = col || "#ffffff";
  };
  BM.drawFlash = function (ctx, state, W, H) {
    if (!ctx || !state || !(state.flash > 0)) return;
    ctx.save(); ctx.globalAlpha = Math.min(0.85, state.flash); ctx.fillStyle = state.flashCol || "#fff";
    ctx.fillRect(0, 0, W, H); ctx.restore();
  };

  // ---- COMPOSED: EXPLOSION --------------------------------------------------
  // The mechanic kids ask for by name. Burst + flash + shake (+ optional sound +
  // pop text). `fx` is a state bag holding {parts,pops,shake,flash,flashCol}.
  // opts: { n, sfx (fn or name+ba), shake, flash, pop, spd, life, gravity }
  BM.explode = function (fx, x, y, col, opts) {
    opts = opts || {};
    BM.burst(fx.parts, x, y, col, opts.n || 16, { spd: opts.spd, life: opts.life, gravity: opts.gravity, r: opts.r });
    BM.flash(fx, opts.flashCol || col, opts.flash != null ? opts.flash : 0.25);
    BM.shake(fx, opts.shake != null ? opts.shake : 0.3);
    if (opts.pop) BM.pop(fx.pops, x, y, opts.pop, opts.popCol || col);
    if (typeof opts.sfx === "function") opts.sfx();
    else if (opts.sfx && g.BuildableAudio) g.BuildableAudio.sfx(opts.sfx);
  };

  // ---- ONE-CALL UPDATE + DRAW for the standard fx bag -----------------------
  // fx bag shape: { parts:[], pops:[], shake:0, flash:0, flashCol:"#fff" }
  BM.makeFx = function () { return { parts: [], pops: [], shake: 0, flash: 0, flashCol: "#fff" }; };
  BM.update = function (fx, dt) {
    if (!fx) return;
    const s = sec(dt);
    fx.parts = BM.updateParticles(fx.parts, dt);
    fx.pops = BM.updatePops(fx.pops, dt);
    if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - s);
    if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - s * 1.6);
  };
  // Draw particles + pops + the flash overlay. Call shakeOffset() yourself before
  // drawing the world if you want the shake to move the camera.
  BM.draw = function (ctx, fx, o) {
    if (!ctx || !fx) return; o = o || {};
    BM.drawParticles(ctx, fx.parts);
    BM.drawPops(ctx, fx.pops, o.font);
    if (o.W && o.H) BM.drawFlash(ctx, fx, o.W, o.H);
  };

  function _cull(arr) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i].life > 0) arr[w++] = arr[i];
    arr.length = w; return arr;
  }

  g.BuildableMechanics = BM;
  if (typeof module !== "undefined" && module.exports) module.exports = BM;
})(typeof window !== "undefined" ? window : globalThis);
