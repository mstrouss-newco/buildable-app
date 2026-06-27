// /api/spell-voice.js — clear, kid-friendly SPOKEN letters + simple words via
// ElevenLabs TTS, generated once, cached in narration_cache, served as mp3.
// This is the shared "spelling voice" library: the Word Buddies Helper uses it to
// spell a word out loud ("C... A... T... cat!"), and Typing / Bingo (and any future
// reading game) can reuse the very same cached clips. See ASSET-LIBRARY.md (sound rule:
// only crafted ElevenLabs audio — never computer beeps).
//
//   GET /api/spell-voice?letter=c   -> the LETTER NAME "see"  (cache key spell:ltr_c)
//   GET /api/spell-voice?word=cat   -> the spoken WORD "cat!" (cache key spell:w_cat)
//   add &force=1 to regenerate one clip.
//
// Letters are sent to TTS as gentle phonetic respellings ("ay","bee","see"...) so a
// single character is always read as its clear letter NAME, never as a stray word.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, friendly
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

// Phonetic respellings so each letter is spoken as its NAME, crisp and unambiguous.
const LETTER_SAY = {
  a: "Ay.",   b: "Bee.",  c: "See.",  d: "Dee.",  e: "Ee.",   f: "Eff.",
  g: "Jee.",  h: "Aitch.",i: "Eye.",  j: "Jay.",  k: "Kay.",  l: "Ell.",
  m: "Em.",   n: "En.",   o: "Oh.",   p: "Pee.",  q: "Cue.",  r: "Arr.",
  s: "Ess.",  t: "Tee.",  u: "You.",  v: "Vee.",  w: "Double-you.",
  x: "Ex.",   y: "Why.",  z: "Zee.",
};

// The canonical easy word list (2–4 letters) — kept in sync with the WORDS in
// public/word-buddies.html GAME_CONFIG. Said cheerfully, with a happy lilt.
const WORDS = [
  "cat","dog","sun","fish","bat","hat","cap","map","pig","cow","hen","fox",
  "bug","bee","ant","owl","run","hop","dig","mud","log","web","jam","cup",
  "pot","pan","net","bed","box","top","bus","van","sky","toy","ball","bird",
  "frog","tree","star","moon","milk","cake","book","duck","frog","rain","leaf","nest",
];
const WORDSET = new Set(WORDS);

async function cacheGet(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});
    if(!r.ok) return null; const rows=await r.json();
    return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;
  }catch{return null;}
}
async function cachePut(key,b64){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return;
  try{ await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{method:"POST",
    headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},
    body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})}); }catch{}
}
async function cacheDel(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return;
  try{ await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}`,{method:"DELETE",
    headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}}); }catch{}
}

export default async function handler(req,res){
  const letter=(req.query.letter||"").toString().toLowerCase();
  const word=(req.query.word||"").toString().toLowerCase();

  let key, text, settings;
  if(letter){
    if(!LETTER_SAY[letter]){ res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"unknown letter"}); }
    key="spell:ltr_"+letter; text=LETTER_SAY[letter];
    // higher stability = a clean, steady letter name; low style = no drama.
    settings={stability:0.55,similarity_boost:0.85,style:0.15,use_speaker_boost:true};
  } else if(word){
    if(!WORDSET.has(word)){ res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"unknown word"}); }
    key="spell:w_"+word; text=word+"!";
    // a touch warmer/brighter for the happy blended word at the end.
    settings={stability:0.4,similarity_boost:0.85,style:0.4,use_speaker_boost:true};
  } else {
    res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"pass ?letter= or ?word="});
  }

  if(req.query.force) await cacheDel(key);
  let b64 = req.query.force ? null : await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){ res.setHeader("Cache-Control","no-store"); return res.status(503).json({ok:false,configured:false}); }
    try{
      const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,{
        method:"POST",
        headers:{"xi-api-key":elKey,"Content-Type":"application/json","Accept":"audio/mpeg"},
        body:JSON.stringify({text,model_id:MODEL,voice_settings:settings}),
      });
      if(!r.ok){ res.setHeader("Cache-Control","no-store"); return res.status(503).json({ok:false,failed:true,status:r.status,detail:(await r.text().catch(()=>"")).slice(0,200)}); }
      b64=Buffer.from(await r.arrayBuffer()).toString("base64");
      await cachePut(key,b64);
    }catch(e){ res.setHeader("Cache-Control","no-store"); return res.status(503).json({ok:false,error:String(e&&e.message).slice(0,160)}); }
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}

// Named exports so the shared audio catalog (/api/list-audio) can list these
// crafted speech clips without duplicating the data.
export { LETTER_SAY, WORDS };
