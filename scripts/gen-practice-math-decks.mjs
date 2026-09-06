// scripts/gen-practice-math-decks.mjs — emit the four maths fact decks
// (Session PT3). They ride the SAME engine as the sight words: a deck is data,
// and nothing in public/buildable-practice.js knows what a times table is.
//
// The one idea that matters here is ORDER. School fact practice usually marches
// 1+1, 1+2, 1+3 … which teaches a child to count up rather than to KNOW. These
// decks are ordered by STRATEGY FAMILY instead — the facts that share a trick
// arrive together, easiest trick first, and the genuinely hard middle arrives
// last, once everything around it is automatic.
//
// Item order IS introduction order: the engine hands out at most 3 never-seen
// items a session, taking them from the top of the deck.
//
//   node scripts/gen-practice-math-decks.mjs
import fs from 'fs';
import path from 'path';

const OUT = 'public/practice/decks';
const MAX = 10;               // facts to 10 — the standard fluency range

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// Said aloud for the audio: "thirty six" reads better to a five-year-old than
// any attempt at "thirty-six".
function words(n) {
  if (n <= 20) return NUM_WORD[n];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const t = Math.floor(n / 10), o = n % 10;
  if (n < 100) return tens[t] + (o ? ' ' + NUM_WORD[o] : '');
  return String(n);
}

// A family is { key, name, test(a,b) }. Every fact lands in the FIRST family
// whose test it passes, so the families are listed easiest-trick-first and the
// leftovers fall through to "the hard middle".
const ADD_FAMILIES = [
  { key: 'zeros-ones', name: 'Zeros and ones', test: (a, b) => a <= 1 || b <= 1 },
  { key: 'doubles', name: 'Doubles', test: (a, b) => a === b },
  { key: 'make-ten', name: 'Make ten', test: (a, b) => a + b === 10 },
  { key: 'tens', name: 'Adding ten', test: (a, b) => a === 10 || b === 10 },
  { key: 'near-doubles', name: 'Almost doubles', test: (a, b) => Math.abs(a - b) === 1 },
  { key: 'hard-middle', name: 'The tricky ones', test: () => true },
];
const MUL_FAMILIES = [
  { key: 'zeros-ones', name: 'Zeros and ones', test: (a, b) => a <= 1 || b <= 1 },
  { key: 'tens', name: 'Tens', test: (a, b) => a === 10 || b === 10 },
  { key: 'twos', name: 'Doubles', test: (a, b) => a === 2 || b === 2 },
  { key: 'fives', name: 'Fives', test: (a, b) => a === 5 || b === 5 },
  { key: 'squares', name: 'Squares', test: (a, b) => a === b },
  { key: 'nines', name: 'Nines', test: (a, b) => a === 9 || b === 9 },
  { key: 'hard-middle', name: 'The tricky ones', test: () => true },
];

function familyOf(families, a, b) {
  for (const f of families) if (f.test(a, b)) return f;
  return families[families.length - 1];
}

// Order a flat list of facts by family (families in order), and within a family
// smallest first — then SPREAD, which is the part that matters.
//
// Sorting a family by size alone produces 0x0, 0x1, 0x2 ... 0x9: ten facts in a
// row that all answer zero. A child learns the rhythm and stops reading. The
// spreader walks the family and always takes the next fact that shares NEITHER
// operand with the one just placed, falling back to the next in line when no
// such fact is left. Same facts, same family, but consecutive cards actually
// look different from each other.
function shareOperand(x, y) {
  return x.ops[0] === y.ops[0] || x.ops[0] === y.ops[1] ||
         x.ops[1] === y.ops[0] || x.ops[1] === y.ops[1];
}
function spread(list) {
  const pool = list.slice();
  const out = [];
  let prev = null;
  while (pool.length) {
    let i = 0;
    if (prev) {
      const j = pool.findIndex((x) => !shareOperand(x, prev));
      if (j >= 0) i = j;
    }
    prev = pool.splice(i, 1)[0];
    out.push(prev);
  }
  return out;
}
function byFamily(facts, families) {
  const rank = new Map(families.map((f, i) => [f.key, i]));
  const out = [];
  for (const fam of families) {
    const inFam = facts.filter((f) => f.family === fam.key)
      .sort((x, y) => (x.ops[0] + x.ops[1]) - (y.ops[0] + y.ops[1]) || x.ops[0] - y.ops[0]);
    out.push(...spread(inFam));
  }
  void rank;
  return out;
}

// Addition and multiplication are commutative, so 3+4 and 4+3 are ONE fact to
// know, not two to drill. Keeping both would double the deck and teach nothing.
function commutativePairs() {
  const out = [];
  for (let a = 0; a <= MAX; a++) for (let b = a; b <= MAX; b++) out.push([a, b]);
  return out;
}

function addition() {
  const facts = commutativePairs().map(([a, b]) => ({ a, b, ops: [a, b], family: familyOf(ADD_FAMILIES, a, b).key }));
  return byFamily(facts, ADD_FAMILIES).map(({ a, b, family }) => ({
    id: `a${a}p${b}`, prompt: `${a} + ${b}`, answer: String(a + b),
    say: `${words(a)} plus ${words(b)}`, family,
  }));
}
function subtraction() {
  // Every subtraction fact is an addition fact read backwards, so the families
  // come straight from the addition pair that makes it, and `ops` stays the
  // addition pair so the spreader groups by the same trick.
  const facts = [];
  const seen = new Set();
  for (const [a, b] of commutativePairs()) {
    const total = a + b;
    for (const take of (a === b ? [b] : [a, b])) {
      const k = total + '-' + take;
      if (seen.has(k)) continue;
      seen.add(k);
      facts.push({ a: total, b: take, ops: [a, b], family: familyOf(ADD_FAMILIES, a, b).key });
    }
  }
  return byFamily(facts, ADD_FAMILIES).map(({ a, b, family }) => ({
    id: `s${a}m${b}`, prompt: `${a} - ${b}`, answer: String(a - b),
    say: `${words(a)} take away ${words(b)}`, family,
  }));
}
function multiplication() {
  const facts = commutativePairs().map(([a, b]) => ({ a, b, ops: [a, b], family: familyOf(MUL_FAMILIES, a, b).key }));
  return byFamily(facts, MUL_FAMILIES).map(({ a, b, family }) => ({
    id: `m${a}x${b}`, prompt: `${a} × ${b}`, answer: String(a * b),
    say: `${words(a)} times ${words(b)}`, family,
  }));
}
function division() {
  // Dividing BY zero is not a fact, it is a hole in the world. Dividing zero by
  // things is a fact, but eleven cards that all answer zero teach nothing, so
  // those are out too: every division fact here is a times fact read backwards.
  const facts = [];
  const seen = new Set();
  for (let a = 1; a <= MAX; a++) {
    for (let b = 1; b <= MAX; b++) {
      const total = a * b;
      const k = total + '/' + a;
      if (seen.has(k)) continue;
      seen.add(k);
      facts.push({ a: total, b: a, ops: [a, b], family: familyOf(MUL_FAMILIES, a, b).key });
    }
  }
  return byFamily(facts, MUL_FAMILIES).map(({ a, b, family }) => ({
    id: `d${a}b${b}`, prompt: `${a} ÷ ${b}`, answer: String(a / b),
    say: `${words(a)} divided by ${words(b)}`, family,
  }));
}

const DECKS = [
  { id: 'math-addition', name: 'Adding', order: 11, grade: '1', blurb: 'Facts to ten', families: ADD_FAMILIES, items: addition() },
  { id: 'math-subtraction', name: 'Taking away', order: 12, grade: '1', blurb: 'The other way round', families: ADD_FAMILIES, items: subtraction() },
  { id: 'math-multiplication', name: 'Times', order: 13, grade: '3', blurb: 'Tables to ten', families: MUL_FAMILIES, items: multiplication() },
  { id: 'math-division', name: 'Sharing', order: 14, grade: '4', blurb: 'Times tables backwards', families: MUL_FAMILIES, items: division() },
];

fs.mkdirSync(OUT, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
// Word decks keep their entries; the maths decks are rewritten each run.
index.decks = index.decks.filter((d) => d.subject !== 'math');

for (const d of DECKS) {
  const ids = new Set();
  for (const it of d.items) {
    if (ids.has(it.id)) throw new Error(`duplicate item id ${it.id} in ${d.id}`);
    ids.add(it.id);
    if (!/^-?\d+$/.test(it.answer)) throw new Error(`non-integer answer ${it.answer} in ${d.id}`);
  }
  // The whole point of these decks: the first facts a kid ever sees must be a
  // strategy family, not 0+0, 0+1, 0+2 marching up the number line.
  const firstFamilies = [...new Set(d.items.slice(0, 20).map((i) => i.family))];
  if (firstFamilies[0] !== d.families[0].key) throw new Error(`${d.id} does not open on ${d.families[0].key}`);

  const deck = {
    id: d.id, name: d.name, group: 'Numbers', blurb: d.blurb,
    subject: 'math', skill: d.id, grade: d.grade, order: d.order,
    // The answer is typed on a drawn keypad, not picked from four cards. The
    // engine does not read this — the page does.
    answerUI: 'keypad',
    families: d.families.map((f) => ({ key: f.key, name: f.name })),
    items: d.items,
  };
  fs.writeFileSync(path.join(OUT, d.id + '.json'), JSON.stringify(deck, null, 2) + '\n');
  index.decks.push({
    id: deck.id, name: deck.name, group: deck.group, blurb: deck.blurb,
    subject: deck.subject, grade: deck.grade, order: deck.order,
    answerUI: deck.answerUI, count: deck.items.length,
    file: '/practice/decks/' + d.id + '.json',
  });
  const fam = {};
  d.items.forEach((i) => { fam[i.family] = (fam[i.family] || 0) + 1; });
  console.log(`${d.id.padEnd(22)} ${String(d.items.length).padStart(4)} facts   ` +
    d.families.map((f) => `${f.key}:${fam[f.key] || 0}`).join('  '));
  console.log(`${''.padEnd(22)} first ten: ${d.items.slice(0, 10).map((i) => i.prompt).join(', ')}`);
}

index.decks.sort((a, b) => (a.order || 0) - (b.order || 0));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`index.json now lists ${index.decks.length} decks`);
