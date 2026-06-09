// /api/log-learning.js
// Lets external agents persist a 'learning' into buildable-app's agent_learnings
// table. Mirrors the Supabase REST conventions used by save-game.js.
//
// POST JSON: { source, project?, category?, title, detail?, tags?, meta? }
//   - source and title are required.
// Requires the agent_learnings table (see db/agent-learnings.sql).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Supabase env not configured" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const source = (body.source || "").toString().trim();
  const title  = (body.title  || "").toString().trim();
  if (!source || !title) {
    return res.status(400).json({ error: "source and title are required" });
  }

  const row = {
    source,
    title,
    project:  body.project  != null ? String(body.project)  : null,
    category: body.category != null ? String(body.category) : null,
    detail:   body.detail   != null ? String(body.detail)   : null,
    tags:     Array.isArray(body.tags) ? body.tags.map(String) : null,
    meta:     (body.meta && typeof body.meta === "object") ? body.meta : null,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_learnings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "insert failed", detail: text.slice(0, 500) });
    }
    const data = await r.json();
    return res.status(200).json({ ok: true, learning: Array.isArray(data) ? data[0] : data });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
