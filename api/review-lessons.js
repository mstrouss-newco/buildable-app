// /api/review-lessons.js
// ==================================================================
// THE LESSON REVIEW GATE (Session LS3). The grown-up surface behind
// /lesson-review. Mirrors api/review-questions.js, with one addition: the owner
// can EDIT the words of a draft before approving it, so one clumsy sentence
// does not mean throwing the whole lesson away.
//
//   GET  /api/review-lessons                     -> { ok, counts, lessons:[pending] }
//   GET  /api/review-lessons?status=approved
//   GET  /api/review-lessons?subject=math&grade=k&limit=50
//   GET  /api/review-lessons?key=k-math-add-1     -> one lesson, full payload
//   POST { op:'approve', key | keys:[...], reviewer }
//   POST { op:'reject',  key | keys:[...], reviewer }
//   POST { op:'edit', key, patch:{ ...fields... }, reviewer }
//
// The 'edit' op is deliberately NARROW. It can only change wording that is
// already in the lesson: titles, headlines, bodies, question text, choices,
// hints, say lines. It cannot add or remove steps, and it re-runs the SAME
// validator the factory uses, so an edit that breaks the 60-character say rule
// or points correctIndex at nothing is refused with a plain-language reason.
//
// Never deletes rows (guardrail: no destructive ops) - reject keeps the row.
// Uses the service key server-side; the page keeps a light PIN gate.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. No emojis.
// ==================================================================
import { validateLesson, lessonContentHash } from "./_lessongen.js";
import { AUTO_APPROVE } from "./_lessonmode.js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const STATUSES = new Set(["pending", "approved", "rejected"]);

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);
const okKey = (k) => /^[A-Za-z0-9_-]{2,64}$/.test(String(k || ""));

async function counts() {
  const out = { pending: 0, approved: 0, rejected: 0 };
  await Promise.all([...STATUSES].map(async (st) => {
    try {
      const r = await fetch(`${URL}/rest/v1/lesson_bank?status=eq.${st}&select=id`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
      const cr = r.headers.get("content-range") || "";
      const total = parseInt((cr.split("/")[1] || "0"), 10);
      out[st] = Number.isFinite(total) ? total : 0;
    } catch {}
  }));
  return out;
}

// ---------------------------------------------------------------
// The edit whitelist. Anything not listed here is ignored, so a bad or hostile
// patch can never restructure a lesson or smuggle new fields into the payload.
// ---------------------------------------------------------------
function applyPatch(lesson, patch) {
  const L = JSON.parse(JSON.stringify(lesson));
  const str = (v, n) => clip(v, n);

  if (patch.title != null) L.title = str(patch.title, 80);

  if (patch.intro && L.intro) {
    ["buddy", "headline", "body", "cta"].forEach((f) => { if (patch.intro[f] != null) L.intro[f] = str(patch.intro[f], 400); });
    if (Array.isArray(patch.intro.say)) L.intro.say = patch.intro.say.slice(0, 4).map((s) => str(s, 120));
  }

  if (Array.isArray(patch.teach)) {
    patch.teach.forEach((p, i) => {
      if (!p || !L.teach[i]) return;
      ["headline", "body"].forEach((f) => { if (p[f] != null) L.teach[i][f] = str(p[f], 400); });
      if (Array.isArray(p.say)) L.teach[i].say = p.say.slice(0, 5).map((s) => str(s, 120));
    });
  }

  const patchQ = (dst, p) => {
    if (!dst || !p) return;
    if (p.question != null) dst.question = str(p.question, 240);
    if (p.hint != null && dst.hint != null) dst.hint = str(p.hint, 240);
    if (Array.isArray(p.choices) && p.choices.length === (dst.choices || []).length) {
      dst.choices = p.choices.map((c) => str(c, 60));
    }
    if (Number.isInteger(p.correctIndex)) dst.correctIndex = p.correctIndex;
    if (Array.isArray(p.say) && dst.say) dst.say = p.say.slice(0, 4).map((s) => str(s, 120));
  };

  if (Array.isArray(patch.guided)) patch.guided.forEach((p, i) => patchQ(L.guided[i], p));
  if (Array.isArray(patch.check)) patch.check.forEach((p, i) => patchQ(L.check[i], p));
  if (Array.isArray(patch.fallback) && L.solo) patch.fallback.forEach((p, i) => patchQ(L.solo.fallback[i], p));

  if (patch.reteach && L.reteach) {
    ["headline", "body", "cta"].forEach((f) => { if (patch.reteach[f] != null) L.reteach[f] = str(patch.reteach[f], 400); });
  }
  if (patch.mastered && L.mastered && patch.mastered.headline != null) {
    L.mastered.headline = str(patch.mastered.headline, 120);
  }
  return L;
}

// Turn validator output into something a non-technical reader can act on.
function plainErrors(errors) {
  return (errors || []).slice(0, 6).map((e) => {
    if (/over 60 chars/.test(e)) return "One of the read-aloud lines is too long. Keep them under 60 letters.";
    if (/contains \+ or =/.test(e)) return "A read-aloud line has a plus or equals sign. Write it in words, like seven plus three.";
    if (/correctIndex out of range/.test(e)) return "One question has no correct answer marked.";
    if (/duplicate choices/.test(e)) return "One question has the same answer twice.";
    if (/emoji/.test(e)) return "There is an emoji in the text. This product never uses emojis.";
    if (/missing question text/.test(e)) return "One question was left blank.";
    return e;
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !KEY) return res.status(200).json({ ok: false, error: "no supabase env", hint: "set SUPABASE_URL + SUPABASE_SERVICE_KEY" });

  try {
    if (req.method === "GET") {
      const q = req.query || {};

      // One lesson, whole payload, for the review card and the preview link.
      if (q.key) {
        if (!okKey(q.key)) return res.status(400).json({ ok: false, error: "bad key" });
        const r = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=eq.${encodeURIComponent(q.key)}&select=*&limit=1`, { headers: H });
        if (!r.ok) return res.status(200).json({ ok: false, status: r.status });
        const rows = await r.json();
        if (!rows || !rows[0]) return res.status(404).json({ ok: false, error: "not found" });
        return res.status(200).json({ ok: true, lesson: rows[0] });
      }

      const status = STATUSES.has(String(q.status)) ? String(q.status) : "pending";
      const limit = Math.max(1, Math.min(200, parseInt(q.limit, 10) || 60));
      let path = `lesson_bank?status=eq.${status}&select=id,lesson_key,grade,subject,skill,title,unit,minutes,payload,source,status,created_at,updated_at,reviewed_by&order=grade.asc,created_at.asc&limit=${limit}`;
      if (q.subject) path += `&subject=eq.${encodeURIComponent(clip(q.subject, 20))}`;
      if (q.grade) path += `&grade=eq.${encodeURIComponent(clip(q.grade, 4))}`;
      const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
      if (!r.ok) {
        const d = await r.text().catch(() => "");
        return res.status(200).json({ ok: false, status: r.status, hint: "run db/ls3-lesson-bank.sql", detail: d.slice(0, 160) });
      }
      const lessons = await r.json();
      // autoApprove tells the page whether new lessons are arriving live (the
      // 2026-07-25 prototype setting) or waiting on the owner. The page changes
      // what it says and which list it opens on, so it can never imply a review
      // gate that is currently switched off.
      return res.status(200).json({ ok: true, autoApprove: AUTO_APPROVE, counts: await counts(), lessons });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const op = String(body.op || "");
      const reviewer = clip(body.reviewer || "mike", 60);

      if (op === "edit") {
        const key = String(body.key || "");
        if (!okKey(key)) return res.status(400).json({ ok: false, error: "bad key" });
        if (!body.patch || typeof body.patch !== "object") return res.status(400).json({ ok: false, error: "no changes sent" });

        const g = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=eq.${encodeURIComponent(key)}&select=payload,status&limit=1`, { headers: H });
        if (!g.ok) return res.status(200).json({ ok: false, status: g.status });
        const rows = await g.json();
        const row = rows && rows[0];
        if (!row) return res.status(404).json({ ok: false, error: "not found" });

        const edited = applyPatch(row.payload, body.patch);
        const v = validateLesson(edited);
        if (!v.ok) return res.status(200).json({ ok: false, error: "those changes would break the lesson", problems: plainErrors(v.errors) });

        const p = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=eq.${encodeURIComponent(key)}`, {
          method: "PATCH",
          headers: { ...H, Prefer: "return=representation" },
          body: JSON.stringify({
            payload: edited,
            title: edited.title,
            content_hash: lessonContentHash(edited),
            updated_at: new Date().toISOString(),
          }),
        });
        if (!p.ok) { const d = await p.text().catch(() => ""); return res.status(200).json({ ok: false, status: p.status, detail: d.slice(0, 160) }); }
        return res.status(200).json({ ok: true, op: "edit", key, lesson: edited });
      }

      if (op !== "approve" && op !== "reject") return res.status(400).json({ ok: false, error: "op must be approve, reject or edit" });

      const keys = (Array.isArray(body.keys) ? body.keys : [body.key]).filter(Boolean).map(String).filter(okKey);
      if (!keys.length) return res.status(400).json({ ok: false, error: "no lesson key(s)" });
      const status = op === "approve" ? "approved" : "rejected";

      // Approving is the moment a lesson becomes visible to kids, so validate
      // one last time. A draft that cannot pass is never approved.
      if (op === "approve") {
        const inList = keys.map((k) => `"${k}"`).join(",");
        const g = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=in.(${inList})&select=lesson_key,payload`, { headers: H });
        if (g.ok) {
          const rows = await g.json();
          const bad = [];
          (rows || []).forEach((row) => {
            const v = validateLesson(row.payload);
            if (!v.ok) bad.push({ key: row.lesson_key, problems: plainErrors(v.errors) });
          });
          if (bad.length) return res.status(200).json({ ok: false, error: "some lessons are not ready to go live", bad });
        }
      }

      const inList = keys.map((k) => `"${k}"`).join(",");
      const r = await fetch(`${URL}/rest/v1/lesson_bank?lesson_key=in.(${inList})`, {
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
