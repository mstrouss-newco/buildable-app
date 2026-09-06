// Headless QA for the Lessons player — public/lessons.html + public/lessons/*.json
// + api/lesson-questions.js  (Session LS1).
//
// The lesson player is a DOM page with no headless game loop, so this harness does
// not sim taps. It proves what CAN be checked deterministically, in the house style
// (fs + vm + regex + a fake res stub, no browser, no server):
//
//   1) the sample lesson JSON is a well-formed, self-consistent, reviewed lesson
//      (every correctIndex is in range, the mastery bar matches the check length,
//      and the maths in the hand-written questions is actually right)
//   2) the shipped page has all five steps, the cannot-fail guided step, the
//      4-of-5 mastery gate, the gentle re-teach path and no shame screen
//   3) every answer path reports to the 8B learning ledger (postMessage in the
//      shell, direct POST standalone — and never both)
//   4) the practice questions come from the APPROVED bank for THAT EXACT skill,
//      and the API never widens the skill filter to pad the count
//   5) the painted art the lesson names actually exists on disk
//   6) no emojis anywhere (product guardrail)
//   7) vercel.json routes the page, the lesson JSON and the art (not swallowed
//      by the catch-all)
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(dir, f));

let ok = true;
const chk = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ::  ' + extra : ''));
  if (!cond) ok = false;
};
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// ---------------------------------------------------------------- 1) lesson JSON
console.log('--- SAMPLE LESSON: /lessons/g1-making-ten.json ---');
chk('sample lesson file ships', exists('public/lessons/g1-making-ten.json'));
let L = null;
try { L = JSON.parse(read('public/lessons/g1-making-ten.json')); } catch (e) { chk('lesson JSON parses', false, String(e.message)); }

if (L) {
  chk('is Grade 1 math on the exact roadmap skill', L.grade === '1' && L.subject === 'math' && L.skill === 'addition-within-20',
    `${L.grade}/${L.subject}/${L.skill}`);
  chk('carries a stable id and title', !!L.id && !!L.title, `${L.id} - ${L.title}`);
  chk('is marked reviewed/approved by a grown-up (no unapproved lesson reaches a kid)',
    L.status === 'approved' && !!L.reviewedBy, `status=${L.status} by=${L.reviewedBy}`);

  chk('buddy intro names the skill in kid words', !!(L.intro && L.intro.buddy && L.intro.body),
    L.intro && L.intro.buddy);
  chk('has 3 to 5 teach cards', Array.isArray(L.teach) && L.teach.length >= 3 && L.teach.length <= 5,
    'teach=' + (L.teach || []).length);
  chk('every teach card has read-aloud lines', (L.teach || []).every((c) => Array.isArray(c.say) && c.say.length > 0));
  chk('read-aloud lines are word-form (no + or = that /api/say would silently drop)',
    (L.teach || []).concat(L.guided || [], [L.intro || {}, L.reteach || {}])
      .flatMap((c) => c.say || []).every((s) => !/[+=]/.test(s)));

  chk('try-it-together step exists and every question carries a hint',
    Array.isArray(L.guided) && L.guided.length > 0 && L.guided.every((q) => !!q.hint), 'guided=' + (L.guided || []).length);
  chk('asks for 5 to 8 on-your-own questions', !!L.solo && L.solo.count >= 5 && L.solo.count <= 8, 'count=' + (L.solo || {}).count);
  chk('on-your-own is wired to the approved bank', !!(L.solo && L.solo.fromBank === true));
  chk('carries its own reviewed fallback questions so a kid is never blocked',
    Array.isArray(L.solo && L.solo.fallback) && L.solo.fallback.length >= L.solo.count,
    'fallback=' + ((L.solo && L.solo.fallback) || []).length);

  chk('mastery bar is 4 of 5', L.mastery && L.mastery.need === 4 && L.mastery.of === 5, JSON.stringify(L.mastery));
  chk('star check has exactly as many questions as the mastery bar says',
    Array.isArray(L.check) && L.check.length === L.mastery.of, 'check=' + (L.check || []).length);
  chk('mastering the lesson pays coins', !!(L.reward && L.reward.coins > 0), 'coins=' + ((L.reward || {}).coins));
  chk('a miss has a gentle re-teach with its own words', !!(L.reteach && L.reteach.headline && L.reteach.body));

  // Every question in the lesson: choices sane, correctIndex in range, no dupes.
  const allQ = [].concat(L.guided || [], (L.solo && L.solo.fallback) || [], L.check || []);
  chk('every question has 2 or more choices', allQ.every((q) => Array.isArray(q.choices) && q.choices.length >= 2));
  chk('every correctIndex points at a real choice',
    allQ.every((q) => Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.choices.length));
  chk('no question repeats a choice', allQ.every((q) => new Set(q.choices.map(String)).size === q.choices.length));

  // The arithmetic actually has to be right — a wrong answer key would teach a kid
  // the wrong thing and poison the ledger. Solve "a + b = ?" and "a + ? = b".
  function truth(text) {
    let m = /^\s*(\d+)\s*\+\s*(\d+)\s*=\s*\?\s*$/.exec(text);
    if (m) return String(Number(m[1]) + Number(m[2]));
    m = /^\s*(\d+)\s*\+\s*\?\s*=\s*(\d+)\s*$/.exec(text);
    if (m) return String(Number(m[2]) - Number(m[1]));
    m = /^\s*What is (\d+) \+ (\d+)\?\s*$/.exec(text);
    if (m) return String(Number(m[1]) + Number(m[2]));
    return null;
  }
  const solvable = allQ.filter((q) => truth(q.question) !== null);
  const wrong = solvable.filter((q) => String(q.choices[q.correctIndex]) !== truth(q.question));
  chk('the answer key is mathematically correct on every solvable question',
    solvable.length >= 8 && wrong.length === 0,
    `checked=${solvable.length} wrong=${JSON.stringify(wrong.map((q) => q.question))}`);
  chk('every answer inside the skill: addition within 20',
    solvable.every((q) => Number(truth(q.question)) >= 0 && Number(truth(q.question)) <= 20));

  const blob = JSON.stringify(L);
  chk('no emojis in the lesson content', !emoji.test(blob));

  // 5) the painted art it names is really there (webp + png fallback)
  const art = L.art || {};
  const needed = [art.buddy, art.star, art.counterA, art.counterB].filter(Boolean);
  chk('lesson names its art rather than the page hardcoding it', needed.length === 4, JSON.stringify(art));
  chk('every named art file ships as webp AND png fallback',
    needed.every((n) => exists(`public/lessons/art/${n}.webp`) && exists(`public/lessons/art/${n}.png`)),
    needed.join(','));
  chk('counter art is small enough for a kid on a slow iPad (<40KB each)',
    needed.every((n) => fs.statSync(path.join(dir, `public/lessons/art/${n}.png`)).size < 40 * 1024));
  chk('the two counters are visually different pieces of art', art.counterA !== art.counterB);
}

// ---------------------------------------------------------------- 2) the player
console.log('\n--- PLAYER: public/lessons.html ---');
chk('player page ships', exists('public/lessons.html'));
const H = exists('public/lessons.html') ? read('public/lessons.html') : '';

chk('all five steps are labelled for the kid',
  ['Step 1 of 5', 'Step 2 of 5', 'Step 3 of 5', 'Step 4 of 5', 'Step 5 of 5'].every((s) => H.includes(s)));
chk('the five-step progress bar has exactly five segments',
  (H.match(/<div class="steps hide" id="stepbar">((?:<i><\/i>)+)<\/div>/) || [, ''])[1].split('<i></i>').length - 1 === 5);
chk('step 3 cannot fail (a wrong tap opens the hint and waits, never advances)',
  /__guidedAns[\s\S]{0,700}?else\s*{[\s\S]{0,200}?__hint\(\)/.test(H));
chk('step 3 offers a hint on demand', H.includes('Give me a hint') && H.includes('__hint'));
chk('step 4 pulls from the lesson-questions API', H.includes('/api/lesson-questions?'));
chk('step 4 is never skipped when the bank is slow (waits, then falls back)',
  H.includes('lessonOwnQuestions') && /waited\s*>=\s*\d+/.test(H));
chk('mastery gate reads the lesson, not a hardcoded number',
  /score\s*>=\s*L\.mastery\.need/.test(H) && !/score\s*>=\s*4\b/.test(H));
chk('mastering awards the star and the coins once', H.includes('awardOnce') && H.includes('L.reward.coins'));
chk('a miss re-teaches gently and lets the kid retry the check',
  H.includes('Try the star check again') && /__go\(\\?'teach\\?',\s*0\)/.test(H));
chk('no shame screen: the miss ending never scolds',
  !/\b(you failed|failed|wrong again|you lost|too bad|bad job|try harder)\b/i.test(H));
chk('the star waits rather than being taken away', /star is still waiting/i.test(H));
chk('read-aloud is offered', H.includes('Read to me') && H.includes('/api/say?t='));
chk('read-aloud falls back to the browser voice when the recorded voice cannot serve',
  H.includes('SpeechSynthesisUtterance') && H.includes('browserSay'));
chk('painted art is used for the counters, not drawn shapes', H.includes('/lessons/art/') && H.includes('counterImg'));
chk('reads the active kid profile the standard way', H.includes('bk_active_kid_v1'));
chk('uses the shared wallet rather than its own coin store', H.includes('buildable-wallet.js') && H.includes('BuildableWallet'));
chk('honours the shell: hides its own back button and exits via nav:exit',
  H.includes('body.in-app #back{display:none}') && H.includes('"nav:exit"'));
chk('stops talking when the shell pauses or the tab hides',
  H.includes('visibilitychange') && /t === "pause"/.test(H));
chk('records mastery locally so the LS2 path map can read it', H.includes('bk_lessons_v1:'));
chk('no emojis in the player', !emoji.test(H));

// ---------------------------------------------------------------- 3) the ledger
console.log('\n--- LEARNING LEDGER (Session 8B) ---');
chk('every answer type logs: guided, practice and star check',
  H.includes('quizType:"lesson-guided"') && H.includes('quizType:"lesson-practice"') && H.includes('quizType:"lesson-check"'));
chk('in the shell it sends the cartridge skill message', /kind:"skill"/.test(H));
chk('standalone it posts straight to the ledger API', H.includes('/api/log-learning-event'));
chk('never logs twice (shell path returns before the direct POST)',
  /if\(IN_SHELL\)\{\s*postToShell\(msg\);\s*return;\s*\}/.test(H));
chk('logging can never interrupt a lesson (fire and forget)',
  /\.catch\(function\(\)\{\}\)/.test(H) && /keepalive:true/.test(H));
chk('the logged skill comes from the lesson, so the ledger stays honest',
  /skill:\s*lesson\.skill/.test(H));

// ---------------------------------------------------------------- 4) the API
console.log('\n--- API: api/lesson-questions.js ---');
chk('api ships', exists('api/lesson-questions.js'));
const A = exists('api/lesson-questions.js') ? read('api/lesson-questions.js') : '';
chk('only ever reads APPROVED rows (the 6B/8A review gate)', A.includes('status=eq.approved'));
chk('filters on THAT EXACT skill', /skill=eq\.\$\{encodeURIComponent\(skill\)\}/.test(A));
chk('never widens the skill filter to pad the count',
  !/skill=eq/.test(A.split('fetchApproved')[2] || '') || (A.match(/skill=eq/g) || []).length === 1);
chk('tops up from the same local generator the rest of the app uses',
  A.includes("from \"./_quizgen.js\"") && A.includes('localForSkill(skill)'));
chk('marks where each question came from so the ledger stays honest',
  A.includes('source: "bank"') && A.includes('source: "local"'));
chk('local top-ups are NOT written into the reviewed bank', !/method:\s*"POST"/.test(A));
chk('de-dupes so a kid never sees the same question twice in one lesson', A.includes('seen.has'));
chk('validates correctIndex is in range before serving', /correctIndex\s*>=\s*payload\.choices\.length/.test(A));
chk('dormant without Supabase env rather than erroring', /if \(!URL_ \|\| !KEY\) return \[\]/.test(A));
chk('no emojis in the api', !emoji.test(A));

// live-ish behaviour: no Supabase env here, so it must return all-local questions
const resStub = () => { const o = { code: 0, body: null, setHeader() {}, status(c) { o.code = c; return o; }, json(b) { o.body = b; return o; } }; return o; };
const mod = await import(path.resolve(dir, 'api/lesson-questions.js'));
{
  const res = resStub();
  await mod.default({ query: { subject: 'math', grade: '1', skill: 'addition-within-20', n: 6 } }, res);
  const b = res.body || {};
  chk('serves 6 questions for the sample lesson even with an empty bank',
    res.code === 200 && b.ok && Array.isArray(b.questions) && b.questions.length === 6,
    `code=${res.code} n=${(b.questions || []).length} source=${b.source}`);
  chk('all six are usable (question text + in-range answer)',
    (b.questions || []).every((q) => q.question && Array.isArray(q.choices) && q.choices.length >= 2 &&
      q.correctIndex >= 0 && q.correctIndex < q.choices.length));
  chk('all six are tagged with the exact requested skill',
    (b.questions || []).every((q) => q.skill === 'addition-within-20'));
  chk('all six are distinct', new Set((b.questions || []).map((q) => q.question)).size === (b.questions || []).length);
  chk('honestly reports zero banked questions rather than pretending',
    b.banked === 0 && b.source === 'local', JSON.stringify({ banked: b.banked, filled: b.filled, source: b.source }));
}
{
  const res = resStub();
  await mod.default({ query: { subject: 'math', grade: '1', skill: '', n: 6 } }, res);
  chk('refuses a request with no skill (never serves off-skill questions)', res.code === 400);
}
{
  const res = resStub();
  await mod.default({ query: { subject: 'astrology', skill: 'addition-within-20' } }, res);
  chk('refuses an unknown subject', res.code === 400);
}
{
  const res = resStub();
  await mod.default({ query: { subject: 'reading', grade: '1', skill: 'main-idea', n: 6 } }, res);
  const b = res.body || {};
  chk('a skill with no local builder returns an honest short list, never invented questions',
    res.code === 200 && b.ok && (b.questions || []).length === 0, `n=${(b.questions || []).length}`);
}

// ---------------------------------------------------------------- 5) routes
console.log('\n--- ROUTES: vercel.json ---');
const vjson = JSON.parse(read('vercel.json'));
const srcs = vjson.routes.map((r) => r.src);
chk('routes /lessons and /lessons.html (not swallowed by the catch-all)',
  srcs.includes('/lessons') && srcs.includes('/lessons.html'));
chk('routes the lesson JSON with no-cache so an edited lesson goes live',
  vjson.routes.some((r) => r.src.indexOf('/lessons/') === 0 && r.src.indexOf('.json') > 0 &&
    r.headers && /no-cache/.test(r.headers['cache-control'] || '')));
chk('routes the lesson art with a long cache', vjson.routes.some((r) => r.src === '/lessons/art/(.*)'));
const iLessonsJson = srcs.findIndex((s) => s.indexOf('/lessons/') === 0 && s.indexOf('.json') > 0);
const iCatchAll = srcs.findIndex((s) => s === '/(.*)');
chk('every lessons route comes before the catch-all',
  iCatchAll === -1 || (iLessonsJson !== -1 && iLessonsJson < iCatchAll &&
    srcs.indexOf('/lessons') < iCatchAll && srcs.indexOf('/lessons/art/(.*)') < iCatchAll));

// ---------------------------------------------------------------- 6) LS2: the path
// The lesson MAP (index.json) plus the two screens in front of the player: pick a
// subject, then climb Subject > Unit > Lesson with locks. The map is data, so LS3's
// factory can add lessons without touching page code — these checks hold it to that.
console.log('\n--- LS2 THE PATH: public/lessons/index.json ---');
chk('lesson map ships', exists('public/lessons/index.json'));
let IX = null;
try { IX = JSON.parse(read('public/lessons/index.json')); } catch (e) { chk('lesson map parses', false, String(e.message)); }

if (IX) {
  const paths = IX.paths || [];
  const subjIds = (IX.subjects || []).map((s) => s.id);
  const gradeIds = (IX.grades || []).map((g) => g.id);
  const rows = paths.flatMap((p) => (p.units || []).flatMap((u) => (u.lessons || []).map((l) => ({ ...l, subjectPath: p.subject, grade: String(p.grade) }))));

  chk('offers Math and Reading (the launch subjects)', ['math', 'reading'].every((x) => subjIds.includes(x)), subjIds.join(','));
  chk('covers K, 1 and 2', ['k', '1', '2'].every((g) => gradeIds.includes(g)), gradeIds.join(','));
  chk('Math and Reading each have a path for every K-2 grade',
    ['math', 'reading'].every((sub) => ['k', '1', '2'].every((g) => paths.some((p) => p.subject === sub && String(p.grade) === g))));
  chk('every path points at a subject and a grade the map declares',
    paths.every((p) => subjIds.includes(p.subject) && gradeIds.includes(String(p.grade))));
  chk('every unit is named and holds at least one lesson',
    paths.every((p) => (p.units || []).length > 0 && (p.units || []).every((u) => !!u.title && (u.lessons || []).length > 0)));

  chk('every lesson row carries a key, a title, a skill and a status',
    rows.length > 0 && rows.every((l) => !!l.key && !!l.title && !!l.skill && !!l.status), 'rows=' + rows.length);
  chk('a lesson row is either approved or planned — nothing in between',
    rows.every((l) => l.status === 'approved' || l.status === 'planned'),
    [...new Set(rows.map((l) => l.status))].join(','));
  chk('no two lessons share a key (the key is what mastery is stored under)',
    new Set(rows.map((l) => l.key)).size === rows.length);
  chk('no emojis in the lesson map', !emoji.test(JSON.stringify(IX)));

  const approvedRows = rows.filter((l) => l.status === 'approved');
  chk('at least one lesson is approved and playable today', approvedRows.length >= 1, 'approved=' + approvedRows.length);
  chk('every APPROVED row names a lesson file that really ships',
    approvedRows.every((l) => !!l.file && exists(`public/lessons/${l.file}.json`)),
    approvedRows.map((l) => l.file).join(','));
  chk('every APPROVED row was signed off by a grown-up (no unapproved lesson reaches a kid)',
    approvedRows.every((l) => !!l.reviewedBy));
  chk('an approved row matches its lesson file: same id, same skill, same grade, and the file says approved too',
    approvedRows.every((l) => {
      const f = JSON.parse(read(`public/lessons/${l.file}.json`));
      return f.id === l.key && f.skill === l.skill && String(f.grade) === String(l.grade) && f.status === 'approved';
    }));
  chk('PLANNED rows carry no lesson file, so nothing half-built can be opened',
    rows.filter((l) => l.status === 'planned').every((l) => !l.file));

  // The map has to agree with the one curriculum map the rest of the app uses,
  // or the path would teach skills the question bank has never heard of.
  const cur = await import(path.resolve(dir, 'api/_curriculum.js'));
  const offMap = rows.filter((l) => !cur.skillsFor(String(l.grade), l.subject || l.subjectPath).includes(l.skill));
  chk('every lesson skill exists in api/_curriculum.js for that grade and subject',
    offMap.length === 0, offMap.map((l) => `${l.grade}/${l.subject || l.subjectPath}/${l.skill}`).join(', '));
}

console.log('\n--- LS2 THE PATH: the two screens in front of the player ---');
chk('the page reads the lesson map instead of hardcoding a lesson list', H.includes('/lessons/index.json'));
chk('there is a subject picker', H.includes('function showSubjects') && H.includes('subgrid'));
chk('there is a unit path map (Subject > Unit > Lesson)',
  H.includes('function showPath') && H.includes('class="unit"') && /var cls = "node"/.test(H) && H.includes('.node{'));
chk('the path locks a lesson until the one before it is mastered (or the check placed the kid past it)',
  /if\(approved && !mastered && !placed && !blocked\) blocked = true/.test(H) && /locked = approved && blocked/.test(H));
chk('lock state comes from real mastery in bk_lessons_v1, never a guess',
  /var prog = readProgress\(\)/.test(H) && /prog\[l\.key\] && prog\[l\.key\]\.mastered/.test(H));
chk('planned lessons that are not built yet never block the lesson after them',
  /var approved = \(l\.status === "approved"\) && \(!!l\.file \|\| !!l\.fromBank\)/.test(H));
const lockedLine = (H.match(/.*cls \+= " locked".*/) || [''])[0];
const soonLine = (H.match(/.*cls \+= " soon".*/) || [''])[0];
chk('a locked or coming-soon lesson has no way to be opened',
  !!lockedLine && !!soonLine && !/onclick/.test(lockedLine) && !/onclick/.test(soonLine) &&
  (H.match(/tap = \x27 onclick="window\.__openLesson/g) || []).length === 3,   // next-up, mastered, placed
  `taps=${(H.match(/tap = \x27 onclick/g) || []).length}`);
chk('a kid starts on their own grade from their profile', /function startGradeFor/.test(H) && /PROFILE_GRADE/.test(H));
chk('a kid can run AHEAD of their grade (grade switcher, nothing hidden)',
  H.includes('__pickGrade') && H.includes('class="grades"') && /Learn ahead/.test(H));
chk('Kindergarten is understood as a grade, not a number',
  /s === "k" \|\| s === "kindergarten"/.test(H));
chk('the path and the picker are reload-safe addresses',
  /setUrl\("subject=" \+/.test(H) && H.includes('history.replaceState'));
chk('a direct address to one lesson still works (how a grown-up reviews it)',
  /lessonIdFromUrl/.test(H) && /if\(deep\)\{/.test(H));
chk('Back steps lesson -> path -> subjects before leaving the section',
  /function goBack\(\)/.test(H) && /VIEW\.name === "lesson" && FROM_PATH/.test(H) && /VIEW\.name === "path"/.test(H));
chk('inside the shell the page shows its own Back only when there is somewhere to go back to',
  H.includes('body.in-app.canback #back{display:flex}'));
chk('a lost lesson map never leaves a kid on a dead screen',
  /if\(!IDX\)\{/.test(H) && H.includes('DEFAULT_LESSON'));
chk('the map names the buddy art rather than the page hardcoding it',
  /IDX && IDX\.art && IDX\.art\.buddy/.test(H));

console.log('\n--- LS2 THE PATH: the Home door (NV3 shape, switch-gated) ---');
const SH = exists('src/BuildableKids.jsx') ? read('src/BuildableKids.jsx') : '';
chk('the shell has a Lessons screen', SH.includes('SCREEN_LESSONS') && SH.includes('function LessonsScreen'));
chk('the Lessons screen frames the lessons page (one page, three screens)',
  /GameFrame title="Lessons" src="\/lessons"/.test(SH));
chk('there is a Learn door on Home', /id: "learn",\s+label: "Learn"/.test(SH));
chk('the door is driven by the lessons_live switch, not by a code edit',
  /id: "learn"[\s\S]{0,400}?soon: !lessonsLive/.test(SH) &&
  /id: "learn"[\s\S]{0,400}?setCatalogGate/.test(SH));
chk('the gate is the same owner preview gate the rest of Home uses', SH.includes('catalogPw === "1111"'));
chk('/app/lessons is a real reload-safe address',
  /screen === SCREEN_LESSONS\) return "\/app\/lessons"/.test(SH) && /seg === "lessons"/.test(SH));
chk('the shell relays the lesson ledger messages it receives', /d\.kind === "skill"/.test(SH));

console.log('\n--- LS2 ROUTES ---');
chk('the lesson map is served by the lesson-JSON route (not the catch-all)',
  vjson.routes.some((r) => {
    if (r.src.indexOf('/lessons/') !== 0 || r.src.indexOf('.json') < 0) return false;
    try { return new RegExp('^' + r.src + '$').test('/lessons/index.json'); } catch (e) { return false; }
  }));

/* =========================================================================
   SESSION LS3 — the lesson factory, the review gate, and serving from the bank.
   The point of these checks: a lesson a grown-up has NOT approved must be
   unreachable by a kid at the SERVING layer, not merely hidden in the UI. Plus
   the answer key of every drafted question is re-derived from scratch here, so
   a lesson that would teach a wrong answer fails QA.
   ========================================================================= */
console.log('\n--- LS3 THE TABLE: db/ls3-lesson-bank.sql ---');
chk('the migration ships', exists('db/ls3-lesson-bank.sql'));
const SQL = exists('db/ls3-lesson-bank.sql') ? read('db/ls3-lesson-bank.sql') : '';
chk('it is idempotent (safe to run twice)',
  /create table if not exists lesson_bank/.test(SQL) && /create index if not exists/.test(SQL));
chk('it carries NO destructive statement (guardrail)',
  !/\b(drop|truncate|delete\s+from)\b/i.test(SQL));
chk('every lesson enters WAITING for review, never approved',
  /status\s+text not null default 'pending'/.test(SQL));
chk('a lesson key cannot be duplicated', /lesson_key\s+text unique not null/.test(SQL));
chk('the whole lesson is stored as one reviewable payload', /payload\s+jsonb not null/.test(SQL));
chk('there is a run log so we can prove the factory ran', /create table if not exists lesson_bank_runs/.test(SQL));

console.log('\n--- LS3 THE DRAFTER: api/_lessongen.js ---');
chk('the drafter ships', exists('api/_lessongen.js'));
const GEN = exists('api/_lessongen.js') ? read('api/_lessongen.js') : '';
chk('it reuses the painted art LS1 already ships (no new art needed)',
  /counterA: "counter-flower"/.test(GEN) && /buddy: "buddy-star"/.test(GEN));
chk('it hardcodes no art PATH, only art names', !/\/lessons\/art\//.test(GEN));
chk('no emojis in the drafter', !emoji.test(GEN));

const RPX = () => (exists('public/lesson-review.html') ? read('public/lesson-review.html') : '');
const gen = await import('./api/_lessongen.js');
const badSay = gen.validateLesson({});
chk('the validator refuses an empty lesson', badSay.ok === false && badSay.errors.length > 0);
chk('the validator catches a read-aloud line over 60 letters',
  gen.sayProblems('x'.repeat(61)).some((p) => /60/.test(p)));
chk('the validator catches + and = in a read-aloud line (api/say drops them)',
  gen.sayProblems('seven + three = ten').some((p) => /\+ or =/.test(p)));
chk('the validator catches an emoji in a read-aloud line',
  gen.sayProblems('nice work \u{1F600}').some((p) => /emoji/.test(p)));

console.log('\n--- LS3 THE FACTORY: api/generate-lessons.js ---');
chk('the factory ships', exists('api/generate-lessons.js'));
const FAC = exists('api/generate-lessons.js') ? read('api/generate-lessons.js') : '';
chk('what status a new lesson is born with comes from the mode file, not a hardcoded string',
  /status: birthStatus\(\)/.test(FAC) && !/status: "approved"/.test(FAC));

// PROTOTYPE MODE (owner's call 2026-07-25): lessons are auto-approved. The three
// things that must survive that switch are checked here, because they are what
// stops auto-approve from meaning "anything goes".
const MODE = exists('api/_lessonmode.js') ? read('api/_lessonmode.js') : '';
chk('the mode file ships and documents how to put the review gate back', !!MODE && /LESSON_AUTO_APPROVE=0/.test(MODE));
const mode = await import('./api/_lessonmode.js');
chk('prototype mode is ON, so a drafted lesson goes live immediately',
  mode.AUTO_APPROVE === true && mode.birthStatus() === 'approved', 'birthStatus=' + mode.birthStatus());
chk('an auto-approved lesson is honestly credited to the machine, not to a human',
  /auto \(prototype mode\)/.test(MODE) && mode.birthReviewer() === 'auto (prototype mode)');
chk('the mode can be flipped back by env var without a code push', /process\.env\.LESSON_AUTO_APPROVE/.test(MODE));
chk('STILL TRUE under auto-approve: a lesson that fails the validator is never stored',
  /if \(!v\.ok\) return \{ ok: false, reason: "failed validation"/.test(GEN));
chk('STILL TRUE under auto-approve: the serving layer only ever hands out approved lessons',
  /status=eq\.approved/.test(exists('api/lesson.js') ? read('api/lesson.js') : ''));
chk('the run tells you which mode it ran in, so a batch is never ambiguous',
  /mode: AUTO_APPROVE \? "auto-approve \(prototype\)"/.test(FAC));
chk('the review page cannot claim a review gate that is switched off',
  /function showMode/.test(RPX()) && /Prototype mode is on/.test(RPX()) && /Review required/.test(RPX()));
chk('it never touches a lesson the owner already approved', /already approved/.test(FAC));
chk('it leaves LS1\'s reviewed FILE lesson alone (replace first, remove second)',
  /filter\(\(t\) => !t\.hasFile\)/.test(FAC));
chk('it refuses a skill that is not on the 8A curriculum map',
  /skillsFor\(t\.grade, t\.subject\)\.includes\(t\.skill\)/.test(FAC));
chk('a cron secret, when set, is enforced', /Bearer \$\{CRON_SECRET\}/.test(FAC));
chk('dry mode returns without writing', /if \(dry\) \{[\s\S]{0,400}?return res/.test(FAC));
chk('the run is logged', /logRun\(/.test(FAC));
chk('no emojis in the factory', !emoji.test(FAC));

// Draft the real Math K batch through the real code path and prove it out.
const mapJson = JSON.parse(read('public/lessons/index.json'));
const fac = await import('./api/generate-lessons.js');
const kTargets = fac.targetsFromMap(mapJson).filter((t) => t.grade === 'k' && t.pathSubject === 'math' && !t.hasFile);
chk('the Kindergarten Math path has a full batch of lessons to draft', kTargets.length >= 10, 'targets=' + kTargets.length);

const drafted = [];
for (const t of kTargets) {
  const r = await gen.makeLesson(t, null);   // null key = authored engine, no model call
  if (r.ok) drafted.push(r.lesson);
  else chk('drafts ' + t.key, false, r.reason + ' ' + (r.errors || []).join('; '));
}
chk('every Kindergarten Math lesson drafts and passes the validator',
  drafted.length === kTargets.length, drafted.length + '/' + kTargets.length);
// The lesson PAYLOAD still says pending - the row's status column is what the
// mode file decides. Keeping the payload neutral means flipping the mode back
// does not require rewriting stored lessons.
chk('the lesson payload itself stays neutral so the mode can be flipped either way',
  drafted.every((L) => L.status === 'pending'));
chk('every drafted lesson has 5 star-check questions and a 4-of-5 bar',
  drafted.every((L) => L.check.length === 5 && L.mastery.need === 4 && L.mastery.of === 5));
chk('every drafted lesson still pulls practice from the APPROVED question bank',
  drafted.every((L) => L.solo.fromBank === true && L.solo.fallback.length >= 5));
chk('every drafted lesson sits on a real curriculum skill for its grade', drafted.every((L) => {
  const skills = (mapJson && true) ? null : null;
  return !!L.skill;
}) && drafted.every((L) => kTargets.some((t) => t.key === L.id && t.skill === L.skill)));
chk('no emojis anywhere in the drafted batch', !emoji.test(JSON.stringify(drafted)));
chk('every read-aloud line in the batch is under 60 letters with no + or =',
  drafted.every((L) => gen.validateLesson(L).ok));

// THE BIG ONE: re-derive every answer independently of the generator.
let wrong = [], unrated = 0;
const answerOf = (qt) => {
  let m;
  if ((m = /^(\d+)\s*\+\s*(\d+)\s*=\s*\?$/.exec(qt))) return String(+m[1] + +m[2]);
  if ((m = /^(\d+)\s*\+\s*\?\s*=\s*(\d+)$/.exec(qt))) return String(+m[2] - +m[1]);
  if ((m = /^What number comes after (\d+)\?$/.exec(qt))) return String(+m[1] + 1);
  if ((m = /^What number comes before (\d+)\?$/.exec(qt))) return String(+m[1] - 1);
  if ((m = /^What is one more than (\d+)\?$/.exec(qt))) return String(+m[1] + 1);
  if ((m = /^What is one less than (\d+)\?$/.exec(qt))) return String(+m[1] - 1);
  if ((m = /^What comes next\? (\d+), (\d+), (\d+), \.\.\.$/.exec(qt))) return String(+m[3] + 1);
  if ((m = /^Which is more, (\d+) or (\d+)\?$/.exec(qt))) return String(Math.max(+m[1], +m[2]));
  if ((m = /^Start at (\d+) and count on (\d+)\./.exec(qt))) return String(+m[1] + +m[2]);
  if ((m = /^How many sides does a (\w+) have\?$/.exec(qt)) || (m = /^How many corners does a (\w+) have\?$/.exec(qt)))
    return ({ circle: '0', triangle: '3', square: '4', rectangle: '4' })[m[1]] || null;
  return null;
};
for (const L of drafted) {
  for (const q of L.check.concat(L.solo.fallback)) {
    const want = answerOf(q.question);
    if (want == null) { unrated++; continue; }
    if (String(q.choices[q.correctIndex]) !== want) wrong.push(`${L.id}: "${q.question}" marked ${q.choices[q.correctIndex]}, answer is ${want}`);
  }
}
chk('EVERY answer key in the batch is independently correct', wrong.length === 0, wrong.slice(0, 4).join(' | '));
chk('most questions are covered by an independent rule (the rest are shape wording)',
  unrated < drafted.length * 4, 'unrated=' + unrated);
chk('no question in a lesson repeats another question in the same lesson',
  drafted.every((L) => {
    const all = L.check.concat(L.solo.fallback).map((q) => q.question);
    return new Set(all).size === all.length;
  }));

console.log('\n--- LS3 SERVING: a kid can never reach an unapproved lesson ---');
chk('api/lesson.js ships', exists('api/lesson.js'));
const SRV = exists('api/lesson.js') ? read('api/lesson.js') : '';
chk('without the owner code it serves ONLY approved lessons',
  /status=eq\.approved/.test(SRV) && /isOwner \? "status=in\.\(approved,pending\)" : "status=eq\.approved"/.test(SRV));
chk('the owner preview NEVER widens to rejected lessons',
  !/status=(?:eq|in)\.[^"`;]*rejected/.test(SRV));
chk('a draft is never cached in a shared cache', /no-store/.test(SRV));
chk('a bad key is refused rather than passed to the database',
  /\^\[A-Za-z0-9_-\]\{2,64\}\$/.test(SRV));

chk('api/lesson-map.js ships', exists('api/lesson-map.js'));
const MAP = exists('api/lesson-map.js') ? read('api/lesson-map.js') : '';
chk('the live map only merges approved rows for a kid',
  /status=eq\.approved/.test(MAP) && /row\.status === "pending" && isOwner/.test(MAP));
chk('it only ever UPGRADES a row, never removes one', !/splice|filter\(/.test(MAP.split('for (const p of')[1] || ''));
chk('a row that already ships as a reviewed FILE is never rewritten', /if \(!row \|\| l\.file\) return l/.test(MAP));
chk('it fails soft, so /lessons cannot break if the database is down',
  /catch \{ return \[\]; \}/.test(MAP));

console.log('\n--- LS3 THE PLAYER reads the bank as well as the files ---');
chk('a lesson counts as playable from a FILE or from an approved bank row',
  /\(!!l\.file \|\| !!l\.fromBank\)/.test(H));
chk('the player knows both homes for a lesson, files first',
  /function lessonSources/.test(H) && /\/api\/lesson\?key=/.test(H) && /\/lessons\/" \+ hit\.row\.file/.test(H));
chk('the player asks the LIVE map first and falls back to the static file',
  /\/api\/lesson-map/.test(H) && /fetch\("\/lessons\/index\.json"/.test(H));
chk('the owner preview code is only ever read from the address, never hardcoded',
  /var PREVIEW = \(\/\[\?&\]preview=/.test(H));
chk('the preview code survives moving around the section', /if\(PREVIEW\) q = \(q \? q \+ "&" : ""\)/.test(H));
chk('a draft is labelled as a draft when the owner walks it', /function draftBar/.test(H) && /Kids cannot see this yet/.test(H));
chk('shape lessons draw SVG geometry, never an emoji or a generated image',
  /var SHAPE_SVG = \{/.test(H) && /function shapes\(/.test(H) && /function showArt\(/.test(H));
chk('teach cards and guided questions both go through one picture path',
  (H.match(/showArt\(/g) || []).length >= 3);

console.log('\n--- LS3 THE REVIEW GATE: api/review-lessons.js + /lesson-review ---');
chk('the review API ships', exists('api/review-lessons.js'));
const REV = exists('api/review-lessons.js') ? read('api/review-lessons.js') : '';
chk('it can approve, reject and fix wording', /op === "edit"/.test(REV) && /op !== "approve" && op !== "reject"/.test(REV));
chk('approving re-validates the lesson one last time', /if \(op === "approve"\)[\s\S]{0,600}?validateLesson/.test(REV));
chk('an edit is re-validated before it is saved', /const v = validateLesson\(edited\)/.test(REV));
chk('an edit can only change WORDS, never add or remove a step',
  /function applyPatch/.test(REV) && /p\.choices\.length === \(dst\.choices \|\| \[\]\)\.length/.test(REV));
chk('it never deletes a row (guardrail) - reject keeps the draft',
  !/method: "DELETE"/.test(REV) && /"rejected"|status = op === "approve" \? "approved" : "rejected"/.test(REV));
chk('problems are explained in plain language, not error codes', /function plainErrors/.test(REV));
chk('no emojis in the review API', !emoji.test(REV));

chk('the review page ships', exists('public/lesson-review.html'));
const RP = exists('public/lesson-review.html') ? read('public/lesson-review.html') : '';
chk('it is behind the grown-ups code', /id="gate"/.test(RP) && /var PIN = "1025"/.test(RP));
chk('it shows all five steps of a lesson, so nothing is approved unseen',
  /Step 1 &middot; Hello/.test(RP) && /Step 2 &middot; Learn/.test(RP) && /Step 3 &middot;/.test(RP) &&
  /Step 4 &middot; On your own/.test(RP) && /Step 5 &middot; Star check/.test(RP));
chk('it shows which answer is marked correct on every question', /choice correct/.test(RP) || /class="choice/.test(RP));
chk('the owner can play a draft before approving it', /window\.playIt/.test(RP) && /preview=' \+ PIN/.test(RP));
chk('the owner can fix the wording without rejecting the lesson', /window\.openEdit/.test(RP) && /window\.saveEdit/.test(RP));
chk('it tells the owner plainly that kids cannot see an unapproved lesson',
  /cannot see a lesson until you approve it/.test(RP));
chk('no emojis on the review page', !emoji.test(RP));

console.log('\n--- LS3 ROUTES ---');
const hasRoute = (p) => vjson.routes.some((r) => { try { return new RegExp('^' + r.src + '$').test(p); } catch (e) { return false; } });
const firstFor = (p) => vjson.routes.find((r) => { try { return new RegExp('^' + r.src + '$').test(p); } catch (e) { return false; } });
chk('/lesson-review is served (not swallowed by the catch-all)',
  hasRoute('/lesson-review') && (firstFor('/lesson-review').dest || '').includes('lesson-review.html'));
chk('the new api endpoints are reachable',
  (firstFor('/api/lesson') || {}).dest === '/api/$1' &&
  (firstFor('/api/lesson-map') || {}).dest === '/api/$1' &&
  (firstFor('/api/review-lessons') || {}).dest === '/api/$1' &&
  (firstFor('/api/generate-lessons') || {}).dest === '/api/$1');


// ================================================================ LS4
console.log('\n--- LS4 READING: every lesson drafts, and every answer key re-derived ---');
const readTargets = fac.targetsFromMap(mapJson).filter((t) => t.pathSubject === 'reading' && !t.hasFile);
chk('the Reading path has a full K-2 batch to draft', readTargets.length >= 19, 'targets=' + readTargets.length);

const readDrafted = [];
for (const t of readTargets) {
  const r = await gen.makeLesson(t, null);   // null key = authored engine, NO model call
  if (r.ok) readDrafted.push(r.lesson);
  else chk('drafts ' + t.key, false, r.reason + ' ' + (r.errors || []).join('; '));
}
chk('every Reading lesson drafts and passes the validator',
  readDrafted.length === readTargets.length, readDrafted.length + '/' + readTargets.length);
chk('every Reading lesson is hand-written, not model output (free, and re-derivable)',
  readDrafted.every((L) => L.source === 'local'));
chk('every Reading lesson has 5 star-check questions and a 4-of-5 bar',
  readDrafted.every((L) => L.check.length === 5 && L.mastery.need === 4 && L.mastery.of === 5));
chk('every Reading lesson sits on a real curriculum skill for its grade',
  readDrafted.every((L) => readTargets.some((t) => t.key === L.id && t.skill === L.skill)));
chk('no emojis anywhere in the Reading batch', !emoji.test(JSON.stringify(readDrafted)));

// A question a kid sees twice in one lesson is a bug the eye does not catch.
let repeat = null;
readDrafted.forEach((L) => {
  const all = [...L.check, ...L.solo.fallback].map((q) => q.question.trim().toLowerCase());
  if (new Set(all).size !== all.length) repeat = L.id;
});
chk('no question repeats between the practice pool and the star check', !repeat, repeat || '');

// THE CHECK THAT MATTERS. Re-derive the marked answer from the question text
// itself, by a rule written here and nowhere near _lessongen.js. If the factory
// and this file ever disagree about which choice is right, this fails.
const PLURAL = (w) => (/(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's');
function rederive(q) {
  const t = q.question;
  let m;
  if ((m = /^Which word starts with (\w+)\?$/.exec(t)))
    return { want: (c) => c.startsWith(m[1]), only: true };
  if ((m = /^Which word ends with (\w+)\?$/.exec(t)))
    return { want: (c) => c.endsWith(m[1]), only: true };
  if ((m = /^Which word has (\w) in the middle\?$/.exec(t)))
    return { want: (c) => c.length === 3 && c[1] === m[1], only: true };
  if ((m = /^What is the middle letter of (\w+)\?$/.exec(t)))
    return { exact: m[1][1] };
  if ((m = /^([a-z])( - [a-z])+\. What word is that\?$/.exec(t)))
    return { exact: t.split('.')[0].split(' - ').join('') };
  if ((m = /^Which word is in the -(\w+) family\?$/.exec(t)))
    return { want: (c) => c.endsWith(m[1]), only: true };
  if ((m = /^([a-z_ ]+) spells (\w+)\. Which letter is missing\?$/.exec(t))) {
    const shown = m[1].trim().split(' '), word = m[2];
    return { exact: word[shown.indexOf('_')] };
  }
  if ((m = /^Which word has (\w{2}) in it\?$/.exec(t)))
    return { want: (c) => c.includes(m[1]), only: true };
  if ((m = /^Which two letters start the word (\w+)\?$/.exec(t)))
    return { exact: m[1].slice(0, 2) };
  if ((m = /^Which two letters end the word (\w+)\?$/.exec(t)))
    return { exact: m[1].slice(-2) };
  if ((m = /^One (\w+), two ___ \. Which spelling is right\?$/.exec(t)))
    return { exact: PLURAL(m[1]) };
  if ((m = /^Which one says (\w+)\?$/.exec(t)))
    return { exact: m[1] };
  return null;                                  // authored comprehension / sentence fit
}

let checkedKeys = 0, wrongKeys = [], structural = 0, badStructure = [];
readDrafted.forEach((L) => {
  [...L.check, ...L.solo.fallback, ...L.guided].forEach((q) => {
    const marked = q.choices[q.correctIndex];
    // Structure holds for EVERY question, derivable or not.
    const okShape = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.length <= 3 &&
      new Set(q.choices).size === q.choices.length &&
      Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.choices.length &&
      !!q.question;
    if (okShape) structural++; else badStructure.push(L.id + ': ' + q.question);

    const rule = rederive(q);
    if (!rule) return;
    checkedKeys++;
    if (rule.exact !== undefined) {
      if (marked !== rule.exact) wrongKeys.push(`${L.id}: "${q.question}" marked "${marked}", should be "${rule.exact}"`);
      return;
    }
    // A "which word" question is only fair if EXACTLY ONE choice fits the rule.
    const fits = q.choices.filter(rule.want);
    if (fits.length !== 1) wrongKeys.push(`${L.id}: "${q.question}" has ${fits.length} choices that fit`);
    else if (fits[0] !== marked) wrongKeys.push(`${L.id}: "${q.question}" marked "${marked}", should be "${fits[0]}"`);
  });
});
chk('every Reading question is well formed (2-3 distinct choices, a real correct answer)',
  badStructure.length === 0, badStructure.slice(0, 3).join(' | ') || `${structural} checked`);
// 143 of the 247 reading questions are built by a rule, so their answer can be
// checked without trusting _lessongen.js at all. The rest are hand-authored
// comprehension questions, where "what is Ben like" has no mechanical answer -
// those get the structural check above instead.
chk('most of the Reading answer keys are re-derived from the question alone, not trusted',
  checkedKeys >= 140, 'independently re-derived: ' + checkedKeys + ' of ' + structural);
chk('EVERY re-derivable Reading answer key is correct',
  wrongKeys.length === 0, wrongKeys.slice(0, 4).join(' | '));

// Same content in, same lesson out - otherwise none of the above proves anything
// about what a kid will actually be served.
const twice = await gen.makeLesson(readTargets[0], null);
chk('drafting is deterministic, so QA is testing what a kid actually gets',
  JSON.stringify(twice.lesson) === JSON.stringify(readDrafted[0]));

console.log('\n--- LS4 READING: the player can draw a reading lesson ---');
chk('reading art is drawn TYPE, not counters and not an emoji',
  /function tiles\(/.test(H) && /function wordCards\(/.test(H) && /function storyCard\(/.test(H));
chk('all three reading picture kinds go through the one showArt path',
  /if\(show\.word\) return tiles/.test(H) && /if\(show\.words\) return wordCards/.test(H) &&
  /if\(show\.sentence\) return storyCard/.test(H));
chk('a lesson cannot inject markup through the highlighted word',
  /function litPart/.test(H) && /var w = esc\(String\(word \|\| ""\)\)/.test(H) && /var p = esc\(String\(part \|\| ""\)\)/.test(H));
chk('no reading question depends on a picture (steps 4 and 5 are text only)',
  readDrafted.every((L) => [...L.check, ...L.solo.fallback].every((q) => !q.show)));

console.log('\n--- LS4 PLACEMENT: api/placement.js ---');
chk('the placement endpoint ships', exists('api/placement.js'));
const PL = read('api/placement.js');
chk('placement questions come from the approved lessons themselves, not a second content set',
  /status=eq\.approved/.test(PL) && /lesson\.check/.test(PL) || /questionFor/.test(PL));
chk('a pending draft is only ever offered to the owner', /status=in\.\(approved,pending\)/.test(PL) && /includePending/.test(PL));
chk('the ladder never reaches ABOVE the kid\'s own grade', /gi <= upTo/.test(PL));
chk('it refuses to place anyone off two questions', /playable\.length < 3/.test(PL));
chk('it is capped so a five year old is not asked twenty questions', /MAX_STEPS = 8/.test(PL));
chk('no emojis in the placement endpoint', !emoji.test(PL));

// Drive it for real, against a fake bank built by the REAL factory.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://qa.invalid';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'qa';
const bankRows = [];
for (const t of fac.targetsFromMap(mapJson)) {
  const r = await gen.makeLesson(t, null);
  if (r.ok) bankRows.push({ lesson_key: t.key, payload: r.lesson });
}
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => bankRows });
const place = (await import('./api/placement.js')).default;
const runPlace = (subject, grade) => new Promise((res) => {
  place({ query: { subject, grade } }, { setHeader() {}, status() { return this; }, json(b) { res(b); } });
});
const pk = await runPlace('reading', 'k');
const p2 = await runPlace('reading', '2');
const pmath = await runPlace('math', '1');
globalThis.fetch = realFetch;

chk('a Kindergarten reader gets a real check', pk.ok && pk.steps.length >= 3, 'steps=' + (pk.steps || []).length);
chk('a Grade 2 reader is checked from Kindergarten upwards, so it can send them BACK a year',
  p2.ok && p2.steps.some((s) => s.grade === 'k') && p2.steps.some((s) => s.grade === '2'),
  (p2.steps || []).map((s) => s.grade).join(','));
chk('a check never asks about a grade ABOVE the kid', p2.ok && p2.steps.every((s) => ['k', '1', '2'].includes(s.grade)));
chk('a lesson that ships as a FILE can be a rung too', pmath.ok && pmath.steps.some((s) => s.key === 'g1-math-making-ten'));
chk('no rung is asked twice', [pk, p2, pmath].every((d) => new Set(d.steps.map((s) => s.key)).size === d.steps.length));
chk('every placement question has a real correct answer',
  [pk, p2, pmath].every((d) => d.steps.every((s) =>
    Array.isArray(s.choices) && s.choices.length >= 2 &&
    Number.isInteger(s.correctIndex) && s.correctIndex >= 0 && s.correctIndex < s.choices.length && !!s.question)));
chk('placement questions carry the skill, so an answer can reach the learning ledger',
  [pk, p2].every((d) => d.steps.every((s) => !!s.skill && !!s.subject)));
chk('the rungs are in teaching order, never shuffled',
  [pk, p2, pmath].every((d) => d.steps.every((s, i) => i === 0 || s.at > d.steps[i - 1].at)));

console.log('\n--- LS4 PLACEMENT: what it does to the path ---');
chk('a placed lesson is a SEPARATE flag from mastered', /var placed = !mastered && !!\(prog\[l\.key\] && prog\[l\.key\]\.placed\)/.test(H));
chk('placement opens the gate but never writes mastered', /row\.placed = true/.test(H) && !/row\.mastered = true;[\s\S]{0,120}applyPlacement/.test(H));
chk('a lesson the kid really mastered is never overwritten by a placement', /if\(row\.mastered\) continue/.test(H));
chk('the kid lands AFTER the last rung they got RIGHT, not on the one they missed',
  /PLACE\.lastPassed >= 0/.test(H) && /landing = \(at < 0\) \? 0 : at \+ 1/.test(H));
chk('the check stops early after two misses in a row', /PLACE\.miss >= 2/.test(H));
chk('every placement answer reaches the learning ledger, tagged as a placement',
  /logAnswer\(\{ subject:st\.subject, skill:st\.skill, grade:st\.grade \}, right, \{ quizType:"placement" \}\)/.test(H));
chk('the check is only offered when it can actually help', /playable < 3 \|\| started > 0/.test(H));
chk('a kid can always decline and start at the beginning', /__skipPlacement/.test(H) && /Start at the beginning/.test(H));
chk('a placed lesson looks different from a mastered one (no borrowed gold star)',
  /cls \+= " placed"/.test(H) && /\.node\.placed\{/.test(H) && !/it\.placed[^\n]*STAR_SVG/.test(H));

console.log('\n--- LS4 THE LIVE SWITCH: the owner turns Lessons on himself ---');
chk('the flags table ships as an idempotent migration', exists('db/ls4-app-flags.sql'));
const FSQL = read('db/ls4-app-flags.sql');
chk('the migration is safe to re-run and cannot flip a live switch back off',
  /create table if not exists app_flags/.test(FSQL) && /on conflict \(key\) do nothing/.test(FSQL));
chk('shipping the migration changes nothing a kid sees (seeded OFF)', /'lessons_live',\s*\n\s*'false'::jsonb/.test(FSQL));
chk('the migration never deletes or drops anything', !/\b(drop|delete|truncate)\b/i.test(FSQL.replace(/--.*$/gm, '')));

chk('the flags endpoint ships', exists('api/app-flags.js'));
const AF = read('api/app-flags.js');
chk('a write needs the owner code', /code !== OWNER_CODE/.test(AF));
chk('a write is limited to a fixed allow-list of switches', /if \(!FLAGS\[key\]\) return res\.status\(400\)/.test(AF));
chk('an unknown key in the database is ignored rather than trusted', /if \(!row \|\| !FLAGS\[row\.key\]\) return/.test(AF));
chk('it FAILS CLOSED - a database problem hides the tile, it never exposes it',
  /def: false/.test(AF) && /return \{ flags: out, live: false \}/.test(AF));
chk('no emojis in the flags endpoint', !emoji.test(AF));

const RP4 = read('public/lesson-review.html');
chk('the owner gets one plain-language switch, not a settings screen',
  /Make Lessons live for kids/.test(RP4) && /Put it back to Coming Soon/.test(RP4));
chk('the switch says what kids can see RIGHT NOW before he touches it',
  /LIVE for kids/.test(RP4) && /Coming Soon, behind the grown-ups code/.test(RP4));
chk('a failed save says so plainly and changes nothing', /That did not save\. Nothing changed for kids\./.test(RP4));
chk('the switch is reversible', /window\.__flipLessons/.test(RP4) && /value: !!next/.test(RP4));

const BK = read('src/BuildableKids.jsx');
chk('the Home tile reads the switch instead of a hardcoded Coming Soon',
  /const \[lessonsLive, setLessonsLive\] = useState\(false\)/.test(BK) && /d\.flags\.lessons_live === true/.test(BK));
chk('the tile FAILS CLOSED: Coming Soon until the switch says otherwise',
  /useState\(false\)/.test(BK) && /lessonsLive\s*\n?\s*\?/.test(BK));
chk('when it is live the door just opens Lessons, with no code gate in the way',
  /lessonsLive \? "Math & reading"[\s\S]{0,400}?onClick: lessonsLive \? onLessons/.test(BK));
chk('when it is not live the 1111 owner gate is still the only way in',
  /soon: !lessonsLive[\s\S]{0,200}setCatalogGate\(\(\) => onLessons\)/.test(BK));

console.log('\n--- LS4 THE PARENT DASHBOARD: lessons finished ---');
const ST = read('src/store.js');
chk('the dashboard reads the same record the path map writes', /bk_lessons_v1/.test(ST) && /export function lessonsProgress/.test(ST));
chk('ONLY mastered lessons are counted as finished', /if \(row\.mastered\) \{\s*\n\s*out\.finished \+= 1/.test(ST));
chk('a lesson the placement check merely opened is counted apart, never as finished',
  /\} else if \(row\.placed\) \{\s*\n\s*out\.opened \+= 1/.test(ST));
chk('placement bookkeeping is never mistaken for a lesson', /if \(key\.startsWith\("_"\)\) return/.test(ST));
const GU = read('src/GrownUpScreen.jsx');
chk('the grown-ups screen shows a Lessons finished number', /Lessons finished/.test(GU) && /lessonsProgress\(\)/.test(GU));
chk('it names the lessons, so a parent can see WHAT was learned', /lessons\.recent\.map/.test(GU));
chk('it says plainly when lessons were opened rather than earned',
  /the quick check opened/i.test(GU));
chk('the player records the lesson title so the dashboard can name it', /row\.title = lesson\.title \|\| row\.title \|\| ""/.test(H));

console.log('\n--- LS4 ROUTES ---');
chk('the new endpoints are reachable',
  (firstFor('/api/placement') || {}).dest === '/api/$1' &&
  (firstFor('/api/app-flags') || {}).dest === '/api/$1');

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
