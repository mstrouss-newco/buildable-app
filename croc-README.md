# Croc Tot — instructions

A friendly horizontal "blast-the-snacks" game for kids, rebuilt from Jackson's original
game at **croctot.com**. You fly your little **Tot** on the left side of the screen while
goofy flying snacks zoom in from the right. Your Tot shoots by itself — kids just dodge,
grab ketchup &amp; mustard to power up, and beat the boss of each world.

It's built as a new **game type** (a side-shooter) for the Games section, alongside
Survival (Space Sparkles) and Platformer (Bramble's Dash). Like those, the game is a
fixed **engine** plus a data-driven **recipe** (`GAME_CONFIG`): you tune numbers, you
never rewrite the game.

## The files

- **croc-engine.html** — the game itself (open this to play).
- **buildable-renders.js** — the shared drawing library (keep it next to the HTML).
- **qa-croc.mjs** — the headless test: a perfect-player bot beats every level. `node qa-croc.mjs`.
- **qa-render-croc.mjs** — renders real frames to PNGs to eyeball the look (needs `@napi-rs/canvas`).
- **generate-croc-art.mjs** — makes the art (hero, snack enemies, bosses, backgrounds) the same
  way the other games do. The game works **without** it (clean drawn shapes); art just upgrades the look.

Just double-click `croc-engine.html` to play. Drag on a tablet/phone, or arrow keys / WASD on a computer.

## How to play

1. **Drag to move.** Hold and drag anywhere — your Tot follows. (Or arrow keys / WASD.)
2. **You shoot automatically**, always to the right, at the incoming snacks.
3. **Grab ketchup (red) and mustard (yellow).** They fill the **Power** bar. Mustard is worth more.
   As the bar fills you go from single shot → **double** → **triple** → **rapid fire**.
4. **Grab power-ups** (the glowing bubbles): shield, magnet, baby buddy, big shots, freeze,
   ghost, nuke, extra life, double points, and laser.
5. **Survive the wave, then beat the boss.** Each world ends with a big silly boss. Pop it to win
   and fly to the next world. Beat the last boss (the Jelly Dragon) to win the whole game.

**Watch the demo:** the menu has a **Watch demo** button — the bot plays so a young kid can see how it works.

## The five worlds

1. **The Sky** — Homework Monster
2. **The Kitchen** — The Evil Pot (swinging ladle!)
3. **Underwater** — Captain Spud (arcing cannonballs)
4. **The Jungle** — Mosquito Maximus (dive-bombs you)
5. **Tater Tot Island** — Jelly Dragon (three-way orb spreads)

Beating a world unlocks the next one in the level picker, and your lives carry forward
(plus a bonus life each new world).

## Changing the game (the recipe)

Open `croc-engine.html` and find `GAME_CONFIG` near the top. Everything you'd tweak is there:

- **levels[]** — each world is one line of knobs: `waveSecs` (how long before the boss),
  `spawnGap` (how often snacks appear), `maxAlive` (how many at once), `eSpeed` (snack speed),
  `eHp`, `points`, and a `boss` block (`hp`, `atk` pattern, `fireGap`). Copy a line to add a world.
- **hero** — `speed`, `fireCd` (base fire rate), `lives`.
- **powerups[]** — which bubbles can drop.
- **enemyTints** — fallback colors per world.

After any change, run `node qa-croc.mjs` to confirm every world is still beatable.

## The graphics (same process as the game & story builders)

The art comes from your live **character library** — the exact system the story and game
builders use. A Croc Tot cast was added to that library (in `api/story-library.js`):

- `croctot` — the hero Tot
- `homework-monster`, `evil-pot`, `captain-spud`, `mosquito-max`, `jelly-dragon` — the five bosses

The hero shows a kid's **own saved character** if they have one; otherwise the `croctot`
character. Each boss shows its themed character. If any art can't load, the engine draws a
clean shape instead, so the game always works.

These are generated once and then cached forever. To (re)generate one, just open this URL
(it builds + caches server-side, costs a few cents, and is safe to repeat):

```
https://www.buildablekids.com/api/story-library?build=1&kind=character&slug=croctot&style=modern3d
```

Swap `slug=` for any of the six. The engine loads them with `&emo=base`. To restyle the whole
game, change `artStyle` in `GAME_CONFIG` (e.g. `watercolor`) and rebuild the slugs at that style.

(`generate-croc-art.mjs` is an alternative that writes local PNGs into `croc-art/` if you ever
have an `OPENAI_API_KEY` and prefer committed files — not needed for the live game.)

## Testing & shipping

- **QA:** `node qa-croc.mjs` — runs the bot per-level (cold start) and through the full
  adventure (upgrades carry forward). All five worlds must report **WIN**.
- It's wired into the hub already: `games.html` has a **Croc Tot** tile (`ready:true`).
- To ship, put `croc-engine.html` + `buildable-renders.js` (+ `croc-art/`) in the app's
  `public/` folder, the same as the other engines.
