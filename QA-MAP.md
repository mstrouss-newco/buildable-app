# QA-MAP.md — one list of everything on the site

**Card QA1** ("The Map: one list of everything on the site"), phase **QA — Whole-site
QA: find everything, then fix in batches**.

This is the *find* half of the QA phase. It fixes nothing. It exists so that QA2
(`qa-all.mjs`, the release gate) and the QA3a–QA3e journey sweeps have a single
checklist to work from, and so nobody has to re-derive "what is actually on this
site" ever again.

Built by reading the repo: `vercel.json` (every route), `src/BuildableKids.jsx`
(`GAME_CATALOG`, `MAKE_CATALOG`, `LANDING_WRAP`, the `SCREEN_*` table),
`public/**/*.html`, `public/explore/*.json` (the Kidspedia shelf), `api/*.js` and
every `qa-*.mjs` harness.

**Re-checked against `main` on 2026-09-06** (session QA-SUITE), when QA1 and QA2's
deliverables were finally landed on `main` — they had been ticked done in August
but lived only on a branch. The drift since the map was written is marked
**[2026-09-06]** wherever it appears below.

## How to read this map

Every row answers the three questions QA1 asks, with no blanks and no "unknown":

- **S H N M** — the four shared building blocks, in order. A letter means the page
  loads it, `·` means it does not.
  - **S** = `buildable-startscreen.js` (the shared start/level screen)
  - **H** = `buildable-hud.js` (the shared in-game HUD)
  - **N** = `buildable-gamenav.js` (the shared Home / back nav inside a game)
  - **M** = `buildable-manifest.js` (the manifest loader)
- **QA harness** — the `qa-*.mjs` file(s) that name this page. **none** means no
  harness mentions it. It does **not** mean the harness passes: proving that is
  QA2's job, not this card's.
- **Shelf** — `live`, or `soon` for a tile behind the coming-soon **1111** gate.

Counts, so a future session can tell at a glance whether this map has drifted:

| Thing | Count | Was (Aug) |
|---|---|---|
| Pages under `public/` (`*.html`) | **57** | 53 |
| Home tiles in `GAME_CATALOG` | 27 (21 live, 6 soon) | unchanged |
| Make tiles in `MAKE_CATALOG` | 5 (3 live, 2 soon) | unchanged |
| Kidspedia books planned / shelved today | 20 / 14 | unchanged |
| Kidspedia labs (exhibit templates) | 3 | unchanged |
| `qa-*.mjs` harnesses in the repo root | **60** | 51 |
| API functions in `api/` | **88** | 87 |
| Public pages with **no** harness | **13** | 16 |
| Harnesses quarantined in the gate | **1** | 3 |

**[2026-09-06] What moved.** Five pages arrived — `practice.html`,
`minutemath.html`, `cobuild.html`, `audio-check.html`, `audio-watch.html` — and
`chess-look-mock.html` was deleted (commit `51d96cb`, CP2). Nine harnesses
arrived: `qa-practice.mjs`, `qa-practice-shot.mjs`, `qa-art-browser.mjs`,
`qa-farm.mjs`, and the five written by card QA9 (§8a). The repo-root
`qa-all.mjs` that briefly existed alongside `scripts/qa-all.mjs` was folded into
it and deleted, so `npm run qa` is now the only gate.

---

## 1. The shell — `/app`

One React app, `src/BuildableKids.jsx` (**5,174 lines** [2026-09-06]) plus 17
sibling components.
Vercel rewrites `/app`, `/app/*`, `/admin` and `/admin.html` to `index.html`; the
shell then routes internally through its `SCREEN_*` table. Games are **not**
separate documents to the kid — the shell mounts each engine page in a `GameFrame`
iframe.

### Stable addresses (survive a reload; `viewToPath` / `screenForPath`)

| Address | Screen | QA harness |
|---|---|---|
| `/app` | Home | `qa-nv2.mjs` |
| `/app/play` | Play section page | `qa-nv1.mjs`, `qa-nv3.mjs` |
| `/app/make` | Make section page | `qa-nv3.mjs` |
| `/app/explore` | Explore section page | `qa-nv3.mjs` |
| `/app/me` (alias `/app/creations`) | My Stuff | `qa-nv4.mjs` |
| `/app/lessons` | Lessons | `qa-lessons.mjs`, `qa-lessons-dom.mjs` |
| `/app/practice` | Practice — the shared deck engine (session PT1) **[2026-09-06]** | `qa-practice.mjs`, `qa-practice-shot.mjs` |
| `/app/explore/<id>` | One exhibit / book | `qa-explore.mjs`, `qa-topic.mjs` |
| `/app/breaker`, `/breaker/journey`, `/breaker/loadout` | Breaker landing / journey / loadout | `qa-breaker.mjs` |
| `/app/tennis`, `/app/chess`, `/app/music-maker` | Those landings | `qa-tennis.mjs`, `qa-chess.mjs`, `qa-music.mjs` |
| `/app/<catalog id>` | Generic game landing (any `LANDING_WRAP` id) | per-game, see §2 |

Every other screen is **transient by design** (in-game play, journeys, lobbies, the
make-a-game flow, grown-ups, admin): it writes no address, so a reload falls back to
the last stable one. That is intentional, not a bug — QA3a should not file it.

### Shell components

| File | What it is | QA harness |
|---|---|---|
| `src/BuildableKids.jsx` | The whole shell: Home, section pages, all landings, all `GameFrame` mounts | `qa-nv1.mjs`, `qa-nv2.mjs`, `qa-nv3.mjs`, `qa-nv4.mjs`, `qa-nv4-dom.mjs`, `qa-skyflyer-hud.mjs`, `qa-quickgame.mjs` |
| `src/AdminDashboard.jsx` | `/admin` — stats, games, songs, cleanup | **none** |
| `src/GrownUpScreen.jsx` | Grown-ups portal | **none** |
| `src/GrownUpFriends.jsx` | Friends management for grown-ups | **none** |
| `src/MyStuff.jsx` | Me tab — saved creations | `qa-nv4.mjs` |
| `src/CreatorScreen.jsx` | Make-a-game character/level creator | **none** |
| `src/MusicMaker.jsx` | Music Maker studio (the only `type: "studio"` in `GAME_CATALOG`) | `qa-music.mjs` |
| `src/StoryMaker.jsx`, `src/StoryReader.jsx` | Story Maker (gated `soon`) and its reader | **none** |
| `src/QuickGame.jsx`, `src/quickgame-content.js` | The short game that replaced the Kidspedia quiz popup | `qa-quickgame.mjs` |
| `src/FamilyChess.jsx`, `src/FamilyCheckers.jsx`, `src/FamilyRealtime.jsx`, `src/FamilyTown.jsx` | Family / online multiplayer wrappers | **none** |
| `src/GameLobby.jsx` | Shared lobby for turn-based online games | **none** |
| `src/TopBoard.jsx` | Top creations board | **none** |
| `src/LoadingGames.jsx`, `src/HelperReactions.jsx` | Loading filler, helper buddy reactions | **none** |
| `src/store.js`, `src/lib/`, `src/utils/` | State, Supabase client, helpers | **none** |

> `qa-quickgame.mjs` asserts `src/QuizGate.jsx` does **not** exist. It does not
> exist. That is a pass, not a missing file.

---

## 2. Home tiles — `GAME_CATALOG`, in shelf order

27 tiles. Every Play card on Home and `/app/play` is generated from this list, so
this table *is* the Play shelf.

| # | Tile | id | Category | Shelf | Engine page | S H N M | QA harness |
|---|---|---|---|---|---|---|---|
| 1 | Sky Flyer | `skyflyer` | Action | live | `/skyflyer-engine.html` | · · N · | `qa-skyflyer.mjs`<br>`qa-skyflyer-hud.mjs`<br>`qa-skyflyer-look.mjs`<br>`qa-skyflyer-sky.mjs` |
| 2 | Breaker | `breaker` | Arcade | live | `/breaker-engine.html` | S H N M | `qa-breaker.mjs` |
| 3 | Music Maker | `music-maker` | Studio | live | React `src/MusicMaker.jsx` | n/a | `qa-music.mjs` |
| 4 | Chess | `chess` | Board | live | `/buildable-chess.html` | · · · M | `qa-chess.mjs` |
| 5 | Sling Squad | `sling` | Action | live | `/sling-squad.html` | S H N M | `qa-sling.mjs` |
| 6 | Tic-Tac-Toe | `tictactoe` | Classic | live | `/tictactoe-engine.html` | S · N M | `qa-tictactoe.mjs` |
| 7 | Survival | `survival` | Action | live | `/survival-engine.html` | S H N M | `qa-survival.mjs` |
| 8 | String Match | `stringmatch` | Classic | live | `/string-match.html` | S · · M | `qa-stringmatch.mjs` |
| 9 | Bubble Buddies | `bubble` | Arcade | live | `/bubble-engine.html` | S · N M | `qa-bubble.mjs` |
| 10 | Tennis | `tennis` | Sports | live | `/tennis.html` | S · · M | `qa-tennis.mjs` |
| 11 | Castle Guard | `castleguard` | Strategy | live | `/castle-guard.html` | S · N M | `qa-castleguard.mjs` |
| 12 | Tumble Blocks | `tumble` | Puzzle | live | `/tumble-engine.html` | S · N · | `qa-tumble.mjs` |
| 13 | Croc Tot | `croctot` | Action | live | `/croctot.html` | S H N M | `qa-croc.mjs` |
| 14 | Riley's Garden | `rileys-garden` | Action | live | `/rileys-garden.html` | · · · M | `qa-rileys.mjs` |
| 15 | Connect Four | `connectfour` | Classic | live | `/connectfour-engine.html` | S · N M | `qa-connectfour.mjs` |
| 16 | Dots and Boxes | `dotsboxes` | Classic | live | `/dotsboxes-engine.html` | S · N M | `qa-dotsandboxes.mjs` |
| 17 | Checkers | `checkers` | Classic | live | `/buildable-checkers.html` | · · · M | `qa-checkers.mjs`<br>`qa-checkers-dom.mjs` |
| 18 | Typing | `typing` | Classic | live | `/typing.html` | · · · M | `qa-typing.mjs` |
| 19 | Memory Match | `memory` | Puzzle | live | `/memory-engine.html` | S · · M | `qa-memory.mjs` |
| 20 | Mahjong | `mahjong` | Classic | live | `/mahjong-engine.html` | S · · M | `qa-mahjong.mjs` |
| 21 | Math Cannon | `mathcannon` | Learning | live | `/mathcannon-engine.html` | S H N M | `qa-mathcannon.mjs` |
| 22 | Hop Heroes | `platformer` | Action | **soon** | `/play.html` | · · · · | **none** |
| 23 | Family Town | `town` | Board | **soon** | `/family-town.html` | S · · · | `qa-family-town.mjs` |
| 24 | Sunny Town Drive | `runner` | Arcade | **soon** | `/runner-engine.html` | S · N · | `qa-runner.mjs` |
| 25 | Hilltop Tanks | `tank` | Action | **soon** | `/tank-engine.html` | S · N · | `qa-tank.mjs` |
| 26 | Maze Munchers | `maze` | Arcade | **soon** | `/maze-engine.html` | S · N · | `qa-maze.mjs` |
| 27 | Bingo | `bingo` | Classic | **soon** | `/bingo-engine.html` | S · · M | `qa-bingo.mjs` |

Games marked `multiplayer: true` in the catalog — Chess, Tic-Tac-Toe, Tennis,
Connect Four, Dots and Boxes, Checkers, Memory Match, Family Town — also have an
online/family path through `src/GameLobby.jsx` + `api/invite.js`
(`qa-invite.mjs`) and `/play-invite.html`. That path is **QA3d**'s "one turn of a
turn-based game" step.

## 3. Make tiles — `MAKE_CATALOG`

| Tile | id | Category | Shelf | Where it goes | QA harness |
|---|---|---|---|---|---|
| Make a song | `song` | Music | live | React Music Maker → `/song.html` for a shared song | `qa-music.mjs` |
| Sound Machine | `sound` | Sound | live | `/soundboard.html` | **none** |
| Make art | `art` | Art | live | `/art-studio.html` | `qa-art.mjs` |
| Make a story | `story` | Stories | **soon** + gated | `src/StoryMaker.jsx` → `/story.html` | **none** |
| Make a game | `game` | Games | **soon** | `src/CreatorScreen.jsx` → `api/generate-game.js` | **none** |

## 4. Explore — Kidspedia

Three **labs** (bespoke exhibit templates) and 20 planned **books** (one shared
template). `public/kidspedia.html` reads `public/explore/bookshelf.json` for the
shelf order, then loads each book's own `/explore/<id>.json` and shows **only**
books whose `status` is `approved`.

### Labs

| Lab | Address | Page | S H N M | QA harness |
|---|---|---|---|---|
| Journey to the Deep | `/explore/ocean-deep` | `/dive.html` | · · N · | `qa-dive.mjs` |
| Make It Rain (Weather Lab) | `/explore/make-it-rain` | `/weather.html` | · · N · | `qa-weather.mjs` |
| Solar System (orbit explorer) | `/explore/solar-system`, and any unlisted id | `/orbit-explorer.html` | · · N · | `qa-explore.mjs` |

### Books — all 20, on `/topic.html` (· · N ·, `qa-topic.mjs` + `qa-kidspedia.mjs`)

`status` decides whether the book is on the shelf **today**. This is the shelf's
designed behaviour, not breakage — but QA3d should expect **14 books, not 20**.

| Shelf | Book ids | `status` |
|---|---|---|
| Animals | `sharks`, `big-cats`, `penguins`, `bugs-butterflies` | approved |
| Animals | `snakes-reptiles` | **in-review** (not shelved) |
| Long, long ago | `dinosaurs`, `castles-knights`, `ancient-egypt` | approved |
| Out in space | `moon` | approved |
| Out in space | `planets`, `rockets` | **in-review** (not shelved) |
| Our wild world | `deserts`, `plants-grow`, `rainforest`, `your-body` | approved |
| Our wild world | `deep-ocean`, `wild-weather`, `volcanoes` | **in-review** (not shelved) |
| Big machines | `trains`, `diggers` | approved |

Shelved today: **14** (`sharks`, `big-cats`, `penguins`, `bugs-butterflies`,
`dinosaurs`, `castles-knights`, `ancient-egypt`, `moon`, `deserts`, `plants-grow`,
`rainforest`, `your-body`, `trains`, `diggers`).
Awaiting approval: **6** (`snakes-reptiles`, `planets`, `rockets`, `deep-ocean`,
`wild-weather`, `volcanoes`).

## 5. Learn — Lessons

| Thing | Where | QA harness |
|---|---|---|
| Lessons player | `/lessons.html`, `/app/lessons` | `qa-lessons.mjs`, `qa-lessons-dom.mjs` |
| Lesson index | `public/lessons/index.json` | `qa-lessons.mjs` |
| Shipped lesson | `public/lessons/g1-making-ten.json` (**one** lesson exists) | `qa-lessons.mjs` |
| Lesson art | `public/lessons/art/` | `qa-lessons.mjs` |
| Question bank generator | `api/generate-question-bank.js`, `api/_curriculum.js`, `api/_quizgen.js` | `qa-question-bank.mjs` |
| Lesson review (grown-up) | `/lesson-review.html` | `qa-lessons.mjs` |
| Question review (grown-up) | `/question-review.html` | **none** |
| Minute Math **[2026-09-06]** | `/minutemath.html`, `/minutemath` — reached from `lessons.html` via `window.__minuteMath` | `qa-minutemath.mjs` |

### Practice — the shared deck engine (session PT1) **[2026-09-06]**

Practice is its own kid-facing surface, not part of Lessons. The shell mounts it
at `/app/practice` through a `GameFrame` on `/practice`; the engine is
`public/buildable-practice.js` with `public/practice.html` as the page.

| Thing | Where | QA harness |
|---|---|---|
| Practice page | `/practice.html`, `/practice`, `/app/practice` | `qa-practice.mjs` |
| Practice engine | `public/buildable-practice.js` | `qa-practice.mjs` |
| Decks and word audio | `public/practice/decks/`, `public/practice/audio/` | `qa-practice.mjs` |
| How the screens LOOK | real Chromium screenshots | `qa-practice-shot.mjs` (SKIPs without playwright) |

`qa-practice.mjs` asserts its own routes — `/practice`, `/practice.html`, the
decks and the audio — which is the check whose absence let Practice ship dead in
the first place. See §8c.7.

---

## 6. Every page under `public/` — all 57 **[2026-09-06]**

Grouped by what they are. **[2026-09-06] Every one now has an explicit
`vercel.json` route**, `feedback.html` included — that gap (§8c.1, card QA4) has
been closed. `landing.html` needs no route of its own: it is the catch-all's own
destination. The gate proves this on every push, so this paragraph can no longer
go quietly stale.

### 6a. Game engine pages (26) — covered by the table in §2

`/skyflyer-engine.html` · `/breaker-engine.html` · `/buildable-chess.html` ·
`/sling-squad.html` · `/tictactoe-engine.html` · `/survival-engine.html` ·
`/string-match.html` · `/bubble-engine.html` · `/tennis.html` ·
`/castle-guard.html` · `/tumble-engine.html` · `/croctot.html` ·
`/rileys-garden.html` · `/connectfour-engine.html` · `/dotsboxes-engine.html` ·
`/buildable-checkers.html` · `/typing.html` · `/memory-engine.html` ·
`/mahjong-engine.html` · `/mathcannon-engine.html` · `/play.html` ·
`/family-town.html` · `/runner-engine.html` · `/tank-engine.html` ·
`/maze-engine.html` · `/bingo-engine.html`

### 6b. Kidspedia pages (5)

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/kidspedia.html` | The bookshelf | `/explore/kidspedia` | · · · · | `qa-kidspedia.mjs` |
| `/topic.html` | Shared topic-book template (all 20 books) | shelf + `/explore/<book>` | · · N · | `qa-topic.mjs`, `qa-kidspedia.mjs`, `qa-quickgame.mjs` |
| `/dive.html` | Layers-cutaway lab | `/explore/ocean-deep`, Explore page | · · N · | `qa-dive.mjs`, `qa-quickgame.mjs` |
| `/weather.html` | Weather lab | `/explore/make-it-rain`, Explore page | · · N · | `qa-weather.mjs`, `qa-quickgame.mjs` |
| `/orbit-explorer.html` | Orbit exhibit template | `/explore/*` catch-all | · · N · | `qa-explore.mjs`, `qa-quickgame.mjs` |

### 6c. Studio, maker and shared-output pages (5)

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/art-studio.html` | Art Studio | Make tile "Make art" | · · · · | `qa-art.mjs` |
| `/soundboard.html` | Sound Machine (`/sounds`) | Make tile "Sound Machine" | · · · · | **none** |
| `/song.html` | A shared song (`/p/<id>`) | Share link | · · · · | **none** |
| `/story.html` | A shared story (`/s/<id>`) | Share link, `src/TopBoard.jsx` | · · · · | **none** |
| `/play-invite.html` | Guest "grandma flow" — play a friend without an account | Invite link | · · · · | **none** (backend has `qa-invite.mjs`) |

### 6c-bis. Learn and Practice pages (2) **[2026-09-06]**

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/practice.html` | Practice — the shared deck engine (sight words, then numbers) | Home "Practice" door, `/app/practice` | · · · · | `qa-practice.mjs`, `qa-practice-shot.mjs` |
| `/minutemath.html` | Minute Math — the timed arithmetic sheet | `lessons.html` (`window.__minuteMath`) | · · N · | `qa-minutemath.mjs` |

`/lessons.html` itself is listed under §5.

### 6d. Grown-up, parent and admin pages (6) **[2026-09-06]**

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/landing.html` | Marketing landing + the `/(.*)` catch-all target | `buildablekids.com`, `?stay=1` for returning | · · · · | **none** |
| `/partner.html` | Partner overview (`/partner`) | Direct link | · · · · | **none** |
| `/lesson-review.html` | Grown-up lesson review (`/lesson-review`) | Direct link | · · · · | `qa-lessons.mjs` |
| `/question-review.html` | Grown-up question review (`/question-review`) | Direct link | · · · · | **none** |
| `/feedback.html` | Share Feedback | **routed since QA4, but still nothing links to it — see §8c.1** | · · · · | **none** |
| `/cobuild.html` | Cobuild — "build a game with your kid", a lead page backed by `api/cobuild-lead.js` **[2026-09-06]** | Direct link (`/cobuild`) | · · · · | **none** |

The Grown-ups portal, parent dashboard, login and signup are **shell screens**, not
pages under `public/` — see §1. `/admin` and `/admin.html` also rewrite to the
shell (`src/AdminDashboard.jsx`).

### 6e. Internal tools (5) **[2026-09-06]**

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/editor.html` | Game editor (`/editor`) | Direct link | · · · M | `qa-kits.mjs`, `qa-kp3-add-a-kit.mjs` |
| `/asset-library.html` | Asset library / Browse (`/asset-library`) | Direct link, `buildable-slicer.js` | · · · · | `qa-kits.mjs`, `qa-ap2-use-in-game.mjs` |
| `/planner.html` | The roadmap planner (`/planner`) — this card's own source of truth | Direct link | · · · M | **none** |
| `/audio-check.html` | Sound check — probes `/api/sfx` and gives a verdict **[2026-09-06]** | Direct link | · · · · | **none** |
| `/audio-watch.html` | Sound watch — the same probe, left running **[2026-09-06]** | Direct link | · · · · | **none** |

### 6f. Mocks, art references and superseded pages (8) **[2026-09-06]**

Not kid-facing. QA3a–QA3e should **skip** these; QA2's headless page load should
still open them, because a mock that throws still costs a console error.

| Page | What it is | Status | S H N M | QA harness |
|---|---|---|---|---|
| `/skyflyer-mock.html` | Sky Flyer FL1 mock | Design reference | · · · · | **none** |
| ~~`/chess-look-mock.html`~~ | Chess look, before/after | **Deleted** 2026-09-06 in commit `51d96cb` (CP2) | — | — |
| `/skyflyer-farm.html` | Sky Flyer farm corner (FM1) | Work in progress | · · · · | `qa-skyflyer.mjs` |
| `/story-directions.html` | Story art directions | Design reference | · · · · | **none** |
| `/story-directions-cabin.html` | Cabin quality-tier test | Design reference | · · · · | **none** |
| `/antcity-art-gallery.html` | Ant City AI art (`/antcity-art`) | Design reference | · · · · | **none** |
| `/croc-engine.html` | Older Croc Tot engine | **Superseded** by `/croctot.html`; still routed, nothing links to it | · · · · | **none** |
| `/snakes-engine.html` | Snakes and Ladders | **Orphaned** — see §8 | S · · · | `qa-snakes.mjs` |
| `/play.html` | Titled "Buildable Runner — engine", wired as the **Hop Heroes** tile | Live behind the 1111 gate | · · · · | `qa-play.mjs` **[2026-09-06]** |

---

## 7. The 60 QA harnesses, and what each one guards **[2026-09-06]**

| Harness | Guards |
|---|---|
| `qa-ap2-use-in-game.mjs` | "Use in a game" flow on the Browse page |
| `qa-art.mjs` | `/art-studio.html` + `buildable-renders.js` |
| `qa-art-browser.mjs` | Art Studio in a real browser **[2026-09-06]** |
| `qa-bingo.mjs` | `/bingo-engine.html` |
| `qa-breaker.mjs` | `/breaker-engine.html` + `/breaker/manifest.json` |
| `qa-bubble.mjs` | `/bubble-engine.html` |
| `qa-castleguard.mjs` | `/castle-guard.html` |
| `qa-checkers.mjs` / `qa-checkers-dom.mjs` | `/buildable-checkers.html` (rules+bot / jsdom render) |
| `qa-chess.mjs` | `/buildable-chess.html` + `/chess/manifest.json` |
| `qa-connectfour.mjs` | `/connectfour-engine.html` |
| `qa-croc.mjs` | `/croctot.html` manifest + wiring |
| `qa-dive.mjs` | `/dive.html` |
| `qa-dotsandboxes.mjs` | `/dotsboxes-engine.html` |
| `qa-explore.mjs` | `/orbit-explorer.html` + every `public/explore/*.json` |
| `qa-family-town.mjs` | `/family-town.html` |
| `qa-farm.mjs` | `/skyflyer-farm.html` — the farm corner, in a real browser **[2026-09-06]** |
| `qa-invite.mjs` | `api/invite.js` (guest flow) |
| `qa-kidspedia.mjs` | `/kidspedia.html` bookshelf |
| `qa-kits.mjs` | Kit shelf: `/asset-library.html`, `/editor.html`, `public/kenney/` |
| `qa-kp3-add-a-kit.mjs` | Add-a-kit loop from the editor |
| `qa-lessons.mjs` / `qa-lessons-dom.mjs` | `/lessons.html` + `public/lessons/*.json` + `api/lesson-questions.js` |
| `qa-mahjong.mjs` | `/mahjong-engine.html` |
| `qa-mathcannon.mjs` | `/mathcannon-engine.html` |
| `qa-maze.mjs` | `/maze-engine.html` |
| `qa-memory.mjs` | `/memory-engine.html` |
| `qa-minutemath.mjs` | `/minutemath.html` — routing, shape, and the arithmetic generator itself **[2026-09-06, card QA9]** |
| `qa-music.mjs` | Music Maker studio contract |
| `qa-nv1.mjs` | 5-tab bottom bar + Play page |
| `qa-nv2.mjs` | New Home screen + live door counts |
| `qa-nv3.mjs` | Make / Explore / Learn / Me section pages |
| `qa-nv4.mjs` / `qa-nv4-dom.mjs` | Nav polish + phone-width discipline |
| `qa-play.mjs` | `/play.html` — the Hop Heroes engine page **[2026-09-06, card QA9]** |
| `qa-play-invite.mjs` | `/play-invite.html` — the guest "grandma flow" front end **[2026-09-06, card QA9]** |
| `qa-practice.mjs` | `/practice.html` + `buildable-practice.js` + the decks, audio and routes **[2026-09-06]** |
| `qa-practice-shot.mjs` | Real screenshots of the Practice screens (SKIPs without playwright) **[2026-09-06]** |
| `qa-question-bank.mjs` | `api/generate-question-bank.js`, `_curriculum.js`, `_quizgen.js` |
| `qa-quickgame.mjs` | `src/QuickGame.jsx` on `topic` / `dive` / `weather` / `orbit-explorer` |
| `qa-rileys.mjs` | `/rileys-garden.html` art + audio + engine + manifest |
| `qa-rn1.mjs` | RN1 — "done has to mean it is in the app" (the planner git gate) |
| `qa-runner.mjs` | `/runner-engine.html` |
| `qa-skyflyer.mjs` | Sky Flyer manifest + a real flight |
| `qa-skyflyer-hud.mjs` | FL9 — shell chrome vs game HUD, measured together |
| `qa-skyflyer-look.mjs` | FL6 — the offer card layout (LOOK RULE 19) |
| `qa-skyflyer-sky.mjs` | FL8 — clouds and sun rays (LOOK RULE 19) |
| `qa-share-links.mjs` | `/song.html` and `/story.html` — the two share-link pages, as one system **[2026-09-06, card QA9]** |
| `qa-sling.mjs` | `/sling-squad.html` + `/sling/manifest.json` |
| `qa-snakes.mjs` | `/snakes-engine.html` |
| `qa-soundboard.mjs` | `/soundboard.html` — every pad plays a sound `api/sfx.js` knows **[2026-09-06, card QA9]** |
| `qa-stringmatch.mjs` | `/string-match.html` |
| `qa-survival.mjs` | `/survival-engine.html` + `/survival/manifest.json` |
| `qa-tank.mjs` | `/tank-engine.html` |
| `qa-tennis.mjs` | `/tennis.html` |
| `qa-tictactoe.mjs` | `/tictactoe-engine.html` |
| `qa-topic.mjs` | `/topic.html` + every topic-book JSON |
| `qa-tumble.mjs` | `/tumble-engine.html` |
| `qa-typing.mjs` | `/typing.html` |
| `qa-weather.mjs` | `/weather.html` |

Plus the shared harness helpers under `qa/`: `qa/qa-map.mjs`, `qa/sim-node.mjs`,
`qa/game-qa-harness.html`.

**The runner** is `scripts/qa-all.mjs` — `npm run qa`, and **[2026-09-06]** the only
gate there is. It does three things: the **serving check** (every
`public/buildable-*.js` and `public/*.html` has a `vercel.json` route ahead of the
`/(.*)` catch-all, plus `--live` to fetch each one from production), the **machine
sweep** (all 60 harnesses), then the **page sweep** (serves `public/` and opens every
page in headless Chromium, failing on a console error, an uncaught error or a missing
file). It prints one table, writes `QA-SWEEP-REPORT.md`, and exits non-zero on any
failure.

**[2026-09-06] One harness is quarantined**, not three: `qa-ap2-use-in-game.mjs`
(card **QA10**) still asserts 2 `.useg` buttons on a page that renders 307.
`qa-lessons.mjs` and `qa-lessons-dom.mjs` were quarantined under card **QA11** for
pre-NV2 Home assertions; both pass on today's `main`, so they are back in the gate
for real. See AGENTS.md for the rule that no card is `done` without a green run.

---

## 8. What the map turned up

QA1 is **find only**. Everything here is recorded, not fixed. Each item is written
so QA2 or a later fix card can pick it up without re-deriving it.

Each actionable finding got a planner card in phase QA — **QA4** (feedback.html),
**QA5** (Snakes and Ladders), **QA6** (croc-engine.html), **QA7** (play.html title),
**QA8** (the ten games without shared nav) and **QA9** (harness coverage). The two
content gaps in §8c — the six in-review books and the single shipped lesson — got no
card: both are designed or planned state, not breakage.

**[2026-09-06] Where those cards stand on `main`:** QA4 is effectively done —
`feedback.html` is routed now (though still nothing links to it). QA9 is done — see
§8a. QA5, QA6, QA7 and QA8 are all still open and still true, re-verified against
today's `main`.

### 8a. Coverage gaps — card **QA9**, DONE **[2026-09-06]**

The August list was 16 pages with no harness. Every kid-facing one on it now has
a real harness, written by card QA9:

| Page | Harness | What it now guards |
|---|---|---|
| `/soundboard.html` | `qa-soundboard.mjs` | all 133 pads across 10 packs play a key `api/sfx.js` knows, so no pad is a silent dead button |
| `/play-invite.html` | `qa-play-invite.mjs` | the guest flow's front end, and that every action it sends is one `api/invite.js` handles |
| `/song.html`, `/story.html` | `qa-share-links.mjs` | the pretty share route resolves and really lands on the page (directly, or via the og-tag API that serves it) |
| `/play.html` | `qa-play.mjs` | the Hop Heroes engine page, including its one RELATIVE script tag |
| `/minutemath.html` (new since August) | `qa-minutemath.mjs` | routing, shape, and 10,000 generated problems checked for correct answers |

Every one of them opens with the same reachability check the gate runs, because
a harness passing on a page the server never serves is exactly how Practice
shipped dead (§8c.7).

**Still with no harness — 13 pages, and that is the right answer for 11 of them:**

`/antcity-art-gallery.html` · `/skyflyer-mock.html` · `/story-directions.html` ·
`/story-directions-cabin.html` (design references) · `/croc-engine.html`
(superseded, card QA6) · `/audio-check.html` · `/audio-watch.html` ·
`/planner.html` (internal tools) · `/cobuild.html` (a lead page) ·
`/feedback.html` and `/partner.html` (grown-up pages nothing links to).

The two that still carry real behaviour with no check are **`/landing.html`**
(the front door) and **`/question-review.html`** (grown-up question review). Both
get the gate's headless console-error load and nothing more.

> A note on method, because the naive grep now lies: `/landing.html` is *named*
> in five harnesses, but only inside failure messages ("the server would send
> landing.html instead"). Being mentioned is not being checked.

No shell component outside `BuildableKids.jsx`, `MyStuff.jsx`, `MusicMaker.jsx` and
`QuickGame.jsx` has a harness — notably `AdminDashboard.jsx`, `GrownUpScreen.jsx`,
`GrownUpFriends.jsx`, `CreatorScreen.jsx`, `StoryMaker.jsx`, `GameLobby.jsx` and the
four Family multiplayer wrappers.

### 8b. Shared building blocks — who is still off-format  → card **QA8**

The consistency work converted the engines one at a time; §2 shows exactly how far
it got. Five games use the full set (S H N M): Breaker, Sling Squad, Survival, Croc
Tot, Math Cannon.

- **No shared blocks at all:** `/play.html` (Hop Heroes).
- **Manifest only, no start screen and no shared nav:** Chess, Checkers, Riley's
  Garden, Typing.
- **No shared nav (`buildable-gamenav.js`):** Chess, Checkers, Riley's Garden,
  Typing, String Match, Tennis, Memory Match, Mahjong, Bingo, Family Town — ten
  games whose in-game Home/back button is hand-rolled. This is the most likely
  source of the "Back lands somewhere odd" findings QA3b/QA3c are looking for.
- **No manifest loader:** Sky Flyer, Tumble Blocks, Hop Heroes, Family Town, Sunny
  Town Drive, Hilltop Tanks, Maze Munchers.
- **Sky Flyer** is the outlier among live games: shared nav only, no start screen
  and no manifest loader, despite being tile #1.

### 8c. Specific things found while building the map

1. **`/feedback.html` was unreachable in production.** → card **QA4**, **route fixed
   [2026-09-06]**. It used to be the only page under `public/` with no entry in
   `vercel.json`, and `vercel.json` uses legacy `routes` with no
   `handle: filesystem` phase, so the final `"/(.*)" → /landing.html` catch-all
   swallowed it. It now has `/feedback.html` and `/feedback` routes and the gate's
   serving check would catch a regression immediately. **The other half of the
   finding still stands: nothing in the repo links to it**, so the page is reachable
   but undiscoverable.
2. **Snakes and Ladders is orphaned.** → card **QA5**, **still true [2026-09-06]**.
   `/snakes-engine.html` exists, works and is guarded by `qa-snakes.mjs`;
   `SCREEN_SNAKES` and `SnakesScreen` exist in the shell; `onSnakes` is passed to the
   Home screen (now `src/BuildableKids.jsx:2063`) — and **is still never consumed**.
   There is no `GAME_CATALOG` entry for it, so no tile renders and no kid can
   reach it.
3. **`/croc-engine.html` is dead but still routed.** → card **QA6**, **still true
   [2026-09-06]**. Croc Tot ships from `/croctot.html`. Nothing links to
   `croc-engine.html`, yet `vercel.json` keeps a route for it.
4. **`/play.html` is titled "Buildable Runner — engine"** → card **QA7**, **still true
   [2026-09-06]**. It is mounted as the **Hop Heroes** platformer tile, while a
   *different* page, `/runner-engine.html`, is the actual Sunny Town Drive runner.
   Confusing to anyone reading either file cold. `qa-play.mjs` prints this as a NOTE
   rather than a failure, and will flip to a PASS telling you to update this entry
   once the title is fixed.
5. **The Kidspedia shelf shows 14 of 20 books.** Six books are `status: "in-review"`
   and correctly hidden. QA3d should count 14 and not file the other six as
   missing. *(No card: designed behaviour, not a defect.)*
6. **Only one lesson exists** (`public/lessons/g1-making-ten.json`). The Learn
   section is real but nearly empty. **[2026-09-06] Still one lesson**, but Learn
   is no longer nearly empty in practice: Practice (the shared deck engine) and
   Minute Math both shipped since, and both are covered. *(No card: a content gap,
   not a defect.)*

7. **Practice shipped completely dead, and no harness noticed. [2026-09-06]**
   `qa-practice.mjs` passed the whole time, but `public/buildable-practice.js` had
   no route in `vercel.json`, so the `/(.*)` catch-all served `landing.html` in its
   place and the browser threw `Unexpected token '<'`. The page told kids "The sets
   would not load." This is the reason the gate now begins with a serving check, and
   the reason every harness written for card QA9 begins with one too. **A passing
   harness does not mean the thing is reachable.** *(Fixed; kept here because it is
   the cautionary tale the whole QA phase is built around.)*

### 8d. `GAME-CONSISTENCY-AUDIT.md` — not in this repo

QA1 asks to fold in that file's still-unfixed findings. **It is not in the
repository**, and never has been: it is absent from `main`, from every branch, and
from the full git history (`git log --diff-filter=A` finds no commit that ever added
it). The only trace is a prose reference in `README.md:2268` recording that Croc Tot
was "the most 'off' live game in the consistency audit" and has since been
converted — which §2 confirms (Croc Tot now carries all four blocks).

The audit lives in the Claude project's knowledge, alongside
`claude/QA-whole-site-plan.md`, which this session also cannot read. Rather than
guess at its contents, §8b re-derives the same ground first-hand from the source:
every page, every shared block, present or absent. If the original audit is later
added to the repo, its residue should be diffed against §8b and any finding not
already covered appended here.

---

## Keeping this map honest

- A new game is a `GAME_CATALOG` entry: add a row to §2 in the same session.
- A new page under `public/` needs a row in §6 **and** a `vercel.json` route —
  §8c.1 is what happens when the route is forgotten.
- A new `qa-*.mjs` needs a row in §7. `npm run qa` (`scripts/qa-all.mjs`) runs the
  harnesses; this file says which ones should exist.
- A harness added to or released from the `QUARANTINE` table in
  `scripts/qa-all.mjs` needs the §7 quarantine paragraph updated in the same
  session. A quarantine nobody revisits is a check quietly switched off.
- The counts table at the top is the drift check. If a count no longer matches the
  repo, this map is stale.
