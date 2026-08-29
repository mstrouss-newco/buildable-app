# Practice word audio

One mp3 per sight word, named after the word with everything but a-z stripped
(`don't` becomes `dont.mp3`). Baked once through the shared ElevenLabs pipeline:

    node scripts/gen-practice-audio.mjs

The script asks the deployed `/api/say`, which holds the ElevenLabs key server
side and caches every result forever, so it needs no key of its own and running
it again costs nothing.

`practice.html` looks for a file here first. If a word has no file it asks
`/api/say` live (same voice, generated once and then cached), and if that is
unreachable it falls back to the device voice. A missing file costs quality,
never the practice — which is why the page shipped before the files did.
