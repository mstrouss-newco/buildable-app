# Tumble Blocks — instructions

A **gentle, kid-friendly falling-blocks puzzle** (think Tetris, tuned way down for ages
4–8). Soft shapes drift down; the child turns and slides them to fill a row, and the row
**tumbles away** with a happy sparkle. There is **no harsh game-over** — you can never
lose. If the stack ever reaches the top, the world's helper character gently sweeps a
couple of rows away and play keeps going.

It's a Track B hand-authored **engine** for the Games section, alongside Survival,
Platformer, Croc Tot, Breaker, and Tennis. Like those, the game is a fixed engine plus a
data-driven **recipe** (`GAME_CONFIG`) — you tune numbers and worlds, you never rewrite
the game. It renders blocks via **BR**, juice (line-clear pop / shake / flash) via **BM**,
sounds via **BA** (bespoke ElevenLabs one-shots), and its start screen / world picker via
**BS** — the four shared engine libraries (`BUILDING-A-GAME.md`).

## Two ways to play
- **Adventure** — a row of **worlds**, each its own character, soft color palette,
  background, gentle drop speed, ambience, and a row goal. Clear the goal (e.g. 8 rows in
  Sunny Meadow) to **win the world**; the next world unlocks. Speed ramps a little within
  a world and steps up world to world.
- **Calm** — an endless, extra-slow mode. No goal, no losing — just stack and clear for
  fun. (Always available as the first card.)

## Kid tuning (the always-winnable rule for a falling-block game)
- **Slow drop** + a small per-row ramp; Calm mode is slower still.
- **Generous preview** of the next 3 pieces, plus a **ghost** outline showing exactly
  where the current piece will land.
- **Forgiving lock delay** — a piece rests ~0.6s before locking and the timer resets when
  the child nudges or turns it, so there's always time to place it.
- **7-bag randomizer** so pieces are fair (no long droughts).
- **Never-lose rescue** — a top-out triggers the world helper's gentle row-sweep
  (`gentleReset`), themed per world, instead of a game-over.

## Controls (touch-first for iPad, also mouse + keyboard)
- **Big on-screen buttons:** ◀ move, ⟳ turn, ▶ move, ⬇ drop (left/right auto-repeat when
  held — easiest for small hands).
- **Gestures on the board:** drag left/right to slide, a quick **tap** to turn, a fast
  **swipe down** to drop.
- **Keyboard:** arrows to move, Up to turn, Down to soft-drop, Space to drop.

## Content as data (`GAME_CONFIG`)
`cols`/`rows`, `preview`, `lockDelayMs`, `endlessFall`, and a `worlds[]` array. Each world:
`{ name, hero, fall (ms/step — bigger = slower), goalRows, ambience (shared sound loop),
bg:[top,bottom], accent, helper, palette:[7 soft colors] }`. Adding a world = adding a
data entry; the 7 tetrominoes recolor to each world's palette. Theming is a fixed kid
palette for v1, structured so per-kid customization can drop in later (the BS
**Make it mine** hook is already wired as a stub).

## Sound (bespoke, registered)
New ElevenLabs one-shots registered in `api/sfx.js` + `DURATIONS`: `tumble_move`,
`tumble_rotate`, `tumble_lock`, `tumble_clear`, `tumble_combo`, `tumble_levelup`,
`tumble_win`, `tumble_reset`. Each world also loops a calm **ambience** reused from the
shared sound library (forest / candy / waves / wind / space / fire) via `BA.setMusic`.
The `BA` synth stays a silent fallback only.

## QA (`qa-tetris.mjs`, modeled on `qa-breaker.mjs`)
Exposes `window.BUILDABLE_GAME` (alias `TUMBLE_GAME`) with `sim(world, maxFrames)`,
`simEndless`, `campaign`, and render hooks. A headless **El-Tetris** bot clears every
world's goal (proving Adventure is always completable), Calm mode survives a long run
without erroring (proving never-lose), and the render smoke test passes. Run:
`node qa-tetris.mjs .`

## Wiring
- Route: `public/tetris-engine.html` added to `vercel.json` before the landing catch-all.
- Tile + screen: **Tumble Blocks** tile in the Games picker → `TetrisScreen` (full-screen
  iframe), in `src/BuildableKids.jsx`.
