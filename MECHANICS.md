# Game Mechanics Library

A catalog of **reusable, tested gameplay primitives** that the game generator
(`api/generate-game.js`) draws on so every generated game is assembled from proven
mechanics instead of being improvised from scratch.

These patterns were extracted from a finished, shipped game (*Riley's Garden* at
croctot.com/riley) and re-expressed here in an engine-neutral way. They are written
to be implemented in **Phaser 3**, but the *design* is portable to any 2D engine.

> **Why this exists:** the original generator prompt just asked for a bare
> "run and jump over gaps" game — no enemies, no power-ups, no win condition, no
> difficulty design. That is why early generated games felt thin. This library gives
> the generator a vocabulary of real mechanics to compose.

---

## 1. Core design principle: separate SKIN from ENGINE

The proven pattern from Riley is to split every game into two config blocks plus a
reusable engine:

- **THEME** — game-wide identity: name, hero character, item/collectible graphics,
  sounds, color palette. Swapping THEME reskins the whole game.
- **LEVELS** — an array, one entry per level: background colors, which enemies appear,
  enemy counts/speeds, movement pattern, collectibles, win condition, difficulty.
- **ENGINE** — the game loop, physics, collision, scoring, HUD. Shared, rarely edited.

A new game = new THEME + new LEVELS, same ENGINE. A *remix* = tweak one of those.
The generator should always emit code in this shape so games are remixable later.

---

## 2. Enemy movement patterns

Each enemy has a named movement pattern. Pick one per enemy via a `pattern` field.
These are the six proven in Riley (top-down), described so they can be mapped onto a
side-scroller or any layout:

| Pattern | Behaviour | Good for |
|---------|-----------|----------|
| `linear`  | Moves in a straight line with a gentle bob. Wraps at edges. | easy intro enemies |
| `patrol`  | Moves back and forth, steps toward the player at each turn. | ground/guard enemies |
| `random`  | Wanders unpredictably within bounds; occasional velocity nudges. | chaotic mid-game |
| `zigzag`  | Sine-wave weaving across its path. | flying enemies |
| `swoop`   | Drifts, then periodically **dive-bombs** toward the player and climbs back. | aggressive attackers |
| `swirl`   | Orbits a center point. | bosses / set-pieces |

**Reference implementation (per-frame update, dt in ms):**

```js
function moveEnemy(e, dt, target, bounds) {
  e.t += dt * 0.001;
  switch (e.pattern) {
    case 'linear':
      e.x += e.vx * (dt/16);
      e.y += Math.sin(e.t * 2) * 0.4;
      break;
    case 'patrol':
      e.x += e.vx * (dt/16);
      if (e.x > bounds.right || e.x < bounds.left) { e.vx *= -1; e.y += 30; }
      break;
    case 'random':
      e.x += e.vx * (dt/16); e.y += e.vy * (dt/16);
      if (e.x < bounds.left || e.x > bounds.right) e.vx *= -1;
      if (e.y < bounds.top  || e.y > bounds.bottom) e.vy *= -1;
      if (Math.random() < 0.01) { e.vx += (Math.random()-0.5); e.vy += (Math.random()-0.5); }
      break;
    case 'zigzag':
      e.x += e.vx * (dt/16);
      e.y = e.baseY + Math.sin(e.t * 3) * 65;
      break;
    case 'swoop': {
      e.x += e.vx * (dt/16);
      e._sw = (e._sw || 0) + dt;
      const gap = 3200, diveDur = 2600, ph = e._sw % (gap + diveDur);
      e.y = ph > gap
        ? e.baseY + Math.sin(((ph-gap)/diveDur) * Math.PI) * (bounds.bottom * 0.55)
        : e.baseY + Math.sin(e.t * 2) * 10;
      break;
    }
    case 'swirl':
      e.x = e.cx + Math.cos(e.t * 0.8) * 120;
      e.y = e.cy + Math.sin(e.t * 0.8) * 80;
      break;
  }
}
```

In **Phaser**, set the sprite's velocity/position from these formulas each
`update(time, delta)` (delta is your `dt`). For a side-scroller, treat `e.x` as the
enemy's offset relative to the scrolling world.

---

## 3. Collectibles & power-ups

Riley's hook: collectibles aren't just points — some are **power-ups** that upgrade
the player's attack. Reusable rule set:

- Items spawn from the THEME's item list. Each item is `{ type, emoji, isPowerUp }`.
- Plain items add score. Power-up items charge a meter; when full, the player's
  weapon/ability upgrades for a duration.
- Uncollected items can drift (wind), magnet toward the player when close, or be
  time-limited — all optional per level.

This turns "collect coins" into a real risk/reward loop.

---

## 4. Win / lose conditions

Riley's levels end on a **clear-all + survive-minimum-time** rule, which avoids both
unwinnable soft-locks and instant wins. Reusable options the generator can pick from:

| Condition | Description |
|-----------|-------------|
| `clearAll`     | Defeat every enemy to advance. |
| `surviveTime`  | Last N seconds. |
| `reachDistance`| Travel N units (runner-style). |
| `defeatBoss`   | Beat the boss enemy. |
| `collectN`     | Gather N target items. |

**Critical safeguard (a real bug we fixed in Riley):** any `clearAll` condition MUST
have a failsafe — if an enemy becomes unreachable, force-clear lingering enemies after
`minDuration + buffer` so the level can never soft-lock. Always include this.

Also cap level length (Riley uses 45s normal / 90s boss) so a level can't run forever.

---

## 5. Difficulty curve

Per-level, scale these up gradually rather than randomly:

- enemy **count** and **speed**
- harder **patterns** later (`linear` → `patrol` → `random`/`zigzag` → `swoop` → `swirl`)
- environmental modifiers (wind, darkness, fog)
- a **boss** on the final level, with its own music and a higher time cap

Riley's 5-level ramp is a good default: gentle intro → patrol → chaotic+weather →
aggressive dive-bombers in the dark → boss finale.

---

## 6. Kid-friendly polish (ages 5–12)

- No harsh game-over: boss/time-outs auto-win or restart gently.
- Auto-aim / auto-fire helper so young kids don't have to aim precisely
  (Riley uses an auto-blasting fairy companion).
- Big, readable HUD; emoji sprites so no art assets are required.
- Audio only after first tap (browser autoplay rule) — unlock the audio context on
  the first user gesture.

---

## 7. How the generator should use this

`api/generate-game.js` includes a condensed version of this library in the prompt so
Claude composes each game from these named mechanics (choose patterns per enemy, a win
condition, a difficulty ramp, the THEME/LEVELS split) instead of inventing physics
each time. Keep this file and that prompt in sync.


---

## 8. Now backed by a database table: `game_mechanics`

This catalog is the design reference. The mechanics are also stored as rows in the **`game_mechanics`** Supabase table so the generator can pick from them at build time and the set can grow over time without code changes:

- Columns: `slug (unique), name, description, rule (jsonb), tags[], enabled, created_at`.
- `api/generate-game.js` selects an `enabled=true` mechanic (random, or by `gameData.mechanicSlug`) and injects its name/description/`rule` JSON into the Claude prompt.
- **To add a mechanic:** insert a row (give it a `slug`, `name`, `description`, and a small `rule` JSON of params). It becomes available to the generator immediately. Keep this file in sync with new entries.

### Seeded starter mechanics

| slug | name |
|------|------|
| `run-jump-platformer` | Run and jump platformer |
| `collect-all-coins` | Collect all coins to win |
| `avoid-the-spikes` | Avoid the spikes |
| `reach-the-chest` | Reach the chest at the end |
| `timed-run` | Simple timed run |
