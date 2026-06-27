# Sunny Town Drive — 3D runner engine

A cute **3-lane "drive through town, dodge stuff, collect treats"** runner for young kids
(ages 4–8), inspired by car-runner games like *LEGO Friends: Heartlake Rush* — built as an
original (no licensed art). It's **true 3D** (Three.js, blocky LEGO-style): the camera sits
behind the car and the road runs off into the distance. Hand-authored **Track B** engine:
one static page, launched full-screen in an iframe.

## How the 3D works (and why QA still passes)

The **gameplay logic is unchanged** from the 2D version — it stays a pure track-position
model (a `lane` plus a position `p` in the same 0..H units). The 3D layer only changes
*drawing*: it maps `p` → world Z and `lane` → world X. So the always-winnable guarantee and
the headless robot tester need no WebGL and keep working. Rendering = a WebGL scene canvas
(`#c`) for the world + a 2D HUD canvas (`#hud`) on top for hearts/town/progress/banners; the
shared start screen sits over both. Three.js (r128) loads from a CDN; all 3D setup is guarded
by `window.THREE` so the engine also loads cleanly in the Node QA sandbox.

- **File:** `public/runner-engine.html`
- **Route:** `/runner-engine.html` (added in `vercel.json` before the catch-all)
- **In app:** "Sunny Town Drive" tile in the Games picker (`src/BuildableKids.jsx` →
  `SunnyTownScreen`) and a row in `public/games-library.html`
- **QA:** `qa-runner.mjs`

## How it plays

You drive a car at the bottom of a 3-lane road. The road scrolls toward you. **Tap a side
of the screen, swipe, or use the arrow keys** to hop between lanes. Dodge the cones,
puddles, other cars and hay bales; grab coins, ice cream, flowers and gifts. Reach the end
of the town to win. Three hearts — lose one each time you bump something. Finish a town
without a scratch to earn all 3 stars.

Six towns, getting faster and busier: Maple Street → Market Square → Sunny Beach Road →
Petal Park → Downtown Dash → Rainbow Bridge.

## How it's built (the playbook)

- **Data-driven.** Each town is a recipe in `GAME_CONFIG.levels` (`dist`, `speed`,
  `density` = how often a 2nd lane is blocked, `treat` = how often a treat drops). Adding
  or tuning a town is editing data — never engine code.
- **Always-winnable.** Every obstacle row leaves **at least one open lane** (it never
  blocks all three), and rows are spaced (`ROW_GAP`) so only one row is ever inside the
  car's danger band. A perfect driver can always weave through untouched.
- **Shared engine libs.** `BR` draws the car/obstacles/treats (pure canvas — no images, so
  a missing asset can never break a kid's game), `BA` plays sound, `BM` adds the crash
  shake/flash and treat sparkles, `BS` renders the one shared start screen / level picker.
- **QA-simmed.** `window.BUILDABLE_GAME` (alias `RUNNER_GAME`) exposes `sim(level)` and
  `campaign()`; a headless perfect-driver bot must clear every town with 0 hits / 3 stars.
  Run it: `node qa-runner.mjs .`

## Tuning cheatsheet

- Easier: lower a town's `speed` or `density`, raise `GAME_CONFIG.hearts`.
- Longer/shorter runs: change `dist`.
- New town: copy a level row in `GAME_CONFIG.levels` and tweak the numbers, then re-run QA.

## Deferred follow-ups

Bespoke ElevenLabs sounds + generated Sunny Town cast/pets art in the shared asset library;
car customizing, missions/unlocks, and a driver picker. v1 is dodge + collect only.
