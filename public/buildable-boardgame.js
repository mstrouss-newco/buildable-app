// buildable-boardgame.js  —  BG (window.BuildableBoardGame)
// ---------------------------------------------------------------------------
// The shared "simple board game" shell, built ONCE and instantiated by every
// hot-seat board game (Tic-Tac-Toe, Connect Four, Dots and Boxes). It owns the
// stuff every turn-based, same-device, no-backend board game repeats:
//
//   * a hot-seat TURN MANAGER (Player A / Player B alternate; or vs an easy
//     computer in solo mode) — NO backend, NO accounts (v1).
//   * the CANVAS host: responsive sizing, devicePixelRatio, the rAF loop, and
//     pointer/touch -> logical board-coordinate mapping ("place your thing").
//   * reusable WIN / CLAIM DETECTORS: BG.lineWinner (N-in-a-row, any direction)
//     and BG.boxClaim (the 4th-side-completes-a-box rule).
//   * the shared start screen (BS), sound (BA), juice (BM), the win banner +
//     Play again, the Home button (posts nav:exit), and a mute toggle.
//   * a standard QA scaffold so each engine can expose window.BUILDABLE_GAME.
//
// A game supplies a small SPEC (rules + draw + tap + ai); BG runs the shell.
// Headless-safe: with no real DOM (the QA sim) BG.boot() still wires the spec
// and the engine drives moves directly — no rendering required.
//
//   <script src="buildable-renders.js"></script>      (BR — drawn art)
//   <script src="buildable-audio.js"></script>        (BA — sound)
//   <script src="buildable-mechanics.js"></script>    (BM — juice)
//   <script src="buildable-startscreen.js"></script>  (BS — start screen)
//   <script src="buildable-boardgame.js"></script>    (BG — this shell)
// ---------------------------------------------------------------------------
(function (g) {
  "use strict";
  const BG = {};
  const BR = g.BuildableRenders, BA = g.BuildableAudio,
        BM = g.BuildableMechanics, BS = g.BuildableStartScreen;
  const hasDoc = typeof document !== "undefined";

  // ---- tiny utils ----------------------------------------------------------
  BG.rng = function (seed) {            // mulberry32 — deterministic for QA
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  BG.pick = function (arr, rnd) { return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; };

  // =========================================================================
  // REUSABLE DETECTOR 1 — lineWinner: N-in-a-row in any of 4 directions.
  // Works for Tic-Tac-Toe (need=3) AND Connect Four (need=4) on the same code.
  //   cells: flat array length cols*rows, 0 = empty, 1 = player A, 2 = player B
  //   returns { player, cells:[idx,...] } for the winning run, else null.
  // =========================================================================
  BG.lineWinner = function (cells, cols, rows, need) {
    const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? 0 : cells[r * cols + c];
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const p = at(c, r); if (!p) continue;
      for (const [dc, dr] of dirs) {
        if (at(c - dc, r - dr) === p) continue;      // only start of a run
        const run = [r * cols + c];
        let cc = c + dc, rr = r + dr;
        while (at(cc, rr) === p) { run.push(rr * cols + cc); cc += dc; rr += dr; }
        if (run.length >= need) return { player: p, cells: run.slice(0, Math.max(need, run.length)) };
      }
    }
    return null;
  };
  BG.boardFull = function (cells) { for (let i = 0; i < cells.length; i++) if (!cells[i]) return false; return true; };

  // =========================================================================
  // REUSABLE DETECTOR 2 — boxClaim: the dots-and-boxes "4th side completes a
  // box" rule. Edges are stored as two arrays:
  //   h[r*cols + c]  horizontal edge above box (rows+1)*cols entries
  //   v[r*(cols+1)+c] vertical edge left of box  rows*(cols+1) entries
  // boxSides(cols,rows,bc,br) -> the 4 edge keys of box (bc,br).
  // claimedBy(... edge just drawn ...) -> array of box indices newly closed.
  // =========================================================================
  BG.boxSides = function (cols, rows, bc, br) {
    return {
      top:    { kind: "h", i: br * cols + bc },
      bottom: { kind: "h", i: (br + 1) * cols + bc },
      left:   { kind: "v", i: br * (cols + 1) + bc },
      right:  { kind: "v", i: br * (cols + 1) + (bc + 1) },
    };
  };
  BG.boxClosed = function (h, v, cols, rows, bc, br) {
    const s = BG.boxSides(cols, rows, bc, br);
    return h[s.top.i] && h[s.bottom.i] && v[s.left.i] && v[s.right.i];
  };
  // After drawing one edge, which boxes (if any) did it close? (0, 1 or 2.)
  BG.boxesNewlyClosed = function (h, v, cols, rows, kind, idx) {
    const out = [];
    if (kind === "h") {                       // horizontal edge idx = r*cols + c
      const c = idx % cols, r = Math.floor(idx / cols);
      if (r < rows && BG.boxClosed(h, v, cols, rows, c, r)) out.push(r * cols + c);            // box below
      if (r - 1 >= 0 && BG.boxClosed(h, v, cols, rows, c, r - 1)) out.push((r - 1) * cols + c); // box above
    } else {                                  // vertical edge idx = r*(cols+1) + c
      const c = idx % (cols + 1), r = Math.floor(idx / (cols + 1));
      if (c < cols && BG.boxClosed(h, v, cols, rows, c, r)) out.push(r * cols + c);            // box right
      if (c - 1 >= 0 && BG.boxClosed(h, v, cols, rows, c - 1, r)) out.push(r * cols + (c - 1)); // box left
    }
    return out;
  };

  // ---- HOT-SEAT TURN MANAGER -----------------------------------------------
  // Player A / Player B alternate on one device. In solo mode player B is the
  // easy computer. extraTurn() keeps the same player (dots-and-boxes bonus).
  BG.makeTurn = function (mode) {
    return {
      mode: mode || "two",          // "solo" (vs computer) | "two" (hot-seat)
      cur: 1,                        // 1 = player A, 2 = player B
      switch() { this.cur = this.cur === 1 ? 2 : 1; return this.cur; },
      extraTurn() { return this.cur; },
      isAI(p) { return this.mode === "solo" && (p == null ? this.cur : p) === 2; },
      reset() { this.cur = 1; },
    };
  };

  // =========================================================================
  // BG.boot(spec) — wire a game onto the shell. Returns a controller the
  // engine also publishes as window.BUILDABLE_GAME (for the QA sim + picker).
  // spec hooks (all pure-ish, headless-safe — no direct DOM):
  //   init(api)            create + return fresh game state G (api.mode/turn)
  //   draw(ctx, G, R)      render the board (R = {W,H,t,fx})  [skipped headless]
  //   tap(G, x, y, api)    a human move at logical px,py -> {moved, sound, extra}
  //   ai(G, api)           the computer makes a move -> {moved, sound, extra}
  //   result(G)            -> { over, winner: 1|2|0(draw)|null, line, scores }
  //   hud(G)               -> short status string for the banner
  //   turn(G)              -> 1|2 whose move it is
  // api passed to hooks: { turn, mode, rng, claim(), say(text) }
  // =========================================================================
  BG.boot = function (spec) {
    const S = spec;
    const ctrl = {
      spec: S, state: "title",        // title | play | over
      mode: "two", turn: null, G: null, winner: null, line: null,
      W: 900, H: 600, t: 0, fx: BM ? BM.makeFx() : null, rnd: BG.rng(12345),
      aiPending: 0,
    };

    // ----- sound: configure BA with this game's map (bespoke ElevenLabs) -----
    if (BA && BA.configure && S.sfx) BA.configure({ sfxBase: "/api/sfx?s=", map: S.sfx });
    function sfx(n) { try { if (BA && n) BA.sfx(n); } catch (e) {} }

    // ----- DOM handles (guarded; null when headless) -----
    const D = hasDoc ? {
      cv: document.getElementById("cv"),
      start: document.getElementById("start"),
      hud: document.getElementById("hud"),
      banner: document.getElementById("banner"),
      bTitle: document.getElementById("bTitle"),
      bSub: document.getElementById("bSub"),
      again: document.getElementById("again"),
      home: document.getElementById("home"),
      mute: document.getElementById("mute"),
    } : {};
    const ctx = (D.cv && D.cv.getContext) ? D.cv.getContext("2d") : null;

    // ----- responsive canvas -----
    function fit() {
      if (!D.cv || !ctx) return;
      const wrap = D.cv.parentElement || { clientWidth: 900, clientHeight: 600 };
      const availW = wrap.clientWidth || 900, availH = wrap.clientHeight || 600;
      const aspect = (S.aspect || 3 / 2);
      let w = availW, h = w / aspect;
      if (h > availH) { h = availH; w = h * aspect; }
      ctrl.W = Math.max(280, Math.round(w)); ctrl.H = Math.max(200, Math.round(h));
      const dpr = Math.min(g.devicePixelRatio || 1, 2.5);
      D.cv.width = ctrl.W * dpr; D.cv.height = ctrl.H * dpr;
      D.cv.style.width = ctrl.W + "px"; D.cv.style.height = ctrl.H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ----- pointer -> logical coords -----
    function toLocal(ev) {
      const r = D.cv.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
      return { x: cx * (ctrl.W / r.width), y: cy * (ctrl.H / r.height) };
    }

    function api() {
      return { turn: ctrl.turn, mode: ctrl.mode, rng: ctrl.rnd,
        W: ctrl.W, H: ctrl.H,
        say(/*txt*/) {} };
    }

    // ----- core move resolution (shared by tap + ai) -----
    function applyOutcome(out) {
      if (!out || !out.moved) return false;
      sfx(out.sound || S.sfxPlace || "place");
      if (ctrl.fx && out.fx && BM) {           // optional juice from the spec
        BM.burst(ctrl.fx.parts, out.fx.x, out.fx.y, out.fx.col || "#fff", out.fx.n || 10);
      }
      const res = S.result(ctrl.G) || {};
      if (res.over) {
        ctrl.state = "over"; ctrl.winner = res.winner; ctrl.line = res.line || null;
        if (BM && ctrl.fx) { BM.shake(ctrl.fx, 0.35); if (res.line && res.line.fx) {} }
        sfx(res.winner === 0 ? (S.sfxDraw || "draw") : (S.sfxWin || "win"));
        showBanner(res);
        return true;
      }
      // not over — next turn unless the move granted an extra turn
      if (!out.extra) ctrl.turn = (ctrl.turn === 1 ? 2 : 1);
      S.turn && (ctrl.turn = S.turn(ctrl.G));   // let the spec be source of truth
      if (D.hud) D.hud.textContent = S.hud ? S.hud(ctrl.G, ctrl) : "";
      // queue AI if it's now the computer's move (solo)
      if (ctrl.mode === "solo" && ctrl.turn === 2) ctrl.aiPending = 24;  // ~0.4s think
      return true;
    }

    function humanTap(ev) {
      if (ctrl.state !== "play") return;
      if (ctrl.mode === "solo" && ctrl.turn === 2) return;   // not your turn
      if (BA) BA.unlock();
      const p = toLocal(ev);
      const out = S.tap(ctrl.G, p.x, p.y, api());
      applyOutcome(out);
    }

    function aiStep() {
      if (ctrl.state !== "play" || ctrl.mode !== "solo" || ctrl.turn !== 2) return;
      const out = S.ai(ctrl.G, api());
      applyOutcome(out);
    }

    // ----- banner / start screen -----
    function showBanner(res) {
      if (!D.banner) return;
      const names = S.players || [{ name: "Player 1" }, { name: "Player 2" }];
      let title;
      if (res.winner === 0) title = "It's a tie!";
      else if (ctrl.mode === "solo") title = res.winner === 1 ? "You win!" : (S.aiName || "Robo") + " wins!";
      else title = (names[res.winner - 1] && names[res.winner - 1].name || ("Player " + res.winner)) + " wins!";
      D.bTitle.textContent = title;
      if (D.bSub) D.bSub.textContent = res.scores ? res.scores : (res.winner === 0 ? "So close — play again?" : "Great game!");
      D.banner.classList.add("show");
    }

    function startGame(mode) {
      ctrl.mode = mode || ctrl.mode;
      ctrl.G = S.init({ mode: ctrl.mode, rng: ctrl.rnd });
      ctrl.turn = S.turn ? S.turn(ctrl.G) : 1;
      ctrl.winner = null; ctrl.line = null; ctrl.state = "play";
      ctrl.fx = BM ? BM.makeFx() : null; ctrl.aiPending = 0;
      if (D.banner) D.banner.classList.remove("show");
      if (D.start) D.start.style.display = "none";
      if (D.hud) D.hud.textContent = S.hud ? S.hud(ctrl.G, ctrl) : "";
      if (BA) BA.unlock();
      if (ctrl.mode === "solo" && ctrl.turn === 2) ctrl.aiPending = 24;
    }

    function toMenu() {
      ctrl.state = "title";
      if (D.banner) D.banner.classList.remove("show");
      if (D.start) D.start.style.display = "block";
      mountStart();
    }

    let startScreen = null;
    function startCfg() {
      return {
        title: S.title, subtitle: S.subtitle,
        sound: !(BA && BA.muted), showBack: false,
        modes: S.modes || ["solo", "two"], mode: ctrl.mode,
        levels: [{ n: 1, name: ctrl.mode === "solo" ? ("Play " + (S.aiName || "the computer")) : "Two players", color: (S.players && S.players[0] && S.players[0].col) || "#5B8CFF", state: "ready", foot: ctrl.mode === "solo" ? "vs an easy computer" : "take turns on one screen" }],
      };
    }
    function mountStart() {
      if (!BS || !D.start) return;
      const cb = {
        onPlay: () => startGame(ctrl.mode),
        onMode: (m) => { ctrl.mode = m; startScreen && startScreen.update(startCfg()); },
        onSound: () => { if (BA) { BA.unlock(); BA.toggleMute(); } },
        onBack: () => { try { g.parent && g.parent.postMessage("nav:exit", "*"); } catch (e) {} },
      };
      if (!startScreen) startScreen = BS.mount(D.start, startCfg(), cb);
      else startScreen.update(startCfg());
    }

    // ----- frame loop -----
    function frame() {
      ctrl.t += 1 / 60;
      if (ctrl.aiPending > 0 && --ctrl.aiPending === 0) aiStep();
      if (ctx && ctrl.state !== "title") {
        ctx.clearRect(0, 0, ctrl.W, ctrl.H);
        const off = (BM && ctrl.fx) ? BM.shakeOffset(ctrl.fx) : { x: 0, y: 0 };
        ctx.save(); ctx.translate(off.x, off.y);
        try { S.draw(ctx, ctrl.G, { W: ctrl.W, H: ctrl.H, t: ctrl.t, fx: ctrl.fx, winner: ctrl.winner, line: ctrl.line, state: ctrl.state }); } catch (e) {}
        ctx.restore();
        if (BM && ctrl.fx) { BM.update(ctrl.fx, 1 / 60); BM.draw(ctx, ctrl.fx, { W: ctrl.W, H: ctrl.H }); }
      }
      g.requestAnimationFrame(frame);
    }

    // ----- boot (only with a real canvas) -----
    if (hasDoc && D.cv && ctx) {
      fit(); g.addEventListener("resize", fit);
      D.cv.addEventListener("pointerdown", humanTap);
      if (D.again) D.again.onclick = () => startGame(ctrl.mode);
      if (D.home) D.home.onclick = () => { try { g.parent && g.parent.postMessage("nav:exit", "*"); } catch (e) {} };
      if (D.mute) { const upd = () => D.mute.textContent = "Sound: " + (BA && BA.muted ? "Off" : "On"); upd(); D.mute.onclick = () => { if (BA) { BA.unlock(); BA.toggleMute(); } upd(); }; }
      toMenu();
      g.requestAnimationFrame(frame);
    }

    // ----- QA / picker controller -----
    ctrl.startGame = startGame;
    ctrl.toMenu = toMenu;
    ctrl._applyTap = (x, y) => { const out = S.tap(ctrl.G, x, y, api()); return applyOutcome(out); };
    // headless-friendly: apply a LOGICAL move token through the same pipeline
    ctrl._play = (token) => applyOutcome(S.move ? S.move(ctrl.G, token, api()) : { moved: false });
    ctrl.moves = () => (S.moves ? S.moves(ctrl.G) : []);
    ctrl._turn = () => ctrl.turn;
    ctrl._state = () => ctrl.state;
    ctrl._ai = () => aiStep();
    ctrl._draw = () => { if (!ctx) return "no-ctx"; try { S.draw(ctx, ctrl.G, { W: ctrl.W, H: ctrl.H, t: ctrl.t, fx: ctrl.fx, winner: ctrl.winner, line: ctrl.line, state: ctrl.state }); return "ok"; } catch (e) { return "ERR: " + (e && e.message || e); } };
    ctrl.result = () => S.result(ctrl.G);
    ctrl.api = api;
    return ctrl;
  };

  g.BuildableBoardGame = BG;
  if (typeof module !== "undefined" && module.exports) module.exports = BG;
})(typeof window !== "undefined" ? window : globalThis);
