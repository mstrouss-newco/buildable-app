// ============================================================================
//  Buildable Start Screen — shared, reusable "start a game" experience.
//  The fourth shared engine lib, alongside:
//    buildable-renders.js (BR) · buildable-audio.js (BA) · buildable-mechanics.js (BM)
//
//  WHAT THIS IS: one consistent launch / level-select screen for EVERY game
//  (survival, croc, breaker, platformer, tennis). Each engine used to hand-roll its
//  own menu (#menu/#levelSelect/showMenu/buildLevelPicker) with a different look.
//  Edit THIS one file and every game's start screen changes at once. NOTE: this is
//  the start screen of a *built* game — it is NOT the AI game builder.
//
//  Mounts a child <div class="bss"> INTO a positioned, full-size container you give
//  it (so it never fights the host's show/hide or overlay classes). Self-styled (one
//  scoped stylesheet), self-iconed (inline SVG, no emoji/webfont). Headless-safe: with
//  no document (QA sim) mount() is a no-op stub.
//
//  Usage:  <script src="buildable-startscreen.js"></script>  then  BS = window.BuildableStartScreen
//    const screen = BS.mount(document.getElementById("menu"), {
//      title:"Space Sparkles", subtitle:"Beat each boss to unlock the next world",
//      coins:24, sound:true, showBack:true,
//      hero:{ name:"Pip", img:"<url>", progressText:"2 of 6 worlds cleared" },  // omit if no hero
//      modes:["solo","two","family"], mode:"solo",                              // omit if single-player
//      levels:[
//        { n:1, name:"Comet Meadow", img:"<thumb>", color:"#1f6f5c", stars:3, maxStars:3, state:"done" },
//        { n:2, name:"Asteroid Twirl", color:"#2b4a6b", state:"next" },         // green Play highlight
//        { n:3, name:"Stardust Caves", state:"locked" },
//      ],
//      customizeLabel:"Make it mine",                                           // omit to hide
//    }, { onPlay:(n)=>{}, onMode:(m)=>{}, onHero:()=>{}, onCustomize:()=>{}, onSound:(on)=>{}, onBack:()=>{} });
//    // later: screen.update({ coins:30, levels:[...] });   screen.destroy();
//
//  level.state: "done" (shows stars, or "Cleared" if no stars given) | "next"
//  (the playable one — green Play) | "locked" (dimmed + lock badge). Thumbnail =
//  img, else a solid color, else a drawn icon. The "family" mode is where the
//  real-time multiplayer mechanic plugs in (launch FamilyRealtime — see MULTIPLAYER.md).
// ============================================================================
(function (g) {
  const BS = { version: "1.1.0" };

  const THEME = {
    bg: "#131229", card: "#1d1b36", cardLocked: "#191830",
    accent: "#7C5CFC", go: "#7CF6B0", gold: "#F5D976",
    text: "#ffffff", dim: "#9b95c4", dimmer: "#56527a", border: "rgba(255,255,255,.08)",
  };

  const ICON = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    star: '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3.4 1.1-6.5L2.6 9.8l6.5-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    change: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16"/><path d="M4 20v-4h4"/>',
    solo: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
    two: '<circle cx="8" cy="9" r="2.8"/><circle cx="16" cy="9" r="2.8"/><path d="M3 19c0-2.8 2.2-4.6 5-4.6S13 16.2 13 19"/><path d="M13 19c0-2.8 2.2-4.6 5-4.6 1 0 1.9.2 2.7.6"/>',
    family: '<path d="M12 21s-7-4.5-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 3.7C19 16.5 12 21 12 21z"/>',
    p2: '<circle cx="8" cy="9" r="2.8"/><circle cx="16" cy="9" r="2.8"/><path d="M3 19c0-2.8 2.2-4.6 5-4.6S13 16.2 13 19"/><path d="M13 19c0-2.8 2.2-4.6 5-4.6 1 0 1.9.2 2.7.6"/>',
    p3: '<circle cx="8" cy="9" r="2.8"/><circle cx="16" cy="9" r="2.8"/><path d="M3 19c0-2.8 2.2-4.6 5-4.6S13 16.2 13 19"/><path d="M13 19c0-2.8 2.2-4.6 5-4.6 1 0 1.9.2 2.7.6"/>',
    p4: '<circle cx="8" cy="9" r="2.8"/><circle cx="16" cy="9" r="2.8"/><path d="M3 19c0-2.8 2.2-4.6 5-4.6S13 16.2 13 19"/><path d="M13 19c0-2.8 2.2-4.6 5-4.6 1 0 1.9.2 2.7.6"/>',

    wand: '<path d="M15 4l5 5"/><path d="M4 20L16 8"/><path d="M14 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
    sound: '<path d="M5 9v6h4l5 4V5L9 9z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
    mute: '<path d="M5 9v6h4l5 4V5L9 9z"/><path d="M22 9l-6 6M16 9l6 6"/>',
  };
  function svg(name, size, stroke, fill) {
    const s = size || 22;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill || "none"}" stroke="${stroke || "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;
  }

  const MODE_LABEL = { solo: "Solo", two: "Same device", family: "Play a friend", p2: "Same device", p3: "3 players", p4: "4 players" };

  let styleInjected = false;
  function injectStyle(doc) {
    if (styleInjected) return; styleInjected = true;
    const css = `
.bss{position:absolute;inset:0;overflow:auto;display:flex;justify-content:center;background:var(--bss-bg);font-family:'Nunito',system-ui,sans-serif;color:var(--bss-text);-webkit-tap-highlight-color:transparent;z-index:1}
.bss *{box-sizing:border-box}
.bss-inner{width:100%;max-width:420px;padding:18px 16px 28px}
/* GN4 - when the shell floats its five-tab bottom bar over this game (which it
   does only while the engine reports it is NOT playing, i.e. exactly when this
   picker is up), buildable-gamenav.js publishes the bar's height as
   --bk-nav-bottombar and marks the page .bk-barup. Pad the last level card
   clear of it. The variable is 0px whenever the bar is down and unset when the
   game is opened standalone, so nothing else changes. */
.bss-inner{padding-bottom:calc(28px + var(--bk-nav-bottombar, 0px))}
.bss-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.bss-ic{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;border:none}
.bss-coins{display:flex;align-items:center;gap:5px;background:rgba(245,217,118,.16);color:var(--bss-gold);font-size:13px;font-weight:800;padding:6px 12px;border-radius:999px}
.bss-head{text-align:center;margin-bottom:14px}
.bss-title{font-size:24px;font-weight:900}
.bss-sub{color:var(--bss-dim);font-size:12.5px;margin-top:2px}
.bss-hero{display:flex;align-items:center;gap:12px;background:var(--bss-card);border:1px solid var(--bss-border);border-radius:15px;padding:10px 12px;margin-bottom:13px}
.bss-av{width:46px;height:46px;border-radius:50%;background:#3b2f6e;color:#cdbcff;display:flex;align-items:center;justify-content:center;flex:0 0 auto;overflow:hidden}
.bss-av img{width:100%;height:100%;object-fit:cover}
.bss-hname{font-size:15px;font-weight:800}
.bss-hsub{color:var(--bss-dim);font-size:12px}
.bss-change{margin-left:auto;display:flex;align-items:center;gap:5px;color:#cdbcff;font-size:12.5px;font-weight:800;background:rgba(124,92,252,.2);padding:7px 13px;border-radius:999px;cursor:pointer;border:none}
.bss-modes{display:flex;gap:6px;background:var(--bss-card);border-radius:13px;padding:5px;margin-bottom:16px}
.bss-mode{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;font-size:13px;color:var(--bss-dim);padding:8px 0;border-radius:10px;cursor:pointer;font-weight:700}
.bss-mode.on{color:#16142b;background:var(--bss-gold);font-weight:800}
.bss-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.bss-lv{background:var(--bss-card);border:1px solid var(--bss-border);border-radius:14px;overflow:hidden;cursor:pointer}
.bss-lv.locked{background:var(--bss-cardLocked);border-color:rgba(255,255,255,.05);opacity:.7;cursor:default}
.bss-lv.next{border:2px solid var(--bss-go)}
.bss-thumb{height:60px;display:flex;align-items:center;justify-content:center;position:relative;color:#bfe0ff;background:#2b4a6b;background-size:cover;background-position:center}
.bss-badge{position:absolute;bottom:6px;right:7px;display:flex;align-items:center;gap:3px;background:var(--bss-go);color:#0c3a24;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px}
.bss-lk{position:absolute;top:6px;right:7px;color:#8a85ad}
.bss-meta{padding:8px 10px 10px}
.bss-ln{font-size:12.5px;font-weight:800}
.bss-lv.locked .bss-ln{color:var(--bss-dim)}
.bss-stars{margin-top:3px;display:flex;gap:1px;align-items:center}
.bss-note{margin-top:3px;font-size:12px;color:var(--bss-dimmer)}
.bss-note.go{color:var(--bss-go)}
.bss-cust{margin-top:15px;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--bss-card);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:11px;color:#cdbcff;font-size:13.5px;font-weight:800;cursor:pointer}
`;
    const st = doc.createElement("style"); st.id = "bss-style"; st.textContent = css;
    (doc.head || doc.documentElement).appendChild(st);
  }

  function starRow(stars, maxStars) {
    const max = maxStars || 3; let h = "";
    for (let i = 0; i < max; i++) {
      const on = i < (stars || 0);
      h += `<span style="display:inline-flex">${svg("star", 14, on ? THEME.gold : THEME.dimmer, on ? THEME.gold : "none")}</span>`;
    }
    return h;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function levelCard(lv) {
    const state = lv.state || "locked";
    const cls = state === "locked" ? "bss-lv locked" : ((state === "next" || state === "ready") ? "bss-lv next" : "bss-lv");
    let thumbBg = "";
    if (lv.img) thumbBg = `background-image:url('${lv.img}')`;
    else if (state === "locked") thumbBg = "background:#221f3c;color:#6f6a93";
    else if (lv.color) thumbBg = `background:${lv.color}`;
    let overlay = "";
    if (state === "next" || state === "ready") overlay = `<span class="bss-badge">${svg("play", 12, "#0c3a24", "#0c3a24")}Play</span>`;
    else if (state === "locked") overlay = `<span class="bss-lk">${svg("lock", 15)}</span>`;
    let foot;
    if (state === "locked") foot = `<div class="bss-note">Locked</div>`;
    else if (state === "next") foot = `<div class="bss-note go">Next up</div>`;
    else if (state === "ready") foot = lv.foot ? `<div class="bss-note">${lv.foot}</div>` : `<div class="bss-note"></div>`;
    else foot = `<div class="bss-note">Cleared</div>`;
    const icon = state === "locked" ? svg("lock", 25, "#6f6a93") : "";
    return `<div class="${cls}" data-n="${lv.n}" role="button" tabindex="0">
      <div class="bss-thumb" style="${thumbBg}">${lv.img ? "" : icon}${overlay}</div>
      <div class="bss-meta"><div class="bss-ln">${lv.n} · ${esc(lv.name || "")}</div>${foot}</div>
    </div>`;
  }

  function render(root, cfg) {
    const modes = cfg.modes || [];
    const modesHtml = modes.map((m) =>
      `<div class="bss-mode ${m === cfg.mode ? "on" : ""}" data-mode="${m}">${svg(m, 17)}${MODE_LABEL[m] || m}</div>`).join("");
    const heroHtml = cfg.hero ? `
      <div class="bss-hero">
        <span class="bss-av">${cfg.hero.img ? `<img src="${cfg.hero.img}" alt="">` : svg("solo", 26, "#cdbcff")}</span>
        <div><div class="bss-hname">${esc(cfg.hero.name || "Your hero")}</div><div class="bss-hsub">${esc(cfg.hero.progressText || "")}</div></div>
        <button class="bss-change" data-act="hero">${svg("change", 15)}Change</button>
      </div>` : "";
    const soundIc = cfg.sound === false ? "mute" : "sound";
    const backHtml = cfg.showBack === false
      ? `<span class="bss-ic" style="visibility:hidden"></span>`
      : `<button class="bss-ic" data-act="back" aria-label="Back">${svg("back", 18)}</button>`;
    root.innerHTML = `
      <div class="bss-inner">
        <div class="bss-top">
          ${backHtml}
          <div style="display:flex;align-items:center;gap:8px">
            ${cfg.coins != null ? `<span class="bss-coins">${svg("star", 14, THEME.gold, THEME.gold)}${cfg.coins}</span>` : ""}
            ${cfg.hideSound ? "" : `<button class="bss-ic" data-act="sound" aria-label="Sound">${svg(soundIc, 18)}</button>`}
          </div>
        </div>
        <div class="bss-head"><div class="bss-title">${esc(cfg.title || "")}</div>${cfg.subtitle ? `<div class="bss-sub">${esc(cfg.subtitle)}</div>` : ""}</div>
        ${heroHtml}
        ${modes.length ? `<div class="bss-modes">${modesHtml}</div>` : ""}
        <div class="bss-grid">${(cfg.levels || []).map(levelCard).join("")}</div>
        ${cfg.customizeLabel ? `<div class="bss-cust" data-act="customize">${svg("wand", 17)}${esc(cfg.customizeLabel)}</div>` : ""}
      </div>`;
  }

  BS.mount = function (el, cfg, cb) {
    cb = cb || {};
    if (typeof document === "undefined" || !el || !el.appendChild) return { update() {}, destroy() {}, el: null }; // headless stub
    injectStyle(document);
    cfg = Object.assign({}, cfg);
    const t = Object.assign({}, THEME, cfg.theme || {});
    const wrap = document.createElement("div");
    wrap.className = "bss";
    const setv = (k, v) => wrap.style.setProperty(k, v);
    setv("--bss-bg", t.bg); setv("--bss-card", t.card); setv("--bss-cardLocked", t.cardLocked);
    setv("--bss-go", t.go); setv("--bss-gold", t.gold); setv("--bss-text", t.text);
    setv("--bss-dim", t.dim); setv("--bss-dimmer", t.dimmer); setv("--bss-border", t.border);
    try { el.innerHTML = ""; } catch (e) {}
    el.appendChild(wrap);

    function paint() { render(wrap, cfg); }
    paint();

    function onClick(e) {
      const act = e.target.closest && e.target.closest("[data-act]");
      if (act) {
        const a = act.getAttribute("data-act");
        if (a === "back" && cb.onBack) cb.onBack();
        else if (a === "hero" && cb.onHero) cb.onHero();
        else if (a === "customize" && cb.onCustomize) cb.onCustomize();
        else if (a === "sound") { cfg.sound = cfg.sound === false ? true : false; paint(); if (cb.onSound) cb.onSound(cfg.sound); }
        return;
      }
      const mode = e.target.closest && e.target.closest("[data-mode]");
      if (mode) { cfg.mode = mode.getAttribute("data-mode"); paint(); if (cb.onMode) cb.onMode(cfg.mode); return; }
      const lv = e.target.closest && e.target.closest(".bss-lv");
      if (lv && !lv.classList.contains("locked")) { const n = +lv.getAttribute("data-n"); if (cb.onPlay) cb.onPlay(n); }
    }
    wrap.addEventListener("click", onClick);

    return {
      el: wrap,
      update(patch) { Object.assign(cfg, patch || {}); paint(); },
      destroy() { try { wrap.removeEventListener("click", onClick); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) {} },
    };
  };

  g.BuildableStartScreen = BS;
  if (typeof module !== "undefined" && module.exports) module.exports = BS;
})(typeof window !== "undefined" ? window : globalThis);
