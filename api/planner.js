// /api/planner.js — Mike's private cross-device "Update Planner" store.
// GET                    -> { ok, tasks:[...], meta:{...} }
// POST { op:'add', task }        -> add a task
// POST { op:'update', id, fields } -> patch a task (e.g. done:true)
// POST { op:'delete', id }        -> remove a task
// POST { op:'meta', data }        -> replace the meta row (settings/sends/custom)
// GET ?scope=tester                -> only tester feedback rows (source='tester')
// --- roadmap card ops (used by scripts/planner.mjs; rules in AGENTS.md) ---
// GET ?scope=roadmap               -> compact { phases, cards:[{id,name,phaseNum,state}] }
// POST { op:'card', id, fields }   -> change one card (done/deployed/needsReview/later/name/desc)
// POST { op:'note', id, text }     -> append one session note to a card
// POST { op:'addCard', card }      -> add a card to a phase
// POST { op:'flagReview', id, val } -> older alias for fields:{needsReview}
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

// ---- roadmap blob helpers -------------------------------------------------
// The whole roadmap (phases + ~107 session cards) is ONE json blob in the single
// planner_meta row, so every card change is read-modify-write. It MUST happen
// server-side: if a caller posted the whole blob back we would be one bad
// serialisation away from wiping the roadmap. The card ops below take a card id
// plus a few named fields, and the server rebuilds the blob itself.
async function readMeta() {
  const r = await fetch(`${URL}/rest/v1/planner_meta?id=eq.1&select=data`, { headers: H });
  if (!r.ok) throw new Error("meta read " + r.status);
  const rows = await r.json();
  return (rows[0] && rows[0].data) || {};
}
async function writeMeta(data) {
  const r = await fetch(`${URL}/rest/v1/planner_meta?id=eq.1`, { method: "PATCH", headers: H, body: JSON.stringify({ data }) });
  if (!r.ok) throw new Error("meta write " + r.status + " " + (await r.text().catch(() => "")).slice(0, 120));
}
const cardsOf = (d) => (d.roadmap && Array.isArray(d.roadmap.sessions) ? d.roadmap.sessions : null);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL || !KEY) return res.status(200).json({ ok: false, error: "no supabase env" });

  try {
    if (req.method === "GET") {
      const _qs = String(req.url || "").split("?")[1] || "";
      // Compact roadmap read. The full blob is ~10KB of prose; this is the list a
      // build session actually needs, small enough to read in one glance.
      if (/(?:^|&)scope=roadmap(?:&|$)/.test(_qs)) {
        const d = await readMeta();
        const cards = cardsOf(d) || [];
        const phases = (d.roadmap && Array.isArray(d.roadmap.phases)) ? d.roadmap.phases : [];
        return res.status(200).json({
          ok: true,
          phases: phases.map((p) => ({ num: p.num, title: p.title || p.name || "" })),
          cards: cards.map((s) => ({
            id: s.id, name: s.name, phaseNum: s.phaseNum,
            state: s.done ? "done" : s.needsReview ? "review" : s.later ? "later" : "open",
            deployed: !!s.deployed, notes: (s.notes || []).length,
          })),
        });
      }
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

      // op:'card' — change ONE roadmap card by id. Fields are named and validated,
      // so a caller can never post a malformed roadmap. This is what a build session
      // uses to tick its own card off at the end.
      if (op === "card") {
        const id = clip(b.id, 20).trim();
        if (!id) return res.status(400).json({ ok: false, error: "id required" });
        const d = await readMeta();
        const cards = cardsOf(d);
        if (!cards) return res.status(200).json({ ok: false, error: "no roadmap in planner_meta" });
        const i = cards.findIndex((s) => s.id === id);
        if (i === -1) return res.status(200).json({ ok: false, error: "card id not found: " + id });
        const c = { ...cards[i] };
        const f = b.fields || {};
        if (typeof f.done === "boolean") c.done = f.done;
        if (typeof f.deployed === "boolean") c.deployed = f.deployed;
        if (typeof f.later === "boolean") c.later = f.later;
        if (typeof f.needsReview === "boolean") {
          c.needsReview = f.needsReview;
          c.reviewRequestedAt = f.needsReview ? new Date().toISOString() : null;
        }
        // Ticking a card done clears any pending review flag, unless the caller
        // explicitly asked for both in the same call.
        if (f.done === true && f.needsReview !== true) { c.needsReview = false; c.reviewRequestedAt = null; }
        if (f.name != null) { c.name = clip(f.name, 120).trim(); c.edited = true; }
        if (f.desc != null) { c.desc = clip(f.desc, 2000).trim(); c.edited = true; }
        cards[i] = c;
        await writeMeta(d);
        return res.status(200).json({ ok: true, card: { id: c.id, name: c.name, done: !!c.done, deployed: !!c.deployed, needsReview: !!c.needsReview } });
      }

      // op:'note' — append one short session note to a card. Kept to the last 20 so
      // a long-running card cannot grow the blob without limit.
      if (op === "note") {
        const id = clip(b.id, 20).trim();
        const text = clip(b.text, 400).trim();
        if (!id || !text) return res.status(400).json({ ok: false, error: "id and text required" });
        const d = await readMeta();
        const cards = cardsOf(d);
        if (!cards) return res.status(200).json({ ok: false, error: "no roadmap in planner_meta" });
        const i = cards.findIndex((s) => s.id === id);
        if (i === -1) return res.status(200).json({ ok: false, error: "card id not found: " + id });
        const c = { ...cards[i] };
        c.notes = (Array.isArray(c.notes) ? c.notes : []).concat(text).slice(-20);
        cards[i] = c;
        await writeMeta(d);
        return res.status(200).json({ ok: true, id, notes: c.notes.length });
      }

      // op:'addCard' — add a card to an existing phase. Refuses a duplicate id and
      // refuses a phase that does not exist, so a typo cannot orphan a card.
      if (op === "addCard") {
        const t = b.card || {};
        const id = clip(t.id, 20).trim();
        const name = clip(t.name, 120).trim();
        const desc = clip(t.desc, 2000).trim();
        const phaseNum = clip(t.phaseNum, 12).trim();
        if (!id || !name || !phaseNum) return res.status(400).json({ ok: false, error: "id, name and phaseNum required" });
        const d = await readMeta();
        const cards = cardsOf(d);
        if (!cards) return res.status(200).json({ ok: false, error: "no roadmap in planner_meta" });
        if (cards.some((s) => s.id === id)) return res.status(200).json({ ok: false, error: "card id already exists: " + id });
        const phases = (d.roadmap && Array.isArray(d.roadmap.phases)) ? d.roadmap.phases : [];
        if (phases.length && !phases.some((p) => String(p.num) === phaseNum)) {
          return res.status(200).json({ ok: false, error: "no phase " + phaseNum, phases: phases.map((p) => p.num) });
        }
        cards.push({
          id, name, desc, phaseNum,
          done: false, needsReview: false, reviewRequestedAt: null, deployed: false,
          later: t.later === true, edited: true, manual: false, notes: [],
          addedAt: new Date().toISOString(),
        });
        await writeMeta(d);
        return res.status(200).json({ ok: true, id, phaseNum, cards: cards.length });
      }

      return res.status(400).json({ ok: false, error: "unknown op" });
    }

    return res.status(405).json({ ok: false, error: "GET or POST only" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) });
  }
}
