#!/usr/bin/env node
// scripts/gen-practice-audio.mjs — bake the Practice word audio (Session PT1).
//
// Every sight word in public/practice/decks is spoken once through the SAME
// ElevenLabs pipeline the rest of the product uses (/api/say, which holds the
// key server-side and caches every result in narration_cache forever), and the
// mp3 is written to public/practice/audio/<word>.mp3.
//
// It is a one-time cost: ~220 words, a few KB each. Running it twice is free —
// a word that already has a file is skipped, and a word already in the server
// cache costs no ElevenLabs credits.
//
//   node scripts/gen-practice-audio.mjs                 # against production
//   node scripts/gen-practice-audio.mjs --base http://localhost:3000
//   node scripts/gen-practice-audio.mjs --force         # re-record everything
//   node scripts/gen-practice-audio.mjs --dry           # just say what it would do
//
// THIS SCRIPT NEEDS NO KEY. It never sees ELEVENLABS_API_KEY: it asks the
// deployed /api/say endpoint, which carries it. That is deliberate — see the
// never-handle-secrets rule in AGENTS.md.
//
// The page does not depend on this having been run. practice.html falls back to
// /api/say live, and then to the device voice, so a missing file costs quality,
// never the lesson.
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const flag = (k) => args.indexOf(k) !== -1;
const val = (k, d) => { const i = args.indexOf(k); return i === -1 ? d : args[i + 1]; };

const BASE = (val('--base', process.env.PRACTICE_AUDIO_BASE || 'https://buildablekids.com')).replace(/\/+$/, '');
const FORCE = flag('--force');
const DRY = flag('--dry');
const DECKS = 'public/practice/decks';
const OUT = 'public/practice/audio';

const slug = (w) => String(w).toLowerCase().replace(/[^a-z]/g, '');

const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8'));
const words = new Map();                       // slug -> the word as written
for (const d of index.decks) {
  const deck = JSON.parse(fs.readFileSync(path.join(DECKS, d.file), 'utf8'));
  for (const it of deck.items) words.set(slug(it.word), it.say || it.word);
}
fs.mkdirSync(OUT, { recursive: true });

const todo = [...words.entries()].filter(([s]) => FORCE || !fs.existsSync(path.join(OUT, s + '.mp3')));
console.log(`${words.size} words, ${todo.length} to record, from ${BASE}/api/say`);
if (DRY) { console.log(todo.map(([s]) => s).join(' ')); process.exit(0); }

let made = 0, failed = [];
for (const [s, word] of todo) {
  const url = `${BASE}/api/say?t=${encodeURIComponent(word)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) { failed.push(`${word} (http ${r.status})`); continue; }
    const type = r.headers.get('content-type') || '';
    if (type.indexOf('audio') === -1) { failed.push(`${word} (${type || 'no content-type'})`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 400) { failed.push(`${word} (${buf.length} bytes, too small to be speech)`); continue; }
    fs.writeFileSync(path.join(OUT, s + '.mp3'), buf);
    made++;
    process.stdout.write('.');
  } catch (e) {
    failed.push(`${word} (${String((e && e.message) || e).slice(0, 60)})`);
  }
}
console.log(`\nrecorded ${made}, failed ${failed.length}`);
if (failed.length) {
  console.log('failed: ' + failed.slice(0, 20).join(', ') + (failed.length > 20 ? ' ...' : ''));
  console.log('A failure here is not a broken page — practice.html falls back to /api/say, then the device voice.');
  process.exit(1);
}
