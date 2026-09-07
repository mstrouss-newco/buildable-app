# HUD & In-Game Navigation Rules

One consistent contract for every Buildable game, so the app's navigation and a
game's own HUD never fight for the same space. Follow this for every new game and
when touching an existing one.

Rewritten in **Session HD1**. The old wording talked about "reserved corners" and
a column of buttons down the right edge. That is gone: the shell owns the whole
**top band**, at three sizes, in one style.

## Rule 0 — one style, everywhere

There is exactly ONE look for a shell button and for an info chip, on every game:

```
background  rgba(18,18,38,0.55)
outline     1px solid rgba(255,255,255,0.25)
text        #ffffff
blur        backdrop-filter: blur(6px)
```

The cream and white variants are **retired**. They were introduced so the Home
pill would read on pale games and they did the opposite: on the Farm and on Ant
City a white pill on a pale sky disappeared. A game may tint its chips with its
manifest's signature color through `BuildableHUD.setAccent(color)`, which changes
the outline only. Nothing else.

## Rule 1 — the shell owns the whole top band

When a game runs inside the app (an iframe in the React shell, `GameFrame`), the
shell draws a band across the top of the screen and everything in it:

- **Left of the band → Home.** A game never draws its own Home/back button in-app.
- **Right of the band → a ROW of buttons.** On a phone that row is
  **Sound + Menu**, and **Help lives inside the Menu**. On a tablet or a computer
  it is **Sound + Menu + Help**.
- **The shell never draws at the BOTTOM of a game.** Anything a screen used to
  hang down there (Survival's "Gear up", Family Town's "Play a sibling") is a
  **Menu item** now.

Everything the shell draws sits at `z-index:3`.

### The three size tiers

Read from the window width, updated on resize.

| tier | width | band height | button | pad from edge | gap | Home pill |
| --- | --- | --- | --- | --- | --- | --- |
| phone | under 600px | 52px | 40px | 12px | 8px | 76px |
| tablet | 600 to 1024px | 60px | 44px | 14px | 10px | 84px |
| computer | over 1024px | 68px | 48px | 16px | 12px | 92px |

Buttons are centred in the band: `top = (band - button) / 2`. The row is laid out
from the right edge: `right = pad + slot * (button + gap)`, slot 0 nearest the edge.

### What the band publishes into the game

`buildable-gamenav.js` marks the page `.bk-inshell` and publishes the band as CSS
variables, so a game's stylesheet lays its own pieces out around chrome it does
not draw. Standalone none of this is set and the page is untouched.

| variable | means |
| --- | --- |
| `--bk-band-h` | how tall the band is (52 / 60 / 68) |
| `--bk-nav-left` | how far in from the LEFT the Home pill reaches (96 / 108 / 120) |
| `--bk-nav-right` | how far in from the RIGHT the button row reaches |
| `--bk-tier` | `phone` \| `tablet` \| `computer` (also on `<html data-bk-tier>`) |
| `--bk-bottom-safe` | the phone home-indicator inset |
| `--bk-nav-bottom` | kept working: the depth of the shell's chrome, which is now simply the band height |

```css
.bk-inshell .myPill { top: calc(var(--bk-band-h, 52px) + 10px) }
```

Do **not** add `env(safe-area-inset-top)` to those rules: the variables are
already positions in the shell's coordinate space, which is the same space the
game's iframe fills, so adding the inset again pushes the piece lower than it
needs to go.

The bridge computes the band from the window width so the very first frame is
right, and the shell then **posts the numbers it actually drew** as
`{type:"bk:band"}`; those always win. The numbers are mirrored in three files —
`BK_BAND` in `src/BuildableKids.jsx`, `BAND` in `public/buildable-gamenav.js`,
`TIERS` in `public/buildable-hud.js` — and `scripts/qa-hud-all.mjs` fails the
moment any two disagree.

## Rule 2 — route every game's nav through the shared bridge

Games do **not** invent their own in-app nav. They keep their own buttons (for
when the page is opened directly / standalone) but register them with the shared
bridge, which **hides them in-app** and lets the shell's single set drive them.

```html
<script src="buildable-gamenav.js?v=2"></script>
```
```js
BuildableGameNav.register({
  hide:   ["muteBtn","helpBtn","backBtn"], // this engine's own button ids — hidden in-app
  onSound: () => toggleMute(),             // shell Sound tapped
  onMenu:  () => showMenu(),               // shell Menu tapped (back to the level picker)
  onHelp:  () => openHelp(),               // shell Help tapped, or the Menu's Help on a phone
  soundOn: () => !muted,                   // current sound state (for the icon)
  // inGame: () => state === "play",       // optional; omit to always show Menu
});
```

Standalone the bridge does nothing and the game's own buttons keep working, so
every engine is still usable on its own.

**Exception, unchanged:** a game with its OWN essential top-right *game* controls
(Mahjong's Recall / Hint / Mix) does not adopt the shell's cluster, because it
would land on top of those controls. It keeps its own compact controls — restyled
to the dark glass of Rule 0 — and they must sit clear of the band.

## Rule 3 — use the shared info bar, and pick a layout

`public/buildable-hud.js` is the single, shell-owned info bar for every converted
game. There is no per-game HUD stylesheet and no canvas-painted HUD. It insets
itself from `--bk-nav-left` / `--bk-nav-right`, so nothing it draws can ever enter
a rectangle the shell reserved.

```js
const hud = BuildableHUD.mount(canvas, { layout: "world" });
BuildableHUD.setAccent(manifest.color);
```

Four layouts, one per shape of game:

| layout | what it draws | `hud.set(...)` |
| --- | --- | --- |
| `action` | name left; score, hearts, timer right | `{ left:[chips], right:[chips] }` |
| `world` | up to 5 counters plus a coin wallet chip | `{ counters:[{icon,text}], coins:n }` |
| `board` | one centred turn chip with a dot in the player's color | `{ turn:"Your turn", color:"#2FB7D6" }` |
| `practice` | progress chip left, timer or streak chip right | `{ progress:{...}, timer:{...} }` |

Pass `canvas = null` when the bar belongs to the whole window rather than to a
play area (a board game's canvas is a centred square, not the screen).

**Text and chips scale with the tier:** 12.5 / 15 / 17px, with the padding to
match, read from `--bk-tier` in-app and from the window width standalone.

**`world` on a phone drops to a second row.** Five counters and a wallet do not
fit between the Home pill and the button row at 390px, so on a phone the whole
strip moves to a full-width second row **directly under the band**, at a smaller
size. Never to the bottom of the screen.

**Counter icons come from the game's own art** — an image URL, or an inline
`<svg>` string the engine passes. Never an emoji; there are no emojis anywhere in
this product.

## Rule 4 — Win / "You win" prompts are floating cards, never a screen dim

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

## Rule 5 — No decorative "stars" for beating a level

Beating a level shows a floating card and (optionally) a "Cleared" note on the
level map — not a 1-3 star rating. Star ratings that don't unlock or persist
anything were removed platform-wide. The one place stars remain functional is
Typing, where they actually unlock heroes.

## The gate

`scripts/qa-hud-all.mjs` opens every page in `public/` that loads
`buildable-gamenav.js` or `buildable-hud.js` inside a mock of the real shell, at
390x844, 820x1180 and 1440x900, reads the rectangle of every shell button and
every `.hud-chip`, and fails if any two overlap or a chip escapes its band (or,
for `world` on a phone, its second row). It prints one table and runs as part of
`node qa-all.mjs`. `qa-skyflyer-hud.mjs` does the same job in depth for Sky Flyer
and additionally proves the three copies of the size table agree.

Converted so far: Breaker (`action`), the Farm (`world`), tic-tac-toe (`board`).
Ant City, Family Town, Sky Flyer and Riley's Garden are next (HD2).
