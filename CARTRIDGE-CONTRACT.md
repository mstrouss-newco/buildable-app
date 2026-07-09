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
- `win` / `lose` / `levelup` / `cheer` - buddy events (`buildable-buddy.js`, BB) that drive the kid's helper reactions
- `coins` - coins earned this moment (see the wallet note below - not shell-owned yet)

## Messages: shell to game (shipped)
- `nav:sound` / `nav:menu` / `nav:help` / `nav:exit` - shell-driven nav chrome actions (toggle sound, open menu, open help, exit to the hub)
- `bk:quizDone` - the quiz gate closed (or Learning Mode is off); the game may continue
- `pause` - freeze everything NOW (used by the quiz gate, parent interruptions, tab switches). Every game MUST honor this.
- `resume` - continue exactly where paused
- `start` with a level id (+ the kid's equipped customization) - required for embedded engine games; canvas games may skip it in favor of their own routed URLs (see Level loading above)

## Not yet implemented (future vocabulary - no code behind these yet)
`ready`, `loading` (with a percent), `score`, `levelComplete` (with stars earned), `needsCoins`, `setAudio`. These remain reserved names for when a game needs them; sound today goes through the `nav:sound` round trip instead of `setAudio`.

## Wallet note
Coins are not shell-owned yet. `buildable-wallet.js` currently runs inside each game page and reads/writes localStorage directly - the balance is shared across games only because they share an origin, not because the shell owns it. That's a real violation of the messages-only rule. Moving wallet state into the shell, so games only ever announce `coins` deltas as messages, is planned for **Session 3C**.

## The art rule (protects the editor)
Cartridges MUST fetch their art at load time from the URLs the manifest resolves. Art is never baked into a game or a bundle. This is what makes drop-in art swapping in the editor work on every game, regardless of engine. Engine-built games load their textures from these URLs the same as canvas games do.

## Rules
- Messages only. No shared variables, no reaching across the boundary in either direction.
- A game that ignores `pause` or hardcodes art fails its QA contract check.
- New message types get added here first, then implemented. This file is the contract's single source of truth.
