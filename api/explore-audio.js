// /api/explore-audio.js — SERVE-ONLY narration for a Kidspedia exhibit fact.
// This endpoint NEVER generates. It only reads pre-generated narration from the
// cache and streams it back as mp3. If a clip is missing it returns 404 so the
// exhibit template instantly falls back to the browser's built-in voice — a kid
// is NEVER left waiting on ElevenLabs while the "Read to me" button is pressed.
// Generation is a separate, manual step: /api/gen-exhibit-audio (owner-run).
//   GET /api/explore-audio?id=solar-system-sun  -> audio/mpeg  (or 404 if not made yet)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function cacheGet(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(key)}&select=audio_b64&limit=1`,{
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});
    if(!r.ok) return null; const rows=await r.json();
    return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;
  }catch{return null;}
}

export default async function handler(req,res){
  // asset id: exhibit id + item id joined by a dash, e.g. solar-system-sun
  const id=(req.query.id||"").toString().slice(0,80).replace(/[^a-z0-9-]/gi,"");
  if(!id){ res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"missing id"}); }
  const b64=await cacheGet("exhibit-audio:"+id);
  if(!b64){
    // Not generated yet — tell the template to use its browser-voice fallback.
    res.setHeader("Cache-Control","no-store");
    return res.status(404).json({ok:false,pending:true});
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}
