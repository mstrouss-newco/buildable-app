# Buildable Kids — Game Manifest v2

**What this is:** the single settings sheet every game and studio ships with. The shell reads it to build every screen around the game (picker card, journey, loadout, HUD, learning moments). The internal game editor reads and writes it. Games never hardcode art or difficulty; they read it from here.

**Where it lives:** one manifest file per game, inside that game's folder in the repo. Example: `/breaker/manifest.json`.

**The golden rules:**
1. If it's visual, it's an art slot pointing at an asset library ID. Never a hardcoded image.
2. If it's tunable, it's a field in the manifest. Never a number buried in game code.
3. The shell owns everything outside gameplay. The game only plays.
4. Saving a manifest change triggers the QA robot, which plays every level and confirms it's beatable before the change goes live.

---

## Sections of a manifest

### 1. Identity
- `id` — short name used in URLs (breaker, croc-tot, music-maker)
- `name` — display name
- `type` — `game` or `studio` (studios skip levels/journey and declare what they produce instead)
- `category` — label shown under the name (Arcade, Action, Puzzle, Studio)
- `color` — the game's signature color, used on its badge, journey, and HUD accents
- `ageBand` — e.g. 5-8 or 8-12
- `shellVersion` — which shell version this manifest was built for

### 1b. Engine (how the game runs) — see CARTRIDGE-CONTRACT.md
- `engine` - `canvas` today; later `phaser` or `godot`. Tells the shell how to treat the game.
- `entry` - the URL the shell embeds (for canvas games, the game's HTML file). The shell treats every game as "a thing I embed at its entry URL" and never assumes a game is a single HTML file.

These two fields are what let a future Phaser or Godot game slot into the shell with zero shell changes: the shell only ever embeds `entry` and talks to it using the cartridge contract's messages (see CARTRIDGE-CONTRACT.md at the repo root) — it never reaches into a game's internals.

### 2. Shell features (on/off)
- `demoOnLoad` — gesture demo with the green go button
- `journey` — the winding level path (vertical on phones, auto-generated from the levels list)
- `customization` — kid loadout screen
- `coins` — earn coins in this game (wallet is shared platform-wide)
- `buddy` — helper buddy on/off, plus personality
- `multiplayer` — off / turn-based / real-time (uses the existing multiplayer system)
- `learning` — learning moments defaults (details in section 6)

### 3. Game art slots (whole-game art)
Each slot is `slot name -> asset library ID`:
- `badge` — the game's card on the picker and journey header
- `hero` — mascot/character (also feeds the buddy and win screens)
- `winCelebration` — art for the win moment
- `loadingScreen` — shown while the game loads
- `music` — background track(s), from the audio library

### 4. Levels (games only)
An ordered list. Order in this list IS the journey order and the unlock order (each level unlocks when the one before it is beaten, unless overridden). Each level has:
- `id` — stable short name (used in URLs: /breaker/play/jungle-ruins)
- `name` — display name
- `layout` — which layout template the engine uses (breaker: full, pyramid, checker, gaps, columns, frame, diamond)
- `difficulty` — **1 to 5**. The engine translates this into its own tuning (speed, counts, timing). Nobody edits raw knobs.
- `coins` — coins awarded for beating it (defaults from difficulty: 1→10, 2→15, 3→20, 4→25, 5→30; can be overridden)
- `parts` — this level's art, each part -> asset library ID. Parts are defined per game type (breaker: background, bricks, balls, paddle). Replacing one part touches only this level.
- `journeyBadge` — the level's sticker/badge art on the journey path
- `unlocked` — true only for level 1 typically

Note: there is no "worlds" layer. A level points directly at its parts. Reusing art across levels just means two levels pointing at the same asset IDs (the editor's Library button is how that happens).

### 5. Kid customization slots
Each slot the kid can customize:
- `slot` — name (Paddle, Ball, Trail, Character, Music)
- `options` — list of: display name, asset library ID, coin price (0 = free). At least one free option per slot.

### 5b. Feel (presets only, never raw knobs)
Feel is mostly platform law: shared feedback, sounds, celebrations, and input standards live in the Feel Kit (see GAME-FEEL.md) and are identical across all games. Kids can never alter feel by remixing; customization slots only swap art and audio assets. The manifest exposes only constrained presets:
- `pace` — chill / normal / zippy
- `celebration` — calm / big
- `haptics` — on / off

### 6. Learning moments
Defaults set per game; parents can adjust from their portal (their settings win):
- `beforeUnlock` — one question before a new level unlocks (always skippable)
- `coinTopUp` — short on coins? 3 correct answers = 10 coins
- `bonusAfterWin` — optional post-win question for extra coins
- `subjects` — math / reading / spelling / geometry / mix (difficulty follows the kid's grade setting)

### 7. Studios (type: studio) differences
Studios skip sections 4 (levels) and their journey. Instead they declare:
- `produces` — what creations come out (songs, stories, art, sounds)
- `savesTo` — which creations library they publish into
Everything else works identically: badge, art slots, coins, customization (e.g. unlock a new instrument pack), learning moments (e.g. answer 2 questions to unlock the trumpet).

### 8. URLs (derived automatically, never written by hand)
- `/` — picker
- `/{id}` — game landing (demo plays here)
- `/{id}/journey` — level path
- `/{id}/play/{levelId}` — playing a level
- `/{id}/loadout` — customization
Refresh anywhere restores that spot. Every screen is shareable.

---

## Example: Breaker (filled in, plain English values)

```json
{
  "id": "breaker",
  "name": "Breaker",
  "type": "game",
  "category": "Arcade",
  "color": "#FF6B6B",
  "ageBand": "8-12",
  "shellVersion": 2,
  "engine": "canvas",
  "entry": "/breaker-engine.html",

  "features": {
    "demoOnLoad": true,
    "journey": true,
    "customization": true,
    "coins": true,
    "buddy": { "on": true, "personality": "cheerleader" },
    "multiplayer": "off",
    "learning": { "beforeUnlock": true, "coinTopUp": true, "bonusAfterWin": false, "subjects": ["math", "reading"] }
  },

  "art": {
    "badge": "breaker/badge/v1",
    "hero": "breaker/hero/v1",
    "winCelebration": "shared/win/confetti-v1",
    "loadingScreen": "breaker/loading/v1",
    "music": "audio/breaker/theme-v1"
  },

  "levels": [
    {
      "id": "jungle-ruins",
      "name": "Jungle Ruins",
      "layout": "full",
      "difficulty": 2,
      "coins": 15,
      "unlocked": true,
      "journeyBadge": "badges/jungle/v1",
      "parts": {
        "background": "breaker/bg/jungle-v1",
        "bricks": "breaker/bricks/jungle-v1",
        "balls": "breaker/balls/classic-v1",
        "paddle": "breaker/paddle/classic-v1"
      }
    },
    {
      "id": "coral-castle",
      "name": "Coral Castle",
      "layout": "frame",
      "difficulty": 3,
      "coins": 20,
      "journeyBadge": "badges/ocean/v1",
      "parts": {
        "background": "breaker/bg/ocean-v1",
        "bricks": "breaker/bricks/ocean-v1",
        "balls": "breaker/balls/classic-v1",
        "paddle": "breaker/paddle/classic-v1"
      }
    },
    {
      "id": "galaxy-boss",
      "name": "Galaxy Boss",
      "layout": "diamond",
      "difficulty": 5,
      "coins": 30,
      "journeyBadge": "badges/space/v1",
      "parts": {
        "background": "breaker/bg/space-v1",
        "bricks": "breaker/bricks/space-v1",
        "balls": "breaker/balls/classic-v1",
        "paddle": "breaker/paddle/classic-v1"
      }
    }
  ],

  "customization": [
    { "slot": "Paddle", "options": [
      { "name": "Classic", "asset": "breaker/paddle/classic-v1", "price": 0 },
      { "name": "Rainbow", "asset": "breaker/paddle/rainbow-v1", "price": 50 },
      { "name": "Rocket", "asset": "breaker/paddle/rocket-v1", "price": 120 }
    ]},
    { "slot": "Ball", "options": [
      { "name": "Bouncy", "asset": "breaker/balls/classic-v1", "price": 0 },
      { "name": "Meteor", "asset": "breaker/balls/meteor-v1", "price": 80 }
    ]},
    { "slot": "Trail", "options": [
      { "name": "None", "asset": "shared/trail/none", "price": 0 },
      { "name": "Bubbles", "asset": "shared/trail/bubbles-v1", "price": 60 }
    ]}
  ]
}
```

## Example: Music Maker (studio, abbreviated)

```json
{
  "id": "music-maker",
  "name": "Music Maker",
  "type": "studio",
  "category": "Studio",
  "color": "#37B6F5",
  "shellVersion": 2,
  "produces": "songs",
  "savesTo": "saved_songs",
  "features": {
    "demoOnLoad": true,
    "coins": true,
    "learning": { "coinTopUp": true, "subjects": ["math"] }
  },
  "art": { "badge": "music-maker/badge/v1", "loadingScreen": "music-maker/loading/v1" },
  "customization": [
    { "slot": "Instrument packs", "options": [
      { "name": "Starter", "asset": "audio/packs/starter", "price": 0 },
      { "name": "Brass", "asset": "audio/packs/brass", "price": 100 }
    ]}
  ]
}
```

---

## Who touches the manifest
- **The shell** reads it: builds the picker card, landing, journey, loadout, HUD accents, learning gates, URLs.
- **The engine** reads it: level layout, difficulty (translated internally), which asset IDs to load.
- **The editor** reads and writes it: the only tool that changes manifests. Save = robot verification, then live.
- **Parents** override only the learning section, from their portal.
- **Kids** change nothing here; their choices (equipped paddle, unlocks) live in their profile, referencing these options.

## Build order from here
1. **Speed fix** (independent, do first): compress all oversized art, serve cached art as plain files. Target: nothing takes 10 seconds again.
2. **Shell reads manifests + real URLs**: Breaker becomes the first manifest-driven game. Refresh-safe, shareable, back-button works.
3. **Paint layer**: picker, journey (vertical on phones), loadout, HUD, all generated from manifests. Art slots filled with current placeholder art until the new art direction lands.
4. **Editor v1**: built on the existing upload/slicer code, level-first, no worlds, difficulty 1 to 5, robot verify on save.
5. **Second title converts** (Croc Tot or a studio) to prove speed, then the conversion campaign through the keepers.
