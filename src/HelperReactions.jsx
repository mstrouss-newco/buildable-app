// HelperReactions — a global layer (mounted once in main.jsx, OUTSIDE the screen
// switch) that listens for win/lose messages posted by games (BB.win()/BB.lose()
// -> postMessage {source:"buildable", kind}). When one arrives it pops the kid's
// helper into the bottom of the screen, speaks a cheer/encouragement in the
// helper's voice (/api/narrate-story-page), bounces, then auto-hides.
import { useEffect, useRef, useState } from "react";
import { getActiveKid, getKidHelper } from "./lib/accounts";
import { registerAudio } from "./lib/audioUnlock";

const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const WINS = ["You did it! Woohoo!", "Amazing job!", "You're a superstar!", "That was awesome!", "Yes! You win!", "Incredible! High five!"];
const LOSES = ["So close! Try again!", "Don't give up — you've got this!", "Almost! One more go?", "Nice try! Let's beat it next time!", "Oof! You'll get it next time!"];

export default function HelperReactions() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ win: true, text: "" });
  const audioRef = useRef(null);
  const hideRef = useRef(null);

  useEffect(() => {
    const onMsg = (e) => {
      const d = e && e.data;
      if (!d || d.source !== "buildable" || !d.kind) return;
      if (["win", "lose", "levelup", "cheer"].indexOf(d.kind) === -1) return;
      const win = d.kind === "win" || d.kind === "levelup" || d.kind === "cheer";
      const pool = win ? WINS : LOSES;
      const text = d.text || pool[Math.floor(Math.random() * pool.length)];
      setState({ win: win, text: text });
      setShow(true);
      try {
        const helper = getKidHelper(getActiveKid());
        const vid = helper && helper.voice;
        fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(vid ? { text: text, voiceId: vid } : { text: text }) })
          .then((r) => r.json())
          .then((j) => { if (j && j.configured && j.audioUrl) { if (!audioRef.current) { audioRef.current = new Audio(); registerAudio(audioRef.current); } const a = audioRef.current; a.src = j.audioUrl; a.currentTime = 0; a.volume = 1; a.play().catch(() => {}); } })
          .catch(() => {});
      } catch (err) {}
      clearTimeout(hideRef.current);
      hideRef.current = setTimeout(() => setShow(false), 6000);
    };
    window.addEventListener("message", onMsg);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(hideRef.current); };
  }, []);

  if (!show) return null;
  const helper = getKidHelper(getActiveKid());
  const img = helper && helper.image;
  const accent = state.win ? "#7CF6B0" : "#FFD66B";
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 24, zIndex: 100000, display: "flex", justifyContent: "center", pointerEvents: "none", fontFamily: NUN }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, maxWidth: "92%" }}>
        <div className="bk-pop" style={{ maxWidth: 260, background: "#1b1830", border: "1px solid " + accent + "88", borderRadius: "16px 16px 16px 4px", padding: "12px 16px", color: "#fff", boxShadow: "0 12px 34px rgba(0,0,0,0.55)", fontWeight: 800, fontSize: 16, lineHeight: 1.35 }}>{state.text}</div>
        <div className="bk-bounce" style={{ width: 84, height: 84, flexShrink: 0, borderRadius: "50%", border: "3px solid " + accent, overflow: "hidden", background: img ? ("center/cover no-repeat url(" + img + ")") : "linear-gradient(135deg,#9b7edd,#6f5bd6)", boxShadow: "0 10px 30px rgba(155,126,221,0.6)" }} />
      </div>
    </div>
  );
}
