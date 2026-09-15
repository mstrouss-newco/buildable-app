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

// The star suggestions. CB7: the child's OWN words come first, so a kid who only
// ever taps a chip still ends up with their own idea on the screen; our stock
// heroes only fill the row out.
function starChips(theme, text) {
  const BY = { space: ["An astronaut", "A friendly alien", "A rocket cat"], ocean: ["A little shark", "A brave crab", "A mermaid"],
    jungle: ["A monkey", "A baby dinosaur", "A tiger cub"], forest: ["A fox", "A wise owl", "A bear cub"],
    candy: ["A gummy bear", "A cupcake knight", "A lollipop wizard"], desert: ["A camel", "A cactus hero", "A desert fox"],
    castle: ["A knight", "A tiny dragon", "A castle mouse"], castles: ["A knight", "A tiny dragon", "A castle mouse"],
    snow: ["A penguin", "A polar bear cub", "A snow fox"], grass: ["A puppy", "A rabbit", "A farm duck"],
    fall: ["A hedgehog", "A squirrel", "A leaf sprite"] };
  const out = keyNouns(text).slice(0, 2).map((n) => article(n) + " " + n);
  for (const s of (BY[theme] || ["A brave hero", "A funny sidekick", "A tiny robot"])) {
    if (out.length < 3 && out.indexOf(s) === -1) out.push(s);
  }
  return out.slice(0, 3);
}
const article = (w) => (/^[aeiou]/i.test(String(w || "")) ? "An" : "A");

const COLORS = { space: "#7C5CFC", ocean: "#2FB7D6", jungle: "#3FA75B", forest: "#3FA75B", candy: "#F0578F",
  desert: "#E0A458", castle: "#2E8B57", castles: "#2E8B57", snow: "#67E8F9", grass: "#6FD46F", fall: "#E07A2F" };

// ---------------------------------------------------------------------------
//  CB6 — THE SHOT LIST.
//
//  A sentence is not a theme. "A dragon who delivers pizza to the moon" has to
//  put a DRAGON on the screen, not a stock space hero with a new title. So the
//  plan carries a SHOT LIST: one entry per picture the game needs, and each entry
//  names
//    slot     — a key the engine's own cobuild.json really has, so a picture is
//               never painted with nowhere to hang;
//    subject  — a short painting description built out of the CHILD'S words;
//    search   — the phrase the shared library is checked with first, so the
//               second family who asks for a dragon gets one instantly and free;
//    noun     — the word from the child's sentence this shot is carrying.
//  Six pictures is the aim, ten the ceiling.
// ---------------------------------------------------------------------------
const AIM_SHOTS = 6, MAX_SHOTS = 10;
const lowerWords = (t) => String(t == null ? "" : t).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const STOP = new Set(("a an the and or but with who whom that this these those it is are was were be been being of to in on at my your our their his her its for from by into under over about " +
  "game games make makes making play plays playing like likes want wants really very some all every can could you i me we they he she them there then when where how what do does did go goes get gets " +
  "little big new old one two three lots more most also so if as up down out off again always never please").split(" "));

// The words a child actually said, in the order they said them. This is the whole
// trick: every shot below carries one of these when there is one to carry.
export function nounsOf(text) {
  const out = [];
  for (const w of lowerWords(text)) if (w.length > 2 && !STOP.has(w) && out.indexOf(w) === -1) out.push(w);
  return out.slice(0, 6);
}

// Better than the first long word: the thing straight after "a", "an" or "the".
// "A dragon who delivers pizza to the moon" gives dragon and moon, not delivers;
// "a robot cat who races trains" gives "robot cat". A child names the thing they
// mean with an article in front of it almost every time.
export function subjectsOf(text) {
  const w = lowerWords(text), out = [];
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== "a" && w[i] !== "an" && w[i] !== "the") continue;
    const parts = [];
    for (let j = i + 1; j < w.length && parts.length < 2 && w[j].length > 2 && !STOP.has(w[j]); j++) parts.push(w[j]);
    const phrase = parts.join(" ");
    if (phrase && out.indexOf(phrase) === -1) out.push(phrase);
  }
  return out.slice(0, 4);
}

// What a shot reaches for: the named things first, every other word after.
export function keyNouns(text) {
  const out = subjectsOf(text).slice();
  for (const n of nounsOf(text)) if (!out.some((x) => x === n || x.indexOf(n) !== -1)) out.push(n);
  return out.slice(0, 6);
}

// What each role looks like as a painting instruction. Five to ten words, the
// child's noun in the middle of OUR sentence, never at the start of it.
const SHOT_WORDS = {
  hero:    (n, star, th) => star + (n ? ", a " + n : "") + ", full body, bright storybook art",
  world:   (n, th) => "a " + (n || th) + " " + th + " place, wide gentle backdrop",
  collect: (n, th) => "a " + (n || th) + " treasure to collect, small and bright",
  avoid:   (n, th) => "a silly " + (n || th) + " to dodge, never frightening",
  badge:   (n, th) => "a round badge showing a " + (n || th) + ", flat and simple",
};

// Slot patterns per role. An engine with no slot for a role simply gets no shot
// for it. levels[].palette is NOT here on purpose: it takes a theme NAME, not a
// picture, and painting into it would blank the world.
const ROLES = [
  { shot: "hero",    kind: "character", per: "game",  keys: [/^levels\[\]\.parts\.paddle$/, /^art\.hero$/] },
  { shot: "world",   kind: "world",     per: "level", keys: [/^levels\[\]\.parts\.(background|scene)$/] },
  { shot: "collect", kind: "element",   per: "game",  keys: [/^levels\[\]\.parts\.(bricks|balls)$/] },
  { shot: "avoid",   kind: "character", per: "game",  keys: [/^levels\[\]\.parts\.boss$/] },
  { shot: "badge",   kind: "element",   per: "level", keys: [/^levels\[\]\.journeyBadge$/] },
];

export function shotList(sheet, theme, star, text, levelCount) {
  const slots = (sheet && sheet.art) || [];
  const firstKey = (res) => { for (const re of res) { const s = slots.find((x) => re.test(x.key)); if (s) return s.key; } return null; };
  const nouns = keyNouns(text);
  const starNoun = keyNouns(star)[0] || null;
  const levels = Math.max(1, parseInt(levelCount, 10) || 1);
  let at = 0;
  const nextNoun = () => (nouns.length ? nouns[at++ % nouns.length] : null);
  const phrase = (shot, noun) => ["cobuild", shot, noun || "", theme || ""].filter(Boolean).join(" ");

  // The cover is not an engine slot: it is the kid_games row's own picture, which
  // is why every game gets one whatever engine it lands on.
  const out = [{ shot: "cover", slot: "cover", key: null, level: null, kind: "world", theme,
    noun: starNoun || nouns[0] || null,
    subject: star + " in a " + theme + " world, storybook cover art",
    search: phrase("cover", starNoun || nouns[0]) }];

  for (const role of ROLES) {
    if (out.length >= MAX_SHOTS) break;
    const key = firstKey(role.keys);
    if (!key) continue;
    // The per-level badge is only there to fill out an engine that has few slots;
    // it never pushes a richer engine over the six-picture aim.
    if (role.shot === "badge" && out.length >= AIM_SHOTS) continue;
    const spots = role.per === "level" ? Array.from({ length: levels }, (_, i) => i) : [null];
    for (const lv of spots) {
      if (out.length >= MAX_SHOTS) break;
      const noun = role.shot === "hero" ? starNoun : (role.per === "level" ? (nouns[lv % Math.max(1, nouns.length)] || null) : nextNoun());
      out.push({ shot: role.shot, slot: key, key, level: lv, kind: role.kind, theme, noun: noun || null,
        subject: role.shot === "hero" ? SHOT_WORDS.hero(noun, star, theme) : SHOT_WORDS[role.shot](noun, theme),
        search: phrase(role.shot, noun) });
    }
  }
  return out;
}

// CB6 — THE PRE-KEEP CHECK. Did the game actually end up wearing the child's
// idea? The hero slot must carry a painted hero, and every level must carry its
// own world. What is missing comes back so the studio can repaint it ONCE; it
// never blocks a child from keeping their game.
export function artGaps(manifest, shots) {
  const m = manifest || {}, out = [];
  for (const s of (shots || [])) {
    if (s.slot === "cover" || (s.shot !== "hero" && s.shot !== "world")) continue;
    const mm = /^levels\[\]\.parts\.([a-zA-Z]+)$/.exec(s.key || "");
    const am = /^art\.([a-zA-Z0-9]+)$/.exec(s.key || "");
    let val = null;
    if (mm) {
      const lv = (m.levels || [])[s.level == null ? 0 : s.level];
      val = lv && lv.parts ? lv.parts[mm[1]] : null;
    } else if (am) val = (m.art || {})[am[1]];
    if (!/^studio:/.test(String(val || ""))) out.push(s);
  }
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
      chips: starChips(theme, text).map((s) => ({ id: s, label: s })), open: true, engine: best.engine, theme } };
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

  // Layer three is CB5. Until then, an idea nothing matches head-on is answered by
  // NAMING the game being built, with the child's own star in it. CB7: no apology,
  // no "not yet" — a child is told what they are getting, with excitement.
  // CB5 — LAYER THREE IS REAL NOW. An idea no engine's own words match is not
  // answered with the nearest thing any more: `forge` tells the studio it may ask
  // /api/cobuild-forge to write a brand new cartridge, and `said` is what a child
  // hears while that happens. The nearest engine still rides along, because it is
  // what a child plays while they wait and what they get if the forge cannot
  // finish. Nothing here decides: the studio asks, the gate answers.
  const layerThree = best.score === 0
    ? { what: clean(text, 200), nearest: best.engine, nearestLabel: best.label, forge: true,
        said: "Nobody has made this one before, so I am going to write it from scratch, with " + star.toLowerCase() + " right in the middle of it." }
    : null;

  return { ok: true, plan: {
    engine: best.engine, engineLabel: best.label, about: best.about,
    why: why || ("This one is " + best.about + ", which sounds like what you said."),
    theme, star, text: clean(text, 500), manifest: built.manifest, steps: built.steps,
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
    art: shotList(built.sheet, theme, star, text + " " + star, (built.manifest.levels || []).length),
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
      plan.art = shotList(built.sheet, choices.theme, answers.star, (p.text || "") + " " + answers.star, (built.manifest.levels || []).length);
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
      for (const piece of (Array.isArray(body.pieces) ? body.pieces : []).slice(0, MAX_SHOTS)) {
        const key = String((piece && piece.key) || ""), slug = String((piece && piece.slug) || "");
        if (!slug) { dropped.push(key); continue; }
        const test = JSON.parse(JSON.stringify(m));
        const mm = /^levels\[\]\.parts\.([a-zA-Z]+)$/.exec(key);
        const am = /^art\.([a-zA-Z0-9]+)$/.exec(key);
        const bm = /^levels\[\]\.journeyBadge$/.test(key);
        // CB6 — a piece may name ONE level (`level: 2`), so every level can wear its
        // own world instead of all three sharing one picture. No level named still
        // means every level, which is what a hero or a brick set wants.
        const lvl = (piece && piece.level != null) ? parseInt(piece.level, 10) : null;
        let touched = false;
        if (mm || bm) {
          (test.levels || []).forEach((lv, i) => {
            if (lvl != null && i !== lvl) return;
            if (bm) { lv.journeyBadge = "studio:" + slug; }
            else { lv.parts = lv.parts || {}; lv.parts[mm[1]] = "studio:" + slug; }
            touched = true;
          });
        } else if (am) { test.art = test.art || {}; test.art[am[1]] = "studio:" + slug; touched = true; }
        if (!touched) { dropped.push(key); continue; }
        const v = lib.validate(test, { strict: true, sheet });
        if (v.ok) { m = test; hung.push(key + (lvl != null ? "#" + lvl : "")); } else dropped.push(key);
      }
      return res.status(200).json({ ok: true, manifest: m, hung, dropped });
    }

    // CB6 — THE PRE-KEEP CHECK. The studio asks, before the game is written,
    // whether the manifest really wears the child's idea: a painted hero, and a
    // world on every level. What is missing comes back so the studio can repaint
    // it ONCE. This NEVER blocks a child — a game with a gap is still kept, with
    // an honest line stored on the row.
    if (body.op === "artCheck") {
      const shots = Array.isArray(body.shots) ? body.shots : [];
      const missing = artGaps(body.manifest, shots);
      return res.status(200).json({ ok: true, missing,
        note: missing.length
          ? "kept with " + missing.length + " picture" + (missing.length === 1 ? "" : "s") + " the engine drew itself: " +
            missing.map((x) => x.shot + (x.level != null ? " " + (x.level + 1) : "")).join(", ")
          : null });
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
