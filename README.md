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

All three tables have Row Level Security enabled.

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/generate-creature` | POST | Generate character image + metadata via OpenAI |
| `/api/generate-level` | POST | Generate world layers (4 parallax layers) via OpenAI |
| `/api/generate-game` | POST | Generate Phaser 3 game code via Anthropic Claude |

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
