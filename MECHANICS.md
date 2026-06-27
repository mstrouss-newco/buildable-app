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

### killThenBoss — guaranteed level-end (recommended default)

**This is the most robust way to make a level always end, and the recommended default for generated games.** Proven in Riley (2026-06-09). Instead of ending a level on “defeat EVERY enemy” (fragile — one unreachable enemy soft-locks the level), drive the ending off a **kill counter the player controls**:

1. Track `kills`, incremented at the single point where any enemy dies.
2. When `kills >= killGoal` (Riley uses **15**), stop normal spawns and spawn a **boss/miniboss**.
3. The level ends **only when the boss is defeated** (plus an optional minimum-duration gate).

Give EVERY level a (mini)boss, scaling boss HP per level (Riley: miniboss 8 HP, final boss 15 HP). Why this is better than plain `clearAll`: the end state depends on a monotonically increasing counter, not on the engine successfully cleaning up every stray enemy, so it cannot hang. Still keep the failsafe + time cap below as belt-and-suspenders (Riley also arms the boss at `minDuration + buffer` as a fallback).

```
rule: { type: 'killThenBoss', killGoal: 15, bossHp: 8, finalBossHp: 15,
        endOnBossDefeat: true, minibossSprite: 'levelEnemy', waveEveryMs: 3500,
        minDurationMs: 30000, fallbackBufferMs: 8000 }
```

Implementation lesson from Riley: read the current level’s config via a global index (`LEVELS[idx]`) anywhere outside the level-builder — a per-build local `lv` is not in scope in the win-check/boss-spawn code, and referencing it throws and makes levels unwinnable. The QA agent (below) catches exactly this.

**Refinements proven in Riley (recommended):**

- **Distinct miniboss per level.** Don’t reuse one boss sprite everywhere. Give Lv1–Lv(n-1) a miniboss that is a *giant version of that level’s own enemy* (`minibossSprite: 'levelEnemy'` — enemy emoji/art + a crown + an angry aura) so each miniboss feels native to its level, and reserve the unique “final boss” art for the last level. Scale HP (miniboss `8`, final boss `15`).
- **End the level the instant the boss dies** (`endOnBossDefeat: true`). Once the boss has spawned and is beaten, finish immediately — don’t also wait out the minimum duration. (Keep the clear-enemies + min-duration rule only for the pre-boss phase.)
- **Tune enemy throughput so `killGoal` is reachable.** Spawn waves often enough (Riley: `waveEveryMs: 3500`) that the player can actually reach 15 kills within the level; otherwise the time-based fallback ends up being the real trigger.
- **Closure-scoping for QA.** If level state (current index, current-level config) is closure-scoped, expose a `startLevel(idx)`-style hook so the QA agent can drive a specific level — you can’t set a closure variable from outside the game.

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
| `kill-then-boss` | Kill 15 bad guys, then beat the (mini)boss to end the level (guaranteed level-end) |

---

## 9. FX / "juice" mechanics — now a shared code library (`buildable-mechanics.js`)

§1–§8 cover **gameplay** mechanics (how a level is won, how enemies move). This section
covers **feel/FX** mechanics — the "juice" that makes a hit land: explosions, screen
shake, screen flash, floating pop text, confetti. These were being **copy-pasted** into
every hand-authored engine (`survival-engine`, `croc-engine`, `breaker-engine` each had
their own near-identical `burst()`, `flash`, `shake`, `pop()`), which is exactly the
drift this library exists to stop.

They now live once in **`public/buildable-mechanics.js`** — global `BM`
(`window.BuildableMechanics`) — the third shared engine library alongside
`buildable-renders.js` (`BR`, drawn art) and `buildable-audio.js` (`BA`, sound).

```js
// load it:  <script src="buildable-mechanics.js"></script>   then  BM = window.BuildableMechanics
const fx = BM.makeFx();                         // { parts, pops, shake, flash, flashCol }
BM.explode(fx, x, y, "#ffa500", { n:18, pop:"BOOM!", sfx:"win" }); // burst + flash + shake (+sound)
BM.burst(fx.parts, x, y, col, 12);              // just particles
BM.shake(fx, 0.3);                               // kick the camera
BM.flash(fx, "#ff4400", 0.25);                   // hurt flash
BM.pop(fx.pops, x, y, "-1", "#ff5555");          // floating text
// each frame:
BM.update(fx, dt);                               // advance + cull (headless-safe; dt in seconds, or omit for 60fps)
const sh = BM.shakeOffset(fx);                   // translate the camera by {x,y} before drawing the world
BM.draw(ctx, fx, { W, H });                       // draw particles + pops + flash overlay
```

Design guarantees (so adopting it is safe):
- **Engine owns the data.** Helpers operate on arrays/state you pass in, so an engine
  adopts `BM` without changing its data model.
- **Headless-safe.** Every canvas call is guarded; `BM.update()` with no `ctx` never
  throws, so the QA sim (`update()` with no rendering) keeps passing.
- **Both time models.** Pass `dt` in seconds (croc/survival), or omit it for the older
  frame-stepped engines.

**FX mechanics are also catalogued as `game_mechanics` rows** (tag `fx`), so the
generator can name them too — see `db/seed-fx-mechanics.sql`. Each FX row's `rule`
carries `lib`/`fn` pointing at the `BM` call that produces it, so the catalog and the
code stay one source of truth.

### Seeded FX mechanics

| slug | name | BM call |
|------|------|---------|
| `fx-explosion-burst`     | Explosion burst       | `BM.explode` |
| `fx-screen-shake-on-hit` | Screen shake on hit   | `BM.shake` |
| `fx-hit-flash`           | Hit flash             | `BM.flash` |
| `fx-floating-score-pop`  | Floating score pop    | `BM.pop` |
| `fx-confetti-celebrate`  | Confetti celebrate    | `BM.burst` (gravity) |

**To add an FX mechanic:** add the function to `buildable-mechanics.js`, add a row to
`game_mechanics` (an idempotent `db/seed-*.sql`), and add a line to the table above.

---

## 10. One catalog, two engine tracks (the unification)

Buildable builds games two ways, and the goal is that **both draw mechanics from this
one catalog** (see `BUILDING-A-GAME.md` for the full picture):

- **Track A — the AI generator** (`api/generate-game.js`, Phaser): already reads
  `game_mechanics` rows and injects the chosen mechanic's name/description/`rule` into
  the Claude prompt (§8). It composes a game from named mechanics.
- **Track B — hand-authored engines** (`public/play.html`, `survival-engine.html`,
  `croc-engine.html`, `breaker-engine.html`): data-driven, always-clearable, QA-simmed,
  and they now share `BR` + `BA` + `BM`. They consume the **same** vocabulary — the
  movement patterns (§2), the win conditions (§4, esp. `kill-then-boss`), and the FX
  primitives (§9).

The same mechanic should mean the same thing in both tracks. A boss-defeat rule named
`kill-then-boss` and an `fx-explosion-burst` are reusable whether a game is generated or
hand-authored.

---

## 11. Roadmap to full unification (multi-session)

Status today: assets are one shared library; the three engine code libs (`BR`/`BA`/`BM`)
exist; `game_mechanics` exists and the generator uses it. Remaining convergence work,
roughly in order (each step is additive — never break a live game):

1. **Adopt `BM` in the hand-authored engines.** Replace each engine's local
   `burst()`/`flash`/`shake`/`pop()` with `BM.*`, one engine at a time, re-running its
   `qa-<game>.mjs` before/after. (Survival or breaker first — smallest diff.)
2. **One QA hook name.** Standardize the test hook on a single `window.BUILDABLE_GAME`
   (keep `BK_GAME`/`SURV_GAME`/`CROC_GAME` as aliases) so `qa/sim-node.mjs` tests every
   engine without special-casing.
3. **Engines read `game_mechanics` too.** Let a Track B engine pull mechanic rules (e.g.
   a boss pattern, an FX combo) from the catalog at load, with a hard-coded fallback —
   mirroring how engines already read the asset library with a drawn fallback.
4. **Shared engine core.** Extract the copy-pasted `mulberry()` RNG + image-loader/cache
   + audio-unlock into one `buildable-engine-core.js`, imported by every engine.
5. **One `/api/library` read** that returns assets AND mechanics filterable by `theme`
   and `usable_in`, so a brand-new game can assemble itself — art, sound, FX, and rules —
   from existing shared pieces.

Keep this file, `BUILDING-A-GAME.md`, `buildable-mechanics.js`, and the `db/seed-*.sql`
mechanic seeds in sync as the catalog grows.

---

## 12. Multiplayer mechanics (two kids playing together)

Multiplayer is a mechanic too — registered in `game_mechanics` so a generation prompt can
request it by name, and fully specified in **`MULTIPLAYER.md`** (transports, the frozen
`mp:` contract, the tennis blueprint). Two registered slugs:

| slug | name | transport |
|------|------|-----------|
| `mp-realtime-broadcast` | Real-time two-player (Broadcast) | Supabase Realtime Broadcast — live ball/paddles (tennis, pong) |
| `mp-turn-based-row`     | Turn-based two-player (poll a row) | one family-scoped row, re-read every ~2s (chess, board games) |

Seeded by `db/seed-multiplayer-mechanic.sql`. The real-time mechanic is implemented by the
shared layer `src/lib/realtimeChannel.js` + `src/lib/rtMatch.js` + `src/FamilyRealtime.jsx`
and the `rt_matches` table — a game opts in by speaking the `mp:` contract and launching
through `FamilyRealtime`. Non-negotiables for any multiplayer: parent-account lane,
family-RLS, **canned reactions only (no free-text chat)**, network-agnostic engine.
