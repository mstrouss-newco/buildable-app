# CREATIONS.md — every kid creation can be saved, shared, and published

**Agents: read this before building any feature where a kid makes something they keep.**
A "creation" is anything a child makes and saves — a song, a story, a game, a drawing
(Art Studio), and any new maker we add. The rule is simple and universal:

> **Every creation type MUST support all three: save to the kid's library, share by a
> private link, and publish to the public gallery (moderated).** No creation type is
> save-only. A new maker isn't done until all three are wired.

This mirrors the shared-asset rule (`ASSET-LIBRARY.md`) and the engine rule
(`BUILDING-A-GAME.md`): reuse the same three mechanisms below — don't reinvent them per
maker.

---

## The three mechanisms (reuse these for every type)

### 1. Save to library
- A per-type row: `saved_<type>` (e.g. `saved_songs`, `saved_stories`, `saved_games`)
  with **`device_id`** (no-login lane) AND **`kid_profile_id`** (account lane) so a
  creation follows the kid across devices, under **family RLS** (copy the
  `create-accounts-rls.sql` policies). Ship the table as an idempotent `db/*.sql`.
- A `list-<type>` endpoint, filtered by device/kid.
- It shows up in **two** places: the child's **library screen** (`MyStuff.jsx`, one tab
  per type) and the home **"jump back in"** list (`BuildableKids.jsx`).
- Every row carries a **`thumbnail`** auto-derived from its own art (see `api/_thumbs.js`)
  so lists and menus look alike.

### 2. Share (private link)
- One helper does this for everything: **`shareCreation({ kind, id, title })`** in
  `src/lib/shareSheet.js`. It builds a **private, read-only** link to a public viewer
  page (`/<type>.html?id=<id>`) and opens the native share sheet (phones/tablets) or a
  copy/email menu (desktop).
- Each type needs a **read-only viewer page** in `public/` (`song.html`, `story.html`,
  …) that loads the creation by id and renders it without edit controls.
- Sharing is **private by default** — a link is not the same as publishing.

### 3. Publish (public, moderated)
- One toggle endpoint: **`/api/publish-creation`** `{ kind, id, deviceId, publish }`
  flips the creation public/private (games also use `publish-game` for the first publish).
- Published creations appear in the **public gallery** (`top-creations` / `TopBoard.jsx`)
  and can be hearted/played (`heart-creation`, `play-creation`).
- **Publishing is gated by content moderation** (`src/lib/contentModeration.js`,
  `moderation_status = approved`). This is a kids' product — never weaken that gate, and
  never auto-publish kid content from automation (see `AGENTS.md` guardrails).

---

## Current coverage (June 2026) — and the open gaps

| Type | Save to library | Share (private link) | Publish (moderated) |
|---|---|---|---|
| Song  | yes (`saved_songs`, MyStuff "My Songs") | yes (`/song.html`) | yes (`publish-creation` kind=song) |
| Story | yes (`saved_stories`) | yes (`/story.html`) | yes (`publish-creation` kind=story) |
| Game  | yes (`saved_games`/`published_games`) | **GAP — no share** | yes (`publish-game` + `publish-creation` kind=game) |
| Kid game (Cobuild, CB1) | yes (`kid_games`; Home "My Games" + MyStuff) | yes (`/g/<slug>`, server-rendered OG) | flag on the row (`public`); gallery listing is CB2 |

A **kid game** (Session CB1) is a manifest the child owns pointed at an engine we
already ship: the row lives in `kid_games`, `/api/kid-game` is the only thing that
touches it, and any engine plays it with `?kg=<id>`. Its private link is `/g/<slug>`,
served by `api/g.js` so the Open Graph tags are in the bytes a group chat reads.
Remixing is `op:"fork"` — a copy into a row the forker owns, with `source_game` set.

**Open gaps to close (tracked):**
1. **Games can't be shared by a private link.** `shareSheet.js` only handles song/story
   and there's no read-only game viewer page. Add a game viewer (`public/game.html?id=`
   that loads the saved/published game read-only) + a `game` branch in `shareCreation`.
2. **The library screen is incomplete.** `MyStuff.jsx` only shows characters, levels, and
   songs — **add Stories and Games tabs** (each with Share + Publish actions) so the
   library truly holds everything a kid made.
3. **Share text used emojis** (against the no-emoji rule) — fixed in `shareSheet.js`.

---

## Adding a NEW creation type (checklist) — e.g. Art Studio drawings

A new maker is **not shippable** until every box is checked:

- [ ] `db/create-saved-<type>.sql` — table with `device_id` + `kid_profile_id`, family
      RLS, `thumbnail`/art ref, `moderation_status`, `is_public`. Idempotent; owner runs it.
- [ ] `api/save-<type>.js` + `api/list-<type>.js` (filter by device/kid).
- [ ] A tab in `MyStuff.jsx` + inclusion in the home "jump back in" list, with a thumbnail.
- [ ] `public/<type>.html?id=` — a **read-only viewer** page (responsive — see below).
- [ ] `shareCreation` supports `kind:"<type>"` (add the branch in `shareSheet.js`).
- [ ] `publish-creation` supports `kind:"<type>"`; appears in the public gallery; gated
      by content moderation.
- [ ] Delete path (`delete-<type>`), owner-checked.

---

## Cross-platform — build for desktop, iPad, and iPhone (always)

Every maker, viewer page, library screen, and game **must work on desktop, iPad, and
iPhone**. This is a kids' product used mostly on tablets and phones — a feature that only
works on desktop is not done.

- **Test all three sizes** before shipping (the app is built with inline styles and has
  no responsive framework — see the `responsive-mobile-notes` reality: games run as
  iframes in `#root`, so don't zoom `#root`; the in-game phone polish is ongoing).
- **Touch first:** big tap targets, no hover-only controls, no tiny hit areas.
- **Audio unlock on the first tap** (iOS/Safari blocks audio until a real gesture) —
  reuse `src/lib/audioUnlock.js` / `BA.unlock()`; never `.play()` after an `await`.
- **Viewport + safe areas:** `width=device-width, initial-scale=1`; respect notches.
- **No fixed pixel layouts** that overflow a phone; verify portrait phone, not just wide.

See `GAME-LOOK.md` for game visuals and `BUILDING-A-GAME.md` for the engine rules; this
file is the rule for **what happens to what a kid makes**.
