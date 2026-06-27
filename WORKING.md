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
- **Music** — LIVE (Ready)
- **Games** — LIVE, **Beta** tag. Opens a pick-a-game screen: Platformer (`/play.html`)
  + Survival (`/survival-engine.html`), both playable. The old AI-generated game flow
  is retired — do not route Games back to SCREEN_INTRO.
- **Stories** — COMING SOON (disabled). **Do not re-enable without Mike.**
- **Typing** — LIVE (New)
- **Chess** — LIVE
- **Top Creations** — leave as-is unless told (owned by another session).

Global / app-wide:
- **Grown-ups button** on every page (`GrownUpFab` in `src/BuildableKids.jsx`) — keep.
- **Learning On/Off pill** on every page (`LearningControl`), parent-gated by a math
  check, drives `getLearningSettings`/`setLearningSettings` — keep.
- **No emoji anywhere** — use SVG / the art library.
- Dark brand styling (gradient `buildablekids.` wordmark, Fredoka), no emoji.

## In flight (claim your area here)
- (none right now)

## Suggested ownership (to avoid collisions)
- Games engines + `public/*.html` + `vercel.json` routes
- Portal / kid Home UI (`src/GrownUpScreen.jsx`, `HomeScreen` in `src/BuildableKids.jsx`)
- Stories / Music / Typing makers
**`src/BuildableKids.jsx` is the highest-collision file — coordinate edits to it.**
