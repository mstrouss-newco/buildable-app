// src/quickgame-content.js
// -------------------------------------------------------------
// Session QZ1 — the CONTENT half of QuickGame, kept as plain JS (no JSX, no
// React) for one reason: qa-quickgame.mjs can import this file directly and
// prove every deal is winnable and every word is spellable, without a browser.
// The drawing half lives in QuickGame.jsx.
//
// Nothing here calls an API. A round costs zero.
// -------------------------------------------------------------

// hideEasy = one blank (youngest), hideFull = the harder blanks. The FIRST
// letter is never blanked: that initial sound is the strongest handle a
// beginning reader has, and hiding it turns the game into a guess.
const WORDS = [
  { word: "SUN", pic: "SUN", hideEasy: [1], hideFull: [1] },
  { word: "CAT", pic: "CAT", hideEasy: [1], hideFull: [1] },
  { word: "MOON", pic: "MOON", hideEasy: [1], hideFull: [1, 3] },
  { word: "STAR", pic: "STAR", hideEasy: [1], hideFull: [1, 2] },
  { word: "FISH", pic: "FISH", hideEasy: [2], hideFull: [1, 2] },
  { word: "TREE", pic: "TREE", hideEasy: [1], hideFull: [1, 3] },
  { word: "LEAF", pic: "LEAF", hideEasy: [1], hideFull: [1, 2] },
  { word: "BOAT", pic: "BOAT", hideEasy: [1], hideFull: [1, 2] },
  { word: "BALL", pic: "BALL", hideEasy: [1], hideFull: [1, 2] },
  { word: "CAKE", pic: "CAKE", hideEasy: [1], hideFull: [1, 3] },
  { word: "BIRD", pic: "BIRD", hideEasy: [1], hideFull: [1, 2] },
  { word: "HOUSE", pic: "HOUSE", hideEasy: [1], hideFull: [1, 3] },
];

const SHAPES = ["circle", "square", "triangle"];
const HUES = [
  { fill: "#FF7043", line: "#D8452B" },
  { fill: "#4FC3F7", line: "#1E88E5" },
  { fill: "#FFD24A", line: "#F0A81E" },
];

/* ===========================================================================
   Helpers
   =========================================================================== */
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
function shuffle(a) {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function activeKidId() {
  try { return localStorage.getItem("bk_active_kid_v1") || null; } catch (e) { return null; }
}

// Which game fits this moment. Pre-readers get the picture pattern; otherwise
// the goal steers it, with "mix" rotating so a kid sees variety.
function chooseGame(goal, age) {
  if (age <= 5) return Math.random() < 0.6 ? "pattern" : "spell";
  if (goal === "reading") return Math.random() < 0.8 ? "spell" : "pattern";
  if (goal === "mix") return pick(["spell", "number", "pattern"]);
  return Math.random() < 0.8 ? "number" : "pattern";
}


const SUBJECT = { spell: "spelling", number: "math", pattern: "geometry" };
const HEADING = { spell: "Spell it", number: "Make the number", pattern: "Pattern time" };

/* --------------------------- deals --------------------------------------- */
function dealSpell(age) {
  const w = pick(WORDS);
  const need = age <= 6 ? w.hideEasy : w.hideFull;
  const letters = w.word.split("");
  const answers = need.map((i) => letters[i]);
  const pool = "ABCDEFGHIJKLMNOPRSTUW".split("").filter((c) => !answers.includes(c));
  const tray = shuffle(answers.concat(shuffle(pool).slice(0, Math.max(2, 6 - answers.length))));
  return { word: w.word, pic: w.pic, need, letters, tray };
}

function dealNumber(age) {
  const max = age <= 6 ? 10 : age <= 8 ? 14 : 20;
  const target = 5 + rnd(Math.max(2, max - 4));
  const a = 1 + rnd(target - 1), b = target - a;
  let c = 1 + rnd(target - 1), d = target - c;
  if (c === a || c === b) { c = Math.max(1, c === 1 ? 2 : c - 1); d = target - c; }
  const cards = [a, b, c, d];
  while (cards.length < 6) cards.push(1 + rnd(max));
  return { target, cards: shuffle(cards) };
}

function dealPattern() {
  // Pair a distinct shape with a distinct colour for each token, so the pieces
  // never differ by colour alone — a 4-year-old has to be able to tell them
  // apart at a glance. Two-token patterns are the common case; the three-token
  // one shows up less often because it is a real step up.
  const sh = shuffle(SHAPES), hu = shuffle([0, 1, 2]);
  const [A, B, C] = [0, 1, 2].map((i) => `${sh[i]}-${hu[i]}`);
  const roll = Math.random();
  const kind = roll < 0.5 ? 0 : roll < 0.8 ? 1 : 2;
  const unit = kind === 0 ? [A, B] : kind === 1 ? [A, A, B] : [A, B, C];
  const seq = [];
  for (let i = 0; i < 5; i++) seq.push(unit[i % unit.length]);
  const answer = unit[5 % unit.length];
  const wrongs = shuffle([A, B, C].filter((t) => t !== answer)).slice(0, 2);
  return { seq, answer, choices: shuffle([answer].concat(wrongs)) };
}

export { WORDS, SHAPES, HUES, rnd, pick, shuffle, chooseGame, dealSpell, dealNumber, dealPattern, SUBJECT, HEADING };
