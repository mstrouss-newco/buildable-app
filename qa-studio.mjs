// qa-studio.mjs — THE STUDIO gate (Session CB3).
//
// The studio is the door a child walks through, so it is checked end to end,
// headless, on all four engines:
//
//   plan -> build -> tweak -> keep
//
// with NO api keys and NO database. That is deliberate. Everything the studio
// promises a child must hold when the model is down and the picture machine is
// off: the engine is chosen from the plain words each cobuild sheet carries, the
// manifest is assembled from a shipped game by CB2 recipes, and the robot plays
// every version. A green run here means a family gets a real, finishable game out
// of a sentence even on our worst day.
//
// Run:  node qa-studio.mjs
import fs from "fs";
import vm from "vm";
import { playManifest } from "./qa/kid-game-robot.mjs";

const read = (f) => { try { return fs.readFileSync("public/" + f, "utf8"); } catch { return null; } };
const readJson = (f) => JSON.parse(read(f));
let ok = true;
const chk = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  ::  " + extra : "")); if (!cond) ok = false; };

// call an API handler the way Vercel would, without a server
const call = (mod, req) => new Promise((resolve) => {
  const res = { _c: 200, status(c) { this._c = c; return this; },
    json(j) { resolve({ code: this._c, body: j }); },
    send() { resolve({ code: this._c, body: "bytes" }); }, setHeader() {} };
  Promise.resolve(mod.default({ method: "POST", url: "/x", on() {}, headers: {}, query: {}, ...req }, res)).catch((e) => resolve({ code: 500, body: { ok: false, error: String(e && e.message) } }));
});

const plan = await import("./api/cobuild-plan.js");
const edit = await import("./api/cobuild-edit.js");
const studio = await import("./api/asset-studio.js");
const transcribe = await import("./api/transcribe.js");
const voice = await import("./api/cobuild-voice.js");
const { checkManifest } = await import("./api/kid-game.js");

const ENGINES = ["breaker", "sling", "castleguard", "skyflyer"];
const sheets = {}; for (const e of ENGINES) sheets[e] = readJson(e + "/cobuild.json");

// A sentence a child might really say, written to land on each engine through the
// sheets' own words rather than by naming the engine.
const IDEAS = {
  breaker: "bounce a ball at a wall of bricks and smash them all",
  sling: "fling a monkey at a wobbly tower to knock it over",
  castleguard: "guard my castle so the goblins never get in",
  skyflyer: "fly a little plane around islands and grab coins",
};

console.log("--- 1. the plan door: a sentence becomes a real game, with no keys ---");
const plans = {};
for (const e of ENGINES) {
  let r = await call(plan, { body: { text: IDEAS[e] } });
  chk(`${e}: asks who the star is first, not a settings screen`, !!(r.body.ask && r.body.ask.id === "star"), JSON.stringify(r.body.ask && r.body.ask.question));
  r = await call(plan, { body: { text: IDEAS[e], answers: { star: "A brave hedgehog" } } });
  chk(`${e}: then asks one more question, and only one`, !!(r.body.ask && r.body.ask.id === "hard"));
  r = await call(plan, { body: { text: IDEAS[e], answers: { star: "A brave hedgehog", hard: "middle" } } });
  const p = r.body.plan;
  chk(`${e}: the words picked the right game`, !!p && p.engine === e, p ? p.engine : JSON.stringify(r.body));
  if (!p) continue;
  plans[e] = p;
  const v = await checkManifest(p.manifest, e);
  chk(`${e}: the plan is strict-valid against its own sheet`, v.ok, (v.errors || []).slice(0, 3).join(" | "));
  const play = await playManifest(p.manifest, e, { read: async (f) => read(f) });
  chk(`${e}: the robot can finish the game the plan made`, play.playable, play.verdict);
  chk(`${e}: the plan says which game and why, in kid words`, typeof p.why === "string" && p.why.length > 10 && !/manifest|engine config|schema/i.test(p.why), p.why);
  chk(`${e}: every chip can be tapped to change something`, (p.chips || []).length >= 4 && p.chips.every((c) => c.kind === "text" || (c.options || []).length));
  chk(`${e}: the art it plans only fills slots this game really has`,
    (p.art || []).every((a) => a.slot === "cover" || (sheets[e].art || []).some((s) => s.key === a.key)),
    (p.art || []).map((a) => a.slot + (a.key ? "=" + a.key : "")).join(", "));
  chk(`${e}: the build has a story to narrate`, (p.story || []).length >= 3);
}

console.log("\n--- 2. tapping a chip rebuilds a game that is still valid and still beatable ---");
for (const e of ENGINES) {
  const p = plans[e]; if (!p) continue;
  const themes = (p.chips.find((c) => c.id === "theme") || {}).options || [];
  const other = themes.find((t) => t !== p.theme);
  if (other) {
    const r = await call(plan, { body: { op: "chip", plan: p, chip: "theme", value: other } });
    chk(`${e}: changing the world keeps it valid`, !!(r.body.ok && r.body.plan), r.body.error || "");
    if (r.body.plan) {
      const v = await checkManifest(r.body.plan.manifest, e);
      chk(`${e}: ...and strict-valid`, v.ok, (v.errors || []).slice(0, 2).join(" | "));
    }
  }
  const r2 = await call(plan, { body: { op: "chip", plan: p, chip: "levels", value: 2 } });
  chk(`${e}: asking for 2 levels really gives 2`, !!(r2.body.plan && r2.body.plan.manifest.levels.length === 2), r2.body.plan ? r2.body.plan.manifest.levels.length : r2.body.error);
  const r3 = await call(plan, { body: { op: "chip", plan: p, chip: "theme", value: "banana-republic" } });
  chk(`${e}: a world this game does not have is refused in plain words`, r3.body.ok === false && /does not have/.test(r3.body.error || ""), r3.body.error);
}

console.log("\n--- 3. the tweak door: every tile on the page works on every engine ---");
// The six tiles the studio page shows a child. Each one must be understood, apply
// a recipe, stay valid and still beat the robot — on all four games.
const TILES = ["Make it harder", "Make it easier", "Make it faster", "Make it calmer", "Add a level", "More coins"];
for (const e of ENGINES) {
  const p = plans[e]; if (!p) continue;
  for (const t of TILES) {
    const r = await call(edit, { body: { manifest: p.manifest, engine: e, text: t } });
    chk(`${e}: "${t}" changes the game`, !!(r.body.ok && r.body.changed), (r.body.offer && r.body.offer.said) || r.body.error || "");
    if (r.body.changed) {
      chk(`${e}: "${t}" says what it did in kid words`, typeof r.body.said === "string" && r.body.said.length > 4 && !/recipe|manifest/i.test(r.body.said), r.body.said);
      chk(`${e}: "${t}" was re-played by the robot before it came back`, !!(r.body.check && r.body.check.verdict) && r.body.check.playable, r.body.check && r.body.check.verdict);
    }
  }
}

console.log("\n--- 4. free speech: names, worlds and spoken lines ---");
{
  const e = "sling", p = plans[e];
  let r = await call(edit, { body: { manifest: p.manifest, engine: e, text: "call it Monkey Smash" } });
  chk("a new name is understood and applied", r.body.changed && r.body.manifest.name === "Monkey Smash", r.body.manifest && r.body.manifest.name);
  r = await call(edit, { body: { manifest: p.manifest, engine: e, text: "say WELL DONE when I win" } });
  const rule = r.body.changed && (r.body.manifest.rules || [])[0];
  chk("a spoken line becomes a rule with the words only", !!rule && rule.when === "onWin" && rule.params.text === "WELL DONE", JSON.stringify(rule));
  r = await call(edit, { body: { manifest: p.manifest, engine: e, text: "make it snowy" } });
  chk("a world this game has not got is an OFFER, never a refusal",
    r.body.ok && r.body.changed === false && !!(r.body.offer && r.body.offer.said) && (r.body.offer.nearest || []).length > 0,
    r.body.offer && r.body.offer.said);
  r = await call(edit, { body: { manifest: plans.skyflyer.manifest, engine: "skyflyer", text: "add a boss with a health bar" } });
  chk("something the engine can never do quotes its own never list",
    r.body.changed === false && /cannot|no enemies/i.test((r.body.offer || {}).said || ""), (r.body.offer || {}).said);
}

console.log("\n--- 5. the studio page itself ---");
{
  const src = read("studio.html");
  chk("the studio page ships", !!src && src.length > 4000);
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  chk("no emojis anywhere on it", !emoji.test(src));
  chk("its icons are drawn SVG", /<svg[^>]*viewBox/.test(src) && (src.match(/<svg/g) || []).length >= 4);
  chk("it is behind the 1111 coming-soon gate until CB4", /bk_soon_ok_v1/.test(src) && /"1111"/.test(src));
  chk("it never writes a manifest itself: every change goes through the two doors",
    /\/api\/cobuild-plan/.test(src) && /\/api\/cobuild-edit/.test(src) && !/levels\s*\[\s*0\s*\]\s*\.\s*difficulty\s*=/.test(src));
  chk("it saves through CB1, so the strict check and the robot gate always run", /\/api\/kid-game/.test(src) && /op:"save"/.test(src));
  chk("Keep waits for the FAMILY to beat it, not for the robot",
    /S\.beaten/.test(src) && /kind===\"win\"/.test(src) && /Beat it once to keep it/.test(src));
  chk("it reopens a game at /studio/<id>", /\/studio\/\(\[A-Za-z0-9\]|studio\\\/\(\[A-Za-z0-9\]/.test(src) || /\^\\\/studio\\\//.test(src) || /reopenId/.test(src));
  // kid mode never shows money, limits, publishing or settings
  // What a CHILD sees: the page with its comments stripped, and with every part
  // that only renders behind the grown-up gate taken out.
  const kidVisible = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
    .replace(/S\.grown\s*\?[^:]*:/g, " ").replace(/if\s*\(S\.grown\)[^\n]*/g, " ");
  // CB4 note: a URL like /api/cobuild-billing is plumbing, not something a child
  // reads, so endpoint names come out before looking for anything about money.
  const money = kidVisible.replace(/\/api\/[a-z-]+/g, " ")
    .match(/[$£€]\d|subscri|per month|upgrade|checkout|free trial|payment/i);
  chk("kid mode shows no money, no limits, no publishing, no settings", !money, money ? money[0] : "nothing about money on the page a child sees");
  chk("sharing is behind the grown-up gate", /S\.grown\s*\?\s*'<button[^>]*id="share"/.test(src) || /S\.grown\)\s*on\("share"/.test(src));
  chk("the microphone falls back to /api/transcribe where the browser has no ear",
    /SpeechRecognition/.test(src) && /\/api\/transcribe/.test(src));
  chk("a recorded line is stored through /api/cobuild-voice and rides on a rule",
    /\/api\/cobuild-voice/.test(src) && /params\.clip\s*=\s*url/.test(src));
}

console.log("\n--- 5b. the painted art is hung by the server, and only where it fits ---");
{
  const p = plans.breaker;
  const r = await call(plan, { body: { op: "art", engine: "breaker", manifest: p.manifest, pieces: [
    { key: "levels[].parts.bricks", slug: "cobuild/world/jungle/a_jungle_place" },
    { key: "levels[].parts.scene", slug: "cobuild/world/jungle/nope" } ] } });
  chk("a piece that fits is hung on every level", (r.body.hung || []).includes("levels[].parts.bricks") &&
    (r.body.manifest.levels || []).every((l) => l.parts.bricks === "studio:cobuild/world/jungle/a_jungle_place"));
  chk("a piece that does not fit is dropped, not forced", (r.body.dropped || []).includes("levels[].parts.scene"));
  const v = await checkManifest(r.body.manifest, "breaker");
  chk("the game with its new art is still strict-valid", v.ok, (v.errors || []).slice(0, 2).join(" | "));
  const play = await playManifest(r.body.manifest, "breaker", { read: async (f) => read(f) });
  chk("and the robot still finishes it", play.playable, play.verdict);
  const shell = fs.readFileSync("src/BuildableKids.jsx", "utf8");
  chk("the app's Make a game door opens the studio, not the dead generator",
    /onMakeGame=\{\(\) => \{ window\.location\.href = "\/studio"/.test(shell) && !/onMakeGame=\{\(\) => setScreen\(SCREEN_INTRO\)\}/.test(shell));
}

console.log("\n--- 6. the routes exist, or the page would be served as the landing page ---");
{
  const routes = JSON.parse(fs.readFileSync("vercel.json", "utf8")).routes.map((r) => r.src);
  const catchAll = routes.indexOf("/(.*)");
  const before = (p) => { const i = routes.indexOf(p); return i !== -1 && (catchAll === -1 || i < catchAll); };
  chk("/studio is routed", before("/studio"));
  chk("/studio.html is routed", before("/studio.html"));
  chk("/studio/<id> is routed", routes.some((r, i) => /^\/studio\/\(/.test(r) && (catchAll === -1 || i < catchAll)));
}

console.log("\n--- 7. the studio still works with every key switched off ---");
{
  let r = await call(studio, { body: { action: "kid-art", kind: "character", theme: "ocean", subject: "a little shark" } });
  chk("the picture machine being off is an honest answer, not an error", r.code === 200 && r.body.ok === false && !!r.body.reason, JSON.stringify(r.body));
  r = await call(transcribe, { body: { b64: "AAAA" } });
  chk("no transcriber means the child types instead, not an error", r.code === 200 && r.body.ok === false && r.body.reason === "no_ear");
  r = await call(voice, { body: { op: "save", gameId: "x", at: "onNope", b64: "AAAA" } });
  chk("a voice line can only be pinned to a real moment", r.code >= 400 || r.body.ok === false);
  const lane = read("../api/asset-studio.js") || fs.readFileSync("api/asset-studio.js", "utf8");
  chk("the kids lane looks in the shared library BEFORE it paints anything",
    lane.indexOf("kind=eq.studio") < lane.indexOf("generateSheet(frame + subject"), "library lookup comes first");
  chk("what it paints is filed back for the next family", /madeIn: "cobuild"/.test(lane) && /reusable: true/.test(lane));
}

console.log(ok ? "\nALL CHECKS PASS" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
