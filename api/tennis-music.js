// /api/tennis-music.js — real per-world background music for Buildable Tennis.
// Generated ONCE per world via ElevenLabs Music (POST /v1/music), cached in
// narration_cache (key "tennismusic:<world>"), and served as a loopable mp3.
// Mirrors api/chess-music.js, but UPBEAT + sporty (tennis is an active game).
//   GET ?world=beach        -> audio/mpeg (generates+caches on first call)
//   GET ?world=beach&force=1 -> regenerate
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Upbeat, bouncy, motivating — but still warm and kid-friendly (not frantic/shrill).
// One distinct genre per world, instrumental, seamless loop.
const WORLDS = {
  beach:   "Upbeat sunny tropical surf music for a fun children's tennis game: bright ukulele and warm marimba with a light bouncy beat and gentle steel-drum, happy beachy holiday energy, motivating but not frantic, instrumental, no vocals, smooth seamless loop",
  space:   "Upbeat bouncy retro synthwave for a kids' arcade tennis game: warm arpeggiated synths, a punchy but soft electronic beat, bright cosmic and playful, energetic and fun, instrumental, no vocals, smooth seamless loop",
  jungle:  "Lively playful jungle adventure music for a children's game: bouncy marimba and warm hand percussion with light tribal drums, sunny upbeat and energetic, fun and friendly, instrumental, no vocals, smooth seamless loop",
  ocean:   "Bright bubbly upbeat underwater music for a kids' game: light mallet synths and warm bells over a gentle bouncy beat, cheerful aquatic and playful, energetic but soft, instrumental, no vocals, smooth seamless loop",
  candy:   "Sweet bouncy playful pop music for a children's candy-world game: cheerful music box and marimba with soft claps and a light bubbly beat, happy and fun, warm not shrill, instrumental, no vocals, smooth seamless loop",
  snow:    "Sparkly upbeat winter music for a kids' game: bright glockenspiel and twinkly bells over a soft bouncy beat, crisp cheerful and energetic, cozy and fun, instrumental, no vocals, smooth seamless loop",
  volcano: "Exciting upbeat adventure music for a children's game: punchy soft drums and warm brass stabs with bouncy energy, thrilling and fun but friendly and NOT scary, instrumental, no vocals, smooth seamless loop",
  city:    "Funky upbeat rooftop groove for a kids' game at sunset: warm Rhodes electric piano and a light clap beat with a bouncy bassline, cool cheerful and energetic, instrumental, no vocals, smooth seamless loop",
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
  const world=(req.query.world||"beach").toString();
  if(!WORLDS[world]) return res.status(400).json({ok:false,error:"unknown world"});
  const key="tennismusic:"+world;
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
export { WORLDS as TENNIS_MUSIC_WORLDS };
