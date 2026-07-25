// /api/_lessongen.js
// -------------------------------------------------------------
// THE LESSON DRAFTER (Session LS3). Turns one row of the lesson map
// (public/lessons/index.json) into a complete lesson in the LS1 player shape,
// ready to be written into lesson_bank as status='pending'.
//
// Two engines, same output shape:
//   1. AUTHORED (source:'local') — K-2 math and shapes. These skills are
//      formulaic enough that a hand-authored plan per lesson beats a model
//      call: it is free, instant, identical every run, and the teaching words
//      are deliberate. This is the same reasoning _quizgen.js uses for
//      LOCALLY_GENERATED_SKILLS.
//   2. MODEL (source:'ai') — everything else (reading, spelling, and any
//      grade-3-plus skill). Asks Claude for the same JSON shape, then runs it
//      through the SAME validator, so a sloppy draft is rejected rather than
//      landing in the queue.
//
// NOTHING here decides what a kid sees. Every lesson this file makes is
// status='pending' until the owner approves it on /lesson-review.
//
// HARD RULES the validator enforces (all learned the hard way in LS1):
//   - Every `say` line is <= 60 chars, carries no '+' or '=' and no digits-only
//     math symbols, because /api/say caps at 60 chars and strips those glyphs.
//     Numbers in say lines are written as words ("seven plus three makes ten").
//   - No emojis anywhere (product rule). Art is named slots or drawn geometry.
//   - 3-5 teach cards, 2-3 guided questions, exactly 5 mastery-check questions,
//     mastery 4 of 5, 2-3 choices per question, correctIndex in range.
//   - Art is NAMED, never a hardcoded path.
// -------------------------------------------------------------
import crypto from "crypto";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// The painted art LS1 already ships and the player already knows how to draw.
// Session LS3 deliberately REUSES this set rather than generating new art:
// the owner chose "reuse existing art" so the batch costs nothing and looks
// consistent with the one hand-built lesson. A bespoke painted lesson set is
// still open as its own session.
export const LESSON_ART = {
  buddy: "buddy-star",
  star: "star-mastered",
  counterA: "counter-flower",
  counterB: "counter-crystal",
  frame: 10,
};

// ---------------------------------------------------------------
// say-line safety. /api/say caps at 60 chars and strips '+' and '='.
// ---------------------------------------------------------------
const NUM_WORD = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"];
export const numWord = (n) => (NUM_WORD[n] != null ? NUM_WORD[n] : String(n));

// Rough emoji / pictograph guard. Product rule: no emojis anywhere.
const EMOJI_RE = /[‼-㊙\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}]/u;

export function sayProblems(line) {
  const bad = [];
  const s = String(line == null ? "" : line);
  if (!s.trim()) bad.push("empty say line");
  if (s.length > 60) bad.push(`say line over 60 chars: "${s.slice(0, 30)}..."`);
  if (/[+=]/.test(s)) bad.push(`say line contains + or =: "${s.slice(0, 30)}"`);
  if (EMOJI_RE.test(s)) bad.push("say line contains an emoji");
  return bad;
}

// ---------------------------------------------------------------
// Validator. Runs on EVERY lesson from EVERY engine before it is stored.
// ---------------------------------------------------------------
export function validateLesson(L) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };

  need(L && typeof L === "object", "not an object");
  if (!L || typeof L !== "object") return { ok: false, errors: e };

  need(L.schema === 1, "schema must be 1");
  need(!!L.id, "missing id");
  need(!!L.title, "missing title");
  need(!!L.subject, "missing subject");
  need(!!L.skill, "missing skill");
  need(!!L.quizType, "missing quizType");
  need(L.art && typeof L.art === "object", "missing art");
  need(L.mastery && L.mastery.need === 4 && L.mastery.of === 5, "mastery must be 4 of 5");
  need(L.reward && Number(L.reward.coins) > 0, "missing coin reward");

  // Step 1 - intro
  need(L.intro && L.intro.buddy && L.intro.headline && L.intro.body, "intro incomplete");

  // Step 2 - teach cards
  need(Array.isArray(L.teach) && L.teach.length >= 3 && L.teach.length <= 5,
    `teach must have 3 to 5 cards, got ${(L.teach || []).length}`);
  (L.teach || []).forEach((c, i) => {
    need(!!c.headline, `teach card ${i + 1} missing headline`);
    need(!!c.body, `teach card ${i + 1} missing body`);
    need(Array.isArray(c.say) && c.say.length > 0, `teach card ${i + 1} missing say lines`);
  });

  // Step 3 - guided
  need(Array.isArray(L.guided) && L.guided.length >= 2 && L.guided.length <= 3,
    `guided must have 2 or 3 questions, got ${(L.guided || []).length}`);
  (L.guided || []).forEach((q, i) => {
    need(!!q.question, `guided ${i + 1} missing question`);
    need(!!q.hint, `guided ${i + 1} missing hint - this step can never fail, so a hint is required`);
    checkChoices(q, `guided ${i + 1}`, e);
  });

  // Step 4 - on your own
  need(L.solo && Number(L.solo.count) >= 5, "solo count must be at least 5");
  need(L.solo && L.solo.fromBank === true, "solo.fromBank must be true - practice comes from the approved question bank");
  need(Array.isArray(L.solo && L.solo.fallback) && L.solo.fallback.length >= 5,
    "solo needs at least 5 fallback questions so a kid is never blocked");
  ((L.solo && L.solo.fallback) || []).forEach((q, i) => checkChoices(q, `solo fallback ${i + 1}`, e));

  // Step 5 - mastery check
  need(Array.isArray(L.check) && L.check.length === 5, `check must have exactly 5 questions, got ${(L.check || []).length}`);
  (L.check || []).forEach((q, i) => checkChoices(q, `check ${i + 1}`, e));

  need(L.reteach && L.reteach.headline && L.reteach.body, "reteach incomplete");
  need(L.mastered && L.mastered.headline, "mastered incomplete");

  // say lines and emoji sweep across the whole lesson
  collectSay(L).forEach((line) => sayProblems(line).forEach((p) => e.push(p)));
  collectText(L).forEach((t) => { if (EMOJI_RE.test(t)) e.push(`emoji in text: "${String(t).slice(0, 24)}"`); });

  return { ok: e.length === 0, errors: e };
}

function checkChoices(q, where, e) {
  const ch = q && q.choices;
  if (!Array.isArray(ch) || ch.length < 2 || ch.length > 3) {
    e.push(`${where}: needs 2 or 3 choices, got ${Array.isArray(ch) ? ch.length : 0}`);
    return;
  }
  if (new Set(ch.map(String)).size !== ch.length) e.push(`${where}: duplicate choices`);
  const ix = q.correctIndex;
  if (!Number.isInteger(ix) || ix < 0 || ix >= ch.length) e.push(`${where}: correctIndex out of range`);
  if (!q.question) e.push(`${where}: missing question text`);
}

function collectSay(L) {
  const out = [];
  const add = (a) => { (a || []).forEach((s) => out.push(s)); };
  add(L.intro && L.intro.say);
  (L.teach || []).forEach((c) => add(c.say));
  (L.guided || []).forEach((q) => add(q.say));
  add(L.reteach && L.reteach.say);
  add(L.mastered && L.mastered.say);
  return out;
}

function collectText(L) {
  const out = [L.title];
  if (L.intro) out.push(L.intro.buddy, L.intro.headline, L.intro.body, L.intro.cta);
  (L.teach || []).forEach((c) => out.push(c.headline, c.body));
  (L.guided || []).forEach((q) => { out.push(q.question, q.hint); (q.choices || []).forEach((c) => out.push(c)); });
  ((L.solo && L.solo.fallback) || []).forEach((q) => { out.push(q.question); (q.choices || []).forEach((c) => out.push(c)); });
  (L.check || []).forEach((q) => { out.push(q.question); (q.choices || []).forEach((c) => out.push(c)); });
  if (L.reteach) out.push(L.reteach.headline, L.reteach.body, L.reteach.cta);
  if (L.mastered) out.push(L.mastered.headline);
  return out.filter(Boolean);
}

// De-dupe basis: the lesson key plus the words that make it that lesson.
// A re-run with identical content collides on content_hash and is ignored.
export function lessonContentHash(L) {
  const basis = [
    L.id, L.skill, L.title,
    (L.teach || []).map((c) => c.headline + "|" + c.body).join("~"),
    (L.check || []).map((q) => q.question + "|" + (q.choices || []).join(",")).join("~"),
  ].join("~");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

// ---------------------------------------------------------------
// Shared builders for the pieces every math lesson needs.
// ---------------------------------------------------------------
// Wrong answers that are near-misses (off by one, reversed) teach more than
// random numbers, and 3 choices keeps a K-grade tap target big.
function numChoices(correct, wrongs) {
  const seen = new Set([String(correct)]);
  const opts = [String(correct)];
  for (const w of wrongs) {
    const s = String(w);
    if (!seen.has(s) && Number(w) >= 0 && opts.length < 3) { seen.add(s); opts.push(s); }
  }
  let g = 1;
  while (opts.length < 3 && g < 30) { const s = String(Number(correct) + g); if (!seen.has(s)) { seen.add(s); opts.push(s); } g++; }
  // Deterministic placement that still moves the correct answer around, so a
  // kid cannot pass by always tapping the same spot.
  const at = (Number(correct) + String(correct).length) % opts.length;
  const arr = opts.slice(1);
  arr.splice(at, 0, opts[0]);
  return { choices: arr, correctIndex: at };
}

const addQ = (a, b) => {
  const c = numChoices(a + b, [a + b + 1, a + b - 1, a + b + 2]);
  return { question: `${a} + ${b} = ?`, choices: c.choices, correctIndex: c.correctIndex };
};
const missingQ = (a, total) => {
  const c = numChoices(total - a, [total - a + 1, total - a - 1, total - a + 2]);
  return { question: `${a} + ? = ${total}`, choices: c.choices, correctIndex: c.correctIndex };
};
// NOTE: step 4 and step 5 in the player render question TEXT only - no picture.
// So every check/practice question must be answerable from words alone. Only
// teach cards and guided questions get art. This is why there is no "how many
// dots" question type here.
const afterQ = (n) => {
  const c = numChoices(n + 1, [n, n + 2, n - 1]);
  return { question: `What number comes after ${n}?`, choices: c.choices, correctIndex: c.correctIndex };
};
const beforeQ = (n) => {
  const c = numChoices(n - 1, [n, n - 2, n + 1]);
  return { question: `What number comes before ${n}?`, choices: c.choices, correctIndex: c.correctIndex };
};
const seqQ = (a) => {
  const c = numChoices(a + 3, [a + 2, a + 4, a + 1]);
  return { question: `What comes next? ${a}, ${a + 1}, ${a + 2}, ...`, choices: c.choices, correctIndex: c.correctIndex };
};
const moreQ = (a, b) => {
  const big = Math.max(a, b), small = Math.min(a, b);
  const at = (big + small) % 2;
  const choices = at === 0 ? [String(big), String(small)] : [String(small), String(big)];
  return { question: `Which is more, ${a} or ${b}?`, choices, correctIndex: choices.indexOf(String(big)) };
};
const oneMoreQ = (n) => {
  const c = numChoices(n + 1, [n, n + 2, n - 1]);
  return { question: `What is one more than ${n}?`, choices: c.choices, correctIndex: c.correctIndex };
};
const oneLessQ = (n) => {
  const c = numChoices(n - 1, [n, n - 2, n + 1]);
  return { question: `What is one less than ${n}?`, choices: c.choices, correctIndex: c.correctIndex };
};
const countOnQ = (a, b) => {
  const c = numChoices(a + b, [a + b + 1, a + b - 1, a]);
  return { question: `Start at ${a} and count on ${b}. Where do you land?`, choices: c.choices, correctIndex: c.correctIndex };
};
const shapeSidesQ = (name, sides) => {
  const c = numChoices(sides, [sides + 1, sides - 1, sides + 2]);
  return { question: `How many sides does a ${name} have?`, choices: c.choices, correctIndex: c.correctIndex };
};
// Shape questions must test KNOWING, not reading: "which one is the circle" with
// the word circle sitting in the choices is free. So every shape question asks
// about a property (sides, corners, roundness, a real-world object).
function shapeFactQ(question, correct, others) {
  const opts = [correct].concat(others).slice(0, 3);
  const at = (question.length + correct.length) % opts.length;
  const arr = opts.slice(1); arr.splice(at, 0, correct);
  return { question, choices: arr, correctIndex: at };
}

// ---------------------------------------------------------------
// THE AUTHORED PLANS. One entry per lesson key in the map. Each plan carries
// the words a grown-up would actually say, plus how to build its questions.
// Keys MUST match public/lessons/index.json exactly.
// ---------------------------------------------------------------
export const LESSON_PLANS = {
  // ---------- Kindergarten Math, Unit 1: Counting to 10 ----------
  "k-math-count-to-5": {
    frame: 5,
    intro: {
      buddy: "Let's count all the way to five together.",
      headline: "Count to 5",
      body: "Counting means one number for one thing. We touch each one as we say it.",
      say: ["Let's count all the way to five together.", "One number for one thing."],
    },
    teach: [
      { show: { a: 3, b: 0 }, headline: "One number, one thing",
        body: "Touch each one as you say it. One. Two. Three. The last number you say is how many there are.",
        say: ["Touch each one as you say it.", "One. Two. Three.", "The last number tells how many."] },
      { show: { a: 4, b: 0 }, headline: "Keep going to four",
        body: "One, two, three, four. Four things sit in the frame. Nothing gets counted twice.",
        say: ["One, two, three, four.", "Four things in the frame."] },
      { show: { a: 5, b: 0 }, headline: "Five fills the row",
        body: "One, two, three, four, five. Five fills the whole row. Five is a handful, like your fingers.",
        say: ["One, two, three, four, five.", "Five fills the whole row.", "Five is like the fingers on one hand."] },
    ],
    guided: [
      { show: { a: 2, b: 0 }, question: "How many are in the frame?", choices: ["1", "2"], correctIndex: 1,
        hint: "Touch each one. One, two. You stopped at two.", say: ["How many are in the frame?"] },
      { show: { a: 5, b: 0 }, question: "How many now?", choices: ["4", "5"], correctIndex: 1,
        hint: "The row is full. A full row is five.", say: ["How many are there now?"] },
    ],
    questions: () => [afterQ(1), afterQ(3), beforeQ(4), moreQ(2, 5), seqQ(1),
      afterQ(2), beforeQ(3), moreQ(4, 1), afterQ(4), beforeQ(5)],
    reteach: { body: "Counting is easier when we go slowly and touch each one. Let's watch again." },
  },

  "k-math-count-to-10": {
    intro: {
      buddy: "Five was great. Now we go all the way to ten.",
      headline: "Count to 10",
      body: "After five comes six, seven, eight, nine, ten. Ten fills two whole rows.",
      say: ["Five was great. Now we go to ten.", "Six, seven, eight, nine, ten."],
    },
    teach: [
      { show: { a: 6, b: 0 }, headline: "Past five",
        body: "One row of five is full, and one more sits below. That makes six.",
        say: ["One row of five, and one more.", "That makes six."] },
      { show: { a: 8, b: 0 }, headline: "Seven, then eight",
        body: "Keep going along the second row. Six, seven, eight. Eight things in the frame.",
        say: ["Six, seven, eight.", "Eight things in the frame."] },
      { show: { a: 10, b: 0 }, headline: "Ten fills the frame",
        body: "Nine, then ten. Ten fills both rows all the way up. Ten is a big, tidy number.",
        say: ["Nine, then ten.", "Ten fills both rows.", "Ten is a big tidy number."] },
    ],
    guided: [
      { show: { a: 7, b: 0 }, question: "How many are in the frame?", choices: ["6", "7"], correctIndex: 1,
        hint: "The top row is five. Count on. Six, seven.", say: ["How many are in the frame?"] },
      { show: { a: 10, b: 0 }, question: "How many when both rows are full?", choices: ["9", "10"], correctIndex: 1,
        hint: "Five on top and five below. That is ten.", say: ["How many when both rows are full?"] },
    ],
    questions: () => [afterQ(6), afterQ(8), beforeQ(9), moreQ(7, 10), seqQ(6),
      afterQ(7), beforeQ(8), moreQ(6, 9), afterQ(9), beforeQ(10)],
    reteach: { body: "The trick is the top row. It is always five, so we count on from there." },
  },

  "k-math-count-on": {
    intro: {
      buddy: "Here is a shortcut. You do not have to start at one.",
      headline: "Counting on",
      body: "If you already know how many are there, you can start from that number and keep going.",
      say: ["Here is a shortcut.", "You do not have to start at one."],
    },
    teach: [
      { show: { a: 4, b: 2 }, headline: "Start from what you know",
        body: "Four are already in. Two more join. Start at four and count on. Five, six. Six in all.",
        say: ["Four are already in. Two more join.", "Start at four. Five, six.", "Six in all."] },
      { show: { a: 6, b: 3 }, headline: "Count on three",
        body: "Six are in. Three more join. Six, then seven, eight, nine. Nine in all.",
        say: ["Six are in, and three more join.", "Seven, eight, nine.", "Nine in all."] },
      { show: { a: 8, b: 1 }, headline: "One more is the next number",
        body: "Eight are in and one joins. Counting on one is just the next number. Nine.",
        say: ["Eight are in, and one joins.", "Counting on one gives the next number.", "Nine."] },
    ],
    guided: [
      { show: { a: 5, b: 2 }, question: "Start at 5 and count on 2. Where do you land?", choices: ["6", "7"], correctIndex: 1,
        hint: "Say it out loud. Six, seven. That was two hops.", say: ["Start at five and count on two."] },
      { show: { a: 7, b: 2 }, question: "Start at 7 and count on 2.", choices: ["9", "8"], correctIndex: 0,
        hint: "Eight, nine. Two hops from seven.", say: ["Start at seven and count on two."] },
    ],
    questions: () => [[4, 2], [5, 3], [6, 2], [3, 4], [7, 2], [2, 3], [8, 2], [6, 3], [5, 4], [1, 5]].map(([a, b]) => countOnQ(a, b)),
    reteach: { body: "Counting on saves time, but only if we start at the number we already know." },
  },

  "k-math-one-more": {
    intro: {
      buddy: "Every number has a neighbor on each side.",
      headline: "One more, one less",
      body: "One more is the next number up. One less is the number just before.",
      say: ["Every number has a neighbor.", "One more goes up. One less goes back."],
    },
    teach: [
      { show: { a: 4, b: 1 }, headline: "One more goes up",
        body: "Four, and one more joins. That is five. One more is always the next number when you count.",
        say: ["Four, and one more joins.", "That is five.", "One more is the next number."] },
      { show: { a: 6, b: 0 }, headline: "One less goes back",
        body: "Six, and one hops away. That leaves five. One less is the number just before.",
        say: ["Six, and one hops away.", "That leaves five.", "One less is the number before."] },
      { show: { a: 9, b: 1 }, headline: "Neighbors on both sides",
        body: "Nine has ten on one side and eight on the other. Every number sits between its two neighbors.",
        say: ["Nine has ten on one side.", "And eight on the other side.", "Every number sits between two neighbors."] },
    ],
    guided: [
      { show: { a: 3, b: 1 }, question: "What is one more than 3?", choices: ["4", "2"], correctIndex: 0,
        hint: "Count up one step. Three, four.", say: ["What is one more than three?"] },
      { show: { a: 7, b: 0 }, question: "What is one less than 7?", choices: ["8", "6"], correctIndex: 1,
        hint: "Step back one. The number before seven is six.", say: ["What is one less than seven?"] },
    ],
    questions: () => [oneMoreQ(2), oneLessQ(5), oneMoreQ(6), oneLessQ(9), oneMoreQ(8),
      oneLessQ(4), oneMoreQ(4), oneLessQ(7), oneMoreQ(9), oneLessQ(3)],
    reteach: { body: "One more goes forward, one less goes back. Just one step, never two." },
  },

  // ---------- Kindergarten Math, Unit 2: Adding within 5 ----------
  "k-math-add-1": {
    frame: 5,
    intro: {
      buddy: "Adding is just putting things together.",
      headline: "Adding one",
      body: "When one more joins the group, we add one. Adding one gives the very next number.",
      say: ["Adding is putting things together.", "Adding one gives the next number."],
    },
    teach: [
      { show: { a: 2, b: 1 }, headline: "Two and one more",
        body: "Two are in the frame. One more joins them. Now there are three altogether.",
        say: ["Two are in the frame.", "One more joins them.", "Now there are three."] },
      { show: { a: 3, b: 1 }, headline: "Three and one more",
        body: "Three, and one joins. Four altogether. Notice it is always the next counting number.",
        say: ["Three, and one joins.", "Four altogether.", "It is always the next number."] },
      { show: { a: 4, b: 1 }, headline: "Four and one more fills five",
        body: "Four and one more makes five. The row is full. Adding one never needs counting from the start.",
        say: ["Four and one more makes five.", "The row is full.", "Adding one gives the next number."] },
    ],
    guided: [
      { show: { a: 1, b: 1 }, question: "1 + 1 = ?", choices: ["2", "1"], correctIndex: 0,
        hint: "One, and one more. Count on one. Two.", say: ["One and one more makes what?"] },
      { show: { a: 4, b: 1 }, question: "4 + 1 = ?", choices: ["4", "5"], correctIndex: 1,
        hint: "The next number after four is five.", say: ["Four and one more makes what?"] },
    ],
    // Ten DISTINCT questions: a kid must never meet the same question twice in
    // one lesson (five become the star check, the rest are practice back-ups).
    questions: () => [addQ(0, 1), addQ(1, 1), addQ(2, 1), addQ(3, 1), addQ(4, 1),
      addQ(1, 0), addQ(1, 2), addQ(1, 3), addQ(1, 4), missingQ(4, 5)],
    reteach: { body: "Adding one is the next number. We never have to start counting again from one." },
  },

  "k-math-add-2": {
    frame: 5,
    intro: {
      buddy: "Now two friends join at once.",
      headline: "Adding two",
      body: "Adding two means two hops forward. We count on twice.",
      say: ["Now two friends join at once.", "Adding two means two hops forward."],
    },
    teach: [
      { show: { a: 1, b: 2 }, headline: "Two hops forward",
        body: "One is in. Two join. Hop to two, hop to three. One and two makes three.",
        say: ["One is in, and two join.", "Hop to two. Hop to three.", "One and two makes three."] },
      { show: { a: 2, b: 2 }, headline: "Two and two",
        body: "Two and two makes four. Two pairs, sitting side by side. This one is worth remembering.",
        say: ["Two and two makes four.", "Two pairs side by side."] },
      { show: { a: 3, b: 2 }, headline: "Three and two fills five",
        body: "Three and two makes five. The row is full again. Three and two are partners that make five.",
        say: ["Three and two makes five.", "The row is full again."] },
    ],
    guided: [
      { show: { a: 2, b: 2 }, question: "2 + 2 = ?", choices: ["3", "4"], correctIndex: 1,
        hint: "Two hops from two. Three, four.", say: ["Two and two makes what?"] },
      { show: { a: 3, b: 2 }, question: "3 + 2 = ?", choices: ["5", "4"], correctIndex: 0,
        hint: "Two hops from three. Four, five.", say: ["Three and two makes what?"] },
    ],
    questions: () => [addQ(0, 2), addQ(1, 2), addQ(2, 2), addQ(3, 2), addQ(2, 0),
      addQ(2, 1), addQ(2, 3), addQ(1, 3), addQ(1, 4), addQ(4, 1)],
    reteach: { body: "Two hops, not one. Say both numbers out loud as you hop." },
  },

  "k-math-make-5": {
    frame: 5,
    intro: {
      buddy: "Here is a superpower. Numbers have partners that make five.",
      headline: "Making five",
      body: "Two numbers that fill the row together are partners. Learning the five partners makes adding fast.",
      say: ["Numbers have partners that make five.", "Partners fill the row together."],
    },
    teach: [
      { show: { a: 4, b: 1 }, headline: "Four needs one",
        body: "Four are in the row. One empty spot is left. Four and one fill the five.",
        say: ["Four are in the row.", "One empty spot is left.", "Four and one fill the five."] },
      { show: { a: 3, b: 2 }, headline: "Three needs two",
        body: "Three are in. Two spots are empty. Three and two fill the five.",
        say: ["Three are in, and two spots are empty.", "Three and two fill the five."] },
      { show: { a: 2, b: 3 }, headline: "Partners work both ways",
        body: "Two and three fill the five too. Turning the partners around does not change the total.",
        say: ["Two and three fill the five too.", "Turning them around changes nothing."] },
    ],
    guided: [
      { show: { a: 4, b: 0 }, question: "4 + ? = 5", choices: ["1", "2"], correctIndex: 0,
        hint: "Count the empty spots. There is just one.", say: ["Four needs how many to make five?"] },
      { show: { a: 2, b: 0 }, question: "2 + ? = 5", choices: ["2", "3"], correctIndex: 1,
        hint: "Two are in, so three spots are still empty.", say: ["Two needs how many to make five?"] },
    ],
    questions: () => [missingQ(4, 5), missingQ(3, 5), missingQ(1, 5), missingQ(2, 5), missingQ(0, 5),
      addQ(4, 1), addQ(3, 2), addQ(2, 3), addQ(1, 4), addQ(0, 5)],
    reteach: { body: "The empty spots are the answer. Count the holes in the row, not the counters." },
  },

  "k-math-add-any-5": {
    frame: 5,
    intro: {
      buddy: "Time to put it all together.",
      headline: "Adding within five",
      body: "Any two numbers that stay inside five. Count on from the bigger one to go faster.",
      say: ["Time to put it all together.", "Count on from the bigger number."],
    },
    teach: [
      { show: { a: 1, b: 3 }, headline: "Start with the bigger number",
        body: "One and three. Start at three, the bigger one, and hop one. Four. Same answer, less work.",
        say: ["One and three.", "Start at three and hop one.", "Four. Same answer, less work."] },
      { show: { a: 2, b: 3 }, headline: "Order does not matter",
        body: "Two and three makes five. Three and two makes five too. Adding works either way round.",
        say: ["Two and three makes five.", "Three and two makes five too."] },
      { show: { a: 0, b: 4 }, headline: "Adding nothing",
        body: "Four and zero makes four. If nothing joins, the number stays exactly the same.",
        say: ["Four and zero makes four.", "If nothing joins, nothing changes."] },
    ],
    guided: [
      { show: { a: 1, b: 4 }, question: "1 + 4 = ?", choices: ["5", "4"], correctIndex: 0,
        hint: "Start at four, the bigger one, and hop once. Five.", say: ["One and four makes what?"] },
      { show: { a: 2, b: 2 }, question: "2 + 2 = ?", choices: ["5", "4"], correctIndex: 1,
        hint: "Two pairs. Two, then two more. Four.", say: ["Two and two makes what?"] },
    ],
    questions: () => [[1, 4], [2, 3], [0, 5], [3, 1], [2, 2], [4, 1], [1, 2], [3, 2], [1, 3], [0, 4]].map(([a, b]) => addQ(a, b)),
    reteach: { body: "Start with the bigger number and count on. It is the same answer with fewer hops." },
  },

  // ---------- Kindergarten Math, Unit 3: Shapes around us ----------
  "k-geo-shape-names": {
    intro: {
      buddy: "Shapes all have names. Let's learn four of them.",
      headline: "Shape names",
      body: "A circle is round. A triangle has three sides. A square has four equal sides. A rectangle is longer than it is tall.",
      say: ["Shapes all have names.", "Let's learn four of them."],
    },
    teach: [
      { show: { shapes: ["circle"] }, headline: "A circle is round",
        body: "A circle has no corners at all. Your finger can go all the way round without stopping.",
        say: ["A circle is round.", "It has no corners at all."] },
      { show: { shapes: ["triangle"] }, headline: "A triangle has three",
        body: "Three straight sides and three corners. Tri means three, so a triangle is easy to remember.",
        say: ["A triangle has three straight sides.", "Tri means three."] },
      { show: { shapes: ["square", "rectangle"] }, headline: "Square and rectangle",
        body: "A square has four sides all the same. A rectangle has four sides too, but two are longer.",
        say: ["A square has four sides the same.", "A rectangle has two longer sides."] },
    ],
    guided: [
      { show: { shapes: ["circle", "square"] }, question: "Which one is round with no corners?", choices: ["circle", "square"], correctIndex: 0,
        hint: "Look for the shape with no corners to stop your finger.", say: ["Which shape is round with no corners?"] },
      { show: { shapes: ["triangle", "square"] }, question: "Which one has three sides?", choices: ["square", "triangle"], correctIndex: 1,
        hint: "Count the straight sides on each. Three means triangle.", say: ["Which shape has three sides?"] },
    ],
    questions: () => [
      shapeFactQ("Which shape is round with no corners?", "circle", ["square", "triangle"]),
      shapeSidesQ("triangle", 3),
      shapeFactQ("Which shape has four sides all the same?", "square", ["triangle", "circle"]),
      shapeSidesQ("square", 4),
      shapeFactQ("Which shape has three corners?", "triangle", ["circle", "square"]),
      shapeFactQ("Which shape has four sides with two longer?", "rectangle", ["triangle", "circle"]),
      shapeSidesQ("rectangle", 4),
      shapeFactQ("How many corners does a circle have?", "0", ["3", "4"]),
      shapeFactQ("Tri means three. So which shape is it?", "triangle", ["square", "circle"]),
      shapeFactQ("Which shape can roll along the floor?", "circle", ["square", "triangle"]),
    ],
    reteach: { body: "Count the sides. Three is a triangle, four is a square or rectangle, none is a circle." },
  },

  "k-geo-shape-hunt": {
    intro: {
      buddy: "Shapes are hiding everywhere in your house.",
      headline: "Shapes everywhere",
      body: "Once you know the names, you start seeing shapes in real things. A clock, a window, a slice of toast.",
      say: ["Shapes are hiding everywhere.", "A clock, a window, a slice of toast."],
    },
    teach: [
      { show: { shapes: ["circle"] }, headline: "Circles in real life",
        body: "A clock face, a plate, a wheel, the top of a cup. All round, all circles.",
        say: ["A clock, a plate, a wheel.", "All of them are circles."] },
      { show: { shapes: ["rectangle"] }, headline: "Rectangles in real life",
        body: "A door, a book, a phone, a bed. Four sides with two of them longer. Rectangles are everywhere.",
        say: ["A door, a book, a phone.", "All of them are rectangles."] },
      { show: { shapes: ["triangle", "square"] }, headline: "Triangles and squares",
        body: "A roof or a sail is a triangle. A window pane or a cracker is often a square.",
        say: ["A roof or a sail is a triangle.", "A window pane is often a square."] },
    ],
    guided: [
      { show: { shapes: ["circle", "rectangle"] }, question: "A clock face is which shape?", choices: ["rectangle", "circle"], correctIndex: 1,
        hint: "A clock face is round, so your finger never turns a corner.", say: ["A clock face is which shape?"] },
      { show: { shapes: ["rectangle", "triangle"] }, question: "A door is which shape?", choices: ["rectangle", "triangle"], correctIndex: 0,
        hint: "A door has four sides and two of them are longer.", say: ["A door is which shape?"] },
    ],
    questions: () => [
      { question: "A wheel is which shape?", choices: ["circle", "square", "triangle"], correctIndex: 0 },
      { question: "A book cover is which shape?", choices: ["circle", "rectangle", "triangle"], correctIndex: 1 },
      { question: "A roof point is which shape?", choices: ["circle", "square", "triangle"], correctIndex: 2 },
      { question: "A plate is which shape?", choices: ["rectangle", "circle", "triangle"], correctIndex: 1 },
      { question: "A window pane is often which shape?", choices: ["square", "circle", "triangle"], correctIndex: 0 },
      { question: "A sail on a boat is which shape?", choices: ["triangle", "circle", "square"], correctIndex: 0 },
      { question: "A phone screen is which shape?", choices: ["circle", "triangle", "rectangle"], correctIndex: 2 },
      { question: "A coin is which shape?", choices: ["circle", "square", "rectangle"], correctIndex: 0 },
      shapeFactQ("Which shape is a bed most like?", "rectangle", ["circle", "triangle"]),
      shapeFactQ("Which shape is a cracker most like?", "square", ["circle", "triangle"]),
    ],
    reteach: { body: "Look at the edges of the real thing. Round means circle, four sides means square or rectangle." },
  },
};

// ---------------------------------------------------------------
// Assemble one authored lesson from its plan + the map row.
// ---------------------------------------------------------------
export function buildLocalLesson(target) {
  const plan = LESSON_PLANS[target.key];
  if (!plan) return null;

  const qs = plan.questions();
  // First 5 are the mastery check, the rest are the never-blocked fallback pool
  // for step 4. Step 4 still prefers APPROVED question_bank rows at play time.
  const check = qs.slice(0, 5);
  const fallback = qs.slice(5, 11);

  const art = { ...LESSON_ART };
  if (plan.frame) art.frame = plan.frame;

  const lesson = {
    schema: 1,
    id: target.key,
    subject: target.subject,
    quizType: target.quizType || target.subject,
    grade: target.grade,
    skill: target.skill,
    unit: target.unit || "",
    title: target.title,
    minutes: target.minutes || 5,

    source: "local",
    status: "pending",

    mastery: { need: 4, of: 5 },
    reward: { coins: 25 },
    art,

    intro: { ...plan.intro, cta: plan.intro.cta || "Let's learn" },
    teach: plan.teach.map((c) => ({ ...c })),
    guided: plan.guided.map((q) => ({ ...q })),
    solo: { count: 6, fromBank: true, fallback },
    check,
    reteach: {
      headline: "So close!",
      body: plan.reteach.body,
      say: plan.reteach.say || ["Let's look at the trick one more time."],
      cta: "Show me again",
    },
    mastered: {
      headline: `You mastered ${target.title}!`,
      say: [`You mastered it. Great work!`],
    },
  };
  return lesson;
}

// ---------------------------------------------------------------
// The MODEL engine, for skills with no authored plan (reading, spelling,
// grade 3 and up). Same shape, same validator.
// ---------------------------------------------------------------
const MODEL_RULES = `You are writing ONE self-paced lesson for a young child in a kids learning app.

Return ONLY a JSON object, no prose, no markdown fence. Exact shape:
{
  "intro": { "buddy": str, "headline": str, "body": str, "say": [str], "cta": str },
  "teach": [ { "headline": str, "body": str, "say": [str] } ]   // exactly 3 cards
  "guided": [ { "question": str, "choices": [str,str], "correctIndex": int, "hint": str, "say": [str] } ]  // exactly 2
  "check": [ { "question": str, "choices": [str,str,str], "correctIndex": int } ]   // exactly 5
  "fallback": [ { "question": str, "choices": [str,str,str], "correctIndex": int } ] // exactly 6
  "reteach": { "body": str },
  "mastered": { "headline": str }
}

HARD RULES:
- Every string in any "say" array: at most 55 characters, NO plus sign, NO equals sign, no digits written as symbols in a sum. Write numbers as words in say lines.
- No emojis anywhere, ever.
- Reading level for the target grade. Short sentences. Warm, never babyish.
- "guided" hints must actually explain the step, not restate the question.
- Every question must be answerable from the teach cards alone.
- correctIndex must point at the genuinely correct choice. Wrong choices must be plausible near-misses.
- No question may repeat another question's text.`;

export async function makeLessonWithModel(target, anthropicKey) {
  if (!anthropicKey) return null;
  const prompt = `${MODEL_RULES}

Lesson to write:
  title: ${target.title}
  grade: ${target.grade === "k" ? "Kindergarten" : "Grade " + target.grade}
  subject: ${target.subject}
  skill: ${target.skill}
  unit: ${target.unit || ""}
  length: about ${target.minutes || 5} minutes`;

  let text = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    text = (d && d.content && d.content[0] && d.content[0].text) || "";
  } catch { return null; }

  let draft = null;
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    draft = JSON.parse(text.slice(s, e + 1));
  } catch { return null; }
  if (!draft || !draft.teach || !draft.check) return null;

  return {
    schema: 1,
    id: target.key,
    subject: target.subject,
    quizType: target.quizType || target.subject,
    grade: target.grade,
    skill: target.skill,
    unit: target.unit || "",
    title: target.title,
    minutes: target.minutes || 5,
    source: "ai",
    status: "pending",
    mastery: { need: 4, of: 5 },
    reward: { coins: 25 },
    art: { ...LESSON_ART },
    intro: { cta: "Let's learn", ...draft.intro },
    teach: draft.teach,
    guided: draft.guided,
    solo: { count: 6, fromBank: true, fallback: draft.fallback || [] },
    check: draft.check,
    reteach: {
      headline: "So close!",
      body: (draft.reteach && draft.reteach.body) || "That one is tricky. Let's look again, then try the star check.",
      say: ["Let's look at the trick one more time."],
      cta: "Show me again",
    },
    mastered: {
      headline: (draft.mastered && draft.mastered.headline) || `You mastered ${target.title}!`,
      say: ["You mastered it. Great work!"],
    },
  };
}

// One entry point. Authored plan if there is one, otherwise the model.
// Always validated; an invalid draft is refused, never stored.
export async function makeLesson(target, anthropicKey) {
  const local = buildLocalLesson(target);
  const lesson = local || (await makeLessonWithModel(target, anthropicKey));
  if (!lesson) return { ok: false, reason: "no engine could draft this lesson" };
  const v = validateLesson(lesson);
  if (!v.ok) return { ok: false, reason: "failed validation", errors: v.errors, source: lesson.source };
  return { ok: true, lesson, source: lesson.source, hash: lessonContentHash(lesson) };
}

export default { LESSON_ART, LESSON_PLANS, buildLocalLesson, makeLessonWithModel, makeLesson, validateLesson, lessonContentHash, sayProblems, numWord };
