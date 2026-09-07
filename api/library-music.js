// /api/library-music.js — SHARED, reusable named background-music tracks for ANY
// Buildable game/experience (not tied to one game). Generated ONCE per name via
// ElevenLabs Music (POST /v1/music), cached in narration_cache (key
// "libmusic:<name>"), served as a loopable mp3. Register new reusable moods here
// and they appear in /api/list-audio automatically for every project to reuse.
//   GET ?name=spa_heartbeat_warm        -> audio/mpeg (generates+caches on first call)
//   GET ?name=spa_heartbeat_warm&force=1 -> regenerate
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Warm, rounded, mellow tones only — NO chiptune, NO synth beeps, NO shrill/piercing
// highs. Each entry is a reusable "mood" any game can call by name.
const MUSIC = {
  spa_heartbeat_warm: {
    label: "Kid Spa (Warm)",
    theme: "calm",
    prompt: "Warm cozy children's spa music: soft mellow marimba and gentle rounded warm synth pads, a light steady heartbeat-style soft kick keeping a calm gentle pulse, soothing and relaxing yet quietly upbeat, all warm rounded low-mid tones, absolutely no shrill or piercing high notes, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
  spa_heartbeat_bright: {
    label: "Kid Spa (Bright)",
    theme: "calm",
    prompt: "Warm happy children's spa music: soft mellow marimba and gentle glockenspiel over warm cushiony pads, a gentle steady heartbeat-style beat with a light playful bounce, cheerful and relaxing, warm rounded tones with a touch of soft sparkle but never shrill or piercing, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
  lofi_chill_upbeat: {
    label: "Lofi Chill (Upbeat)",
    theme: "calm",
    prompt: "Warm calm lofi hip-hop: mellow dusty electric piano and soft jazzy chords over a relaxed head-nodding boom-bap groove with soft vinyl crackle and a warm round bassline, chilled and cozy but quietly upbeat and positive, warm rounded low-mid tones, no shrill or piercing highs, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
  adventure_sunny_bounce: {
    label: "Sunny Adventure (Bounce)",
    theme: "adventure",
    prompt: "Warm playful outdoor adventure music for kids: bouncy mellow marimba and cheerful soft ukulele plucks over warm rounded acoustic bass with a light hand-clap and shaker groove, sunny upbeat and adventurous with a gentle spring in its step, all warm rounded low-mid tones, absolutely no shrill or piercing high notes, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
  // Added Session FL4 for Sky Flyer, but reusable by ANY game that wants an
  // open-air, floaty, going-somewhere feel (theme "flight").
  sky_open_air: {
    label: "Open Skies (Floaty)",
    theme: "flight",
    prompt: "Warm floating open-sky music for kids: soft mellow marimba and warm rounded pads drifting over a gentle acoustic guitar pulse and a light brushed shaker, airy and wide open like flying over sunny islands, calm and quietly joyful, all warm rounded low-mid tones, absolutely no shrill or piercing high notes, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
  sky_soar_bright: {
    label: "Soaring (Bright)",
    theme: "flight",
    prompt: "Warm uplifting soaring flight music for kids: gentle glockenspiel and soft mellow marimba over warm cushiony pads with a light optimistic mid-tempo pulse and soft hand percussion, a rising sense of lifting off and gliding, cheerful and warm, warm rounded tones with a touch of soft sparkle but never shrill or piercing, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },

  // Added card AC4 for Ant City, but reusable by ANY game that wants a sunny,
  // busy, keep-going-forever feel (a colony, a farm, a little town).
  meadow_busy_bright: {
    label: "Sunny Meadow (Busy)",
    theme: "adventure",
    prompt: "Warm sunny meadow music for kids: light mellow marimba and soft pizzicato strings trotting along over warm rounded upright bass and a gentle brushed shaker, busy and industrious in a friendly pottering way, like a summer afternoon of small creatures getting things done, cheerful and never rushed, all warm rounded low-mid tones, absolutely no shrill or piercing high notes, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },

  adventure_meadow_soft: {
    label: "Meadow Explore (Soft)",
    theme: "adventure",
    prompt: "Warm gentle outdoor exploration music for kids: soft mellow acoustic guitar and light marimba over warm rounded pads and a slow easy shaker pulse, curious and adventurous but relaxed and cozy like a sunny meadow stroll, warm rounded low-mid tones, no shrill or piercing highs, no chiptune, no harsh synths, instrumental, no vocals, seamless loop",
  },
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
  const name=(req.query.name||"spa_heartbeat_warm").toString();
  if(!MUSIC[name]) return res.status(400).json({ok:false,error:"unknown track"});
  const key="libmusic:"+name;
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
        body:JSON.stringify({prompt:MUSIC[name].prompt.slice(0,4000),music_length_ms:30000,model_id:model}),
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

// Named export so the shared audio catalog (/api/list-audio) can list every
// reusable library track without duplicating the definitions.
export { MUSIC as LIBRARY_MUSIC };
