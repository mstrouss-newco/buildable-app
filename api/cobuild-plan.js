// /api/cobuild-plan.js — THE PLAN DOOR (Session CB3).
//
// A kid says what their game is about. This turns that sentence into a PLAN: the
// engine it should be built on, a strict-valid manifest, the art to paint, and a
// row of tap-to-change chips. It never writes a manifest freehand — the manifest
// is assembled out of a shipped game by named CB2 recipes (see _cobuildBrain.js),
// so it is inside the engine's fence by construction.
//
//   POST { text, answers?, kidName?, grownupName? }
//        -> { ok, ask:{id,question,chips} }     one follow-up question, or
//        -> { ok, plan:{...} }                  the whole plan
//   POST { op:"chip", plan, chip, value }  -> the plan rebuilt with that chip changed
//   GET  ?op=remix                         -> the remix door: our games + Top Board games
//
// Everything works with NO model key: the engine is chosen by the plain words each
// cobuild sheet carries, and the manifest is assembled locally. A model, when
// there is one, only improves the NAME, the theme choice and the friendly wording,
// and its answer is thrown away if it names anything the sheets do not have.
import { sheetFor, recipeLib } from "./_cobuild.js";
import { scoreEngines, assemble, themesOf, pickTheme, askClaude, jsonFrom, ENGINE_IDS } from "./_cobuildBrain.js";
import { ENGINES } from "./kid-game.js";
import { manifestLib } from "./_manifestLib.js";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const titleCase = (s) => String(s || "").replace(/\b[a-z]/g, (m) => m.toUpperCase());
const clean = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 120);
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

// The follow-ups, in order. ONE at a time, never a settings screen, and only the
// two that actually change the game. Everything else the plan decides itself.
const HARD_CHIPS = [{ id: "gentle", label: "Nice and gentle", difficulty: 1 },
  { id: "middle", label: "Just right", difficulty: 2 },
  { id: "tricky", label: "Really tricky", difficulty: 4 }];

function starChips(theme) {
  const BY = { space: ["An astronaut", "A friendly alien", "A rocket cat"], ocean: ["A little shark", "A brave crab", "A mermaid"],
    jungle: ["A monkey", "A baby dinosaur", "A tiger cub"], forest: ["A fox", "A wise owl", "A bear cub"],
    candy: ["A gummy bear", "A cupcake knight", "A lollipop wizard"], desert: ["A camel", "A cactus hero", "A desert fox"],
    castle: ["A knight", "A tiny dragon", "A castle mouse"], castles: ["A knight", "A tiny dragon", "A castle mouse"],
    snow: ["A penguin", "A polar bear cub", "A snow fox"], grass: ["A puppy", "A rabbit", "A farm duck"],
    fall: ["A hedgehog", "A squirrel", "A leaf sprite"] };
  return (BY[theme] || ["A brave hero", "A funny sidekick", "A tiny robot"]).slice(0, 3);
}

const COLORS = { space: "#7C5CFC", ocean: "#2FB7D6", jungle: "#3FA75B", forest: "#3FA75B", candy: "#F0578F",
  desert: "#E0A458", castle: "#2E8B57", castles: "#2E8B57", snow: "#67E8F9", grass: "#6FD46F", fall: "#E07A2F" };

// The art the build step paints, named by the engine's own sheet slots so a game
// never asks for a picture the engine has nowhere to hang.
function artPlan(sheet, theme, star) {
  var slots = (sheet.art || []);
  var find = function (re) { var s = slots.find(function (x) { return re.test(x.key); }); return s ? s.key : null; };
  // The cover is not an engine slot: it is the kid_games row's own picture, which
  // is why every game gets one. The other two are only painted when this engine
  // really has somewhere to hang them.
  var out = [{ slot: "cover", key: null, kind: "world", theme: theme, subject: star + " in a " + theme + " world, storybook cover art" }];
  var world = find(/parts\.(bricks|scene|world)$/);
  if (world) out.push({ slot: "world", key: world, kind: "world", theme: theme, subject: "a " + theme + " place for a children's game, wide backdrop" });
  var hero = find(/parts\.(paddle|world|boss)$/);
  if (hero) out.push({ slot: "hero", key: hero, kind: "character", theme: theme, subject: star + ", full body, facing the camera, children's game art" });
  return out;
}

async function buildPlan(text, answers, who) {
  answers = answers || {};
  const ranked = await scoreEngines(text);
  if (!ranked.length) return { ok: false, error: "the studio could not read its own game sheets" };

  // The model gets to overrule the word count on the engine and the theme, but only
  // with names the sheets really have. Anything else and the local answer stands.
  let best = ranked[0], theme = pickTheme(text, best.sheet), name = null, why = null;
  const menu = ranked.map((r) => r.engine + " (" + r.about + ")").join("; ");
  const said = await askClaude(
    "A child described the game they want to make. Choose which of our games it should be built on, a world theme, " +
    "and a short title a child would love. Reply as JSON only: {\"engine\":\"...\",\"theme\":\"...\",\"name\":\"...\",\"why\":\"one short friendly sentence to the child\"}.\n" +
    "Our games: " + menu + "\nThemes allowed per game: " + ranked.map((r) => r.engine + "=" + themesOf(r.sheet).join("/")).join("; ") +
    "\nThe child said: " + clean(text, 400), 400);
  const j = jsonFrom(said);
  if (j) {
    const pick = ranked.find((r) => r.engine === String(j.engine || "").trim());
    if (pick) best = pick;
    const themes = themesOf(best.sheet);
    if (j.theme && themes.indexOf(String(j.theme).trim()) !== -1) theme = String(j.theme).trim();
    if (j.name) name = clean(j.name, 40);
    if (j.why) why = clean(j.why, 160);
  }
  if (!theme) theme = (themesOf(best.sheet)[0] || null);

  // ONE follow-up at a time. The star first, because it is the question a child
  // actually wants to answer, and it is what the art is painted from.
  if (!answers.star) {
    return { ok: true, ask: { id: "star", question: "Who is the star of your game?",
      chips: starChips(theme).map((s) => ({ id: s, label: s })), open: true, engine: best.engine, theme } };
  }
  if (!answers.hard) {
    return { ok: true, ask: { id: "hard", question: "How tricky should it be?",
      chips: HARD_CHIPS.map((c) => ({ id: c.id, label: c.label })), open: false, engine: best.engine, theme } };
  }

  const star = clean(answers.star, 60) || "A brave hero";
  const hard = HARD_CHIPS.find((c) => c.id === answers.hard) || HARD_CHIPS[1];
  const choices = {
    name: name || clean(answers.name, 40) || titleCase(star.replace(/^(a|an|the)\s+/i, "")) + "'s Adventure",
    theme, difficulty: hard.difficulty, levels: 3, color: COLORS[theme] || null,
    feel: hard.id === "tricky" ? "zippy" : hard.id === "gentle" ? "chill" : null,
    mathGate: false,
  };
  const built = await assemble(best.engine, choices);
  if (!built.ok) return { ok: false, error: built.error, errors: built.errors };

  // Layer three is CB5. Until then, an idea nothing matches is answered honestly
  // with the nearest engine rather than a promise we cannot keep.
  const layerThree = best.score === 0
    ? { what: clean(text, 200), nearest: best.engine,
        said: "That is not quite a game I can build yet, so I picked the closest I can do today: " + best.label + ", " + best.about + "." }
    : null;

  return { ok: true, plan: {
    engine: best.engine, engineLabel: best.label, about: best.about,
    why: why || ("This one is " + best.about + ", which sounds like what you said."),
    theme, star, manifest: built.manifest, steps: built.steps,
    kidName: clean(who && who.kidName, 40) || null, grownupName: clean(who && who.grownupName, 40) || null,
    chips: [
      { id: "name", label: "Name", value: built.manifest.name, kind: "text" },
      { id: "star", label: "Star", value: star, kind: "text" },
      // A game with no worlds to choose between (Castle Guard's paths are the
      // engine's own) gets no world chip, rather than a chip that does nothing.
      ...(themesOf(best.sheet).length ? [{ id: "theme", label: "World", value: theme, kind: "pick", options: themesOf(best.sheet) }] : []),
      { id: "hard", label: "How tricky", value: hard.label, kind: "pick", options: HARD_CHIPS.map((c) => c.label) },
      { id: "levels", label: "Levels", value: (built.manifest.levels || []).length, kind: "pick", options: [1, 2, 3, 4, 5].filter((n) => n <= (built.sheet.level.max || 12)) },
    ],
    art: artPlan(built.sheet, theme, star),
    story: ["Choosing the game", "Painting " + star.toLowerCase(), "Building the " + theme + " world",
      "Setting how tricky it is", "Letting the robot play it"],
    layerThree,
  } };
}

// The remix door: start from a game you love. Ours, plus what is on the Top Board.
async function remixList() {
  const mine = ENGINE_IDS.filter((id) => ENGINES[id]).map((id) => ({ source: id, name: ENGINES[id].label, kind: "ours", engine: id }));
  let theirs = [];
  if (URL_ && KEY) {
    try {
      const r = await fetch(`${URL_}/rest/v1/kid_games?public=is.true&deleted_at=is.null&select=id,name,engine,kid_name,cover,plays&order=plays.desc&limit=12`,
        { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      const rows = r.ok ? await r.json() : [];
      theirs = (Array.isArray(rows) ? rows : []).map((g) => ({ source: g.id, name: g.name, kind: "topboard", engine: g.engine, by: g.kid_name || null, cover: g.cover || null }));
    } catch {}
  }
  return { ours: mine, topBoard: theirs };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const q = new URLSearchParams(String(req.url || "").split("?")[1] || "");
    if (req.method === "GET" && q.get("op") === "remix") return res.status(200).json({ ok: true, ...(await remixList()) });
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "POST only" }); }

    const body = await readBody(req);
    if (body.op === "remix") return res.status(200).json({ ok: true, ...(await remixList()) });

    // A chip tapped: rebuild the same plan with one choice changed. Same assembly
    // path, so a chip can never produce something the plan itself could not.
    if (body.op === "chip") {
      const p = body.plan || {};
      const sheet = await sheetFor(p.engine);
      if (!sheet) return res.status(400).json({ ok: false, error: "unknown game" });
      const answers = { star: p.star, hard: body.chip === "hard" ? chipToHard(body.value) : hardFromLabel(p) };
      if (body.chip === "star") answers.star = clean(body.value, 60);
      const choices = {
        name: body.chip === "name" ? clean(body.value, 40) : p.manifest.name,
        theme: body.chip === "theme" ? clean(body.value, 30) : p.theme,
        difficulty: (HARD_CHIPS.find((c) => c.id === answers.hard) || HARD_CHIPS[1]).difficulty,
        levels: body.chip === "levels" ? parseInt(body.value, 10) : (p.manifest.levels || []).length,
        color: COLORS[body.chip === "theme" ? clean(body.value, 30) : p.theme] || null,
        feel: answers.hard === "tricky" ? "zippy" : answers.hard === "gentle" ? "chill" : null,
      };
      if (choices.theme && themesOf(sheet).indexOf(choices.theme) === -1) return res.status(400).json({ ok: false, error: (sheet.label || p.engine) + " does not have a " + choices.theme + " world" });
      const built = await assemble(p.engine, choices);
      if (!built.ok) return res.status(400).json({ ok: false, error: built.error, errors: built.errors });
      const plan = { ...p, theme: choices.theme, star: answers.star, manifest: built.manifest, steps: built.steps };
      plan.chips = (p.chips || []).map((c) => c.id === body.chip ? { ...c, value: body.value } : (c.id === "name" ? { ...c, value: built.manifest.name } : (c.id === "levels" ? { ...c, value: (built.manifest.levels || []).length } : c)));
      plan.art = artPlan(built.sheet, choices.theme, answers.star);
      return res.status(200).json({ ok: true, plan });
    }

    // Art that has just been painted, hung on the slots it fits. The page never
    // edits a manifest itself, so it posts the pieces here and gets back a
    // manifest that has been strict-validated with them in. A piece that does not
    // fit the slot is DROPPED rather than forced: the engine then draws its own
    // art, which is the read-with-a-fallback rule, and the piece is still in the
    // shared library for the next family.
    if (body.op === "art") {
      const engine = clean(body.engine, 30);
      const sheet = await sheetFor(engine);
      const lib = await manifestLib();
      if (!sheet || !lib) return res.status(503).json({ ok: false, error: "the studio could not read its own game sheets" });
      let m = JSON.parse(JSON.stringify(body.manifest || {})), hung = [], dropped = [];
      for (const piece of (Array.isArray(body.pieces) ? body.pieces : []).slice(0, 6)) {
        const key = String(piece && piece.key || ""), slug = String(piece && piece.slug || "");
        const mm = /^levels\[\]\.parts\.([a-z]+)$/.exec(key);
        if (!mm || !slug) { dropped.push(key); continue; }
        const before = JSON.stringify(m);
        const test = JSON.parse(before);
        (test.levels || []).forEach((lv) => { lv.parts = lv.parts || {}; lv.parts[mm[1]] = "studio:" + slug; });
        const v = lib.validate(test, { strict: true, sheet });
        if (v.ok) { m = test; hung.push(key); } else dropped.push(key);
      }
      return res.status(200).json({ ok: true, manifest: m, hung, dropped });
    }

    const text = clean(body.text, 500);
    if (!text) return res.status(400).json({ ok: false, error: "tell me what the game is about" });
    const out = await buildPlan(text, body.answers, { kidName: body.kidName, grownupName: body.grownupName });
    return res.status(out.ok ? 200 : 400).json(out);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
const hardFromLabel = (p) => { const c = (p.chips || []).find((x) => x.id === "hard"); const h = HARD_CHIPS.find((x) => x.label === (c && c.value)); return h ? h.id : "middle"; };
const chipToHard = (v) => { const h = HARD_CHIPS.find((x) => x.label === v || x.id === v); return h ? h.id : "middle"; };
