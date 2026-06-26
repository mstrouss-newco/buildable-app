// /src/lib/chessMatches.js
// Online chess between two kids in the same family. Uses the parent account's
// Supabase session (JWT) + row-level security on chess_matches (parent_id = auth.uid()).
// Requires the email/parent account lane (kid identities shared across devices).
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

export async function createMatch(meKidId, oppKidId, world, state) {
  const rows = await rest("chess_matches", {
    method: "POST",
    body: JSON.stringify({
      parent_id: myParentId(),
      white_kid: meKidId,
      black_kid: oppKidId,
      world: world || "jungle",
      board: state,
      turn: "w",
      status: "active",
    }),
  });
  return rows && rows[0];
}

export async function listMyMatches(meKidId) {
  const rows = await rest(
    `chess_matches?status=eq.active&or=(white_kid.eq.${meKidId},black_kid.eq.${meKidId})&order=updated_at.desc`,
    { method: "GET" }
  );
  return rows || [];
}

export async function getMatch(id) {
  const rows = await rest(`chess_matches?id=eq.${id}&limit=1`, { method: "GET" });
  return rows && rows[0];
}

export async function patchMatch(id, patch) {
  const rows = await rest(`chess_matches?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  return rows && rows[0];
}
