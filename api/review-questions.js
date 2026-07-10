// /api/review-questions.js
// ==================================================================
// The REVIEW GATE surface (Session 8A). Lets a grown-up see questions the
// weekly factory dropped into question_bank as 'pending' and approve or reject
// them. Only 'approved' rows are ever served to a kid (generate-quiz.js). This
// is what makes "nothing enters the bank without the review step" real.
//
//   GET  /api/review-questions                 -> { ok, counts, questions:[pending...] }
//   GET  /api/review-questions?status=approved -> list a different status
//   GET  /api/review-questions?subject=math&grade=2&limit=100
//   POST { op:'approve', id | ids:[...], reviewer } -> promote to approved
//   POST { op:'reject',  id | ids:[...], reviewer } -> mark rejected (kept, not served)
//
// Uses the service key server-side (like planner.js / generate-quiz.js); the
// page keeps a light PIN gate for privacy. Never deletes rows (guardrail:
// no destructive ops). Dormant ok:false if SUPABASE env is missing. No emojis.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.
// ==================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const STATUSES = new Set(["pending", "approved", "rejected"]);

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);

async function counts() {
  const out = { pending: 0, approved: 0, rejected: 0 };
  await Promise.all([...STATUSES].map(async (st) => {
    try {
      const r = await fetch(`${URL}/rest/v1/question_bank?status=eq.${st}&select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
      const cr = r.headers.get("content-range") || "";
      const total = parseInt((cr.split("/")[1] || "0"), 10);
      out[st] = Number.isFinite(total) ? total : 0;
    } catch {}
  }));
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !KEY) return res.status(200).json({ ok: false, error: "no supabase env", hint: "set SUPABASE_URL + SUPABASE_SERVICE_KEY" });

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      const status = STATUSES.has(String(q.status)) ? String(q.status) : "pending";
      const limit = Math.max(1, Math.min(300, parseInt(q.limit, 10) || 100));
      let path = `question_bank?status=eq.${status}&select=id,grade,subject,skill,quiz_type,payload,source,game_theme,created_at&order=created_at.desc&limit=${limit}`;
      if (q.subject) path += `&subject=eq.${encodeURIComponent(clip(q.subject, 20))}`;
      if (q.grade) path += `&grade=eq.${encodeURIComponent(clip(q.grade, 4))}`;
      const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
      if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, status: r.status, hint: "run db/6b-question-bank.sql and db/8a-question-bank-review.sql", detail: d.slice(0, 160) }); }
      const questions = await r.json();
      return res.status(200).json({ ok: true, counts: await counts(), questions });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const op = String(body.op || "");
      if (op !== "approve" && op !== "reject") return res.status(400).json({ ok: false, error: "op must be approve or reject" });
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).filter(Boolean).map((x) => String(x));
      if (!ids.length) return res.status(400).json({ ok: false, error: "no id(s)" });
      const status = op === "approve" ? "approved" : "rejected";
      const reviewer = clip(body.reviewer || "grown-up", 60);
      const inList = ids.map((x) => `"${x}"`).join(",");
      const r = await fetch(`${URL}/rest/v1/question_bank?id=in.(${inList})`, {
        method: "PATCH",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewer }),
      });
      if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, status: r.status, detail: d.slice(0, 160) }); }
      const updated = await r.json().catch(() => []);
      return res.status(200).json({ ok: true, op, updated: Array.isArray(updated) ? updated.length : 0, counts: await counts() });
    }

    return res.status(405).json({ ok: false, error: "GET or POST only" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e).slice(0, 160) });
  }
}
