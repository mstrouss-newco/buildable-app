// /src/FamilyRealtime.jsx
// Generic "play a family member" shell for REAL-TIME two-player games (tennis, pong, ...).
// Game-agnostic: it handles the lobby (pick a sibling), opens the Supabase Realtime
// Broadcast channel, assigns roles (host owns the ball), embeds the game in an iframe,
// and bridges the frozen `mp:` postMessage contract <-> the live channel. The GAME does
// all the gameplay and never touches the network. See MULTIPLAYER.md for the contract.
//
//   <FamilyRealtime game={{ slug:"tennis", url:"/tennis.html", title:"Buildable Tennis" }}
//     activeKid={activeKid} onHome={() => ...} autoJoinId={optionalMatchId} />
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
import { isSignedIn, listKidProfiles, getActiveKid, getSession } from "./lib/accounts";
import { createMatch, listMyMatches, getMatch, patchMatch, channelTopic, roleFor } from "./lib/rtMatch";
import { openChannel } from "./lib/realtimeChannel";

// The ONLY messages two kids can send each other (no free-text chat — child safety).
const REACTIONS = ["Nice shot!", "Too slow!", "So close!", "Let's go!", "Is that all?", "You got this!", "Boop!", "Wibble wobble!", "Bonk!", "Wheee!", "Great game!", "Haha!"];
const ALLOWED = new Set(REACTIONS);

const WORLDS = [
  ["beach", "Sunny Beach"], ["space", "Space Station"], ["jungle", "Jungle"],
  ["ocean", "Underwater"], ["candy", "Candy Land"], ["snow", "Snowy Peak"],
  ["volcano", "Volcano"], ["city", "Rooftop"],
];
const CONNECT_TIMEOUT_MS = 20000;

const C = {
  wrap: { position: "fixed", inset: 0, background: "#0F0E17", color: "#fff", fontFamily: "'Nunito',sans-serif", overflow: "auto", zIndex: 50 },
  // GN3: longhands -- the matchmaking screen overrides paddingBottom for the
  // bar clearance, and mixing a shorthand with a longhand is a React warning.
  pad: { maxWidth: 620, margin: "0 auto", paddingTop: 64, paddingRight: 20, paddingBottom: 40, paddingLeft: 20 },
  back: { position: "absolute", top: 14, left: 14, zIndex: 6, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  h1: { fontWeight: 900, fontSize: 28, margin: "0 0 4px" },
  sub: { color: "#cfc9e6", margin: "0 0 20px", fontSize: 15 },
  sect: { fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "22px 0 10px" },
  card: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  invite: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(124,92,252,0.15)", border: "1px solid rgba(167,139,255,0.5)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  btn: { fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15, color: "#fff", border: "none", cursor: "pointer", borderRadius: 12, padding: "10px 16px", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)" },
  chip: (on) => ({ cursor: "pointer", fontWeight: 700, fontSize: 14, padding: "8px 14px", borderRadius: 999, border: on ? "2px solid #A78BFF" : "1px solid rgba(255,255,255,0.18)", background: on ? "rgba(124,92,252,0.18)" : "rgba(255,255,255,0.05)", color: "#fff", marginRight: 8, marginBottom: 8 }),
  note: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 18, color: "#cfc9e6", lineHeight: 1.5 },
  overlay: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,14,23,0.92)", color: "#fff", zIndex: 5, textAlign: "center", padding: 24 },
};

export default function FamilyRealtime({ game, activeKid, onHome, autoJoinId, nav }) {
  const [kids, setKids] = useState([]);
  const [matches, setMatches] = useState([]);
  const [world, setWorld] = useState("beach");
  const [match, setMatch] = useState(null);
  const [phase, setPhase] = useState("connecting"); // connecting | playing
  const [timedOut, setTimedOut] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const iframeRef = useRef(null);
  const chanRef = useRef(null);
  const matchRef = useRef(null);
  const meReadyRef = useRef(false);
  const oppReadyRef = useRef(false);
  const startedRef = useRef(false);
  const oppSeenAtRef = useRef(0);
  const helloTimer = useRef(null);
  const watchTimer = useRef(null);
  const connectTimer = useRef(null);

  const signedIn = isSignedIn();
  const me = activeKid || getActiveKid();
  const nameOf = (id) => { const k = kids.find((x) => x.id === id); return (k && k.display_name) || "Friend"; };
  const oppIdOf = (m) => (m && (m.host_kid === me.id ? m.guest_kid : m.host_kid));
  const post = (msg) => { const ifr = iframeRef.current; if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage(msg, "*"); };

  async function refresh() {
    try {
      const all = await listKidProfiles();
      setKids((all || []).filter((k) => !me || k.id !== me.id));
      if (me) setMatches(await listMyMatches(game.slug, me.id));
      setErr("");
    } catch (e) { setErr((e && e.message) || "Could not load your family."); }
    setLoading(false);
  }

  useEffect(() => {
    if (signedIn && me) {
      refresh().then(() => { if (autoJoinId) tryAutoJoin(autoJoinId); });
    } else setLoading(false);
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryAutoJoin(id) {
    try { const m = await getMatch(id); if (m) enterMatch(m); } catch (e) {}
  }

  // ---- lobby actions ----
  async function startWith(sib) {
    // CONVERGENCE: if an open match with this sibling already exists (either of us
    // started it), JOIN that one instead of making a second match that never connects.
    const existing = matches.find((m) =>
      m.status !== "done" && (m.host_kid === sib.id || m.guest_kid === sib.id));
    if (existing) { enterMatch(existing); return; }
    try { const m = await createMatch(game.slug, me.id, sib.id, world, {}); enterMatch(m); }
    catch (e) { setErr((e && e.message) || "Could not start the game."); }
  }
  function resume(m) { enterMatch(m); }
  function leaveMatch() {
    teardown();
    matchRef.current = null; setMatch(null);
    setPhase("connecting"); setTimedOut(false);
    refresh();
  }

  function maybeStart() {
    if (startedRef.current || !meReadyRef.current || !oppReadyRef.current) return;
    startedRef.current = true;
    if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null; }
    setTimedOut(false);
    setPhase("playing");
    post({ type: "mp:start" });
    const m = matchRef.current;
    if (m && roleFor(m, me.id) === "host") patchMatch(m.id, { status: "playing" }).catch(() => {});
  }

  function sendInit() {
    const m = matchRef.current; if (!m) return;
    post({
      type: "mp:init",
      role: roleFor(m, me.id),
      you: { kidId: me.id, name: (me && me.display_name) || "You" },
      opp: { kidId: oppIdOf(m), name: nameOf(oppIdOf(m)) },
      world: m.world, settings: m.settings || {},
    });
  }

  function enterMatch(m) {
    teardown();
    matchRef.current = m; setMatch(m);
    meReadyRef.current = false; oppReadyRef.current = false; startedRef.current = false;
    setPhase("connecting"); setTimedOut(false);

    const s = getSession();
    const ch = openChannel(channelTopic(m), {
      accessToken: s && s.access_token,
      onStatus: (st) => { if (st === "reconnecting") setPhase((p) => (p === "playing" ? p : "connecting")); },
      onMessage: (event, data) => {
        if (event === "hello") {
          oppSeenAtRef.current = Date.now();
          oppReadyRef.current = !!(data && data.ready);
          maybeStart();
        } else if (event === "g") {
          post({ type: "mp:peer", event: data && data.event, data: data && data.data });
        } else if (event === "react") {
          const t = data && data.text;
          if (ALLOWED.has(t)) post({ type: "mp:reaction", text: t });
        }
      },
    });
    chanRef.current = ch;

    helloTimer.current = setInterval(() => ch.send("hello", { ready: meReadyRef.current }), 2500);
    ch.send("hello", { ready: false });

    // show a "still trying / make sure they have it open" message if not connected in time
    connectTimer.current = setTimeout(() => { if (!startedRef.current) setTimedOut(true); }, CONNECT_TIMEOUT_MS);

    watchTimer.current = setInterval(() => {
      if (startedRef.current && oppSeenAtRef.current && Date.now() - oppSeenAtRef.current > 6000) {
        post({ type: "mp:peerLeft" });
      }
    }, 2000);
  }

  function teardown() {
    if (helloTimer.current) { clearInterval(helloTimer.current); helloTimer.current = null; }
    if (watchTimer.current) { clearInterval(watchTimer.current); watchTimer.current = null; }
    if (connectTimer.current) { clearTimeout(connectTimer.current); connectTimer.current = null; }
    if (chanRef.current) { try { chanRef.current.close(); } catch (e) {} chanRef.current = null; }
  }

  // ---- bridge: messages FROM the game iframe ----
  useEffect(() => {
    function onMsg(e) {
      const d = e.data || {}; const ch = chanRef.current; const m = matchRef.current;
      if (!d.type || !String(d.type).startsWith("mp:")) return;
      if (d.type === "mp:ready") { meReadyRef.current = true; sendInit(); if (ch) ch.send("hello", { ready: true }); maybeStart(); }
      else if (d.type === "mp:send" && ch) { ch.send("g", { event: d.event, data: d.data }); }
      else if (d.type === "mp:reaction" && ch) {
        const t = String(d.text || "");
        if (ALLOWED.has(t)) { ch.send("react", { text: t }); if (m) patchMatch(m.id, { reaction: { text: t, by: me && me.id, at: new Date().toISOString() } }).catch(() => {}); }
      }
      else if (d.type === "mp:result" && m) {
        patchMatch(m.id, { status: "done", winner: d.winner || null, score: d.score || null }).catch(() => {});
        if (ch) ch.send("g", { event: "result", data: { winner: d.winner, score: d.score } });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids]);

  // GN3: clear of the bottom bar (see the note at the top of this file).
  const padWithBar = { ...C.pad, paddingBottom: navBarClear(18) };
  // Play is lit: picking a sibling is still on the way into a game.
  const bar = nav ? <BottomBar current="play" {...nav} /> : null;

  // ---- render ----
  if (!signedIn) {
    return (
      <div style={C.wrap}><button style={C.back} onClick={onHome}>← Home</button><div style={padWithBar}>
        <h1 style={C.h1}>{game.title}</h1>
        <p style={C.sub}>Play a brother or sister on another device.</p>
        <div style={C.note}>Ask a grown-up to set up <b>family play</b> in the Grown-ups area first. Then you and your sibling can play across devices.</div>
      </div>{bar}</div>
    );
  }

  if (match) {
    const waiting = phase !== "playing";
    const oppName = nameOf(oppIdOf(matchRef.current || match));
    return (
      <div style={C.wrap}>
        <button style={C.back} onClick={leaveMatch}>← Leave</button>
        <iframe ref={iframeRef} title={game.title} src={game.url} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} allow="autoplay" />
        {waiting && (
          <div style={C.overlay}>
            <div style={{ maxWidth: 340 }}>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
                {timedOut ? `Still waiting for ${oppName}…` : `Waiting for ${oppName}…`}
              </div>
              <div style={{ fontSize: 15, color: "#cfc9e6", fontWeight: 600, lineHeight: 1.5, marginBottom: 22 }}>
                {timedOut
                  ? `Make sure ${oppName} has ${game.title} open on their device and taps to join. It'll connect as soon as they're in.`
                  : `Ask ${oppName} to open ${game.title} on their device and join.`}
              </div>
              <button style={{ ...C.btn, padding: "12px 22px" }} onClick={leaveMatch}>← Back to games</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // lobby: separate INVITES FOR ME (someone already started a game with me) from my own
  const invites = matches.filter((m) => m.status !== "done" && m.host_kid !== me.id);
  const mine = matches.filter((m) => m.status !== "done" && m.host_kid === me.id);

  return (
    <div style={C.wrap}><button style={C.back} onClick={onHome}>← Home</button><div style={padWithBar}>
      <h1 style={C.h1}>{game.title}</h1>
      <p style={C.sub}>Play a brother or sister on another device.</p>
      {err && <div style={{ ...C.note, borderColor: "#ff7a7a", color: "#ffb3b3", marginBottom: 14 }}>{err}</div>}
      {loading ? <div style={C.note}>Loading your family…</div> : (
        <>
          {invites.length > 0 && (<>
            <div style={C.sect}>Invites for you</div>
            {invites.map((m) => (
              <div key={m.id} style={C.invite}>
                <span><b>{nameOf(m.host_kid)}</b> wants to play{m.world ? ` · ${m.world}` : ""}</span>
                <button style={{ ...C.btn, background: "linear-gradient(135deg,#34D399,#0EA5E9)" }} onClick={() => resume(m)}>Join</button>
              </div>
            ))}
          </>)}

          <div style={C.sect}>Look</div>
          <div>{WORLDS.map(([k, label]) => <span key={k} style={C.chip(world === k)} onClick={() => setWorld(k)}>{label}</span>)}</div>

          {mine.length > 0 && (<>
            <div style={C.sect}>Your games</div>
            {mine.map((m) => (
              <div key={m.id} style={C.card}>
                <span>vs {nameOf(oppIdOf(m))} · {m.world}</span>
                <button style={C.btn} onClick={() => resume(m)}>Open</button>
              </div>
            ))}
          </>)}

          <div style={C.sect}>Start a new game</div>
          {kids.length === 0 ? <div style={C.note}>No siblings set up yet. A grown-up can add another kid profile in the Grown-ups area.</div> :
            kids.map((k) => (
              <div key={k.id} style={C.card}>
                <span>{k.display_name}</span>
                <button style={C.btn} onClick={() => startWith(k)}>Play</button>
              </div>
            ))}
        </>
      )}
    </div>{bar}</div>
  );
}
