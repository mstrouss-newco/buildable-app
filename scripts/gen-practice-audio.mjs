// scripts/gen-practice-audio.mjs — bake the ~220 Dolch sight words into
// public/practice/audio/words/ as mp3, ONCE, through the existing ElevenLabs
// pipeline (Session PT1).
//
// It does NOT touch the ElevenLabs key. It calls the deployed /api/say endpoint,
// which holds the key server-side in Vercel and caches every clip in
// narration_cache — so a re-run costs nothing, and the guardrail "never handle
// secrets" stays intact. That is also why this is a script you run, not a build
// step: the files are committed once and served statically forever after.
//
//   node scripts/gen-practice-audio.mjs                 # against production
//   node scripts/gen-practice-audio.mjs --base http://localhost:3000
//   node scripts/gen-practice-audio.mjs --dry           # list what is missing, spend nothing
//   node scripts/gen-practice-audio.mjs --force         # re-fetch even if present
//
// Words already on disk are skipped, so an interrupted run just resumes.
// If the endpoint is unreachable or unconfigured the script says so plainly and
// exits non-zero WITHOUT writing junk files — practice.html falls back to
// /api/say live, and then to the device voice, so a missing file is never a
// broken page.
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const BASE = (opt('base', 'https://www.buildablekids.com')).replace(/\/+$/, '');
const DECK_DIR = 'public/practice/decks';
const OUT_DIR = 'public/practice/audio/words';
const DRY = flag('dry');
const FORCE = flag('force');
const PAUSE_MS = 250;   // be gentle with the TTS endpoint

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function everyWord() {
  const seen = new Map();
  for (const f of fs.readdirSync(DECK_DIR)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const deck = JSON.parse(fs.readFileSync(path.join(DECK_DIR, f), 'utf8'));
    for (const it of deck.items || []) {
      const file = it.audio || (String(it.answer).toLowerCase().replace(/[^a-z]/g, '') + '.mp3');
      // The spoken text is the prompt, not the filename: "don't" is said with
      // its apostrophe even though it is saved as dont.mp3.
      if (!seen.has(file)) seen.set(file, it.say || it.prompt || it.answer);
    }
  }
  return [...seen.entries()].map(([file, text]) => ({ file, text }));
}

const words = everyWord();
fs.mkdirSync(OUT_DIR, { recursive: true });
const todo = words.filter((w) => FORCE || !fs.existsSync(path.join(OUT_DIR, w.file)));

console.log(`${words.length} words in the decks, ${todo.length} to fetch from ${BASE}/api/say`);
if (DRY) { todo.forEach((w) => console.log('  would fetch  ' + w.text)); process.exit(0); }
if (!todo.length) { console.log('Nothing to do — every word already has a file.'); process.exit(0); }

let made = 0, failed = [];
for (const w of todo) {
  const url = `${BASE}/api/say?t=${encodeURIComponent(w.text)}`;
  try {
    const r = await fetch(url);
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.includes('audio')) {
      failed.push(`${w.text} -> ${r.status} ${type || 'no content-type'}`);
    } else {
      const buf = Buffer.from(await r.arrayBuffer());
      // A 0-byte or absurdly small body is a failure wearing an audio hat.
      if (buf.length < 512) failed.push(`${w.text} -> only ${buf.length} bytes`);
      else { fs.writeFileSync(path.join(OUT_DIR, w.file), buf); made++; process.stdout.write('.'); }
    }
  } catch (e) {
    failed.push(`${w.text} -> ${String((e && e.message) || e).slice(0, 90)}`);
  }
  await sleep(PAUSE_MS);
}
process.stdout.write('\n');
console.log(`${made} files written to ${OUT_DIR}`);
if (failed.length) {
  console.log(`${failed.length} FAILED:`);
  failed.slice(0, 15).forEach((f) => console.log('  ' + f));
  if (failed.length > 15) console.log(`  ...and ${failed.length - 15} more`);
  console.log('Practice still works: the page falls back to /api/say live, then to the device voice.');
  process.exit(1);
}
