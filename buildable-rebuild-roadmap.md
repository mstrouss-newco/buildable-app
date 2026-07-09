# Buildable Kids — Platform Rebuild Roadmap (v2, July 9)

The master plan. Lives in the repo root. Every build session starts here. The planner at /planner is the source of truth for progress; this file is the reference.

## How we work (the session ritual)
1. Chat sessions decide, Cowork sessions execute. Mocks, plans, and punch lists happen in chat. Code happens in Cowork with a prepared prompt.
2. Every Cowork session: pull latest, follow CLAUDE.md, do ONE session block, update SESSION-LOG.md, recap.
3. Refinement is a punch list, not a redo. Notes on session cards ride into prompts.
4. Any session touching a game ends by running that game's QA script. Never claim QA passed if it did not run.
5. Main auto-deploys to the live site: never remove a working feature before its replacement is live. Replace first, remove second.
6. Companion docs: buildable-manifest-v2.md, CARTRIDGE-CONTRACT.md, MULTIPLAYER.md, GAME-FEEL.md, ASSET-LIBRARY.md.

Priority games, in order: Breaker → Survival → Sling.

---

## Phase 1 — Speed fix
- [x] **Session 1A — Compression pass.** Resize and compress all oversized art (2x for retina), WebP with fallback, update references. Shipped.
- [x] **Session 1B — Art serving.** Static serving with cache headers, instant fallback plus background generation, no kid ever waits on generation. Shipped.

## Phase 2 — Shell v2: manifests + real URLs
- [x] **Session 2A — Manifest plumbing.** Breaker manifest per spec, shared loader (buildable-manifest.js) validates and translates. Shipped.
- [x] **Session 2B — URLs.** Real shareable, refresh-safe routes; marketing page stays at /, picker at /app. Shipped.
- [x] **Session 2C — Shared systems wiring.** Demo, buddy, coins, quiz gates driven by manifest switches. Shipped. Cartridge contract adopted and aligned in follow-up sessions; wallet ownership moves to shell (done in 3C-era work per contract note).

## Phase 3 — Paint layer
- [x] **Session 3A — Picker + game landing.** One rendering path for all games via identity manifest stubs; Breaker landing with demo. Shipped.
- [x] **Session 3B — Journey.** Winding level path from the manifest, vertical on phones; /breaker deep links converged on shell landing. Shipped.
- [x] **Session 3C — Loadout + one HUD.** Customization with coin prices and unlocks, single HUD system, shell owns the wallet. Shipped.
- [x] **Session 3D — Feel Kit + GAME-FEEL.md.** Shared feedback, sounds, celebrations; Breaker fully kit-driven. Shipped.
- [ ] **Session 3E — Home screen redesign.** Build per the approved chat mock: cream/light theme only, no dark mode, no emojis anywhere (drawn SVG icons or art slots only). Stack: header (avatar, kid's name, streak text, drawn bell with badge count for turns and invites, coins), then conditionally: one dismissible buddy moment card, a Your move card for pending multiplayer turns (reads the existing turn system), Jump back in hero from profile history, Today's Brain Boost card only when the parent has learning mode on (daily question progress bar, coin reward named on the card, done-state says Done for today rather than vanishing). Then Play and Make shelves as manifest-driven side-scrolling cards, and Trending with rank, art thumb, type chip, drawn heart with count. Never render without an active profile. If phasing is needed, structure first then live data, but never ship placeholder lies (no fake streaks or fake progress).
- [ ] **Session 3F — Law updates.** Add to CLAUDE.md: never use emojis anywhere in the product (drawn SVG geometry or art slots only, applies to UI, buddy messages, celebrations, notifications), and confirm the replace-first-remove-second deploy rule is present. Commit the updated buildable-rebuild-roadmap.md (this file) to the repo root replacing the old one.

Done when: Breaker's entire out-of-game experience is shell-generated, feedback and celebrations come from the Feel Kit, and the new home is live.

## Phase 4 — Editor v1
- [ ] **Session 4A — Level-first editor.** One page per game: game art slots up top; level rows (name, parts strip, layout, difficulty 1 to 5 chips, Test button, reorder, remove, add). No worlds layer: levels point directly at parts. Reads and writes the manifest.
- [ ] **Session 4B — Drop-in art flow.** Drop in art on any slot or part runs the existing auto-slicer straight to that slot's asset ID; Library picks existing assets. Save runs the QA robot, then live.

Done when: a level's bricks can be changed and difficulty set to 4 with zero code, live after the robot passes.

## Phase 5 — Prove the pattern
- [x] **Session 5A — Survival converts.** Manifest, loader wiring, homemade menus retired (gear locker stays engine-owned pending the shell upgrade store). Shipped.
- [x] **Session 5A2 — Survival QA harness.** Baseline harness written pre-conversion. Shipped.
- [ ] **Session 5B — Sling converts.** Same pattern as Survival, now a known-cost job. Include the contract check in its harness (start, pause, resume honored; score, coins, levelComplete reported).

## Phase 6 — Shared systems part 2 + studios
- [ ] **Session 6A — Multiplayer switch.** Manifest multiplayer off/turn-based/realtime connects to the existing multiplayer system. Prove on one game.
- [ ] **Session 6B — Learning + parent controls + onboarding.** Coin top-up gate (3 right = 10 coins) and parent portal toggles override manifest defaults. Dashboard reports skills, not counts: mastered vs practicing per subject over time, streaks, a practice-next nudge, weekly parent email digest. Question bank gets curriculum tags (grade, subject, skill) and adaptive selection based on recent misses; review step required before any generated question enters the bank. Onboarding pass: parent OAuth once, create kid profiles (name, avatar, grade; grade drives learning level), avatar-based picker on every open, optional kid PIN.
- [ ] **Session 6C — First studio converts.** Music Maker gets a studio manifest: badge on the picker, coins, customization (instrument packs), learning gates. Proves type studio.
- [ ] **Session 6D — Guest play links (the grandma flow).** We built but never tested a one-way share tool where a kid or parent sends a link and the recipient plays instantly, no account. Locate it, test the full flow end to end on two devices, fix what is broken. Safety shape: guest sees only that game and match, canned reactions only, link expires, guest games visible in the parent portal. The guest flow must bypass the profile gate added in the July 9 fix: guests get a temporary guest identity, never see the picker, and the Home safety-net guard must not block the guest game screen. Wire entry points: share button on 2-player game cards and in the chess lobby. Done when a link from Riley's profile lets a phone across the room play chess against her in two taps.
- [ ] **Session 6E — Buddy 2.0, moments not chatter.** Replace the always-on assistant with an event-driven buddy that speaks rarely and specifically: triggered by contract messages (levelComplete, score, coins) crossed with profile history (attempt counts, personal bests, favorite games, return visits). Personality per game from the manifest. Hard rules: never interrupts gameplay, a few moments per session max, parent toggle, no emojis. Remove the persistent chat bubble.

## Phase 7 — Conversion campaign + cleanup
- [ ] **Session 7A — Catalog triage.** Keep/archive/kill pass on the full 45-file catalog with Mike deciding; archive prototypes out of public/.
- [ ] **Session 7B — Conversion campaign.** Convert keeper games one by one, one short session each, QA harness per game, contract checks included.
- [ ] **Session 7C — Kid customizer polish.** The loadout as kids experience it, coin unlock celebrations through the Feel Kit.
- [ ] **Session 7D — Retire the superseded.** Remove Breaker's old in-engine start menu and Make-it-mine maker once nothing deep-links to them, the worlds tab, the losing HUD, per-game menus. Rewrite BUILDING-A-GAME.md as the new-game playbook: one-page spec first, engine built against CARTRIDGE-CONTRACT.md, QA harness written in the same session as the engine, art and tuning through the editor.

## Phase 8 — Education engine
- [ ] **Session 8A — Living question library.** Scheduled AI generation (target 50 reviewed questions per week) into a curriculum-mapped bank tagged by grade, subject, and skill. Contextual generation: questions themed to the game being played, created fresh. Nothing enters the bank without the review step. Builds on the generate-quiz API and 6B tagging.
- [ ] **Session 8B — Learning ledger.** Add a skill message to CARTRIDGE-CONTRACT.md so any game reports practiced skills (correct/incorrect) into one record per kid. Quiz gates and native learning games feed the same ledger; the parent dashboard reads one source. Do before the first native learning game.
- [ ] **Session 8C — First native learning game.** A game where the academic skill IS the mechanic, not an interruption: candidates are a math-powered cannon game, a word-builder platformer, a fraction shop. Manifest declares skills taught, reports through the ledger, built through the standard game factory pipeline. Also the best demo for the education pitch.

## Phase 9 — Parked (triggers written down)
- [ ] **Session 9A — Tier 2 engine evaluation (Godot).** Triggers: Fish Farm greenlit at full ambition, or a concept exceeding web-native tools. Scope when triggered: shared cached Godot runtime, headless export robot, loading progress screens. The cartridge contract already makes this bolt-on. Consider Phaser as the cheaper middle tier first.
- [ ] **Session 9B — Shell upgrade store (gameplay progression).** Loadout is cosmetics-only; games with gameplay upgrades (Survival's gear locker) keep those screens engine-owned until this exists. Manifest declares upgrade tracks and prices, shell renders the store and owns purchases via contract messages, effects stay engine-side. Settle the economy rule first: whether shared-wallet coins can buy gameplay power (cross-game farming risk), or power uses per-game currency or level-unlocks.
- [ ] **Session 9C — New games backlog triage.** Holding pen for every game idea until the factory opens (after 5B). Triage into: variants (manifest plus art only, no code), new-mechanic games (one engine file against the contract, harness written at birth), Tier 2 ambitious games (wait for trigger). Variants first for quick catalog wins. No new games before 5B completes.

---

## Punch List (refinements — add freely, clear in surgical sessions)
- (add items as testing surfaces them)
