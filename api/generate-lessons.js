// /api/generate-lessons.js
// ==================================================================
// THE LESSON FACTORY (Session LS3). Reads the lesson map
// (public/lessons/index.json), finds rows that are still 'planned', drafts a
// complete lesson for each against the api/_curriculum.js skill tags, and
// writes them into lesson_bank as status='pending'.
//
// Nothing here is ever shown to a kid. The review gate (the owner approving on
// /lesson-review) is what promotes a lesson to 'approved', and only approved
// lessons are served by api/lesson.js and api/lesson-map.js. Same rule the
// question factory follows in 8A.
//
// Manual / QA:
//   GET  /api/generate-lessons?dry=1                 -> draft + return, DO NOT write
//   GET  /api/generate-lessons?limit=10              -> cap the batch
//   GET  /api/generate-lessons?subject=math          -> one subject
//   GET  /api/generate-lessons?grade=k               -> one grade (repeatable: k,1)
//   GET  /api/generate-lessons?keys=k-math-add-1,... -> exactly these lessons
//   GET  /api/generate-lessons?redraft=1             -> also redraft keys that
//        already have a pending row (rejected rows are always eligible again)
//   POST { limit, dry, subject, grade, keys, redraft } -> same, via body
//
// PROTOTYPE MODE (2026-07-25): api/_lessonmode.js decides what status a drafted
// lesson is born with. It is currently AUTO-APPROVE, at the owner's request -
// this is a prototype and the point is proving the function, not signing off
// content one lesson at a time. The VALIDATOR still refuses a bad lesson, and
// api/lesson.js still only serves approved rows. Flip AUTO_APPROVE (or set
// LESSON_AUTO_APPROVE=0) to put the review gate back; see that file.
//
// Safety: dormant (ok:false) if SUPABASE env is unset. If CRON_SECRET is set,
// callers must send Authorization: Bearer <CRON_SECRET>. Never deletes or
// overwrites an approved row. No emojis.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (to write); ANTHROPIC_API_KEY (only
//      needed for skills with no authored plan, i.e. reading/spelling);
//      CRON_SECRET (optional).
// ==================================================================
import { SUBJECT_TO_QUIZTYPE, skillsFor } from "./_curriculum.js";
import { readLessonMap } from "./_lessonmap.js";
import { makeLesson, lessonContentHash } from "./_lessongen.js";
import { AUTO_APPROVE, birthStatus, birthReviewer } from "./_lessonmode.js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

// Flatten the map into one target per lesson row, carrying its unit label.
export function targetsFromMap(map) {
  const out = [];
  for (const p of (map && map.paths) || []) {
    (p.units || []).forEach((u, ui) => {
      (u.lessons || []).forEach((l) => {
        out.push({
          key: l.key,
          title: l.title,
          minutes: l.minutes || 5,
          subject: l.subject || p.subject,
          grade: p.grade,
          skill: l.skill,
          quizType: SUBJECT_TO_QUIZTYPE[l.subject || p.subject] || (l.subject || p.subject),
          unit: `Unit ${ui + 1} - ${u.title}`,
          pathSubject: p.subject,
          mapStatus: l.status,
          hasFile: !!l.file,
        });
      });
    });
  }
  return out;
}

// A target is only worth drafting if its skill really exists in the curriculum
// map for that grade. This is the same check qa-lessons.mjs enforces, so a typo
// in the map surfaces here instead of producing an off-curriculum lesson.
function onCurriculum(t) {
  return skillsFor(t.grade, t.subject).includes(t.skill);
}

async function existingRows(keys) {
  if (!keys.length) return {};
  const inList = keys.map((k) => `"${k}"`).join(",");
  try {
    const r = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=in.(${inList})&select=lesson_key,status`, { headers: H });
    if (!r.ok) return {};
    const rows = await r.json();
    const by = {};
    (rows || []).forEach((x) => { by[x.lesson_key] = x.status; });
    return by;
  } catch { return {}; }
}

async function insertPending(rows) {
  if (!rows.length) return 0;
  try {
    const r = await fetch(`${URL}/rest/v1/lesson_bank`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
    });
    if (!r.ok) return 0;
    const back = await r.json().catch(() => []);
    return Array.isArray(back) ? back.length : 0;
  } catch { return 0; }
}

async function logRun(fields) {
  try {
    await fetch(`${URL}/rest/v1/lesson_bank_runs`, {
      method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(fields),
    });
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const q = req.method === "POST" ? await readBody(req) : (req.query || {});
  const dry = String(q.dry || "") === "1" || q.dry === true;
  const redraft = String(q.redraft || "") === "1" || q.redraft === true;
  const limit = Math.max(1, Math.min(40, parseInt(q.limit, 10) || 10));
  const wantSubject = q.subject ? String(q.subject).toLowerCase() : "";
  const wantGrades = q.grade ? String(q.grade).toLowerCase().split(",").map((s) => s.trim()).filter(Boolean) : [];
  const wantKeys = q.keys ? String(q.keys).split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (!dry && (!URL || !KEY)) {
    return res.status(200).json({ ok: false, error: "no supabase env", hint: "set SUPABASE_URL + SUPABASE_SERVICE_KEY, or call with dry=1" });
  }

  const map = await readLessonMap();
  if (!map) return res.status(200).json({ ok: false, error: "could not read public/lessons/index.json" });

  let targets = targetsFromMap(map);

  // Never redraft a lesson that already ships as a reviewed FILE (LS1's
  // g1-making-ten). Replace first, remove second: the file keeps serving.
  targets = targets.filter((t) => !t.hasFile);

  if (wantKeys.length) targets = targets.filter((t) => wantKeys.includes(t.key));
  if (wantSubject) targets = targets.filter((t) => t.pathSubject === wantSubject || t.subject === wantSubject);
  if (wantGrades.length) targets = targets.filter((t) => wantGrades.includes(String(t.grade)));

  const offCurriculum = targets.filter((t) => !onCurriculum(t)).map((t) => `${t.key} (${t.grade}/${t.subject}/${t.skill})`);
  targets = targets.filter(onCurriculum);

  // Skip keys we already drafted, unless asked to redraft. An APPROVED row is
  // never touched, ever - that is live kid-facing content.
  let skipped = [];
  if (!dry) {
    const have = await existingRows(targets.map((t) => t.key));
    targets = targets.filter((t) => {
      const st = have[t.key];
      if (!st) return true;
      if (st === "approved") { skipped.push(`${t.key} (already approved)`); return false; }
      if (st === "pending" && !redraft) { skipped.push(`${t.key} (already drafted)`); return false; }
      return true; // rejected, or pending with redraft=1
    });
  }

  const batch = targets.slice(0, limit);
  if (!batch.length) {
    return res.status(200).json({
      ok: true, requested: limit, generated: 0, inserted: 0,
      note: "nothing left to draft with those filters", skipped, offCurriculum,
    });
  }

  // Draft in small waves so a run stays inside the function time budget. The
  // authored engine is instant; only model-drafted lessons cost time.
  const made = [];
  const failures = [];
  const wave = 4;
  for (let i = 0; i < batch.length; i += wave) {
    const slice = batch.slice(i, i + wave);
    const results = await Promise.all(slice.map((t) => makeLesson(t, ANTHROPIC_KEY).catch((e) => ({ ok: false, reason: String(e).slice(0, 80) }))));
    results.forEach((r, j) => {
      if (r && r.ok) made.push({ target: slice[j], lesson: r.lesson, source: r.source, hash: r.hash });
      else failures.push({ key: slice[j].key, reason: (r && r.reason) || "unknown", errors: (r && r.errors) || [] });
    });
  }

  const bySource = made.reduce((acc, m) => { acc[m.source] = (acc[m.source] || 0) + 1; return acc; }, {});

  if (dry) {
    return res.status(200).json({
      ok: true, dry: true, requested: limit, generated: made.length,
      bySource, failures, skipped, offCurriculum,
      lessons: made.map((m) => m.lesson),
    });
  }

  const rows = made.map((m) => ({
    lesson_key: m.lesson.id,
    grade: m.lesson.grade,
    subject: m.lesson.subject,
    skill: m.lesson.skill,
    title: m.lesson.title,
    unit: m.lesson.unit,
    minutes: m.lesson.minutes,
    payload: m.lesson,
    source: m.source,
    status: birthStatus(),
    reviewed_at: AUTO_APPROVE ? new Date().toISOString() : null,
    reviewed_by: birthReviewer(),
    content_hash: m.hash || lessonContentHash(m.lesson),
  }));

  const inserted = await insertPending(rows);
  await logRun({
    requested: limit, generated: made.length, inserted, by_source: bySource,
    note: [wantSubject && `subject=${wantSubject}`, wantGrades.length && `grades=${wantGrades.join(",")}`, redraft && "redraft"].filter(Boolean).join(" ") || null,
  });

  return res.status(200).json({
    ok: true, requested: limit, generated: made.length, inserted,
    bySource, failures, skipped, offCurriculum,
    keys: rows.map((r) => r.lesson_key),
    mode: AUTO_APPROVE ? "auto-approve (prototype)" : "review required",
    next: AUTO_APPROVE
      ? "Prototype mode: these are already live on the Lessons path. Read or take any of them back down at /lesson-review."
      : "Review them at /lesson-review. Nothing reaches a kid until you approve it.",
  });
}
