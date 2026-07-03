// /src/lib/friends.js
// Client wrapper for the ONE shared friends + invites system (api/friends.js)
// plus the presence heartbeat. Every game reuses this -- there is exactly one
// friends list, one online-status source, one invite system across all games.
// Requires the parent-account lane (a signed-in grown-up) for cross-account play.
import { getSession, ensureFreshToken, isSignedIn, refreshSession } from "./accounts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

async function api(method, body, query) {
  await ensureFreshToken();
  const url = "/api/friends" + (query ? `?${query}` : "");
  const doFetch = () => {
    const s = getSession();
    const token = (s && s.access_token) || "";
    return fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  };
  let r = await doFetch();
  // The access token can expire mid-session (aggressively on iPad Safari).
  // Refresh once and retry so the friends list never silently comes back empty.
  if (r.status === 401) {
    const t = await refreshSession();
    if (t) r = await doFetch();
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || "Something went wrong.");
  return j;
}

// ---- friend codes + friendships (grown-ups area) ----
export const getMyFriendCode = () => api("POST", { action: "myCode" }).then((j) => j.code);
export const addFriendByCode = (code) => api("POST", { action: "addByCode", code });
export const listPendingFriends = () => api("POST", { action: "pending" });
export const approveFriend = (id) => api("POST", { action: "approve", id });
export const declineFriend = (id) => api("POST", { action: "decline", id });
export const unfriend = (id) => api("POST", { action: "unfriend", id });

// ---- the reusable friends list (siblings + approved friend-family kids) ----
export const listFriends = (kidId) => api("POST", { action: "listFriends", kidId }).then((j) => j.friends || []);

// ---- game invites ----
export const sendInvite = (opts) => api("POST", { action: "invite", ...opts }); // {fromKid,toKid,game,transport,world}
export const cancelInvite = (inviteId) => api("POST", { action: "cancelInvite", inviteId });
export const declineInvite = (inviteId) => api("POST", { action: "declineInvite", inviteId });
export const acceptInvite = (inviteId) => api("POST", { action: "accept", inviteId }).then((j) => j.matchId);
export const pollInvite = (inviteId) => api("GET", null, `invite=${encodeURIComponent(inviteId)}`);
export const inboxInvites = () => api("GET", null, "inbox=1").then((j) => j.invites || []);

// ---- PRESENCE heartbeat ----------------------------------------------------
// Marks the active kid "online" by stamping kid_profiles.last_seen (own row,
// allowed by the existing family RLS). Cheap: one tiny PATCH every ~30s only
// while the app is open. Call startPresence(kid) once you know who's playing.
let presenceTimer = null;
async function ping(kidId) {
  if (!isSignedIn() || !SUPABASE_URL || !kidId) return;
  try {
    await ensureFreshToken();
    const s = getSession();
    await fetch(`${SUPABASE_URL}/rest/v1/kid_profiles?id=eq.${kidId}`, {
      method: "PATCH",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${(s && s.access_token) || ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ last_seen: new Date().toISOString() }),
    });
  } catch { /* presence is best-effort */ }
}
export function startPresence(kid) {
  stopPresence();
  const id = kid && kid.id;
  if (!id) return;
  ping(id);
  presenceTimer = setInterval(() => ping(id), 30000);
}
export function stopPresence() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
}
