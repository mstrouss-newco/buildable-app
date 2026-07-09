# Buildable Kids — Platform Rebuild Roadmap

The master plan. Lives in the repo root. Every build session starts here.

---

## How we work (the session ritual)

1. **Chat sessions decide, Cowork sessions execute.** Mocks, plans, and punch lists happen in chat (cheap). Code happens in Cowork with a prepared prompt (expensive, so scoped tight).
2. **Every Cowork session:** pull latest from GitHub first. Read this roadmap. Do ONE session block below. Update the checkboxes and SESSION-LOG.md. Recap what was completed and what remains.
3. **One session block per session.** Never "work on the platform." If a block finishes early, stop and recap rather than drifting into the next block.
4. **Refinement is a punch list.** Mike tests on iPad/iPhone, collects reactions into the Punch List at the bottom of this doc. Short surgical sessions clear the list. Nothing gets rebuilt because of small feedback.
5. **The robot checks the work.** Any session touching a game ends by running that game's QA script.
6. **Companion docs:** `buildable-manifest-v2.md` is the manifest contract. MULTIPLAYER.md, HUD-AND-NAV-RULES.md, GAME-LOOK.md, ASSET-LIBRARY.md remain the deep guides for their systems.

**Priority games, in order: Breaker → Survival → Sling.** These three are the reference set for everything. (Conveniently, they are also the three games the current upload tool already supports.)

---

## Phase 1 — Speed fix (do first, independent of everything)

**Goal: nothing on any page takes 10 seconds to appear.**

- [x] **Session 1A — Compression pass.** (done 2026-07-08: public gameplay art 23.5MB->3.5MB WebP, every Breaker level <400KB, QA green) Scan public/ for oversized images (breaker theme PNGs are 0.5–1.3MB each; whole folders are 4MB+). Resize every image to its actual display size, convert to compressed WebP with PNG fallback where needed, update references. Target: any single level's art under ~400KB total. Run QA scripts on breaker, survival, sling to confirm nothing broke visually.
- [x] **Session 1B — Art serving.** (done 2026-07-08: static art folders now send long-lived cache headers; images.js no longer generates while a kid waits — instant fallback + background warm; images/game-art responses edge-cached via s-maxage; Breaker per-level art ~350-390KB, QA green) Cached/generated art (game-art, images API) must serve as plain static files with proper caching headers, never through a slow function per load, and never generate-on-demand while a kid waits. If a piece is missing, show instantly with a fallback and generate in the background.

Done when: cold-load of Breaker on iPad wifi shows gameplay art in under 2 seconds.

---

## Phase 2 — Shell v2: manifests + real URLs

**Goal: Breaker becomes the first manifest-driven game with real, shareable, refresh-safe URLs.**

- [x] **Session 2A — Manifest plumbing.** (done 2026-07-08: /breaker/manifest.json + shared shell loader public/buildable-manifest.js validate/resolve/translate; Breaker engine reads levels+layouts+difficulty 1-5+art asset IDs from it, built-in GAME_CONFIG kept as headless fallback; qa-breaker validates the manifest AND sims its levels — ALL PASS) Create /breaker/manifest.json per buildable-manifest-v2.md. Shell loads and validates it. Breaker engine reads level list, layouts, difficulty (1–5 translated to its internal tuning), and art asset IDs from the manifest instead of its internal GAME_CONFIG.
- [x] **Session 2B — URLs.** (done 2026-07-08: Breaker deep links live via Vercel rewrites — /breaker, /breaker/journey, /breaker/play/{levelId} by manifest level id, /breaker/loadout. `<base href="/">` makes deep URLs load assets from root; a small router reads the path on load (waits for the manifest so /play ids resolve), pushState on navigation, popstate restores the spot + back button. Standalone-only: the in-app iframe picker flow is untouched. `/` left as the marketing landing; picker stays at /app. Loadout points at the existing Make-It-Mine look flow until the Phase 3C loadout screen exists. QA green.) Real routes: / (picker), /breaker (landing + demo), /breaker/journey, /breaker/play/{levelId}, /breaker/loadout. Refresh restores the spot. Back button works. Decide hosting detail (Vercel already in use — deep links work natively).
- [x] **Session 2C — Shared systems wiring, part 1.** (done 2026-07-08: manifest `features` now drive the real shared systems. demoOnLoad gates the tutorial/demo hand; buddy.on pings buildable-buddy (BB) on level-up/win/lose; coins award each level's manifest coin value into a NEW shared platform-wide wallet (`public/buildable-wallet.js`, first-clear-only so replays can't farm) shown on the start-screen pill; learning.beforeUnlock asks the parent app to show the EXISTING QuizGate before a new level unlocks — in-app only, respecting the parent Learning-Mode toggle (their settings win). Cold standalone deep links have no parent so they simply skip the gate. All switches guarded so headless QA + offline are unaffected; qa-breaker green.) The manifest switches connect to the EXISTING shared systems: demoOnLoad → the demo framework; buddy → buildable-buddy; coins → the shared wallet; learning → QuizGate at the declared moments. No rebuilding these systems; just wiring the switches.

Done when: texting someone buildablekids.com/breaker/journey opens Breaker's journey, refresh-safe, with demo, coins, and quiz gates all driven by the manifest.

---

## Phase 3 — Paint layer (built once, from manifests)

**Goal: the new consistent choosing screens, art-direction-agnostic (slots filled with current art until the new direction lands).**

- [x] **Session 3A — Picker + game landing.** (done 2026-07-08: the games picker is now generated from a `GAME_CATALOG` identity layer — every card renders badge art + name + category + signature color from data, studios get a Studio tag; Breaker's identity mirrors its manifest, the rest are stubs enriched as they convert. New shell `GameLanding` front door: badge/name/category/signature-color + a self-playing "attract" demo (the engine embedded at `?screen=demo`, input disabled, bot loops level 1). Breaker's picker card now opens the landing; Play/Make launch the engine straight into its journey/maker via `?screen=`, so the engine NEVER shows its homemade Play/Make hub in-app. Front-door-only by design: the engine's level-picker (journey) and customize (loadout) stay engine-owned until 3B/3C so kids are never stranded. qa-breaker green.) New picker built from manifests (badge slot, name, category, signature color; studios tagged). Game landing with demo. Kill each converted game's homemade menus.
- [x] **Session 3B — Journey.** (done 2026-07-08: shell-generated `BreakerJourney` reads `/breaker/manifest.json` and draws the winding level path — stops weave down a vertical scroll, tight on phones and a wider wander on iPad/desktop; each stop shows theme art as its placeholder badge (real `journeyBadge` art drops in later, per the current-art-in-slots rule), 0-3 stars, and a locked state, all read from the SAME `bk_breaker_prefs` progress the engine writes; the current level auto-scrolls into view. Landing Play now opens the shell Journey; tapping a stop boots the engine straight into that level via `?screen=play&level=<id>` (waits for the manifest); Home from a level returns to the Journey so the path lights up. The engine's homemade level menu is no longer the in-app front door — it survives only as the standalone `/breaker/journey` deep-link handler. qa-breaker green; app builds.) The winding level path generated from the manifest's level list. Vertical scroll on phones, wandering layout on iPad/desktop. Stops show journeyBadge art, stars, locked state; current level auto-scrolls into view.
- [x] **Session 3C — Loadout + HUD.** (done 2026-07-08: shell-generated `BreakerLoadout` built straight from the manifest's `customization` slots — free looks owned, priced looks unlock by spending coins, tap to equip; picks live in a per-kid shell loadout store and are handed to the engine as tiny `?pad=&ball=` params on play. ONE HUD: `buildable-hud.js` is the single system, the per-game HUD-stylesheet idea (game-hud.css) retired; new `BuildableHUD.setAccent(color)` tints every chip with the manifest's signature color, called by the engine when the manifest loads. Wallet ownership moved to the shell: `buildable-wallet.js` is OWNER in the top window / ANNOUNCER inside a game iframe (posts `coins` deltas only, never touches storage), per CARTRIDGE-CONTRACT.md; index.html loads it as owner, the loadout spends there. Build green; qa-breaker ALL CHECKS PASS.) Loadout screen from customization slots with coin prices and unlocks. ONE HUD system (retire the losing one of buildable-hud.js vs game-hud.css), driven by manifest accents.

- [ ] **Session 3D — Feel Kit + GAME-FEEL.md.** Write the feel standard (instant tap feedback, shared win celebration, coin burst, no punishing fail states, generous kid-sized hitboxes, shared sound palette). Consolidate the existing pieces (buildable-audio, wincard, renders effects) into one shared Feel Kit that games call instead of reimplementing. Manifest gains the feel presets (pace, celebration, haptics). Breaker converts to the kit.

Done when: Breaker's entire out-of-game experience is shell-generated, none of its old menu/HUD code remains, and its feedback/sounds/celebrations all come from the Feel Kit.

---

## Phase 4 — Editor v1

**Goal: the internal editor per the approved mock (v2), built ON the existing upload/slicer code.**

- [ ] **Session 4A — Level-first editor.** One page per game: game art slots up top; level rows (name, parts strip, layout, difficulty 1–5 chips, Test button, reorder, remove, add). Remove the "worlds" layer from the UI; levels point directly at parts. Reads/writes the manifest.
- [ ] **Session 4B — Drop-in art flow.** "Drop in art" on any slot/part = the existing auto-slicer, saving straight to that slot's asset ID. "Library" = pick existing assets. Save = QA robot runs, then live.

Done when: Mike can change a level's bricks, set difficulty to 4, hit save, and see it live after the robot passes, with zero code touched.

---

## Phase 5 — Prove the pattern: Survival, then Sling

- [ ] **Session 5A — Survival converts.** Write its manifest, wire its engine to read it, delete its homemade menus/HUD. Should be much faster than Breaker was; if it isn't, the shell has a gap — fix the shell, not the game.
- [ ] **Session 5B — Sling converts.** Same. After this, conversion is a known-cost, repeatable job.

---

## Phase 6 — Shared systems wiring, part 2 + studios

- [ ] **Session 6A — Multiplayer switch.** Manifest multiplayer: off/turn-based/realtime connects to the existing multiplayer system (poll-a-row and Broadcast lanes, per MULTIPLAYER.md). Prove it on one game.
- [ ] **Session 6B — Learning + parent controls.** Coin top-up gate (3 right = 10 coins), parent portal toggles override manifest defaults, results visible in the grown-ups screen.
- [ ] **Session 6C — First studio converts.** Music Maker gets a studio manifest: badge on the picker, coins, customization (instrument packs), learning gates. Proves type: studio.

---

## Phase 7 — Conversion campaign + cleanup

- [ ] Keep/archive/kill pass on the full 45-file catalog (many are prototypes; archive them out of public/).
- [ ] Convert the keeper games one by one (one short session each, QA robot verifying).
- [ ] Kid customizer polish: the loadout as kids experience it, coin unlock celebrations.
- [ ] Retire superseded docs/systems (worlds tab, losing HUD, per-game menus).

---

## Later / parked
- New art direction drops into the slots (Mike driving; zero rework needed by design)
- Editor permission slices for parents (difficulty presets) and kids (the customizer IS the kid slice)
- Multiplayer expansion beyond the proof game
- Studio creations feeding games (a Music Maker song as a game's soundtrack)

---

## Punch List (refinements — add freely, clear in surgical sessions)
- (empty — add items as testing surfaces them)

---

## Session log pointers
Use SESSION-LOG.md as today. Each entry: date, session block ID (e.g. "2B"), what shipped, what's left in the block, any punch list items added.
