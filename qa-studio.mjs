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

console.log("\n--- 5c. CB6: the child's own idea reaches the screen ---");
// The promise on the lander is that "a dragon who delivers pizza to the moon"
// becomes a game about THAT. So the plan has to carry a shot list built out of
// the child's nouns, every shot has to name a slot the engine really has, and the
// pre-Keep check has to notice when a hero or a world never got painted.
{
  const SAID = "a robot cat who races trains under the sea";
  for (const e of ENGINES) {
    const r = await call(plan, { body: { text: IDEAS[e] + " with a dragon and a pizza", answers: { star: "A dragon", hard: "middle" } } });
    const p = r.body.plan; if (!p) { chk(`${e}: the plan came back`, false); continue; }
    const shots = p.art || [];
    chk(`${e}: the shot list aims at six pictures and never more than ten`, shots.length >= 2 && shots.length <= 10, String(shots.length));
    chk(`${e}: every shot names a slot this engine's own sheet has`,
      shots.every((a) => a.slot === "cover" || (sheets[e].art || []).some((x) => x.key === a.key)),
      shots.map((a) => a.shot + "=" + (a.key || "cover")).join(", "));
    chk(`${e}: every shot carries a word the child actually said`,
      shots.every((a) => a.noun || /dragon|pizza/.test(String(a.subject || ""))),
      shots.map((a) => a.shot + ":" + a.noun).join(", "));
    chk(`${e}: every shot carries a search phrase, so the library is checked by the child's words`,
      shots.every((a) => typeof a.search === "string" && a.search.split(" ").length >= 2));
    chk(`${e}: a painting description is short enough to be one picture`,
      shots.every((a) => String(a.subject || "").split(/\s+/).length <= 14));
    chk(`${e}: the world shots are one per level, not one for all of them`,
      shots.filter((a) => a.shot === "world").every((a) => a.level != null));
    // The pre-Keep check must SEE the gap on a game with nothing painted at all.
    const chk1 = await call(plan, { body: { op: "artCheck", manifest: p.manifest, shots } });
    const wanted = shots.filter((a) => a.shot === "hero" || a.shot === "world").length;
    chk(`${e}: the pre-Keep check notices every unpainted hero and world`,
      (chk1.body.missing || []).length === wanted, `${(chk1.body.missing || []).length} of ${wanted}`);
    chk(`${e}: a gap is an honest note, never a block`, chk1.body.ok === true && (wanted === 0 || typeof chk1.body.note === "string"));
  }
  // A dragon really lands in the hero slot, and level 2's world is not level 1's.
  const p = plans.breaker;
  const r = await call(plan, { body: { op: "art", engine: "breaker", manifest: p.manifest, pieces: [
    { key: "levels[].parts.paddle", slug: "cobuild/hero/jungle/dragon" },
    { key: "levels[].parts.background", slug: "cobuild/world/jungle/moon", level: 1 },
    { key: "art.hero", slug: "cobuild/cover/jungle/dragon" } ] } });
  chk("the child's hero is hung on the hero slot", (r.body.manifest.levels || []).every((l) => l.parts.paddle === "studio:cobuild/hero/jungle/dragon"));
  chk("a shot that names ONE level changes only that level",
    r.body.manifest.levels[1].parts.background === "studio:cobuild/world/jungle/moon" &&
    r.body.manifest.levels[0].parts.background !== "studio:cobuild/world/jungle/moon");
  chk("a whole-game slot (art.hero) can be hung too, not just level parts", r.body.manifest.art.hero === "studio:cobuild/cover/jungle/dragon");
  const v2 = await checkManifest(r.body.manifest, "breaker");
  chk("the game wearing the child's art is still strict-valid", v2.ok, (v2.errors || []).slice(0, 2).join(" | "));
  const gaps = await call(plan, { body: { op: "artCheck", manifest: r.body.manifest,
    shots: [{ shot: "hero", key: "levels[].parts.paddle", level: null }, { shot: "world", key: "levels[].parts.background", level: 1 }] } });
  chk("a game that IS wearing its art has no gaps left", (gaps.body.missing || []).length === 0);
  // And the kids lane matches on the child's words, not just the shape.
  const src = fs.readFileSync("api/asset-studio.js", "utf8");
  chk("the kids lane reuses a picture only when the child's words match it", /words\.every\(\(w\) => hay\.indexOf\(w\) !== -1\)/.test(src));
  chk("what it paints is filed with the search phrase, so the next family finds it", /search: search \|\| null/.test(src));
  chk("every painted picture still goes through the daily cost brake", /underBudget\(\)/.test(src) && /logCost\(COST\.low\)/.test(src));
  // The plan keeps the sentence, so tapping a chip cannot lose the child's words.
  const keep = await call(plan, { body: { text: SAID, answers: { star: "A robot cat", hard: "middle" } } });
  chk("the plan remembers the sentence a child said", typeof keep.body.plan.text === "string" && /robot cat/.test(keep.body.plan.text));
  chk("a cat really reaches the shot list", (keep.body.plan.art || []).some((a) => /cat|robot|trains?|sea/.test(String(a.noun || "") + String(a.subject || ""))),
    (keep.body.plan.art || []).map((a) => a.noun).join(","));
}

console.log("\n--- 5d. CB7: the child's words come back, and nobody apologises ---");
{
  const r = await call(plan, { body: { text: "a dragon who delivers pizza to the moon" } });
  const chips = ((r.body.ask || {}).chips || []).map((c) => c.label);
  chk("the star chips echo what the child just said", chips.some((c) => /dragon|pizza|moon/i.test(c)), chips.join(", "));
  const studioSrc = fs.readFileSync("public/studio.html", "utf8");
  const planSrc = fs.readFileSync("api/cobuild-plan.js", "utf8");
  const brainSrc = fs.readFileSync("api/_cobuildBrain.js", "utf8");
  const spoken = (src) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  for (const [what, src] of [["the studio page", studioSrc], ["the plan door", planSrc], ["the edit brain", brainSrc]]) {
    chk(`${what} never tells a child it cannot build their idea`,
      !/not quite|cannot do|could not do|can't build|build .* yet/i.test(spoken(src)));
  }
  // A sentence no engine matches head-on is still answered by NAMING the game.
  const odd = await call(plan, { body: { text: "zzzz qqqq", answers: { star: "A dragon", hard: "middle" } } });
  const l3 = odd.body.plan && odd.body.plan.layerThree;
  // CB5 changed this line for the better: an idea nothing matches is no longer
  // answered with the nearest game at all, it is answered by writing a new one.
  chk("an idea nothing matches is answered with what IS being built", !l3 || (/(making you a|write it from scratch)/i.test(l3.said) && !/yet|not quite/i.test(l3.said)), l3 && l3.said);
  chk("and it tells the studio it may forge one", !l3 || (l3.forge === true && !!l3.nearest));
  // Names: asked once, kept on the device, and carried by the save.
  chk("the studio asks the child's name and the grown-up's name, once", /function screenNames\(/.test(studioSrc) && /bk_kid_name/.test(studioSrc) && /bk_grownup_name/.test(studioSrc));
  chk("both names ride on the save that creates the game", /kidName:kidName\(\)/.test(studioSrc) && /grownupName:grownupName\(\)/.test(studioSrc));
  const kgSrc = fs.readFileSync("api/kid-game.js", "utf8");
  chk("a later tweak can never wipe the credit line", /if \(str\(get\("kidName"\)\)\) patch\.kid_name/.test(kgSrc));
  chk("the keep card and the share sheet show the same credit as the cover", (studioSrc.match(/esc\(credit\(\)\)/g) || []).length >= 2);
  // All four engines agree about the title, the tab and the save file.
  const bm = fs.readFileSync("public/buildable-manifest.js", "utf8");
  chk("the shared loader owns the kid title, the tab and the save key", /function kgTitle\(/.test(bm) && /function kgSaveKey\(/.test(bm) && /document\.title = row\.name/.test(bm));
  const ENG_FILES = { breaker: "public/breaker-engine.html", sling: "public/sling-squad.html",
    castleguard: "public/castle-guard.html", skyflyer: "public/skyflyer-engine.html" };
  for (const [e, f] of Object.entries(ENG_FILES)) {
    const src = fs.readFileSync(f, "utf8");
    chk(`${e}: a kid's game saves under its own key, so it never opens half-finished`, /kgKey\(/.test(src));
    if (e !== "skyflyer") chk(`${e}: the start screen shows the kid's title, not ours`, /title: ?kgName\(/.test(src));
  }
  // The game and the asking share one screen, on a phone and on a laptop.
  chk("the play frame leaves room for the tweak chips", /max-width:calc\(62dvh \* 1\.6\)/.test(studioSrc));
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
