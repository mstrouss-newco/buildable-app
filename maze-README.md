# Maze Munchers — original maze-chase engine (`public/maze-engine.html`)

An **original** kid-friendly maze chase (NOT Pac-Man — own name, own art, own mazes).
Guide a friendly muncher around a maze, gobble every treat, dodge the friendly chasers;
grab a corner **power treat** to briefly turn the tables and chase them; clear the maze
to win the world. A hand-authored **Track B** real-time engine (see `BUILDING-A-GAME.md`),
in the same family as survival / croc / breaker.

## How it plays
- 6 themed **worlds** (Candy Cove, Coral Reef, Star Station, Whisper Wood, Dino Jungle,
  Frost Village) — each its own palette, hero/critter look, chaser cast, and ambient
  particles, with difficulty ramping up (more chasers, faster + smarter, shorter power).
- **Always-winnable / kid tuning:** the hero is ALWAYS faster than every chaser; mazes are
  generated fully-connected so every treat is reachable; power treats are long & generous
  (~8.5–11s). A soft "caught" costs a heart and resets positions; running out of hearts
  gently restarts the world (treats back). **There is never a harsh game-over.**
- **Controls:** arrow keys / WASD on desktop, **swipe** anywhere on touch, plus an
  on-screen **d-pad**. Audio unlocks on the first tap (iPad rule).

## Built on the shared libraries
- `BR` (`buildable-renders.js`) — hero/critter, chasers (`BR.enemy`), maze walls, treats,
  hearts. No emoji.
- `BM` (`buildable-mechanics.js`) — chomp/eat bursts, power pop, caught shake+flash, win
  confetti.
- `BA` (`buildable-audio.js`) — bespoke ElevenLabs one-shots created for this engine and
  registered in `api/sfx.js`: `maze_chomp`, `maze_power`, `maze_eat`, `maze_win`,
  `maze_caught`, `maze_start` (synth is the silent fallback only).
- `BS` (`buildable-startscreen.js`) — the shared start screen + world picker (stars + lock
  progression). Single-player for v1 (same-device co-op is a future maybe).

## Content as data
Everything tunable lives in `GAME_CONFIG.levels[]` in the HTML: maze size (`cols`/`rows`),
`braid` (how many loops), `chasers`, chaser `speed` + `smart`, `power` duration, and the
world's colors/hero/particles. Adding a world = adding a data entry. Mazes are generated
with a seeded recursive-backtracker + braiding, so they're always fully connected.

## QA
`node qa-maze.mjs .` drives the headless hook `window.MAZE_GAME` (alias
`window.BUILDABLE_GAME`): a perfect-player BFS bot (arrival-time evasion, since the hero is
~1.9× faster) must clear **every** maze, a full 6-world campaign runs, plus a render
smoke-test. All green.

## Wiring
- Route: `public/maze-engine.html` (+ `/maze`) added to `vercel.json` **before** the
  landing-page catch-all.
- Launch: **Maze Munchers** tile in the Games picker → `MazeScreen` iframe in
  `src/BuildableKids.jsx`.

## TODO (next)
- Bespoke per-world background music: DONE — `api/maze-music.js` (ElevenLabs, like `breaker-music.js`), one track per world, auto-generates + caches on first play; engine switches per world + follows the sound toggle.
- Save/share/publish a cleared run (CREATIONS rule) + the shared `GameFrame` nav wrapper.
