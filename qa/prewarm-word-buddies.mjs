// qa/prewarm-word-buddies.mjs — one-time pre-generate + cache ALL Word Buddies audio
// so the first kid never waits. Hits the LIVE endpoints (which generate-on-first-call
// via ElevenLabs and cache in narration_cache). Requires ELEVENLABS_API_KEY to be set
// in Vercel (owner step) — this script only triggers generation, it never sees the key.
//
//   node qa/prewarm-word-buddies.mjs                 # against production
//   BASE=https://<preview>.vercel.app node qa/prewarm-word-buddies.mjs
//
import { LETTER_SAY, WORDS } from "../api/spell-voice.js";

const BASE = process.env.BASE || "https://www.buildablekids.com";
const SFX = ["wb_pick","wb_place","wb_word","wb_star","wb_helper","wb_oops","wb_win"];

const urls = [
  ...Object.keys(LETTER_SAY).map((l) => `${BASE}/api/spell-voice?letter=${l}`),
  ...[...new Set(WORDS)].map((w) => `${BASE}/api/spell-voice?word=${w}`),
  ...SFX.map((s) => `${BASE}/api/sfx?s=${s}`),
];

let ok = 0, fail = 0;
for (const u of urls) {
  try {
    const r = await fetch(u);
    const ct = r.headers.get("content-type") || "";
    if (r.ok && ct.startsWith("audio/")) { ok++; process.stdout.write("."); }
    else { fail++; console.log("\n  MISS", u, r.status, ct, (await r.text().catch(()=>"")).slice(0,120)); }
  } catch (e) { fail++; console.log("\n  ERR", u, String(e.message)); }
}
console.log(`\nprewarm done: ${ok} ok, ${fail} missing/failed, ${urls.length} total`);
if (fail) console.log("If everything failed: confirm ELEVENLABS_API_KEY is set in Vercel.");
