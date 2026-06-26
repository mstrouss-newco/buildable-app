// /api/sfx.js — short ambient sound effects (e.g. a trickling stream) generated
// once via ElevenLabs sound-generation, cached, and served as a loopable clip.
//   GET ?s=water   -> audio/mpeg (generates+caches on first call)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SOUNDS = {
  water: "Gentle continuous trickling forest stream, soft babbling water over pebbles, calm and steady, seamless ambient loop, no music, no voices",
  fire:  "Soft crackling cozy campfire, gentle pops, warm ambient loop, no music, no voices",
  waves: "Gentle calm ocean waves lapping softly, peaceful seaside ambient loop, no music, no voices",
};

async function cacheGet(key){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return null;try{const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});if(!r.ok)return null;const rows=await r.json();return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;}catch{return null;}}
async function cachePut(key,b64){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return;try{await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{method:"POST",headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})});}catch{}}

export default async function handler(req,res){
  const sName=(req.query.s||"water").toString();
  if(!SOUNDS[sName]) return res.status(400).json({ok:false,error:"unknown sound"});
  const key="sfx:"+sName;
  let b64=await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey) return res.status(200).json({ok:true,configured:false});
    try{
      const r=await fetch("https://api.elevenlabs.io/v1/sound-generation",{method:"POST",headers:{"xi-api-key":elKey,"Content-Type":"application/json"},body:JSON.stringify({text:SOUNDS[sName],duration_seconds:12,prompt_influence:0.5})});
      if(!r.ok) return res.status(200).json({ok:false,failed:true,status:r.status,detail:(await r.text()).slice(0,200)});
      const buf=Buffer.from(await r.arrayBuffer());
      b64=buf.toString("base64");
      await cachePut(key,b64);
    }catch(e){return res.status(200).json({ok:false,error:String(e&&e.message).slice(0,120)});}
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}
