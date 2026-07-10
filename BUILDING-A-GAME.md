# BUILDING-A-GAME.md — the new-game playbook

**Agents: read this before building any new game, engine, world, or game type.**

Buildable v2 has one rule that shapes everything below: **the shell owns everything
outside gameplay, the game only plays.** A game is a *cartridge* — a thing the shell
embeds at a URL and talks to through a small, fixed set of messages. The picker card,
landing, journey, loadout, HUD, learning moments, coins, and buddy are all rendered by
the shell from the game's **manifest**. The engine never draws its own menus and never
hardcodes art.

Build a new game in four moves, in this order:

1. **Write the one-page spec first** — the manifest in plain English. No code yet.
2. **Build the engine as a cartridge** — against [`CARTRIDGE-CONTRACT.md`](./CARTRIDGE-CONTRACT.md). It only plays.
3. **Write the QA harness in the same session** — `qa-<game>.mjs`, contract checks included.
4. **Art and tuning go through the editor** — asset IDs and a 1–5 difficulty dial, never numbers in code.

The north star: anything you build — an engine, a mechanic, a world, a hero — should be
**storable, trackable, and reusable by the next game.** Pull from the shared libraries and
write back to them; don't invent a one-off.

| Open this | To answer |
|---|---|
| **BUILDING-A-GAME.md** (this file) | "I'm making a new game — what's the whole process?" |
| [`buildable-manifest-v2.md`](./buildable-manifest-v2.md) | "What goes in the manifest — every field the shell reads?" |
| [`CARTRIDGE-CONTRACT.md`](./CARTRIDGE-CONTRACT.md) | "How do the shell and the game talk? Which messages are real?" |
| [`GAME-FEEL.md`](./GAME-FEEL.md) | "How does it *feel*? Shared feedback, sounds, celebrations (the Feel Kit)." |
| [`MECHANICS.md`](./MECHANICS.md) | "How does it *play*? Which proven mechanic do I reuse, where do I store a new one?" |
| [`GAME-LOOK.md`](./GAME-LOOK.md) | "How does it *look*? Layers, parallax, art pipeline." |
| [`ASSET-LIBRARY.md`](./ASSET-LIBRARY.md) | "What do I *render with*? Where to find assets, where to send new ones." |
| **Asset Library** — `/asset-library.html` (internal) | "What do we already HAVE? Browse by 2D/3D · theme · kind, with previews + a coverage matrix." |
| [`MULTIPLAYER.md`](./MULTIPLAYER.md) | "Two kids together? Turn-based vs real-time, and the shared rules." |

---

## Step 1 — Write the one-page spec first (before any code)

The spec **is the manifest, in plain English.** One page. Agree it in chat before writing a
line of engine code. It answers every question the shell will ask, so nothing about the
game's framing gets improvised later. Fill in each section of
[`buildable-manifest-v2.md`](./buildable-manifest-v2.md):

- **Identity** — `id` (URL name), `name`, `type` (`game` or `studio`), `category`, signature
  `color`, `ageBand`, `shellVersion`.
- **Engine** — `engine` (`canvas` today; later `phaser`/`godot`) and `entry` (the URL the
  shell embeds). These two fields are the whole reason a future engine slots in with zero
  shell changes: the shell only ever embeds `entry` and talks via the contract.
- **Features (on/off)** — `demoOnLoad`, `journey`, `customization`, `coins`, `buddy`
  (+ personality), `multiplayer` (`off`/`turn-based`/`real-time`), `learning` defaults.
- **Art slots** — whole-game art as `slot → asset library ID`: `badge`, `hero`,
  `winCelebration`, `loadingScreen`, `music`. Never a hardcoded image.
- **Levels** (games only) — an ordered list; order **is** the journey and unlock order.
  Each level: `id`, `name`, `layout`, `difficulty` **1–5**, `coins`, `parts`
  (each part → asset ID), `journeyBadge`. **There is no worlds layer** — a level points
  directly at its parts; two levels reusing art just point at the same IDs.
- **Customization slots** — what the kid can swap (Paddle, Ball, Trail, …), each option a
  name + asset ID + coin price; at least one free option per slot.
- **Feel** — presets only: `pace` (chill/normal/zippy), `celebration` (calm/big),
  `haptics` (on/off). Everything else about feel is platform law (the Feel Kit).
- **Learning moments** — `beforeUnlock`, `coinTopUp`, `bonusAfterWin`, `subjects`.
  Parents override these from their portal; their settings win.
- **Studios (`type: studio`)** skip levels/journey and instead declare `produces` and
  `savesTo` (see manifest-v2 §7). Music Maker is the reference studio.

### Agree the asset plan as part of the spec (ASK — give 3 options, each a picture)
Open the internal **Asset Library** (`/asset-library.html`) — browse everything by
**2D/3D**, **theme**, and **kind** (`character` · `world` · `element` · `effect` · `music`
· `sfx`), with a **coverage matrix**. Then in chat:

1. **Offer THREE distinct asset-set options** with real ids (vary theme/style, keep one
   dimension). e.g. **A · Dino Jungle**, **B · Candy Land**, **C · Space Station**.
2. **Show a quick visual MOCKUP for EACH** so the user decides by SEEING — lay the assets
   into a rough game screen (hero + background + a couple elements + HUD).
3. **Surface the gaps** per option (vs the coverage matrix) and how you'd fill them —
   generate, CREATE the sound (a new engine = new sounds), or curate a CC0 pack.
4. **Ask the user to pick one (or mix)**, and whether to go get a new pack (prefer CC0 /
   Kenney). The user downloads packs; you inventory, tag, and register.

Output of Step 1: an approved one-page spec **and** a filled `manifest.json` stub in the
game's folder. Only then do you build.

---

## Step 2 — Build the engine as a cartridge (against CARTRIDGE-CONTRACT.md)

The engine **only plays.** It is embedded at its `entry` URL and communicates with the
shell **only** through the messages in [`CARTRIDGE-CONTRACT.md`](./CARTRIDGE-CONTRACT.md).
It never reaches into the shell, and the shell never reaches into it. Anything that can
send and receive those messages can be a Buildable game — today's canvas games, later
Phaser or Godot — with zero shell changes.

**What the engine must do (the contract, in short):**

- **Honor `pause` / `resume`.** The shell sends `pause` for quiz gates, parent
  interruptions, and tab switches. Every game freezes NOW and resumes exactly where it
  was. A game that ignores `pause` fails its QA contract check.
- **Support `start` with a level id** (embedded engines). Canvas games *may* instead use
  their own refresh-safe deep-link URLs (e.g. `/breaker/play/{levelId}`) resolved by the
  game's own router on load — that stays fine. Anything mounted once at `entry` with no
  per-level route MUST accept `start`.
- **Report play events up:** `win` / `lose` / `levelup` / `cheer` (buddy events),
  `coins` `{delta, key?}` (announce coins; `key` makes it award-once), and `nav:state`
  (sound/menu/help/in-game status so the shell draws its nav chrome). Ask for a learning
  gate with `quizRequest`; continue when the shell replies `bk:quizDone`.
- **Never draw shell screens.** No start menu, no journey, no loadout, no worlds tab, no
  bespoke per-game menu, no HUD chrome — the **shell** renders all of those from the
  manifest. Use the one shared HUD (`public/buildable-hud.js`) for in-play info, and the
  shared nav bridge (`public/buildable-gamenav.js`) so the shell owns Home/Sound/Help.
- **Announce coins, don't store them.** The shell owns the wallet
  (`buildable-wallet.js`): inside a shell iframe your game only posts `coins` deltas up;
  the shell credits (de-duping by `key`) and broadcasts the balance back.

**The art rule (this is what protects the editor):** fetch every texture at load time from
the URLs the manifest resolves. **Art is never baked into a game or a bundle.** This is
what makes drop-in art swapping work on every game, regardless of engine.

**Difficulty is a 1–5 preset.** The engine translates the dial into its own tuning (speed,
counts, timing) internally. Nobody edits raw knobs, ever — not in the manifest, not in the
engine's public surface.

**Content is data, not code.** Read `GAME_CONFIG` (levels = recipe cards of layout +
difficulty + asset references) from the manifest via the shared loader
`public/buildable-manifest.js`. Adding a level is editing data, never engine code.

### The shared engine libraries (use them — don't reinvent)

| Library | Global | Owns |
|---|---|---|
| `public/buildable-renders.js` | `BR` | All drawn-shape fallback art: hero, enemy, coin, sprite, background, hearts |
| `public/buildable-audio.js` | `BA` | Created SFX + music, mute, the iPad audio-unlock |
| `public/buildable-mechanics.js` | `BM` | FX/"juice": particle bursts, screen shake, flash, floating pop text |
| `public/buildable-feel.js` | `Feel` | The **Feel Kit** — shared taps, misses, celebrations, haptics (see `GAME-FEEL.md`) |
| `public/buildable-hud.js` | — | The **one** in-play HUD (hearts, score, level) — never hand-roll a HUD |
| `public/buildable-manifest.js` | `BuildableManifest` | Loads + validates the manifest, translates it for the engine |
| `public/buildable-gamenav.js` | `BuildableGameNav` | Bridges nav so the shell draws Home/Sound/Help in-app |

**Feel comes from the Kit, not the engine.** Route feedback through `Feel` (`Feel.tap()`,
`Feel.miss()`, `Feel.explode()`, celebrations) so every game feels identical. The manifest
exposes only the constrained presets (`pace`/`celebration`/`haptics`).

**CREATE fresh sounds for a new engine.** We ship only unique created audio (ElevenLabs);
the `BA` synth is a silent fallback ONLY, never the product. A new engine/type is the
moment to create bespoke sounds + music and register them (`SOUNDS` in `api/sfx.js`) so
the company library grows.

> **SFX gotcha — ElevenLabs has a 0.5s minimum.** Every sound in `DURATIONS`
> (`api/sfx.js`) MUST be **≥ 0.5 seconds**, or `/api/sfx` returns **503** and the client
> silently falls back to the near-silent synth — the sound is just *gone* in-game. (This
> killed Breaker's ball-launch/paddle/wall sounds on 2026-07-02.) There is a
> `Math.max(0.5, …)` floor as a safety net, but still author every one-shot at ≥ 0.5s. To
> verify live: `fetch("/api/sfx?s=<key>")` — `200 audio/mpeg` = good, `503` = failing.

**Bake in always-winnable.** Cap difficulty so a 4–8-year-old can always finish: gaps ≤
jump range; hero speed ≥ enemy speed; bosses on a mercy timer; a guaranteed level-end
(`kill-then-boss`). See `MECHANICS.md` §4. No punishing lose states — the shell, not the
engine, decides what a miss looks like.

---

## Step 3 — Write the QA harness in the same session as the engine

**A game is not built until its QA robot is.** Write `qa-<game>.mjs` alongside the engine,
in the same session — never "later." Model it on `qa-breaker.mjs`.

- **Expose a headless hook.** Export a game object with `sim(idx, maxFrames)` and (ideally)
  `campaign(cap)` that runs a perfect-player bot with no DOM. The harness drives it in Node
  and **asserts ALL LEVELS WIN.**
- **Include the contract checks** — this is what makes it a v2 harness, not just a win-sim:
  - `start` loads the right level; `pause` freezes and `resume` continues.
  - the game reports `win`/`lose`, `coins`, and (when it has them) `score`/`levelComplete`.
  - **no hardcoded art** (textures resolve from manifest URLs) and **no emojis anywhere**.
- **Run it before and after every change**, and again on the live deploy. **Never claim QA
  passed if it did not actually run** (`AGENTS.md`). If a game genuinely has no harness yet,
  say so plainly.

---

## Step 4 — Art and tuning go through the editor

Once the engine reads its manifest, **all** content changes happen in the level-first
**editor** — never by hand-editing engine code:

- **One page per game.** Game art slots up top; level rows below (name, parts strip,
  layout, **difficulty 1–5 chips**, Test, reorder, remove, add). No worlds layer — levels
  point directly at parts.
- **Drop-in art** on any slot or part runs the existing auto-slicer straight to that slot's
  asset ID; **Library** picks an existing asset. Replacing one part touches only that level.
- **The editor is the only tool that writes a manifest.** **Save = the QA robot plays every
  level and confirms it's beatable, then the change goes live.** A change that fails the
  robot never ships.

This is why Steps 1–3 are strict about the art rule and the 1–5 dial: they are what let a
level's bricks change and difficulty go to 4 with **zero code**, live after the robot passes.

---

## Making it multiplayer (optional — manifest-driven)

Turn it on with `features.multiplayer` in the manifest (`off` / `turn-based` /
`real-time`); the shell wires it into the **one shared multiplayer system**. Reuse it —
never build a per-game table or lobby. Full internals + frozen contracts:
[`MULTIPLAYER.md`](./MULTIPLAYER.md).

- **Shared pieces (already built):** `src/GameLobby.jsx` (the one lobby),
  `api/friends.js` + `src/lib/friends.js` (friends, presence, invites),
  `src/lib/friendMatches.js` (the turn-based "poll a row" transport), and the tables in
  `db/create-friends.sql` — `friend_matches` is ONE table for every game (distinguished by
  `friend_matches.game`), so a new game needs **no schema change**.
- **Pick a transport by speed:** same-device = local pass-and-play (no backend);
  `turns` (chess, checkers, board games) = the state lives in the row, a move patches it,
  the other device re-reads every ~2s (**works offline**); `realtime` (tennis, pong) = a
  Supabase Broadcast channel for live positions (**both kids online at once**).
- **Build the board network-agnostic** to the right message contract (turn-based:
  `Ready`/`Init`/`OpponentMove`/`Move`; realtime: the frozen `mp:` contract — broadcast
  **positions not commands**, and the guest must **dead-reckon** a continuously-moving ball
  using the host's velocity, not lerp to a stale point — copy the `role === "guest"` block
  in `public/tennis.html`).

**Multiplayer gotchas (bake in):** filter invites by the **active kid** (`toKid === me.id`)
or siblings see each other's invites; **retry every friend/match call** (401 refresh + 5xx
backoff) or a dropped write silently loses a move; presence is app-wide (from
`BuildableKids`, not per game); turn-based "Start game" must work offline (create the row at
invite time). Canned reactions only — never free-text chat between kids.

---

## Physics (optional — for NEW toy/sandbox game types only)

Our level engines are **scripted and deterministic** on purpose — that's what makes levels
always-winnable and lets the QA bot prove it. **Do NOT bolt a physics engine onto them.**
Physics belongs only in a **brand-new sandbox/toy type where unpredictability is the fun**
(block stacker, marble run, slingshot, pinball). Approved CDN libs: Phaser Arcade or
**Matter.js** (2D fun), Planck.js (accurate 2D), Cannon-es (3D), Rapier (top performance).
Rules: new type only; don't make winning physics-fragile (give a deterministic assist so a
kid can't soft-lock); it needs its **own** seeded QA; keep no-emoji + library-first.

---

## The non-negotiable rules

- **The shell owns everything outside gameplay.** The engine only plays. No start menu,
  journey, loadout, worlds tab, or bespoke menu in an engine — the shell renders those from
  the manifest.
- **Messages only.** Shell ↔ game talk exclusively through `CARTRIDGE-CONTRACT.md`. New
  message types get added to that file first, then implemented.
- **If it's visual, it's an art slot** pointing at an asset library ID. **If it's tunable,
  it's a manifest field** — never a number in game code. **Difficulty is a 1–5 preset.**
- **Never hardcode art; fetch it at load from manifest URLs**, always with a `BR` drawn /
  `BA` synth fallback so an outage can't break play.
- **No emojis anywhere** — drawn `BR` art or library images only (UI, buddy, celebrations,
  notifications).
- **Replace first, remove second.** `main` auto-deploys; never remove a working feature
  before its replacement is live and verified on production.
- **Every creation saves, shares, and publishes** (save to library · private share link ·
  moderated publish) — reuse the shared mechanisms in `CREATIONS.md`. Not done until all
  three work.
- **Build for desktop, iPad, and iPhone.** Touch-first; audio-unlock on first tap; test
  portrait phone. A desktop-only feature is not done.
- **Additive migration.** Never delete or re-path an asset a live game loads until its
  replacement is verified live.
- **Never handle secrets; never run destructive DB ops.** Ship DB changes as idempotent
  `db/seed-*.sql` for the owner to run.
- **Canonical source is the repo `public/`.** Loose copies in working folders may be stale.

---

## Consistent game navigation (shell-owned)

Every game gets into, moves around, and exits the same way — the kid never relearns it per
game, because the **shell** draws the chrome. A game opts in via the shared bridge
`public/buildable-gamenav.js`:

```js
BuildableGameNav.register({
  hide: ["muteBtn","helpBtn","backBtn"],       // the engine's own button ids (hidden in-app)
  onSound: () => toggleMute(), onMenu: () => openMenu(), onHelp: () => openHelp(),
  soundOn: () => !muted, inGame: () => state === "play",
});
// call BuildableGameNav.update() whenever sound/inGame changes.
```

In-app the bridge hides the engine's own buttons and reports `nav:state`; the shell renders
the fixed cluster — **Home top-left** (posts `nav:exit`, returns to the hub), **Sound/Pause
top-right** — and sends back `nav:sound`/`nav:menu`/`nav:help`. **Standalone** (engine
opened directly) the bridge does nothing, so the engine's own fallback buttons still work.
Rules: Home is always top-left; Sound/Pause top-right; the **bottom corners are reserved
for gameplay** (D-pad, jump, paddle); never hand-roll a bespoke per-game back button.

---

## Where everything lives (the map)

```
buildable-app/
├─ BUILDING-A-GAME.md        ← you are here (new-game entry point)
├─ buildable-manifest-v2.md  ← every manifest field the shell reads
├─ CARTRIDGE-CONTRACT.md     ← the shell ↔ game message contract (single source of truth)
├─ GAME-FEEL.md              ← the Feel Kit: shared feedback, sounds, celebrations
├─ MECHANICS.md              ← reusable gameplay + FX mechanics (+ game_mechanics table)
├─ GAME-LOOK.md              ← look & feel: layers, art pipeline, audio unlock
├─ ASSET-LIBRARY.md          ← where to find / send characters, worlds, elements, music, sfx
├─ MULTIPLAYER.md            ← turn-based vs real-time, the shared lobby + contracts
├─ AGENTS.md / README.md     ← scope, guardrails, architecture, the dated session log
├─ public/
│  ├─ buildable-manifest.js  (loads + validates the manifest)      ← shared shell lib
│  ├─ buildable-renders.js   (BR — drawn fallback art)             ← shared engine lib
│  ├─ buildable-audio.js     (BA — created sound)                  ← shared engine lib
│  ├─ buildable-mechanics.js (BM — FX/juice)                       ← shared engine lib
│  ├─ buildable-feel.js      (Feel — the Feel Kit)                 ← shared engine lib
│  ├─ buildable-hud.js       (the one in-play HUD)                 ← shared engine lib
│  ├─ buildable-gamenav.js   (shell-owned nav bridge)              ← shared engine lib
│  ├─ <game>/manifest.json   (one per game — the settings sheet)
│  ├─ breaker-engine.html, survival-engine.html, sling-squad.html  (canvas cartridges)
│  └─ …                      (each engine needs a vercel.json route before the catch-all)
├─ api/    (list-assets.js, list-characters.js, game-art.js, sfx.js, manifest.js, …)
├─ db/     (idempotent SQL seeds — incl. seed-*-mechanic.sql)
└─ qa-<game>.mjs             (the robot tester — one per game, written with the engine)
```

The whole loop: **spec first → engine as a cartridge → QA harness same session → art &
tuning through the editor → QA the live deploy → log it.**

---

## Signal win/lose (buddy reactions + per-kid logging)

Every game MUST tell the shell when the player wins or loses — this is part of the cartridge
contract. ONE signal powers two things: the buddy popping in to cheer/console, AND per-kid
telemetry (favorite games + progress).

```js
// from inside the game iframe, exactly once per game-over:
window.parent.postMessage({ source: "buildable", kind: "win"  }, "*"); // on WIN
window.parent.postMessage({ source: "buildable", kind: "lose" }, "*"); // on LOSE
// optional richer meta lets the buddy name a personal best:
//   { source:"buildable", kind:"win", meta:{ score, newBest:true } }
```

- Send it the moment the result shows. Never more than once per result.
- A game with its own celebration voice should STILL send win/lose for logging — add
  `silent: true` if you don't want the buddy to also speak.
- **Plays** are logged automatically: when a new in-app game screen is added, add its slug
  to `GAME_SLUGS` in `src/BuildableKids.jsx` so plays are counted.
- **Where it goes:** `/api/log-game-event` → `kid_game_events`
  (`db/create-kid-game-events.sql`). Best-effort; never block gameplay on it.
