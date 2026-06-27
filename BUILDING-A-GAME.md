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
| [`MULTIPLAYER.md`](./MULTIPLAYER.md) | "Two kids playing together? Turn-based (poll a row) vs real-time (Broadcast), and the shared rules." |

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
`breaker-engine.html` (solo brick-breaker + a same-device 2-player pong mode).

Use Track B when: you want a polished, bespoke engine for one game type with full control
over feel — the survival/croc/breaker model.

> **This guide focuses on Track B** (new hand-authored engines), and points to
> `MECHANICS.md` §7–8 for how Track A consumes the same mechanics library. The goal of
> the current **unification** effort is that BOTH tracks read the same mechanics catalog.

---

## The four shared engine libraries (use them — don't reinvent)

Every Track B engine loads these four `<script>`s and builds on them. They are the
reason a new game is cheap:

| Library | Global | Owns | Never instead… |
|---|---|---|---|
| `public/buildable-renders.js` | `BR` (`window.BuildableRenders`) | All drawn-shape art: hero, enemy, coin, sprite, background, hearts | …inline your own canvas shapes |
| `public/buildable-audio.js` | `BA` (`window.BuildableAudio`) | Synth SFX, music loop, mute, the iPad audio-unlock | …hand-roll your own beep synth |
| `public/buildable-mechanics.js` | `BM` (`window.BuildableMechanics`) | FX/"juice": particle bursts, screen shake, screen flash, floating pop text, `explode()` | …copy-paste a `burst()`/`flash()` again |
| `public/buildable-startscreen.js` | `BS` (`window.BuildableStartScreen`) | The start screen / level picker: title, hero, mode row, level cards (art + stars + lock), customize | …hand-roll a `showMenu`/level picker again |

`buildable-mechanics.js` is new — it extracts the `burst()` / flash / shake / `pop()`
code that survival, croc, and breaker were each copy-pasting. See `MECHANICS.md` §9.

### The start screen / level picker (`buildable-startscreen.js`)

Every game shows the SAME launch experience — title, hero, mode row, level cards with
art + stars + lock state, and an optional customize button — instead of each engine
hand-rolling its own `#menu`/`showMenu`/`buildLevelPicker`. (This is the start screen of a
*built* game — NOT the AI game builder.) The engine supplies a config; `BS` renders the
DOM and calls back on tap. Demo: `public/startscreen-demo.html`.

```js
const screen = BS.mount(document.getElementById("start"), {
  title: "Space Sparkles", subtitle: "Beat each boss to unlock the next world",
  coins: 24, sound: true,
  hero: { name: "Pip", img: "<character url>", progressText: "2 of 6 worlds cleared" },
  modes: ["solo", "two", "family"], mode: "solo",   // omit modes a game doesn't support
  levels: [
    { n: 1, name: "Comet Meadow",  img: "<thumb>", stars: 3, maxStars: 3, state: "done" },
    { n: 2, name: "Nebula Drift",  img: "<thumb>", stars: 2, state: "done" },
    { n: 3, name: "Asteroid Twirl", color: "#2b4a6b", state: "next" },   // highlighted "Play"
    { n: 4, name: "Stardust Caves", state: "locked" },
  ],
  customizeLabel: "Make it mine",                    // omit to hide
}, {
  onPlay: (n) => startLevel(n),   onMode: (m) => { /* solo|two|family */ },
  onHero: () => openHeroPicker(),  onCustomize: () => openCustomize(),
  onSound: (on) => BA.toggleMute(), onBack: () => goHome(),
});
// later: screen.update({ coins: 30, levels: [...] });
```

Rules: `state` is `"done"` | `"next"` | `"locked"` (lock the rest; mark the next playable
one `"next"` so it gets the green Play highlight). Each level shows its **art thumbnail**
(`img`; falls back to a solid `color`, then a drawn icon) and **stars earned** — wire
`img` to the shared thumbnail/world art. The `"family"` mode is where the real-time
multiplayer mechanic plugs in (launch `FamilyRealtime` — see `MULTIPLAYER.md`). Headless-
safe: with no DOM (QA sim), `BS.mount` is a no-op. Adopt it per engine one at a time, QA
before/after (it replaces the engine's own menu code, not its gameplay). **`breaker-engine.html`
is the first/reference adoption (2026-06-27):** its start screen + level picker are now
rendered by `BS` (Solo / 2-player mode row, level cards with stars + lock state, Make It
Mine button), with the bespoke customize overlay opened via `onCustomize`.


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

3. **Pull art AND audio from the library, with a fallback.** Characters via
   `/api/list-characters`, worlds/elements via `/api/list-assets`, music + sound effects
   via `/api/list-audio` — all filterable by `theme` (a label, not a fence: you may mix
   themes), generated world art via `/api/game-art`. Reference by id/url in the level
   card. **Always** keep a fallback (`BR.*` drawn art; `BA` synth sound) so a missing
   asset can never break a kid's game. Where to find/send each kind: `ASSET-LIBRARY.md`.
   How to make it look alive: `GAME-LOOK.md`.

4. **Wire sound + FX through the shared libs — and CREATE new sounds for a new engine.**
   Play audio through `BA` — `BA.setMusic(url)`, `BA.configure({sfxBase, map})`,
   `BA.sfx(...)`, `BA.unlock()` on the first tap. **Sound rule (see `ASSET-LIBRARY.md`):**
   we ship only **unique created sounds** (ElevenLabs), never computer beeps — the `BA`
   synth is a silent dev/offline fallback ONLY. A kid building a game just uses the
   catalog; but **building a NEW engine/type is the moment to CREATE fresh bespoke sounds
   + music** that fit it and register them (`SOUNDS` in `api/sfx.js`, worlds in
   `api/chess-music.js`) so they grow the company library for every other game. Then
   `BM.explode(...)`, `BM.burst(...)`, `BM.shake(...)` for feel — no copy-pasted particle
   loop. (ElevenLabs only for real music.)

5. **Bake in always-winnable.** Cap difficulty in the level *builder* so a 4–8-year-old
   can always finish: gaps ≤ jump range; hero speed ≥ enemy speed; bosses on a timer with
   a mercy auto-win; `kill-then-boss` for a guaranteed level-end. (`MECHANICS.md` §4.)

6. **Expose the QA hook.** Export a `window.*_GAME` object with `sim(idx,maxFrames)` and
   (ideally) `campaign(cap)` that runs a perfect-player bot headlessly. The shared runner
   `qa/sim-node.mjs` drives `BK_GAME.sim()` in Node and asserts ALL LEVELS WIN. Add a
   `qa-<game>.mjs` (model: `qa-breaker.mjs`) and run it before and after every change.
   _(Convergence note: hooks are currently named `BK_GAME` / `SURV_GAME` / `CROC_GAME`;
   the target is one shared name — see `MECHANICS.md` roadmap.)_

7. **Route it + give it a face.** Every `public/*.html` needs its **own explicit route in
   `vercel.json` before** the `/(.*)` → `landing.html` catch-all, or it serves the landing
   page. Add a tile/launch path in `src/BuildableKids.jsx` (full-screen iframe, like
   Typing/Chess). Creations get a **list/menu thumbnail auto-derived from their own art**
   (`api/_thumbs.js`): a saved game's thumbnail comes from its `world`/`theme`, so use a
   real library theme word; a published game can set `preview_image_url`. See the
   thumbnails note in `ASSET-LIBRARY.md`.

8. **QA the live deploy, then log it.** Commit to `main` (Vercel auto-deploys in ~1–2
   min), confirm it actually renders in the iframe (not just a 200), then add a dated
   entry to **`SESSION-LOG.md`** and the README session log. This is required for every
   change (`AGENTS.md`). _Gotcha: the library GET endpoints are edge-cached — when QA-ing
   an API live, bust the cache with a throwaway `?cb=<n>` or you'll read a stale copy._

---

## Making it multiplayer (optional)

Two kids can play together in two ways — pick by **how fast they need to see each other**.
Full rules, the frozen message contract, and the tennis blueprint are in
[`MULTIPLAYER.md`](./MULTIPLAYER.md); the short version:

- **Same device** → local two-player (pass-and-play). No backend, no accounts. Done.
- **Across devices, taking turns** (chess, board/card games) → **poll a row**: one
  family-scoped Supabase row holds the whole game state; a move updates it; the other
  device re-reads every ~2s. Reference: chess (`chess_matches` + `FamilyChess.jsx`).
- **Across devices, continuous motion** (tennis, pong) → the **real-time mechanic**: a
  Supabase Realtime **Broadcast** channel for the live ball/paddles, plus a row for the
  lobby/score.

**To make a game use the real-time mechanic, do only two things** (everything else is
inherited):

1. **Build the game to the `mp:` contract** — it stays a normal network-agnostic
   `public/<game>.html` engine that posts `mp:ready`, broadcasts **positions not
   commands** via `mp:send`, applies `mp:peer`, honors its `role` (host owns the ball;
   each kid broadcasts only their own paddle), and ends with `mp:result`.
2. **Launch it through the shared layer**, not a bare iframe:
   `<FamilyRealtime game={{ slug, url, title }} activeKid={…} />`. That gives you the
   lobby, the live channel, role assignment, the reaction safety check, and the
   score write-back for free, reusing the one `rt_matches` table.

A generation prompt can simply say **"use the real-time multiplayer mechanic"**
(`game_mechanics` slug `mp-realtime-broadcast`).

**Multiplayer rules (always):** requires the parent-account lane (guests can't play
cross-device); every match table is family-RLS scoped (copy `chess_matches`/`rt_matches`);
**canned reactions only — never free-text chat between kids**; the engine stays
network-agnostic (all Supabase code lives in the React layer).


## The non-negotiable rules (from `AGENTS.md` / README — they apply here too)

- **Kids' product.** Age-appropriate always; preserve content moderation and the
  validate-before-serve fallback in `generate-game.js`.
- **One shared start screen — change it once, every game updates.** Every game's
  launch / level-select screen is rendered by `buildable-startscreen.js` (`BS`). Do NOT
  hand-roll a per-game menu (`showMenu`/`buildLevelPicker`/`#levelSelect`) or fork BS's
  markup into an engine — feed `BS` a config and keep a tiny fallback. Editing that one
  file restyles the start experience across survival, croc, breaker, platformer, and
  tennis at once, instead of changing each game 1×1. (Breaker is the reference adoption.)
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
