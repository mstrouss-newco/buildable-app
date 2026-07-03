// /src/lib/friendMatches.js
// Turn-based ("poll a row") transport for CROSS-ACCOUNT friend matches -- the
// exact chess model, but on the shared friend_matches table (dual-parent RLS
// lets BOTH families read + patch the row). One table serves every turn-based
// game; distinguished by friend_matches.game. Mirrors src/lib/chessMatches.js.
import { getSession, ensureFreshToken, refreshSession } from "./accounts";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function headers() {
  const s = getSession();
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${(s && s.access_token) || ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}
async function rest(path, init) {
  await ensureFreshToken();
  const doFetch = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...headers(), ...((init && init.headers) || {}) } });
  let r = await doFetch();
  if (r.status === 401) {           // token expired mid-session -> refresh + retry once
    const t = await refreshSession();
    if (t) r = await doFetch();
  }
  const data = await r.json().catch(() => []);
  if (!r.ok) throw new Error((data && data.message) || "Request failed");
  return data;
}

export async function getFriendMatch(id) {
  const rows = await rest(`friend_matches?id=eq.${id}&limit=1`, { method: "GET" });
  return rows && rows[0];
}
export async function patchFriendMatch(id, patch) {
  const rows = await rest(`friend_matches?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return rows && rows[0];
}
// Active friend matches involving one of my kids (for a "your games" list).
export async function listFriendMatches(game, kidId) {
  const rows = await rest(`friend_matches?game=eq.${game}&status=eq.active&or=(host_kid.eq.${kidId},guest_kid.eq.${kidId})&order=updated_at.desc`, { method: "GET" });
  return rows || [];
}
// ALL active turn-based friend matches for a kid, across every game (drives the
// app-wide "your move in <game>" home nudge). Turn-based only -- real-time games
// (tennis) don't leave an async "your move" waiting.
export async function listActiveFriendMatches(kidId) {
  const rows = await rest(`friend_matches?transport=eq.turns&status=eq.active&or=(host_kid.eq.${kidId},guest_kid.eq.${kidId})&order=updated_at.desc`, { method: "GET" });
  return rows || [];
}
// Which side is this kid? The inviter is 'host', the invitee is 'guest'.
export function roleFor(match, kidId) {
  if (!match) return null;
  return match.host_kid === kidId ? "host" : "guest";
}
export function oppKidOf(match, kidId) {
  if (!match) return null;
  return match.host_kid === kidId ? match.guest_kid : match.host_kid;
}
