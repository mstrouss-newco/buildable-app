# Ant City - Asset Plan (approved)

Direction: **Sunny Meadow**. Style: **A, Storybook Cartoon** (approved by Mike,
Session 1 follow-up). Warm and soft, friendly big-eyed ants. The above-ground scene
reuses existing Sling and Kenney art; the ant cast and the underground are generated
to match. Every slot keeps a drawn `BR` fallback so a missing file never breaks play.

This plan fills the placeholder IDs already in `public/antcity/manifest.json`.

## What AC10 actually shipped for the world (September 8 2026)

The surface is no longer one composed painting. It is a **layered scene the engine
composes once and caches**: sky, far hills, a far tree line, a near hill, mid trees,
a grass bank, the worn forager trail, and near props standing on the trail line.

The pieces are the **CC0 Quaternius Stylized Nature MegaKit** models already in
`public/models/nature/`, shot into flat side-on transparent sprites by
`scripts/nature-shot.mjs` under one lighting rig and written to
`public/antcity/art/world/`:

| Sprite | Model | Manifest id |
|---|---|---|
| `tree-round-1/2/3.png` | CommonTree_1 / _3 / _5 | `antcity/world/tree-round-1..3-v1` |
| `tree-pine-1/2.png` | Pine_1 / Pine_3 | `antcity/world/tree-pine-1..2-v1` |
| `bush-flowers.png` | Bush_Common_Flowers | `antcity/world/bush-flowers-v1` |
| `fern.png` | Fern_1 | `antcity/world/fern-v1` |
| `grass-tall.png` | Grass_Common_Tall | `antcity/world/grass-tall-v1` |
| `flowers-1/2.png` | Flower_3_Group / Flower_4_Group | `antcity/world/flowers-1..2-v1` |
| `mushroom.png` | Mushroom_Common | `antcity/world/mushroom-v1` |
| `rock-1/2.png` | Rock_Medium_1 / _2 | `antcity/world/rock-1..2-v1` |

All thirteen are registered to the shared library (`community_sprites`,
`asset_id` prefix `nature/world/`) by `db/register-antcity-world-sprites.sql`, so
every other project can use them. Every one has a drawn fallback in the engine.

**Bush_Common is deliberately not used:** its texture resolves dark red, a bug in
the pack. `Bush_Common_Flowers` is the same bush with the right colours on it.

**Still open:** the HYBRID plan's hero pieces, generated through the Asset Studio to
give the world its own character on top of the kit. That needs a browser on the live
site (`/api/asset-studio`), which a sandbox session cannot reach.

The underground is layers now too — topsoil, loam, clay, pebbly stone — declared as
data in `GAME_CONFIG.soil` and in the manifest's `world.soil`, each with its own tile
(`antcity/soil/sandy-v1`, `loam-v1`, `deep-v1`, which existed as files and were
finally wired up) and its own buried things: roots, acorns, pebbles and the rare
little fossil. All decoration; none of it changes what a cell does.

## Reuse (already on the file shelf, just register to the shared library)

| Manifest ID | Reuse from | Notes |
|---|---|---|
| `antcity/surface/meadow-v1` | `public/sling/bg/` (base, hills, trees, bushes, ground, clouds) + `public/kenney/sling/props/` (mushroomRed, mushroomBrown, bush, rock, grass*) | Compose the sunny meadow surface, register as one `community_layers` row (theme forest). |
| `antcity/soil/sandy-v1` | `public/kenney/sling/props/` (sandCenter, sandMid, sandLeft, sandRight) | The sandy dirt tile. Register to `community_sprites` (theme desert/forest). |
| `antcity/prop/crumb-v1` | `public/sling/targets/acorn_idle.png` | Stand-in food crumb foragers carry (swap for generated later if wanted). |
| `winCelebration` | `shared/win/confetti-v1` | Already the shared win art. |

Reuse is CC0 (Kenney) or our own art (Sling), so hosting and modifying is fine.

## Generate (through the normal art pipeline, Style A cartoon)

| Manifest ID | What to make |
|---|---|
| `antcity/hero/queen-v1` | The queen ant (hero + buddy + win art). |
| `antcity/ant/classic-v1` | The worker ant (big-eyed, friendly). |
| `antcity/ant/ruby-v1`, `antcity/ant/emerald-v1` | Recolors of the worker for the Ant customization slot. |
| `antcity/soil/sandy-v1` (refine), `antcity/soil/deep-v1`, `antcity/soil/loam-v1` | Underground cross-section / tunnel-wall look, a darker deep-dig variant, and a Rich Loam customization variant. |
| `antcity/prop/egg-v1` | Egg + hatching baby. |
| `antcity/prop/nursery-v1`, `antcity/prop/storage-v1`, `antcity/prop/den-v1` | The three room chambers. |
| `antcity/prop/colony-v1` | Colony/anthill icon for the population missions. |
| `antcity/prop/buried-find-v1` | The buried treasure for Dig Deep. |
| `antcity/prop/dig-marker-v1` | The "dig here" path marker (can be `BR` drawn). |
| `antcity/prop/flood-v1`, `antcity/surface/meadow-rain-v1` | Rain flood overlay + a rainy meadow variant for the Rainy Day mission. |
| `antcity/surface/meadow-berry-v1` | Berry Bushes meadow customization variant. |
| `antcity/badge/v1`, `antcity/loading/v1` | Picker badge + loading screen. |

## Delivered this session (hand-crafted Style A vector set)

A cohesive cartoon starter set is done and lives in `public/antcity/art/` as clean SVG
(no API key needed, loads in the engine as images, drawn `BR` fallback still applies).
Preview: `public/antcity/art/_preview.svg`. Files and the manifest IDs they fill:

| File | Fills manifest ID |
|---|---|
| `ant-classic.svg` | `antcity/ant/classic-v1` |
| `ant-ruby.svg`, `ant-emerald.svg` | `antcity/ant/ruby-v1`, `antcity/ant/emerald-v1` |
| `queen.svg` | `antcity/hero/queen-v1` |
| `egg.svg` | `antcity/prop/egg-v1` |
| `room-nursery.svg`, `room-storage.svg`, `room-den.svg` | `antcity/prop/{nursery,storage,den}-v1` |
| `crumb.svg` | `antcity/prop/crumb-v1` |
| `buried-find.svg` | `antcity/prop/buried-find-v1` |
| `soil-tile.svg` | `antcity/soil/sandy-v1` (tiles cleanly for the huge colony) |
| `badge.svg` | `antcity/badge/v1` |

**Done in card AC9** (the Bugs Life layer): `bug-beetle.svg`, `bug-caterpillar.svg` and
`bug-grasshopper.svg`, filling `antcity/bug/{beetle,caterpillar,grasshopper}-v1`. Original
generic cartoon bugs drawn in the same Style A: round bodies, big white eyes, a small
smile, silly and never scary, and no lookalike of anything in a film. Each one has a
hand-drawn canvas fallback in the engine (`drawBugShape`), so a missing file can never
leave a bug invisible while the game is asking the kid to deal with it. The **soldier ant**
is deliberately NOT a new file: it is the drawn worker a size up with a helmet and bigger
jaws, so the ant art slot and its manifest id are untouched.

**Done in card AC4** (the follow-ups above): `surface-meadow.svg`, `surface-meadow-rain.svg`,
`surface-meadow-berry.svg`, `soil-deep.svg`, `soil-loam.svg`, `flood.svg`, `colony.svg` and
`loading.svg`, filling the last placeholder ids. `antcity/prop/dig-marker-v1` stays DRAWN on
purpose and is declared in the engine's `DRAWN_ART` list. Registered to the shared
`community_*` tables in the same session. Any piece can later be swapped for an AI-pipeline
render without touching the engine.

## Delivered via the AI pipeline (LIVE in the shared library)

Generated at high quality through the Asset Studio (Create tab, gpt-image-1) and kept, so
each is addressable now at `/api/asset-studio?asset=<slug>`. Style: glossy storybook
cartoon (the house look, matches the other games). These supersede the vector starters for
the pieces they cover; the vectors remain the drawn fallback.

| Manifest ID | Live asset slug (`/api/asset-studio?asset=`) |
|---|---|
| `antcity/hero/queen-v1` | `ant_city/queen_ant/meadow/main` |
| `antcity/ant/classic-v1` | `ant_city/worker_ants/meadow/idle_normal` |
| worker poses (9) | `ant_city/worker_ants/meadow/{idle,carrying,digging}_{normal,happy,tired}` |
| `antcity/prop/egg-v1` | `ant_city/ant_eggs/meadow/main` |
| tunnel decor (4) | `ant_city/tunnels/meadow/{entrance,junction}_{normal,decorated}` |
| `antcity/prop/nursery-v1` | `ant_city/prop/meadow/nursery` |
| `antcity/prop/storage-v1` | `ant_city/prop/meadow/storage` |
| `antcity/prop/den-v1` | `ant_city/prop/meadow/den` |
| `antcity/prop/crumb-v1` (food) | `ant_city/prop/meadow/food` |
| `antcity/prop/buried-find-v1` | `ant_city/prop/meadow/buried_find` |
| `antcity/badge/v1` | `ant_city/prop/meadow/badge` |

Notes: the meadow background also generated nicely but was too large to store (HTTP 413),
so keep using the Sling + Kenney meadow for the surface. A couple worker-sheet cells came
out off-model (one strawberry, one ant-in-a-hole); the clean poses (idle_normal,
idle_happy, the digging/carrying ants) are plenty. Still on vectors (not yet AI): the
dig-marker, colony/anthill icon, rainy-meadow + flood overlay, loading screen, and the
ruby/emerald ant + berry/loam customization variants.

## The ants themselves are drawn now (AC7)

Card AC7 changed one thing in this plan, on the evidence of a real playthrough: at
`antScale` 0.34 (about a third of a cell, which is what a swarm needs) the glossy worker
sprite reads as an orange blob on a phone. The ants are therefore **drawn** in the engine —
a clean silhouette with a dark outline, six legs, antennae, and a job-coloured marker above
the head — and the three worker poses (idle, carrying, digging) are no longer fetched.

Nothing else changed. `antcity/ant/classic-v1` is still the manifest id for the ant slot,
still resolves to `/antcity/art/ant-classic.svg`, and now also picks the drawn body colour
(`ANT_TINT` in the engine), which is how the ruby and emerald customization options work.
Putting a sprite back is a one-line change in `drawAnts`. The queen, the rooms, the crumb,
the meadow and the rest are untouched and still come from the library.

## The chain pieces (AC6, drawn vectors, live)

Card AC6 added the production chains, so four new pieces ship as clean drawn vectors in
`public/antcity/art/` with the usual `BR` fallback behind them. AI-pipeline upgrades are a
follow-up, exactly as this plan says for anything new.

| Manifest ID | File |
|---|---|
| `antcity/prop/leaf-v1` | `leaf.svg` (a cut leaf, the shape a leafcutter carries) |
| `antcity/prop/fungus-v1` | `room-fungus.svg` (the mushroom garden chamber) |
| `antcity/prop/aphid-plant-v1` | `aphid-plant.svg` (the host plant with its herd) |
| `antcity/prop/honeydew-v1` | `honeydew.svg` (a sweet drop) |

## Coverage gaps (honest)

- **Ants, eggs, rooms, buried find, badge, loading:** no ant or bug art exists in the
  library today, so all of these are net-new generation. This is the bulk of the work.
- **Underground look:** the sandy tiles exist for the surface, but a believable dug-out
  tunnel cross-section is new. Generate it.
- **Sound and music:** handled by the separate sounds card (dig, march, hatch, munch,
  rain, one meadow loop), not this plan.

## Fill method

Generate the cartoon set through the same pipeline the other games use, register each to
the shared `community_*` tables (tagged `kind` + `theme`), then swap the manifest
placeholder IDs for the real registered IDs. Reused Kenney/Sling files get registered the
same way so they load like any other library asset. Additive only; never re-path a live
asset.

## Colony-builder note (grow huge)

Because the colony grows without limit into a free-build sandbox, the underground art must
**tile and repeat** cleanly, not be a single fixed scene: the soil, tunnel walls, and each
room type need to read well when there are many of them stacked and side by side. Draw the
tunnels and rooms as repeatable pieces the engine places on a grid, and make the ant sprite
readable when it is small (a huge colony shows many small ants at once). A simple zoomed-out
"whole colony" look is a nice-to-have for the picker badge and share snapshot. This is art
guidance only; the growth math lives in the engine, not the art.
