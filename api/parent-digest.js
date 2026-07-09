// /api/parent-digest.js
// ==================================================================
// Weekly parent email digest (Session 6B). For each parent account with an
// email, summarize the last 7 days of each kid's LEARNING (from learning_events)
// and PLAY (from kid_game_events), and send ONE friendly email via Resend.
// Parents with no kid activity in the window are skipped (no spam).
//
// Trigger: a weekly Vercel Cron hits GET /api/parent-digest (see vercel.json
// "crons"). Manual/QA: GET /api/parent-digest?dry=1 returns the composed
// summaries as JSON WITHOUT sending. Add ?parentId=<id> to limit to one family.
//
// Safety: dormant (ok:false) if RESEND_API_KEY is unset. If CRON_SECRET is set,
// callers must send Authorization: Bearer <CRON_SECRET> (Vercel Cron does this
// automatically). No emojis anywhere (product rule).
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required); RESEND_API_KEY, RESEND_FROM,
//      APP_URL, CRON_SECRET (optional).
// ==================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Buildable <hello@buildablekids.com>";
const APP_URL = process.env.APP_URL || "https://buildablekids.com";
const CRON_SECRET = process.env.CRON_SECRET;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const SUBJECT_LABEL = { math: "Math", geometry: "Shapes", spelling: "Spelling", reading: "Reading" };

async function sb(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}
function pct(right, total) { return total ? Math.round((right / total) * 100) : 0; }
function sevenDaysAgoISO() { return new Date(Date.now() - 7 * 86400000).toISOString(); }

// Build a per-kid summary from raw events. Returns null when the kid was idle.
function summarizeKid(kid, learn, play) {
  const answered = learn.length;
  const correct = learn.filter((e) => e.correct).length;
  const bySub = {};
  learn.forEach((e) => {
    const s = e.subject || "other";
    bySub[s] = bySub[s] || { right: 0, total: 0 };
    bySub[s].total += 1; if (e.correct) bySub[s].right += 1;
  });
  const subjects = Object.keys(bySub);
  let strongest = null, needsPractice = null;
  subjects.forEach((s) => {
    const acc = pct(bySub[s].right, bySub[s].total);
    if (strongest == null || acc > strongest.acc) strongest = { s, acc };
    if (needsPractice == null || acc < needsPractice.acc) needsPractice = { s, acc };
  });
  const plays = play.filter((e) => e.event === "play").length;
  const gameCount = {};
  play.forEach((e) => { if (e.event === "play") gameCount[e.game] = (gameCount[e.game] || 0) + 1; });
  let favorite = null;
  Object.keys(gameCount).forEach((g) => { if (!favorite || gameCount[g] > favorite.n) favorite = { g, n: gameCount[g] }; });
  if (answered === 0 && plays === 0) return null;
  return {
    name: kid.name, answered, correct, accuracy: pct(correct, answered),
    strongest: strongest && strongest.s !== "other" ? SUBJECT_LABEL[strongest.s] || strongest.s : null,
    needsPractice: needsPractice && needsPractice.s !== "other" ? SUBJECT_LABEL[needsPractice.s] || needsPractice.s : null,
    plays, favorite: favorite ? favorite.g : null,
  };
}

function kidHtml(k) {
  const lines = [];
  lines.push(`<h3 style="margin:18px 0 6px;color:#5b3aa6;font-family:Arial,sans-serif">${k.name}</h3>`);
  if (k.answered > 0) {
    lines.push(`<p style="margin:4px 0;font-family:Arial,sans-serif;color:#333">Practiced <b>${k.answered}</b> questions and got <b>${k.correct}</b> right (${k.accuracy}%).</p>`);
    if (k.strongest) lines.push(`<p style="margin:4px 0;font-family:Arial,sans-serif;color:#333">Strongest this week: <b>${k.strongest}</b>.</p>`);
    if (k.needsPractice && k.needsPractice !== k.strongest) lines.push(`<p style="margin:4px 0;font-family:Arial,sans-serif;color:#333">Good to practice next: <b>${k.needsPractice}</b>.</p>`);
  } else {
    lines.push(`<p style="margin:4px 0;font-family:Arial,sans-serif;color:#333">No practice questions this week.</p>`);
  }
  if (k.plays > 0) lines.push(`<p style="margin:4px 0;font-family:Arial,sans-serif;color:#333">Played <b>${k.plays}</b> games${k.favorite ? `, favorite was <b>${k.favorite}</b>` : ""}.</p>`);
  return lines.join("");
}
function digestHtml(kids) {
  const body = kids.map(kidHtml).join("");
  return `<div style="max-width:560px;margin:0 auto">
    <h2 style="color:#5b3aa6;font-family:Arial,sans-serif">This week at Buildable</h2>
    <p style="font-family:Arial,sans-serif;color:#444">Here is how your kids have been learning and playing.</p>
    ${body}
    <p style="margin-top:20px"><a href="${APP_URL}/app" style="background:#7c4dff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-family:Arial,sans-serif;font-weight:bold">Open Buildable</a></p>
    <p style="font-family:Arial,sans-serif;color:#999;font-size:12px;margin-top:18px">You can turn learning features and this email on or off in the grown-ups area.</p>
  </div>`;
}
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "GET only" });
  if (!URL || !KEY) return res.status(200).json({ ok: false, reason: "no supabase" });
  if (CRON_SECRET) {
    const a = req.headers.authorization || req.headers.Authorization || "";
    if (a !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ ok: false, reason: "unauthorized" });
  }
  const dry = "dry" in (req.query || {});
  const onlyParent = (req.query && req.query.parentId) || null;
  const since = sevenDaysAgoISO();

  let parents = await sb(`parent_accounts?select=id,email${onlyParent ? `&id=eq.${encodeURIComponent(onlyParent)}` : ""}`);
  parents = (parents || []).filter((p) => p && p.email);
  let sent = 0, composed = 0;
  const preview = [];

  for (const p of parents.slice(0, 500)) {
    const kids = await sb(`kid_profiles?parent_id=eq.${p.id}&select=id,name,grade`);
    const summaries = [];
    for (const kid of kids || []) {
      const learn = await sb(`learning_events?kid_profile_id=eq.${encodeURIComponent(kid.id)}&created_at=gte.${since}&select=subject,correct`);
      const play = await sb(`kid_game_events?kid_profile_id=eq.${encodeURIComponent(kid.id)}&created_at=gte.${since}&select=game,event`);
      const sum = summarizeKid(kid, learn || [], play || []);
      if (sum) summaries.push(sum);
    }
    if (!summaries.length) continue; // nothing happened this week -> no email
    composed += 1;
    const html = digestHtml(summaries);
    if (dry) { preview.push({ to: p.email, kids: summaries }); continue; }
    const ok = await sendEmail(p.email, "This week at Buildable", html);
    if (ok) sent += 1;
  }
  return res.status(200).json({ ok: true, parents: parents.length, composed, sent, dormant: !RESEND_KEY, dry, preview: dry ? preview : undefined });
}
