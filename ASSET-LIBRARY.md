# ASSET-LIBRARY.md — where assets live, and where to send new ones

**Agents: read this before you create, save, or load any character, world,
element, music, or sound effect.** This is the map for the Shared Asset Library
rule in `AGENTS.md`. The goal: an asset made in ANY project (story maker, game
builder, chess, song maker, future ones) can be reused to render ANOTHER. One
library, shared.

---

## The five asset kinds and the one key

Every reusable asset is one of five `kind`s, and is filed under one `theme`:

- **kind:** `character` (a hero/creature cutout) · `world` (a full background) ·
  `element` (a small object: coin, gem, spike, chest, prop) · `music` (a looping
  background track) · `sfx` (a short one-shot sound).
- **theme** is the universal key that ties a set together:
  `space`, `jungle`, `ocean`, `candy`, `desert`, `castle`, `forest`
  (add new themes sparingly, lowercase, singular).

When you build a new project for a theme, you should be able to pull a matching
world + character + element + music + sfx by that one theme word. Always tag
what you create with both `kind` and `theme` so the next project can find it.

---

## Where to FIND assets (read from these)

| Want | Read from (endpoint) | Backed by (Supabase table) |
|---|---|---|
| Worlds + elements | `GET /api/list-assets?theme=<theme>` | `community_layers`, `community_sprites` |
| Characters / heroes | `GET /api/list-characters?limit=N` | `community_characters` |
| Story worlds + characters (curated) | `GET /api/story-library` | curated list in code + `narration_cache` image cache |
| A generated game world/prop image | `GET /api/game-art?world=&artStyle=` | cached in `narration_cache` / `image_cache` |
| Reusable music loops | `public/music-library/` (+ `MANIFEST.md`) | static files |
| Sound effects + ambience | `GET /api/sfx?s=<name>` | `narration_cache` (generated once, cached) |
| Per-world music (chess style) | `GET /api/chess-music?world=<theme>` | `narration_cache` |
| Kids' saved songs | `GET /api/list-songs` | `saved_songs` |
| Shared drawing code (always-available fallback) | `public/buildable-renders.js` (`window.BuildableRenders`) | — |
| Shared audio code (sfx + mute + unlock) | `public/buildable-audio.js` (`window.BuildableAudio`) | — |

Read filters that always apply: `moderation_status = approved` and, for
layers/sprites, `reusable = true`. Prefer clean hosted `image_url`s over heavy
embedded `data:` base64.

---

## Where to SEND new assets (write to these)

When a project generates a reusable asset, WRITE it back so others can use it:

| You made a… | Send it to (table) | Required tags |
|---|---|---|
| character / hero | `community_characters` | `name`, `image_url`, `moderation_status:'approved'`, `theme_tags:['<theme>']`* |
| world background | `community_layers` | `image_url`, `theme_tags:['<theme>']`, `layer_type`, `reusable:true`, `moderation_status:'approved'` |
| element / sprite | `community_sprites` | `image_url`, `subject`, `theme_tags:['<theme>']`, `reusable:true`, `moderation_status:'approved'` |
| song | `saved_songs` | `theme`, `prompt`, audio ref |
| sound effect | add a named prompt to `SOUNDS` in `api/sfx.js` | name like `<theme>_<action>` |
| music loop | `public/music-library/` + update `MANIFEST.md` | filename + theme in manifest |

\* **Known gap:** `community_characters` does not yet have a `theme_tags` column —
characters are currently theme-less. Adding that column (idempotent migration in
`db/`) is the first convergence step so heroes can be filtered by theme like
worlds and elements. Until then, tag the theme in the description.

Existing write paths already follow this: `api/generate-creature.js` → characters,
`api/generate-game.js` / `api/generate-level.js` → layers + sprites,
`api/save-song.js` → songs. New asset-producing code must route through the same
tables — **do not invent a new siloed store.**

---

## The three rules that keep this from breaking anything

1. **Additive only.** Adding library rows or tags is always safe. NEVER delete or
   re-path an asset a live game/story currently loads until its shared replacement
   is verified on the live site. (The Survival `space_bg.png`→`.jpg` miss is why.)
2. **Always keep a fallback.** Read the library first, but every renderer must
   degrade gracefully — fall back to `buildable-renders.js` drawn art or a bundled
   file so a library miss or outage can never break a kid's experience.
3. **One project at a time.** Converge gradually (e.g. let the story maker read
   shared characters before rewiring everything), QA the live deploy, and add a
   dated entry to the README session log.

---

## Current state vs target (so agents know what's done)

- **Done / shared:** games read+write `community_*` (worlds, elements, characters);
  shared `buildable-renders.js` + `buildable-audio.js`; `/api/sfx` cached ambience.
- **Still siloed (converge toward shared):** story worlds/characters live in
  `story-library` (separate from `community_*`); chess uses bundled
  `public/chess-art/*.jpg`; music is split across `music-library/`,
  `/api/chess-music`, and synth; characters lack a `theme_tags` column.
- **North star:** one `/api/library` read that returns every kind, filterable by
  `theme` and `usable_in`, so a new project renders itself from existing assets.

See the plain-language audit at `../ASSET-LIBRARY-AUDIT.md` (in the Buildable MVP
working folder) for the full picture and reasoning.
