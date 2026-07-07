# Asset Studio

A "Create" tab inside `/asset-library.html` that makes game art with the OpenAI
image model, so you never prompt-save-rename-upload by hand again. This doc is the
source of truth for what it does and where we are taking it.

## Why it exists

The old workflow was: prompt DALL-E, download the file, rename it, upload it into a
game folder. Four manual steps per asset. Asset Studio collapses that into: fill a
short form, hit Generate, hit Keep. Naming and filing are automatic.

## The one big idea: sheet-first

DALL-E can draw a whole pack on one page (many bricks, a row of balls, a grid of
crops). Generating one sheet is cheaper than many single images and every piece
matches because it came off the same page. So the default is:

1. Generate ONE sheet in a single image call.
2. The browser slices the sheet into individual named pieces.
3. Keep stores each piece so a game can load it by URL.

Single mode still exists for one-offs (a lone paddle, a full-screen background).

## Pieces

**Frontend:** `public/asset-library.html`, the "Create" tab (second `<script>` block).
- Recipes (the `RECIPES` object) describe what a game's assets are: for each asset,
  its mode (`sheet` or `single`), image size, whether it needs a transparent
  background, and for sheets the `rows` (variants) and `cols` (states/frames).
- The form auto-writes the prompt from the chosen recipe + theme. The prompt box is
  editable before you generate.
- Slicing is done in the browser on a `<canvas>`. After the white background is keyed
  out, the cutter finds the REAL rows and columns by their widest empty gaps
  (`occRows`/`occCols` + `splitBands`), not a fixed even grid, so uneven spacing and
  margins don't cause pieces to bleed into each other. Small gaps (between debris
  chunks) are ignored so a shatter cluster stays whole. Each cell is then trimmed to
  its content and named from the recipe (e.g. `ice_intact`), editable before Keep.
- Recipe assets can carry their own `style` string (overrides the recipe style).
  Breaker bricks use `STUDIO_STYLE_DETAILED` for a rich textured look; sheets default
  to `high` quality so that detail renders.

**Backend:** `api/asset-studio.js`.
- `POST {action:"generate", engine, prompt, size, transparent, quality}` -> `{b64}`.
  Two engines: `openai` (gpt-image-1, sizes wide `1536x1024` / tall `1024x1536` /
  square) and `flux` (FLUX Pro via fal.ai, reuses the existing `FAL_KEY`, same
  submit->poll pattern as `animate-page.js`, model overridable with `FAL_IMAGE_MODEL`,
  default `fal-ai/flux-pro/v1.1`). FLUX renders on white like gpt-image, so the same
  white key-out slicing applies. Not cached; it is a preview. Honors the daily budget
  guard. Pick the engine in the Create tab's Engine dropdown to A/B them.
- `POST {action:"keep", game, type, theme, pieces:[{slug,b64}]}` -> saves each piece.
- `GET ?asset=<slug>` -> the PNG bytes, for use in a game: `<img src="/api/asset-studio?asset=breaker/bricks/jungle/ice_intact">`.
- `GET ?manifest=1[&game=breaker]` -> JSON list of what has been made.

## Rules layer

`RULES` (top of the Create-tab script) is the one place every generation obeys, so
standards stay consistent:
- `globalTail` — appended to every prompt: no text/letters/numbers/UI/watermark, child-safe.
- `quality` — per role. Backgrounds render at `high`, sprites at `medium`. The Quality
  dropdown's "auto" setting uses these; picking a specific quality overrides.
- `minW` — after slicing, any piece narrower than this gets a "may look soft" badge.

Backgrounds are forced to the biggest size the model supports (1536 long edge) at
high quality via `assetSize()` / `assetQuality()`. Note the model's ceiling is ~1536px,
which is below an iPad Pro's native width, so backgrounds are mildly upscaled on the
largest screens; for painterly art this reads fine. True retina-sharp backgrounds need
an upscaler pass (see V2).

## Adding new games (built)

The Create tab has a **New game** button that opens a builder:
1. Type the game name and a one-line description.
2. **Auto-suggest assets** asks the model (`suggest-recipe`) for a sensible asset list
   and fills in editable rows (each: key, label, sheet/single, size, transparent, rows,
   cols, art description with `{theme}`).
3. Edit anything, add or remove assets, then **Save game**.

Saved recipes persist in the database (`image_cache`, `kind="recipe"`, base64 JSON) and
load on page open, so a saved game appears in the Game dropdown just like Breaker. No
code editing. Built-in recipes (Breaker) and saved ones share the exact same shape:
`subject` is a string with a `{theme}` token.

## Storage

Reuses the existing `image_cache` table from `images.js` (columns cache_key,
descriptor, kind, b64). NO new database migration. Kept studio assets use
`kind="studio"` and `cache_key="studio:<game>/<type>/<theme>/<name>"`.

Storage decision (agreed): cache by default (games load by the `?asset=` URL, like
Chess/Tennis art already do), plus a "Download files" button for when a game needs
real PNG files (animation strips, or the file-based Breaker packs). The tool applies
the correct names either way, so there is no manual renaming.

## How a game uses a kept asset

By URL, no files:
`<img src="/api/asset-studio?asset=breaker/bricks/jungle/ice_hit">`
or fetch the manifest (`/api/asset-studio?manifest=1&game=breaker`) to list a set.

## Animation (full frames)

Animation states are the sheet's columns. A Breaker brick sheet is 6 materials
(rows) x 3 states (cols): intact / hit / cracked. Each state is sliced into its own
named piece, so the frames exist and are usable immediately. Packing several frames
into one horizontal strip PNG (the format survival-dalle uses) is a small follow-up,
see V2.

## Pilot recipe: Breaker

Defined in `RECIPES.breaker`:
- `bricks` — sheet, 6 rows (ice, wood, metal, candy, star, bomb) x 3 states.
- `ball` — sheet, 4 balls in a row.
- `paddle` — single, transparent.
- `background` — single, full-bleed portrait.

To add another game: add a recipe block with its assets. The form, prompt builder,
and slicer all read from the recipe, so no other code changes.

## Status

**V1 (built):** Create tab, Breaker recipe, sheet generation + grid slice + trim,
per-piece rename, Keep to cache, Download files. Serve + manifest endpoints.

**V1.1 (built):** Rules layer (house style, per-role quality, undersized badge),
backgrounds forced to max size + high quality, New Game builder with AI auto-suggest,
recipes persisted in the DB and loaded into the dropdown.

**V1.2 (built):** detailed textured brick style as the Breaker default (per-asset
`style` override), sheets default to high quality, gap-detecting slicer (widest-gap
row/column bands) replacing the fixed grid.

**V2 (planned):**
- Autopilot: "make 3 more worlds for Breaker" fills the whole recipe unattended.
- Strip export: pack an asset's frames into one horizontal `<name>_anim.png`.
- Write kept files straight into the repo's game folders + commit, so file-based
  games need zero manual placement.
- Show studio assets in the Browse tab's coverage grid.
- Upscaler pass for retina-sharp backgrounds on the largest screens.

## Notes / gotchas

- gpt-image-1 does not place items on a perfect grid. We tell it to lay assets on a
  clean evenly-spaced grid with clear gaps, then slice + trim. If a sheet comes out
  crooked, redo it or lower the row/col count.
- Sprites/sheets generate on a PURE WHITE background (not native transparency). White
  backgrounds make the model lay assets on a clean, well-spaced grid; native
  transparency made it bunch pieces together and slice badly. The browser then keys
  out the white (edge-connected near-white -> transparent via `keyOutWhite`), so white
  GAPS vanish but white details inside a piece (a star's glow) stay. Backgrounds keep
  their full color and are not keyed. This mirrors Mike's proven manual workflow.
- Kept art is immutable-cached by URL; if you re-Keep the same slug it replaces the
  old bytes, but browsers may hold the old one. Add `&v=N` to bust it (same rule as
  the rest of the app).
