// /api/manifest.js — Session 4A: read/write a game's manifest (the level-first editor's backend).
//
//   GET  ?game=breaker            -> { ok, source:'override'|'static', manifest, savedAt? }
//                                    An editor-saved override wins; otherwise the static
//                                    public/<game>/manifest.json that ships in the repo.
//   POST { game, manifest, pin }  -> validate + save an override so the change is LIVE now.
//
// Session 4B adds the QA-robot gate before a save goes live; 4A publishes directly after a
// structural validation. Storage reuses images.js's image_cache table (kind="manifest",
// cache_key="manifest:<game>") so there is NO new database migration (same trick as asset-studio.js).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EDITOR_PIN = process.env.EDITOR_PIN || "1025"; // light gate, mirrors the planner tool's PIN model

const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
});

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

// Structural validation — GAME-AGNOSTIC server-side guard (Session 4B: the editor now
// saves every game, not just Breaker). Universal fields only: id, name, type, and — for
// games — a non-empty levels array where each level has a unique id, a name, and a
// difficulty 1-5. The deep, per-game level shape (Breaker layout/parts, Survival recipes,
// board opponents, …) is validated CLIENT-side by the shared loader (BuildableManifest.
// validate) before the editor ever POSTs, so this stays a lightweight safety net that
// never wrongly rejects a valid non-Breaker manifest.
function validate(m) {
  const e = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!m.id || typeof m.id !== "string") e.push("missing id");
  if (!m.name || typeof m.name !== "string") e.push("missing name");
  if (m.type !== "game" && m.type !== "studio") e.push("type must be game or studio");
  if (m.type === "studio") {
    if (!m.produces || typeof m.produces !== "string") e.push("studio produces must be a non-empty string");
    if (!m.savesTo || typeof m.savesTo !== "string") e.push("studio savesTo must be a non-empty string");
  }
  if (m.type === "game") {
    if (!Array.isArray(m.levels) || !m.levels.length) e.push("levels must be a non-empty array");
    else {
      const seen = {};
      m.levels.forEach((lv, i) => {
        const at = "levels[" + i + "]";
        if (!lv || typeof lv !== "object") { e.push(at + " is not an object"); return; }
        if (!lv.id || typeof lv.id !== "string") e.push(at + " missing id");
        else if (seen[lv.id]) e.push(at + " duplicate id '" + lv.id + "'"); else seen[lv.id] = 1;
        if (!lv.name) e.push(at + " missing name");
        const d = lv.difficulty;
        if (typeof d !== "number" || d < 1 || d > 5 || (d | 0) !== d) e.push(at + " difficulty must be an integer 1-5");
      });
    }
  }
  return e;
}

async function readOverride(game) {
  const key = "manifest:" + game;
  const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}&select=b64,descriptor&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows[0]) return null;
  try { return { manifest: JSON.parse(Buffer.from(rows[0].b64, "base64").toString("utf8")), descriptor: rows[0].descriptor }; }
  catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const qs = String(req.url || "").split("?")[1] || "";
  const params = new URLSearchParams(qs);
  const game = slug(params.get("game") || "breaker") || "breaker";

  if (req.method === "GET") {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try { const ov = await readOverride(game); if (ov && ov.manifest) return res.status(200).json({ ok: true, source: "override", manifest: ov.manifest, savedAt: ov.descriptor || null }); } catch {}
    }
    // no override -> return the static file that ships in public/
    try {
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host;
      const r = await fetch(`${proto}://${host}/${game}/manifest.json?v=${Date.now()}`, { headers: { "Cache-Control": "no-store" } });
      if (r.ok) { const m = await r.json(); return res.status(200).json({ ok: true, source: "static", manifest: m }); }
      return res.status(404).json({ ok: false, error: "no manifest for " + game });
    } catch (err) { return res.status(200).json({ ok: false, error: String((err && err.message) || err) }); }
  }

  if (req.method === "POST") {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ ok: false, error: "no supabase env" });
    const b = await readBody(req);
    if (String(b.pin || "") !== EDITOR_PIN) return res.status(403).json({ ok: false, error: "bad pin" });
    const g = slug(b.game || game) || "breaker";
    const m = b.manifest;
    const errs = validate(m);
    if (errs.length) return res.status(400).json({ ok: false, errors: errs });
    if (slug(m.id) !== g) return res.status(400).json({ ok: false, errors: ["manifest id '" + m.id + "' does not match game '" + g + "'"] });
    const key = "manifest:" + g;
    const b64 = Buffer.from(JSON.stringify(m), "utf8").toString("base64");
    const descriptor = g + " manifest saved " + new Date().toISOString();
    try {
      await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
      const r = await sb("image_cache", { method: "POST", body: JSON.stringify({ cache_key: key, descriptor, kind: "manifest", b64 }) });
      if (!r.ok) { const d = await r.text().catch(() => ""); return res.status(200).json({ ok: false, detail: d.slice(0, 200) }); }
      return res.status(200).json({ ok: true, savedAt: descriptor, source: "override" });
    } catch (err) { return res.status(200).json({ ok: false, error: String((err && err.message) || err) }); }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "method not allowed" });
}
