# Buildable Breaker — instructions

A classic **paddle-and-ball brick breaker** for kids. You slide a paddle along the bottom,
the ball bounces around, and you smash every brick to clear the level. The twist that fits
Buildable: kids **make it their own** — they pick the look, turn power-ups on or off, and
choose how hard it is. No reading required to play.

It's built as a new **game type** for the Games section, alongside Survival (Space Sparkles),
Platformer (Bramble's Dash), and Croc Tot. Like those, the game is a fixed **engine** plus a
data-driven **recipe** (`GAME_CONFIG`): you tune numbers, you never rewrite the game.

## The files

- **public/breaker-engine.html** — the game itself (open this to play).
- **public/buildable-renders.js** — the shared drawing library (kept next to the HTML).
- **public/buildable-audio.js** — the shared sound library (bounce, smash, win, lose, etc.).
- **qa-breaker.mjs** — the headless test: a perfect-paddle bot clears every level, plus a
  render smoke test. `node qa-breaker.mjs <repo-dir>`.

Drag on a tablet/phone, or use the arrow keys (or A / D) on a computer. Space launches the ball.

## How to play

1. **Slide to move the paddle.** Hold and drag anywhere, or use the arrow keys / A and D.
2. **Tap (or press Space) to launch** the ball off the paddle.
3. **Bounce the ball into the bricks** to smash them. Where the ball hits the paddle decides
   which way it flies, so kids learn to aim.
4. **Catch the falling power-up capsules** with the paddle (if power-ups are turned on).
5. **Clear every brick to win the level** and unlock the next one. Run out of lives and you
   start that level again. Beat all six to win the whole game.

A wordless how-to-play demo shows on the first launch, and the **?** button replays it.

## Make It Mine (the customizing)

The **Make It Mine** button on the menu opens three tabs:

- **Look** — pick a **backdrop** (Meadow, Space, Candy, Ocean, Castle, Desert), a **ball**
  (Glow Ball, Star, Comet, Berry), and a **paddle color**.
- **Power-ups** — turn each one on or off: **Big Paddle**, **Multi Ball** (splits into 3),
  **Slow-Mo**, **Catch** (the ball sticks so you can aim, then tap to fling it), **Extra Life**.
- **How Hard** — **Easy** (5 lives, wide paddle, slower ball), **Normal** (3 lives), or
  **Hard** (2 lives, narrow paddle, faster ball).

Every choice is saved per kid in the browser (and follows the same active-kid pattern as the
other games), so it sticks between visits.

## The six levels

1. **First Bounce** — a simple full wall of bricks.
2. **Step Pyramid** — a pyramid shape, a few tougher bricks.
3. **Checker Castle** — a checkerboard pattern.
4. **Secret Gaps** — bricks with gaps to thread the ball through.
5. **Diamond Drop** — a diamond layout, lots of tougher bricks.
6. **Brick Boss** — the big full wall, mostly tough bricks.

Bricks with a small white dot drop a power-up. Tougher bricks (with a light stripe) take two
hits. Levels get bigger and the ball gets a little faster as you go.

## Why it's always fair

Brick breakers are inherently clearable, and the engine keeps it that way: the ball is never
allowed to settle into a perfectly vertical or perfectly repeating bounce (a tiny natural
jitter on each paddle hit), so it always keeps sweeping across the bricks. The headless test
(`qa-breaker.mjs`) runs a perfect-paddle bot through every level multiple times and confirms
each one clears with no dead-ends.

## How it's wired in

- **Vercel route** — `public/breaker-engine.html` has an explicit route in `vercel.json`,
  added **before** the `/(.*)` catch-all (the same gotcha the other games hit).
- **Top Games hub** — a "Buildable Breaker" tile in `public/games-library.html`.
- **In-app Games picker** — a **Breaker** tile in `src/BuildableKids.jsx` (`GamePicker` →
  `BreakerScreen`), mirroring how Survival and Platformer are wired.

No database changes are needed — progress and look/play choices live in the browser.
