// /api/placement.js
// ==================================================================
// THE PLACEMENT CHECK (Session LS4).
//
// A kid's grade says how old they are, not what they can already do. Without
// this, a Grade 2 kid who cannot yet blend three sounds is dropped straight
// into Grade 2 reading, and a Kindergartener who can already count to ten sits
// through four lessons they do not need. This endpoint builds one short,
// friendly check that finds the right rung of the ladder.
//
//   GET /api/placement?subject=reading&grade=1
//   GET /api/placement?subject=math&grade=2&preview=1025   (owner: drafts too)
//
//   -> { ok:true, subject, grade, total, steps:[ {
//          key, title, grade, unit, subject, skill, question, choices,
//          correctIndex, at   // 'at' = the lesson's position in the full path
//        } ] }
//
// WHERE THE QUESTIONS COME FROM: the approved lessons themselves. One question
// per rung, taken from that lesson's own mastery check. This matters for three
// reasons - there is no second body of content to write, nothing extra for the
// owner to review (these questions were already approved as part of a lesson),
// and the check can never drift out of step with the lessons it is placing a
// kid into. As more lessons go live, the ladder grows by itself.
//
// The ladder runs from Kindergarten UP TO the kid's own grade, so placement can
// send a kid back a year as easily as forward. It never reaches above their
// grade: running ahead stays the kid's own choice on the path screen.
//
// Only lessons a kid could actually play are offered - an approved bank row or
// a reviewed file. Fails soft: no Supabase, no bank rungs, still a valid
// response built from whatever ships as a file. No emojis.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (both optional).
// ==================================================================
import { readLessonMap, readLessonFile } from "./_lessonmap.js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const OWNER_CODE = process.env.OWNER_PREVIEW_CODE || "1025";

const GRADE_ORDER = ["k", "1", "2", "3", "4", "5", "6"];
// Eight taps is about as long as a five year old will stay friendly for.
const MAX_STEPS = 8;

const normGrade = (g) => String(g == null ? "" : g).trim().toLowerCase().replace(/^grade\s*/, "") || "k";

async function approvedBank(includePending) {
  if (!URL_ || !KEY) return {};
  const statusFilter = includePending ? "status=in.(approved,pending)" : "status=eq.approved";
  try {
    const r = await fetch(`${URL_}/rest/v1/lesson_bank?${statusFilter}&select=lesson_key,payload`, { headers: H });
    if (!r.ok) return {};
    const rows = await r.json();
    const by = {};
    (Array.isArray(rows) ? rows : []).forEach((x) => { if (x && x.payload) by[x.lesson_key] = x.payload; });
    return by;
  } catch { return {}; }
}

// Flatten every path for this subject from Kindergarten up to the kid's grade,
// in teaching order, keeping only the lessons that are actually playable.
function ladder(map, subject, grade, bank) {
  const top = GRADE_ORDER.indexOf(normGrade(grade));
  const upTo = top < 0 ? GRADE_ORDER.length - 1 : top;
  const rungs = [];
  for (let gi = 0; gi <= upTo; gi++) {
    const g = GRADE_ORDER[gi];
    const path = (map.paths || []).find((p) => p.subject === subject && normGrade(p.grade) === g);
    if (!path) continue;
    (path.units || []).forEach((u) => {
      (u.lessons || []).forEach((l) => {
        const playable = !!l.file || !!bank[l.key];
        rungs.push({ ...l, grade: g, unit: u.title, playable, at: rungs.length });
      });
    });
  }
  return rungs;
}

// Evenly spaced rungs, always including the very first and the very last
// playable lesson, so the check spans the whole ladder instead of clustering.
function spread(list, max) {
  if (list.length <= max) return list.slice();
  const out = [];
  for (let i = 0; i < max; i++) {
    const ix = Math.round((i * (list.length - 1)) / (max - 1));
    if (!out.length || out[out.length - 1] !== list[ix]) out.push(list[ix]);
  }
  return out;
}

// One question per rung, out of that lesson's own mastery check. Rotating which
// of the five we take keeps two siblings from seeing an identical check.
function questionFor(lesson, seed) {
  const check = (lesson && lesson.check) || [];
  if (!check.length) return null;
  const q = check[seed % check.length];
  if (!q || !Array.isArray(q.choices) || !Number.isInteger(q.correctIndex)) return null;
  if (q.correctIndex < 0 || q.correctIndex >= q.choices.length) return null;
  return { question: q.question, choices: q.choices, correctIndex: q.correctIndex };
}

export default async function handler(req, res) {
  const q = req.query || {};
  const subject = String(q.subject || "").trim().toLowerCase();
  const grade = normGrade(q.grade);
  const isOwner = String(q.preview || "").trim() !== "" && String(q.preview).trim() === OWNER_CODE;

  res.setHeader("Cache-Control", "no-store");

  if (!/^[a-z]{2,16}$/.test(subject)) {
    return res.status(400).json({ ok: false, error: "bad or missing subject" });
  }

  const map = await readLessonMap();
  if (!map) return res.status(200).json({ ok: false, error: "could not read the lesson map" });

  const bank = await approvedBank(isOwner);
  const rungs = ladder(map, subject, grade, bank);
  const playable = rungs.filter((r) => r.playable);

  // A check needs something to compare against. Under three playable lessons,
  // the honest answer is "just start at the beginning", not a one-question quiz.
  if (playable.length < 3) {
    return res.status(200).json({ ok: true, subject, grade, total: rungs.length, steps: [], reason: "not enough lessons yet" });
  }

  const chosen = spread(playable, MAX_STEPS);
  const steps = [];
  for (let i = 0; i < chosen.length; i++) {
    const r = chosen[i];
    const lesson = bank[r.key] || (r.file ? await readLessonFile(r.file) : null);
    const built = questionFor(lesson, i + 1);
    if (!built) continue;
    steps.push({
      key: r.key,
      title: r.title,
      grade: r.grade,
      unit: r.unit,
      subject: r.subject || subject,
      skill: r.skill || null,
      at: r.at,
      question: built.question,
      choices: built.choices,
      correctIndex: built.correctIndex,
    });
  }

  return res.status(200).json({ ok: true, subject, grade, total: rungs.length, steps });
}
