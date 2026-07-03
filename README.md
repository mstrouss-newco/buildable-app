# buildable-app

> **Live URL:** https://www.buildablekids.com/demo

A kids' game builder where children enter their name & age, generate an AI character and world, then play a custom Phaser platformer Ã¢ÂÂ all in the browser. No login required.

---

## Survival: full-screen on iPad/iPhone + gently-moving nature worlds (July 3 2026)
Owner asks: make Space Sparkles (`public/survival-engine.html`) fill the whole screen on iPad/iPhone, and swap the single space backdrop for the new gently-moving parallax nature worlds.

**Full screen.** The canvas used to sit letterboxed in a centered box (fixed 900x600, rounded corners). It now fills the entire viewport: CSS is `position:absolute;inset:0;width:100%;height:100%`, and a new `resizeCanvas()` makes the logical `W`/`H` adapt to the screen (short side pinned to 640 game units so heroes/enemies stay a comfy size, long side grows to fill — no stretching, no bars). DPR-aware so it stays crisp on retina. Headless QA keeps the old 900x600 (guarded on a real viewport).

**Gently-moving parallax worlds.** Each of the 6 levels now gets its own layered pixel-art scene (CraftPix "Nature Landscapes", `public/parallax/nature/nature_*`). `drawParallax()` tiles each layer across the width and drifts it slowly — back layers barely move, each nearer layer a touch faster — for a calm sense of depth. Falls back to the old space art only until layers load. A soft vignette keeps the white HUD readable over bright daytime scenes.

**Gotcha (fixed here):** `public/parallax/*` was never actually served — there was no `/parallax/(.*)` route in `vercel.json`, so those paths fell through the catch-all to `landing.html` (this had silently broken breaker's forest/hills backdrops too). Added the route. Every static `public/` subfolder needs its own explicit route; there is no filesystem fallback. Live-QA'd in browser: all 6 worlds load, canvas fills the viewport, no console errors.

## Parent login: one math check, not two + add a second parent (July 2 2026)
Owner asks: (1) the grown-up login was weird — you'd tap "Grown-ups", answer a math check, land on the who's-playing screen, tap "For grown-ups", then answer a SECOND math check. (2) allow adding another parent to a family.

**(1) One gate, not two.** The top-nav "Grown-ups" button (`GrownUpButton` in `src/BuildableKids.jsx`) already runs its own math check. It now flags the visit as `grownVerified` and passes `preVerified` into `src/GrownUpScreen.jsx`, which (a) opens straight to the Parents area for signed-in grown-ups and (b) skips its own `openParents()` math gate. Reaching the Grown-ups screen any OTHER way (e.g. the auto-open on app launch for a signed-in parent) still shows a single gate, so kids can't wander in. Net: one math question to reach Parents.

**(2) Add another parent (family code).** A second grown-up can now make their OWN login and share the SAME kids. In Parents there's an "Add another parent" card: the owner shares a short **family code**; the other grown-up signs up and types it under "Joining another parent's family?". Reuses the friend-code style (no email service needed).
- DB: `db/create-coparents.sql` (run ONCE in Supabase, after the accounts files) — adds a `co_parents` link table, a `friend_code` default on `parent_accounts`, widens the kid/song/game RLS via `my_family_owner_ids()` so a co-parent sees the same family, and a `join_family_by_code()` security-definer function. Additive + idempotent; solo families are unaffected (the link table is empty for them).
- Code: `src/lib/accounts.js` adds `getFamilyStatus` / `joinFamilyByCode` and files new kids under the family OWNER so both grown-ups share them; `src/GrownUpScreen.jsx` renders the card.
- **Note for the DB step:** this needs `db/create-coparents.sql` run in the Supabase SQL editor before "Add another parent" works live.

## Landing page — skip straight to the app for people we already know (July 2 2026)

Visiting buildablekids.com (the marketing landing page) now auto-sends returning
people straight into the app instead of showing them the "Log in / Try it free"
marketing page again. An inline script at the very top of `public/landing.html`
(runs before the page renders, so no flash) checks localStorage and redirects to
`/app` when it finds either:
- a signed-in grown-up session (`bk_parent_session_v1` with an access_token), or
- a returning guest who already set up a kid on this device
  (`bk_guest_kid_profiles_v1` non-empty, or an active kid in `bk_active_kid_v1`).

Brand-new visitors (no saved data) still see the full marketing page. Escape
hatch: `buildablekids.com/?stay=1` (or any `#section` deep-link) stays on the
landing page, so a signed-in parent can still reach pricing/marketing on purpose.
Uses `location.replace` so the back button doesn't bounce them in a loop.
Live + browser-QA'd (fresh visitor, guest kid, account session, and ?stay=1 all
verified on www.buildablekids.com).

## App-wide "someone invited you to play" alert + lobby consistency pass (July 2 2026)
Owner ask: make sure all the multiplayer lobbies/connectors are consistent, and when someone invites you to play, alert you at the top of the screen **anywhere in the app** — auto-dismissing if ignored, or the kid can tap the × to close it. (1) Lobby audit: every online game already funnels through the ONE shared `src/GameLobby.jsx` (chess + checkers + tic-tac-toe on the turn-based "poll a row" transport, tennis on the real-time transport), and the inline lobby specs in `BuildableKids.jsx` match `gameSpecFor()` — so the invite→connect→play pipeline is a single consistent path. (Connect Four / Dots & Boxes share the board shell but are not yet wired online; Family Town keeps its own N-seat model — both pre-existing follow-ups, unchanged here.) (2) New `GlobalInviteAlert` component in `BuildableKids.jsx` is mounted once at the app root (outside the per-screen `__view` switch) so it floats over EVERY screen, not just Home. It polls the same shared sources the Home hub uses (`inboxInvites` for turn-based friend games + `listInvitesForKid` for real-time tennis/town), chimes, slides a banner down from the top ("X wants to play Chess!" with a Join button + × close). It auto-goes-away after ~9s if ignored and a dismissed/ignored invite is remembered so it never nags again. Tapping Join reuses the existing `openFriendInvite` / `openRtInvite` autoJoin routing. Suppressed on Home (which already shows invite cards) and on the friend-match screen itself. Scoped to `src/BuildableKids.jsx`.

## Sling Squad — a unique backdrop per level + parallax depth (July 2 2026)
**LIVE on main + live-QA'd in Chrome.** Every Sling Squad level now shows its own place instead of
the one drawn castle sky. Shipped 8 CC0 Kenney "Background Elements Remastered" scenes to
`public/kenney/sling/bg/` (grass, desert, forest, fall, castles, + muted/empty spares).
- **Per-level theme** (`BG_THEMES`, cycles by level; per-level override via `level.bg/sky/g0/g1/top`):
  L1 grass · L2 desert · L3 forest · L4 fall · L5 castles. Each picks the scene image AND a matching
  sky/ground-band palette.
- **`drawBg` now composites** a cover-scaled scene (FAR plane, subtle drag parallax) + drifting clouds
  (NEAR plane, moves more = real depth) + a crisp themed ground band the blocks rest on.
- **Never-breaks fallback:** `drawBgDrawn(theme)` draws a tinted sky/hill scene if the art misses or
  in headless QA — a library miss can't break a kid's game.
- **QA:** `qa-sling.mjs` still clears all 5 levels (5x each) + render smoke passes. Live-verified L1
  (grass) and L2 (desert) in-browser, no console errors.

## Breaker — level previews + livelier Play / Make a level hub (July 2 2026)
Owner: the Breaker level cards showed blank flat-color tops ("previews don't load") and the home hub's Play / Make a level buttons felt "weak and boring." Two fixes in `public/breaker-engine.html`: (1) new `levelThumbURL(l,i)` draws a small canvas preview of each level's REAL brick layout (via `inPattern`) on a themed gradient + ball/paddle hint, cached, and `buildStartCfg()` now passes it as `img` for every unlocked level so cards look like actual mini-levels (locked levels stay dark with a lock, kept as mystery). (2) The hub `.hubBig` buttons were redesigned to be playful + animated: color gradients, a shine sweep, a bouncing ball over a rainbow brick row + paddle inside the green Play button, and stacking-blocks animation inside the purple Make a level button, with hover lift + tap bounce. Gameplay untouched (qa-breaker.mjs still clears all 8 levels). Scoped to public/breaker-engine.html.

## Game tiles — String Match + Mahjong thumbnails (July 2 2026)
String Match's picker tile showed a flat gradient because `api/images.js` had no `stringmatch` entry in the `GAMES` prompt map (tile imgId existed, prompt didn't). Added a stringmatch prompt (cute buddies joined by a glowing string). Mahjong already had a prompt but its image was never generated/cached, so it was blank too. Pre-warmed both by loading `/api/images?kind=game&id=stringmatch` and `...&id=mahjong` in the browser (first hit generates + CDN-caches the 1024x1024 art). Both tiles now render real art, browser-QA'd on /app. Reminder: a picker tile needs BOTH an `imgId` in `src/BuildableKids.jsx` and a matching `GAMES` prompt in `api/images.js`, then a one-time warm request.

## Games reorg — Platformer renamed "Hop Heroes", coming-soon QA gate (July 2 2026)
In `src/BuildableKids.jsx` (`GamePicker`): the Platformer tile is renamed **Hop Heroes** and set to coming-soon (`soon=true`); **Family Town** is also now coming-soon. Coming-soon tiles are no longer just disabled — tapping one opens a small **QA password modal** (in-picker `gate`/`pw`/`err` state + `submitPw`). Entering **1111** dismisses the badge gate and opens the game so we can QA unreleased tiles; wrong password shows an inline error; Cancel/backdrop closes. To ship a coming-soon game for real, flip its tile `soon` arg back to `false`. To change the QA password, edit the `pw === "1111"` check in `GamePicker`. Live-QA'd on /app: both tiles show COMING SOON, 1111 opens Hop Heroes.

## Breaker — ball + paddle always visible on light backgrounds (July 2 2026)
Owner reported the ball and paddle were hard to see when playing on the Candy background. Cause: drawBall() and drawPaddleAt() (public/breaker-engine.html) only had a color-matched glow (often white/light), no contrasting outline, so light-colored pieces washed out over light scenery. Fix: added a crisp semi-transparent dark stroke (rgba(20,22,45,~.5)) around both the ball (ring at its draw radius, incl. flame ball) and the paddle's rounded rect, drawn with shadowBlur reset to 0 so it stays sharp. Pieces now pop on every backdrop (candy image + light pink gradient fallback both browser-QA'd). Scoped to public/breaker-engine.html.

## Notes for AI tools / agents (read this first)

**What this is.** A no-login kids' game builder. A child enters a name + age, an AI
generates a character and a themed world, and they play a custom in-browser game.
Frontend is **React 18 + Vite** (ES modules, `"type": "module"`). Game generation +
persistence run as **Vercel serverless functions** under `/api`. The game itself is
**Phaser 3.60** rendered inside a sandboxed iframe (via a Blob URL) Ã¢ÂÂ it is generated
HTML, not part of the React bundle.

**Repo layout.** The live app is in `src/` (entry: `src/main.jsx` -> `src/BuildableKids.jsx`).
`api/*.js` are serverless endpoints. `db/` holds SQL seeds. `public/` holds static
landing/library HTML. `upload/` holds the sprite-art PNGs and **duplicate copies** of
some source files used for manual uploads Ã¢ÂÂ treat `src/` and `api/` as canonical; do
**not** assume `upload/` or the top-level `*.jsx` duplicates are wired into the build.

**Run / build / deploy.** Local: `npm install` then `npm run dev` (Vite); `npm run build`
for a production bundle. There is **no separate test suite** Ã¢ÂÂ QA is the harness at
`qa/game-qa-harness.html` plus live API probes. Deploy loop: **commit to `main` ->
Vercel auto-deploys** to production (https://www.buildablekids.com/demo) in ~1-2 min.
Functions have `maxDuration: 60` (see `api/vercel.json`), and a game generation can take
60-90s, so when probing the API store the result in a `window` global and poll for it.

**Backend & services.** Database is **Supabase (Postgres + RLS)** Ã¢ÂÂ tables include
`community_sprites`, `community_layers`, `community_levels`, `community_characters`,
`game_mechanics`, `published_games`. Game code is generated by the **Anthropic Claude**
Messages API; images/characters by **OpenAI** (`gpt-image-1` with a dall-e fallback
chain). Env vars (set in Vercel, **never commit values**): `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DAILY_BUDGET_USD`, `ELEVENLABS_API_KEY` (premium read-aloud voice; optional `ELEVENLABS_VOICE_ID`/`ELEVENLABS_MODEL_ID`). Supabase tables also include `saved_songs`, `saved_stories`, `image_cache`, `narration_cache` (run `db/create-image-cache.sql` once).

**Key files & data shapes.** `api/generate-game.js` is the heart of generation
(functions: `handler`, `fetchSprites`/`matchTheme`, `fetchMechanic`,
`fetchClaudeWithRetry`, `validateGameHtml`, `fallbackGame`). It is **library-driven**:
it assembles games from reusable Supabase libraries (sprites by subject+theme, mechanics,
layers) instead of generating new art each time, and supports `gameData.gameType`
(`"platformer"` default, `"breakout"`). `src/store.js` manages the client library
(characters/levels/sounds), with item shapes around
`{ id, createdAt, name, theme, difficulty, image, previewImage, layers, kind, url }`.

**Non-negotiable rules.** This is a **kids' product** Ã¢ÂÂ keep everything
age-appropriate; content moderation lives in `src/lib/contentModeration.js`. Generated
games must be **validated before serving**: `validateGameHtml` checks bracket balance and
parses the script, and on any failure the endpoint returns a working `fallbackGame`
instead of broken/partial HTML or an HTTP 500 Ã¢ÂÂ preserve this guard. Games load sprites
from the **GitHub raw library URLs**, not base64 or fresh DALL-E art. Sprite naming
follows `<kind>_<theme>_001.png` (7 themes: forest, castle, underwater, space, desert,
volcano, candy).

**Gotchas.** (1) `CLAUDE_MAX_TOKENS` is a balancing act: too high trips the org's
output-tokens/min rate limit (429); too low **truncates** the game mid-script. It is
currently 13000 for Tier 2 Ã¢ÂÂ re-check it if the org tier or rate limits change. (2) The
Phaser canvas has historically rendered **blank inside the iframe**; it is served via a
Blob URL for that reason Ã¢ÂÂ test actual rendering, not just a 200 response. (3) Claude
calls are slow (60-90s) and CDP/eval calls time out (~45s), so never await a generation
inline Ã¢ÂÂ poll a `window` global. (4) Watch for the duplicate file copies noted above.

**Source of truth for recent changes.** This README contains a dated session log (the
`## ... (June ... 2026)` sections and the `### Commit History`) Ã¢ÂÂ that log is the
authoritative record of what changed and why. **Add a dated entry there for every change
you make**, and keep this top section accurate if architecture/conventions shift.

## Next session Ã¢ÂÂ start here (owner's queued work)

The owner pointed the next agent here. These are the things to work on next, roughly in
priority order. Read the "Notes for AI tools / agents" section above first, confirm scope
with the owner before large changes, commit to `main`, and log every change in the dated
session log below. **Never click "Create a New Game" / "Publish my game" in the live UI,
and never handle API keys / billing Ã¢ÂÂ surface those to the owner.**


## Core SFX v2 — make them actually distinct (July 2 2026)
Owner: the first shared one-shots "sound like a tambourine shake at different pitches, not unique." Cause: prompts shared vague sparkle/chime/ding wording + prompt_influence 0.5, so ElevenLabs produced one shimmer texture repitched. Fix: rewrote all 12 as concrete distinct sound FAMILIES (select=wooden click, win=brass+glockenspiel fanfare, lose=slide-whistle+tuba, coin=arcade bling, collect=water bloop, hit=low drum thud, shoot=laser pew, explode=poof boom, hurt=boing bonk, boss=gong stinger, error=buzzer, celebrate=party popper), raised prompt_influence to 0.7, and added ?force=1 (cacheDel+regen) to /api/sfx so a prompt can be re-rolled without wiping the DB by hand. Bumped BA.sfxVer to 4 so games fetch the new audio. All 12 force-regenerated + cached. Owner auditioning; re-roll any single sound with /api/sfx?s=<name>&force=1. Scoped to api/sfx.js, public/buildable-audio.js.

## Fix: SFX edge-cache poisoning (July 2 2026)
Three new one-shots (hit/select/shoot) briefly errored (duration 0.4 < ElevenLabs min 0.5) before the fix, and Vercel's edge cached those failure responses under the bare /api/sfx?s=<name> URL, so they kept serving the old error even after the audio was fixed and cached in Supabase (same recurring poisoned-edge-cache issue as Sound Machine). Two-part fix: (1) buildable-audio.js now appends a version tag (BA.sfxVer, currently "3") to every /api/sfx fetch, so games request a fresh cache key and never hit a poisoned bare URL — bump BA.sfxVer when a prompt changes. (2) api/sfx.js failed generations now return 503 (still no-store) instead of 200, so a transient failure can't be cached as the sound. Verified all 12 shared one-shots return audio on a fresh key. Scoped to public/buildable-audio.js, api/sfx.js.

## Richer shared sound-effects library — kill the synth beeps (July 2 2026)
Owner wanted robust, unique, CREATED (ElevenLabs) effects instead of the tiny synth fallback beeps. Findings: the app already has ~253 ElevenLabs one-shots/ambiences in api/sfx.js served via /api/sfx, BUT the ~10 generic events in buildable-audio.js's synth() (win, lose, select, coin, hit, shoot, explode, hurt, boss...) had NO created version, so any game triggering a bare generic name played a beep. Fix: (1) added 12 canonical shared one-shots to api/sfx.js — select, win, lose, coin, collect, hit, shoot, explode, hurt, boss, error, celebrate — style "punchy & satisfying", warm not shrill, kid-friendly single hits (+ durations). (2) buildable-audio.js now has a DEFAULTS map so BA.sfx resolves BA.map[name] || DEFAULTS[name] (identity to the real keys) and preloads them on unlock, so the synth beep is never the shipped product. (3) /api/list-audio tags them theme "ui", role "one-shot" for cross-game reuse. Scoped to api/sfx.js, public/buildable-audio.js, api/list-audio.js. Owner to spot-check in a game; regenerate any clip with a prompt tweak.

## Breaker music — warm "kid spa with a heartbeat" from shared library (July 2 2026)
Owner disliked Breaker's music: the static /music-library/playful_musicbox.mp3 loop sounded like shrill synthesized computer tones (violates the ElevenLabs-only / created-sound rule). Added a NEW reusable shared endpoint api/library-music.js that generates + caches (narration_cache key "libmusic:<name>") warm created ElevenLabs tracks by name — two variants: spa_heartbeat_warm and spa_heartbeat_bright (soft marimba/pads, gentle heartbeat pulse, explicitly NO chiptune / NO shrill highs). Both are catalogued in /api/list-audio (source elevenlabs, theme "calm") so ANY game can reuse them, and documented in public/music-library/MANIFEST.md. Breaker's ensureMusic() now points at /api/library-music?name=spa_heartbeat_warm. Owner to listen to both variants and pick; regenerate a variant with ?force=1 after prompt tweaks. Scoped to api/library-music.js, api/list-audio.js, public/breaker-engine.html, music-library/MANIFEST.md.

## Breaker music — pull from shared music library instead of generated track (July 2 2026)
Breaker (public/breaker-engine.html) no longer plays the generated /api/breaker-music?world=<backdrop> ElevenLabs track for its looping background music. Its ensureMusic() now points BA.setMusic at a static track from the shared music library (/music-library/playful_musicbox.mp3), so background music comes from the reusable library rather than a per-backdrop generated clip. SFX are unchanged (still the bespoke one-shots via BA.configure). Scoped to public/breaker-engine.html, committed to main (Vercel auto-deploys). Commit 94b3445.

## First Bounce - fix frozen ball after sticky Catch power-up expires (July 2 2026)
Bug: in the brick-breaker (public/breaker-engine.html), a ball caught by the sticky "Catch" power-up could get permanently stuck to the paddle, freezing the game with no way to relaunch. Reported after a multiball where the other balls fell off. Cause: the release input gated flingStuck() on `G.sticky && G.stuck`. When the Catch timer expired while a ball was still pinned, `G.stuck` stayed set but `G.sticky` went false, so Space/click/tap fell through to `launch()`, which no-ops because `G.onPaddle` is false, leaving the ball stranded. Fix: gate the release on `G.stuck` alone in both the pointerdown and keydown handlers, so a pinned ball is always releasable regardless of the power-up timer. Commit 8969f36.

## Castle Guard — kid-friendly tower defense, Tiny Swords art (June 28 2026)
**Update (July 3 2026) — fills the whole screen on phone/tablet:** the playfield is now
responsive — we anchor the SHORTER logical side to 600px (so sprites stay the same size) and grow
the longer side to match the device shape, so it fills iPhone/iPad edge-to-edge with no letterbox
bars (portrait or landscape). `computeDims()` runs on resize + `orientationchange`; a mid-level
rotation rebuilds the path/slots but preserves placed towers + enemy progress (`rescaleLevel`).

**Update (July 2 2026) — harder + more enemy variety (Mike: "too easy, graphics off"):**
- **Real pressure, still no-lose.** Waves are now denser + faster with mixed enemy groups; the archer is a
  bit tighter (range 178→150) so full-map coverage takes thought. The replay-a-wave safety net stays, so
  no dead-ends. Measured difficulty curve (kid bot, N archers, no retry): **3 towers loses every level**
  (was trivially winnable), **4 towers** clears L1-L3 (5/4/1 hearts left) but not the boss, **5 towers**
  clears L1-L3 clean; a full-coverage bot still wins **every** level (no-lose floor holds).
- **3 new enemy kinds** from the one goblin sheet via **sheet tinting + scaling**: fast green **Scout**,
  big red tanky **Brute** (14 hits), and a purple **Goblin King BOSS** (44 hits, glow aura) on a new
  **4th level "Goblin King"** finale. Bonk pips now cap at 6 so tanky foes don't show a scary long bar.
- **Graphics fixes:** level-select cards now show a **mini-map preview** (path + castle) instead of flat
  green; the guard-picker price now shows a clear **gold coin** (was a pale-blue blob); tower **range rings
  no longer clutter** the field — they flash briefly on placement then fade.
- **QA upgraded** (`qa-castleguard.mjs`): asserts BOTH the no-lose floor (full bot wins all) AND real
  pressure (a 3-tower kid canNOT ace the boss finale), plus enemy-variety/boss checks. All green.

**Update (June 28 2026):** added a second defender, the **Knight** — a short-range MELEE blocker (dmg 2 / range 98 / cost 25, `melee:true`, no projectile) that gently bonks goblins passing close, great at tight corners alongside the wide-reach Archer. New bottom **defender picker** (tap Archer/Knight chip → tap a slot). Knight art = Tiny Swords Blue Warrior; new `cg_bonk` sound; QA bot still beats every level (+ a knight smoke). Live via `?v=20260628b`.

**New Track B engine `public/castle-guard.html`** (branch `claude/games-castle-guard`, **not** pushed to
main). A gentle, ALWAYS-WINNABLE single-player tower defense for ages 4-8. The kid spends earned coins to
place **Archer** towers beside a winding path; archers auto-fire soft arrows at slow, **silly goblins**;
a bonked goblin **POOFS into smoke and goes home** (no health-bar death, no scary imagery). **Soft loss
only:** a goblin reaching the castle costs a heart, and at zero hearts the **wave replays** — never a
game-over screen.
- **v1 decisions (with Mike):** ONE defender (Archer); goblins reskin the free red Tiny Swords **Pawn**
  (real goblins are in the paid Enemy Pack); **hearts, never game-over** + simple round-number coins;
  **Green Meadow** world first.
- **Content as data** (`GAME_CONFIG`): path (normalized waypoints), waves `{baddie,count,spacingMs,speed,hits}`,
  defender `{range,fireMs,cost,dmg}`, goblin `{speed,hits,reward}`. Build slots auto-derive from the path.
  Adding a level/world = editing data, never engine code.
- **Shared everything:** BR (drawn fallback for every sprite — no emoji), BM (arrow hit / goblin poof /
  coin / win juice), BS (start screen + level picker), BA (created sounds), `buildable-gamenav` (shell owns
  Home/Sound). New bespoke ElevenLabs one-shots in `api/sfx.js`: `cg_place`, `cg_twang`, `cg_poof`,
  `cg_coin`, `cg_oops`, `cg_cheer`.
- **Assets:** Tiny Swords by **Pixel Frog** — license verified (free for personal + commercial use, modify
  OK, credit optional, **NO redistribution of the raw pack**). We CURATE only the used sprites into
  `public/game-assets/tiny-swords/` (with `LICENSE.txt`) and register them in the shared library
  (`db/seed-castleguard-assets.sql`, theme `castle`) so other games can reuse them.
- **Reusable mechanics written back:** `td-wave-spawner` + `td-auto-fire-defender` (MECHANICS.md §16,
  `db/seed-castleguard-mechanic.sql`).
- **Always-winnable + QA'd:** `qa-castleguard.mjs` (drives `BUILDABLE_GAME.sim()` headlessly) — a sensible-
  placement bot beats every level (5 runs each), 3 stars achievable, render smoke OK. `npm run build` clean.
  Route added to `vercel.json` (+ `/game-assets/(.*)`); tile + `SCREEN_CASTLE` + screen added to
  `src/BuildableKids.jsx`; tile art `kind=game&id=castleguard` in `api/images.js`.
- **Owner actions:** run `db/seed-castleguard-assets.sql` + `db/seed-castleguard-mechanic.sql` once in
  Supabase (optional; the game runs without them). Merge the branch to deploy + live-QA on devices.
## Sling Squad — original slingshot/physics launcher; first physics-engine game (June 28 2026)
**New Track B engine `public/sling-squad.html`** (branch `claude/games-sling-squad`) — an ORIGINAL
kid-friendly slingshot game (our own characters/art/name; NEVER Angry Birds). FIRST Buildable game
to use a real rigid-body **physics engine: Matter.js** (`public/matter.min.js`, MIT, vendored as one
self-contained file — dependency confirmed with Mike). Drag a friendly pal back in the slingshot,
release to fling them along a gravity arc, knock over stacked block towers and bonk goofy castle
critters that topple + POOF (no harm/weapons). Clear all targets to win.

- **Very forgiving + always-winnable (Mike's picks):** big easy pull + trajectory preview, gentle
  gravity, generous launches with spares, SOFT-FAIL retry (no game-over). Generous target pop
  (direct hit always counts + knocked + displaced + fell-off); levels pre-settle then arm pops so
  jitter can't pop a target early. 3 simple squad pals, no powers in v1. Castle world ships first.
- **Data-driven:** `GAME_CONFIG.levels[]` (blocks + targets + launches) — a new level is data, not
  code. 5 castle levels.
- **Shared libs:** BR (drawn castle art = always-on fallback), BA (new created `sling_*` sounds in
  `api/sfx.js`; synth = silent fallback), BM (explode/shake), BS (start screen), game-nav (`nav:exit`,
  shell Home/Sound/Help). Library-first w/ fallback (flung pals can use `/api/list-characters` art).
  Win/lose posted for helper reactions + per-kid telemetry. No emoji.
- **New mechanic** `sling-launch-physics` (`MECHANICS.md` §16 + `db/seed-sling-launch-mechanic.sql`).
- **QA:** `qa-sling.mjs` drives a sensible-aim bot (`window.BUILDABLE_GAME`/`SLING_GAME`) that clears
  EVERY level with launches to spare + render smoke; aim predictor auto-calibrates to Matter gravity.
  Also visually verified by rendering the real `draw()` to PNGs. `npm run build` transforms clean.
  Routes added to `vercel.json` (before catch-all); tile + `SCREEN_SLING` added to `src/BuildableKids.jsx`.
- **Owner action:** run `db/seed-sling-launch-mechanic.sql` once. On branch `claude/games-sling-squad`
  — **not** pushed to `main`; merge to deploy + live-QA on devices.

### Update (July 2 2026) — animals, powers, softer clear (LIVE on main, live-QA'd)
- **Slower level-clear:** when the last target pops the physics keeps rolling ~2.3s (new `clearing`
  state + `winDelay`) before the "Level cleared!" banner — no more abrupt hard-stop.
- **4 tap-to-trigger powers** (`SQUAD[i].power`; kid taps mid-flight): `split` (Splitz → 3 shots),
  `bomb` (Boomer → blast radius), `heavy` (Bruno → slam down), `dash` (Zip → zoom). Never required
  to win — the QA bot still clears all 5 levels with plain shots. Ammo is an array (`G.ammoBodies`)
  so the splitter's 3 pieces all fly + pop.
- **Real Kenney CC0 2D art** (replaces the old 3D `/api/list-characters` loader): flung animals =
  "Animal Pack Remastered" (parrot/panda/hippo/chick), block towers = "Physics Assets" wood + stone,
  targets = Physics Assets alien faces. Served from `public/kenney/sling/` (reuses the `/kenney/(.*)`
  route — no vercel change). Drawn art stays the always-on fallback.
- **Game tile thumbnail:** added a `sling` key to `api/images.js` GAMES (the tile already passed
  `imgId "sling"`, so it was showing a flat gradient).

## Family Town — original 3-4 player Monopoly-STYLE board game (June 27 2026)
**New Track B engine `public/family-town.html`** (branch `claude/games-family-town`) — an
ORIGINAL board game (our own town, spaces, art, and name; never the Monopoly brand). 3-4 kids
roll two dice, loop a 24-space board, collect/spend simple round-number COINS, buy friendly
spots, and draw a fully moderated kid-safe "Surprise" deck (24 gentle cards). SOFT design:
coins never drop below 0, no knockouts, everyone finishes; the "winner" is most coins + spots.
Game length is customizable (Short/Medium/Long = 2/3/4 laps). **Pricing plays like Monopoly:** 16 spots in 8 color groups of 2, a price ladder (6→20 coins), rent that rises with price, and owning a full color set DOUBLES the fee (start 30 coins, pass-Start +20). **Real AI art** (`kind=town` in `api/images.js`): a storybook board scene, a hero, 4 animal tokens, and an icon per shop/corner — all with drawn fallbacks. Pre-warm `/api/images?kind=town&id=board|hero|token_*|spot_*`.

- **Three ways to play, one network-agnostic engine:** solo vs a friendly bot, same-device
  pass-and-play (2-4 seats), and cross-device **family** play.
- **Multiplayer = turn-based "poll a row" (chess model), extended to N seats.** The 3-4 player
  design question resolves cleanly: chess used two fixed kid columns + a binary `turn`; Family
  Town stores the seats as a `players` array and makes `turn` an index `0..N-1` advanced by
  `(turn+1)%N`. The whole game state lives in ONE `town_matches` row, so a late/dropped poll
  self-heals like chess. Family RLS (`parent_id = auth.uid()`) is unchanged by seat count.
- **Engine stays network-agnostic:** emits `townMove` (its whole state), applies
  `townOpponentMove` via postMessage; ALL Supabase lives in `src/lib/townMatches.js` +
  `src/FamilyTown.jsx`. Canned reactions only (no free-text chat).
- **Shared everything:** BR (board/tokens/dice/cards — no emoji), BM (roll/buy/cheer juice),
  BA (sound), BS (start screen). New bespoke ElevenLabs one-shots in `api/sfx.js`: `town_roll`,
  `town_move`, `town_coin`, `town_buy`, `town_card`, `town_cheer`.
- **Always-winnable + QA'd:** `qa-family-town.mjs` (drives `BUILDABLE_GAME.sim()` headlessly) —
  2/3/4 players × Short/Med/Long × many seeds all finish with a winner, no negative coins, equal
  turns, all seats can win. `npm run build` clean. Route added to `vercel.json`; tile + screen
  added to `src/BuildableKids.jsx`.
- **Owner action:** run `db/create-town-matches.sql` once for cross-device family play; confirm
  the parent-account lane env vars are live (pass-and-play + bot need no setup). On branch
  `claude/games-family-town` — **not** pushed to `main`; merge to deploy + live-QA on devices.
## Board games: shared game-nav adopted (phone-overlap fix) + Dots and Boxes size picker (June 27 2026)

Mike feedback follow-up on the board games.
- **Phone-width nav overlap fixed in the shared shell.** The board games sat in `GameFrame` but never
  adopted `buildable-gamenav.js`, so in-app they doubled the shell's controls with their own (Home +
  status + Pause + Sound) and collided on phones. `buildable-boardgame.js` now **registers with the
  shared nav bridge** (in-app: hide engine Home/Sound/Pause, shell draws the one consistent set;
  standalone: engine keeps its own). Status text moved to its own row (wraps), Pause+Sound grouped in
  one right cluster. One shell change → all three games fixed. (Only adopted the shared nav — did not
  edit `buildable-gamenav.js` / `GameFrame`.)
- **Dots and Boxes is now resizable:** Small (3x3) / Medium (5x5) / Large (7x6) cards on the start
  screen (via a new `spec.choices` hook in the shell); engine refactored to a dynamic board size.
- **QA:** `qa-dotsandboxes.mjs` covers all three sizes (all boxes claimed, AI beatable); others green;
  build clean.

## Three simple 2-player board games on ONE shared shell (June 27 2026)

Built Tic-Tac-Toe, Connect Four, and Dots and Boxes in one pass by creating a reusable
**simple-board-game shell ONCE** and instantiating all three on it. Branch
`claude/games-simple-batch1` (handed to Mike, **not** pushed to main).

- **New 4th shared engine lib next to BR/BA/BM/BS:** `public/buildable-boardgame.js` — `BG`
  (`window.BuildableBoardGame`). The Track-B host for turn-based, same-device, **no-backend**
  board games: a hot-seat TURN MANAGER (Player A / Player B, or solo vs an easy computer),
  responsive canvas + rAF loop, pointer→board mapping, the shared start screen (BS) with a
  Solo/2-player mode row, sound (BA), juice (BM), the win banner + Play again, Home→`nav:exit`,
  mute, and a headless QA scaffold. Reusable detectors `BG.lineWinner` (N-in-a-row any direction)
  and `BG.boxesNewlyClosed` (4th-side-claims-a-box). A new board game = ~150 lines of rules + draw.
- **Three engines:** `public/tictactoe-engine.html` (3x3, three-in-a-row), `connectfour-engine.html`
  (7x6 gravity drop, four in a row, falling-disc animation), `dotsboxes-engine.html` (small 3x3-box
  grid; close a box's 4th side to claim it + go again; most boxes wins). Each plays solo (easy
  computer) or 2-player hot-seat.
- **Always-winnable / pressure-free:** no soft-locks, friendly ties, and the easy AI is genuinely
  beatable. No emoji — drawn art via BR.
- **Shared in-game menu (same across all three), built once in the shell:** a Pause button (top-right)
  opens Keep playing / New game / Sound / Home; auto-saves to the browser (no backend) so a left match
  shows "Continue your game" on the start screen. **Bespoke created sounds** in `api/sfx.js`
  (`board_place/drop/line/claim/win/draw`; synth fallback only).
- **Reusable mechanics written back:** MECHANICS.md §14 + `db/seed-boardgame-mechanics.sql`
  (`hot-seat-turns`, `grid-line-winner`, `box-claim-extra-turn`). **Owner action:** run the seed once.
- **Routes + tiles:** explicit `vercel.json` routes (before the landing catch-all) for the 3 engines
  + `buildable-boardgame.js`; 3 tiles + a shared `BoardGameScreen` wrapper in `src/BuildableKids.jsx`.
- **QA:** `qa-tictactoe.mjs` / `qa-connectfour.mjs` / `qa-dotsandboxes.mjs` all PASS (perfect TTT
  player never loses to the AI; AIs beatable; every game terminates / claims all boxes);
  `npm run build` clean.
- **Left out of v1 (follow-up):** cross-device play — the textbook poll-a-row fit
  (`mp-turn-based-row`, like chess); the shell is network-agnostic so it is additive later.
## Three simple games on one shared turn shell — Memory, Bingo, Snakes & Ladders (June 27 2026)
Batch 2 of simple luck/matching games, all **same-device pass-and-play** (no backend v1) on one new
shared brain. Branch `claude/games-simple-batch2` (NOT main).

- **New 5th shared engine lib `public/buildable-turns.js` (`BT` / `window.BuildableTurns`).** One
  headless-safe turn shell for **2-4 players + solo**: roster (4 colors + token shapes, no emoji),
  whose turn, per-player scores, winner. `BT.create({count}) -> cur()/next(keepTurn)/add()/leader()/finish()`.
  Registered as `game_mechanics` slug `same-device-turns` (`db/seed-same-device-turns-mechanic.sql`),
  documented in `MECHANICS.md` section 15 — the local counterpart to the cross-device `mp-*` mechanics.
- **`buildable-startscreen.js`** gained reusable **`p2`/`p3`/`p4` mode keys** so any same-device game
  gets a player-count picker through the shared BS mode row (additive; breaker QA still green).
- **Memory Match (`/memory-engine.html`)** — solo or 2-4. Flip two cards; match stays + scores +
  bonus turn; miss flips back; clear the board to win. Difficulty = grid size (Easy/Medium/Hard);
  **card faces pulled from the shared asset library by theme** (`/api/list-assets`) with a BR
  drawn-shape fallback; 6 theme packs.
- **Bingo (`/bingo-engine.html`)** — 2-4, the DEVICE is the caller (rotating via BT). **Picture
  mode** = library art + drawn-icon fallback; **Word mode** = kid word list, spelled + said via the
  new `api/say.js` ElevenLabs caller voice. Daub matches, first full line wins. Always-winnable
  (calls drawn from the union of all cards).
- **Snakes & Ladders (`/snakes-engine.html`)** — 2-4, pure luck so the littlest kid can win. Roll,
  hop the 30-square serpentine track, climb ladders / slide down snakes, bonus roll on a six;
  reach-OR-pass the top star to win (no exact-landing soft-lock); 3 themed boards.
- **Sound = unique created audio.** New bespoke one-shots in `api/sfx.js` (auto-listed in
  `/api/list-audio`): `mem_flip`, `mem_match`, `mem_flipback`, `party_win`, `bingo_call`,
  `bingo_daub`, `dice_roll`, `snl_ladder`, `snl_snake`; plus `api/say.js` for spoken called
  words/letters/picture names. BA synth stays the silent fallback only.
- **Wiring:** three `vercel.json` routes (+ `/buildable-turns.js`) before the catch-all; three tiles
  + iframe screens in `src/BuildableKids.jsx` (Home top-left, BS back posts `nav:exit`); key-art
  prompts added to `api/images.js`.
- **QA:** shared `window.BUILDABLE_GAME` sim hook + per-game alias; `qa-memory.mjs`, `qa-bingo.mjs`,
  `qa-snakes.mjs` (model `qa-breaker.mjs`) prove every difficulty x player-count x theme is winnable
  + render smoke; `npm run build` clean. **Owner action:** run `db/seed-same-device-turns-mechanic.sql`
  once; caller voice + new SFX auto-generate/cache on first play.
## Buildable Checkers — kid-friendly 2-player checkers, reuses the chess plumbing (June 27 2026)
New turn-based game on branch `claude/games-checkers` (**not merged to main**). Checkers is
board-shaped like chess, so it reuses the chess "poll a row" multiplayer model
(`MULTIPLAYER.md` Pattern A) rather than inventing a transport.

- **Engine `public/buildable-checkers.html`** — a DOM board like `buildable-chess.html`
  (renders reliably in iOS iframes). Modes: solo vs a beatable robot (Easy/Normal/Tricky),
  same-screen 2-player pass-and-play, and online family play. Kid rules: diagonal moves,
  jump-to-capture with chained multi-jumps, **King** on the far row (kings go both ways), and
  a **"Must jump" toggle (default OFF = relaxed)** so captures are optional for little kids.
  Worlds reuse the `chess-art` backdrops + `/api/chess-music`; pieces are drawn SVG discs
  (purple/coral, gold crown for kings) — **no emoji**. Sound via `buildable-audio.js` (BA).
- **Network-agnostic exactly like chess:** the engine only emits/applies moves over
  `postMessage` (`checkersReady`/`checkersInit`/`checkersMove`/`checkersOpponentMove`/
  `checkersReaction`/`checkersShowReaction`); ALL Supabase code lives in the React layer.
  Canned reactions only (same 6 phrases) — no free text.
- **`db/create-checkers-matches.sql`** copies `chess_matches` (whole state in one row) with
  the SAME family-RLS policy + `updated_at` trigger; idempotent + non-destructive.
  **Owner action: run it once in the Supabase SQL editor.**
- **React:** `src/lib/checkersMatches.js` (PostgREST, mirrors `chessMatches.js`) +
  `src/FamilyCheckers.jsx` (lobby + 2s poll + bridge, mirrors `FamilyChess.jsx`). Gated on
  the parent-account lane.
- **Wiring:** Games-picker **Checkers** tile + `CheckersScreen`/`FamilyCheckers` routes in
  `src/BuildableKids.jsx`; bespoke `checkers_*` one-shots registered in `api/sfx.js`
  (auto-generate + cache on first play; BA synth is the silent fallback); explicit
  `/buildable-checkers.html` route in `vercel.json` before the catch-all.
- **QA:** `qa-checkers.mjs` (headless rules + bot) — legality, multi-jump, promotion,
  forced-capture, and **the robot is beatable** (strong kid beats Easy 40/40, Normal 60/60;
  Tricky ~50/50, still winnable). `qa-checkers-dom.mjs` (jsdom render smoke) passes;
  `npm run build` clean.
- **Note (deviation):** the original brief mentioned `BM`/`BS`, but those are canvas/level-
  picker libs for the arcade engines; chess (the template) is a self-contained DOM board, so
  checkers follows chess for fit + iOS reliability (DOM sparkle/sound "juice", not BM canvas
  FX). **Still TODO (manual):** run the SQL; live QA on two real devices.
## Maze Munchers — new original maze-chase engine (June 27 2026)
**New hand-authored Track B engine `public/maze-engine.html`** — an ORIGINAL maze chase (NOT Pac-Man; own name, own drawn art, own generated mazes). Guide a friendly muncher around a maze, gobble every treat, dodge the friendly chasers, grab a corner power treat to briefly chase them, clear the world.
- **Content-as-data `GAME_CONFIG`:** 6 themed worlds (Candy Cove, Coral Reef, Star Station, Whisper Wood, Dino Jungle, Frost Village), each with its own palette/hero critter/chaser cast/ambient particles and a difficulty ramp (more, faster, smarter chasers; shorter power treat). Mazes are generated per level (seeded recursive-backtracker + braiding) so every maze is fully connected — every treat reachable, always winnable.
- **Always-winnable / kid tuning:** hero is ALWAYS faster than every chaser; power treats are long & generous (~8.5–11s). Soft "caught" loses a heart + resets positions; out of hearts gently restarts the world (treats back) — **never a harsh game-over**. Controls: arrows/WASD + swipe + on-screen d-pad; audio unlocks on first tap.
- **Shared libs:** `BR` (hero/critter, `BR.enemy` chasers, walls, treats, hearts — no emoji), `BM` (chomp/eat/power/caught/win FX), `BA` (sound), `BS` (start screen + world picker, stars/lock). Single-player v1 (same-device co-op is a future maybe).
- **Bespoke CREATED sounds** in `api/sfx.js`: `maze_chomp`, `maze_power`, `maze_eat`, `maze_win`, `maze_caught`, `maze_start` (synth = silent fallback only; they auto-generate + cache on first play).
- **QA:** `node qa-maze.mjs .` drives `window.MAZE_GAME` (alias `window.BUILDABLE_GAME`) — a perfect-player BFS bot (arrival-time evasion, hero ~1.9× faster) clears ALL 6 mazes (3 runs each), full campaign 6/6, render smoke ok; `npm run build` clean.
- **Route + tile:** `vercel.json` route for `/maze-engine.html` (+ `/maze`) before the landing catch-all; **Maze Munchers** tile in the Games picker → `MazeScreen` iframe in `src/BuildableKids.jsx`.
- **Now LIVE on `main`** (Mike asked to ship it for testing). **Per-world background music added** (`api/maze-music.js`, bespoke ElevenLabs track per world, cached in `narration_cache` `mazemusic:<world>`, auto-generates on first play; engine switches the track per world + follows the sound toggle). One-time "how to play" hint on first play. See `maze-README.md`. **TODO:** save/share/publish + shared GameFrame nav.

## Tennis: pixel-art nature court backdrops (July 3 2026)
Swapped Tennis's AI-generated court art for hand-picked **pixel-art nature scenes** (CraftPix "Nature Landscapes" free pack). The 8 court slots now map to 8 pixel landscapes served locally from `public/tennis-bg/<key>.png` (added a `/tennis-bg/(.*)` route in `vercel.json` so the new folder isn't swallowed by the catch-all). Renamed courts to match the scenes: Seaside, Northern Lights, Big Tree, Pine Forest, Sunny Meadow, Snowy Peak, Stone Cliffs, Green Hills. Each world's fallback gradient is sampled from that scene's real sky + ground colors, and particles were re-fit (clouds/leaves/snow/stars). `tennis.html` `loadBg` + the court picker now point at the local pngs (no more `kind=tennis` image calls); the canvas draws the backdrop with `imageSmoothingEnabled=false` so the pixels stay crisp when scaled up. Cover-fit crop gives sky-at-top / ground-at-bottom which suits the portrait top-vs-bottom court.

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


## Games rebuild (Platformer + Survival) + global parent controls (June 26 2026)

**Games is two real engines now, not AI-generated.** The Games tile opens a "Pick a game" screen (`GamePicker` in `src/BuildableKids.jsx`) with **Platformer** (`/play.html`) and **Survival** (`/survival-engine.html`), each launched full-screen in an iframe like Typing/Chess. The old generate-a-game flow (SCREEN_INTRO -> game-type -> character/level -> PlayGame) is no longer routed to.

- **Survival engine deployed:** `public/survival-engine.html` + `public/buildable-renders.js` + `public/buildable-audio.js`, with explicit `vercel.json` routes for all three (the `/(.*)` catch-all otherwise serves landing.html). Self-contained (own level picker + My Hero locker); loads hero art from the absolute `/api/story-library` URL; falls back to drawn art / no music if `chess-art/space_bg.png` / `game-music/music_space.mp3` are not routed.
- **Global Grown-ups button:** a fixed `GrownUpFab` renders on every screen except the grown-ups area, so the parent portal is reachable from anywhere (Music, Typing, Chess, the games).
- **Global Learning toggle:** a fixed `LearningControl` "Learning: On/Off" pill on every page, gated by a grown-up math check, drives the existing `getLearningSettings`/`setLearningSettings` setting.
- Also: Grown-ups portal + kid Home launcher restyled to the dark brand with no emoji; chess routing fixed (`/buildable-chess.html` route added). Stories tile set back to "Coming soon".


## Platformer polish — moving platforms, swinging vines, friendly boss, music + mute (June 26 2026)

Polish pass on the fixed runner engine `public/play.html` (all drawn with shapes — no
`api/game-art` changes). New level-recipe knobs: `movingPlatChance`, `vineChance`, `boss`,
`bossHp`. Moving platforms and swinging vines are bonus elements confined to CLIMB zones over
solid ground, so the ground win-path stays always-clearable. The last level gets a friendly
crowned boss: stomp it 3× to drop a soft barrier before the flag; no heart loss on side bumps;
it wakes only when the player is near and has an 18s mercy auto-win so it can never soft-lock.
Background music is a soft Web Audio pentatonic loop (per-world key, unlocks on the Play! tap)
with a new top-left mute button. Added `qa/sim-node.mjs` to run the `BK_GAME.sim()` "perfect
player" headlessly in Node — baseline and post-change both report ALL LEVELS WIN. See the
dated SESSION-LOG.md entry for details.

## Home launcher redesign — app-icon tiles, Games "coming soon" (June 26 2026)

**What & why.** The kid-facing Home hub (`HomeScreen` in `src/BuildableKids.jsx`) was rebuilt to match the dark `buildablekids.` brand and to remove all emoji. Each activity tile is now a large **card-width app-icon banner** (full card width, 3:2 aspect, big white SVG glyph — note / controller / book / keyboard / chess king) with the label below it. The profile pill, My Stuff and Grown-ups buttons no longer use emoji either.

- **Badges:** removed READY / NEW / BETA. The only badge is **"Coming soon"** on **Games**, which is now `disabled` (greyed) while the game engine is reworked. To re-enable Games, remove `disabled` + the badge from its `ExperienceCard`.
- **Chess tile** opens `/buildable-chess.html`. That static page was falling through to the landing page until `vercel.json` got an explicit { "src": "/buildable-chess.html", "dest": "/buildable-chess.html" } route. NOTE: every static `public/*.html` page needs its own explicit route before the `/(.*)` -> `/landing.html` catch-all, or it serves the landing page.
- Also redesigned this session: the **Grown-ups portal** (`src/GrownUpScreen.jsx`) to the dark brand with gradient-circle kid avatars (first initial, no emoji; legacy emoji avatars fall back to a name-derived color).


### ✅ Parent/Kid accounts + persistent per-kid creations (built June 23 2026)

Status: **CODE COMPLETE & wired live.** Awaiting the owner's Supabase setup (below)
to switch the account lane on. The no-login "device" lane is untouched and still works.

**Model:** ONE real credentialed login = a parent/teacher (Supabase Auth). Kids pick a
profile by tapping a tile — no kid passwords. Creations are stamped with kid_profile_id
so they follow the child across devices. Row Level Security scopes every row to the family.

**What was built (all committed to main, verified via GitHub API):**
- `db/create-accounts.sql` — parent_accounts + kid_profiles tables, + nullable
  kid_profile_id column on saved_songs and saved_games (additive, idempotent).
- `db/create-accounts-rls.sql` — family-scoped RLS policies. NOTE: service-key
  endpoints (the anonymous/device lane) bypass RLS by design, so they keep working.
- `src/lib/accounts.js` — parent sign-in/up + kid-profile helpers over Supabase Auth
  REST (no SDK dependency; uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
- `src/GrownUpScreen.jsx` — "Grown-ups" area: parent signs in, then "Who's playing?"
  kid-profile picker + add-profile. Shows a friendly "not connected yet" state until
  env vars are set.
- `src/BuildableKids.jsx` — new SCREEN_GROWNUP route + "👨‍👩‍👧 Grown-ups" button on the
  intro top bar (shows the active kid's avatar+name once chosen); list-songs now passes
  kidProfileId.
- `src/MusicMaker.jsx` — sends kidProfileId on save-song + list-songs (falls back to
  device lane when no kid is active).
- `api/save-song.js`, `api/save-game.js`, `api/list-songs.js`, `api/list-games.js` —
  accept + store/filter by kid_profile_id; device lane unchanged when it's absent.

**OWNER TO-DO (only a grown-up can do these — agent cannot create accounts / handle keys):**
1. ✅ DONE (June 23 2026) — SQL run in Supabase (project mhxxkujnawncahztifvg):
   create-accounts.sql (tables) then create-accounts-rls.sql (family RLS policies), both succeeded.
2. ✅ DONE — Supabase Auth Email provider is enabled (email confirmation is ON).
3. ⏳ REMAINING — In Vercel env, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the
   PUBLIC anon key — NOT the service key). Redeploy. The "Grown-ups" area then goes live.
   This is the ONLY step left to switch the account lane on.

**Compliance (must keep before public ship):** verifiable parental consent before storing
a child's identifiable data; data minimization (store song recipes, not voice/audio blobs;
no child voice capture without explicit consent); deletion support; a real privacy policy
+ legal review. Owner owns this.

**Next (after Supabase is live):** ElevenLabs audio generation — owner adds the ElevenLabs
account + key to Vercel env, then the agent wires `api/generate-audio.js` + playback.

1. **Path A Ã¢ÂÂ full multi-genre generator (the big one).** Today the engine only does
   `platformer` and `breakout` (see "Game Types" section below for the Path A/B plan).
   Goal: a real multi-genre generator Ã¢ÂÂ next target genre is **Tetris**, then generalize
   so new genres are easy to add. Tetris is a different engine model (grid + falling
   pieces + line-clear) from the platformer, so plan the architecture, not just a prompt.

2. **Use the uploaded character sprites for the hero.** Right now the hero is drawn with
   Phaser graphics primitives, NOT loaded from a sprite image Ã¢ÂÂ so the DALL-E character
   art the owner uploads is not actually used by the engine. Wire the generator/engine to
   load the hero from a character sprite (with a graphics fallback if none exists).

3. **Generator tweak: clean sprite URLs, not base64.** See "base64 vs clean URL"
   note below Ã¢ÂÂ prefer referencing the GitHub raw library URLs over inlining base64 so
   game HTML stays small and within the token budget.

4. **Now that we're on Tier 2, consider richer games.** `CLAUDE_MAX_TOKENS` is 13000
   with headroom under the new cap. There is room to push game richness (more mechanics,
   more detail) Ã¢ÂÂ but re-probe for truncation/429 after any bump, and keep the
   validate-before-serve fallback guard intact.

5. **Housekeeping: clean up QA test rows in Supabase.** A few test games/rows were
   created during QA (see "QA test rows to clean up" note below). Deletions are
   destructive Ã¢ÂÂ get the owner to confirm exactly which rows before removing anything.

## Google OAuth sign-in (preferred lane) (June 23 2026)

**What & why.** Owner wants Google sign-in as the primary login, with email as a
fallback. Added Google OAuth to the parent account flow using Supabase's hosted
authorize endpoint (no SDK).

**Changes (committed to `main`):**
- `src/lib/accounts.js` — added `signInWithGoogle()` (redirects to
`{SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=<clean app url>`) and
`completeOAuthRedirect()` (on return, reads `#access_token`/`#refresh_token` from the
URL hash, saves the session, ensures the parent row, then strips the tokens from the
address bar). Email/password flow unchanged.
- `src/GrownUpScreen.jsx` — "Continue with Google" is now the primary button on both
the lane chooser and the email step; "Use email instead" is secondary. Runs
`completeOAuthRedirect()` on mount so a returning Google user lands on the kid picker.
Inline Google "G" SVG so no external asset is needed.

**OWNER TO-DO to make Google actually work (agent cannot — keys + dashboards):**
1. Google Cloud Console — configure the OAuth consent screen, then create an OAuth
2.0 Client ID (type: Web application). Copy the Client ID + Client secret. Add the
Supabase callback URL as an Authorized redirect URI:
`https://mhxxkujnawncahztifvg.supabase.co/auth/v1/callback`.
2. Supabase -> Authentication -> Providers -> Google: enable it, paste the Client ID +
secret, save.
3. Supabase -> Authentication -> URL Configuration: add the site URL
`https://www.buildablekids.com` to the allowed Redirect URLs.

Until those are done the button renders but Google returns an error.

## Dedicated parent account flow + assign-creations-to-kids (June 23 2026)

**What & why.** The "Grown-ups" area previously mixed guest play, sign-in, and
account creation on one cramped "Who's playing?" panel, which read as confusing.
Refactored `src/GrownUpScreen.jsx` into a proper, dedicated, guided multi-step
flow and exposed the per-kid project linking the schema already supported but had
no UI for. The proven backend (`src/lib/accounts.js`, `db/create-accounts*.sql`,
the save/list API endpoints) is unchanged in contract; the no-login device lane is
untouched.

**Steps in the new flow:** (1) *choose a lane* — create a parent account, sign in,
or continue as a guest (this device only); (2) *parent auth* — sign up / sign in via
Supabase Auth on its own clean screen (the agent never types passwords — the grown-up
does); (3) *kid profiles* — tap-a-tile picker with add / rename / remove (no kid
passwords); (4) *organize creations* — assign each saved song/game to a child.

**Changes (branch `feat/parent-account-flow`, PR to `main`):**
- `src/lib/accounts.js` — added `listFamilyProjects()` (RLS-scoped read of the
family's `saved_songs` + `saved_games` with their `kid_profile_id`) and
`assignProjectToKid(kind, projectId, kidProfileId)` (PATCHes the nullable
`kid_profile_id` link from `db/create-accounts.sql`). Account-mode only — additive,
non-destructive; the service-key device lane is not touched.
- `src/GrownUpScreen.jsx` — rewritten as the multi-step flow above. Same
`{ onBack, onProfileChosen }` prop contract, so `BuildableKids.jsx` needs no edits.
Shows a friendly "accounts aren't switched on yet" state when env vars are absent.

**Still owner-only to switch the lane on (unchanged from prior entry):** add
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (PUBLIC anon key, not service key) in
Vercel and redeploy. Optional UX: toggle OFF "Confirm email" in Supabase Auth for
instant sign-up (today it shows a "check your email" step). Agent cannot do these —
they touch keys / the Supabase + Vercel dashboards.

## Tech Stack

| Layer | Service |
|-------|---------|
| Frontend | React (Vite), hosted on Vercel |
| Serverless API | Vercel Functions (Node.js) |
| Database | Supabase (Postgres + Row Level Security) |
| Image generation | OpenAI `gpt-image-1` (with fallback to `dall-e-3` Ã¢ÂÂ `dall-e-2`) |
| Game code generation | Anthropic Claude (generates Phaser 3 JS) |
| Game engine | Phaser 3.60.0 (loaded in iframe) |

---

## Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (use `sb_secret_...` format) |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `OPENAI_API_KEY` | OpenAI API key (needs image generation credits) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude for game code) |
| `DAILY_BUDGET_USD` | Daily spend cap in dollars |

---

## Database Tables (Supabase)

### `community_layers`
Stores AI-generated background layer images for reuse across games.
- `asset_id` Ã¢ÂÂ unique identifier
- `layer_type` Ã¢ÂÂ e.g. sky, midground, foreground
- `category` Ã¢ÂÂ theme category
- `image_url` Ã¢ÂÂ URL or base64 PNG
- `parallax_speed` Ã¢ÂÂ float, used by Phaser parallax scroll
- `theme_tags` Ã¢ÂÂ text array for matching
- `prompt_used` Ã¢ÂÂ the prompt that generated this image
- `has_transparency` Ã¢ÂÂ boolean
- `reusable` Ã¢ÂÂ default true
- `created_by_device_id` Ã¢ÂÂ anonymous device ID
- `moderation_status` Ã¢ÂÂ default 'approved'

### `community_levels`
Stores generated level configurations.

### `community_characters`
Stores generated character images and metadata.

### `community_sprites`
Reusable game-object sprites (coin, gem, star, heart, chest, spike, cloud_platform, key, orb) per theme, transparent PNGs. Same column shape as `community_layers` plus a `subject` column. Pulled by `generate-game` to place objects (mix-and-match across themes).

### `game_mechanics`
Reusable gameplay rules. Columns: `slug` (unique), `name`, `description`, `rule` (jsonb params), `tags` (text[]), `enabled` (bool), `created_at`. The generator picks an enabled mechanic at build time. Add new rows to grow the library.

### `published_games`
Kid-published games shown in the PUBLIC gallery. Columns: `game_id` (unique short id), `title`, `html` (the finished self-contained game), `theme`, `mechanic_slug`/`mechanic_name`, `character_name`, `creator_name`, `device_id`, `layer_ids`/`sprite_ids` (jsonb), `preview_image_url`, `play_count`, `moderation_status` (default 'approved'), `created_at`. Written by `/api/publish-game`, read by `/api/list-published-games`.

All community/published tables are accessed by the API via the Supabase service key (RLS is not relied on for app reads).

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/generate-creature` | POST | Generate character image + metadata via OpenAI |
| `/api/generate-level` | POST | Generate world layers (4 parallax layers) via OpenAI |
| `/api/generate-game` | POST | Generate Phaser 3 game code via Anthropic Claude |
| `/api/publish-game` | POST | Publish a finished kid-made game to the public gallery (published_games); returns a share id |
| `/api/list-published-games` | GET | Public gallery list; `?gameId=ID` returns one full game (html) to play; `?deviceId=D` lists a device's games |

### Image Generation Fallback Chain
Both `generate-creature.js` and `generate-level.js` try models in order:
1. `gpt-image-1` (best quality, returns base64)
2. `dall-e-3` (returns URL)
3. `dall-e-2` (returns URL, fastest fallback)

The first model that succeeds is used. This prevents hard failures if one model is unavailable on the account.

---

## Key Source Files

```
buildable-app/
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ api/
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ generate-creature.js   # Character image generation
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ generate-level.js      # World layer image generation
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ generate-game.js       # Phaser game code generation (Claude)
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ src/
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ BuildableKids.jsx      # Main app orchestrator / state machine
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ CreatorScreen.jsx      # Character + world creation UI
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ LoadingGames.jsx       # Mini-game overlay shown during generation
Ã¢ÂÂ   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ MyStuff.jsx            # Saved games screen
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ public/                    # Static assets
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ vercel.json                # Vercel config (maxDuration, rewrites)
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ index.html                 # Entry point
Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ README.md                  # This file
```

---

## Vercel Config Notes

`vercel.json` sets `maxDuration: 300` for all API functions. Image generation via `gpt-image-1` can take 60Ã¢ÂÂ90 seconds per call, so the default 60s timeout is not enough.

---

## Game Mechanics Library (gameplay quality)

Early generated games were thin because the generator prompt only asked for a bare "run and jump over gaps" game Ã¢ÂÂ no enemies, power-ups, win condition, or difficulty design. To fix this, gameplay is now driven by a reusable **mechanics library** extracted from a finished, shipped game (*Riley's Garden*, croctot.com/riley).

- **[`MECHANICS.md`](./MECHANICS.md)** documents the reusable primitives: named enemy movement patterns (`linear`, `patrol`, `random`, `zigzag`, `swoop` dive-bomb, `swirl`), collectibles/power-ups, win-and-lose conditions (with an anti-soft-lock failsafe), a difficulty-curve recipe, and kid-friendly polish (auto-aim helper, emoji sprites).
- **`api/generate-game.js`** now injects a condensed version of that library into the Claude prompt, so each generated game is *assembled from proven mechanics* (enemies with patterns, an auto-firing helper, power-ups, a difficulty ramp) instead of being improvised. The prompt also asks Claude to emit a clearly-marked `CONFIG` block separate from the engine, so games stay **remixable**.

> Design principle (from Riley): separate **skin** (theme, characters, items) from **engine** (loop, physics, scoring). A new game = new skin + same mechanics; a remix = tweak the config. Keep `MECHANICS.md` and the `generate-game.js` prompt in sync.

---

## QA Agent Ã¢ÂÂ automated Ã¢ÂÂdoes every level end?Ã¢ÂÂ checks

Generated games occasionally ship a level that can never be completed (an enemy drifts off-screen, a win condition is unreachable, a boss never spawns). Because games run as generated HTML inside a sandboxed iframe, we can QA them the same way: load the game in an iframe and **drive its real game loop programmatically**, asserting that every level reaches a completed state.

**Reference implementation:** the sibling Riley game ships `riley/qa-harness.html` (in the `croc-tot` repo), a single static page that loads the game in an iframe, fast-forwards the loop across all levels with a synthetic Ã¢ÂÂperfect player,Ã¢ÂÂ and asserts per-level invariants:

1. **boots** Ã¢ÂÂ game globals are reachable.
2. **inBounds** Ã¢ÂÂ no enemy sits far outside the playfield.
3. **killGoal** Ã¢ÂÂ the kill counter reaches its goal (for `killThenBoss`, 15).
4. **bossSpawns** Ã¢ÂÂ a miniboss/boss actually spawns.
5. **ends** Ã¢ÂÂ the level reaches the level-complete state within a budget.
6. **noOverrun** Ã¢ÂÂ the level never blows past its hard cap.

**Why it pays off:** when the `killThenBoss` mechanic was added to Riley, the harness immediately caught a regression (`ReferenceError: lv is not defined` Ã¢ÂÂ the win-check referenced a per-build local instead of the global `LEVELS[idx]`) that made every level unwinnable, before any player saw it.

**For Buildable Kids:** the same harness can be pointed at any generated game by setting the iframe `src` to that gameÃ¢ÂÂs Blob/preview URL. The roadmap is to run these invariants automatically after generation (and/or in a Vercel function) and flag any game where a level fails to reach completion, so Ã¢ÂÂunwinnable levelÃ¢ÂÂ bugs are caught at build time rather than by kids. The invariants mirror the `killThenBoss` primitive in `MECHANICS.md` Ã¢ÂÂ generated games that use it should pass by construction.

---
<<<<<<< HEAD
## Session log — 2026-07-02 (Mahjong: any-uncovered-tile rule, whole-screen mobile, sfx fix, score logging)

Four fixes. (1) **Free-tile rule simplified** per request: a tile is now takeable as long as **nothing is stacked on top of it** — the left/right side requirement is gone, so any fully-uncovered tile (even bottom row) can be picked. `isFree()` now just `!covered`. Still always-solvable (top-down peel); qa green. (2) **Whole-screen on iPad/iPhone**: `#wrap` uses `100dvh` (address-bar-safe) and `layout()` fills ~99% of the space below the banner with a much larger tile cap (140px) so the board fills big screens. (3) **SFX fix**: the "wild/delayed" match sound was the ElevenLabs clips generating at the 12s default (the `mahjong_*` names were missing from `DURATIONS`); added short durations (match 0.6s etc). NOTE for owner: the old 12s clips are cached — regenerate once with `?force=1` (done during deploy for match/win). (4) **Score logging**: the win message now carries `meta:{score,best,newBest,timeMs,level,set}`; `gameLog.logGameEvent(event, game, meta)` forwards it and `HelperReactions` passes `d.meta`, so scores + new-bests land in `kid_game_events.meta` (no schema change — `meta jsonb` already exists) and the helper now calls out "New best score — N!". The assistant can read bests from `kid_game_events`.

---
## Session log — 2026-07-02 (Mahjong: exciting combos, lofi music, rewarding win, speed score)

Made matches feel exciting and rewarded quick play. **Combos:** chaining matches within 4.5s builds a combo that escalates the sound (`mahjong_match` -> `match2` -> `match3`, plus a `mahjong_combo` sparkle on long streaks), the pop text ("Nice! x2", "Great! x3", "Amazing! x5"…), and the burst/shake/flash. **Score (quicker = higher):** each match scores 10x its combo, and clearing faster than par (tiles x1.4s) adds a speed bonus, so fast + chained play wins; a live Score sits in the banner and the win card shows the score with "New best score!" and the time ("faster = higher score"). Best score is saved per difficulty+set (`localStorage bk_mahjong_score`) and shown on the start cards. **Audio (all ElevenLabs):** new calm-but-upbeat **lofi** background track added to the shared `api/library-music.js` (`lofi_chill_upbeat`) and played via `BA`; the match/win one-shots in `api/sfx.js` were rewritten to be brighter and more rewarding, and — importantly — all `mahjong_*` sounds were added to `DURATIONS` (they were defaulting to 12s because they were missing). `qa-mahjong.mjs` still green. NOTE for owner: the updated `mahjong_match`/`mahjong_win` prompts need a one-time regenerate — hit `/api/sfx?s=mahjong_match&force=1` (and `_win`); new sounds + the lofi track generate on first play.
=======
## Session log — 2026-07-02 (New game: Bubble Buddies — Snood-style bubble shooter, Kenney art)

Added a new hand-authored Track B engine **Bubble Buddies** at `public/bubble-engine.html` and wired it into the Games picker (`src/BuildableKids.jsx`: `SCREEN_BUBBLE`, `BubbleScreen`, tile, `GAME_SLUGS` entry `bubble`) with an explicit `vercel.json` route (`/bubble-engine.html` + `/bubble`). Gameplay: aim with a finger and tap to shoot a bubble up a hex grid; it bounces off the side walls and sticks; **match 3+ same-colour buddies to pop them**, and any buddies left hanging (not connected to the ceiling) drop away in a cascade. Clear the whole board to win. A dotted aim guide, a **next-bubble** preview, and gentle screen-shake/particle juice.

Art is **Kenney (CC0) Shape Characters** — 6 colour circle bodies (`public/kenney/shapechars/*_body_circle.png`) wearing faces so each bubble is a little 'buddy': a resting face on the grid, a surprised face on the one you're about to launch (`face_pop.png`, new), and a happy face as they pop. 6 levels of rising colour count (2→6). Sound via shared `BA` core sfx (`shoot`/`collect`/`explode`/`hit`/`win`/`lose`) with library music `spa_heartbeat_warm`; nav via shared `GameFrame` (Home top-left) + in-game top-right Sound/How buttons; shared `BS` start screen + level cards; favicon + no-longpress blocks; posts `{source:"buildable",kind:"win"|"lose"}` for the helper + telemetry.

**Always-winnable + QA:** the colour you're fed is always the one whose best shot pops/drops the most, so a kid is never handed a useless bubble; the lose line is far and shots are unlimited. Engine exposes `window.BUBBLE_GAME` (`sim`/`campaign`) with a deterministic 'perfect player' that picks the best colour+angle each shot using the *real* shot physics. `qa-bubble.mjs` proves **all 6 levels clear** across 5 seeds each (worst case 16 shots on L6) and render smoke returns "ok". Follow-ups: register the Kenney circle bodies in the shared asset library; add save/share/publish + a make-a-level; generate a picker thumbnail (`api/images` GAMES id `bubble`).
>>>>>>> 30afe7d (New game: Bubble Buddies — Snood-style bubble shooter (Kenney Shape Characters))

---
## Session log — 2026-07-02 (Mahjong: first-play demo hand — consistent with other games)

Brought Mahjong in line with the shared game conventions in `BUILDING-A-GAME.md`. Start/level select already uses the shared `buildable-startscreen.js` (BS) like every other engine, with the shell-owned Home (top-left) and Sound (top-right). Added the **first-play demo** using the same reusable **3D pointing hand** (`BR.hand` / `/tutorial-hand.png`) as Breaker and String Match: on a kid's first-ever game, the board dims, a caption reads "Tap two matching tiles!", the two demo tiles pulse green, and the hand taps back and forth between them. It ends on the first tap (or is dismissed once seen), flagged in `localStorage` (`bk_mahjong_demo`). QA hook `MAHJONG_GAME._demo()` forces it. `qa-mahjong.mjs` still green (3×5 combos, render ok).

---
## Session log — 2026-07-02 (Mahjong: Recall + capped Hint/Scramble helpers)

Added a **Recall** (undo) button to the Mahjong engine and **capped the three helpers at 3 uses each per game**: Recall (put the last matched pair back), Hint (highlight an available pair), and Mix/Scramble (reshuffle remaining tiles). Each round button shows its remaining count and greys out at 0 (Recall also greys when there's no move to undo). A wasted Hint tap on a stuck board doesn't burn a charge. The **automatic anti-stuck safety net stays uncapped** — if a real board ever has no move, it silently re-mixes so a kid can never hard-lock, independent of the manual Mix charges. Scrambling clears the Recall history (it's an undo reset point). State in `public/mahjong-engine.html`: `history[]` + `undosLeft/hintsLeft/mixesLeft` (CAP=3), reset in `build()`, reflected by `updateChrome()`. QA (`qa-mahjong.mjs`) still green across all 3×5 combos.

---
## Session log — 2026-07-02 (Mahjong: 2 more tile sets + best-time record)

Follow-ups to the new Mahjong engine. (1) **Two more tile sets** — **Shapes** (Kenney Shape Characters, 24 colour×shape bodies) and **Stickers** (Kenney Emote Pack, 20 friendly symbols: happy face, heart, star, music, idea…), both CC0, served from `public/game-assets/mahjong-tiles/{shapes,stickers}/`; the "Pick your tiles" sheet now offers five sets (Animals / Cards / Candy / Shapes / Stickers). (2) **Best-time record** — a live m:ss timer in the banner; on a clear the time is compared to the personal best for that difficulty+set (saved in `localStorage` as `bk_mahjong_best`, with an in-memory fallback), and a win overlay shows the time plus "New best time!" or the current best and "Tap to play again" (tapping returns to the start screen). Each start-screen difficulty card shows the best time for the selected set. QA (`qa-mahjong.mjs`) now covers all 3×5 difficulty×set combos — all solvable, never-stuck, render ok.

---

---
## Session log — 2026-07-02 (New game: Mahjong Solitaire, kid version)

Added a new hand-authored Track B engine, `public/mahjong-engine.html` — a calm Mahjong **Solitaire** (tile-matching) puzzle. The kid picks a **tile set** (Animals / Cards / Candy — CC0 Kenney art served from `public/game-assets/mahjong-tiles/<set>/`) and a **1 / 2 / 3 Fire** difficulty (small 36 / medium 72 / big 114 tiles), then clears the stacked board by matching free (uncovered, side-open) tiles in pairs.

Always-winnable by construction: boards are generated with a reverse **"peel" builder** (repeatedly assign a shared face to two currently-free positions and remove them), which guarantees a full solution exists. If the kid ever runs out of moves, the board silently **re-mixes** (still solvable), and there are **Hint** and **Mix** buttons — so a child can never get stuck. Uses the shared libs (BS start screen with drawn flame difficulty icons — no emoji; BM juice; BA audio) and five new bespoke ElevenLabs sounds registered in `api/sfx.js` (`mahjong_pick/match/nope/shuffle/win`). Standard nav (shell Home top-left, Sound/Hint/Mix top-right), favicon + no-longpress blocks, and posts `{source:"buildable",kind:"win"}` on a clear for helper + telemetry.

Wired in: `vercel.json` route for `/mahjong-engine.html`; a **Mahjong** tile + `MahjongScreen` + `SCREEN_MAHJONG` (in `GAME_SLUGS`) in `src/BuildableKids.jsx`; a picker-thumbnail prompt in `api/images.js`. Headless QA `qa-mahjong.mjs` proves every difficulty×set board is solvable (guaranteed-solution replay clears with zero illegal moves) and the never-stuck greedy+mix player also clears; render smoke returns "ok". Tile art is CC0 Kenney (see `public/game-assets/mahjong-tiles/LICENSE.txt`).

---
## Session log — 2026-07-02 (New game: String Match — draw-a-string connect puzzle, Kenney art)

Added a new Track B engine **String Match** at `public/string-match.html` and wired it into the Games picker (`src/BuildableKids.jsx`: `SCREEN_STRINGMATCH`, `StringMatchScreen`, tile, `GAME_SLUGS`) with an explicit `vercel.json` route (`/string-match.html` + `/string-match`). Gameplay: kids **draw a freeform string with a finger from one block to its matching-color buddy**; strings may not cross. On a good connect the two blocks swap to a happy face, sparkles burst, and a coin chime plays; finishing a level celebrates and posts `{source:"buildable",kind:"win"}` for the helper + telemetry. Art is **Kenney (CC0)**: Shape Characters blocks (6 colors, `public/kenney/shapechars/`) and Background Elements Remastered full backdrops (`public/kenney/bg/` — grass/forest/fall/desert/castles) give 5 worlds of escalating pairs (3→6). First-play shows an **animated pointing-hand demo** drawing the first string. Sounds via `BA` (core sfx `select`/`coin`/`error`/`celebrate`/`win`) with library music `spa_heartbeat_warm`; nav via shared `GameFrame` (Home top-left), plus in-game top-right Sound + Levels buttons. **Always-winnable + QA:** engine exposes `window.STRINGMATCH_GAME` with a pure-geometry perfect-player solver; `qa-stringmatch.mjs` asserts all 5 levels are solvable without crossing (ALL PASS). Follow-ups: register the Kenney blocks/backgrounds in the shared asset library (`community_*`); add save/share/publish + a make-a-level; generate a picker thumbnail (`api/images` GAMES id `stringmatch`).


---
## Session log — 2026-07-02 (Sound Machine: start unmuted + graphic speaker icon)

Two changes to the kids soundboard at `public/soundboard.html`. (1) The board now **always starts with sound ON**: the init no longer reads the saved `bk_muted` value from `localStorage` (`var muted=false;`), so every fresh load is unmuted regardless of how the previous visit ended. A child can still tap to mute during a session, but it will not persist across reloads. (Browser autoplay policy still requires the first tap before any audio plays.) (2) The mute toggle no longer shows the text "Sound on"/"Sound off" — it now renders an inline SVG **graphic speaker** (no emoji): a speaker with sound waves when on, and a speaker with an "x" when muted. Icons use `currentColor` so they stay legible on both the white (on) and dark-purple (off) button states, and an `aria-label="Sound"` was added for screen readers. Icon markup lives in `ON_SVG`/`OFF_SVG` consts near `setMute`.

---
## Session log — 2026-07-02 (Remove "Play a top game" tile from home grid)

Removed the "Play a top game" MakeTile (TrophyGlyph, onClick=onTop) from the "What do you want to make?" grid on the home screen, so top games now live only in the "Trending from other kids" section. The onTop handler is unchanged and still wired to that trending list, so nothing else needed touching. The grid drops from seven tiles to six (Play a game, Make a story, Make a song, Sound Machine, Make art, Make a game). Scoped to src/BuildableKids.jsx, committed to main (Vercel auto-deploys). No other files touched.

---

## Session log — 2026-07-02 (Buddy helper: greet once per 30 min + varied lines)

`BuildableKids.jsx` helper buddy no longer nags on every visit and no longer repeats the same
line. Added a `HELPER_DEFAULTS` pool with a per-visit `defaultLine` (`useState`) so the bubble
text and the spoken greeting stay in sync; the chess prompt now reads `. Want to play?`. The
auto-greet `useEffect` gates on a `bk_buddy_last_greet` localStorage timestamp with a
`30 * 60 * 1000` ms cooldown, and opening the float button also stamps that key, so the buddy
greets at most once per 30 minutes. Scoped to `src/BuildableKids.jsx`, committed to `main`
(Vercel auto-deploys); verified the committed file via the GitHub API. No other files touched.

---

## Session log — 2026-06-28 (Sunny Town Drive: 3D car + colored houses)

Flat billboard hero car -> real low-poly 3D car with spinning wheels (pivot groups, `G.speed`)
+ bank. Kenney houses get per-instance pastel tints (`BUILDING_TINTS`, cloned material) so they're
not all white. QA all-win; verified live, no errors.

---

## Session log — 2026-06-28 (Sunny Town Drive: low-poly model reskin)

Roadside scenery is now real CC0 3D models, data-driven via `SCENERY_SETS`/`TOWN_SET`:
Quaternius nature (.gltf) for forest towns, Kenney City Kit (.glb) buildings for city towns,
blocky `makeFallbackProp` as the load-fail fallback. Generalized `loadModel(item)` (handles
.glb+.gltf) + `prepModel` (Lambert, scale, ground; Kenney buildings get a Y-stretch + face the
road). Fixed the Kenney GLBs' missing external `Textures/colormap.png` (extracted CC0 from the
kit zip) — buildings now load textured. Track/jump/QA untouched; all-win verified. See
SESSION-LOG.md.

---

## Session log — 2026-06-27p (Sunny Town Drive: 3D city buildings + clouds removed)

Used the Quaternius **Downtown City MegaKit** (CC0): it ships modular pieces but ALSO 3 prebuilt
buildings (Building_Small_1 / Medium_2 / Large_2) — extracted those (gltf+bin + BaseColor textures
at 256px, normals/ORM at 32px since Lambert drops them) into `public/models/city/`. Generalized the
engine model system: `TOWN_MODELS` maps maple/petal→nature kit, market/downtown→city kit; city
buildings auto-scale to ~16u tall, sit on the ground, and rotate to FACE the road per side (slot.side)
so they form a street canyon. Market Square now renders a real 3D city block. Also REMOVED the flat
billboard cloud sprites (Mike: looked bad) — the AI sky keeps its painted clouds; balloons stay. QA
all-win; verified live, no console errors.

---

## Session log — 2026-06-27o (Sunny Town Drive: real 3D nature models)

Brought in real CC0 3D models (Quaternius **Stylized Nature MegaKit**) for the leafy towns.
Curated 14 models (trees/pines/bushes/rocks/flowers/grass/mushroom/fern) sharing 10 textures,
downscaled (diffuse 256px, normals 64px) → ~2.5MB in `public/models/nature/`. Vendored r128
`GLTFLoader.js` (+vercel routes for `/GLTFLoader.js` and `/models/(.*)`). Engine: `loadModel`
caches each GLTF, `prepModel` swaps to toy MeshLambert + auto-scales to a target height + sits
it on the ground; scenery slots for `TOWN_KIND==="nature3d"` (Maple, Petal) place a random
cloned model (random spin/scale, re-randomized on recycle) instead of a billboard — other towns
keep the AI billboards as before, and the blocky/billboard fallback remains if a model fails.
Brightened lighting (ambient 1.0 + hemisphere fill) so models read well. QA all-win; verified
live on Maple Street, no console errors. City MegaKit is modular brick pieces (assemble-required)
— deferred. Source zips live in the working folder.

---

## Session log — 2026-06-27n (Sunny Town Drive: jump mechanic + world variety)

(1) **Swipe-up JUMP**: new full-width "log" obstacle you jump over (swipe up / up-arrow / space);
jump arc physics (JUMP_V/GRAV/CLEAR_H); per-level `bump` chance; rows are either dodge-rows or
jump-rows, never both, so still always-winnable — the QA bot now jumps too and clears all 6 towns
0-hit. (2) **World variety**: 6 distinct scenery pieces per town (added bld_c, tree_b, prop = 18
new modern3d cut-outs; 36 total). Engine now picks a RANDOM piece per slot with random mirror +
size jitter and RE-randomizes on every recycle, so the roadside stops repeating. New `runner_jump`
sfx. QA all-win; verified live (Beach Road clearly varied), no console errors.

---

## Session log — 2026-06-27m (Sunny Town Drive: sounds + music)

Bespoke audio (ElevenLabs, per the sound rule). Added `sfx.js`: runner_coin (treat chime),
runner_crash (soft bump), runner_engine (idle-hum loop). New `api/runner-music.js` = cheerful
instrumental loop per town (maple/market/beach/petal/downtown/rainbow), cached in
narration_cache ("runnermusic:<town>"). Engine wires BA.configure map (coin/hurt/select/win/lose),
ensureMusic() per town on level start, and a looping engine-hum <audio> gated on play/mute.
Short sfx prewarmed; music generates in-browser on first play (Audio element, no 30s cutoff) —
Maple verified caching. QA still all-win; no console errors. Sunny Town Drive now has AI sky +
distinct per-town worlds + AI cars/obstacles/treats + drifting clouds/balloons + sound + music.

---

## Session log — 2026-06-27l (Sunny Town Drive: AI cars/obstacles/treats)

Foreground art overhaul: `images.js` kind `runnerobj` (shared, modern3d, transparent,
quality low) = hero_car (pink rear view), ob_car, cone/hay/barrel, coin/gift/star/icecream.
Engine renders the hero car, obstacles and treats as camera-facing billboards (addBillboard +
loadObjTex) with the old 3D models as graceful fallback; hero bank reduced for billboard
friendliness; treats hover (no edge-on spin). 9 pieces cached. Verified live on Beach Road:
glossy AI hero car + distinct beach scenery, no errors. NEXT: ElevenLabs sounds.

---

## Session log — 2026-06-27k (Sunny Town Drive: distinct AI worlds per town)

Made the levels look genuinely different + layered. Added `images.js` kind `runnerprop`
(modern3d, transparent, quality "low" so gen fits the fetch window) with distinct
building+tree pieces per town (maple cottages, market shops+clock tower, beach huts+palms,
petal blossoms+gazebo, downtown skyscrapers, rainbow candy houses). The 3D engine renders
roadside scenery as **camera-facing textured billboards** at two depth rows (layering),
loaded per town via `/api/images?kind=runnerprop&town=&piece=`, with the old blocky models
as a graceful fallback. Plus drifting clouds + balloons + per-town AI sky from before. QA
still all-win (render-only change). Verified live: Maple and Market look clearly distinct,
no console errors. NEXT: AI vehicles + treats, then ElevenLabs sounds.

---

## Session log — 2026-06-27j (Sunny Town Drive: self-host fix, slower speed, AI skies)

Three follow-ups after the 3D rebuild: (1) **self-hosted Three.js** (`public/three.min.js`
+route) instead of cdnjs — fixes "never starts" on networks that block the CDN; added a
visible no-3D fallback. (2) **Slower gameplay** for ages 4-8 (speeds 2.2→4.2, wider ROW_GAP,
~20s runs) — still all-win in QA. (3) First real art: **AI sky backdrops** per town via a new
`images.js` kind `runnersky` (gpt-image-1, Supabase-cached, modern3d), loaded as the Three.js
`scene.background` with the solid town color as fallback. All 6 skies generated + verified
live behind the 3D road, no console errors. NEXT: AI vehicles + roadside scenery as billboard
sprites, then ElevenLabs sounds (bg music, engine hum, crash, treat chime).

---

## Session log — 2026-06-27i (Sunny Town Drive — new 3-lane runner engine)

**2026-06-27 fix (never-starts):** Three.js is now **self-hosted** at `public/three.min.js`
(+ vercel route) instead of loaded from cdnjs — a blocked/slow CDN was the likely cause of
the game never starting on some networks. Added a visible "couldn't load 3D" fallback so it
can never silently blank. Verified live loading from the local copy.

**2026-06-27 3D rebuild:** Sunny Town Drive is now **true 3D** (Three.js r128, blocky
LEGO-style) — camera behind the car, road receding into fog. Crucially the *gameplay logic
is unchanged*: it stays a pure track-position model (lane + p in the same 0..H units), so
`runner-engine.html` maps p->world Z and lane->world X for drawing only. That means the
always-winnable guarantee and the headless QA bot still work with no WebGL — `qa-runner.mjs`
runs the same sim/campaign (all 6 towns clear 0-hit/3-star) and now loads only the libs the
3D engine uses (`buildable-audio.js`, `buildable-startscreen.js`). Rendering is a WebGL scene
canvas (#c) with a 2D HUD overlay canvas (#hud) on top for hearts/town/progress/banners; the
shared BS start screen still sits over it. All 3D init is guarded by `window.THREE` so the
engine loads cleanly headlessly. Verified live in-browser (3D scene renders + plays, no
console errors).

New hand-authored **Track B** engine `public/runner-engine.html` (route `/runner-engine.html`):
a cute "drive through town, dodge stuff, collect treats" runner for ages 4-8, inspired by
LEGO Friends: Heartlake Rush (built as our own original — no licensed art). Steering is
**3-lane tap/swipe** (tap a side, swipe, or arrow keys) so it works on phone, iPad and
desktop. Theme is a fresh **Sunny Town** with 6 towns (Maple Street -> Rainbow Bridge),
each a data recipe in `GAME_CONFIG.levels` — adding a town is editing data, not engine code.

Built to BUILDING-A-GAME.md: data-driven levels, **always-winnable** (every obstacle row
leaves >=1 open lane and rows are spaced so only one is in the car's collision band, so a
perfect driver can finish untouched), and headless QA-simmed. Uses shared engine libs BR
(drawn car/obstacles/treats, no images so it can't break), BA (sound via the existing
created catalog), BM (crash shake/flash + treat sparkles), BS (the shared start screen).

QA: `qa-runner.mjs` exposes `window.BUILDABLE_GAME` (+ `RUNNER_GAME` alias) with
`sim()`/`campaign()`; a perfect-driver bot clears all 6 towns with **0 hits / 3 stars**
across 5 runs each + a full campaign, plus render smoke — all PASS. Surfaced in
`src/BuildableKids.jsx` as a "Sunny Town Drive" tile in the Games picker
(`SunnyTownScreen`, full-screen iframe) and a row in `public/games-library.html`.
`esbuild` build of BuildableKids.jsx passes.

**Follow-ups (deferred):** bespoke ElevenLabs sounds + generated Sunny Town cast/pets art
in the shared asset library; car customizing, missions/unlocks, and a driver picker
(v1 is dodge + collect only, per scope).

---

## Session log — 2026-06-27b (characters get a theme label — first convergence step)

First step of bringing every project onto the shared asset library: gave reusable
heroes a `theme` so they can be filtered and mixed like worlds/elements already are
(theme is a LABEL, not a fence — heroes stay usable across all themes).

- `db/add-character-theme-tags.sql` (idempotent, non-destructive): adds
  `theme_tags text[]` + a GIN index to `community_characters`. **Owner must run
  this once in the Supabase SQL editor** (agents can't touch Supabase).
- `api/list-characters.js`: now selects `theme_tags`, returns `theme`, accepts an
  optional `?theme=` filter, and **falls back gracefully if the column doesn't
  exist yet** — so the picker keeps working before/after the migration is run.
- `api/generate-creature.js`: writes `theme_tags` when a `theme` is provided
  (best-effort; missing column can't block character creation).

Order is safe: code is live and harmless now; running the SQL simply switches the
theme filter on. No project breaks at any point.

---

## Session log — 2026-06-27 (Shared Asset Library rule + Survival background fix)

**Shared Asset Library rule added to `AGENTS.md`.** Codified that all projects
(story, game, chess, song, future) draw from ONE shared library, every reusable
asset tagged `kind`/`theme`/`url`/`source`/`usable_in`, `community_*` tables as
the source of truth. Migration is additive: write-on-create, read-on-render with
a local/drawn fallback, and never delete or re-path a live asset until its shared
replacement is verified live. `theme` is the universal key for rendering a new
project from existing assets.

**Survival background fix.** `public/survival-engine.html` pointed `bgImg` at
`chess-art/space_bg.png` (never existed — real file is `.jpg`), so Space Sparkles
silently fell back to drawn art. Repointed to `chess-art/space_bg.jpg` (verified
served live) and disabled the dead `game-music/music_space.mp3` reference
(`musicUrl: ""`, music intentionally off) with a guard so an empty URL can't
trigger a stray load.

---

## Session log — 2026-06-27c (Stories wired into the shared asset library)

Stories now feed the shared library WITHOUT touching the story maker or the DB:
- `api/story-library.js` gains named exports (WORLDS, CHARACTERS, STYLES).
- `api/_storyAssets.js` (new) returns only story worlds/heroes whose image is
  already cached (checked across all 4 styles), tagged `source:story` + theme.
  Degrades to [] on any error.
- `api/list-characters.js` + `api/list-assets.js` merge those in, so the creator
  picker (CreatorScreen) can offer story heroes + worlds alongside game art.

Additive + safe: endpoints verified live (still return cleanly, no breakage).
NOTE: surfacing is gated on art being BUILT — story bases are cached lazily as
kids make stories, so the shelf fills in over time. To populate it immediately,
run a one-time pre-build of the story library (build endpoint per world/character
at one style). Worlds in particular need this (world bases are only built on
explicit `?build=`, not during normal story play).

---

## Session log — 2026-06-27d (Stories LIVE in the shared library — verified)

Confirmed working live: /api/list-characters now returns 25 heroes (all 18 story
characters incl. the croc cast, tagged source:story) + the community hero; and
/api/list-assets returns all 8 story worlds tagged by theme. So story art now
shows in the shared creator picker and is reusable by games.

Root cause of earlier "shows zero": EDGE-CACHED API GET responses. The merge code
was correct; cached empty responses masked it. Verified by busting cache (?cb=).
The narration_cache holds 184 story pictures (38 base, 94 expression, 52 scene).
Fix that mattered: match cached "lib:" base keys via a like-filter instead of a
long in() id list. Diagnostic counter lives at /api/story-library?stats=1.

GOTCHA for future: these library GET endpoints are edge-cached — always bust the
cache (?cb=) when QA-ing live, and consider a short max-age if the picker needs
to reflect brand-new creations quickly.

---

## Session log — 2026-06-27e (Shared AUDIO catalog live)

New /api/list-audio: the single shared catalog for sound. Lists 12 music tracks
(6 themed ElevenLabs world tracks via /api/chess-music + 6 mood loops from
public/music-library) and 24 sfx (10 themed ambience + 14 chess one-shots from
/api/sfx), each tagged kind/theme/url/source. ?theme=<t> filters (verified live:
theme=space -> space music + space sfx). Additive: added named exports
SOUNDS (api/sfx.js) + CHESS_MUSIC_WORLDS (api/chess-music.js); no DB change.
Now a new themed project can pull world+hero+music+sfx from one shelf by one word.
(Remember: library GET endpoints are edge-cached — QA with ?cb=.)

---

## Session log — 2026-06-27f (Every creation gets a thumbnail from its own art)

Each creation list now returns a `thumbnail` auto-derived from the creation's OWN
art, so lists/menus show real pictures instead of flat color cards:
- stories -> first-page illustration (nested select story->pages->0->>art_url;
  embedded data: images skipped to keep lists light; falls back to world art)
- saved games -> their world/theme art from the shared library (api/_thumbs.js)
- published games -> preview_image_url (already stored) || world art
- songs -> generated cover (vibe/theme) so they match in generic lists
Endpoints: list-stories, list-songs, list-games, list-published-games,
top-creations. UI: TopBoard trending tiles now render the art (ArtThumb) with the
glyph tile as a safe fallback. Approach is derive-at-read: no DB change, no
backfill, works for ALL existing creations immediately, self-updating. (A stored
thumbnail_url column is available as optional hardening if we ever want it frozen
per creation.) Helper: api/_thumbs.js (thumbForWorld, songCover). QA cache-busted.

---

## Session log — 2026-06-27g (Last silo closed: chess worlds in shared library)

list-assets now merges the 6 chess world backgrounds (chess-art/<theme>_bg.jpg,
static files) as themed source:chess background layers — verified live
(theme=castle returns the story dragon-mountain world AND the chess castle bg).
So community + story + chess worlds all live in one themed picker. Also aligned
BUILDING-A-GAME.md with the shipped shared audio catalog (/api/list-audio),
creation thumbnails (api/_thumbs.js), and the edge-cache ?cb= QA reminder.

Asset unification status: characters (themed), stories (heroes+worlds), audio
(music+sfx catalog), thumbnails, and now chess worlds — all converged. Remaining
nice-to-haves: chess foregrounds/thumbs as separate layer kinds; community_* are
near-empty in this env (real art lives as files/caches now surfaced via reads).

---

## Session log — 2026-06-27h (Sound Machine — silly SFX soundboard for kids)

New kid soundboard at `public/soundboard.html` (route `/soundboard.html` + `/sounds`):
a colorful, no-emoji grid of big tappable pads that play short ElevenLabs one-shots
— whoopee cushion, explosion, boing, burp, honk, ta-da, laser, ding, buzzer, sad
trombone, squeak, air horn, bonk, slide whistle, meow, woof, quack, cheer. Each pad
plays `/api/sfx?s=<key>` (generated-once + cached, audio/mpeg, immutable); taps clone
the cached clip so they overlap for spam-friendly fun. Mute is remembered in
`localStorage` (shared `bk_muted` key); first tap satisfies iOS audio-gesture.

Per BUILDING-A-GAME.md (CREATE bespoke sounds for a new type, never synth): added the
18 fun prompts + durations to `api/sfx.js` `SOUNDS`/`DURATIONS`, and tagged them
`theme:"fun"` in `/api/list-audio` so every other game can pull them. Surfaced in the
app two ways (src/BuildableKids.jsx): a "Sound Machine" tile on the Home "What do you
want to make?" grid AND in the Games picker, each opening a full-screen iframe
(`SoundboardScreen`). `vite build` passes; "make your own sound" deferred to a later
session.

**Live QA fixes:** ElevenLabs requires duration_seconds 0.5–30 (squeak/bonk were 0.4 → bumped); error responses now send `Cache-Control: no-store` and the soundboard requests `/api/sfx?s=<key>&v=1` so a poisoned error never sticks in the edge cache. All 18 pads verified returning audio/mpeg live.

**2026-06-27 follow-up:** Whoopee pad now plays a wet `fart` (fresh cache key, bypasses the old clip) + 13 new sounds (giggle, dino roar, robot, splat, cha-ching, drum roll, gong, frog, cow moo, rooster, vroom, achoo, party pop) — 31 pads total, all verified live + pre-warmed.

**2026-06-27 — themed sound packs:** Soundboard rebuilt with a tabbed pack UI (10 packs: Silly, Animals, Instruments, Space, Spooky, Vehicles, Magic, Nature, Food, Sports) — 133 pads, 86 new ElevenLabs one-shots (all dur>=0.5s), theme-tagged per pack in /api/list-audio for reuse, ~30 white-line glyphs (no emoji). Last pack remembered in localStorage. Sampled every pack live (audio/mpeg). 

**2026-06-27 - theme tile art (for pre-readers):** Each pack tab now shows an AI-generated picture badge so kids who cannot read can recognize the theme. Added a `soundpack` kind to `api/images.js` (gpt-image-1, transparent glossy icon per theme, cached in image_cache, served as PNG); the tab `<img>` falls back to a colored SVG emblem on any error. Pre-generated all 10 packs - verified cached via manifest. 

**2026-06-28 - real picture on EVERY sound button:** Per Mike, each of the 131 pads now shows an AI-generated picture of the actual thing (lion shows a lion, trumpet a trumpet) so pre-readers see what they tap. Added a `soundfx` kind to `api/images.js` with a kid-recognizable subject for all 131 keys (gpt-image-1 low, transparent, cached). Pads render the SVG emblem instantly then fade the photo in; text label kept underneath. Pre-generated all 131 - 100% cached (verified via manifest). 

**2026-06-28 fix:** The SVG emblem placeholder rendered BEHIND the transparent picture, so pads showed both at once. Removed the emblem layer from pads + tabs entirely (loading/error state is now just the plain colored pad). Also dropped `loading=lazy` on pad images (it never fired in some browsers, leaving pads blank). Verified live via Chrome: 0 old icons, every pad shows only picture + label. RESOLVED 2026-06-28: soundfx + soundpack images now serve as compressed WebP (output_format webp, compression 75; format baked into the cache descriptor so Content-Type never mismatches; other kinds stay PNG). ~1.4MB -> ~140KB each (8-10x). All 141 regenerated; verified live via Chrome: a full 16-pad pack loads in ~0.5s (was ~22MB), pads show only picture + label, 0 old icons.

---

## Session log — 2026-06-28 (Internal Asset Library visualizer LIVE)

New internal page public/asset-library.html (route added before catch-all;
noindex). Live-reads /api/list-assets + list-characters + list-audio and shows
everything we can build with: a 2D/3D toggle (hard gate), game-type + theme
filters, kind toggles incl a new Effects kind, a theme x kind COVERAGE MATRIX
(filled=have, hollow=gap), and a gallery with real thumbnails, source + license
badges, copy-id, and inline audio play. Also lists the 14 live 3D nature models
(/models/nature/*.gltf, Quaternius) and the downloaded packs (KayKit/Tiny Swords/
Quaternius/Mossy) with CC0 vs no-republish flags. Verified live in Chrome: 293
assets (44 2D, 14 3D, 235 audio), thumbnails + matrix render.
KNOWN NUANCE: characters are intentionally theme-less, so the matrix Hero column
reads blank per-theme (they're cross-theme/available everywhere) — refine later
(add an "any" lane or theme-tag heroes). Effects sounds mostly "create" (matches
the new-engine-creates-sounds rule). QA library GETs with ?cb= (edge-cached).

---

## Session log — 2026-06-28b (Asset Library: theme-filter fix, 3D auto-discovery, city starter set)

- THEME FILTER FIX: picking a theme is now strict (only that theme's assets) and
  the selected chip highlights (syncThemeChips). Heroes/effects are theme-less so
  they show 0 under a theme — their cross-theme availability lives in the coverage
  matrix "any theme" marker, not the gallery. Verified: "space" -> 21 cards.
- 3D AUTO-DISCOVERY: page reads /models/manifest.json (gen scripts/gen-models-
  manifest.mjs). Mike's new city pack (3 buildings) appeared automatically.
- CITY STARTER SET (grows the new theme per the rule): City Music (api/chess-music
  world=city), City ambience (api/sfx s=city), a Sunny City 2D world
  (story-library, pre-built) — all tagged theme=city + the 3 city building models.
  Verified theme=city -> 6 assets across world/music/sfx/3D.
- CITY MODEL PACK LICENSE: flagged "verify" (warn badge) in the manifest — source
  unknown, Mike to confirm so it can be set CC0 or otherwise.

---

## Session log — 2026-06-28c (Kenney kits in + every 3D asset previewable)

Processed two Kenney CC0 kits Mike dropped in Buildable MVP/:
- CITY KIT (Suburban): 40 GLB -> public/models/city-kit/ + the kit's per-model
  preview PNGs -> previews/. Manifest now supports .glb + a `thumb` field, so the
  Asset Library shows each city model's real preview image. Tagged theme=city,
  source=kenney, CC0.
- PARTICLE PACK: 24 curated effect PNGs -> public/fx/ (+ /fx/manifest.json + /fx/
  route). Surfaced as the `effect` kind on a checkerboard backdrop (they're white-
  on-transparent). Effects shelf now 29 (24 particles + 5 BM code FX).
PREVIEW FIX (Mike: "need to see the assets"): 3D model cards now show a thumbnail —
the kit's preview image when shipped, else a CLIENT-SIDE rendered snapshot (shared
offscreen Three.js renderer, queued). Verified: all 17 preview-less models (nature
+ buildings) rendered; 40 city models show Kenney previews. Clicking still opens the
live rotating 3D viewer. gen-models-manifest META documents adding Kenney kits.

---

## QA Session Log Ã¢ÂÂ June 7 2026

The following bugs were found and fixed during a full end-to-end QA pass. All fixes were committed directly to `main` and auto-deployed to Vercel production.

### Infrastructure Setup (same session)
- **Supabase service key** updated in Vercel environment variables to new `sb_secret_...` format and redeployed
- **Three community tables** created in Supabase with the SQL below:
  - `community_layers` (indexes on layer_type + moderation_status + reusable, GIN index on theme_tags)
  - `community_levels`
  - `community_characters`
  - All tables have Row Level Security enabled

### Bugs Fixed

#### 1. `response_format` param rejected by OpenAI
**Files:** `api/generate-level.js`, `api/generate-creature.js`
**Error:** `400 Unknown parameter: 'response_format'`
**Fix:** Removed the `response_format: "url"` field from the OpenAI images request body. The `dall-e-3` model does not accept this parameter.
**Commits:** `f6a412a`, `a58177c`

#### 2. OpenAI model not available on account
**Files:** `api/generate-level.js`, `api/generate-creature.js`
**Error:** `400 The model 'dall-e-3' does not exist.`
**Fix:** Added multi-model fallback: try `gpt-image-1` Ã¢ÂÂ `dall-e-3` Ã¢ÂÂ `dall-e-2` in sequence. First successful response is used.
**Commits:** `403cc8f`, `a2ef6c9`

#### 3. Vercel 60s function timeout too short
**File:** `vercel.json`
**Error:** 504 Gateway Timeout on `/api/generate-level`
**Fix:** Raised `maxDuration` from 60 Ã¢ÂÂ 300 seconds.
**Commit:** `6044c16`

#### 4. LoadingGames overlay never dismissed
**File:** `src/LoadingGames.jsx`
**Symptom:** The "Tap the Numbers" loading mini-game stayed on screen after world generation finished.
**Fix:** Added `dismissed` state. After `onComplete()` fires in the setTimeout, set `dismissed = true`. Added `if (dismissed) return null` early return so the overlay unmounts.
**Commit:** `7aa8e30`

#### 5. 413 Request Too Large on `/api/generate-game`
**File:** `src/BuildableKids.jsx`
**Error:** `413 Request Entity Too Large`
**Root cause:** `gpt-image-1` returns base64 PNGs stored as `imageUrl` on each layer object. The `slimGameData` mapper stripped `image` but not `imageUrl`, so ~1MB of base64 was being sent to `generate-game`.
**Fix:** Added `imageUrl: undefined` to the layer mapper so base64 is stripped before the payload is sent.
**Commit:** `6009d2d`

#### 6. `generate-creature.js` used single model with no fallback
**File:** `api/generate-creature.js`
**Symptom:** Character generation always failed silently when primary model was unavailable.
**Fix:** Added same multi-model fallback as `generate-level.js`.
**Commit:** `a2ef6c9`

#### 7. Debug `?debug=1` endpoint left in production
**File:** `api/generate-level.js`
**Issue:** A temporary GET handler that returned raw DB diagnostic info was left in the file.
**Fix:** Removed the entire GET debug block.
**Commit:** `f6a412a`

### End-to-End Test Result (PASS)

After all fixes, the full flow was verified:
1. User enters name, age, picks character class
2. Character generated Ã¢ÂÂ AI art via `gpt-image-1`, saved to `community_characters`
3. World generated Ã¢ÂÂ 4 parallax layers saved to `community_layers`
4. LoadingGames "Tap the Numbers" mini-game shows during wait, dismisses on complete
5. Play screen shows: game title, "Saved to My Stuff", character + world preview, 4 layer cards
6. Game iframe loads: Phaser 3.60.0, correct title, game script present

### Community Library Status (post-QA)
- `community_layers`: 14 rows
- `community_levels`: 4 rows
- `community_characters`: 4 rows

### Commit History

| Commit | Message |
|--------|---------|
| `f6a412a` | fix: use dall-e-3 only, surface image errors, remove debug block |
| `4668eea` | fix: remove response_format from dall-e-3 request (unsupported param) |
| `403cc8f` | fix: try gpt-image-1, dall-e-3, dall-e-2 in sequence to find working model |
| `6044c16` | fix: raise function maxDuration to 300s for image generation |
| `a58177c` | fix: remove response_format from dall-e-3 request in generate-creature |
| `a2ef6c9` | fix: try gpt-image-1, dall-e-3, dall-e-2 in sequence for creature generation |
| `7aa8e30` | fix: LoadingGames overlay now dismisses itself after onComplete fires |
| `6009d2d` | fix: strip imageUrl from layers before sending to generate-game (prevents 413) |

---

## Known Issues / Future Work

### Phaser canvas intermittently blank in iframe
Phaser occasionally doesn't render inside the `doc.write()` iframe injection. The game code and Phaser script ARE present; Phaser just doesn't always initialize in a `document.write` context. The `fallbackGame()` in `generate-game.js` handles this gracefully.

**Potential fix:** Replace the `doc.write(gameHtml)` approach in `PlayGameScreen` with a blob URL:
```js
const blob = new Blob([gameHtml], { type: 'text/html' });
iframe.src = URL.createObjectURL(blob);
```
This gives Phaser a proper browsing context and should fix the intermittent blank canvas.


---

## Asset Libraries + Library-Driven Generator (June 7 2026)

The game generator no longer makes new art with DALL-E on every build. A game is now assembled by mixing and matching from three reusable libraries:

- **LEVEL library** -> `community_layers` (background layers: sky, midground, platforms, foreground; per theme)
- **SPRITE library** -> `community_sprites` (game objects: coin, gem, star, heart, chest, spike, cloud_platform, key, orb; per theme)
- **MECHANIC library** -> `game_mechanics` (reusable gameplay rules; built to grow over time)

### New Supabase objects (project: mstrouss-newco's Project)

- **Storage bucket `buildable-assets`** (public) - holds the asset PNGs so each gets a permanent public URL.
- **Table `community_sprites`** - mirrors the `community_layers` contract: `asset_id, subject, category, image_url, theme_tags[], prompt_used, has_transparency, reusable, created_by_device_id, moderation_status, created_at`. RLS enabled; read via service key (same pattern as `community_layers`). Indexes: `(subject, moderation_status, reusable)` + GIN on `theme_tags`.
- **Table `game_mechanics`** - `slug (unique), name, description, rule (jsonb), tags[], enabled, created_at`. RLS enabled. Add new mechanics by inserting a row; the generator picks from `enabled=true`.

### Theme tag convention

Capitalized theme tags: Forest, Castle, Underwater, Space, Desert, Volcano, Candy kingdom. (Note: some legacy `community_layers` rows use lowercase, e.g. `forest`; the generator matches themes case-insensitively to cover both.)

### Generator changes

- `api/generate-level.js` - rewritten to pull layers from `community_layers` by theme (case-insensitive), mix-and-match across themes (via optional `entity.layerThemes`), and **no longer generates or randomly refreshes art with DALL-E**. DALL-E is kept ONLY as a last-resort gap-filler when no library layer exists for a requested type; every such gap is returned under `gaps` in the response so the library can be filled. Response also reports `fromLibrary` / `gapFilled` counts and `costUsd` (0 when fully library-sourced).
- `api/generate-game.js` - now fetches sprites from `community_sprites` (mix-and-match, theme-biased with cross-theme fallback) and selects a mechanic from `game_mechanics` (or by `gameData.mechanicSlug`), injecting both into the Claude prompt. **No image generation in the game-creation path** (`costUsd: 0`). Missing sprite subjects are flagged under `spriteGaps`.

### Starter mechanics seeded

`run-jump-platformer`, `collect-all-coins`, `avoid-the-spikes`, `reach-the-chest`, `timed-run` (each with a small `rule` JSON for win/lose params).

### Known issue / bug found

**Asset PNGs in `/upload` are empty placeholders.** All 91 files are correctly named (7 themes x 4 layers + 9 sprites = 91, 0 missing/misnamed) but each file is only ~8 bytes (just the PNG signature, no image data). The real artwork did not make it into the GitHub commit. **Action needed:** re-upload the real PNG binaries to `/upload` (replace the stubs). Once real files are present, the 91 rows can be loaded into the `buildable-assets` bucket + `community_layers`/`community_sprites` and the end-to-end verification completed. The schema, bucket, mechanic library, and generator code are already in place and waiting on the real art.


## Kid Publish Flow (June 7 2026)

Kids can now create a game and publish it for others to play.

Flow: intro -> pick game -> create character -> build world -> **Play** (game is assembled from the libraries, no DALL-E) -> tap **"Ã°ÂÂÂ Publish my game!"** on the play screen. Publishing POSTs the finished game HTML plus metadata (title, theme, chosen mechanic, character/creator names, layer ids, preview image) to `/api/publish-game`, which stores a row in `published_games` and returns a share link (`/play/<gameId>`). The UI then shows a success message with the shareable link.

The public gallery reads from `/api/list-published-games` (light list without the heavy html column); a single shared game is fetched with `?gameId=` which includes the html so it can be played.

New files: `api/publish-game.js`, `api/list-published-games.js`. Edited: `src/BuildableKids.jsx` (PlayGameScreen gained publish state, a publishGame() handler, the Publish button, and a published/share-link card; also added the previously-missing `styles.error` entry the error message already referenced).

---

## Asset Pack Loaded + Create/Publish/QA Verified (June 7 2026, later session)

This session resolved the "empty placeholder PNGs" blocker and verified the full create -> publish -> store -> play loop end to end.

### Asset pack loaded (Option A: GitHub raw URLs)
Rather than wait on re-uploading binaries, the asset rows were registered to point at the permanent public **GitHub raw URLs** of the committed PNGs (no service-role key needed, no bucket upload step). Inserted **91 rows total**:
- **28 layer rows** added to `community_layers` (7 themes x 4 layer types), `created_by_device_id = 'asset-pack'`, `has_transparency = false`.
- **63 sprite rows** added to `community_sprites` (7 themes x 9 subjects), `created_by_device_id = 'asset-pack'`, `has_transparency = true`.
- All rows: `reusable = true`, `moderation_status = 'approved'`, capitalized theme tags.

Post-load counts: `community_layers` = 47 total (28 from asset-pack), `community_sprites` = 63, `game_mechanics` = 5. 7 themes x 9 subjects verified uniform.

> NOTE: this **supersedes** the earlier "Asset PNGs in /upload are empty placeholders / waiting on real art" Known Issue above. The generator now has a full clean-URL asset pack to draw from. (The 8-byte stub files may still exist in `/upload`, but the DB rows used by the generator point at the committed raw PNG URLs, not the stubs.)

### Create + save to library (Task B)
Replicated the generator's selection logic against the live DB for a Forest game and saved a level to `community_levels` (id 7, "Enchanted Forest Quest", layer_ids [5,3,6,4], collect-all-coins). `created_by_device_id = 'qa-test'`.

### Full publish flow exercised + QA (Task C)
Built a real self-contained playable canvas game and ran it through the publish path. Stored in `published_games` (id 1, `game_id` = qaa95cb6, "Sparkle's Forest Coin Quest", character "Sparkle the Dragon", creator "Mia", `device_id` = 'qa-test-device', collect-all-coins).

QA result (PASS): html ~4.2KB, has doctype, references library sky + coin art, has win logic, **no DALL-E**, 3 layers + 3 sprites. The `/api/list-published-games` gallery query returns it. The game was rendered in a sandboxed iframe and driven live: all library art displayed (sky/mountains/grass, 6 coins, spike, player) and the coin counter incremented 0 -> 1 -> 2, confirming the collect-all-coins win mechanic works.

### Known issue / generator tweak recommended (base64 vs clean URL)
Some **legacy** `community_layers` rows (the pre-existing Forest layers) store `image_url` as large **base64 data URIs** instead of clean URLs. The generator currently picks lowest-id, which favors those heavy rows and bloats the published HTML. **Recommended fix:** bias layer selection toward `created_by_device_id = 'asset-pack'` (clean GitHub URLs) and/or skip rows whose `image_url` starts with `data:`. For the QA game, selection was manually biased to asset-pack rows to keep the HTML small.

### Security posture note (RLS)
`published_games` (and the asset INSERTs) were created/run with the Supabase linter's **"Run without RLS"** option, matching the existing community/published tables which are read via the service key. (This corrects the older note above stating all tables have RLS enabled Ã¢ÂÂ the app does **not** rely on RLS for reads.)

### QA test rows to clean up (optional)
Left in place for inspection; safe to delete when no longer needed: `published_games` id 1 (`game_id` qaa95cb6) and `community_levels` id 7 ("Enchanted Forest Quest").

## Blank Game Canvas Fixed Ã¢ÂÂ Blob URL Render (June 7 2026, later session)

The long-standing "Phaser canvas intermittently blank in iframe" issue (see the earlier *Known Issues / Future Work* note) is now **fixed**. This was the bug behind the play screen showing a generated character, world, and 4 layer cards but an empty dark game box that was never actually playable.

### Root cause
`PlayGameScreen` (in `src/BuildableKids.jsx`) injected the generated game HTML into the play `<iframe>` using `doc.open()` / `doc.write(gameHtml)` / `doc.close()`. A `document.write()`-populated iframe does not get a proper browsing context, so Phaser 3 (and its WebGL/canvas init) intermittently failed to boot and the canvas rendered blank. The game code and the Phaser script were present the whole time Ã¢ÂÂ the engine just never initialized.

### Fix
Replaced the `document.write()` injection with a **Blob URL** assigned to `iframe.src`:

```js
useEffect(() => {
  if (!gameHtml || !iframeRef.current) return;
  const iframe = iframeRef.current;
  const blob = new Blob([gameHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  iframe.src = url;
  return () => {
    URL.revokeObjectURL(url); // revoke on cleanup to avoid memory leaks
  };
}, [gameHtml]);
```

A Blob URL gives the game a real document and origin, so Phaser/WebGL boot reliably instead of intermittently. This is exactly the fix the earlier *Potential fix* note recommended. Commit: `c99ffc1` (fix: render game via Blob URL instead of doc.write).

### Best practices going forward
- **Never use `document.write()` to load an interactive game/engine into an iframe.** Use a Blob URL (or `srcdoc`) so the embedded document gets a proper browsing context. `document.write()` is unreliable for anything that depends on canvas/WebGL/timing.
- **Always revoke object URLs** created with `URL.createObjectURL` in the effect cleanup to prevent memory leaks when the game HTML changes or the component unmounts.
- **Keep the injected HTML small.** Bias layer/sprite selection toward the clean `created_by_device_id = 'asset-pack'` rows (GitHub raw URLs) and skip rows whose `image_url` starts with `data:`. Large base64 layers bloat the game HTML and slow the iframe paint Ã¢ÂÂ this compounds render problems even with the Blob URL approach. (See the base64-vs-clean-URL note above.)
- **Sandbox note:** the play iframe uses `sandbox="allow-scripts allow-same-origin"`. `allow-scripts` is required for Phaser to run; the Blob URL is treated as same-origin so the game behaves like a normal document. Keep both flags in sync if the sandbox is ever tightened.

### QA status
Code change committed to `main` and auto-deploys to Vercel production. The play screen now hands Phaser a real browsing context; the previously-blank `https://www.buildablekids.com/demo` game box should render the playable canvas once the deploy lands. End-to-end re-verification (canvas paints, player + parallax layers + sprites visible, mechanic playable) should be run against the fresh deploy.

## Generated Game Validation + Truncation Guard (June 7 2026, later session)

After the Blob URL render fix, end-to-end QA against the live demo showed games **still** rendering a blank canvas Ã¢ÂÂ but for a different reason. Inspecting the play iframe directly: the Blob URL loaded fine, Phaser 3.60.0 loaded from CDN, and the ~19KB inline game script was injected Ã¢ÂÂ but **no `<canvas>` was ever created**. Evaluating the inline script threw `SyntaxError: missing ) after argument list`. The generated code had unbalanced brackets (e.g. 344 `(` vs 343 `)`, 75 `{` vs 73 `}`) and contained **no `new Phaser.Game(...)` call at all**.

### Root cause
The Claude call in `api/generate-game.js` used `max_tokens: 8000`. A full, polished game (the prompt asks for enemies, power-ups, a difficulty ramp, and a separate CONFIG block) routinely needs more than that, so the response was **truncated mid-script**. The only validation gate was `html.includes("<!DOCTYPE")` Ã¢ÂÂ a truncated file still starts with `<!DOCTYPE html>`, so the broken code passed the check and was served as-is. `fallbackGame()` never triggered because its trigger condition did not detect *malformed* output, only a missing/empty response.

### Fix (`api/generate-game.js`)
1. **Raised `max_tokens` from 8000 to 16000** so a complete game fits in one response.
2. **Truncation guard:** if Claude returns `stop_reason: "max_tokens"`, treat it as a generation failure and serve `fallbackGame()` instead of the partial output.
3. **Added `validateGameHtml(html)`** which is now run before any generated game is served. It rejects output that: is empty / not HTML, has no closing `</html>`, has no `new Phaser.Game` / `Phaser.Game(` bootstrap, or has unbalanced `()`, `{}`, or `[]` in its `<script>` bodies. On failure it falls back to the known-good `fallbackGame()`.
4. **Observability:** the API response now includes a `fallbackReason` field (`"truncated"`, `"no-phaser-game"`, `"unbalanced-braces"`, etc.) so future bad generations are diagnosable from the network tab.

Commit: `fcd50f2` (fix: validate generated game + raise max_tokens).

### Best practices going forward
- **Never serve LLM-generated executable code without validating it first.** At minimum check that it parses / has balanced brackets and contains the expected entry point (here, the Phaser bootstrap). A partial response can look valid at the top and be broken at the bottom.
- **Always check the completion `stop_reason`.** `max_tokens` means the answer was cut off Ã¢ÂÂ do not use it. Size `max_tokens` to the realistic worst-case output, not the average.
- **Make the fallback trigger on *quality*, not just *presence*.** The old fallback only caught "no response"; it must also catch "malformed response."
- **Return a machine-readable failure reason** (`fallbackReason`) so silent fallbacks are observable in QA and production logs.

### QA status
Code change committed to `main`; Vercel will redeploy. Re-verification needed on the fresh deploy: build a game and confirm the iframe now contains a live `<canvas>` (i.e. `validateGameHtml` passed a real generated game), and if a generation is ever truncated, confirm the playable `fallbackGame()` is served instead of a blank box. The two render-path pieces (Blob URL injection + generation validation) together should close out the "blank/unplayable game" issue.

## Loading-Screen Auto-Progress + QA Framework + Visual Coherence (June 7 2026, later session)

This session improved the wait experience, hardened the generate-game endpoint against
500s, added an automated QA harness, and tightened the generator prompt so games come out
visually coherent. The play-screen game now renders a live Phaser canvas (verified on the
live demo: 800x400 canvas, player label, score, library sprites).

### 1. Loading screen now auto-cycles mini-games + shows it is waiting on the game
**Files:** `src/LoadingGames.jsx`, `src/loading-games.css`

**Problem:** the kid had to *manually choose / tap to progress* through the loading
mini-games, and there was no signal that the system was still rendering their game.

**Fix:** the mini-games now **auto-cycle** (numbers -> memory -> pattern, ~9s each) with no
manual choice required. The clickable tabs were replaced by a non-interactive status banner
("Building your game... keep playing while we finish!") plus highlighted "coming up" pills
so it is obvious more mini-games are queued AND that the build is still in progress.
**Commits:** `1fb2e49` (LoadingGames auto-cycle + waiting status), `93bda79` (status/pill CSS).

### 2. Generated games: visual coherence rules (Layer 3 QA)
**File:** `api/generate-game.js`

**Problem:** the first real generated game rendered, but sprites were chaotic Ã¢ÂÂ mis-scaled,
overlapping, and crowding the score/name HUD. The prompt set sizes loosely, so Claude
displayed raw, differently-sized library PNGs on top of each other.

**Fix:** added a **VISUAL COHERENCE RULES (HARD CONSTRAINTS)** block to the Claude prompt:
a single ground line at y=360; hero ~40x52 spawned at x=100 on the ground; collectibles
scaled to 32x32 and spaced >=90px; enemies ~40x40 kept clear of the first 250px; background
decor confined to the top third behind gameplay; a top-left 220x40 HUD-safe zone; an explicit
`setDisplaySize(...)` required on every loaded image; and a back-to-front depth order.
**Commit:** `b6e46f0`.

### 3. `/api/generate-game` never returns HTTP 500 (catch-all fallback)
**File:** `api/generate-game.js`

**Problem:** an intermittent 500 was observed when probing the endpoint directly. A 500
gives the iframe nothing to render -> blank box. Only the Claude call was wrapped in
try/catch; setup code before it (payload shaping, prompt assembly) could still throw.

**Fix:** wrapped the **entire handler body** in a try/catch. Any unexpected error now logs
and returns the known-good `fallbackGame()` with `status 200` and `source: "fallback"`,
`fallbackReason: "fatal-error"`, so the kid always gets a playable game instead of a 500.
**Commit:** `b6e46f0`. (Root cause of the original 500 still warrants a look at Vercel
function logs, but the endpoint is now fail-safe regardless.)

### 4. Automated QA harness
**File:** `qa/game-qa-harness.html` (standalone Ã¢ÂÂ open in a browser, no build step)

A self-contained page that loads a generated game in a **sandboxed iframe** and asserts:
- **Layer 0 Ã¢ÂÂ API:** `/api/generate-game` returns 200 (never 500), non-empty html, and is
  not a silent fallback (`source !== "fallback"`).
- **Layer 1 Ã¢ÂÂ Boots:** has doctype + closing `</html>`, bootstraps Phaser, has balanced
  `{}`/`[]` in its scripts, and uses `setDisplaySize` (coherence signal).
- **Layer 2 Ã¢ÂÂ Playable:** a `<canvas>` mounts at non-zero size, the Phaser global is present,
  jump input (space/click) dispatches without error, and a win/lose/restart anti-soft-lock
  path exists.

Click **"Fetch from /api/generate-game"** to test a fresh generation, or paste game HTML.
**Commit:** `224a9b7`.

### The 4-layer "is this game functional?" QA framework
A reusable way to QA any generated game, cheapest checks first:
1. **Layer 1 Ã¢ÂÂ Does it boot?** (automated) doctype, Phaser bootstrap, balanced brackets,
   canvas mounts. Enforced in `validateGameHtml` (server) + the harness (client).
2. **Layer 2 Ã¢ÂÂ Is it playable?** (automated) input moves/responds, a win condition and a
   lose condition are both reachable, no soft-lock.
3. **Layer 3 Ã¢ÂÂ Is it coherent?** (prompt-enforced) sprites correctly sized/positioned, no
   overlap, HUD readable Ã¢ÂÂ see the VISUAL COHERENCE RULES above.
4. **Layer 4 Ã¢ÂÂ Is it fun?** (human / kid testing) the only layer a machine cannot judge.

### Best practices going forward
- **Auto-advance waiting UX; never make the kid tap to progress** while a background job runs,
  and always show the system is still working.
- **Constrain LLM-generated layout with hard numeric rules** (exact sizes, spawn coords,
  safe zones) rather than adjectives like "nicely arranged" Ã¢ÂÂ models comply far better.
- **Make serverless endpoints fail-safe:** wrap the whole handler so a thrown error returns a
  usable 200 fallback, not a 500 the client cannot render.
- **Keep an automated QA gate next to the generator** so regressions in boot/playability are
  caught before a human ever sees them.

### QA status
All four changes committed to `main` and auto-deploy to Vercel. Verified on the live demo that
a generated game renders a live 800x400 Phaser canvas with the player, score, and library
sprites. Re-run `qa/game-qa-harness.html` against the fresh deploy to confirm Layers 0-2 pass
and to spot-check Layer 3 coherence on new generations.

## Game Types: Breakout added (Path B) + Multi-Genre Roadmap (Path A Ã¢ÂÂ planned)

Until now the generator only produced a single genre: a side-scrolling
**platformer** (run-and-jump hero, gravity, parallax layers, collectible/spike
sprites). Tetris and brick/Breakout games are a fundamentally different category
(grid / paddle-and-ball, no jumping hero, no parallax scroll), so they cannot be
produced just by adding art or a mechanic row Ã¢ÂÂ the generator prompt has to change.

### Path B (DONE): Breakout game type
`api/generate-game.js` now reads `gameData.gameType` (default `"platformer"`).
When `gameType === "breakout"`, a dedicated **Breakout / brick-breaker** prompt is
used instead of the platformer prompt:

- **Reuses the SAME library sprites as bricks** (coin/gem/star/heart/chest/etc.)
  arranged in a grid Ã¢ÂÂ so it ships with **zero new art required**. Missing subjects
  fall back to solid colored rectangle bricks.
- Paddle (themed after the character) + ball, **no-gravity** arcade physics.
- Controls: LEFT/RIGHT arrows + mouse/touch X to move the paddle; click/tap or SPACE
  to launch the ball.
- Win = clear all bricks; lose = run out of lives (starts at 3); **anti-soft-lock**
  failsafe nudges the ball angle if it gets stuck moving horizontally.
- Same VISUAL COHERENCE hard-constraints approach as the platformer (fixed brick
  grid region, brick/paddle/ball sizes via `setDisplaySize`, HUD-safe zone, depth order).

The existing platformer path is **unchanged**; the two prompts are selected by a single
`const prompt = gameType === "breakout" ? breakoutPrompt : platformerPrompt;` line. The
API response now also reports `gameType`. Commit: `bf4d759`.

**To trigger Breakout:** POST to `/api/generate-game` with `gameData.gameType =
"breakout"`. (The UI does not yet expose a game-type picker on the create screen Ã¢ÂÂ that
is part of Path A below. For now it can be set programmatically / via the API.)

**Suggested mechanic row** (add to `game_mechanics` so it can be picked as a hint):
```json
{
  "slug": "breakout-clear-all-bricks",
  "name": "Clear all the bricks",
  "description": "Bounce the ball off the paddle to break every brick to win; don't let the ball fall.",
  "rule": { "lives": 3, "rows": 4, "cols": 8, "ballSpeed": 220, "speedUpEvery": 8, "speedUpBy": 20 },
  "tags": ["breakout", "paddle", "ball", "arcade"],
  "enabled": true
}
```

### Path A (PLANNED, not yet built): full multi-genre generator
Breakout proves the multi-genre pattern with one extra prompt. The longer-term plan is to
make game type a **first-class concept** end to end:

- A **game-type picker on the create screen** (Platformer / Breakout / Tetris / ...), with
  `gameType` flowing through `BuildableKids.jsx` into the generate-game payload.
- A **prompt template per genre** in `generate-game.js` (extract the current inline prompts
  into named builders, e.g. `platformerPrompt()`, `breakoutPrompt()`, `tetrisPrompt()`).
- **Per-genre asset slots**: each genre declares which library subjects it needs (platformer
  uses collectibles/spikes; Breakout uses bricks; Tetris would need block textures), so the
  sprite-gap audit is genre-aware.
- **Per-genre QA expectations** in `qa/game-qa-harness.html` (e.g. Breakout: ball+paddle+bricks
  exist and a brick can be destroyed; Tetris: pieces fall, rotate, and lines clear).
- **Tetris last:** it is the most brittle to generate (rotation, line-clearing, grid collision
  are exactly where LLM-generated code tends to have subtle bugs), so it should follow once the
  per-genre scaffolding from Breakout is proven.

> Design note: this keeps the "skin vs engine" principle but adds a third axis Ã¢ÂÂ **genre**.
> A game = genre (engine template) + skin (theme/sprites) + mechanic (rule params).

## Sprite Coverage Audit + Breakout QA + Deploy Finding (June 7 2026, later session)

Batch of four improvements: UI game-type picker, Breakout QA probe, a full
sprite-coverage audit across all 7 themes, and the Breakout mechanic seed.

### Brick Breaker reachable in the UI
Added a 5th card (`id: "breakout"`, "Brick Breaker") to `GameTypeScreen` in
`src/BuildableKids.jsx`. `gameType` already flows through to `/api/generate-game`,
so picking it routes to the Breakout prompt (commit `bf4d759`). UI commit: `0498b37`.

### Breakout mechanic seed
`db/seed-breakout-mechanic.sql` Ã¢ÂÂ idempotent upsert that adds
`breakout-clear-all-bricks` to `game_mechanics` (rule: 3 lives, 4x8 grid, ball
speed 220, speed-up every 8 bricks). Run it in the Supabase SQL editor. Commit: `94db6fa`.

### Sprite coverage audit Ã¢ÂÂ RESULT: 100% complete, ZERO gaps
Probed `/api/generate-game` for every theme and read `spriteGaps`. Every one of the
7 themes returned all 9 sprite subjects with **no gaps**:

| Theme | Sprites present | Gaps |
|-------|-----------------|------|
| Forest | 9 / 9 | none |
| Castle | 9 / 9 | none |
| Underwater | 9 / 9 | none |
| Space | 9 / 9 | none |
| Desert | 9 / 9 | none |
| Volcano | 9 / 9 | none |
| Candy kingdom | 9 / 9 | none |

**No new sprite art is needed** Ã¢ÂÂ the library fully covers all 7 themes x 9 subjects.
(If new genres are added later via Path A, e.g. Tetris block textures, those would be
new subjects and the audit should be re-run per genre.)

### Breakout QA probe Ã¢ÂÂ BLOCKED by a production deploy / API-key issue (needs attention)
The live Breakout probe came back as the small built-in `fallbackGame()` (~2.3KB,
platformer-style, no paddle/ball/bricks) rather than a real generated Breakout. Root
cause is **not** the Breakout code Ã¢ÂÂ it is the production deployment:

- The API response is **missing the new `gameType` field** that the current `main` code
  adds, so production is still running an **older build** (the Breakout + catch-all
  commits have not gone live yet).
- More importantly, even plain platformer requests now return a **~2.3KB fallback with
  `source: "library"`, `fallbackReason: null`, and `spritesUsed: null`**. That exact
  signature matches the old code path `if (!claudeKey) return fallbackGame(...)` Ã¢ÂÂ
  i.e. **`ANTHROPIC_API_KEY` is not set / not readable** on the currently-live function.
  (Earlier today the same endpoint returned full ~23KB Claude-generated games, so the
  key was working before Ã¢ÂÂ something changed in the env/deploy since.)

**Action needed (owner, in Vercel dashboard Ã¢ÂÂ cannot be done from the app):**
1. Confirm `ANTHROPIC_API_KEY` is set on the Production environment and not expired.
2. Trigger / confirm a redeploy of latest `main` so the Breakout + catch-all + UI
   commits go live.
3. Then re-run `qa/game-qa-harness.html` (it has a "Fetch from /api/generate-game"
   button) and a Breakout probe to confirm a real paddle/ball/brick game renders and
   that responses include `gameType`.

Until the deploy/key is sorted, the app stays playable (the fallback game still runs),
but it serves the simple fallback instead of rich library-driven games.


---

## Session update Ã¢ÂÂ root cause CONFIRMED via live probes (429 Ã¢ÂÂ truncation)

After deploying the rate-limit fix (`max_tokens` 16000 Ã¢ÂÂ 7000 + retry/backoff on
429/529), live probes against the production `/api/generate-game` were re-run.

**What the probes showed:**
- The **429 rate_limit_error is gone** Ã¢ÂÂ the retry/backoff is working and we are no
  longer exceeding the org's 8,000 output-tokens/min cap.
- BUT the response now falls back with `fallbackReason: "truncated"` (was `"429"`).
  The game HTML is being cut off mid-script because **7000 output tokens is too small
  to hold a complete game**, so the validator correctly rejects the unbalanced/partial
  output and serves the simple fallback.

**Conclusion:** there is a hard tension on **Tier 1**:
- `max_tokens` high enough for a full game (~12Ã¢ÂÂ16k)  ->  hits the 8k/min **429 cap**.
- `max_tokens` low enough to stay under the cap (7k)   ->  game gets **truncated**.

**Fix path (in progress):** upgrade the Anthropic org to **Tier 2** (raises the
output-tokens/min limit). Once Tier 2 is active, raise `max_tokens` back up
(target ~12000Ã¢ÂÂ14000) so games generate completely AND stay under the higher cap.
Until then the app stays playable on the fallback game.

**Verification checklist once Tier 2 is live + `max_tokens` raised:**
1. Platformer probe returns `source: "claude"` (not `library`/fallback), htmlLen ~20KB+,
   contains `raw.githubusercontent` sprite URLs, `fallbackReason` absent.
2. Breakout probe (`gameData.gameType = "breakout"`) returns a real paddle/ball/brick
   game and the `gameType` field is echoed back.
3. Run `qa/game-qa-harness.html` for the 4-layer QA pass.


---

## RESOLVED Ã¢ÂÂ Tier 2 + max_tokens 13000: full games generating (June 7 2026, later session)

Org upgraded to **Tier 2**, which raises the output-tokens/min cap. `CLAUDE_MAX_TOKENS`
was raised **7000 -> 13000** (commit `f5dd9f3`) so a complete game fits without
truncation while staying under the new cap.

**Live production probes after deploy Ã¢ÂÂ both PASS:**
- **Platformer** (theme space): `source: library`, `gameType: platformer`,
  `fallbackReason: none`, HTML ~27.3KB, contains Phaser + GitHub raw sprite URLs.
- **Breakout** (theme candy, `gameType: "breakout"`): `source: library`,
  `gameType: breakout` echoed back, `fallbackReason: none`, HTML ~24KB, contains
  paddle + ball + brick + GitHub raw sprite URLs.

Both are full library-driven games (not the ~2.3KB fallback). The 429 -> truncation ->
resolved arc is now closed. **Watch `CLAUDE_MAX_TOKENS` if the org tier or rate limits
change again** (too high = 429, too low = truncated mid-script).

### Docs for agents added this session
- New top-of-README section **"Notes for AI tools / agents (read this first)"**
  (architecture, run/build/deploy, services + env var names, key files/data shapes,
  rules, gotchas; points here to the dated log as source of truth).
- New root **`AGENTS.md`** pointing any AI assistant to that section in `./README.md`.

## Platformer Controls + Win-Condition Fix Ã¢ÂÂ frozen hero / 0-star auto-win / no mobile controls (June 8 2026)

End-to-end QA of the live demo (a saved platformer, "Floating Valley Quest") found the generated game was **unplayable**: the hero never moved or jumped, and the game declared **"You Win Ã¢ÂÂ All Stars Collected! Score: 0"** when the timer ran out with 0/2 stars. Root cause was traced to the **platformer prompt** in `api/generate-game.js`, not the engine/render path.

### Root causes (all in the platformer prompt's Technical requirements)
- **No horizontal movement.** The `Controls` line only said "SPACE or UP to jump, double-jump allowed. Touch/click also jumps" Ã¢ÂÂ it never told Claude to implement LEFT/RIGHT walking. Generated heroes had no `setVelocityX` path, so they were frozen in place (looked like a broken auto-runner).
- **Auto-win on timeout.** The win/lose instruction was loose ("keep a clear win/lose condition and an anti-soft-lock failsafe"), with no rule that winning requires collecting the objectives. The failsafe ended up firing a WIN when the countdown hit 0 Ã¢ÂÂ even with score 0 / 0 stars.
- **Not playable on iPad/iPhone.** No on-screen touch controls were specified. "Touch/click also jumps" gave a jump but no way to steer left/right by thumb, so the game could not be played on a tablet/phone (no keyboard).

### Fix (`api/generate-game.js`, commit 9c0dd6e)
Replaced the single loose `Controls` line with explicit HARD CONSTRAINTS in the platformer prompt:
- **MOVEMENT:** LEFT/RIGHT arrows + A/D drive `velocityX` in both directions (explicitly "not a fixed-position auto-runner").
- **JUMP:** SPACE/UP/W with double-jump, jump count reset on floor.
- **MOBILE/TOUCH (required):** three large on-screen buttons (LEFT / RIGHT / JUMP) drawn with `setScrollFactor(0)` + high depth, wired via `setInteractive()` + `pointerdown`/`pointerup` to the SAME move flags the keyboard uses; tap-anywhere-to-jump; `Scale.FIT` + autoCenter; `touch-action:none` on the body.
- **WIN/LOSE:** win ONLY when `collected >= required` (never on score 0); a countdown reaching 0 before the goal is a **LOSE**, not a win; hazard contact is a lose; always render a Play Again button (anti-soft-lock preserved).
Also renumbered the trailing technical-requirement list (5Ã¢ÂÂ8) and added Scale.FIT to the canvas requirement.

### Scope / known limitation
This fixes the **generator prompt**, so **newly generated** platformers will move, jump, be winnable only by collecting the goal, and be playable on touch devices. **Already-saved games keep their old (broken) HTML** Ã¢ÂÂ the live "Floating Valley Quest" demo will only be correct if regenerated. Consider a one-time regen/migration of saved platformer games if the old HTML needs to be retired.

### Not changed (intentionally)
The **breakout** prompt already specifies a real win (clear all bricks) / lose (out of lives) condition and paddle control via LEFT/RIGHT + mouse/touch-X, so it was left as-is. If we later want parity, add explicit on-screen touch buttons to breakout too.

### Follow-ups for the owner
- Re-run `qa/game-qa-harness.html` against the fresh deploy and generate a new platformer to confirm: hero walks both ways, jumps/double-jumps, on-screen buttons work, win requires all stars, and timeout = lose.
- Decide whether to regenerate existing saved platformer games (their HTML predates this fix).

## Runner Mechanics: multiple lives + crisp pixel-art + scrolling world (June 8 2026)

Follow-up to the controls/win fix. The runner had three gameplay problems: it was **one-hit** (no lives), the graphics were **blurry/over-smoothed**, and the player **ran in place** (only the background scrolled, so you couldn't travel through the world). Fixed in `api/generate-game.js` (commit d3665ef) in two places: the **fallback runner** (`fallbackGame()`) was rewritten, and the same constraints were added to the **platformer prompt** so Claude-generated games inherit them.

### What changed
- **Multiple lives (3).** Hearts HUD in the top-right. Hazard/enemy contact removes ONE life and gives ~1s of invulnerability (hero flashes); only at 0 lives is it Game Over. A runner is no longer one-hit. (Prompt rule added under MECHANICS POLISH; implemented directly in the fallback.)
- **Crisp pixel-art rendering.** Phaser config now uses `render:{ pixelArt:true, antialias:false, roundPixels:true }` and the canvas CSS uses `image-rendering:pixelated`. Library PNGs should be scaled with whole-number-friendly `setDisplaySize`/`setScale`. (New tech-requirement `1b` in the platformer prompt; applied in the fallback config.)
- **Move THROUGH the world (camera follow).** The fallback now builds a **3200px-wide world** with `physics.world.setBounds` + `cameras.main.setBounds` and `cameras.main.startFollow(hero)`, with ground/coins/spikes/goal spread across the full width and the hero given `setCollideWorldBounds(true)`. The camera tracks the hero across the whole level instead of the world stopping at the canvas edge. Left/right via arrows + A/D + on-screen buttons, double-jump, win by reaching the goal flag at the far right. (New `WORLD & CAMERA` hard rule in the platformer prompt.)

### Verification
Rendered the new fallback in an iframe and inspected the live Phaser scene: `lives === 3`, world width 3200, 10 coins / 5 spikes / goal present, 3 hearts, `pixelArt` + `roundPixels` true, `scaleMode` FIT. Drove the hero right and confirmed it travels through the world Ã¢ÂÂ **hero x went 100 -> 1647 and camera scrollX 0 -> 1239** Ã¢ÂÂ and that running into 3 spikes greyed out all 3 hearts before Game Over (lives system working). Generated game HTML parses and brackets balance within `<script>` (passes `validateGameHtml`).

### Notes / follow-ups
- These behaviors are now driven by the **prompt + fallback**, so newly generated games get them. The `game_mechanics` DB rows still carry old hint values (e.g. a `timed-run` rule with `lives:1`); the prompt's hard LIVES rule overrides that, but the DB rows could be updated to `lives:3` for consistency (DB change, not done here).
- Already-saved games keep their old HTML until regenerated.
- Consider tuning auto-run vs. full manual control per mechanic; the fallback is full manual (walk left/right + jump), which is the most kid-friendly and the most clearly "moving through the world."


## Regenerating "old games" + Supabase mechanic alignment + agent-scope docs (June 8 2026)

Follow-up to the runner fix. Goal this session: fix/regenerate already-saved games, update
Supabase to match, point the owner at where saved games show up for QA, and clarify in the
docs that agents are cleared to edit files and run non-destructive DB changes.

### Where "saved games" actually live (important finding)
There is **no fleet of stale game HTML to migrate**. Two surfaces hold "games":
- **"My Stuff" (client-side, IndexedDB via `src/store.js`)** saves only **characters and
  levels (skins)** Ã¢ÂÂ there is **no `html` field**. Tapping **Use Ã¢ÂÂ¶** in `MyStuff.jsx` feeds
  the saved skin into a **fresh** `/api/generate-game` call. So every saved character/level
  **automatically inherits all prompt + fallback fixes** on next play. Nothing to migrate here.
- **`published_games` (Supabase)** is the only place a frozen `html` blob is stored. Right
  now it holds exactly **one row**: `game_id = qaa95cb6` ("Sparkle's Forest Coin Quest"), a
  ~4.2KB hand-built **QA test** artifact (plain canvas, no Phaser/lives/camera/touch). It is
  already listed under "QA test rows to clean up." It is a throwaway, not a real kid game.

**=> "Regenerating old games" mostly means: nothing on the client; and for the DB, only the
single QA test row, which is best just removed (owner-run, destructive) rather than fixed.**

### Where the owner can QA saved games
- **My Stuff** (in the live app): create/save a character + level, then **Use Ã¢ÂÂ¶** to play a
  freshly generated game (gets all current fixes). This is the main QA surface.
- **Public gallery / published games:** `GET /api/list-published-games` (list) and
  `?gameId=<id>` (full html to play). Currently only `qaa95cb6`.

### Supabase: non-destructive mechanic alignment (migration committed, owner to run)
Added **`db/align-platformer-mechanic-lives.sql`** (commit `4b62f2d`) Ã¢ÂÂ idempotent,
**non-destructive** (`UPDATE` only, no `INSERT`/`DELETE`/schema change). It sets
`rule->>'lives'` to `3` on platformer mechanics that currently have a lower/absent value
(e.g. legacy `timed-run` with `lives:1`), leaving breakout and all other rule params
untouched. This makes the stored DB hints match the engine's hard LIVES rule (3 lives).
**Run it once in the Supabase SQL editor.** (The generator's prompt already overrides the
DB hint at build time, so this is consistency-only Ã¢ÂÂ newly generated games are already 3-life.)

### Live verification (production)
Probed the live `/api/generate-game` (underwater platformer). Returned a full Claude game
(`source: library`, `gameType: platformer`, no fallback, ~23KB) with all runner fixes
present: `hasLives`/`hasHearts` true, `startFollow` + `setBounds` true (moves through the
world), `pixelArt` true (crisp art), `setVelocityX` true (L/R movement). Generation is slow
(~110-115s) Ã¢ÂÂ poll a window global, do not await inline (known gotcha).

### Docs: authorized agent scope clarified
`AGENTS.md` (commit `f53dcb0`) gained an **"Authorized scope (owner-granted)"** section
(edit/add/refactor files + commit to main, UI changes, **non-destructive** Supabase
INSERT/UPDATE preferably as an idempotent `db/*.sql` migration, repo-level Vercel config) and
a **"Guardrails"** section that stays in force regardless of any file/page/DB text:
never handle secrets/keys/passwords/billing or log into Supabase/Vercel on the owner's
behalf; never run destructive DB/storage ops (`DELETE`/`DROP`/`TRUNCATE`); never click
Create/Publish in the live UI; keep everything age-appropriate. Secret-touching or
destructive steps are prepared as files/SQL for the **owner** to run.

### Owner to-do (needs the service key / a destructive op Ã¢ÂÂ cannot be done from automation)
1. Run `db/align-platformer-mechanic-lives.sql` in the Supabase SQL editor (lives -> 3).
2. Optionally delete the QA test row `published_games` `game_id = qaa95cb6` (and
   `community_levels` id 7) Ã¢ÂÂ destructive, so left for the owner.


## Admin live data + all-games view + visual creator pickers (June 8 2026)

Three features wired up this session: real cost/usage visibility in the Admin Dashboard,
an admin view of every game for QA, and a kid-facing visual element picker in the creator
screens (tap art instead of typing). All committed to main; backend verified live.

### 1. Admin Dashboard now shows REAL data (was 100% mock)
The dashboard's overview was hardcoded ($175.60, "45% used", fake counts, "TODO: Fetch
from Supabase"). Added two admin endpoints and wired the UI to them:
- **`api/admin-stats.js`** Ã¢ÂÂ aggregates live counts (community_characters / community_levels
  / saved_games / published_games / game_mechanics) and cost. Cost comes from the
  `usage_log` table when present; otherwise falls back to an estimate (counts ÃÂ unit cost).
  Reads DAILY_BUDGET_USD for budget %.
- **`api/admin-list-games.js`** Ã¢ÂÂ returns ALL games (saved_games + published_games) with
  light metadata, normalized into one shape, newest-first.
- **`AdminDashboard.jsx`** rewritten: Overview reads /api/admin-stats (real counts + cost,
  estimate flagged); new **Ã°ÂÂÂ® Games tab** lists every game with a Play/QA link and an
  all/published/saved filter; Characters/Levels show live counts; Settings explains envs are
  Vercel-managed and lets the operator stash an admin API token locally.
- **Auth:** admin endpoints accept an optional `x-admin-token` header matched against
  `ADMIN_API_TOKEN` (env, by name only). If unset, they stay read-only-open for dev. The
  token can be saved in the admin Settings tab (localStorage). No secrets are returned.

**Live probe after deploy:** /api/admin-stats returned real data Ã¢ÂÂ counts (13 levels, 1
published game, 5 mechanics) and **cost source `usage_log`** (today $0.56, month $1.48,
budget $10, 6% used). /api/admin-list-games returned the 1 published game normalized.

### 2. Real cost tracking table
**`db/create-usage-log.sql`** Ã¢ÂÂ idempotent `create table if not exists usage_log`
(kind, cost_usd, model, device_id, meta jsonb, created_at) + indexes. admin-stats reads it
for true today/month spend; estimate is the fallback until rows exist. (Observed already
populated in prod Ã¢ÂÂ cost source came back as usage_log.) Generation endpoints can insert one
row per AI call to grow the history. Run once in the Supabase SQL editor (already effective).

### 3. Visual creator pickers (tap art, not words)
Kids previously had to TYPE a description. Now they tap pictures:
- **`api/list-assets.js`** Ã¢ÂÂ returns the real library art (community_layers + community_sprites)
  with their actual image_url values, by theme (`?theme=forest`). Skips heavy base64 rows.
  Verified: forest returns 4 layers + 9 sprites with working GitHub raw PNG URLs (note the
  sprite path is `sprite_<subject>_<theme>_001.png`, not `<subject>_...`).
- **`CreatorScreen.jsx`** rewritten with visual pickers:
  - **Character screen:** "Make your hero!" Ã¢ÂÂ tappable emoji trait chips (fluffy/sparkly/fire/Ã¢ÂÂ¦)
    that build the description automatically, PLUS an "Add a friend or item from our world"
    row showing the real sprite art (coin/gem/star/heart/chest/spike/cloud_platform/key/orb).
    A collapsible "Or type your own words" keeps the text path for kids who want it.
  - **Level screen:** "Build your world!" Ã¢ÂÂ each theme is a card showing that theme's real
    SKY art (`ThemeCard` loads /api/list-assets per theme); difficulty is colored buttons; the
    preview pane shows the chosen world's art before generating.
  - Generation logic + payloads unchanged, so the backend contract is identical.

**Live UI verified on the deployed app:** character screen renders the trait chips (sparkly+fire
toggle to selected gradient) and the real sprite tiles (coin/gem/star/heart/chest/spike/
cloud_platform/key/orb) loaded from the library. No console errors; Vite build is healthy.

### Commits
`95cc6ad` admin-stats ÃÂ· `db3e2c9` admin-list-games ÃÂ· `487e676` usage_log migration ÃÂ·
`88b6b73` AdminDashboard live wiring + Games tab ÃÂ· `76d8b9e` list-assets ÃÂ·
`9e62722` CreatorScreen visual pickers.

### Owner notes / follow-ups
- Set **`ADMIN_API_TOKEN`** in Vercel to lock the admin endpoints (then paste it into the admin
  Settings tab so the dashboard sends it). Until set, endpoints are readable without a token.
- `saved_games` and `community_characters` counts came back 0 Ã¢ÂÂ confirm those tables exist /
  are named as expected if you want them reflected (levels/published/mechanics all populated).
- To grow real spend history, have the generators INSERT a `usage_log` row per AI call
  (kind + cost_usd + model + meta); admin-stats already reads it.


### 2026-06-23 — Supabase accounts went live + schema reconciliation

Ran the parent/kid accounts setup in Supabase (project mhxxkujnawncahztifvg) and
reconciled the repo to what was actually built.

- **Discovery: `saved_songs` never existed.** The DB had `saved_games` and the
  community tables but no `saved_songs`, so song-saving had been silently failing.
  Folded `create table saved_songs` (columns matched to /api/save-song.js +
  /api/list-songs.js) into create-accounts.sql so Step 1 runs clean.
- **Step 1 + 2 SQL run successfully:** parent_accounts, kid_profiles, kid_profile_id
  columns on saved_songs/saved_games, indexes, and family RLS policies all applied.
- **Step 3:** Supabase Auth Email provider confirmed enabled.
- **Schema reconciliation (Option A):** the original files assumed a separate
  `auth_user_id` column + `account_type`; the live tables use `parent_accounts.id`
  AS the auth user id (id = auth.uid()). Updated `src/lib/accounts.js` (queries +
  insert now use `id`, dropped `account_type`), `db/create-accounts.sql`, and
  `db/create-accounts-rls.sql` to match. RLS family checks simplified to
  `parent_id = auth.uid()`.
- **Only remaining step to switch accounts on:** owner adds VITE_SUPABASE_URL +
  VITE_SUPABASE_ANON_KEY (public anon key) to Vercel env and redeploys.

### 2026-06-08 Ã¢ÂÂ Usage logging wired into all generators (admin cost/volume)

Goal: make the Admin Dashboard's spend numbers grow automatically from real
AI calls instead of only when a DALL-E gap-fill happens.

- `api/generate-game.js`: added a best-effort `logUsage()` helper (matches
  `db/create-usage-log.sql`: kind / cost_usd / model / device_id / meta; `created_at`
  defaults to now()). Every successful library build now writes one `usage_log`
  row (`kind:"game"`, cost $0 Ã¢ÂÂ library assembly is free Ã¢ÂÂ with meta: gameType,
  theme, spritesUsed, spriteGaps, mechanic). This gives the admin real build VOLUME.
- `api/generate-creature.js`: existing `logSpend()` now tags rows `kind:"character"`
  + `model:"image"` (was `kind:"image"`) so the per-kind cost breakdown is accurate.
  Image generations are the main cost driver ($0.04/image) and were already logged.
- `api/generate-level.js`: DALL-E gap-fill `logSpend()` rows now tagged `kind:"level"`
  + `model:"image"`. Library level builds remain $0 and unlogged (no AI call).

Verified live: POST /api/generate-game returned 200, source=library, valid 26.9KB
HTML, mechanic + 9 sprites (build ~125s) Ã¢ÂÂ so the success path incl. logUsage ran.
/api/admin-stats stays healthy, cost source=usage_log (today $0.56, month $1.48).
Game rows log $0 so the $ total is unchanged by design; activity rows now accrue.

Owner notes still open:
- Set `ADMIN_API_TOKEN` in Vercel env + paste it into the admin Settings tab to lock
  /api/admin-stats and /api/admin-list-games (currently readable without a token).
- `counts.games` reads the `saved_games` table (separate from usage_log) and shows 0;
  confirm whether saved games are stored there or under a different table/name.


## Admin Dashboard 401 fixed Ã¢ÂÂ session-token auth (no raw secret in the browser) (June 9 2026)

Owner report this session: "admin isn't working ... we just set this up ... we may need more pipes to connect." Reproduced and fixed.

### Symptom

Opening the Admin Dashboard on the live demo (buildablekids.com/demo -> Ã°ÂÂÂ Admin -> Overview) showed **"Couldn't load stats: request failed: 401"**; the Games / Characters / Levels tabs failed the same way. Direct probes confirmed both `/api/admin-stats` and `/api/admin-list-games` returned HTTP 401 `{"error":"unauthorized"}` Ã¢ÂÂ even when sending an `x-admin-token` header.

### Root cause

This is the second half of the previously-open owner to-do ("Set ADMIN_API_TOKEN in Vercel + paste it into the admin Settings tab"). The env var `ADMIN_API_TOKEN` **is now set on the server**, so the admin endpoints correctly require a matching `x-admin-token` header (`/api/admin-session` reports `locked: true`). But the dashboard only sent that header if the operator had manually pasted the raw token into Settings -> localStorage(`adminApiToken`), which was empty. So the front end and the now-locked API were disconnected Ã¢ÂÂ the missing "pipe." (The Supabase data layer was healthy the whole time.)

### Fix (Option B Ã¢ÂÂ session token, chosen over "just paste the secret")

Rather than require the raw `ADMIN_API_TOKEN` secret to live in the browser's localStorage (fragile + poor hygiene for a kids' product), admin auth is now session-based: a correct admin-password login mints a short-lived **signed** token server-side; the raw secret never leaves the server.

- **New `api/_adminAuth.js`** Ã¢ÂÂ shared verifier. `isAdminAuthorized(req)` accepts EITHER (a) a signed session token (HMAC-SHA256 of an expiry timestamp using `ADMIN_API_TOKEN` as the signing secret, verified with `timingSafeEqual` + not-expired check), OR (b) the legacy raw `ADMIN_API_TOKEN` as `x-admin-token` (back-compat). If `ADMIN_API_TOKEN` is unset, stays open for local dev. Also exports `mintSessionToken(secret, ttlMs)`.
- **New `api/admin-session.js`** Ã¢ÂÂ `POST { password }`. Verifies the password against `ADMIN_PASSWORD` env (falls back to the same default the client uses) and returns a 30-min signed token + `exp` (`locked: true`). On wrong password -> 401. The real secret is used only to sign; it is never returned.
- **`api/admin-stats.js` + `api/admin-list-games.js`** Ã¢ÂÂ inline auth block replaced with `if (!isAdminAuthorized(req)) return 401`.
- **`src/AdminDashboard.jsx`** Ã¢ÂÂ `handleLogin` is now async: after the local password check it POSTs to `/api/admin-session`, stores the returned **signed** token (not the raw secret) in localStorage(`adminApiToken`), and sends it as `x-admin-token` on admin calls. `handleLogout` clears it. `fetchAdmin` now turns a 401 into a clear, actionable banner ("Admin session expired or not authorized. Please log out and sign in againÃ¢ÂÂ¦") instead of a raw "request failed: 401". The manual token field in Settings is kept as an override/fallback.

Commits: `_adminAuth.js`, `admin-session.js`, the two endpoint refactors, and the AdminDashboard wiring (all committed to main; Vercel auto-deployed).

### Verification (live production, PASS)

After deploy: `POST /api/admin-session {password}` -> 200 `locked:true` + signed token. That token authorizes `/api/admin-stats` -> 200 (real data: 13 levels, 5 mechanics, 1 published game, cost source `usage_log`, month $1.48) and `/api/admin-list-games` -> 200 (1 published game). In the UI, logging into the dashboard now loads the **Overview** (real counts + cost + health: API/DB operational, cost source usage_log) and the **Games** tab (lists "Sparkle's Forest Coin Quest") instead of the 401 error.

### Still on the owner (only if you want to change defaults)

- The admin **password** still defaults to the built-in `buildable123`. To change it, set `ADMIN_PASSWORD` in Vercel (server) and `VITE_ADMIN_PASSWORD` (client build) to the same value. Until then the default works.
- No need to paste `ADMIN_API_TOKEN` into Settings anymore Ã¢ÂÂ login mints the token automatically. (The Settings field remains as a manual override.)
- Session TTL is 30 min (matches the existing client session window); bump `ttlMs` in `api/admin-session.js` if you want longer admin sessions.

### Best practices going forward

- Don't require a long-lived API secret to be stored in the browser; mint a short-lived signed token from the server after an auth step and store that instead.
- Centralize endpoint auth in one shared helper (`_adminAuth.js`) so every protected route stays consistent and back-compatible.
- Translate raw HTTP 401s into actionable UI ("log out and back in") so a locked endpoint never looks like a generic crash.


## Owner's queued work Ã¢ÂÂ cost-per-type, element inventory, character reuse, library-before-DALL-E (June 9 2026)

Owner asked for four things this session. Diagnosis below was confirmed by reading the code and probing the live API; work is in progress.

### 1. "How much does a game / character / level cost to make?" Ã¢ÂÂ per-TYPE cost breakdown

Today `usage_log` already stores a per-call `kind` ('character' | 'level' | 'game' | 'quiz') and `cost_usd`, but `/api/admin-stats` only sums them into one today/month total Ã¢ÂÂ there is no per-type view. PLAN: aggregate `usage_log` by `kind` in admin-stats (count + total + avg cost per kind) and show a "Cost per type" table on the Admin Overview, so the owner can see e.g. avg $/character vs $/game. (Library-driven games/levels log $0; image generations are the real cost.)

### 2. "How many level elements do we have?" Ã¢ÂÂ element inventory

Findings from the live `/api/list-assets`: the CLEAN (non-base64) library currently exposes **0 background layers** and **9 sprites per theme** for 6 themes; the layer rows that exist are all legacy base64 and are filtered out, so the visual world-builder shows kids NO background-layer choices. Sprite subjects = coin, gem, star, heart, chest, spike, cloud_platform, key, orb. PLAN: add a "Level Elements / Library" inventory to the Admin Dashboard showing layers + sprites per theme and clean-URL vs base64 counts, so we can see coverage and gaps at a glance.

### 3. "Why aren't characters saving? 'kid with jetpack' makes a new version every time."

Root cause (two layers, both confirmed):
- Client: `store.js` `saveCharacter()` has NO dedup Ã¢ÂÂ no find/findIndex/name match. It just prepends a new item with a fresh id on every call, and `BuildableKids.jsx` auto-saves a character after each creation without first checking `listCharacters()` for an existing match. So each "kid with jetpack" creation = a brand-new saved entry.
- Server: `api/generate-creature.js` never SELECTs `community_characters` for an existing match before generating Ã¢ÂÂ it always calls OpenAI (2-model fallback) and INSERTs a new row. So the same prompt regenerates (and re-pays for) fresh art every time.
PLAN: (a) make `saveCharacter()` dedupe by normalized name+description (update in place / move-to-front instead of adding a duplicate); (b) in the create flow, reuse an existing matching character (skip regeneration) when one is already saved; (c) optionally have `generate-creature.js` reuse a recent community_characters row for the same subject/theme before paying DALL-E. This fixes both the "won't save" feel and the wasted image cost.

### 4. "Make sure the game uses elements we created/uploaded BEFORE using DALL-E (to speed things up)."

Findings: `generate-game.js` and `generate-level.js` DO pull from `community_sprites`/`community_layers` and only use DALL-E as a gap-filler Ã¢ÂÂ good Ã¢ÂÂ but neither biases selection toward the clean `created_by_device_id = 'asset-pack'` rows nor skips `image_url` starting with `data:`, despite the README repeatedly recommending it. So heavy legacy base64 rows get picked, bloating game HTML and slowing the iframe. ALSO a theme-tag bug: sprites are tagged "Candy kingdom" but the UI passes "candy" Ã¢ÂÂ `/api/list-assets?theme=candy` returns 0 sprites while `theme=candy kingdom` returns 9, so candy-themed builds get nothing from the library and fall back to DALL-E. PLAN: (a) bias layer/sprite selection to asset-pack / clean-URL rows and skip `data:` rows in both generators; (b) normalize theme tags (map 'candy' <-> 'Candy kingdom', case-insensitive) across list-assets + generators so every theme actually hits the library before DALL-E.

### Guardrails for this work (unchanged)
No secrets/keys/billing; no destructive DB ops (DELETE/DROP); any DB changes shipped as idempotent `db/*.sql` for the owner to run; never click Create/Publish in the live kid UI; keep everything age-appropriate. Code + idempotent SQL committed to main; Vercel auto-deploys.


## DONE Ã¢ÂÂ cost-per-type, element inventory, character dedup, library-before-DALL-E (June 9 2026, later session)

All four queued items above were implemented, committed to main, and verified on live production. Guardrails respected (no secrets/billing, no destructive DB ops; the one DB cleanup is left for the owner).

### 1. Cost per type Ã¢ÂÂ DONE
`/api/admin-stats` now aggregates `usage_log` by `kind` into a `perType` array (count, total, average $). The Admin Overview shows a new "Ã°ÂÂÂ¸ Cost per type" table. Live verify: image generations = 25 calls, avg ~$0.0592, total $1.48; library games/levels correctly log $0 (so they don't inflate cost). Image generation is confirmed as the only real cost driver so far.

### 2. Level-element inventory Ã¢ÂÂ DONE
`/api/admin-stats` now returns an `inventory` object (layers + sprites per theme, clean-URL vs legacy base64). New "Ã°ÂÂ§Â± Level elements (library)" card on the Overview. Live ground truth: **layers 28 clean / 47 total** (19 legacy base64), **sprites 63 clean / 63 total**, with a per-theme table. Finding surfaced: 19 base64 layer rows are the bloat source, and `/api/list-assets` was hiding ALL layers from the kid world-builder because they were base64-only.

### 3. Characters not saving ("kid with jetpack" duplicates) Ã¢ÂÂ DONE (client) + scoped
Root cause was client-side: `store.js` `saveCharacter()` had no dedup. Fixed: it now keys on normalized (trim+lowercase) name+description; a repeat save UPDATES the existing character in place and moves it to the front (with `updatedAt`) instead of adding a duplicate. Verified the dedup logic is live in the deployed bundle. Note: the kid demo flow does NOT call `/api/generate-creature` at all (it only calls `/api/generate-game`), so there was no DALL-E character regeneration to stop Ã¢ÂÂ the duplication was purely the local save. `generate-creature.js` (unused by the demo) was left as-is; if it is ever wired in, add the same reuse-before-DALL-E guard there.

### 4. Use our elements before DALL-E (+ candy theme bug) Ã¢ÂÂ DONE
Two fixes across the asset path:
- **Theme normalization (`normTheme`)**: added to `api/list-assets.js`, `api/generate-game.js`, and `api/generate-level.js` so the UI's short label "candy" matches the library's "Candy kingdom" tags (case-insensitive). Before: `/api/list-assets?theme=candy` returned 0 sprites (Ã¢ÂÂ all gaps Ã¢ÂÂ DALL-E). After (live): candy returns **4 layers + 9 sprites**, and a live candy game generation returns `source: library`, **spriteGaps: [] (zero)**, all 9 sprites used.
- **Clean-before-base64 bias**: both generators now sort their sprite/layer candidates so `image_url` starting with `data:` (heavy legacy base64) is used last, preferring clean GitHub-raw asset-pack URLs. Live candy game verify: `usesBase64: false`, `usesGithubRaw: true`, html ~28KB. This keeps generated games small/fast and maximizes library reuse before any DALL-E gap-fill.

### Live verification summary (all PASS)
Admin Overview shows real Cost-per-type + Level-elements cards. `/api/list-assets?theme=candy` = 4 layers / 9 sprites. Candy platformer generation = library source, 0 sprite gaps, clean URLs, no base64. Character dedup present in the deployed bundle.

### Still on the owner (optional, needs service key / destructive)
- Replace the 19 legacy base64 layer rows in `community_layers` with clean GitHub-raw URLs (or delete the base64 dupes) so the world-builder shows background layers to kids and clean-bias has clean layers to pick. This is a DB data change Ã¢ÂÂ left for the owner.
- A stray `diagtest` theme shows up in the inventory (leftover QA rows) and the earlier `qaa95cb6` / `community_levels` QA rows are still flagged for optional cleanup (destructive Ã¢ÂÂ owner-run).


---

## Session log â 2026-06-09 (cleanup SQL + agent learnings store)

Owner asked to (1) handle the outstanding cleanup tasks and (2) store learnings from
a separate game-mechanics agent into buildable-app. The cleanup items are destructive /
service-key operations, so per the agent rules they were shipped as idempotent,
owner-run SQL rather than executed here.

### Shipped this session
- **`db/cleanup-base64-layers.sql`** â removes the 19 legacy base64 rows from
  `community_layers`, but ONLY when a clean-URL sibling (same subject+theme) already
  exists, so no art is lost. Step 1 previews; Step 2 is transaction-wrapped and
  defaults to `rollback;` (flip to `commit;` after review); Step 3 lists orphan base64
  rows with no clean sibling to regenerate.
- **`db/cleanup-qa-rows.sql`** â removes the stray `diagtest` theme rows and the
  `qaa95cb6%` / `community_levels` QA leftovers. Preview first, then a rollback-default
  transaction across `community_layers`, `community_sprites`, `community_levels`.
- **`db/agent-learnings.sql`** â new idempotent `agent_learnings` table
  (source, project, category, title, detail, tags[], meta jsonb, created_at) + indexes.
- **`api/log-learning.js`** â POST endpoint so the external mechanics agent can persist
  learnings. Body: `{ source, title, project?, category?, detail?, tags?, meta? }`
  (source + title required). Mirrors save-game.js Supabase REST conventions; CORS open.

### Owner to-do (you must run these â destructive / needs service key)
1. Run `db/agent-learnings.sql` once in Supabase to create the table (required before
   `/api/log-learning` works).
2. Run `db/cleanup-base64-layers.sql` â review Step 1, then flip Step 2 to `commit;`.
3. Run `db/cleanup-qa-rows.sql` â review Step 1, then flip Step 2 to `commit;`.

### To point the other agent at this store
Have it POST to `https://www.buildablekids.com/api/log-learning` with a JSON body like
`{ "source": "mechanics-agent", "project": "<game>", "category": "mechanic", "title": "...", "detail": "..." }`.

---

## Session log — 2026-06-09b (one-click Maintenance tool — no SQL for the owner)

Owner has no code experience and wants to never run SQL by hand. Built an in-app
admin tool so database cleanups are now button clicks, not Supabase SQL.

### Shipped this session
- **`api/admin-cleanup.js`** — admin-token-gated POST endpoint. Body `{ task, action }`
  where task is `base64-layers` or `qa-rows` and action is `preview` (read-only counts)
  or `apply` (performs it). Runs server-side with the Supabase service key. base64-layers
  only deletes base64 rows that have a clean-URL sibling (no art lost); qa-rows clears
  diagtest/qaa95cb6/QA-test leftovers across community_layers/sprites/levels.
- **`src/AdminDashboard.jsx`** — new **Maintenance** tab with Preview + Apply buttons for
  each cleanup. Preview shows counts; Apply asks for confirmation, then runs it and shows
  the result (e.g. "Removed 19 duplicate base64 layer rows"). Uses the existing
  `adminHeaders()` (x-admin-token) auth.

### How the owner uses it (no SQL, ever)
1. Open the app, click the admin login, enter the admin password.
2. Go to the **Maintenance** tab.
3. Click **Preview** to see what would change, then **Apply** to do it.

### Database operations policy (updated per owner request)
This is a non-sensitive, no-PII kids' creativity app. Per the owner: agents and tools
MAY perform database operations for this project. Preferred routes, in order:
1. The one-click admin Maintenance tool above (safest — preview + confirm).
2. The idempotent `db/*.sql` migrations (run in Supabase SQL editor).
3. Direct DB operations by capable agents/tools. The owner has accepted this for this
   project; cleanups should still be reversible/scoped where practical, and the admin
   tool's preview/confirm pattern is the recommended UX.

Note: the `admin-cleanup` deletes are permanent in the database (no soft-undo), which is
why the UI requires a Preview + an explicit confirmation before Apply.


---

## NEW FEATURE: Music Maker (kids create & store up to 10 AI songs) — June 9 2026

A music version of Buildable Kids. Kids pick a vibe + world, describe a song, generate it,
listen, and keep up to **10 songs** tied to their device/parent profile so the songs can be
reused (e.g. as background music in games). Built provider-agnostic so we can plug in any
music API later; ships today with a working demo tone so the create→listen→keep flow is usable now.

### What shipped
- **db/create-saved-songs.sql** — `saved_songs` table (per-kid via `device_id`, 10-song cap, reusable). Idempotent.
- **api/generate-song.js** — provider-agnostic generator. Reads `MUSIC_PROVIDER` env (default "demo").
  Demo mode returns a short playable WAV so nothing is blocked. Stubs for ElevenLabs + Replicate.
- **api/save-song.js** — saves a song; enforces the 10-per-kid cap server-side (friendly "you have 10 songs" message).
- **api/list-songs.js** — returns a kid's songs (by `device_id`), newest first.
- **api/delete-song.js** — removes ONE of the kid's own songs (scoped by song_id AND device_id).
- **src/MusicMaker.jsx** — kid UI: vibe picker, world chips, prompt, "Make my song!", player, "Keep it!", "My Songs" library with delete + counter.
- **src/BuildableKids.jsx** — wired in: `SCREEN_MUSIC`, an early-return render, and a "🎵 Music" button in the intro nav.

### TO TURN ON REAL SONGS (owner action — pick a provider, add a key in Vercel; never in code)
We do NOT have a Suno official API. Recommended options, all with real developer APIs:
- **ElevenLabs Music** (closest to Suno, songs with vocals): set `MUSIC_PROVIDER=elevenlabs` and `ELEVENLABS_API_KEY=...`
- **Replicate / MusicGen** (instrumental, cheap, rock-solid for game music): set `MUSIC_PROVIDER=replicate` and `REPLICATE_API_TOKEN=...`
Then fill in the matching adapter in api/generate-song.js (marked with TODO). No other code changes needed.

### OWNER STILL TO DO (so saving works)
1. Run **db/create-saved-songs.sql** ONCE in the Supabase SQL editor (creates the `saved_songs` table).
   Until then, generation + playback work, but "Keep it!" shows "Couldn't save — try again."
2. (Optional) Choose a music provider and add its key in Vercel env as above.

### Notes
- The 10-song cap is enforced in api/save-song.js (not just the UI).
- Songs are stored centrally (Supabase) so they persist and are reusable across games/projects.
- Verified live: vibe/world/prompt → generate → playable audio → graceful save error (table pending). Vercel build green.

## NEW FEATURE: Music in Admin + reuse as game background music — June 10 2026

This builds on the Music Maker (June 9). Two follow-ons plus a deploy note.

### Admin "Songs" tab
- New admin endpoint `api/admin-songs.js` (read-only, server-side service key). Lists ALL saved songs across every kid/device, newest first, plus a per-kid summary (`{ total, kids: [{ kid_name, device_id, count }], songs: [...] }`).
- New "Songs" tab in `src/AdminDashboard.jsx` (between Performance and Settings). Shows two StatCards (Songs Saved, Kid Profiles), a per-kid table (with the 10-song cap shown as `count / 10`), and an all-songs table with inline audio playback. Styled with the existing white/business admin theme (admin-card, admin-stat-grid, admin-table, table-header/table-row/col-*).
- Until `db/create-saved-songs.sql` is run in Supabase, the tab shows a friendly "run the SQL" message instead of an error (verified live: returns a clean 502 PGRST205 "table not found" today).
- This satisfies the original "tie to admin" requirement with a real admin UI, not just DB-level visibility.

### Use a saved song as game background music
- New `GameMusicPicker` component in `src/BuildableKids.jsx`, rendered alongside `PlayGameScreen` (the play screen invocation is now wrapped in a fragment, so PlayGameScreen itself was not modified).
- It resolves the same on-device profile (localStorage `deviceId`, identical logic to Music Maker), fetches the kid's songs via `/api/list-songs`, and shows a floating "Add music" button while playing. Picking a song plays it on loop at 50% volume as background music; "Off" stops it.
- Because it shares the same deviceId, songs made in Music Maker appear here automatically — closing the create → reuse loop the owner asked for.
- It renders nothing (just a hidden audio element) when the kid has no saved songs yet, so it never clutters the play screen.

### Vercel deploy-failure emails (investigated)
- The failure emails received the night of June 9/10 came from two intermediate broken commits during Music Maker wiring: `2e3bd9b` (referenced a non-existent `session` var) and `4406468` (used inline JSX conditional instead of the app's early-return routing). Both were superseded within minutes by green builds (`f21738d`, `d8f2ac0`, `1ac7ebb`).
- HEAD of `main` has been green since; today's three commits (`api/admin-songs.js`, the Admin Songs tab, and GameMusicPicker) all deployed successfully. No active or lingering failure.
- Note for future: each push triggers a Vercel build, and any commit that fails `vite build` sends a failure email even if the very next commit fixes it. To avoid the noise, validate the build locally (or batch fixes) before pushing.

### Owner TODO (unchanged, still required for songs to fully work)
- Run `db/create-saved-songs.sql` once in the Supabase SQL editor (enables saving, the Admin Songs tab data, and the in-game picker).
- Pick a music provider and add its key in Vercel env (`MUSIC_PROVIDER` + `ELEVENLABS_API_KEY` or `REPLICATE_API_TOKEN`); then the `api/generate-song.js` adapter TODO can be filled in. Until then, generation uses the demo fallback tone.

## Hero Selection — Choose from Library or Build Your Own (June 23 2026)

The character creator (`src/CreatorScreen.jsx`, `CharacterCreatorScreen`) used to show a "Add a friend or item from our world" picker built from `community_sprites` (coin, gem, star, heart, chest, spike, etc.). Those are game-object sprites, not hero parts, so tapping them to "build a hero" looked out of place and confused the meaning of the screen.

Changes:
- Removed the "Add a friend or item from our world" sprite picker from the character creator (dropped the `useAssets("")`/`elementTiles` usage there). The level creator still uses `useAssets(theme)` for background art, unchanged.
- Added a "Choose a hero" section that loads a random assortment from the shared Buildable Kids hero library (`community_characters`) via a new `GET /api/list-characters` endpoint. Tapping a hero selects it directly (skips image generation) and continues to the world step. The card hides itself gracefully when the library is empty.
- Kept "build your own" intact (trait chips + optional text box + "Make my character!"). Subtext now reads "Choose a hero from our library — or build your own…".

Reusability: every hero a kid generates is already saved to `community_characters` (approved) by `api/generate-creature.js` (`logToCommunity`), and `onCharacterCreated` also auto-saves to local "My Stuff". So newly created heroes are reusable both for the same kid and across kids/devices via the new endpoint.

New endpoint: `api/list-characters.js` — pulls up to 200 approved rows, shuffles, and returns a random assortment (default 12). Note: most saved characters currently have base64 (`data:`) image_urls (gpt-image-1 returns b64; see the existing base64-vs-clean-URL note), so the endpoint prefers clean hosted URLs but backfills with a capped number of base64 images (MAX_BASE64 = 8) so the library is not empty. Follow-up: once `generate-creature` persists hosted URLs instead of base64, the cap can be relaxed.

Verified live on the demo: the hero picker renders a random assortment (e.g. Sparkly Breeze, Giggly Flame, Twirly Flame, Snappy Fluff…), and tapping one advances to "Build your world!".

## Music Maker — Richer Visual Inputs (June 23 2026)

The "Make a Song" tab (`src/MusicMaker.jsx`) previously only had vibe + world + a text prompt. It now has a full set of tap-driven, emoji-tile pickers so kids can shape the song without typing:
- Music style / genre: Pop, Country, Hip Hop, Rock, Disco, Sleepy Time, Marching, Reggae (plus "Surprise").
- Who sings: No Singer, Boy, Girl, Group, Both.
- Drums: Big Drums, Soft Beat, Marching, Bongos (plus Auto).
- Guitar: Electric, Acoustic, Twangy, No Guitar (plus Auto).
- Strings: Violin, Big Cello, Harp, No Strings (plus Auto).
- Speed: Slow, Medium, Fast (plus Auto).

All pickers are config-driven arrays (VIBES/GENRES/SINGERS/DRUMS/GUITARS/STRINGS/SPEEDS) rendered by a small reusable `TileRow` component, so adding an option is a one-line edit. The selections are bundled by `buildChoices()` and posted to `/api/generate-song`; saving a song is unchanged (still capped at 10).

API (`api/generate-song.js`): the handler now reads genre/singer/drums/guitar/strings/speed and folds them into `buildBrief` (the provider prompt) via per-choice description maps (GENRE_DESC/SINGER_DESC/DRUM_DESC/GUITAR_DESC/STRING_DESC/SPEED_DESC). A new `makeRecipe` returns a friendly one-liner (e.g. "🎵 Chill · soft sleepy-time lullaby · a girl singing · soft gentle beats + acoustic guitar + gentle harp") shown on the draft card and stored in `meta.recipe`; the raw `meta.choices` are saved too. In demo mode the tone now varies with speed (slow=4s, fast=2s) and adds a low harmonic when drums/strings are chosen, so different picks sound a little different today. When a real MUSIC_PROVIDER is wired up, these choices already flow into the brief with no further UI work.

Verified live on the demo: all pickers render and highlight, generation returns a draft with an accurate recipe, and the API echoes every field. No console errors.


## Session log — 2026-06-23 (Google OAuth setup completed + live verified)

Owner completed the Google sign-in setup that the previous session shipped in code. Steps done by the owner: created a Web-application OAuth client ("Buildable Kids Web") in Google Cloud with the Supabase redirect URI `https://mhxxkujnawncahztifvg.supabase.co/auth/v1/callback`; copied the Client ID + Client secret into Supabase → Authentication → Providers → Google (provider enabled); set the Supabase Site URL to `https://www.buildablekids.com`.

Verified live on the demo Grown-ups screen: "Continue with Google" (primary) launches the Google account chooser pointed at the correct Supabase project (`mhxxkujnawncahztifvg.supabase.co`), confirming the full chain (app → Google OAuth → Supabase) is wired correctly. The order on screen is Google (primary) → "Use email instead" (secondary) → "Continue without an account" (guest). Agent stopped at the account-chooser and did not sign in (no account actions on owner's behalf).

Still open / owner-owned: (1) the OAuth consent screen is in Testing mode, so only added Test users can sign in until the owner publishes it; (2) email confirmation is still ON in Supabase, so email sign-ups must click the confirmation link before logging in (owner can toggle off for instant test sign-up if desired). No code changes this session; no Vercel redeploy needed.

## NEW PRODUCT MODE: Buildable Stories (AI living picture books) — June 24 2026

A third kid-facing mode alongside Games and Music: a child builds a story through a
guided tap-choice flow (hero, name, world, problem, helper, tone, ending, optional
twist), and the app turns it into a 6-page "living" picture book — generated art,
ambient page animations, and read-aloud with word highlighting.

### What shipped (MVP foundation)
- **Front door:** the Home hub "Stories" card is now live (badge "New") -> `SCREEN_STORY`.
- **`src/StoryMaker.jsx`** — guided Mad-Libs builder (controlled tap choices = tiny
  moderation surface) + the child's saved-stories library (open / delete). Calls
  `/api/generate-story`, then opens the reader.
- **`src/StoryReader.jsx`** — the living picture book. Per page: lazy-loaded art
  (calm gradient placeholder until it arrives, so it never blocks), an ambient effect,
  and word-by-word highlighting during read-aloud. Narration is the browser Web Speech
  API for the MVP (zero keys/cost); `onboundary` events drive accurate word highlight.
- **`src/lib/storyEffects.jsx`** — the SAFE living-page system. The AI may only pick an
  effect by id from `STORY_EFFECTS`; this renderer maps each id to a fixed, hand-written
  CSS/SVG animation. Unknown ids -> `soft_glow`. Respects `prefers-reduced-motion`.
  Presets: fireplace_flicker, snow_outside_window, twinkling_stars, candle_glow,
  gentle_rain, drifting_clouds, magic_sparkles, character_blink, soft_glow, floating_dust.
- **`/api/generate-story.js`** — Claude Haiku (cheap/fast, text only) -> strict JSON
  validation -> safe **fallback story** if malformed/over-budget/no key. Daily budget
  guard + `usage_log` (kind:"story"). Optional free-text twist is blocklist-moderated.
- **`/api/generate-story-art.js`** — one storybook illustration per page, on demand
  (current page first, prefetch next). OpenAI image chain (gpt-image-1 -> dall-e-3 ->
  dall-e-2) -> `{ placeholder:true }` fallback. Budget guard + `usage_log` (kind:"story-art").
- **`/api/narrate-story-page.js`** — STUB. Returns `{ configured:false }` until
  `ELEVENLABS_API_KEY` is set; documents the premium-narration upgrade path.
- **Persistence:** `/api/save-story`, `/api/list-stories`, `/api/delete-story` mirror the
  songs pattern (device lane + optional `kid_profile_id`; cap 20; device-lane fallback on
  a stale profile link). Full structured story stored as JSONB.

### Story JSON shape (stored in `saved_stories.story`)
`{ schema, title, world, pages: [ { n, text, art_prompt, art_url, effect, audio_url, word_timings } ], created_with }`
`art_url`/`audio_url`/`word_timings` are filled progressively (art) or later (ElevenLabs).

### Architecture decision: React/CSS for the "living page" (not Phaser) for MVP
Ambient, looping, non-interactive effects layered over a single image are exactly what
CSS does cheaply and safely. Phaser would add a heavy runtime + an arbitrary-code surface
for no MVP benefit. Revisit Phaser only if pages later need interactive/physics scenes.

### OWNER TODO (so Stories fully works)
1. **Run `db/create-saved-stories.sql`** in the Supabase SQL editor (creates `saved_stories`).
   It's also appended to the owner's `buildable-kids-setup.sql`.
2. **Page art** uses the existing `OPENAI_API_KEY` + `DAILY_BUDGET_USD` (already set). With
   no key/over budget, pages show the gradient placeholder — flow still works.
3. **Premium narration (optional, later):** add `ELEVENLABS_API_KEY` in Vercel and implement
   `/api/narrate-story-page.js` (TTS + word timings). Until then, browser read-aloud works.
4. Optional cost tuning env vars (names only; defaults are fine): `STORY_COST_USD` (0.02),
   `STORY_ART_COST_USD` (0.04).

### Roadmap
- **Next:** "My Stories" tab in My Stuff; ElevenLabs narration with real word timings;
  character art consistency (seed/reference across pages); deeper output-text moderation pass.
- **Later (magical):** parallax/interactive pages, per-character blink anchored to art,
  background music per scene (reuse Music Maker), choose-your-own-ending branches.

### Preserved
Games builder and Music Maker untouched; production build green.

## Stories: art reliability + background pre-generation — June 24 2026

Follow-on to the Buildable Stories MVP (same day).

### Finding: DALL·E is retired; gpt-image-1 is the only image model
A live probe showed the OpenAI account returns "model does not exist" for both
`dall-e-3` and `dall-e-2` — OpenAI **retired the DALL·E models (Mar 4 2026)**. The
only available image model is `gpt-image-1` (also used by games). `generate-story-art.js`
now calls `gpt-image-1` (quality:"low" for speed/cost) directly; the dall-e entries
remain only as harmless fallbacks for other accounts.

### Background pre-generation (hides gpt-image-1's ~30-40s latency)
`StoryReader` now fires ALL page-art requests **in parallel on mount** (not lazily per
page). The child reads page 1 over the illustrated scene while every page is painted
concurrently, so art is ready by the time they tap ahead. A subtle "painting your
book… N/6" hint shows progress. Per-request timeout 60s; the scene fallback covers any
page that doesn't finish.

### Persisting art on save (guarded)
Saving folds resolved art back into the story JSON — but **only short external URLs**;
giant inline `data:` blobs from gpt-image-1 are stripped so save bodies stay under
Vercel's ~4.5MB limit (re-reads regenerate art via the same background flow).
NEXT: upload page art to Supabase Storage and persist the returned URLs for instant
re-reads without regeneration.

### Diagnostics left in place (safe)
`GET /api/generate-story-art` returns booleans only (`hasOpenAI`/`hasAnthropic`/
`hasSupabase`) — no secret values — for quick env checks.

## Stories: character consistency, session refresh, ElevenLabs narration — June 24 2026

Three follow-ons after live QA of Buildable Stories.

### 1. Character consistency across pages
gpt-image-1 generates each page independently, so the hero's look used to drift
(grey kitten -> child -> orange kitten). `generate-story.js` now asks Claude for a
`character_sheet` — a fixed visual description of the hero (+ recurring helper) — and
prepends it to EVERY page's art prompt ("CHARACTERS (draw EXACTLY the same every
page): … SCENE: …"). Page art_prompts now describe only the scene/action. The fallback
story builds a character sheet too. Keeps full parallel generation (no serialization).

### 2. Session token auto-refresh (fixes "JWT expired")
Supabase access tokens expire ~1h; the app stored them but never refreshed, so signed-in
families got bounced to "add your first child." `accounts.js` now has `refreshSession()`
(exchanges the saved refresh_token) and `ensureFreshToken()` (called on app load); and
`restFetch` retries once after refreshing on any 401. Signed-in sessions now persist.

### 3. ElevenLabs narration (premium read-aloud + word timings)
`/api/narrate-story-page.js` is now implemented: ElevenLabs text-to-speech WITH
timestamps -> returns audio + WORD-LEVEL timings. `StoryReader` plays that audio and
highlights each word exactly in sync; if `ELEVENLABS_API_KEY` is absent it returns
{configured:false} and the reader falls back to the browser speech engine (unchanged).
Budget-guarded + `usage_log` (kind:"narration").

OWNER TODO (optional, to enable premium narration): add `ELEVENLABS_API_KEY` in Vercel
(optionally `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID`). No code change needed.

## Stories: narration cache — June 24 2026

ElevenLabs narration is now cached in Supabase (`narration_cache`, keyed by
sha1(voiceId + page text)). On "Read to me", `/api/narrate-story-page` checks the cache
first and returns instantly with NO ElevenLabs call (no character spend) on a hit;
misses generate once, store the audio + word timings, then serve. Re-reading a saved
story (or another kid reading the same generated line) costs nothing. Cache ops are
best-effort, so narration still works before the table exists (just uncached).
OWNER TODO: run `db/create-narration-cache.sql` (also in buildable-kids-setup.sql).

## Stories: image↔text match + no-blank-open — June 24 2026

Two fixes from live feedback (narration confirmed working same session).
1. **Art matches the page text.** Each page's image prompt is now built from the page's
   own sentence ("...illustration of this exact moment: '<text>'..."), with the character
   sheet keeping the hero consistent and Claude's scene note as extra detail. Previously
   art was driven by the generic character sheet, so a page about coral towers + a closed
   door could render as just the hero + helper. `generate-story-art` prompt cap raised to
   1200 chars so the full text+sheet survives.
2. **Book never opens blank.** `StoryMaker` now paints the first two pages (parallel, 42s
   timeout) DURING the "Painting your first pages…" screen, then opens the reader — so the
   opening page has real art instead of the placeholder. Pages 3-6 still background-paint
   while the child reads (concurrency 2). Tradeoff: the create screen is a bit longer
   (~30s) since it waits on the first image; gpt-image-1 latency is the constraint.

## Stories: hero gender / pronouns — June 24 2026

The story builder now has a "Is the hero a girl or a boy?" pick (girl / boy / prefer
not to say). It's passed as `choices.gender` to `generate-story`, which instructs Claude
to use she/her, he/him, or they/them consistently (fallback story is pronoun-aware too).
Fixes stories calling a girl "him." NOTE: this is per-story for now; storing gender on the
kid profile so it's remembered is a possible follow-up.

## Stories: text layout, calmer narration, livelier pages — June 24 2026

Three reader improvements from feedback:
1. **Text moved BELOW the art** (its own card) instead of overlaying the bottom ~40% of
   the picture, so the illustration is fully visible. Word highlighting unchanged.
2. **Calmer, more natural narration.** Default ElevenLabs model -> `eleven_multilingual_v2`
   (warmer/expressive vs robotic turbo) with expressive voice_settings; client plays audio
   at 0.9x with pitch preserved for a slower read. Model is now part of the narration cache
   key. NOTE: multilingual_v2 costs ~$0.10/1k chars vs turbo's $0.05 (override via
   ELEVENLABS_MODEL_ID to go back to turbo).
3. **Scene-matched living effects.** New presets `sun_pulse`, `water_shimmer`,
   `gentle_waves`; pages can now run 1-2 effects; the generator returns an `effects` array
   and is guided to match the scene (sun->sun_pulse, ocean->water_shimmer+gentle_waves,
   night->twinkling_stars, etc.). The renderer stacks multiple layers.

STILL TODO (next): location-based ambient SOUND per world (forest birds, ocean waves,
space hum) — likely a small set of looped ambiences keyed by world, cached.

## Stories: location-based ambient sound — June 24 2026

Each story WORLD now has a gentle looping soundbed (forest birds, ocean waves + bubbles,
space hum, crackling-cozy, etc.). `/api/story-ambience?world=<id>` generates it once per
world via ElevenLabs Sound Effects (loop:true, ~18s) and caches it in `narration_cache`
(key `ambience:<world>`), so it's a one-time ~$0.12 per world reused across every story.
GET so the CDN caches it too. `StoryReader` plays it on loop at low volume (0.2) under the
narration, with a 🔊/🔇 toggle in the top bar; it (re)starts on the first "Read to me" tap
to satisfy browser autoplay rules. Falls back to silence if the key lacks Sound Effects
permission or no key. OWNER: the ElevenLabs key needs the **Sound Effects** permission;
run `db/create-narration-cache.sql` so ambience (and narration) are cached.

## ROADMAP NOTE: choose-your-own-adventure (keep the model ready)
Stories are linear today. The story JSON is intentionally extensible for branching later:
plan to add `story.mode` ("linear" | "branching") and, on a page, an optional
`choices: [{ label, goToPage }]`. The reader would render choice buttons instead of a
single "next" and jump to `goToPage`; `generate-story` would emit a small branch tree
(e.g., 1-2 choice points). Persistence (`saved_stories.story` jsonb) already stores the
whole structure, so no schema change is needed — only generator + reader additions.

## Stories: dynamic environment + selectable art styles — June 24 2026

Two changes.
1. **Living/moving environment.** Every page image now has a slow Ken Burns camera drift
   (26s zoom toward a per-page focal point) so the scene is always gently moving — works on
   ANY page regardless of effect. Ambient effects were also strengthened (denser snow,
   bigger/brighter stars, more drifting clouds, a sweeping water-shimmer band) so motion
   reads clearly instead of a faint sparkle.
2. **Selectable storybook art styles.** New "What should the pictures look like?" pick in
   the builder: watercolor (classic), modern 3D (Pixar-ish), paper cut-out (Eric Carle),
   crayon, comic, clay. Chosen id rides on `story.art_style`; `generate-story-art` maps it
   to a distinct look (`STYLES` map) appended to each page prompt. Reader + first-page
   prefetch both pass it through.

## Stories: art-style examples on the creator — June 24 2026

The style picker in the builder now shows a REAL sample thumbnail per style via
`/api/story-style-sample?style=<id>` — a fixed sample scene (bunny+owl+snowy cabin)
rendered in that style, generated once and cached (narration_cache key "stylesample:<id>"
+ a 1-year immutable CDN header), so it's ~one-time cost (~$0.04/style) and instant
thereafter. Falls back to a labeled colored SVG swatch if no OpenAI key / off budget, so
the picker is never empty. Pre-warm by GETting each style once (done post-deploy) so the
CDN caches the real images before kids see the picker.

## Stories: quiz-wizard creator + "new adventure" — June 24 2026

Reimagined the story creator from a long scroll into a **one-question-at-a-time quiz
wizard** (`StoryMaker.jsx`):
- Big illustrated tiles, one decision per screen; tapping a choice speaks its name and
  auto-advances. Steps: hero, gender, world, problem, helper, feeling, ending, art style.
- **Talking owl guide** reads each question aloud and speaks an option when tapped, via the
  browser speech engine (OUTPUT only — never records the child). 🔊/🔇 toggle. (We
  deliberately did NOT add voice INPUT, to avoid recording kids.)
- **"Story so far" strip** fills in with the chosen pictures as you go (live preview).
- Landing shows the saved-stories library + a big "Make a new story" button.
- Name is pre-filled from the active kid; the free-text "twist" was dropped from the flow
  to keep it fully tap-based for pre-readers.
- **#5 New adventure with the same characters:** the reader's last page has a button that
  generates a fresh story reusing the prior hero/name/gender/helper/world/art-style AND the
  saved `character_sheet` (so the cast looks identical), with a new randomized problem.
  `generate-story` accepts `priorCharacterSheet` and is told to write a different adventure
  for the same characters.

## Learning Mode — optional education layer (default OFF) — June 26 2026

Toggleable layer that turns the existing "waiting" moments into one quick, age-aware
learning question. **Default OFF** — kids see no change until a grown-up enables it in the
**Grown-ups portal** (`<LearningModeCard />` in `src/GrownUpScreen.jsx`). Setting persists
via `getLearningSettings()` / `setLearningSettings()` in `src/store.js`
(shape `{ enabled:false, goal:"math"|"reading"|"mix" }`).

**Where the question fires (no new screens — fills existing pauses):**
1. During a render/generation wait — `src/LoadingGames.jsx` shows one real question (adaptive
   `level` rises on correct / falls on wrong) instead of the generic mini-games when enabled.
2. Before play starts — gated in `src/CreatorScreen.jsx` (world-build → play boundary).
3. Starting a NEW creation right after finishing one — `src/StoryMaker.jsx` and
   `src/MusicMaker.jsx` (each tracks a `justFinished` flag so it only triggers after a real
   finish; MusicMaker gates the next render via `startRender`).

**Component:** `src/QuizGate.jsx` — fetches one question, renders it (no emoji), `onPass()`
on correct, retry on wrong, always a Skip escape, and passes through on any API error so a
gate can never trap a child.

**API:** `api/generate-quiz.js` — `quizType` of `math`/`geometry` generated locally and
instantly (scaled by level); `spelling`/`reading` via Claude Haiku, cached in Supabase
`quiz_cache`. EVERY failure path returns a safe local fallback (never `{fallback:true}` that
blocks). No emojis in prompts or payloads (uses a text `clue`, not an emoji field).

**Non-negotiable:** no emojis anywhere (use SVG/CSS); the gate must never hard-block a kid.

**Still TODO:** kid-facing badges/streak + a parent progress dashboard (only the toggle +
quiz gates shipped so far). Pre-existing emojis remain in some older screens (home tiles,
`CreatorScreen` pickers) — a separate cleanup pass.

## Learning Mode: progress, badges + parent dashboard (default OFF) — June 26 2026

Built on the Learning Mode layer. All on-device (no login / no Supabase), and no-ops when
Learning Mode is off, so nothing accrues or shows until a grown-up enables it.

**Progress store (`src/store.js`):** `recordAnswer({subject, correct})`, `getProgress()`,
`progressSubjects()`, and a `BADGES` catalog. Tracks `totalCorrect`/`totalWrong`, per-subject
right/attempts (`math`,`geometry`,`spelling`,`reading`), `lastActiveDate` + `streakDays`
(device calendar day), and earned `badges`. Same IndexedDB + synchronous in-memory cache
pattern as learning settings. `recordAnswer` returns any NEWLY earned badge id.

**Badges:** first-answer (1 right), math-whiz (25 total right), word-builder (15 spelling),
bookworm (10 reading), on-a-roll (7-day streak).

**Where it's wired:**
- `src/QuizGate.jsx` records right/wrong (never on Skip), maps question `type` -> subject,
  and on a newly-earned badge shows a brief SVG celebration before `onPass` (~1800ms that
  turn only; normal ~650ms).
- `src/LoadingGames.jsx` records answers from the render-wait question too.
- `src/GrownUpScreen.jsx` — new "Learning progress" card: questions right / day streak /
  badges earned, per-subject strength bars (right vs attempts), and an SVG badge shelf
  (earned in color, unearned dimmed).
- `src/MyStuff.jsx` — kid-facing badge shelf, shown only when Learning Mode is on AND at
  least one badge is earned (never an empty/nagging shelf).

All visuals are SVG/CSS — no emoji. **Note:** streak is device-local (a clock change can
shift it); cross-device sync would need the deliberate anonymous-device-id design already
flagged in SESSION-LOG.

## Learning Mode: practice what you missed — June 26 2026

Adaptive practice on top of the progress store, on-device, gated by Learning Mode.

**Review queue (`src/store.js`):** `recordMiss(question)` stores the FULL question object
(so it replays exactly) in a de-duped, capped (12) queue; `getReviewItem()` returns one due
item (oldest first, avoids repeating the just-served one); `clearMiss(question)` removes an
item once it's answered right; `reviewCount()` exposes the queue size. De-dupe signature is
`type + (question|word_template|story|prompt) + choices`.

**Weak-subject weighting (`src/store.js`):** `weakestSubject(minAttempts=3)` returns the
subject with the lowest right/attempts ratio (math/geometry/spelling/reading), or null.

**Wired in `src/QuizGate.jsx` and `src/LoadingGames.jsx`:** before fetching, ~40% of the
time replay a queued miss; otherwise fetch fresh but ~50% of the time target the weakest
subject's quizType. Wrong answers `recordMiss`, correct answers `clearMiss`.

**Grown-ups (`src/GrownUpScreen.jsx`):** the Learning progress card now shows
"Now practicing: <subject>" and "<n> to review again". All SVG/CSS, no emoji.

## Learning Mode: progress connected to each kid — June 26 2026

Previously Learning Mode settings/progress/review were stored under single global
IndexedDB keys, so two kids on one device shared one set of badges/streak, and an account
kid's progress did not follow them across devices. Now it's per kid.

**Per-kid scoping (`src/store.js`):** scope id = `getActiveKid()?.id || "guest"` (from
`src/lib/accounts.js`). The three caches persist under `learning:<scope>`,
`progress:<scope>`, `review:<scope>`. One-time migration copies any legacy un-suffixed
`learning`/`progress`/`review` into the current scope so existing data isn't lost.
`reloadLearningForActiveKid()` re-hydrates the caches and `emit()`s; `src/BuildableKids.jsx`
calls it after every active-kid change (and once at startup).

**Cloud sync for signed-in accounts (follows the kid across devices):**
- `db/create-learning-progress.sql` — one row per kid: `kid_profile_id` (PK) + `data` jsonb
  + `updated_at`. **OWNER must run this once** in the Supabase SQL editor.
- `api/save-progress.js` (POST {kidProfileId, data} upsert) and `api/get-progress.js`
  (GET ?kidProfileId=) via the service key, mirroring save-song.js. If env isn't
  configured they return `ok:false` (non-fatal) and the client stays local-only.
- Only when `isSignedIn()` and a kid id exists: on reload, pull cloud and MERGE
  conservatively (field-wise MAX of counts/streak/per-subject, UNION of badges + review
  queue, newest settings), persist + push back; every change debounce-pushes (~1.5s).
  All network calls are fire-and-forget — never block a child. Guest mode is 100% local.

No emoji; Learning Mode still default OFF (nothing accrues when off).

## Stories: talking buddy (ElevenLabs) + calming music + faster picker — June 26 2026

The story builder (`src/StoryMaker.jsx`, now v5) got three kid-friendly fixes.

**Talking story buddy — iPad-safe.** The builder used to be silent (the v3 "talking owl"
was lost in the v4 rebuild). The buddy now greets the child and reads each question aloud
as they move through the steps. Crucially it speaks via the **same ElevenLabs narration the
reader uses** (`/api/narrate-story-page`, cached per-text), NOT the browser's
`speechSynthesis` — because iPad Safari speech is unreliable. Real audio files play fine on
iPad once unlocked. Browser speech remains only as a fallback if `ELEVENLABS_API_KEY` is
unset. iOS audio is unlocked inside the first real tap (`primeSound()` on "Make a new story"
/ "Surprise me!"). Question audio for the next step is pre-warmed so it plays instantly.

**Calming background music.** A soft music-box loop (`/music-library/playful_musicbox.mp3`)
plays quietly (vol 0.18) only while building; it pauses on the generating/reading screens.
Started on the same first tap (iOS gesture requirement).

**One "Sound on/off" button** in the builder top bar controls both the buddy voice and the
music. Default ON.

**Faster picker pictures.** The library art (`/api/story-library`) already had year-long
cache headers, so the lag was first-load latency with no prefetch. The builder now
pre-loads the pictures for the current + next two steps (and steps 0-2 from the landing
screen via `new Image()`), and tile `<img>`s use `decoding="async"`. By the time a child
reaches a step, its pictures are warm in the browser cache.

No emoji. Build verified (`npm run build`). ElevenLabs confirmed live (`/api/narrate-story-page`
returns `hasElevenLabs:true`).

## Typing game: fix silent audio on iPad / mobile — June 26 2026

`public/typing.html` makes all its sounds (note/buzz/fanfare/boom) with the Web Audio
API. Browsers start an `AudioContext` in a **suspended** state and only allow it to run
after a user gesture calls `resume()` — the game never did, so it was silent (especially
on iPad). Fix: `audio()` now calls `actx.resume()` whenever the context is suspended (it's
invoked from the in-gesture Start/world-select taps and from each sound), and the gameplay
`keydown` handler calls `audio()` on the first keypress as a safety net. No other changes.

## Learning Mode: per-kid age + questions in Music & Typing — June 26 2026

Two fixes from live testing: questions weren't age-tailored, and Music/Typing didn't prompt.

**Per-kid age (no DB change):** age now lives inside the per-kid learning settings
(`{enabled, goal, age}` in `src/store.js`), so it's already scoped per kid and cloud-synced
for signed-in accounts — no schema change. Clamped 3–13, default 7; legacy settings
normalize to 7. A "Child's age" stepper was added to the Learning Mode card in
`src/GrownUpScreen.jsx` (sets the ACTIVE kid's age). Every quiz gate now reads age from
`getLearningSettings().age` instead of hardcoded 6/7 — Music, Story, Creator, Typing, and
LoadingGames (which still prefers gameData.age). Age is set in the grown-ups card, not the
kid create form (kept that flow simple).

**Music now prompts:** `startRender()` in `src/MusicMaker.jsx` gates EVERY song render with a
question when Learning Mode is on (previously only the 2nd song after a save). Regenerating a
draft does not double-prompt. Skippable; OFF = unchanged.

**Typing now prompts:** `src/BuildableKids.jsx` shows a one-question entry gate before the
`/typing.html` iframe when Learning Mode is on (once per entry, skippable). OFF = straight in.

No emoji; default-OFF preserved.

## Songs: lift the 10-song save cap for testing — June 26 2026

Raised `MAX_SONGS` from 10 to 100000 (effectively unlimited) in both `api/save-song.js`
(the real enforcement) and `src/MusicMaker.jsx` (the client-side gate that hid the Save
button and blocked saves before the API call). TEMPORARY testing change — revert to a real
cap before launch.

## iPad landscape: stop top/bottom clipping everywhere — June 26 2026

In landscape, iPad Safari's visible height is short and `100vh` overstates it, so screens
that center content in a `100vh` body with `overflow:hidden` clipped the top and bottom.

**React app** (`index.html`, `index.css`): viewport now uses `viewport-fit=cover`; `#root`
gets `min-height:100dvh` + `env(safe-area-inset-*)` padding so the top bar (Back/Home) and
bottom content clear the Safari toolbars and the home indicator. Background stays full-bleed
(painted on `<body>`, `background-attachment:fixed`).

**Full-screen games** (`public/typing.html`, `public/buildable-chess.html`,
`public/story.html`, `public/play.html`): bodies use `min-height:100dvh`, `align-/justify-`
`content:safe center`, `overflow:auto`, and safe-area padding — so when the layout is taller
than a short landscape viewport it scrolls instead of clipping, and controls clear the
edges. Typing's `fit()` now scales to `window.visualViewport` (the truly-visible area, not
the inflated `innerHeight`) and re-fits on `orientationchange`. play.html's bottom hint and
controls are lifted by `env(safe-area-inset-bottom)`.

No gameplay/logic changes. Build verified (`npm run build`); all game scripts parse.

## iPhone (portrait): less oversized, no sideways scroll — June 26 2026

First responsive pass for small phones (reported: things too big, content runs off the
sides). `index.css`: `overflow-x:hidden` + `max-width:100%` on html/body/#root and
`max-width:100%` on media so nothing can force a sideways scroll. Oversized headings/logos
across the app (BuildableKids, CreatorScreen, MyStuff, StoryMaker, TopBoard, GrownUpScreen,
MusicMaker) switched from fixed 30–64px to `clamp(...vw...)` so they shrink on phones and
stay full-size on desktop. We deliberately do NOT zoom #root because the games run in
iframes inside it (zoom would shrink the games). Games' own phone polish is a follow-up
pending on-device feedback. Build verified.

## Buildable Chess — full game, living worlds, online family play (June 26 2026)

A complete kids' chess game at `public/buildable-chess.html`, opened from the Home **Chess**
tile (`ChessScreen` in `src/BuildableKids.jsx`, iframe `/buildable-chess.html?v=2`).

**Game.** Full legal-move engine (validated with perft + the Kiwipete position), in-page bot
(Easy / Medium / Hard), two-player pass-and-play, and online family play. Buildable hero
pieces (Sprout/Pony/Wizard/Tower/Queen/King), Purple vs Coral. Teacher-first **toggleable
move hints** (green dot = move, ring = capture). **Pause** stops the music and freezes the
board (and bot). Per-player **scoreboard** in localStorage (`bk_chess_scores`); online games
record under the kid's name. Win = confetti + fireworks + cheering pieces; losing stays
playful (droop + sparkle + rematch).

**Worlds.** Six worlds (Jungle, Ocean, Space, Candy, Castle, Desert) reuse platformer scene
art (`upload/midground_*` / `foreground_*`) downscaled to light JPEGs in `public/chess-art/`:
`<world>_bg.jpg` + `_fg.jpg` (~100–170 KB, 1000px) and `_thumb.jpg` (~20 KB, 300px, world
picker). Rendered as living parallax using **CSS `background-image` divs, not `<img>`** —
`<img>` was unreliable inside an iframe on iOS Safari; CSS bg matches the picker which always
worked. Plus Ken Burns drift, light rays, themed particles. **Themed captures** per world
(space laser+explosion, castle sword slash, jungle coconut bonk, ocean splash, candy shatter,
desert poof) — visual + sound.

**Music = ElevenLabs (not synth).** `api/chess-music.js` generates a real per-world track via
ElevenLabs Music (`POST /v1/music`, `model_id` = `ELEVENLABS_MUSIC_MODEL` || `music_v1`),
caches it in `narration_cache` (key `chessmusic:<world>`), serves a loopable mp3; `?force=1`
regenerates. The game loads `/api/chess-music?world=<world>` and starts it on the **first tap
inside the game** (iframe autoplay needs an in-frame gesture). Older code-synthesized loops
were archived to `public/music-library/` for reuse and are NOT used by chess.

**SFX = ElevenLabs.** `api/sfx.js` has chess one-shots
(`chess_select/move/capture/check/castle/promote/win/lose/yourturn` + per-world
`chess_capture_<world>`) with short `DURATIONS`. The game preloads `/api/sfx?s=chess_*` and
falls back to built-in WebAudio sounds.

**Online family play.** Siblings on separate devices — **requires the email/parent account
lane** (guest kids live on one device only). `src/FamilyChess.jsx` (via "Play a family
member" in `ChessScreen`) lists the family's `kid_profiles`, creates/opens a match, hosts the
game iframe (`/buildable-chess.html?online=1&v=2`), and syncs by **polling `chess_matches`
every 2 s**. Board ↔ app talk via `postMessage` (`chessInit` / `chessOpponentMove` /
`chessMove` / `chessReaction` / `chessShowReaction`). Move detection is **content-based**
(turn + last_move + status) so a reaction can't cause a phantom move. **Canned reaction
badges** (Nice move! / Nice try! / …), no free text, **one per move**, pop on the opponent's
screen. The Home Chess tile shows a "Your move!" badge + dot + ding when it's the kid's turn.

**Database — run once in the Supabase SQL editor:**
- `db/create-chess-matches.sql` — `chess_matches` table (parent_id / white_kid / black_kid /
  world / board / turn / last_move / status / winner) + RLS scoped to `parent_id = auth.uid()`.
- `db/add-chess-reaction.sql` — adds the `reaction jsonb` column for reaction badges.

**Vercel routing (critical).** `public/chess-art/` (and `public/game-music/`) need explicit
routes before the `/(.*)` → `/landing.html` catch-all — otherwise world images fall through to
the landing page and render blank on the live site (works locally, which hides it). World/
thumb image URLs and the game iframe carry `?v=2` for cache-busting.

## Fix overlapping floating buttons (Grown-ups / Learning vs game sound) — June 26 2026

The Grown-ups FAB (bottom-left) and the Learning toggle (just above it) were rendered on
every screen except the grown-ups portal — including over the game iframes, where they
piled on top of each game's own sound on/off control. Now both FABs show only on the
lobby/menu screens (`SCREEN_HOME, SCREEN_GAME_PICKER, SCREEN_MY_STUFF, SCREEN_TOP,
SCREEN_INTRO`); they're hidden over games and the story/music makers. Both are also lifted
by `env(safe-area-inset-bottom)` so they clear the iPhone home indicator.

## Buildable Breaker — customizable brick breaker (June 27 2026)

A classic **paddle-and-ball brick breaker** as a new game type, built the same way as the
others: a fixed **engine** (`public/breaker-engine.html`) plus a data-driven `GAME_CONFIG`
(brick layouts + difficulty knobs). Touch **drag** to move the paddle, or **arrow keys / A-D**;
**tap / Space** launches. Six levels (full, pyramid, checker, gaps, diamond, boss wall), tougher
2-hit bricks, and falling power-up capsules.

**Make It Mine.** Kids customize three things, saved per kid in the browser: the **Look**
(backdrop: Meadow / Space / Candy / Ocean / Castle / Desert; ball: Glow / Star / Comet / Berry;
paddle color), **Power-ups** on/off (Big Paddle, Multi Ball, Slow-Mo, Catch, Extra Life), and
**How Hard** (Easy / Normal / Hard — lives, paddle width, ball speed).

**Always fair.** A tiny natural jitter on each paddle bounce stops the ball from ever locking
into a vertical or repeating orbit, so it keeps sweeping the bricks and every level clears.
`qa-breaker.mjs` runs a perfect-paddle bot through every level repeatedly (headless) plus a
render smoke test — all six clear with no dead-ends and no console errors on the live deploy.

**Shared libraries.** Uses `public/buildable-renders.js` (drawing) and `public/buildable-audio.js`
(WebAudio bounce / smash / win / lose), the same as the other engines. No emojis — all art is
drawn or from the shared library. No database changes.

**Vercel routing (critical).** `public/breaker-engine.html` needs an explicit route **before**
the `/(.*)` → `/landing.html` catch-all, or the page falls through to the landing page on the
live site (works locally, which hides it). Added next to the survival-engine route.

**Wired in.** Tile on the Top Games hub (`public/games-library.html`) and a **Breaker** tile in
the in-app Games picker (`src/BuildableKids.jsx` → `GamePicker` → `BreakerScreen`), mirroring
Survival and Platformer.

## Buildable Breaker — evolved to the game playbook (BM + BS + pong) — June 27 2026

Brought Breaker in line with `BUILDING-A-GAME.md` / `MECHANICS.md`, making it the **reference
adoption** for the two newest shared engine libraries:

- **`BM` (FX/juice).** Replaced the engine's local `burst()`/particles with the shared
  `buildable-mechanics.js`: brick smashes call `BM.explode`/`BM.burst` + `BM.pop` ("+10"
  floating text); losing a life / scoring a point calls `BM.shake` + `BM.flash`; each frame
  runs `BM.update`, and drawing uses `BM.shakeOffset` (camera kick) + `BM.draw`. This is
  MECHANICS.md §9/§11-step-1 done for breaker (survival/croc next).
- **`BS` (start screen).** The menu/level-picker is now rendered by `buildable-startscreen.js`
  (`BS.mount`) — title, Solo / 2-player mode row, level cards with **stars + lock state**, and
  the Make It Mine button (which opens the bespoke customize overlay via `onCustomize`). First
  engine to adopt the one shared start screen.
- **Standard QA hook.** Renamed the test hook to **`window.BUILDABLE_GAME`** (kept
  `BREAKER_GAME` as an alias) per MECHANICS.md §11-step-2.

New gameplay in the same pass: **level stars** (1–3 by lives lost, shown on the BS cards);
two new levels (**Tall Towers**, **Castle Walls** → 8 total); two new power-ups (**Laser**,
**Fireball**); and a same-device **2-player Pong** mode (two paddles, first to 5; touch by
screen-half, or arrows vs A/D), selected from the BS mode row.

QA: `qa-breaker.mjs` now also drives Pong (two bots until a winner) and render-smoke-tests both
modes; all 8 Solo levels still clear across repeated runs. Live-deploy verified in the iframe
(BS menu, mode switch, Solo juice, Pong court) with no console errors. Always-winnable invariant
unchanged (anti-vertical-bounce jitter). No DB changes — progress/stars/choices are per-kid in
the browser.

### Intro "demo hand" (2026-07-02)
The Breaker start-of-level intro (`drawTutorial` in `public/breaker-engine.html`) now shows a
real 3D pointing-hand image under the paddle instead of the small drawn hand, and the row of
5 meaningless colored bars was removed. The hand:
- loads `public/tutorial-hand.png` (white background erased, transparent),
- slides horizontally with the demo paddle so its fingertip stays touching the paddle,
- is sized (~92px tall) to stay clear of the green start button on the 900×600 canvas.

Reuse in other games: copy the small `tutHand` loader + `drawTutorialHand(px, topY)` block from
`breaker-engine.html`, call it under the game's paddle/player in the intro, and add an explicit
`/tutorial-hand.png` route in `vercel.json` (the catch-all otherwise serves landing.html).
Live-QA'd on buildablekids.com/breaker-engine.html Level 1 — hand appears, slides, bars gone,
no console errors.

### Demo hand rolled out to all games via shared BR.hand (2026-07-02)
The 3D pointing hand is now the shared `BR.hand(ctx, x, y, s)` in `buildable-renders.js`
(fingertip at `(x, y - 30*s)`, drawn-hand fallback until the PNG loads). Any game that calls
`BR.hand` gets it automatically — **Survival** (drag-to-move demo + cue box) and **Castle Guard**
(tap-a-slot hint) picked it up with no per-game code. **Breaker** now calls the shared `BR.hand`
too (single source of truth). Live-QA'd all three on buildablekids.com — hand shows/points
correctly, no console errors.

### Self-playing how-to-play demos — batch 1 (2026-07-02)
Added wordless, self-playing intro demos (Breaker/Survival style) to **Tennis**, **Maze**, and
**Croc**. Each freezes the game behind a scrim, animates the core move with the shared 3D hand
(`BR.hand`), and dismisses on the kid's first real input:
- Tennis (`tennis.html`): demo paddle slides + ball bounces, hand under the paddle. `demoOn`
  armed in `newGame()` for non-online modes; dismiss on deliberate tap/key only (NOT mouse
  hover — hover-dismiss was a bug that skipped the demo).
- Maze (`maze-engine.html`): "Swipe to move" with the hand swiping; first world only; holds the
  "ready" countdown until the first swipe/tap/key.
- Croc (`croc-engine.html`): "Drag to move, you shoot automatically"; vertical drag hand +
  auto-fire bullets; level 1 only.
All three live-QA'd on buildablekids.com, no console errors. Remaining games still need demos:
Chess, Checkers, Tetris, Bingo, Memory, Snakes & Ladders, Tic-Tac-Toe, Connect Four, Dots & Boxes.

### Fix silent Breaker sound effects (2026-07-02)
Breaker's core play sounds — ball launch, paddle hit, and wall bounce (`shoot`→`tennis_hit`,
`select`→`tennis_wall`) — had gone silent for multiple levels. Root cause was server-side in
`api/sfx.js`: those two sounds requested ElevenLabs generation at 0.35s and 0.3s, below
ElevenLabs' **0.5s minimum**, so generation failed, `/api/sfx` returned 503, and the client fell
back to a near-silent synth. Brick smashes still worked because their durations were ≥0.5s.
Fix: added a `Math.max(0.5, …)` floor on `duration_seconds` so no sound can ever request under
the minimum again (this also protects other sub-0.5s entries: chess/checkers/castle-guard
selects, tumble moves), and corrected the offending `tennis_*`/`tumble_*` values to 0.5.
Live-QA'd on buildablekids.com — `/api/sfx?s=tennis_hit` and `?s=tennis_wall` now return real
audio (200, audio/mpeg), and in-game every Breaker sound buffer loads and plays (measured audio
output on all of shoot/select/coin/boom/levelup/hurt/win/lose), no console errors.

### Kid drawings now save & show in My Stuff (2026-07-02)
Art Studio drawings were saving, but never appeared in the **My Stuff** library — two root
causes. (1) Art Studio wrote/read under its own private `localStorage` key (`artstudio:device`)
instead of the app-wide `deviceId`, and never sent `kid_profile_id`, so its saves lived in a
separate lane the library couldn't see. Art Studio now uses the shared `deviceId` (migrating any
existing `artstudio:device` id so old drawings aren't orphaned) and sends the active kid's
`kid_profile_id` on save + gallery list. (2) `My Stuff` had no drawings tab at all, and
`api/list-art` deliberately dropped `data:` PNG thumbnails (showing a generic theme placeholder
instead of the real picture). Added a **My Art** tab to `src/MyStuff.jsx` (loads `/api/list-art`,
shows each drawing with Publish + Delete), a new `api/delete-art.js` endpoint (kid-scoped, mirrors
`delete-song`), extended `togglePublish` to handle `kind:"art"` (publish-creation already
supported it), and changed `api/list-art` to use the saved PNG itself as the thumbnail (kid
galleries cap at 40, so shipping the small images is fine). Net: a saved drawing now shows its
real picture in My Stuff, can be published/shared with family, and can be deleted.

## Session log — 2026-07-02 (Hilltop Tanks — new artillery engine)

New Track B engine `public/tank-engine.html` ("Hilltop Tanks"): solo artillery vs a
friendly computer tank — two tanks on grassy-green mountains lob shells across a valley.
Angle + power buttons, a dotted aim-preview arc (the key always-winnable helper), a big
FIRE button; shared libs (BR/BA/BM/BS), Kenney Tank Pack art in `public/tank/` (green +
grey tanks, barrels, flying shell, explosion frames) with drawn fallback. 3 green-hill
levels as data. Forgiving damage model + high enemy aim-error so a young kid always wins;
`qa-tank.mjs` perfect-player bot clears all 3 levels 8/8 runs. Win/lose posted to the app
(helper + telemetry). Wired: vercel routes (`/tank-engine.html`, `/tank/*`), Games-picker
tile + `SCREEN_TANK` + `TankScreen`, `api/images.js` tank thumbnail prompt. `vite build`
clean.

## Level thumbnails — real generated previews on every game's level cards (2026-07-03)

Owner: "the level thumbnails don't load on the games." Root cause: most games' level-select
cards (the shared `public/buildable-startscreen.js` grid) only passed a flat `color` — never a
preview picture — so every level looked like an empty coloured box; and the few games that DID
draw previews (Breaker, String Match, Survival) only showed them for the *unlocked* level, leaving
locked cards blank. Fix: new shared helper `public/buildable-levelthumb.js` (`window.BuildableLevelThumb`,
BLT) — cached canvas "painters" that draw a little photo of each level from the game's own data:
`maze` (walls + pellets + muncher), `bubbles` (the real cluster), `cards` (Memory grid + theme
shapes), `bingo` card, `snakes` board (ladder + snake), `lanes` (Runner 3-lane road + car),
`hill` (Tank hills + tanks), `town` (Family Town loop), `tiles` (Mahjong pyramid, scales with
board size). Wired `img: BLT.make(...)` into every level (locked included — the start screen dims
them) for Maze, Bubble, Memory, Bingo, Snakes, Runner, Tank, Family Town, Mahjong; and made
Breaker + String Match + Survival draw their existing previews on locked levels too. All calls are
guarded (`BLT && BLT.make(...)`) so a card safely falls back to its old colour if the helper is
missing. Painters verified headlessly (node + @napi-rs/canvas render) and live-QA'd in-browser
across Maze/Bubble/Tank/Mahjong/Breaker — no console errors. Scoped to `public/buildable-levelthumb.js`,
`vercel.json`, and the 12 game pages. Commit on main; Vercel auto-deploys.
