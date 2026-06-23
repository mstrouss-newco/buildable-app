// /src/lib/accounts.js
// -------------------------------------------------------------
// ZERO-AUTH kid-profile layer for Buildable Kids.
//
// IMPORTANT (this build): there are NO accounts and NO login. We cannot
// create accounts yet, so there is no parent email/password, no Supabase
// Auth, and no Bearer token anywhere in this file. Earlier versions called
// Supabase Auth (/auth/v1/user) which failed with "This endpoint requires
// a valid Bearer token" whenever a child tried to add a profile.
//
// New model:
//   * Kid profiles live LOCALLY on the device (localStorage). Tapping a
//     tile selects the active kid. No network, no auth, works offline.
//   * Songs/games still persist CENTRALLY via the existing service-key API
//     endpoints (/api/save-song.js etc), scoped by device_id. Those
//     endpoints use the Supabase SERVICE key server-side and bypass RLS,
//     so the central library keeps working with zero auth.
//   * The active kid's local id is passed through to those endpoints as
//     kidProfileId so a child's saves can be grouped per-tile on-device.
//
// When real accounts are added later, this file is the single seam to swap
// the local store for a synced/credentialed one.
// -------------------------------------------------------------

const KIDS_KEY = "bk_kid_profiles_v1";   // [{ id, display_name, avatar, created_at }]
const ACTIVE_KID_KEY = "bk_active_kid_v1"; // the selected kid object

// In a no-auth world the app is ALWAYS "configured" enough to play.
export function isConfigured() { return true; }

// There is no grown-up login anymore. Kept as stable no-ops so any caller
// that still imports them does not crash.
export function isSignedIn() { return true; }
export function getSession() { return null; }
export function signOut() { setActiveKid(null); }

// ---- local id helper ----------------------------------------------
function makeId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return "kid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

// ---- active kid (selected tile) -----------------------------------
export function getActiveKid() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_KID_KEY) || "null"); }
  catch { return null; }
}
export function setActiveKid(kid) {
  if (kid) localStorage.setItem(ACTIVE_KID_KEY, JSON.stringify(kid));
  else localStorage.removeItem(ACTIVE_KID_KEY);
}

// ---- KID PROFILES (device-local, no auth) -------------------------
function loadKids() {
  try {
    const arr = JSON.parse(localStorage.getItem(KIDS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveKids(arr) {
  localStorage.setItem(KIDS_KEY, JSON.stringify(arr || []));
}

// Returns the device's kid profiles, oldest first. Async to match the old
// signature so callers (await listKidProfiles()) need no changes.
export async function listKidProfiles() {
  return loadKids();
}

// Create a profile on THIS device. No network, no Bearer token.
export async function createKidProfile(displayName, avatar) {
  const name = (displayName || "").trim();
  if (!name) throw new Error("Please enter a name");
  const kids = loadKids();
  const kid = {
    id: makeId(),
    display_name: name.slice(0, 40),
    avatar: avatar || "🙂",
    created_at: new Date().toISOString(),
  };
  kids.push(kid);
  saveKids(kids);
  return kid;
}

// Rename a profile on this device (also keeps the active-kid copy fresh).
export async function renameKidProfile(id, displayName) {
  const name = (displayName || "").trim();
  if (!name) throw new Error("Please enter a name");
  const kids = loadKids();
  const k = kids.find((x) => x.id === id);
  if (!k) throw new Error("Profile not found");
  k.display_name = name.slice(0, 40);
  saveKids(kids);
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid(k);
  return k;
}

// Remove a profile from this device. Songs already saved stay in the
// central library (they are keyed by device, not deleted here).
export async function deleteKidProfile(id) {
  const kids = loadKids().filter((x) => x.id !== id);
  saveKids(kids);
  const active = getActiveKid();
  if (active && active.id === id) setActiveKid(null);
  return true;
}
