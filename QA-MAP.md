# QA-MAP.md — one list of everything on the site

**Card QA1** ("The Map: one list of everything on the site"), phase **QA — Whole-site
QA: find everything, then fix in batches**.

This is the *find* half of the QA phase. It fixes nothing. It exists so that QA2
(`qa-all.mjs`, the release gate) and the QA3a–QA3e journey sweeps have a single
checklist to work from, and so nobody has to re-derive "what is actually on this
site" ever again.

Built by reading the repo at the commit that introduced this file: `vercel.json`
(every route), `src/BuildableKids.jsx` (`GAME_CATALOG`, `MAKE_CATALOG`,
`LANDING_WRAP`, the `SCREEN_*` table), `public/**/*.html` (53 pages),
`public/explore/*.json` (the Kidspedia shelf), `api/*.js` (87 functions) and all 51
`qa-*.mjs` harnesses.

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

| Thing | Count |
|---|---|
| Pages under `public/` (`*.html`) | 53 |
| Home tiles in `GAME_CATALOG` | 27 (21 live, 6 soon) |
| Make tiles in `MAKE_CATALOG` | 5 (3 live, 2 soon) |
| Kidspedia books planned / shelved today | 20 / 14 |
| Kidspedia labs (exhibit templates) | 3 |
| `qa-*.mjs` harnesses in the repo root | 51 |
| API functions in `api/` | 87 |
| Public pages with **no** harness | 16 |

---

## 1. The shell — `/app`

One React app, `src/BuildableKids.jsx` (5,139 lines) plus 17 sibling components.
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

---

## 6. Every page under `public/` — all 53

Grouped by what they are. Every one has an explicit `vercel.json` route **except
`feedback.html`** (see §8).

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

### 6d. Grown-up, parent and admin pages (5)

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/landing.html` | Marketing landing + the `/(.*)` catch-all target | `buildablekids.com`, `?stay=1` for returning | · · · · | **none** |
| `/partner.html` | Partner overview (`/partner`) | Direct link | · · · · | **none** |
| `/lesson-review.html` | Grown-up lesson review (`/lesson-review`) | Direct link | · · · · | `qa-lessons.mjs` |
| `/question-review.html` | Grown-up question review (`/question-review`) | Direct link | · · · · | **none** |
| `/feedback.html` | Share Feedback | **nothing links to it — see §8** | · · · · | **none** |

The Grown-ups portal, parent dashboard, login and signup are **shell screens**, not
pages under `public/` — see §1. `/admin` and `/admin.html` also rewrite to the
shell (`src/AdminDashboard.jsx`).

### 6e. Internal tools (3)

| Page | What it is | Opened from | S H N M | QA harness |
|---|---|---|---|---|
| `/editor.html` | Game editor (`/editor`) | Direct link | · · · M | `qa-kits.mjs`, `qa-kp3-add-a-kit.mjs` |
| `/asset-library.html` | Asset library / Browse (`/asset-library`) | Direct link, `buildable-slicer.js` | · · · · | `qa-kits.mjs`, `qa-ap2-use-in-game.mjs` |
| `/planner.html` | The roadmap planner (`/planner`) — this card's own source of truth | Direct link | · · · M | **none** |

### 6f. Mocks, art references and superseded pages (9)

Not kid-facing. QA3a–QA3e should **skip** these; QA2's headless page load should
still open them, because a mock that throws still costs a console error.

| Page | What it is | Status | S H N M | QA harness |
|---|---|---|---|---|
| `/skyflyer-mock.html` | Sky Flyer FL1 mock | Design reference | · · · · | **none** |
| `/skyflyer-farm.html` | Sky Flyer farm corner (FM1) | Work in progress | · · · · | `qa-skyflyer.mjs` |
| `/chess-look-mock.html` | Chess look, before/after | Design reference | · · · · | **none** |
| `/story-directions.html` | Story art directions | Design reference | · · · · | **none** |
| `/story-directions-cabin.html` | Cabin quality-tier test | Design reference | · · · · | **none** |
| `/antcity-art-gallery.html` | Ant City AI art (`/antcity-art`) | Design reference | · · · · | **none** |
| `/croc-engine.html` | Older Croc Tot engine | **Superseded** by `/croctot.html`; still routed, nothing links to it | · · · · | **none** |
| `/snakes-engine.html` | Snakes and Ladders | **Orphaned** — see §8 | S · · · | `qa-snakes.mjs` |
| `/play.html` | Titled "Buildable Runner — engine", wired as the **Hop Heroes** tile | Live behind the 1111 gate | · · · · | **none** |

---

## 7. The 51 QA harnesses, and what each one guards

| Harness | Guards |
|---|---|
| `qa-ap2-use-in-game.mjs` | "Use in a game" flow on the Browse page |
| `qa-art.mjs` | `/art-studio.html` + `buildable-renders.js` |
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
| `qa-invite.mjs` | `api/invite.js` (guest flow) |
| `qa-kidspedia.mjs` | `/kidspedia.html` bookshelf |
| `qa-kits.mjs` | Kit shelf: `/asset-library.html`, `/editor.html`, `public/kenney/` |
| `qa-kp3-add-a-kit.mjs` | Add-a-kit loop from the editor |
| `qa-lessons.mjs` / `qa-lessons-dom.mjs` | `/lessons.html` + `public/lessons/*.json` + `api/lesson-questions.js` |
| `qa-mahjong.mjs` | `/mahjong-engine.html` |
| `qa-mathcannon.mjs` | `/mathcannon-engine.html` |
| `qa-maze.mjs` | `/maze-engine.html` |
| `qa-memory.mjs` | `/memory-engine.html` |
| `qa-music.mjs` | Music Maker studio contract |
| `qa-nv1.mjs` | 5-tab bottom bar + Play page |
| `qa-nv2.mjs` | New Home screen + live door counts |
| `qa-nv3.mjs` | Make / Explore / Learn / Me section pages |
| `qa-nv4.mjs` / `qa-nv4-dom.mjs` | Nav polish + phone-width discipline |
| `qa-question-bank.mjs` | `api/generate-question-bank.js`, `_curriculum.js`, `_quizgen.js` |
| `qa-quickgame.mjs` | `src/QuickGame.jsx` on `topic` / `dive` / `weather` / `orbit-explorer` |
| `qa-rileys.mjs` | `/rileys-garden.html` art + audio + engine + manifest |
| `qa-rn1.mjs` | RN1 — "done has to mean it is in the app" (the planner git gate) |
| `qa-runner.mjs` | `/runner-engine.html` |
| `qa-skyflyer.mjs` | Sky Flyer manifest + a real flight |
| `qa-skyflyer-hud.mjs` | FL9 — shell chrome vs game HUD, measured together |
| `qa-skyflyer-look.mjs` | FL6 — the offer card layout (LOOK RULE 19) |
| `qa-skyflyer-sky.mjs` | FL8 — clouds and sun rays (LOOK RULE 19) |
| `qa-sling.mjs` | `/sling-squad.html` + `/sling/manifest.json` |
| `qa-snakes.mjs` | `/snakes-engine.html` |
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

---

## 8. What the map turned up

QA1 is **find only**. Everything here is recorded, not fixed. Each item is written
so QA2 or a later fix card can pick it up without re-deriving it.

### 8a. Coverage gaps — 16 public pages with no harness

`/antcity-art-gallery.html` · `/chess-look-mock.html` · `/croc-engine.html` ·
`/feedback.html` · `/landing.html` · `/partner.html` · `/planner.html` ·
`/play-invite.html` · `/play.html` · `/question-review.html` ·
`/skyflyer-mock.html` · `/song.html` · `/soundboard.html` · `/story.html` ·
`/story-directions.html` · `/story-directions-cabin.html`

Six of these are mocks or superseded pages and want nothing more than QA2's
headless console-error load. The ones that carry real kid- or grown-up-facing
behaviour and have **no** check at all are: **`/soundboard.html`** (a live Make
tile), **`/play.html`** (the Hop Heroes engine), **`/play-invite.html`** (the whole
guest flow's front end — only its backend is covered), **`/song.html`** and
**`/story.html`** (every shared link a parent opens), **`/landing.html`** (the front
door) and **`/question-review.html`**.

No shell component outside `BuildableKids.jsx`, `MyStuff.jsx`, `MusicMaker.jsx` and
`QuickGame.jsx` has a harness — notably `AdminDashboard.jsx`, `GrownUpScreen.jsx`,
`GrownUpFriends.jsx`, `CreatorScreen.jsx`, `StoryMaker.jsx`, `GameLobby.jsx` and the
four Family multiplayer wrappers.

### 8b. Shared building blocks — who is still off-format

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

1. **`/feedback.html` is unreachable in production.** It is the only page under
   `public/` with no entry in `vercel.json`, and `vercel.json` uses legacy `routes`
   with no `handle: filesystem` phase, so the final `"/(.*)" → /landing.html`
   catch-all swallows it. Nothing in the repo links to it either.
2. **Snakes and Ladders is orphaned.** `/snakes-engine.html` exists, works and is
   guarded by `qa-snakes.mjs`; `SCREEN_SNAKES` and `SnakesScreen` exist in the
   shell; `onSnakes` is passed to the Home screen at
   `src/BuildableKids.jsx:2053` — and **is never consumed**. There is no
   `GAME_CATALOG` entry for it, so no tile renders and no kid can reach it.
3. **`/croc-engine.html` is dead but still routed.** Croc Tot ships from
   `/croctot.html`. Nothing links to `croc-engine.html`, yet `vercel.json` keeps a
   route for it.
4. **`/play.html` is titled "Buildable Runner — engine"** but is mounted as the
   **Hop Heroes** platformer tile, while a *different* page,
   `/runner-engine.html`, is the actual Sunny Town Drive runner. Confusing to
   anyone reading either file cold.
5. **The Kidspedia shelf shows 14 of 20 books.** Six books are `status:
   "in-review"` and correctly hidden. QA3d should count 14 and not file the other
   six as missing.
6. **Only one lesson exists** (`public/lessons/g1-making-ten.json`). The Learn
   section is real but nearly empty.

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
- A new `qa-*.mjs` needs a row in §7. QA2 (`scripts/qa-all.mjs`) runs the harnesses;
  this file says which ones should exist.
- The counts table at the top is the drift check. If a count no longer matches the
  repo, this map is stale.
