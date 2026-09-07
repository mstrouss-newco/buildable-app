// qa-recipes.mjs — the RECIPE BOOK gate (Session CB2).
//
// A recipe is a named, deterministic manifest edit (public/buildable-recipes.js).
// The promise it makes is strong, so it is checked strongly: for EVERY recipe on
// EVERY engine it says it works on, applied to that engine's shipped game —
//
//   1. the result still validates in STRICT mode against that engine's cobuild
//      sheet (so a recipe can never push a manifest outside the fence),
//   2. the result still BEATS THE ROBOT (qa/kid-game-robot.mjs plays it),
//   3. the manifest handed in comes back untouched (recipes never mutate),
//   4. running it twice gives exactly the same answer (deterministic),
//   5. asking an engine for a recipe it does not have is an honest no WITH a
//      reason, never a silent no-op.
//
// Run:  node qa-recipes.mjs
import fs from "fs";
import vm from "vm";
import { playManifest } from "./qa/kid-game-robot.mjs";

const read = (f) => { try { return fs.readFileSync("public/" + f, "utf8"); } catch { return null; } };
const readJson = (f) => JSON.parse(read(f));
let ok = true;
const chk = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!cond) ok = false; };

// the two shared libs, in a sandbox, exactly as a browser would have them
function lib(file, globals) {
  const sb = { console, Math, JSON, Object, Array, String, RegExp, parseInt, isNaN, isFinite, ...(globals || {}) };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read(file), sb, { filename: file });
  return sb;
}
const BM = lib("buildable-manifest.js").BuildableManifest;
const R = lib("buildable-recipes.js").BuildableRecipes;

const ENGINES = ["breaker", "sling", "castleguard", "skyflyer"];
const stock = {}, sheets = {};
for (const e of ENGINES) { stock[e] = readJson(e + "/manifest.json"); sheets[e] = readJson(e + "/cobuild.json"); }

console.log("--- the book itself ---");
const ids = R.ids();
const EXPECTED = ["rename", "swapHero", "swapWorld", "recolor", "moreCollectibles", "fewerCollectibles", "harder", "easier",
  "addBoss", "removeBoss", "nightMode", "dayMode", "zoomier", "calmer", "addLevel", "removeLevel", "mathGate", "voiceLine"];
chk("every recipe the card names is in the book", EXPECTED.every((k) => ids.includes(k)), EXPECTED.filter((k) => !ids.includes(k)).join(", ") || ids.length + " recipes");
chk("every recipe declares which engines it works on", ids.every((k) => Array.isArray(R._recipes[k].engines) && R._recipes[k].engines.length));
chk("every engine the book names is a real engine", ids.every((k) => R._recipes[k].engines.every((e) => ENGINES.includes(e))));

// Params that make a recipe do something real on each engine. Anything missing
// falls back to the recipe's own default, which is also worth testing.
const PARAMS = {
  rename: { name: "The Robot's Game" },
  swapHero: { breaker: { theme: "ocean" }, sling: { theme: "forest" } },
  swapWorld: { breaker: { theme: "space" }, sling: { theme: "desert" }, skyflyer: { theme: "snow" } },
  recolor: { color: "#33CC88" },
  addBoss: { name: "Big Grump" },
  addLevel: { name: "One More Go" },
  voiceLine: { when: "onWin", text: "You did it!" },
  mathGate: { on: true },
};
const paramsFor = (id, engine) => {
  const p = PARAMS[id];
  if (!p) return {};
  return (p[engine] !== undefined && typeof p[engine] === "object") ? p[engine] : p;
};

console.log("\n--- an honest no when an engine cannot do it ---");
for (const id of ids) {
  for (const e of ENGINES) {
    if (R.supports(id, e)) continue;
    const r = R.apply(id, stock[e], paramsFor(id, e), sheets[e]);
    chk(`${e} says no to '${id}' and says why`, r.ok === false && typeof r.error === "string" && r.error.length > 10, r.error || "no reason given");
  }
}

console.log("\n--- every recipe, on every engine it claims: pure, deterministic, still inside the fence, still beatable ---");
for (const e of ENGINES) {
  for (const id of ids) {
    if (!R.supports(id, e)) continue;
    const before = JSON.stringify(stock[e]);
    const a = R.apply(id, stock[e], paramsFor(id, e), sheets[e]);
    if (!a.ok) { chk(`${e} / ${id} applies`, false, a.error); continue; }
    chk(`${e} / ${id} leaves the original alone`, JSON.stringify(stock[e]) === before);
    const b = R.apply(id, stock[e], paramsFor(id, e), sheets[e]);
    chk(`${e} / ${id} is deterministic`, JSON.stringify(a.manifest) === JSON.stringify(b.manifest));
    const v = BM.validate(a.manifest, { strict: true, sheet: sheets[e] });
    chk(`${e} / ${id} stays inside the sheet`, v.ok, (v.errors || []).slice(0, 3).join(" | "));
    if (!v.ok) continue;
    const play = await playManifest(a.manifest, e, { read: async (f) => read(f) });
    chk(`${e} / ${id} still beats the robot`, play.playable, play.verdict + (play.levels || []).filter((l) => l.verdict === "not-beatable").map((l) => " :: " + l.name + " " + l.note).join(""));
  }
}

console.log("\n--- the edits really happened ---");
chk("rename really renames", R.apply("rename", stock.breaker, { name: "Zebra Time" }, sheets.breaker).manifest.name === "Zebra Time");
chk("harder really raises difficulty",
  R.apply("harder", stock.sling, {}, sheets.sling).manifest.levels[0].difficulty === Math.min(5, stock.sling.levels[0].difficulty + 1));
chk("easier never goes below 1", R.apply("easier", R.apply("easier", R.apply("easier", R.apply("easier", R.apply("easier", stock.sling, {}, sheets.sling).manifest, {}, sheets.sling).manifest, {}, sheets.sling).manifest, {}, sheets.sling).manifest, {}, sheets.sling).manifest.levels.every((l) => l.difficulty >= 1));
chk("addLevel adds exactly one and stops at the sheet's ceiling", (function () {
  let m = stock.breaker, max = sheets.breaker.level.max;
  for (let i = 0; i < max + 4; i++) m = R.apply("addLevel", m, {}, sheets.breaker).manifest;
  return m.levels.length === max && new Set(m.levels.map((l) => l.id)).size === m.levels.length;
})(), "ceiling " + sheets.breaker.level.max);
chk("removeLevel never empties the game", (function () {
  let m = stock.breaker;
  for (let i = 0; i < 20; i++) m = R.apply("removeLevel", m, {}, sheets.breaker).manifest;
  return m.levels.length === Math.max(1, sheets.breaker.level.min) && m.levels.some((l) => l.unlocked);
})());
chk("voiceLine writes a rule the engine really fires",
  (function () { const m = R.apply("voiceLine", stock.sling, { when: "onWin", text: "Nice!" }, sheets.sling).manifest;
    return Array.isArray(m.rules) && m.rules[0].when === "onWin" && m.rules[0].do === "sayLine" && m.rules[0].params.text === "Nice!"; })());
chk("voiceLine refuses a moment the engine never fires",
  (function () { const m = R.apply("voiceLine", stock.castleguard, { when: "onCollect", text: "Hi" }, sheets.castleguard).manifest;
    return !Array.isArray(m.rules) || !m.rules.length; })(), "Castle Guard has no onCollect");
chk("mathGate switches the learning gate on",
  R.apply("mathGate", stock.breaker, { on: true }, sheets.breaker).manifest.features.learning.beforeUnlock === true);
chk("moreCollectibles raises Sky Flyer's coin goal and clamps at the sheet's max", (function () {
  let m = stock.skyflyer;
  for (let i = 0; i < 20; i++) m = R.apply("moreCollectibles", m, {}, sheets.skyflyer).manifest;
  return m.levels.every((l) => l.parts.goalCoins <= 40);
})());

console.log(ok ? "\nALL CHECKS PASS" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
