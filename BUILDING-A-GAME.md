# BUILDING-A-GAME.md — start here for a new game, world, or game type

**Agents: read this before building any new game, engine, world, or game mode.**
This is the single entry point that ties together the four playbooks. Each one owns a
different question; this doc tells you when to open which:

| Open this | To answer |
|---|---|
| **BUILDING-A-GAME.md** (this file) | "I'm making a new game — what's the whole process?" |
| [`MECHANICS.md`](./MECHANICS.md) | "How does it *play*? What proven mechanic do I reuse, and where do I store a new one?" |
| [`GAME-LOOK.md`](./GAME-LOOK.md) | "How does it *look and sound*? Layers, parallax, art pipeline, audio unlock." |
| [`ASSET-LIBRARY.md`](./ASSET-LIBRARY.md) | "What do I *render with*? Where to find assets, where to send new ones." |

The north star (same as the asset rule): anything you build — an engine, a mechanic, a
world, a hero — should be **storable, trackable, and reusable by the next game.** Don't
invent a one-off; pull from the shared libraries and write back to them.

---

## Step 0 — Pick your track (there are two, on purpose)

Buildable has two ways to make a game. Choose deliberately; don't blend them in one file.

### Track A — the AI generator (`api/generate-game.js`)
A child's choices become a **Phaser 3.60** game, generated as standalone HTML in a
sandboxed iframe. The generator is **library-driven**: it assembles a game from reusable
Supabase rows — sprites (`community_sprites`), layers (`community_layers`), and
**mechanics (`game_mechanics`)** — instead of improvising. Today it supports
`gameData.gameType` = `"platformer"` (default) and `"breakout"`.

Use Track A when: the game should be generated per-kid from a prompt, and fits a genre
the generator knows (or you're adding a new genre to the generator). New genres
(e.g. Tetris) are a generator/architecture change, not just a prompt.

### Track B — a hand-authored engine (`public/*.html`)
A fixed, hand-built engine you ship as one static HTML page, launched full-screen in an
iframe. These are **data-driven + always-clearable + QA-simmed**, and they draw/sound/
feel through the three shared engine libraries. Current Track B engines:
`public/play.html` (platformer), `survival-engine.html`, `croc-engine.html`,
`breaker-engine.html`.

Use Track B when: you want a polished, bespoke engine for one game type with full control
over feel — the survival/croc/breaker model.

> **This guide focuses on Track B** (new hand-authored engines), and points to
> `MECHANICS.md` §7–8 for how Track A consumes the same mechanics library. The goal of
> the current **unification** effort is that BOTH tracks read the same mechanics catalog.

---

## The three shared engine libraries (use them — don't reinvent)

Every Track B engine loads these three `<script>`s and builds on them. They are the
reason a new game is cheap:

| Library | Global | Owns | Never instead… |
|---|---|---|---|
| `public/buildable-renders.js` | `BR` (`window.BuildableRenders`) | All drawn-shape art: hero, enemy, coin, sprite, background, hearts | …inline your own canvas shapes |
| `public/buildable-audio.js` | `BA` (`window.BuildableAudio`) | Synth SFX, music loop, mute, the iPad audio-unlock | …hand-roll your own beep synth |
| `public/buildable-mechanics.js` | `BM` (`window.BuildableMechanics`) | FX/"juice": particle bursts, screen shake, screen flash, floating pop text, `explode()` | …copy-paste a `burst()`/`flash()` again |

`buildable-mechanics.js` is new — it extracts the `burst()` / flash / shake / `pop()`
code that survival, croc, and breaker were each copy-pasting. See `MECHANICS.md` §9.

---

## Step-by-step: a new Track B engine

1. **Define content as data, not code.** One `GAME_CONFIG = window.GAME_CONFIG || {…}`
   with a `levels[]` array of recipe cards (numbers + colors + asset references). Adding
   a level/world must be editing data, never engine code. (See `MECHANICS.md` §1 — the
   THEME / LEVELS / ENGINE split.)

2. **Reuse mechanics; store new ones.** Before inventing a behavior, check
   `MECHANICS.md` and the `game_mechanics` table for a proven one (enemy movement
   patterns, the `kill-then-boss` guaranteed level-end, win conditions). If you invent a
   new reusable mechanic — gameplay OR FX (an explosion style, a boss attack) — **write
   it back**: gameplay rules → a `game_mechanics` row via an idempotent `db/seed-*.sql`;
   shared FX code → a function in `buildable-mechanics.js`. Keep `MECHANICS.md` in sync.

3. **Pull art from the library, with a fallback.** Characters via `/api/list-characters`,
   worlds/elements via `/api/list-assets` (filter by `theme`), generated world art via
   `/api/game-art`. Reference by id/url in the level card. **Always** keep a `BR.*` drawn
   fallback so a missing asset can never break a kid's game. Where to find/send each kind:
   `ASSET-LIBRARY.md`. How to make it look alive: `GAME-LOOK.md`.

4. **Wire sound + FX through the shared libs.** `BA.sfx(...)`, `BA.setMusic(...)`,
   `BA.unlock()` on first tap; `BM.explode(...)`, `BM.burst(...)`, `BM.shake(...)` for
   feel. No inline synth, no copy-pasted particle loop.

5. **Bake in always-winnable.** Cap difficulty in the level *builder* so a 4–8-year-old
   can always finish: gaps ≤ jump range; hero speed ≥ enemy speed; bosses on a timer with
   a mercy auto-win; `kill-then-boss` for a guaranteed level-end. (`MECHANICS.md` §4.)

6. **Expose the QA hook.** Export a `window.*_GAME` object with `sim(idx,maxFrames)` and
   (ideally) `campaign(cap)` that runs a perfect-player bot headlessly. The shared runner
   `qa/sim-node.mjs` drives `BK_GAME.sim()` in Node and asserts ALL LEVELS WIN. Add a
   `qa-<game>.mjs` (model: `qa-breaker.mjs`) and run it before and after every change.
   _(Convergence note: hooks are currently named `BK_GAME` / `SURV_GAME` / `CROC_GAME`;
   the target is one shared name — see `MECHANICS.md` roadmap.)_

7. **Route it.** Every `public/*.html` needs its **own explicit route in `vercel.json`
   before** the `/(.*)` → `landing.html` catch-all, or it serves the landing page. Add a
   tile/launch path in `src/BuildableKids.jsx` (full-screen iframe, like Typing/Chess).

8. **QA the live deploy, then log it.** Commit to `main` (Vercel auto-deploys in ~1–2
   min), confirm it actually renders in the iframe (not just a 200), then add a dated
   entry to **`SESSION-LOG.md`** and the README session log. This is required for every
   change (`AGENTS.md`).

---

## The non-negotiable rules (from `AGENTS.md` / README — they apply here too)

- **Kids' product.** Age-appropriate always; preserve content moderation and the
  validate-before-serve fallback in `generate-game.js`.
- **No emojis** in the hand-authored engines — use `BR` drawn art or library images.
  (Track A's legacy emoji-sprite shortcut is being replaced by library sprites.)
- **Library-first, always with a fallback.** Read shared assets/mechanics on render;
  keep a drawn/local fallback so an outage can't break play.
- **Additive migration.** Never delete or re-path an asset/mechanic a live game loads
  until its replacement is verified live. (The Survival `space_bg.png`→`.jpg` miss.)
- **Never handle secrets; never run destructive DB ops.** Ship DB changes as idempotent
  `db/seed-*.sql` for the owner to run.
- **Canonical source is the repo.** Loose copies in any working folder may be stale
  (e.g. a root `platformer-engine.html` predates `public/play.html`). Build from `public/`.

---

## Where everything lives (the map)

```
buildable-app/
├─ BUILDING-A-GAME.md   ← you are here (new-game entry point)
├─ MECHANICS.md         ← reusable gameplay + FX mechanics catalog  (+ game_mechanics table)
├─ GAME-LOOK.md         ← look & feel: layers, art pipeline, audio unlock
├─ ASSET-LIBRARY.md     ← where to find / send characters, worlds, elements, music, sfx
├─ AGENTS.md            ← scope, guardrails, the asset rule
├─ README.md            ← architecture, env, session log (source of truth for changes)
├─ public/
│  ├─ buildable-renders.js     (BR — drawn art)        ← shared engine lib
│  ├─ buildable-audio.js       (BA — sound)            ← shared engine lib
│  ├─ buildable-mechanics.js   (BM — FX/juice)         ← shared engine lib (new)
│  ├─ play.html, survival-engine.html, croc-engine.html, breaker-engine.html  (Track B engines)
│  └─ …                        (each needs a vercel.json route)
├─ api/
│  ├─ generate-game.js  (Track A generator — reads community_* + game_mechanics)
│  ├─ list-assets.js, list-characters.js, game-art.js   (asset reads)
│  └─ …
├─ db/                  (idempotent SQL seeds — incl. seed-*-mechanic.sql)
└─ qa/                  (sim-node.mjs + game-qa-harness.html — the robot tester)
```

That's the whole loop: **pick a track → build content as data on a shared engine →
reuse/store mechanics → pull/store assets → guarantee winnable → QA → route → log.**
