#!/usr/bin/env node
// ============================================================================
//  scripts/build-kenney-kits.mjs  —  Session KP1
//
//  Writes public/kenney/kenney-kits.json: the KIT SHELF. One row per Kenney
//  pack in the All-in-1 bundle Mike owns (CC0, commercial use, no credit).
//
//  Why this exists: assets.json (shipped inside the bundle) names every pack and
//  points at its preview, but it does NOT index the loose PNG / model folders —
//  the 2D "Tower Defense" pack reads as 3 files there when the folder really
//  holds 299 sprites. So the piece count is taken by WALKING the real folders,
//  and retina duplicates (a "Retina" folder, or a name ending "@2") are not
//  counted twice. A count Mike reads has to be the truth.
//
//  "added" is not guessed either: a kit counts as added only when
//  public/kenney/kits/<slug>/kit.json exists in this repo. Adding a kit is a
//  separate job (a planner card); this script only reports the state.
//
//  Run it from the machine that has the bundle:
//    node scripts/build-kenney-kits.mjs --kenney "/path/to/Kenney Game Assets All-in-1 3.5.0" [--repo .]
//
//  After a kit is added to the repo (which happens on a machine that does NOT
//  need the bundle), re-stamp the added flags without a rebuild:
//    node scripts/build-kenney-kits.mjs --refresh-added [--repo .]
// ============================================================================
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const KENNEY = arg("--kenney", "");
const REPO = arg("--repo", ".");
const REFRESH_ONLY = args.includes("--refresh-added");
if (!REFRESH_ONLY && (!KENNEY || !fs.existsSync(KENNEY))) {
  console.error("Point --kenney at the 'Kenney Game Assets All-in-1 3.5.0' folder.");
  process.exit(2);
}

const PIECE_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".glb", ".gltf", ".obj", ".fbx", ".dae", ".ogg", ".wav", ".mp3"]);
const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const DIM_BY_CATEGORY = { "2D assets": "2d", "3D assets": "3d", "Audio": "audio", "Icons": "2d", "Other": "2d", "Early access": "2d" };

// Walk a pack folder. Returns { pieces, formats, retinaOnly } where `pieces` counts
// each distinct piece ONCE: retina copies and @2 files ride along with their base.
function walkPack(dir) {
  const seen = new Set(), formats = new Set();
  let dropped = 0;
  (function rec(d, depth) {
    if (depth > 6) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { rec(p, depth + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!PIECE_EXT.has(ext)) continue;
      const rel = path.relative(dir, p);
      const retina = /(^|[\/\\])retina([\/\\]|$)/i.test(rel) || /@2x?\.[a-z0-9]+$/i.test(e.name);
      if (retina) { dropped++; continue; }
      formats.add(ext.slice(1));
      seen.add(path.basename(e.name, ext).toLowerCase());
    }
  })(dir, 0);
  return { pieces: seen.size, formats: [...formats].sort(), retinaCopies: dropped };
}

const kitsDir = path.join(REPO, "public", "kenney", "kits");
const dest = path.join(REPO, "public", "kenney", "kenney-kits.json");
const isAdded = (slug) => fs.existsSync(path.join(kitsDir, slug, "kit.json"));

if (REFRESH_ONLY) {
  const cur = JSON.parse(fs.readFileSync(dest, "utf8"));
  cur.kits.forEach((k) => { k.added = isAdded(k.slug); });
  cur.added = cur.kits.filter((k) => k.added).length;
  fs.writeFileSync(dest, JSON.stringify(cur, null, 1));
  console.log(`refreshed added flags — ${cur.added} of ${cur.count} kits added`);
  process.exit(0);
}

const bundle = JSON.parse(fs.readFileSync(path.join(KENNEY, "assets.json"), "utf8"));

const kits = [];
for (const cat of bundle.categories || []) {
  for (const pack of cat.packs || []) {
    const slug = slugify(cat.name) + "__" + slugify(pack.name);
    const folder = path.join(cat.name, pack.name);
    const abs = path.join(KENNEY, folder);
    if (!fs.existsSync(abs)) continue;                 // listed but not unpacked — skip, never invent
    const { pieces, formats, retinaCopies } = walkPack(abs);
    kits.push({
      slug,
      name: pack.name,
      category: cat.name,
      dim: DIM_BY_CATEGORY[cat.name] || "2d",
      folder,
      preview: "/kenney/previews/" + slug + ".png",
      pieces,
      formats,
      retinaCopies,
      added: isAdded(slug),
    });
  }
}
kits.sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: "Kenney Game Assets All-in-1 3.5.0",
  license: "CC0 — commercial use, no credit required",
  count: kits.length,
  added: kits.filter((k) => k.added).length,
  pieces: kits.reduce((n, k) => n + k.pieces, 0),
  note: "Piece counts are walked from the real folders; retina duplicates are not counted twice. 'added' means public/kenney/kits/<slug>/kit.json exists in the repo.",
  kits,
};
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`kenney-kits.json — ${out.count} kits, ${out.pieces} pieces, ${out.added} added -> ${dest}`);
