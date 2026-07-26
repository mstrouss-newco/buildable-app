# EXHIBIT-MANIFEST.md — Kidspedia exhibit contract

Every Kidspedia exhibit is a data file poured into a shared template. Templates are built once, like game engines. Exhibits are authored content, like game manifests. This file is the contract for both.

**The golden rules:**
1. Templates are code, exhibits are data. A new exhibit never requires a code session.
2. Kids only ever see exhibits with status "approved". No exception, ever. AI drafts, a human approves, facts are human-verified before approval.
3. Every visual is an art slot (asset library ID). Every fact can be read aloud. Every quiz question is tagged for the question bank and reports to the learning ledger.
4. One exhibit file = one exhibit = one URL: /explore/{exhibitId}.

---

## Templates (built once, this is the full planned stable)
- `orbit-explorer` — 3D. Bodies orbiting a center, drag to spin, pinch to zoom, tap to select. For: solar system, the atom, Earth and Moon, Jupiter's moons, comets.
- `object-viewer` — 3D. One model to rotate and tap hotspots. For: the heart, T-Rex skeleton, volcano, space station. (The repo's existing models folder is a head start.)
- `layers-cutaway` — Peel or slide through layers, tap each. For: inside the Earth, skin, a tree trunk, the ocean depths.
- `size-comparator` — Line things up against familiar objects. For: whales vs buses, planets vs Earth, dinosaurs vs houses.
- `timeline` — Scrub through time with tappable moments. For: dinosaurs to now, a butterfly's life, history of flight.
- `habitat-scene` — A scene with tappable inhabitants. For: savanna, coral reef, backyard bugs, rainforest layers.
- `labeled-diagram` — Tap the parts of one picture. For: parts of a flower, the water cycle, a castle.
- `topic-book` — BUILT (Session TB1, `public/topic.html`). A photo-real picture book: a cover spread, then 4-5 swipeable pages, each one full-width photograph plus 2-3 fun facts, then a finish spread. Every page has a dog-ear corner the kid can fold to save it. For any topic where the best experience is simply looking at a great picture and learning three true things: sharks, dinosaurs, the moon, volcanoes, bugs, castles, weather, the human body.

3D rule: a template is 3D only when the dimensionality itself teaches (orbits, objects, layers). Everything else is flat.

## Exhibit file: shared fields (every template)
- `id` — URL name (solar-system, the-atom)
- `title` — display name
- `template` — one of the template IDs above
- `topic` — one of the core topics (space, animals, dinosaurs, ocean, human-body, weather, bugs, machines)
- `ageBand` — e.g. 5-8, 8-12 (tunes fact length and read-aloud pacing)
- `status` — draft | in-review | approved. Only approved is ever served.
- `skills` — learning ledger tags this exhibit practices (e.g. space-facts, reading)
- `heroArt` — asset ID for the Explore shelf card
- `ambient` — (optional) an ambient-sound asset ID from the shared audio library (an `/api/sfx` key, e.g. `space`, `waves`, `forest`). The template plays it softly on a loop as the exhibit's bed. The shell's Sound button mutes/unmutes it; it never autoplays before the first tap.
- `sources` — where the facts were checked (for the reviewer, never shown to kids)

## Exhibit file: items (the tappable things)
Each item, whatever the template calls it (a planet, a layer, an animal, a moment):
- `name`
- `fact` — one great paragraph, written to be read aloud, kid voice, no jargon
- `facts` — (optional) a short list of 3-4 kid-voiced facts for this item, each its own read-aloud-ready paragraph. The card shows one at a time with an "Another fact" button that cycles through them, and "Read to me" reads whichever fact is showing. Backward compatible: an item with only `fact` still works and is treated as a one-fact list. When `facts` is present, `facts[0]` must equal `fact` so the single-`fact` field, the narrator clip, and older readers stay in sync.
- `factAudio` — (optional) audio asset ID for this fact, the id `{exhibitId}-{itemId}` (e.g. `solar-system-sun`). When present, the "Read to me" button plays this pre-generated narrator clip via `/api/explore-audio?id=...`; when it is missing (or the clip is not made yet) the button falls back to the browser's built-in voice, with no waiting. Clips are made by the generation step below, never live while a kid waits. (With a `facts` list the clip covers the primary fact only, `facts[0]`; any "Another fact" is read by the browser voice, still with no waiting.)
- `stats` — exactly two: label + value, short enough for a tile
- `asks` — two "ask more" questions, answered from the library first
- `quiz` — one or more tagged question IDs from the question bank
- `art` — asset ID(s) the template needs (a surface texture, a sprite, a photo)
- template-specific numbers (orbit radius and speed for orbit-explorer, layer order for cutaway, position for habitat, date for timeline, real-world size for comparator)

## Exhibit file: the `topic-book` template (Session TB1)
A topic book replaces the generic `items` list with a book:
- `cover` — `{ art, artAlt, blurb }`. The cover photo, what it shows (for screen readers), and one warm line under the title.
- `pages` — 4-5 page objects, in reading order. Each page is:
  - `id` — short and stable. **Dog-ears are keyed on it, so never renumber or rename a shipped page id.**
  - `title` — the page heading a kid reads.
  - `art` — a ROOT-ABSOLUTE path to the page photo (`/explore/topic-photos/{topic}/{topic}-1.webp`). A relative path is swallowed by the `/explore/(.*)` route.
  - `artAlt` — a plain description of the photo.
  - `facts` — 2-3 facts, each `{ text, source }`. **Every fact carries its own source**, shown under it as "Source: …", because a topic book's whole promise is that a grown-up can check any line on any page. This is stricter than the shared `sources` list, which still applies at the exhibit level.
  - `factAudio` — (optional) the narrator clip id, by convention `{exhibitId}-{pageId}`. Covers `facts[0]` only; any other fact is read by the browser voice, so nobody waits.
  - `quiz` — question-bank ids for the "Quick quiz" bridge.
- `finish` — `{ title, blurb }`. The last spread, after the final page.
- `shelfColor` — the book's signature colour, used for the painted fallback and the bookshelf card.
- `exhibit` — (optional, Session TB2) the "visit the exhibit" tie-in: `{ id, title, label }`, naming ONE Kidspedia exhibit about the same subject. The template draws the button on the cover and the last page **only after it confirms the target exhibit exists and is `approved`**, so a book whose exhibit has not been built yet simply keeps an empty link slot — there is never a button to a dead end. The planned tie-ins, enforced by `qa-topic.mjs`, are: Wild Weather → `make-it-rain` (the Weather Lab), The Deep Ocean → `ocean-deep` (Journey to the Deep), and Volcanoes / The Rainforest / How Plants Grow / Your Amazing Body once planner phases VL / RT / GL / BA build their exhibits.

## The richer composed page (Session RP1)
A topic-book page now comes in two shapes and **the BOOK chooses which**. A page that
names none of the fields below renders through the original one-photo path, byte for
byte as before — that is what lets the 19 books still waiting for their upgrade keep
working while `main` auto-deploys. `qa-topic.mjs` fails if that gate is ever removed.

A page opts into the richer shape by carrying `layout` (or per-fact `art`, or an
`infographic`). It then shows **three photos and every fact at once**, each fact with
its own picture, its own source line and its own round speaker button. Nothing hides
behind "Another fact".

- `layout` — one of `speed`, `long`, `then-now`, `close-up`. **The layout echoes the
  subject**, it is not decoration: `speed` slants the photo and prints one giant number
  (fast things), `long` runs a panorama and a dashed track down the page (long things),
  `then-now` prints a ghost year and sets a sepia THEN beside a bright NOW (history),
  `close-up` cuts circle crops the words wrap around (small details).
- `stat` — `{ value, unit }`. The giant number over the photo. `speed` pages only.
- `ghostYear` — the huge faint year printed behind the words. `then-now` pages only.
- `facts[].art` / `facts[].artAlt` / `facts[].caption` — that fact's own photo. **If a
  fact has no `art` of its own the template shows a detail crop of the page photo**
  rather than a blank hole, and marks it `data-crop="1"` so QA can count how many
  stand-ins a book still has. Trains is the pilot and is currently all stand-ins.
- `infographic` — the "Wow chart": a white card with a thick brand border, a small tilt
  and a "Wow chart" pill. **Picture first.** The entities are pictures (a drawn kid, a
  photo chip, a football field with its yard lines); bars only ever carry magnitude, and
  every number is labelled directly. Four kinds, all data-driven:
  - `compare` — `rows[] = { icon | art, label, value, display }`. Bar width is `value`
    over the largest `value`; `display` is what a kid reads.
  - `fields` — `rows[] = { label, count, display }`. Draws `count` football fields (the
    first ten, then "and N more").
  - `timeline` — `stops[] = { year, label, icon | art }`. Photo chips over a dashed line.
  - `diagram` — `name` picks a drawn diagram the template owns (`cone-wheel` today).
  Every chart carries its own `source`, because a chart is a claim like a fact is.
  Drawn glyph names: `kid`, `car`, `train`, `bullet`, `maglev`, `freight`, `subway`.
- **US units and US spellings** in every converted book. `qa-topic.mjs` fails a book
  that names a `layout` and still says kilometres, or spells it colourful.

Adding a new layout, chart kind, glyph or diagram means adding it to `RICH_LAYOUTS`,
`GLYPHS` or `DIAGRAMS` in `public/topic.html` **and** to `RP_LAYOUTS` / `RP_CHARTS` /
`RP_DIAGRAMS` in `qa-topic.mjs`, or the book fails QA rather than silently losing a
picture.

## The bookshelf (Session TB2)
`public/kidspedia.html`, served at `/explore/kidspedia`, is the front door to the books:
- **The shelves.** `public/explore/bookshelf.json` holds the shelf ORDER — all 20 planned topic ids, grouped into named shelves, listed from day one whether or not their file exists yet. The page loads each id's own `/explore/{id}.json` and shows a cover **only when that file says `status: "approved"`**, so an in-review book is invisible to kids even though its id is on the list, and a new book takes its place on the right shelf the moment it is approved, with nothing else to wire up. Never rename a shipped id: dog-ears are keyed on it. `qa-kidspedia.mjs` fails if a topic book in the repo is missing from the shelf order, or if a listed id would be swallowed by the `/explore/(.*)` catch-all.
- **My dog-ears.** The pages this kid folded a corner on, across every book, read from `/api/saved-pages` on the kid lane with the localStorage mirror as the instant, offline-safe fallback. Each row deep-links to `/explore/{book}?from=shelf&page={pageId}`: `topic.html` opens straight at that page, and its Back button returns to the bookshelf rather than all the way Home. A dog-ear whose book is not approved, or whose page id no longer exists, is dropped rather than shown as a dead link.
- **On Home.** The books do NOT each get a card on Home's Explore shelf. They live behind one "Kidspedia Books" card (`EXHIBIT_CATALOG` entries carry `template: "topic-book"`; `exploreShelfItems()` in `src/BuildableKids.jsx` swaps them for the single card), and that card only appears once at least one book is approved.

**Dog-ears.** The corner-fold on each page saves that page for the KID, not the device: `/api/saved-pages` writes to the `saved_pages` table (`db/create-saved-pages.sql`) on the `kid:<profileId>` lane when a kid is signed in, and an honest device-only lane when nobody is. localStorage is a fast mirror only, never the record. Unfolding sets `saved=false`; it never deletes a row.

**Photo pipeline.** Topic photos are generated by Mike (DALL-E, one shared style line so the whole shelf looks like one book), then compressed to WebP at 2x retina width and committed to `public/explore/topic-photos/{topic}/`. They are served statically with an immutable cache header via a route placed BEFORE the `/explore/(.*)` catch-all. Until the WebP files land, the template paints a titled colour panel in their place, so a book is never a white hole — and `qa-topic.mjs` reports the missing files as warnings rather than pretending they are there.

## Audio: narration, ambient, and tap feedback
Three sound layers, all optional and all degrading gracefully:
- **Fact narration (`factAudio`).** Each item may carry a `factAudio` asset ID. "Read to me" plays that pre-generated clip in the one configured narrator voice. If the id is absent, or the clip hasn't been generated, or playback fails, the template instantly uses the browser's built-in voice instead. Kids are NEVER made to wait on a live generation.
- **Ambient bed (`ambient`).** An exhibit may name one soft looping ambient from the shared audio library (an `/api/sfx` key). It plays quietly under the exhibit and starts only after the first tap (audio-unlock rule). The shell's Sound button mutes/unmutes it.
- **Tap feedback (Feel Kit).** Every tap on a chip or a body fires `Feel.tap()` (a soft click + a light haptic) from the shared Feel Kit, so exhibits feel like the games. Tap sounds follow the same Sound toggle.

## Generating fact narration (server-side, ElevenLabs, one narrator voice)
Narration audio is made by a MANUAL, server-side step, never in the browser and never live while a kid waits:
- Endpoint: `GET /api/gen-exhibit-audio?exhibit={id}` (owner-run after approval; `?dry=1` reports what it would make and spends nothing; `?force=1` regenerates, gated by `EXHIBIT_GEN_TOKEN` when set).
- It loads the approved exhibit, and for every fact with no clip yet, speaks `"{name}. {fact}"` once with the one configured narrator voice (`ELEVENLABS_NARRATOR_VOICE_ID`, else `ELEVENLABS_VOICE_ID`), saving the mp3 to the audio path (cache key `exhibit-audio:{exhibitId}-{itemId}`). Generate-once + skip-if-present, so re-running costs nothing.
- The ElevenLabs key lives ONLY in Vercel env. Cost is per character, so the endpoint returns `totalCharsGenerated` for the session recap.
- After generating, set `factAudio` on each item in the exhibit file (the id `{exhibitId}-{itemId}`) and commit. The serve endpoint `/api/explore-audio?id=...` streams clips to the template and 404s (no generation) when one is missing.

## The pipeline (same machine as the question bank)
1. Draft: AI writes the exhibit file in chat or the editor, with sources.
2. Review: Mike fact-checks, tunes the voice, sets status approved. Nothing skips this.
3. Publish: approved exhibits appear on the Explore shelf and in Kidspedia answers.
Kidspedia Q&A answers from approved exhibits first ("Want to explore the whole solar system?") and uses guarded generation only for the long tail.

## Example: solar-system (orbit-explorer) — abbreviated
```json
{
  "id": "solar-system",
  "title": "Our Solar System",
  "template": "orbit-explorer",
  "topic": "space",
  "ageBand": "5-10",
  "status": "approved",
  "skills": ["space-facts", "reading"],
  "heroArt": "explore/solar-system/hero-v1",
  "center": { "name": "The Sun", "art": "explore/sun/surface-v1", "size": 3.4,
    "fact": "The Sun is a star, a giant ball of super hot glowing gas. It is so big that more than one million Earths could fit inside it!",
    "stats": [{ "label": "How hot", "value": "10,000 F outside" }, { "label": "Fun size fact", "value": "1,000,000 Earths fit inside" }],
    "asks": ["Why is the Sun hot?", "Will the Sun ever burn out?"], "quiz": ["q-space-014"] },
  "bodies": [
    { "name": "Mercury", "art": "explore/mercury/surface-v1", "size": 0.55, "orbit": 6.5, "years": 9,
      "fact": "Mercury is the smallest planet and the closest to the Sun. A whole year on Mercury takes only 88 days, so you would have a birthday every three months!",
      "stats": [{ "label": "A year lasts", "value": "88 Earth days" }, { "label": "Moons", "value": "None at all" }],
      "asks": ["Why doesn't Mercury have air?", "Is Mercury the hottest planet?"], "quiz": ["q-space-021"] }
  ]
}
```

## Example: the-atom (same template, new data) — proof of reuse
```json
{
  "id": "the-atom",
  "title": "Inside an Atom",
  "template": "orbit-explorer",
  "topic": "machines",
  "ageBand": "8-12",
  "status": "draft",
  "center": { "name": "The Nucleus", "size": 2.5,
    "fact": "The nucleus is the tiny center of an atom, packed with protons and neutrons. Almost all of an atom's weight lives here, in a space smaller than small." },
  "bodies": [
    { "name": "Electron", "size": 0.5, "orbit": 8, "years": 4,
      "fact": "Electrons are tiny sparks of energy that zip around the nucleus incredibly fast. They are so light that it takes about 1,800 of them to weigh as much as one proton!" }
  ]
}
```

## Who touches what
- Templates: built and changed only in build sessions, each born with a QA check (loads its exhibits, every item tappable, read-aloud fires).
- Exhibit files: authored in chat or the editor, live in the repo (public/explore/), only Mike flips status to approved.
- The shell: renders the Explore shelf from approved exhibits, owns URLs, pause/resume around quizzes per CARTRIDGE-CONTRACT.md.
