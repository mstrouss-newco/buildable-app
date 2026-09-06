// /api/_cobuild.js
// -------------------------------------------------------------
// Session CB2. Two things every Cobuild endpoint needs and neither should own:
//
//   readPublic(name)  — one file out of public/, off disk if the function has it,
//                       otherwise over HTTP from this very deployment. Exactly the
//                       api/_manifestLib.js pattern, for the same reason: a Vercel
//                       function only ships the files its code traces, and public/
//                       is not traced.
//   sheetFor(engine)  — the engine's COBUILD SHEET (public/<engine>/cobuild.json):
//                       its art slots, its dials and their range, the shape a level
//                       may take, its feel presets, the rules it really fires, and
//                       what it can never do. The sheet is the fence strict
//                       validation checks a kid's game against.
//   recipeLib()       — public/buildable-recipes.js, run in a vm, so the server
//                       edits a manifest with the same named recipes the browser
//                       does.
//
// There is deliberately no fallback sheet. If a sheet cannot be read, the caller
// must refuse rather than let an unfenced manifest through.
// -------------------------------------------------------------
import fs from "fs";
import path from "path";
import vm from "vm";

const FILES = new Map();
const SHEETS = new Map();
let RECIPES = null;

function diskRead(name) {
  const tries = [
    path.join(process.cwd(), "public", name),
    path.join(process.cwd(), name),
    path.join(process.cwd(), "..", "public", name),
  ];
  for (const p of tries) { try { const s = fs.readFileSync(p, "utf8"); if (s) return s; } catch {} }
  return null;
}
async function httpRead(name) {
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  try {
    const r = await fetch(`${base}/${name}`, { headers: { "cache-control": "no-cache" } });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

// One file from public/, cached for the life of a warm function.
export async function readPublic(name) {
  if (FILES.has(name)) return FILES.get(name);
  const txt = diskRead(name) || (await httpRead(name));
  FILES.set(name, txt);
  return txt;
}

export async function sheetFor(engine) {
  if (SHEETS.has(engine)) return SHEETS.get(engine);
  const txt = await readPublic(`${engine}/cobuild.json`);
  let sheet = null;
  try { sheet = txt ? JSON.parse(txt) : null; } catch { sheet = null; }
  SHEETS.set(engine, sheet);
  return sheet;
}

// public/buildable-recipes.js as a module. Pure and DOM-free, so a vm sandbox with
// nothing in it is enough.
export async function recipeLib() {
  if (RECIPES) return RECIPES;
  const src = await readPublic("buildable-recipes.js");
  if (!src) return null;
  try {
    const sandbox = { console, JSON, Math, Object, Array, String, parseInt, isNaN };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: "buildable-recipes.js" });
    const api = sandbox.window && sandbox.window.BuildableRecipes;
    if (!api || typeof api.apply !== "function") return null;
    RECIPES = api;
    return api;
  } catch { return null; }
}
