// src/QuickGame.jsx
// -------------------------------------------------------------
// Session QZ1 — the SHORT GAME that replaced the multiple-choice quiz popup.
//
// Why this exists: the old QuizGate asked /api/generate-quiz for a question and
// rendered it as four buttons. The questions were disconnected from whatever the
// child was doing ("A color like the sky. Which letter completes B_U_?"), they
// taught nothing, and every single one cost an AI call. Mike's rule from that
// session: if we interrupt a child at all, it should feel like a tiny GAME, not
// a test — and quizzes belong in games and tools only, never while reading
// (see ExploreScreen / topic.html — Kidspedia has no quizzes at all now).
//
// Three games, all built from hand-written banks or plain arithmetic, so a round
// costs NOTHING and never waits on a network call:
//   1. "Spell it"        — a drawn picture, a word with blanks, tap letters IN
//                          ORDER. Wrong taps wiggle; nothing is ever lost.
//   2. "Make the number" — tap two cards that add to the target. Cards can be
//                          un-picked, and every deal is checked to be winnable.
//   3. "What comes next" — repeating shape pattern, for kids who can't read yet.
//
// No emojis anywhere (house rule) — every picture is drawn SVG.
//
// It keeps every side effect the old gate had, so the parent skills dashboard,
// badges, streaks and practice coins all keep working:
//   recordAnswer() -> local progress + badges
//   /api/log-learning-event -> the Session 6B ledger
//   topUpAward() + BuildableWallet -> "earn coins by practicing"
//
// Props (drop-in compatible with the old QuizGate):
//   age      number   default: the active kid's saved age, else 7
//   goal     "math" | "reading" | "mix"  — steers which game shows
//   onPass   () => void  required — called on a win OR a skip. Never traps a kid.
//   gameType string   tag for the ledger ("breaker", "topup", "creation", ...)
//   title    string   heading above the game
//   inline   bool     render bare (no full-screen overlay) for loading screens
//   repeat   bool     inline mode: start a fresh round after a win instead of
//                     calling onPass, so the wait stays filled
//   kind     string   force "spell" | "number" | "pattern" (QA/preview only;
//                     normally left off so chooseGame() picks)
// -------------------------------------------------------------
import { useMemo, useRef, useState } from "react";
import { recordAnswer, BADGES, getLearningSettings, effectiveLearning, topUpAward } from "./store";
// Banks + deals live in plain JS so qa-quickgame.mjs can test them headlessly.
import { HUES, chooseGame, dealSpell, dealNumber, dealPattern, SUBJECT, HEADING } from "./quickgame-content";

/* ===========================================================================
   Drawn pictures (no emoji, house rule). One flat SVG per spelling word.
   =========================================================================== */
function Pic({ name, size = 92 }) {
  const p = { width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": true };
  switch (name) {
    case "SUN":
      return (
        <svg {...p}>
          <g stroke="#FFB020" strokeWidth="4.5" strokeLinecap="round">
            <path d="M32 3v8M32 53v8M3 32h8M53 32h8M11 11l6 6M47 47l6 6M53 11l-6 6M17 47l-6 6" />
          </g>
          <circle cx="32" cy="32" r="14" fill="#FFD24A" stroke="#F0A81E" strokeWidth="2.5" />
        </svg>
      );
    case "MOON":
      return (
        <svg {...p}>
          <path d="M40 8A24 24 0 1 0 40 56A19 19 0 1 1 40 8Z" fill="#FFE9A8" stroke="#E5C368" strokeWidth="2.5" />
        </svg>
      );
    case "STAR":
      return (
        <svg {...p}>
          <polygon points="32,5 39.5,24 60,25 44,38 49,58 32,47 15,58 20,38 4,25 24.5,24"
            fill="#FFD24A" stroke="#F0A81E" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "FISH":
      return (
        <svg {...p}>
          <polygon points="42,32 60,20 60,44" fill="#2196F3" />
          <ellipse cx="27" cy="32" rx="19" ry="12" fill="#4FC3F7" stroke="#1E88E5" strokeWidth="2.5" />
          <circle cx="17" cy="28" r="3" fill="#123" />
        </svg>
      );
    case "TREE":
      return (
        <svg {...p}>
          <rect x="28" y="36" width="7" height="22" rx="2" fill="#8B5A2B" />
          <circle cx="22" cy="30" r="11" fill="#4CAF50" />
          <circle cx="42" cy="30" r="11" fill="#4CAF50" />
          <circle cx="32" cy="20" r="13" fill="#66BB6A" stroke="#2E7D32" strokeWidth="2" />
        </svg>
      );
    case "LEAF":
      return (
        <svg {...p}>
          <path d="M32 5C11 19 11 45 32 59C53 45 53 19 32 5Z" fill="#66BB6A" stroke="#2E7D32" strokeWidth="2.5" />
          <path d="M32 10v44M32 24l10-7M32 36l-10-7" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "BOAT":
      return (
        <svg {...p}>
          <rect x="30" y="10" width="3.5" height="30" fill="#8B5A2B" />
          <polygon points="34,12 34,38 54,38" fill="#FFF3E0" stroke="#D8C3A5" strokeWidth="2" />
          <path d="M6 40h52l-9 15H15Z" fill="#E07A5F" stroke="#B85C43" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "BALL":
      return (
        <svg {...p}>
          <circle cx="32" cy="32" r="20" fill="#FF7043" stroke="#D8452B" strokeWidth="2.5" />
          <path d="M12 32h40M32 12v40M17 18c10 8 20 8 30 0M17 46c10-8 20-8 30 0"
            stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "CAKE":
      return (
        <svg {...p}>
          <rect x="30" y="8" width="4" height="12" rx="1.5" fill="#FFEB3B" />
          <circle cx="32" cy="7" r="3.5" fill="#FF9800" />
          <rect x="10" y="24" width="44" height="9" rx="3" fill="#FFF3E0" stroke="#E6CFA8" strokeWidth="2" />
          <rect x="10" y="32" width="44" height="22" rx="4" fill="#F48FB1" stroke="#C2185B" strokeWidth="2.5" />
        </svg>
      );
    case "HOUSE":
      return (
        <svg {...p}>
          <rect x="13" y="28" width="38" height="28" fill="#FFE0B2" stroke="#C99A5B" strokeWidth="2.5" />
          <polygon points="32,7 60,30 4,30" fill="#D9534F" stroke="#A33" strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="27" y="40" width="10" height="16" fill="#8B5A2B" />
        </svg>
      );
    case "CAT":
      return (
        <svg {...p}>
          <polygon points="17,26 19,8 33,20" fill="#FFB74D" stroke="#E08D2B" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="47,26 45,8 31,20" fill="#FFB74D" stroke="#E08D2B" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="32" cy="36" r="17" fill="#FFCC80" stroke="#E08D2B" strokeWidth="2.5" />
          <circle cx="26" cy="33" r="2.6" fill="#123" />
          <circle cx="38" cy="33" r="2.6" fill="#123" />
          <path d="M32 39l-3 3h6z" fill="#E0578F" />
          <path d="M14 36h8M14 42h8M50 36h-8M50 42h-8" stroke="#C97B1E" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "BIRD":
      return (
        <svg {...p}>
          <ellipse cx="27" cy="37" rx="17" ry="13" fill="#64B5F6" stroke="#1E88E5" strokeWidth="2.5" />
          <circle cx="43" cy="23" r="10" fill="#90CAF9" stroke="#1E88E5" strokeWidth="2.5" />
          <polygon points="52,22 63,26 52,30" fill="#FFB300" stroke="#E08D00" strokeWidth="1.5" />
          <circle cx="45" cy="21" r="2.4" fill="#123" />
          <ellipse cx="25" cy="36" rx="9" ry="6" fill="#42A5F5" />
        </svg>
      );
    default:
      return null;
  }
}

// Pattern pieces: one flat shape per token.
function ShapeMark({ token, size = 44 }) {
  const [s, h] = token.split("-");
  const c = HUES[Number(h)];
  const p = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true };
  if (s === "circle") return <svg {...p}><circle cx="24" cy="24" r="17" fill={c.fill} stroke={c.line} strokeWidth="3" /></svg>;
  if (s === "square") return <svg {...p}><rect x="7" y="7" width="34" height="34" rx="5" fill={c.fill} stroke={c.line} strokeWidth="3" /></svg>;
  return <svg {...p}><polygon points="24,6 43,41 5,41" fill={c.fill} stroke={c.line} strokeWidth="3" strokeLinejoin="round" /></svg>;
}

/* --------------------------- 1. Spell it --------------------------------- */
// Deal: the word, which letters are blank, and the tile tray. The tray always
// contains every needed letter plus fillers, shuffled, six tiles total.

function SpellGame({ deal, onWin, onMiss, S }) {
  const [step, setStep] = useState(0);
  const [used, setUsed] = useState([]);   // tray indices already consumed
  const [bad, setBad] = useState(-1);     // tray index currently wiggling
  const done = step >= deal.need.length;

  function tap(i) {
    if (done) return;
    const want = deal.letters[deal.need[step]];
    if (deal.tray[i] === want) {
      const next = step + 1;
      setUsed(used.concat(i));
      setStep(next);
      if (next >= deal.need.length) onWin();
    } else {
      onMiss();
      setBad(i);
      setTimeout(() => setBad(-1), 340);
    }
  }

  const filledUpTo = deal.need.slice(0, step);
  return (
    <>
      <div style={S.picWrap}><Pic name={deal.pic} /></div>
      <div style={S.word}>
        {deal.letters.map((c, i) => {
          const blank = deal.need.includes(i);
          const shown = !blank || filledUpTo.includes(i);
          const isNext = !done && deal.need[step] === i;
          return (
            <div key={i} style={{ ...S.slot, ...(shown ? S.slotFilled : S.slotBlank), ...(isNext ? S.slotNext : {}) }}>
              {shown ? c : ""}
            </div>
          );
        })}
      </div>
      <div style={S.tray}>
        {deal.tray.map((c, i) => (
          <button key={i} onClick={() => tap(i)} disabled={used.includes(i)}
            style={{ ...S.tile, ...(used.includes(i) ? S.tileUsed : {}), ...(bad === i ? S.tileBad : {}) }}>
            {c}
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------ 2. Make the number ----------------------------- */
// Deal six cards with at least one pair that hits the target, so it is always
// winnable. Any pair that sums to the target counts, not just the planned one.

function NumberGame({ deal, onWin, onMiss, S }) {
  const [sel, setSel] = useState([]);   // selected card indices
  const [good, setGood] = useState([]);
  const [bad, setBad] = useState([]);

  function tap(i) {
    if (good.length) return;
    if (sel.includes(i)) { setSel(sel.filter((x) => x !== i)); return; }
    const next = sel.concat(i);
    if (next.length < 2) { setSel(next); return; }
    setSel([]);
    if (deal.cards[next[0]] + deal.cards[next[1]] === deal.target) { setGood(next); onWin(); }
    else { onMiss(); setBad(next); setTimeout(() => setBad([]), 360); }
  }

  return (
    <>
      <p style={S.target}>{deal.target}</p>
      <p style={S.hint}>Tap two cards that add up to it.</p>
      <div style={S.cards}>
        {deal.cards.map((n, i) => (
          <button key={i} onClick={() => tap(i)}
            style={{
              ...S.tile,
              ...(sel.includes(i) ? S.tilePick : {}),
              ...(good.includes(i) ? S.tileGood : {}),
              ...(bad.includes(i) ? S.tileBad : {}),
            }}>
            {n}
          </button>
        ))}
      </div>
    </>
  );
}

/* ----------------------- 3. What comes next ------------------------------ */
// Build a repeating pattern (ABAB, AABAAB or ABCABC) from drawn shapes, cut it
// one step short, and ask for the next one. Endless, and needs no reading.

function PatternGame({ deal, onWin, onMiss, S }) {
  const [good, setGood] = useState(-1);
  const [bad, setBad] = useState(-1);
  return (
    <>
      <p style={S.hint}>What comes next?</p>
      <div style={S.strip}>
        {deal.seq.map((t, i) => <div key={i} style={S.cell}><ShapeMark token={t} /></div>)}
        <div style={{ ...S.cell, ...S.cellQ }}>
          {good >= 0 ? <ShapeMark token={deal.answer} /> : <span style={S.qmark}>?</span>}
        </div>
      </div>
      <div style={S.cards}>
        {deal.choices.map((t, i) => (
          <button key={i} disabled={good >= 0}
            onClick={() => {
              if (t === deal.answer) { setGood(i); onWin(); }
              else { onMiss(); setBad(i); setTimeout(() => setBad(-1), 340); }
            }}
            style={{ ...S.tile, ...S.tileShape, ...(good === i ? S.tileGood : {}), ...(bad === i ? S.tileBad : {}) }}>
            <ShapeMark token={t} size={38} />
          </button>
        ))}
      </div>
    </>
  );
}

/* ===========================================================================
   Celebration marks (drawn, no emoji) — same look the old gate used.
   =========================================================================== */
function BadgeMark({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="28" r="20" fill="#FFC75A" stroke="#F0972A" strokeWidth="2.5" />
      <path d="M23 28.5l6 6 12-13" fill="none" stroke="#7a4b00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 44 L20 60 L32 53 L44 60 L40 44 Z" fill="#E0578F" stroke="#b5396e" strokeWidth="1.5" />
    </svg>
  );
}
function CoinMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="#FFD24A" stroke="#E0A21C" strokeWidth="3" />
      <path d="M32 20 v24 M27 25 h8 a4 4 0 0 1 0 8 h-8 M27 33 h9 a4 4 0 0 1 0 8 h-9"
        fill="none" stroke="#8a5a00" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===========================================================================
   The gate itself
   =========================================================================== */

export default function QuickGame({
  age, goal = "math", onPass, gameType = "creation",
  title = "Quick game!", inline = false, repeat = false, kind: forceKind,
}) {
  const effectiveAge = age == null ? (getLearningSettings().age || 7) : age;
  const [round, setRound] = useState(0);
  const kind = useMemo(() => forceKind || chooseGame(goal, effectiveAge), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const deal = useMemo(
    () => (kind === "spell" ? dealSpell(effectiveAge) : kind === "number" ? dealNumber(effectiveAge) : dealPattern()),
    [kind, round] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [won, setWon] = useState(false);
  const [badge, setBadge] = useState(null);
  const [coins, setCoins] = useState(0);
  const [nudge, setNudge] = useState(false);
  const missLogged = useRef(false);
  const subject = SUBJECT[kind];

  // Best-effort ledger write (skills dashboard, streaks, weekly digest).
  function logAnswer(correct) {
    try {
      fetch("/api/log-learning-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kidProfileId: activeKidId(), subject, skill: kind,
          grade: getLearningSettings().grade || null,
          quizType: kind, correct, questionId: null, game: gameType,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {}
  }

  function handleWin() {
    if (won) return;
    setWon(true);
    const newly = recordAnswer({ subject, correct: true }); // no-op unless Learning Mode is on
    logAnswer(true);
    // Practising earns coins when the parent's top-up toggle is on. awardOnce
    // keeps it replay-proof, so a reload never double-credits.
    let earned = 0;
    try {
      const eff = effectiveLearning({});
      if (eff.enabled && eff.coinTopUp && window.BuildableWallet) {
        const award = topUpAward();
        if (award) {
          const before = window.BuildableWallet.balance();
          window.BuildableWallet.awardOnce(award.key, award.coins);
          if (window.BuildableWallet.balance() > before) { earned = award.coins; setCoins(award.coins); }
        }
      }
    } catch (e) {}
    const got = newly && newly.length ? BADGES.find((b) => b.id === newly[0]) : null;
    if (got) setBadge(got);
    const wait = got ? 1800 : earned ? 1200 : 700;
    setTimeout(() => {
      if (repeat) { // loading screens: keep the wait filled with a fresh round
        setWon(false); setBadge(null); setCoins(0); setNudge(false);
        missLogged.current = false;
        setRound((r) => r + 1);
      } else {
        onPass && onPass();
      }
    }, wait);
  }

  // A wrong tap costs nothing and never fails the round — it only nudges. We log
  // at most one miss per round so a kid tapping around can't spam the ledger.
  function handleMiss() {
    setNudge(true);
    if (missLogged.current) return;
    missLogged.current = true;
    recordAnswer({ subject, correct: false }); // no-op unless Learning Mode is on
    logAnswer(false);
  }

  const S = inline ? INLINE : STYLES;
  const Game = kind === "spell" ? SpellGame : kind === "number" ? NumberGame : PatternGame;

  const body = (
    <div style={S.card}>
      <p style={S.kicker}>{HEADING[kind]}</p>
      <h2 style={S.title}>{title}</h2>
      <Game deal={deal} onWin={handleWin} onMiss={handleMiss} S={S} />
      {badge && (
        <div style={S.celebrate}>
          <BadgeMark />
          <p style={S.celebrateText}>New badge: {badge.label}!</p>
        </div>
      )}
      {coins > 0 && (
        <div style={S.celebrate}>
          <CoinMark />
          <p style={S.celebrateText}>You earned {coins} coins!</p>
        </div>
      )}
      {nudge && !won && <p style={S.nudge}>Not that one — keep going!</p>}
      {!inline && <button style={S.skip} onClick={() => onPass && onPass()}>Skip for now</button>}
    </div>
  );

  return inline ? body : <div style={STYLES.overlay}>{body}</div>;
}

/* ===========================================================================
   Styles — same card language as the old gate.
   =========================================================================== */
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const BASE = {
  kicker: {
    fontFamily: FRED, fontSize: 12, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "#B9B6D8", margin: "0 0 4px",
  },
  title: { fontFamily: FRED, fontSize: 23, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.2 },
  hint: { fontSize: 15, fontWeight: 700, color: "#CFCBE8", margin: "0 0 14px" },
  picWrap: { margin: "2px 0 12px" },
  target: { fontFamily: FRED, fontSize: 46, fontWeight: 800, color: "#FFD24A", margin: "0 0 2px" },
  word: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "0 0 18px" },
  slot: {
    width: 46, height: 56, boxSizing: "border-box", borderRadius: 13, display: "flex", alignItems: "center",
    justifyContent: "center", fontFamily: FRED, fontSize: 27, fontWeight: 800, color: "#fff",
    border: "2px solid transparent",
  },
  slotFilled: { background: "rgba(155,126,221,0.25)" },
  slotBlank: { border: "2px dashed rgba(255,255,255,0.45)" },
  slotNext: { borderColor: "#FFD24A", borderStyle: "solid", background: "rgba(255,210,74,0.14)" },
  tray: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  cards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  tile: {
    padding: "15px 8px", fontSize: 21, fontWeight: 800, fontFamily: FRED,
    borderRadius: 14, border: "2px solid rgba(155,126,221,0.45)",
    background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", lineHeight: 1,
  },
  tileShape: { display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 8px" },
  tileUsed: { opacity: 0.25, cursor: "default" },
  tilePick: { borderColor: "#FFD24A", background: "rgba(255,210,74,0.18)" },
  tileGood: { background: "rgba(0,196,140,0.3)", borderColor: "#00c48c" },
  tileBad: { background: "rgba(214,90,123,0.28)", borderColor: "#d65a7b" },
  strip: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", margin: "0 0 18px" },
  cell: {
    width: 50, height: 50, boxSizing: "border-box", border: "2px solid transparent",
    borderRadius: 13, background: "rgba(255,255,255,0.06)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  cellQ: { border: "2px dashed rgba(255,255,255,0.45)", background: "transparent" },
  qmark: { fontFamily: FRED, fontSize: 24, fontWeight: 800, color: "#CFCBE8" },
  celebrate: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    margin: "14px 0 0", padding: "10px 12px", borderRadius: 14,
    background: "rgba(255,210,74,0.14)", border: "1px solid rgba(255,210,74,0.4)",
  },
  celebrateText: { fontFamily: FRED, fontSize: 16, fontWeight: 800, color: "#FFD98A", margin: 0 },
  nudge: { color: "#ffb3c4", fontSize: 14, fontWeight: 700, margin: "14px 0 0" },
  skip: {
    marginTop: 18, background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)", borderRadius: 14,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
};

const STYLES = {
  ...BASE,
  overlay: {
    position: "fixed", inset: 0, zIndex: 600,
    background: "linear-gradient(135deg, #5B21B6 0%, #7C5CFC 50%, #FF6B6B 100%)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  card: {
    background: "rgba(20,16,40,0.96)", border: "2px solid #9b7edd", borderRadius: 24,
    padding: 26, maxWidth: 460, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    fontFamily: NUN, color: "#fff", textAlign: "center",
  },
};

// Loading screens already sit on their own dark panel, so the inline variant
// drops the overlay and the card chrome and just lays the game out.
const INLINE = {
  ...BASE,
  card: { fontFamily: NUN, color: "#fff", textAlign: "center", maxWidth: 380, margin: "0 auto", width: "100%" },
};
