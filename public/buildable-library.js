// ============================================================================
//  buildable-library.js  —  the ONE combined asset library (Session AP1)
//  Exposes window.BuildableLibrary.
//
//  There is one shelf of art, gathered from three homes and tagged the same way:
//    - Studio pieces:  /api/asset-studio?manifest=1   (image_cache kind=studio)
//    - Library packs:  /api/list-assets (layers+sprites) + /api/list-characters
//    - My Kits (KP1):  /kenney/kits/index.json -> each kit's kit.json (static files)
//
//  Every item comes back normalized to:
//    { id, url, name, kind, theme, game, type, source, dim }
//  kind  = character | world | element   (music/sfx flow through their own reads)
//  source= "Studio"  for editor-made art, else the pack or kit name
//  group = "studio" | "kit" | "pack"     (what the source chips filter on)
//
//  Both the editor's Library picker and the Browse page read from here so a thing
//  made anywhere shows up everywhere. Resilient: any failed fetch yields [].
// ============================================================================
(function (root) {
  "use strict";

  function getJSON(u) {
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  var bust = "v=" + Date.now();

  // Map a slot/type name to a shared-library kind (mirrors the server helper).
  function kindFromType(type) {
    var t = String(type || "").toLowerCase();
    if (/bg|background|world|sky|scene|backdrop|court|board|land|field|loading|hero|win/.test(t)) return "world";
    if (/char|hero|player|creature|pet|guy|enemy|boss|piece|avatar|monster|villain|pal|foe|face/.test(t)) return "character";
    return "element";
  }

  function normStudio(j) {
    var rows = (j && j.assets) || [];
    return rows.map(function (x) {
      var parts = String(x.slug || "").split("/");
      var game = x.game || parts[0] || "";
      var type = x.type || parts[1] || "";
      var theme = x.theme || parts[2] || "";
      var name = parts.slice(3).join("/") || type || "piece";
      if (theme === "default" || theme === "custom" || theme === "library") theme = theme === "library" ? "" : theme;
      return {
        id: "studio:" + x.slug,
        url: x.url,
        name: String(name).replace(/_/g, " "),
        kind: x.kind || kindFromType(type),
        theme: theme === "custom" || theme === "default" ? "" : theme,
        game: game,
        type: type,
        source: "Studio",
        group: "studio",
        dim: "2d",
      };
    });
  }

  // ---- My Kits (Session KP1) -------------------------------------------------
  // An "added" kit is plain static files: /kenney/kits/<slug>/kit.json lists its
  // pieces, and index.json lists the added kits. No database, no API. A kit piece
  // is an ordinary shelf item, so assigning one to a slot goes down exactly the
  // same road as a pack asset (the editor's import copies it into the slot).
  function normKit(kit) {
    if (!kit || !kit.slug || !Array.isArray(kit.pieces)) return [];
    var base = "/kenney/kits/" + kit.slug + "/";
    return kit.pieces.filter(function (p) { return p && p.file; }).map(function (p) {
      return {
        id: "kit:" + kit.slug + "/" + p.file,
        url: base + p.file,
        name: p.name || String(p.file).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " "),
        kind: p.kind || kindFromType(p.name || p.file),
        theme: p.theme || kit.theme || "",
        game: "",
        type: "",
        source: kit.name || kit.slug,
        group: "kit",
        kit: kit.slug,
        license: kit.license || "CC0",
        dim: kit.dim || "2d",
      };
    });
  }

  function loadKits() {
    return getJSON("/kenney/kits/index.json?" + bust).then(function (idx) {
      var slugs = (idx && idx.kits) || [];
      if (!slugs.length) return [];
      return Promise.all(slugs.map(function (s) { return getJSON("/kenney/kits/" + s + "/kit.json?" + bust); }))
        .then(function (kits) { return kits.reduce(function (all, k) { return all.concat(normKit(k)); }, []); });
    }).catch(function () { return []; });
  }

  function normCommunity(assets, chars) {
    var out = [];
    ((assets && assets.layers) || []).forEach(function (l) {
      if (!l.imageUrl) return;
      out.push({ id: l.id, url: l.imageUrl, name: (l.theme || "world") + " world", kind: "world",
        theme: l.theme || "", game: "", type: l.type || "background", source: l.source || "community", group: "pack", dim: "2d" });
    });
    ((assets && assets.sprites) || []).forEach(function (s) {
      if (!s.imageUrl) return;
      out.push({ id: s.id, url: s.imageUrl, name: s.subject || "element", kind: "element",
        theme: s.theme || "", game: "", type: "", source: s.source || "community", group: "pack", dim: "2d" });
    });
    ((chars && chars.characters) || []).forEach(function (c) {
      if (!c.image) return;
      out.push({ id: c.id, url: c.image, name: c.name || "character", kind: "character",
        theme: c.theme || "", game: "", type: "", source: c.source || "community", group: "pack", dim: "2d" });
    });
    return out;
  }

  var CACHE = null;

  var BL = {
    // Which kinds fit a given editor slot spec.
    kindsForSlot: function (spec) {
      spec = spec || {};
      if (spec.key === "music" || spec.mode === "audio") return ["music", "sfx"];
      if (spec.role === "background") return ["world"];
      return ["character", "element"];
    },

    // Studio pieces only (Browse already loads packs/audio itself; it adds these).
    studioItems: function () {
      return getJSON("/api/asset-studio?manifest=1&" + bust).then(normStudio).catch(function () { return []; });
    },

    // Pieces from every added kit (Browse adds these to the same grid).
    kitItems: loadKits,

    // Which shelf a piece came from — the editor's source chips filter on this.
    groupOf: function (a) {
      if (!a) return "pack";
      if (a.group) return a.group;
      return a.source === "Studio" ? "studio" : "pack";
    },

    // The whole shelf: studio + added kits + packs + characters. Cached per page load.
    load: function (force) {
      if (CACHE && !force) return Promise.resolve(CACHE);
      return Promise.all([
        getJSON("/api/asset-studio?manifest=1&" + bust),
        getJSON("/api/list-assets?" + bust),
        getJSON("/api/list-characters?" + bust),
        loadKits(),
      ]).then(function (r) {
        CACHE = normStudio(r[0]).concat(r[3] || [], normCommunity(r[1], r[2]));
        return CACHE;
      });
    },

    // Filter the shelf down to what fits one slot of one game+theme.
    // showAll drops the kind/theme narrowing (keeps the whole shelf).
    forSlot: function (items, spec, game, theme, showAll) {
      var slotKey = (spec && spec.key) || "";
      var kinds = BL.kindsForSlot(spec);
      var t = String(theme || "").toLowerCase();
      var themed = t && t !== "custom" && t !== "default" && t !== "library";
      var list = (items || []).filter(function (a) {
        if (showAll) return true;
        // a studio piece already made for this exact slot always qualifies
        var exact = a.source === "Studio" && a.type === slotKey;
        if (!exact && kinds.indexOf(a.kind) < 0) return false;
        if (!exact && themed && String(a.theme || "").toLowerCase() !== t) return false;
        return true;
      });
      // order: this slot's studio pieces, then this game's studio, then the rest
      // of Studio, then My Kits (art Mike chose to add), then the wider packs.
      function rank(a) {
        if (a.source === "Studio" && a.type === slotKey) return 0;
        if (a.source === "Studio" && a.game === game) return 1;
        if (a.source === "Studio") return 2;
        if (BL.groupOf(a) === "kit") return 3;
        return 4;
      }
      return list.sort(function (x, y) { return rank(x) - rank(y); });
    },

    kindFromType: kindFromType,
  };

  root.BuildableLibrary = BL;
})(typeof window !== "undefined" ? window : this);
