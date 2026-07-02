// /src/GrownUpFriends.jsx
// The grown-ups' Friends panel: where cross-account friendships are set up
// and APPROVED. This is the safety gate -- kids can never add strangers; a
// grown-up shares/enters a private family friend code, and BOTH grown-ups
// must approve before any kid can play. One friends list, shared by every
// game. Reached from Grown-ups -> "Manage friends".
import { useEffect, useState } from "react";
import { getMyFriendCode, addFriendByCode, listPendingFriends, approveFriend, declineFriend } from "./lib/friends";

const NUN = "'Nunito',sans-serif", FRED = "'Fredoka',sans-serif";
const S = {
  wrap: { position: "fixed", inset: 0, background: "#0F0E17", color: "#fff", fontFamily: NUN, overflow: "auto", zIndex: 60 },
  pad: { maxWidth: 560, margin: "0 auto", padding: "64px 20px 48px" },
  back: { position: "absolute", top: 14, left: 14, fontWeight: 800, fontSize: 14, color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" },
  h1: { fontFamily: FRED, fontWeight: 700, fontSize: 28, margin: "0 0 6px" },
  sub: { color: "#cfc9e6", margin: "0 0 22px", fontSize: 15, lineHeight: 1.5 },
  sect: { fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "26px 0 10px" },
  codeBox: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(124,92,252,0.14)", border: "1px solid rgba(167,139,255,0.5)", borderRadius: 18, padding: "18px 20px" },
  code: { fontFamily: FRED, fontWeight: 700, fontSize: 32, letterSpacing: 4 },
  card: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "14px 16px", marginBottom: 10 },
  input: { flex: 1, minWidth: 0, fontFamily: FRED, fontSize: 20, letterSpacing: 3, textTransform: "uppercase", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff" },
  btn: { fontFamily: FRED, fontWeight: 700, fontSize: 15, color: "#fff", border: "none", cursor: "pointer", borderRadius: 12, padding: "12px 18px", background: "linear-gradient(135deg,#7C5CFC,#A78BFF)" },
  ok: { fontFamily: FRED, fontWeight: 700, fontSize: 14, color: "#0f2417", border: "none", cursor: "pointer", borderRadius: 10, padding: "9px 14px", background: "#7CF6B0" },
  no: { fontFamily: FRED, fontWeight: 700, fontSize: 14, color: "#fff", border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer", borderRadius: 10, padding: "9px 14px", background: "rgba(255,255,255,0.06)" },
  note: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 16, color: "#cfc9e6", lineHeight: 1.5, fontSize: 14 },
  msg: (good) => ({ borderRadius: 12, padding: "10px 14px", marginTop: 10, fontSize: 14, background: good ? "rgba(124,246,176,0.14)" : "rgba(255,120,120,0.14)", color: good ? "#bff5d5" : "#ffd0d0" }),
};

export default function GrownUpFriends({ onBack }) {
  const [code, setCode] = useState("");
  const [entry, setEntry] = useState("");
  const [toApprove, setToApprove] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [msg, setMsg] = useState(null); // { text, good }
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [c, p] = await Promise.all([getMyFriendCode(), listPendingFriends()]);
      setCode(c || "");
      setToApprove(p.toApprove || []);
      setWaiting(p.waiting || []);
    } catch (e) { setMsg({ text: (e && e.message) || "Could not load.", good: false }); }
  }
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  async function submitCode(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await addFriendByCode(entry);
      setMsg({ text: r.message || "Request sent.", good: true });
      setEntry("");
      load();
    } catch (e2) { setMsg({ text: (e2 && e2.message) || "Could not add.", good: false }); }
    setBusy(false);
  }
  async function approve(id) { try { await approveFriend(id); load(); } catch (e) { setMsg({ text: e.message, good: false }); } }
  async function decline(id) { try { await declineFriend(id); load(); } catch (e) { setMsg({ text: e.message, good: false }); } }

  function copyCode() { try { navigator.clipboard.writeText(code); setMsg({ text: "Code copied!", good: true }); } catch (e) {} }

  return (
    <div style={S.wrap}>
      <button style={S.back} onClick={onBack}>&larr; Back</button>
      <div style={S.pad}>
        <h1 style={S.h1}>Friends</h1>
        <p style={S.sub}>Kids can only play with <b>approved friends</b> — never strangers. Share your family code with another grown-up, or enter theirs. Both grown-ups approve before any kids can play. Once approved, they're friends in every game.</p>

        <div style={S.sect}>Your family code</div>
        <div style={S.codeBox}>
          <span style={S.code}>{code || "······"}</span>
          <button style={S.btn} onClick={copyCode}>Copy</button>
        </div>
        <p style={{ ...S.note, marginTop: 10 }}>Give this to a friend's grown-up. When they enter it, you'll see a request to approve below.</p>

        <div style={S.sect}>Add a friend by their code</div>
        <form onSubmit={submitCode} style={{ display: "flex", gap: 10 }}>
          <input style={S.input} value={entry} maxLength={6} placeholder="ABC123"
            onChange={(e) => setEntry(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <button type="submit" style={S.btn} disabled={busy || entry.length !== 6}>Send</button>
        </form>
        {msg && <div style={S.msg(msg.good)}>{msg.text}</div>}

        <div style={S.sect}>Waiting for you to approve</div>
        {toApprove.length === 0 ? (
          <p style={{ color: "#cfc9e6", fontSize: 14 }}>No requests right now.</p>
        ) : toApprove.map((f) => (
          <div key={f.id} style={S.card}>
            <b>{f.label}</b>
            <span style={{ display: "flex", gap: 8 }}>
              <button style={S.ok} onClick={() => approve(f.id)}>Approve</button>
              <button style={S.no} onClick={() => decline(f.id)}>Decline</button>
            </span>
          </div>
        ))}

        <div style={S.sect}>Waiting for the other grown-up</div>
        {waiting.length === 0 ? (
          <p style={{ color: "#cfc9e6", fontSize: 14 }}>Nothing pending.</p>
        ) : waiting.map((f) => (
          <div key={f.id} style={S.card}>
            <b>{f.label}</b>
            <span style={{ color: "#cfc9e6", fontSize: 13 }}>Pending their OK</span>
          </div>
        ))}
      </div>
    </div>
  );
}
