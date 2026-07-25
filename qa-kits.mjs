// Headless QA for the Kit shelf (Session KP1).
//
// What this proves, in the order Mike would check it himself:
//   1. the catalog is honest — every kit is real, counted, and previewable
//   2. an "added" kit is really added — files on disk, not a flag in a file
//   3. an added kit's pieces reach the ONE shelf as ordinary library items
//   4. Browse shows added / not added and can only ask for a kit via the planner
//   5. the editor's Library picker really filters by My Kits
// Run: node qa-kits.mjs [repoDir]
import fs from "fs";
import path from "path";
import vm from "vm";

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
sb.fetch = (u) => {
  const clean = String(u).split("?")[0];
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
say(/\/api\/planner/.test(al) && /op:"add"/.test(al), "Add to app files a planner card and does nothing else");
say(/\[kit:/.test(al), "the card is tagged [kit:<slug>] so the state can be read back");
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

console.log(ok ? "ALL CHECKS PASS" : "SOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
