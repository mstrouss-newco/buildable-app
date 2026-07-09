// /api/log-learning-event.js  POST {kidProfileId, deviceId, subject, skill,
//   grade, quizType, correct, questionId?, game?}
// Records ONE quiz answer into learning_events (db/6b-learning-events.sql), the
// backbone for the skills dashboard "over time", streaks, adaptive selection
// (recent misses), and the weekly parent email digest. Best-effort, no auth
// (service key), mirroring log-game-event. Never errors the client.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(200).json({ ok: false });
  const b = await readBody(req);
  if (typeof b.correct !== "boolean") return res.status(400).json({ error: "correct (boolean) required" });
  const row = {
    kid_profile_id: b.kidProfileId ? String(b.kidProfileId) : null,
    subject: b.subject ? String(b.subject).slice(0, 24) : null,
    skill: b.skill ? String(b.skill).slice(0, 60) : null,
    grade: b.grade ? String(b.grade).slice(0, 8) : null,
    quiz_type: b.quizType ? String(b.quizType).slice(0, 24) : null,
    correct: b.correct,
    question_id: b.questionId || null,
    game: b.game ? String(b.game).slice(0, 40) : null,
  };
  try {
    const r = await fetch(`${URL}/rest/v1/learning_events`, { method: "POST", headers: H, body: JSON.stringify(row) });
    if (!r.ok) { const detail = await r.text().catch(() => ""); return res.status(200).json({ ok: false, status: r.status, detail: detail.slice(0, 160) }); }
    return res.status(200).json({ ok: true });
  } catch (e) { return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 120) }); }
}
