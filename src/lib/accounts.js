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

// ---- token refresh (Supabase access tokens expire ~1h) --------------
function tokenExpiringSoon(jwt) {
  try {
    const payload = JSON.parse(atob((jwt.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < 60000; // within 60s of expiry
  } catch { return true; } // unparseable -> refresh to be safe
}
// Exchange the refresh_token for a new access_token. On failure, sign out so
// the UI falls back to the lane chooser instead of looping on an expired token.
export async function refreshSession() {
  const sx = loadSession();
  if (!sx?.refresh_token) return null;
  try {
    const data = await authFetch("token?grant_type=refresh_token", {
      method: "POST", body: JSON.stringify({ refresh_token: sx.refresh_token }),
    });
    if (data && data.access_token) {
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token || sx.refresh_token });
      return data.access_token;
    }
  } catch { saveSession(null); }
  return null;
}
// Call on app load: proactively refresh if the saved token is expired/expiring.
export async function ensureFreshToken() {
  const sx = loadSession();
  if (!sx?.access_token) return false;
  if (tokenExpiringSoon(sx.access_token)) return Boolean(await refreshSession());
  return true;
}

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
  const doFetch = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...authHeaders(true), Prefer: "return=representation", ...(init && init.headers) },
  });
  let r = await doFetch();
  if (r.status === 401) {
    // Access token likely expired mid-session — refresh once and retry.
    const t = await refreshSession();
    if (t) r = await doFetch();
  }
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

// ---- Avatars + kid PIN (Session 6B onboarding) --------------------
// Drawn-icon avatars (NO emoji, product rule). Each is an icon key + a color;
// the UI draws the matching SVG (see GrownUpScreen AvatarMark). Legacy color-key
// avatars ("purple".."teal") still render via the initial-on-gradient fallback.
export const AVATARS = [
  { key: "fox", color: "#F59E3C" },
  { key: "owl", color: "#7C4DFF" },
  { key: "cat", color: "#EC4899" },
  { key: "frog", color: "#22B573" },
  { key: "bear", color: "#8B5E3C" },
  { key: "fish", color: "#37B6F5" },
  { key: "star", color: "#FFC24A" },
  { key: "robot", color: "#5B7CFA" },
];
export const DEFAULT_AVATAR = AVATARS[0].key;

// Tiny non-secret hash for a 4-digit kid PIN (snoop guard for siblings, NOT
// security). Raw PINs are never stored; only this hash is. djb2 -> base36.
export function hashPin(pin) {
  const s = String(pin || "").trim();
  if (!/^[0-9]{4}$/.test(s)) return null;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "p" + h.toString(36);
}
export function kidHasPin(kid) { return !!(kid && kid.pin_hash); }
export function verifyKidPin(kid, pin) {
  if (!kid || !kid.pin_hash) return true; // no PIN set -> always allowed
  return hashPin(pin) === kid.pin_hash;
}

// ---- KID PROFILES (branch: account -> Supabase, else -> guest) ----
export async function listKidProfiles() {
  if (isSignedIn()) {
    try {
      return await restFetch(
        "kid_profiles?select=id,display_name:name,avatar,grade,pin_hash,helper,created_at&order=created_at.asc",
        { method: "GET" }
      );
    } catch (e) {
      // helper column may not exist yet (db/add-kid-helper.sql not run) -> fall
      // back to the base columns so profiles always load.
      return restFetch(
        "kid_profiles?select=id,display_name:name,avatar,created_at&order=created_at.asc",
        { method: "GET" }
      );
    }
  }
  return loadGuestKids();
}

export async function createKidProfile(displayName, avatar, opts = {}) {
  const name = (displayName || "").trim();
  if (!name) throw new Error("Please enter a name");
  const grade = opts.grade || null;
  const pin_hash = opts.pin ? hashPin(opts.pin) : null;

  if (isSignedIn()) {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    const parent = await restFetch(`parent_accounts?id=eq.${me.id}&select=id`, { method: "GET" });
    if (!parent?.[0]?.id) throw new Error("No parent account found");
    // If this grown-up joined another family as a co-parent, new kids are
    // filed under the family OWNER so both grown-ups share the same kids.
    const parentId = await familyOwnerId(me.id);
    const base = { parent_id: parentId, name: name.slice(0, 40), avatar: avatar || DEFAULT_AVATAR };
    // Try WITH the new columns; if the 6B migration has not run yet, retry with
    // just the base columns so profile creation never breaks (replace-first rule).
    try {
      const rows = await restFetch("kid_profiles?select=id,display_name:name,avatar,grade,pin_hash,created_at", {
        method: "POST",
        body: JSON.stringify({ ...base, grade, pin_hash }),
      });
      return rows?.[0];
    } catch (e) {
      const rows = await restFetch("kid_profiles?select=id,display_name:name,avatar,created_at", {
        method: "POST",
        body: JSON.stringify(base),
      });
      return rows?.[0];
    }
  }

  const kids = loadGuestKids();
  const kid = { id: makeId(), display_name: name.slice(0, 40), avatar: avatar || DEFAULT_AVATAR, grade, pin_hash, created_at: new Date().toISOString() };
  kids.push(kid);
  saveGuestKids(kids);
  return kid;
}

// General profile update for the onboarding fields (name/avatar/grade/pin).
// pin: pass a 4-digit string to set, "" to clear, or omit to leave unchanged.
export async function updateKidProfile(id, patch = {}) {
  const body = {};
  if (typeof patch.name === "string" && patch.name.trim()) body.name = patch.name.trim().slice(0, 40);
  if (typeof patch.avatar === "string") body.avatar = patch.avatar;
  if ("grade" in patch) body.grade = patch.grade || null;
  if ("pin" in patch) body.pin_hash = patch.pin ? hashPin(patch.pin) : null;

  if (isSignedIn()) {
    // Resilient: retry without the 6B columns if they are not present yet.
    const trySelects = ["id,display_name:name,avatar,grade,pin_hash,created_at", "id,display_name:name,avatar,created_at"];
    for (let i = 0; i < trySelects.length; i++) {
      try {
        const b = i === 0 ? body : (({ grade, pin_hash, ...rest }) => rest)(body);
        const rows = await restFetch(`kid_profiles?id=eq.${id}&select=${trySelects[i]}`, { method: "PATCH", body: JSON.stringify(b) });
        const updated = rows?.[0];
        const active = getActiveKid();
        if (active && active.id === id && updated) setActiveKid(updated);
        return updated;
      } catch (e) { if (i === trySelects.length - 1) throw e; }
    }
  }
  const kids = loadGuestKids();
  const k = kids.find((x) => x.id === id);
  if (!k) throw new Error("Profile not found");
  if ("name" in body) k.display_name = body.name;
  if ("avatar" in body) k.avatar = body.avatar;
  if ("grade" in body) k.grade = body.grade;
  if ("pin_hash" in body) k.pin_hash = body.pin_hash;
  saveGuestKids(kids);
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid(k);
  return k;
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

// ---- CO-PARENTS (a second grown-up sharing one family) ------------
// Every family owner has a short shareable "family code". A second grown-up
// creates their own login, then types that code to link into the family and
// see/manage the same kids. Kids stay owned by the family OWNER, so a solo
// family is never affected (co_parents is simply empty for them).

// Which account "owns" this grown-up's family: their own id, unless they
// joined someone else's family as a co-parent (then the primary owner's id).
async function familyOwnerId(myId) {
  try {
    const rows = await restFetch(
      `co_parents?member_parent_id=eq.${myId}&select=primary_parent_id&limit=1`,
      { method: "GET" }
    );
    if (Array.isArray(rows) && rows.length && rows[0].primary_parent_id) {
      return rows[0].primary_parent_id;
    }
  } catch (e) { /* co_parents table not created yet -> solo family */ }
  return myId;
}

// The code THIS grown-up shares to invite a partner into their family.
export async function getFamilyCode() {
  if (!isSignedIn()) return null;
  try {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    const rows = await restFetch(`parent_accounts?id=eq.${me.id}&select=friend_code`, { method: "GET" });
    return rows?.[0]?.friend_code || null;
  } catch (e) { return null; }
}

// Snapshot for the Parents screen: my share code, whether I've joined another
// family, and how many grown-ups have joined mine.
export async function getFamilyStatus() {
  const out = { code: null, joinedFamily: false, memberCount: 0 };
  if (!isSignedIn()) return out;
  try {
    const me = await authFetch("user", { method: "GET", headers: authHeaders(true) });
    const own = await restFetch(`parent_accounts?id=eq.${me.id}&select=friend_code`, { method: "GET" });
    out.code = own?.[0]?.friend_code || null;
    const joined = await restFetch(`co_parents?member_parent_id=eq.${me.id}&select=primary_parent_id`, { method: "GET" });
    out.joinedFamily = Array.isArray(joined) && joined.length > 0;
    const members = await restFetch(`co_parents?primary_parent_id=eq.${me.id}&select=member_parent_id`, { method: "GET" });
    out.memberCount = Array.isArray(members) ? members.length : 0;
  } catch (e) { /* table may not exist yet */ }
  return out;
}

// Link this signed-in grown-up into the family that owns `code`.
export async function joinFamilyByCode(code) {
  if (!isSignedIn()) throw new Error("Please sign in first");
  const res = await restFetch("rpc/join_family_by_code", {
    method: "POST",
    body: JSON.stringify({ code: (code || "").trim() }),
  });
  if (res && res.ok === false) throw new Error(res.error || "Could not join that family");
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

// ---- GOOGLE OAUTH (preferred sign-in) -----------------------------
// No SDK: we use Supabase's hosted authorize endpoint. Clicking "Continue
// with Google" sends the browser to Supabase, which bounces to Google and
// back to our app with the session tokens in the URL hash. On return,
// completeOAuthRedirect() picks up those tokens and signs the parent in.
//
// SETUP (owner, one-time): enable the Google provider in Supabase Auth and
// add this site's URL to the allowed redirect URLs. Until that's done the
// button still renders but Google returns an error.

// Where Google/Supabase should send the user back to. We strip any existing
// hash/query so the token fragment lands on a clean URL.
function oauthRedirectTarget() {
  try {
    const u = new URL(window.location.href);
    u.hash = "";
    u.search = "";
    u.pathname = "/app";
    return u.toString();
  } catch (e) {
    return window.location.origin + "/app";
  }
}

// Start the Google sign-in. This NAVIGATES AWAY (full redirect), which is the
// most reliable flow inside the app's hosting. Returns nothing useful because
// the page unloads; the result is handled by completeOAuthRedirect() on return.
export function signInWithGoogle() {
  if (!isConfigured()) throw new Error("Accounts aren't switched on yet");
  const redirectTo = encodeURIComponent(oauthRedirectTarget());
  const url =
    SUPABASE_URL + "/auth/v1/authorize?provider=google&redirect_to=" + redirectTo;
  window.location.assign(url);
}

// Call once on app/screen load. If we just came back from Google, the tokens
// are in location.hash (#access_token=...&refresh_token=...). Save the session,
// make sure the parent row exists, then clean the tokens out of the URL.
// Returns true if a sign-in was completed, false otherwise.
export async function completeOAuthRedirect() {
  let hash = "";
  try { hash = window.location.hash || ""; } catch (e) { return false; }
  if (!hash || hash.indexOf("access_token") === -1) {
    // Supabase can also return an error in the hash (e.g. provider not enabled).
    if (hash && hash.indexOf("error") !== -1) {
      try { history.replaceState(null, "", oauthRedirectTarget()); } catch (e) {}
    }
    return false;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token) return false;
  saveSession({ access_token, refresh_token });
  try { await ensureParentRow(); } catch (e) { /* best-effort */ }
  // Remove the tokens from the address bar so they aren't bookmarked/shared.
  try { history.replaceState(null, "", oauthRedirectTarget()); } catch (e) {}
  return true;
}

// ---- HELPER (per-kid character + voice) ----------------------------
// Stored per-kid in localStorage (works in guest + account mode) AND, when
// signed in, persisted to the kid_profiles.helper jsonb column (db/add-kid-helper.sql).
// Graceful: if the DB column doesn't exist yet, the localStorage copy still works.
export function getKidHelper(kid) {
  const key = kid && kid.id ? ("bk_helper_" + kid.id) : "bk_helper_v1";
  if (kid && kid.helper) return kid.helper;
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
export async function saveKidHelper(kid, helper) {
  if (!helper) return;
  const id = kid && kid.id ? kid.id : null;
  // No profile selected (pure guest) -> store under a global device key.
  try { localStorage.setItem(id ? ("bk_helper_" + id) : "bk_helper_v1", JSON.stringify(helper)); } catch (e) {}
  if (!id) return;
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid({ ...active, helper });
  if (isSignedIn()) {
    try { await restFetch(`kid_profiles?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ helper }) }); } catch (e) { /* column may not exist yet */ }
  }
}
