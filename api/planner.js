// /api/planner.js — Mike's private cross-device "Update Planner" store.
// GET                    -> { ok, tasks:[...], meta:{...} }
// POST { op:'add', task }        -> add a task
// POST { op:'update', id, fields } -> patch a task (e.g. done:true)
// POST { op:'delete', id }        -> remove a task
// POST { op:'meta', data }        -> replace the meta row (settings/sends/custom)
// GET ?scope=tester                -> only tester feedback rows (source='tester')
// Tester adds pass source:'tester' + author; tester edit/delete pass author so
// PostgREST filters restrict them to their OWN feedback rows (edit-your-own).
// Uses the service key server-side (like log-game-event / play-creation), so no
// user auth; the page keeps a light PIN gate for privacy. If the tables aren't
// created yet (db/create-planner-tasks.sql) it returns ok:false with a hint.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const clip = (v, n) => (v == null ? "" : String(v)).slice(0, n);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !KEY) return res.status(200).json({ ok: false, error: "no supabase env" });

  try {
    if (req.method === "GET") {
      const _qs = String(req.url || "").split("?")[1] || "";
      const scope = /(?:^|&)scope=tester(?:&|$)/.test(_qs) ? "tester" : "";
      const tFilter = scope === "tester" ? "select=*&source=eq.tester&order=created_at.asc" : "select=*&order=created_at.asc";
      const [tr, mr] = await Promise.all([
        fetch(`${URL}/rest/v1/planner_tasks?${tFilter}`, { headers: H }),
        fetch(`${URL}/rest/v1/planner_meta?id=eq.1&select=data`, { headers: H }),
      ]);
      if (!tr.ok) { const d = await tr.text().catch(() => ""); return res.status(200).json({ ok: false, status: tr.status, hint: "run db/create-planner-tasks.sql", detail: d.slice(0, 160) }); }
      const tasks = await tr.json();
      let meta = {};
      if (mr.ok) { const rows = await mr.json(); meta = (rows[0] && rows[0].data) || {}; }
      return res.status(200).json({ ok: true, tasks, meta });
    }

    if (req.method === "POST") {
      const b = await readBody(req);
      const op = b.op;

      if (op === "add") {
        const t = b.task || {};
        const kind = t.kind === "platform" ? "platform" : "game";
        const target = clip(t.target, 60).trim();
        const description = clip(t.description, 500).trim();
        const source = t.source === "tester" ? "tester" : "me";
        const author = source === "tester" ? (clip(t.author, 40).trim() || "anon") : null;
        if (!target || !description) return res.status(400).json({ ok: false, error: "target and description required" });
        const r = await fetch(`${URL}/rest/v1/planner_tasks`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ kind, target, description, source, author }) });
        if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        const rows = await r.json();
        return res.status(200).json({ ok: true, task: rows[0] });
      }

      if (op === "update") {
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: "id required" });
        const fields = {}; const f = b.fields || {};
        if (typeof f.done === "boolean") fields.done = f.done;
        if (f.description != null) fields.description = clip(f.description, 500).trim();
        if (f.target != null) fields.target = clip(f.target, 60).trim();
        fields.updated_at = new Date().toISOString();
        let uq = `id=eq.${id}`;
        if (b.author) uq += `&source=eq.tester&author=eq.${encodeURIComponent(String(b.author))}`;
        const r = await fetch(`${URL}/rest/v1/planner_tasks?${uq}`, { method: "PATCH", headers: H, body: JSON.stringify(fields) });
        if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        return res.status(200).json({ ok: true });
      }

      if (op === "delete") {
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: "id required" });
        let dq = `id=eq.${id}`;
        if (b.author) dq += `&source=eq.tester&author=eq.${encodeURIComponent(String(b.author))}`;
        const r = await fetch(`${URL}/rest/v1/planner_tasks?${dq}`, { method: "DELETE", headers: H });
        if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        return res.status(200).json({ ok: true });
      }

      if (op === "meta") {
        const data = b.data && typeof b.data === "object" ? b.data : {};
        const r = await fetch(`${URL}/rest/v1/planner_meta?id=eq.1`, { method: "PATCH", headers: H, body: JSON.stringify({ data }) });
        if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        return res.status(200).json({ ok: true });
      }

      // op:'flagReview' — Claude calls this at the end of a roadmap session to mark it
      // done-but-needs-Mike's-review, stamped with the SERVER's clock (never trust a
      // model-guessed timestamp). Read-modify-write on the single meta row's
      // roadmap.sessions array, matched by session id.
      if (op === "flagReview") {
        const id = clip(b.id, 20).trim();
        if (!id) return res.status(400).json({ ok: false, error: "id required" });
        const val = b.val !== false;
        const mr = await fetch(`${URL}/rest/v1/planner_meta?id=eq.1&select=data`, { headers: H });
        if (!mr.ok) { const d = await mr.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        const rows = await mr.json();
        const data = (rows[0] && rows[0].data) || {};
        const sessions = (data.roadmap && Array.isArray(data.roadmap.sessions)) ? data.roadmap.sessions : [];
        const idx = sessions.findIndex((s) => s.id === id);
        if (idx === -1) return res.status(200).json({ ok: false, error: "session id not found: " + id });
        sessions[idx] = { ...sessions[idx], needsReview: val, reviewRequestedAt: val ? new Date().toISOString() : null };
        const r = await fetch(`${URL}/rest/v1/planner_meta?id=eq.1`, { method: "PATCH", headers: H, body: JSON.stringify({ data }) });
        if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 160) }); }
        return res.status(200).json({ ok: true, reviewRequestedAt: sessions[idx].reviewRequestedAt });
      }

      return res.status(400).json({ ok: false, error: "unknown op" });
    }

    return res.status(405).json({ ok: false, error: "GET or POST only" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) });
  }
}
