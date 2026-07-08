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

## Upload tab (bring your own sheet)

A third tab next to Browse and Create. For when you make a sheet elsewhere (ChatGPT,
Midjourney) where the art quality is best, and just want the tool's slicing and
filing. Flow: pick game + theme + name prefix, pick an asset type (character,
background, weapon/item, blocks/tiles, collectible, UI/icon, effect), pick a layout
(auto-detect, grid rows×cols, one row, or single), drag-drop the image, hit Slice.
It reuses the exact same slicer as Create (`keyOutWhite` + `occRows`/`occCols` +
`splitBands`, plus `autoSplit` which auto-picks the count by cutting at the widest
gaps). Background type skips the white key-out. Pieces are named `prefix_N`, editable,
then Keep (same `keep` endpoint) or Download. Backbone of the "make hero art anywhere,
let the tool organize it" workflow, which is more reliable than trying to match
ChatGPT's polish through the raw API.

## World builder (the Upload tab)

The Upload tab is a world builder. You pick a game and name a world, then fill in the
game's parts (slots) as cards on one page. Drop art into a part, it slices in place
(`sliceImage` + each slot's spec), you X out bad pieces and rename, then "Save this
part" keeps just that part to the world. Each part saves independently, so you fill
them in any order and the page reloads what's already saved for that world (from the
manifest, grouped by world/slot). A bottom bar attaches the world to a level: "Make a
new level" (name + template + difficulty) or "Replace a level's art". State lives in
`WB`; slot cards render from `GAME_SLOTS[game]`. (The old single-sheet upload functions
`up*` remain in the file as dead code, not wired to anything, pending cleanup.)

## Per-game asset slots (each type has its own rules + prompt)

`GAME_SLOTS` in `asset-library.html` defines, per game, the asset types that game needs,
each carrying its own slicing rules and its own generator prompt. Breaker: bricks (sheet,
6 materials x 4 states, `material_state` naming), ball (single, named `ball`), paddle
(single, `paddle`), background (single, `bg`). Survival: hero, enemies (sheet), sky/bg.
Sling: background, pals (sheet). The slot names match what each game's engine looks for.

When you pick a game in Upload, the asset-type buttons come from that game's slots (not
the generic character/background list, which is the fallback for games with no slots).
Selecting a slot auto-fills the layout (single vs grid, rows/cols, row/column names) and
shows the slot's generator prompt with a copy button ("what to ask the image generator
for this"). So break states only appear on bricks; a ball slices as one piece named
`ball`, not intact/hit/cracked/shattered. This is the per-type spec shared by generation
and slicing.

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

## Wiring a game to the library (the reusable pattern)

Breaker is the first game wired (see `public/breaker-engine.html`). The pattern, which
repeats for any game:
1. On load, if a switch is present (Breaker uses `?libtheme=<theme>`), fetch
   `/api/asset-studio?manifest=1&game=<game>`.
2. Filter slugs to that theme and group the `material_state` pieces into a pack
   (`{materials, bricks:{mat:{intact,hit,cracked,shattered}}, ball, paddle, bg}`).
3. Feed that pack into the game's existing art path. Breaker slots it in through
   `activeTheme()`/`themeAssets()` as a virtual `"__lib"` theme, and the draw
   functions (`drawThemedBrick`/`drawShatters`/`drawThemedBall`/`drawThemedPaddle`)
   branch on `A.lib` to draw the individual pieces.
4. Gate it so it can't affect normal play: everything is behind the switch and every
   draw path falls back to the built-in art if a piece isn't loaded yet.

Naming matters: the `material_state` convention (from the Upload tab's row/column name
fields) is what lets a game group four states into one animated brick. Test URL:
`/breaker-engine.html?libtheme=candy` after keeping candy `material_state` pieces to
game "breaker".

To add art to another game, repeat steps 1-4 against that game's own draw code.

## Worlds layer (reskin a game, no code)

A "world" is a full set of art for a game (its bricks/ball/paddle/background), which
is just a theme name under that game in the library. The Worlds tab in
`asset-library.html` lists the worlds discovered for a game (from the manifest's theme
segment) plus a "Built-in art" option, and lets you set which one is active. The
active world is stored per game via the endpoint:
- `POST {action:"set-world", game, world}` (empty world clears back to built-in).
- `GET ?world=<game>` -> `{world}`. Stored in `image_cache` as `kind="setting"`,
  `cache_key="setting:world:<game>"` (base64 world name). No migration.

Breaker reads this on load (`loadLibrary()` builds `LIBPACKS` for every world, then
picks the active one from `?libtheme=` first, else the saved setting) and applies it
as the `"__lib"` theme over campaign play. So the loop is: make art in Create/Upload →
keep it under a world name → Worlds tab, set it active for the game → the game is
reskinned. Same wiring copies to Sling next (read active world, feed its draw code).

## Levels layer (reskin a level / add a level)

The Worlds tab is now a game + levels manager. Per game it shows a default world and a
list of levels; each level can be assigned a world (reskin that level), and you can add
a level (name + layout template + 1-5 difficulty). Saved via:
- `GET ?levels=<game>` -> `{levels:[{name,world,builtin,template,difficulty}]}`
- `POST {action:"set-levels", game, levels}` (stored `image_cache` kind="levels").

Engine reads (all gated, safe fallback to built-in art):
- Breaker (full): `applyLevelsConfig()` sets each built-in level's `_world` and appends
  new levels from the template (`TPL` map -> cols/rows/pattern) + difficulty. `curWorld()`
  picks the current level's world, else the default, else built-in. Appended levels may
  need a reload to show in the picker.
- Survival (reskin): `loadSurvivalWorld()` swaps sky (`bgFor`), hero (`drawHero`), and
  enemy cutouts (`sdGet`) for the assigned world's pieces (named bg/hero/enemy_*).
- Sling (reskin): swaps the backdrop scene (`drawBg`) and the flung pals
  (`drawSquadFace`) for the world's background + character pieces.

Naming for each game's world slots: Breaker = `material_state` bricks + ball/paddle/bg.
Survival = `hero`, `enemy_*`, `bg`. Sling = `bg`/background + character pieces (pals).
Per-level worlds + template new-levels are full on Breaker; Sling/Survival apply the
world game-wide for now (per-level + new-level layouts for those two are the next step).

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
