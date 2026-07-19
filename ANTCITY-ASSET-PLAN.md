# Ant City - Asset Plan (approved)

Direction: **Sunny Meadow**. Style: **A, Storybook Cartoon** (approved by Mike,
Session 1 follow-up). Warm and soft, friendly big-eyed ants. The above-ground scene
reuses existing Sling and Kenney art; the ant cast and the underground are generated
to match. Every slot keeps a drawn `BR` fallback so a missing file never breaks play.

This plan fills the placeholder IDs already in `public/antcity/manifest.json`.

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
