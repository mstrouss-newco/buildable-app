// Headless QA for Practice — public/buildable-practice.js, public/practice.html,
// public/practice/decks/*.json  (Session PT1).
//
// Practice has no game loop to sim, so this harness proves what can be checked
// deterministically:
//
//   1) the five Dolch decks are the real lists, at the real lengths, and every
//      by-heart part is actually inside its word
//   2) the BOX MATHS, exercised in jsdom against the shipped engine: right AND
//      fast climbs, wrong OR slow drops, box 1 and box 5 are the walls
//   3) a sitting is about 20 turns, takes at most 3 NEW items, mixes them in
//      rather than stacking them, and a missed word comes back SOONER
//   4) per-kid state really lands in localStorage under bk_practice_v1
//   5) the page loads headless and a whole sitting can be played end to end,
//      posting exactly ONE learning event when it finishes
//   6) no emojis anywhere, and no timer or countdown is ever drawn
//   7) vercel.json routes the page, the engine, the decks and the audio
//   8) Practice sits in the Learn section behind the 1111 owner gate (PT2 opens it)
//
//   node qa-practice.mjs .
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(dir, f));

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000, step = 25) {
  const until = Date.now() + ms;
  while (Date.now() < until) { let v; try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(step); }
  return null;
}

// ------------------------------------------------------------------ 1) decks
console.log('--- THE DECKS: /practice/decks ---');
const DECK_DIR = 'public/practice/decks';
chk('deck index ships', exists(DECK_DIR + '/index.json'));

// The Dolch lists, at their published lengths. These numbers are the card's.
const EXPECT = {
  'dolch-pre-primer': 40, 'dolch-primer': 52, 'dolch-first': 41,
  'dolch-second': 46, 'dolch-third': 41,
};
let INDEX = null, DECKS = {};
try { INDEX = JSON.parse(read(DECK_DIR + '/index.json')); } catch (e) { chk('index.json parses', false, String(e.message)); }

if (INDEX) {
  chk('index lists the five sight word steps', Array.isArray(INDEX.decks) && INDEX.decks.length === 5,
    String(INDEX.decks && INDEX.decks.length));
  for (const d of INDEX.decks || []) {
    let deck = null;
    try { deck = JSON.parse(read(DECK_DIR + '/' + d.file)); } catch (e) {}
    chk('deck file ships and parses: ' + d.id, !!deck);
    if (!deck) continue;
    DECKS[d.id] = deck;
    chk('  ' + d.id + ' is the right length', deck.items.length === EXPECT[d.id],
      `${deck.items.length}, expected ${EXPECT[d.id]}`);
    chk('  ' + d.id + ' index count matches the file', d.count === deck.items.length);
    chk('  ' + d.id + ' is subject-tagged so the engine stays subject-agnostic',
      deck.subject === 'words' && !!deck.skill, `${deck.subject}/${deck.skill}`);
    chk('  ' + d.id + ' offers both modes', Array.isArray(deck.modes) && deck.modes.indexOf('find') !== -1 && deck.modes.indexOf('flash') !== -1);

    const badHeart = deck.items.filter((it) => it.heart && it.word.indexOf(it.heart) === -1);
    chk('  ' + d.id + ' every by-heart part is really inside its word', badHeart.length === 0,
      badHeart.map((x) => x.word + '/' + x.heart).join(' '));
    const dupes = deck.items.map((i) => i.id).filter((v, i, a) => a.indexOf(v) !== i);
    chk('  ' + d.id + ' item ids are unique', dupes.length === 0, dupes.join(' '));
    const noWord = deck.items.filter((i) => !i.word || !i.id);
    chk('  ' + d.id + ' every item has an id and a word', noWord.length === 0);
  }
  const all = Object.values(DECKS).flatMap((d) => d.items.map((i) => i.id));
  chk('every item id is unique ACROSS decks (one box store, one key space)',
    new Set(all).size === all.length, `${all.length} items, ${new Set(all).size} unique`);
  chk('220 Dolch sight words in total', all.length === 220, String(all.length));
  const hearts = Object.values(DECKS).flatMap((d) => d.items.filter((i) => i.heart));
  chk('the tricky words carry a by-heart part to glow', hearts.length >= 60, String(hearts.length) + ' heart words');
}

// ------------------------------------------------- 2) the box maths, in jsdom
console.log('\n--- THE BOX MATHS (jsdom, against the shipped engine) ---');
const engineSrc = read('public/buildable-practice.js');
function freshWindow() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://buildablekids.com/practice', runScripts: 'outside-only' });
  dom.window.eval(engineSrc);
  return dom.window;
}
const W = freshWindow();
const P = W.BuildablePractice;
chk('the engine lands on window as BuildablePractice', !!P);

if (P) {
  chk('fast means under 3000ms, and it is the engine that says so', P.FAST_MS === 3000, String(P.FAST_MS));
  chk('boxes run 1 to 5', P.MIN_BOX === 1 && P.MAX_BOX === 5);
  chk('a sitting is about 20 turns', P.SESSION_TURNS === 20, String(P.SESSION_TURNS));
  chk('at most 3 new items', P.MAX_NEW === 3, String(P.MAX_NEW));

  chk('right AND fast moves it UP', P.grade(2, true, 900).box === 3);
  chk('right but SLOW moves it down', P.grade(2, true, 3200).box === 1, 'box ' + P.grade(2, true, 3200).box);
  chk('wrong moves it down even when it was quick', P.grade(2, false, 100).box === 1);
  chk('wrong and slow moves it down', P.grade(2, false, 9000).box === 1);
  chk('exactly 3000ms is NOT fast (the boundary is under)', P.grade(2, true, 3000).box === 1);
  chk('box 1 is the floor - a wrong answer can never go below it', P.grade(1, false, 100).box === 1);
  chk('box 5 is the ceiling', P.grade(5, true, 100).box === 5);
  chk('climbing INTO box 5 is what counts as newly mastered',
    P.grade(4, true, 100).justMastered === true && P.grade(5, true, 100).justMastered === false);
  chk('a wrong answer never returns a score, a life or a fail',
    Object.keys(P.grade(2, false, 100)).every((k) => ['box','was','up','down','fast','mastered','justMastered'].indexOf(k) !== -1),
    Object.keys(P.grade(2, false, 100)).join(','));

  // box 1 is due immediately, so a shaky word comes back in the SAME sitting
  const now = 1700000000000;
  chk('a box 1 word is due straight away (it comes back this sitting)', P.dueAt(1, now) === now);
  chk('a mastered word rests the longest', P.dueAt(5, now) > P.dueAt(4, now) && P.dueAt(4, now) > P.dueAt(2, now));

  // new items are MIXED IN, never stacked at the front
  const R = (n) => Array.from({ length: n }, (_, i) => ({ item: { id: 'r' + i } }));
  const F = (n) => Array.from({ length: n }, (_, i) => ({ item: { id: 'n' + i } }));
  const mixed = P.mixIn(R(10), F(3)).map((x) => x.item.id);
  chk('new items are mixed through the sitting, not stacked at the front',
    mixed[0].charAt(0) === 'r' && mixed.filter((x) => x.charAt(0) === 'n').length === 3, mixed.join(' '));
  chk('with nothing due yet, the new words ARE the sitting', P.mixIn(R(0), F(3)).length === 3);
}

// ------------------------------------------------------- 3) a whole sitting
console.log('\n--- A SITTING ---');
if (P && DECKS['dolch-pre-primer']) {
  const deck = DECKS['dolch-pre-primer'];

  // a brand new kid: no reviews exist, so the sitting is the 3 new words
  const s1 = P.session({ kidId: 'qa-new', deck, now: 1700000000000 });
  chk('a brand new kid gets at most 3 new words', s1.newIds.length === 3, s1.newIds.join(' '));
  chk('a tiny working set is not drilled to death', s1.turns <= 9 && s1.turns >= 3, 'turns ' + s1.turns);
  const first = s1.next();
  chk('a word the kid has never met needs its intro FIRST', first && first.isNew && first.needsIntro);
  s1.markIntro(first.item.id);
  chk('the intro moment only happens once', s1.next().needsIntro === false);

  // a wrong answer brings the word back SOONER, and never ends the sitting
  const before = s1.upcoming().length;
  s1.answer(first.item.id, false, 500);
  chk('a missed word comes straight back into the queue', s1.upcoming().indexOf(first.item.id) !== -1,
    s1.upcoming().join(' '));
  chk('a missed word does not shorten the sitting', s1.upcoming().length >= before - 1);
  chk('a missed word drops a box but never below 1',
    P.store('qa-new').get(first.item.id).box === 1);

  // play a sitting out: it ends, and it ends at about the number of turns it promised
  let guard = 0;
  while (s1.next() && guard++ < 200) { const t = s1.next(); s1.answer(t.item.id, true, 100); }
  chk('the sitting ends by itself', s1.next() === null);
  chk('it ran the turns it promised', s1.done === s1.turns, s1.done + '/' + s1.turns);
  const sum = s1.close();
  chk('the summary carries what the ledger needs, and no score out of ten',
    sum.subject === 'words' && sum.skill === 'sight-words' && typeof sum.asked === 'number' && sum.progress.total === 40,
    JSON.stringify({ subject: sum.subject, skill: sum.skill, asked: sum.asked, total: sum.progress.total }));

  // a full deck's worth of state, and a kid who has reviews waiting
  const st = P.store('qa-review');
  const now2 = 1700000000000;
  for (let i = 0; i < 25; i++) st.put(deck.items[i].id, { box: 2, due: now2 - 1000, seen: 3, right: 2, intro: true, ts: 0 });
  st.save();
  const s2 = P.session({ kidId: 'qa-review', deck, now: now2 });
  chk('with reviews waiting, a sitting is about 20 turns', s2.turns === 20, String(s2.turns));
  chk('still at most 3 new words, however many are waiting', s2.newIds.length === 3, String(s2.newIds.length));
  chk('due reviews fill the rest of the sitting', s2.upcoming().length === 20, String(s2.upcoming().length));

  // getting a word to box 5 masters it
  const st3 = P.store('qa-master');
  st3.put(deck.items[0].id, { box: 4, due: 0, seen: 9, right: 8, intro: true, ts: 0 });
  st3.save();
  const s3 = P.session({ kidId: 'qa-master', deck, now: now2 });
  const r3 = s3.answer(deck.items[0].id, true, 400);
  chk('a fourth-box word answered right and fast is mastered', r3.mastered && r3.justMastered);
  chk('mastery is remembered for the kid', P.store('qa-master').get(deck.items[0].id).box === 5);
  chk('progress counts what is known by heart', P.store('qa-master').progress(deck).mastered === 1);

  // ------------------------------------------------------ 4) where state lives
  const raw = W.localStorage.getItem('bk_practice_v1');
  chk('per-kid state lives in localStorage under bk_practice_v1', !!raw);
  const parsed = raw ? JSON.parse(raw) : {};
  chk('state is keyed by kid id, so two kids on one iPad never share boxes',
    !!(parsed.kids && parsed.kids['qa-new'] && parsed.kids['qa-master'] && parsed.kids['qa-review']),
    Object.keys(parsed.kids || {}).join(' '));
  chk('one kid mastering a word does not touch another kid',
    (parsed.kids['qa-new'].items[deck.items[0].id] || {}).b !== 5);
}

// ------------------------------------------- 5) the page, loaded and played
console.log('\n--- THE PAGE, PLAYED HEADLESS ---');
const pageSrc = read('public/practice.html');
let ledger = [];
{
  const dom = new JSDOM(pageSrc, {
    url: 'https://buildablekids.com/practice',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      // the engine normally arrives as its own <script src>; jsdom does not
      // fetch subresources, so hand it over directly
      win.eval(engineSrc);
      win.Audio = function () {
        this.preload = ''; this.play = () => Promise.resolve(); this.pause = () => {};
        this.load = () => {}; this.addEventListener = () => {};
      };
      win.fetch = (url, opts) => {
        const u = String(url);
        if (u.indexOf('/api/log-learning-event') === 0) {
          ledger.push(JSON.parse((opts && opts.body) || '{}'));
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        if (u.indexOf('/practice/decks/') === 0) {
          const f = path.join(dir, 'public', u.split('?')[0]);
          if (!fs.existsSync(f)) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
          const body = JSON.parse(fs.readFileSync(f, 'utf8'));
          return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      };
    },
  });
  const win = dom.window, doc = win.document;

  // NB: body.textContent in jsdom includes the inline <script> source, so read
  // <main> — the screen the kid actually sees.
  const screen = () => doc.querySelector('main').textContent;
  const rows = await waitFor(() => { const n = doc.querySelectorAll('[data-deck]'); return n.length ? n : null; });
  chk('the page loads and shows every step of words', !!rows && rows.length === 5, rows ? String(rows.length) : 'none');
  chk('the picker says how many are known by heart, not a mark',
    /known by heart/.test(screen()) && !/score|out of 10|points/i.test(screen()), screen().slice(0, 90));

  if (rows) {
    // step 2 (dolch-primer) is played rather than step 1 because its first new
    // words include by-heart words, which is what proves the glow
    rows[1].click();
    const modes = await waitFor(() => { const n = doc.querySelectorAll('[data-mode]'); return n.length ? n : null; });
    chk('picking a step offers both ways to practise', !!modes && modes.length === 2, modes ? String(modes.length) : 'none');

    if (modes) {
      modes[0].click();   // Hear it
      const intro = await waitFor(() => (doc.querySelector('#got') ? doc.querySelector('.word') : null));
      chk('a word the kid has never met gets its intro moment first', !!intro);
      chk('the intro shows the word big and says it out loud', !!doc.querySelector('.say'));

      // find an intro whose word has a by-heart part, and prove it glows
      let glowed = !!doc.querySelector('.word .heart');
      let turns = 0, saw4 = false, guard = 0;
      while (guard++ < 60) {
        const got = doc.querySelector('#got');
        if (got) { got.click(); await sleep(60); glowed = glowed || !!doc.querySelector('.word .heart'); continue; }
        const picks = doc.querySelectorAll('.pick');
        if (picks.length) {
          if (picks.length === 4) saw4 = true;
          picks[0].click(); turns++;
          await sleep(60);
          // the page waits before moving on; give it room
          await waitFor(() => doc.querySelector('#got') || doc.querySelector('#again') ||
            (doc.querySelector('.picks') && !doc.querySelector('.picks.locked')), 2500);
          continue;
        }
        if (doc.querySelector('#again')) break;
        await sleep(60);
      }
      chk('every question offers four big word cards', saw4);
      chk('the by-heart letters glow on the intro', glowed);
      chk('a whole sitting can be played to the end', !!doc.querySelector('#again'), turns + ' turns played');
      chk('the finish is warm, not a mark out of ten',
        /good practice|know these by heart/i.test(screen()) && !/wrong|failed|you lost/i.test(screen()), screen().slice(0, 90));
      chk('finishing posts EXACTLY ONE learning event, not one per tap',
        ledger.length === 1, ledger.length + ' events for ' + turns + ' turns');
      if (ledger.length === 1) {
        const e = ledger[0];
        chk('the event is tagged as practice, on the sight word skill',
          e.quizType === 'practice' && e.game === 'practice' && e.subject === 'words' && e.skill === 'sight-words',
          JSON.stringify(e));
      }
    }
  }
  dom.window.close();
}

// ---------------------------------------------------- 6) guardrails on screen
console.log('\n--- GUARDRAILS ---');
for (const f of ['public/practice.html', 'public/buildable-practice.js', 'scripts/gen-practice-audio.mjs']) {
  chk('no emojis in ' + f, !emoji.test(read(f)));
}
for (const id of Object.keys(DECKS)) chk('no emojis in deck ' + id, !emoji.test(JSON.stringify(DECKS[id])));

chk('the page never draws a clock: no countdown, no seconds, no timer',
  !/setInterval/.test(pageSrc) && !/countdown/i.test(pageSrc) && !/\bseconds\b/i.test(pageSrc));
// strip the comments first: the page EXPLAINS that it has no lives and no score,
// and that prose must not read as the page having them
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const pageCode = noComments(pageSrc);
chk('nothing on the page is a life, a streak break or a fail state',
  !/\blives\b/i.test(pageCode) && !/game over/i.test(pageCode) && !/you lose/i.test(pageCode) && !/\bscore\b/i.test(pageCode));
chk('the time a kid takes is measured, but only in the engine',
  /Date\.now\(\) - startedAt/.test(pageSrc) && /FAST_MS/.test(engineSrc));
chk('word audio falls back: baked file, then the shared ElevenLabs pipeline, then the device voice',
  /\/practice\/audio\//.test(pageSrc) && /\/api\/say/.test(pageSrc) && /speechSynthesis/.test(pageSrc));
chk('a generator ships for the baked word audio, and it never reads a key',
  exists('scripts/gen-practice-audio.mjs') &&
  !/process\.env\.ELEVENLABS/.test(noComments(read('scripts/gen-practice-audio.mjs'))) &&
  /api\/say/.test(read('scripts/gen-practice-audio.mjs')));
chk('the engine is subject-agnostic: no sight-word special cases in it',
  !/dolch/i.test(engineSrc) && !/sight.?word/i.test(noComments(engineSrc)) && !/\bword\b/.test(noComments(engineSrc).replace(/key\(x\)|x\.word/g, '')));

// ------------------------------------------------------------ 7) vercel routes
console.log('\n--- ROUTING ---');
const vercel = JSON.parse(read('vercel.json'));
const routes = vercel.routes || [];
const at = (src) => routes.findIndex((r) => r.src === src);
const catchAll = routes.findIndex((r) => r.src === '/(.*)');
for (const src of ['/practice', '/practice.html', '/buildable-practice.js',
                   '/practice/decks/([A-Za-z0-9_-]+).json', '/practice/audio/(.*)']) {
  const i = at(src);
  chk('vercel routes ' + src + ' before the catch-all', i !== -1 && i < catchAll, 'index ' + i);
}
chk('the decks are never served stale', (routes[at('/practice/decks/([A-Za-z0-9_-]+).json')] || {}).headers['cache-control'].indexOf('no-cache') !== -1);
chk('the baked word audio is cached hard', (routes[at('/practice/audio/(.*)')] || {}).headers['cache-control'].indexOf('immutable') !== -1);
chk('the page carries a favicon block', /rel="icon"/.test(pageSrc) && /apple-touch-icon/.test(pageSrc));

// --------------------------------------------- 8) the tile in the Learn section
console.log('\n--- THE LEARN SECTION ---');
const lessons = read('public/lessons.html');
chk('Practice has a tile in the Learn section', /id="practiceTile"/.test(lessons) && /\/practice/.test(lessons));
chk('the tile is Coming Soon behind the 1111 owner gate until PT2',
  /openSoon\("\/practice"\)/.test(lessons) && /=== "1111"/.test(lessons) && /Coming soon/.test(lessons));
chk('the tile art is drawn SVG, never an emoji', /PRACTICE_ART\s*=\s*'<svg/.test(lessons) && !emoji.test(lessons));
chk('passing the gate once is remembered for the visit',
  /bk_soon_ok/.test(lessons) && /bk_soon_ok/.test(read('src/BuildableKids.jsx')));

console.log('\n' + (ok ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
