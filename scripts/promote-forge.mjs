#!/usr/bin/env node
// scripts/promote-forge.mjs — A FORGED GAME BECOMES A REAL ONE (Session CB5).
//
//   node scripts/promote-forge.mjs <forge-id> [engine-id]
//   node scripts/promote-forge.mjs <forge-id> --dry     print what it would write
//
// /studio/forge-review is where the owner decides; this is where it happens. The
// decision and the writing are deliberately two steps, because a serverless
// function cannot write into a repo and — more to the point — SHOULD NOT. This
// script writes the files, and then a person reads them like any other change
// before they reach main. Nothing a model wrote lands because a button was
// pressed.
//
// What promotion writes:
//   public/<engine>.html          the cartridge, as a real page
//   public/<engine>/manifest.json its manifest
//   public/<engine>/cobuild.json  its cobuild sheet, so the studio can remix it
//   qa-<engine>.mjs               a gate that plays it on every QA run
//   vercel.json                   the routes, because an unrouted page is served
//                                 as the landing page (this is the Practice bug)
//
// What it does NOT do: add the game to GAME_CATALOG. That is one line in
// src/BuildableKids.jsx and it is the owner's call which tile a new game gets and
// whether it ships behind the coming-soon gate, so the script prints the line and
// leaves it to a person.
//
// It needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment, the same as
// any other script that reads the live tables.
import fs from "fs";
import path from "path";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const engineArg = args.filter((a) => !a.startsWith("--"))[1] || null;
const dry = args.includes("--dry");

const die = (m) => { console.error("promote: " + m); process.exit(1); };
if (!id) die("usage: node scripts/promote-forge.mjs <forge-id> [engine-id] [--dry]");
if (!URL_ || !KEY) die("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");

const row = await (async () => {
  const r = await fetch(`${URL_}/rest/v1/forge_cartridges?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) die("could not read the workshop (http " + r.status + ")");
  const j = await r.json();
  return (Array.isArray(j) && j[0]) || null;
})();
if (!row) die("there is no forged game called " + id);
if (row.status !== "ready" && row.status !== "promoted") die("that game has not passed its gate, so it cannot be promoted");
if (!row.html || !row.manifest || !row.sheet) die("that row is missing its cartridge, manifest or sheet");

const engine = String(engineArg || row.promoted_as || row.id).replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
if (!engine) die("that is not a usable engine id");

// The manifest and the sheet have to agree with where the files actually land,
// whatever the model called them. An entry pointing at a page that is not there
// is the one mistake that makes a promoted game look broken rather than new.
const manifest = { ...row.manifest, id: engine, engine: "canvas", entry: `/${engine}.html` };
const sheet = { ...row.sheet, engine, entry: `/${engine}.html`, label: row.sheet.label || row.name || engine };
if (sheet.manifest && sheet.manifest.fixed) sheet.manifest.fixed = { ...sheet.manifest.fixed, id: engine };

const qa = `// qa-${engine}.mjs — the gate for ${sheet.label}, promoted from the forge (CB5).
//
// ${sheet.label} was written by layer three from a child's sentence:
//   "${String(row.idea || "").replace(/"/g, "'")}"
// It passed the forge's gate ${row.attempts} attempt(s) in, families played it
// ${row.plays} time(s) and finished it ${row.cleared} time(s), and the owner
// promoted it. From here it is an engine like any other, so it is played on
// every QA run by the same robot that guards the rest.
import fs from "fs";
import { playManifest } from "./qa/kid-game-robot.mjs";

const read = async (f) => { try { return fs.readFileSync("public/" + f, "utf8"); } catch { return null; } };
let ok = true;
const chk = (name, pass, extra = "") => { console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!pass) ok = false; };

const html = await read("${engine}.html");
const manifest = JSON.parse(await read("${engine}/manifest.json"));
const sheet = JSON.parse(await read("${engine}/cobuild.json"));

chk("the cartridge is on disk", !!html);
chk("its manifest points at the page that exists", manifest.entry === "/${engine}.html");
chk("its sheet names the same engine", sheet.engine === "${engine}");

const { staticCheck } = await import("./api/_forgeSpec.js");
const s = staticCheck(html || "");
chk("it still passes the forge's own static checks", s.ok, (s.problems || []).slice(0, 3).join(" | "));

const libs = ["buildable-feel.js", "buildable-hud.js", "buildable-gamenav.js", "buildable-wincard.js",
  "buildable-audio.js", "buildable-manifest.js", "buildable-mechanics.js", "buildable-renders.js"]
  .filter((f) => (html || "").includes(f));
const played = await playManifest(manifest, "${engine}", { read, suggest: false, cartridge: { html, libs } });
chk("the robot still finishes every level", played.playable, played.verdict);
for (const lv of (played.levels || [])) chk("  level " + lv.name + " is beatable", lv.verdict !== "not-beatable", lv.note || "");
chk('it still tells the shell when a child wins', (played.said || []).some((m) => m && m.kind === "win"));

console.log(ok ? "\\nALL CHECKS PASS" : "\\nSOMETHING IS WRONG  (see FAIL lines above)");
process.exit(ok ? 0 : 1);
`;

const files = [
  [`public/${engine}.html`, String(row.html)],
  [`public/${engine}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n"],
  [`public/${engine}/cobuild.json`, JSON.stringify(sheet, null, 2) + "\n"],
  [`qa-${engine}.mjs`, qa],
];

if (dry) {
  console.log("would write:");
  for (const [f, body] of files) console.log("  " + f + "  (" + Math.round(Buffer.byteLength(body) / 1024) + "KB)");
  console.log("\nand add these routes to vercel.json:");
  console.log(`  /${engine}.html -> /${engine}.html`);
  console.log(`  /${engine} -> /${engine}.html`);
  process.exit(0);
}

for (const [f, body] of files) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (fs.existsSync(f)) die(f + " already exists; pick another engine id rather than overwriting a game that ships");
  fs.writeFileSync(f, body);
  console.log("wrote " + f);
}

// The routes. An unrouted page is served as the landing page, silently — that is
// exactly how Practice shipped dead, and qa-all.mjs checks for it on every run.
const vjson = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const have = new Set(vjson.routes.map((r) => r.src));
const at = vjson.routes.findIndex((r) => r.src === "/(.*)");
const add = [{ src: `/${engine}.html`, dest: `/${engine}.html` }, { src: `/${engine}`, dest: `/${engine}.html` }]
  .filter((r) => !have.has(r.src));
if (add.length) {
  vjson.routes.splice(at === -1 ? vjson.routes.length : at, 0, ...add);
  fs.writeFileSync("vercel.json", JSON.stringify(vjson, null, 2) + "\n");
  console.log("routed " + add.map((r) => r.src).join(" and "));
}

console.log(`
Done. Two things are left for a person, on purpose:

  1. READ THE CARTRIDGE. public/${engine}.html was written by a model. It passed
     every gate, and it still deserves the same read any new engine would get.

  2. ADD THE TILE. Put this in GAME_CATALOG in src/BuildableKids.jsx, behind the
     coming-soon gate until you have played it yourself:

       { id: "${engine}", name: ${JSON.stringify(sheet.label)}, type: "game", soon: true,
         href: "/${engine}.html", by: ${JSON.stringify([row.kid_name, row.grownup_name].filter(Boolean).join(" and ") || "a family")} },

     The credit line is not decoration: a child asked for this game and it exists
     because they did. Their name belongs on its card.

Then: node qa-${engine}.mjs && node qa-all.mjs`);
