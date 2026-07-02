# Reusable background music library

Short, seamless, royalty-free instrumental loops (synthesized in-house) for use in
any Buildable game/experience. NOT used by Chess (chess now uses ElevenLabs Music
via /api/chess-music). Kept here for future reuse.

- lofi_chill_beat.mp3  — warm lo-fi beat (rhodes, soft drums)
- dreamy_ambient.mp3   — soft floating pads, no drums
- spacey_ambient.mp3   — deep warm cosmic pads
- cozy_piano.mp3       — gentle warm piano
- cozy_marimba.mp3     — warm acoustic marimba + light shaker
- playful_musicbox.mp3 — soft bouncy music box

## Reusable ElevenLabs tracks (created, warm, on-brand)

Served via `/api/library-music?name=<name>` (generated once, cached), and listed in
`/api/list-audio` for any game to reuse. Warm/rounded tones only — no chiptune, no
shrill highs. Preferred over the synthesized loops above for shipped product.

- spa_heartbeat_warm   — Kid Spa (Warm): mellow marimba + warm pads, gentle heartbeat pulse
- spa_heartbeat_bright — Kid Spa (Bright): marimba + soft glockenspiel, light playful bounce
