// /src/FamilyTown.jsx
// "Play a family member" — online Family Town (original Monopoly-STYLE board game)
// for 3-4 kids in the same family, each on their own device. Turn-based "poll a row"
// (the chess model, extended to N seats). No chat: matchmaking + canned reactions
// only. The board lives in /family-town.html?online=1 (iframe); this component picks
// players, creates/joins a match, and syncs the whole game state through Supabase
// (poll every 2s). Requires the email/parent account lane.
//
// GN3 -- deciding vs doing (HUD-AND-NAV-RULES.md Rule 0). The matchmaking screen
// below is a DECIDING screen: the kid is picking who to play, so the five-tab
// bottom bar rides along with Play lit. The match view is a DOING screen -- it
// embeds the live board in an iframe -- so it shows no bar at all, and the
// corner Back stays the only way out. Nothing is held open on the matchmaking
// screen (a match row is only created the moment a sibling is picked), so there
// is no pending work for a tab tap to release.
import { useEffect, useRef, useState } from "react";
import BottomBar, { navBarClear } from "./BottomBar.jsx";
import { isSignedIn, listKidProfiles, getActiveKid } from "./lib/accounts";
import { createMatch, listMyMatches, getMatch, patchMatch, seatOf } from "./lib/townMatches";

const LENGTHS = [
  ["short", "Short", 2, "~10 min"],
  ["med", "Medium", 3, "~15 min"],
  ["long", "Long", 4, "~20 min"],
];

const C = {
  wrap: { position: "fixed", inset: 0, background: "#0F0E17", color: "#fff", fontFamily: "'Nunito',sans-serif", overflow: "auto", zIndex: 50 },
  // GN3: longhands -- the matchmaking screen overrides paddingBottom for the
  // bar clearance, and mixing a shorthand with a longhand is a React warning.
  pad: { maxWidth: 620, margin: "0 auto", paddingTop: 64, paddingRight: 20, paddingBottom: 40, paddingLeft: 20 },
  back: { position: "absolute", top: 14, left: 14, zIndex: 2, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  h1: { fontWeight: 900, fontSize: 28, margin: "0 0 4px" },
  sub: { color: "#cfc9e6", margin: "0 0 20px", fontSize: 15 },
  sect: { fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "22px 0 10px" },
  card: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  btn: { fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", border: "none", cursor: "pointer", borderRadius: 12, padding: "10px 16px", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)" },
  btnBig: { fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff", border: "none", cursor: "pointer", borderRadius: 14, padding: "14px 18px", width: "100%", marginTop: 18, background: "linear-gradient(135deg,#34D399,#10B981)" },
  pill: { fontWeight: 800, fontSize: 13, padding: "5px 11px", borderRadius: 999 },
  chip: (on) => ({ cursor: "pointer", fontWeight: 700, fontSize: 14, padding: "9px 15px", borderRadius: 999, border: on ? "2px solid #A78BFF" : "1px solid rgba(255,255,255,0.18)", background: on ? "rgba(124,92,252,0.18)" : "rgba(255,255,255,0.05)", color: "#fff" }),
  note: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 18, color: "#cfc9e6", lineHeight: 1.5 },
};
const SEAT_HEX = { purple: "#A78BFF", coral: "#FF7A9A", mint: "#2DD4A7", sky: "#38BDF8" };

export default function FamilyTown({ activeKid, onHome, nav }) {
  const [kids, setKids] = useState([]);
  const [matches, setMatches] = useState([]);
  const [picked, setPicked] = useState([]);     // sibling kid ids chosen to join (besides me)
  const [lenId, setLenId] = useState("med");
  const [match, setMatch] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const iframeRef = useRef(null);
  const pollRef = useRef(null);
  const matchRef = useRef(null);
  const readyRef = useRef(false);
  const lastKeyRef = useRef(null);
  const lastReactionAtRef = useRef(null);

  const signedIn = isSignedIn();
  const me = activeKid || getActiveKid();

  const keyOf = (m) => JSON.stringify([m && m.turn, (m && m.last_roll) || null, (m && m.status) || "active"]);
  const nameOf = (id) => { const k = kids.find((x) => x.id === id); return (k && k.display_name) || "Friend"; };
  const mySeat = (m) => seatOf(m, me && me.id);

  async function refresh() {
    try {
      const all = await listKidProfiles();
      setKids((all || []).filter((k) => !me || k.id !== me.id));
      if (me) setMatches(await listMyMatches(me.id));
      setErr("");
    } catch (e) { setErr((e && e.message) || "Could not load your family."); }
    setLoading(false);
  }
  useEffect(() => { if (signedIn && me) refresh(); else setLoading(false); /* eslint-disable-next-line */ }, []);

  function sendInit(m) {
    const ifr = iframeRef.current;
    if (!ifr || !ifr.contentWindow || !m) return;
    ifr.contentWindow.postMessage({ type: "townInit", mySeat: mySeat(m), state: m.board }, "*");
  }

  // messages coming back from the iframe (my own moves / reactions) -> write to Supabase
  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {};
      const m = matchRef.current;
      if (d.type === "townReady") { readyRef.current = true; if (m) sendInit(m); }
      else if (d.type === "townMove" && m) {
        const patch = { board: d.state, turn: d.state.turn, last_roll: d.lastRoll || null, status: d.over ? "done" : "active", winner: d.over ? (d.winner != null ? d.winner : null) : null };
        lastKeyRef.current = keyOf({ turn: patch.turn, last_roll: patch.last_roll, status: patch.status });
        patchMatch(m.id, patch).catch(() => {});
      }
      else if (d.type === "townReaction" && m) {
        const reaction = { text: String(d.text || "").slice(0, 40), seat: mySeat(m), at: new Date().toISOString() };
        lastReactionAtRef.current = reaction.at;
        patchMatch(m.id, { reaction }).catch(() => {});
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids]);

  // poll for the others' moves while a match is open
  useEffect(() => {
    matchRef.current = match;
    if (pollRef.current) clearInterval(pollRef.current);
    if (!match) return;
    lastKeyRef.current = keyOf(match);
    lastReactionAtRef.current = (match.reaction && match.reaction.at) || null;
    if (readyRef.current) sendInit(match);
    const seat = mySeat(match);
    pollRef.current = setInterval(async () => {
      try {
        const row = await getMatch(match.id);
        if (!row) return;
        const ifr = iframeRef.current;
        const k = keyOf(row);
        if (k !== lastKeyRef.current) {
          lastKeyRef.current = k;
          // apply the others' completed move when it's now my turn (or the game ended)
          if ((row.status === "done" || row.turn === seat) && ifr && ifr.contentWindow) {
            ifr.contentWindow.postMessage({ type: "townOpponentMove", state: row.board, lastRoll: row.last_roll }, "*");
          }
        }
        if (row.reaction && row.reaction.at !== lastReactionAtRef.current && row.reaction.seat !== seat) {
          lastReactionAtRef.current = row.reaction.at;
          if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: "townShowReaction", seat: row.reaction.seat, text: row.reaction.text }, "*");
        }
      } catch (e) { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  function togglePick(id) {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length >= 3 ? p : [...p, id]));
  }
  async function startNew() {
    try {
      readyRef.current = false;
      const laps = (LENGTHS.find((l) => l[0] === lenId) || [, , 3])[2];
      const seats = [{ kidId: me.id, name: me.display_name || "You" }];
      picked.forEach((id) => seats.push({ kidId: id, name: nameOf(id) }));
      const m = await createMatch(seats, laps);
      setMatch(m);
    } catch (e) { setErr((e && e.message) || "Could not start the game."); }
  }
  function openMatch(m) { readyRef.current = false; setMatch(m); }
  function leaveMatch() { setMatch(null); refresh(); }

  // ---- in a match: full-screen game iframe ----
  if (match) {
    return (
      <div style={C.wrap}>
        <button style={C.back} onClick={leaveMatch}>← Family games</button>
        <iframe
          ref={iframeRef}
          title="Family Town (online)"
          src="/family-town.html?online=1&v=1"
          onLoad={() => { if (readyRef.current && matchRef.current) sendInit(matchRef.current); }}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>
    );
  }


  // GN3: clear of the bottom bar (see the note at the top of this file).
  const padWithBar = { ...C.pad, paddingBottom: navBarClear(18) };
  // Play is lit: picking a sibling is still on the way into a game.
  const bar = nav ? <BottomBar current="play" {...nav} /> : null;

  // ---- matchmaking ----
  const canStart = picked.length >= 1;
  return (
    <div style={C.wrap}>
      <button style={C.back} onClick={onHome}>← Home</button>
      <div style={padWithBar}>
        <h1 style={C.h1}>Play Family Town together</h1>
        <p style={C.sub}>Pick 1 to 3 brothers or sisters — you each play on your own device.</p>

        {!signedIn && (
          <div style={C.note}>
            Family games need a grown-up account so everyone shares the same player. Ask a
            grown-up to tap <b>Grown-ups</b> on the home screen and sign in with email, then come back.
          </div>
        )}
        {signedIn && !me && (
          <div style={C.note}>First pick who you are: go back home, choose your player tile, then come back.</div>
        )}

        {signedIn && me && (
          <>
            {err && <div style={{ ...C.note, borderColor: "rgba(255,120,120,0.4)", color: "#ffd0d0", marginBottom: 12 }}>{err}</div>}

            <div style={C.sect}>Who's playing? (you're in already)</div>
            {loading ? (
              <p style={{ color: "#cfc9e6" }}>Loading your family…</p>
            ) : kids.length === 0 ? (
              <div style={C.note}>No brothers or sisters added yet. A grown-up can add more players in the Grown-ups area.</div>
            ) : (
              kids.map((k) => {
                const on = picked.includes(k.id);
                return (
                  <div key={k.id} style={{ ...C.card, border: on ? "2px solid #A78BFF" : C.card.border }}>
                    <span style={{ fontWeight: 800, fontSize: 17 }}>{k.display_name}</span>
                    <button style={{ ...C.btn, background: on ? "rgba(255,255,255,0.14)" : C.btn.background }} onClick={() => togglePick(k.id)}>
                      {on ? "Added ✓" : "Add"}
                    </button>
                  </div>
                );
              })
            )}

            <div style={C.sect}>Game length</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LENGTHS.map(([id, label, , hint]) => (
                <button key={id} style={C.chip(lenId === id)} onClick={() => setLenId(id)}>{label} <span style={{ opacity: 0.7, fontWeight: 600 }}>({hint})</span></button>
              ))}
            </div>

            <button style={{ ...C.btnBig, opacity: canStart ? 1 : 0.5, cursor: canStart ? "pointer" : "default" }} disabled={!canStart} onClick={startNew}>
              {canStart ? `Start the game (${picked.length + 1} players)` : "Add at least one player"}
            </button>

            <div style={C.sect}>Your games</div>
            {matches.length === 0 ? (
              <p style={{ color: "#cfc9e6" }}>No games going right now.</p>
            ) : (
              matches.map((m) => {
                const seat = mySeat(m);
                const myTurn = (m.turn || 0) === seat && m.status === "active";
                const others = (m.players || []).filter((p) => p.seat !== seat).map((p) => p.name).join(", ");
                return (
                  <div key={m.id} style={C.card}>
                    <span style={{ fontWeight: 800 }}>with {others}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...C.pill, background: myTurn ? "#7CF6B0" : "rgba(255,255,255,0.14)", color: myTurn ? "#1a1330" : "#cfc9e6" }}>{m.status === "done" ? "Finished" : myTurn ? "Your turn" : "Waiting"}</span>
                      <button style={C.btn} onClick={() => openMatch(m)}>Open</button>
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
      {bar}
    </div>
  );
}
