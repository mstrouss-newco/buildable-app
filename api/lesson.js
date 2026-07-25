// /api/lesson.js
// ==================================================================
// Serves ONE lesson out of lesson_bank to the player (Session LS3).
//
//   GET /api/lesson?key=k-math-add-1              -> approved lessons only
//   GET /api/lesson?key=k-math-add-1&preview=1025 -> also serves a pending draft
//
// THE GATE: without the owner preview code, this endpoint will only ever return
// a row with status='approved'. A pending or rejected lesson answers 404. That
// is what makes "kids never see unapproved lessons" true at the serving layer,
// not just in the UI.
//
// The body it returns is the SAME lesson JSON shape the LS1 player already eats
// from /lessons/{file}.json, so public/lessons.html needs no new rendering code.
// Approved lessons are cached at the edge briefly; previews are never cached.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Dormant (ok:false) without them, so
// the player's static fallback keeps working. No emojis.
// ==================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// The same light owner code the planner and /question-review use. This is a
// privacy gate on a draft, not a credential.
const OWNER_CODE = process.env.OWNER_PREVIEW_CODE || "1025";

export default async function handler(req, res) {
  const q = req.query || {};
  const key = String(q.key || "").trim();
  const preview = String(q.preview || "").trim();
  const isOwner = preview !== "" && preview === OWNER_CODE;

  if (!/^[A-Za-z0-9_-]{2,64}$/.test(key)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ ok: false, error: "bad or missing key" });
  }

  if (!URL || !KEY) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: false, error: "no supabase env" });
  }

  // Approved is the only status a kid can ever reach. The owner preview widens
  // this to pending as well, and never to rejected.
  const statusFilter = isOwner ? "status=in.(approved,pending)" : "status=eq.approved";

  try {
    const r = await fetch(
      `${URL}/rest/v1/lesson_bank?lesson_key=eq.${encodeURIComponent(key)}&${statusFilter}&select=payload,status,title,reviewed_by,reviewed_at&limit=1`,
      { headers: H }
    );
    if (!r.ok) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: false, status: r.status, hint: "run db/ls3-lesson-bank.sql" });
    }
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0];
    if (!row || !row.payload) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).json({ ok: false, error: "not found" });
    }

    // Hand back the lesson itself, with the review state stamped on it so the
    // player can show a clear "draft - not live" banner in preview mode.
    const lesson = { ...row.payload };
    lesson.status = row.status;
    if (row.reviewed_by) lesson.reviewedBy = row.reviewed_by;
    if (row.reviewed_at) lesson.reviewedAt = String(row.reviewed_at).slice(0, 10);
    lesson.fromBank = true;

    // A pending draft must never sit in a shared cache.
    res.setHeader("Cache-Control", row.status === "approved" && !isOwner
      ? "public, max-age=60, stale-while-revalidate=300"
      : "no-store");
    return res.status(200).json(lesson);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: false, error: String(e).slice(0, 120) });
  }
}
