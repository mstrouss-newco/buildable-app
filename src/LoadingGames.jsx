// src/LoadingGames.jsx
// Shown during the render wait for a character/level/game.
//
// DEFAULT behavior (Learning Mode OFF) is unchanged: rotating mini-games
// (numbers / memory / pattern) that auto-dismiss when the real render finishes.
//
// When Learning Mode is ON (store.getLearningSettings().enabled), the slot
// shows a QuickGame round instead (Session QZ1: a short GAME, not a
// multiple-choice question — and no /api/generate-quiz call, so a wait costs
// nothing). Rounds repeat until the real render completes and dismisses it.
//
// No emojis anywhere — shapes/marks are inline SVG or CSS.
import { useState, useEffect, useRef } from 'react';
import "./loading-games.css";
import { getLearningSettings } from "./store";
import QuickGame from "./QuickGame";

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


export default function LoadingGames({ isLoading, onComplete, operationType = 'character', age, gameData }) {
  const [gameType, setGameType] = useState('numbers');
  const [gameState, setGameState] = useState('playing');
  const [score, setScore] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Read learning settings once at mount so behavior is stable for this wait.
  const learning = getLearningSettings();
  const learnAge = (gameData && (gameData.age || gameData.character?.age)) || age || learning.age || 7;

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
// LEARNING MODE: one short game while the render finishes (Session QZ1)
// ============================================================================
// Was: a generated multiple-choice question per wait, one /api/generate-quiz
// call each time. Now: a QuickGame round (spell it / make the number / what
// comes next), inline and repeating, built from hand-written banks so a wait
// never costs an API call and never blocks on the network.
function LearningQuestion({ age, goal, operationType }) {
  return (
    <div className="game-content">
      <QuickGame
        age={age}
        goal={goal}
        gameType={operationType || "loading"}
        title="While you wait"
        inline
        repeat
      />
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
