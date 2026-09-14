// /api/kid-progress.js
// SY1 - THE PROGRESS FOLLOWS THE KID, NOT THE DEVICE.
//
// Minute Math scores and Practice boxes used to live only in localStorage, so
// a parent looking on their own phone saw an empty dashboard while their kid's
// whole history sat in Safari on the iPad. One row per kid in
// `kid_progress_saves` fixes that. Service-key only, mirroring api/farm-save.js.
//
//   GET  ?kidProfileId=<id>            -> { ok:true, data:{minutemath,practice}|null }
//   POST { kidProfileId, data }        -> { ok:true, data:<merged> }
//
// THE POST MERGES, IT DOES NOT OVERWRITE. Two devices are the whole point of
// this endpoint, so "last writer wins" would mean the iPad's afternoon of
// practice vanishing because a parent opened the dashboard afterwards. Every
// merge below is idempotent: syncing the same payload twice changes nothing.
//
// BEST-EFFORT BY DESIGN, like farm-save: every failure answers 200 with
// ok:false rather than an error status, because the caller is a page a child
// is using. A sync problem is silent to the kid and the local copy carries on.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TABLE = "kid_progress_saves";
const MAX_BLOB = 400000;      // a year of runs is a few tens of KB; sanity ceiling
const MAX_RUNS = 25;          // per sheet shape, newest first

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body || "{}")); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

const sbHeaders = (extra) => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
  ...(extra || {}),
});

const clean = (v, max) => (v == null ? "" : String(v)).trim().slice(0, max || 120);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// ---- Minute Math -----------------------------------------------------------
// Runs carry an `at` timestamp, which is effectively unique per run, so the
// union of two devices is the union of their runs deduped on `at`. Best is then
// recomputed from what survived rather than trusted from either side, and the
// missed-fact tallies merge by MAX so re-syncing cannot inflate them.
function mergeMinuteMath(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(obj(a)), ...Object.keys(obj(b))]);
  for (const k of keys) {
    const ra = obj(obj(a)[k]), rb = obj(obj(b)[k]);
    const seen = new Map();
    for (const run of [...(ra.runs || []), ...(rb.runs || [])]) {
      if (run && typeof run.at === "number" && !seen.has(run.at)) seen.set(run.at, run);
    }
    const runs = [...seen.values()].sort((x, y) => y.at - x.at).slice(0, MAX_RUNS);
    const misses = {};
    for (const src of [obj(ra.misses), obj(rb.misses)]) {
      for (const f of Object.keys(src)) {
        misses[f] = Math.max(misses[f] || 0, Number(src[f]) || 0);
      }
    }
    out[k] = {
      label: rb.label || ra.label || k,
      ops: rb.ops || ra.ops,
      best: runs.reduce((m, r) => Math.max(m, Number(r.n) || 0), 0),
      runs,
      misses,
    };
  }
  return out;
}

// ---- Practice --------------------------------------------------------------
// Each item record carries `last` (when the kid last saw it). The newer record
// wins per item, which is the only honest answer when a kid practised the same
// word on two devices.
function mergePractice(a, b) {
  const out = { decks: {} };
  const da = obj(obj(a).decks), db = obj(obj(b).decks);
  for (const deck of new Set([...Object.keys(da), ...Object.keys(db)])) {
    const ia = obj(obj(da[deck]).items), ib = obj(obj(db[deck]).items);
    const items = {};
    for (const id of new Set([...Object.keys(ia), ...Object.keys(ib)])) {
      const x = ia[id], y = ib[id];
      if (!x) { items[id] = y; continue; }
      if (!y) { items[id] = x; continue; }
      items[id] = (Number(y.last) || 0) >= (Number(x.last) || 0) ? y : x;
    }
    out.decks[deck] = { ...obj(da[deck]), ...obj(db[deck]), items };
  }
  // Anything else the practice engine keeps per kid (settings, placement,
  // level) is scalar and simply takes the incoming value.
  for (const k of Object.keys(obj(b))) if (k !== "decks") out[k] = obj(b)[k];
  for (const k of Object.keys(obj(a))) if (k !== "decks" && !(k in out)) out[k] = obj(a)[k];
  return out;
}

function mergeAll(stored, incoming) {
  return {
    minutemath: mergeMinuteMath(obj(stored).minutemath, obj(incoming).minutemath),
    practice: mergePractice(obj(stored).practice, obj(incoming).practice),
  };
}

async function readRow(kid) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?kid_profile_id=eq.` +
      encodeURIComponent(kid) + `&select=data,updated_at`,
    { headers: sbHeaders() }
  );
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

// Exported only so the merge rules can be unit-tested; nothing imports these
// at runtime.
export const _merge = { mergeMinuteMath, mergePractice, mergeAll };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ ok: false, configured: false, data: null });
  }

  if (req.method === "GET") {
    const kid = clean((req.query && req.query.kidProfileId) || "");
    if (!kid) return res.status(200).json({ ok: false, data: null, reason: "no-kid" });
    try {
      const row = await readRow(kid);
      return res.status(200).json({ ok: true, data: (row && row.data) || null,
        updatedAt: (row && row.updated_at) || null });
    } catch (e) {
      return res.status(200).json({ ok: false, data: null,
        error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const kid = clean(body.kidProfileId);
    const incoming = body && body.data;
    if (!kid) return res.status(200).json({ ok: false, reason: "no-kid" });
    if (!incoming || typeof incoming !== "object") return res.status(200).json({ ok: false, reason: "no-data" });

    try {
      const row = await readRow(kid);
      const merged = mergeAll(row && row.data, incoming);
      const blob = JSON.stringify(merged);
      if (blob.length > MAX_BLOB) return res.status(200).json({ ok: false, reason: "too-big" });

      const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=kid_profile_id`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ kid_profile_id: kid, data: merged, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) {
        const detail = await r.text();
        return res.status(200).json({ ok: false, detail: detail.slice(0, 300) });
      }
      // Hand the merged result straight back so the caller can adopt anything
      // the other device knew without a second round trip.
      return res.status(200).json({ ok: true, data: merged });
    } catch (e) {
      return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
