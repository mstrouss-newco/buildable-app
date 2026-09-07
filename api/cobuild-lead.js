// /api/cobuild-lead.js  POST {kind:"click"|"lead", plan, source, email, kidName, kidAge, gameIdea, deviceId}
// Fake-door test for buildablekids.com/cobuild. Logs button clicks and waitlist sign-ups.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }
const S = (v, n) => (v == null ? null : String(v).slice(0, n));


// ---------------------------------------------------------------------------
//  CB4 — TELLING THE WAITLIST THE DOOR IS OPEN.
//
//  The fake door has been taking names. The day cobuild_live is switched on, the
//  people who left one should hear about it, once, in the order they signed up.
//
//    POST { op:"notify", code, send? , limit? }
//      -> { ok, would:[...], sent, skipped }
//
//  IT DOES NOT SEND UNLESS ASKED TWICE. The owner code must be right AND send
//  must be exactly true; anything else is a DRY RUN that returns who WOULD be
//  emailed and changes nothing. Emailing real people is not something to do by
//  accident, and a dry run is the only way to see the list first.
//
//  Nobody is emailed twice: a row is stamped notified_at as it goes out, and
//  rows already stamped are skipped for good.
const OWNER_CODE = process.env.OWNER_PREVIEW_CODE || "1025";
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Buildable <hello@buildablekids.com>";

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
const esc = (s) => String(s == null ? "" : s).replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m]));
function letter(row, spot) {
  const kid = (row.kid_name || "").trim();
  return `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.6;color:#1b1830">
<p>Hello,</p>
<p>You asked to be told when Buildable Cobuild opened. It is open now, and you are number ${spot} on the list.</p>
${kid ? `<p>${esc(kid)} tells us what their game is about, and a game appears that they can play, change and keep.</p>` : ""}
<p><a href="https://buildablekids.com/cobuild" style="color:#7C5CFC;font-weight:700">Start building</a></p>
<p style="color:#6b6588;font-size:14px">If this is not for you, ignore this and we will not write again.</p>
</div>`;
}

async function notify(b, res) {
  const code = String(b.code || "").trim();
  if (!code || code !== OWNER_CODE) return res.status(403).json({ ok: false, error: "wrong code" });
  const limit = Math.max(1, Math.min(500, parseInt(b.limit, 10) || 200));
  const r = await fetch(`${URL}/rest/v1/cobuild_leads?kind=eq.lead&notified_at=is.null&email=not.is.null&select=id,email,kid_name,created_at&order=created_at.asc&limit=${limit}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  const list = Array.isArray(rows) ? rows : [];
  const dry = b.send !== true;
  if (dry) return res.status(200).json({ ok: true, dry: true, would: list.map((x) => x.email), count: list.length,
    note: RESEND_KEY ? "pass send:true to really send" : "no email key is set, so nothing could be sent yet" });
  if (!RESEND_KEY) return res.status(200).json({ ok: false, reason: "no_email_key", count: list.length });
  let sent = 0, skipped = 0;
  for (let i = 0; i < list.length; i++) {
    const okSent = await sendEmail(list[i].email, "Buildable Cobuild is open", letter(list[i], i + 1));
    if (!okSent) { skipped++; continue; }
    sent++;
    await fetch(`${URL}/rest/v1/cobuild_leads?id=eq.${encodeURIComponent(list[i].id)}`, {
      method: "PATCH", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notified_at: new Date().toISOString() }) });
  }
  return res.status(200).json({ ok: true, sent, skipped, count: list.length });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(503).json({ error: "not configured" });
  const b = await readBody(req);
  if (b.op === "notify") return notify(b, res);
  const kind = b.kind === "lead" ? "lead" : "click";
  if (kind === "lead" && !(b.email || "").includes("@")) return res.status(400).json({ error: "email required" });
  const row = {
    kind, plan: S(b.plan, 40), source: S(b.source, 40),
    email: kind === "lead" ? S(b.email, 200).trim().toLowerCase() : null,
    kid_name: S(b.kidName, 60), kid_age: S(b.kidAge, 10), game_idea: S(b.gameIdea, 1000),
    device_id: S(b.deviceId, 80), referrer: S(req.headers.referer, 300), user_agent: S(req.headers["user-agent"], 300),
  };
  try {
    const r = await fetch(`${URL}/rest/v1/cobuild_leads`, { method: "POST", headers: H, body: JSON.stringify(row) });
    if (!r.ok) return res.status(500).json({ error: "save failed" });
    return res.status(200).json({ ok: true });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
