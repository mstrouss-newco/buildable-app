// /api/say.js — short spoken kid word/letter/picture-name audio via ElevenLabs TTS, cached in
// narration_cache (key "say:<text>"), served as mp3. Used by Bingo (word & picture caller) and
// reusable by any kid maker that needs to say a simple word or letter.
//   GET /api/say?t=Cat!            -> spoken "Cat!"
//   GET /api/say?t=C,%20A,%20T.%20Cat   -> spelled then said (word bingo)
// (&force=1 to regenerate). Text is capped + sanitized; this only ever speaks short safe strings.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, friendly
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

async function cacheGet(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(key)}&select=audio_b64&limit=1`,{
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
  try{ await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(key)}`,{method:"DELETE",
    headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}}); }catch{}
}

export default async function handler(req,res){
  // sanitize: letters/numbers/space + a few safe punctuation marks, capped length
  let text=(req.query.t||"").toString().slice(0,60).replace(/[^A-Za-z0-9 ,.!?'-]/g,"");
  text=text.trim();
  if(!text) return res.status(400).json({ok:false,error:"empty text"});
  const key="say:"+text.toLowerCase();
  if(req.query.force) await cacheDel(key);
  let b64 = req.query.force ? null : await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,configured:false});}
    try{
      const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,{
        method:"POST",
        headers:{"xi-api-key":elKey,"Content-Type":"application/json","Accept":"audio/mpeg"},
        body:JSON.stringify({text,model_id:MODEL,voice_settings:{stability:0.4,similarity_boost:0.8,style:0.5,use_speaker_boost:true}}),
      });
      if(!r.ok){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,failed:true,status:r.status,detail:(await r.text().catch(()=>"")).slice(0,200)});}
      b64=Buffer.from(await r.arrayBuffer()).toString("base64");
      await cachePut(key,b64);
    }catch(e){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,error:String(e&&e.message).slice(0,160)});}
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}
