// /api/friends.js
// ==================================================================
// THE ONE shared friends + invites endpoint for every game.
// Service-role (bypasses RLS) but ALWAYS validates the caller's parent
// JWT first, then only ever touches rows that caller's family is party
// to. Cross-family reads/writes (resolving a friend code, emailing the
// other grown-up, creating a cross-account match) MUST live here because
// row-level security stops a family from seeing another family directly.
//
// Live match moves/reactions do NOT go through here -- they use direct
// RLS on friend_matches (see src/lib/friendMatches.js). This endpoint is
// only the lobby brain: codes, approvals, presence-aware invites.
//
// Auth: send the parent's Supabase access token as `Authorization:
// Bearer <token>`. We verify it via GoTrue /user and use the returned
// id as the caller's parent_accounts.id (= auth.uid()).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (required),
//      RESEND_API_KEY, RESEND_FROM, APP_URL (optional -- email is
//      skipped gracefully if RESEND_API_KEY is unset).
// See db/create-friends.sql for the tables. No free-text chat, ever.
// ==================================================================
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Buildable <hello@buildablekids.com>";
const APP_URL = process.env.APP_URL || "https://buildablekids.com";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const ONLINE_MS = 90 * 1000;

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
}
async function sb(path, init) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...(init || {}), headers: { ...H, ...((init && init.headers) || {}) } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.message) || `db error ${r.status}`);
  return j;
}
// Verify the caller and return their parent id (= auth.uid()), or null.
async function callerParentId(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const r = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return (u && u.id) || null;
}
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });
    return r.ok;
  } catch { return false; }
}
const isOnline = (lastSeen) => !!lastSeen && (Date.now() - new Date(lastSeen).getTime()) < ONLINE_MS;
const firstNames = (kids) => (kids || []).map((k) => k.name).filter(Boolean).slice(0, 3).join(", ") || "A family";

async function parentRow(id) {
  const rows = await sb(`parent_accounts?id=eq.${id}&select=id,email,friend_code&limit=1`, { method: "GET" });
  return rows && rows[0];
}
async function ensureCode(id) {
  const p = await parentRow(id);
  if (p && p.friend_code) return p.friend_code;
  // Fallback if the backfill trigger hasn't run for this row yet.
  let code = "";
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 6; i++) code += A[Math.floor(Math.random() * A.length)];
  await sb(`parent_accounts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ friend_code: code }) });
  return code;
}
async function kidsOf(parentId) {
  return (await sb(`kid_profiles?parent_id=eq.${parentId}&select=id,name,avatar,last_seen&order=created_at.asc`, { method: "GET" })) || [];
}
// active friendships that this family is part of -> the OTHER family's parent ids
async function friendParentIds(me) {
  const rows = (await sb(`family_friends?status=eq.active&or=(parent_a.eq.${me},parent_b.eq.${me})&select=parent_a,parent_b`, { method: "GET" })) || [];
  return rows.map((r) => (r.parent_a === me ? r.parent_b : r.parent_a));
}

export default async function handler(req, res) {
  if (!URL || !KEY) return res.status(500).json({ error: "server not configured" });
  try {
    const me = await callerParentId(req);
    if (!me) return res.status(401).json({ error: "sign in required" });

    // ---- GET: light polls (waiting screen + invite inbox) ----
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.invite) {
        const rows = await sb(`game_invites?id=eq.${q.invite}&or=(from_parent.eq.${me},to_parent.eq.${me})&select=id,status,match_id,game&limit=1`, { method: "GET" });
        const row = rows && rows[0];
        if (!row) return res.status(404).json({ error: "not found" });
        return res.status(200).json({ status: row.status, matchId: row.match_id, game: row.game });
      }
      // inbox: pending invites addressed to any of my kids
      const inv = (await sb(`game_invites?to_parent=eq.${me}&status=eq.pending&expires_at=gt.${new Date().toISOString()}&order=created_at.desc`, { method: "GET" })) || [];
      const out = [];
      for (const iv of inv) {
        const fk = await sb(`kid_profiles?id=eq.${iv.from_kid}&select=name,avatar&limit=1`, { method: "GET" });
        out.push({ id: iv.id, game: iv.game, transport: iv.transport, world: iv.world, toKid: iv.to_kid, matchId: iv.match_id || null, fromName: (fk && fk[0] && fk[0].name) || "A friend", fromAvatar: (fk && fk[0] && fk[0].avatar) || null });
      }
      return res.status(200).json({ invites: out });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const b = await readBody(req);
    const action = (b.action || "").toString();

    // ---------- FRIEND CODES + FRIENDSHIPS ----------
    if (action === "myCode") {
      const code = await ensureCode(me);
      return res.status(200).json({ code });
    }

    if (action === "addByCode") {
      const code = (b.code || "").toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (code.length !== 6) return res.status(400).json({ error: "That code doesn't look right." });
      const mine = await ensureCode(me);
      if (code === mine) return res.status(400).json({ error: "That's your own family's code." });
      const found = await sb(`parent_accounts?friend_code=eq.${code}&select=id,email&limit=1`, { method: "GET" });
      const other = found && found[0];
      if (!other) return res.status(404).json({ error: "No family found with that code." });
      // Already connected (either direction)?
      const existing = await sb(`family_friends?or=(and(parent_a.eq.${me},parent_b.eq.${other.id}),and(parent_a.eq.${other.id},parent_b.eq.${me}))&limit=1`, { method: "GET" });
      if (existing && existing[0]) {
        const e = existing[0];
        if (e.status === "active") return res.status(200).json({ status: "active", message: "You're already friends!" });
        return res.status(200).json({ status: "pending", message: "A request is already waiting for a grown-up to approve." });
      }
      await sb(`family_friends`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ parent_a: me, parent_b: other.id, approved_a: true, approved_b: false, status: "pending" }) });
      const myKids = await kidsOf(me);
      await sendEmail(other.email, "A family wants to be friends on Buildable",
        `<p>Hi! <b>${firstNames(myKids)}'s family</b> would like to connect with your family on Buildable so your kids can play games together.</p>
         <p>No one can play until you approve. Open Buildable, tap <b>Grown-ups</b> &rarr; <b>Friends</b> to approve or decline.</p>
         <p><a href="${APP_URL}">Open Buildable</a></p>`);
      return res.status(200).json({ status: "pending", message: "Sent! Their grown-up needs to approve before you can play." });
    }

    if (action === "pending") {
      // requests awaiting MY approval (I'm parent_b) + requests I sent still waiting
      const inbound = (await sb(`family_friends?parent_b=eq.${me}&status=eq.pending&select=id,parent_a,created_at`, { method: "GET" })) || [];
      const outbound = (await sb(`family_friends?parent_a=eq.${me}&status=eq.pending&select=id,parent_b,created_at`, { method: "GET" })) || [];
      const inb = [];
      for (const f of inbound) { const ks = await kidsOf(f.parent_a); inb.push({ id: f.id, label: firstNames(ks) + "'s family" }); }
      const outb = [];
      for (const f of outbound) { const ks = await kidsOf(f.parent_b); outb.push({ id: f.id, label: firstNames(ks) + "'s family" }); }
      return res.status(200).json({ toApprove: inb, waiting: outb });
    }

    if (action === "approve" || action === "decline") {
      const id = (b.id || "").toString();
      const rows = await sb(`family_friends?id=eq.${id}&limit=1`, { method: "GET" });
      const f = rows && rows[0];
      if (!f) return res.status(404).json({ error: "not found" });
      if (f.parent_b !== me) return res.status(403).json({ error: "not yours to approve" });
      if (action === "decline") { await sb(`family_friends?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) }); return res.status(200).json({ ok: true }); }
      await sb(`family_friends?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ approved_b: true, status: "active" }) });
      const reqParent = await parentRow(f.parent_a);
      const myKids = await kidsOf(me);
      await sendEmail(reqParent && reqParent.email, "You're connected on Buildable!",
        `<p><b>${firstNames(myKids)}'s family</b> approved your friend request. Your kids can now play games together on Buildable.</p><p><a href="${APP_URL}">Open Buildable</a></p>`);
      return res.status(200).json({ ok: true });
    }

    if (action === "unfriend") {
      const id = (b.id || "").toString();
      const rows = await sb(`family_friends?id=eq.${id}&limit=1`, { method: "GET" });
      const f = rows && rows[0];
      if (!f || (f.parent_a !== me && f.parent_b !== me)) return res.status(403).json({ error: "not yours" });
      await sb(`family_friends?id=eq.${id}`, { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }

    // ---------- THE REUSABLE FRIENDS LIST (siblings + friend-family kids) ----------
    if (action === "listFriends") {
      const meKid = (b.kidId || "").toString();
      const siblings = (await kidsOf(me)).filter((k) => k.id !== meKid);
      const friendParents = await friendParentIds(me);
      let friendKids = [];
      for (const p of friendParents) friendKids = friendKids.concat(await kidsOf(p));
      const map = (arr, group) => arr.map((k) => ({ kidId: k.id, name: k.name, avatar: k.avatar || null, online: isOnline(k.last_seen), group }));
      return res.status(200).json({ friends: [...map(siblings, "family"), ...map(friendKids, "friend")] });
    }

    // ---------- GAME INVITES ----------
    if (action === "invite") {
      const fromKid = (b.fromKid || "").toString();
      const toKid = (b.toKid || "").toString();
      const game = (b.game || "").toString().slice(0, 32);
      const transport = (b.transport || "turns").toString();
      const world = (b.world || null);
      if (!fromKid || !toKid || !game) return res.status(400).json({ error: "missing fields" });
      // fromKid must be mine
      const mineKids = await kidsOf(me);
      if (!mineKids.find((k) => k.id === fromKid)) return res.status(403).json({ error: "not your player" });
      // toKid must be my sibling OR a kid in an active friend family
      const okParents = [me, ...(await friendParentIds(me))];
      const toRows = await sb(`kid_profiles?id=eq.${toKid}&select=id,parent_id,last_seen,name&limit=1`, { method: "GET" });
      const toRow = toRows && toRows[0];
      if (!toRow || !okParents.includes(toRow.parent_id)) return res.status(403).json({ error: "not an approved friend" });
      // Turn-based games are ASYNC: create the shared match RIGHT NOW so the
      // inviter can start playing immediately, no matter whether the friend is
      // online. The invitee joins whenever they open the app (their turn waits
      // for them, exactly like the "your move in chess" nudge). Real-time games
      // (tennis) still create the match only when BOTH sides connect (on accept).
      let matchId = null;
      if (transport === "turns") {
        const created = await sb(`friend_matches`, { method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ game, transport, host_kid: fromKid, host_parent: me,
            guest_kid: toKid, guest_parent: toRow.parent_id, world, state: {}, turn: "host", status: "active" }) });
        matchId = created && created[0] && created[0].id;
      }
      const rows = await sb(`game_invites`, { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ game, transport, from_kid: fromKid, from_parent: me, to_kid: toKid, to_parent: toRow.parent_id, world, status: "pending", match_id: matchId }) });
      const inviteId = rows && rows[0] && rows[0].id;
      // offline friend? email their grown-up
      if (!isOnline(toRow.last_seen) && toRow.parent_id !== me) {
        const op = await parentRow(toRow.parent_id);
        const fromName = (mineKids.find((k) => k.id === fromKid) || {}).name || "A friend";
        await sendEmail(op && op.email, `${fromName} invited ${toRow.name} to play on Buildable`,
          `<p><b>${fromName}</b> invited <b>${toRow.name}</b> to play ${game} on Buildable.</p><p>Open the app and tap ${toRow.name}'s player to join.</p><p><a href="${APP_URL}">Open Buildable</a></p>`);
      }
      return res.status(200).json({ inviteId, matchId, transport, online: isOnline(toRow.last_seen) });
    }

    if (action === "cancelInvite") {
      const id = (b.inviteId || "").toString();
      const rows = await sb(`game_invites?id=eq.${id}&from_parent=eq.${me}&limit=1`, { method: "GET" });
      if (!rows || !rows[0]) return res.status(404).json({ error: "not found" });
      await sb(`game_invites?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "canceled" }) });
      return res.status(200).json({ ok: true });
    }

    if (action === "declineInvite") {
      const id = (b.inviteId || "").toString();
      const rows = await sb(`game_invites?id=eq.${id}&to_parent=eq.${me}&limit=1`, { method: "GET" });
      if (!rows || !rows[0]) return res.status(404).json({ error: "not found" });
      await sb(`game_invites?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) });
      return res.status(200).json({ ok: true });
    }

    if (action === "accept") {
      const id = (b.inviteId || "").toString();
      const rows = await sb(`game_invites?id=eq.${id}&to_parent=eq.${me}&status=eq.pending&select=id,game,transport,from_kid,from_parent,to_kid,to_parent,world,match_id&limit=1`, { method: "GET" });
      const iv = rows && rows[0];
      if (!iv) return res.status(404).json({ error: "invite not available" });
      // Turn-based invites already have a match (created at invite time) -- just
      // reuse it. Real-time invites create the shared match now, on accept, when
      // both sides are connecting. Host (inviter) seeds the board.
      let matchId = iv.match_id || null;
      if (!matchId) {
        const created = await sb(`friend_matches`, { method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ game: iv.game, transport: iv.transport, host_kid: iv.from_kid, host_parent: iv.from_parent,
            guest_kid: iv.to_kid, guest_parent: iv.to_parent, world: iv.world, state: {}, turn: "host", status: "active" }) });
        matchId = created && created[0] && created[0].id;
      }
      await sb(`game_invites?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "accepted", match_id: matchId }) });
      return res.status(200).json({ matchId });
    }

    return res.status(400).json({ error: "bad action" });
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || "error" });
  }
}
