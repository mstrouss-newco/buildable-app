// /api/breaker-music.js — upbeat arcade background music for Buildable Breaker.
// Generated ONCE per world via ElevenLabs Music (POST /v1/music), cached in
// narration_cache (key "breakermusic:<world>"), and served as a loopable mp3.
//   GET ?world=meadow   -> audio/mpeg (generates+caches on first call)
//   GET ?world=meadow&force=1 -> regenerate
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Warm, LOW, mellow, instrumental — a distinct genre per world (no high-pitched/organ tones).
const WORLDS = {
  meadow: "Upbeat cheerful chiptune pop for a kids arcade brick-breaker game: bright bouncy synth melody, peppy snappy drums, sunny energetic and playful, fun and catchy, instrumental, no vocals, seamless loop",
  space:  "Energetic retro arcade synthwave: driving synth arpeggios, punchy electronic drums, fun cosmic adventure energy, upbeat and bright but not harsh, instrumental, no vocals, seamless loop",
  candy:  "Bouncy happy bubblegum chiptune pop: sweet playful synth melody, peppy claps and drums, super cheerful candy mood, upbeat and fun, instrumental, no vocals, seamless loop",
  ocean:  "Upbeat tropical surf chiptune: bright bouncy melody with light steel-drum, peppy beat, fun splashy adventure energy, cheerful and lively, instrumental, no vocals, seamless loop",
  castle: "Heroic upbeat 8-bit adventure march: catchy bright chiptune melody, peppy marching drums, fun playful quest energy, instrumental, no vocals, seamless loop",
  desert: "Funky upbeat arcade groove: bouncy synth bass, peppy drums and bright synth stabs, fun sunny desert adventure energy, cheerful, instrumental, no vocals, seamless loop",
};

async function cacheGet(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});
    if(!r.ok) return null;
    const rows=await r.json();
    return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;
  }catch{return null;}
}
async function cachePut(key,b64){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return;
  try{
    await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{
      method:"POST",
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},
      body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})});
  }catch{}
}
async function cacheDel(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return;
  try{ await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}`,{method:"DELETE",
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});
  }catch{}
}

export default async function handler(req,res){
  const world=(req.query.world||"meadow").toString();
  if(!WORLDS[world]) return res.status(400).json({ok:false,error:"unknown world"});
  const key="breakermusic:"+world;
  if(req.query.force) await cacheDel(key);

  let b64 = req.query.force ? null : await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,configured:false});}
    const model=(process.env.ELEVENLABS_MUSIC_MODEL||"music_v1").toLowerCase();
    try{
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),240000);
      const r=await fetch("https://api.elevenlabs.io/v1/music",{
        method:"POST",
        headers:{"xi-api-key":elKey,"Content-Type":"application/json","Accept":"audio/mpeg"},
        body:JSON.stringify({prompt:WORLDS[world].slice(0,4000),music_length_ms:30000,model_id:model}),
        signal:ctrl.signal,
      });
      clearTimeout(timer);
      if(!r.ok){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,failed:true,status:r.status,detail:(await r.text().catch(()=>"")) .slice(0,200)});}
      const buf=Buffer.from(await r.arrayBuffer());
      b64=buf.toString("base64");
      await cachePut(key,b64);
    }catch(e){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,error:String(e&&e.message).slice(0,160)});}
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}

// Named export so the shared audio catalog can list per-world music without duplicating.
export { WORLDS as BREAKER_MUSIC_WORLDS };
