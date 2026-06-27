# Buildable — How We Make Games Look Good

A living playbook for the **visual + audio** side of Buildable games. It captures
the process we used to take the platformer from "flat repeated image with placeholder
shapes" to a living, layered watercolor world — so the next game engine can reuse the
same approach instead of reinventing it.

> This is a **starting point, not gospel.** Expect to improve it as we build more
> game types. For *gameplay* structure (data-driven engines, always-clearable levels,
> the QA sim), see `MECHANICS.md` — this doc is the **look & feel** companion.

Reference implementation: `public/play.html` (the platformer/runner) +
`api/game-art.js` (the art pipeline) + `src/lib/audioUnlock.js` (audio unlock).

---

## 1. The core idea: a living world from cheap, reusable cut-outs

A game's world is **not one big painting**. It's a small set of **separate
see-through pieces** (trees, bushes, a mushroom, a fern, a hanging canopy, a band of
distant mist) that the engine **scatters and scrolls at different speeds**. That
layered, multi-speed scatter is what creates depth and the feeling of motion.

Why pieces instead of one image:
- One tiled image always shows a **seam or an obvious repeat** (we tried it; it looked bad).
- Discrete scattered pieces **never** show a repeat line, and are **far easier to
  generate cleanly** than a perfectly-tiling strip.
- It reuses the exact pipeline as Stories (transparent character cut-outs), so any
  world a kid picks can get a living backdrop for **~$0 per play** (generate once, cache forever).

House style rules:
- **Watercolor** children's-book look by default (other styles exist: `modern3d`,
  `papercut`, `modern`). Match the Stories `STYLES` strings.
- **No emojis, ever.** Use generated art or drawn shapes — never emoji.
- Every world piece is a **single isolated element on a fully transparent
  background** — no ground line, no cast shadow, no other objects.

---

## 2. The art pipeline (`api/game-art.js`)

Mirrors the Stories library (`api/story-library.js`). Generate once, cache in the
`narration_cache` table (key `ga:` + sha1), serve forever.

- `GET /api/game-art` → manifest (worlds + piece names)
- `GET /api/game-art?build=1&world=<w>&piece=<p>&style=<s>` → generate + cache one piece (add `&force=1` to redo)
- `GET /api/game-art?img=<world>:<piece>&style=<s>` → serve the cached PNG (CORS-open)

Generation = `gpt-image-1`, low quality, `1024x1024`, `background:"transparent"`,
`output_format:"png"`. ~1¢/piece. Env by name only: `OPENAI_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

**To add a world:** add an entry to `WORLDS` in `api/game-art.js` with a `pieces`
map. Keep piece **names stable** (they're used in URLs). Recommended piece set
(forest example): `far` (distant misty band), `tree_a`, `tree_b`, `bush_a`,
`bush_b`, `fern` (foreground), `mushroom` (signature glow), `canopy` (hanging top).

**Generic gameplay props** live under the `props` world (shared across all worlds):
`coin`, `gem` (spiky hazard), `critter` (cute grumpy enemy), `vines` (hanging
slide-under barrier), `spring` (bounce pad mushroom), `flag` (goal).

**Prompt recipe for a clean cut-out:** `"<description>. A SINGLE isolated element,
centered, full and complete, on a FULLY TRANSPARENT background. No ground, no floor
line, no cast shadow, no other objects, no characters, no text. <STYLE>, age 4-8,
wholesome."`

After adding pieces, trigger generation by hitting each `?build=` URL once, then
confirm each `?img=` serves a PNG.

---

## 3. The layer model (back → front)

The engine loads pieces into an image map and draws these layers every frame. Each
layer scrolls at its own fraction of the camera (`camX`) — smaller = farther = slower.

| # | Layer | Source | Parallax | Notes |
|---|-------|--------|----------|-------|
| 1 | Sky gradient | canvas | fixed | soft vertical gradient |
| 2 | God-rays | canvas | 0.10 | animated translucent shafts, `globalCompositeOperation:"lighter"` |
| 3 | Far mist band | `far` piece | 0.12 | **mirror-tiled** (flip every other copy) so there's no seam |
| 4 | Mid trees | `tree_a/b` | 0.40 | scattered; rooted behind the ground band |
| 5 | Near bushes/mushrooms | `bush_*`,`mushroom` | 0.66 | scattered; **skip if over a gap** (see §5) |
| 6 | Fireflies | canvas particles | 0.80 | drifting glow dots, wrap across screen |
| 7 | Ground + gameplay | ground band, props, hero | 1.00 | the play plane |
| 8 | Foreground ferns | `fern` | 1.25 | in front; **skip if over a gap**; slightly translucent |
| 9 | Canopy | `canopy` | 1.12 | hangs from the top edge |

**Scatter, don't place by hand.** `buildScene(L, idx)` lays out instances across
`[-1000 .. worldEnd+1600]` using a **deterministic RNG** (`mulberry(seed)`), so the
world is reproducible and extends past both level ends (no hard stop). Scenery uses a
**separate RNG** from gameplay so it never affects the level layout or the QA sim.

**Ambient motion = "alive" for free:** drifting fireflies, animated god-rays, and a
gentle per-plant sway (`sin(t + phase)`). No video, no per-frame cost.

**Camera:** smooth-follow the player (`camX += (player.x - W*0.42 - camX)*0.16`,
clamped ≥ 0). Vertical camera is currently off because platforms stay on-screen; add a
`camY` follow if towers get taller.

---

## 4. Rendering the gameplay props

Each prop draws its **art image if loaded, else a drawn-shape fallback** (so the game
always renders even before art arrives, and degrades gracefully):

```js
const im = propImg("coin");
if (im) { /* drawImage ... */ } else { /* old circle/triangle shape */ }
```

Little touches that sell it:
- **Coin** = gentle horizontal-scale "spin."
- **Enemy/critter** = flips to face its walk direction + a small bob.
- **Hero** = squash/stretch anchored at the feet (`scaleY` down on land, up on rise),
  flips by `player.face`, kicks up **landing dust** particles.
- **Bounce pad** = squashes when triggered.

---

## 5. Readability rules (learned the hard way)

- **Never draw a plant over a gap.** A bush/fern sitting over a pit makes it look
  solid. For near + foreground layers, skip a piece if there's no ground under its
  on-screen spot: `if (groundUnder(screenX + camX) == null) continue;`.
- **Gameplay reads on the play plane only.** Keep hazards, platforms, coins, hero at
  parallax 1.0 so timing is honest. Decorative layers must never block them.
- **Foreground frames, doesn't hide.** Keep foreground pieces sparse, lower-opacity,
  and mostly at the screen edges/bottom.

---

## 6. Sound (and why iPad was silent)

Game audio is **Web Audio** synth blips (`public/play.html`: `SFX.jump/coin/star/
bounce/hurt/win`) — tiny, no files, themable per game. The context **resumes on the
first tap** (`actx()`), because iOS/Safari only allows audio to start from a real
user gesture.

App-wide, the same iOS rule bit us everywhere (Stories narration, ambience, Music).
Fix lives in `src/lib/audioUnlock.js`, installed once in `src/main.jsx`:
- On the **first** `pointerdown/touchend/keydown`, resume a shared `AudioContext`,
  play a silent buffer, and **prime** every `<audio>`/`<video>` element (and any
  `registerAudio()`-ed `new Audio()`) with a silent blip so later `.play()` is allowed.
- Gotcha to avoid: calling `.play()` **after an `await`** loses the gesture on iOS —
  play from cache synchronously inside the tap, or rely on the prime.

---

## 7. Reusing this for a new game engine — checklist

1. Pick/define the world's piece set in `api/game-art.js` (`WORLDS`), generate, verify.
2. Load pieces into an image map; write `buildScene()` to scatter them with a
   deterministic, **separate** RNG over `[-1000 .. worldEnd+1600]`.
3. Draw the back→front layers (§3) with per-layer parallax; mirror-tile any
   continuous band; add fireflies/god-rays/sway for life.
4. Render gameplay props from the shared `props` set with shape fallbacks (§4).
5. Apply the readability rules (§5).
6. Add Web Audio `SFX` with first-tap resume; rely on `audioUnlock.js` for the app.
7. Keep the gameplay **data-driven + always-clearable + QA-simmed** per `MECHANICS.md`.

---

## 8. Known gaps / next improvements

- ~~Generate world pieces for the other 7 worlds~~ DONE (June 26 2026): all 8 worlds
  (enchanted-forest, snowy-village, coral-reef, dragon-mountain, dino-jungle, space-station,
  desert-oasis, candy-land) now have full watercolor piece sets, cached + verified. Still
  TODO: non-watercolor styles (modern3d/papercut/modern) for these worlds.
- ~~Per-world themed props~~ DONE (June 26 2026): all 8 worlds have themed coin/gem/critter;
  the engine prefers world props and falls back to the generic `props` set.
- Optional vertical camera for taller climbs.
- Richer foreground art (layered grass strips). (Moving platforms + swinging vines
  enhanced June 26 2026: denser, diagonal movers, ride-coins, vine chains, swing-the-pit.)
- A small mute/settings control; gentle background music per world.


## Choosable AI-art world backdrops + ambient motion (Tennis pattern)

How to give a game rich, kid-chosen scenery without hand-painting it:

1. **Generate once, cache forever.** Add a `kind` to `api/images.js` with a full-scene
   prompt per world (Tennis = `kind=tennis&id=<world>`), `transparent:false`,
   `quality:"medium"`. The endpoint generates on first request, caches the PNG keyed by a
   hash, enforces the daily budget, and returns non-200 on any miss so `<img onError>`
   falls back. ~$0.04 per world, one time.
2. **Draw it cover-fit + scrim.** Load it as an `Image`; in `draw()` use
   `BR.bgImage(ctx, img, W, H)` (cover-fit) and lay a soft dark scrim
   (`rgba(8,10,24,0.34)`) on top so the ball/paddles/score stay readable over busy art.
3. **ALWAYS keep a drawn fallback.** Each world also defines a `bg:[c1,c2]` gradient; if
   the image hasn't loaded (or failed/over-budget), the gradient renders instead. A
   missing asset can never break a kid's game (library-first rule).
4. **Make it move.** Layer cheap per-world **ambient particles** (`fx-ambient-particles`)
   over the static image — snow falling, bubbles/embers rising, stars twinkling, leaves/
   sweets/clouds drifting — so the scene feels dynamic. ~34 dots, wrap-around, ~0 cost.
5. **Let kids choose.** Surface a world grid via the shared start screen's customize hook
   (`customizeLabel` + `onCustomize`); each card shows the cached AI thumbnail over its
   gradient. Picking sets the world, preloads its backdrop, and re-seeds the particles.
