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
chk('the path locks a lesson until the one before it is mastered',
  /if\(approved && !mastered && !blocked\) blocked = true/.test(H) && /locked = approved && blocked/.test(H));
chk('lock state comes from real mastery in bk_lessons_v1, never a guess',
  /var prog = readProgress\(\)/.test(H) && /prog\[l\.key\] && prog\[l\.key\]\.mastered/.test(H));
chk('planned lessons that are not built yet never block the lesson after them',
  /var approved = \(l\.status === "approved"\) && !!l\.file/.test(H));
const lockedLine = (H.match(/.*cls \+= " locked".*/) || [''])[0];
const soonLine = (H.match(/.*cls \+= " soon".*/) || [''])[0];
chk('a locked or coming-soon lesson has no way to be opened',
  !!lockedLine && !!soonLine && !/onclick/.test(lockedLine) && !/onclick/.test(soonLine) &&
  (H.match(/tap = \x27 onclick="window\.__openLesson/g) || []).length === 2,
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

console.log('\n--- LS2 THE PATH: the Home tile (Coming Soon gated) ---');
const SH = exists('src/BuildableKids.jsx') ? read('src/BuildableKids.jsx') : '';
chk('the shell has a Lessons screen', SH.includes('SCREEN_LESSONS') && SH.includes('function LessonsScreen'));
chk('the Lessons screen frames the lessons page (one page, three screens)',
  /GameFrame title="Lessons" src="\/lessons"/.test(SH));
chk('there is a Lessons tile on Home', /id: "lessons", title: "Lessons"/.test(SH));
chk('the tile is COMING SOON gated, so no kid reaches a lesson before Mike flips it',
  /id: "lessons"[\s\S]{0,320}?sub: "Coming soon"[\s\S]{0,320}?soon: true/.test(SH) &&
  /id: "lessons"[\s\S]{0,400}?setCatalogGate/.test(SH));
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

console.log('\n' + (ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
process.exit(ok ? 0 : 1);
