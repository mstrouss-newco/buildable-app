// ============================================================================
//  qa/kid-game-robot.mjs — THE BUILD GATE (Session CB2).
//
//  A kid's game is a manifest an AI wrote. Validating it proves the SHAPE is
//  right; it does not prove anybody can finish the game. So before a kid game is
//  kept or shared, a robot plays every level of it and says, per level:
//
//      beatable | not-beatable | too-long | untested
//
//  THIS IS NOT A THIRD ROBOT. It is the same headless sandbox the qa-*.mjs
//  runners have always used — the engine's own <script> blocks in a vm with the
//  browser stubbed, driven through the engine's own sim() hook — packaged so a
//  manifest that is NOT on disk can be played too. qa-breaker.mjs and
//  qa-sling.mjs still exist and still guard the SHIPPED games; this module
//  guards the ones kids make.
//
//  Reading files is injected, because the caller knows where they are: the QA
//  runners read public/ off disk, api/kid-game-check.js reads disk first and
//  falls back to fetching from its own deployment (the api/_manifestLib.js
//  pattern). Nothing here fetches on its own.
//
//      import { playManifest } from "./qa/kid-game-robot.mjs";
//      const v = await playManifest(manifest, "breaker", { read });
//      v.beatable        // false means: do not keep this game
//      v.levels          // one verdict per level, with the reason
//      v.suggestion      // an easier variant that DID pass, when one exists
// ============================================================================
import vm from "vm";

// How long a level may take before it stops being fun. Frames, at 60/s. These are
// set ABOVE what our own shipped games do (Breaker's longest is about 212s of bot
// play, Castle Guard's finale about 162s), so the line catches a runaway level
// rather than second-guessing a game we already ship.
const TOO_LONG = { breaker: 60 * 420, sling: 60 * 18, castleguard: 60 * 420 };
const SIM_BUDGET = { breaker: 60000, sling: 20000, castleguard: 120000 };

// Which shared libs each engine's page pulls in, in page order. Same lists the
// qa-*.mjs runners use, for the same reason: the engine expects them to be there.
const LIBS = {
  breaker: ["buildable-renders.js", "buildable-audio.js", "buildable-mechanics.js", "buildable-startscreen.js", "buildable-wincard.js", "buildable-feel.js"],
  sling: ["buildable-renders.js", "buildable-audio.js", "buildable-mechanics.js", "buildable-startscreen.js", "buildable-gamenav.js", "buildable-viewport.js", "matter.min.js"],
  castleguard: ["buildable-renders.js", "buildable-audio.js", "buildable-mechanics.js", "buildable-startscreen.js", "buildable-gamenav.js", "buildable-wincard.js"],
};
const PAGE = { breaker: "breaker-engine.html", sling: "sling-squad.html", castleguard: "castle-guard.html", skyflyer: "skyflyer-engine.html" };

// ---------------------------------------------------------------------------
//  The headless browser the engines already run in. Kept deliberately close to
//  qa-breaker.mjs / qa-sling.mjs so an engine cannot behave differently here.
// ---------------------------------------------------------------------------
function makeSandbox() {
  const noop = () => {};
  const ctxStub = new Proxy({}, {
    get: (_, k) => (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop: noop })
      : (k === "measureText" ? ((t) => ({ width: String(t || "").length * 8 }))
      : (k === "canvas" ? { width: 960, height: 600 } : (typeof k === "string" ? noop : undefined))),
  });
  function el(withAppend) {
    const e = { style: { setProperty: noop }, classList: { add: noop, remove: noop, contains: () => false },
      addEventListener: noop, removeEventListener: noop, getContext: () => ctxStub, onclick: null, textContent: "",
      width: 960, height: 600, naturalWidth: 0, complete: false,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }) };
    Object.defineProperty(e, "innerHTML", { set() {}, get() { return ""; } });
    if (withAppend) { e.appendChild = noop; e.removeChild = noop; }
    return e;
  }
  class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } addEventListener() {} }
  const documentStub = { getElementById: (id) => (id === "start" ? el(false) : el(true)), querySelector: () => el(true),
    addEventListener: noop, createElement: () => el(true), head: el(true), documentElement: el(true) };
  const sandbox = { document: documentStub, Image: ImageStub, requestAnimationFrame: noop, cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    fetch: () => Promise.reject(new Error("no-net")).catch(() => {}),
    performance: { now: () => Date.now() }, URLSearchParams, location: { search: "" }, Date, Math, console };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}
const inlineScripts = (html) => [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");

const levelName = (m, i) => {
  const lv = (Array.isArray(m.levels) && m.levels[i]) || {};
  return { id: lv.id || "L" + (i + 1), name: lv.name || ("Level " + (i + 1)) };
};

// ---------------------------------------------------------------------------
//  One play-through of one manifest. Returns the per-level verdicts.
// ---------------------------------------------------------------------------
async function runOnce(manifest, engine, read) {
  const page = PAGE[engine];
  if (!page) return { robot: "none", note: "there is no robot for '" + engine + "'", levels: [] };

  // Sky Flyer's flight needs a real DOM and WebGL (see qa-skyflyer.mjs), which is
  // not something a save can wait on. It is checked STRUCTURALLY instead, and the
  // verdict says so rather than claiming a play-through it never did.
  if (engine === "skyflyer") return structureOnly(manifest);

  const html = await read(page);
  const libSrc = [];
  for (const f of (LIBS[engine] || [])) { const t = await read(f); if (t) libSrc.push(t); }
  const manifestLib = await read("buildable-manifest.js");
  if (!html || !manifestLib) return { robot: "none", note: "the engine's own files could not be read, so nothing was played", levels: [] };

  const sb = makeSandbox();
  vm.runInContext(manifestLib, sb, { filename: "buildable-manifest.js" });
  const BM = sb.BuildableManifest;
  if (!BM || !BM.validate) return { robot: "none", note: "the shared manifest loader did not load", levels: [] };

  // Breaker is driven ENTIRELY from the manifest, so the config goes in before the
  // engine boots. Sling applies it through its own hook after boot. Castle Guard's
  // levels belong to the engine (the manifest only renames them), so it plays its own.
  if (engine === "breaker") sb.window.GAME_CONFIG = BM.toEngineConfig(manifest);
  vm.runInContext(libSrc.join("\n") + "\n" + inlineScripts(html), sb, { filename: engine });

  const G = sb.BUILDABLE_GAME;
  if (!G || typeof G.sim !== "function") return { robot: "none", note: "the engine did not expose its play hook", levels: [] };
  if (engine === "sling" && typeof G._applyManifest === "function") {
    try { G._applyManifest(BM.toEngineConfig(manifest), manifest); } catch (e) { /* keeps its built-in levels */ }
  }

  const cfg = (typeof G._cfg === "function" ? G._cfg() : null) || { levels: [] };
  const engineLevels = Array.isArray(cfg.levels) ? cfg.levels.length : 0;
  const wanted = Array.isArray(manifest.levels) ? manifest.levels.length : 0;
  const budget = SIM_BUDGET[engine], tooLong = TOO_LONG[engine];
  const levels = [];

  for (let i = 0; i < wanted; i++) {
    const { id, name } = levelName(manifest, i);
    // Castle Guard levels are the engine's own; a manifest level maps to one by
    // its wave number, and a wave the engine does not have cannot be played.
    let idx = i;
    if (engine === "castleguard") {
      const w = manifest.levels[i] && manifest.levels[i].parts && manifest.levels[i].parts.wave;
      idx = (typeof w === "number" ? w - 1 : i);
    }
    if (idx < 0 || idx >= engineLevels) {
      levels.push({ id, name, verdict: "not-beatable", note: "this level points at something the engine does not have" });
      continue;
    }
    let best = null, won = false;
    for (let t = 0; t < 3 && !won; t++) {
      let r = null;
      try { r = G.sim(idx, budget); } catch (e) { r = { result: "error", frames: 0, error: String((e && e.message) || e) }; }
      if (!best || (r && r.result === "win")) best = r;
      won = !!(r && r.result === "win");
    }
    const frames = (best && best.frames) || 0;
    if (!won) levels.push({ id, name, verdict: "not-beatable", frames, note: "the robot played it three times and never finished it" });
    else if (frames > tooLong) levels.push({ id, name, verdict: "too-long", frames, seconds: Math.round(frames / 60), note: "it takes about " + Math.round(frames / 60) + " seconds, which is a long wait for a child" });
    else levels.push({ id, name, verdict: "beatable", frames, seconds: Math.round(frames / 60) });
  }
  return { robot: "played", levels };
}

// Sky Flyer: the goals a world sets have to be reachable. This is the whole of
// what a manifest can get wrong there, because the world itself grows from the
// theme and there is no way to lose.
function structureOnly(manifest) {
  const levels = (Array.isArray(manifest.levels) ? manifest.levels : []).map((lv, i) => {
    const { id, name } = levelName(manifest, i);
    const p = lv.parts || {};
    const pads = typeof p.pads === "number" ? p.pads : 2;
    const need = typeof p.goalLandings === "number" ? p.goalLandings : 1;
    const coins = typeof p.goalCoins === "number" ? p.goalCoins : 12;
    if (need > pads) return { id, name, verdict: "not-beatable", note: "it asks for " + need + " landings but only has " + pads + " pads" };
    if (coins > 40) return { id, name, verdict: "not-beatable", note: "it asks for " + coins + " coins, more than a world holds" };
    if (coins > 30) return { id, name, verdict: "too-long", note: "scooping " + coins + " coins is a long flight for a child" };
    return { id, name, verdict: "beatable", note: "checked, not flown: this world's goals are reachable" };
  });
  return { robot: "structure", note: "Sky Flyer's flight needs a real browser, so its goals were checked rather than flown", levels };
}

const worst = (levels) => levels.some((l) => l.verdict === "not-beatable") ? "not-beatable"
  : levels.some((l) => l.verdict === "too-long") ? "too-long" : "beatable";

// ---------------------------------------------------------------------------
//  THE DOOR. Play the manifest; if it fails, try the ONE named recipe that makes
//  a game gentler and offer the result, so a kid is never left with a dead end.
// ---------------------------------------------------------------------------
export async function playManifest(manifest, engine, opts) {
  opts = opts || {};
  const read = opts.read;
  if (typeof read !== "function") throw new Error("playManifest needs opts.read");
  const run = await runOnce(manifest, engine, read);
  const levels = run.levels || [];
  const verdict = levels.length ? worst(levels) : "untested";
  const out = {
    ok: true, engine, robot: run.robot, verdict,
    beatable: verdict === "beatable" || verdict === "too-long" || verdict === "untested",
    playable: verdict !== "not-beatable",
    levels, note: run.note || null, checkedAt: new Date().toISOString(),
    suggestion: null,
  };
  if (verdict === "not-beatable" && opts.suggest !== false && opts.recipes) {
    try {
      const easier = opts.recipes.apply("easier", manifest, {}, opts.sheet || null);
      if (easier && easier.ok) {
        const retry = await runOnce(easier.manifest, engine, read);
        const rv = (retry.levels || []).length ? worst(retry.levels) : "untested";
        if (rv !== "not-beatable") out.suggestion = { recipe: "easier", why: "one step easier and the robot finished every level", manifest: easier.manifest };
      }
    } catch (e) { /* a suggestion is a bonus, never a reason to fail the check */ }
  }
  return out;
}

export default playManifest;
