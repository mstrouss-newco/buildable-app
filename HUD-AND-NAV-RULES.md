# HUD & In-Game Navigation Rules

One consistent contract for every Buildable game, so the app's navigation and a
game's own HUD/buttons never fight for the same corner. Follow this for every new
game and when touching an existing one.

## The reserved top strip (who owns the corners)

When a game runs inside the app (an iframe in the React shell, `GameFrame`), the
**shell owns the top strip**:

- **Top-left corner → Home.** The shell always draws the Home button (`top:14, left:14`).
  A game must never draw its own Home/back button there in-app.
- **Top-right corner → Sound / Menu / Help.** The shell draws this cluster
  (`right:14`, stacked at `top:14 / 58 / 102`) when the game opts into the shared
  nav bridge (below). A game must never draw its own sound/menu/help buttons there
  in-app.

Everything the shell draws sits at `z-index:3`. Keep gameplay HUD and buttons out
of the top ~52px on the left and right edges so nothing lands under the shell nav.

## Rule 1 — Route every game's nav through the shared bridge

Games do **not** invent their own in-app nav. They keep their own buttons (for when
the page is opened directly / standalone) but register them with the shared bridge,
which **hides them in-app** and lets the shell's single, consistent set drive them.

```html
<script src="buildable-gamenav.js"></script>
```
```js
BuildableGameNav.register({
  hide:   ["muteBtn","helpBtn","backBtn"], // this engine's own button ids — hidden in-app
  onSound: () => toggleMute(),             // shell Sound tapped
  onMenu:  () => showMenu(),               // shell Menu tapped (back to the level picker)
  onHelp:  () => openHelp(),               // shell Help tapped
  soundOn: () => !muted,                   // current sound state (for the icon)
  // inGame: () => state === "play",       // optional; omit to always show Menu
});
```

Standalone (opened directly, not in the app), the bridge does nothing and the
game's own buttons keep working — so every engine is still usable on its own.

Adopted by: breaker, tetris, castle-guard, croc (croctot), the board games
(connect four / dots & boxes / tic-tac-toe, via `buildable-boardgame.js`), and —
added in this pass — runner, survival, tank, bubble. Bingo / memory / snakes have
no own nav buttons and rely on the shell Home only.

Exception: a game that has its OWN essential top-right *game* controls (not nav) —
e.g. Mahjong's Recall / Hint / Mix — does NOT adopt the shell's Sound/Menu/Help
cluster, because it would land on top of those controls. It keeps its own compact
controls (which already sit clear of the top-left Home) instead.

## Rule 2 — Use the shared HUD, which auto-clears the nav

**Session 3C decision — there is ONE HUD.** `buildable-hud.js` is the single, shell-
owned HUD system for every converted game. The competing idea of a per-game HUD
stylesheet ("game-hud.css") is retired: converted games do not ship their own HUD
CSS or paint a canvas HUD. The one HUD is tinted per game by the manifest's
signature `color` via `BuildableHUD.setAccent(color)` (the engine calls it when the
manifest loads), so the info bar matches each game with zero per-game styling.
Breaker runs on this one HUD with no HUD code of its own.


The score/lives bar comes from `buildable-hud.js`. It insets itself in-app
(`.hud-inshell → left:96px; right:64px`) so the chips never sit under the shell's
Home (left) or Sound/Menu/Help (right). If a game paints its HUD straight onto the
canvas instead, it must keep the same clearance: start the left group after ~96px
and end the right group before ~64px from the edges, and keep it inside the top ~52px
band only if that band is clear of the shell nav. Games that paint a canvas HUD and
can't easily move to the shared HUD (survival, runner) add an in-app-only inset:
shift the top-left title right ~90px and the top-right chips left ~55px when
`window.parent !== window`, so standalone layout is unchanged.

## Rule 3 — Win / "You win" prompts are floating cards, never a screen dim

Use `buildable-wincard.js` — one small floating card, no full-screen shade:

```js
BuildableWin.card(ctx, W, H, [
  { t:"You Win!",          s:34, w:800, c:"#ffffff" },
  { t:"Tap to play again", s:18, w:600, c:"#cfd3ff" },
]);
```

DOM-overlay games (the board games, bubble) do the same by making the full-screen
`#banner`/`#overlay` background transparent and letting the inner `.card` float.
Never dim the whole play area behind the win message — a partial shade reads as a bug.

## Rule 4 — No decorative "stars" for beating a level

Beating a level shows a floating card and (optionally) a "Cleared" note on the level
map — not a 1–3 star rating. Star ratings that don't unlock or persist anything were
removed platform-wide (level cards, win screens, "Stars: X of Y" subtitles). The one
place stars remain functional is Typing, where they actually unlock heroes.
