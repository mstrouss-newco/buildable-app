// /api/invite.js — quick-play GUEST invite matches (zero-auth).
// One endpoint for the whole flow; server is authoritative (validates turns/moves).
//   GET  /api/invite?token=ABC                      -> poll the match (resume/join screen)
//   POST { action:"create", game, name, device }    -> { token }            (kid starts + shares link)
//   POST { action:"join",   token, name, device }   -> match                (guest claims a seat)
//   POST { action:"move",   token, device, index }  -> match                (make a move)
// The token IS the capability (the link). Access only through this service-role endpoint;
// invite_matches has RLS on with no public policy. See db/create-invite-matches.sql.
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
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function initialState(game) { return { board: Array(9).fill(null), turn: "X", winner: null }; }
function winnerOf(b) {
  for (const [a, c, d] of WINS) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x) ? "draw" : null;
}
async function getRow(token) {
  const r = await fetch(`${URL}/rest/v1/invite_matches?token=eq.${encodeURIComponent(token)}&limit=1`, { headers: H });
  const j = await r.json().catch(() => []); return Array.isArray(j) ? j[0] : null;
}
async function patchRow(token, patch) {
  const r = await fetch(`${URL}/rest/v1/invite_matches?token=eq.${encodeURIComponent(token)}`,
    { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(patch) });
  const j = await r.json().catch(() => []); return Array.isArray(j) ? j[0] : null;
}
// what seat is this device? "host" (X) | "guest" (O) | null
function seatOf(row, device) {
  if (row.host && row.host.device === device) return "host";
  if (row.guest && row.guest.device === device) return "guest";
  return null;
}
function publicView(row, device) {
  const seat = seatOf(row, device);
  return {
    token: row.token, game: row.game, state: row.state, status: row.status,
    host: row.host ? { name: row.host.name } : null,
    guest: row.guest ? { name: row.guest.name } : null,
    you: seat, yourMark: seat === "host" ? "X" : seat === "guest" ? "O" : null,
  };
}

export default async function handler(req, res) {
  if (!URL || !KEY) return res.status(500).json({ error: "server not configured" });
  try {
    if (req.method === "GET") {
      const token = (req.query.token || "").toString();
      const device = (req.query.device || "").toString();
      if (!token) return res.status(400).json({ error: "token required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
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
      const token = tokenGen();
      const r = await fetch(`${URL}/rest/v1/invite_matches`, {
        method: "POST", headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({ token, game, state: initialState(game), host: { name, device }, status: "open" }),
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
      const seat = seatOf(row, device);
      if (seat) return res.status(200).json(publicView(row, device)); // already in (resume)
      if (row.guest) return res.status(409).json({ error: "This game already has two players." });
      const updated = await patchRow(token, { guest: { name, device }, status: "playing" });
      return res.status(200).json(publicView(updated, device));
    }

    if (action === "move") {
      const token = (b.token || "").toString();
      const idx = Number(b.index);
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      const seat = seatOf(row, device);
      if (!seat) return res.status(403).json({ error: "not a player in this game" });
      const mark = seat === "host" ? "X" : "O";
      const st = row.state || initialState(row.game);
      if (st.winner) return res.status(200).json(publicView(row, device));        // already over
      if (st.turn !== mark) return res.status(200).json(publicView(row, device)); // not your turn
      if (!(idx >= 0 && idx < 9) || st.board[idx]) return res.status(200).json(publicView(row, device)); // bad/taken
      st.board[idx] = mark;
      const w = winnerOf(st.board);
      st.winner = w;
      st.turn = mark === "X" ? "O" : "X";
      const updated = await patchRow(token, { state: st, status: w ? "done" : "playing" });
      return res.status(200).json(publicView(updated, device));
    }

    if (action === "reset") {
      const token = (b.token || "").toString();
      if (!token || !device) return res.status(400).json({ error: "token + device required" });
      const row = await getRow(token);
      if (!row) return res.status(404).json({ error: "not found" });
      if (!seatOf(row, device)) return res.status(403).json({ error: "not a player in this game" });
      const updated = await patchRow(token, { state: initialState(row.game), status: row.guest ? "playing" : "open" });
      return res.status(200).json(publicView(updated, device));
    }

    return res.status(400).json({ error: "bad action" });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || "error" });
  }
}
