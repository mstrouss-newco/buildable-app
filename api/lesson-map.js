// /api/lesson-map.js
// ==================================================================
// The LIVE lesson map (Session LS3). Takes the static map that ships in the
// repo (public/lessons/index.json) and flips any row the owner has APPROVED in
// lesson_bank from 'planned' to 'approved', marking it fromBank so the player
// knows to load it from /api/lesson instead of a static file.
//
// WHY: LS2's map is a file, so before this endpoint existed, making a lesson
// live meant a code push - and the owner cannot push. Now approving a lesson on
// /lesson-review makes it live to kids immediately, no deploy.
//
//   GET /api/lesson-map                 -> the map, approved rows merged in
//   GET /api/lesson-map?preview=1025    -> pending drafts merged in too, marked
//                                          draft:true, for the owner only
//
// Fails SOFT and on purpose: if Supabase is unset or unreachable, it returns the
// static map untouched, so /lessons never breaks. public/lessons.html falls back
// to fetching /lessons/index.json directly if even this call fails.
//
// A row is only ever UPGRADED here (planned -> approved). Nothing is removed and
// an existing approved file row (LS1's g1-making-ten) is never rewritten.
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (both optional). No emojis.
// ==================================================================
import { readLessonMap } from "./_lessonmap.js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const OWNER_CODE = process.env.OWNER_PREVIEW_CODE || "1025";

async function bankRows(includePending) {
  if (!URL || !KEY) return [];
  const statusFilter = includePending ? "status=in.(approved,pending)" : "status=eq.approved";
  try {
    const r = await fetch(
      `${URL}/rest/v1/lesson_bank?${statusFilter}&select=lesson_key,status,title,minutes,reviewed_by,reviewed_at`,
      { headers: H }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export default async function handler(req, res) {
  const q = req.query || {};
  const isOwner = String(q.preview || "").trim() !== "" && String(q.preview).trim() === OWNER_CODE;

  const map = await readLessonMap();
  if (!map) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: false, error: "could not read the lesson map" });
  }

  const rows = await bankRows(isOwner);
  const byKey = {};
  rows.forEach((r) => { byKey[r.lesson_key] = r; });

  let upgraded = 0, drafts = 0;
  for (const p of map.paths || []) {
    for (const u of p.units || []) {
      u.lessons = (u.lessons || []).map((l) => {
        const row = byKey[l.key];
        // A row that already ships as an approved FILE wins - never rewrite it.
        if (!row || l.file) return l;
        if (row.status === "approved") {
          upgraded++;
          return {
            ...l,
            status: "approved",
            fromBank: true,
            minutes: row.minutes || l.minutes,
            reviewedBy: row.reviewed_by || undefined,
            reviewedAt: row.reviewed_at ? String(row.reviewed_at).slice(0, 10) : undefined,
          };
        }
        if (row.status === "pending" && isOwner) {
          drafts++;
          return { ...l, status: "approved", fromBank: true, draft: true, minutes: row.minutes || l.minutes };
        }
        return l;
      });
    }
  }

  map.live = { upgraded, drafts, preview: isOwner };
  // Short cache so an approval shows up on the path within a minute, without
  // hammering the database on every kid's page load. Previews never cache.
  res.setHeader("Cache-Control", isOwner ? "no-store" : "public, max-age=45, stale-while-revalidate=120");
  return res.status(200).json(map);
}
