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
      aiPending: 0, paused: false, _hasSave: false, demo: false,   // demo: 7I attract mode (?screen=demo)
    };

    // ----- sound: configure BA with this game's map (bespoke ElevenLabs) -----
    if (BA && BA.configure && S.sfx) BA.configure({ sfxBase: "/api/sfx?s=", map: S.sfx });
    function sfx(n) { if (ctrl.demo) return; try { if (BA && n) BA.sfx(n); } catch (e) {} }   // demo NEVER makes a sound

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
        clearSave();                              // finished game — nothing to resume
        showBanner(res);
        return true;
      }
      // not over — next turn unless the move granted an extra turn
      if (!out.extra) ctrl.turn = (ctrl.turn === 1 ? 2 : 1);
      S.turn && (ctrl.turn = S.turn(ctrl.G));   // let the spec be source of truth
      if (D.hud) D.hud.textContent = S.hud ? S.hud(ctrl.G, ctrl) : "";
      // queue AI if it's now the computer's move (solo)
      if (ctrl.mode === "solo" && ctrl.turn === 2) ctrl.aiPending = 24;  // ~0.4s think
      saveGame();                                 // auto-save so the game can be continued later
      return true;
    }

    function humanTap(ev) {
      if (ctrl.demo) return;                                 // 7I: attract demo ignores ALL input
      if (ctrl.state !== "play" || ctrl.paused) return;
      if (ctrl.mode === "solo" && ctrl.turn === 2) return;   // not your turn
      if (ctrl.online && ctrl.turn !== ctrl.myPlayer) return; // online: wait your turn
      if (BA) BA.unlock();
      const p = toLocal(ev);
      const out = S.tap(ctrl.G, p.x, p.y, api());
      const moved = applyOutcome(out);
      if (moved && ctrl.online) postMove();
    }

    function aiStep() {
      if (ctrl.state !== "play" || ctrl.mode !== "solo" || ctrl.turn !== 2) return;
      const out = S.ai(ctrl.G, api());
      applyOutcome(out);
    }

    // ----- banner / start screen -----
    function showBanner(res) {
      if (ctrl.demo) return;                                 // 7I: no win/lose dialogs in the attract demo
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
      ctrl.paused = false; closePause(); clearSave();
      ctrl.G = S.init({ mode: ctrl.mode, rng: ctrl.rnd });
      ctrl.turn = S.turn ? S.turn(ctrl.G) : 1;
      ctrl.winner = null; ctrl.line = null; ctrl.state = "play";
      ctrl.fx = BM ? BM.makeFx() : null; ctrl.aiPending = 0;
      if (D.banner) D.banner.classList.remove("show");
      if (D.start) D.start.style.display = "none";
      if (D.hud) D.hud.textContent = S.hud ? S.hud(ctrl.G, ctrl) : "";
      if (BA && !ctrl.demo) BA.unlock();                     // 7I: the demo never unlocks audio
      if (ctrl.mode === "solo" && ctrl.turn === 2) ctrl.aiPending = 24;
      navUpdate();
    }

    function toMenu() {
      ctrl.state = "title"; ctrl.paused = false; closePause();
      ctrl._hasSave = hasSave();
      if (D.banner) D.banner.classList.remove("show");
      if (D.start) D.start.style.display = "block";
      mountStart();
      navUpdate();
    }

    let startScreen = null;
    function startCfg() {
      return {
        title: S.title, subtitle: S.subtitle,
        sound: !(BA && BA.muted), showBack: false,
        modes: (S.modes || ["solo", "two"]).concat(S.online ? ["family"] : []), mode: ctrl.mode,
        levels: S.choices
          ? S.choices.map(function (c, i) { return { n: i + 1, name: c.name, color: (S.players && S.players[0] && S.players[0].col) || "#5B8CFF", state: "ready", foot: c.foot }; })
          : [{ n: 1, name: ctrl.mode === "solo" ? ("Play " + (S.aiName || "the computer")) : "Two players", color: (S.players && S.players[0] && S.players[0].col) || "#5B8CFF", state: "ready", foot: ctrl.mode === "solo" ? "vs an easy computer" : "take turns on one screen" }],
      };
    }
    function mountStart() {
      if (!BS || !D.start) return;
      const cb = {
        onPlay: (n) => { if (S.choices && S.applyChoice) { try { S.applyChoice(S.choices[(n || 1) - 1].value); } catch (e) {} } startGame(ctrl.mode); },
        onMode: (m) => { if (m === "family") { try { g.parent && g.parent.postMessage({ type: "bgPlayFriend" }, "*"); } catch (e) {} return; } ctrl.mode = m; startScreen && startScreen.update(startCfg()); },
        onSound: () => { if (BA) { BA.unlock(); BA.toggleMute(); } },
        onBack: () => { try { g.parent && g.parent.postMessage("nav:exit", "*"); } catch (e) {} },
      };
      if (!startScreen) startScreen = BS.mount(D.start, startCfg(), cb);
      else startScreen.update(startCfg());
    }

    // ----- save / continue (localStorage; no backend) -----
    const SAVE_KEY = "bg_save_" + (S.id || "game");
    function saveGame() { if (!hasDoc || ctrl.demo) return; try { if (ctrl.state !== "play") return;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ G: ctrl.G, turn: ctrl.turn, mode: ctrl.mode })); ctrl._hasSave = true; } catch (e) {} }
    function clearSave() { if (ctrl.demo) return; if (hasDoc) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} } ctrl._hasSave = false; }   // demo never touches a kid's save
    function hasSave() { if (!hasDoc) return false; try { const r = localStorage.getItem(SAVE_KEY); if (!r) return false; const o = JSON.parse(r); return !!(o && o.G); } catch (e) { return false; } }
    function resumeSave() { if (!hasDoc) return; try { const r = localStorage.getItem(SAVE_KEY); if (!r) return; const o = JSON.parse(r); if (!o || !o.G) return;
      ctrl.mode = o.mode || ctrl.mode; ctrl.G = o.G; ctrl.turn = o.turn || 1; ctrl.winner = null; ctrl.line = null; ctrl.state = "play"; ctrl.paused = false;
      ctrl.fx = BM ? BM.makeFx() : null; ctrl.aiPending = 0; closePause();
      if (D.banner) D.banner.classList.remove("show"); if (D.start) D.start.style.display = "none";
      if (D.hud) D.hud.textContent = S.hud ? S.hud(ctrl.G, ctrl) : ""; if (BA) BA.unlock();
      if (ctrl.mode === "solo" && ctrl.turn === 2) ctrl.aiPending = 24; } catch (e) {} }

    // ----- shared in-game menu (Pause button + pause overlay + Continue) -----
    // Built ONCE here so all three games get the SAME menu — edit it in one place.
    let pauseBtn = null, contBtn = null, pauseOv = null;
    function navUpdate() { try { if (g.BuildableGameNav) g.BuildableGameNav.update(); } catch (e) {} }
    function openPause() { if (ctrl.state !== "play") return; ctrl.paused = true; if (pauseOv) pauseOv.classList.add("show"); }
    function closePause() { ctrl.paused = false; if (pauseOv) pauseOv.classList.remove("show"); }
    function injectChrome() {
      if (!hasDoc || !document.body) return;
      const st = document.createElement("style"); st.textContent =
        ".bgctl{position:fixed;top:12px;z-index:32;font-family:inherit;font-weight:800;font-size:14px;color:#cdd0ff;" +
        "background:rgba(26,20,64,.72);border:1px solid #3a2c6e;border-radius:12px;padding:8px 14px;cursor:pointer;display:none}" +
        // status text sits on its OWN row below the top buttons so it never collides on phone widths
        "#hud{top:54px;left:50%;transform:translateX(-50%);max-width:calc(100% - 150px);white-space:normal;" +
        "text-align:center;font-size:15px;line-height:1.25;pointer-events:none}" +
        // Pause + Sound share ONE right-aligned cluster -> they lay out without overlap regardless of label width
        "#bgRight{position:fixed;top:10px;right:10px;z-index:32;display:flex;gap:8px;align-items:center}" +
        "#bgRight>button{position:static;top:auto;right:auto;left:auto;bottom:auto;margin:0}" +
        "#bgContinue{top:auto;bottom:26px;left:50%;transform:translateX(-50%);z-index:14;color:#11331f;background:#7ee0a0;" +
        "border:none;padding:14px 30px;font-size:18px;border-radius:16px;box-shadow:0 6px 0 #4cba74}" +
        "#bgPause{position:fixed;inset:0;z-index:46;display:none;flex-direction:column;align-items:center;justify-content:center;" +
        "background:rgba(8,10,40,.82);backdrop-filter:blur(3px)}#bgPause.show{display:flex}" +
        "#bgPause .card{background:linear-gradient(180deg,#1a1450,#2a1b6b);border:2px solid #4a36a0;border-radius:24px;padding:26px 28px;text-align:center;min-width:250px}" +
        "#bgPause h2{margin:0 0 16px;font-size:30px;font-weight:700}" +
        "#bgPause button{display:block;width:100%;font-family:inherit;font-weight:700;font-size:20px;margin:9px 0;padding:13px;border-radius:14px;border:none;cursor:pointer;color:#1a0f3a;background:#9b7bff;box-shadow:0 5px 0 #6a4ad6}" +
        "#bgPause button:active{transform:translateY(2px);box-shadow:0 3px 0 #6a4ad6}" +
        "#bgPause button.ghost{background:#241a52;color:#cdd0ff;box-shadow:none;border:1px solid #3a2c6e}";
      (document.head || document.documentElement).appendChild(st);
      pauseBtn = document.createElement("button"); pauseBtn.id = "bgPauseBtn"; pauseBtn.className = "bgctl"; pauseBtn.textContent = "Pause";
      pauseBtn.onclick = openPause;
      const rightWrap = document.createElement("div"); rightWrap.id = "bgRight"; document.body.appendChild(rightWrap);
      rightWrap.appendChild(pauseBtn);
      if (D.mute) rightWrap.appendChild(D.mute);   // group Sound next to Pause (no more overlap)
      contBtn = document.createElement("button"); contBtn.id = "bgContinue"; contBtn.className = "bgctl"; contBtn.textContent = "Continue your game";
      contBtn.onclick = resumeSave; document.body.appendChild(contBtn);
      pauseOv = document.createElement("div"); pauseOv.id = "bgPause";
      pauseOv.innerHTML = '<div class="card"><h2>Paused</h2>' +
        '<button id="bgResume">Keep playing</button>' +
        '<button id="bgNew">New game</button>' +
        '<button id="bgSoundT" class="ghost">Sound: On</button>' +
        '<button id="bgHomeB" class="ghost">Home</button></div>';
      document.body.appendChild(pauseOv);
      pauseOv.querySelector("#bgResume").onclick = closePause;
      pauseOv.querySelector("#bgNew").onclick = function () { startGame(ctrl.mode); };
      const sb = pauseOv.querySelector("#bgSoundT"); const updS = function () { sb.textContent = "Sound: " + (BA && BA.muted ? "Off" : "On"); }; updS();
      sb.onclick = function () { if (BA) { BA.unlock(); BA.toggleMute(); } updS(); };
      pauseOv.querySelector("#bgHomeB").onclick = function () { try { g.parent && g.parent.postMessage("nav:exit", "*"); } catch (e) {} };
    }
    function updateChrome() {
      if (ctrl.demo || bgPendingDiff != null) {              // 7I: no chrome in the demo / while a ?diff link waits
        if (pauseBtn) pauseBtn.style.display = "none";
        if (contBtn) contBtn.style.display = "none";
        return;
      }
      if (pauseBtn) pauseBtn.style.display = (ctrl.state === "play" && !ctrl.paused) ? "block" : "none";
      if (contBtn) contBtn.style.display = (ctrl.state === "title" && ctrl._hasSave) ? "block" : "none";
    }

    // ----- frame loop -----
    function frame() {
      ctrl.t += 1 / 60;
      if (!ctrl.paused && ctrl.aiPending > 0 && --ctrl.aiPending === 0) aiStep();
      updateChrome();
      if (ctx && ctrl.state !== "title") {
        ctx.clearRect(0, 0, ctrl.W, ctrl.H);
        const off = (BM && ctrl.fx) ? BM.shakeOffset(ctrl.fx) : { x: 0, y: 0 };
        ctx.save(); ctx.translate(off.x, off.y);
        try { S.draw(ctx, ctrl.G, { W: ctrl.W, H: ctrl.H, t: ctrl.t, fx: ctrl.fx, winner: ctrl.winner, line: ctrl.line, state: ctrl.state }); } catch (e) {}
        ctx.restore();
        if (BM && ctrl.fx) { if (!ctrl.paused) BM.update(ctrl.fx, 1 / 60); BM.draw(ctx, ctrl.fx, { W: ctrl.W, H: ctrl.H }); }
      }
      g.requestAnimationFrame(frame);
    }

    // ----- ONLINE (cross-device via the shared GameLobby; msg prefix "bg") -----
    ctrl.online = false; ctrl.myPlayer = 1;
    function bgPost(type, payload) { try { if (g.parent && g.parent !== g) g.parent.postMessage(payload ? { type: type, payload: payload } : { type: type }, "*"); } catch (e) {} }
    function postMove() {
      const res = S.result(ctrl.G) || {};
      const over = !!res.over;
      const winner = over ? (res.winner === 1 ? "w" : res.winner === 2 ? "b" : "draw") : null;
      const turnColor = ctrl.turn === 1 ? "w" : "b";
      bgPost("bgMove", { state: { G: ctrl.G, turn: turnColor }, turn: turnColor, lastMove: null, over: over, winner: winner });
    }
    function onNetMsg(e) {
      const d = e.data || {}; if (!d.type) return;
      if (d.type === "bgInit") {
        ctrl.online = true; ctrl.mode = "two";
        ctrl.myPlayer = (d.myColor === "b") ? 2 : 1;
        const st = d.state || {};
        ctrl.G = st.G ? st.G : S.init({ mode: "two", rng: ctrl.rnd });
        ctrl.turn = (st.turn === "b") ? 2 : 1;
        ctrl.winner = null; ctrl.line = null; ctrl.state = "play";
        ctrl.fx = BM ? BM.makeFx() : null;
        if (D.start) D.start.style.display = "none";
        if (D.banner) D.banner.classList.remove("show");
        navUpdate();
      } else if (d.type === "bgOpponentMove") {
        const p = d.payload || {}, st2 = p.state || {};
        if (st2.G) ctrl.G = st2.G;
        ctrl.turn = (st2.turn === "b") ? 2 : 1;
        const res2 = S.result(ctrl.G) || {};
        if (res2.over) { ctrl.state = "over"; ctrl.winner = res2.winner; ctrl.line = res2.line || null; showBanner(res2); }
        else ctrl.state = "play";
      }
    }
    function startOnlineIfRequested() {
      let online = false;
      try { online = new URLSearchParams(location.search).get("online") === "1"; } catch (e) {}
      if (!online) return;
      ctrl.online = true; ctrl.mode = "two";
      if (D.start) D.start.style.display = "none";
      g.addEventListener("message", onNetMsg);
      bgPost("bgReady");
    }

    // ----- boot (only with a real canvas) -----
    if (hasDoc && D.cv && ctx) {
      fit(); g.addEventListener("resize", fit);
      D.cv.addEventListener("pointerdown", humanTap);
      if (D.again) D.again.onclick = () => startGame(ctrl.mode);
      if (D.home) D.home.onclick = () => { try { g.parent && g.parent.postMessage("nav:exit", "*"); } catch (e) {} };  // standalone Home (hidden in-app by gamenav)
      if (D.mute) { const upd = () => D.mute.textContent = "Sound: " + (BA && BA.muted ? "Off" : "On"); upd(); D.mute.onclick = () => { if (BA) { BA.unlock(); BA.toggleMute(); } upd(); navUpdate(); }; }
      injectChrome();
      toMenu();
      startOnlineIfRequested();
      // Session 7B: if a manifest exists for this game, its opponent TIERS drive the
      // start-screen choices (the shell reads loadout/themes). FULL fallback: no loader,
      // no manifest, or an invalid one -> the engine keeps its built-in choices, unchanged.
      if (g.BuildableManifest && S.id && typeof g.BuildableManifest.load === "function" && typeof S.applyManifestTiers === "function") {
        try { g.BuildableManifest.load(S.id, function (cfg) {
          try { if (cfg && Array.isArray(cfg.tiers) && cfg.tiers.length) { S.applyManifestTiers(cfg); if (ctrl.state === "title" && !ctrl.online) toMenu(); } } catch (e) {}
          bgFlushPendingDiff();                              // 7I: a waiting ?diff deep-link starts now, on the fresh tiers
        }, function () { bgFlushPendingDiff(); }); } catch (e) {}
      }
      // Adopt the shared in-game nav (buildable-gamenav.js): in-app, hide our own
      // Home/Sound/Pause and let the React shell (GameFrame) draw ONE consistent set.
      if (g.BuildableGameNav) { g.BuildableGameNav.register({
        hide: ["home", "mute", "bgPauseBtn"],
        onSound: function () { if (BA) { BA.unlock(); BA.toggleMute(); } if (D.mute) D.mute.textContent = "Sound: " + (BA && BA.muted ? "Off" : "On"); navUpdate(); },
        onMenu: function () { toMenu(); },                 // shell "Menu" -> back to the start screen (auto-saved)
        soundOn: function () { return !(BA && BA.muted); },
        inGame: function () { return ctrl.state === "play"; },
      }); }
      // =====================================================================
      // Session 7I (additive) — two shell-facing URL params. With NEITHER
      // param present none of this runs; behavior is unchanged (replace-first).
      //   ?diff=N       skip the menu, start a SOLO game at tier N (0-based
      //                 index into the manifest "levels" order — the same list
      //                 the start screen shows). Out-of-range N is clamped.
      //                 The manifest loads async, so the start is deferred
      //                 until it applies (Breaker's bkPendingPlay pattern,
      //                 ~1.6s safety timeout).
      //   ?screen=demo  silent attract mode for the landing demo box: the
      //                 computer plays BOTH sides forever, no audio, no win
      //                 dialogs, all input ignored; the shared tutorial hand
      //                 glides to each move first so the demo teaches the tap.
      // =====================================================================
      var bgPendingDiff = null;
      function bgStartDiff(n) {
        const ch = S.choices || [];
        const i = Math.max(0, Math.min(ch.length ? ch.length - 1 : 0, n | 0));
        try { if (ch[i] && S.applyChoice) S.applyChoice(ch[i].value); } catch (e) {}
        startGame("solo");
      }
      function bgFlushPendingDiff() { if (bgPendingDiff == null) return; const n = bgPendingDiff; bgPendingDiff = null; bgStartDiff(n); }
      var demoHandEl = null;
      function demoHandMake() {
        if (demoHandEl || !document.body) return;
        demoHandEl = document.createElement("img");
        demoHandEl.src = "/tutorial-hand.png"; demoHandEl.alt = "";
        demoHandEl.style.cssText = "position:fixed;height:76px;width:auto;left:50%;top:62%;z-index:60;pointer-events:none;" +
          "transition:left .55s ease,top .55s ease,transform .15s ease;transform-origin:22% 12%;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))";
        document.body.appendChild(demoHandEl);
      }
      function demoHandTo(x, y, press) {   // logical canvas coords -> page px; CSS transition = glide, never a teleport
        if (!demoHandEl || !D.cv) return;
        try {
          const r = D.cv.getBoundingClientRect();
          demoHandEl.style.left = (r.left + x * (r.width / ctrl.W) - 12) + "px";
          demoHandEl.style.top = (r.top + y * (r.height / ctrl.H) - 8) + "px";
          demoHandEl.style.transform = press ? "scale(.82)" : "scale(1)";
        } catch (e) {}
      }
      function demoLoop() {
        if (!ctrl.demo) return;
        if (ctrl.state === "over") {       // quiet restart -> loop forever
          setTimeout(function () { if (ctrl.demo) { startGame(ctrl.mode); setTimeout(demoLoop, 700); } }, 1200);
          return;
        }
        if (ctrl.state !== "play") { setTimeout(demoLoop, 700); return; }
        let plan = null;
        try { plan = (typeof S.demoMove === "function") ? S.demoMove(ctrl.G, api()) : null; } catch (e) { plan = null; }
        if (!plan || plan.token == null) { // no planner -> move directly (still silent)
          try { applyOutcome(S.ai(ctrl.G, api())); } catch (e) {}
          setTimeout(demoLoop, 1250); return;
        }
        demoHandTo(plan.x, plan.y, false);                                       // hover the move first...
        setTimeout(function () { if (ctrl.demo && ctrl.state === "play") demoHandTo(plan.x, plan.y, true); }, 620);   // ...small press dip...
        setTimeout(function () {                                                 // ...then the move lands
          if (!ctrl.demo || ctrl.state !== "play") return;
          try { applyOutcome(S.move ? S.move(ctrl.G, plan.token, api()) : S.ai(ctrl.G, api())); } catch (e) {}
          demoHandTo(plan.x, plan.y, false);
        }, 800);
        setTimeout(demoLoop, 1400);
      }
      var bgQ = null; try { bgQ = new URLSearchParams(location.search); } catch (e) {}
      var bgDiffP = bgQ ? bgQ.get("diff") : null;
      if (bgQ && bgQ.get("screen") === "demo" && !ctrl.online) {
        ctrl.demo = true;                  // "two" mode keeps the built-in solo bot queue off; demoLoop moves BOTH sides
        if (D.home) D.home.style.display = "none";
        if (D.mute) D.mute.style.display = "none";
        demoHandMake();
        startGame("two");
        setTimeout(demoLoop, 900);
      } else if (!ctrl.online && bgDiffP != null && bgDiffP !== "" && !isNaN(+bgDiffP)) {
        if (D.start) D.start.style.display = "none";                 // a deep link never flashes the menu
        if (g.BuildableManifest && S.id && typeof g.BuildableManifest.load === "function" && typeof S.applyManifestTiers === "function") {
          bgPendingDiff = +bgDiffP;        // defer until the manifest tiers apply; safety timeout below
          setTimeout(function () { bgFlushPendingDiff(); }, 1600);
        } else {
          bgStartDiff(+bgDiffP);
        }
      }
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
