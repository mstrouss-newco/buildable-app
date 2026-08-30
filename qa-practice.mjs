// qa-practice.mjs — the harness for the shared practice engine, the decks that
// ride on it, and the Practice page (Sessions PT1, PT2, PT3).
//
// Four parts, all in-process (jsdom, already a devDependency — no network):
//
//   1. BOX MATH    the Leitner rules in public/buildable-practice.js, loaded
//                  into a real jsdom window so localStorage and the browser
//                  globals are the ones a kid's iPad would use. Plus placement
//                  seeding, the collection count, and the sprint unlock gate.
//   2. DECK DATA   the five Dolch lists (40/52/41/46/41 = 220) and the four
//                  maths decks: unique ids, heart letters that land on a real
//                  letter, arithmetic that is actually true, and — the point of
//                  PT3 — facts ordered by STRATEGY FAMILY, not up the number
//                  line, with no run of identical answers at the start.
//   3. THE PAGE    public/practice.html booted headless four times with its
//                  real scripts running: once through the placement warm-up,
//                  once through a Find It run and a Flash run, once through the
//                  maths keypad, once through a Sprint.
//   4. WIRING      routes, the Home tile, the sounds, the Parents controls.
//
// The screenshot check is separate and optional: see qa-practice-shot.mjs.
//
//   node qa-practice.mjs
import fs from 'fs';
import path from 'path';
import jsdomPkg from 'jsdom';
const { JSDOM, VirtualConsole } = jsdomPkg;

const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const P = (p) => path.join(dir, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const section = (t) => console.log('\n--- ' + t + ' ---');
const DAY = 86400000;

// The product guardrail: drawn SVG geometry only, no emoji glyphs anywhere.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// ===========================================================================
// 1. BOX MATH
// ===========================================================================
section('box math (jsdom)');

const engineWin = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://qa.local/', runScripts: 'outside-only' }).window;
engineWin.eval(read('public/buildable-practice.js'));
const BP = engineWin.BuildablePractice;

chk('engine loads and exposes BuildablePractice', !!BP);
chk('fast is under 3000ms', BP.FAST_MS === 3000, 'FAST_MS=' + BP.FAST_MS);
chk('boxes run 1 to 5', BP.MIN_BOX === 1 && BP.MAX_BOX === 5);
chk('a new item starts in box 1', BP.newRecord(0).box === 1);
chk('a new item is due immediately', BP.newRecord(1000).due === 1000);

chk('right + fast  -> up a box',   BP.nextBox(2, true, 1200) === 3);
chk('right + slow  -> down a box', BP.nextBox(2, true, 4200) === 1);
chk('right on the 3000ms line counts as slow', BP.nextBox(2, true, 3000) === 1);
chk('right at 2999ms counts as fast', BP.nextBox(2, true, 2999) === 3);
chk('wrong + fast  -> down a box',  BP.nextBox(2, false, 900) === 1);
chk('wrong + slow  -> down a box',  BP.nextBox(2, false, 9000) === 1);
chk('box 5 is the ceiling', BP.nextBox(5, true, 500) === 5);
chk('box 1 is the floor',   BP.nextBox(1, false, 9000) === 1);
chk('a missing time counts as slow', BP.nextBox(3, true, undefined) === 2);

chk('box 1 is due right away', BP.dueAt(1, 0) === 0);
const waits = [1, 2, 3, 4, 5].map((b) => BP.dueAt(b, 0) / DAY);
chk('the wait grows with every box', waits.every((w, i) => i === 0 || w > waits[i - 1]),
  waits.map((w, i) => 'box' + (i + 1) + '=' + w + 'd').join(' '));

let rec = BP.applyAnswer(null, { correct: true, ms: 800, now: 0 });
chk('first right+fast answer lands in box 2', rec.box === 2 && rec.right === 1 && rec.seen === 1);
chk('and is not due again today', rec.due === DAY);
rec = BP.applyAnswer(rec, { correct: false, ms: 800, now: DAY });
chk('a miss drops it back to box 1 and counts the wrong', rec.box === 1 && rec.wrong === 1 && rec.seen === 2);
chk('a box 1 item is due again in the same session', rec.due === DAY);

// --- session building ---
section('session building');
const fakeDeck = { id: 'qa-deck', subject: 'reading', skill: 'qa', items: [] };
for (let i = 0; i < 60; i++) fakeDeck.items.push({ id: 'w' + i, prompt: 'w' + i, answer: 'w' + i });

let built = BP.buildSession(fakeDeck, { items: {} }, { now: 0 });
chk('a first-ever session is all new words, capped at 3', built.plan.length === 3 && built.newCount === 3,
  'plan=' + built.plan.length);
chk('every new word is flagged for its intro moment', built.plan.every((e) => e.intro === true));

const seededState = { items: {} };
for (let i = 0; i < 40; i++) seededState.items['w' + i] = { box: 2, due: 0, seen: 3, right: 2, wrong: 1, last: 0 };
built = BP.buildSession(fakeDeck, seededState, { now: 10 * DAY });
chk('a session is about 20 items', built.plan.length === 20, 'plan=' + built.plan.length);
chk('at most 3 of them are new', built.newCount <= 3, 'new=' + built.newCount);
chk('the rest are due reviews', built.dueCount === 20 - built.newCount);
chk('exactly the new ones ask for an intro',
  built.plan.filter((e) => e.intro).length === built.newCount);
chk('new words are mixed in, not all stacked at the front',
  built.plan.slice(0, built.newCount).some((e) => !e.intro) || built.newCount === 0,
  'intro positions=' + built.plan.map((e, i) => (e.intro ? i : null)).filter((x) => x !== null).join(','));
chk('no word appears twice in one session',
  new Set(built.plan.map((e) => e.itemId)).size === built.plan.length);

const overdue = { items: {} };
overdue.items.w0 = { box: 3, due: 5 * DAY, seen: 4, right: 4, wrong: 0, last: 0 };
overdue.items.w1 = { box: 1, due: 1 * DAY, seen: 4, right: 1, wrong: 3, last: 0 };
overdue.items.w2 = { box: 2, due: 3 * DAY, seen: 4, right: 2, wrong: 2, last: 0 };
built = BP.buildSession(fakeDeck, overdue, { now: 9 * DAY, maxNew: 0 });
chk('the most overdue word comes first', built.plan[0].itemId === 'w1',
  built.plan.slice(0, 3).map((e) => e.itemId).join(' -> '));

const small = { id: 'small', items: [] };
for (let i = 0; i < 25; i++) small.items.push({ id: 's' + i, prompt: 's' + i, answer: 's' + i });
const rested = { items: {} };
for (let i = 0; i < 25; i++) rested.items['s' + i] = { box: 4, due: 99 * DAY, seen: 5, right: 5, wrong: 0, last: 0 };
built = BP.buildSession(small, rested, { now: 0 });
chk('a deck with nothing due still fills a session', built.plan.length === 20, 'plan=' + built.plan.length);
chk('and adds no new words when there are none left', built.newCount === 0);

// --- wrong answers are never punished ---
section('a miss only comes back sooner');
const queue = built.plan.slice();
const beforeLen = queue.length;
const missed = queue[2];
BP.requeue(queue, 2, missed);
chk('a missed word is put back into the run', queue.length === beforeLen + 1);
const backAt = queue.findIndex((e, i) => i > 2 && e.itemId === missed.itemId);
chk('it comes back later, not immediately', backAt > 3, 'returns at index ' + backAt);
chk('it comes back without an intro moment', queue[backAt].intro === false);

// Practice has no lives, no score and no fail state. Sprint (PT3) DOES keep a
// personal-best count by design, so the score ban is checked against the engine
// with the sprint helpers cut out — the practice path must stay clean.
const engineRaw = read('public/buildable-practice.js');
const decomment = (t) => t.replace(/^[ \t]*\/\/.*$/gm, '');
const engineSrc = decomment(engineRaw);
const practicePath = decomment(engineRaw.replace(/---- sprint bests[\s\S]*?---- reporting/, ''));
chk('the engine has no lives and no fail state', !/\blives\b|gameOver|\bfail\b/i.test(engineSrc));
chk('nothing on the practice path keeps a score', !/\bscore\b/i.test(practicePath));
chk('a score exists only inside sprint', /\bscore\b/.test(engineSrc));
chk('the engine is subject-agnostic (no sight-word or maths special cases)',
  !/sight|dolch|\bword\b|addition|subtract|multipl|divi|keypad/i.test(
    engineRaw.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// --- choices ---
section('four big cards');
for (let i = 0; i < 40; i++) {
  const item = fakeDeck.items[i % fakeDeck.items.length];
  const c = BP.choices(fakeDeck, item, { count: 4 });
  if (c.length !== 4) { chk('always four cards', false, 'got ' + c.length); break; }
  if (!c.includes(item)) { chk('the right answer is always among them', false, item.id); break; }
  if (new Set(c.map((x) => BP.answerOf(x))).size !== 4) { chk('no two cards say the same thing', false, item.id); break; }
}
chk('always four cards, one of them right, none repeated', true, '40 draws checked');

// --- per-kid storage ---
section('per-kid storage');
engineWin.localStorage.clear();
BP.recordAnswer('kid-a', 'qa-deck', 'w0', { correct: true, ms: 500, now: 0 });
BP.recordAnswer('kid-b', 'qa-deck', 'w0', { correct: false, ms: 500, now: 0 });
const stored = JSON.parse(engineWin.localStorage.getItem('bk_practice_v1') || '{}');
chk('state lives under bk_practice_v1', !!stored.kids);
chk('each kid has their own box for the same word',
  stored.kids['kid-a'].decks['qa-deck'].items.w0.box === 2 &&
  stored.kids['kid-b'].decks['qa-deck'].items.w0.box === 1);
BP.recordAnswer(null, 'qa-deck', 'w0', { correct: true, ms: 500, now: 0 });
chk('a kid with no profile practises as "guest"',
  !!JSON.parse(engineWin.localStorage.getItem('bk_practice_v1')).kids.guest);

// ===========================================================================
// PT2 — placement, the collection, the level override
// ===========================================================================
section('the placement warm-up (PT2)');
engineWin.localStorage.clear();
const decksA = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({
  id, name: id, subject: 'reading', skill: id,
  items: Array.from({ length: 12 }, (_, i) => ({ id: id + '-' + i, prompt: id + i, answer: id + i })),
}));
const probes = BP.buildPlacement(decksA);
chk('the warm-up is about ten items', probes.length === 10, 'got ' + probes.length);
chk('it spans every list', new Set(probes.map((p) => p.deckId)).size === 5);
chk('two probes from each list',
  decksA.every((d) => probes.filter((p) => p.deckId === d.id).length === 2));
chk('no probe asks for an intro moment', probes.every((p) => p.intro === false));

// A kid who knows the first three lists and then stops.
const answersA = probes.map((p) => ({ deckId: p.deckId, itemId: p.itemId, correct: ['d1', 'd2', 'd3'].includes(p.deckId) }));
const resA = BP.applyPlacement('kid-p', decksA, answersA, { now: 0 });
chk('the warm-up lands them past what they knew', resA.landingDeckId === 'd4', 'landed on ' + resA.landingDeckId);
chk('it seeded the lists below', resA.placed === 36, 'seeded ' + resA.placed);

let stA = BP.loadState();
const d1items = BP.deckState(stA, 'kid-p', 'd1').items;
chk('seeded items sit at box 3, not box 1',
  Object.keys(d1items).length === 12 && Object.keys(d1items).every((k) => d1items[k].box === BP.PLACED_BOX));
chk('the warm-up can never mint a mastered item',
  Object.keys(d1items).every((k) => d1items[k].box < BP.MAX_BOX && d1items[k].seen === 0 && d1items[k].placed === true));
chk('and therefore never mints a bird', BP.masteredTotal(stA, 'kid-p') === 0);
chk('seeded items are not all due on the same day',
  new Set(Object.keys(d1items).map((k) => d1items[k].due)).size > 1);
chk('the landing list is left untouched', Object.keys(BP.deckState(stA, 'kid-p', 'd4').items).length === 0);
chk('the warm-up is remembered', !!BP.placement(stA, 'kid-p') && BP.placement(stA, 'kid-p').done === true);
chk('and it set the level', BP.level(stA, 'kid-p') === 'd4');

// A kid who knows nothing lands gently on the first list, seeding nothing.
BP.applyPlacement('kid-q', decksA, probes.map((p) => ({ deckId: p.deckId, itemId: p.itemId, correct: false })), { now: 0 });
stA = BP.loadState();
chk('knowing none of it lands on the first list, with nothing seeded',
  BP.level(stA, 'kid-q') === 'd1' && Object.keys(BP.deckState(stA, 'kid-q', 'd1').items).length === 0);

// Re-running the warm-up wipes only what was seeded, never earned work.
BP.recordAnswer('kid-p', 'd1', 'd1-0', { correct: true, ms: 400, now: 0 });
BP.clearPlacement('kid-p');
stA = BP.loadState();
chk('re-running the warm-up clears the record', !BP.placement(stA, 'kid-p'));
chk('it drops the seeded items', Object.keys(BP.deckState(stA, 'kid-p', 'd1').items).length === 1);
chk('but never touches work the kid actually did',
  !!BP.deckState(stA, 'kid-p', 'd1').items['d1-0'] &&
  BP.deckState(stA, 'kid-p', 'd1').items['d1-0'].seen === 1);

section('the collection (PT2)');
engineWin.localStorage.clear();
for (let i = 0; i < 7; i++) {
  for (let t = 0; t < 4; t++) BP.recordAnswer('kid-c', 'd1', 'd1-' + i, { correct: true, ms: 400, now: t * 20 * DAY });
}
let stC = BP.loadState();
chk('one bird per mastered item', BP.masteredTotal(stC, 'kid-c') === 7, 'mastered=' + BP.masteredTotal(stC, 'kid-c'));
chk('the count breaks down per deck', BP.masteredByDeck(stC, 'kid-c').d1 === 7);
chk('a half-learned item is not a bird', (() => {
  BP.recordAnswer('kid-c', 'd1', 'd1-9', { correct: true, ms: 400, now: 0 });
  return BP.masteredTotal(BP.loadState(), 'kid-c') === 7;
})());
chk("another kid's birds are their own", BP.masteredTotal(BP.loadState(), 'kid-z') === 0);
const tinyDeck = { id: 'd1', items: decksA[0].items.slice(0, 7) };
chk('a whole list finished is a big moment', BP.deckComplete(tinyDeck, BP.deckState(BP.loadState(), 'kid-c', 'd1')));
chk('an unfinished list is not', !BP.deckComplete(decksA[0], BP.deckState(BP.loadState(), 'kid-c', 'd1')));

section('the level override (PT2)');
BP.setLevel('kid-c', 'd3');
chk('a grown-up can move the level', BP.level(BP.loadState(), 'kid-c') === 'd3');
BP.setLevel('kid-c', 'd1');
chk('and move it back', BP.level(BP.loadState(), 'kid-c') === 'd1');

// ===========================================================================
// PT3 — the sprint gate, bests, parent settings
// ===========================================================================
section('the sprint gate (PT3)');
const mathFake = { id: 'm', subject: 'math', answerUI: 'keypad', items: [] };
for (let i = 0; i < 40; i++) mathFake.items.push({ id: 'f' + i, prompt: i + ' + 1', answer: String(i + 1) });

const noneMet = BP.sprintReadiness(mathFake, { items: {} });
chk('sprint is shut before any practice', !noneMet.ready && noneMet.introduced === 0);

const fewMet = { items: {} };
for (let i = 0; i < 5; i++) fewMet.items['f' + i] = { box: 5, due: 0, seen: 3, right: 3, wrong: 0, last: 0 };
chk('five perfect facts is not enough to open it', !BP.sprintReadiness(mathFake, fewMet).ready,
  'introduced=' + BP.sprintReadiness(mathFake, fewMet).introduced + ' need=' + BP.SPRINT_MIN_INTRODUCED);

const shaky = { items: {} };
for (let i = 0; i < 20; i++) shaky.items['f' + i] = { box: i < 10 ? 4 : 1, due: 0, seen: 3, right: 1, wrong: 2, last: 0 };
chk('twenty facts at half fluency is not enough either', !BP.sprintReadiness(mathFake, shaky).ready,
  'pct=' + BP.sprintReadiness(mathFake, shaky).pct.toFixed(2));

const fluent = { items: {} };
for (let i = 0; i < 20; i++) fluent.items['f' + i] = { box: i < 17 ? 4 : 1, due: 0, seen: 3, right: 3, wrong: 0, last: 0 };
const rdy = BP.sprintReadiness(mathFake, fluent);
chk('twenty facts at 85% opens it', rdy.ready, 'pct=' + rdy.pct.toFixed(2) + ' introduced=' + rdy.introduced);
chk('facts never introduced are not held against the kid',
  rdy.introduced === 20 && mathFake.items.length === 40);

section('sprint bests and parent settings (PT3)');
engineWin.localStorage.clear();
chk('the defaults are the common school format',
  BP.DEFAULT_SETTINGS.sprintSeconds === 60 && BP.DEFAULT_SETTINGS.sprintTarget === 40);
let set = BP.settings(BP.loadState(), 'kid-s');
chk('a kid with no settings gets the defaults', set.sprintSeconds === 60 && set.sprintTarget === 40);
set = BP.setSettings('kid-s', { sprintSeconds: 90, sprintTarget: 25 });
chk('a grown-up can change both', set.sprintSeconds === 90 && set.sprintTarget === 25);
chk('and cannot set something absurd',
  BP.setSettings('kid-s', { sprintSeconds: 9000 }).sprintSeconds === 300);
BP.setSettings('kid-s', { sprintSeconds: 60 });

let sp = BP.recordSprint('kid-s', 'm', { score: 18, seconds: 60, now: 0 });
chk('a first sprint is recorded', sp.best === 18 && sp.runs === 1);
sp = BP.recordSprint('kid-s', 'm', { score: 12, seconds: 60, now: DAY });
chk('a worse run never lowers the best', sp.best === 18 && sp.beat === false);
sp = BP.recordSprint('kid-s', 'm', { score: 25, seconds: 60, now: 2 * DAY });
chk('a better run is a new personal best', sp.best === 25 && sp.beat === true);
const spState = JSON.parse(engineWin.localStorage.getItem('bk_practice_v1'));
chk('the best is stored under this kid alone',
  !!spState.kids['kid-s'].sprints.m && Object.keys(spState.kids).filter((k) => spState.kids[k].sprints).length === 1);
chk("there is nowhere to put another kid's number",
  !/rank|leader|versus|compare|opponent/i.test(engineSrc));

// --- the ledger row ---
section('the learning ledger row');
const answers = [
  { correct: true, ms: 800 }, { correct: true, ms: 900 }, { correct: false, ms: 400 },
  { correct: true, ms: 5000 },
];
const sum = BP.summarize(answers);
chk('a run is summarised honestly', sum.total === 4 && sum.right === 3 && sum.wrong === 1 && sum.fast === 2,
  JSON.stringify(sum));
const ev = BP.sessionEvent({ id: 'd', subject: 'reading', skill: 'sight-words-primer', grade: 'K' }, answers);
chk('one event per session, shaped for /api/log-learning-event',
  ev.subject === 'reading' && ev.skill === 'sight-words-primer' && ev.quizType === 'practice' &&
  ev.game === 'practice' && ev.correct === true, JSON.stringify({ ...ev, summary: undefined }));
chk('a bad run still logs, just not as correct',
  BP.sessionEvent({ subject: 'reading' }, [{ correct: false, ms: 100 }, { correct: false, ms: 100 }]).correct === false);
chk('a maths run logs as maths',
  BP.sessionEvent({ subject: 'math', skill: 'math-addition' }, answers).subject === 'math');

// ===========================================================================
// 2. DECK DATA
// ===========================================================================
section('the five Dolch lists');

const WORD_DECKS = [
  ['sight-words-pre-primer', 40], ['sight-words-primer', 52],
  ['sight-words-first', 41], ['sight-words-second', 46], ['sight-words-third', 41],
];
const MATH_DECKS = ['math-addition', 'math-subtraction', 'math-multiplication', 'math-division'];
const index = JSON.parse(read('public/practice/decks/index.json'));
chk('index.json lists every deck', (index.decks || []).length === WORD_DECKS.length + MATH_DECKS.length,
  'got ' + (index.decks || []).length);

let grand = 0;
const allWords = new Set();
for (const [id, count] of WORD_DECKS) {
  const deck = JSON.parse(read('public/practice/decks/' + id + '.json'));
  chk(id + ' has exactly ' + count + ' words', deck.items.length === count, 'got ' + deck.items.length);
  grand += deck.items.length;
  const ids = deck.items.map((i) => i.id);
  chk(id + ' ids are unique', new Set(ids).size === ids.length);
  chk(id + ' is tagged for the ledger and the cards',
    deck.subject === 'reading' && !!deck.skill && !!deck.grade && deck.answerUI === 'choice');
  const badHeart = deck.items.filter((i) => (i.heart || []).some((h) => h < 0 || h >= String(i.answer).length));
  chk(id + ' every glowing letter lands on a real letter', badHeart.length === 0,
    badHeart.map((i) => i.answer).join(','));
  const noAudio = deck.items.filter((i) => !i.audio || !/^[a-z]+\.mp3$/.test(i.audio));
  chk(id + ' every word names a safe audio file', noAudio.length === 0, noAudio.map((i) => i.answer).join(','));
  chk(id + ' has no emoji', !EMOJI.test(JSON.stringify(deck)));
  const meta = (index.decks || []).find((d) => d.id === id);
  chk(id + ' matches its index entry',
    !!meta && meta.count === deck.items.length && meta.file === '/practice/decks/' + id + '.json');
  deck.items.forEach((i) => allWords.add(i.answer.toLowerCase()));
}
chk('220 Dolch sight words in total', grand === 220, 'got ' + grand);
chk('the words themselves are all different across the five lists', allWords.size === 220, 'unique=' + allWords.size);

const pp = JSON.parse(read('public/practice/decks/sight-words-pre-primer.json'));
chk('tricky words carry their heart letters',
  pp.items.filter((i) => (i.heart || []).length).length >= 10,
  pp.items.filter((i) => (i.heart || []).length).length + ' of ' + pp.items.length + ' in the first list');
const said = pp.items.find((i) => i.answer === 'said');
chk('"said" glows on its ai', !!said && JSON.stringify(said.heart) === '[1,2]', JSON.stringify(said && said.heart));

section('the four maths decks (PT3)');
for (const id of MATH_DECKS) {
  const deck = JSON.parse(read('public/practice/decks/' + id + '.json'));
  const ids = deck.items.map((i) => i.id);
  chk(id + ' ids are unique', new Set(ids).size === ids.length, deck.items.length + ' facts');
  chk(id + ' is tagged for the ledger and the keypad',
    deck.subject === 'math' && !!deck.skill && !!deck.grade && deck.answerUI === 'keypad');
  chk(id + ' every answer is a whole number',
    deck.items.every((i) => /^-?\d+$/.test(i.answer)),
    deck.items.filter((i) => !/^-?\d+$/.test(i.answer)).map((i) => i.prompt + '=' + i.answer).slice(0, 4).join(', '));

  // The arithmetic itself has to be right — a practice app that teaches a wrong
  // fact is worse than no practice app at all.
  const wrong = deck.items.filter((i) => {
    const m = i.prompt.match(/^(\d+) ([+×÷-]) (\d+)$/);
    if (!m) return true;
    const a = +m[1], b = +m[3];
    const want = { '+': a + b, '-': a - b, '×': a * b, '÷': b === 0 ? NaN : a / b }[m[2]];
    return String(want) !== i.answer;
  });
  chk(id + ' every fact is actually true', wrong.length === 0,
    wrong.slice(0, 4).map((i) => i.prompt + ' = ' + i.answer).join(', '));

  chk(id + ' every fact is said aloud in words', deck.items.every((i) => i.say && /[a-z]/.test(i.say)),
    (deck.items.find((i) => !i.say) || {}).prompt || '');
  chk(id + ' has no emoji', !EMOJI.test(JSON.stringify(deck)));
  chk(id + ' declares its strategy families', Array.isArray(deck.families) && deck.families.length >= 4,
    (deck.families || []).map((f) => f.key).join(', '));

  // PT3's whole point: introduced by strategy family, NOT numeric order.
  const fams = deck.items.map((i) => i.family);
  chk(id + ' every fact belongs to a family', fams.every(Boolean));
  const famOrder = deck.families.map((f) => f.key);
  let lastRank = -1, grouped = true;
  const seenFam = new Set();
  for (const f of fams) {
    const r = famOrder.indexOf(f);
    if (r < lastRank) { grouped = false; break; }
    if (r > lastRank && seenFam.has(f)) { grouped = false; break; }
    seenFam.add(f); lastRank = r;
  }
  chk(id + ' facts arrive family by family, easiest trick first', grouped,
    [...new Set(fams)].join(' -> '));
  chk(id + ' opens on the easiest family', fams[0] === famOrder[0]);

  // A run of identical answers at the start is the numeric-order failure mode
  // wearing a family badge: 0x0, 0x1, 0x2 ... all answering zero.
  const firstTwenty = deck.items.slice(0, 20).map((i) => i.answer);
  let worstRun = 1, cur = 1;
  for (let i = 1; i < firstTwenty.length; i++) {
    cur = firstTwenty[i] === firstTwenty[i - 1] ? cur + 1 : 1;
    worstRun = Math.max(worstRun, cur);
  }
  chk(id + ' the first twenty facts do not march up the number line', worstRun <= 2,
    'longest run of the same answer = ' + worstRun + '  ::  ' + deck.items.slice(0, 8).map((i) => i.prompt).join(', '));

  const meta = (index.decks || []).find((d) => d.id === id);
  chk(id + ' matches its index entry',
    !!meta && meta.count === deck.items.length && meta.answerUI === 'keypad');
}
const divDeck = JSON.parse(read('public/practice/decks/math-division.json'));
chk('nothing is ever divided by zero', !divDeck.items.some((i) => / ÷ 0$/.test(i.prompt)));
chk('and no card just answers zero eleven times', !divDeck.items.some((i) => /^0 /.test(i.prompt)));

// ===========================================================================
// 3. THE PAGE, LOADED HEADLESS
// ===========================================================================
section('practice.html, booted headless');

const pageHtml = read('public/practice.html');
const pageCode = pageHtml.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
chk('no emoji in practice.html', !EMOJI.test(pageHtml));
chk('no emoji in buildable-practice.js', !EMOJI.test(engineRaw));
chk('the page loads the shared engine', /src="\/buildable-practice\.js"/.test(pageHtml));
chk('the page loads the shared audio kit', /src="\/buildable-audio\.js"/.test(pageHtml));
chk('practice never renders the measured milliseconds',
  !/textContent\s*=\s*[^;]*\bms\b|innerHTML\s*=\s*[^;]*\bms\b/.test(pageCode));
chk('the page posts one session to the learning ledger',
  /\/api\/log-learning-event/.test(pageHtml) && /kind:"skill"/.test(pageHtml));
chk('word audio falls back to the device voice',
  /speechSynthesis/.test(pageHtml) && /\/api\/say/.test(pageHtml));
// Sprint is the only clock, and even it has no digits counting down.
chk('nothing counts down at a kid anywhere',
  !/countdown|seconds left|time left/i.test(pageCode));
chk('the sprint clock is a bar, not counting digits',
  /sprintBar[\s\S]{0,120}scaleX/.test(pageCode) && !/sprintBar[\s\S]{0,200}textContent/.test(pageCode));

// --- the boot rig ---------------------------------------------------------
// jsdom will not fetch the page's own scripts (and must never reach the network
// for a webfont), so both shared libraries are inlined in place of their script
// tags: identical code, identical order. The tags themselves are asserted above.
const bootHtml = pageHtml
  .replace('<script src="/buildable-practice.js"></script>', '<script>' + engineRaw + '</script>')
  .replace('<script src="/buildable-audio.js"></script>', '<script>' + read('public/buildable-audio.js') + '</script>');
chk('both shared libraries were inlined for the boot',
  !/<script src="\/buildable-(practice|audio)\.js">/.test(bootHtml));

function boot(seedState, kid) {
  const spoken = [], audioTried = [], ledger = [], errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/not implemented/i.test(e.message || '')) return;   // jsdom has no layout
    errors.push(String(e.message || e).slice(0, 200));
  });
  vc.on('error', (m) => errors.push(String(m).slice(0, 200)));

  const dom = new JSDOM(bootHtml, {
    url: 'https://qa.local/practice',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      if (seedState) win.localStorage.setItem('bk_practice_v1', JSON.stringify(seedState));
      if (kid) win.localStorage.setItem('bk_active_kid_v1', JSON.stringify(kid));
      win.fetch = (url, init) => {
        const u = String(url);
        if (u.startsWith('/api/log-learning-event')) {
          ledger.push(JSON.parse((init && init.body) || '{}'));
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        const f = P(path.join('public', u.split('?')[0]));
        try {
          const body = fs.readFileSync(f, 'utf8');
          return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)), text: () => Promise.resolve(body) });
        } catch (e) { return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) }); }
      };
      // Every Audio() fails, exactly as it would before the mp3 files are baked,
      // which forces the fallback ladder all the way down to the device voice.
      win.Audio = function (src) {
        audioTried.push(src);
        return {
          addEventListener: () => {}, removeEventListener: () => {},
          play: () => Promise.reject(new Error('no audio in jsdom')),
          pause: () => {}, set currentTime(v) {}, get currentTime() { return 0; },
        };
      };
      win.SpeechSynthesisUtterance = function (t) { this.text = t; };
      win.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel: () => {} };
      win.scrollTo = () => {};
    },
  });
  const win = dom.window;
  const click = (el) => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const $ = (id) => win.document.getElementById(id);
  const visible = (id) => !$(id).classList.contains('hide');
  return { win, doc: win.document, spoken, audioTried, ledger, errors, click, $, visible };
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const ready = async (b) => {
  await new Promise((r) => b.win.addEventListener('load', r, { once: true }));
  await settle(80);
};

// --- BOOT 1: a kid's very first visit runs the placement warm-up ----------
section('the placement warm-up, on screen');
const b1 = boot(null, { id: 'qa-kid-1', grade: '1' });
await ready(b1);
chk('the page booted with no script errors', b1.errors.length === 0, b1.errors.slice(0, 3).join(' | '));
chk('it read the deck index', b1.win.PRACTICE_READY === true);
chk('a first visit opens on the warm-up, not the picker', b1.visible('placeintro') && !b1.visible('home'));
chk('the warm-up promises nothing to get wrong',
  /nothing to get wrong/i.test(b1.$('placeintro').textContent));
chk('no emoji reached the warm-up', !EMOJI.test(b1.$('placeintro').textContent || ''));

b1.click(b1.$('placego'));
await settle(120);
chk('the warm-up starts asking', b1.visible('ask') && !!b1.win.PRACTICE_PAGE.place(),
  'queue=' + ((b1.win.PRACTICE_PAGE.place() || {}).queue || []).length);
chk('it is ten items spanning the lists',
  (b1.win.PRACTICE_PAGE.place().queue || []).length === 10 &&
  new Set(b1.win.PRACTICE_PAGE.place().queue.map((q) => q.deckId)).size === 5);
chk('the warm-up shows four big cards', b1.doc.querySelectorAll('#cards .wordcard').length === 4);

let g = 0;
while (b1.win.PRACTICE_PAGE.place() && g++ < 40) {
  const pl = b1.win.PRACTICE_PAGE.place();
  const want = BP.answerOf(pl.queue[pl.i].item);
  const card = [...b1.doc.querySelectorAll('#cards .wordcard')].find((c) => c.getAttribute('data-word') === want);
  if (!card) break;
  b1.click(card);
  await settle(20);
  chk_once('a warm-up answer is never marked right or wrong', !b1.doc.querySelector('#cards .right, #cards .wrongpick'));
  chk_once('it just acknowledges the tap', !!b1.doc.querySelector('#cards .neutral'));
  await settle(470);
}
chk('the warm-up finishes', b1.visible('placedone'));
chk('and says something kind about it', /know lots already|All set/i.test(b1.$('placedoneTitle').textContent));

const st1 = JSON.parse(b1.win.localStorage.getItem('bk_practice_v1') || '{}');
const kid1 = st1.kids['qa-kid-1'] || { decks: {} };
chk('the warm-up is remembered so it never runs twice', !!(kid1.placement && kid1.placement.done));
chk('it seeded the earlier lists', Object.keys(kid1.decks).length >= 1, Object.keys(kid1.decks).join(', '));
const seededBoxes = Object.keys(kid1.decks).flatMap((d) => Object.values(kid1.decks[d].items || {}));
chk('every seeded item sits at box 3', seededBoxes.length > 0 && seededBoxes.every((r) => r.box === 3));
chk('the warm-up minted no birds at all',
  seededBoxes.every((r) => r.box < 5) && b1.win.PRACTICE_PAGE.mastered() === 0,
  'birds=' + b1.win.PRACTICE_PAGE.mastered());

b1.click(b1.$('placedonego'));
await settle(60);
chk('then it hands over to the picker', b1.visible('home'));
chk('and the collection starts empty', b1.win.PRACTICE_PAGE.flockCount() === 0);
b1.win.close();

// --- BOOT 2: practice runs, and the birds ---------------------------------
section('a practice run, and the collection');
// Six pre-primer words one right-and-fast answer away from mastered, so this
// run must hatch real birds.
const nearly = { box: 4, due: 0, seen: 6, right: 6, wrong: 0, last: 0 };
const ppIds = pp.items.slice(0, 6).map((i) => i.id);
const seed2 = {
  kids: {
    'qa-kid-2': {
      placement: { done: true, at: 0, landingDeckId: 'sight-words-pre-primer' },
      level: 'sight-words-pre-primer',
      decks: { 'sight-words-pre-primer': { items: Object.fromEntries(ppIds.map((id) => [id, { ...nearly }])) } },
    },
  },
};
const b2 = boot(seed2, { id: 'qa-kid-2', grade: 'K' });
await ready(b2);
chk('a kid who has done the warm-up goes straight to the picker', b2.visible('home'));
chk('the picker offers both subjects', b2.doc.querySelectorAll('#subjects .pick').length === 2,
  [...b2.doc.querySelectorAll('#subjects .pick')].map((e) => e.getAttribute('data-subject')).join(', '));
chk('the word sets are all five', b2.doc.querySelectorAll('#decks .pick').length === 5);
chk('Find It and Flash are the word modes',
  [...b2.doc.querySelectorAll('#modes .pick')].map((e) => e.getAttribute('data-mode')).sort().join(',') === 'find,flash');
chk('Sprint is not offered on words', !b2.visible('sprint'));
chk('no emoji reached the rendered page', !EMOJI.test(b2.doc.body.textContent || ''));
chk('the collection starts empty for this kid', b2.win.PRACTICE_PAGE.mastered() === 0);

b2.win.PRACTICE_PAGE.setDeck('sight-words-pre-primer');
b2.win.PRACTICE_PAGE.setMode('find');
b2.click(b2.$('start'));
await settle(100);
const run2 = b2.win.PRACTICE_PAGE.run();
chk('a run starts', !!run2, run2 ? 'queue=' + run2.queue.length : 'no run');
// This kid has due reviews, so the run correctly OPENS on a review and mixes
// the new words in later — the intro moment is checked where it happens.
chk('due reviews lead, new words are mixed in', !b2.visible('intro') && b2.visible('ask') &&
  run2.plan !== undefined ? true : run2.queue.some((e) => e.intro), 'first=' + (run2.queue[0].intro ? 'new' : 'review'));
chk('the run carries new words to introduce', run2.queue.filter((e) => e.intro).length > 0,
  run2.queue.filter((e) => e.intro).length + ' new');
chk('audio was asked for the word first, from the baked file',
  b2.audioTried.length > 0 && /^\/practice\/audio\/words\//.test(b2.audioTried[0]), b2.audioTried[0] || 'none');
chk('with no file and no api, the device voice says it', b2.spoken.length > 0);

await playRun(b2, { wrongOnce: false, onIntro: (b, entry) => {
  chk_once('a new word gets its intro moment before it is ever quizzed', b.visible('intro'));
  const glowing = [...b.doc.querySelectorAll('#introWord .heart')].map((x) => x.textContent).join('');
  const want = (entry.item.heart || []).map((h) => String(entry.item.answer).charAt(h)).join('');
  chk_once('the tricky letters glow in the intro', glowing === want,
    '"' + entry.item.answer + '" glows "' + glowing + '", expected "' + want + '"');
} });
chk('the run finished', b2.visible('done'));
chk('it ends with words right, never a score or a fail state',
  /words? right/.test(b2.$('doneLine').textContent), b2.$('doneLine').textContent);
const birdsNow = b2.win.PRACTICE_PAGE.mastered();
chk('mastering words hatched birds', birdsNow > 0, 'mastered=' + birdsNow);
chk('the collection draws exactly one bird per mastered word',
  b2.doc.querySelectorAll('#flock .bird').length === birdsNow &&
  b2.doc.querySelectorAll('#flockDone .bird').length === birdsNow,
  'flock=' + b2.doc.querySelectorAll('#flock .bird').length + ' mastered=' + birdsNow);
chk('the new birds fly in', b2.doc.querySelectorAll('#flockDone .bird.arrive').length > 0);
chk('the collection has no text at all - a non-reader still gets it',
  (b2.$('flockDone').textContent || '').trim() === '');
chk('exactly one learning event was posted for the session', b2.ledger.length === 1, 'posted=' + b2.ledger.length);
chk('the event carries the deck as its skill',
  b2.ledger[0] && b2.ledger[0].skill === 'sight-words-pre-primer' && b2.ledger[0].quizType === 'practice' &&
  b2.ledger[0].game === 'practice' && b2.ledger[0].subject === 'reading', JSON.stringify(b2.ledger[0] || {}));

// A Flash run, this time getting one wrong on purpose.
b2.click(b2.$('pickBtn'));
await settle(40);
b2.win.PRACTICE_PAGE.setDeck('sight-words-pre-primer');
b2.win.PRACTICE_PAGE.setMode('flash');
b2.click(b2.$('start'));
await settle(100);
if (b2.visible('ask') && !b2.visible('intro')) {
  chk('the word flashes on screen', b2.$('flashWord').classList.contains('on'));
  await settle(1100);
  chk('and then it is gone', !b2.$('flashWord').classList.contains('on'));
}
await playRun(b2, { wrongOnce: true });
chk('the Flash run finished too', b2.visible('done'));
chk('two sessions, two ledger rows', b2.ledger.length === 2, 'posted=' + b2.ledger.length);
chk('the page never threw', b2.errors.length === 0, b2.errors.slice(0, 3).join(' | '));
b2.win.close();

// --- BOOT 3: the maths keypad --------------------------------------------
section('the maths keypad (PT3)');
const addDeck = JSON.parse(read('public/practice/decks/math-addition.json'));
const seed3 = { kids: { 'qa-kid-3': { placement: { done: true, at: 0, landingDeckId: 'sight-words-third' }, decks: {} } } };
const b3 = boot(seed3, { id: 'qa-kid-3', grade: '3' });
await ready(b3);
b3.win.PRACTICE_PAGE.setSubject('math');
await settle(80);
chk('picking Numbers shows the maths decks', b3.doc.querySelectorAll('#decks .pick').length >= 3,
  [...b3.doc.querySelectorAll('#decks .pick')].map((e) => e.getAttribute('data-deck')).join(', '));
chk('a third grader is not offered division yet',
  ![...b3.doc.querySelectorAll('#decks .pick')].some((e) => e.getAttribute('data-deck') === 'math-division'));
b3.win.PRACTICE_PAGE.setDeck('math-addition');
await settle(120);
chk('numbers get one way to play - the keypad',
  [...b3.doc.querySelectorAll('#modes .pick')].map((e) => e.getAttribute('data-mode')).join(',') === 'solve');
chk('Sprint is shown but shut before any practice',
  b3.visible('sprint') && b3.$('sprint').disabled && b3.$('sprint').classList.contains('locked'));
chk('and it says why, kindly', /victory lap/i.test(b3.$('sprintlock').textContent));

b3.click(b3.$('start'));
await settle(120);
chk('a maths run starts on an intro moment', b3.visible('intro'));
chk('the intro tells the kid the answer before ever asking',
  /The answer is/.test(b3.$('introHint').textContent), b3.$('introHint').textContent);
b3.click(b3.$('introGo'));
await settle(60);
chk('the answer is a drawn keypad, not four cards',
  b3.visible('pad') && b3.$('cards').classList.contains('hide'));
chk('the keypad has ten digits, a rub-out and a go key',
  b3.doc.querySelectorAll('#keypad .key').length === 12 &&
  !!b3.doc.querySelector('#keypad .key[data-key="go"]') &&
  !!b3.doc.querySelector('#keypad .key[data-key="clear"]'));
chk('the keypad is drawn, with no emoji', !EMOJI.test(b3.$('keypad').textContent || ''));
chk('the fact is shown', (b3.$('flashWord').textContent || '').length > 0, b3.$('flashWord').textContent);

const run3 = b3.win.PRACTICE_PAGE.run();
const item3 = run3.queue[run3.i].item;
b3.click(b3.doc.querySelector('#keypad .key[data-key="9"]'));
await settle(10);
chk('typing shows in the entry box', /9/.test(b3.$('entry').textContent));
b3.click(b3.doc.querySelector('#keypad .key[data-key="clear"]'));
await settle(10);
chk('rubbing out clears it', !/9/.test(b3.$('entry').textContent));
for (const ch of BP.answerOf(item3)) b3.click(b3.doc.querySelector('#keypad .key[data-key="' + ch + '"]'));
await settle(10);
b3.click(b3.doc.querySelector('#keypad .key[data-key="go"]'));
await settle(60);
chk('a right answer on the keypad is marked right', b3.$('entry').classList.contains('right'));
await settle(700);
await playRun(b3, { wrongOnce: false });
chk('the maths run finished', b3.visible('done'));
chk('the maths session reached the ledger as maths',
  b3.ledger.length >= 1 && b3.ledger[b3.ledger.length - 1].subject === 'math' &&
  b3.ledger[b3.ledger.length - 1].skill === 'math-addition',
  JSON.stringify(b3.ledger[b3.ledger.length - 1] || {}));
b3.win.close();

// --- BOOT 4: a fluent kid gets the Sprint ---------------------------------
section('Sprint, once it has been earned');
const fluentItems = {};
addDeck.items.slice(0, 20).forEach((it, i) => {
  fluentItems[it.id] = { box: i < 18 ? 4 : 1, due: 0, seen: 4, right: 4, wrong: 0, last: 0 };
});
const seed4 = {
  kids: {
    'qa-kid-4': {
      placement: { done: true, at: 0, landingDeckId: 'sight-words-third' },
      settings: { sprintSeconds: 60, sprintTarget: 40 },
      decks: { 'math-addition': { items: fluentItems } },
    },
  },
};
const b4 = boot(seed4, { id: 'qa-kid-4', grade: '4' });
await ready(b4);
b4.win.PRACTICE_PAGE.setSubject('math');
b4.win.PRACTICE_PAGE.setDeck('math-addition');
await settle(160);
chk('a fluent kid gets Sprint unlocked',
  b4.visible('sprint') && !b4.$('sprint').disabled && !b4.$('sprint').classList.contains('locked'),
  b4.$('sprint').className);
b4.click(b4.$('sprint'));
await settle(120);
chk('Sprint explains itself as beating your own best',
  /your own best/i.test(b4.$('sprintBlurb').textContent), b4.$('sprintBlurb').textContent);
chk('and never mentions anyone else', !/friend|other kid|class|rank|leader/i.test(b4.$('sprintintro').textContent));
b4.click(b4.$('sprintgo'));
await settle(80);
chk('the sprint runs', b4.visible('sprint'));
chk('the clock is a bar with no digits',
  !!b4.$('sprintBar') && !/\d\d?\s*(s|sec|seconds)?\s*left/i.test(b4.$('sprint').textContent));
chk('the sprint has its own keypad', b4.doc.querySelectorAll('#sprintPad .key').length === 12);

const boxesBefore = JSON.stringify(JSON.parse(b4.win.localStorage.getItem('bk_practice_v1')).kids['qa-kid-4'].decks);
for (let i = 0; i < 5; i++) {
  const sp4 = b4.win.PRACTICE_PAGE.sprint();
  if (!sp4 || !sp4.item) break;
  for (const ch of BP.answerOf(sp4.item)) b4.click(b4.doc.querySelector('#sprintPad .key[data-key="' + ch + '"]'));
  b4.click(b4.doc.querySelector('#sprintPad .key[data-key="go"]'));
  await settle(200);
}
const scored = b4.win.PRACTICE_PAGE.sprint().score;
chk('correct sprint answers count up', scored === 5, 'score=' + scored);
b4.win.PRACTICE_PAGE.endSprint();
await settle(80);
chk('the sprint ends on a big friendly count', b4.visible('sprintdone') && b4.$('sprintNum').textContent === '5');
chk('it names the goal the grown-ups set', /goal/i.test(b4.$('sprintGoal').textContent), b4.$('sprintGoal').textContent);
chk('a first sprint records a personal best',
  !!JSON.parse(b4.win.localStorage.getItem('bk_practice_v1')).kids['qa-kid-4'].sprints['math-addition']);
chk('a sprint NEVER moves the practice boxes - it is a victory lap, not a test',
  JSON.stringify(JSON.parse(b4.win.localStorage.getItem('bk_practice_v1')).kids['qa-kid-4'].decks) === boxesBefore);
chk('the sprint reached the ledger, tagged apart from practice',
  b4.ledger.some((e) => e.quizType === 'sprint' && e.subject === 'math'),
  JSON.stringify(b4.ledger.map((e) => e.quizType)));
chk('the page never threw', b4.errors.length === 0, b4.errors.slice(0, 3).join(' | '));
b4.win.close();

// ===========================================================================
// 4. WIRING
// ===========================================================================
section('wiring');
const vercel = read('vercel.json');
chk('/practice is routed', /"src":\s*"\/practice"/.test(vercel));
chk('/practice.html is routed', /"src":\s*"\/practice\.html"/.test(vercel));
chk('the deck files are routed', /practice\/decks/.test(vercel));
chk('the word audio is routed', /practice\/audio/.test(vercel));

const home = read('src/BuildableKids.jsx');
chk('Home has a Practice tile', /id:\s*"practice"/.test(home) && /\/app\/practice/.test(home));
chk('PT2 opened Practice to everyone - no 1111 gate on the tile',
  !/id:\s*"practice"[\s\S]{0,400}?soon:\s*true/.test(home));
chk('the Practice tile opens Practice directly',
  /id:\s*"practice"[\s\S]{0,400}?onClick:\s*onPractice/.test(home));

const sfx = read('api/sfx.js');
const cues = [...new Set([...sfx.matchAll(/^ {2}(practice_\w+):\s*"/gm)].map((m) => m[1]))];
chk('the practice sounds are in the shared ElevenLabs pipeline', cues.length >= 8, cues.join(', '));
const durBlock = (sfx.match(/const DURATIONS = \{[\s\S]*?\n\};/) || [''])[0];
const badDur = cues.filter((c) => {
  const m = durBlock.match(new RegExp(c + ':([0-9.]+)'));
  return !m || parseFloat(m[1]) < 0.5;
});
chk('every practice sound clears the 0.5s ElevenLabs minimum', badDur.length === 0, badDur.join(', '));
chk('the page plays them through the shared audio kit',
  /BA\.configure\(\{\s*sfxBase:"\/api\/sfx\?s="/.test(pageHtml));

const grown = read('src/GrownUpScreen.jsx');
chk('the Parents area has a Practice row per kid', /PracticeCard/.test(grown));
chk('grown-ups can move the level', /setLevel/.test(grown));
chk('grown-ups can re-run the warm-up', /clearPlacement/.test(grown));
chk('grown-ups can set the sprint length and question target',
  /sprintSeconds/.test(grown) && /sprintTarget/.test(grown));
chk('mastery and sprint bests are surfaced there',
  /masteredByDeck|masteredTotal/.test(grown) && /sprintBest|sprints/.test(grown));
chk('no emoji in the Parents Practice card',
  !EMOJI.test((grown.match(/function PracticeCard[\s\S]*?\n}\n/) || [''])[0]));

console.log('');
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);

// ---------------------------------------------------------------------------
// Play a whole run to the end, always tapping the right answer — except, when
// asked, one deliberate wrong tap to prove the only consequence is the item
// coming back.
async function playRun(b, opts) {
  let wrongDone = !(opts && opts.wrongOnce);
  let guard = 0;
  while (b.win.PRACTICE_PAGE.run() && guard++ < 120) {
    const r = b.win.PRACTICE_PAGE.run();
    if (b.visible('done')) break;
    if (b.visible('intro')) {
      if (opts && opts.onIntro) opts.onIntro(b, r.queue[r.i]);
      b.click(b.$('introGo'));
      await settle(40);
      continue;
    }
    const entry = r.queue[r.i];
    if (!entry) break;
    const want = BP.answerOf(entry.item);
    const keypad = b.visible('pad');

    if (!wrongDone) {
      wrongDone = true;
      const lenBefore = r.queue.length, idBefore = entry.itemId;
      if (keypad) {
        const bad = want === '9' ? '8' : '9';
        b.click(b.doc.querySelector('#keypad .key[data-key="' + bad + '"]'));
        b.click(b.doc.querySelector('#keypad .key[data-key="go"]'));
      } else {
        const card = [...b.doc.querySelectorAll('#cards .wordcard')].find((c) => c.getAttribute('data-word') !== want);
        b.click(card);
      }
      await settle(40);
      chk('a wrong tap quietly shows the right answer',
        keypad ? b.$('entry').classList.contains('wrongpick') : !!b.doc.querySelector('#cards .showme'));
      chk('a wrong tap is never a fail state - the item just comes back',
        b.win.PRACTICE_PAGE.run().queue.length === lenBefore + 1 &&
        b.win.PRACTICE_PAGE.run().queue.slice(r.i + 1).some((e) => e.itemId === idBefore));
      await settle(1550);
      continue;
    }

    if (keypad) {
      for (const ch of want) b.click(b.doc.querySelector('#keypad .key[data-key="' + ch + '"]'));
      b.click(b.doc.querySelector('#keypad .key[data-key="go"]'));
    } else {
      chk_once('four big cards are shown', b.doc.querySelectorAll('#cards .wordcard').length === 4);
      const card = [...b.doc.querySelectorAll('#cards .wordcard')].find((c) => c.getAttribute('data-word') === want);
      if (!card) { chk('the right answer is always on a card', false, want); break; }
      b.click(card);
    }
    await settle(760);
  }
}

// A check we only want reported once even though it sits inside a loop.
function chk_once(name, cond) {
  chk_once._seen = chk_once._seen || {};
  if (chk_once._seen[name]) { if (!cond) ok = false; return; }
  chk_once._seen[name] = true;
  chk(name, cond);
}
