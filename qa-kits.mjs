// Headless QA for the Kit shelf (Session KP1).
//
// What this proves, in the order Mike would check it himself:
//   1. the catalog is honest — every kit is real, counted, and previewable
//   2. an "added" kit is really added — files on disk, not a flag in a file
//   3. an added kit's pieces reach the ONE shelf as ordinary library items
//   4. Browse shows added / not added and can only ask for a kit via the planner
//   5. the editor's Library picker really filters by My Kits
//   6. (KP2) the Tower Defense curation is the one Mike asked for, and every
//      piece is a real, visible image of the right shape for its job
// Run: node qa-kits.mjs [repoDir]
import fs from "fs";
import path from "path";
import vm from "vm";
import zlib from "zlib";

const dir = process.argv[2] || ".";
const P = (...p) => path.join(dir, ...p);
const read = (f) => fs.readFileSync(P(f), "utf8");
let ok = true;
const say = (pass, msg) => { console.log((pass ? "PASS" : "FAIL") + "  " + msg); if (!pass) ok = false; };

console.log("--- 1. the catalog is honest ---");
const cat = JSON.parse(read("public/kenney/kenney-kits.json"));
say(Array.isArray(cat.kits) && cat.kits.length > 100, `catalog holds ${cat.kits && cat.kits.length} kits`);
say(cat.count === cat.kits.length, "the headline count matches the rows");
say(/CC0/.test(cat.license || ""), "the licence is recorded on the catalog itself :: " + cat.license);

const slugs = new Set();
let badRow = null, missingPreview = 0, zeroPieces = [];
for (const k of cat.kits) {
  if (!k.slug || !k.name || !k.preview || typeof k.pieces !== "number" || typeof k.added !== "boolean") { badRow = badRow || k; }
  if (slugs.has(k.slug)) badRow = badRow || k;
  slugs.add(k.slug);
  if (!fs.existsSync(P("public" + k.preview))) missingPreview++;
  if (!k.pieces) zeroPieces.push(k.slug);
}
say(!badRow, "every row has slug/name/preview/pieces/added and a unique slug" + (badRow ? " :: " + JSON.stringify(badRow) : ""));
say(missingPreview === 0, `every kit's preview image is really in the repo (${missingPreview} missing)`);
say(zeroPieces.length === 0, "no kit claims zero pieces :: " + (zeroPieces.slice(0, 4).join(", ") || "none"));
say(cat.pieces === cat.kits.reduce((n, k) => n + k.pieces, 0), `total piece count adds up (${cat.pieces})`);
// the counts must beat the bundle's own index, which skips the loose PNG folders
const td = cat.kits.find((k) => k.slug === "2d-assets__tower-defense");
say(!!td && td.pieces > 100, "counts come from the real folders, not the bundle index :: Tower Defense = " + (td && td.pieces));

console.log("--- 2. an added kit is really added ---");
const index = JSON.parse(read("public/kenney/kits/index.json"));
say(Array.isArray(index.kits) && index.kits.length >= 1, `index.json lists ${index.kits && index.kits.length} added kit(s)`);
const addedInCatalog = cat.kits.filter((k) => k.added).map((k) => k.slug).sort();
say(JSON.stringify(addedInCatalog) === JSON.stringify(index.kits.slice().sort()),
  "the catalog's added flags and index.json agree :: " + addedInCatalog.join(", "));

const kitObjs = [];
for (const slug of index.kits) {
  const kitPath = "public/kenney/kits/" + slug + "/kit.json";
  say(fs.existsSync(P(kitPath)), slug + " has a kit.json");
  const kit = JSON.parse(read(kitPath));
  kitObjs.push(kit);
  say(kit.slug === slug, slug + ": kit.json names itself correctly");
  say(/CC0/i.test(kit.license || ""), slug + ": licence recorded (" + kit.license + ")");
  say(fs.existsSync(P("public/kenney/kits/" + slug + "/LICENSE.txt")), slug + ": the pack's own licence file rides along");
  const missing = kit.pieces.filter((p) => !fs.existsSync(P("public/kenney/kits/" + slug + "/" + p.file)));
  say(missing.length === 0, slug + `: all ${kit.pieces.length} pieces are really on disk` + (missing.length ? " :: missing " + missing.length : ""));
  const badKind = kit.pieces.filter((p) => ["character", "world", "element"].indexOf(p.kind) < 0);
  say(badKind.length === 0, slug + ": every piece has a shelf kind the library understands");
  const dupes = kit.pieces.length - new Set(kit.pieces.map((p) => p.file)).size;
  say(dupes === 0, slug + ": no piece is listed twice");
  const named = kit.pieces.filter((p) => p.name && !/tile\d/i.test(p.name));
  say(named.length === kit.pieces.length, slug + ": every piece has a human name, not a tile number");
}

console.log("--- 3. kit pieces reach the ONE shelf as ordinary items ---");
// Run buildable-library.js with a fetch stub that serves the repo's static files.
const sb = { console, Math, Date, JSON, Object, Array, String, Promise, Set };
sb.window = sb; sb.globalThis = sb;
// KP3: a planner with one OPEN kit card, one already-done kit card, and one card
// that has nothing to do with kits — so "requested" can be shown to be read from
// real state rather than guessed.
const PLANNER_FIXTURE = { ok: true, tasks: [
  { id: 1, target: "Kits", description: 'Add the Kenney "Space Kit" kit [kit:3d-assets__space-kit] — 200 pieces, 3D, CC0.', done: false },
  { id: 2, target: "Kits", description: 'Add the Kenney "Tower Defense" kit [kit:2d-assets__tower-defense] — 303 pieces, 2D, CC0.', done: true },
  { id: 3, target: "Breaker", description: "the paddle feels slow on iPad", done: false },
] };
const POSTS = [];
sb.fetch = (u, opts) => {
  const clean = String(u).split("?")[0];
  if (opts && opts.method === "POST") {
    let body = null; try { body = JSON.parse(opts.body || "{}"); } catch { body = "unparseable"; }
    POSTS.push({ url: clean, body });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, task: { id: 99 } }) });
  }
  if (clean === "/api/planner") return Promise.resolve({ ok: true, json: () => Promise.resolve(PLANNER_FIXTURE) });
  if (clean.indexOf("/api/") === 0) return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
  const f = P("public" + clean);
  if (!fs.existsSync(f)) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, "utf8"))) });
};
vm.createContext(sb);
vm.runInContext(read("public/buildable-library.js"), sb, { filename: "buildable-library" });
const BL = sb.BuildableLibrary;
say(typeof BL.kitItems === "function" && typeof BL.groupOf === "function", "the library exposes kitItems + groupOf");

const items = await BL.kitItems();
const expected = kitObjs.reduce((n, k) => n + k.pieces.length, 0);
say(items.length === expected, `every added piece arrives on the shelf (${items.length} of ${expected})`);
say(items.every((a) => BL.groupOf(a) === "kit"), 'every kit piece is tagged group "kit"');
say(items.every((a) => /^kit:/.test(a.id) && a.url.indexOf("/kenney/kits/") === 0), "ids and urls point at the static kit files");
say(items.every((a) => a.name && a.kind && a.source), "each piece carries a name, a kind and its kit's name");
const onDisk = items.filter((a) => !fs.existsSync(P("public" + a.url)));
say(onDisk.length === 0, "every shelf url resolves to a real file");

const whole = await BL.load();
say(whole.length >= items.length, `load() merges kits into the whole shelf (${whole.length} items)`);
say(whole.filter((a) => BL.groupOf(a) === "kit").length === items.length, "the merged shelf keeps every kit piece");
// a kit piece must be offerable to an ordinary element slot
const forSlot = BL.forSlot(whole, { key: "bush1" }, "castleguard", "default", false);
say(forSlot.some((a) => BL.groupOf(a) === "kit"), "a kit piece is offered to an ordinary game slot");
// ...and rank below Studio art but above the wider packs
const groups = forSlot.map((a) => BL.groupOf(a));
const firstKit = groups.indexOf("kit"), lastStudio = groups.lastIndexOf("studio"), firstPack = groups.indexOf("pack");
say(firstKit > lastStudio, "kit pieces sort below Studio art");
say(firstPack === -1 || firstKit < firstPack, "kit pieces sort above the wider packs");

console.log("--- 4. Browse tells the truth about added / not added ---");
const al = read("public/asset-library.html");
say(/kenney-kits\.json/.test(al), "Browse reads the kit catalog");
say(/kitsSection/.test(al) && />Kits</.test(al), "Browse has a Kits section");
say(/\["added","Added"\]/.test(al) && /\["not","Not added"\]/.test(al) && /data-kf=/.test(al),
  "the section filters by Added / Not added");
say(/Add to app/.test(al), "a not-added kit offers Add to app");
say(/BuildableLibrary\.requestKit\(/.test(al), "Add to app goes down the ONE shared road, not its own copy");
say(!/op:"add"/.test(al), "Browse no longer hand-rolls the planner card");
say(/BuildableLibrary\.requestedSlugs\(/.test(al), "Browse reads the request state from the shared helper too");
say(!/Kenney catalog/.test(al), "the old flat Kenney strip is gone, not left duplicating the new one");
say(/BuildableLibrary\.kitItems\(\)/.test(al), "added pieces join the normal asset grid");

console.log("--- 5. the editor's Library picker filters by My Kits ---");
const ed = read("public/editor.html");
say(/My Kits/.test(ed), "the picker offers a My Kits chip");
say(/BuildableLibrary\.groupOf/.test(ed), "the chips filter on the shelf's group tag");
say(/srcchip/.test(ed) && /\.srcchip\.on\{/.test(ed), "the chips are styled, including the selected one");
say(/never offer an empty shelf/.test(ed), "a chip is hidden when its shelf is empty");
say(/lchip kit/.test(ed), "a kit piece is badged with its kit's name in the grid");
say(/action:"import"/.test(ed), "assigning a kit piece uses the SAME import road as any other asset");

console.log("--- 6. Session KP2: the Tower Defense curation is what Mike asked for ---");
// KP2's card: "the best 50-100 pieces ... all towers, enemies, projectiles, key
// terrain tiles". These checks hold that promise so a later session cannot quietly
// trim the kit back to a handful of props.
const TD = "2d-assets__tower-defense";
const tdKit = JSON.parse(read("public/kenney/kits/" + TD + "/kit.json"));
const files = tdKit.pieces.map((p) => p.file).join(" ");
say(tdKit.pieces.length >= 50 && tdKit.pieces.length <= 100,
  `the kit holds 50-100 curated pieces :: ${tdKit.pieces.length}`);
const family = (label, re, min) => {
  const n = tdKit.pieces.filter((p) => re.test(p.file)).length;
  say(n >= min, `${label}: ${n} piece(s), at least ${min} expected`);
};
family("towers and turrets", /^(tower|turret|cannon|rocket-rack|rocket-launcher)/, 8);
family("units to send in", /^(guard|plane)/, 6);
family("things that fly at things", /^(rocket|flame)/, 6);
family("build plates", /^plate-/, 8);
family("terrain squares", /^(ground|road)-/, 15);
family("props to scatter", /^(tree|bush|plant|rock|crystal|gem|crate|coin)/, 15);

// Every piece has to be a real, sane image — and has to be VISIBLE on the light
// library shelf. Three of Kenney's effect sprites were cut in KP2 for failing
// exactly this: near-white overlays that read as an empty card.
const png = (f) => fs.readFileSync(P("public/kenney/kits/" + TD + "/" + f));
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], type: b[25] });
function pixels(buf) {                       // minimal PNG reader: 8-bit RGBA/RGB only
  const { w, h, depth, type } = pngSize(buf);
  if (depth !== 8 || (type !== 6 && type !== 2)) return null;
  const bpp = type === 6 ? 4 : 3;
  let idat = [], i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), tag = buf.toString("ascii", i + 4, i + 8);
    if (tag === "IDAT") idat.push(buf.subarray(i + 8, i + 8 + len));
    i += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  const pa = (a, b2) => { const p = a + b2; return p < 256 ? p : p - 256; };
  for (let y = 0, o = 0; y < h; y++) {
    const ft = raw[y * (w * bpp + 1)];
    const line = raw.subarray(y * (w * bpp + 1) + 1, (y + 1) * (w * bpp + 1));
    for (let x = 0; x < w * bpp; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b2 = y > 0 ? out[o - w * bpp + x] : 0;
      const c = (x >= bpp && y > 0) ? out[o - w * bpp + x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v = pa(v, a);
      else if (ft === 2) v = pa(v, b2);
      else if (ft === 3) v = pa(v, (a + b2) >> 1);
      else if (ft === 4) { const p = a + b2 - c, da = Math.abs(p - a), db = Math.abs(p - b2), dc = Math.abs(p - c);
        v = pa(v, (da <= db && da <= dc) ? a : (db <= dc ? b2 : c)); }
      out[o + x] = v;
    }
    o += w * bpp;
  }
  return { w, h, bpp, out };
}
// how strongly does this piece stand out against a white card?
function inkOnWhite(f) {
  const px = pixels(png(f));
  if (!px) return 999;
  let best = 0;
  for (let i = 0; i < px.out.length; i += px.bpp) {
    const a = px.bpp === 4 ? px.out[i + 3] / 255 : 1;
    const d = Math.max(255 - px.out[i], 255 - px.out[i + 1], 255 - px.out[i + 2]);
    best = Math.max(best, a * d);
  }
  return best;
}
// a sprite has to have see-through edges (it is a thing sitting on a scene);
// a ground square must have none (it IS the scene, so it must cover the tile).
function seeThrough(f) {
  const px = pixels(png(f));
  if (!px || px.bpp !== 4) return false;
  for (let i = 3; i < px.out.length; i += 4) if (px.out[i] < 250) return true;
  return false;
}
let badImg = [], faint = [], badGround = [], badSprite = [];
for (const p of tdKit.pieces) {
  const b = png(p.file);
  const isPng = b.length > 24 && b.readUInt32BE(0) === 0x89504e47;
  const { w, h } = pngSize(b);
  if (!isPng || !w || !h || w > 256 || h > 256) { badImg.push(p.file); continue; }
  const ground = /^(ground|road|plate)-/.test(p.file) || p.file === "plate-green.png";
  if (ground && (w !== 128 || h !== 128)) badGround.push(p.file);
  if (!ground && !seeThrough(p.file)) badSprite.push(p.file);
  if (ground && seeThrough(p.file)) badGround.push(p.file);
  if (inkOnWhite(p.file) < 40) faint.push(p.file);
}
say(badImg.length === 0, "every piece is a real PNG no bigger than a tile" + (badImg.length ? " :: " + badImg.join(", ") : ""));
say(badGround.length === 0, "every ground, road and plate is a solid, whole 128px square" + (badGround.length ? " :: " + badGround.join(", ") : ""));
say(badSprite.length === 0, "every other piece is a cut-out with see-through edges" + (badSprite.length ? " :: " + badSprite.join(", ") : ""));
say(faint.length === 0, "no piece is so pale it reads as an empty card on the shelf" + (faint.length ? " :: " + faint.join(", ") : ""));
say(/kenney/i.test(files) === false, "pieces carry kid names, not Kenney file names");

// the two halves of the kit have to land in two different kinds of slot: props on
// an ordinary art slot, ground squares on a background slot. If terrain were tagged
// like a prop it would never be offered anywhere it makes sense.
const props = BL.forSlot(whole, { key: "bush1" }, "castleguard", "default", false).filter((a) => BL.groupOf(a) === "kit");
const bg = BL.forSlot(whole, { key: "background", mode: "single", role: "background" }, "breaker", "default", false).filter((a) => BL.groupOf(a) === "kit");
say(props.length >= 40, `a prop slot is offered ${props.length} kit pieces`);
say(bg.length >= 20, `a background slot is offered ${bg.length} kit pieces (the grounds, roads and plates)`);
say(props.every((a) => !/^(ground|road|plate)-/.test(a.url.split("/").pop())), "terrain squares are NOT offered as props");
say(bg.every((a) => /^(ground|road|plate)-/.test(a.url.split("/").pop())), "props are NOT offered as backgrounds");

console.log("--- 7. Session KP3: the add-to-app loop actually runs ---");
// Not a text search this time: the real functions are driven against a stubbed
// planner, so the card Mike's tap produces is inspected as data.
say(["catalogKits", "kitRequests", "requestedSlugs", "requestKit"].every((f) => typeof BL[f] === "function"),
  "the library owns the whole loop: browse, read back, and ask");

const catalog = await BL.catalogKits();
say(catalog.length === cat.kits.length, `the shelf can browse all ${catalog.length} kits, added or not`);
say(catalog.some((k) => !k.added), "kits Mike has not added are still browsable — asking is never a wall");
say(catalog.every((k) => k.preview && k.folder), "every browsable kit shows a preview and where it lives on Mike's Mac");

const reqs = await BL.kitRequests();
say(reqs["3d-assets__space-kit"] === true, "an open card reads back as requested");
say(!reqs["2d-assets__tower-defense"], "a card already ticked done does NOT read back as still requested");
say(Object.keys(reqs).length === 1, "a card that is not about a kit is ignored :: " + JSON.stringify(Object.keys(reqs)));

const target = catalog.find((k) => !k.added && k.folder);
POSTS.length = 0;
const filed = await BL.requestKit(target);
say(POSTS.length === 1, `asking for a kit files exactly one thing (${POSTS.length})`);
const card = POSTS[0] || { url: "", body: {} };
say(card.url === "/api/planner", "the one thing it files is a planner card :: " + card.url);
say(card.body.op === "add" && card.body.task && card.body.task.target === "Kits" && card.body.task.kind === "platform",
  "the card is an add, filed under Kits");
const desc = (card.body.task && card.body.task.description) || "";
say(desc.indexOf("[kit:" + target.slug + "]") > -1, "the card is tagged [kit:<slug>] so Browse and the editor can read it back");
say(desc.indexOf(target.name) > -1 && desc.indexOf(String(target.pieces)) > -1, "the card names the kit and its size");
say(desc.indexOf(target.folder) > -1, "the card points the next session at the source folder on Mike's Mac");
say(/kit\.json/.test(desc) && /refresh-added/.test(desc) && /KITS\.md/.test(desc), "the card carries the recipe, so the next session need not guess");
say(desc.length <= 500, `the card survives the planner's 500-char clip (${desc.length})`);
say(!!filed, "asking resolves only when the planner really stored the card");
// asking must move NO art and change NO game
say(!POSTS.some((p) => /asset-studio|save-game|manifest/.test(p.url)), "asking imports no art and touches no game");
say(BL.requestedSlugs(PLANNER_FIXTURE)["3d-assets__space-kit"] === true, "the read-back helper is the same one Browse uses");
const afterAsk = await BL.catalogKits();
say(afterAsk.filter((k) => k.added).length === catalog.filter((k) => k.added).length,
  "asking does not quietly mark a kit added — only real files do that");

// the editor is where Mike actually stands when he needs a kit
say(/Add a kit/.test(ed), "the editor's Library picker offers Add a kit");
say(/drawKitShelf/.test(ed) && /kitCard/.test(ed), "the picker draws the kits Mike owns but has not added");
say(/BuildableLibrary\.requestKit\(/.test(ed), "the editor's Add to app uses the SAME shared road as Browse");
say(/BuildableLibrary\.catalogKits\(\)/.test(ed) && /BuildableLibrary\.kitRequests\(\)/.test(ed),
  "the editor reads the catalog and the open cards, not a hardcoded list");
say(/srcchip get/.test(ed) && !/if\(s\[0\]==="addkit"\)\s*return/.test(ed),
  "Add a kit is always offered, even when the slot's shelves are empty");
say(/Asked for/.test(ed) && /a card is waiting/.test(ed), "a kit already asked for says so instead of asking twice");
say(!/action:"import"[^]{0,400}addkit/.test(ed), "the Add a kit shelf never imports art by itself");

const kitsDoc = fs.existsSync(P("KITS.md")) ? read("KITS.md") : "";
say(!!kitsDoc, "KITS.md exists, so the loop is written down");
say(/refresh-added/.test(kitsDoc) && /kindsForSlot|role:"background"/.test(kitsDoc) && /planner_tasks/.test(kitsDoc),
  "KITS.md carries the recipe: curate, tag kinds, re-stamp, close the card");

console.log(ok ? "ALL CHECKS PASS" : "SOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
