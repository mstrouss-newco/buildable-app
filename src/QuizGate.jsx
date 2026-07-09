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
import { recordAnswer, BADGES, getReviewItem, recordMiss, clearMiss, weakestSubject, getLearningSettings, effectiveLearning, topUpAward } from "./store";

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

// Map a weak subject to the quizType the API understands.
function subjectToQuizType(s) {
  if (s === "geometry") return "geometry";
  if (s === "spelling") return "spelling";
  if (s === "reading") return "reading";
  return "math";
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


// Map a generated question's `type` to a progress subject. Unknown types map to
// math as a safe default (totals still accrue).
function typeToSubject(t) {
  if (t === "geometry") return "geometry";
  if (t === "spelling") return "spelling";
  if (t === "reading") return "reading";
  return "math";
}

// Drawn (no-emoji) badge mark for the celebration: a filled rosette + check.
function BadgeMark({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="28" r="20" fill="#FFC75A" stroke="#F0972A" strokeWidth="2.5" />
      <path d="M23 28.5l6 6 12-13" fill="none" stroke="#7a4b00" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 44 L20 60 L32 53 L44 60 L40 44 Z" fill="#E0578F" stroke="#b5396e" strokeWidth="1.5" />
    </svg>
  );
}

// Small drawn coin for the top-up reward moment (no emoji).
function CoinMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="#FFD24A" stroke="#E0A21C" strokeWidth="3" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#E0A21C" strokeWidth="2" opacity="0.6" />
      <path d="M32 20 v24 M27 25 h8 a4 4 0 0 1 0 8 h-8 M27 33 h9 a4 4 0 0 1 0 8 h-9"
        fill="none" stroke="#8a5a00" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function QuizGate({ age, goal = "math", onPass, gameType = "creation", title = "Quick question!" }) {
  // Fall back to the active kid's saved age when no explicit age is passed.
  const effectiveAge = age == null ? (getLearningSettings().age || 7) : age;
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null);
  const [wrong, setWrong] = useState(false);
  const [earnedBadge, setEarnedBadge] = useState(null);
  const [coinAward, setCoinAward] = useState(0); // coins earned by this correct answer (top-up)
  const levelRef = useRef(1);
  const alive = useRef(true);

  async function load() {
    setLoading(true);
    setPicked(null);
    setWrong(false);
    // Practice what you missed: sometimes replay an exact missed question.
    const review = Math.random() < 0.4 ? getReviewItem() : null;
    if (review) {
      setQ(review);
      setLoading(false);
      return;
    }
    // Otherwise fetch fresh, biased toward the weakest subject when we know one.
    const weak = weakestSubject();
    const quizType = (weak && Math.random() < 0.5) ? subjectToQuizType(weak) : goalToQuizType(goal);
    try {
      const r = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age: effectiveAge, level: levelRef.current, gameType, quizType }),
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
    if (!q || picked === q.correctIndex) return;
    setPicked(i);
    const subject = typeToSubject(q.type);
    if (i === q.correctIndex) {
      levelRef.current = Math.min(10, levelRef.current + 1); // adapt up for next time
      const newly = recordAnswer({ subject, correct: true }); // no-op unless Learning Mode on
      clearMiss(q); // mastered — remove from the review queue
      // Session 6B: practicing earns coins. Every 3rd correct = 10 coins, when
      // the parent's "Earn coins by practicing" toggle is on. awardOnce keeps it
      // replay-proof per kid, so reloading never double-credits.
      try {
        const eff = effectiveLearning({});
        if (eff.enabled && eff.coinTopUp && window.BuildableWallet) {
          const award = topUpAward();
          if (award) {
            const before = window.BuildableWallet.balance();
            window.BuildableWallet.awardOnce(award.key, award.coins);
            if (window.BuildableWallet.balance() > before) setCoinAward(award.coins);
          }
        }
      } catch (e) {}
      const badge = newly && newly.length ? BADGES.find((b) => b.id === newly[0]) : null;
      if (badge) {
        // Brief celebration, then proceed.
        setEarnedBadge(badge);
        setTimeout(() => { onPass && onPass(); }, 1800);
      } else {
        setTimeout(() => { onPass && onPass(); }, 650);
      }
    } else {
      levelRef.current = Math.max(1, levelRef.current - 1); // ease down
      recordAnswer({ subject, correct: false }); // no-op unless Learning Mode on
      recordMiss(q); // queue it to practice again later
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
            {earnedBadge && (
              <div style={QS.badgeCelebrate}>
                <BadgeMark />
                <p style={QS.badgeText}>New badge: {earnedBadge.label}!</p>
              </div>
            )}
            {coinAward > 0 && (
              <div style={QS.coinCelebrate}>
                <CoinMark />
                <p style={QS.coinText}>You earned {coinAward} coins!</p>
              </div>
            )}
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
  badgeCelebrate: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    margin: "16px 0 0", padding: "12px", borderRadius: 16,
    background: "rgba(255,199,90,0.12)", border: "1px solid rgba(255,199,90,0.35)",
  },
  badgeText: { fontFamily: FRED, fontSize: 17, fontWeight: 800, color: "#FFD98A", margin: 0 },
  coinCelebrate: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    margin: "12px 0 0", padding: "10px 12px", borderRadius: 14,
    background: "rgba(255,210,74,0.14)", border: "1px solid rgba(255,210,74,0.4)",
  },
  coinText: { fontFamily: FRED, fontSize: 16, fontWeight: 800, color: "#FFD98A", margin: 0 },
  skip: {
    marginTop: 18, background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)", borderRadius: 14,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
};
