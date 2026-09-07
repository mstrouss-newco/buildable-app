// ============================================================================
//  Buildable Game HUD — the shell-owned, shared info bar for ALL games.
//  ONE file controls the look of the little tinted panels (title, lives, score,
//  timer, counters, coin wallet, whose turn it is).
//
//  SESSION HD1 — VERSION 3. Two things changed and they are the whole point:
//
//   1. ONE DARK GLASS. A chip wears exactly what a shell button wears —
//      rgba(18,18,38,0.55), a 1px rgba(255,255,255,0.25) outline, white text,
//      blur — tinted per game by the manifest accent (BuildableHUD.setAccent).
//      The cream and white variants are retired: they vanished on pale games.
//   2. FOUR LAYOUTS, because a world game with five counters never fitted the
//      action bar and so hand-rolled its own chips, which then collided with the
//      shell's Home pill and Sound button:
//
//        action    name left; score / hearts / timer right      (Breaker)
//        world     up to 5 counters + a coin wallet             (the Farm)
//        board     one centred turn chip with a player dot      (tic-tac-toe)
//        practice  progress chip left, timer or streak right
//
//  SIZE TIERS match the shell exactly: phone under 600px, tablet 600-1024,
//  computer over 1024. In-app the tier and the band come from the shell through
//  buildable-gamenav.js (--bk-tier, --bk-band-h, --bk-nav-left, --bk-nav-right);
//  standalone they come from the window width. Nothing this file draws may enter
//  the rectangles the shell reserves, so every layout insets from those two
//  variables. On a phone the `world` strip drops to a second row directly under
//  the band — never to the bottom of the screen.
//
//  GEOMETRY IS MIRRORED FROM BK_BAND in src/BuildableKids.jsx and BAND in
//  public/buildable-gamenav.js. scripts/qa-hud-all.mjs measures all three.
//
//  A game uses it in two lines:
//     const hud = BuildableHUD.mount(document.getElementById('c'));            // action
//     hud.set({ left:[{text:"Level 1/6"}], right:[{text:"Bricks left: 12"},{hearts:3}] });
//
//     const hud = BuildableHUD.mount(canvas, { layout:'world' });
//     hud.set({ counters:[{icon:'<svg…>', text:'3'}], coins:50 });
//
//     const hud = BuildableHUD.mount(canvas, { layout:'board' });
//     hud.set({ turn:"Your turn", color:"#2FB7D6" });
//
//     const hud = BuildableHUD.mount(canvas, { layout:'practice' });
//     hud.set({ progress:{text:"4 of 10"}, timer:{text:"0:42"} });
//
//  Each chip is a plain object:
//     { text:"Score 40" }                -> one tinted panel
//     { text:"Sunny", soft:"Level 1/6" } -> main text + lighter secondary text
//     { hearts:3 }                        -> a row of 3 hearts (drawn art, no emoji)
//     { coin:"6 / 98" }                   -> a gold coin followed by the count
//     { stars:{ got:1, of:3 } }           -> a row of stars, the earned ones filled
//     { icon:"<svg…>", text:"3" }         -> a counter: the GAME'S OWN art + a number
//
//  A counter's `icon` is either an inline <svg…> string or an image URL. It is
//  never an emoji — no emojis anywhere in this product.
// ============================================================================
(function (g) {
  // The one size table. Mirrored in src/BuildableKids.jsx (BK_BAND) and in
  // public/buildable-gamenav.js (BAND). Move a number and you must move all three.
  var TIERS = {
    phone:    { band: 52, pad: 12, gap: 8,  font: 12.5, padY: 6, padX: 10, icon: 16, heart: 13 },
    tablet:   { band: 60, pad: 14, gap: 10, font: 15,   padY: 8, padX: 14, icon: 19, heart: 15 },
    computer: { band: 68, pad: 16, gap: 12, font: 17,   padY: 9, padX: 16, icon: 22, heart: 17 }
  };
  function tierFromWidth(w) { return w < 600 ? "phone" : (w <= 1024 ? "tablet" : "computer"); }

  var STYLE = [
'/* SHARED GAME HUD LOOK (HD1 v3) — one dark glass, four layouts, three tiers. */',
':root{',
'  --hud-glass:  rgba(18,18,38,0.55); /* the ONE dark glass, same as a shell button */',
'  --hud-radius: 999px;               /* corner roundness. 999px = pill */',
'  --hud-text:   #ffffff;             /* text color inside the panels */',
'  --hud-font:   \'Baloo 2\', system-ui, sans-serif;',
'  --hud-accent:      #ffffff;                /* the game\'s signature color (from its manifest) */',
'  --hud-accent-soft: rgba(255,255,255,0.25); /* the chip outline; default = the shell\'s own */',
'}',
'.hud-host{position:fixed;pointer-events:none;z-index:5;}',
'.hud{position:absolute;top:0;left:var(--hud-left,12px);right:var(--hud-right,12px);',
'  height:var(--hud-band,52px);display:flex;align-items:center;justify-content:space-between;',
'  gap:var(--hud-gap,10px);z-index:5;pointer-events:none;box-sizing:border-box;}',
'.hud-group{display:flex;align-items:center;gap:var(--hud-gap,10px);min-width:0;}',
'.hud-group:first-child{overflow:hidden;}',
'.hud-chip{display:inline-flex;align-items:center;gap:8px;color:var(--hud-text);',
'  font-family:var(--hud-font);white-space:nowrap;',
'  font-weight:700;font-size:var(--hud-font-size,15px);line-height:1;',
'  padding:var(--hud-pad-y,8px) var(--hud-pad-x,14px);border-radius:var(--hud-radius);',
'  background:var(--hud-glass);border:1px solid var(--hud-accent-soft);',
'  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
'  box-shadow:0 3px 12px rgba(0,0,0,0.3);text-shadow:0 1px 3px rgba(0,0,0,0.5);}',
'.hud-chip .hud-soft{font-weight:600;opacity:0.92;}',
'.hud-hearts{display:inline-flex;gap:5px;}',
'.hud-heart{width:var(--hud-heart,15px);height:var(--hud-heart,15px);display:inline-block;}',
'.hud-coin{width:var(--hud-icon,19px);height:var(--hud-icon,19px);display:inline-block;margin-right:-2px;}',
'.hud-stars{display:inline-flex;gap:4px;}',
'.hud-star{width:var(--hud-heart,15px);height:var(--hud-heart,15px);display:inline-block;}',
'/* a counter icon is the GAME\'S OWN art: an inline svg or an image, never an emoji */',
'.hud-ico{width:var(--hud-icon,19px);height:var(--hud-icon,19px);display:inline-flex;',
'  align-items:center;justify-content:center;flex:0 0 auto;}',
'.hud-ico svg,.hud-ico img{width:100%;height:100%;display:block;object-fit:contain;}',
'/* board: one centred turn chip with a dot in the player\'s color */',
'.hud-board{justify-content:center;}',
'.hud-dot{width:var(--hud-heart,15px);height:var(--hud-heart,15px);border-radius:50%;',
'  display:inline-block;flex:0 0 auto;box-shadow:0 0 0 2px rgba(255,255,255,0.35) inset;}',
'/* world: a strip of counters and the coin wallet, inside the band */',
'.hud-world .hud-strip{display:flex;align-items:center;gap:var(--hud-gap,10px);min-width:0;}',
'/* world on a PHONE: the strip drops to a second row DIRECTLY UNDER the band,',
'   full width, smaller chips. Never the bottom of the screen. */',
'.hud-world.hud-row2{top:var(--hud-band,52px);height:auto;left:var(--hud-pad,12px);',
'  right:var(--hud-pad,12px);justify-content:center;padding-top:6px;}',
'.hud-world.hud-row2 .hud-strip{flex-wrap:nowrap;overflow:hidden;}'
  ].join('\n');

  function injectFont() {
    if (g.document.getElementById('buildable-hud-font')) return;
    var l = g.document.createElement('link');
    l.id = 'buildable-hud-font';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&display=swap';
    g.document.head.appendChild(l);
  }

  function injectStyle() {
    if (g.document.getElementById('buildable-hud-style')) return;
    injectFont();
    var s = g.document.createElement('style');
    s.id = 'buildable-hud-style';
    s.textContent = STYLE;
    g.document.head.appendChild(s);
  }

  function iframed() { try { return g.parent && g.parent !== g; } catch (e) { return true; } }
  function cssVar(name) {
    try { return g.getComputedStyle(g.document.documentElement).getPropertyValue(name).trim(); }
    catch (e) { return ''; }
  }
  function num(v, dflt) { var n = parseFloat(v); return isNaN(n) ? dflt : n; }

  // What size are we, and how much of the top does the shell own? In-app both come
  // from the shell through buildable-gamenav.js; standalone from the window width.
  function metrics() {
    var t = cssVar('--bk-tier');
    if (!TIERS[t]) t = tierFromWidth(g.innerWidth || 1440);
    var T = TIERS[t];
    var inShell = iframed();
    return {
      tier: t, T: T,
      band: inShell ? num(cssVar('--bk-band-h'), T.band) : T.band,
      left: inShell ? num(cssVar('--bk-nav-left'), T.pad) : T.pad,
      right: inShell ? num(cssVar('--bk-nav-right'), T.pad) : T.pad,
      inShell: inShell
    };
  }

  // a small heart drawn as art (an inline SVG), so we never rely on an emoji glyph
  function heartSVG() {
    return '<svg class="hud-heart" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#ff5c8a" d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"/></svg>';
  }

  function coinSVG() {
    return '<svg class="hud-coin" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" fill="#e0a520"/>' +
      '<circle cx="12" cy="12" r="8" fill="#ffd23f"/>' +
      '<ellipse cx="9" cy="8.5" rx="2.6" ry="1.7" fill="#fff6c8" opacity="0.85" transform="rotate(-30 9 8.5)"/>' +
      '</svg>';
  }
  function starSVG(filled) {
    var pts = '12,2.6 14.6,9.2 21.6,9.6 16.2,14.1 18,20.9 12,17.1 6,20.9 7.8,14.1 2.4,9.6 9.4,9.2';
    return '<svg class="hud-star" viewBox="0 0 24 24" aria-hidden="true"><polygon points="' + pts + '" fill="' +
      (filled ? '#ffd23f' : 'rgba(255,255,255,0.28)') + '"/></svg>';
  }
  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // A counter icon is the game's own art. Two shapes are allowed and nothing else:
  // an inline <svg> string the engine drew, or a URL to an image it already ships.
  function iconHTML(icon) {
    if (!icon) return '';
    var s = String(icon).trim();
    if (/^<svg[\s>]/i.test(s)) return '<span class="hud-ico" aria-hidden="true">' + s + '</span>';
    return '<span class="hud-ico" aria-hidden="true"><img src="' + esc(s) + '" alt=""></span>';
  }

  function chipHTML(item) {
    if (item == null) return '';
    if (typeof item === 'string') item = { text: item };
    if (typeof item.hearts === 'number') {
      var hs = '';
      for (var i = 0; i < item.hearts; i++) hs += heartSVG();
      return '<div class="hud-chip"><span class="hud-hearts">' + hs + '</span></div>';
    }
    var inner = '';
    if (item.dot) inner += '<span class="hud-dot" style="background:' + esc(item.dot) + '"></span>';
    if (item.icon) inner += iconHTML(item.icon);
    if (item.coin != null) inner += coinSVG() + ' ' + esc(item.coin);
    if (item.text != null && item.text !== '') inner += (inner ? ' ' : '') + esc(item.text);
    if (item.soft != null && item.soft !== '') {
      inner += ' <span class="hud-soft">' + esc(item.soft) + '</span>';
    }
    if (item.stars && typeof item.stars.of === 'number') {
      var ss = '';
      for (var j = 0; j < item.stars.of; j++) ss += starSVG(j < (item.stars.got || 0));
      inner += (inner ? ' ' : '') + '<span class="hud-stars">' + ss + '</span>';
    }
    if (typeof item.heart === 'number') {   // compact lives: one heart + a count
      inner += ' <span class="hud-hearts">' + heartSVG() + '</span><span class="hud-soft" style="margin-left:3px">' + item.heart + '</span>';
    }
    // the wallet chip is named, so a QA harness (and a coin-burst animation) can
    // find the number a game used to keep in a pill of its own
    var cls = 'hud-chip' + (item.coin != null ? ' hud-chip-coin' : '');
    return '<div class="' + cls + '">' + inner + '</div>';
  }

  function groupHTML(list) {
    if (!list || !list.length) return '<div class="hud-group"></div>';
    return '<div class="hud-group">' + list.map(chipHTML).join('') + '</div>';
  }

  // --------------------------------------------------------------------------
  //  THE FOUR LAYOUTS. Each turns the game's spec into the same chips.
  // --------------------------------------------------------------------------
  var LAYOUTS = {
    // name left; score, hearts, timer right. Today's behavior, unchanged.
    action: function (spec) { return groupHTML(spec.left) + groupHTML(spec.right); },

    // up to 5 counters plus a coin wallet chip. On a phone the whole strip is the
    // second row (the bar sets .hud-row2), so the markup is the same either way.
    world: function (spec) {
      var cs = (spec.counters || []).slice(0, 5).map(function (c) {
        if (typeof c === 'string') c = { text: c };
        return { icon: c.icon, text: c.text, soft: c.soft };
      });
      var wallet = (spec.coins == null) ? [] : [{ coin: String(spec.coins) }];
      return '<div class="hud-strip">' + cs.map(chipHTML).join('') + '</div>' +
             '<div class="hud-group">' + wallet.map(chipHTML).join('') + '</div>';
    },

    // one centred turn chip with a small dot in the player's color
    board: function (spec) {
      if (!spec.turn) return '';
      return chipHTML({ dot: spec.color || '#ffffff', text: spec.turn });
    },

    // progress chip left, timer or streak chip right
    practice: function (spec) {
      var left = spec.left || (spec.progress ? [spec.progress] : []);
      var r = spec.right || [];
      if (!spec.right) {
        if (spec.timer) r = r.concat([spec.timer]);
        if (spec.streak) r = r.concat([spec.streak]);
      }
      return groupHTML(left) + groupHTML(r);
    }
  };

  // turn a #rrggbb (or #rgb) into an rgba() string at the given alpha
  function hexToRgba(hex, a) {
    if (typeof hex !== 'string') return 'rgba(255,255,255,' + a + ')';
    var h = hex.trim().replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length !== 6) return 'rgba(255,255,255,' + a + ')';
    var n = parseInt(h, 16); if (isNaN(n)) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  var BuildableHUD = {
    version: '3.0.0',
    tiers: TIERS,
    // Tint the whole HUD with the game's signature color (from its manifest `color`).
    // ONE call restyles every chip's outline; falls back to the shell's own neutral
    // outline if it is never called, so an untinted game still wears the one glass.
    setAccent: function (color) {
      injectStyle();
      try {
        var r = g.document.documentElement;
        r.style.setProperty('--hud-accent', color);
        r.style.setProperty('--hud-accent-soft', hexToRgba(color, 0.45));
      } catch (e) {}
    },
    // attach an overlay to `canvas`; returns { set, show, hide, destroy, layout }
    // opts: { layout: 'action' | 'world' | 'board' | 'practice' }
    // Pass canvas = null when the bar belongs to the whole window rather than to
    // a play area (a board game's canvas is a centred square, not the screen).
    mount: function (canvas, opts) {
      injectStyle();
      opts = opts || {};
      var layout = LAYOUTS[opts.layout] ? opts.layout : 'action';
      var host = g.document.createElement('div');
      host.className = 'hud-host';
      var bar = g.document.createElement('div');
      bar.className = 'hud hud-' + layout;
      host.appendChild(bar);
      g.document.body.appendChild(host);

      // Line the overlay up with the play area, and size everything to the tier.
      // NOTHING may enter the rectangles the shell reserves, so the bar's left and
      // right insets come straight from --bk-nav-left / --bk-nav-right.
      function sync() {
        if (canvas) {
          var r = canvas.getBoundingClientRect();
          host.style.left = r.left + 'px';
          host.style.top = r.top + 'px';
          host.style.width = r.width + 'px';
          host.style.height = r.height + 'px';
        } else {
          // No canvas passed: the bar belongs to the WINDOW, not to a play area.
          // A board game's canvas is a centred square, so lining the band up with
          // it would hang the turn chip halfway down the screen.
          host.style.left = '0px'; host.style.top = '0px';
          host.style.width = '100%'; host.style.height = '100%';
        }
        var m = metrics(), T = m.T;
        // world + phone: the strip is a SECOND ROW under the band, at its own
        // smaller size, so five counters and a wallet still fit across 390px.
        var row2 = (layout === 'world' && m.tier === 'phone');
        var S = row2 ? { gap: 6, font: 11.5, padY: 5, padX: 9, icon: 15, heart: 12 } : T;
        bar.classList.toggle('hud-row2', row2);
        // kept for any game stylesheet that still keys off it
        bar.classList.toggle('hud-inshell', m.inShell);
        bar.style.setProperty('--hud-band', m.band + 'px');
        bar.style.setProperty('--hud-pad', T.pad + 'px');
        bar.style.setProperty('--hud-left', (row2 ? T.pad : m.left) + 'px');
        bar.style.setProperty('--hud-right', (row2 ? T.pad : m.right) + 'px');
        bar.style.setProperty('--hud-gap', S.gap + 'px');
        bar.style.setProperty('--hud-font-size', S.font + 'px');
        bar.style.setProperty('--hud-pad-y', S.padY + 'px');
        bar.style.setProperty('--hud-pad-x', S.padX + 'px');
        bar.style.setProperty('--hud-icon', S.icon + 'px');
        bar.style.setProperty('--hud-heart', S.heart + 'px');
        bar.setAttribute('data-hud-tier', m.tier);
      }
      g.addEventListener('resize', sync);
      g.addEventListener('orientationchange', sync);
      // the shell posts its real band through the nav bridge, which re-fires it here
      g.addEventListener('bk:band', sync);
      if (g.ResizeObserver && canvas) {
        try { new g.ResizeObserver(sync).observe(canvas); } catch (e) {}
      }
      sync();

      var lastKey = '';
      var api = {
        layout: layout,
        // set the chips. The shape of `spec` depends on the layout — see the top.
        set: function (spec) {
          spec = spec || {};
          lastSpec = spec;
          var key = layout + '|' + JSON.stringify(spec);
          if (key === lastKey) { sync(); return; }   // no change -> just realign
          lastKey = key;
          bar.innerHTML = LAYOUTS[layout](spec);
          sync();
        },
        show: function () { host.style.display = ''; sync(); },
        hide: function () { host.style.display = 'none'; },
        destroy: function () {
          g.removeEventListener('resize', sync);
          g.removeEventListener('orientationchange', sync);
          g.removeEventListener('bk:band', sync);
          if (host.parentNode) host.parentNode.removeChild(host);
        }
      };
      return api;
    }
  };

  g.BuildableHUD = BuildableHUD;
})(window);
