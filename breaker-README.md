# Buildable Breaker — instructions

A **paddle-and-ball brick breaker** for kids, plus a same-device **2-player pong** mode.
In Solo, you slide a paddle along the bottom, the ball bounces around, and you smash every
brick to clear the level. The twist that fits Buildable: kids **make it their own** — they
pick the look, turn power-ups on or off, and choose how hard it is. No reading required.

It's a Track B hand-authored **engine** for the Games section, alongside Survival, Platformer,
and Croc Tot. Like those, the game is a fixed engine plus a data-driven **recipe**
(`GAME_CONFIG`): you tune numbers, you never rewrite the game.

**Breaker is the reference adoption for the shared engine libraries.** It is the first engine
to drive its juice through **`BM`** (`buildable-mechanics.js`) and to render its start screen
through **`BS`** (`buildable-startscreen.js`), per `BUILDING-A-GAME.md` / `MECHANICS.md` §11.

## The files

- **public/breaker-engine.html** — the game itself (open this to play).
- **public/buildable-renders.js** — `BR`, shared drawn art (kept next to the HTML).
- **public/buildable-audio.js** — `BA`, shared sound (bounce, smash, win, lose).
- **public/buildable-mechanics.js** — `BM`, shared FX/juice (explosions, shake, flash, pops).
- **public/buildable-startscreen.js** — `BS`, the shared start screen / level picker.
- **qa-breaker.mjs** — headless test: Solo clears every level, Pong produces a winner, plus a
  render smoke test for both modes. `node qa-breaker.mjs <repo-dir>`.

Drag on a tablet/phone, or use the arrow keys (or A / D) on a computer. Space launches.

## How to play — Solo

1. **Slide to move the paddle.** Drag, or use the arrow keys / A and D.
2. **Tap (or Space) to launch** the ball off the paddle.
3. **Bounce the ball into the bricks** to smash them. Where the ball hits the paddle decides
   which way it flies, so kids learn to aim.
4. **Catch the falling power-up capsules** with the paddle (if power-ups are on).
5. **Clear every brick to win the level** and unlock the next; earn **1–3 stars** based on how
   few lives you lost. Beat all eight levels to win.

A wordless how-to-play demo shows on first launch, and the **?** button replays it.

## How to play — 2 players (Pong)

Pick **2 players** on the start screen. Two paddles (top and bottom); knock the ball past your
buddy to score. **First to 5 wins.** On a touchscreen, each player slides their own half of the
screen; on a computer, the bottom player uses the **arrow keys** and the top player uses **A / D**.
Same device, pass-and-play — no accounts or network needed.

## Make a level (the maker)

The **Make a level** button (start screen) opens the maker — kids build their own level, play it,
and share it. Replaces the old "Make It Mine" settings screen. Four steps, saved per kid:

1. **Look** — backdrop (Meadow, Space, Candy, Ocean, Castle, Desert), ball, and paddle color.
2. **Build** — tap a grid to place bricks. **Pick my bricks**: each type is a look *and* a
   behavior — **Ice** (1 hit), **Wood** (2 hits), **Metal** (3 hits), **Candy** (bonus points),
   **Star** (drops a power-up), **Bomb** (clears bricks around it). Plus an eraser.
3. **How hard** — one **1-5 flame** dial. More flames = faster ball, smaller paddle, fewer lives.
4. **Share** — a level must be **beaten once** (play-test gate) before sharing, so every shared
   board is winnable. Shared levels are saved to **My levels** (local for now) with a flame badge.

Custom levels run through the same engine (startCustomLevel -> buildCustomBricks) and have a
headless harness hook: BUILDABLE_GAME.simCustom(board, diffN) / .makeTestBoard(cols,rows,type).
Follow-up: real friend-to-friend sharing needs a backend table + a start-screen "Friends' levels" shelf.

## The eight levels

1. First Bounce (full wall) · 2. Step Pyramid · 3. Checker Castle · 4. Secret Gaps ·
5. Tall Towers · 6. Castle Walls · 7. Diamond Drop · 8. Brick Boss (big tough wall).

Bricks with a white dot drop a power-up; bricks with a light stripe take two hits. Levels get
bigger and faster as you go.

## Screen fit (phone / tablet, portrait)

The play area **sizes itself to the screen** as a tall/portrait layout instead of a fixed
900×600 box. `fitSize()` fills the viewport **height** and caps the **width** to ~0.72× the
height, so on a phone it fills the whole screen (portrait) and on a wider tablet/desktop it
stays a centered tall field. It re-fits when the device rotates (but never mid-rally, so a
live ball is never yanked). Headless/QA has no window size, so it keeps the reference 900×600
and the always-winnable sim is unchanged.

A fixed **`HUD_STRIP`** (top band) is reserved for the score bar, and the bricks now start
*below* that strip — so the score bar (`Level`, `Bricks:`, hearts) never sits on top of the
bricks. The shared HUD (`buildable-hud.js`) keeps each chip on one line and shrinks slightly
on narrow phones so both groups fit in the strip.

## Shared libraries it builds on (the playbook rules)

- **`BM` (FX/juice)** — brick smashes call `BM.explode`/`BM.burst` for particles, `BM.pop` for
  floating "+10" score text, `BM.shake`/`BM.flash` on losing a life or scoring a point. Each
  frame runs `BM.update`; drawing uses `BM.shakeOffset` (camera kick) + `BM.draw`. No local
  copy-pasted particle code — this is the §9 unification in practice.
- **`BS` (start screen)** — the menu, mode row (Solo / 2 players), level cards (stars + lock
  state), and Make It Mine button are all rendered by `BS.mount(...)`. The bespoke customize
  overlay opens from `BS`'s `onCustomize`. Change `buildable-startscreen.js` once and every
  game's start screen changes together.
- **`BR` (art)** and **`BA` (sound)** — all visuals are drawn (no emojis) and all sound goes
  through `BA`, with safe fallbacks so a missing asset or offline state never breaks play.

## Always-winnable + QA

Brick breakers are inherently clearable; the engine keeps it that way by never letting the ball
settle into a perfectly vertical or repeating bounce (a tiny natural jitter on each paddle hit).
The QA hook is the standardized **`window.BUILDABLE_GAME`** (with `BREAKER_GAME` kept as an
alias). `qa-breaker.mjs` runs a perfect-paddle bot through all eight Solo levels (multiple runs
each), drives two bots through a Pong match until someone wins, and render-smoke-tests both
modes — all headless, all green, with no console errors on the live deploy.

## How it's wired in

- **Vercel route** — `public/breaker-engine.html` has an explicit route in `vercel.json`,
  before the `/(.*)` → landing catch-all.
- **Top Games hub** — a tile in `public/games-library.html`.
- **In-app Games picker** — a Breaker tile in `src/BuildableKids.jsx` (`GamePicker` →
  `BreakerScreen`).

No database changes — progress, stars, and look/play choices live in the browser per kid.

## Live effects (2026-07-03)
Bricks and the fireball now use real animated Kenney art (CC0, `/fx/`):
- **Animated explosions** — a 9-frame flipbook (`explode0..8`) bursts on bombs and on tough/bonus/star bricks (see `spawnBoom` + `drawAnims` in `public/breaker-engine.html`).
- **Living fireball** — while the Fireball power-up (or Flame ball skin) is active, the ball is two counter-rotating fire puffs (`fire1`/`fire2`) around a molten core, trailing a glowing tail (`fireTrail`).
- Particle bursts upgraded to soft sprites via `BM.useTextures` (spark/star/smoke/glow).
