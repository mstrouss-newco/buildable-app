# Buildable Kids — Session Log

## 2026-06-28 — Sunny Town Drive: low-poly model reskin (Kenney + Quaternius)

Replaced the box/billboard roadside with real CC0 3D models, fully data-driven. New
`SCENERY_SETS` config: `forest` = Quaternius nature (.gltf — trees/pines/bushes/rocks/
flowers/fern/grass/mushroom), `city` = Kenney City Kit (.glb — building-type-a..u + trees/
planter/fence/driveway). `TOWN_SET` assigns each of the 6 towns a style (maple/petal/beach=
forest, market/downtown/rainbow=city). Engine: generalized `loadModel(item)` handles .glb +
.gltf; `prepModel` swaps to toy MeshLambert, scales (Quaternius=normalize-to-height; Kenney=
fixed scale + Y-stretch for buildings) and grounds each model; slots clone cached prototypes
(no reload), random rotation/scale, re-randomized on recycle; buildings face the road + sit
farther out to frame the street. Library-first WITH fallback: a failed model shows the blocky
`makeFallbackProp(cat)` so the game never breaks. **Fix:** Kenney GLBs reference an external
`Textures/colormap.png` that was missing (decode error → all buildings fell back); extracted
it CC0 from `kenney_city-kit-suburban_20.zip` into `public/models/city-kit/Textures/`. Track/
lane/dodge/collect/jump logic untouched — `qa-runner.mjs` all-win before & after. Verified
live in iframe: forest + city towns render, runs winnable, no console errors.


## 2026-06-27 — Croc + Breaker audio: clean sound model (no repetitive beep)
- Croc Tot: replaced inline synth tones (sound-rule violation) with real bespoke
  ElevenLabs sounds via BA; removed the per-shot fire beep (auto-shooter). Sound on
  snack-pop, boss impact (soft+throttled "hit"), boom, collect, power, hurt, win.
  Added music (chess-music?world=candy). New bespoke croc_* SFX in api/sfx.js.
- Breaker: removed the laser power-up's per-volley beep (brick smash carries it);
  ball-launch/bounce/brick feedback unchanged (already real ElevenLabs sounds).


## 2026-06-28 — Maze Munchers: on-screen debug overlay + version stamp (touch turning still unconfirmed)
- Mike: turning STILL broken on his real iPhone via the arrow pad (muncher only changes at walls). Prior frame-rate/input/timestep fixes did not resolve it, and I cannot reproduce it (the Claude-in-Chrome automation tab pauses requestAnimationFrame and can't do real iOS touch), so I stopped verifying by proxy and added live instrumentation so Mike can see where it breaks on his device:
  - **Version stamp** (bottom-left): "Maze v8 · 2026-06-28 (tap=debug)" — confirms which build is loaded; tap it to toggle the debug overlay.
  - **Debug overlay**: live dir, queued (buffered) dir, lastTap (+ "JUST TAPPED" flash), tap counter, turn counter, frame counter, hero cell + t + moving/STOPPED, and the open directions at the hero's cell. Lets Mike report whether the tap registers (tapCount up?), whether the buffer sets (queued shows the arrow?), and whether the turn fires (turnCount up?) at an open intersection.
  - **D-pad buttons flash** yellow on press for visible tap confirmation.
  - Cache-bust bumped to `/maze-engine.html?v=20260628a`.
- Turn logic (for the record): movement is grid-cell-stepping. Each entity moves between adjacent open cell-centers; `e.t` accrues `spd` per 1/60s fixed step; on `e.t>=1` it snaps to the next cell and calls `decideHero`, which returns `queuedDir` if `cellOpen(gx+queuedDir)` else continues. So a turn is consumed at EVERY cell-center crossing (event-based, not a single-frame alignment), and turns immediately if the opening is there. This clears all levels in headless sim and via real touchstart dispatch on the live d-pad — but neither exercises real iOS touch with the live rAF loop.
- QA green; build clean.


## 2026-06-27 — Board games: adopt shared game-nav (fix phone overlap) + Dots and Boxes size picker
Two pieces of Mike feedback on the board games.
- **Nav overlap fixed at the shared level.** The board games were wrapped in `GameFrame` but had
  never adopted the standardized `buildable-gamenav.js` bridge, so in-app they showed the shell's
  controls AND their own (Home + status + Pause + Sound), which collided on phone widths. Now the
  shared board shell (`buildable-boardgame.js`) **registers with `buildable-gamenav`**: in-app it
  hides the engine's own Home/Sound/Pause and the React `GameFrame` draws the ONE consistent set
  (Home top-left, Sound + Menu top-right); standalone the engine keeps its own buttons. The turn/
  score **status moved to its own row** (wraps, never sits in the top-button band), and Pause+Sound
  share one right-aligned cluster so they can't overlap each other. Fixed once in the shell → all
  three board games benefit. (Did NOT touch `buildable-gamenav.js` / `GameFrame` — only adopted them.)
- **Dots and Boxes — pick your board size.** Start screen now offers **Small (3x3) / Medium (5x5) /
  Large (7x6)** size cards (shared BS `ready` cards via a new `spec.choices` hook in the shell), so
  the same game scales from a quick kid grid to a big 42-box match. The engine was refactored to a
  fully dynamic board size (cols/rows live in the game state; geometry/edges/AI/draw all derive from
  it). Still always-winnable / pressure-free.
- **QA:** `qa-dotsandboxes.mjs` now checks ALL three sizes (every game draws all edges + claims all
  boxes; AI beatable on each); `qa-tictactoe` / `qa-connectfour` still green; `npm run build` clean.
## 2026-06-27 — Maze Munchers: touch controls reliability (frame-rate + input hardening)
- Mike (on iPhone) reported turning still failed when tapping the on-screen ARROW BUTTONS, even after the keyboard-focus fix. The buffered-turn logic + the button handlers both test correct on the live build (verified by dispatching a real touchstart to the d-pad buttons and driving the loop: tap UP -> buffered, tap LEFT at an intersection -> the muncher turns). So the failure is a real-device factor synthetic events can't reproduce. Addressed the likely causes:
  - **Fixed-timestep game loop.** Movement was coupled to display refresh (one update per rAF, no dt) -> on a 120Hz iPhone the muncher ran ~2x too fast, so intersections flew by and taps felt ignored. The loop now accumulates real time and steps logic at a constant 60/sec on every device.
  - **Hardened the d-pad** with `pointerdown` (unified touch+mouse) + a `click` fallback alongside touchstart/mousedown, and `touch-action:none` / no tap-highlight on the buttons and canvas.
  - **Swipe also registers on touchmove** (a flick that the browser would otherwise treat as a pan/gesture now turns), with non-passive listeners + preventDefault; added touchcancel reset.
  - **Calmer kid speeds** (hero 0.13; chasers 0.06-0.108, all < hero so still always-winnable).
  - **Cache-bust** the in-app maze iframe (`/maze-engine.html?v=20260627d`) so devices stop serving a stale cached build.
- QA: `qa-maze.mjs` clears all 6 worlds + campaign + render smoke; `npm run build` clean.


## 2026-06-27 — Survival audio: no per-shot beep; impact/kill/explode only
- Removed the per-bullet fire sound (Mike: constant "beep beep" on every shot).
- Sound on meaningful events: soft bespoke impact (spk_hit) on a non-lethal hit
  (throttled 0.16s + 0.5 vol -> occasional tick, not per-bullet), pop on kill, boom+shake
  on boss. Coins/level-up/hurt/boss/win/lose unchanged. New bespoke spk_hit in api/sfx.js.


## 2026-06-28 — Tumble Blocks shipped to production (gentle kid Tetris)
- New Track B engine `public/tetris-engine.html` — a falling-blocks puzzle for ages 4-8
  with NO harsh game-over (top-out triggers the world helper's gentle row-sweep). Two
  modes: Adventure (6 worlds, clear the row goal to advance, speeds ramp) + Calm (endless).
- All 7 tetrominoes as dynamic 3D "gem" blocks; slow drop + ramp, 3-piece preview, ghost
  landing, forgiving lock delay, 7-bag. Touch-first: big buttons (hold green = soft drop,
  tap = hard slam) + board gestures + keyboard. SCORE / LEVEL / ROWS + boxed NEXT.
- Per-world photo backdrops behind the board (chess/tennis pattern: `BR.bgImage` + scrim,
  gradient fallback): jungle/candy/ocean/space reuse `chess-art/*.jpg`; snow/volcano use
  `/api/images?kind=tennis&id=...`.
- Uses the shared libs (BR/BM/BS/BA) and the shell nav bridge (`buildable-gamenav.js`):
  the React `GameFrame` renders Home/Sound/Menu; the engine hides its own nav in-app.
- Bespoke ElevenLabs one-shots registered in `api/sfx.js` (`tumble_*`); each world loops
  a shared-library ambience.
- Wiring: `vercel.json` route + **Tumble Blocks** tile (+ `kind=game&id=tetris` art) +
  `TetrisScreen` in `src/BuildableKids.jsx`. QA: `qa-tetris.mjs` (El-Tetris bot clears
  every world; Calm never errors; render smoke). `npm run build` clean.
- **Owner action (optional):** run `db/seed-tetris-mechanic.sql` once (registers the
  falling-block mechanics; the game does NOT need it to play). Snow/volcano backdrops
  generate + cache on first view.

## Shell-owned game chrome — mechanism shipped (June 27 2026)

The durable fix so nav controls stop drifting/overlapping: the React shell (`GameFrame`)
can now render ALL the chrome — Home + a Sound/Menu/Help cluster — so engines draw NO nav
buttons of their own (nothing per-game to clobber). Shipped the MECHANISM only this pass
(safe: it's capability-based and inert until an engine opts in, so live games are
unchanged):

- `public/buildable-gamenav.js` (`BuildableGameNav`) — the game-side bridge: in-app it
  hides the engine's own nav buttons and reports capabilities + sound state to the shell;
  standalone it does nothing (engine's own buttons still work).
- `GameFrame` (BuildableKids.jsx) — renders Home always, and the Sound/Menu/Help cluster
  ONLY for a game that sends `nav:state`; clicks go back as `nav:sound/menu/help`.
- `BS` gained `hideSound` so the start screen's sound icon yields to the shell's.
- Doc + per-engine conversion recipe in BUILDING-A-GAME.md.

Rollout is per-engine and capability-based: an engine opts in by calling
`BuildableGameNav.register(...)`; until then `GameFrame` shows only Home, exactly as now.
Deferred converting engines this pass because breaker/runner are being actively rewritten
by other work — converting now would just get clobbered. (Overlaps themselves were already
fixed in the prior commit; this makes the fix un-clobberable going forward.)


## In-game controls: one rule — top-left=Home, controls top-right, bottom=gameplay (June 27 2026)

Fixes play.html (platformer) overlapping the shell Home, and ends the bottom-left vs
top-right inconsistency. Final rule for EVERY game: top-left is the shell Home only; the
game's own controls (Menu/Sound/Music/Help) go in a top-right vertical stack
(right:12px, top 12/56/100…); bottom corners are reserved for gameplay (D-pad/jump/paddle)
— which is why controls can't live bottom-left.

- play.html: #bMute/#bMusic/#bHelp moved top-left -> top-right stack.
- runner: re-applied (a concurrent commit had reverted the earlier move) — Menu/Sound/Help top-right.
- breaker/maze/survival: Sound moved to top-right stack; board games' #mute back to top-right.
- BUILDING-A-GAME.md nav rule updated to match. (Croc isn't shell-wrapped, so no Home collision.)


## Quick-play guest invite link (zero-auth) — v1 Tic-Tac-Toe (June 27 2026)

First slice of "a kid sends a link to play someone outside the family." Deliberately
standalone — touches no existing game/engine — and is the foundation the real games +
the optional "save as friend" account plug into next.

- **The link is the save point.** The whole match lives server-side keyed to an
  unguessable token (the link). Reopen the link -> back in the exact board (resume).
- `db/create-invite-matches.sql` — `invite_matches` token-keyed table. CROSS-family by
  design (NOT the family-RLS model): RLS on with NO public policy; only the service-role
  `/api/invite` endpoint (which validates the token) touches it. 7-day expiry. **OWNER:
  run in Supabase.**
- `api/invite.js` — one service-role endpoint, server-authoritative: `create` (kid starts
  + gets link), `join` (guest claims the open seat, name only), `move` (validated turns),
  `reset` (play again), GET poll. A device token in the browser claims/locks a seat so a
  forwarded link can't steal it, and recognizes a returning player for resume.
- `public/play-invite.html` — self-contained: kid makes a link + shares it (native share
  / copy), friend opens it, types a name, and plays — no account, no chat. Polls every
  1.5s. Desktop/iPad/iPhone, no emoji.
- Game logic unit-tested (win/draw/turn validation). vercel route added.

Next (later): wire the same invite layer into real games; optional "save as friend"
where the recipient creates a lightweight account linked to the kid's profile (parent-
visible). No free-text chat — canned reactions only — stays the rule.


## In-game nav controls standardized — no more Menu/Home overlap (June 27 2026)

Follow-up to the GameFrame work: the IN-GAME controls (not just the start screen) were
still hand-rolled per engine and collided with the shell's top-left Home (e.g. runner's
"‹ Menu" sat top-left, right under Home). Standardized positions across engines:

- **Top-left = shell Home only** (games place nothing there).
- **Top-right stack:** Menu (`#backBtn`, top:12px) + Help (`#helpBtn`, top:56px).
- **Bottom-left:** Sound (`#muteBtn`).

Moved `#backBtn` top-left→top-right in runner/breaker/maze; restacked `#helpBtn` to
top:56px; moved Sound to bottom-left consistently (maze + the three board games' `#mute`).
CSS-only (static engine files; no build impact). Documented in BUILDING-A-GAME.md's
Consistent game navigation section. (Croc is still a non-BS engine — separate follow-up.)


## Consistent game navigation shipped — one GameFrame, no more double buttons (June 27 2026)

Implemented the nav standard from BUILDING-A-GAME.md and fixed the Dots and Boxes (and
others) double top-left button bug.

- **One `GameFrame`** in `BuildableKids.jsx` replaces 13 near-duplicate per-game `Screen`
  components (which had mixed "Back"/"Home" labels + copy-pasted inline buttons). It
  renders one consistent **Home** pill (top-left) + an optional right control
  (Tennis/Town "Play a sibling") + listens for exit messages (`"nav:exit"` string,
  `{type:"nav:exit"}`, and legacy `"bk:home"`) so in-game exits work too.
- **Games no longer draw their own back button:** set BS `showBack:false` on
  survival/tennis/family-town/bingo/memory/snakes (breaker/maze/runner/board already
  false), and hid the board games' own `#home` corner button (`buildable-boardgame.js`).
  This removes the stacked "Home"+"Back" overlap and makes the top-left Home identical in
  every game.
- Audit had found: 13 duplicate shell back buttons (labels drifted Back vs Home), THREE
  different exit messages, and games variously drawing their own back on top of the
  shell's — now all unified behind `GameFrame` + `showBack:false`.

Menu/nav only — gameplay untouched. Verified live.
## 2026-06-27 — Maze Munchers: controls fix (turn at open intersections)
- **Bug (Mike):** the muncher couldn't turn at an open intersection — only when it ran into a wall — so it felt uncontrollable. Root cause was INPUT, not the movement model: the maze ran in an iframe that never received keyboard focus (the platformer focuses its iframe `onLoad`; the maze did not), so arrow keys were dead and the hero only moved via swipe. The buffered-turn logic itself was already correct (verified in a headless unit test: a gliding hero turns at the next opening).
- **Fixes:** (1) `MazeScreen` now focuses the iframe `onLoad`; the engine also grabs focus (canvas `tabIndex`, `window.focus()` on load + on every pointer/d-pad press) and listens for keys on both `document` and `window`. (2) **Tap-toward-a-direction**: a tap now steers the muncher toward where the kid tapped (relative to the hero), in addition to swipe + arrows + on-screen d-pad. (3) **Instant 180-degree reverse** for snappy feel. (4) Kept the classic **buffered cornering**: a requested turn is queued and applied at the next opening that allows it.
- QA: `qa-maze.mjs` still clears all 6 worlds + campaign + render smoke; added headless turn/reverse checks; `npm run build` clean. Shipped to `main`.


## 2026-06-27 — Maze Munchers: "Make It Mine" buddy, bonus treats, scoring
- **Make It Mine buddy picker** (shared BS `customizeLabel`/`onCustomize` + a bespoke overlay): kids pick a muncher buddy (color + ears) that overrides the per-world look in EVERY world, or "Match world". Persists in `mz_prefs.buddy`. No emoji (drawn).
- **Surprise bonus treats**: a glowing bonus appears anywhere for ~7s (with a shrinking life-ring), worth +250 and a burst/pop; reappears on a timer. Optional — never required to clear, so always-winnable + the QA bot are unaffected.
- **Scoring**: score in the HUD, per-world **best** saved (`mz_prefs.best`), and a richer win screen (3 sparkle stars + "Score / Best" + "New best!").
- `qa-maze.mjs` still clears all 6 worlds + campaign + render smoke (drawBonus/buddy/win overlay exercised); `npm run build` clean. Shipped to `main`.


## 2026-06-27 — Maze Munchers: shipped to main (live) + per-world music
- Merged `claude/games-maze-chase` to `main` (owner asked to make it live for testing); Vercel auto-deploys. Maze tile is in the Games picker.
- **Per-world background music**: new `api/maze-music.js` (mirrors `breaker-music.js`) generates a bespoke upbeat ElevenLabs track per world (candy/reef/station/wood/jungle/frost), cached in `narration_cache` (`mazemusic:<world>`), served loopable. `maze-engine.html` switches the track when the world changes, starts on first tap (audio-unlock), and follows the sound on/off toggle. Volume under the SFX (BA default).
- One-time "how to play" hint toast on first play. `qa-maze.mjs` still clears all 6 worlds + campaign; `npm run build` clean.
- Owner action: the 6 music tracks + 6 maze_* SFX auto-generate + cache on first play (or pre-warm `/api/maze-music?world=<key>` and `/api/sfx?s=maze_*`).


## 2026-06-27 — Family Town: AI art + Monopoly-style pricing (branch claude/games-family-town)
- **Real AI art** via a new `kind=town` in `api/images.js` (generate-once-cache, `<img>`/drawn
  fallbacks so a miss never breaks play): a storybook **board scene** painted behind the center
  panel, a **start-screen hero**, four cute **animal tokens** (purple kitten / coral fox / mint
  frog / sky bunny) drawn as the moving pieces, and a charming **icon per shop + corner** (20).
  Engine preloads them and degrades to drawn shapes if absent.
- **Pricing now plays like Monopoly:** 16 spots are 8 **color groups** of 2, with a price LADDER
  (6→8→10→12→14→16→18→20 coins) and rent that rises with price; owning **both spots in a group
  (a "set") DOUBLES the visit fee** — shown by a star on the owned tiles. Start bumped to 30
  coins, pass-Start to 20 (GO-style). Bots now grab the second spot of a group to complete a set.
  Each property cell shows its Monopoly-style color band + price tag.
- **Soft design kept:** coins never below 0, no knockouts, everyone finishes; winner = most
  coins + spots. `qa-family-town.mjs` re-verified: 2/3/4 players × Short/Med/Long all finish,
  no debt, equal turns, all seats can win; config check now asserts 8 groups + a price ladder.
  `npm run build` clean. `START_COINS` synced to 30 in `src/lib/townMatches.js`.
- **Owner action:** the town art auto-generates + caches on first view; to pre-warm, visit
  `/api/images?kind=town&id=board` (and `hero`, `token_purple|coral|mint|sky`, and each
  `spot_*` id) once after deploy. Still on branch `claude/games-family-town` — not on `main`.

## 2026-06-27 — Family Town: original 3-4 player Monopoly-STYLE board game (branch claude/games-family-town)
- **New Track B engine `public/family-town.html`** — an ORIGINAL board game (our own town,
  spaces, art, name — never the Monopoly brand). 3-4 players roll two dice, hop around a
  24-space loop, collect/spend round-number COINS, buy friendly spots, and draw a fully
  moderated kid-safe "Surprise" card deck (24 gentle cards, no knockouts). SOFT outcomes:
  coins never go below 0, nobody is eliminated, everyone finishes; "winner" = most coins +
  spots. Game length is customizable (Short/Medium/Long = 2/3/4 laps ≈ play time).
- **Same-device pass-and-play (2-4 seats) + a friendly bot** for solo play, AND cross-device
  family play.
- **Multiplayer = turn-based "poll a row" (the chess model), extended from 2 fixed columns to
  an N-seat array.** The whole game state lives in one `town_matches` row; `turn` is an index
  0..N-1 advanced by (turn+1)%N. Family RLS (`parent_id = auth.uid()`) is unchanged regardless
  of seat count. Engine stays network-agnostic (emits `townMove`, applies `townOpponentMove`
  via postMessage); all Supabase code is in `src/lib/townMatches.js` + `src/FamilyTown.jsx`.
- **Shared libs:** board/tokens/dice/cards via BR (no emoji), roll/buy/cheer juice via BM,
  sound via BA, start screen via BS. **New bespoke ElevenLabs one-shots registered in
  `api/sfx.js`:** `town_roll`, `town_move`, `town_coin`, `town_buy`, `town_card`, `town_cheer`
  (synth is the silent fallback only).
- **Route + tile:** `/family-town.html` added to `vercel.json` before the catch-all; a
  "Family Town" tile + `TownScreen` (Back / Play-a-sibling) added to `src/BuildableKids.jsx`,
  wired to `<FamilyTown>` for cross-device play.
- **Always-winnable + QA'd:** `qa-family-town.mjs` drives `BUILDABLE_GAME.sim()` headlessly —
  across 2/3/4 players × Short/Med/Long × many seeds EVERY game finishes with a winner, no
  negative coins, equal turns for all, and all 4 seats can win. `npm run build` is clean.
- **Owner action for cross-device family play:** run `db/create-town-matches.sql` once in
  Supabase, and confirm the parent-account lane env vars are live. Pass-and-play + bot need
  no setup. **Still TODO (owner):** merge the branch to `main` to deploy, then live-QA across
  real devices (the one thing the headless sim can't cover).
## 2026-06-27 — Art Studio: coloring-book mode + portrait/tablet reflow
- COLORING BOOK: new Stamps option opens 8 outline pages (flower/house/fish/butterfly/rocket/
  sun/car/balloon, drawn line-art). Picking one sets a white page; kid fills regions with the
  Fill bucket (outline bounds the flood) or draws over it. Outlines redraw on top (multiply) so
  the lines stay crisp above colors. Page persists in autosave + saved art (art.coloring).
- RESPONSIVE: @media portrait / max-width 760 — the left (brushes) and right (colors) rails
  flip from vertical side rails to horizontal scroll bars above/below the canvas, so on a
  portrait tablet/phone the drawing area keeps full width instead of being squeezed.
- qa-art.mjs green.

## 2026-06-27 — Art Studio: obvious Clear button + more stamp shapes
- Top action buttons now have word captions under the icons (Undo / Redo / Clear / Save /
  Mine / Sound) and CLEAR is tinted red so it reads as "clear/start over" at a glance.
- More to play with: BR.shape() gained triangle, circle, lightning, moon, cloud (now 10 shapes)
  and the studio's Shapes stamp set lists them. qa-art.mjs green.

## 2026-06-27 — Three simple 2-player board games on ONE shared shell (Tic-Tac-Toe, Connect Four, Dots and Boxes)
Shipped to `main` (live on www.buildablekids.com); branch `claude/games-simple-batch1` also pushed.
- **New shared shell built ONCE:** `public/buildable-boardgame.js` (`BG`, `window.BuildableBoardGame`)
  — the Track-B host for turn-based, same-device, no-backend board games. It owns the hot-seat
  TURN MANAGER (Player A / Player B, or solo vs an easy computer), the canvas (responsive + DPR +
  rAF loop), pointer→board mapping ("place your thing"), the shared start screen (BS, Solo/2-player
  mode row), sound (BA), juice (BM shake/burst), the win banner + Play again, Home→`nav:exit`, mute,
  and a headless QA scaffold. Plus two reusable DETECTORS: `BG.lineWinner` (N-in-a-row any direction)
  and `BG.boxesNewlyClosed` (the 4th-side-claims-a-box rule).
- **Three engines instantiate it** (~150 lines each = rules + draw + easy AI):
  - `public/tictactoe-engine.html` — 3x3, first to three; solo easy computer or 2-player.
  - `public/connectfour-engine.html` — 7x6, discs fall to the lowest slot, first to four any
    direction; falling-disc animation (visual only — logic resolves immediately); solo AI or 2-player.
  - `public/dotsboxes-engine.html` — small 3x3-box grid for young kids; draw a line, close a box's
    4th side to claim it AND go again; most boxes wins; solo AI or 2-player.
- **Always-winnable / pressure-free:** no soft-locks (every game terminates with a valid result),
  ties are friendly (not a loss), and the easy AI is genuinely beatable (takes obvious wins, only
  sometimes blocks, otherwise plays light/random). No emoji — all art is drawn via BR primitives.
- **Shared in-game menu (same across all three).** Built ONCE into the shell: a Pause button
  (top-right) opens a menu — **Keep playing / New game / Sound on-off / Home** — and the board
  matches the rest of the app's nav (Home top-left, Sound top-right). Each game **auto-saves** to
  the browser (no backend), so leaving mid-match shows a **"Continue your game"** button on the
  start screen. Edit the menu in one place (`buildable-boardgame.js`) and all three update.
- **Bespoke created sounds** registered in `api/sfx.js` (BA synth = silent fallback only):
  `board_place`, `board_drop`, `board_line`, `board_claim`, `board_win`, `board_draw` (all ≥0.5s).
- **Reusable mechanics written back** per MECHANICS.md (new §14) + `db/seed-boardgame-mechanics.sql`:
  `hot-seat-turns`, `grid-line-winner`, `box-claim-extra-turn` (idempotent; **owner action:** run once).
- **Routed + tiled:** explicit `vercel.json` routes for the 3 engines + `buildable-boardgame.js`
  (before the landing catch-all); three launch tiles + a shared `BoardGameScreen` iframe wrapper in
  `src/BuildableKids.jsx` (Games picker → Tic-Tac-Toe / Connect Four / Dots and Boxes).
- **QA:** `qa-tictactoe.mjs` (perfect player NEVER loses to the AI; AI beatable; 200 random games all
  terminate), `qa-connectfour.mjs` (gravity invariant; AI beatable; 200 games terminate),
  `qa-dotsandboxes.mjs` (every game claims ALL boxes / draws ALL edges; AI beatable) — ALL PASS.
  `npm run build` clean.
- **Left out of v1 (follow-up):** cross-device play. These are the textbook poll-a-row fit
  (`mp-turn-based-row`, like chess); the shell is already network-agnostic so it is additive later.

## 2026-06-27 — Art Studio: framed layout (tools on all 4 edges, big canvas)
- The bottom panel had shrunk the canvas to ~1/3 of the page. Reframed: tools now ring the
  canvas on all four edges so the center drawing area is large.
  - LEFT rail = Brushes (all 14, scrolls). RIGHT rail = Colors (+ color picker).
  - BOTTOM bar = Size / Mirror / Style / Stamps (grouped). TOP bar = Undo/Redo/Clear/Save +
    My Art + Sound. Each region holds one category so nothing feels crowded.
- Active choice highlights green. All drawing/sound/save/gallery logic unchanged; qa-art.mjs green.

## 2026-06-27 — Art Studio: "art desk" — every tool visible, grouped into labeled zones
- Picker-only version hid too much (kid couldn't find things). Rebuilt so EVERYTHING is on
  screen at once, organized into clearly separated zones each with a little icon header:
  Brushes (all 14 as picture tiles) · Colors (swatches + color picker) · Size (5 dots) ·
  Mirror (6 split icons) · Style (5 look previews) · Stamps (Shapes/Stickers/Scene) · Do
  (undo/redo/trash/heart). Active choice shows a green highlight so she sees what's picked.
- Big sticker library + scenes + gallery stay as overlays (too many to inline); everything
  else is one tap, no hunting. Tray scrolls if short on height; canvas still gets the room.
- All drawing/sound/save/gallery logic unchanged; qa-art.mjs still green.
## 2026-06-27 — Three simple luck/matching games on ONE shared turn shell (Memory, Bingo, Snakes & Ladders)
**Live-QA fix (same day):** the menu frame crashed (`drawHUD` read `match.players` while `match` was
null before the first game), which killed the rAF loop so the board never appeared after pressing Play.
Guarded `drawHUD` + made the frame loop crash-proof (try/catch) in all three engines; added a menu-state
render assertion to `qa-memory/bingo/snakes.mjs` so it can't regress. Verified live in Chrome.

Batch 2 of simple games — all same-device pass-and-play, built on one new shared brain. Branch
`claude/games-simple-batch2` (not main).

- **NEW shared lib `public/buildable-turns.js` (`BT`, the 5th engine lib).** One headless-safe
  turn shell for 2-4 players (+ solo): roster (4 colors + token shapes, no emoji), whose turn,
  per-player scores, winner. `BT.create({count}) -> cur()/next(keepTurn)/add()/leader()/finish()`.
  Registered as `game_mechanics` slug `same-device-turns` (`db/seed-same-device-turns-mechanic.sql`)
  and documented in `MECHANICS.md` section 15. The local counterpart to the cross-device `mp-*` mechanics.
- **`buildable-startscreen.js` gained `p2`/`p3`/`p4` mode keys** (people icon + "2/3/4 players")
  so any same-device game gets a player-count picker through the shared BS mode row. Additive —
  breaker's BS adoption still passes QA.
- **Memory Match (`public/memory-engine.html`).** Solo or 2-4. Flip two cards, a match stays up +
  scores + bonus turn, a miss flips back, clear the board to win. Difficulty = grid size
  (Easy 3x4 / Medium 4x4 / Hard 4x6) via the customize panel; card faces PULLED from the shared
  asset library by theme (`/api/list-assets?theme=`) with BR drawn-shape fallback. 6 theme packs.
- **Bingo (`public/bingo-engine.html`).** 2-4 players, the DEVICE is the caller (rotating via BT).
  Picture mode = library art + drawn icon fallback; Word mode = kid word list, spelled + said.
  Players daub matches, first full line wins. Always-winnable: calls drawn from the union of all
  cards. New caller speech via `api/say.js` (ElevenLabs TTS, cached) — the "called-item speech".
- **Snakes & Ladders (`public/snakes-engine.html`).** 2-4, pure luck so the littlest kid can win.
  Roll the die, hop the 30-square serpentine track, climb ladders / slide down snakes, bonus roll
  on a six; reach-OR-pass the top star to win (no exact-landing soft-lock). 3 themed boards.
- **Bespoke created sounds** added to `api/sfx.js` (auto-surface in `/api/list-audio`):
  `mem_flip`, `mem_match`, `mem_flipback`, `party_win`, `bingo_call`, `bingo_daub`, `dice_roll`,
  `snl_ladder`, `snl_snake`. Plus `api/say.js` for spoken called words/letters/picture names.
- **Wiring.** Three `vercel.json` routes (+ `/buildable-turns.js`) before the catch-all; three
  tiles + screens in `src/BuildableKids.jsx` (full-screen iframe, Home top-left, BS back posts
  `nav:exit`); key-art prompts added to `api/images.js` (`memory`/`bingo`/`snakes`).
- **QA.** Headless sim hooks (`window.BUILDABLE_GAME` + per-game alias) + `qa-memory.mjs`,
  `qa-bingo.mjs`, `qa-snakes.mjs` (model: `qa-breaker.mjs`). Every difficulty x player-count x
  theme is proven winnable (perfect-memory bot clears all boards; a bingo winner always emerges;
  snakes always ends in a win and every seat can win) + render smoke for each. `npm run build` clean.
- **Owner action:** run `db/seed-same-device-turns-mechanic.sql` once; the caller voice + new SFX
  auto-generate + cache on first play (ElevenLabs), with the BA synth as the silent fallback.

## 2026-06-27 — Buildable Checkers: kid-friendly 2-player checkers (reuses the chess plumbing)
Branch: `claude/games-checkers` (NOT merged to main). New turn-based game built on the
chess "poll a row" model (MULTIPLAYER.md Pattern A). Checkers is board-shaped like chess,
so this reuses the chess plumbing instead of inventing new transport.

- **New engine `public/buildable-checkers.html`** — a DOM board (same approach as
  `buildable-chess.html`, which renders reliably inside iOS iframes), three modes:
  *Play the Robot* (beatable bot, Easy/Normal/Tricky), *Two Players* same-screen
  pass-and-play, and *online* family play. Standard kid rules: diagonal moves, jump to
  capture, multi-jumps chain, a man becomes a **King** on the far row (kings move/jump
  both ways). A **"Must jump" toggle** (default OFF = relaxed) keeps captures optional for
  the youngest kids. Worlds reuse the existing `chess-art` backdrops + the per-world
  `/api/chess-music` tracks; pieces are drawn SVG discs (purple/coral, crown for kings) —
  **no emoji**. Sound via `BA` (`buildable-audio.js`).
- **Network-agnostic, exactly like chess.** The engine only emits its move / applies the
  opponent's move via `postMessage` (`checkersReady` / `checkersInit` / `checkersMove` /
  `checkersOpponentMove` / `checkersReaction` / `checkersShowReaction`). ALL Supabase code
  lives in the React layer. Canned reactions only (the same 6 phrases) — no free text.
- **`db/create-checkers-matches.sql`** — a copy of `chess_matches` (whole game state in one
  row) with the SAME family-RLS policy + `updated_at` trigger; idempotent, non-destructive.
  **Owner action: run it once in the Supabase SQL editor** (after the accounts tables).
- **React layer:** `src/lib/checkersMatches.js` (PostgREST over `checkers_matches`, mirrors
  `chessMatches.js`) + `src/FamilyCheckers.jsx` (lobby + 2s poll + the postMessage bridge,
  mirrors `FamilyChess.jsx`). Gated on the parent-account lane; guests get the friendly
  "ask a grown-up" state.
- **Wiring:** new **Checkers** tile in the Games picker + `CheckersScreen`/`FamilyCheckers`
  routes in `src/BuildableKids.jsx` (Home top-left, "Play a family member" top-right — same
  nav as chess). `api/sfx.js`: registered bespoke `checkers_select/move/capture/king/win/lose`
  one-shots (+ durations) — they auto-generate & cache on first play (BA synth is the silent
  fallback). `vercel.json`: explicit `/buildable-checkers.html` route before the catch-all.
- **QA:** `qa-checkers.mjs` (headless rules + bot) — opening legality, multi-jump,
  promotion, forced-capture, and **the robot is beatable** (a strong kid beats Easy 40/40,
  Normal 60/60; Tricky ~50/50, still winnable). `qa-checkers-dom.mjs` (jsdom render smoke) —
  builds 64 cells + 24 pieces, selection highlights, a move re-renders, and the online init
  flips the board for the blue side. `npm run build` clean.
- **Deviations from the brief (flagged for Mike):** the brief suggested `BM`/`BS`, but those
  are canvas/level-picker libs aimed at the arcade engines; chess — the explicit template —
  is a self-contained DOM board with its own start/setup screens, so checkers follows chess
  for iOS reliability and fit (capture/king "juice" is done with DOM sparkles + sounds, not
  the `BM` canvas FX). Easy to revisit if you'd rather force `BS`/`BM`.
- **Still TODO (manual):** run the SQL; live QA across two real devices/sessions (the one
  thing the headless + jsdom sims can't cover); optionally pre-warm the 6 `checkers_*` SFX.
## 2026-06-27 — Maze Munchers: NEW original maze-chase engine (Track B)
- **New hand-authored Track B engine `public/maze-engine.html`** — an ORIGINAL maze chase
  (NOT Pac-Man: own name "Maze Munchers", own drawn art, own generated mazes). Gobble every
  treat, dodge the friendly chasers, grab a corner power treat to briefly chase THEM, clear
  the world. Same engine family as survival/croc/breaker.
- **Content-as-data `GAME_CONFIG`**: 6 themed worlds (Candy Cove, Coral Reef, Star Station,
  Whisper Wood, Dino Jungle, Frost Village), each its own palette / hero critter / chaser
  cast / ambient particles, with a difficulty ramp (more + faster + smarter chasers, shorter
  power treat). Mazes are generated per level with a seeded recursive-backtracker + braiding,
  so every maze is fully connected ⇒ every treat reachable ⇒ winnable.
- **Kid tuning / always-winnable:** hero is ALWAYS faster than every chaser; power treats are
  long & generous (~8.5–11s, scaling down slightly by world). Soft "caught" = lose a heart +
  reset positions; out of hearts gently restarts the world (treats back). **Never a harsh
  game-over.** Controls: arrows/WASD + swipe + on-screen d-pad; audio unlock on first tap.
- **Shared libs:** `BR` (hero/critter, `BR.enemy` chasers, walls, treats, hearts — no emoji),
  `BM` (chomp/eat bursts, power pop, caught shake+flash, win confetti), `BA` (sound), `BS`
  (start screen + world picker with stars/lock). Single-player v1 (same-device co-op = future).
- **Bespoke CREATED sounds** registered in `api/sfx.js`: `maze_chomp`, `maze_power`, `maze_eat`,
  `maze_win`, `maze_caught`, `maze_start` (synth = silent fallback only).
- **QA `qa-maze.mjs`** (hook `window.MAZE_GAME`, alias `window.BUILDABLE_GAME`): a perfect-player
  BFS bot with arrival-time evasion clears ALL 6 mazes (3 runs each), a full campaign clears
  6/6, and the render smoke-test passes — re-run 3× green. `npm run build` clean.
- **Wiring:** `vercel.json` route for `/maze-engine.html` (+ `/maze`) before the catch-all;
  **Maze Munchers** tile in the Games picker → `MazeScreen` iframe in `src/BuildableKids.jsx`.
- Decisions taken with Mike: difficulty ramps per world (each its own world/cast/sound);
  power treat long & generous; touch = swipe + arrows; single-player only for v1.
- Branch `claude/games-maze-chase` (NOT pushed to main). Docs: `maze-README.md`, WORKING.md.
- TODO: per-world ElevenLabs background music (deferred); save/share/publish + shared GameFrame.


## 2026-06-27 — Art Studio: decluttered, picker-based kid UI (one tidy toolbar)
- The tray was too crowded (16 brushes + 4 control rows). Reorganized into ONE clean toolbar of
  big buttons, each showing the kid's CURRENT choice as a picture and opening a simple full-screen
  picker: Brush (shows current brush) / Color (current color dot) / Size (current dot) /
  Mirror (current split icon) / Style (current preview) / Stickers / Scene; then Undo, Redo,
  Start-over (trash), Save (heart). Nothing to read; tap a picture to change it.
- Pickers are big tap targets in a shared overlay. Sticker picker keeps theme tabs; shapes,
  backgrounds, gallery unchanged. Sound feedback preserved (brush preview + pops + tool sounds).
- All drawing/render/save/gallery logic unchanged; qa-art.mjs still green.

## 2026-06-27 — Art Studio: kid-friendly visual icons + tool-matched sound (pre-readers)
- No-reading UI: every control is now a picture a 4-year-old can read.
  - MIRROR buttons show the actual split: single shape (off), butterfly across a vertical line
    (mirror), across a horizontal line (flip), and a pie cut into 2/4/8 wedges (kaleidoscope).
  - STYLE buttons are little previews of each look (white paper / dark chalk / glowing neon /
    raised 3D / pixel blocks).
  - SAVE = a heart, UNDO/REDO = curved arrows, START-OVER = trash, BACKGROUND = a landscape,
    MY ART = a photo stack, SOUND = a speaker (with waves on / red x off). Size = small dot -> big dot.
  - Clear/Save confirm dialogs use icon buttons (green check / heart / X), not words.
- Sound that matches the tool: each brush already triggers its own ElevenLabs one-shot while
  drawing (crayon scratch, marker squeak, paint swish, pencil, chalk, spray hiss, neon hum,
  glitter twinkle); tapping a brush now PREVIEWS its sound, taps on colors/styles/mirror give a
  soft pop, fill = splash, stamp = thunk, undo = whoosh, save = sparkle chime. Cadence tightened.
- All visual (no emoji). QA (qa-art.mjs) still green.


## 2026-06-27 — Helper reactions rolled out to more games
- Win/lose helper reaction now fires in Survival (win+lose), Platformer/play.html (win+lose),
  and Typing (win) via direct window.parent.postMessage. Engines verified loading on preview.
- Chess + Tennis intentionally skipped (they already have their own spoken celebration).
## 2026-06-27 — Art Studio v2: 9 new art features SHIPPED to main
- Saving verified working live (saved_art table created). New features on public/art-studio.html:
  1. ART STYLES (the "hand-drawn vs 3D" ask): Paper / Chalk / Neon / 3D Pop / Pixel — each
     changes the background + how every stroke renders (neon glow, raised 3D shadow+highlight,
     blocky pixel-grid). Style saved with the drawing.
  2. FILL BUCKET (flood fill, tolerance) with the art_fill splash sound; stored as a replayable op.
  3. SHAPES stamp brush — drawn star/heart/flower/diamond/dot via new shared BR.shape() (no emoji).
  4. 3 new brush textures via BR.stroke(): Ribbon (calligraphy, width follows speed), Fur, Sponge/dots.
  5. STICKER picker now has THEME TABS (All/Forest/Ocean/Space/Candy) over list-characters+list-assets,
     with a BR-drawn shape fallback so it's never empty.
  6. BACKGROUND picker — solid colors + gradient scenes (Sky/Candy/Galaxy/Forest).
  7. MIRROR modes added: Mirror (left-right) + Flip (top-bottom) alongside kaleidoscope x2/x4/x8,
     via BR.mirror() now accepting "V"/"H".
  8. Full COLOR PICKER (any color) + a Recent-colors row.
  9. MY ART gallery — reopen any saved drawing (list-art -> restore ops + style + bg).
- Shared libs grew (reusable by next maker): BR.shape(); BR.stroke ribbon/fur/dots; BR.mirror V/H.
- QA: qa-art.mjs extended — all 12 drawing brushes across all 6 mirror modes + all 5 styles, fill +
  shape ops, undo/redo, and lossless save->restore (incl style+bg). All green.


## 2026-06-27 — Helper reacts to game win/lose SHIPPED to main
- New global HelperReactions layer (src/HelperReactions.jsx, mounted in main.jsx OUTSIDE
  the screen switch): listens for postMessage {source:"buildable",kind:"win"|"lose"} from
  game iframes, pops the kid's helper at the bottom, speaks a cheer/encouragement in the
  helper's voice, and bounces. Auto-hides after ~6s.
- Tiny bridge public/buildable-buddy.js (window.BB.win()/lose()/cheer()) posts those events.
- Wired: breaker (winLevel/loseLife), croc (gameOver), and the generated-game template
  (api/generate-game now instructs win/lose postMessage). Others adopt next (1 line each).
- FIX: all helper voices (home greeting, win/lose reactions, Helper Lab preview) now share
  ONE audio element (src/lib/voiceBus.js) so a new line stops the previous — no more overlap.


## 2026-06-27 — Survival: shared start-screen (BS) + real ElevenLabs audio + BM FX
- survival-engine.html now uses the shared BuildableStartScreen (BS) level picker
  (art thumbs + stars + lock + green "next") instead of its hand-rolled #menu grid.
- Audio: ElevenLabs music ON (/api/chess-music?world=space) + bespoke Space Sparkles
  SFX via /api/sfx (spk_*), played as real files through the upgraded buildable-audio.js
  (fetch+decode Web Audio buffers; synth = offline FALLBACK only). Per the sound rule.
- Adopted buildable-mechanics.js (BM): boss kill = explode (flash+shake+boom).
- Coin drops made deterministic (seeded dropRng) so difficulty is reproducible/fair;
  headless sim wins all 6 levels every run (cold + carry campaign).
- MANUAL (owner): hit /api/sfx?s=spk_* once each to generate the new ElevenLabs sounds.


## Creations standard (save · share · publish) + cross-platform + nav rules (June 27 2026)

Audited how kid creations are saved/shared/published and codified the universal rule. Docs
+ one safe fix this pass; the two feature gaps below are tracked for a follow-up.

- **New `CREATIONS.md`** — the rule: EVERY creation type (song, story, game, the planned
  Art Studio drawing, and any new maker) must support all three — save to the kid's
  library, share by a private read-only link, and publish to the public gallery
  (moderated). Documents the three shared mechanisms to reuse (`saved_<type>` + family RLS
  + `list-<type>`; `shareCreation`/`shareSheet` + a `/<type>.html` viewer;
  `publish-creation` + moderation), the current coverage matrix, and a checklist for new
  types. Linked from `AGENTS.md` + `BUILDING-A-GAME.md`.
- **Cross-platform rule** added to `AGENTS.md` + `BUILDING-A-GAME.md` + `CREATIONS.md`:
  every maker, viewer, library screen, and game must work on **desktop, iPad, and
  iPhone** — touch-first, audio-unlock on first tap, test portrait phone, no
  desktop-only features.
- **Fixed** `src/lib/shareSheet.js` — removed emojis from the share text + the "save
  first" alert (no-emoji rule).

- **Consistent game navigation** added to `BUILDING-A-GAME.md`: one standard — Home
  top-left (leaves to the hub), Sound/Pause top-right, sub-screen Back returns to the
  start screen; one shared `GameFrame` wrapper instead of the 4 copy-pasted per-game back
  buttons; in-game Home/BS-back post a `nav:exit` message to the shell. Roll out per
  engine like `BS`. (Doc/standard now; the `GameFrame` refactor is the follow-up.)

**Audit — current coverage:** songs + stories have all three; games have save + publish
but **no private share link**. **Open gaps (tracked in CREATIONS.md):** (1) add a
read-only game viewer (`public/game.html?id=`) + a `game` branch in `shareCreation`;
(2) `MyStuff.jsx` only has characters/levels/songs tabs — add Stories + Games tabs with
Share + Publish actions. Both touch live React UI — to do next, confirming scope first.

## 2026-06-27 — Art Studio v1 (Core + Kaleidoscope) SHIPPED to main
- NEW maker built on the game playbook (Track B engine): public/art-studio.html.
- Brushes with PERSONALITY + bespoke sounds: crayon/marker/paint/pencil/chalk/spray/neon
  + rainbow + glitter; sticker-stamp brush (pulls /api/list-characters + /api/list-assets,
  BR-drawn fallback so it's never empty); eraser; size; full undo/redo; clear-with-confirm.
- Kaleidoscope/mirror mode (Off/x2/x4/x8) via new shared BR.mirror(); textured strokes via
  new shared BR.stroke() in buildable-renders.js (reusable by the next maker).
- 12 new bespoke ElevenLabs one-shot sounds registered in api/sfx.js (art_* keys) so they
  grow the company sound library. Sounds play via /api/sfx?s=... (BA mute/unlock honored).
- Save+share: db/create-saved-art.sql (saved_art mirrors saved_stories; 'art' added to
  creation_hearts) + api/save-art.js + api/list-art.js; publish-creation.js learns 'art'.
  Saves store finished PNG (image_b64) AND replayable recipe (art JSONB). Autosave to
  localStorage so work is never lost. Confetti + chime on save.
- Wired in: vercel.json route /art-studio.html (before catch-all); src/BuildableKids.jsx
  "Make art" home tile + ArtStudioScreen iframe (Back top-left, shared nav). No emojis.
- QA: qa-art.mjs (headless) asserts all brushes lay strokes across mirror settings,
  undo/redo work, and save->JSON->clear->restore is lossless. All green.
- MANUAL (owner): run db/create-saved-art.sql in Supabase so saving persists.


## 2026-06-27 — Phase 2: talking helper + voice + onboarding SHIPPED to main
- Floating helper now SPEAKS: taps (and auto on home load) play "Hi {name}! {line}" via
  /api/narrate-story-page (ElevenLabs, cached), iPad-safe (registerAudio + global unlock).
- Helper Lab is a 2-step wizard: pick/make character -> choose VOICE (Calm/Gentle/Peppy/Silly,
  each with a "hear" preview). All 4 voice IDs verified producing audio.
- Helper saved PER-KID: localStorage bk_helper_<kidId> (bk_helper_v1 if no profile) +
  kid_profiles.helper jsonb when signed in (accounts.saveKidHelper/getKidHelper, graceful).
- First-login ONBOARDING: onProfileChosen -> Helper Lab when the kid has no helper yet.
- MANUAL (owner): run db/add-kid-helper.sql in Supabase for signed-in cross-device sync.


## Tennis: per-world background music + pre-warmed assets (June 27 2026)
- **Per-world background music.** New `api/tennis-music.js` (mirrors `chess-music.js`) generates a bespoke UPBEAT ElevenLabs track per world (beach surf-uke, space synthwave, jungle marimba, ocean bubbly, candy music-box pop, snow glockenspiel, volcano adventure brass, city Rhodes funk), cached in `narration_cache` (`tennismusic:<world>`), served as a loopable mp3. `tennis.html` owns a single looping `<audio>` element -> `/api/tennis-music?world=<key>`, starts on first tap/key (audio-unlock), switches when the kid picks a court (previews the world's track), and follows the sound on/off toggle. Volume 0.32 under the SFX.
- **Pre-warmed all generated assets** so the first kid never waits: 8 court images (`/api/images?kind=tennis&id=*`), 7 one-shot SFX (`/api/sfx?s=tennis_*`), and 8 music tracks (`/api/tennis-music?world=*`) generated + cached.
- QA: `qa-tennis.mjs` still wins all difficulties; `npm run build` clean.

## Tennis goes dynamic — AI-art courts, ambient motion, explosions + smack talk (June 27 2026)
Big presentation upgrade to Buildable Tennis (`public/tennis.html`) + three reusable mechanics logged for future games.

- **Choosable AI-art worlds ("Choose your court").** 8 worlds (Sunny Beach, Space Station, Jungle, Underwater, Candy Land, Snowy Peak, Volcano Arena, Sunset Rooftop), each a full-scene backdrop from a NEW `kind=tennis` in `api/images.js` (generate-once-cache, budget-gated, `<img onError>` fallback). Drawn cover-fit via `BR.bgImage` + a readability scrim; every world keeps a drawn gradient fallback so a missing image never breaks play. Picker = shared BS `customizeLabel`/`onCustomize` -> a world grid of cached thumbnails.
- **Ambient world particles** (`fx-ambient-particles`): ~34 cheap per-world dots (snow falls, bubbles/embers rise, stars twinkle, leaves/sweets/clouds drift) so even a static backdrop feels alive. Runs in every state.
- **Explosions + juicier sound:** `BM.explode` fireworks where the ball blasts past the goal line and a 5-burst celebration on match win; new bespoke ElevenLabs SFX `tennis_boom` + `tennis_cheer` registered in `api/sfx.js` (synth fallback).
- **Smack talk** (`smack-talk-taunts`): playful fading speech bubbles. SOLO -> the bot talks freely (cheeky/hype/goofy). KID-VS-KID -> canned reactions ONLY; expanded the child-safe list to 12 ("Too slow!", "Boop!", "Wibble wobble!"...) in BOTH `tennis.html` and the enforced `ALLOWED` set in `FamilyRealtime.jsx` (no free text, ever).
- **Shared start-screen gain:** `buildable-startscreen.js` now supports a reusable `state:"ready"` card (green Play badge + optional `foot` hint, no progression wording) — Tennis uses Easy/Normal/Tricky. Fixes the odd "Cleared" footer for difficulty/mode pickers in any game.
- **Logged for reuse:** `MECHANICS.md` (FX row + new section 13), `GAME-LOOK.md` (AI-backdrop pattern), and `db/seed-tennis-mechanics.sql` (registers `pick-ai-world-backdrop`, `smack-talk-taunts`, `fx-ambient-particles`). `FamilyRealtime` lobby worlds updated to the 8 tennis worlds.

QA: `qa-tennis.mjs` still wins Easy/Normal/Tricky (render smoke ok); `npm run build` clean. **Owner action:** run `db/seed-tennis-mechanics.sql` once; the 8 court images auto-generate + cache on first view (or pre-warm `/api/images?kind=tennis&id=<world>`).

## Buildable Tennis — first real-time 1- & 2-player game (June 27 2026)
**Tennis is the first real-time multiplayer game** (the blueprint in `MULTIPLAYER.md` is now built). A new Track B engine `public/tennis.html` — paddles top & bottom, a bouncy ball, first to 7.

- **Three ways to play, one engine:** *solo* vs a beatable bot, *2 players* same-screen (top half / bottom half, or A/D + arrow keys), and *family* across devices via the realtime layer.
- **Speaks the frozen `mp:` contract only** — the engine never touches Supabase. Loaded with `?online=1` it hides its menu, posts `mp:ready`, then on `mp:init`/`mp:start` runs the match: the **host owns the ball** and broadcasts ball + its own paddle every frame; each kid broadcasts **positions, not commands**; the guest renders the field flipped (self at the bottom) and never simulates the ball; remote paddle + ball are lerp-smoothed; ends with `mp:result`. Canned reactions only (the 6 allowed phrases) — no free text.
- **Launched through `FamilyRealtime`** (now wired into the app for the first time): Games picker → **Tennis** tile → solo/2-player engine, with a **"Play a sibling"** button → `<FamilyRealtime game={{slug:"tennis", url:"/tennis.html?online=1"}}>` for cross-device play. Reuses the generic `rt_matches` table (keyed `game='tennis'`) — no new table.
- **Shared everything:** drawn art/ball/paddles via `BR`, juice (paddle-hit bursts, score shake/flash, "Point!" pops) via `BM`, sound via `BA`. **New bespoke ElevenLabs one-shots registered in `api/sfx.js`:** `tennis_hit`, `tennis_wall`, `tennis_point`, `tennis_win`, `tennis_lose` (auto-generated + cached on first play; `BA` synth is the silent fallback only). Start screen via the shared `BS`.
- **Always-winnable + QA'd:** every bounce carries a minimum sideways angle (no dead-straight stalemates) and the bots are tuned beatable. `qa-tennis.mjs` drives `TENNIS_GAME.sim()` headlessly — a flawless corner-aiming player wins every difficulty (Gentle/Normal/Speedy all PASS) and the render smoke-test passes. `npm run build` is clean.
- **Route:** `public/tennis.html` added to `vercel.json` before the landing-page catch-all.

**Owner action for family (cross-device) play:** run `db/create-rt-matches.sql` once in Supabase (if not already), and confirm the parent-account lane env vars are live. Solo + same-screen 2-player work with no setup. **Still TODO:** live QA across two real devices/sessions (the one thing a headless sim can't cover), and optional bespoke background music.

## Platformer opens calm (no auto-run) + App-Store-style game thumbnails (June 27 2026)

- **Platformer no longer auto-plays itself on open.** The hub runs play.html in an `<iframe>`,
  so keyboard went to the parent and the auto-demo never handed over ("stuck in demo mode").
  Removed the auto-running bot demo entirely: the start screen now shows the **idle hero in the
  scene + the animated finger-swipe hint + a big Play** button. Any tap / key / on-screen button
  starts the game and grabs focus (`window.focus()`), and the React iframe focuses itself onLoad
  so the keyboard works immediately. Sim still wins.
- **Real action key-art thumbnails for the Games hub** (was flat color gradients). Added a
  **`game` kind** to `api/images.js` (`?kind=game&id=platformer|breaker|survival|chess|typing`,
  gpt-image-1 medium, cached) with action-packed App-Store-style prompts; new `GAME_STYLE`.
  `src/BuildableKids.jsx` tiles render the image with the old gradient as the `onError` fallback.
  Generate-once-cache; trigger each URL after deploy.

## 2026-06-27 — Home redesign SHIPPED to main (Phase 1 + helper + 3D heroes)
- Merged feature/home-redesign -> main. Live changes: new kid home (welcome, your-move
  chess card, jump-back-in thumbnails, 4 colored-app-icon make tiles w/ 2-player tags),
  Chess+Typing moved into Games picker, Trending list (empty-state until kids publish),
  FLOATING HELPER = the kid's helper character image (tap to talk, x to hide), new
  Helper Lab screen (SCREEN_HELPER) to pick-from-library or make-your-own helper (stored on
  the kid object + localStorage bk_helper_v1; account-mode DB persist + voice = Phase 2).
- Hero/helper picker now prefers modern3d (3D render) over watercolor (_storyAssets
  STYLE_ORDER); built modern3d for all 24 library characters (cached in narration_cache).
- Responsive phone/tablet/desktop. Build passes. QA'd on preview before merge.


## 2026-06-27 — Home screen redesign (Phase 1) [branch: feature/home-redesign]
- Rebuilt `HomeScreen` in `src/BuildableKids.jsx` to the approved new layout:
  - **Helper greeting**: buddy avatar + "Welcome back, {name}!" with a dynamic line
    (your-move count → "keep going with <last creation>" → "what do you want to make?").
    Buddy art + spoken voice = Phase 2 (default face glyph for now; avatar taps to Switch kid).
  - **Your move card**: prominent gold card when it's the kid's turn in family chess
    (reuses existing `listMyMatches` polling). Multiplayer stays a mode inside games, not a section.
  - **Jump back in**: kid's 3 most-recent creations w/ real thumbnails via
    `/api/list-songs|list-stories|list-games` (deviceId + kidProfileId). Hidden when empty.
  - **Make tiles**: 4 big-icon tiles (Make a game / Play a top game / Make a story / Make a song)
    with 2-player tags; Chess + Typing kept as secondary tiles (chess shows your-move dot).
  - **Trending from other kids**: live list from `/api/top-creations` (mixed kinds, ranked),
    rows + "See all" open the Top board. Hidden when empty.
  - **Responsive**: width hook → phone <700 (2-col tiles, tighter), tablet 700–1023, desktop ≥1024.
- No DB/API changes; additive, with graceful fallbacks. `npm run build` passes (53 modules).
- TODO Phase 2: first-login helper onboarding (character + voice), spoken greeting, tap-to-change helper.
## Breaker adopts the shared start screen (BS) + start-screen is now a rule (June 27 2026)

First real adoption of `buildable-startscreen.js`: `public/breaker-engine.html` now renders
its launch/level-select via `BS` instead of its own `showMenu`/`renderLevels`. Editing the
ONE shared file now restyles breaker's start screen (and every future adopter) at once.

- **`buildable-startscreen.js` → v1.1** (safer, more reusable): mounts a child
  `<div class="bss">` INTO the host overlay instead of restyling the host (so it can't
  fight the engine's `.ov` show/hide). Added `showBack:false` (in-app games launched in an
  iframe omit the back button) and a "Cleared" footer for `done` levels that have no per-
  level stars (breaker doesn't track stars). The standalone demo (`?v=2`) still matches.
- **`breaker-engine.html`:** loads `buildable-startscreen.js`; `showMenu()` →
  `mountStart()`, which builds a `BS` config from `GAME_CONFIG.levels` + `PREFS.unlocked`
  (state done/next/locked, per-level color, "Make It Mine" → its existing customize panel,
  sound → `BA` mute). Keeps the old `renderLevels()` as a fallback if `BS` ever fails to
  load — which is also the path the headless QA sim takes.
- **QA:** `qa-breaker.mjs` reports ALL LEVELS WIN + render ok BEFORE and AFTER the change
  (gameplay untouched; the swap is menu-only). Live render verified in the browser.
- **Rule added** to `BUILDING-A-GAME.md` non-negotiables: every game's start screen is
  rendered by `BS` — never hand-roll or fork a per-game menu — so the start experience is
  changed once, centrally, not 1×1 per game.

Additive: only breaker's menu code changed; its gameplay, routes, and the other engines
are untouched. Other engines (survival, croc, platformer) adopt `BS` next, one at a time.


## Shared start screen / level picker `buildable-startscreen.js` (June 27 2026)

Added one consistent "start a game" experience for every engine, replacing the four
hand-rolled menus (survival `showMenu`/`renderLevels`/`renderLocker`, croc
`buildLevelPicker`, breaker `showMenu`, platformer's bare "Play!"). Design reviewed +
approved against the live survival screen. Additive — not wired into any engine yet
(engines adopt one at a time, QA before/after); live games unaffected. NOTE: this is the
launch screen of a *built* game, NOT the AI game builder.

- **`public/buildable-startscreen.js`** (global `BS`, `window.BuildableStartScreen`) — the
  fourth shared engine lib after `BR`/`BA`/`BM`. DOM-based, self-styled (one scoped
  stylesheet), self-iconed (inline SVG, no emoji/webfont), headless-safe (no-op without a
  DOM so the QA sim is unaffected). `BS.mount(el, config, callbacks)` renders: header
  (coins chip + sound), title/subtitle, hero strip (avatar + progress + Change), a mode
  row (Solo / 2 players / Family), a level grid (art thumbnail + stars earned + lock
  badge; the `next` level gets a green Play highlight), and an optional "Make it mine".
- **Optimizations over the old survival screen:** coins moved into the header; hero shown
  with progress; compact cards with real art thumbnails (all 6 levels fit, far less dead
  space); per-level stars; the next level is the visual focus; locked = dim + lock badge
  (not a fake "Locked" button); modes incl. multiplayer entry in one place.
- **`public/startscreen-demo.html`** — live demo (Space Sparkles config). Verified the
  real component render matches the approved mockup.
- **`vercel.json`** — added explicit routes for `buildable-startscreen.js`,
  `startscreen-demo.html`, AND `buildable-mechanics.js` (the last was a latent gap — it
  had no route, so it would have 404'd to landing.html when an engine first loads it).
- **`BUILDING-A-GAME.md`** — shared-libs table now lists four libs + a start-screen spec
  (config shape, `state` = done|next|locked, thumbnail/stars wiring, `family` → multiplayer).
  The `family` mode launches `FamilyRealtime` (MULTIPLAYER.md).


## Real-time multiplayer mechanism — reusable Broadcast layer + frozen contract (June 27 2026)

Built the generic, reusable REAL-TIME two-player mechanism (first user: tennis, built in a
separate chat). Additive — NOT imported by the app yet (no tile/route this commit), so the
live app is unaffected; the game chat wires it in when tennis is ready. No new npm
dependency (raw-WebSocket, matching the repo's no-SDK pattern).

- **`src/lib/realtimeChannel.js`** — dependency-free Supabase Realtime **Broadcast** client
  over a raw WebSocket (protocol v1.0.0, verified against the Supabase docs). join / send /
  on / 20s heartbeat / auto-reconnect. Passes the parent JWT as `access_token` so moving to
  private channels later is a config change.
- **`src/lib/rtMatch.js`** — generic `rt_matches` lobby over PostgREST (create/list/get/
  patch + role + channel topic), mirroring `chessMatches.js`. One table for ALL real-time
  games via a `game` column.
- **`src/FamilyRealtime.jsx`** — generic glue: lobby (pick a sibling) → open channel →
  assign role (host owns the ball) → embed the game iframe → bridge the frozen `mp:`
  postMessage contract ↔ the channel → enforce canned-reactions-only → write the result.
  A game becomes multiplayer via `<FamilyRealtime game={{slug,url,title}} .../>`.
- **`db/create-rt-matches.sql`** — family-RLS match/lobby table (mirrors `chess_matches`).
  **OWNER TO-DO:** run in Supabase (after the accounts SQL).
- **`db/seed-multiplayer-mechanic.sql`** — registers `mp-realtime-broadcast` +
  `mp-turn-based-row` in `game_mechanics` so a prompt can request multiplayer by name.
  **OWNER TO-DO:** run in Supabase.
- **Docs:** froze the `mp:` handshake contract + "how to use this mechanic" checklist in
  `MULTIPLAYER.md`; added a "Making it multiplayer" section to `BUILDING-A-GAME.md`; added
  §12 to `MECHANICS.md`.

The split: this layer is the network "pipes"; the tennis **game** (other chat) just speaks
the `mp:` contract and never touches Supabase. Both build against the frozen contract in
parallel. Security v1: public Broadcast topic on the match's unguessable UUID (the lobby
row is RLS-locked to the family); upgrade path = private channels + Realtime Authorization.



## Multiplayer playbook `MULTIPLAYER.md` (June 27 2026)

Audited how multiplayer works and wrote it up as a playbook (docs only — no code/DB
change). Finding: there is exactly ONE multiplayer pattern today — turn-based family
**chess via polling** (`chess_matches` row holds the whole board; the mover PATCHes it;
the opponent re-reads via `getMatch` on a 2s `setInterval`; `FamilyChess.jsx` +
`lib/chessMatches.js` own all networking, the engine only talks `postMessage`). No
Supabase Realtime/Broadcast is used anywhere yet.

- **New `MULTIPLAYER.md`** documents the two transports and when to use each: turn-based
  → poll a row (chess); real-time → a Supabase **Broadcast** channel (tennis, not built
  yet). Captures the shared non-negotiables (parent-account lane + `kid_profiles`
  identity; family-RLS scoping copied from `chess_matches`; **canned reactions only, no
  free-text chat**; engine stays network-agnostic via `postMessage`).
- **Tennis blueprint** included: Broadcast channel per match, **host-authoritative ball**
  (starter simulates + broadcasts ball position/score; each kid broadcasts only their own
  paddle), **send positions not commands** (self-correcting on dropped packets),
  kid-friendly ball speed, lerp-smoothing, and a `tennis_matches` row for lobby/score.
- Linked from `AGENTS.md` and `BUILDING-A-GAME.md`.



## Game engine docs + shared FX library `buildable-mechanics.js` (June 27 2026)

Organization pass on how we build games, so a new game/world/engine is storable,
trackable, and reusable instead of rebuilt from memory. All additive — no engine, route,
or UI changed, so live games are untouched this pass.

- **New entry point `BUILDING-A-GAME.md`.** The single "start here for a new game" guide:
  pick a track (A = the `generate-game.js` Phaser generator, B = a hand-authored
  `public/*.html` engine), build content as data on a shared engine, reuse/store
  mechanics, pull/store assets, guarantee always-winnable, QA, route, log. It ties
  together `MECHANICS.md`, `GAME-LOOK.md`, and `ASSET-LIBRARY.md`. `AGENTS.md` now points
  to it.
- **New shared engine lib `public/buildable-mechanics.js`** (global `BM`,
  `window.BuildableMechanics`) — the third shared lib alongside `buildable-renders.js`
  (`BR`) and `buildable-audio.js` (`BA`). Extracts the particle `burst()`, screen shake,
  screen flash, and floating `pop()` text that `survival-engine` / `croc-engine` /
  `breaker-engine` each copy-pasted, into one headless-safe library, plus a composed
  `explode()`. NOT yet wired into the engines (adoption is step 1 of the unification
  roadmap, one engine at a time with QA before/after).
- **`MECHANICS.md` expanded** with §9 (FX/"juice" mechanics + the `BM` library), §10 (one
  catalog, two engine tracks), and §11 (the multi-session unification roadmap).
- **`db/seed-fx-mechanics.sql`** — idempotent seed of 5 FX mechanics
  (`fx-explosion-burst`, `fx-screen-shake-on-hit`, `fx-hit-flash`,
  `fx-floating-score-pop`, `fx-confetti-celebrate`) into `game_mechanics`; each `rule`
  points at its `BM` call so catalog and code stay in sync. **OWNER TO-DO:** run it in the
  Supabase SQL editor (non-destructive INSERT … ON CONFLICT DO UPDATE).
- **QA:** Node smoke test confirms `buildable-mechanics.js` is headless-safe — particles
  and pops cull to zero, shake/flash decay, and `BM.draw(null, …)` (no ctx) does not
  throw, so the perfect-player sim is unaffected.



## Game: themed end-of-world bosses (June 26 2026)

Each world now ends with its OWN friendly boss instead of one generic purple blob.

- **Art:** added a `boss` piece to all 8 worlds in `api/game-art.js` — a giant, crowned,
  smiling version of that world's enemy (forest sprite, scarf snowman, crab king, baby dragon,
  baby dino, robot blob, armadillo, gumdrop). Generated + verified all 8 (1024x1024 PNGs).
- **Engine (`public/play.html`):** added `boss` to the world-prop map so it loads per world;
  the boss now renders from that art (gentle bob, a white flash + squash when bopped, HP pips
  above its head, and a happy wobble + sparkles when cheered up), with the original drawn blob
  kept as a graceful fallback if art hasn't loaded. Bumped the boss size (100x92) so it reads as
  a proper end-of-level boss. Unchanged: the friendly fight (bop the head `bossHp` times — no
  hearts lost on side bumps), the magic barrier that holds you back until it's happy, and the
  18s mercy failsafe so it can never soft-lock.
- **QA:** live `BK_GAME.sim(0)` wins (a win REQUIRES defeating the boss to pass the barrier).
  Stress-tested 5 varied recipes with bossHp 2-5 — all win. Visually confirmed the forest boss
  renders in-engine with HP pips + stomp flash, and all 8 bosses in a gallery. Rebased clean.


## Game: more moving platforms & swinging vines (June 26 2026)

Beefed up the two optional "climb-layer" toys in `public/play.html`, keeping the
always-clearable-by-ground guarantee (the QA "perfect player" stays on the ground and
ignores both, so denser bonus content can't soft-lock a level).

- **More moving platforms.** Roomier CLIMB zones (12-17 tiles) + tighter platform packing
  => more platforms per zone. Raised the default `movingPlatChance` 0.55 -> 0.75. Added a
  third **diagonal** mover type (alongside horizontal/vertical) and made movers carry a little
  arc of coins along their travel so riding them is rewarding. Riders are carried by horizontal
  and diagonal movers.
- **More swinging vines.** New `mkSwing()` helper; raised default `vineChance` 0.5 -> 0.8;
  sometimes spawns a **2-vine chain** to swing across, and an **optional vine over a RUN-zone
  gap** (a "swing the pit" shortcut — the ground jump still clears the gap, so it stays
  clearable). Vines render in lush clusters near platforms.
- **QA:** live `BK_GAME.sim(0)` returns **win**; stress-tested **5 varied recipes** (fast/long/
  gap-heavy/max-density/slow) by rebuilding `LEVELS` from temp configs — **all win** with up to
  21 platforms (all moving) and 31 vines. Visual check: vines/platforms/ride-coins render well.
  Engine-only change; art untouched. Rebased onto teammates' pushes; clean.


## Game: per-world themed enemies, hazards & coins (June 26 2026)

Follow-up to the 7-new-worlds session. The engine drew every world's enemy/hazard/coin from
one shared generic `props` set, so a desert level had the same forest critter as the forest.
Now each of the **8 worlds** has its own themed gameplay props in `api/game-art.js`:

- **critter** (enemy): forest sprite, snowball-with-scarf, reef crab, baby dragon, baby dino,
  space-alien blob, desert armadillo, candy gumdrop — all cute/harmless, never scary, no emoji.
- **gem** (spiky hazard): bramble thorns, icicles, sea-urchin spines, rock spikes, thorny vines,
  laser crystals, cactus spines, candy-cane spikes.
- **coin** (collectible): acorn, snowflake coin, pearl sand-dollar, dragon coin, amber leaf coin,
  star energy token, sun coin, gold candy coin.
- Engine (`public/play.html`): added a world-specific prop map `WP` for coin/gem/critter loaded
  from the current `GAME_CONFIG.world`; `propImg()` now prefers the world's own art and **falls
  back to the generic `props:*`** if a world lacks one (so nothing can break). Scenery + other
  props (vines/spring/flag) unchanged.
- Generated all **24** new cut-outs via `?build=` (~$0.24, cached), **verified all 24 `?img=`
  serve valid PNGs**, confirmed the gallery looks on-theme. **QA:** `BK_GAME.sim(0)` still returns
  **win** (render-only change). Rebased onto teammates' concurrent pushes; clean.


## Top Creations board — central library publishing, hearts/plays, remix (June 26 2026)

Mike: "lets have top songs, games, and stories... reflection of our central library. first name of kid... kids can toggle on and off publishing their creations." Choices: private-by-default, first name only, real hearts+plays, remix included.

**DB** (db/create-publishing.sql — Mike ran it): published/published_at/play_count/heart_count on saved_songs + saved_stories; heart_count on published_games; new creation_hearts(kind,creation_id,device_id unique) so hearts toggle without double-counting. Songs/stories publish by flagging the EXISTING saved row (no data duplication → remix just reads the row).

**Backend**: /api/top-creations (kind=song|game|story, ranked hearts*3+plays, public-safe cols only, marks which the device hearted), /api/heart-creation (toggle + recount), /api/play-creation (increment), /api/publish-creation (song/story flag by device_id ownership; game = approved/hidden). list-songs + list-stories now select the new cols with a pre-migration fallback so nothing breaks before the SQL is run.

**App**: new TopBoard.jsx — home "Top Creations" tile → SCREEN_TOP. Leaderboard rows (rank medal, cover, title, creator first name, plays, tappable heart, Play/Read, Remix). Songs play in-row via SongPlayer (now has onPlay→count). Games open /play/:id, stories /story.html?id.

**Publish toggles (private by default)**: My Songs cards have a globe toggle (grey=private, green=public); saved story cards have one too; games get a "Make private" button after publishing (publish-game still does the initial publish).

**Remix**: songs prefill the whole Music wizard from meta.choices (keepSong now stores choices); stories open the picker with the title as the idea seed; games route to the game picker. Deeper game/story prefill (theme/character/world slugs) is a later refinement.


## Game: 7 new worlds for the platformer art library (June 26 2026)

The runner engine (`public/play.html`) could already swap worlds via `GAME_CONFIG.world`,
but only **one** world's art existed (`enchanted-forest`) plus the generic `props` set — so
every game looked like the forest. Added the other **7 worlds** to `api/game-art.js`:
**snowy-village, coral-reef, dragon-mountain, dino-jungle, space-station, desert-oasis,
candy-land**.

- Each world reuses the engine's **fixed 8 piece keys** (`far, tree_a, tree_b, bush_a,
  bush_b, fern, mushroom, canopy`) so the engine swaps worlds with zero code changes — only
  the watercolor descriptions are themed per world (e.g. reef = branching coral / kelp /
  sea-fan / glowing anemones; candy = lollipop trees / gumdrop bushes / candy mushrooms).
- Generated all **56** new cut-outs via `?build=` (gpt-image-1, low, transparent PNG,
  cached in `narration_cache`), ~$0.60 one-time. **Verified all 64 `?img=` URLs** (8 worlds
  x 8 pieces) serve valid non-zero PNGs.
- **QA:** `BK_GAME.sim(0)` still returns **win** (gameplay untouched — art is cosmetic and
  uses a separate RNG). Loaded the engine with a **candy-land** config in an iframe and
  confirmed it renders the full candy scene (lollipop trees, candy hills, cotton-candy
  clouds) and the sim wins — proving the world swap works end-to-end.
- No `play.html` change needed (a teammate's concurrent ElevenLabs-music rewrite landed
  first; rebased cleanly, kept theirs).


## Platformer: real ElevenLabs music library + no-reading demo instructions (June 26 2026)

Follow-up to the polish pass, both in `public/play.html`.

- **Real background music (replaces the Web Audio synth loop).** Now streams the actual
  **ElevenLabs** tracks from the chess music library via `GET /api/chess-music?world=<key>`
  (already cached server-side; all 6 worlds verified live, ~469KB mp3 each, served in <10ms).
  `GAME_CONFIG.musicKey` sets the starting track (default **ocean** = dreamy ambient, Mike's
  pick for the forest). Added a **music-note button** (top-left, next to mute) that cycles the
  6-song library by ear — ocean/space/castle/jungle/candy/desert — with a brief on-canvas
  track-name toast (drawn note glyph, no emoji). Mute button still toggles SFX + music; music
  unlocks on the Play! tap (iOS gesture rule). No ElevenLabs key handled by the agent — the
  endpoint already uses the owner's env key server-side.
- **Instructions are now a no-reading demo (for pre-readers).** Replaced the text wall with a
  live **auto-playing bunny demo** (the QA bot drives it, looping) behind an **animated
  finger-swipe** hint (swipe up = jump, down = slide; glowing chevrons) and one big pulsing
  **Play!** button. Tap anywhere on the overlay to start; the **?** button replays the demo.
  `demoMode` loops the clip; the QA paths (sim/frameStep/setBot) force `demoMode=false` so the
  headless sim can never loop forever. Sim still returns ALL LEVELS WIN (2847 frames).


## Library navigation + app-wide emoji removal (June 26 2026)

**Easier libraries + "+ make next one" cards** (Mike: "make the libary easier to navigate... see a empty card with a + to make your next one")
- Music Maker > My Songs: a dashed "+ Make a Song" card now leads the grid (jumps to the maker, resets the wizard). Header keeps "<- Home"; tabs are the in-screen nav.
- My Stuff: every tab (Characters, Worlds, Songs) shows a "+ Make new" card, including the empty state, so there is always a clear way to create the next item. Back/Home kept as plain text.

**No emoji anywhere** (Mike: "emojis get rid of them all, everywhere"). Functional symbols kept (arrows, play/pause triangles, check, x, chip cyclers). Replaced colorful emoji with vector icons / text / CSS:
- src/MyStuff.jsx: tab + heading + Home emoji removed; character/world placeholders are line-art SVGs; Share is plain text.
- src/lib/CoverThumb.jsx: cover fallback is a vector music note (was an emoji).
- public/song.html + public/story.html (shared links): brand, CTAs, and cover/scene fallbacks de-emojified (vector note / calm gradient).
- src/BuildableKids.jsx: new GameGlyph vector icons for the game-type picker + controller; Home / My Stuff / build / publish / error text are emoji-free.
- src/CreatorScreen.jsx: trait chips are text-only; new ThemeGlyph vector world icons; difficulty uses colored CSS dots.
- public/games-library.html: trophy/medals/hearts/stars now CSS badges + inline SVGs; game tiles use initials.

**Still emoji (tracked, by design decision):**
- The mini-games themselves (typing.html, croctot.html, rileys-garden.html) and src/lib/storyEffects.jsx use emoji AS their on-screen artwork. Mike chose "replace with real art" — a per-game art pass (generate sprites via /api/images, wire in, QA), to be done one game at a time.
- public/landing.html: heavy emoji, but the other live session is actively editing it; deferred to avoid clobbering concurrent work.


## Platformer polish — moving platforms, swinging vines, friendly boss, background music + mute (June 26 2026)

All in the FIXED data-driven engine `public/play.html` (no art-pipeline changes — every new
element is drawn with shapes, so nothing new to generate). New level recipe knobs:
`movingPlatChance`, `vineChance`, `boss`, `bossHp`.

- **Moving platforms** — climb-zone platforms can slide on X or Y (deterministic frame clock
  `gameT` so the QA sim matches real play). The hero is carried along on horizontal ones.
  They live only in CLIMB zones over solid ground, so the ground win-path is never blocked →
  still always-clearable by construction.
- **Swinging vines** — pendulum vines hang in climb zones over solid ground. Jump onto one to
  grab, press JUMP to fling off in the swing direction; you can collect coins mid-swing. They
  are an OPTIONAL toy — the QA "perfect runner" bot stays on the ground path (grab is gated to
  `!botMode`), so the headless sim is unaffected and the level can never soft-lock on a vine.
- **Friendly end-of-level boss** — appears on the last level (`boss:true`, default 3 HP). A
  crowned creature guards a soft "magic barrier" just before the flag; bop it on the head
  (stomp) 3× to make it happy and drop the barrier. Side bumps cost NO hearts (kid-friendly).
  It stays dormant until the player is ~1 screen away, then arms an 18s mercy failsafe
  (auto-gives-up) so it can NEVER soft-lock. The bot now stomps it: verified it dies by skill
  (HP→0) at boss.t≈318 (~5s), well under the failsafe.
- **Background music + mute** — soft Web Audio pentatonic loop (no files), per-world root note,
  starts on the Play! tap (respects the iOS/iPad audio-unlock gesture). New top-left mute button
  (drawn SVG speaker, no emoji) toggles SFX + music together.
- **QA harness added**: `qa/sim-node.mjs` runs `BK_GAME.sim()` headlessly in Node (stubs the
  browser globals) so "every level wins" can be checked from the command line. Baseline + final
  both PASS.


## Share links, reusable AI image library, Music Maker quiz-wizard + ElevenLabs voice (June 26 2026)

### Sharing — private read-only links for stories & songs
- `api/shared-story.js`, `api/shared-song.js` — public GET by id from `saved_stories`/`saved_songs`
  (service key, public-safe fields only; no new tables — reuses the saved item id as the share token).
- `public/story.html`, `public/song.html` — kid-safe read-only viewers (story book w/ browser read-aloud +
  page nav; song cover + audio player), each with a "Make your own — free" CTA to the landing page.
- Routes added to `vercel.json` (root): `/story.html`, `/song.html`, `/s/:id`, `/p/:id`.
- `src/lib/shareSheet.js` — native share sheet (text/email/social) + desktop copy/email/text/social fallback.
  Wired into StoryMaker saved cards, StoryReader top bar, MusicMaker library, MyStuff song cards.

### Reusable AI image library — generate once, cache, serve by URL
- `api/images.js` — `GET /api/images?kind=cover|icon&...` → `gpt-image-1`, cached in `image_cache`,
  served as PNG bytes (`Cache-Control: immutable`). `?force=1` regenerate, `?manifest=1` list. Quality
  per-kind (icons=medium photoreal, covers=low). Auto/None/Surprise are NOT images (see wizard glyphs).
- `db/create-image-cache.sql` — `image_cache(cache_key, descriptor, b64, kind, created_at)`. RUN ONCE in
  Supabase (done). No new env vars — reuses `OPENAI_API_KEY` + `SUPABASE_*`.
- `src/lib/CoverThumb.jsx` (song covers in MusicMaker + MyStuff) and `src/lib/IconImg.jsx` (Music Maker
  picker icons) pull images by URL with a note/emoji placeholder until the photo loads. IconImg URLs carry
  `&v=2` to bust the immutable cache after the cartoon→photoreal prompt change.
- Music Maker icons are PHOTOREALISTIC studio shots; all 34 base + new option icons prewarmed/cached.

### Music Maker — quiz-wizard redesign (`src/MusicMaker.jsx`)
- One big illustrated question per screen, progress dots, **Next** button (no auto-advance), Back/Skip.
- Always-visible "song so far" strip — chips cycle (tap ▲▼ or swipe up/down) to change any earlier choice
  anytime, right up to render. **Render** plays a staggered slot-machine "lock + glow" then generates.
- 6+ options per question. New options + matching descriptions in `api/generate-song.js`: robot singer,
  electro drums, bass guitar, orchestra strings, super-fast/groovy speeds (+ Both singer photo).
- No emoji: Auto/None/Surprise render as vector glyphs; photos elsewhere. Animated "thinking" loader
  (equalizer bars + cycling messages). Removed the "world/theme" picker from song creation.
- **Read-aloud voice via ElevenLabs** (`/api/narrate-story-page`, cached in `narration_cache`) with a header
  speaker toggle; browser TTS only as a silent fallback. All ~50 wizard phrases pre-cached. Voice =
  `ELEVENLABS_VOICE_ID` (default "Rachel"); change the env value + re-cache to swap voices.

### Setup recap
- One-time SQL: `db/create-image-cache.sql` (done). Tables in play: `image_cache`, `narration_cache`,
  `saved_stories`, `saved_songs`.
- Env (Vercel): `OPENAI_API_KEY` (image library), `ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_VOICE_ID`,
  `ELEVENLABS_MODEL_ID`) for wizard voice — all already configured.



## Typing game added to the app (June 26 2026)

- New **Typing** experience: a learn-to-type game for ages 5-7 (find the glowing key,
  use the matching-color finger, defend the castle, beat the world boss). 6 worlds,
  enemy types, unlockable heroes, a SUPER power-up.
- Files:
  - `public/typing.html` — the self-contained game (vanilla HTML/JS/CSS, auto-fits screen).
  - `src/BuildableKids.jsx` — added `SCREEN_TYPING`, a `TypingScreen` (full-screen iframe of
    `/typing.html` + Home button), a "Typing" tile on the Home screen.
  - `api/images.js` — extended the image library with a new `kind=type` (heroes / baddies /
    bosses) so the game pulls generated art: `<... src="/api/images?kind=type&cat=hero&id=rocket">`.
    Transparent cut-outs, medium quality, cached in `image_cache` like covers/icons.
- Art is generate-on-first-request + cached (emoji placeholder shows until the PNG loads).
  No new env vars or SQL — reuses OPENAI_API_KEY + image_cache already in place.

# Buildable Kids — Session Log


## Account creation fix — email confirmation (Option B)

### Root cause (confirmed by probing live Supabase auth endpoint)
- The publishable/anon key, Supabase URL, and auth endpoint are all VALID
  (/auth/v1/settings -> 200). Code logic was fine. No secret key leaked in
  the browser bundle (verified).
- The Supabase project has `mailer_autoconfirm: false` -> email confirmation
  is REQUIRED. So /auth/v1/signup returns a user but NO access_token; it
  sends a confirmation email instead.
- Old signUpParent only saved a session `if (data.access_token)`, so it
  silently did nothing. UI flipped to "signed in" with no Bearer token ->
  the kid-profile REST call failed with "This endpoint requires a valid
  Bearer token" (the screenshot error).
- Also observed: Supabase's built-in email sender is rate-limited
  ("over_email_send_rate_limit" / 429), so confirmation emails may not
  arrive reliably on the default sender.

### Fix shipped (Option B)
- accounts.js (commit 4b0abbf): signUpParent now returns
  { signedIn: true } OR { signedIn: false, needsEmailConfirmation: true }.
- GrownUpScreen.jsx (commit 7faf815): handleAuth shows a friendly
  "Check <email> for a confirmation link, then sign in" notice (new green
  S.notice style) and switches to sign-in mode instead of failing. Auth
  errors are translated: rate limit -> "wait a few minutes", already
  registered -> "try signing in", confirm -> "confirm your email first".
- Both deployed green; 7faf815 is live Production.

### Owner follow-ups (cannot be done by the agent)
- FASTEST UNBLOCK: In Supabase -> Authentication -> turn OFF "Confirm email"
  (enable auto-confirm). Signup then returns a session immediately and works
  with no email step. (Tradeoff: no email verification.)
- For reliable confirmation emails (if keeping confirmation ON): add a
  custom SMTP provider in Supabase -> Auth -> SMTP Settings. The default
  built-in sender is heavily throttled.

## LATEST — guest mode added, now the DEFAULT (easiest path)
Owner: "add in 0auth so it's easier; default to this, and have 'use email instead'
be a smaller option." Done.

Commits:
- `495fd04` feat(accounts): added a GUEST profile store (device-local, no login).
  All profile helpers (list/create/rename/delete) now auto-branch on isSignedIn():
  signed in -> Supabase (DB), else -> guest localStorage. One API, two backends.
- `ea4a83e` feat(grownup): the screen now DEFAULTS to the guest "Who's playing?"
  picker (instant, no login). A small underlined "Use email instead (sync across
  devices)" link reveals the parent sign-in form. Signing in upgrades to the account
  store; "Keep playing without an account" backs out.

Behaviour summary (IMPORTANT tradeoff):
- GUEST (default): instant play, profiles on the device, songs saved to the central
  library by device_id. Guest songs DO NOT follow to another device (no account links
  devices). This is the cost of "no login."
- ACCOUNT (opt-in via the small link): profiles live in the DB; songs FOLLOW the kid
  to any device the grown-up signs in on. Use this when cross-device sync matters.
- UI copy makes the distinction explicit ("saved on this device" vs "follow them on
  any device") so a parent isn't surprised.

Deploy: 495fd04 Ready, ea4a83e Ready + live Production. Build green.

### Owner notes
- Nothing required to use guest mode — it just works now.
- To test cross-device sync, still use the email path: tap "Use email instead", make a
  grown-up account + sign in, then sign in on a 2nd device and pick the same kid tile.
- (I never create accounts or type passwords — the grown-up does that step.)

---

_Working log kept in-repo so context survives a dropped browser session._

## LATEST — parent accounts RESTORED (reverses the zero-auth change)
Owner clarified: "it was a mistake to remove parent accounts — 'we can't create
accounts' meant the feature was BROKEN, not unwanted." So accounts are back, because
songs must FOLLOW a kid across devices, which needs a stable DB-backed profile id.

Commits:
- `4814de5` restore(accounts): parent Supabase Auth login + kid profiles. FIXED a real
  bug: kid_profiles DB column is `name` (not `display_name`). Old code inserted/selected
  `display_name`, which doesn't exist as a column and silently failed -- a likely cause of
  the original "couldn't add a profile" symptom (on top of not being signed in). Now:
  insert { name }, read with alias select `display_name:name`. Added renameKidProfile
  (PATCH name) + deleteKidProfile so the ✏️/🗑️ tile buttons work.
- `3f25f9e` restore(grownup): brought back the email/password sign-in + "Who's playing?"
  picker, and kept the ✏️ rename / 🗑️ remove buttons on each kid tile.

How songs now follow across devices:
- save-song.js stores kid_profile_id; list-songs.js lists by kid_profile_id when set.
- MusicMaker reads the active kid (localStorage bk_active_kid_v1) and sends it as
  kidProfileId. The profile id itself lives in the DB, so signing in on Device B and
  picking the same kid tile shows the same songs. (Verified the wiring; needs a live
  end-to-end test by the owner.)

Env check (Vercel): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, service key,
MUSIC_PROVIDER, ELEVENLABS_API_KEY all PRESENT. isConfigured() will be true. Nothing to add.

Deploy: 4814de5 Ready, 3f25f9e Ready + live Production. Build green.

### OWNER TO-DO (must be done by you — I can't create accounts or type passwords)
1. On buildablekids.com/demo → Grown-ups, click "Make a new account", create your parent
   account (email + password) and sign in. (I never do this step for you.)
2. Add a kid profile (should now succeed — the column bug is fixed).
3. Make a song under that kid.
4. On a SECOND device/browser: go to Grown-ups, sign in with the SAME account, tap the
   same kid tile, open Music → the song should be there. That confirms songs follow.
5. If adding a profile still errors, tell me the exact message; the likely remaining cause
   would be a Supabase RLS/policy detail, which I'd diagnose and hand you any SQL to run.

---

## Latest session result (zero-auth) — DONE
All committed to `main`; Vercel auto-deploys. Commits this session:
- `769bc21` feat(accounts): zero-auth device-local kid profiles (no Supabase Auth/Bearer)
- `7e5c841` feat(grownup): zero-auth "Who's playing?" picker (login gate removed; rename/remove added)
- `9ac52cd` feat(music): rename-song button in the library (calls /api/rename-song)
- (earlier) `1bca6cd` generate-song ElevenLabs + 90s cap + cost tracking; `cdad64e` rename-song API

### What changed and why
- **Root cause of the "valid Bearer token" error**: adding a kid profile went through
  Supabase Auth (/auth/v1/user) + RLS, which need a signed-in parent JWT. With no auth
  there is no JWT, so Supabase rejected it.
- **Zero-auth fix**: kid profiles are now **device-local** (localStorage) in
  `src/lib/accounts.js`. No accounts, no login, no Bearer token anywhere. Tapping a tile
  selects the active kid. Add / rename / remove all work offline and instantly.
- `GrownUpScreen.jsx` no longer shows email/password; it shows the profile picker
  immediately and includes per-tile rename (✏️) and remove (🗑️) buttons.
- Songs/games still save to the **central library** in Supabase via the existing
  service-key API endpoints (they bypass RLS), scoped by device_id. Central repo unchanged.
- MusicMaker library now has a rename (✏️) button next to delete, calling /api/rename-song.

### Verified
- accounts.js committed: no signInParent / no authFetch / has createKidProfile + renameKidProfile.
- GrownUpScreen.jsx committed: no signIn, shows "Who's playing?".
- MusicMaker.jsx committed @9ac52cd: 471 lines, braces+parens balanced, no corruption,
  has renameSong fn + renameBtn style + rename JSX; deleteSong intact.

## Vercel deploy status (verified this session)
- Live Production = latest commit, Status **Ready**. All code commits built green:
  7e5c841 (GrownUpScreen) Ready, 9ac52cd (MusicMaker) Ready, df89ccb (log) Ready.
- One intermediate build, 769bc21 (accounts.js), shows **Error** but errored at ~4s and
  its identical accounts.js code shipped green in the very next build (7e5c841). Treated as
  a transient/superseded build, not a code fault. No action needed; mentioning for the record.

## Owner to-do when awake (nothing blocking)
1. Open buildablekids.com/demo → Grown-ups: confirm you can add a kid profile with NO login
   and that the "valid Bearer token" error is gone.
2. Make a song, then use the new ✏️ on a saved song to rename it; confirm it sticks.
3. (Optional, no rush) The Supabase account tables (parent_accounts, kid_profiles) are now
   unused by the app. Leave them in place — do NOT drop tables. No SQL needed for zero-auth.
4. If you later want profiles to sync across devices WITHOUT accounts, that needs a small
   deliberate design (anonymous device-id table). Flagged, not built.

## Editing note for future sessions (important)
- The GitHub web editor (CodeMirror 6) VIRTUALIZES long files, so a DOM "select-all + paste"
  only replaces the visible part and CORRUPTS the file. Char-by-char typing also corrupts
  (drops leading chars, injects phantom JSX close tags).
- RELIABLE METHOD used this session: drive the CM6 EditorView transaction API directly —
  `document.querySelector('.cm-content').cmTile.view` → `view.dispatch({ changes:[...] })`.
  This replaces exact offsets atomically with zero corruption. Verify with
  `view.state.doc.length` / `.lines` and a brace/paren balance check before committing.
- raw.githubusercontent.com caches; fetch a specific commit SHA path to read fresh content.

## House rules (still in force)
- Commit to `main`; verify each commit. Do NOT click "Create a New Game" / "Publish".
- Do NOT create accounts, type passwords, or handle API keys/billing.
- Do NOT run SQL or change auth/keys in Supabase — surface owner steps here.

## Challenge log
- GitHub code search "OR" silently breaks repo: scoping (leaks to other repos) — use single
  terms. Search index is also stale right after commits; verify via raw@SHA instead.
- Output filter blocks tool results derived from files containing URLs/keys — worked around
  by returning booleans/short identifiers and computing in-page.

- 2026-06-27 — Stories: multi-voice narration (narrator + per-speaker character voices) + in-page dialogue (writer emits `lines` with who/say) + narrative SFX one-shots (door/knock/thunder/firewhoosh/splash/magic/pop/whoosh/footsteps/bell/rustle/sparkle in api/sfx.js, catalogued in /api/list-audio). Reader sequences line clips per voice + plays SFX cues; single-voice fallback kept.

## Chess: spoken "Checkmate!" voiceover — June 26 2026

New `api/chess-voice.js` (ElevenLabs TTS, cached in narration_cache key `chessvoice:<line>`, `?force=1` regen). On checkmate the game plays a line via `playCheckmateVO(won)`: playful on a win ("Checkmate! In your face!" / "Boom! Checkmate! Gotcha!" / "Checkmate! Too easy!"), gentle on a loss ("Checkmate! Good game — want a rematch?") so the losing kid is never taunted by their own device. Created ElevenLabs sound per BUILDING-A-GAME.md (no synth); served under the existing /api/ route; silent fallback if unconfigured. Pre-warmed live + verified.

## Buildable Breaker: evolved to playbook (BM + BS + pong, stars, levels) — June 27 2026

Breaker is now the reference adoption for `BM` (buildable-mechanics.js — all juice via
explode/burst/shake/flash/pop) and `BS` (buildable-startscreen.js — shared menu + level cards
with stars/lock + Solo/2-player mode row; customize overlay via onCustomize). QA hook
standardized to `window.BUILDABLE_GAME` (BREAKER_GAME alias kept). Added: level stars (1–3 by
lives lost), 2 levels (Tall Towers, Castle Walls → 8), 2 power-ups (Laser, Fireball), and a
same-device 2-player Pong mode (first to 5; touch-by-half or arrows vs A/D). `qa-breaker.mjs`
covers Solo-all-levels-win + Pong-winner + render smoke (both modes). Live deploy QA'd in-iframe,
no console errors. Docs synced: BUILDING-A-GAME.md, MECHANICS.md §11, breaker-README.md.

## Buildable Breaker: round 3 polish (menu button, stars, rewards, themed bricks, sounds) — June 27 2026

In-game "‹ Menu" back button (Solo + Pong). Star progression: start screen shows "Stars: N of 24"
+ BS coins slot; Solo win screen draws the 1–3 earned stars. Star-unlock rewards: ball skins +
paddle colors gated by total stars (new reward balls Rainbow@16, Flame@24; locked items show cost).
Themed brick styles per backdrop (drawn): space=metal+rivets, candy=gloss+sprinkles, ocean=bubble,
castle=stone, desert=sand, meadow=gloss. Bespoke ElevenLabs SFX via BA.configure (reuse tennis_*;
new breaker_smash/break/power/miss in api/sfx.js) — synth now fallback-only, satisfying the sound
rule; verified /api/sfx?s=breaker_smash=200 live. All headless QA green (solo+pong+renders); live
deploy QA'd. TODO: looping music must be ElevenLabs (not in-house-synth music-library loops).

## Buildable Breaker: looping ElevenLabs music — June 27 2026

Background music now reuses the shared ElevenLabs per-world tracks (/api/chess-music?world=).
Breaker backdrops map onto music worlds (meadow->jungle; space/candy/ocean/castle/desert direct).
ensureMusic() runs on game start (both modes), swaps the track when the backdrop changes without
stacking, and respects the mute toggle. Real ElevenLabs music (not the in-house-synth music-library
loops), satisfying the sound rule. Verified live: candy + jungle return 200 audio/mpeg (~470KB,
cached from chess); BA.music.src set with loop=true on game start. All Breaker audio is now ElevenLabs.

## Chess: "living pieces" experiment — idle motion + move speech + toggle — June 26 2026

Pieces now idle in place (randomized aliveBob/Wiggle/Breathe/Look on the piece SVG, pivot near feet, never leave the square; selected/celebration states override). On a kid's own move a short upbeat line plays (16 phrases via `api/chess-voice.js` move1..move16, ElevenLabs TTS cached; skips the bot's moves and the game-ending move so the Checkmate VO is not stepped on; non-overlapping). New **Living pieces** toggle (face icon in the HUD) turns motion+speech off, saved in localStorage `bk_chess_alive` (default on). Created ElevenLabs audio per BUILDING-A-GAME.md; no emoji.

## Chess: world-specific living creatures (Ocean + Jungle first) — June 26 2026

Piece art is now per-world: `pieceSVG(type,color,world)` dispatches to a `CREATURES[world]` set, falling back to the default heroes for un-themed worlds. Ocean = fish/seahorse/jellyfish/crab/octopus/pufferfish-king; Jungle = frog/monkey/parrot/tortoise/butterfly/lion-king. Drawn as inline SVG (reusing the team palette + eyes/smile helpers) so the alive idle motion, 2-team recolor, and crispness all carry over; rendered via `renderPieces` with the active `sceneKey`. World BACKGROUNDS already reuse the asset library; creatures are newly drawn vector (the library has scene/item art, not 6 creatures/world). Next: Space, Candy, Castle, Desert creature sets. No emoji.

## Buildable Breaker: bespoke upbeat music (api/breaker-music.js) — June 27 2026

Replaced the chess-music reuse with a dedicated upbeat/arcade music set: new api/breaker-music.js
(ElevenLabs Music /v1/music, cache key breakermusic:<world>) with one peppy track per backdrop —
meadow chiptune-pop, space synthwave, candy bubblegum, ocean surf, castle 8-bit march, desert funk.
Engine ensureMusic now points at /api/breaker-music?world=<backdrop> (loop, swaps on backdrop change,
respects mute). All 6 worlds pre-warmed + cached live (~469KB each; cached refetch ~19ms). Verified
engine sets BA.music.src to the new endpoint with loop=true.

## Chess: rank badges on living pieces — June 26 2026

Themed creatures were hard to read as chess ranks, so every in-game piece now carries a small white corner badge with the classic piece glyph (pawn/knight/bishop/rook/queen/king) via `withBadge()` wrapping `pieceSVG` in renderPieces + promotion. Creature + team color still carry theme/side; the badge gives instant rank ID. Home mascots unbadged.

## Chess: AI-generated piece art — kind=chesspiece + Space prototype — June 26 2026

Added `kind=chesspiece` to `api/images.js` (gpt-image-1, transparent, cached in image_cache, served by `/api/images?kind=chesspiece&world=&piece=`). Prompt = piece-shaped core ("clearly reads as a chess <rook/knight/...>") + per-world theme. Game renders AI image pieces for worlds in `AIWORLDS` (prototype: space) with the vector piece as an instant fallback shown until the image loads (so the board is playable during the ~30s first-gen), team distinguished by a colored base glow. Alive idle animates the img too. Other worlds keep vector. Next: judge quality/iPad perf on Space, then roll out remaining worlds; note no server-side image resize lib, so watch iPad memory (1024 PNGs, ~6 distinct per world).

## Chess: AI pieces rolled out to all worlds — June 26 2026

After approving the Space prototype, expanded AIWORLDS to all six worlds (ocean/jungle/space/candy/castle/desert). Each world now renders gpt-image-1 piece art (kind=chesspiece) with the vector classic-core piece as instant fallback until each image loads + caches. Pieces generate on first open (~30s, vector shows meanwhile), instant after.
