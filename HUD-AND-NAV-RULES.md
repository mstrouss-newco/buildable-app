# HUD & In-Game Navigation Rules

One consistent contract for every Buildable game, so the app's navigation and a
game's own HUD/buttons never fight for the same corner. Follow this for every new
game and when touching an existing one.

## Rule 0 — Deciding shows the bar, doing never does (GN1, GN2)

Every screen in the app is either a **deciding** screen or a **doing** screen, and
that alone decides whether the five-tab bottom bar (`BottomBar`, `data-nv1-bottom-bar`)
is on it.

- **Deciding** = the kid is still choosing what to do: Home, Play, Make, Explore, Me,
  the game front door (`GameLanding` — Solo / Same device / Play a friend), the lobby's
  mode select, its friends list and its waiting screen (`GameLobby`), the studio
  landings. **These show the bar**, with the tab for the section they are in lit as a
  you-are-here sign (a game's front door and the whole lobby light **Play**).
  A kid who opened the wrong game should never have to hunt for a way out.
- **Doing** = the kid is playing or making: anything inside `GameFrame` (the engine
  iframe), the lobby's PLAYING screen with a live board in it, the journey, the board,
  a studio's canvas. **These never show the bar** — it would cover gameplay, and the
  shell already owns the top strip below for exits.

Two things follow from putting a fixed bar on a screen that did not have one:

1. **Pad the content.** The bar is `position:fixed`, so it floats over the page and
   the last button on a scrolled screen ends up underneath it. Every deciding screen
   pads its own bottom by `navBarClear(18)` (`src/BottomBar.jsx`, which is where the
   bar and its one clearance number live), which is the
   bar's height plus `env(safe-area-inset-bottom)` — the same inset the bar carries,
   so the padding is right on a phone as well as a desktop. `NAV_BAR_H` is the one
   number: move it and every screen and pill moves with it.
2. **Lift anything else pinned to the bottom.** A floating control at `bottom:14`
   lands *in* the bar strip. Two ways to clear it, depending on whether the element
   knows which screen it is on:
   - It knows: pass the clearance in. The Survival "Gear up" pill is the example —
     `gearUpBtn(onUpgrades, overBar)` sits at `bottom:14` on a doing screen and at
     `navBarClear(14)`, just above the bar, on any screen that shows both.
   - It does not: read the variable. **While the bar is mounted it publishes its own
     height on `<html>` as `--bk-bottom-bar`**, and removes it on unmount. Anything
     rendered outside the screen switch anchors off that with a `0px` fallback —
     `bottom: calc(var(--bk-bottom-bar, 0px) + 24px)` — and is correct on every
     screen without being told. The buddy toast (`src/HelperReactions.jsx`, mounted
     once in `main.jsx`) is the first customer. Same idea as the `--bk-nav-*`
     variables the in-game HUD reads.

**Leaving a deciding screen must clean up after itself.** If the screen is holding
something open on the kid's behalf, let it go BEFORE the tab tap navigates, and
*await* it — a fire-and-forget cancel races the screen change. The lobby is the
worked example (`leaveForTab` → `cancelPendingWork` in `src/GameLobby.jsx`): a
pending outgoing invite is cancelled and an open realtime channel is closed before
any tab handler runs, so a friend can never accept into a match nobody is sitting
in. A cancel that fails must still let the kid leave — trapping them on the screen
is worse than a stale row. `qa-gn2.mjs` mounts the lobby against a mock transport
and asserts that order.

**The bar owns the bottom strip.** Where the bar shows, nothing else may sit within
`navBarClear()` of the bottom edge — the same deal the shell's reserved top strip
has with a game's HUD.

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

**Hiding a game's own buttons is only half the job (Session FL9).** The shell's
buttons still float over the game, so a HUD that keeps drawing in those corners
ends up *underneath* a control the kid can't see — Sky Flyer's coin count sat
under the shell Sound button and its mini-map under the shell Help button, at
every phone width. So in-app `buildable-gamenav.js` marks the page
`.bk-inshell` and publishes the strip the shell reserves:

| variable | value | means |
| --- | --- | --- |
| `--bk-nav-left` | `104px` | clear of the Home pill |
| `--bk-nav-right` | `64px` | clear of the top-right button column |
| `--bk-nav-bottom` | `52` / `96` / `140px` | how deep that column goes, for the buttons *this* engine asked for |

A game's own stylesheet uses them under `.bk-inshell`, and nothing changes when
the page is opened standalone:

```css
.bk-inshell .pill { top: calc(var(--bk-nav-bottom, 96px) + 10px) }
```

Do **not** add `env(safe-area-inset-top)` to those rules: `--bk-nav-bottom` is
already a position in the shell's coordinate space, which is the same space the
game's iframe fills, so adding the inset again pushes the HUD lower than it
needs to go. The numbers are mirrored from `GameFrame`/`NavBtn` in
`src/BuildableKids.jsx` — move one and you must move the other.

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
