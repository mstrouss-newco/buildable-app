// /api/lesson-questions.js  (Session LS1 — Lessons)
// -------------------------------------------------------------
// Hands the lesson player its "on your own" questions: N DISTINCT questions for
// ONE exact skill, so a Grade 1 "Making ten" lesson only ever practises
// addition-within-20 and never wanders into another skill.
//
//   GET /api/lesson-questions?subject=math&grade=1&skill=addition-within-20&n=6
//   -> { ok, questions:[{ id?, type, question, choices[], correctIndex, skill, source }],
//        banked, filled, source: "bank" | "mixed" | "local" }
//
// REVIEW GATE (6B/8A rule): the bank half only ever reads status='approved'
// rows, matched on subject + grade + THAT EXACT skill. Nothing pending or
// rejected is ever served to a kid, and we never widen the skill filter to pad
// the count -- a wrong-skill question would corrupt the ledger and the lesson.
//
// NEVER-BLOCKED rule: if the approved bank is short (it will be, until the 8A
// factory batches are reviewed), the remainder is topped up with the SAME local
// generator the rest of the app uses (api/_quizgen.js localForSkill). A kid
// never lands on an empty lesson step. Locally-built questions are marked
// source:"local" so the player can log them honestly and the parent dashboard
// can tell them apart. Local top-ups are NOT written to the bank -- they are
// deterministic arithmetic, not generated content needing review.
//
// Read-only. No auth (same shape as generate-quiz). Dormant without Supabase
// env: it simply returns all-local questions.
// -------------------------------------------------------------
import { localForSkill } from "./_quizgen.js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

const MAX_N = 12;
const VALID_SUBJECT = new Set(["math", "geometry", "spelling", "reading"]);

// A stable-ish signature so we do not hand a kid the same question twice in one
// lesson (bank rows and local rolls both go through this).
function sig(q) {
  return String(q && q.question ? q.question : "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalize(payload, extra) {
  if (!payload || !Array.isArray(payload.choices) || typeof payload.correctIndex !== "number") return null;
  if (payload.correctIndex < 0 || payload.correctIndex >= payload.choices.length) return null;
  const q = {
    type: payload.type || "math",
    question: payload.question || payload.story || "",
    choices: payload.choices.map((c) => String(c)),
    correctIndex: payload.correctIndex,
    skill: payload.skill || null,
    ...extra,
  };
  if (payload.clue) q.clue = payload.clue;
  if (payload.story) q.story = payload.story;
  return q.question ? q : null;
}

// Approved bank rows for this EXACT subject + grade + skill. No widening.
async function fetchApproved({ subject, grade, skill, limit }) {
  if (!URL_ || !KEY) return [];
  const parts = [
    "status=eq.approved",
    `subject=eq.${encodeURIComponent(subject)}`,
    `skill=eq.${encodeURIComponent(skill)}`,
    "select=id,payload,grade,skill",
    `limit=${Math.min(60, Math.max(limit * 4, 20))}`,
  ];
  if (grade) parts.push(`grade=eq.${encodeURIComponent(grade)}`);
  try {
    const r = await fetch(`${URL_}/rest/v1/question_bank?${parts.join("&")}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export default async function handler(req, res) {
  const qy = req.query || {};
  const subject = String(qy.subject || "math").toLowerCase();
  const skill = String(qy.skill || "").trim();
  const grade = qy.grade ? String(qy.grade).toLowerCase().slice(0, 2) : null;
  const n = Math.max(1, Math.min(MAX_N, parseInt(qy.n, 10) || 6));

  if (!VALID_SUBJECT.has(subject)) return res.status(400).json({ ok: false, error: "unknown subject" });
  if (!skill) return res.status(400).json({ ok: false, error: "skill required" });

  const out = [];
  const seen = new Set();

  // 1) Approved bank, exact skill.
  const rows = shuffle(await fetchApproved({ subject, grade, skill, limit: n }));
  for (const row of rows) {
    if (out.length >= n) break;
    const q = normalize(row.payload, { id: row.id, skill: row.skill || skill, source: "bank" });
    if (!q) continue;
    const s = sig(q);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(q);
  }
  const banked = out.length;

  // 2) Top up locally so the kid is never blocked. Deterministic arithmetic
  //    only -- localForSkill returns null for skills it cannot build, and then
  //    we honestly return a short list rather than inventing anything.
  let guard = n * 12;
  while (out.length < n && guard-- > 0) {
    const built = localForSkill(skill);
    if (!built) break;
    const q = normalize(built, { skill, source: "local" });
    if (!q) continue;
    const s = sig(q);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(q);
  }

  const source = banked >= out.length && banked > 0 ? "bank" : banked > 0 ? "mixed" : "local";
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    subject,
    grade,
    skill,
    asked: n,
    banked,
    filled: out.length - banked,
    source,
    questions: out,
  });
}
