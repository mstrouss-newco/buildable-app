
## Shared top bar (2026-07-03)
Breaker now uses the shell's shared nav bridge (`buildable-gamenav.js`): the app draws ONE consistent
set of controls (Home top-left; Sound/Menu/Help top-right) and the engine's own floating buttons are
hidden in-app, so nothing overlaps. The HUD info chips (`buildable-hud.js`) inset away from those corners
when running in the app (`.hud-inshell`) and use compact forms on phones (level name + a single
"bricks · ♥N" chip) so the bar never overflows on a narrow screen. Standalone (opened directly) still
shows the engine's own buttons.
