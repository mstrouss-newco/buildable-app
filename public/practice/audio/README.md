# Practice word audio

`words/` holds one small mp3 per Dolch sight word (`the.mp3`, `said.mp3`, …),
baked ONCE through the ElevenLabs pipeline and then served as a static file
forever after. Filenames are lowercase letters only, so `don't` is `dont.mp3`.

## How the page finds a word's voice

`public/practice.html` tries three things in order, so a kid always hears the
word:

1. **the baked file** — `/practice/audio/words/<word>.mp3`. Instant, free, and
   it keeps working with no network.
2. **`/api/say?t=<word>`** — the live ElevenLabs endpoint. Same warm voice, and
   it caches the clip server-side in `narration_cache`, so a word with no file
   yet still sounds right and costs nothing after the first play.
3. **the device voice** (`speechSynthesis`) — always available, never pretty.

That means a missing file is a quality step down, never a broken page.

## Baking the files

    node scripts/gen-practice-audio.mjs            # against production
    node scripts/gen-practice-audio.mjs --dry      # what is missing, spend nothing

It calls the deployed `/api/say`, which holds the ElevenLabs key server-side in
Vercel — the script never touches a secret. Words already on disk are skipped,
so an interrupted run just resumes, and a re-run is free.

**Status:** not yet baked. The PT1 build sandbox has no route to
`www.buildablekids.com` (its network policy refused all 220 requests), so the
one-time generation has to be run from a machine that can reach the live site.
Until then practice runs on tier 2, which is the same voice.
