# ART-STUDIO.md — building Buildable Art Studio (a creative maker, built like a game)

**Read [`BUILDING-A-GAME.md`](./BUILDING-A-GAME.md) first.** The Art Studio is not a game,
but it is built the *same way*: a **Track B hand-authored engine** (`public/art-studio.html`)
that draws/sounds/feels through the shared engine libraries, pulls art + audio from the shared
library with drawn/synth fallbacks, creates **new bespoke ElevenLabs sounds** for the company
library, saves to Supabase, gets a vercel route + a tile in `BuildableKids.jsx`, is QA'd, and
logged. Same loop, different north star: instead of "always winnable," the goal here is
**"always makes something a kid is proud of."**

> The asset rule still rules: anything we build — a brush, a stamp set, a sound, a saved
> drawing — should be **storable, trackable, and reusable** by the next creation. The stamp
> brush *is* the shared character/asset library; the brush sounds grow the company sound
> library; saved drawings ride the same save/publish rails as songs, stories, and games.

---

## What we're building (v1 scope: **Core + Kaleidoscope**)

A big, finger-friendly drawing canvas where every tool is a little toy with its own sound.
v1 ships:

1. **The canvas + the basics** — full-screen drawing surface, a fat color palette, brush-size
   slider, **undo / redo**, eraser, and clear-all (with a friendly "are you sure?").
2. **Brush personalities (each with its own sound)** — crayon, marker, paintbrush, pencil,
   chalk, spray can, and a neon-glow brush. Each *feels* and *sounds* different (see §3).
3. **Magic: rainbow + glitter** — a rainbow brush whose color drifts as you drag, and a
   glitter/sparkle brush that drops twinkles (BM particles) with a chime.
4. **Kaleidoscope / mirror mode** — one toggle mirrors every stroke 2 / 4 / 8 ways around the
   center. The biggest wow-for-cheap feature: any scribble becomes a symmetrical masterpiece.
5. **Sticker-stamp brush** — "paint" with the existing creature/sticker art from the shared
   library. Tap to drop a stamp; the whole asset library instantly becomes stickers, no new
   art required.
6. **Save to my gallery** — projects save per kid (same model as saved stories/games), each
   with an **auto thumbnail derived from its own art**, reopenable across devices.
7. **Publish & share to family** — a kid can publish a drawing to the family gallery (same
   publish flag + hearts rails as songs/stories). Confetti + a happy sound on save.

**Deliberately deferred to v2** (noted so we build v1 without painting ourselves into a corner):
coloring-book mode (fill library outlines), flipbook mini-animation, and "use this drawing as
a character" in a story/game. The data model below leaves room for all three.

---

## Step 0 — track & shape

This is **Track B** (hand-authored engine, one static `public/art-studio.html`, launched
full-screen in an iframe like Typing/Chess). It is **not** a Track A generated game and not a
"level" engine — there's no win condition, no level picker. So:

- It uses **BR / BA / BM** (drawn art, sound, FX) exactly like the game engines.
- It does **not** need the level-card part of **BS**. It still uses BS for the shared *shell*
  feel where it helps (title + hero + sound toggle + back), but it shows a **tool tray**, not a
  level picker. Keep a tiny local fallback if BS doesn't expose a "blank canvas" mode yet —
  don't fork BS markup. (If we add a `mode:"studio"` to BS later, adopt it; until then the
  studio owns its own tool tray DOM and that's fine — note it in `GAME-LOOK.md`.)
- There is **no QA "all levels win"** sim. The QA hook instead asserts the *tools and the
  save/restore round-trip* work headlessly (see §7).

---

## Step 1 — content as data, not code

One `STUDIO_CONFIG = window.STUDIO_CONFIG || {…}`, so adding a brush or a sticker set is editing
data, never engine code:

```js
const STUDIO_CONFIG = {
  brushes: [
    { id:"crayon",  name:"Crayon",  sound:"art_crayon", texture:"waxy",   minW:6,  maxW:40 },
    { id:"marker",  name:"Marker",  sound:"art_marker", texture:"smooth", minW:8,  maxW:48 },
    { id:"paint",   name:"Paint",   sound:"art_paint",  texture:"wet",    minW:10, maxW:64 },
    { id:"pencil",  name:"Pencil",  sound:"art_pencil", texture:"fine",   minW:2,  maxW:16 },
    { id:"chalk",   name:"Chalk",   sound:"art_chalk",  texture:"grain",  minW:8,  maxW:44 },
    { id:"spray",   name:"Spray",   sound:"art_spray",  texture:"spray",  minW:14, maxW:80 },
    { id:"neon",    name:"Neon",    sound:"art_neon",   texture:"glow",   minW:6,  maxW:36 },
    { id:"rainbow", name:"Rainbow", sound:"art_marker", texture:"smooth", rainbow:true },
    { id:"glitter", name:"Glitter", sound:"art_glitter",texture:"sparkle", fx:"twinkle" },
  ],
  palette: ["#ff4d4d","#ff9f1c","#ffd23f","#2ec4b6","#3a86ff","#8338ec","#ff70a6","#000","#fff"],
  mirror:  { options:[1,2,4,8], default:1 },          // 1 = off
  // sticker sets are PULLED from the shared library at render (see §3), not hard-coded here
  stickers:{ themes:["forest","ocean","space","candy"], fallback:"drawn" },
  canvas:  { bg:"#ffffff", maxUndo:40 },
};
```

The texture string is the only thing the renderer needs to switch brush feel — keep brush
*behavior* in BR (see §3) so the next maker can reuse "a waxy crayon line."

---

## Step 2 — reuse mechanics; store new ones

The studio's "mechanics" are mostly **drawing behaviors** and **FX**, so they live in BR/BM
rather than the `game_mechanics` table (that table is for gameplay rules — there are none here).
Before inventing, check what BR/BM already do:

- **FX/juice → BM** (already shared): `BM.burst()` for the glitter twinkles, `BM.pop()` for a
  stamp's little "boing," confetti on save = `BM.burst()` scaled up. Don't copy a particle loop.
- **New reusable drawing behaviors → BR.** A "waxy crayon stroke," a "spray-can scatter," a
  "neon glow line," and the **kaleidoscope mirror transform** are genuinely reusable (a future
  coloring-book or a "draw your own sprite" tool will want them). Add them to
  `buildable-renders.js` as e.g. `BR.stroke(ctx, {texture, points, color, width})` and
  `BR.mirror(ctx, n, drawFn)`, and note them in `MECHANICS.md` §9 (the FX/behavior catalog)
  so the next maker reuses them instead of re-deriving.

If a behavior is one-off and truly studio-only, keep it in `art-studio.html` — but the four
above are not one-off.

---

## Step 3 — pull art AND audio from the library, with a fallback

**Stickers (art).** The stamp brush reads the shared library — characters via
`/api/list-characters`, elements/creatures via `/api/list-assets?theme=<forest|ocean|space|candy>`.
Reference by url. **Always** keep a drawn fallback: if the library is unreachable, fall back to a
small set of `BR.*` drawn shapes (star, heart, flower) so the stamp brush can never be empty.

**Brush sounds (audio).** This new engine is the moment to **CREATE fresh bespoke brush sounds**
and register them so every future creative tool can reuse them. Add to `SOUNDS` (and a duration in
`DURATIONS`) in **`api/sfx.js`**, following the existing one-shot style ("Short … single hit, no
music, no voices"):

```js
// ---- Art Studio — bespoke brush + UI SFX ----
art_crayon:  "Short soft waxy crayon scribble scratch on paper, gentle, single hit, no music, no voices",
art_marker:  "Short soft squeaky felt-tip marker stroke gliding on paper, single hit, no music, no voices",
art_paint:   "Short soft wet paintbrush swish stroke, gentle splatter, single hit, no music, no voices",
art_pencil:  "Short light pencil sketching scratch on paper, fine and soft, single hit, no music, no voices",
art_chalk:   "Short soft dusty chalk drag on a board, gentle grain, single hit, no music, no voices",
art_spray:   "Short soft spray-can hiss puff of paint, single hit, no music, no voices",
art_neon:    "Short soft electric neon hum zap with a bright shimmer, single hit, no music, no voices",
art_glitter: "Short delicate sparkly glitter twinkle shimmer dropping, magical, single hit, no music, no voices",
art_stamp:   "Short cute soft cartoon stamp thunk with a tiny boing, single hit, no music, no voices",
art_fill:    "Short happy watery paint-bucket splash fill, single hit, no music, no voices",
art_undo:    "Short soft reverse whoosh swipe, gentle, single hit, no music, no voices",
art_save:    "Cheerful short sparkle save chime, bright and proud, single hit, no music, no voices",
```
…with durations ~0.3–0.6s each (`art_save` ~1.2s). Play them through **BA**
(`BA.configure({sfxBase:"/api/sfx?s=", map:{…}})`, `BA.sfx("art_crayon")`, `BA.unlock()` on the
first touch — the iPad audio-unlock rule). Optional gentle **music-box background loop** while
drawing (same as Stories), toggleable; **BA** synth stays a silent fallback only — never the
product. (ElevenLabs only for any real music.)

> Sound rule reminder: a kid drawing just *consumes* the catalog; **building this new engine is
> the moment to create the sounds** so the library grows for the next tool.

---

## Step 4 — wire sound + FX + the magic features

- **Brush stroke** → `BR.stroke(...)` with the brush's `texture`; play `BA.sfx(brush.sound)`
  (throttled to ~1 every 120ms so a long drag doesn't machine-gun the sound).
- **Rainbow brush** → cycle hue along the stroke; **glitter** → `BM.burst()` twinkles + `art_glitter`.
- **Kaleidoscope** → `BR.mirror(ctx, n, drawStroke)` re-draws each stroke `n` ways around center.
- **Sticker stamp** → on tap, draw the library image; `BA.sfx("art_stamp")` + a small `BM.pop()`.
- **Save** → confetti `BM.burst()` + `BA.sfx("art_save")`.

---

## Step 5 — "always makes something good" (the studio's version of always-winnable)

The game rule is "a 4–8-year-old can always finish." The studio equivalent:

- **You can't make an ugly mess you can't escape** — undo/redo always available, clear-all
  behind a friendly confirm, eraser always one tap away.
- **Defaults look great** — kaleidoscope + a bright default palette means a random scribble
  comes out pretty. Glitter and rainbow are "instant delight" tools placed up front.
- **Nothing can be lost** — autosave a working snapshot to memory so a misclick or a closed tab
  doesn't erase 20 minutes of work; the explicit Save just promotes it to the gallery.
- **No empty states** — if the library is down, brushes + drawn-fallback stamps still work.

---

## Step 6 — save, gallery & publish (the data model)

Mirror `saved_stories` exactly (same device-lane + family-RLS pattern), as an idempotent
`db/create-saved-art.sql` for **you** to run (agents never run destructive DB ops):

```sql
create table if not exists saved_art (
  id              bigint generated always as identity primary key,
  art_id          text not null unique,        -- client-stable id
  device_id       text not null,               -- anonymous device lane
  kid_profile_id  uuid references kid_profiles(id) on delete set null,
  kid_name        text,
  title           text,                         -- kid-typed or auto ("Pip's Rainbow")
  theme           text,                         -- drives the auto thumbnail word
  image_b64       text,                         -- the flattened PNG (the drawing itself)
  art             jsonb not null,               -- replayable: strokes[], stamps[], mirror, palette
  published       boolean   default false,      -- family-gallery publish flag (mirrors stories)
  published_at    timestamptz,
  play_count      integer   default 0,
  heart_count     integer   default 0,
  created_at      timestamptz not null default now()
);
create index if not exists saved_art_device_idx    on saved_art (device_id, created_at desc);
create index if not exists saved_art_kid_idx        on saved_art (kid_profile_id);
create index if not exists saved_art_published_idx  on saved_art (published) where published;
-- RLS: copy the saved_stories family policy verbatim (service key bypasses for device lane).
```

Two columns on purpose: **`image_b64`** is the finished picture (instant thumbnail + share, no
re-render needed) and **`art` (JSONB)** is the *replayable recipe* (strokes/stamps/mirror) — so a
future "remix" or "watch it draw itself" or "turn into a character" works without re-painting.
Add `'art'` to the `creation_hearts` `kind` check and reuse the existing publish/hearts rails.

**Thumbnails:** the list/gallery thumbnail is auto-derived from the creation's own art
(`api/_thumbs.js` model) — prefer the stored `image_b64`; fall back to the `theme` word. A
published drawing can set `preview_image_url`.

---

## Step 7 — QA (the studio flavor)

No "all levels win." Instead export `window.ART_GAME` (keep the `*_GAME` naming until the shared
hook lands) with:

- `sim(steps)` — programmatically lay down strokes with several brushes, toggle each mirror
  setting, drop a stamp, undo/redo, and assert the canvas pixel count changed and no throw.
- `roundtrip()` — serialize to the `art` JSON, clear, restore from JSON, and assert the canvas
  matches (the save/restore contract — the thing most likely to silently break).

Add `qa-art.mjs` (model: `qa-breaker.mjs`) driving these in Node; run **before and after** every
change. Also screenshot the live canvas in the iframe to confirm it actually renders (not just a
200) — same as the game engines.

---

## Step 8 — route it, give it a face, ship & log

1. **Route** — add an explicit `public/art-studio.html` route in `vercel.json` **before** the
   `/(.*)` → `landing.html` catch-all (the documented gotcha), with a `?v=` cache-bust.
2. **Tile** — add an "Art Studio" tile/launch path in `src/BuildableKids.jsx` (full-screen
   iframe, like Typing/Chess). **No emojis** — use a `BR` drawn icon or a library image.
3. **Ship** — commit to `main` via real git (authenticated clone, rebase onto main, push — not
   web-editor paste), Vercel auto-deploys in ~1–2 min.
4. **QA the live deploy**, then log a dated entry in `SESSION-LOG.md` + the README session log.
   (Required for every change; bust edge cache with `?cb=<n>` when QA-ing the live API.)

---

## The non-negotiables (inherited — they apply here too)

- **Kids' product**, age-appropriate always; if we ever add free-text titles, keep them private
  to the family by default and run the same moderation as elsewhere.
- **No emojis** in the engine — `BR` drawn art or library images only.
- **Library-first, always with a fallback** — stamps from the shared library; drawn fallback so
  an outage can't empty the toolbox.
- **One shared everything** — sounds register in `api/sfx.js`; FX go through `BM`; new drawing
  behaviors go into `BR`; saves/publish/hearts ride the existing rails. Don't fork.
- **Additive migration / never delete a live asset; never handle secrets or run destructive DB
  ops** (ship `db/create-saved-art.sql` for the owner to run).
- **Canonical source is the repo** — build from `public/`, not loose root copies.

---

## The v1 build checklist (in order)

1. `api/sfx.js` — add the 12 `art_*` sounds + durations.
2. `public/buildable-renders.js` — add `BR.stroke({texture})` + `BR.mirror(n, fn)`.
3. `public/art-studio.html` — the engine: canvas, tool tray, brushes, palette, undo/redo,
   kaleidoscope, sticker stamp, autosave, `window.ART_GAME` QA hook.
4. `db/create-saved-art.sql` — the table (you run it) + `'art'` added to `creation_hearts`.
5. `api/save-art.js` / list / publish — or extend the existing save endpoints to handle `art`.
6. `vercel.json` route + `src/BuildableKids.jsx` tile.
7. `qa-art.mjs` — sim + roundtrip; run before/after.
8. Ship to `main`, QA the live iframe, log it.

**The loop, restated for a maker:** blank canvas as data on a shared engine → reuse BR/BM,
store new brushes/behaviors → pull stamps + create new sounds for the library → guarantee
"always proud of it" → QA the save round-trip → route + tile → log.
