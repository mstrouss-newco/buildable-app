// /api/invite.js — quick-play GUEST invite matches (zero-auth). The "grandma flow".
// One endpoint for the whole flow; the token IS the capability (the link).
// invite_matches has RLS on with no public policy — only this service-role endpoint
// touches it. See db/create-invite-matches.sql + db/6d-guest-invite-chess.sql.
//
//   GET  /api/invite?token=ABC&device=D              -> poll one match (resume/join screen)
//   GET  /api/invite?parent=UUID                     -> list a family's guest games (parent portal)
//   POST { action:"create", game, name, device, world, hostKid, hostParent } -> { token }
//   POST { action:"join",   token, name, device }    -> match   (guest claims a seat)
//   POST { action:"move",   token, device, ... }     -> match   (ttt: index; chess: payload)
//   POST { action:"react",  token, device, text }    -> match   (canned reaction relay)
//   POST { action:"reset",  token, device }          -> match   (play again)
//
// Tic-tac-toe is server-authoritative (the server referees moves). Chess is a RELAY:
// the game engine enforces the rules on-device and the server just passes state between
// the two phones — the same model the in-family chess lobby already uses.
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
function tokenGen() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = "";
  for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
// ---- tic-tac-toe rules (server-authoritative) ----
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function tttInitial() { return { board: Array(9).fill(null), turn: "X", winner: null }; }
function tttWinner(b) {
  for (const [a, c, d] of WINS) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x) ? "draw" : null;
}
// Chess starts from an empty state; both devices seed the standard opening deterministically.
function initialState(game) { return game === "chess" ? null : tttInitial(); }

async function getRow(token) {
  const r = await fetch(`${URL}/rest/v1/invite_matches?token=eq.${encodeURIComponent(token)}&limit=1`, { headers: H });
  const j = await r.json().catch(() => []); return Array.isArray(j) ? j[0] : null;
}
async function patchRow(token, patch) {
  const r = await fetch(`${URL}/rest/v1/invite_matches?token=eq.${encodeURIComponent(token)}`,
    { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const j = await r.json().catch(() => []); return Array.isArray(j) ? j[0] : null;
}
// what seat is this device? "host" (X / white) | "guest" (O / black) | null
function seatOf(row, device) {
  if (row.host && row.host.device === device) return "host";
  if (row.guest && row.guest.device === device) return "guest";
  return null;
}
function turnOf(row) {
  if (row.state && row.state.turn) return row.state.turn; // ttt: X/O, chess: w/b
  return row.game === "chess" ? "w" : "X";
}
function publicView(row, device) {
  const seat = seatOf(row, device);
  const yourMark = seat === "host" ? (row.game === "chess" ? "w" : "X")
                 : seat === "guest" ? (row.game === "chess" ? "b" : "O") : null;
  return {
    token: row.token, game: row.game, world: row.world || null,
    state: row.state || null, lastMove: row.last_move || null,
    reaction: row.reaction || null, status: row.status, turn: turnOf(row),
    winner: (row.state && row.state.winner) || row.winner || null,
    host: row.host ? { name: row.host.name } : null,
    guest: row.guest ? { name: row.guest.name } : null,
    you: seat, yourMark,
  };
}

export default async function handler(req, res) {
  if (!URL || !KEY) return res.status(500).json({ error: "server not configured" });
  try {
    if (req.method === "GET") {
      // Parent-portal listing: a family's guest games by owner id OR by kid ids.
      const parent = (req.query.parent || "").toString();
      const kids = (req.query.kids || "").toString();
      if (parent || kids) {
        const filter = parent
          ? `host_parent=eq.${encodeURIComponent(parent)}`
          : `host_kid=in.(${kids.split(",").map((k) => encodeURIComponent(k.trim())).filter(Boolean).join(",")})`;
        const r = await fetch(`${URL}/rest/v1/invite_matches?${filter}&select=token,game,status,host,guest,winner,created_at,updated_at,expires_at&order=updated_at.desc&limit=50`, { headers: H });
        const rows = await r.json().catch(() => []);
        const list = (Array.isArray(rows) ? rows : []).map((m) => ({
          token: m.token, game: m.game, status: m.status,
          host: m.host ? { name: m.host.name } : null,
          guest: m.guest ? { name: m.guest.name } : null,
          winner: m.winner || null, created_at: m.created_at, updated_at: m.updated_at, expires_at: m.expires_at,
        }));
        return res.status(200).json({ matches: list });
      }
      const token = (req.query.token || "").toString();
      const device = (req.query.device || "").toString();
      if (!token) return res.status(400).json({ error: "token required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      if (row.expires_at && new Date(row.expires_at) < new Date()) return res.status(410).json({ error: "This game link has expired." });
      return res.status(200).json(publicView(row, device));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const b = await readBody(req);
    const action = (b.action || "").toString();
    const device = (b.device || "").toString().slice(0, 64);
    const name = (b.name || "").toString().trim().slice(0, 24) || "Player";

    if (action === "create") {
      if (!device) return res.status(400).json({ error: "device required" });
      const game = (b.game || "ttt").toString();
      const world = b.world ? b.world.toString().slice(0, 24) : null;
      const hostKid = b.hostKid ? b.hostKid.toString().slice(0, 64) : null;
      // Resolve the family owner server-side so guest games show in the right parent portal.
      let hostParent = null;
      if (hostKid) {
        try {
          const kr = await fetch(`${URL}/rest/v1/kid_profiles?id=eq.${encodeURIComponent(hostKid)}&select=parent_id&limit=1`, { headers: H });
          const kj = await kr.json().catch(() => []);
          if (Array.isArray(kj) && kj[0] && kj[0].parent_id) hostParent = kj[0].parent_id;
        } catch { /* device-local kid: no parent, stays null */ }
      }
      const token = tokenGen();
      const rec = { token, game, world, state: initialState(game), last_move: null, reaction: null,
        host: { name, device }, host_kid: hostKid, host_parent: hostParent, status: "open" };
      const r = await fetch(`${URL}/rest/v1/invite_matches`, {
        method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(rec),
      });
      const j = await r.json().catch(() => []);
      if (!r.ok) return res.status(500).json({ error: (j && j.message) || "create failed" });
      return res.status(200).json({ token });
    }

    if (action === "join") {
      const token = (b.token || "").toString();
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      if (row.expires_at && new Date(row.expires_at) < new Date()) return res.status(410).json({ error: "This game link has expired." });
      const seat = seatOf(row, device);
      if (seat) return res.status(200).json(publicView(row, device)); // already in (resume)
      if (row.guest) return res.status(409).json({ error: "This game already has two players." });
      const updated = await patchRow(token, { guest: { name, device }, status: "playing" });
      return res.status(200).json(publicView(updated, device));
    }

    if (action === "move") {
      const token = (b.token || "").toString();
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      const seat = seatOf(row, device);
      if (!seat) return res.status(403).json({ error: "not a player in this game" });

      if (row.game === "chess") {
        // RELAY: the engine already enforced the rules; store what it sent.
        const p = b.payload || {};
        if (!p.state) return res.status(400).json({ error: "payload.state required" });
        const updated = await patchRow(token, {
          state: p.state, last_move: p.lastMove || null,
          status: p.over ? "done" : "playing", winner: p.over ? (p.winner || null) : null,
        });
        return res.status(200).json(publicView(updated, device));
      }

      // tic-tac-toe: server referees.
      const idx = Number(b.index);
      const mark = seat === "host" ? "X" : "O";
      const st = row.state || tttInitial();
      if (st.winner) return res.status(200).json(publicView(row, device));        // already over
      if (st.turn !== mark) return res.status(200).json(publicView(row, device)); // not your turn
      if (!(idx >= 0 && idx < 9) || st.board[idx]) return res.status(200).json(publicView(row, device)); // bad/taken
      st.board[idx] = mark;
      const w = tttWinner(st.board);
      st.winner = w;
      st.turn = mark === "X" ? "O" : "X";
      const updated = await patchRow(token, { state: st, status: w ? "done" : "playing", winner: w || null });
      return res.status(200).json(publicView(updated, device));
    }

    if (action === "react") {
      const token = (b.token || "").toString();
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      if (!seatOf(row, device)) return res.status(403).json({ error: "not a player in this game" });
      const text = (b.text || "").toString().slice(0, 40);
      const reaction = { text, by: device, at: new Date().toISOString() };
      const updated = await patchRow(token, { reaction });
      return res.status(200).json(publicView(updated, device));
    }

    if (action === "reset") {
      const token = (b.token || "").toString();
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      if (!seatOf(row, device)) return res.status(403).json({ error: "not a player in this game" });
      const updated = await patchRow(token, { state: initialState(row.game), last_move: null,
        status: row.guest ? "playing" : "open", winner: null });
      return res.status(200).json(publicView(updated, device));
    }

    return res.status(400).json({ error: "bad action" });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || "error" });
  }
}
