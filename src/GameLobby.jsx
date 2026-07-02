// /src/GameLobby.jsx
// ==================================================================
// THE ONE reusable multiplayer lobby, shared by every game.
// A game supplies only its board (an iframe URL) + transport; this
// component provides the whole "how do two kids connect" experience:
//
//   1) MODE SELECT   -> "Same device" (fast local pass-and-play) or
//                       "Play with a friend" (cross-account).
//   2) FRIENDS       -> ONE shared friends list (siblings + approved
//                       friend-family kids), online first, offline
//                       grayed but still tappable. "Add a friend" at the
//                       bottom. Plus any incoming invites to join.
//   3) WAITING       -> "Waiting for <name>..." with Cancel; auto-starts
//                       for both when they accept.
//   4) PLAYING       -> embeds the game board + bridges moves.
//
// New games inherit ALL of this by rendering <GameLobby game={...}/>.
// The friends/invite/online system behind it lives in src/lib/friends.js
// + api/friends.js (shared, not per-game). No free-text chat -- ever.
// ==================================================================
import { useEffect, useRef, useState } from "react";
import { isSignedIn, getActiveKid } from "./lib/accounts";
import {
  listFriends, sendInvite, cancelInvite, pollInvite, acceptInvite,
  inboxInvites, startPresence, stopPresence,
} from "./lib/friends";
import { getFriendMatch, patchFriendMatch, roleFor, oppKidOf } from "./lib/friendMatches";

// ---- chess board helpers (only used for transport === 'turns' chess) ----
function initialBoard() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    b[0][c] = { t: back[c], c: "b" }; b[1][c] = { t: "p", c: "b" };
    b[6][c] = { t: "p", c: "w" }; b[7][c] = { t: back[c], c: "w" };
  }
  return { board: b, turn: "w", castle: { wK: true, wQ: true, bK: true, bQ: true }, ep: null };
}

const C = {
  wrap: { position: "fixed", inset: 0, background: "#0F0E17", color: "#fff", fontFamily: "'Nunito',sans-serif", overflow: "auto", zIndex: 50 },
  pad: { maxWidth: 620, margin: "0 auto", padding: "64px 20px 40px" },
  back: { position: "absolute", top: 14, left: 14, zIndex: 6, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  h1: { fontWeight: 900, fontSize: 28, margin: "0 0 4px" },
  sub: { color: "#cfc9e6", margin: "0 0 22px", fontSize: 15 },
  sect: { fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "22px 0 10px" },
  bigBtn: { width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 16, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20, padding: "20px 22px", marginBottom: 14, cursor: "pointer", color: "#fff" },
  bigTitle: { fontWeight: 900, fontSize: 20, margin: 0 },
  bigSub: { color: "#cfc9e6", fontSize: 14, margin: "2px 0 0" },
  dot: (on) => ({ width: 11, height: 11, borderRadius: 999, background: on ? "#7CF6B0" : "rgba(255,255,255,0.28)", boxShadow: on ? "0 0 8px #7CF6B0" : "none", flex: "0 0 auto" }),
  card: (dim) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px", marginBottom: 10, opacity: dim ? 0.55 : 1 }),
  invite: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(124,92,252,0.16)", border: "1px solid rgba(167,139,255,0.5)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  btn: { fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", border: "none", cursor: "pointer", borderRadius: 12, padding: "10px 16px", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)" },
  ghost: { fontWeight: 800, fontSize: 15, color: "#fff", background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.3)", borderRadius: 14, padding: "14px 16px", width: "100%", cursor: "pointer", marginTop: 6 },
  note: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 18, color: "#cfc9e6", lineHeight: 1.5 },
  center: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 },
  ava: { width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flex: "0 0 auto" },
};

const avatarText = (name) => (name || "?").trim().charAt(0).toUpperCase();

export default function GameLobby({ game, activeKid, onHome, onSameDevice, onAddFriend }) {
  const me = activeKid || getActiveKid();
  const signedIn = isSignedIn();
  const transport = (game && game.transport) || "turns";

  const [phase, setPhase] = useState("mode"); // mode | friends | waiting | playing
  const [friends, setFriends] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [outInvite, setOutInvite] = useState(null); // { id, toName }
  const [match, setMatch] = useState(null);

  // ---- presence: mark me online while this lobby is open ----
  useEffect(() => {
    if (signedIn && me) startPresence(me);
    return () => stopPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- friends screen: load list + poll inbox for incoming invites ----
  async function loadFriends() {
    setLoading(true); setErr("");
    try {
      const [fr, inv] = await Promise.all([listFriends(me.id), inboxInvites()]);
      const rank = (x) => (x.online ? 0 : 1);
      setFriends((fr || []).slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)));
      setInbox((inv || []).filter((i) => i.game === game.slug));
    } catch (e) { setErr((e && e.message) || "Could not load your friends."); }
    setLoading(false);
  }
  useEffect(() => {
    if (phase !== "friends") return;
    loadFriends();
    const t = setInterval(loadFriends, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- outgoing invite: waiting screen polls until accepted ----
  useEffect(() => {
    if (phase !== "waiting" || !outInvite) return;
    const t = setInterval(async () => {
      try {
        const r = await pollInvite(outInvite.id);
        if (r.status === "accepted" && r.matchId) { clearInterval(t); enterMatch(await getFriendMatch(r.matchId)); }
        else if (r.status === "declined" || r.status === "canceled") { clearInterval(t); setErr(`${outInvite.toName} can't play right now.`); setPhase("friends"); setOutInvite(null); }
      } catch (e) { /* keep waiting */ }
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, outInvite]);

  async function invite(friend) {
    setErr("");
    try {
      const { inviteId } = await sendInvite({ fromKid: me.id, toKid: friend.kidId, game: game.slug, transport, world: game.world || null });
      setOutInvite({ id: inviteId, toName: friend.name, online: friend.online });
      setPhase("waiting");
    } catch (e) { setErr((e && e.message) || "Could not send the invite."); }
  }
  async function cancelWaiting() {
    if (outInvite) { try { await cancelInvite(outInvite.id); } catch (e) {} }
    setOutInvite(null); setPhase("friends");
  }
  async function joinInvite(iv) {
    setErr("");
    try { const matchId = await acceptInvite(iv.id); enterMatch(await getFriendMatch(matchId)); }
    catch (e) { setErr((e && e.message) || "Could not join."); }
  }

  // ================= PLAYING: board iframe + turn-based bridge =================
  const iframeRef = useRef(null);
  const matchRef = useRef(null);
  const pollRef = useRef(null);
  const readyRef = useRef(false);
  const lastMoveKeyRef = useRef(null);
  const lastReactionAtRef = useRef(null);

  const myColor = (m) => (roleFor(m, me.id) === "host" ? "w" : "b");
  const moveKeyOf = (m) => JSON.stringify([m && m.turn, (m && m.last_move) || null, (m && m.status) || "active"]);

  function enterMatch(m) {
    readyRef.current = false;
    matchRef.current = m; setMatch(m); setOutInvite(null);
    setPhase("playing");
  }

  function sendInitToBoard(m) {
    const ifr = iframeRef.current;
    if (!ifr || !ifr.contentWindow || !m) return;
    const board = (m.state && m.state.board) ? m.state : initialBoard();
    ifr.contentWindow.postMessage({
      type: "chessInit",
      myColor: myColor(m),
      world: m.world || "jungle",
      state: board,
      lastMove: m.last_move || null,
      oppName: "Friend",
      myName: (me && me.display_name) || "You",
    }, "*");
  }

  // messages FROM the board (my own moves / reactions) -> write to the shared row
  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {}; const m = matchRef.current;
      if (d.type === "chessReady") {
        readyRef.current = true;
        // Host seeds the opening position the first time (guest waits for it).
        if (m && roleFor(m, me.id) === "host" && !(m.state && m.state.board)) {
          patchFriendMatch(m.id, { state: initialBoard(), turn: "w", status: "active" })
            .then((row) => { if (row) { matchRef.current = row; setMatch(row); lastMoveKeyRef.current = moveKeyOf(row); sendInitToBoard(row); } })
            .catch(() => {});
        } else if (m) sendInitToBoard(m);
      } else if (d.type === "chessMove" && m) {
        const p = d.payload; if (!p) return;
        const patch = { state: p.state, turn: p.turn, last_move: p.lastMove, status: p.over ? "done" : "active", winner: p.over ? (p.winner || null) : null };
        lastMoveKeyRef.current = moveKeyOf(patch);
        patchFriendMatch(m.id, patch).catch(() => {});
      } else if (d.type === "chessReaction" && m) {
        const reaction = { text: String(d.text || "").slice(0, 40), by: me && me.id, at: new Date().toISOString() };
        lastReactionAtRef.current = reaction.at;
        patchFriendMatch(m.id, { reaction }).catch(() => {});
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // poll the shared row for the opponent's move while playing
  useEffect(() => {
    if (phase !== "playing" || !match) return;
    matchRef.current = match;
    lastMoveKeyRef.current = moveKeyOf(match);
    lastReactionAtRef.current = (match.reaction && match.reaction.at) || null;
    const mine = myColor(match);
    pollRef.current = setInterval(async () => {
      try {
        const row = await getFriendMatch(match.id);
        if (!row) return;
        matchRef.current = row;
        const ifr = iframeRef.current;
        const mk = moveKeyOf(row);
        if (mk !== lastMoveKeyRef.current) {
          lastMoveKeyRef.current = mk;
          if ((row.status === "done" || row.turn === mine) && ifr && ifr.contentWindow && row.state && row.state.board) {
            ifr.contentWindow.postMessage({ type: "chessOpponentMove", payload: { state: row.state, lastMove: row.last_move } }, "*");
          }
        }
        if (row.reaction && row.reaction.at !== lastReactionAtRef.current && row.reaction.by !== (me && me.id)) {
          lastReactionAtRef.current = row.reaction.at;
          if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: "chessShowReaction", text: row.reaction.text }, "*");
        }
      } catch (e) { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, match]);

  function leaveGame() {
    if (pollRef.current) clearInterval(pollRef.current);
    matchRef.current = null; setMatch(null); setPhase("friends");
  }

  // ============================ RENDER ============================
  if (phase === "playing" && match) {
    return (
      <div style={C.wrap}>
        <button style={C.back} onClick={leaveGame}>&larr; Friends</button>
        <iframe
          ref={iframeRef}
          title={`${game.title} (online)`}
          src={game.url}
          onLoad={() => { if (readyRef.current && matchRef.current) sendInitToBoard(matchRef.current); }}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div style={C.wrap}>
        <div style={C.center}>
          <div style={{ width: 66, height: 66, borderRadius: 999, border: "4px solid rgba(167,139,255,0.35)", borderTopColor: "#A78BFF", animation: "bkspin 1s linear infinite" }} />
          <style>{"@keyframes bkspin{to{transform:rotate(360deg)}}"}</style>
          <h1 style={{ ...C.h1, marginTop: 22 }}>Waiting for {outInvite && outInvite.toName}&hellip;</h1>
          <p style={C.sub}>
            {outInvite && outInvite.online
              ? "We're letting them know. The game starts the moment they say yes."
              : `${outInvite && outInvite.toName} is offline right now. We sent their grown-up an email — you can keep waiting or try again later.`}
          </p>
          <button style={{ ...C.btn, background: "rgba(255,255,255,0.12)" }} onClick={cancelWaiting}>Cancel</button>
        </div>
      </div>
    );
  }

  if (phase === "friends") {
    const family = friends.filter((f) => f.group === "family");
    const pals = friends.filter((f) => f.group === "friend");
    const personRow = (f) => (
      <div key={f.kidId} style={C.card(!f.online)}>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={C.dot(f.online)} />
          <span style={C.ava}>{avatarText(f.name)}</span>
          <span>
            <span style={{ fontWeight: 800, fontSize: 17 }}>{f.name}</span>
            <span style={{ display: "block", color: "#cfc9e6", fontSize: 13 }}>{f.online ? "Online now" : "Offline \u2014 we'll notify them"}</span>
          </span>
        </span>
        <button style={C.btn} onClick={() => invite(f)}>Invite</button>
      </div>
    );
    return (
      <div style={C.wrap}>
        <button style={C.back} onClick={() => setPhase("mode")}>&larr; Back</button>
        <div style={C.pad}>
          <h1 style={C.h1}>Family &amp; friends</h1>
          <p style={C.sub}>Pick who to play with. Family is always here &mdash; green dot means they're online right now.</p>

          {!signedIn && (
            <div style={C.note}>Playing with friends needs a grown-up account so friends stay safe and approved. Ask a grown-up to tap <b>Grown-ups</b> on the home screen and sign in.</div>
          )}

          {signedIn && (
            <>
              {err && <div style={{ ...C.note, borderColor: "rgba(255,120,120,0.4)", color: "#ffd0d0", marginBottom: 12 }}>{err}</div>}

              {inbox.length > 0 && (
                <>
                  <div style={C.sect}>Someone wants to play!</div>
                  {inbox.map((iv) => (
                    <div key={iv.id} style={C.invite}>
                      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={C.ava}>{avatarText(iv.fromName)}</span>
                        <b>{iv.fromName}</b> invited you
                      </span>
                      <button style={C.btn} onClick={() => joinInvite(iv)}>Join</button>
                    </div>
                  ))}
                </>
              )}

              {loading && friends.length === 0 && <p style={{ color: "#cfc9e6" }}>Loading&hellip;</p>}

              <div style={C.sect}>Your family</div>
              {family.length === 0 ? (
                <div style={C.note}>Add brothers &amp; sisters in <b>Grown-ups &rarr; Parents</b>. They show up here automatically &mdash; no code, no approval, just tap Invite.</div>
              ) : family.map((f) => personRow(f))}

              <div style={C.sect}>Friends</div>
              {pals.length === 0 ? (
                <p style={{ color: "#cfc9e6", fontSize: 14 }}>No friends added yet. Tap <b>Add a friend</b> below &mdash; a grown-up sets it up once.</p>
              ) : pals.map((f) => personRow(f))}

              <button style={C.ghost} onClick={() => (onAddFriend ? onAddFriend() : null)}>+ Add a friend to your account</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- default: MODE SELECT ----
  return (
    <div style={C.wrap}>
      <button style={C.back} onClick={onHome}>&larr; Home</button>
      <div style={C.pad}>
        <h1 style={C.h1}>{game.title}</h1>
        <p style={C.sub}>How do you want to play with 2 players?</p>

        <button style={C.bigBtn} onClick={() => (onSameDevice ? onSameDevice() : null)}>
          <span style={{ ...C.ava, width: 46, height: 46, fontSize: 22 }}>&#9635;</span>
          <span>
            <p style={C.bigTitle}>Same device</p>
            <p style={C.bigSub}>Take turns on this one screen. Quick and easy.</p>
          </span>
        </button>

        <button style={C.bigBtn} onClick={() => setPhase("friends")}>
          <span style={{ ...C.ava, width: 46, height: 46, fontSize: 22 }}>&#9734;</span>
          <span>
            <p style={C.bigTitle}>Family &amp; friends</p>
            <p style={C.bigSub}>Invite a brother, sister, or approved friend on their own device.</p>
          </span>
        </button>
      </div>
    </div>
  );
}
