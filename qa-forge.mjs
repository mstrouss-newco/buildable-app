// qa-forge.mjs — LAYER THREE'S GATE (Session CB5).
//
// The forge is the only place in this product where something a model wrote gets
// handed to a child. So it is tested end to end, headless, with NO api keys and
// NO database, on three sentences a child might really say:
//
//     "a lemonade stand", "a maze with a ghost in it", "a fishing game"
//
// A stub model stands in for the real one and returns a real, working cartridge,
// so the whole path runs for real: brief -> parse -> static checks -> strict
// validation -> the robot PLAYS it -> did it talk to the shell. Then the same
// path is run again with a model that returns something WRONG in each of the
// ways that matter, and every one has to be refused.
//
// Run:  node qa-forge.mjs
import fs from "fs";
import { staticCheck, briefFor, partsFrom, ALLOWED_LIBS, MAX_BYTES } from "./api/_forgeSpec.js";
import { gate, forge, DOC_FILES } from "./api/cobuild-forge.js";

const read = async (f) => { try { return fs.readFileSync("public/" + f, "utf8"); } catch { return null; } };
let ok = true;
const chk = (name, pass, extra = "") => { console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!pass) ok = false; };

const IDEAS = [
  { idea: "a lemonade stand where I sell drinks to people", name: "Lemonade Stand", star: "a smiling kid", theme: "grass" },
  { idea: "a maze with a ghost in it", name: "Ghost Maze", star: "a brave torch", theme: "forest" },
  { idea: "a fishing game on a little boat", name: "Fishing Day", star: "a small boat", theme: "ocean" },
];

// ---------------------------------------------------------------------------
//  THE STUB MODEL. It returns a cartridge that really is a game: the player walks
//  to every drop on the level and the level is done. Deliberately plain — it is
//  standing in for the model, not showing off — but it is a genuine, finishable
//  canvas game that obeys every rule in api/_forgeSpec.js, which is the only way
//  to prove the gate PASSES things as well as refusing them.
// ---------------------------------------------------------------------------
const CARTRIDGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Forged game</title>
<style>html,body{margin:0;background:#0d1b2a;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
</head><body>
<canvas id="c" width="960" height="600"></canvas>
<script src="/buildable-feel.js"></script>
<script>
(function(){
  "use strict";
  var CFG = (typeof window !== "undefined" && window.GAME_CONFIG) || { levels: [] };
  var LEVELS = (CFG.levels || []).map(function(lv, i){
    var goal = (lv && lv.parts && typeof lv.parts.goal === "number") ? lv.parts.goal : 4 + i;
    var drops = [];
    for (var d = 0; d < goal; d++) drops.push({ x: 120 + d * 90, y: 160 + (d % 3) * 130, got: false });
    return { id: (lv && lv.id) || ("L" + (i+1)), name: (lv && lv.name) || ("Level " + (i+1)), drops: drops, goal: goal };
  });
  if (!LEVELS.length) LEVELS = [{ id: "L1", name: "Level 1", drops: [{ x: 200, y: 200, got: false }], goal: 1 }];

  function say(kind){ try { window.parent.postMessage({ source: "buildable", kind: kind }, "*"); } catch (e) {} }

  // One world, stepped by hand. The same step() runs on screen and in sim(), so
  // what the robot plays is exactly what a child plays.
  function world(i){
    var lv = LEVELS[i] || LEVELS[0];
    return { i: i, hero: { x: 480, y: 300 }, drops: lv.drops.map(function(d){ return { x: d.x, y: d.y, got: false }; }),
             at: 0, got: 0, goal: lv.goal, done: false };
  }
  // One drop at a time, in order, so a frame costs the same whether the level has
  // four things on it or four thousand.
  function step(w, aim){
    if (w.done) return w;
    while (w.at < w.drops.length && w.drops[w.at].got) w.at++;
    var t = w.drops[w.at];
    if (!t){ w.done = true; return w; }
    var target = aim || t, sp = 4;
    var dx = target.x - w.hero.x, dy = target.y - w.hero.y, len = Math.sqrt(dx*dx + dy*dy) || 1;
    w.hero.x += (dx / len) * sp; w.hero.y += (dy / len) * sp;
    if (Math.abs(t.x - w.hero.x) < 10 && Math.abs(t.y - w.hero.y) < 10){ t.got = true; w.got++; w.at++; }
    if (w.got >= w.goal) w.done = true;
    return w;
  }

  var W = world(0), painting = false;
  function draw(){
    var c = document.getElementById("c"); if (!c || !c.getContext) return;
    var g = c.getContext("2d");
    g.fillStyle = "#0d1b2a"; g.fillRect(0, 0, 960, 600);
    for (var k = 0; k < W.drops.length; k++){
      var d = W.drops[k]; if (d.got) continue;
      g.fillStyle = "#FFD86B"; g.beginPath(); g.arc(d.x, d.y, 12, 0, 6.3); g.fill();
    }
    g.fillStyle = "#9B7BFF"; g.beginPath(); g.arc(W.hero.x, W.hero.y, 16, 0, 6.3); g.fill();
  }
  function loop(){
    step(W, null); draw();
    if (W.done){
      if (W.i >= LEVELS.length - 1) { say("win"); return; }
      say("levelup"); W = world(W.i + 1);
    }
    if (painting) requestAnimationFrame(loop);
  }
  function begin(){ painting = true; requestAnimationFrame(loop); }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function"){
    window.addEventListener("message", function(e){
      var d = e && e.data; if (!d) return;
      if (d.type === "pause" || d.kind === "pause") painting = false;
      if (d.type === "resume" || d.kind === "resume") begin();
    });
  }
  if (typeof document !== "undefined" && document.getElementById && document.getElementById("c")) begin();

  // The play hook the robot uses. No canvas, no timers, no drawing.
  window.BUILDABLE_GAME = {
    _cfg: function(){ return { levels: LEVELS }; },
    sim: function(levelIndex, budget){
      var w = world(levelIndex || 0), frames = 0, cap = budget || 20000;
      while (frames < cap && !w.done){ step(w, null); frames++; }
      if (w.done) { say("levelup"); if ((levelIndex || 0) >= LEVELS.length - 1) say("win"); }
      return { result: w.done ? "win" : "timeout", frames: frames };
    }
  };
})();
<\/script>
</body></html>`;

const manifestFor = (n, name) => ({
  id: "forged", name, type: "game", shellVersion: 2, levelProfile: "forge", engine: "canvas", entry: "/forge/forged",
  levels: Array.from({ length: n }, (_, i) => ({ id: "L" + (i + 1), name: "Level " + (i + 1), difficulty: i + 1, unlocked: i === 0, parts: { goal: 3 + i } })),
});
const SHEET = {
  sheetVersion: 1, engine: "forged", label: "A forged game", entry: "/forge/forged",
  manifest: { keys: ["id", "name", "type", "shellVersion", "levelProfile", "engine", "entry", "art", "levels"],
              required: ["id", "name", "type", "shellVersion", "levels"], fixed: { type: "game", shellVersion: 2, levelProfile: "forge" } },
  level: { keys: ["id", "name", "difficulty", "unlocked", "parts"], required: ["id", "name", "difficulty"],
           min: 1, max: 6, parts: { keys: ["goal"] } },
};
const answer = (html, manifest, sheet) =>
  "```html\n" + html + "\n```\n```json\n" + JSON.stringify(manifest) + "\n```\n```json\n" + JSON.stringify(sheet) + "\n```";

// ---------------------------------------------------------------------------
console.log("--- 1. the brief: the company's own rules go to the model, not a summary ---");
{
  for (const f of DOC_FILES) chk(`${f} is on disk to be read`, fs.existsSync(f));
  const v = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const fn = (v.functions || {})["api/cobuild-forge.js"] || {};
  chk("vercel ships those docs with the forge function", typeof fn.includeFiles === "string" &&
    DOC_FILES.every((f) => fn.includeFiles.includes(f.replace(/\.md$/, ""))), fn.includeFiles || "no includeFiles");
  const brief = briefFor({ docs: { contract: "CONTRACT-TEXT", building: "BUILDING-TEXT", feel: null, hud: null, mechanics: null },
    idea: "a lemonade stand", star: "a kid", theme: "grass", name: "Lemonade", levels: 3, sheetExample: "{}", failures: [] });
  chk("the cartridge contract is in the brief", brief.includes("CONTRACT-TEXT"));
  chk("a doc that could not be read is left out rather than faked", !brief.includes("undefined") && !brief.includes("null\n"));
  chk("the child's own sentence is in the brief", brief.includes("a lemonade stand"));
  chk("the allowed libraries are named", ALLOWED_LIBS.every((l) => brief.includes(l)));
  chk("the sim hook is demanded, because that is how it gets tested", /sim\(levelIndex, budget\)/.test(brief));
  const again = briefFor({ docs: { contract: "C" }, idea: "x", star: "y", theme: "grass", name: "n", levels: 1,
    failures: ["it used fetch", "level 2 cannot be finished"] });
  chk("a second attempt is told exactly what was wrong the first time", again.includes("it used fetch") && again.includes("level 2 cannot be finished"));
}

console.log("\n--- 2. three sentences a child might say, forged end to end ---");
for (const it of IDEAS) {
  const ask = async () => answer(CARTRIDGE, manifestFor(3, it.name), SHEET);
  const out = await forge({ idea: it.idea, star: it.star, theme: it.theme, name: it.name, levels: 3, ask, read });
  chk(`"${it.idea}" forges a game`, out.ok, (out.problems || []).slice(0, 2).join(" | "));
  chk(`"${it.idea}" needed only one attempt`, out.attempts === 1, String(out.attempts));
  if (!out.ok) continue;
  const lv = (out.played && out.played.levels) || [];
  chk(`"${it.idea}": the robot finished every level`, lv.length === 3 && lv.every((l) => l.verdict === "beatable"),
    lv.map((l) => l.name + "=" + l.verdict).join(", "));
  chk(`"${it.idea}": it told the shell it was won`, (out.played.said || []).some((m) => m && m.kind === "win"));
}

console.log("\n--- 3. the gate REFUSES, one way at a time ---");
{
  const bad = (what, html, manifest, sheet) => ({ what, html: html || CARTRIDGE, manifest: manifest || manifestFor(2, "X"), sheet: sheet || SHEET });
  const CASES = [
    bad("a script from outside the site", CARTRIDGE.replace('<script src="/buildable-feel.js">', '<script src="https://cdn.example.com/x.js">')),
    bad("a library we do not ship", CARTRIDGE.replace('<script src="/buildable-feel.js">', '<script src="/jquery.js">')),
    bad("reaching the network", CARTRIDGE.replace("var CFG =", "fetch('/x'); var CFG =")),
    bad("touching storage", CARTRIDGE.replace("var CFG =", "localStorage.setItem('a','b'); var CFG =")),
    bad("eval", CARTRIDGE.replace("var CFG =", "eval('1'); var CFG =")),
    bad("an emoji", CARTRIDGE.replace("Forged game", "Forged game \u{1F600}")),
    bad("no play hook, so nothing could test it", CARTRIDGE.replace("window.BUILDABLE_GAME =", "var NOPE =")),
    bad("never saying the child won", CARTRIDGE.replace(/say\("win"\)/g, 'say("nearlywin")')),
    bad("a manifest that does not fit its own sheet", CARTRIDGE, { ...manifestFor(2, "X"), sideways: true }),
    bad("more levels than its own sheet allows", CARTRIDGE, manifestFor(9, "X")),
  ];
  for (const c of CASES) {
    const g = await gate({ html: c.html, manifest: c.manifest, sheet: c.sheet, missing: [] }, { read });
    chk(`refused: ${c.what}`, g.ok === false && (g.problems || []).length > 0, (g.problems || [])[0] || "");
  }
  // A level the robot cannot finish: the goal is out of reach of the sim budget.
  const huge = { ...manifestFor(1, "X"), levels: [{ id: "L1", name: "Forever", difficulty: 3, unlocked: true, parts: { goal: 9999 } }] };
  const g = await gate({ html: CARTRIDGE, manifest: huge, sheet: SHEET, missing: [] }, { read });
  chk("refused: a level the robot cannot finish", g.ok === false && /cannot be finished|too long/i.test((g.problems || []).join(" ")), (g.problems || [])[0] || "");
  // And an answer that is not three blocks at all.
  const p = partsFrom("here you go, no code");
  chk("refused: an answer with no cartridge in it", (p.missing || []).length === 3, (p.missing || []).join("; "));
}

console.log("\n--- 4. three tries, each one told what was wrong, then an honest fallback ---");
{
  let seen = [];
  const askBad = async (brief) => { seen.push(brief); return answer(CARTRIDGE.replace("var CFG =", "fetch('/x'); var CFG ="), manifestFor(2, "X"), SHEET); };
  const out = await forge({ idea: "a fishing game", star: "a boat", theme: "ocean", name: "Fish", levels: 2, ask: askBad, read });
  chk("it does not give up on the first try", out.ok === false && out.attempts === 3, String(out.attempts));
  chk("the second attempt was told what the first one did wrong", /YOUR LAST ATTEMPT WAS REFUSED/.test(seen[1] || "") && /fetch/.test(seen[1] || ""));
  chk("it stops at three rather than trying forever", seen.length === 3, String(seen.length));
  chk("and it says why, in words the studio can pass on", (out.problems || []).length > 0, (out.problems || [])[0] || "");

  // A model that is simply not there is a supported state, not an error.
  const none = await forge({ idea: "x", star: "y", theme: "grass", name: "n", levels: 1, ask: async () => null, read });
  chk("no answer from the model is a refusal, never a crash", none.ok === false && (none.problems || []).length > 0);

  // Second-try success: the fix is taken and the game ships.
  let n = 0;
  const askFix = async () => (++n === 1 ? answer(CARTRIDGE.replace("var CFG =", "eval('1'); var CFG ="), manifestFor(2, "X"), SHEET)
                                        : answer(CARTRIDGE, manifestFor(2, "X"), SHEET));
  const fixed = await forge({ idea: "a maze with a ghost", star: "a torch", theme: "forest", name: "Ghost Maze", levels: 2, ask: askFix, read });
  chk("a model that fixes its mistake gets through on the second try", fixed.ok === true && fixed.attempts === 2, String(fixed.attempts));
}

console.log("\n--- 5. the sandbox a forged game is served inside ---");
{
  const src = fs.readFileSync("api/forge.js", "utf8");
  const csp = /const CSP = \[([\s\S]*?)\]\.join/.exec(src);
  const rules = csp ? csp[1] : "";
  chk("nothing is allowed by default", /default-src 'none'/.test(rules));
  chk("the game cannot reach the network at all", /connect-src 'none'/.test(rules));
  chk("it can only run its own code and ours", /script-src 'self' 'unsafe-inline'/.test(rules));
  chk("it cannot be framed by another site", /frame-ancestors 'self'/.test(rules));
  chk("it cannot post a form anywhere", /form-action 'none'/.test(rules));
  chk("the manifest is injected, so a game never asks for one", /window\.GAME_CONFIG = /.test(src));
  chk("only a game that passed its gate is ever served", /status !== "ready" && row\.status !== "promoted"/.test(src));
  chk("the shell embeds it sandboxed as well", /sandbox="allow-scripts"/.test(fs.readFileSync("public/studio.html", "utf8")));
  const v = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const routes = v.routes.map((r) => r.src), at = routes.indexOf("/(.*)");
  const before = (p) => { const i = routes.findIndex((r) => r === p); return i !== -1 && (at === -1 || i < at); };
  chk("/forge/<id> is routed to the sandbox, not to the landing page", before("/forge/([A-Za-z0-9][A-Za-z0-9-]{1,63})"));
  chk("/studio/forge-review is routed", before("/studio/forge-review"));
  chk("a forged game's own link reopens it", before("/studio/forge/([A-Za-z0-9][A-Za-z0-9-]{1,63})"));
}

console.log("\n--- 6. what a child sees while a game is being written ---");
{
  const s = fs.readFileSync("public/studio.html", "utf8");
  chk("a layer-three idea forges instead of building the nearest game", /p\.layerThree && p\.layerThree\.forge\) \? forgeIt\(\)/.test(s));
  chk("Buddy says plainly that this one has never been made before", /Nobody has made this one before/.test(s));
  chk("there is something to play while it is written", /Play '\+esc\(l3\.nearestLabel/.test(s));
  chk("a forged game is labelled as one Buddy is still learning", /Buddy is still learning this one/.test(s));
  chk("Keep still waits for the family to beat it", /S\.beaten \? forgeKeep\(\)/.test(s));
  chk("layer three counts as two games on the meter", /meterCount\("new"\); meterCount\("new"\)/.test(s));
  chk("a forge that fails still leaves the child with a game that works", /S\.said="I could not get that one finished today/.test(s));
  const plan = fs.readFileSync("api/cobuild-plan.js", "utf8");
  chk("the plan door is what flags layer three", /forge: true/.test(plan));
}

console.log("\n--- 7. promotion: the owner decides, a person still reads it ---");
{
  const api = fs.readFileSync("api/cobuild-forge.js", "utf8");
  chk("the queue is grown-up gated", /if \(op === "queue"\)[\s\S]{0,120}grownupOk/.test(api));
  chk("promoting is grown-up gated", /if \(op === "promote"\)[\s\S]{0,120}grownupOk/.test(api));
  chk("only a game that passed can be promoted", /only a game that passed its gate can be promoted/.test(api));
  chk("the button stages files, it does not write to the repo", /scripts\/promote-forge\.mjs/.test(api));
  const script = fs.readFileSync("scripts/promote-forge.mjs", "utf8");
  for (const f of ["public/${engine}.html", "public/${engine}/manifest.json", "public/${engine}/cobuild.json", "qa-${engine}.mjs"]) {
    chk(`promotion writes ${f.replace("${engine}", "<engine>")}`, script.includes(f));
  }
  chk("promotion routes the new page, or it would serve as the landing page", /vercel\.json/.test(script) && /\/\(\.\*\)/.test(script));
  chk("promotion refuses to overwrite a game that already ships", /already exists; pick another engine id/.test(script));
  chk("the promoted game gets a QA harness that plays it on every run", /playManifest\(manifest/.test(script));
  chk("the family that asked for it gets the credit on its card", /their name belongs on its card|Their name belongs on its card/.test(script));
  chk("adding the tile is left to a person", /GAME_CATALOG/.test(script));
  const page = fs.readFileSync("public/studio-forge.html", "utf8");
  chk("the review queue shows plays, finishes and hearts", /played <\/, ?|played/.test(page) && /finished/.test(page) && /loved/.test(page));
  chk("every idea that could not be built is listed as a roadmap signal", /What kids asked for that we could not build/.test(page));
  chk("the review page holds no code of its own", !/1111|1025/.test(page));
}

console.log("\n--- 8. the size cap is real ---");
{
  const huge = CARTRIDGE + "\n<!--" + "x".repeat(MAX_BYTES) + "-->";
  const s = staticCheck(huge);
  chk("a cartridge bigger than the cap is refused", s.ok === false && /KB/.test(s.problems.join(" ")), s.problems[0] || "");
  const good = staticCheck(CARTRIDGE);
  chk("and the stub cartridge itself passes every static check", good.ok, (good.problems || []).join(" | "));
}

console.log(ok ? "\nALL CHECKS PASS  layer three writes a game, the gate refuses the rest." : "\nSOMETHING IS WRONG  (see FAIL lines above)");
process.exit(ok ? 0 : 1);
