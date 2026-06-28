// Regenerate public/models/manifest.json by scanning public/models/<pack>/*.gltf.
// Run after adding/removing a 3D model pack:  node scripts/gen-models-manifest.mjs
// The internal Asset Library reads this so new packs appear automatically.
import fs from "fs";
import path from "path";

const ROOT = "public/models";
// Per-pack metadata. Unknown packs fall back to theme=folder name, no license badge.
// Add a line per 3D pack you drop into public/models/. Kenney kits are CC0:
//   kenney_city: { theme: "city", source: "kenney", license: "CC0" },
const META = {
  nature: { theme: "forest", source: "quaternius", license: "CC0" },
  city:   { theme: "city",   source: "city pack",  license: "verify" },
  "city-kit": { theme: "city", source: "kenney", license: "CC0" },
};

const models = [];
for (const pack of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, pack);
  if (!fs.statSync(dir).isDirectory()) continue;
  const meta = META[pack] || { theme: pack, source: pack, license: "" };
  const pvDir = path.join(dir, "previews");
  const hasPv = fs.existsSync(pvDir);
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(gltf|glb)$/i.test(f)) continue;
    const file = f.replace(/\.(gltf|glb)$/i, "");
    const thumb = hasPv && fs.existsSync(path.join(pvDir, file + ".png")) ? "/models/" + pack + "/previews/" + file + ".png" : "";
    models.push({
      name: file.replace(/[_-]/g, " "), file, pack,
      theme: meta.theme, source: meta.source, license: meta.license, thumb,
      url: "/models/" + pack + "/" + f,
    });
  }
}
models.sort((a, b) => (a.pack + a.file).localeCompare(b.pack + b.file));
fs.writeFileSync(path.join(ROOT, "manifest.json"),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), count: models.length, models }, null, 2));
console.log("wrote " + models.length + " models across " + new Set(models.map(m => m.pack)).size + " packs");
