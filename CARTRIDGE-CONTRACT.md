# CARTRIDGE-CONTRACT.md - How the shell and games talk

Every game (a "cartridge") communicates with the shell ONLY through the messages below. The shell never reaches into a game's internals, and a game never touches the shell's screens. Anything that can send and receive these messages can be a Buildable game: today's canvas games, and later Phaser or Godot games, with zero shell changes.

## The engine field
Every manifest declares how its game runs:
- `engine` - `canvas` today; later `phaser` or `godot`
- `entry` - the URL the shell embeds (for canvas games, the game's HTML file)
The shell treats every game as "a thing I embed at its entry URL." It never assumes a game is a single HTML file.

## Messages: game to shell
- `ready` - the game has loaded and can accept commands
- `loading` with a percent (optional) - lets the shell show a real progress bar; heavier engine games should send this, light games can skip it
- `score` with a number - current score, whenever it changes
- `coins` with a number - coins earned this moment (the shell owns the wallet and the coin animation)
- `levelComplete` with stars earned - the shell takes over for celebration, journey update, and what happens next
- `needsCoins` (optional) - kid wants something they cannot afford; shell may offer a quiz top-up

## Messages: shell to game
- `start` with the level id and the kid's equipped customization (asset IDs resolved to URLs)
- `pause` - freeze everything NOW (used by quiz gates, parent interruptions, tab switches). Every game MUST honor this.
- `resume` - continue exactly where paused
- `setAudio` with on/off - the shell owns the sound toggle

## The art rule (protects the editor)
Cartridges MUST fetch their art at load time from the URLs the manifest resolves. Art is never baked into a game or a bundle. This is what makes drop-in art swapping in the editor work on every game, regardless of engine. Engine-built games load their textures from these URLs the same as canvas games do.

## Rules
- Messages only. No shared variables, no reaching across the boundary in either direction.
- A game that ignores `pause` or hardcodes art fails its QA contract check.
- New message types get added here first, then implemented. This file is the contract's single source of truth.
