// /src/FamilyChess.jsx
// "Play a family member" — online chess between two kids in the same family.
// No chat: matchmaking + move sync only. The board itself lives in the existing
// /buildable-chess.html game (loaded in an iframe with ?online=1); this component
// handles picking a sibling, creating/joining a match, and syncing moves through
// Supabase (poll every 2s). Requires the email/parent account lane.
import { useEffect, useRef, useState } from "react";
import { isSignedIn, listKidProfiles, getActiveKid } from "./lib/accounts";
import { createMatch, listMyMatches, getMatch, patchMatch } from "./lib/chessMatches";

const WORLDS = [
  ["jungle", "Jungle"], ["ocean", "Ocean"], ["space", "Space"],
  ["candy", "Candy"], ["castle", "Castle"], ["desert", "Desert"],
];

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
  back: { position: "absolute", top: 14, left: 14, zIndex: 2, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  h1: { fontWeight: 900, fontSize: 28, margin: "0 0 4px" },
  sub: { color: "#cfc9e6", margin: "0 0 20px", fontSize: 15 },
  sect: { fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "22px 0 10px" },
  card: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  btn: { fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", border: "none", cursor: "pointer", borderRadius: 12, padding: "10px 16px", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)" },
  pill: { fontWeight: 800, fontSize: 13, padding: "5px 11px", borderRadius: 999 },
  worldRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: (on) => ({ cursor: "pointer", fontWeight: 700, fontSize: 14, padding: "8px 14px", borderRadius: 999, border: on ? "2px solid #A78BFF" : "1px solid rgba(255,255,255,0.18)", background: on ? "rgba(124,92,252,0.18)" : "rgba(255,255,255,0.05)", color: "#fff" }),
  note: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 18, color: "#cfc9e6", lineHeight: 1.5 },
};

export default function FamilyChess({ activeKid, onHome }) {
  const [kids, setKids] = useState([]);
  const [matches, setMatches] = useState([]);
  const [world, setWorld] = useState("jungle");
  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const iframeRef = useRef(null);
  const pollRef = useRef(null);
  const lastMoveKeyRef = useRef(null);
  const lastReactionAtRef = useRef(null);
  const readyRef = useRef(false);
  const matchRef = useRef(null);

  const moveKeyOf = (m) => JSON.stringify([m && m.turn, (m && m.last_move) || null, (m && m.status) || "active"]);

  const signedIn = isSignedIn();
  const me = activeKid || getActiveKid();

  function nameOf(id) { const k = kids.find((x) => x.id === id); return (k && k.display_name) || "Friend"; }
  function myColor(m) { return m.white_kid === (me && me.id) ? "w" : "b"; }

  async function refresh() {
    try {
      const all = await listKidProfiles();
      setKids((all || []).filter((k) => !me || k.id !== me.id));
      if (me) setMatches(await listMyMatches(me.id));
      setErr("");
    } catch (e) { setErr((e && e.message) || "Could not load your family."); }
    setLoading(false);
  }

  useEffect(() => {
    if (signedIn && me) refresh(); else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendInit(m) {
    const ifr = iframeRef.current;
    if (!ifr || !ifr.contentWindow || !m) return;
    const oppId = myColor(m) === "w" ? m.black_kid : m.white_kid;
    ifr.contentWindow.postMessage({
      type: "chessInit",
      myColor: myColor(m),
      world: m.world,
      state: m.board || initialBoard(),
      lastMove: m.last_move || null,
      oppName: nameOf(oppId),
      myName: (me && me.display_name) || "You",
    }, "*");
  }

  // moves coming back from the iframe (my own moves) -> write to Supabase
  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {};
      const m = matchRef.current;
      if (d.type === "chessReady") { readyRef.current = true; if (m) sendInit(m); }
      else if (d.type === "chessMove" && m) {
        const p = d.payload; if (!p) return;
        const patch = { board: p.state, turn: p.turn, last_move: p.lastMove, status: p.over ? "done" : "active", winner: p.over ? (p.winner || null) : null };
        lastMoveKeyRef.current = moveKeyOf(patch); // don't echo my own move back to me
        patchMatch(m.id, patch).catch(() => {});
      }
      else if (d.type === "chessReaction" && m) {
        const reaction = { text: String(d.text || "").slice(0, 40), by: me && me.id, at: new Date().toISOString() };
        lastReactionAtRef.current = reaction.at; // don't show my own reaction back to me
        patchMatch(m.id, { reaction }).catch(() => {});
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids]);

  // poll for the opponent's move while a match is open
  useEffect(() => {
    matchRef.current = match;
    if (pollRef.current) clearInterval(pollRef.current);
    if (!match) return;
    lastMoveKeyRef.current = moveKeyOf(match);
    lastReactionAtRef.current = (match.reaction && match.reaction.at) || null;
    if (readyRef.current) sendInit(match);
    const mine = myColor(match);
    pollRef.current = setInterval(async () => {
      try {
        const row = await getMatch(match.id);
        if (!row) return;
        const ifr = iframeRef.current;
        // a real move happened (board/turn/status changed) — not just a reaction
        const mk = moveKeyOf(row);
        if (mk !== lastMoveKeyRef.current) {
          lastMoveKeyRef.current = mk;
          if ((row.status === "done" || row.turn === mine) && ifr && ifr.contentWindow) {
            ifr.contentWindow.postMessage({ type: "chessOpponentMove", payload: { state: row.board, lastMove: row.last_move } }, "*");
          }
        }
        // opponent sent a reaction
        if (row.reaction && row.reaction.at !== lastReactionAtRef.current && row.reaction.by !== (me && me.id)) {
          lastReactionAtRef.current = row.reaction.at;
          if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: "chessShowReaction", text: row.reaction.text }, "*");
        }
      } catch (e) { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  async function startNew(opp) {
    try { readyRef.current = false; const m = await createMatch(me.id, opp.id, world, initialBoard()); setMatch(m); }
    catch (e) { setErr((e && e.message) || "Could not start the game."); }
  }
  function openMatch(m) { readyRef.current = false; setMatch(m); }
  function leaveMatch() { setMatch(null); refresh(); }

  // ---- in a match: full-screen game iframe ----
  if (match) {
    const oppId = myColor(match) === "w" ? match.black_kid : match.white_kid;
    return (
      <div style={C.wrap}>
        <button style={C.back} onClick={leaveMatch}>← Family games</button>
        <div style={{ position: "absolute", top: 14, right: 14, zIndex: 2, fontWeight: 800, fontSize: 14, background: "rgba(255,255,255,0.1)", borderRadius: 999, padding: "8px 14px" }}>
          vs {nameOf(oppId)}
        </div>
        <iframe
          ref={iframeRef}
          title="Buildable Chess (online)"
          src="/buildable-chess.html?online=1&v=2"
          onLoad={() => { if (readyRef.current && matchRef.current) sendInit(matchRef.current); }}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>
    );
  }

  // ---- matchmaking ----
  return (
    <div style={C.wrap}>
      <button style={C.back} onClick={onHome}>← Home</button>
      <div style={C.pad}>
        <h1 style={C.h1}>Play a family member</h1>
        <p style={C.sub}>Challenge a brother or sister — you each play on your own device.</p>

        {!signedIn && (
          <div style={C.note}>
            Family games need a grown-up account so you and your sibling share the same player.
            Ask a grown-up to tap <b>Grown-ups</b> on the home screen and sign in with email, then
            come back here.
          </div>
        )}

        {signedIn && !me && (
          <div style={C.note}>First pick who you are: go back home and choose your player tile, then come back.</div>
        )}

        {signedIn && me && (
          <>
            {err && <div style={{ ...C.note, borderColor: "rgba(255,120,120,0.4)", color: "#ffd0d0", marginBottom: 12 }}>{err}</div>}

            <div style={C.sect}>Pick a world</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
              {WORLDS.map(([k, label]) => (
                <button key={k} onClick={() => setWorld(k)} style={{
                  width: 104, height: 74, borderRadius: 14, cursor: "pointer", color: "#fff", fontWeight: 800, fontSize: 13,
                  border: world === k ? "3px solid #A78BFF" : "1px solid rgba(255,255,255,0.18)",
                  backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0.05)), url('/chess-art/${k}_thumb.jpg?v=2')`,
                  backgroundSize: "cover", backgroundPosition: "center",
                  display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6,
                  textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                }}>{label}</button>
              ))}
            </div>

            <div style={C.sect}>Start a new game with…</div>
            {loading ? (
              <p style={{ color: "#cfc9e6" }}>Loading your family…</p>
            ) : kids.length === 0 ? (
              <div style={C.note}>No brothers or sisters added yet. A grown-up can add more players in the Grown-ups area.</div>
            ) : (
              kids.map((k) => (
                <div key={k.id} style={C.card}>
                  <span style={{ fontWeight: 800, fontSize: 17 }}>{k.display_name}</span>
                  <button style={C.btn} onClick={() => startNew(k)}>Play</button>
                </div>
              ))
            )}

            <div style={C.sect}>Your games</div>
            {matches.length === 0 ? (
              <p style={{ color: "#cfc9e6" }}>No games going right now.</p>
            ) : (
              matches.map((m) => {
                const oppId = m.white_kid === me.id ? m.black_kid : m.white_kid;
                const myTurn = (m.turn || "w") === myColor(m);
                return (
                  <div key={m.id} style={C.card}>
                    <span style={{ fontWeight: 800 }}>vs {nameOf(oppId)} <span style={{ color: "#cfc9e6", fontWeight: 600, fontSize: 13 }}>· {WORLDS.find((w) => w[0] === m.world)?.[1] || m.world}</span></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...C.pill, background: myTurn ? "#7CF6B0" : "rgba(255,255,255,0.14)", color: myTurn ? "#1a1330" : "#cfc9e6" }}>{myTurn ? "Your move" : "Their move"}</span>
                      <button style={C.btn} onClick={() => openMatch(m)}>Open</button>
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
