// /api/_cobuildBrain.js — the studio's THINKING, with no network in the way.
//
// CB3. Two endpoints need the same three skills: pick the engine a kid's sentence
// is really describing, turn that sentence into a strict-valid manifest, and turn
// a later "make it faster" into named CB2 recipes. All three live here so the plan
// door and the edit door can never disagree.
//
// THE RULE THAT SHAPES THIS FILE: the model never writes a manifest. It picks from
// a short list of choices, and the SERVER assembles the manifest out of a shipped
// manifest plus CB2 recipes — so what comes out is inside the engine's fence by
// construction, not by hoping. Every function here also works with NO model at
// all (deterministic keyword matching), which is why the studio still builds a
// real game in a headless test with no API key, and why a model outage degrades
// to something slightly less clever rather than to nothing.
import { readPublic, sheetFor, recipeLib } from "./_cobuild.js";
import { manifestLib } from "./_manifestLib.js";

export const ENGINE_IDS = ["breaker", "sling", "castleguard", "skyflyer"];
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

const lower = (s) => String(s == null ? "" : s).toLowerCase();
const clean = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n || 120);

// ---------------------------------------------------------------------------
//  1. WHICH ENGINE. Every sheet carries its own plain words, so this is a count,
//  not a table someone has to keep in step with the sheets.
// ---------------------------------------------------------------------------
export async function scoreEngines(text) {
  const t = " " + lower(text).replace(/[^a-z0-9' ]+/g, " ") + " ";
  const out = [];
  for (const id of ENGINE_IDS) {
    const sheet = await sheetFor(id);
    if (!sheet) continue;
    let score = 0; const hits = [];
    for (const w of (sheet.words || [])) {
      if (t.indexOf(" " + lower(w)) !== -1 || t.indexOf(lower(w) + " ") !== -1) { score += 1; hits.push(w); }
    }
    out.push({ engine: id, label: sheet.label, about: sheet.about || "", score, hits, sheet });
  }
  out.sort((a, b) => b.score - a.score || ENGINE_IDS.indexOf(a.engine) - ENGINE_IDS.indexOf(b.engine));
  return out;
}

// The themes an engine will really accept for its world, straight off the sheet.
export function themesOf(sheet) {
  const fromParts = sheet && sheet.level && sheet.level.parts && sheet.level.parts.themes;
  if (Array.isArray(fromParts) && fromParts.length) return fromParts.slice();
  for (const slot of (sheet.art || [])) {
    if (/parts\.(bricks|scene|world)$/.test(slot.key) && Array.isArray(slot.themes) && slot.themes[0] !== "*") return slot.themes.slice();
  }
  return [];
}
// A theme the words point at, or the engine's own first one. Never a theme the
// engine cannot take: an art slot that misses is a blank game.
export function pickTheme(text, sheet) {
  const t = lower(text);
  const themes = themesOf(sheet);
  const NEAR = { space: ["space", "star", "rocket", "moon", "planet", "alien", "galaxy", "night"],
    ocean: ["ocean", "sea", "water", "fish", "shark", "boat", "underwater", "mermaid", "island"],
    jungle: ["jungle", "forest", "tree", "vine", "monkey", "dino", "dinosaur", "tiger"],
    forest: ["forest", "wood", "tree", "fox", "owl", "bear"],
    candy: ["candy", "sweet", "cake", "sugar", "lolly", "chocolate", "donut"],
    desert: ["desert", "sand", "cactus", "pyramid", "camel", "canyon"],
    castle: ["castle", "knight", "dragon", "king", "queen", "prince"],
    castles: ["castle", "knight", "dragon", "king", "queen"],
    snow: ["snow", "ice", "winter", "penguin", "polar", "frozen"],
    grass: ["grass", "field", "farm", "meadow", "hill"],
    fall: ["autumn", "fall", "leaves", "pumpkin"] };
  for (const th of themes) {
    for (const w of (NEAR[th] || [th])) if (t.indexOf(w) !== -1) return th;
  }
  return themes[0] || null;
}

// ---------------------------------------------------------------------------
//  2. THE MANIFEST. Assembled from the SHIPPED manifest by named CB2 recipes, so
//  it can only ever be something the engine already plays.
// ---------------------------------------------------------------------------
export async function stockManifestFor(engine) {
  const txt = await readPublic(`${engine}/manifest.json`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

// choices: { name, theme, difficulty (1-5), levels (how many), color, feel, mathGate }
export async function assemble(engine, choices) {
  const [R, sheet, stock] = await Promise.all([recipeLib(), sheetFor(engine), stockManifestFor(engine)]);
  if (!R || !sheet || !stock) return { ok: false, error: "the studio could not read the " + engine + " game it builds on" };
  let m = stock, steps = [];
  const step = (id, params) => {
    const r = R.apply(id, m, params || {}, sheet);
    if (r.ok) { m = r.manifest; steps.push({ recipe: id, params: params || {} }); }
    return r.ok;
  };

  // Fewer levels first, so a later "harder" only touches the ones that survive.
  const want = Math.max(sheet.level.min || 1, Math.min(sheet.level.max || 12, parseInt(choices.levels, 10) || 3));
  let guard = 40;
  while ((m.levels || []).length > want && guard-- > 0) if (!step("removeLevel", {})) break;
  guard = 40;
  while ((m.levels || []).length < want && guard-- > 0) if (!step("addLevel", {})) break;

  if (choices.name) step("rename", { name: choices.name });
  if (choices.theme) step("swapWorld", { theme: choices.theme });
  if (choices.color) step("recolor", { color: choices.color });
  if (choices.feel === "zippy") step("zoomier", {});
  else if (choices.feel === "chill") step("calmer", {});
  if (choices.mathGate) step("mathGate", { on: true });

  // Difficulty is a nudge from where the shipped game sits, never a raw number.
  const want5 = Math.max(1, Math.min(5, parseInt(choices.difficulty, 10) || 2));
  const now = Math.round(((m.levels || []).reduce((a, l) => a + (l.difficulty || 2), 0) / Math.max(1, (m.levels || []).length)));
  for (let i = 0; i < Math.abs(want5 - now) && i < 5; i++) step(want5 > now ? "harder" : "easier", {});
  if ((m.levels || [])[0]) m.levels[0].unlocked = true;

  const lib = await manifestLib();
  if (!lib) return { ok: false, error: "the shared manifest loader could not be read" };
  const v = lib.validate(m, { strict: true, sheet });
  if (!v.ok) return { ok: false, error: "the plan did not fit the game", errors: v.errors };
  return { ok: true, manifest: m, steps, sheet };
}

// ---------------------------------------------------------------------------
//  3. WHAT A SENTENCE MEANS AS AN EDIT. Deterministic first: these are the
//  phrases children really use, mapped to CB2 recipes. The model only gets asked
//  when none of them match.
// ---------------------------------------------------------------------------
const EDIT_RULES = [
  { re: /\b(harder|tougher|too easy|more difficult|hard mode)\b/, recipe: "harder", said: "made every level a step harder" },
  { re: /\b(easier|too hard|simpler|easy mode|help me)\b/, recipe: "easier", said: "made every level a step easier" },
  { re: /\b(faster|quicker|speed|zoomy|zippy|hurry)\b/, recipe: "zoomier", said: "made the whole game quicker" },
  { re: /\b(slower|calmer|slow down|gentler|relax)\b/, recipe: "calmer", said: "made the whole game calmer" },
  { re: /\b(night|dark|evening|midnight|space at night)\b/, recipe: "nightMode", said: "turned it to night time" },
  { re: /\b(day|daytime|light|morning|sunny)\b/, recipe: "dayMode", said: "turned it back to day time" },
  { re: /\b(more coins?|more stars?|more treasure|more to collect)\b/, recipe: "moreCollectibles", said: "put more to collect in it" },
  { re: /\b(fewer coins?|less coins?|fewer stars?|too many coins)\b/, recipe: "fewerCollectibles", said: "put fewer things to collect in it" },
  { re: /\b(add|one more|another|extra)\b.{0,12}\blevels?\b/, recipe: "addLevel", said: "added one more level" },
  { re: /\b(remove|delete|take away|fewer|one less)\b.{0,12}\blevels?\b/, recipe: "removeLevel", said: "took a level away" },
  { re: /\b(add|put|give)\b.{0,16}\bboss\b/, recipe: "addBoss", said: "put a boss on the last level" },
  { re: /\b(no|remove|take away|get rid of)\b.{0,16}\bboss\b/, recipe: "removeBoss", said: "took the boss away" },
  { re: /\b(maths?|sums?|questions?|times tables?)\b/, recipe: "mathGate", params: { on: true }, said: "made it ask a question before the next level" },
];
const NAME_RE = /\b(call it|name it|rename it to|call the game)\s+(.{2,40})$/i;
// A spoken line is read in two halves: the MOMENT clause is taken off the end
// first ("when I win"), and whatever follows "say" is the line. Reading it as one
// pattern made the moment part of the words the game said out loud.
const SAY_RE = /\b(?:say|shout|make it say)\s+(.{2,80})$/i;
const WHEN_RE = /\s*\bwhen\s+(?:i|you|we|they)\s+(win|wins|land|lands|hit|hits|collect|collects|start|starts)\b.*$/i;
const WORLD_RE = /\b(?:in|to|make it|set it in)\s+(?:the\s+)?(space|ocean|sea|jungle|forest|candy|desert|castle|castles|snow|grass|fall)\b/i;
const SAY_EVENT = { win: "onWin", land: "onLand", hit: "onHit", collect: "onCollect", start: "onLevelStart" };

// Returns [{ recipe, params, said }] — possibly empty, which is the signal to ask
// the model, and if that is not there either, to make an honest offer instead.
export function readEdit(text, sheet) {
  const t = lower(text);
  const out = [];
  for (const r of EDIT_RULES) if (r.re.test(t)) out.push({ recipe: r.recipe, params: r.params || {}, said: r.said });
  const nm = NAME_RE.exec(String(text || "").trim());
  if (nm) out.push({ recipe: "rename", params: { name: clean(nm[2], 60) }, said: 'called it "' + clean(nm[2], 60) + '"' });
  const wr = WORLD_RE.exec(String(text || ""));
  if (wr) {
    const asked = lower(wr[1]) === "sea" ? "ocean" : lower(wr[1]);
    const themes = themesOf(sheet);
    const th = themes.indexOf(asked) !== -1 ? asked : (asked === "castle" && themes.indexOf("castles") !== -1 ? "castles" : null);
    if (th) out.push({ recipe: "swapWorld", params: { theme: th }, said: "moved it to the " + th });
  }
  if (/\b(say|shout)\b/i.test(text)) {
    const raw = String(text || "").trim();
    const wh = WHEN_RE.exec(raw);
    const when = SAY_EVENT[lower((wh && wh[1]) || "win").replace(/s$/, "")] || "onWin";
    const sy = SAY_RE.exec(wh ? raw.replace(WHEN_RE, "") : raw);
    const line = sy ? clean(String(sy[1]).replace(/^["“']|["”'.!]+$/g, ""), 80) : "";
    const events = (sheet && sheet.rules && sheet.rules.events) || [];
    if (line && events.indexOf(when) !== -1) out.push({ recipe: "voiceLine", params: { when, text: line }, said: 'made it say "' + line + '"' + (when === "onWin" ? " when you win" : "") });
  }
  // Only ever one of each recipe, in the order they were understood.
  const seen = {}; return out.filter((s) => (seen[s.recipe] ? false : (seen[s.recipe] = 1)));
}

// The honest no. Never "I cannot"; always the nearest thing this engine CAN do,
// taken from the sheet's own never list plus the recipes it really has.
export function nearestOffer(text, sheet, R) {
  const never = (sheet.never || []);
  const t = lower(text);
  let why = null;
  for (const line of never) {
    const words = lower(line).replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 4);
    if (words.some((w) => t.indexOf(w) !== -1)) { why = line; break; }
  }
  const ids = R ? R.list(sheet.engine).map((r) => r.id) : [];
  const handy = ["harder", "easier", "zoomier", "calmer", "swapWorld", "addLevel", "moreCollectibles", "voiceLine"].filter((k) => ids.indexOf(k) !== -1);
  return {
    said: why ? why : "I could not work out how to do that in " + (sheet.label || sheet.engine) + " yet.",
    nearest: handy.slice(0, 4),
  };
}

// ---------------------------------------------------------------------------
//  4. THE MODEL, when there is one. Always optional, always checked afterwards.
// ---------------------------------------------------------------------------
export async function askClaude(prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens || 700, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d && d.content && d.content[0] && d.content[0].text) || null;
  } catch { return null; }
}
export function jsonFrom(text) {
  if (!text) return null;
  try { const s = text.indexOf("{"), e = text.lastIndexOf("}"); return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
