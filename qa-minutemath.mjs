// Headless QA for Minute Math (public/minutemath.html) — card QA9.
//
// Minute Math is a kid-facing timed arithmetic sheet reached from Lessons
// (`window.__minuteMath` in lessons.html sends the kid to /minutemath). It had
// no harness at all until this card: QA-MAP.md §8a listed it among the pages
// with no check of any kind.
//
// Three parts, cheapest first:
//   A  REACHABILITY — the page and its scripts are routed in vercel.json ahead
//      of the "/(.*)" catch-all, and every local file it asks for exists. This
//      is the Practice failure mode: a harness can pass on a page the server
//      never serves.
//   B  SHAPE — the hooks the page's own code addresses by id are present, the
//      shared game nav is loaded, and there are no emoji (house rule).
//   C  THE MATHS — makeProblem() is pulled out and run several thousand times.
//      A kid marked wrong by a generator that got its own answer wrong is the
//      worst bug this page can have, so this part is not optional.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const dir = process.argv[2] || '.';
let ok = true;
const fail = (m) => { console.log('FAIL: ' + m); ok = false; };
const pass = (m) => console.log('PASS: ' + m);

const PAGE = path.join(dir, 'public', 'minutemath.html');
if (!fs.existsSync(PAGE)) { console.log('FAIL: public/minutemath.html is missing'); process.exit(1); }
const html = fs.readFileSync(PAGE, 'utf8');

// ---------------- A. reachability ----------------
console.log('--- A. reachability ---');
const vercel = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8'));
const srcs = (vercel.routes || []).map((r) => r.src);
const catchAllAt = srcs.indexOf('/(.*)');
const routedBefore = (p) => {
  const i = srcs.findIndex((s) => {
    if (s === p) return true;
    if (!s.includes('(')) return false;
    try { return new RegExp('^' + s + '$').test(p); } catch { return false; }
  });
  return i !== -1 && (catchAllAt === -1 || i < catchAllAt);
};
for (const p of ['/minutemath.html', '/minutemath']) {
  if (routedBefore(p)) pass(p + ' is routed ahead of the catch-all');
  else fail(p + ' has no route ahead of the catch-all — the server would send landing.html instead');
}

// Every local file the page pulls in must exist, or the page half-loads.
const refs = [...html.matchAll(/(?:src|href)="(\/[^"?#]+|[a-zA-Z0-9][^":?#]*\.(?:js|css))"/g)].map((m) => m[1]);
const local = [...new Set(refs)].filter((r) => !r.startsWith('//') && !/^\/api\//.test(r));
let missing = 0;
for (const r of local) {
  const onDisk = path.join(dir, 'public', r.replace(/^\//, ''));
  if (!fs.existsSync(onDisk)) { fail('minutemath.html asks for ' + r + ', which is not in public/'); missing++; }
}
if (!missing) pass('every local file the page loads exists (' + local.length + ' checked)');
for (const r of local.filter((x) => x.endsWith('.js') && x.startsWith('/'))) {
  if (routedBefore(r)) pass(r + ' is routed');
  else fail(r + ' has no route — the browser would get HTML and throw "Unexpected token \'<\'"');
}

// Lessons is the only door into this page. If that call changes, the page is orphaned.
const lessons = fs.readFileSync(path.join(dir, 'public', 'lessons.html'), 'utf8');
if (/__minuteMath[\s\S]{0,120}\/minutemath/.test(lessons)) pass('lessons.html still sends kids to /minutemath');
else fail('lessons.html no longer routes to /minutemath — Minute Math would be unreachable');

// ---------------- B. shape ----------------
console.log('--- B. shape ---');
for (const id of ['sheet', 'focus', 'finish', 'again', 'quit', 'clock', 'counts']) {
  if (html.includes('id="' + id + '"')) pass('#' + id + ' is on the page');
  else fail('#' + id + ' is gone but the page script still addresses it');
}
if (/buildable-gamenav\.js/.test(html)) pass('the shared game nav is loaded (no bespoke back button)');
else fail('buildable-gamenav.js is not loaded — HUD-AND-NAV-RULES requires the shared nav');
const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
if (emoji) fail('emoji found on the page (' + emoji.slice(0, 5).join(' ') + ') — the house rule is drawn SVG only');
else pass('no emoji anywhere on the page');

// ---------------- C. the maths ----------------
console.log('--- C. the maths ---');
// Lift just the generator out of the page and run it for real. No DOM needed.
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const grab = (name) => {
  const i = script.indexOf('function ' + name + '(');
  if (i === -1) return null;
  // walk the braces so a nested function body is not cut short
  let depth = 0, started = false;
  for (let j = i; j < script.length; j++) {
    if (script[j] === '{') { depth++; started = true; }
    else if (script[j] === '}') { depth--; if (started && depth === 0) return script.slice(i, j + 1); }
  }
  return null;
};
const parts = ['rnd', 'makeProblem', 'makeSet'].map(grab);
if (parts.some((p) => !p)) {
  fail('could not find rnd/makeProblem/makeSet in minutemath.html — the generator was renamed, so this harness is now blind');
} else {
  const sandbox = { Math };
  vm.createContext(sandbox);
  vm.runInContext(parts.join('\n') + '\nglobalThis.__mk = makeProblem; globalThis.__set = makeSet;', sandbox);
  const makeProblem = sandbox.__mk;

  const CFGS = [
    { name: 'add 0-10', cfg: { ops: ['add'], lo: 0, hi: 10, focus: null } },
    { name: 'sub 0-20', cfg: { ops: ['sub'], lo: 0, hi: 20, focus: null } },
    { name: 'mul 1-12', cfg: { ops: ['mul'], lo: 1, hi: 12, focus: null } },
    { name: 'div 1-12', cfg: { ops: ['div'], lo: 1, hi: 12, focus: null } },
    { name: 'mixed, focus 7', cfg: { ops: ['add', 'sub', 'mul', 'div'], lo: 1, hi: 12, focus: 7 } },
  ];
  const EXPECT = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b };

  for (const { name, cfg } of CFGS) {
    let wrong = 0, negative = 0, ragged = 0, divByZero = 0, focusMiss = 0;
    for (let i = 0; i < 2000; i++) {
      const p = makeProblem(cfg);
      if (!EXPECT[p.op]) { ragged++; continue; }
      if (EXPECT[p.op](p.a, p.b) !== p.ans) wrong++;
      if (p.op === 'sub' && p.ans < 0) negative++;
      if (p.op === 'div') {
        if (p.b === 0) divByZero++;
        else if (!Number.isInteger(p.ans)) ragged++;
      }
      if (!Number.isInteger(p.a) || !Number.isInteger(p.b)) ragged++;
      if (cfg.focus !== null && p.op !== 'div' && p.a !== cfg.focus && p.b !== cfg.focus) focusMiss++;
    }
    if (wrong) fail(name + ': ' + wrong + '/2000 problems carry the wrong answer — a kid would be marked wrong for being right');
    else pass(name + ': every one of 2000 answers is correct');
    if (negative) fail(name + ': ' + negative + ' subtractions go below zero');
    if (divByZero) fail(name + ': ' + divByZero + ' divisions by zero');
    if (ragged) fail(name + ': ' + ragged + ' problems are not whole numbers');
    if (cfg.focus !== null && focusMiss) fail(name + ': ' + focusMiss + ' problems ignore the focus number ' + cfg.focus);
  }
  const set = sandbox.__set({ ops: ['add'], lo: 0, hi: 9, focus: null }, 30);
  if (Array.isArray(set) && set.length === 30) pass('makeSet builds a full sheet (30 problems)');
  else fail('makeSet did not return 30 problems');
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
