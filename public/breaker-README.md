## World backgrounds, points, HUD & reward polish (2026-07-03)
Four kid-facing fixes:
- **Points always readable.** The "+points" pop text now draws white with a dark outline (shared
  `buildable-mechanics.js` `drawPops`), so it never blends into a same-colored brick or the sky.
- **HUD/nav never covers bricks on phones.** New `topBand()` reserves extra room at the top on real
  devices (150px in the app shell, 104px standalone) so bricks start below the score chips AND the
  Home/Sound/Menu/Help buttons. Headless QA keeps the 900x600 reference so the always-winnable sim is
  unchanged.
- **World backgrounds are back.** Every backdrop now uses a real painted `chess-art` world (the default
  "meadow" id now shows the Jungle scene); a gentle top-weighted darkening scrim guarantees the bricks,
  paddle and ball pop on any world — even bright candy.
- **Falling rewards are exciting.** Power-ups drop as glowing, pulsing gems with a white star emblem,
  rotating twinkle spikes, a side-to-side wobble, a sparkle trail, and a bigger catch burst.


## Shared top bar (2026-07-03)
Breaker now uses the shell's shared nav bridge (`buildable-gamenav.js`): the app draws ONE consistent
set of controls (Home top-left; Sound/Menu/Help top-right) and the engine's own floating buttons are
hidden in-app, so nothing overlaps. The HUD info chips (`buildable-hud.js`) inset away from those corners
when running in the app (`.hud-inshell`) and use compact forms on phones (level name + a single
"bricks · ♥N" chip) so the bar never overflows on a narrow screen. Standalone (opened directly) still
shows the engine's own buttons.
