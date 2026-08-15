// api/_editorAuth.js — shared plumbing for the owner-only game editor endpoints.
//
// Pulled out of api/manifest.js in Session 9E so the new /api/manifest-qa endpoint
// checks the exact same owner allowlist and talks to the same store. Behaviour is
// unchanged from what manifest.js did before.
//
// No secrets live here — every key is read from the environment by name.

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Owner-only editor: saves must come from an authenticated Buildable account on the
// allowlist (the parent Supabase login the app already uses). No shared PIN.
const OWNER_EMAILS = (process.env.EDITOR_ALLOWED_EMAILS || "mstrouss@gmail.com")
  .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const OWNER_SUBS = (process.env.EDITOR_ALLOWED_SUBS || "1cb8cd9e-fba0-4fcc-850a-5b6afb677b87")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Verify the caller's Supabase access token and confirm they are on the allowlist.
export async function verifyOwner(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, code: 401, error: "sign in required" };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { ok: false, code: 500, error: "no supabase env" };
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { ok: false, code: 401, error: "session expired — sign in again" };
    const u = await r.json();
    const email = String(u.email || "").toLowerCase();
    const id = String(u.id || "");
    if (OWNER_EMAILS.includes(email) || OWNER_SUBS.includes(id)) return { ok: true, email };
    return { ok: false, code: 403, error: "not authorized for this account" };
  } catch { return { ok: false, code: 401, error: "could not verify session" }; }
}

export const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
});

export function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}

export const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

// ---- the editor's store -----------------------------------------------------
// Everything rides in image_cache (same trick as asset-studio.js) so there is still
// no migration. Three keys per game:
//   manifest:<game>       the live manifest the shell and engines read
//   manifest-prev:<game>  the one before it, so "Put it back" is one click
//   manifest-qa:<game>    the play-test robot's verdict on the live one
export const KEY = {
  live: (g) => "manifest:" + g,
  prev: (g) => "manifest-prev:" + g,
  qa: (g) => "manifest-qa:" + g,
};

// Read a JSON blob out of the store. Returns null when absent or unparseable —
// callers must treat "no record" as "unknown", never as "fine".
export async function readBlob(cacheKey) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=b64,descriptor&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]) return null;
    return { value: JSON.parse(Buffer.from(rows[0].b64, "base64").toString("utf8")), descriptor: rows[0].descriptor };
  } catch { return null; }
}

// Write a JSON blob, replacing whatever was there.
export async function writeBlob(cacheKey, value, descriptor, kind) {
  const b64 = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
  await sb(`image_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`, { method: "DELETE" });
  return sb("image_cache", { method: "POST", body: JSON.stringify({ cache_key: cacheKey, descriptor, kind: kind || "manifest", b64 }) });
}
