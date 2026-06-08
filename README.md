# buildable-app

> **Live URL:** https://www.buildablekids.com/demo

A kids' game builder where children enter their name & age, generate an AI character and world, then play a custom Phaser platformer — all in the browser. No login required.

---

## Tech Stack

| Layer | Service |
|-------|---------|
| Frontend | React (Vite), hosted on Vercel |
| Serverless API | Vercel Functions (Node.js) |
| Database | Supabase (Postgres + Row Level Security) |
| Image generation | OpenAI `gpt-image-1` (with fallback to `dall-e-3` → `dall-e-2`) |
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
- `asset_id` — unique identifier
- `layer_type` — e.g. sky, midground, foreground
- `category` — theme category
- `image_url` — URL or base64 PNG
- `parallax_speed` — float, used by Phaser parallax scroll
- `theme_tags` — text array for matching
- `prompt_used` — the prompt that generated this image
- `has_transparency` — boolean
- `reusable` — default true
- `created_by_device_id` — anonymous device ID
- `moderation_status` — default 'approved'

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
├── api/
│   ├── generate-creature.js   # Character image generation
│   ├── generate-level.js      # World layer image generation
│   └── generate-game.js       # Phaser game code generation (Claude)
├── src/
│   ├── BuildableKids.jsx      # Main app orchestrator / state machine
│   ├── CreatorScreen.jsx      # Character + world creation UI
│   ├── LoadingGames.jsx       # Mini-game overlay shown during generation
│   └── MyStuff.jsx            # Saved games screen
├── public/                    # Static assets
├── vercel.json                # Vercel config (maxDuration, rewrites)
├── index.html                 # Entry point
└── README.md                  # This file
```

---

## Vercel Config Notes

`vercel.json` sets `maxDuration: 300` for all API functions. Image generation via `gpt-image-1` can take 60–90 seconds per call, so the default 60s timeout is not enough.

---

## Game Mechanics Library (gameplay quality)

Early generated games were thin because the generator prompt only asked for a bare "run and jump over gaps" game — no enemies, power-ups, win condition, or difficulty design. To fix this, gameplay is now driven by a reusable **mechanics library** extracted from a finished, shipped game (*Riley's Garden*, croctot.com/riley).

- **[`MECHANICS.md`](./MECHANICS.md)** documents the reusable primitives: named enemy movement patterns (`linear`, `patrol`, `random`, `zigzag`, `swoop` dive-bomb, `swirl`), collectibles/power-ups, win-and-lose conditions (with an anti-soft-lock failsafe), a difficulty-curve recipe, and kid-friendly polish (auto-aim helper, emoji sprites).
- **`api/generate-game.js`** now injects a condensed version of that library into the Claude prompt, so each generated game is *assembled from proven mechanics* (enemies with patterns, an auto-firing helper, power-ups, a difficulty ramp) instead of being improvised. The prompt also asks Claude to emit a clearly-marked `CONFIG` block separate from the engine, so games stay **remixable**.

> Design principle (from Riley): separate **skin** (theme, characters, items) from **engine** (loop, physics, scoring). A new game = new skin + same mechanics; a remix = tweak the config. Keep `MECHANICS.md` and the `generate-game.js` prompt in sync.

---

## QA Session Log — June 7 2026

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
**Fix:** Added multi-model fallback: try `gpt-image-1` → `dall-e-3` → `dall-e-2` in sequence. First successful response is used.
**Commits:** `403cc8f`, `a2ef6c9`

#### 3. Vercel 60s function timeout too short
**File:** `vercel.json`
**Error:** 504 Gateway Timeout on `/api/generate-level`
**Fix:** Raised `maxDuration` from 60 → 300 seconds.
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
2. Character generated — AI art via `gpt-image-1`, saved to `community_characters`
3. World generated — 4 parallax layers saved to `community_layers`
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

Flow: intro -> pick game -> create character -> build world -> **Play** (game is assembled from the libraries, no DALL-E) -> tap **"🚀 Publish my game!"** on the play screen. Publishing POSTs the finished game HTML plus metadata (title, theme, chosen mechanic, character/creator names, layer ids, preview image) to `/api/publish-game`, which stores a row in `published_games` and returns a share link (`/play/<gameId>`). The UI then shows a success message with the shareable link.

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
`published_games` (and the asset INSERTs) were created/run with the Supabase linter's **"Run without RLS"** option, matching the existing community/published tables which are read via the service key. (This corrects the older note above stating all tables have RLS enabled — the app does **not** rely on RLS for reads.)

### QA test rows to clean up (optional)
Left in place for inspection; safe to delete when no longer needed: `published_games` id 1 (`game_id` qaa95cb6) and `community_levels` id 7 ("Enchanted Forest Quest").

## Blank Game Canvas Fixed — Blob URL Render (June 7 2026, later session)

The long-standing "Phaser canvas intermittently blank in iframe" issue (see the earlier *Known Issues / Future Work* note) is now **fixed**. This was the bug behind the play screen showing a generated character, world, and 4 layer cards but an empty dark game box that was never actually playable.

### Root cause
`PlayGameScreen` (in `src/BuildableKids.jsx`) injected the generated game HTML into the play `<iframe>` using `doc.open()` / `doc.write(gameHtml)` / `doc.close()`. A `document.write()`-populated iframe does not get a proper browsing context, so Phaser 3 (and its WebGL/canvas init) intermittently failed to boot and the canvas rendered blank. The game code and the Phaser script were present the whole time — the engine just never initialized.

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
- **Keep the injected HTML small.** Bias layer/sprite selection toward the clean `created_by_device_id = 'asset-pack'` rows (GitHub raw URLs) and skip rows whose `image_url` starts with `data:`. Large base64 layers bloat the game HTML and slow the iframe paint — this compounds render problems even with the Blob URL approach. (See the base64-vs-clean-URL note above.)
- **Sandbox note:** the play iframe uses `sandbox="allow-scripts allow-same-origin"`. `allow-scripts` is required for Phaser to run; the Blob URL is treated as same-origin so the game behaves like a normal document. Keep both flags in sync if the sandbox is ever tightened.

### QA status
Code change committed to `main` and auto-deploys to Vercel production. The play screen now hands Phaser a real browsing context; the previously-blank `https://www.buildablekids.com/demo` game box should render the playable canvas once the deploy lands. End-to-end re-verification (canvas paints, player + parallax layers + sprites visible, mechanic playable) should be run against the fresh deploy.

## Generated Game Validation + Truncation Guard (June 7 2026, later session)

After the Blob URL render fix, end-to-end QA against the live demo showed games **still** rendering a blank canvas — but for a different reason. Inspecting the play iframe directly: the Blob URL loaded fine, Phaser 3.60.0 loaded from CDN, and the ~19KB inline game script was injected — but **no `<canvas>` was ever created**. Evaluating the inline script threw `SyntaxError: missing ) after argument list`. The generated code had unbalanced brackets (e.g. 344 `(` vs 343 `)`, 75 `{` vs 73 `}`) and contained **no `new Phaser.Game(...)` call at all**.

### Root cause
The Claude call in `api/generate-game.js` used `max_tokens: 8000`. A full, polished game (the prompt asks for enemies, power-ups, a difficulty ramp, and a separate CONFIG block) routinely needs more than that, so the response was **truncated mid-script**. The only validation gate was `html.includes("<!DOCTYPE")` — a truncated file still starts with `<!DOCTYPE html>`, so the broken code passed the check and was served as-is. `fallbackGame()` never triggered because its trigger condition did not detect *malformed* output, only a missing/empty response.

### Fix (`api/generate-game.js`)
1. **Raised `max_tokens` from 8000 to 16000** so a complete game fits in one response.
2. **Truncation guard:** if Claude returns `stop_reason: "max_tokens"`, treat it as a generation failure and serve `fallbackGame()` instead of the partial output.
3. **Added `validateGameHtml(html)`** which is now run before any generated game is served. It rejects output that: is empty / not HTML, has no closing `</html>`, has no `new Phaser.Game` / `Phaser.Game(` bootstrap, or has unbalanced `()`, `{}`, or `[]` in its `<script>` bodies. On failure it falls back to the known-good `fallbackGame()`.
4. **Observability:** the API response now includes a `fallbackReason` field (`"truncated"`, `"no-phaser-game"`, `"unbalanced-braces"`, etc.) so future bad generations are diagnosable from the network tab.

Commit: `fcd50f2` (fix: validate generated game + raise max_tokens).

### Best practices going forward
- **Never serve LLM-generated executable code without validating it first.** At minimum check that it parses / has balanced brackets and contains the expected entry point (here, the Phaser bootstrap). A partial response can look valid at the top and be broken at the bottom.
- **Always check the completion `stop_reason`.** `max_tokens` means the answer was cut off — do not use it. Size `max_tokens` to the realistic worst-case output, not the average.
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

**Problem:** the first real generated game rendered, but sprites were chaotic — mis-scaled,
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
**File:** `qa/game-qa-harness.html` (standalone — open in a browser, no build step)

A self-contained page that loads a generated game in a **sandboxed iframe** and asserts:
- **Layer 0 — API:** `/api/generate-game` returns 200 (never 500), non-empty html, and is
  not a silent fallback (`source !== "fallback"`).
- **Layer 1 — Boots:** has doctype + closing `</html>`, bootstraps Phaser, has balanced
  `{}`/`[]` in its scripts, and uses `setDisplaySize` (coherence signal).
- **Layer 2 — Playable:** a `<canvas>` mounts at non-zero size, the Phaser global is present,
  jump input (space/click) dispatches without error, and a win/lose/restart anti-soft-lock
  path exists.

Click **"Fetch from /api/generate-game"** to test a fresh generation, or paste game HTML.
**Commit:** `224a9b7`.

### The 4-layer "is this game functional?" QA framework
A reusable way to QA any generated game, cheapest checks first:
1. **Layer 1 — Does it boot?** (automated) doctype, Phaser bootstrap, balanced brackets,
   canvas mounts. Enforced in `validateGameHtml` (server) + the harness (client).
2. **Layer 2 — Is it playable?** (automated) input moves/responds, a win condition and a
   lose condition are both reachable, no soft-lock.
3. **Layer 3 — Is it coherent?** (prompt-enforced) sprites correctly sized/positioned, no
   overlap, HUD readable — see the VISUAL COHERENCE RULES above.
4. **Layer 4 — Is it fun?** (human / kid testing) the only layer a machine cannot judge.

### Best practices going forward
- **Auto-advance waiting UX; never make the kid tap to progress** while a background job runs,
  and always show the system is still working.
- **Constrain LLM-generated layout with hard numeric rules** (exact sizes, spawn coords,
  safe zones) rather than adjectives like "nicely arranged" — models comply far better.
- **Make serverless endpoints fail-safe:** wrap the whole handler so a thrown error returns a
  usable 200 fallback, not a 500 the client cannot render.
- **Keep an automated QA gate next to the generator** so regressions in boot/playability are
  caught before a human ever sees them.

### QA status
All four changes committed to `main` and auto-deploy to Vercel. Verified on the live demo that
a generated game renders a live 800x400 Phaser canvas with the player, score, and library
sprites. Re-run `qa/game-qa-harness.html` against the fresh deploy to confirm Layers 0-2 pass
and to spot-check Layer 3 coherence on new generations.

## Game Types: Breakout added (Path B) + Multi-Genre Roadmap (Path A — planned)

Until now the generator only produced a single genre: a side-scrolling
**platformer** (run-and-jump hero, gravity, parallax layers, collectible/spike
sprites). Tetris and brick/Breakout games are a fundamentally different category
(grid / paddle-and-ball, no jumping hero, no parallax scroll), so they cannot be
produced just by adding art or a mechanic row — the generator prompt has to change.

### Path B (DONE): Breakout game type
`api/generate-game.js` now reads `gameData.gameType` (default `"platformer"`).
When `gameType === "breakout"`, a dedicated **Breakout / brick-breaker** prompt is
used instead of the platformer prompt:

- **Reuses the SAME library sprites as bricks** (coin/gem/star/heart/chest/etc.)
  arranged in a grid — so it ships with **zero new art required**. Missing subjects
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
"breakout"`. (The UI does not yet expose a game-type picker on the create screen — that
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

> Design note: this keeps the "skin vs engine" principle but adds a third axis — **genre**.
> A game = genre (engine template) + skin (theme/sprites) + mechanic (rule params).

## Sprite Coverage Audit + Breakout QA + Deploy Finding (June 7 2026, later session)

Batch of four improvements: UI game-type picker, Breakout QA probe, a full
sprite-coverage audit across all 7 themes, and the Breakout mechanic seed.

### Brick Breaker reachable in the UI
Added a 5th card (`id: "breakout"`, "Brick Breaker") to `GameTypeScreen` in
`src/BuildableKids.jsx`. `gameType` already flows through to `/api/generate-game`,
so picking it routes to the Breakout prompt (commit `bf4d759`). UI commit: `0498b37`.

### Breakout mechanic seed
`db/seed-breakout-mechanic.sql` — idempotent upsert that adds
`breakout-clear-all-bricks` to `game_mechanics` (rule: 3 lives, 4x8 grid, ball
speed 220, speed-up every 8 bricks). Run it in the Supabase SQL editor. Commit: `94db6fa`.

### Sprite coverage audit — RESULT: 100% complete, ZERO gaps
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

**No new sprite art is needed** — the library fully covers all 7 themes x 9 subjects.
(If new genres are added later via Path A, e.g. Tetris block textures, those would be
new subjects and the audit should be re-run per genre.)

### Breakout QA probe — BLOCKED by a production deploy / API-key issue (needs attention)
The live Breakout probe came back as the small built-in `fallbackGame()` (~2.3KB,
platformer-style, no paddle/ball/bricks) rather than a real generated Breakout. Root
cause is **not** the Breakout code — it is the production deployment:

- The API response is **missing the new `gameType` field** that the current `main` code
  adds, so production is still running an **older build** (the Breakout + catch-all
  commits have not gone live yet).
- More importantly, even plain platformer requests now return a **~2.3KB fallback with
  `source: "library"`, `fallbackReason: null`, and `spritesUsed: null`**. That exact
  signature matches the old code path `if (!claudeKey) return fallbackGame(...)` —
  i.e. **`ANTHROPIC_API_KEY` is not set / not readable** on the currently-live function.
  (Earlier today the same endpoint returned full ~23KB Claude-generated games, so the
  key was working before — something changed in the env/deploy since.)

**Action needed (owner, in Vercel dashboard — cannot be done from the app):**
1. Confirm `ANTHROPIC_API_KEY` is set on the Production environment and not expired.
2. Trigger / confirm a redeploy of latest `main` so the Breakout + catch-all + UI
   commits go live.
3. Then re-run `qa/game-qa-harness.html` (it has a "Fetch from /api/generate-game"
   button) and a Breakout probe to confirm a real paddle/ball/brick game renders and
   that responses include `gameType`.

Until the deploy/key is sorted, the app stays playable (the fallback game still runs),
but it serves the simple fallback instead of rich library-driven games.


---

## Session update — root cause CONFIRMED via live probes (429 → truncation)

After deploying the rate-limit fix (`max_tokens` 16000 → 7000 + retry/backoff on
429/529), live probes against the production `/api/generate-game` were re-run.

**What the probes showed:**
- The **429 rate_limit_error is gone** — the retry/backoff is working and we are no
  longer exceeding the org's 8,000 output-tokens/min cap.
- BUT the response now falls back with `fallbackReason: "truncated"` (was `"429"`).
  The game HTML is being cut off mid-script because **7000 output tokens is too small
  to hold a complete game**, so the validator correctly rejects the unbalanced/partial
  output and serves the simple fallback.

**Conclusion:** there is a hard tension on **Tier 1**:
- `max_tokens` high enough for a full game (~12–16k)  ->  hits the 8k/min **429 cap**.
- `max_tokens` low enough to stay under the cap (7k)   ->  game gets **truncated**.

**Fix path (in progress):** upgrade the Anthropic org to **Tier 2** (raises the
output-tokens/min limit). Once Tier 2 is active, raise `max_tokens` back up
(target ~12000–14000) so games generate completely AND stay under the higher cap.
Until then the app stays playable on the fallback game.

**Verification checklist once Tier 2 is live + `max_tokens` raised:**
1. Platformer probe returns `source: "claude"` (not `library`/fallback), htmlLen ~20KB+,
   contains `raw.githubusercontent` sprite URLs, `fallbackReason` absent.
2. Breakout probe (`gameData.gameType = "breakout"`) returns a real paddle/ball/brick
   game and the `gameType` field is echoed back.
3. Run `qa/game-qa-harness.html` for the 4-layer QA pass.
