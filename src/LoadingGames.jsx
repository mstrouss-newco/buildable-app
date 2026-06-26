// src/LoadingGames.jsx
// Shown during the render wait for a character/level/game.
//
// DEFAULT behavior (Learning Mode OFF) is unchanged: rotating mini-games
// (numbers / memory / pattern) that auto-dismiss when the real render finishes.
//
// When Learning Mode is ON (store.getLearningSettings().enabled), the slot
// shows ONE real question from /api/generate-quiz instead of the mini-games.
// The question is adaptive: level rises on a correct answer and falls on a
// wrong one. It still auto-dismisses when the real render completes.
//
// No emojis anywhere — shapes/marks are inline SVG or CSS.
import { useState, useEffect, useRef } from 'react';
import "./loading-games.css";
import { getLearningSettings, recordAnswer } from "./store";
import { questionText } from "./QuizGate";

// ---- small inline marks (no emojis) ----
function CheckMark({ size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="none" stroke="#00c48c" strokeWidth="2" />
      <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#00c48c" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function typeToSubject(t) {
  if (t === "geometry") return "geometry";
  if (t === "spelling") return "spelling";
  if (t === "reading") return "reading";
  return "math";
}

function goalToQuizType(goal) {
  if (goal === "reading") return Math.random() < 0.5 ? "reading" : "spelling";
  if (goal === "mix") {
    const opts = ["math", "geometry", "spelling", "reading"];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  return Math.random() < 0.25 ? "geometry" : "math";
}

export default function LoadingGames({ isLoading, onComplete, operationType = 'character', age = 7, gameData }) {
  const [gameType, setGameType] = useState('numbers');
  const [gameState, setGameState] = useState('playing');
  const [score, setScore] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Read learning settings once at mount so behavior is stable for this wait.
  const learning = getLearningSettings();
  const learnAge = (gameData && (gameData.age || gameData.character?.age)) || age || 7;

  useEffect(() => {
    if (!isLoading && gameState === 'playing') {
      // Render complete - show result
      setGameState('complete');
      setTimeout(() => {
        onComplete?.();
        setDismissed(true);
      }, 1500); // Show result for 1.5s then close
    }
  }, [isLoading]);

  // Auto-rotate through the mini-games while we wait (ONLY when learning is OFF).
  const GAME_ORDER = ['numbers', 'memory', 'pattern'];
  useEffect(() => {
    if (learning.enabled) return; // learning mode shows a single question, no rotation
    if (!isLoading || gameState !== 'playing') return;
    const rotate = setInterval(() => {
      setGameType((prev) => {
        const i = GAME_ORDER.indexOf(prev);
        return GAME_ORDER[(i + 1) % GAME_ORDER.length];
      });
    }, 9000); // ~9s per mini-game, then advance to the next automatically
    return () => clearInterval(rotate);
  }, [isLoading, gameState, learning.enabled]);

  if (dismissed) return null;
  if (!isLoading && gameState !== 'complete') {
    return null;
  }

  return (
    <div className="loading-games-overlay">
      <div className="loading-games-container">
        {gameState === 'playing' && learning.enabled && (
          <LearningQuestion age={learnAge} goal={learning.goal} operationType={operationType} />
        )}

        {gameState === 'playing' && !learning.enabled && (
          <>
            {gameType === 'numbers' && <TapNumbersGame setScore={setScore} />}
            {gameType === 'memory' && <MemoryMatchGame setScore={setScore} />}
            {gameType === 'pattern' && <PatternGame setScore={setScore} />}
          </>
        )}

        {gameState === 'complete' && (
          <div className="game-complete">
            <div className="complete-mark"><CheckMark /></div>
            <h2>Great Job!</h2>
            {!learning.enabled && (
              <p className="complete-score">Your Score: <strong>{score}</strong></p>
            )}
            <p className="complete-message">
              {operationType === 'character'
                ? 'Your character is ready!'
                : 'Your world is ready!'}
            </p>
            <div className="complete-dots">
              <span>&bull;</span>
              <span>&bull;</span>
              <span>&bull;</span>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="loading-status">
            <div className="loading-status-row">
              <span className="loading-spinner-dot" />
              <span className="loading-status-text">
                {operationType === 'character'
                  ? 'Drawing your character…'
                  : operationType === 'game'
                  ? 'Building your game…'
                  : 'Building your world…'}
                {' '}Hang tight — keep going while we finish!
              </span>
            </div>
            {!learning.enabled && (
              <>
                <p className="loading-status-sub">More mini-games coming up while you wait:</p>
                <div className="game-progress" aria-hidden="true">
                  {['numbers', 'memory', 'pattern'].map((g) => (
                    <span
                      key={g}
                      className={`game-progress-pill ${gameType === g ? 'active' : ''}`}
                    >
                      {g === 'numbers' ? 'Numbers' : g === 'memory' ? 'Memory' : 'Pattern'}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LEARNING MODE: one real adaptive question (no emojis)
// ============================================================================
function LearningQuestion({ age, goal, operationType }) {
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null);
  const levelRef = useRef(1);
  const alive = useRef(true);

  async function load() {
    setLoading(true);
    setPicked(null);
    const quizType = goalToQuizType(goal);
    try {
      const r = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age, level: levelRef.current, gameType: operationType || "creation", quizType }),
      });
      const data = await r.json();
      if (!alive.current) return;
      if (data && Array.isArray(data.choices) && typeof data.correctIndex === "number") setQ(data);
      else setQ(null);
    } catch {
      if (alive.current) setQ(null);
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
      levelRef.current = Math.min(10, levelRef.current + 1);
      recordAnswer({ subject, correct: true }); // no-op unless Learning Mode on
      setTimeout(() => { if (alive.current) load(); }, 900); // next question while still waiting
    } else {
      levelRef.current = Math.max(1, levelRef.current - 1);
      recordAnswer({ subject, correct: false }); // no-op unless Learning Mode on
      setTimeout(() => { if (alive.current) setPicked(null); }, 900); // let them retry
    }
  }

  return (
    <div className="game-content">
      <h3>Quick question</h3>
      {loading || !q ? (
        <p className="game-instruction">Getting a question ready…</p>
      ) : (
        <>
          <p className="game-instruction" style={{ fontSize: 17, color: "#fff", fontWeight: 700 }}>
            {questionText(q)}
          </p>
          <div className="numbers-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 360 }}>
            {q.choices.map((c, i) => {
              const isCorrect = picked != null && i === q.correctIndex;
              const isWrong = picked === i && i !== q.correctIndex;
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={picked === q.correctIndex}
                  className={`number-button ${isCorrect ? 'next' : ''} ${isWrong ? 'done' : ''}`}
                  style={{ aspectRatio: "auto", padding: "14px 10px", fontSize: 18 }}
                >
                  {String(c)}
                </button>
              );
            })}
          </div>
          {picked != null && picked !== q.correctIndex && (
            <p className="game-instruction">Not quite — try again!</p>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// GAME 1: TAP THE NUMBERS
// ============================================================================
function TapNumbersGame({ setScore }) {
  const [numbers] = useState(
    Array.from({ length: 10 }, (_, i) => i + 1)
      .sort(() => Math.random() - 0.5)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, updateScore] = useState(0);

  const handleNumberClick = (number) => {
    if (number === currentIndex + 1) {
      const newScore = score + 1;
      updateScore(newScore);
      setScore(newScore);
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <div className="game-content">
      <h3>Tap the Numbers</h3>
      <p className="game-instruction">Tap numbers 1-{currentIndex + 1} in order!</p>

      <div className="numbers-grid">
        {numbers.map((num) => (
          <button
            key={num}
            onClick={() => handleNumberClick(num)}
            disabled={num <= currentIndex}
            className={`number-button ${num === currentIndex + 1 ? 'next' : ''} ${
              num <= currentIndex ? 'done' : ''
            }`}
          >
            {num}
          </button>
        ))}
      </div>

      <div className="game-score">Score: {score}/10</div>
    </div>
  );
}

// ============================================================================
// GAME 2: MEMORY MATCH (letter tiles — no emojis)
// ============================================================================
function MemoryMatchGame({ setScore }) {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [score, updateScore] = useState(0);

  useEffect(() => {
    // Initialize cards using letters (no emojis).
    const symbols = ['A', 'B', 'C', 'D', 'E', 'F'];
    const gameCards = [...symbols, ...symbols]
      .sort(() => Math.random() - 0.5)
      .map((symbol, i) => ({ id: i, symbol }));
    setCards(gameCards);
  }, []);

  const handleCardClick = (id) => {
    if (flipped.includes(id) || matched.includes(id)) return;

    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      const [first, second] = newFlipped;
      if (cards[first]?.symbol === cards[second]?.symbol) {
        setMatched([...matched, first, second]);
        const newScore = score + 1;
        updateScore(newScore);
        setScore(newScore);
      }
      setTimeout(() => setFlipped([]), 1000);
    }
  };

  return (
    <div className="game-content">
      <h3>Memory Match</h3>
      <p className="game-instruction">Find matching pairs!</p>

      <div className="memory-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card.id)}
            disabled={matched.includes(card.id)}
            className={`memory-card ${
              flipped.includes(card.id) || matched.includes(card.id) ? 'flipped' : ''
            }`}
          >
            {flipped.includes(card.id) || matched.includes(card.id) ? card.symbol : '?'}
          </button>
        ))}
      </div>

      <div className="game-score">
        Pairs Found: {score}/{cards.length / 2}
      </div>
    </div>
  );
}

// ============================================================================
// GAME 3: PATTERN RECOGNIZER (colored CSS tiles — no emojis)
// ============================================================================
const PATTERN_COLORS = ['#7a5cfc', '#ff6b6b', '#00c48c', '#ffd166'];

function PatternGame({ setScore }) {
  const [pattern, setPattern] = useState([]);
  const [playerPattern, setPlayerPattern] = useState([]);
  const [score, updateScore] = useState(0);
  const [message, setMessage] = useState('Watch the pattern...');

  useEffect(() => {
    // Start game with initial pattern
    const initialPattern = [Math.floor(Math.random() * 4)];
    setPattern(initialPattern);
    playPattern(initialPattern);
  }, []);

  const playPattern = async (pat) => {
    setPlayerPattern([]);
    setMessage('Watch...');
    await new Promise((resolve) => setTimeout(resolve, 500));

    for (const shape of pat) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      highlightShape(shape);
    }
    setMessage('Your turn!');
  };

  const highlightShape = (index) => {
    const element = document.getElementById(`shape-${index}`);
    if (element) {
      element.classList.add('active');
      setTimeout(() => element.classList.remove('active'), 300);
    }
  };

  const handleShapeClick = async (index) => {
    const newPlayerPattern = [...playerPattern, index];
    setPlayerPattern(newPlayerPattern);

    highlightShape(index);

    if (newPlayerPattern[newPlayerPattern.length - 1] !== pattern[newPlayerPattern.length - 1]) {
      setMessage('Try again!');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      playPattern(pattern);
      return;
    }

    if (newPlayerPattern.length === pattern.length) {
      const newScore = score + 1;
      updateScore(newScore);
      setScore(newScore);
      setMessage(`Level ${newScore}! Get ready...`);

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newPattern = [...pattern, Math.floor(Math.random() * 4)];
      setPattern(newPattern);
      playPattern(newPattern);
    }
  };

  return (
    <div className="game-content">
      <h3>Pattern Master</h3>
      <p className="game-instruction">{message}</p>

      <div className="pattern-grid">
        {PATTERN_COLORS.map((color, i) => (
          <button
            key={i}
            id={`shape-${i}`}
            onClick={() => handleShapeClick(i)}
            className="pattern-shape"
            style={{ background: color }}
            aria-label={`tile ${i + 1}`}
          />
        ))}
      </div>

      <div className="game-score">Level: {score}</div>
    </div>
  );
}
