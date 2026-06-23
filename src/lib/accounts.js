// /src/lib/accounts.js
// -------------------------------------------------------------
// Parent/Teacher auth + kid-profile layer for Buildable Kids.
//
// ONE real credentialed login belongs to a grown-up (parent/teacher).
// Kids pick a profile by tapping a tile -- they never see a password.
//
// We talk to Supabase Auth + REST directly over fetch (the app has no
// Supabase SDK dependency, matching the existing /api endpoints), using
// the PUBLIC anon key. The anon key is safe to ship to the browser; Row
// Level Security (db/create-accounts-rls.sql) is what actually protects
// each family's data.
//
// Env (set in Vercel -> owner does this):
//   VITE_SUPABASE_URL       e.g. https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY  the PUBLIC anon key (NOT the service key)
// -------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const SESSION_KEY = "bk_parent_session_v1";   // adult JWT + refresh
const ACTIVE_KID_KEY = "bk_active_kid_v1";    // which kid tile is selected

export function isConfigured() {
  return Boolean(SUPABASE_URL && ANON_KEY);
}

// ---- session persistence (browser) ---------------------------------
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
export function getSession() { return loadSession(); }
export function isSignedIn() { return Boolean(loadSession()?.access_token); }

export function getActiveKid() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KID_KEY) || "null"); }
  catch { return null; }
}
export function setActiveKid(kid) {
  if (kid) localStorage.setItem(ACTIVE_KID_KEY, JSON.stringify(kid));
  else localStorage.removeItem(ACTIVE_KID_KEY);
}

// ---- low-level fetch helpers --------------------------------------
function authHeaders(useUserToken) {
  const s = loadSession();
  const bearer = useUserToken && s?.access_token ? s.access_token : ANON_KEY;
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
}

async function authFetch(path, init) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, "Content-Type": "application/json", ...(init && init.headers) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.msg || data.error || "Auth request failed");
  return data;
}

async function restFetch(path, init) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...authHeaders(true), Prefer: "return=representation", ...(init && init.headers) },
  });
  const data = await r.json().catch(() => ([]));
  if (!r.ok) throw new Error((data && data.message) || "Request failed");
  return data;
}

// ---- AUTH (grown-up only) -----------------------------------------
// NOTE: account *creation* and password entry are owner/parent actions.
// These helpers exist so the parent can sign in/up THEMSELVES in the UI;
// the agent never auto-creates accounts or types passwords.
export async function signUpParent(email, password) {
  const data = await authFetch("signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (data.access_token) {
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    await ensureParentRow();
  }
  return data;
}

export async function signInParent(email, password) {
  const data = await authFetch("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  await ensureParentRow();
  return data;
}

export function signOut() {
  saveSession(null);
  setActiveKid(null);
}

// Make sure a parent_accounts row exists for this auth user (idempotent
// via the primary key (id = auth user id); RLS scopes it to this user).
async function ensureParentRow() {
  try {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    if (!me?.id) return;
    const existing = await restFetch(`parent_accounts?id=eq.${me.id}&select=id`, { method: "GET" });
    if (Array.isArray(existing) && existing.length) return;
    await restFetch("parent_accounts", {
      method: "POST",
      body: JSON.stringify({ id: me.id }),
    });
  } catch (e) { /* best-effort; surfaced on next call if it really failed */ }
}

// ---- KID PROFILES --------------------------------------------------
export async function listKidProfiles() {
  return restFetch("kid_profiles?select=id,display_name,avatar,created_at&order=created_at.asc", { method: "GET" });
}

export async function createKidProfile(displayName, avatar) {
  // parent_id is resolved from the signed-in user's parent_accounts row.
  const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
  const parent = await restFetch(`parent_accounts?id=eq.${me.id}&select=id`, { method: "GET" });
  const parentId = parent?.[0]?.id;
  if (!parentId) throw new Error("No parent account found");
  const rows = await restFetch("kid_profiles", {
    method: "POST",
    body: JSON.stringify({ parent_id: parentId, display_name: displayName, avatar: avatar || "🙂" }),
  });
  return rows?.[0];
}
