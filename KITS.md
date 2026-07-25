# KITS.md — the add-a-kit loop

How a Kenney kit gets from "Mike owns it" to "a kid can tap it in the editor".
Phase KP. Read this before touching anything under `public/kenney/`.

## The short version

Mike owns **Kenney Game Assets All-in-1 3.5.0** (CC0, commercial use, no credit
required) — 241 kits, 40,521 pieces. All 241 are **browsable** in the app. Only the
ones we have deliberately curated are **added** (usable in a game). The gap between
the two is closed by one loop:

1. Mike taps **Add to app** on a kit that is not added — either in the editor
   (Library → **Add a kit**) or on Browse (`/asset-library.html` → Kits).
2. That files **one planner card**, tagged `[kit:<slug>]`, and does nothing else.
   No art moves. No game changes. The kit stays browsable while he waits.
3. The next build session picks the card up, curates the kit, and ships it.
4. The kit flips to **added**, its pieces appear under **My Kits** in every
   editor Library picker, and the session flags itself for Mike's review.

**Asking is free and never blocks.** A requested kit still shows its preview, its
piece count, and where it lives in the bundle on Mike's Mac, so he can go look at
the real art while the card waits.

## The pieces of the loop, and where they live

| Part | File |
| --- | --- |
| The catalog of all 241 kits | `public/kenney/kenney-kits.json` (generated) |
| The catalog builder | `scripts/build-kenney-kits.mjs` |
| Added kits | `public/kenney/kits/index.json` + `public/kenney/kits/<slug>/` |
| Ask, read back, and file the card | `public/buildable-library.js` (`catalogKits`, `kitRequests`, `requestedSlugs`, `requestKit`) |
| The editor's shelf + Add a kit | `public/editor.html` (`pickLibrary` → `drawKitShelf`) |
| Browse's Kits section | `public/asset-library.html` (`kitsSection`) |
| Where the card lands | `api/planner.js` → `planner_tasks` |
| The proof | `qa-kits.mjs` |

Both surfaces call the **same** `BuildableLibrary.requestKit`, so the card's shape
can never drift between them. Do not write a second one.

## Session recipe — you have been handed a `[kit:<slug>]` card

1. **Find the open cards.** They live in `planner_tasks` with `target = 'Kits'`.
   From a session, read them with the Supabase MCP (project `fmguhfmfntvohtnccmap`):

   ```sql
   select id, description, done from planner_tasks
   where description ilike '%[kit:%' and done = false order by created_at;
   ```

   The sandbox cannot reach the live domain, so do not try to `curl /api/planner`.

2. **Get the art.** The card names the bundle folder. Stage it from Mike's Mac:
   `Buildable MVP/Kenney Game Assets All-in-1 3.5.0/<folder>`.

3. **Look before you name.** Kenney ships files as `packName_tileNNN.png` with no
   meaning attached. Crop from the `@2` tilesheet (it is a plain grid: index =
   `row*cols + col + 1`), build a **labelled contact sheet, and actually look at
   it** before writing a single name. Names are for kids, never `kenney_tile042`.

4. **Curate, do not dump.** Aim for the 50–100 pieces that are genuinely useful.
   Trim sprites to their alpha bounding box; keep ground/terrain squares at the
   full tile.

5. **`kind` decides which slot a piece is offered to.** `BL.kindsForSlot`: a slot
   with `role:"background"` gets `world` only; every other slot gets `character` +
   `element`. So tag ground/road/plate tiles `world` and props `element`. Get this
   wrong and the piece is invisible everywhere it makes sense.

6. **Write the files:**

   ```
   public/kenney/kits/<slug>/kit.json     { slug, name, license, dim, theme, pieces:[{file,name,kind,theme}] }
   public/kenney/kits/<slug>/*.png
   public/kenney/kits/<slug>/LICENSE.txt  (copy the pack's own License.txt)
   ```

   then add the slug to `public/kenney/kits/index.json`.

7. **Re-stamp the catalog** — `added` is derived from the files, never hand-edited:

   ```
   node scripts/build-kenney-kits.mjs --refresh-added --repo .
   ```

8. **Prove it:** `node qa-kits.mjs .` must be ALL PASS.

9. **Close the card** (`done: true` on that `planner_tasks` row) and flag the
   session `needsReview` so Mike knows there is something new to look at.

## Rules that have already bitten someone

- **The bundle's own `assets.json` lies.** It skips the loose PNG/model folders —
  Tower Defense reads as 3 files there and is really 303. The builder walks the
  real folders. Never trust the bundle index for counts.
- **Added means files, not a flag.** A kit is added when
  `public/kenney/kits/<slug>/kit.json` exists. Do not hand-edit `added` in the
  catalog.
- **One path per slug.** `<category-slug>__<pack-slug>`, e.g.
  `2d-assets__tower-defense`. An early planner card said
  `public/packs/kenney-tower-defense/` — that path is dead. Do not resurrect it.
- **Pale art reads as an empty card.** Kenney's smoke/dust/blast sprites were
  curated in and then cut: near-white overlays looked like broken tiles on the
  light shelf. `qa-kits.mjs` now fails on any piece that faint.
- **Assigning a kit piece uses the same road as any other asset** — the editor's
  `/api/asset-studio` `action:"import"`. There is no second import path, and
  adding one would be a bug.

## The proof kit

**Tower Defense** (65 curated pieces) is the worked example, and it is dressed into
Castle Guard: `public/castle-guard.html`'s `applyDressing(art)` lets a manifest
`art` slot name a library piece for a prop. Empty slot keeps the built-in art, a
piece that fails to load keeps it too, animated sheets are not dressable. Read that
before dressing a second game.
