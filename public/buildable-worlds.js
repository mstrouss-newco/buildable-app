/* buildable-worlds.js — ONE shared way every game loads its Asset Studio art.
 *
 * Every game includes this and calls BuildableWorlds.load(game, onReady). It handles
 * the identical boilerplate: resolve which world is active (?libtheme=/?world= for a
 * private test, else the saved setting), fetch the manifest, and group the pieces by
 * slot and name. The game then just reads pack.slot("bricks") etc. and draws it its
 * own way. Consistent loading; game-specific drawing.
 *
 * A world's pieces are stored at  <game>/<slot>/<world>/<pieceName>  so:
 *   pack.active                    -> the active world name (or null)
 *   pack.worlds                    -> { world: { slots: { slot: {pieces:{name:Image}, list:[{name,img}]} } } }
 *   pack.slot(slotKey [,world])    -> {pieces, list} for that slot (defaults to active world)
 *   pack.piece(slotKey, name [,world])
 *   pack.list(slotKey [,world])    -> [{name,img}]
 *   pack.worldNames() / pack.hasWorld(w)
 */
(function () {
  function qp(n) { try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; } }
  function mkImg(url) { var i = new Image(); try { i.crossOrigin = "anonymous"; } catch (e) {} i.src = url; return i; }

  function load(game, onReady) {
    var pack = {
      game: game, active: null, worlds: {}, ready: false,
      slot: function (k, w) { var wd = this.worlds[w || this.active]; return (wd && wd.slots[k]) || { pieces: {}, list: [] }; },
      piece: function (k, name, w) { return this.slot(k, w).pieces[name]; },
      list: function (k, w) { return this.slot(k, w).list; },
      worldNames: function () { return Object.keys(this.worlds); },
      hasWorld: function (w) { return !!this.worlds[w] && Object.keys(this.worlds[w].slots).length > 0; },
    };
    function finish() { pack.ready = true; if (onReady) try { onReady(pack); } catch (e) {} }

    var test = qp("libtheme") || qp("world");
    fetch("/api/asset-studio?manifest=1&game=" + encodeURIComponent(game))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var rows = (j && j.assets) || [];
        rows.forEach(function (a) {
          var seg = (a.slug || "").split("/"); if (seg.length < 4) return;
          var w = seg[2], slot = seg[1], name = seg.slice(3).join("/");
          var wd = pack.worlds[w] || (pack.worlds[w] = { slots: {} });
          var s = wd.slots[slot] || (wd.slots[slot] = { pieces: {}, list: [] });
          var im = mkImg(a.url); s.pieces[name] = im; s.list.push({ name: name, img: im });
        });
        if (test && pack.worlds[test]) { pack.active = test; finish(); return; }   // test override
        fetch("/api/asset-studio?world=" + encodeURIComponent(game))
          .then(function (r) { return r.json(); })
          .then(function (wj) { if (wj && wj.world && pack.worlds[wj.world]) pack.active = wj.world; finish(); })
          .catch(finish);
      })
      .catch(finish);
    return pack;
  }

  window.BuildableWorlds = { load: load };
})();
