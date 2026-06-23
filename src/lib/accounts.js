// /src/lib/accounts.js
// -------------------------------------------------------------
// Two ways to play, one API:
//
//  1) GUEST (default, no login): kid profiles are stored on the DEVICE
//     (localStorage). Instant, no account, no Bearer token. Songs/games
//     still save to the central library via the service-key API, keyed by
//     device_id. NOTE: guest songs do NOT follow to another device --
//     there is no account to link devices.
//
//  2) PARENT ACCOUNT (opt-in via "Use email instead"): a grown-up signs in
//     with Supabase Auth; kid profiles live in the database. Because the
//     profile id is shared, a child's songs FOLLOW them to any device the
//     grown-up signs in on.
//
// The profile helpers below branch on isSignedIn(): signed in -> Supabase,
// otherwise -> the local guest store. Callers don't need to know which.
//
// Env (set in Vercel -> owner does this):
//   VITE_SUPABASE_URL        e.g. https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY   the PUBLIC anon key (NOT the service key)
//
// SCHEMA NOTE: kid_profiles DB column is `name` (db/create-accounts.sql).
// The UI uses `display_name`, so account-mode reads alias display_name:name
// and writes send { name }.
// -------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const SESSION_KEY = "bk_parent_session_v1";   // adult JWT + refresh
const ACTIVE_KID_KEY = "bk_active_kid_v1";     // which kid tile is selected
const GUEST_KIDS_KEY = "bk_guest_kid_profiles_v1"; // device-local profiles

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

function makeId() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); }
  catch (e) { /* fall through */ }
  return "kid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---- low-level fetch helpers (account mode) -----------------------
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

// ---- AUTH (grown-up only; opt-in) ---------------------------------
// The agent never auto-creates accounts or types passwords; the grown-up
// does that in the UI.
export async function signUpParent(email, password) {
  const data = await authFetch("signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  // If Supabase is set to auto-confirm, signup returns a session right away.
  if (data.access_token) {
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    await ensureParentRow();
    return { signedIn: true };
  }
  // No token => the project requires email confirmation before issuing a
  // session. The grown-up must click the link in their inbox, then sign in.
  // (Caller shows a friendly "check your email" message instead of failing.)
  return { signedIn: false, needsEmailConfirmation: true };
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

async function ensureParentRow() {
  try {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    if (!me?.id) return;
    const existing = await restFetch(`parent_accounts?id=eq.${me.id}&select=id`, { method: "GET" });
    if (Array.isArray(existing) && existing.length) return;
    await restFetch("parent_accounts", { method: "POST", body: JSON.stringify({ id: me.id }) });
  } catch (e) { /* best-effort */ }
}

// ---- GUEST profile store (device-local) ---------------------------
function loadGuestKids() {
  try {
    const arr = JSON.parse(localStorage.getItem(GUEST_KIDS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveGuestKids(arr) {
  localStorage.setItem(GUEST_KIDS_KEY, JSON.stringify(arr || []));
}

// ---- KID PROFILES (branch: account -> Supabase, else -> guest) ----
export async function listKidProfiles() {
  if (isSignedIn()) {
    return restFetch(
      "kid_profiles?select=id,display_name:name,avatar,created_at&order=created_at.asc",
      { method: "GET" }
    );
  }
  return loadGuestKids();
}

export async function createKidProfile(displayName, avatar) {
  const name = (displayName || "").trim();
  if (!name) throw new Error("Please enter a name");

  if (isSignedIn()) {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    const parent = await restFetch(`parent_accounts?id=eq.${me.id}&select=id`, { method: "GET" });
    const parentId = parent?.[0]?.id;
    if (!parentId) throw new Error("No parent account found");
    const rows = await restFetch("kid_profiles?select=id,display_name:name,avatar,created_at", {
      method: "POST",
      body: JSON.stringify({ parent_id: parentId, name: name.slice(0, 40), avatar: avatar || "🙂" }),
    });
    return rows?.[0];
  }

  const kids = loadGuestKids();
  const kid = { id: makeId(), display_name: name.slice(0, 40), avatar: avatar || "🙂", created_at: new Date().toISOString() };
  kids.push(kid);
  saveGuestKids(kids);
  return kid;
}

export async function renameKidProfile(id, displayName) {
  const name = (displayName || "").trim();
  if (!name) throw new Error("Please enter a name");

  if (isSignedIn()) {
    const rows = await restFetch(`kid_profiles?id=eq.${id}&select=id,display_name:name,avatar,created_at`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.slice(0, 40) }),
    });
    const updated = rows?.[0];
    const active = getActiveKid();
    if (active && active.id === id && updated) setActiveKid(updated);
    return updated;
  }

  const kids = loadGuestKids();
  const k = kids.find((x) => x.id === id);
  if (!k) throw new Error("Profile not found");
  k.display_name = name.slice(0, 40);
  saveGuestKids(kids);
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid(k);
  return k;
}

export async function deleteKidProfile(id) {
  if (isSignedIn()) {
    await restFetch(`kid_profiles?id=eq.${id}`, { method: "DELETE" });
  } else {
    saveGuestKids(loadGuestKids().filter((x) => x.id !== id));
  }
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid(null);
  return true;
}

// ---- FAMILY PROJECTS (account mode only) --------------------------
// List every saved creation in the family (songs + games), with which
// kid each is currently linked to (kid_profile_id may be null = unassigned).
// Account mode only: reads go through the parent JWT and RLS scopes rows
// to this family. The guest/device lane has no cross-kid view, so we
// return [] there. Shape: { kind:'song'|'game', projectId, title, kidProfileId }.
export async function listFamilyProjects() {
    if (!isSignedIn()) return [];
    const out = [];
    try {
          const songs = await restFetch(
                  "saved_songs?select=song_id,title,kid_profile_id,created_at&order=created_at.desc&limit=100",
            { method: "GET" }
                );
          if (Array.isArray(songs)) {
                  for (const s of songs) {
                            out.push({ kind: "song", projectId: s.song_id, title: s.title || "Untitled song", kidProfileId: s.kid_profile_id || null });
                  }
          }
    } catch (e) { /* songs table optional */ }
    try {
          const games = await restFetch(
                  "saved_games?select=game_id,title,kid_profile_id,created_at&order=created_at.desc&limit=100",
            { method: "GET" }
                );
          if (Array.isArray(games)) {
                  for (const g of games) {
                            out.push({ kind: "game", projectId: g.game_id, title: g.title || "Untitled game", kidProfileId: g.kid_profile_id || null });
                  }
          }
    } catch (e) { /* games table optional */ }
    return out;
}

// Assign (or unassign) an existing creation to a kid profile. Updates the
// nullable kid_profile_id link the schema already defines (db/create-accounts.sql).
// kind: 'song' | 'game'. Pass kidProfileId = null to unassign.
// Account mode only -- the device lane has no per-kid ownership to edit.
export async function assignProjectToKid(kind, projectId, kidProfileId) {
    if (!isSignedIn()) throw new Error("Sign in to organize creations");
    if (!projectId) throw new Error("Missing project id");
    const table = kind === "game" ? "saved_games" : "saved_songs";
    const idCol = kind === "game" ? "game_id" : "song_id";
    const rows = await restFetch(
          table + "?" + idCol + "=eq." + encodeURIComponent(projectId) +
            "&select=" + idCol + ",kid_profile_id",
      {
              method: "PATCH",
              body: JSON.stringify({ kid_profile_id: kidProfileId || null }),
      }
        );
    return rows && rows[0];
}
