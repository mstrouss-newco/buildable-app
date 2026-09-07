# CARTRIDGE-CONTRACT.md - How the shell and games talk

Every game (a "cartridge") communicates with the shell ONLY through the messages below. The shell never reaches into a game's internals, and a game never touches the shell's screens. Anything that can send and receive these messages can be a Buildable game: today's canvas games, and later Phaser or Godot games, with zero shell changes.

## The engine field
Every manifest declares how its game runs:
- `engine` - `canvas` today; later `phaser` or `godot`
- `entry` - the URL the shell embeds (for canvas games, the game's HTML file)
The shell treats every game as "a thing I embed at its entry URL." It never assumes a game is a single HTML file.

## Level loading (tier rule)
- **Canvas games** may load levels through their own real deep-link URLs (e.g. `/breaker/play/{levelId}`), resolved by the game's own router on load. That stays refresh-safe and is fine as-is.
- **Embedded engine games** (Phaser, Godot, or anything mounted once at its `entry` URL with no per-level route of its own) MUST support a `start` message carrying the level id, sent by the shell after the game reports `ready`. This is how a game with only one URL still gets told which level to load.

## Messages: game to shell (shipped - these are the real, canonical names)
- `nav:state` - reports sound/menu/help/in-game status so the shell can draw its nav chrome (`buildable-gamenav.js`)
- `quizRequest` - kid hit a learning-gate moment (e.g. before a level unlocks); asks the shell to show the QuizGate
- `win` / `lose` / `levelup` / `cheer` - buddy events (`buildable-buddy.js`, BB) that drive the kid's helper reactions.
  Buddy 2.0 (`src/lib/buddy.js` + `HelperReactions.jsx`) consumes these and speaks rarely +
  specifically. It reads optional `meta` on the message when present: `score`, `newBest`
  (personal best), and treats a large loss streak / hard-won level specially. Sending a
  richer `meta` (e.g. `{ score, newBest: true }`) lets the buddy name a personal best;
  omitting it is fine (the buddy falls back to its own per-game tracking).
- `coins` - coins earned this moment (see the wallet note below - not shell-owned yet)
- `skill` - the game practiced ONE academic skill and reports how it went, so native learning games and the shell's quiz gates feed the SAME per-kid record. Shape: `{ source: "buildable", kind: "skill", subject, skill?, correct, questionId?, quizType? }` where `subject` is math / reading / spelling / geometry, `skill` is an optional specific tag, and `correct` is true or false. The shell relays it to the learning ledger (`/api/log-learning-event` -> the `learning_events` table from Session 6B) and never blocks gameplay on it. See "The learning ledger" below.

## Messages: shell to game (shipped)
- `nav:sound` / `nav:menu` / `nav:help` / `nav:exit` - shell-driven nav chrome actions (toggle sound, open menu, open help, exit to the hub)
- `bk:quizDone` - the quiz gate closed (or Learning Mode is off); the game may continue
- `pause` - freeze everything NOW (used by the quiz gate, parent interruptions, tab switches). Every game MUST honor this.
- `resume` - continue exactly where paused
- `start` with a level id (+ the kid's equipped customization) - required for embedded engine games; canvas games may skip it in favor of their own routed URLs (see Level loading above)

## The upgrade store handoff (Session 9B)
Some games have **gameplay upgrades** (a stronger weapon, an extra heart), declared in the manifest's `upgrades` tracks (see buildable-manifest-v2.md section 5c). The rule mirrors the wallet and the loadout: the **shell renders the store and owns the purchase**, the **engine owns the effect**.

- The shell draws the store from the manifest, spends the shared wallet on a buy (`BuildableWallet.spend`), and remembers what each kid owns and has equipped (per game + per kid, shell-side only). Coins are the shared platform wallet — one number, spendable on power in any game (owner's economy decision, see the manifest doc).
- The shell then tells the engine **only which id is equipped per track** — never the effect. Handoff, by engine type:
  - **Canvas games** (today): the equipped ids ride in as launch params on the game's URL, exactly like equipped looks do (`?up=weapon:twin,armor:vest,boots:rocket,hero:astro`). The engine reads them on load and maps each id to its own power. Refresh-safe, no live channel needed.
  - **Embedded engine games** (Phaser/Godot): the same equipped map rides on the `start` message alongside the level id.
- The engine trusts the equipped ids the shell sends (the shell is the source of truth for ownership); it only decides what each id *does*. A game that bakes prices or ownership into itself, or that reaches into shell storage to read coins, fails the contract — same messages-only rule as the wallet.

## Not yet implemented (future vocabulary - no code behind these yet)
`ready`, `loading` (with a percent), `score`, `levelComplete` (with stars earned), `needsCoins`, `setAudio`. These remain reserved names for when a game needs them; sound today goes through the `nav:sound` round trip instead of `setAudio`.

## Wallet note (Session 3C: DONE)
The shell now owns the wallet. `buildable-wallet.js` decides its role from where it
is loaded: in the top window (the app shell, or a game opened standalone) it is the
OWNER and reads/writes localStorage; inside a shell iframe it is an ANNOUNCER that
never touches storage and only posts `coins` deltas up to the shell. The shell credits
them (de-duping by the level key so replays can't farm) and broadcasts the new balance
back down. Games no longer read or write shared storage from inside the iframe; they
only announce, per the messages-only rule. The loadout spends in the shell, where the
number lives.

**Spending from inside a game (added FM3).** A game that has a shop of its own —
the farm buys seeds and, eventually, a new animal — may now call `BW.spend(n)`
inside its iframe. The announcer checks the balance the shell last broadcast down,
refuses if it is short, and otherwise announces the deduction upward as a NEGATIVE
`coins` delta. It still never reads or writes shared storage; the shell remains the
only place the number lives, and clamps the balance at zero. A negative delta never
carries a `key` (award-once is for earning, not spending).

Messages used by the wallet:
- game -> shell: `coins` `{ delta, key? }` (announce coins earned; `key` makes it award-once). `delta` may be NEGATIVE, which is a spend announced by a game with its own shop.
- game -> shell: `walletHello` (a freshly-loaded game asking for the current balance)
- shell -> game: `walletBalance` `{ balance }` (broadcast so a game's cached balance matches)

## The art rule (protects the editor)
Cartridges MUST fetch their art at load time from the URLs the manifest resolves. Art is never baked into a game or a bundle. This is what makes drop-in art swapping in the editor work on every game, regardless of engine. Engine-built games load their textures from these URLs the same as canvas games do.

## The learning ledger (one record per kid)
Every practiced skill lands in ONE place per kid, no matter where it came from. Two sources feed it: the shell's own quiz gates (`QuizGate`, which already writes to `learning_events` via `/api/log-learning-event`) and native learning games (which report through the `skill` message above; the shell relays them to the same endpoint). Because there is a single source, the parent skills dashboard reads one table and "how is my kid doing" never depends on which game the kid played. Games only REPORT skills across the message boundary - they never read or own the ledger, and a dropped report can never break play (best-effort, fire-and-forget). This ledger exists BEFORE the first native learning game (Session 8C) so that game has somewhere to report the moment it ships.

## Rules
- Messages only. No shared variables, no reaching across the boundary in either direction.
- A game that ignores `pause` or hardcodes art fails its QA contract check.
- New message types get added here first, then implemented. This file is the contract's single source of truth.
