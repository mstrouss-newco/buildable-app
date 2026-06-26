// src/QuizGate.jsx
// -------------------------------------------------------------
// Learning Mode: one quick question, shown at a "moment" (between levels, or
// before starting a brand-new creation). Fetches a single question from
// /api/generate-quiz, renders it with no emojis, and calls onPass() when the
// child answers correctly. Wrong answers never hard-fail — the child can
// simply try again. There is always a "Skip" escape so a gate can't trap a kid.
//
// Props:
//   age      number  (default 7)
//   goal     "math" | "reading" | "mix"   (default "math")
//   onPass   () => void   required — called on a correct answer or skip
//   gameType string  passed through for cache bucketing (optional)
//   title    string  heading shown above the question (optional)
// -------------------------------------------------------------
import { useEffect, useRef, useState } from "react";

// Map a learning goal to a concrete quizType for the API. "mix" alternates so a
// child gets variety across moments.
function goalToQuizType(goal) {
  if (goal === "reading") return Math.random() < 0.5 ? "reading" : "spelling";
  if (goal === "mix") {
    const opts = ["math", "geometry", "spelling", "reading"];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  // default: math (with an occasional geometry question for variety)
  return Math.random() < 0.25 ? "geometry" : "math";
}

export function questionText(q) {
  if (!q) return "";
  if (q.type === "spelling") {
    const clue = q.clue ? q.clue + " " : "";
    return `${clue}Which letter completes ${q.word_template || ""}?`.trim();
  }
  if (q.type === "reading") {
    return [q.story, q.question].filter(Boolean).join(" ");
  }
  return q.question || "Pick the right answer";
}

export default function QuizGate({ age = 7, goal = "math", onPass, gameType = "creation", title = "Quick question!" }) {
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null);
  const [wrong, setWrong] = useState(false);
  const levelRef = useRef(1);
  const alive = useRef(true);

  async function load() {
    setLoading(true);
    setPicked(null);
    setWrong(false);
    const quizType = goalToQuizType(goal);
    try {
      const r = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age, level: levelRef.current, gameType, quizType }),
      });
      const data = await r.json();
      if (!alive.current) return;
      if (data && Array.isArray(data.choices) && typeof data.correctIndex === "number") {
        setQ(data);
      } else {
        // Never block: if the API somehow returns nothing usable, pass through.
        onPass && onPass();
        return;
      }
    } catch {
      if (!alive.current) return;
      onPass && onPass(); // network failure must not trap the child
      return;
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(i) {
    if (!q) return;
    setPicked(i);
    if (i === q.correctIndex) {
      levelRef.current = Math.min(10, levelRef.current + 1); // adapt up for next time
      setTimeout(() => { onPass && onPass(); }, 650);
    } else {
      levelRef.current = Math.max(1, levelRef.current - 1); // ease down
      setWrong(true);
    }
  }

  return (
    <div style={QS.overlay}>
      <div style={QS.card}>
        <h2 style={QS.title}>{title}</h2>
        {loading || !q ? (
          <p style={QS.loadingText}>Getting a question ready…</p>
        ) : (
          <>
            <p style={QS.question}>{questionText(q)}</p>
            <div style={QS.choices}>
              {q.choices.map((c, i) => {
                const isCorrect = picked != null && i === q.correctIndex;
                const isWrongPick = picked === i && i !== q.correctIndex;
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    disabled={picked != null && picked === q.correctIndex}
                    style={{
                      ...QS.choiceBtn,
                      ...(isCorrect ? QS.choiceCorrect : {}),
                      ...(isWrongPick ? QS.choiceWrong : {}),
                    }}
                  >
                    {String(c)}
                  </button>
                );
              })}
            </div>
            {wrong && <p style={QS.tryAgain}>Not quite — try again!</p>}
            <button style={QS.skip} onClick={() => onPass && onPass()}>Skip for now</button>
          </>
        )}
      </div>
    </div>
  );
}

const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const QS = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 600,
    background: "linear-gradient(135deg, #5B21B6 0%, #7C5CFC 50%, #FF6B6B 100%)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  card: {
    background: "rgba(20,16,40,0.96)", border: "2px solid #9b7edd", borderRadius: 24,
    padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    fontFamily: NUN, color: "#fff", textAlign: "center",
  },
  title: { fontFamily: FRED, fontSize: 26, fontWeight: 800, margin: "0 0 14px" },
  loadingText: { fontSize: 15, opacity: 0.8, margin: "20px 0" },
  question: { fontSize: 19, fontWeight: 700, lineHeight: 1.4, margin: "0 0 18px" },
  choices: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 },
  choiceBtn: {
    padding: "16px 12px", fontSize: 18, fontWeight: 800, fontFamily: NUN,
    borderRadius: 14, border: "2px solid rgba(155,126,221,0.45)",
    background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer",
  },
  choiceCorrect: { background: "rgba(0,196,140,0.25)", borderColor: "#00c48c", color: "#fff" },
  choiceWrong: { background: "rgba(214,90,123,0.25)", borderColor: "#d65a7b", color: "#fff" },
  tryAgain: { color: "#ffb3c4", fontSize: 14, fontWeight: 700, margin: "14px 0 0" },
  skip: {
    marginTop: 18, background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)", borderRadius: 14,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
};
