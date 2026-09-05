// /api/cobuild-lead.js  POST {kind:"click"|"lead", plan, source, email, kidName, kidAge, gameIdea, deviceId}
// Fake-door test for buildablekids.com/cobuild. Logs button clicks and waitlist sign-ups.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };
function readBody(req) { if (req.body && typeof req.body === "object") return Promise.resolve(req.body); return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); }); }
const S = (v, n) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL || !KEY) return res.status(503).json({ error: "not configured" });
  const b = await readBody(req);
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
