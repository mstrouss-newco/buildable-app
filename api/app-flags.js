// /api/app-flags.js
// ==================================================================
// The switches the owner can flip himself, with no deploy (Session LS4).
//
//   GET  /api/app-flags                          -> { ok, flags: { lessons_live: false } }
//   POST /api/app-flags { key, value, code }     -> flips one switch (owner only)
//
// WHY: the Lessons tile lives in the React shell, so turning it on for kids as a
// CODE change would need a deploy, and the owner cannot push. LS3 already moved
// lesson approval into the database for exactly this reason; this does the same
// for the section as a whole. He taps the switch on /lesson-review and the tile
// changes for kids within a minute.
//
// READ IS PUBLIC, WRITE IS NOT. Every Home screen load reads this, so GET is
// open and briefly cached. A write needs the owner code AND a key on the
// allow-list below, so this endpoint can never be used to invent new settings.
//
// FAILS SOFT, AND FAILS CLOSED. If Supabase is unset or unreachable, GET returns
// the DEFAULTS rather than an error - and the default for lessons_live is FALSE.
// A database wobble can therefore hide the Lessons tile behind the owner gate
// for a moment; it can never expose unfinished lessons to a kid.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (optional), OWNER_PREVIEW_CODE.
// Requires db/ls4-app-flags.sql. No emojis.
// ==================================================================
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const OWNER_CODE = process.env.OWNER_PREVIEW_CODE || "1025";

// The only switches this endpoint will ever write, and what they mean if the
// database cannot be reached. Safe side only.
const FLAGS = {
  cobuild_live: {
    def: false,
    note: "When true, the Start buttons on /cobuild go to real signup and Stripe checkout instead of the waitlist, and the studio meters new games against a plan. FALSE is the safe side: the fake door keeps taking names and nobody is charged or blocked.",
  },
  lessons_live: {
    def: false,
    note: "When true, the Lessons tile on Home is live for kids instead of Coming soon behind the owner gate.",
  },
};

function defaults() {
  const out = {};
  Object.keys(FLAGS).forEach((k) => { out[k] = FLAGS[k].def; });
  return out;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } });
  });
}

async function readFlags() {
  const out = defaults();
  if (!URL_ || !KEY) return { flags: out, live: false };
  try {
    const r = await fetch(`${URL_}/rest/v1/app_flags?select=key,value,updated_at,updated_by`, { headers: H });
    if (!r.ok) return { flags: out, live: false };
    const rows = await r.json();
    const meta = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !FLAGS[row.key]) return;             // ignore anything not on the allow-list
      out[row.key] = row.value === true || row.value === "true";
      meta[row.key] = { updatedAt: row.updated_at, updatedBy: row.updated_by };
    });
    return { flags: out, live: true, meta };
  } catch {
    return { flags: out, live: false };
  }
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    res.setHeader("Cache-Control", "no-store");
    const b = await readBody(req);
    const key = String(b.key || "").trim();
    const code = String(b.code || "").trim();

    if (!FLAGS[key]) return res.status(400).json({ ok: false, error: "unknown switch" });
    if (!code || code !== OWNER_CODE) return res.status(403).json({ ok: false, error: "wrong code" });
    if (!URL_ || !KEY) return res.status(200).json({ ok: false, error: "no supabase env" });

    const value = b.value === true || b.value === "true";
    try {
      const r = await fetch(`${URL_}/rest/v1/app_flags`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([{
          key,
          value,
          note: FLAGS[key].note,
          updated_at: new Date().toISOString(),
          updated_by: "owner",
        }]),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        return res.status(200).json({ ok: false, status: r.status, hint: "run db/ls4-app-flags.sql", detail: detail.slice(0, 160) });
      }
      const after = await readFlags();
      return res.status(200).json({ ok: true, key, value, flags: after.flags });
    } catch (e) {
      return res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 120) });
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ ok: false, error: "GET or POST only" });
  }

  const { flags, live, meta } = await readFlags();
  // Short cache: a flip should reach kids quickly, but this is read on every
  // Home load and must not hammer the database.
  res.setHeader("Cache-Control", "public, max-age=45, stale-while-revalidate=120");
  return res.status(200).json({ ok: true, flags, live, meta: meta || {} });
}
