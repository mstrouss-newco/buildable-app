// /src/lib/rtMatch.js
// Lobby + identity for ANY real-time two-player game (tennis, pong, ...). Mirrors
// chessMatches.js: family-scoped rows over PostgREST + the parent's Supabase JWT.
// The fast live state (ball/paddles) does NOT go here — that's realtimeChannel.js.
// This row only holds the slow, important facts: who's playing, settings, final score.
import { getSession, ensureFreshToken } from "./accounts";

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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...(init || {}),
    headers: { ...headers(), ...((init && init.headers) || {}) },
  });
  const data = await r.json().catch(() => []);
  if (!r.ok) throw new Error((data && data.message) || "Request failed");
  return data;
}

export function myParentId() {
  try {
    const t = getSession().access_token;
    const p = JSON.parse(atob((t.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub;
  } catch (e) { return null; }
}

// The kid who creates the match is the HOST (owns the ball). The invited sibling is GUEST.
export async function createMatch(game, hostKidId, guestKidId, world, settings) {
  const rows = await rest("rt_matches", {
    method: "POST",
    body: JSON.stringify({
      parent_id: myParentId(),
      game,                       // "tennis" | "pong" | ...
      host_kid: hostKidId,
      guest_kid: guestKidId,
      world: world || "default",
      settings: settings || {},
      status: "open",
    }),
  });
  return rows && rows[0];
}

export async function listMyMatches(game, meKidId) {
  const rows = await rest(
    `rt_matches?game=eq.${game}&status=neq.done&or=(host_kid.eq.${meKidId},guest_kid.eq.${meKidId})&order=updated_at.desc`,
    { method: "GET" }
  );
  return rows || [];
}

export async function getMatch(id) {
  const rows = await rest(`rt_matches?id=eq.${id}&limit=1`, { method: "GET" });
  return rows && rows[0];
}

export async function patchMatch(id, patch) {
  const rows = await rest(`rt_matches?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return rows && rows[0];
}

// The live-channel topic for a match (fed to realtimeChannel.openChannel).
export function channelTopic(match) { return "match:" + match.id; }

// Which side am I? host (owns the ball) or guest.
export function roleFor(match, meKidId) { return match.host_kid === meKidId ? "host" : "guest"; }
