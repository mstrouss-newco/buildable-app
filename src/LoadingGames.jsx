// src/LoadingGames.jsx
// Mini-games that play while character/level renders
// Auto-dismisses when render completes
import { useState, useEffect } from 'react';
import "./loading-games.css";

export default function LoadingGames({ isLoading, onComplete, operationType = 'character' }) {
  const [gameType, setGameType] = useState('numbers');
  const [gameState, setGameState] = useState('playing');
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!isLoading && gameState === 'playing') {
      // Render complete - show result
      setGameState('complete');
      setTimeout(() => {
        onComplete?.();
      }, 1500); // Show result for 1.5s then close
    }
  }, [isLoading]);

  if (!isLoading && gameState !== 'complete') {
    return null;
  }

  return (
    <div className="loading-games-overlay">
      <div className="loading-games-container">
        {gameState === 'playing' && (
          <>
            {gameType === 'numbers' && <TapNumbersGame setScore={setScore} />}
            {gameType === 'memory' && <MemoryMatchGame setScore={setScore} />}
            {gameType === 'pattern' && <PatternGame setScore={setScore} />}
          </>
        )}

        {gameState === 'complete' && (
          <div className="game-complete">
            <div className="complete-emoji">🎉</div>
            <h2>Great Job!</h2>
            <p className="complete-score">Your Score: <strong>{score}</strong></p>
            <p className="complete-message">
              {operationType === 'character'
                ? '✨ Your character is ready!'
                : '🗺️ Your world is ready!'}
            </p>
            <div className="complete-dots">
              <span>●</span>
              <span>●</span>
              <span>●</span>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="game-tabs">
            <button
              onClick={() => setGameType('numbers')}
              className={`game-tab ${gameType === 'numbers' ? 'active' : ''}`}
            >
              Numbers
            </button>
            <button
              onClick={() => setGameType('memory')}
              className={`game-tab ${gameType === 'memory' ? 'active' : ''}`}
            >
              Memory
            </button>
            <button
              onClick={() => setGameType('pattern')}
              className={`game-tab ${gameType === 'pattern' ? 'active' : ''}`}
            >
              Pattern
            </button>
          </div>
        )}
      </div>
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
      <h3>🔢 Tap the Numbers</h3>
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
// GAME 2: MEMORY MATCH
// ============================================================================
function MemoryMatchGame({ setScore }) {
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [score, updateScore] = useState(0);

  useEffect(() => {
    // Initialize cards
    const symbols = ['🌟', '🎨', '🎵', '🎭', '🎪', '🎯'];
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
      <h3>🃏 Memory Match</h3>
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
// GAME 3: PATTERN RECOGNIZER
// ============================================================================
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
      setMessage('❌ Try again!');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      playPattern(pattern);
      return;
    }

    if (newPlayerPattern.length === pattern.length) {
      const newScore = score + 1;
      updateScore(newScore);
      setScore(newScore);
      setMessage(`✅ Level ${newScore}! Get ready...`);

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newPattern = [...pattern, Math.floor(Math.random() * 4)];
      setPattern(newPattern);
      playPattern(newPattern);
    }
  };

  const shapes = ['🔷', '🔶', '🟦', '🟪'];

  return (
    <div className="game-content">
      <h3>🔷 Pattern Master</h3>
      <p className="game-instruction">{message}</p>

      <div className="pattern-grid">
        {shapes.map((shape, i) => (
          <button
            key={i}
            id={`shape-${i}`}
            onClick={() => handleShapeClick(i)}
            className="pattern-shape"
          >
            {shape}
          </button>
        ))}
      </div>

      <div className="game-score">Level: {score}</div>
    </div>
  );
}
