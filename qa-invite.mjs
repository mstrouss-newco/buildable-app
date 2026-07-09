// Headless QA for api/invite.js — the guest "grandma flow" backend.
// No real Supabase: we stub global.fetch with an in-memory invite_matches +
// kid_profiles, then drive the whole flow: create -> share -> join -> a chess
// match BOTH directions (relay) -> canned reaction -> parent-portal listing ->
// expiry. Also a quick tic-tac-toe server-referee check.
//
// Run: node outputs/qa-invite.mjs /tmp/bak
import path from "path";
const dir = process.argv[2] || ".";
process.env.SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_KEY = "svc";

// ---- in-memory tables ----
const rows = new Map();               // token -> invite_matches row
const kids = new Map([["kid-riley", { id: "kid-riley", parent_id: "parent-1" }]]);

// ---- fetch stub emulating PostgREST ----
global.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  const p = u.pathname; const m = (opt.method || "GET").toUpperCase();
  const q = u.searchParams;
  const ok = (body) => ({ ok: true, json: async () => body });
  if (p.endsWith("/rest/v1/kid_profiles")) {
    const id = (q.get("id") || "").replace("eq.", "");
    const k = kids.get(id); return ok(k ? [{ parent_id: k.parent_id }] : []);
  }
  if (p.endsWith("/rest/v1/invite_matches")) {
    if (m === "POST") { const rec = JSON.parse(opt.body); rows.set(rec.token, { ...rec, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), expires_at: rec.expires_at || new Date(Date.now() + 7 * 864e5).toISOString() }); return ok([rows.get(rec.token)]); }
    if (m === "PATCH") { const tok = (q.get("token") || "").replace("eq.", ""); const row = rows.get(tok); const patch = JSON.parse(opt.body); Object.assign(row, patch, { updated_at: new Date().toISOString() }); return ok([row]); }
    // GET
    if (q.has("token")) { const tok = (q.get("token") || "").replace("eq.", ""); const row = rows.get(tok); return ok(row ? [row] : []); }
    if (q.has("host_parent")) { const pid = (q.get("host_parent") || "").replace("eq.", ""); return ok([...rows.values()].filter((r) => r.host_parent === pid)); }
    if (q.has("host_kid")) { const raw = q.get("host_kid") || ""; const ids = raw.replace("in.(", "").replace(")", "").split(",").map(decodeURIComponent); return ok([...rows.values()].filter((r) => ids.includes(r.host_kid))); }
    return ok([]);
  }
  throw new Error("unexpected fetch " + url);
};

const { default: handler } = await import(path.resolve(dir, "api/invite.js"));

// ---- tiny req/res harness ----
function call({ method = "GET", query = {}, body = null }) {
  return new Promise((resolve) => {
    const req = { method, query, body };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); return this; } };
    handler(req, res);
  });
}

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.error("FAIL: " + name); } }

// ===== CHESS: the grandma flow =====
// Riley (signed-in kid) creates a chess link.
const created = await call({ method: "POST", body: { action: "create", game: "chess", name: "Riley", device: "dev-riley", world: "jungle", hostKid: "kid-riley" } });
check("create returns a token", created.status === 200 && typeof created.body.token === "string");
const token = created.body.token;
check("create resolved host_parent from kid id", rows.get(token).host_parent === "parent-1");
check("chess starts with empty state (both sides seed opening)", rows.get(token).state === null);

// Host polls -> waiting screen (host seat, no guest yet)
let host = await call({ method: "GET", query: { token, device: "dev-riley" } });
check("host sees itself as host / white", host.body.you === "host" && host.body.yourMark === "w");
check("host game is open, no guest", host.body.status === "open" && !host.body.guest);

// Grandma opens the link on another device and joins.
const joined = await call({ method: "POST", body: { action: "join", token, name: "Grandma", device: "dev-grandma" } });
check("guest joins as black", joined.body.you === "guest" && joined.body.yourMark === "b");
check("status flips to playing", joined.body.status === "playing");

// Riley (white) moves first — engine sends the whole new state (relay).
const wState = { board: [["wmoved"]], turn: "b" };
const move1 = await call({ method: "POST", body: { action: "move", token, device: "dev-riley", payload: { state: wState, turn: "b", lastMove: { from: [6, 4], to: [4, 4] }, over: false } } });
check("white move stored, turn now black", move1.body.turn === "b" && move1.body.state.turn === "b");
check("white move recorded lastMove", move1.body.lastMove && move1.body.lastMove.to[0] === 4);

// Grandma's device polls and sees white's move (her turn now).
let g = await call({ method: "GET", query: { token, device: "dev-grandma" } });
check("guest poll sees it's black's turn", g.body.turn === "b" && g.body.state.turn === "b");

// Grandma (black) moves back — the other direction.
const bState = { board: [["bmoved"]], turn: "w" };
const move2 = await call({ method: "POST", body: { action: "move", token, device: "dev-grandma", payload: { state: bState, turn: "w", lastMove: { from: [1, 4], to: [3, 4] }, over: false } } });
check("black move stored, turn now white", move2.body.turn === "w");

// Riley polls and sees black's reply (both directions proven).
host = await call({ method: "GET", query: { token, device: "dev-riley" } });
check("host poll sees black replied, white to move", host.body.turn === "w" && host.body.state.turn === "w");

// Canned reaction relay.
await call({ method: "POST", body: { action: "react", token, device: "dev-grandma", text: "Nice move!" } });
host = await call({ method: "GET", query: { token, device: "dev-riley" } });
check("reaction relayed to opponent", host.body.reaction && host.body.reaction.text === "Nice move!" && host.body.reaction.by === "dev-grandma");

// Checkmate ends the game.
const endMove = await call({ method: "POST", body: { action: "move", token, device: "dev-riley", payload: { state: { turn: "b" }, turn: "b", lastMove: { from: [0, 0], to: [1, 1] }, over: true, winner: "w" } } });
check("game over marks done + winner", endMove.body.status === "done" && endMove.body.winner === "w");

// A non-player device cannot move.
const intruder = await call({ method: "POST", body: { action: "move", token, device: "dev-stranger", payload: { state: {}, turn: "w" } } });
check("stranger cannot move (403)", intruder.status === 403);

// Guest sees only THIS match: publicView never leaks the opponent's device id.
g = await call({ method: "GET", query: { token, device: "dev-grandma" } });
check("public view hides device ids", g.body.host && g.body.host.device === undefined && g.body.guest.device === undefined);

// ===== Parent-portal visibility =====
const list = await call({ method: "GET", query: { kids: "kid-riley" } });
check("parent portal lists the guest game by kid", list.body.matches && list.body.matches.length === 1 && list.body.matches[0].game === "chess");
check("listing hides tokens? (token present for management)", typeof list.body.matches[0].token === "string");

// ===== Link expiry =====
rows.get(token).expires_at = new Date(Date.now() - 1000).toISOString();
const expired = await call({ method: "GET", query: { token, device: "dev-riley" } });
check("expired link returns 410", expired.status === 410);

// ===== Tic-tac-toe: server referees (unchanged behavior) =====
const t = await call({ method: "POST", body: { action: "create", game: "ttt", name: "A", device: "da" } });
const tk = t.body.token;
await call({ method: "POST", body: { action: "join", token: tk, name: "B", device: "db" } });
check("ttt seeds a real starting board", Array.isArray(rows.get(tk).state.board) && rows.get(tk).state.board.length === 9);
let tv = await call({ method: "POST", body: { action: "move", token: tk, device: "da", index: 0 } }); // X
await call({ method: "POST", body: { action: "move", token: tk, device: "db", index: 3 } }); // O
await call({ method: "POST", body: { action: "move", token: tk, device: "da", index: 1 } }); // X
await call({ method: "POST", body: { action: "move", token: tk, device: "db", index: 4 } }); // O
tv = await call({ method: "POST", body: { action: "move", token: tk, device: "da", index: 2 } }); // X wins top row
check("ttt server detects the win", tv.body.state.winner === "X" && tv.body.status === "done");
const badTurn = await call({ method: "POST", body: { action: "move", token: tk, device: "db", index: 5 } });
check("ttt rejects moves after game over", badTurn.body.state.winner === "X");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} checks passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
