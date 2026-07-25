// qa-quickgame.mjs
// ---------------------------------------------------------------------------
// Headless QA for Session QZ1 — the short GAME that replaced the quiz popup.
//
// Two things this has to prove, because a kid hits them with no adult watching:
//   1. Every round is WINNABLE. A spelling deal always has the letters it asks
//      for; a number deal always has a pair that hits the target; a pattern
//      always has its own answer among the choices.
//   2. Quizzes are GONE from reading. Kidspedia books and exhibits must not
//      contain a quiz button, and nothing in src/ may call /api/generate-quiz.
//
// Content lives in src/quickgame-content.js as plain JS precisely so this file
// can import it and deal thousands of real rounds without a browser.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  WORDS, SHAPES, chooseGame, dealSpell, dealNumber, dealPattern, SUBJECT, HEADING,
} from './src/quickgame-content.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const fail = (m) => { failures++; console.log(`FAIL: ${m}`); };
const pass = (m) => console.log(`PASS: ${m}`);
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const jsx = read('src/QuickGame.jsx');
const content = read('src/quickgame-content.js');

/* ---------------------------------------------------------------- 1. banks */
{
  let bad = 0;
  const picCases = new Set([...jsx.matchAll(/case "([A-Z]+)":/g)].map((m) => m[1]));
  WORDS.forEach((w) => {
    if (!/^[A-Z]{3,6}$/.test(w.word)) { fail(`word "${w.word}" is not 3-6 capital letters`); bad++; }
    if (!picCases.has(w.pic)) { fail(`word "${w.word}" wants picture "${w.pic}" but Pic() has no case for it`); bad++; }
    [['hideEasy', w.hideEasy], ['hideFull', w.hideFull]].forEach(([label, list]) => {
      if (!Array.isArray(list) || !list.length) { fail(`${w.word}.${label} is empty`); bad++; return; }
      list.forEach((i) => {
        if (i === 0) { fail(`${w.word}.${label} blanks the FIRST letter — a beginning reader loses the initial sound`); bad++; }
        if (i < 0 || i >= w.word.length) { fail(`${w.word}.${label} index ${i} is outside the word`); bad++; }
      });
      if (new Set(list).size !== list.length) { fail(`${w.word}.${label} repeats an index`); bad++; }
    });
  });
  if (!bad) pass(`${WORDS.length} spelling words: real pictures, sane blanks, first letter never hidden`);
}

/* ------------------------------------------------- 2. spelling is winnable */
{
  let bad = 0;
  for (let n = 0; n < 4000 && bad < 3; n++) {
    const age = 4 + (n % 8);
    const d = dealSpell(age);
    const wanted = d.need.map((i) => d.letters[i]);
    const tray = d.tray.slice();
    wanted.forEach((c) => {
      const at = tray.indexOf(c);
      if (at === -1) { fail(`"${d.word}" (age ${age}) needs "${c}" but the letter tray has none`); bad++; }
      else tray.splice(at, 1); // consume it, so duplicates are counted honestly
    });
    if (d.tray.length < 4) { fail(`"${d.word}" dealt only ${d.tray.length} letter tiles`); bad++; }
    if (d.letters.join('') !== d.word) { fail(`"${d.word}" letters do not spell the word`); bad++; }
  }
  if (!bad) pass('4000 spelling deals: the tray always holds every letter the word asks for');
}

/* --------------------------------------------------- 3. number is winnable */
{
  let bad = 0;
  for (let n = 0; n < 4000 && bad < 3; n++) {
    const age = 4 + (n % 8);
    const d = dealNumber(age);
    let solvable = false;
    for (let i = 0; i < d.cards.length && !solvable; i++)
      for (let j = i + 1; j < d.cards.length && !solvable; j++)
        if (d.cards[i] + d.cards[j] === d.target) solvable = true;
    if (!solvable) { fail(`target ${d.target} with cards [${d.cards}] has NO pair that adds up — a kid cannot win it`); bad++; }
    if (d.cards.length !== 6) { fail(`dealt ${d.cards.length} cards, expected 6`); bad++; }
    if (d.cards.some((c) => c < 1)) { fail(`cards [${d.cards}] contain zero or a negative`); bad++; }
    if (d.target < 2) { fail(`target ${d.target} is too small to make from two cards`); bad++; }
  }
  if (!bad) pass('4000 number deals: every one has at least one winning pair, six positive cards');
}

/* -------------------------------------------------- 4. pattern is winnable */
{
  let bad = 0;
  for (let n = 0; n < 4000 && bad < 3; n++) {
    const d = dealPattern();
    if (d.seq.length !== 5) { fail(`pattern showed ${d.seq.length} pieces, expected 5`); bad++; }
    if (!d.choices.includes(d.answer)) { fail(`pattern answer "${d.answer}" is not among the choices [${d.choices}]`); bad++; }
    if (new Set(d.choices).size !== d.choices.length) { fail(`pattern choices repeat: [${d.choices}]`); bad++; }
    // The answer must genuinely continue the repeat, not just look plausible.
    const unitLen = [2, 3].find((L) => d.seq.every((t, i) => t === d.seq[i % L]));
    if (!unitLen) { fail(`sequence [${d.seq}] does not repeat on a 2 or 3 step unit`); bad++; }
    else if (d.seq[5 % unitLen] !== d.answer) { fail(`sequence [${d.seq}] should continue with "${d.seq[5 % unitLen]}", not "${d.answer}"`); bad++; }
    // Pieces must differ by more than colour so a 4-year-old can tell them apart.
    const shapes = new Set(d.choices.map((t) => t.split('-')[0]));
    const hues = new Set(d.choices.map((t) => t.split('-')[1]));
    if (shapes.size !== d.choices.length || hues.size !== d.choices.length) {
      fail(`pattern choices [${d.choices}] are not distinct in BOTH shape and colour`); bad++;
    }
  }
  if (!bad) pass('4000 pattern deals: the answer really continues the repeat and every piece looks different');
}

/* ------------------------------------------------------ 5. game selection */
{
  let bad = 0;
  const kinds = new Set();
  ['math', 'reading', 'mix'].forEach((goal) => {
    for (let age = 3; age <= 11; age++) {
      for (let n = 0; n < 200; n++) {
        const k = chooseGame(goal, age);
        kinds.add(k);
        if (!['spell', 'number', 'pattern'].includes(k)) { fail(`chooseGame("${goal}", ${age}) returned "${k}"`); bad++; }
        if (!SUBJECT[k]) { fail(`no ledger subject mapped for "${k}"`); bad++; }
        if (!HEADING[k]) { fail(`no heading for "${k}"`); bad++; }
      }
    }
  });
  ['spell', 'number', 'pattern'].forEach((k) => { if (!kinds.has(k)) { fail(`"${k}" never gets chosen by any goal/age`); bad++; } });
  // Pre-readers must never be handed a reading-first game every time.
  let patternsForLittles = 0;
  for (let n = 0; n < 500; n++) if (chooseGame('reading', 4) === 'pattern') patternsForLittles++;
  if (patternsForLittles < 100) { fail(`a 4-year-old got the no-reading pattern game only ${patternsForLittles}/500 times`); bad++; }
  if (!bad) pass('game selection: all three appear, every kind maps to a subject, pre-readers get the no-reading game');
}

/* --------------------------------------------- 6. costs nothing, no emojis */
{
  const EMOJI = /[⌚-⌛⌀-⓿☀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/u;
  let bad = 0;
  [['src/QuickGame.jsx', jsx], ['src/quickgame-content.js', content]].forEach(([f, body]) => {
    if (EMOJI.test(body)) { fail(`${f} contains an emoji — house rule is drawn art only`); bad++; }
    if (/fetch\((["'`])\/api\/generate-quiz/.test(body)) { fail(`${f} still calls /api/generate-quiz — a round must cost nothing`); bad++; }
  });
  if (!/onPass && onPass\(\)/.test(jsx)) { fail('QuickGame has no skip path — a kid could get trapped'); bad++; }
  if (!/Skip for now/.test(jsx)) { fail('the "Skip for now" escape hatch is missing'); bad++; }
  if (!bad) pass('no emojis, no per-round API call, and the skip escape hatch is intact');
}

/* ------------------------------- 7. the old quiz is gone everywhere it was */
{
  let bad = 0;
  if (fs.existsSync(path.join(dir, 'src/QuizGate.jsx'))) {
    fail('src/QuizGate.jsx still exists — QuickGame replaced it, it should not linger');
    bad++;
  }
  const srcDir = path.join(dir, 'src');
  fs.readdirSync(srcDir).filter((f) => /\.(jsx?|js)$/.test(f)).forEach((f) => {
    const body = fs.readFileSync(path.join(srcDir, f), 'utf8');
    if (/from ["']\.\/QuizGate["']/.test(body)) { fail(`src/${f} still imports QuizGate`); bad++; }
    if (/fetch\((["'`])\/api\/generate-quiz/.test(body)) { fail(`src/${f} still calls /api/generate-quiz`); bad++; }
  });
  if (!bad) pass('the old generated-question gate is gone from the whole app');
}

/* ------------------------------------- 8. NO quizzes where kids are reading */
{
  let bad = 0;
  ['topic.html', 'dive.html', 'weather.html', 'orbit-explorer.html'].forEach((f) => {
    const p = path.join(dir, 'public', f);
    if (!fs.existsSync(p)) { fail(`public/${f} is missing`); bad++; return; }
    const body = fs.readFileSync(p, 'utf8');
    if (body.indexOf('Quick quiz') !== -1 || body.indexOf('q quiz') !== -1) {
      fail(`public/${f} still has a quiz button — reading must never be interrupted by a quiz`);
      bad++;
    }
  });
  const shell = read('src/BuildableKids.jsx');
  const explore = shell.slice(shell.indexOf('function ExploreScreen'), shell.indexOf('function LessonsScreen'));
  if (/QuizGate|QuickGame/.test(explore)) { fail('ExploreScreen (Kidspedia) mounts a quiz/game gate again'); bad++; }
  if (!/bk:quizDone/.test(explore)) { fail('ExploreScreen no longer answers a stale quizRequest — a cached book could freeze'); bad++; }
  if (!bad) pass('Kidspedia reading has no quiz anywhere, and stale books still get unstuck');
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
