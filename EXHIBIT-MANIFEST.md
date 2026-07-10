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
- `sources` — where the facts were checked (for the reviewer, never shown to kids)

## Exhibit file: items (the tappable things)
Each item, whatever the template calls it (a planet, a layer, an animal, a moment):
- `name`
- `fact` — one great paragraph, written to be read aloud, kid voice, no jargon
- `stats` — exactly two: label + value, short enough for a tile
- `asks` — two "ask more" questions, answered from the library first
- `quiz` — one or more tagged question IDs from the question bank
- `art` — asset ID(s) the template needs (a surface texture, a sprite, a photo)
- template-specific numbers (orbit radius and speed for orbit-explorer, layer order for cutaway, position for habitat, date for timeline, real-world size for comparator)

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
