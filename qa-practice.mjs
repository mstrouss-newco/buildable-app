// qa-practice.mjs — the harness for the shared practice engine and the sight
// word decks it ships on (Session PT1).
//
// Three parts, all required, all in-process (jsdom, already a devDependency —
// no Playwright, no network):
//
//   1. BOX MATH        the Leitner rules in public/buildable-practice.js, loaded
//                      into a real jsdom window so localStorage and the browser
//                      globals are the real ones a kid's iPad would use.
//   2. DECK DATA       the five Dolch lists: exact counts (40/52/41/46/41 = 220),
//                      unique ids, heart-letter indices that actually land on a
//                      letter, index.json agreeing with the files.
//   3. PAGE LOAD       public/practice.html booted headless in jsdom with its
//                      real scripts running, then a whole Find It run and a
//                      whole Flash run played to the end, asserting what a kid
//                      would actually see — plus the no-emoji guardrail.
//
//   node qa-practice.mjs
import fs from 'fs';
import path from 'path';
import jsdomPkg from 'jsdom';
const { JSDOM, VirtualConsole } = jsdomPkg;

const dir = process.argv[2] || '.';
const P = (p) => path.join(dir, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const section = (t) => console.log('\n--- ' + t + ' ---');

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

// right AND fast moves it up. Everything else moves it down.
chk('right + fast  -> up a box',   BP.nextBox(2, true, 1200) === 3);
chk('right + slow  -> down a box', BP.nextBox(2, true, 4200) === 1);
chk('right on the 3000ms line counts as slow', BP.nextBox(2, true, 3000) === 1);
chk('right at 2999ms counts as fast', BP.nextBox(2, true, 2999) === 3);
chk('wrong + fast  -> down a box',  BP.nextBox(2, false, 900) === 1);
chk('wrong + slow  -> down a box',  BP.nextBox(2, false, 9000) === 1);
chk('box 5 is the ceiling', BP.nextBox(5, true, 500) === 5);
chk('box 1 is the floor',   BP.nextBox(1, false, 9000) === 1);
chk('a missing time counts as slow', BP.nextBox(3, true, undefined) === 2);

// Higher box = longer wait. Box 1 always comes back in the same session.
const DAY = 86400000;
chk('box 1 is due right away', BP.dueAt(1, 0) === 0);
const waits = [1, 2, 3, 4, 5].map((b) => BP.dueAt(b, 0) / DAY);
chk('the wait grows with every box', waits.every((w, i) => i === 0 || w > waits[i - 1]),
  waits.map((w, i) => 'box' + (i + 1) + '=' + w + 'd').join(' '));

// applyAnswer keeps the tallies and reschedules.
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

// A kid who has never practised: only the new-item allowance may come through.
let built = BP.buildSession(fakeDeck, { items: {} }, { now: 0 });
chk('a first-ever session is all new words, capped at 3', built.plan.length === 3 && built.newCount === 3,
  'plan=' + built.plan.length);
chk('every new word is flagged for its intro moment', built.plan.every((e) => e.intro === true));

// A kid with plenty due: 20 items, at most 3 of them new.
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

// Most overdue first: the shakiest words lead.
const overdue = { items: {} };
overdue.items.w0 = { box: 3, due: 5 * DAY, seen: 4, right: 4, wrong: 0, last: 0 };
overdue.items.w1 = { box: 1, due: 1 * DAY, seen: 4, right: 1, wrong: 3, last: 0 };
overdue.items.w2 = { box: 2, due: 3 * DAY, seen: 4, right: 2, wrong: 2, last: 0 };
built = BP.buildSession(fakeDeck, overdue, { now: 9 * DAY, maxNew: 0 });
chk('the most overdue word comes first', built.plan[0].itemId === 'w1',
  built.plan.slice(0, 3).map((e) => e.itemId).join(' -> '));

// A deck too small to fill 20 does not hand back a three-card anticlimax:
// resting words pad it out, lowest box first.
const small = { id: 'small', items: [] };
for (let i = 0; i < 25; i++) small.items.push({ id: 's' + i, prompt: 's' + i, answer: 's' + i });
const rested = { items: {} };
for (let i = 0; i < 25; i++) rested.items['s' + i] = { box: 4, due: 99 * DAY, seen: 5, right: 5, wrong: 0, last: 0 };
built = BP.buildSession(small, rested, { now: 0 });
chk('a deck with nothing due still fills a session', built.plan.length === 20, 'plan=' + built.plan.length);
chk('and adds no new words when there are none left', built.newCount === 0);

// --- wrong answers are never punished, they just come back sooner ---
section('a miss only comes back sooner');
const queue = built.plan.slice();
const beforeLen = queue.length;
const missed = queue[2];
BP.requeue(queue, 2, missed);
chk('a missed word is put back into the run', queue.length === beforeLen + 1);
const backAt = queue.findIndex((e, i) => i > 2 && e.itemId === missed.itemId);
chk('it comes back later, not immediately', backAt > 3, 'returns at index ' + backAt);
chk('it comes back without an intro moment', queue[backAt].intro === false);
chk('the engine has no lives, score or fail state',
  !/\blives\b|\bscore\b|gameOver|\bfail\b/i.test(read('public/buildable-practice.js').replace(/^\s*\/\/.*$/gm, '')));

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
chk('the engine is subject-agnostic (no sight-word or maths special cases)',
  !/sight|dolch|word|addition|subtract|multipl|divi/i.test(
    read('public/buildable-practice.js').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

// ===========================================================================
// 2. DECK DATA
// ===========================================================================
section('the five Dolch lists');

const EXPECTED = [
  ['sight-words-pre-primer', 40],
  ['sight-words-primer', 52],
  ['sight-words-first', 41],
  ['sight-words-second', 46],
  ['sight-words-third', 41],
];
const index = JSON.parse(read('public/practice/decks/index.json'));
chk('index.json lists all five decks', (index.decks || []).length === 5, 'got ' + (index.decks || []).length);

let grand = 0;
const allIds = new Set();
for (const [id, count] of EXPECTED) {
  const deck = JSON.parse(read('public/practice/decks/' + id + '.json'));
  chk(id + ' has exactly ' + count + ' words', deck.items.length === count, 'got ' + deck.items.length);
  grand += deck.items.length;

  const ids = deck.items.map((i) => i.id);
  chk(id + ' ids are unique', new Set(ids).size === ids.length);
  chk(id + ' is tagged for the ledger',
    deck.subject === 'reading' && !!deck.skill && !!deck.grade, JSON.stringify({ subject: deck.subject, skill: deck.skill, grade: deck.grade }));

  const badHeart = deck.items.filter((i) => (i.heart || []).some((h) => h < 0 || h >= String(i.answer).length));
  chk(id + ' every glowing letter lands on a real letter', badHeart.length === 0,
    badHeart.map((i) => i.answer).join(','));

  const noAudio = deck.items.filter((i) => !i.audio || !/^[a-z]+\.mp3$/.test(i.audio));
  chk(id + ' every word names a safe audio file', noAudio.length === 0, noAudio.map((i) => i.answer).join(','));

  chk(id + ' has no emoji', !EMOJI.test(JSON.stringify(deck)));

  const meta = (index.decks || []).find((d) => d.id === id);
  chk(id + ' matches its index entry',
    !!meta && meta.count === deck.items.length && meta.file === '/practice/decks/' + id + '.json');

  deck.items.forEach((i) => allIds.add(i.answer.toLowerCase()));
}
chk('220 Dolch sight words in total', grand === 220, 'got ' + grand);
chk('the words themselves are all different across the five lists', allIds.size === 220, 'unique=' + allIds.size);

// Enough words in every deck to draw three distractors for any card.
for (const [id] of EXPECTED) {
  const deck = JSON.parse(read('public/practice/decks/' + id + '.json'));
  const c = BP.choices(deck, deck.items[0], { count: 4 });
  if (c.length !== 4) { chk(id + ' can fill four cards', false); }
}
chk('every deck can fill four cards', true);

// At least some words carry heart letters — otherwise the intro moment is a lie.
const pp = JSON.parse(read('public/practice/decks/sight-words-pre-primer.json'));
chk('tricky words carry their heart letters',
  pp.items.filter((i) => (i.heart || []).length).length >= 10,
  pp.items.filter((i) => (i.heart || []).length).length + ' of ' + pp.items.length + ' in the first list');
const said = pp.items.find((i) => i.answer === 'said');
chk('"said" glows on its ai', !!said && JSON.stringify(said.heart) === '[1,2]', JSON.stringify(said && said.heart));

// ===========================================================================
// 3. THE PAGE, LOADED HEADLESS
// ===========================================================================
section('practice.html, booted headless');

const pageHtml = read('public/practice.html');
chk('no emoji in practice.html', !EMOJI.test(pageHtml));
chk('no emoji in buildable-practice.js', !EMOJI.test(read('public/buildable-practice.js')));
chk('the page loads the shared engine', /src="\/buildable-practice\.js"/.test(pageHtml));
// Strip the CSS/JS comments first: the page explains at length that it has no
// timer, and that prose must not be what trips (or passes) the check.
const pageCode = pageHtml.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
chk('the page shows no timer or countdown to a kid',
  !/countdown|id="timer"|seconds left|time left|setInterval/i.test(pageCode));
chk('the page never renders the measured milliseconds',
  !/textContent\s*=\s*[^;]*\bms\b|innerHTML\s*=\s*[^;]*\bms\b/.test(pageCode));
chk('the page posts one session to the learning ledger',
  /\/api\/log-learning-event/.test(pageHtml) && /kind:"skill"/.test(pageHtml));
chk('word audio falls back to the device voice',
  /speechSynthesis/.test(pageHtml) && /\/api\/say/.test(pageHtml));

// --- boot it for real ---
// jsdom will not go and fetch /buildable-practice.js (and must never reach the
// network for a webfont), so the engine is inlined in place of its own script
// tag: identical code, identical order. The tag itself is asserted above.
const bootHtml = pageHtml.replace(
  '<script src="/buildable-practice.js"></script>',
  '<script>' + read('public/buildable-practice.js') + '</script>');
chk('the engine was inlined for the boot', bootHtml !== pageHtml);
const vc = new VirtualConsole();
const pageErrors = [];
vc.on('jsdomError', (e) => {
  // jsdom has no layout, so scrollTo/media playback are "not implemented".
  // Those are jsdom's gaps, not the page's bugs.
  if (/not implemented/i.test(e.message || '')) return;
  pageErrors.push(String(e.message || e).slice(0, 200));
});
vc.on('error', (m) => pageErrors.push(String(m).slice(0, 200)));

// The page's three outside-world touchpoints, stubbed BEFORE its scripts run:
// file reads (fetch), audio playback, and the device voice. Nothing else is
// faked — no network, no Playwright.
const spoken = [];
const audioTried = [];
const ledger = [];
function installStubs(win) {
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
  // Every Audio() the page makes fails, exactly as it would before the mp3
  // files are baked — which forces the fallback ladder down to the voice.
  win.Audio = function (src) {
    audioTried.push(src);
    const listeners = {};
    return {
      addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
      removeEventListener: () => {},
      play: () => Promise.reject(new Error('no audio in jsdom')),
      pause: () => {},
      set currentTime(v) {}, get currentTime() { return 0; },
    };
  };
  win.SpeechSynthesisUtterance = function (t) { this.text = t; };
  win.speechSynthesis = { speak: (u) => spoken.push(u.text), cancel: () => {} };
  // jsdom has no layout, so scrollTo is "not implemented" and would spray the
  // console. The page only ever uses it to put a new card at the top.
  win.scrollTo = () => {};
}

const dom = new JSDOM(bootHtml, {
  url: 'https://qa.local/practice',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse: installStubs,
});
const win = dom.window;

await new Promise((r) => win.addEventListener('load', r, { once: true }));
// The page boots from two fetches; give the microtasks a beat to land.
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await settle(60);

const doc = win.document;
chk('the page booted with no script errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
chk('it read the deck index', win.PRACTICE_READY === true);

const deckBtns = [...doc.querySelectorAll('#decks .pick')];
chk('all five word sets are offered', deckBtns.length === 5, 'got ' + deckBtns.length);
const modeBtns = [...doc.querySelectorAll('#modes .pick')];
chk('both ways to play are offered', modeBtns.length === 2,
  modeBtns.map((b) => b.getAttribute('data-mode')).join(', '));
chk('Find It and Flash are the two modes',
  modeBtns.map((b) => b.getAttribute('data-mode')).sort().join(',') === 'find,flash');
chk('every tap target on the picker is a real button',
  deckBtns.concat(modeBtns).every((b) => b.tagName === 'BUTTON'));
chk('no emoji reached the rendered page', !EMOJI.test(doc.body.textContent || ''));

// --- play a whole Find It run, always tapping the right card ---
const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
win.PRACTICE_PAGE.setDeck('sight-words-pre-primer');
win.PRACTICE_PAGE.setMode('find');
click(doc.getElementById('start'));
await settle(60);

let run = win.PRACTICE_PAGE.run();
chk('a run starts', !!run, run ? 'queue=' + run.queue.length : 'no run');
chk('a first-ever run is the three new words', run && run.queue.length === 3, run && String(run.queue.length));
chk('it opens on the intro moment for a new word', !doc.getElementById('intro').classList.contains('hide'));
chk('the new word is shown big', (doc.getElementById('introWord').textContent || '').length > 0,
  doc.getElementById('introWord').textContent);
chk('audio was asked for the word first, from the baked file',
  audioTried.length > 0 && /^\/practice\/audio\/words\//.test(audioTried[0]), audioTried[0] || 'none');
chk('with no file and no api, the device voice says it', spoken.length > 0, spoken.join(','));

// The heart-word method: the tricky letters glow, and only those.
const introFor = run.queue[0].item;
const glowing = [...doc.querySelectorAll('#introWord .heart')].map((s) => s.textContent).join('');
const expectGlow = (introFor.heart || []).map((h) => String(introFor.answer).charAt(h)).join('');
chk('the tricky letters glow in the intro', glowing === expectGlow,
  '"' + introFor.answer + '" glows "' + glowing + '", expected "' + expectGlow + '"');

// Play it out. Never taps a wrong card, so the run should be exactly 3 cards.
let guard = 0;
while (win.PRACTICE_PAGE.run() && guard++ < 60) {
  const r = win.PRACTICE_PAGE.run();
  if (!doc.getElementById('done').classList.contains('hide')) break;
  if (!doc.getElementById('intro').classList.contains('hide')) { click(doc.getElementById('introGo')); await settle(20); continue; }
  const want = BP.answerOf(r.queue[r.i].item);
  const card = [...doc.querySelectorAll('#cards .wordcard')].find((c) => c.getAttribute('data-word') === want);
  if (!card) { chk('the right word is always on a card', false, want); break; }
  chk_once('four big cards are shown', doc.querySelectorAll('#cards .wordcard').length === 4);
  click(card);
  await settle(20);
  // the page waits before advancing, so let its timer run
  await settle(700);
}
chk('the run finished', !doc.getElementById('done').classList.contains('hide'));
chk('it ends with words right, never a score or a fail state',
  /words? right/.test(doc.getElementById('doneLine').textContent || ''),
  doc.getElementById('doneLine').textContent);
chk('every right-and-fast word moved up a box',
  (doc.getElementById('doneNum').textContent || '') === '3', doc.getElementById('doneNum').textContent);

const savedRaw = win.localStorage.getItem('bk_practice_v1');
chk('the run was saved under bk_practice_v1', !!savedRaw);
const saved = JSON.parse(savedRaw || '{}');
const guestDeck = ((saved.kids || {}).guest || { decks: {} }).decks['sight-words-pre-primer'];
chk('three words now have a box', guestDeck && Object.keys(guestDeck.items).length === 3,
  guestDeck ? Object.keys(guestDeck.items).join(',') : 'none');

chk('exactly one learning event was posted for the session', ledger.length === 1, 'posted=' + ledger.length);
chk('the event carries the deck as its skill',
  ledger[0] && ledger[0].skill === 'sight-words-pre-primer' && ledger[0].quizType === 'practice' &&
  ledger[0].game === 'practice' && ledger[0].subject === 'reading', JSON.stringify(ledger[0] || {}));

// --- and a Flash run, this time getting one wrong on purpose ---
click(doc.getElementById('pickBtn'));
await settle(20);
win.PRACTICE_PAGE.setDeck('sight-words-pre-primer');
win.PRACTICE_PAGE.setMode('flash');
click(doc.getElementById('start'));
await settle(60);
run = win.PRACTICE_PAGE.run();
chk('a second run mixes reviews with new words', !!run && run.queue.length > 3,
  run ? 'queue=' + run.queue.length : 'no run');

// Flash shows the word, then hides it. Both states must be reachable.
if (doc.getElementById('intro').classList.contains('hide')) {
  chk('the word flashes on screen', doc.getElementById('flashWord').classList.contains('on'));
  await settle(1100);
  chk('and then it is gone', !doc.getElementById('flashWord').classList.contains('on'));
}

// Tap a wrong card once and prove the only consequence is that it comes back.
let wrongDone = false, wrongGuard = 0;
while (win.PRACTICE_PAGE.run() && wrongGuard++ < 90) {
  const r = win.PRACTICE_PAGE.run();
  if (!doc.getElementById('done').classList.contains('hide')) break;
  if (!doc.getElementById('intro').classList.contains('hide')) { click(doc.getElementById('introGo')); await settle(1200); continue; }
  const want = BP.answerOf(r.queue[r.i].item);
  const cards = [...doc.querySelectorAll('#cards .wordcard')];
  let target;
  if (!wrongDone) {
    target = cards.find((c) => c.getAttribute('data-word') !== want);
    const lenBefore = r.queue.length;
    const idBefore = r.queue[r.i].itemId;
    click(target);
    await settle(20);
    chk('a wrong tap quietly shows the right word', !!doc.querySelector('#cards .showme'));
    chk('a wrong tap is never a fail state — the word just comes back',
      win.PRACTICE_PAGE.run().queue.length === lenBefore + 1 &&
      win.PRACTICE_PAGE.run().queue.slice(r.i + 1).some((e) => e.itemId === idBefore));
    wrongDone = true;
    await settle(1400);
    continue;
  }
  target = cards.find((c) => c.getAttribute('data-word') === want);
  if (!target) { chk('the right word is always on a card', false, want); break; }
  click(target);
  await settle(720);
}
chk('the Flash run finished too', !doc.getElementById('done').classList.contains('hide'));
chk('two sessions, two ledger rows', ledger.length === 2, 'posted=' + ledger.length);
chk('the page never threw', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// ===========================================================================
section('wiring');
const vercel = read('vercel.json');
chk('/practice is routed', /"src":\s*"\/practice"/.test(vercel));
chk('/practice.html is routed', /"src":\s*"\/practice\.html"/.test(vercel));
chk('the deck files are routed', /practice\/decks/.test(vercel));
chk('the word audio is routed', /practice\/audio/.test(vercel));
const home = read('src/BuildableKids.jsx');
chk('Home has a Practice tile in Learn', /id:\s*"practice"/.test(home) && /\/practice/.test(home));
chk('the Practice tile is behind the 1111 coming-soon gate until PT2',
  /practice[\s\S]{0,400}?soon:\s*true/.test(home));

console.log('');
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);

// A check we only want reported once even though it sits inside a loop.
function chk_once(name, cond) {
  if (chk_once._seen && chk_once._seen[name]) { if (!cond) ok = false; return; }
  chk_once._seen = chk_once._seen || {};
  chk_once._seen[name] = true;
  chk(name, cond);
}
