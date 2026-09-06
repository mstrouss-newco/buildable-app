// qa-rules.mjs — the RULES VOCABULARY gate (Session CB2, layer two).
//
// A manifest may carry rules:[{when,do,params}]. The vocabulary lives in
// public/buildable-mechanics.js; which of it an engine REALLY fires lives in that
// engine's cobuild sheet. This harness holds all of that to its word:
//
//   1. the vocabulary is the short closed list it claims to be,
//   2. an unknown moment or an unknown action is REJECTED, by the shared
//      validator and by strict manifest validation against the sheet,
//   3. the runtime does what each action says, survives a host that throws, and
//      counts everyNSeconds in real seconds,
//   4. SLING REALLY FIRES ITS EVENTS — proved by playing a level with a rule in
//      it and catching what the rule did, not by reading the source,
//   5. Sky Flyer carries the same wiring at all five of its moments,
//   6. a game with rules in it still beats the robot.
//
// Run:  node qa-rules.mjs
import fs from "fs";
import vm from "vm";
import { playManifest } from "./qa/kid-game-robot.mjs";

const read = (f) => { try { return fs.readFileSync("public/" + f, "utf8"); } catch { return null; } };
const readJson = (f) => JSON.parse(read(f));
let ok = true;
const chk = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!cond) ok = false; };

function lib(file) {
  const sb = { console, Math, JSON, Object, Array, String, RegExp, parseInt, isNaN, isFinite };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
  vm.runInContext(read(file), sb, { filename: file });
  return sb;
}
const BM = lib("buildable-mechanics.js").BuildableMechanics;
const BMAN = lib("buildable-manifest.js").BuildableManifest;

console.log("--- the vocabulary ---");
const EVENTS = ["onLand", "onCollect", "onHit", "everyNSeconds", "onLevelStart", "onWin"];
const ACTIONS = ["playSound", "sayLine", "spawn", "speedUp", "slowDown", "addPoints", "loseItem", "showText"];
chk("the events are exactly the six the contract names", JSON.stringify(BM.RULE_EVENTS.slice().sort()) === JSON.stringify(EVENTS.slice().sort()), BM.RULE_EVENTS.join(", "));
chk("the actions are exactly the eight the contract names", JSON.stringify(BM.RULE_ACTIONS.slice().sort()) === JSON.stringify(ACTIONS.slice().sort()), BM.RULE_ACTIONS.join(", "));
chk("there is a cap on how many rules one game may carry", BM.rules.limit > 0 && BM.rules.limit <= 50, "limit " + BM.rules.limit);

console.log("\n--- an unknown moment or action is rejected ---");
chk("no rules at all is fine", BM.rules.validate(null).ok && BM.rules.validate(undefined).ok);
chk("an unknown moment is rejected", !BM.rules.validate([{ when: "onSneeze", do: "sayLine" }]).ok);
chk("an unknown action is rejected", !BM.rules.validate([{ when: "onWin", do: "launchRocket" }]).ok);
chk("rules that are not a list are rejected", !BM.rules.validate({ when: "onWin", do: "sayLine" }).ok);
chk("too many rules are rejected", !BM.rules.validate(new Array(BM.rules.limit + 1).fill({ when: "onWin", do: "sayLine" })).ok);
chk("everyNSeconds without a sensible number is rejected",
  !BM.rules.validate([{ when: "everyNSeconds", do: "sayLine", params: { seconds: 0 } }]).ok &&
  !BM.rules.validate([{ when: "everyNSeconds", do: "sayLine" }]).ok &&
  BM.rules.validate([{ when: "everyNSeconds", do: "sayLine", params: { seconds: 10 } }]).ok);

console.log("\n--- the sheet, not the vocabulary, decides what an engine can be told ---");
const ENGINES = ["breaker", "sling", "castleguard", "skyflyer"];
const sheets = {}, stock = {};
for (const e of ENGINES) { sheets[e] = readJson(e + "/cobuild.json"); stock[e] = readJson(e + "/manifest.json"); }
for (const e of ENGINES) {
  const sr = (sheets[e].rules || {});
  chk(`${e}'s sheet names only real events and actions`,
    (sr.events || []).every((x) => EVENTS.includes(x)) && (sr.actions || []).every((x) => ACTIONS.includes(x)),
    (sr.events || []).join("/") + " -> " + (sr.actions || []).join("/"));
}
const withRule = (e, rule) => Object.assign({}, stock[e], { rules: [rule] });
chk("strict validation rejects a moment this engine never fires",
  !BMAN.validate(withRule("castleguard", { when: "onCollect", do: "sayLine", params: { text: "hi" } }), { strict: true, sheet: sheets.castleguard }).ok,
  "Castle Guard has no onCollect");
chk("strict validation rejects an action this engine cannot do",
  !BMAN.validate(withRule("castleguard", { when: "onWin", do: "speedUp" }), { strict: true, sheet: sheets.castleguard }).ok);
chk("strict validation accepts a rule the engine really fires",
  BMAN.validate(withRule("sling", { when: "onCollect", do: "sayLine", params: { text: "Got one!" } }), { strict: true, sheet: sheets.sling }).ok,
  JSON.stringify(BMAN.validate(withRule("sling", { when: "onCollect", do: "sayLine", params: { text: "Got one!" } }), { strict: true, sheet: sheets.sling }).errors));
chk("strict validation rejects a rule with a field nothing reads",
  !BMAN.validate(withRule("sling", { when: "onWin", do: "sayLine", params: {}, andAlso: "explode" }), { strict: true, sheet: sheets.sling }).ok);

console.log("\n--- the runtime does what it says ---");
const seen = [];
const host = {
  playSound: (n) => seen.push("sound:" + n), sayLine: (t) => seen.push("say:" + t), showText: (t) => seen.push("text:" + t),
  spawn: (w) => seen.push("spawn:" + w), speedUp: (b) => seen.push("faster:" + b), slowDown: (b) => seen.push("slower:" + b),
  addPoints: (n) => seen.push("points:" + n), loseItem: (w) => seen.push("lose:" + w),
};
const every = ACTIONS.map((a) => ({ when: "onWin", do: a, params: { text: "hi", sound: "win", what: "star", points: 3, by: 2 } }));
const rt = BM.rules.make({ rules: every }, host);
rt.fire("onWin", {});
chk("every action reaches the host", seen.length === ACTIONS.length, seen.join(" | "));
chk("an unknown action never runs at all", BM.rules.make({ rules: [{ when: "onWin", do: "nope" }] }, host).count === 1 && BM.rules.make({ rules: [{ when: "onWin", do: "nope" }] }, host).fire("onWin") === 0);
chk("a host that throws cannot break the game",
  (function () { try { return BM.rules.make({ rules: [{ when: "onWin", do: "sayLine", params: { text: "x" } }] }, { sayLine: () => { throw new Error("boom"); } }).fire("onWin") === 1; } catch { return false; } })());
chk("with no host at all nothing throws",
  (function () { try { BM.rules.make({ rules: every }, null).fire("onWin", { x: 0, y: 0 }); return true; } catch { return false; } })());
const ticks = [];
const timer = BM.rules.make({ rules: [{ when: "everyNSeconds", do: "sayLine", params: { seconds: 2, text: "tick" } }] }, { sayLine: (t) => ticks.push(t) });
for (let i = 0; i < 300; i++) timer.tick(1 / 60);
chk("everyNSeconds counts real seconds", ticks.length === 2, ticks.length + " ticks in 5 seconds at 2s apart");
timer.reset(); ticks.length = 0;
for (let i = 0; i < 60; i++) timer.tick(1 / 60);
chk("reset puts the clock back to the start of a level", ticks.length === 0);

console.log("\n--- Sling really fires its events (played, not read) ---");
{
  const noop = () => {};
  const ctxStub = new Proxy({}, { get: (_, k) => (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop: noop }) : (k === "canvas" ? { width: 960, height: 600 } : (typeof k === "string" ? noop : undefined)) });
  function el(withAppend) { const e = { style: { setProperty: noop }, classList: { add: noop, remove: noop, contains: () => false }, addEventListener: noop, removeEventListener: noop, getContext: () => ctxStub, onclick: null, textContent: "", width: 960, height: 600, naturalWidth: 0, complete: false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
    Object.defineProperty(e, "innerHTML", { set() {}, get() { return ""; } }); if (withAppend) { e.appendChild = noop; e.removeChild = noop; } return e; }
  class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
  const sb = { document: { getElementById: (id) => (id === "start" ? el(false) : el(true)), querySelector: () => el(true), addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true) },
    Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop, removeEventListener: noop,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    fetch: () => Promise.reject(new Error("no-net")).catch(() => {}), performance: { now: () => Date.now() }, URLSearchParams, location: { search: "" }, Date, Math, console };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
  const libs = ["buildable-renders.js", "buildable-audio.js", "buildable-mechanics.js", "buildable-startscreen.js", "buildable-gamenav.js", "buildable-viewport.js", "matter.min.js"].map(read).join("\n");
  vm.runInContext(read("buildable-manifest.js"), sb, { filename: "buildable-manifest.js" });
  const engine = [...read("sling-squad.html").matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  vm.runInContext(libs + "\n" + engine, sb, { filename: "sling" });

  const heard = [];
  if (sb.BuildableAudio) sb.BuildableAudio.sfx = (n) => heard.push(n);
  const m = Object.assign({}, stock.sling, { rules: [
    { when: "onLevelStart", do: "playSound", params: { sound: "rule-start" } },
    { when: "onCollect", do: "playSound", params: { sound: "rule-collect" } },
    { when: "onHit", do: "playSound", params: { sound: "rule-hit" } },
    { when: "onWin", do: "playSound", params: { sound: "rule-win" } },
  ] });
  sb.BUILDABLE_GAME._applyManifest(sb.BuildableManifest.toEngineConfig(m), m);
  chk("the runtime is built when a manifest with rules lands", !!sb.RULES && sb.RULES.count === 4, "count " + (sb.RULES && sb.RULES.count));
  // Level 1 is the gentlest building in the game and a good shot can clear it
  // without a single block breaking, so onHit is looked for across the on-ramp.
  const res = sb.BUILDABLE_GAME.sim(0, 20000);
  for (let i = 1; i < 20 && !heard.includes("rule-hit"); i++) sb.BUILDABLE_GAME.sim(i, 20000);
  chk("onLevelStart fired", heard.includes("rule-start"));
  chk("onCollect fired when a critter was rescued", heard.includes("rule-collect"));
  chk("onHit fired when a block was smashed", heard.includes("rule-hit"));
  chk("onWin fired when the level was cleared", res.result === "win" && heard.includes("rule-win"), "sim result " + res.result);
  chk("a manifest with no rules leaves the runtime switched off",
    (function () { const plain = Object.assign({}, stock.sling); delete plain.rules;
      sb.BUILDABLE_GAME._applyManifest(sb.BuildableManifest.toEngineConfig(plain), plain); return sb.RULES === null; })());
}

console.log("\n--- Sky Flyer carries the same wiring ---");
{
  const src = read("skyflyer-engine.html");
  chk("Sky Flyer loads the shared mechanics library", /<script src="\/buildable-mechanics\.js">/.test(src));
  chk("Sky Flyer builds the runtime from its manifest", /buildRules\(m\)/.test(src) && /BMX\.rules\.make/.test(src));
  for (const ev of ["onLevelStart", "onCollect", "onLand", "onWin"]) chk(`Sky Flyer fires ${ev}`, new RegExp('fireRule\\("' + ev + '"').test(src));
  chk("Sky Flyer ticks everyNSeconds while it is not paused", /RULES && !S\.paused\) RULES\.tick\(dt/.test(src));
  chk("Sky Flyer's sheet lists exactly the moments it fires",
    JSON.stringify((sheets.skyflyer.rules.events || []).slice().sort()) === JSON.stringify(["everyNSeconds", "onCollect", "onLand", "onLevelStart", "onWin"]));
}

console.log("\n--- a game with rules in it still beats the robot ---");
for (const e of ["breaker", "sling", "castleguard", "skyflyer"]) {
  const evs = sheets[e].rules.events.filter((x) => x !== "everyNSeconds");
  const rules = evs.map((w) => ({ when: w, do: "sayLine", params: { text: "Well done!" } }));
  rules.push({ when: "everyNSeconds", do: "sayLine", params: { seconds: 5, text: "Keep going!" } });
  const m = Object.assign({}, stock[e], { rules });
  const v = BMAN.validate(m, { strict: true, sheet: sheets[e] });
  chk(`${e} accepts a rule on every moment it fires`, v.ok, (v.errors || []).slice(0, 2).join(" | "));
  const play = await playManifest(m, e, { read: async (f) => read(f) });
  chk(`${e} with rules still beats the robot`, play.playable, play.verdict);
}

console.log(ok ? "\nALL CHECKS PASS" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
