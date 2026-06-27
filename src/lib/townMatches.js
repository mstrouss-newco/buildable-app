// /src/lib/townMatches.js
// Family Town — an original board game for 3-4 kids in the SAME family, across
// devices. Turn-based "poll a row" (the chess model), extended from 2 fixed
// players to an N-seat array. Uses the parent account's Supabase session (JWT) +
// row-level security on town_matches (parent_id = auth.uid()). Requires the
// email/parent account lane (kid identities shared across devices).
//
// The WHOLE game state lives in one column (`board`, like chess) so a dropped or
// late poll self-heals on the next read. `turn`/`last_roll`/`reaction` are mirrored
// out as columns so the lobby + the poller can cheaply tell what changed.
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

// parent_accounts.id === auth.uid(); read it from the JWT 'sub' claim.
export function myParentId() {
  try {
    const t = getSession().access_token;
    const p = JSON.parse(atob((t.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub;
  } catch (e) {
    return null;
  }
}

// The four seat colors, matching the engine (public/family-town.html SEAT_COLORS).
export const SEAT_COLORS = ["purple", "coral", "mint", "sky"];
export const START_COINS = 25;

// Build the initial whole-game state. MUST match the engine's newGame() shape so
// the engine can render a row created here. `seats` = [{ kidId, name }] in seat order.
export function initialState(seats, laps) {
  return {
    seats: seats.map((s, i) => ({
      name: s.name || `Player ${i + 1}`,
      color: SEAT_COLORS[i],
      seat: i,
      bot: false,
      pos: 0,
      coins: START_COINS,
      owns: [],
      laps: 0,
      finished: false,
    })),
    turn: 0,
    round: 0,
    lapsTarget: laps || 3,
    owners: {},
    phase: "rolling",
    lastRoll: null,
    card: null,
    msg: "",
    winner: null,
  };
}

// seats: [{ kidId, name }] in seat order; seats[0] is the host (the starter).
export async function createMatch(seats, laps) {
  const state = initialState(seats, laps);
  const players = seats.map((s, i) => ({ kid_id: s.kidId, name: s.name, seat: i, color: SEAT_COLORS[i] }));
  const rows = await rest("town_matches", {
    method: "POST",
    body: JSON.stringify({
      parent_id: myParentId(),
      host_kid: seats[0].kidId,
      players,
      turn: 0,
      laps_target: laps || 3,
      board: state,
      status: "active",
    }),
  });
  return rows && rows[0];
}

// All active games this kid is a seat in.
export async function listMyMatches(meKidId) {
  // PostgREST jsonb containment: players @> [{"kid_id": "<id>"}]
  const filter = encodeURIComponent(JSON.stringify([{ kid_id: meKidId }]));
  const rows = await rest(
    `town_matches?status=eq.active&players=cs.${filter}&order=updated_at.desc`,
    { method: "GET" }
  );
  return rows || [];
}

export async function getMatch(id) {
  const rows = await rest(`town_matches?id=eq.${id}&limit=1`, { method: "GET" });
  return rows && rows[0];
}

export async function patchMatch(id, patch) {
  const rows = await rest(`town_matches?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return rows && rows[0];
}

// Which seat is this kid in a given match row?
export function seatOf(match, meKidId) {
  const ps = (match && match.players) || [];
  const p = ps.find((x) => x.kid_id === meKidId);
  return p ? p.seat : -1;
}
