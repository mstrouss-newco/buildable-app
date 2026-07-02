// ============================================================================
//  Buildable Game HUD — the shell-owned, shared info bar for ALL games.
//  ONE file controls the look of the little tinted panels (title, lives, score,
//  timer, "bricks left", etc). The panels are just a dark tint over whatever art
//  is behind them, so the SAME look works on every game no matter its colors.
//
//  To change the LOOK everywhere at once, edit ONLY the four --hud-* knobs in the
//  CSS block below. Every game that loads this file updates automatically.
//
//  A game uses it in two lines:
//     const hud = BuildableHUD.mount(document.getElementById('c'));   // once
//     hud.set({ left:[{text:"Level 1/6"}], right:[{text:"Bricks left: 12"},{hearts:3}] });
//
//  Each chip is a plain object:
//     { text:"Score 40" }                -> one tinted panel
//     { text:"Sunny", soft:"Level 1/6" } -> main text + lighter secondary text
//     { hearts:3 }                        -> a row of 3 hearts (drawn art, no emoji)
//
//  mount() sticks an invisible overlay onto the canvas and keeps it lined up as
//  the window resizes, so the chips always sit on the play area — never drift.
// ============================================================================
(function (g) {
  var STYLE = [
'/* SHARED GAME HUD LOOK — edit only the four knobs to restyle every game. */',
':root{',
'  --hud-dark:   0.55;   /* how dark the panel is. 0.4 = softer, 0.72 = strongest */',
'  --hud-radius: 999px;  /* corner roundness. 999px = pill, 12px = soft rectangle */',
'  --hud-text:   #ffffff;/* text color inside the panels */',
'  --hud-gap:    10px;   /* space between the little panels */',
'}',
'.hud{position:absolute;top:18px;left:20px;right:20px;display:flex;',
'  justify-content:space-between;align-items:flex-start;z-index:5;pointer-events:none;}',
'.hud-group{display:flex;align-items:center;gap:var(--hud-gap);}',
'.hud-chip{display:inline-flex;align-items:center;gap:12px;color:var(--hud-text);',
'  font-weight:700;font-size:15px;line-height:1;padding:9px 16px;border-radius:var(--hud-radius);',
'  background:rgba(8,10,20,var(--hud-dark));border:1px solid rgba(255,255,255,0.18);',
'  -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);',
'  box-shadow:0 3px 12px rgba(0,0,0,0.3);text-shadow:0 1px 3px rgba(0,0,0,0.5);}',
'.hud-chip .hud-soft{font-weight:600;opacity:0.92;}',
'.hud-hearts{display:inline-flex;gap:5px;}',
'.hud-heart{width:15px;height:15px;display:inline-block;}'
  ].join('\n');

  function injectStyle() {
    if (g.document.getElementById('buildable-hud-style')) return;
    var s = g.document.createElement('style');
    s.id = 'buildable-hud-style';
    s.textContent = STYLE;
    g.document.head.appendChild(s);
  }

  // a small heart drawn as art (an inline SVG), so we never rely on an emoji glyph
  function heartSVG() {
    return '<svg class="hud-heart" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#ff5c8a" d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"/></svg>';
  }

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function chipHTML(item) {
    if (item == null) return '';
    if (typeof item === 'string') item = { text: item };
    if (typeof item.hearts === 'number') {
      var hs = '';
      for (var i = 0; i < item.hearts; i++) hs += heartSVG();
      return '<div class="hud-chip"><span class="hud-hearts">' + hs + '</span></div>';
    }
    var inner = esc(item.text != null ? item.text : '');
    if (item.soft != null && item.soft !== '') {
      inner += ' <span class="hud-soft">' + esc(item.soft) + '</span>';
    }
    return '<div class="hud-chip">' + inner + '</div>';
  }

  function groupHTML(list) {
    if (!list || !list.length) return '<div class="hud-group"></div>';
    return '<div class="hud-group">' + list.map(chipHTML).join('') + '</div>';
  }

  var BuildableHUD = {
    version: '1.0.0',
    // attach an overlay to `canvas`; returns { set, show, hide, destroy }
    mount: function (canvas) {
      injectStyle();
      var host = g.document.createElement('div');
      host.style.cssText = 'position:fixed;pointer-events:none;z-index:5;';
      var bar = g.document.createElement('div');
      bar.className = 'hud';
      host.appendChild(bar);
      g.document.body.appendChild(host);

      function sync() {
        if (!canvas) return;
        var r = canvas.getBoundingClientRect();
        host.style.left = r.left + 'px';
        host.style.top = r.top + 'px';
        host.style.width = r.width + 'px';
        host.style.height = r.height + 'px';
      }
      g.addEventListener('resize', sync);
      if (g.ResizeObserver && canvas) {
        try { new g.ResizeObserver(sync).observe(canvas); } catch (e) {}
      }
      sync();

      var lastKey = '';
      var api = {
        // set the chips. `spec` = { left:[...chips], right:[...chips] }
        set: function (spec) {
          spec = spec || {};
          var key = JSON.stringify(spec);
          if (key === lastKey) { sync(); return; }   // no change -> just realign
          lastKey = key;
          bar.innerHTML = groupHTML(spec.left) + groupHTML(spec.right);
          sync();
        },
        show: function () { host.style.display = ''; },
        hide: function () { host.style.display = 'none'; },
        destroy: function () {
          g.removeEventListener('resize', sync);
          if (host.parentNode) host.parentNode.removeChild(host);
        }
      };
      return api;
    }
  };

  g.BuildableHUD = BuildableHUD;
})(window);
