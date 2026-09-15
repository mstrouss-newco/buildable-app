// /api/_forgeSpec.js — WHAT A FORGED CARTRIDGE MUST BE (Session CB5, layer three).
//
// Layers one and two build a kid's game out of a game we already ship. Layer
// three is for the idea no engine covers — a lemonade stand, a fishing game —
// and it writes a BRAND NEW cartridge. That is the most dangerous thing in this
// product, so the rules live here, in one file, and both the forge and the QA
// gate read the same ones. Nothing about a forged game is decided in prose.
//
//   briefFor(...)     the system prompt, assembled out of the repo's own docs
//                     (BUILDING-A-GAME, CARTRIDGE-CONTRACT, GAME-FEEL,
//                     HUD-AND-NAV-RULES, MECHANICS) the way a framework feeds
//                     its rules to a model, plus the hard shape below.
//   staticCheck(html) the checks that never need a model, a browser or a kid:
//                     only our libraries, no network, no storage, no emoji, no
//                     eval, a size cap, and the two hooks the robot plays it by.
//
// THE SHAPE A FORGED CARTRIDGE HAS. It is not negotiable and the model is told
// it plainly:
//   * ONE html file. Every script is inline except the shared libraries below.
//   * It reads `window.GAME_CONFIG` (the shell hands it the kid's manifest,
//     already strict-validated) and NEVER fetches a manifest itself.
//   * It publishes `window.BUILDABLE_GAME = { sim, _cfg }` — the same play hook
//     every shipped engine has, which is how the CB2 robot plays a game that has
//     existed for four seconds without a second robot being written.
//   * It draws NO menus and NO back button: the shell draws those. It talks to
//     the shell only in cartridge-contract messages.
//   * It hardcodes NO art. Pictures come from the manifest's art slots, which is
//     what lets the studio paint a kid's dragon into a game nobody has built yet.
export const ALLOWED_LIBS = [
  "buildable-feel.js", "buildable-hud.js", "buildable-gamenav.js", "buildable-wincard.js",
  "buildable-audio.js", "buildable-manifest.js", "buildable-mechanics.js", "buildable-renders.js",
];
export const MAX_BYTES = 120 * 1024;     // a cartridge, not an application
export const MAX_TRIES = 3;              // then we stop and offer a game that works

// Anything here in a forged file is an instant refusal. A child's game has no
// business reaching the network, the disk, or the evaluator.
const BANNED = [
  [/\beval\s*\(/, "eval"],
  [/new\s+Function\s*\(/, "new Function"],
  [/\bimport\s*\(/, "dynamic import"],
  [/\bfetch\s*\(/, "fetch"],
  [/XMLHttpRequest/, "XMLHttpRequest"],
  [/WebSocket/, "WebSocket"],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, "browser storage"],
  [/document\s*\.\s*cookie/, "cookies"],
  [/<iframe/i, "an iframe"],
  [/<form/i, "a form"],
  [/\bnavigator\s*\.\s*(sendBeacon|geolocation|mediaDevices)/, "a device API"],
  [/\bWorker\s*\(/, "a worker"],
];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}]/u;

const scriptSrcs = (html) => [...String(html).matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
const inlineScript = (html) => [...String(html).matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");

// Every check returns the SAME shape, because every failure is fed straight back
// to the model as the next attempt's instruction. A refusal a model cannot read
// is a refusal that never gets fixed.
export function staticCheck(html) {
  const src = String(html || "");
  const bad = [];
  const bytes = Buffer.byteLength(src, "utf8");

  if (!src.trim()) bad.push("the file is empty");
  if (bytes > MAX_BYTES) bad.push(`the file is ${Math.round(bytes / 1024)}KB; the limit is ${MAX_BYTES / 1024}KB — make the game smaller, not the code denser`);
  if (!/<canvas/i.test(src)) bad.push("there is no <canvas> — a forged game draws on a canvas");

  for (const s of scriptSrcs(src)) {
    const file = s.replace(/^\/+/, "").split("?")[0];
    if (/^[a-z]+:/i.test(s) || s.startsWith("//")) bad.push(`the script "${s}" comes from somewhere else; a cartridge loads nothing from outside`);
    else if (ALLOWED_LIBS.indexOf(file) === -1) bad.push(`the script "${s}" is not one of ours; the only libraries allowed are ${ALLOWED_LIBS.join(", ")}`);
  }
  // Any other absolute URL anywhere in the file (an image, a font, a ping).
  for (const m of src.matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    bad.push(`"${m[0]}" points outside the site; art comes from the manifest and nothing else is fetched`);
    break;
  }

  const js = inlineScript(src);
  for (const [re, what] of BANNED) if (re.test(js) || re.test(src)) bad.push(`it uses ${what}, which a forged game may never do`);
  if (EMOJI.test(src)) bad.push("it contains an emoji; every icon in this product is drawn shapes");

  if (!/window\s*\.\s*BUILDABLE_GAME\s*=/.test(js)) bad.push("it never sets window.BUILDABLE_GAME, so the robot cannot play it");
  if (!/\bsim\b\s*[:(]/.test(js)) bad.push("BUILDABLE_GAME has no sim(levelIndex, budget) hook, so the robot cannot play it");
  if (!/\b_cfg\b\s*[:(]/.test(js)) bad.push("BUILDABLE_GAME has no _cfg() hook, so the robot cannot see the levels");
  if (!/GAME_CONFIG/.test(js)) bad.push("it never reads window.GAME_CONFIG, so it would ignore the kid's own game");
  if (!/postMessage/.test(js)) bad.push("it never talks to the shell; it must post the cartridge-contract messages");
  // A cheap smell test, not the proof: a game can spell the win message a dozen
  // ways. What actually settles it is the robot, which captures every message
  // the game posts while it plays and refuses a game that never says it was won
  // (see gate() in api/cobuild-forge.js). This catches the obvious miss early
  // and for nothing.
  if (!/["']win["']/.test(js)) bad.push('it never mentions the "win" message, so a family could never keep it');

  return { ok: bad.length === 0, problems: bad };
}

// The brief. The docs go in whole, the way a framework hands a model its rules,
// and the hard shape is repeated afterwards because a model that has just read
// 1,200 lines of documentation needs the contract last, not first.
export function briefFor({ docs, idea, star, theme, name, levels, sheetExample, failures }) {
  const doc = (title, text) => text ? `\n\n===== ${title} =====\n${text}` : "";
  return [
    "You are writing ONE new game for Buildable Kids, a product for young children.",
    "The rules below are this company's own documentation. They are not suggestions.",
    doc("BUILDING-A-GAME.md", docs.building),
    doc("CARTRIDGE-CONTRACT.md", docs.contract),
    doc("GAME-FEEL.md", docs.feel),
    doc("HUD-AND-NAV-RULES.md", docs.hud),
    doc("MECHANICS.md (the recipe book)", docs.mechanics),
    "\n\n===== WHAT THE CHILD ASKED FOR =====",
    `They said: "${idea}"`,
    `The star of the game is: ${star}`,
    `The world is: ${theme}`,
    `The game is called: ${name}`,
    `It has ${levels} levels, easiest first.`,
    "\n\n===== THE SHAPE YOUR ANSWER MUST HAVE =====",
    "Reply with THREE fenced blocks and nothing else, in this order:",
    "```html  — the whole cartridge, one file",
    "```json  — its manifest. It MUST carry `levelProfile: \"forge\"` (that is how the shared loader knows this is a new game rather than one of ours), plus id, name, type:\"game\", shellVersion:2, engine:\"canvas\", entry, art and levels[]. Every level needs id, name and a difficulty of 1 to 5; anything else a level needs goes in its `parts` object.",
    "```json  — its cobuild sheet, the same shape as this one:",
    (sheetExample || "").slice(0, 1400),
    "\nHARD RULES for the html file:",
    `* The ONLY <script src> allowed are: ${ALLOWED_LIBS.join(", ")} (relative paths, e.g. "/buildable-feel.js"). Everything else is inline.`,
    "* NO fetch, no XMLHttpRequest, no WebSocket, no localStorage, no cookies, no eval, no new Function, no iframe, no form, no worker.",
    "* NO emoji anywhere. Every icon is drawn with canvas shapes or SVG geometry.",
    "* NO art baked in. Read picture keys from the manifest's art slots and the level parts; if a picture is missing, DRAW the thing with shapes instead. The game must look right with no pictures at all.",
    "* NO menus, no title screen, no back button, no settings, no pause button: the shell draws all of that.",
    "* Read window.GAME_CONFIG for the levels. Never fetch a manifest. Each level there carries `parts`, exactly as your manifest wrote it.",
    "* The cobuild sheet is YOUR OWN FENCE: it lists the manifest fields and level fields this game reads, and the manifest is checked against it strictly. `manifest.fixed` must include levelProfile:\"forge\", type:\"game\" and shellVersion:2.",
    "* Publish `window.BUILDABLE_GAME = { sim: function(levelIndex, budget){...}, _cfg: function(){...} }`.",
    "    - `_cfg()` returns `{ levels: [...] }`, the levels the game will actually play.",
    "    - `sim(levelIndex, budget)` plays that level HEADLESSLY with a simple built-in player, with no canvas, no timers and no rendering, stepping at most `budget` frames, and returns `{ result: \"win\" | \"lose\" | \"timeout\", frames: <number> }`. It must be able to WIN a level a child could win. This is how the game is tested before any child sees it.",
    "* When the player finishes a level post `{source:\"buildable\", kind:\"levelup\"}` to window.parent, and when they finish the last one post `{source:\"buildable\", kind:\"win\"}`.",
    "* Honour `pause` and `resume` messages from the shell.",
    "* Keep it gentle: nothing frightening, nobody dies, a child who is struggling still gets to the end.",
    failures && failures.length
      ? "\n\n===== YOUR LAST ATTEMPT WAS REFUSED =====\nFix exactly these and change nothing else:\n- " + failures.join("\n- ")
      : "",
  ].join("\n");
}

// The three blocks back out of the model's answer. A block that is missing is a
// failure with a sentence the next attempt can act on, never a crash.
export function partsFrom(text) {
  const blocks = [...String(text || "").matchAll(/```(?:html|json)?\s*\n([\s\S]*?)```/gi)].map((m) => m[1].trim());
  const html = blocks.find((b) => /<canvas|<!doctype|<html/i.test(b)) || null;
  const jsons = [];
  for (const b of blocks) { if (b === html) continue; try { jsons.push(JSON.parse(b)); } catch {} }
  const manifest = jsons.find((j) => Array.isArray(j.levels)) || null;
  const sheet = jsons.find((j) => j && j.manifest && j.level) || jsons.find((j) => j !== manifest) || null;
  const missing = [];
  if (!html) missing.push("there was no html block in your answer");
  if (!manifest) missing.push("there was no manifest block with a levels array");
  if (!sheet) missing.push("there was no cobuild sheet block");
  return { html, manifest, sheet, missing };
}
