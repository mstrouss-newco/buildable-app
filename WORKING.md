# WORKING.md — multi-session coordination

Multiple Claude sessions edit this repo at the same time (e.g. games-engine work in
one session, portal/UI in another). **Read this before making changes** so we don't
overwrite each other. Git merges the code; this file carries the *intent*.

## Rules
1. **Work on a branch, not `main`.** Name it `claude/<area>` (e.g. `claude/games`,
   `claude/portal`). Hand the branch to Mike to merge — don't push straight to `main`
   for feature work.
2. **Check "In flight" below before you start.** If someone owns the files you need,
   coordinate or take a different slice.
3. **Add yourself to "In flight"** when you start; clear it when done.
4. **`main` = what Mike approved.** When two sessions disagree, the "Intended product
   state" below wins. If a thing isn't listed, ask Mike — don't just flip it.

## Intended product state (source of truth — keep in sync with Mike)
Home tiles:
- **Make a game** (AI game builder, `onMakeGame`→SCREEN_INTRO) — **COMING SOON (disabled)** as of 2026-06-27 (Mike). MakeTile has a `soon` flag; remove it to re-enable. Do not re-enable without Mike.
- **Music** — LIVE (Ready)
- **Games** — LIVE, **Beta** tag. Opens a pick-a-game screen: Platformer (`/play.html`)
  + Survival (`/survival-engine.html`) + Breaker + Sunny Town + Tennis + Chess + Typing
  + Sound Machine + **Memory Match (`/memory-engine.html`)** + **Bingo (`/bingo-engine.html`)**
  + **Snakes & Ladders (`/snakes-engine.html`)** — all playable. The old AI-generated game flow
  is retired — do not route Games back to SCREEN_INTRO.
  + Survival (`/survival-engine.html`) + Maze Munchers (`/maze-engine.html`, an
  original maze chase — gobble treats, dodge friendly chasers, grab a power treat),
  all playable. The old AI-generated game flow is retired — do not route Games back to
  SCREEN_INTRO.
- **Stories** — COMING SOON (disabled). **Do not re-enable without Mike.**
- **Typing** — LIVE (New)
- **Chess** — LIVE
- **Family Town** — original 3-4 player board game; on branch `claude/games-family-town` (pass-and-play + bot + cross-device). Merge to go LIVE.
- **Top Creations** — leave as-is unless told (owned by another session).

Global / app-wide:
- **Grown-ups + Learning controls** live in the TOP NAV as ONE gated `GrownUpButton` (math-gate → popover with Learning On/Off + Open grown-ups area). NOT floating. The old floating `GrownUpFab` + `LearningControl` pills are removed. (branch `claude/topnav-grownup`)
- **Learning On/Off** is inside the top-nav Grown-ups button popover (parent-gated, drives `getLearningSettings`/`setLearningSettings`).
- **No emoji anywhere** — use SVG / the art library.
- Dark brand styling (gradient `buildablekids.` wordmark, Fredoka), no emoji.

## In flight (claim your area here)
- **claude/games-castle-guard** — NEW **Castle Guard** kid tower-defense Track B engine.
  Owns NEW files: `public/castle-guard.html`, `qa-castleguard.mjs`,
  `public/game-assets/tiny-swords/*` (curated Pixel Frog sprites + LICENSE.txt),
  `db/seed-castleguard-assets.sql`, `db/seed-castleguard-mechanic.sql`. Touches shared
  files additively: `vercel.json` (castle-guard + /game-assets routes), `api/sfx.js`
  (`cg_*` one-shots), `api/images.js` (kind=game `castleguard` art), `src/BuildableKids.jsx`
  (Games tile + `SCREEN_CASTLE` — high-collision file, edits kept tiny). v1: ONE defender
  (Archer), hearts/never-game-over, Green Meadow. Branch NOT pushed to main — hand to Mike.
- **claude/games-sling-squad** — NEW **Sling Squad** Track B engine (an ORIGINAL kid-friendly
  slingshot/physics launcher; our own characters/art/name, NOT Angry Birds). Owns NEW files only:
  `public/sling-squad.html`, `public/matter.min.js` (vendored MIT physics lib), `qa-sling.mjs`,
  `db/seed-sling-launch-mechanic.sql`. Touches shared files ADDITIVELY: `vercel.json` (adds
  `/sling-squad.html`, `/sling`, `/matter.min.js` routes), `api/sfx.js` (adds `sling_*` one-shots),
  `src/BuildableKids.jsx` (adds a Games-picker Sling Squad tile + `SCREEN_SLING` — high-collision
  file, edits kept tiny & isolated), `MECHANICS.md`. First repo use of a physics library
  (Matter.js, confirmed with Mike). Built + QA-green; branch handed to Mike to merge (not pushed to `main`).
- **claude/topnav-grownup** (MERGED to main — LIVE, verified) — moved the floating **Grown-ups**
  (`GrownUpFab`) + **Learning On/Off** (`LearningControl`) controls OUT of their bottom-left
  floating position INTO the top nav as ONE shared, gated nav button, consistently
  site-wide. Touches the high-collision `src/BuildableKids.jsx` (FAB defs ~84/232, the
  global render line ~603, and `TopNav` ~609). Plan being confirmed with Mike; lands on a
  branch. **If you edit BuildableKids.jsx top-bar / FAB area, coordinate.**
- **claude/games-family-town** — Family Town board game (MERGED): `public/family-town.html`, `src/FamilyTown.jsx`, `src/lib/townMatches.js`, `db/create-town-matches.sql`, `api/sfx.js` (town_* sounds), `api/images.js` (kind=town art), + a tile/route in `vercel.json` + `src/BuildableKids.jsx`.
- (none right now)  
  _Done on branch `claude/games-simple-batch2` (await Mike merge): Memory + Bingo + Snakes &
  Ladders engines, the shared `buildable-turns.js` (BT) turn shell, BS `p2/p3/p4` modes,
  bespoke sounds in `api/sfx.js` + `api/say.js` caller voice, vercel routes + BuildableKids tiles._
- **claude/games-checkers** — NEW kid-friendly Checkers (turn-based, Pattern A, the chess
  model). Owns NEW files only: `public/buildable-checkers.html`,
  `db/create-checkers-matches.sql`, `src/lib/checkersMatches.js`, `src/FamilyCheckers.jsx`,
  `qa-checkers.mjs`. Touches shared files additively: `vercel.json` (adds a checkers route),
  `api/sfx.js` (adds `checkers_*` one-shots), `src/BuildableKids.jsx` (adds a Games-picker
  Checkers tile + `SCREEN_CHECKERS`/`SCREEN_CHECKERS_FAMILY` — high-collision file, edits
  kept tiny & isolated). Does NOT touch the chess files.
- `claude/games-maze-chase` — NEW **Maze Munchers** Track B engine (`public/maze-engine.html`,
  `qa-maze.mjs`, `api/sfx.js` maze_* sounds, `vercel.json` route, Games tile). Built + QA-green;
  branch handed to Mike to merge (not pushed to `main`).

## Suggested ownership (to avoid collisions)
- Games engines + `public/*.html` + `vercel.json` routes
- Portal / kid Home UI (`src/GrownUpScreen.jsx`, `HomeScreen` in `src/BuildableKids.jsx`)
- Stories / Music / Typing makers
**`src/BuildableKids.jsx` is the highest-collision file — coordinate edits to it.**
