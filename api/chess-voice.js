// /api/chess-voice.js — short spoken checkmate lines via ElevenLabs TTS, cached in
// narration_cache (key "chessvoice:<line>"), served as mp3. GET ?line=win1 (&force=1 to regen).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, friendly
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";

// Playful on a win, gentle/encouraging on a loss (the loser's own device plays "gg").
const LINES = {
  win1: "Checkmate! In your face!",
  win2: "Boom! Checkmate! Gotcha!",
  win3: "Checkmate! Too easy!",
  gg:   "Checkmate! Good game — want a rematch?",
  move1: "Let's go!",
  move2: "Here we go!",
  move3: "Onward!",
  move4: "Charge!",
  move5: "Woohoo!",
  move6: "For glory!",
  move7: "Hi-ho!",
  move8: "Tally-ho!",
  move9: "Adventure!",
  move10: "Coming through!",
  move11: "Zoom!",
  move12: "Take that!",
  move13: "Yes!",
  move14: "Marching on!",
  move15: "To the rescue!",
  move16: "Wheee!",
};

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
  const line=(req.query.line||"win1").toString();
  if(!LINES[line]) return res.status(400).json({ok:false,error:"unknown line"});
  const key="chessvoice:"+line;
  if(req.query.force) await cacheDel(key);
  let b64 = req.query.force ? null : await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){res.setHeader("Cache-Control","no-store");return res.status(503).json({ok:false,configured:false});}
    try{
      const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,{
        method:"POST",
        headers:{"xi-api-key":elKey,"Content-Type":"application/json","Accept":"audio/mpeg"},
        body:JSON.stringify({text:LINES[line],model_id:MODEL,voice_settings:{stability:0.3,similarity_boost:0.8,style:0.65,use_speaker_boost:true}}),
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
