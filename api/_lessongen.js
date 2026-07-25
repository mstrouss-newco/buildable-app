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


// ================================================================
// READING AND SPELLING (Session LS4)
// ----------------------------------------------------------------
// The K math lessons above are authored plans rather than model output for a
// reason: the wording is deliberate, it costs nothing to draft, and the QA
// harness can independently re-derive every answer key. Reading is the same
// deal. Everything below is hand-written and every question is built by one of
// the small builders here, so qa-lessons.mjs can check the answer the same way
// it checks the arithmetic.
//
// PICTURES. Step 4 and step 5 render question TEXT ONLY (see the LS3 note), so
// no reading question may depend on a picture. The teach cards and the guided
// step DO get art, and reading uses drawn TYPE rather than counters:
//   show: { word: "map", hi: [0] }                  -> letter tiles, one lit
//   show: { words: ["cat","hat","mat"], hi: "at" }  -> word cards, shared part lit
//   show: { sentence: "The dog ran.", hi: "dog" }   -> a story card, one word lit
// public/lessons.html draws all three. Letters are type, not emojis.
// ================================================================

// Deterministic choice placement, the word-shaped twin of numChoices. Same
// contract: the correct answer moves around so a kid cannot pass by tapping the
// same spot every time, but it lands in the same place on every run, which is
// what lets QA re-derive it.
function pickChoices(correct, wrongs) {
  const c = String(correct);
  const seen = new Set([c]);
  const opts = [c];
  for (const w of wrongs || []) {
    const s = String(w);
    if (!seen.has(s) && opts.length < 3) { seen.add(s); opts.push(s); }
  }
  const at = (c.length + c.charCodeAt(0)) % opts.length;
  const arr = opts.slice(1);
  arr.splice(at, 0, c);
  return { choices: arr, correctIndex: at };
}

// The one builder every reading question goes through.
export function wordQ(question, correct, wrongs) {
  const c = pickChoices(correct, wrongs);
  return { question, choices: c.choices, correctIndex: c.correctIndex };
}

// ---- phonics ----
const startsQ = (letter, right, wrongs) => wordQ(`Which word starts with ${letter}?`, right, wrongs);
const endsQ = (letter, right, wrongs) => wordQ(`Which word ends with ${letter}?`, right, wrongs);
const midQ = (letter, right, wrongs) => wordQ(`Which word has ${letter} in the middle?`, right, wrongs);
// The same skill asked the other way round, so the lesson can offer eleven
// different questions instead of running out of vowels after five.
const midLetterQ = (word, wrongs) => wordQ(`What is the middle letter of ${word}?`, word[1], wrongs);
const blendQ = (word, wrongs) => wordQ(`${word.split("").join(" - ")}. What word is that?`, word, wrongs);
const familyQ = (family, right, wrongs) => wordQ(`Which word is in the ${family} family?`, right, wrongs);

// ---- spelling ----
// fillQ hides ONE letter of a real word and asks which letter belongs there.
const fillQ = (word, hide, wrongs) => {
  const shown = word.split("").map((ch, i) => (i === hide ? "_" : ch)).join(" ");
  return wordQ(`${shown} spells ${word}. Which letter is missing?`, word[hide], wrongs);
};
const digraphQ = (pair, right, wrongs) => wordQ(`Which word has ${pair} in it?`, right, wrongs);
// "Which word has sh in it" can only ever be asked twice before it repeats, and
// a lesson needs eleven DISTINCT questions, so the pair lessons also ask the
// question the other way round: given the word, name the team.
const pairStartQ = (word, pair, wrongs) => wordQ(`Which two letters start the word ${word}?`, pair, wrongs);
const pairEndQ = (word, pair, wrongs) => wordQ(`Which two letters end the word ${word}?`, pair, wrongs);
const pluralQ = (one, many, wrongs) => wordQ(`One ${one}, two ___ . Which spelling is right?`, many, wrongs);

// ---- sight words ----
const sightQ = (word, wrongs) => wordQ(`Which one says ${word}?`, word, wrongs);
const sightFitQ = (sentence, word, wrongs) => wordQ(`${sentence} Which word fits?`, word, wrongs);

// ---- comprehension. The story lives inside the question text, because step 4
// and step 5 cannot show a picture. Short enough for a young reader. ----
const storyQ = (story, ask, right, wrongs) => wordQ(`${story} ${ask}`, right, wrongs);

// ================================================================
// The reading plans. Same shape as the math plans above: intro, 3 teach cards,
// 2 guided questions that can never fail, 11 distinct questions (the first 5
// become the mastery check, the rest the never-blocked practice pool), and a
// re-teach line for a kid who missed the bar.
// ================================================================
export const READING_PLANS = {
  // ---------- Kindergarten, Unit 1: Letter sounds ----------
  "k-read-first-sounds": {
    intro: {
      buddy: "Every word starts with a sound. Let's find them.",
      headline: "First sounds",
      body: "The first sound of a word is the very first thing your mouth does when you say it.",
      say: ["Every word starts with a sound.", "Let's find the first sound."],
    },
    teach: [
      { show: { word: "map", hi: [0] }, headline: "The sound at the front",
        body: "Map starts with m. Say it slowly and you can hear the m before anything else. Mmm-ap.",
        say: ["Map starts with m.", "Say it slowly. Mmm ap."] },
      { show: { word: "sun", hi: [0] }, headline: "Listen, then look",
        body: "Sun starts with s. Your mouth makes a hiss first. The letter you hear first is the letter you see first.",
        say: ["Sun starts with s.", "The sound you hear first comes first."] },
      { show: { words: ["bat", "bed", "bug"], hi: "b" }, headline: "Words can share a first sound",
        body: "Bat, bed and bug all start with b. Different words, same beginning.",
        say: ["Bat, bed and bug all start with b.", "Same beginning, different words."] },
    ],
    guided: [
      { show: { words: ["map", "cat"], hi: "m" }, question: "Which word starts with m?",
        choices: ["cat", "map"], correctIndex: 1,
        hint: "Say both out loud. Only one of them begins with mmm.", say: ["Which word starts with m?"] },
      { show: { words: ["dog", "sun"], hi: "s" }, question: "Which word starts with s?",
        choices: ["sun", "dog"], correctIndex: 0,
        hint: "Listen for the hiss at the front. Sss un.", say: ["Which word starts with s?"] },
    ],
    questions: () => [
      startsQ("m", "map", ["cat", "sun"]),
      startsQ("s", "sun", ["bat", "pig"]),
      startsQ("b", "bat", ["dog", "net"]),
      startsQ("c", "cat", ["mop", "fin"]),
      startsQ("d", "dog", ["hat", "pen"]),
      startsQ("p", "pig", ["log", "sit"]),
      startsQ("h", "hat", ["run", "bug"]),
      startsQ("f", "fin", ["cup", "tap"]),
      startsQ("n", "net", ["jam", "lid"]),
      startsQ("l", "log", ["wig", "mud"]),
      startsQ("t", "top", ["red", "pan"]),
    ],
    reteach: { body: "Say the word out loud and stop after the very first sound. That sound is the answer." },
  },

  "k-read-last-sounds": {
    intro: {
      buddy: "Now let's listen to the end of a word.",
      headline: "Last sounds",
      body: "The last sound is what your mouth does right before it stops.",
      say: ["Now listen to the end of a word.", "The last sound is where it stops."],
    },
    teach: [
      { show: { word: "cat", hi: [2] }, headline: "The sound at the end",
        body: "Cat ends with t. Stretch the word out and the t is the last thing you say. Ca-t.",
        say: ["Cat ends with t.", "Stretch it out. Ca t."] },
      { show: { word: "bus", hi: [2] }, headline: "Hold the ending",
        body: "Bus ends with s. If you hold the last sound you can hear it hiss on and on.",
        say: ["Bus ends with s.", "Hold the last sound and you can hear it."] },
      { show: { words: ["pig", "bag", "log"], hi: "g" }, headline: "Words can share an ending",
        body: "Pig, bag and log all end with g. The end of a word matters just as much as the start.",
        say: ["Pig, bag and log all end with g.", "Endings matter too."] },
    ],
    guided: [
      { show: { word: "cat", hi: [2] }, question: "Which word ends with t?",
        choices: ["cat", "bus"], correctIndex: 0,
        hint: "Say each one and stop at the very end. One of them stops with a t.", say: ["Which word ends with t?"] },
      { show: { word: "pig", hi: [2] }, question: "Which word ends with g?",
        choices: ["pin", "pig"], correctIndex: 1,
        hint: "Pin stops with n. Pig stops with g.", say: ["Which word ends with g?"] },
    ],
    questions: () => [
      endsQ("t", "cat", ["bus", "pen"]),
      endsQ("s", "bus", ["mop", "bed"]),
      endsQ("g", "pig", ["pin", "sun"]),
      endsQ("n", "sun", ["sit", "cup"]),
      endsQ("p", "mop", ["mat", "dog"]),
      endsQ("d", "bed", ["bet", "log"]),
      endsQ("m", "ham", ["hat", "fin"]),
      endsQ("b", "web", ["wet", "pan"]),
      endsQ("x", "box", ["bag", "top"]),
      endsQ("k", "book", ["boot", "moon"]),
      endsQ("l", "ball", ["bark", "barn"]),
    ],
    reteach: { body: "Say the word slowly and freeze on the last sound. Whatever you are holding is the ending." },
  },

  "k-read-middle-sounds": {
    intro: {
      buddy: "The middle sound is the trickiest one. Let's catch it.",
      headline: "Middle sounds",
      body: "Short words have three sounds. The one in the middle is usually a vowel: a, e, i, o or u.",
      say: ["The middle sound is the trickiest.", "It is usually a, e, i, o or u."],
    },
    teach: [
      { show: { word: "cat", hi: [1] }, headline: "Squeeze out the middle",
        body: "Cat is c, then a, then t. The a in the middle is the sound that holds the word together.",
        say: ["Cat is c, then a, then t.", "The a holds it together."] },
      { show: { word: "pin", hi: [1] }, headline: "Change the middle, change the word",
        body: "Pin has an i in the middle. Swap that i for a and it turns into pan. One sound changes everything.",
        say: ["Pin has an i in the middle.", "Swap it for a and you get pan."] },
      { show: { words: ["hot", "hut", "hat"], hi: "h" }, headline: "Same edges, different middles",
        body: "Hot, hut and hat start and end the same. Only the middle sound tells them apart.",
        say: ["Hot, hut and hat sound alike.", "Only the middle tells them apart."] },
    ],
    guided: [
      { show: { word: "cat", hi: [1] }, question: "Which word has a in the middle?",
        choices: ["cat", "cut"], correctIndex: 0,
        hint: "Say both slowly. Listen only to the middle. Ca-t or cu-t.", say: ["Which word has a in the middle?"] },
      { show: { word: "pig", hi: [1] }, question: "Which word has i in the middle?",
        choices: ["pot", "pig"], correctIndex: 1,
        hint: "Pot has an o sound. Pig has an i sound.", say: ["Which word has i in the middle?"] },
    ],
    questions: () => [
      midQ("a", "cat", ["pin", "bug"]),
      midQ("i", "pig", ["pot", "pen"]),
      midQ("o", "dog", ["dig", "bag"]),
      midQ("u", "bug", ["bag", "big"]),
      midQ("e", "bed", ["bad", "bud"]),
      midLetterQ("map", ["i", "o"]),
      midLetterQ("fin", ["a", "u"]),
      midLetterQ("hot", ["a", "i"]),
      midLetterQ("cup", ["a", "o"]),
      midLetterQ("net", ["u", "o"]),
      midLetterQ("bat", ["i", "u"]),
    ],
    reteach: { body: "Say the word and stop halfway. The sound you land on in the middle is the answer." },
  },

  // ---------- Kindergarten, Unit 2: Blending words ----------
  "k-read-blend-cvc": {
    intro: {
      buddy: "Three sounds, one word. Let's stick them together.",
      headline: "Blending three sounds",
      body: "Reading is blending. You say each sound, then push them together until they make a word.",
      say: ["Three sounds make one word.", "Say each sound, then push them together."],
    },
    teach: [
      { show: { word: "cat", hi: [0, 1, 2] }, headline: "Say each sound",
        body: "Look at the letters one at a time. C. A. T. Three separate sounds, sitting in a row.",
        say: ["Look at one letter at a time.", "C. A. T."] },
      { show: { word: "cat", hi: [0] }, headline: "Push them together",
        body: "Now say them faster and closer. C-a-t. Ca-t. Cat. The sounds slide into a word.",
        say: ["Now say them faster. Ca t. Cat.", "The sounds slide into a word."] },
      { show: { words: ["sun", "map", "bed"], hi: "" }, headline: "It works on every short word",
        body: "S-u-n makes sun. M-a-p makes map. B-e-d makes bed. Same trick every time.",
        say: ["S u n makes sun.", "M a p makes map.", "Same trick every time."] },
    ],
    guided: [
      { show: { word: "cat", hi: [0, 1, 2] }, question: "c - a - t. What word is that?",
        choices: ["cat", "cap"], correctIndex: 0,
        hint: "Push the three sounds together slowly. Ca-t.", say: ["Say it with me. C. A. T."] },
      { show: { word: "sun", hi: [0, 1, 2] }, question: "s - u - n. What word is that?",
        choices: ["sit", "sun"], correctIndex: 1,
        hint: "The middle sound is u. Su-n.", say: ["Say it with me. S. U. N."] },
    ],
    questions: () => [
      blendQ("cat", ["cap", "cot"]),
      blendQ("sun", ["sit", "sub"]),
      blendQ("map", ["mop", "man"]),
      blendQ("bed", ["bad", "beg"]),
      blendQ("pig", ["pin", "peg"]),
      blendQ("dog", ["dig", "dot"]),
      blendQ("bus", ["bud", "bat"]),
      blendQ("hat", ["hot", "ham"]),
      blendQ("net", ["nut", "neck"]),
      blendQ("cup", ["cap", "cut"]),
      blendQ("fin", ["fan", "fit"]),
    ],
    reteach: { body: "Do not rush. Say all three sounds first, then say them again a little faster." },
  },

  "k-read-word-families": {
    intro: {
      buddy: "Some words are family. They end the same way.",
      headline: "Word families",
      body: "Words in a family share an ending. Learn one and you can read the whole family.",
      say: ["Some words are family.", "They share the same ending."],
    },
    teach: [
      { show: { words: ["cat", "hat", "mat"], hi: "at" }, headline: "The -at family",
        body: "Cat, hat and mat all end in at. Only the first letter changes, so the rest is free.",
        say: ["Cat, hat and mat all end in at.", "Only the first letter changes."] },
      { show: { words: ["pig", "big", "dig"], hi: "ig" }, headline: "The -ig family",
        body: "Pig, big and dig share ig. Once you can read one of them, you can read them all.",
        say: ["Pig, big and dig all share ig.", "Read one and you can read them all."] },
      { show: { words: ["sun", "run", "bun"], hi: "un" }, headline: "Families are everywhere",
        body: "Sun, run and bun are the un family. Spotting the family is faster than sounding out every letter.",
        say: ["Sun, run and bun are the un family.", "Spotting a family is faster."] },
    ],
    guided: [
      { show: { words: ["hat", "pig"], hi: "at" }, question: "Which word is in the -at family?",
        choices: ["pig", "hat"], correctIndex: 1,
        hint: "Look at the last two letters. One of them ends in at.", say: ["Which word is in the at family?"] },
      { show: { words: ["big", "sun"], hi: "ig" }, question: "Which word is in the -ig family?",
        choices: ["big", "sun"], correctIndex: 0,
        hint: "The ig family ends in i then g.", say: ["Which word is in the ig family?"] },
    ],
    questions: () => [
      familyQ("-at", "hat", ["pig", "sun"]),
      familyQ("-ig", "big", ["cup", "bed"]),
      familyQ("-un", "run", ["map", "dog"]),
      familyQ("-op", "mop", ["bat", "fin"]),
      familyQ("-ug", "bug", ["hen", "cot"]),
      familyQ("-en", "hen", ["bus", "pig"]),
      familyQ("-in", "pin", ["mop", "bed"]),
      familyQ("-ot", "pot", ["bug", "man"]),
      familyQ("-ed", "red", ["rug", "ram"]),
      familyQ("-ap", "cap", ["cot", "cub"]),
      familyQ("-an", "van", ["vet", "win"]),
    ],
    reteach: { body: "Cover the first letter with your finger. What is left is the family ending." },
  },

  // ---------- Kindergarten, Unit 3: Reading sentences ----------
  // The map called this unit "Reading pictures", but steps 4 and 5 render text
  // only, so a picture-dependent question could never be asked there. These two
  // lessons teach the same comprehension skill from short spoken sentences
  // instead, which is honest about what the kid actually sees.
  "k-read-picture-clues": {
    intro: {
      buddy: "A sentence is a tiny story. Let's find the clues.",
      headline: "Sentence clues",
      body: "Even one sentence tells you something. The trick is to listen for who is in it and what they did.",
      say: ["A sentence is a tiny story.", "Listen for who is in it."],
    },
    teach: [
      { show: { sentence: "The dog ran to the ball.", hi: "dog" }, headline: "Who is it about?",
        body: "The dog ran to the ball. The dog is who this sentence is about. Find the who first.",
        say: ["The dog ran to the ball.", "The dog is who it is about."] },
      { show: { sentence: "The dog ran to the ball.", hi: "ball" }, headline: "What did they do?",
        body: "Now what happened? The dog ran, and it ran to the ball. That is the what.",
        say: ["What happened? The dog ran.", "It ran to the ball."] },
      { show: { sentence: "Mia ate a red apple.", hi: "apple" }, headline: "Every word is a clue",
        body: "Mia ate a red apple. Who: Mia. What: she ate an apple. Even the word red is a clue.",
        say: ["Mia ate a red apple.", "Every word is a clue."] },
    ],
    guided: [
      { show: { sentence: "The cat sat on the mat.", hi: "cat" }, question: "The cat sat on the mat. Who is the sentence about?",
        choices: ["the cat", "the mat"], correctIndex: 0,
        hint: "The mat is a thing. Look for who did the sitting.", say: ["Who is the sentence about?"] },
      { show: { sentence: "Sam kicked the ball.", hi: "kicked" }, question: "Sam kicked the ball. What did Sam do?",
        choices: ["threw it", "kicked it"], correctIndex: 1,
        hint: "The sentence tells you the exact word. Sam kicked.", say: ["What did Sam do?"] },
    ],
    questions: () => [
      storyQ("The dog ran to the ball.", "What did the dog run to?", "the ball", ["the tree", "the door"]),
      storyQ("Mia ate a red apple.", "What did Mia eat?", "an apple", ["a banana", "a cake"]),
      storyQ("The cat sat on the mat.", "Where did the cat sit?", "on the mat", ["on the bed", "on the box"]),
      storyQ("Ben found a blue hat.", "What color was the hat?", "blue", ["red", "green"]),
      storyQ("The bird flew over the pond.", "What flew over the pond?", "the bird", ["the fish", "the frog"]),
      storyQ("Tom gave the dog a bone.", "Who got the bone?", "the dog", ["the cat", "Tom"]),
      storyQ("The bus stopped at the school.", "Where did the bus stop?", "at the school", ["at the park", "at the shop"]),
      storyQ("Lily picked three flowers.", "How many flowers did Lily pick?", "three", ["two", "five"]),
      storyQ("The rain fell all morning.", "When did the rain fall?", "all morning", ["all night", "at lunch"]),
      storyQ("Max hid under the table.", "Where did Max hide?", "under the table", ["behind the door", "in the box"]),
      storyQ("The baby drank the milk.", "What did the baby drink?", "the milk", ["the juice", "the water"]),
    ],
    reteach: { body: "Read the sentence again and point to the answer inside it. It is always right there in the words." },
  },

  "k-read-whats-happening": {
    intro: {
      buddy: "Sometimes a story tells you something without saying it.",
      headline: "What is happening?",
      body: "Good readers use clues to work out what is going on, even when nobody says it out loud.",
      say: ["Stories give you clues.", "Good readers use them."],
    },
    teach: [
      { show: { sentence: "Sam put on a coat and boots.", hi: "coat" }, headline: "Clues add up",
        body: "Sam put on a coat and boots. Nobody said it was cold, but a coat and boots tell you it is.",
        say: ["Sam put on a coat and boots.", "Nobody said cold, but it is."] },
      { show: { sentence: "Ana held an umbrella.", hi: "umbrella" }, headline: "One clue is enough",
        body: "Ana held an umbrella. An umbrella means rain. One good clue can tell the whole story.",
        say: ["Ana held an umbrella.", "An umbrella means rain."] },
      { show: { sentence: "The candles were on the cake.", hi: "candles" }, headline: "Put the clues together",
        body: "Candles on a cake means a birthday. Two small clues together give you a big answer.",
        say: ["Candles on a cake.", "That means a birthday."] },
    ],
    guided: [
      { show: { sentence: "Sam put on a coat and boots.", hi: "boots" }, question: "Sam put on a coat and boots. What is the weather like?",
        choices: ["cold", "hot"], correctIndex: 0,
        hint: "Think about when you wear a coat and boots.", say: ["What is the weather like?"] },
      { show: { sentence: "Ana held an umbrella.", hi: "umbrella" }, question: "Ana held an umbrella. What is happening outside?",
        choices: ["it is snowing", "it is raining"], correctIndex: 1,
        hint: "An umbrella keeps you dry.", say: ["What is happening outside?"] },
    ],
    questions: () => [
      storyQ("Sam put on a coat and boots.", "What is the weather like?", "cold", ["hot", "windy"]),
      storyQ("Ana held an umbrella over her head.", "What is happening outside?", "it is raining", ["it is sunny", "it is snowing"]),
      storyQ("The candles were on the cake and everyone sang.", "What day is it?", "a birthday", ["a school day", "a rainy day"]),
      storyQ("Ben yawned and rubbed his eyes.", "How does Ben feel?", "sleepy", ["angry", "hungry"]),
      storyQ("Mia's tummy rumbled at lunch time.", "What does Mia need?", "food", ["a nap", "a coat"]),
      storyQ("The dog wagged its tail and jumped up.", "How does the dog feel?", "happy", ["scared", "sad"]),
      storyQ("Tom packed a towel and a swimsuit.", "Where is Tom going?", "swimming", ["to bed", "to school"]),
      storyQ("Lily put her books in her bag and waved goodbye.", "Where is Lily going?", "to school", ["to the beach", "to bed"]),
      storyQ("The leaves fell and the wind blew cold.", "What season is it?", "fall", ["summer", "spring"]),
      storyQ("Max held his teddy and turned off the light.", "What is Max doing?", "going to bed", ["eating dinner", "playing outside"]),
      storyQ("Ana wore a helmet and got on her bike.", "What is Ana about to do?", "ride her bike", ["go to sleep", "eat lunch"]),
    ],
    reteach: { body: "Ask yourself when you would do that same thing. Your own answer is usually the clue." },
  },

  // ---------- Grade 1, Unit 1: Sight words ----------
  "g1-read-sight-1": {
    intro: {
      buddy: "Some words show up everywhere. Learn them by sight.",
      headline: "Everyday words",
      body: "A few small words appear in almost every sentence. You do not sound them out, you just know them.",
      say: ["Some words show up everywhere.", "You just know them by sight."],
    },
    teach: [
      { show: { words: ["the", "and", "you"], hi: "" }, headline: "The words you meet most",
        body: "The, and, you. These three turn up in almost every book you will ever read.",
        say: ["The, and, you.", "You meet these in every book."] },
      { show: { sentence: "The dog and I went out.", hi: "and" }, headline: "They glue sentences together",
        body: "The dog and I went out. The and and hold everything else in place. They are the glue.",
        say: ["Small words are the glue.", "They hold a sentence together."] },
      { show: { words: ["said", "have", "with"], hi: "" }, headline: "Know them, do not sound them",
        body: "Said, have, with. Sounding these out slowly does not help. Recognizing them instantly does.",
        say: ["Said, have, with.", "Know them instantly, do not sound them out."] },
    ],
    guided: [
      { show: { words: ["the", "then"], hi: "" }, question: "Which one says the?",
        choices: ["the", "then"], correctIndex: 0,
        hint: "One of them has an extra letter on the end.", say: ["Which one says the?"] },
      { show: { sentence: "___ dog is big.", hi: "" }, question: "___ dog is big. Which word fits?",
        choices: ["Was", "The"], correctIndex: 1,
        hint: "Read it with each word. Only one of them sounds right.", say: ["Which word fits in the gap?"] },
    ],
    questions: () => [
      sightQ("the", ["then", "they"]),
      sightQ("and", ["end", "an"]),
      sightQ("you", ["your", "yes"]),
      sightQ("with", ["will", "wish"]),
      sightQ("have", ["has", "gave"]),
      sightFitQ("___ dog is big.", "The", ["Was", "And"]),
      sightFitQ("I like to play ___ my friend.", "with", ["have", "you"]),
      sightFitQ("Mia ___ a red bike.", "has", ["and", "the"]),
      sightFitQ("Can ___ see the cat?", "you", ["and", "with"]),
      sightFitQ("Ben ___ Ana ran fast.", "and", ["the", "have"]),
      sightFitQ("We ___ two dogs.", "have", ["with", "you"]),
    ],
    reteach: { body: "Read the whole sentence out loud with each choice in the gap. The right one just sounds right." },
  },

  "g1-read-sight-2": {
    intro: {
      buddy: "These little words break the rules on purpose.",
      headline: "Tricky little words",
      body: "Some common words are not spelled the way they sound. Sounding them out sends you the wrong way.",
      say: ["These little words break the rules.", "Sounding them out does not help."],
    },
    teach: [
      { show: { words: ["said", "was", "of"], hi: "" }, headline: "They do not sound like they look",
        body: "Said looks like sayed but sounds like sed. Was sounds like wuz. You have to remember them.",
        say: ["Said looks one way and sounds another.", "You just remember these."] },
      { show: { words: ["one", "two", "come"], hi: "" }, headline: "Numbers and visitors",
        body: "One, two and come all cheat. One starts with an o but sounds like wun. Learn the picture of the word.",
        say: ["One, two and come all cheat.", "Learn the shape of the word."] },
      { show: { sentence: "They said they were here.", hi: "were" }, headline: "Spot them in a sentence",
        body: "They said they were here. Four tricky words in one short sentence. They are everywhere.",
        say: ["They said they were here.", "Four tricky words in one sentence."] },
    ],
    guided: [
      { show: { words: ["said", "sad"], hi: "" }, question: "Which one says said?",
        choices: ["sad", "said"], correctIndex: 1,
        hint: "Said has an i hiding in the middle. Sad does not.", say: ["Which one says said?"] },
      { show: { sentence: "They ___ playing outside.", hi: "" }, question: "They ___ playing outside. Which word fits?",
        choices: ["were", "was"], correctIndex: 0,
        hint: "They is more than one, so it takes were.", say: ["Which word fits in the gap?"] },
    ],
    questions: () => [
      sightQ("said", ["sad", "sand"]),
      sightQ("were", ["where", "wear"]),
      sightQ("come", ["came", "cone"]),
      sightQ("some", ["same", "sum"]),
      sightQ("one", ["on", "own"]),
      sightQ("two", ["to", "tow"]),
      sightFitQ("They ___ playing outside.", "were", ["was", "is"]),
      sightFitQ("Ben ___ hello to me.", "said", ["some", "come"]),
      sightFitQ("Please ___ here now.", "come", ["some", "one"]),
      sightFitQ("I ate ___ of the cake.", "some", ["come", "one"]),
      sightFitQ("I have ___ red shoes.", "two", ["to", "one"]),
    ],
    reteach: { body: "These words are pictures, not puzzles. Look at the whole word and remember its shape." },
  },

  // ---------- Grade 1, Unit 2: Understanding stories ----------
  "g1-read-who-what": {
    intro: {
      buddy: "Every story has a who and a what. Let's hunt them.",
      headline: "Who and what",
      body: "When you read a story, the first two questions are always who it is about and what they did.",
      say: ["Every story has a who and a what.", "Find those two first."],
    },
    teach: [
      { show: { sentence: "Ben built a tall tower.", hi: "Ben" }, headline: "Who is the person",
        body: "Ben built a tall tower. Ben is the who. The who is usually a name or an animal near the start.",
        say: ["Ben built a tall tower.", "Ben is the who."] },
      { show: { sentence: "Ben built a tall tower.", hi: "built" }, headline: "What is the doing word",
        body: "What did Ben do? He built. The what is the action, the thing that actually happened.",
        say: ["What did Ben do? He built.", "The what is the action."] },
      { show: { sentence: "Mia and Sam washed the muddy dog.", hi: "washed" }, headline: "Sometimes there are two whos",
        body: "Mia and Sam washed the dog. Two whos, one what. Both of them did the washing.",
        say: ["Mia and Sam washed the dog.", "Two whos, one what."] },
    ],
    guided: [
      { show: { sentence: "Ben built a tall tower.", hi: "Ben" }, question: "Ben built a tall tower. Who is the story about?",
        choices: ["the tower", "Ben"], correctIndex: 1,
        hint: "The tower is a thing. Look for the person who did something.", say: ["Who is the story about?"] },
      { show: { sentence: "Mia washed the muddy dog.", hi: "washed" }, question: "Mia washed the muddy dog. What did Mia do?",
        choices: ["washed the dog", "walked the dog"], correctIndex: 0,
        hint: "Find the doing word in the sentence. It says washed.", say: ["What did Mia do?"] },
    ],
    questions: () => [
      storyQ("Ben built a tall tower out of blocks.", "Who is the story about?", "Ben", ["the blocks", "the tower"]),
      storyQ("Mia washed the muddy dog in the garden.", "What did Mia do?", "washed the dog", ["walked the dog", "fed the dog"]),
      storyQ("Sam and Ana painted a big sign for the fair.", "Who painted the sign?", "Sam and Ana", ["only Sam", "the fair"]),
      storyQ("The old cat slept on the warm windowsill.", "Who is the story about?", "the cat", ["the window", "the sun"]),
      storyQ("Lily read a book to her little brother.", "What did Lily do?", "read a book", ["wrote a book", "hid a book"]),
      storyQ("Tom lost his hat on the way to school.", "What did Tom lose?", "his hat", ["his bag", "his shoe"]),
      storyQ("The baker made twelve loaves before sunrise.", "Who made the loaves?", "the baker", ["the shop", "the oven"]),
      storyQ("Ana planted seeds in a long row.", "What did Ana plant?", "seeds", ["trees", "flowers"]),
      storyQ("Max helped his dad fix the broken gate.", "What did Max help fix?", "the gate", ["the car", "the fence"]),
      storyQ("The children waited quietly for the bus.", "Who is the story about?", "the children", ["the bus", "the driver"]),
      storyQ("Ben's sister taught him to tie his laces.", "Who taught Ben?", "his sister", ["his dad", "his teacher"]),
    ],
    reteach: { body: "Read it once for the person and once for the action. Two quick reads beat one careful one." },
  },

  "g1-read-main-idea": {
    intro: {
      buddy: "What is the whole thing mostly about?",
      headline: "The main idea",
      body: "The main idea is what a story is mostly about. Not one small detail, the big point.",
      say: ["What is it mostly about?", "That is the main idea."],
    },
    teach: [
      { show: { sentence: "Dogs need food, water and walks.", hi: "need" }, headline: "Look for the big point",
        body: "Dogs need food, water and walks. Every part is about looking after a dog. That is the main idea.",
        say: ["Every part is about looking after a dog.", "That is the main idea."] },
      { show: { sentence: "Rain fell. The path turned to mud.", hi: "Rain" }, headline: "Details support the idea",
        body: "Rain fell and the path turned to mud. The mud is a detail. The main idea is that it rained hard.",
        say: ["The mud is a detail.", "The main idea is that it rained hard."] },
      { show: { sentence: "Bees visit flowers all day long.", hi: "Bees" }, headline: "Say it in a few words",
        body: "If you can say what happened in a few words, you have found the main idea. Bees are busy.",
        say: ["Say it in a few words.", "Bees are busy. That is the idea."] },
    ],
    guided: [
      { show: { sentence: "Dogs need food, water and walks.", hi: "walks" },
        question: "Dogs need food, water and walks every day. What is this mostly about?",
        choices: ["looking after a dog", "how to walk"], correctIndex: 0,
        hint: "Ask what all three things have in common.", say: ["What is this mostly about?"] },
      { show: { sentence: "Rain fell all day. The path turned to mud.", hi: "mud" },
        question: "Rain fell all day. The path turned to mud and the game was called off. What is this mostly about?",
        choices: ["a muddy path", "a day of heavy rain"], correctIndex: 1,
        hint: "The mud and the cancelled game both happened because of one thing.", say: ["What is this mostly about?"] },
    ],
    questions: () => [
      storyQ("Dogs need food, water and a walk every day.", "What is this mostly about?", "looking after a dog", ["how to walk", "what dogs eat"]),
      storyQ("Rain fell all day. The path turned to mud and the game was called off.", "What is this mostly about?", "a day of heavy rain", ["a muddy path", "a football game"]),
      storyQ("Bees visit flowers, carry pollen and make honey.", "What is this mostly about?", "the work bees do", ["how honey tastes", "where flowers grow"]),
      storyQ("Ana packed a bag, checked her list and locked the door.", "What is this mostly about?", "getting ready to leave", ["making a list", "locking a door"]),
      storyQ("The seed sprouted, grew leaves and became a tall plant.", "What is this mostly about?", "how a plant grows", ["what seeds look like", "how to water a plant"]),
      storyQ("Ben sorted the socks, folded the shirts and put them away.", "What is this mostly about?", "tidying the washing", ["how to fold a shirt", "sorting socks"]),
      storyQ("Snow covered the road, so the school closed and the buses stopped.", "What is this mostly about?", "a big snowfall", ["how buses work", "a closed school"]),
      storyQ("Mia practiced every day and finally played the whole song.", "What is this mostly about?", "practice paying off", ["one song", "playing daily"]),
      storyQ("Birds build nests from twigs, grass and soft feathers.", "What is this mostly about?", "how birds build nests", ["what twigs are", "how birds fly"]),
      storyQ("The shop opened, filled with people and sold out by noon.", "What is this mostly about?", "a very busy shop", ["what time shops open", "one customer"]),
      storyQ("Sam read the map, found the path and reached the top.", "What is this mostly about?", "finding the way up", ["reading a map", "a mountain top"]),
    ],
    reteach: { body: "Cover the details with your hand. Whatever you can still say about the story is the main idea." },
  },

  "g1-read-retell": {
    intro: {
      buddy: "Telling a story back proves you really read it.",
      headline: "Retelling a story",
      body: "A retell is the story in your own words: what happened first, what happened next, and how it ended.",
      say: ["Telling it back proves you read it.", "First, next, and the end."],
    },
    teach: [
      { show: { sentence: "Ana lost her shoe.", hi: "lost" }, headline: "Start at the beginning",
        body: "Ana lost her shoe. A retell always starts with the first thing that happened, not the exciting bit.",
        say: ["Start with the first thing.", "Not the exciting bit."] },
      { show: { sentence: "She looked under the bed.", hi: "looked" }, headline: "Then the middle",
        body: "She looked under the bed. The middle is what the person tried or did about the problem.",
        say: ["The middle is what she tried.", "She looked under the bed."] },
      { show: { sentence: "The dog had it all along.", hi: "dog" }, headline: "Finish with the ending",
        body: "The dog had it all along. The ending is how the problem got solved. Beginning, middle, end.",
        say: ["The ending solves the problem.", "Beginning, middle, end."] },
    ],
    guided: [
      { show: { sentence: "Ana lost her shoe. She looked under the bed. The dog had it.", hi: "lost" },
        question: "Ana lost her shoe. She looked under the bed. The dog had it. What happened first?",
        choices: ["Ana lost her shoe", "the dog had it"], correctIndex: 0,
        hint: "First means the very start, before anyone went looking.", say: ["What happened first?"] },
      { show: { sentence: "Ana lost her shoe. She looked under the bed. The dog had it.", hi: "dog" },
        question: "Ana lost her shoe. She looked under the bed. The dog had it. How did it end?",
        choices: ["she looked under the bed", "the dog had the shoe"], correctIndex: 1,
        hint: "The ending is the part that solved the problem.", say: ["How did the story end?"] },
    ],
    questions: () => [
      storyQ("Ana lost her shoe. She looked under the bed. The dog had it.", "What happened first?", "Ana lost her shoe", ["the dog had it", "she looked under the bed"]),
      storyQ("Ana lost her shoe. She looked under the bed. The dog had it.", "How did the story end?", "the dog had the shoe", ["Ana lost her shoe", "Ana went to bed"]),
      storyQ("Ben planted a seed. He watered it daily. A flower grew.", "What happened first?", "he planted a seed", ["a flower grew", "he watered it"]),
      storyQ("Ben planted a seed. He watered it daily. A flower grew.", "How did the story end?", "a flower grew", ["he planted a seed", "the seed died"]),
      storyQ("Mia missed the bus. She ran all the way. She got there on time.", "What did Mia do after she missed the bus?", "she ran", ["she went home", "she waited"]),
      storyQ("Sam broke a cup. He swept it up. His mum said thank you.", "How did the story end?", "his mom said thank you", ["Sam broke a cup", "Sam hid the cup"]),
      storyQ("The cat climbed the tree. It could not get down. Dad brought a ladder.", "What happened in the middle?", "it could not get down", ["Dad brought a ladder", "the cat climbed the tree"]),
      storyQ("Lily drew a picture. She colored it in. She gave it to her grandma.", "What happened last?", "she gave it to her grandma", ["she drew a picture", "she colored it in"]),
      storyQ("Tom found a stray dog. He put up posters. The owner came.", "What did Tom do after he found the dog?", "he put up posters", ["the owner came", "he kept the dog"]),
      storyQ("It began to rain. The children ran inside. They played a game instead.", "Why did the children run inside?", "it began to rain", ["they were bored", "the game ended"]),
      storyQ("Ana baked a cake. She forgot the sugar. It tasted awful.", "What happened last?", "it tasted awful", ["she baked a cake", "she forgot the sugar"]),
    ],
    reteach: { body: "Use three fingers. First, next, last. One finger for each part of the story." },
  },

  // ---------- Grade 1, Unit 3: Spelling patterns ----------
  "g1-read-spell-fill": {
    intro: {
      buddy: "One letter is missing. Can you hear which one?",
      headline: "Missing letters",
      body: "If you know the sounds in a word, you can work out a letter that has gone missing.",
      say: ["One letter is missing.", "Listen for the sound that is gone."],
    },
    teach: [
      { show: { word: "cat", hi: [1] }, headline: "Say the word, find the gap",
        body: "c _ t spells cat. Say cat slowly. The sound in the gap is a, so a is the missing letter.",
        say: ["Say cat slowly.", "The middle sound is a."] },
      { show: { word: "ship", hi: [0, 1] }, headline: "Gaps can be anywhere",
        body: "_ _ ip spells ship. The gap is at the start this time. Sh makes the first sound.",
        say: ["The gap can be at the start.", "Ship begins with sh."] },
      { show: { word: "hand", hi: [3] }, headline: "Check the ending too",
        body: "han _ spells hand. The last sound is d. Always say the whole word before you choose.",
        say: ["Say the whole word first.", "Hand ends with d."] },
    ],
    guided: [
      { show: { word: "cat", hi: [1] }, question: "c _ t spells cat. Which letter is missing?",
        choices: ["a", "o"], correctIndex: 0,
        hint: "Say cat and stop in the middle. That sound is a.", say: ["Which letter is missing?"] },
      { show: { word: "sun", hi: [2] }, question: "s u _ spells sun. Which letter is missing?",
        choices: ["m", "n"], correctIndex: 1,
        hint: "Sun ends with the n sound, not m.", say: ["Which letter is missing?"] },
    ],
    questions: () => [
      fillQ("cat", 1, ["o", "u"]),
      fillQ("sun", 2, ["m", "p"]),
      fillQ("dog", 0, ["b", "l"]),
      fillQ("bed", 2, ["t", "g"]),
      fillQ("pig", 1, ["a", "u"]),
      fillQ("map", 2, ["t", "b"]),
      fillQ("hat", 0, ["c", "b"]),
      fillQ("cup", 1, ["a", "o"]),
      fillQ("net", 2, ["d", "p"]),
      fillQ("fish", 0, ["d", "w"]),
      fillQ("hand", 3, ["t", "g"]),
    ],
    reteach: { body: "Say the whole word out loud first, then say it again and stop exactly at the gap." },
  },

  // ---------- Grade 2, Unit 1: Sounds two letters make ----------
  "g2-read-digraphs-sh": {
    intro: {
      buddy: "Two letters, one brand new sound.",
      headline: "sh and ch",
      body: "Sometimes two letters team up and make a sound neither of them makes alone. Sh and ch are a team.",
      say: ["Two letters can make one sound.", "Sh and ch are a team."],
    },
    teach: [
      { show: { words: ["ship", "shop", "fish"], hi: "sh" }, headline: "sh is a quiet hush",
        body: "Ship, shop, fish. The s and the h stop being s and h. Together they make a hush.",
        say: ["Ship, shop, fish.", "S and h make a hush."] },
      { show: { words: ["chip", "chin", "much"], hi: "ch" }, headline: "ch is a little sneeze",
        body: "Chip, chin, much. C and h together make a short chuh sound, like a tiny sneeze.",
        say: ["Chip, chin, much.", "C and h make a chuh sound."] },
      { show: { words: ["shin", "chin"], hi: "in" }, headline: "One letter changes everything",
        body: "Shin and chin end the same but start differently. Getting the team right matters.",
        say: ["Shin and chin end the same.", "The team at the front matters."] },
    ],
    guided: [
      { show: { words: ["ship", "sip"], hi: "sh" }, question: "Which word has sh in it?",
        choices: ["sip", "ship"], correctIndex: 1,
        hint: "Look for the s and the h sitting next to each other.", say: ["Which word has sh in it?"] },
      { show: { words: ["chip", "cap"], hi: "ch" }, question: "Which word has ch in it?",
        choices: ["chip", "cap"], correctIndex: 0,
        hint: "Ch makes the chuh sound at the front of chip.", say: ["Which word has ch in it?"] },
    ],
    questions: () => [
      digraphQ("sh", "ship", ["sip", "tip"]),
      digraphQ("ch", "chip", ["cap", "camp"]),
      pairStartQ("shop", "sh", ["ch", "th"]),
      pairStartQ("chin", "ch", ["sh", "wh"]),
      pairEndQ("fish", "sh", ["ch", "th"]),
      pairEndQ("much", "ch", ["sh", "th"]),
      pairStartQ("shell", "sh", ["ch", "th"]),
      pairEndQ("wish", "sh", ["ch", "th"]),
      pairEndQ("beach", "ch", ["sh", "th"]),
      pairEndQ("lunch", "ch", ["sh", "th"]),
      pairStartQ("chat", "ch", ["sh", "th"]),
    ],
    reteach: { body: "Look for two letters standing together, then say the one sound they make as a team." },
  },

  "g2-read-digraphs-th": {
    intro: {
      buddy: "Two more teams: th and wh.",
      headline: "th and wh",
      body: "Th puts your tongue between your teeth. Wh starts a lot of questions. Both are two letters, one sound.",
      say: ["Two more teams. Th and wh.", "Two letters, one sound."],
    },
    teach: [
      { show: { words: ["this", "that", "with"], hi: "th" }, headline: "th needs your tongue",
        body: "This, that, with. For th your tongue touches your teeth. No other letters do that.",
        say: ["This, that, with.", "Your tongue touches your teeth."] },
      { show: { words: ["when", "what", "why"], hi: "wh" }, headline: "wh asks questions",
        body: "When, what, why. Almost every question word starts with wh. Spotting it is a shortcut.",
        say: ["When, what, why.", "Question words start with wh."] },
      { show: { words: ["thin", "win"], hi: "in" }, headline: "The team is not optional",
        body: "Thin needs both letters. Take the h away and it becomes tin, a completely different word.",
        say: ["Thin needs both letters.", "Take the h away and it becomes tin."] },
    ],
    guided: [
      { show: { words: ["thin", "tin"], hi: "th" }, question: "Which word has th in it?",
        choices: ["thin", "tin"], correctIndex: 0,
        hint: "Look for the t and the h together at the front.", say: ["Which word has th in it?"] },
      { show: { words: ["when", "wet"], hi: "wh" }, question: "Which word has wh in it?",
        choices: ["wet", "when"], correctIndex: 1,
        hint: "Wh starts the question words. When is one of them.", say: ["Which word has wh in it?"] },
    ],
    questions: () => [
      digraphQ("th", "thin", ["tin", "ten"]),
      digraphQ("wh", "when", ["wet", "went"]),
      pairStartQ("that", "th", ["wh", "sh"]),
      pairStartQ("what", "wh", ["th", "ch"]),
      pairEndQ("bath", "th", ["sh", "ch"]),
      pairStartQ("wheel", "wh", ["th", "sh"]),
      pairEndQ("path", "th", ["ch", "sh"]),
      pairStartQ("white", "wh", ["th", "ch"]),
      pairStartQ("three", "th", ["wh", "ch"]),
      pairStartQ("whale", "wh", ["th", "sh"]),
      pairEndQ("with", "th", ["sh", "ch"]),
    ],
    reteach: { body: "Cover one of the two letters. If the word falls apart, they were a team." },
  },

  // ---------- Grade 2, Unit 2: More than one ----------
  "g2-read-plurals-s": {
    intro: {
      buddy: "One becomes many with one little letter.",
      headline: "Adding s",
      body: "Most words become more than one by adding an s on the end. One cat, two cats.",
      say: ["One becomes many with an s.", "One cat, two cats."],
    },
    teach: [
      { show: { words: ["cat", "cats"], hi: "s" }, headline: "Just add s",
        body: "One cat, two cats. Nothing else changes. The s does all the work.",
        say: ["One cat, two cats.", "The s does all the work."] },
      { show: { words: ["dogs", "books", "cars"], hi: "s" }, headline: "It works on most words",
        body: "Dogs, books, cars. Most everyday words follow this rule without any fuss.",
        say: ["Dogs, books, cars.", "Most words follow this rule."] },
      { show: { words: ["one hat", "six hats"], hi: "s" }, headline: "The number is a clue",
        body: "If the sentence says two, six or lots, the word after it almost always needs an s.",
        say: ["The number is a clue.", "More than one usually needs an s."] },
    ],
    guided: [
      { show: { words: ["cat", "cats"], hi: "s" }, question: "One cat, two ___ . Which spelling is right?",
        choices: ["cats", "cates"], correctIndex: 0,
        hint: "Nothing else changes. Just put an s on the end.", say: ["Which spelling is right?"] },
      { show: { words: ["book", "books"], hi: "s" }, question: "One book, two ___ . Which spelling is right?",
        choices: ["bookes", "books"], correctIndex: 1,
        hint: "Add the s straight onto book.", say: ["Which spelling is right?"] },
    ],
    questions: () => [
      pluralQ("cat", "cats", ["cates", "catz"]),
      pluralQ("book", "books", ["bookes", "bookies"]),
      pluralQ("dog", "dogs", ["doges", "dogz"]),
      pluralQ("car", "cars", ["cares", "carz"]),
      pluralQ("hat", "hats", ["hates", "hatz"]),
      pluralQ("bird", "birds", ["birdes", "birdz"]),
      pluralQ("hand", "hands", ["handes", "handz"]),
      pluralQ("tree", "trees", ["treees", "treez"]),
      pluralQ("shoe", "shoes", ["shooes", "shoez"]),
      pluralQ("chair", "chairs", ["chaires", "chairz"]),
      pluralQ("pen", "pens", ["penes", "penz"]),
    ],
    reteach: { body: "For these words nothing changes except one extra s right at the end." },
  },

  "g2-read-plurals-es": {
    intro: {
      buddy: "Some words need a bigger ending than just s.",
      headline: "Adding es",
      body: "Words that end in s, x, ch or sh need es, because just an s would be impossible to say.",
      say: ["Some words need es, not s.", "Say boxs and you will hear why."],
    },
    teach: [
      { show: { words: ["box", "boxes"], hi: "es" }, headline: "Try saying it without the e",
        body: "One box, two boxes. Try saying boxs. Your mouth cannot do it, so the e steps in to help.",
        say: ["One box, two boxes.", "Try saying boxs. You cannot."] },
      { show: { words: ["bus", "buses", "dish"], hi: "es" }, headline: "s, x, ch and sh",
        body: "Bus becomes buses. Dish becomes dishes. Words that already end in a hiss need the extra e.",
        say: ["Bus becomes buses.", "Dish becomes dishes."] },
      { show: { words: ["cats", "boxes"], hi: "es" }, headline: "Check the ending first",
        body: "Cat takes s. Box takes es. Look at the last letter before you choose which ending to add.",
        say: ["Cat takes s. Box takes es.", "Check the last letter first."] },
    ],
    guided: [
      { show: { words: ["box", "boxes"], hi: "es" }, question: "One box, two ___ . Which spelling is right?",
        choices: ["boxs", "boxes"], correctIndex: 1,
        hint: "Try saying boxs out loud. The e makes it possible.", say: ["Which spelling is right?"] },
      { show: { words: ["dish", "dishes"], hi: "es" }, question: "One dish, two ___ . Which spelling is right?",
        choices: ["dishes", "dishs"], correctIndex: 0,
        hint: "Dish ends in sh, so it needs es.", say: ["Which spelling is right?"] },
    ],
    questions: () => [
      pluralQ("box", "boxes", ["boxs", "boxz"]),
      pluralQ("dish", "dishes", ["dishs", "dishez"]),
      pluralQ("bus", "buses", ["buss", "busz"]),
      pluralQ("bench", "benches", ["benchs", "benchz"]),
      pluralQ("fox", "foxes", ["foxs", "foxz"]),
      pluralQ("brush", "brushes", ["brushs", "brushz"]),
      pluralQ("glass", "glasses", ["glasss", "glassz"]),
      pluralQ("watch", "watches", ["watchs", "watchz"]),
      pluralQ("wish", "wishes", ["wishs", "wishz"]),
      pluralQ("class", "classes", ["classs", "classz"]),
      pluralQ("beach", "beaches", ["beachs", "beachz"]),
    ],
    reteach: { body: "Say it out loud with just an s. If your mouth trips over it, the word needs es." },
  },

  // ---------- Grade 2, Unit 3: Story sense ----------
  "g2-read-sequence": {
    intro: {
      buddy: "Stories happen in an order. Let's get it straight.",
      headline: "What happened first",
      body: "Words like first, then, next and finally tell you the order events happened in.",
      say: ["Stories happen in an order.", "First, then, next, finally."],
    },
    teach: [
      { show: { sentence: "First Ana mixed the batter.", hi: "First" }, headline: "Order words are signposts",
        body: "First Ana mixed the batter. The word first tells you exactly where in the story you are.",
        say: ["Order words are signposts.", "First tells you where you are."] },
      { show: { sentence: "Then she poured it into a pan.", hi: "Then" }, headline: "Then and next move you along",
        body: "Then she poured it into a pan. Then and next always mean the story has moved forward.",
        say: ["Then and next move you forward.", "The story has moved on."] },
      { show: { sentence: "Finally she took the cake out.", hi: "Finally" }, headline: "Finally means the end",
        body: "Finally she took the cake out. When you see finally or last, you have reached the ending.",
        say: ["Finally means the end.", "You have reached the ending."] },
    ],
    guided: [
      { show: { sentence: "First Ana mixed the batter. Then she baked it.", hi: "First" },
        question: "First Ana mixed the batter. Then she baked it. What did Ana do first?",
        choices: ["mixed the batter", "baked it"], correctIndex: 0,
        hint: "The word first is sitting right next to the answer.", say: ["What did Ana do first?"] },
      { show: { sentence: "Ben tied his laces. Then he ran outside.", hi: "Then" },
        question: "Ben tied his laces. Then he ran outside. What did Ben do last?",
        choices: ["tied his laces", "ran outside"], correctIndex: 1,
        hint: "Then points at whatever came afterwards.", say: ["What did Ben do last?"] },
    ],
    questions: () => [
      storyQ("First Ana mixed the batter. Then she baked it.", "What did Ana do first?", "mixed the batter", ["baked it", "ate it"]),
      storyQ("Ben tied his laces. Then he ran outside.", "What did Ben do last?", "ran outside", ["tied his laces", "sat down"]),
      storyQ("Mia woke up, ate breakfast and caught the bus.", "What did Mia do second?", "ate breakfast", ["woke up", "caught the bus"]),
      storyQ("Sam filled the bucket. Next he washed the car. Finally he dried it.", "What did Sam do last?", "dried it", ["filled the bucket", "washed the car"]),
      storyQ("The seed was planted. Then it sprouted. Finally it flowered.", "What happened first?", "the seed was planted", ["it sprouted", "it flowered"]),
      storyQ("Lily drew the outline, then colored it in.", "What did Lily do before coloring?", "drew the outline", ["framed it", "signed it"]),
      storyQ("Tom packed his bag. Next he found his boots. Then he left.", "What did Tom do second?", "found his boots", ["packed his bag", "left"]),
      storyQ("The rain stopped and then the sun came out.", "What happened after the rain stopped?", "the sun came out", ["the rain started", "it got dark"]),
      storyQ("Ana read the recipe before she started cooking.", "What did Ana do first?", "read the recipe", ["started cooking", "ate the meal"]),
      storyQ("Ben set the table. Then everyone sat down. Finally they ate.", "What happened last?", "they ate", ["Ben set the table", "everyone sat down"]),
      storyQ("The bell rang, then the class lined up, then they walked out.", "What happened first?", "the bell rang", ["the class lined up", "they walked out"]),
    ],
    reteach: { body: "Hunt for the words first, then, next and finally. They hand you the order for free." },
  },

  "g2-read-character": {
    intro: {
      buddy: "What are the people in a story actually like?",
      headline: "Getting to know a character",
      body: "A story rarely says a person is kind. It shows you something they did, and you work it out.",
      say: ["Stories show, they do not tell.", "You work out what a person is like."],
    },
    teach: [
      { show: { sentence: "Ben shared his lunch with Sam.", hi: "shared" }, headline: "Actions tell you more than words",
        body: "Ben shared his lunch with Sam. Nobody said Ben was kind, but sharing shows you that he is.",
        say: ["Ben shared his lunch.", "That shows he is kind."] },
      { show: { sentence: "Mia tried again and again.", hi: "again" }, headline: "Repeated actions are strong clues",
        body: "Mia tried again and again. Doing something over and over shows determination, not luck.",
        say: ["Mia tried again and again.", "That shows she does not give up."] },
      { show: { sentence: "Tom hid behind his dad.", hi: "hid" }, headline: "Feelings show in the body",
        body: "Tom hid behind his dad. Hiding tells you Tom felt shy or scared without anyone saying so.",
        say: ["Tom hid behind his dad.", "Hiding shows he felt shy."] },
    ],
    guided: [
      { show: { sentence: "Ben shared his lunch with Sam.", hi: "shared" },
        question: "Ben shared his lunch with Sam, who had none. What is Ben like?",
        choices: ["kind", "greedy"], correctIndex: 0,
        hint: "Think about what sharing shows about a person.", say: ["What is Ben like?"] },
      { show: { sentence: "Mia practiced every day for a month.", hi: "every" },
        question: "Mia practiced every day for a month. What is Mia like?",
        choices: ["lazy", "hard working"], correctIndex: 1,
        hint: "A month of daily practice is not a lazy thing to do.", say: ["What is Mia like?"] },
    ],
    questions: () => [
      storyQ("Ben shared his lunch with Sam, who had none.", "What is Ben like?", "kind", ["greedy", "rude"]),
      storyQ("Mia practiced every day for a month.", "What is Mia like?", "hard working", ["lazy", "careless"]),
      storyQ("Tom hid behind his dad when the dog barked.", "How did Tom feel?", "scared", ["proud", "bored"]),
      storyQ("Ana gave up her seat for an old man.", "What is Ana like?", "thoughtful", ["selfish", "angry"]),
      storyQ("Sam checked his work three times before handing it in.", "What is Sam like?", "careful", ["hasty", "unkind"]),
      storyQ("Lily helped her brother even though she was tired.", "What is Lily like?", "helpful", ["mean", "shy"]),
      storyQ("Ben punched the air when he scored.", "How did Ben feel?", "excited", ["upset", "sleepy"]),
      storyQ("Max owned up straight away when he broke the vase.", "What is Max like?", "honest", ["sneaky", "silly"]),
      storyQ("Ana kept trying the puzzle after everyone else stopped.", "What is Ana like?", "determined", ["quick to quit", "bored"]),
      storyQ("Tom whispered and stared at his shoes.", "How did Tom feel?", "shy", ["confident", "cross"]),
      storyQ("Mia waited her turn without complaining once.", "What is Mia like?", "patient", ["impatient", "loud"]),
    ],
    reteach: { body: "Point at what the person DID, then ask what kind of person does that. That is your answer." },
  },
};

// Every authored plan, math and reading in one place. buildLocalLesson looks
// here, so adding a plan to either object is all it takes to make a lesson
// draftable by the free, deterministic engine.
export const ALL_PLANS = { ...LESSON_PLANS, ...READING_PLANS };

// ---------------------------------------------------------------
// Assemble one authored lesson from its plan + the map row.
// ---------------------------------------------------------------
export function buildLocalLesson(target) {
  const plan = ALL_PLANS[target.key];
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

export default { LESSON_ART, LESSON_PLANS, READING_PLANS, ALL_PLANS, wordQ, buildLocalLesson, makeLessonWithModel, makeLesson, validateLesson, lessonContentHash, sayProblems, numWord };
