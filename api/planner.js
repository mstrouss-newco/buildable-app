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
// POST { op:'queue', phase, max }  -> "run this phase" (the planner page's button)
// POST { op:'unqueue', phase?/lane? } -> drop one phase, one lane, or everything
// POST { op:'claim', lane }        -> a lane taking the next queued phase (atomic)
// POST { op:'report', card, text } -> a finished session's plain-language write-up
// GET ?scope=report&n=0            -> read one stored report
// POST { op:'queueStatus', status } -> the runner reporting waiting/running/done/stopped
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
async function getQueue() {
  const r = await fetch(`${URL}/rest/v1/planner_queue?select=phase,max_cards&order=id.asc`, { headers: H });
  return r.ok ? r.json() : [];
}
async function getLanes() {
  const r = await fetch(`${URL}/rest/v1/planner_lanes?select=*`, { headers: H });
  return r.ok ? r.json() : [];
}
// The shape the planner page draws. Same as before, so nothing on the page changed
// when this moved out of the blob.
async function autorunView() {
  const [q, ls] = await Promise.all([getQueue(), getLanes()]);
  if (!q.length && !ls.length) return null;
  const lanes = {};
  for (const L of ls) {
    lanes[L.lane] = {
      phase: L.phase, max: L.max_cards, status: L.status, note: L.note || "",
      card: L.card || "", cardName: L.card_name || "", startedAt: L.started_at,
      done: L.done || 0, total: L.total || 0, finished: L.finished || [],
      lastSeen: L.last_seen, claimedAt: L.claimed_at,
    };
  }
  return { queued: q.map((x) => ({ phase: x.phase, max: x.max_cards })), lanes };
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
          autorun: await autorunView(),
          reports: (d.reports || []).map((r) => ({ card: r.card, phase: r.phase, at: r.at })),
          phases: phases.map((p) => ({ num: p.num, title: p.title || p.name || "" })),
          cards: cards.map((s) => ({
            id: s.id, name: s.name, phaseNum: s.phaseNum,
            state: s.done ? "done" : s.needsReview ? "review" : s.later ? "later" : "open",
            deployed: !!s.deployed, notes: (s.notes || []).length,
            // The last note is what a finishing session said it shipped — the live
            // feed shows it, so a run reads as a story rather than a list of ticks.
            lastNote: (s.notes && s.notes.length) ? String(s.notes[s.notes.length - 1]).slice(0, 200) : "",
          })),
        });
      }
      // One stored report, by position (0 = most recent). Kept out of scope=roadmap
      // so the list stays small; the planner fetches a report only when it is opened.
      const rm = /(?:^|&)scope=report(?:&|$)/.exec(_qs);
      if (rm) {
        const d = await readMeta();
        const n = Math.max(0, parseInt((/(?:^|&)n=(\d+)/.exec(_qs) || [])[1] || "0", 10));
        const rep = (d.reports || [])[n] || null;
        return res.status(200).json({ ok: true, report: rep });
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

      // ---- the run queue, and the lanes that work it -------------------------
      // These live in their OWN tables (planner_queue / planner_lanes), NOT in the
      // meta blob. Everything used to read the whole blob, change one field and write
      // it all back, so two overlapping writes silently lost one another — a lane
      // claimed a phase, the page queued two more a moment later, and the lane
      // vanished from the display while it was still working. One row per lane means
      // a check-in only ever touches its own row.
      if (op === "queue") {
        const phase = clip(b.phase, 12).trim();
        if (!phase) return res.status(400).json({ ok: false, error: "phase required" });
        const d = await readMeta();
        const phases = (d.roadmap && Array.isArray(d.roadmap.phases)) ? d.roadmap.phases : [];
        if (phases.length && !phases.some((p) => String(p.num) === phase)) {
          return res.status(200).json({ ok: false, error: "no phase " + phase, phases: phases.map((p) => p.num) });
        }
        const lanes = await getLanes();
        if (lanes.some((L) => String(L.phase) === phase)) {
          return res.status(200).json({ ok: false, error: "phase " + phase + " is already being worked" });
        }
        const open = ((d.roadmap && d.roadmap.sessions) || [])
          .filter((s) => String(s.phaseNum) === phase && !s.done && !s.later).length;
        const max = Math.min(10, Math.max(1, parseInt(b.max, 10) || 4));
        const r = await fetch(`${URL}/rest/v1/planner_queue`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ phase, max_cards: max }) });
        if (!r.ok && r.status !== 409) { const t = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: t.slice(0, 160) }); }
        const q = await getQueue();
        return res.status(200).json({ ok: true, open, waiting: q.length, autorun: await autorunView() });
      }

      if (op === "unqueue") {
        const drop = clip(b.phase, 12).trim();
        const lane = clip(b.lane, 8).trim();
        if (lane) {
          await fetch(`${URL}/rest/v1/planner_lanes?lane=eq.${encodeURIComponent(lane)}`, { method: "DELETE", headers: H });
        } else if (drop) {
          await Promise.all([
            fetch(`${URL}/rest/v1/planner_queue?phase=eq.${encodeURIComponent(drop)}`, { method: "DELETE", headers: H }),
            fetch(`${URL}/rest/v1/planner_lanes?phase=eq.${encodeURIComponent(drop)}`, { method: "DELETE", headers: H }),
          ]);
        } else {
          await Promise.all([
            fetch(`${URL}/rest/v1/planner_queue?id=gt.0`, { method: "DELETE", headers: H }),
            fetch(`${URL}/rest/v1/planner_lanes?lane=neq.__none__`, { method: "DELETE", headers: H }),
          ]);
        }
        return res.status(200).json({ ok: true, autorun: await autorunView() });
      }

      // op:'release' — a lane handing back whatever it was still holding. Called at
      // startup, because a lane that was killed mid-card (a restart, a crash, the
      // background runners being switched off) otherwise takes its phase with it and
      // the phase looks like it silently stopped. Requeued at the FRONT: a phase that
      // is already part-built should be finished before new work starts.
      if (op === "release") {
        const lane = clip(b.lane, 8).trim() || "1";
        const r = await fetch(`${URL}/rest/v1/rpc/planner_release`, { method: "POST", headers: H, body: JSON.stringify({ p_lane: lane }) });
        if (!r.ok) { const t = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: t.slice(0, 200) }); }
        const rows = await r.json();
        return res.status(200).json({ ok: true, requeued: (rows && rows[0] && rows[0].phase) || null });
      }

      // op:'claim' — one SQL function pops the oldest queued phase and assigns it to
      // this lane. Two lanes calling at the same instant cannot get the same phase.
      if (op === "claim") {
        const lane = clip(b.lane, 8).trim() || "1";
        const r = await fetch(`${URL}/rest/v1/rpc/planner_claim`, { method: "POST", headers: H, body: JSON.stringify({ p_lane: lane }) });
        if (!r.ok) { const t = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: t.slice(0, 200) }); }
        const rows = await r.json();
        const got = rows && rows[0];
        return res.status(200).json({ ok: true, next: got ? { phase: got.phase, max: got.max_cards } : null });
      }

      // op:'report' — the plain-language write-up a finished session leaves. Kept on
      // the planner so Mike never has to open GitHub to find out what happened.
      if (op === "report") {
        const d = await readMeta();
        const text = clip(b.text, 6000).trim();
        if (!text) return res.status(400).json({ ok: false, error: "text required" });
        d.reports = [{ card: clip(b.card, 20), phase: clip(b.phase, 12), at: new Date().toISOString(), text }]
          .concat(d.reports || []).slice(0, 12);
        await writeMeta(d);
        return res.status(200).json({ ok: true, reports: d.reports.length });
      }

      // op:'queueStatus' — the runner reporting back, so the planner page can show
      // what is happening without the runner having to touch the card blob.
      // op:'queueStatus' — a lane reporting on itself. PATCHes only its own row, so
      // nothing another lane or the page does can overwrite it.
      if (op === "queueStatus") {
        const lane = clip(b.lane, 8).trim() || "1";
        const lanes = await getLanes();
        const L = lanes.find((x) => String(x.lane) === lane);
        if (!L) return res.status(200).json({ ok: true, ignored: "lane " + lane + " holds nothing" });
        if (b.phase && String(b.phase) !== String(L.phase)) {
          return res.status(200).json({ ok: true, ignored: "stale: lane " + lane + " is on " + L.phase });
        }
        const fields = { last_seen: new Date().toISOString() };
        if (["running", "done", "stopped"].includes(b.status)) fields.status = b.status;
        if (b.note != null) fields.note = clip(b.note, 300);
        if (b.card != null) fields.card = clip(b.card, 20);
        if (b.cardName != null) fields.card_name = clip(b.cardName, 120);
        if (b.startedAt !== undefined) fields.started_at = b.startedAt;
        if (Number.isFinite(+b.done)) fields.done = +b.done;
        if (Number.isFinite(+b.total)) fields.total = +b.total;
        if (Array.isArray(b.finished)) fields.finished = b.finished.slice(0, 20).map((x) => clip(x, 20));
        const r = await fetch(`${URL}/rest/v1/planner_lanes?lane=eq.${encodeURIComponent(lane)}`, { method: "PATCH", headers: H, body: JSON.stringify(fields) });
        if (!r.ok) { const t = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: t.slice(0, 160) }); }
        return res.status(200).json({ ok: true });
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
