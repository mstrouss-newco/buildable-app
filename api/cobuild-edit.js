// /api/cobuild-edit.js — THE TWEAK DOOR (Session CB3).
//
// The kid has a game on the screen and says "make it faster" or "call it Space
// Blast" or "say WELL DONE when I win". This turns that into named CB2 recipes
// (layer one) and rules (layer two), applies them, and hands back the new
// manifest plus what changed IN KID WORDS.
//
//   POST { manifest, engine, text }
//     -> { ok, manifest, applied:[{recipe,said}], check, said }        it worked
//     -> { ok, changed:false, offer:{said,nearest} }                   an honest offer
//
// THREE THINGS THIS ALWAYS DOES.
//   1. It only ever applies RECIPES. Nothing here edits a manifest by hand, so a
//      tweak cannot leave the engine's fence.
//   2. Every edit is re-validated in strict mode AND re-played by the robot
//      before it is handed back. A tweak that breaks the game is rolled back and
//      the kid is told, rather than shown a game that no longer works.
//   3. It never refuses. When a request is outside what this engine can do, it
//      answers with the nearest thing the engine really CAN do, taken from that
//      engine's own "never" list in its cobuild sheet.
import { sheetFor, recipeLib } from "./_cobuild.js";
import { readEdit, nearestOffer, askClaude, jsonFrom } from "./_cobuildBrain.js";
import { ENGINES, checkManifest, robotCheck } from "./kid-game.js";

const clean = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 200);
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

// The model's only job here is to name recipes we already have, from a list we
// give it. Anything it names that is not on the list is dropped, so a confident
// wrong answer costs nothing.
async function askForRecipes(text, sheet, R) {
  const ids = R.list(sheet.engine);
  const menu = ids.map((r) => r.id + " (" + r.label + ")").join(", ");
  const said = await askClaude(
    "A child asked for a change to their game. Pick which of these named changes to apply, in order. " +
    "Reply as JSON only: {\"steps\":[{\"recipe\":\"...\",\"params\":{...}}],\"said\":\"one short friendly sentence to the child\"}. " +
    "Use an empty steps list if none of them fit.\n" +
    "The game is " + (sheet.label || sheet.engine) + ": " + (sheet.about || "") + "\n" +
    "Changes available: " + menu + "\n" +
    "Themes this game has: " + (((sheet.level || {}).parts || {}).themes || []).join(", ") + "\n" +
    "Moments it can react to: " + ((sheet.rules || {}).events || []).join(", ") + "\n" +
    "The child said: " + clean(text, 300), 500);
  const j = jsonFrom(said);
  if (!j || !Array.isArray(j.steps)) return null;
  const steps = j.steps
    .filter((s) => s && typeof s.recipe === "string" && R.supports(s.recipe, sheet.engine))
    .slice(0, 4)
    .map((s) => ({ recipe: s.recipe, params: (s.params && typeof s.params === "object") ? s.params : {}, said: null }));
  return { steps, said: j.said ? clean(j.said, 160) : null };
}

// voiceLine is the one recipe whose params carry a moment; everything else takes
// what the sentence gave it. Applying is always through BuildableRecipes.
function applySteps(manifest, steps, sheet, R) {
  let m = manifest, done = [], refused = [];
  for (const s of steps) {
    const r = R.apply(s.recipe, m, s.params || {}, sheet);
    if (!r.ok) { refused.push({ recipe: s.recipe, why: r.error }); continue; }
    if (JSON.stringify(r.manifest) === JSON.stringify(m)) { refused.push({ recipe: s.recipe, why: "that was already how it was" }); continue; }
    m = r.manifest;
    done.push({ recipe: s.recipe, params: s.params || {}, said: s.said || null });
  }
  return { manifest: m, done, refused };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "POST only" }); }
  try {
    const body = await readBody(req);
    const engine = clean(body.engine, 30);
    const text = clean(body.text, 500);
    const manifest = body.manifest;
    if (!ENGINES[engine]) return res.status(400).json({ ok: false, error: "unknown game" });
    if (!manifest || typeof manifest !== "object") return res.status(400).json({ ok: false, error: "there is no game to change" });
    if (!text) return res.status(400).json({ ok: false, error: "tell me what to change" });

    const [sheet, R] = await Promise.all([sheetFor(engine), recipeLib()]);
    if (!sheet || !R) return res.status(503).json({ ok: false, error: "the studio could not read its own game sheets" });

    // The plain-words reading first, because it is instant and never wrong about
    // what it does match. The model is only asked when nothing matched.
    let steps = readEdit(text, sheet), modelSaid = null;
    if (!steps.length) {
      const guess = await askForRecipes(text, sheet, R);
      if (guess && guess.steps.length) { steps = guess.steps; modelSaid = guess.said; }
    }
    if (!steps.length) return res.status(200).json({ ok: true, changed: false, offer: nearestOffer(text, sheet, R) });

    const out = applySteps(manifest, steps, sheet, R);
    if (!out.done.length) {
      // The recipe book already knows why an engine cannot do a thing, and says it
      // in the engine's own words ("Sky Flyer has no enemies at all..."). Prefer
      // that to a general "I could not work that out".
      const spoken = out.refused.find((r) => r.why && r.why.length > 20);
      const offer = nearestOffer(text, sheet, R);
      if (spoken) offer.said = spoken.why;
      return res.status(200).json({ ok: true, changed: false, offer, refused: out.refused });
    }

    // Re-validate, then re-play. A tweak is not shown until the robot has finished
    // the game again — a kid must never be handed back something broken.
    const valid = await checkManifest(out.manifest, engine);
    if (!valid.ok) return res.status(200).json({ ok: true, changed: false, offer: nearestOffer(text, sheet, R), why: valid.errors });
    const check = await robotCheck(out.manifest, engine, { suggest: false });
    if (!check.playable) {
      const bad = (check.levels || []).find((l) => l.verdict === "not-beatable");
      return res.status(200).json({ ok: true, changed: false, check,
        offer: { said: "That made it too hard to finish" + (bad ? ' on "' + bad.name + '"' : "") + ", so I put it back the way it was.",
          nearest: ["easier", "moreCollectibles", "calmer"].filter((k) => R.supports(k, engine)) } });
    }

    const said = modelSaid || out.done.map((d) => d.said).filter(Boolean).join(", and ") ||
      ("changed " + out.done.map((d) => d.recipe).join(", "));
    return res.status(200).json({ ok: true, changed: true, manifest: out.manifest, applied: out.done, refused: out.refused, check, said: said.charAt(0).toUpperCase() + said.slice(1) + "." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
}
