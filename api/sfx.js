// /api/sfx.js — short ambient sound effects (e.g. a trickling stream) generated
// once via ElevenLabs sound-generation, cached, and served as a loopable clip.
//   GET ?s=water   -> audio/mpeg (generates+caches on first call)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SOUNDS = {
  water: "Gentle continuous trickling forest stream, soft babbling water over pebbles, calm and steady, seamless ambient loop, no music, no voices",
  fire:  "Soft crackling cozy campfire, gentle pops, warm ambient loop, no music, no voices",
  waves: "Gentle calm ocean waves lapping softly, peaceful seaside ambient loop, no music, no voices",

  // ---- Chess game one-shot SFX (short, punchy, kid-friendly cartoon sounds) ----
  chess_select:  "Short soft UI pluck pop, friendly cartoon select blip, single hit, no music",
  chess_move:    "Short soft wooden tap whoosh, a game piece sliding and tapping down, single hit, no music",
  chess_check:   "Short playful alert chime, two quick rising warning notes, cartoon, single hit, no music",
  chess_castle:  "Two quick soft stone thuds with a light shuffle, cartoon, single hit, no music",
  chess_promote: "Cheerful rising magical sparkle chime, power-up level-up, short, no music",
  chess_win:     "Happy short victory fanfare with a sparkle, cheerful kids game win, no voices",
  chess_lose:    "Gentle soft descending wah-wah, friendly cartoon lose, short, no music",
  chess_capture:         "Short cartoon pop and crunch impact, a game piece knocked out, single hit, no music",
  chess_capture_space:   "Short sci-fi laser pew then a small explosion, cartoon space zap, single hit, no music",
  chess_capture_castle:  "Short metallic sword swipe slash with a bright clang, cartoon, single hit, no music",
  chess_capture_jungle:  "Short whoosh then a hollow wooden coconut bonk with a comic boing, cartoon, single hit, no music",
  chess_capture_ocean:   "Short watery bubble gulp and splash, cartoon underwater, single hit, no music",
  chess_capture_candy:   "Short crisp sugar-glass shatter and candy crunch, cartoon, single hit, no music",
  chess_capture_desert:  "Short soft sandy poof puff with a light whoosh, cartoon desert, single hit, no music",
};
// One-shot game SFX are short; ambience loops stay long.
const DURATIONS = {
  chess_select:0.4, chess_move:0.5, chess_check:0.7, chess_castle:0.7, chess_promote:1.0,
  chess_win:1.6, chess_lose:1.0, chess_yourturn:0.5, chess_capture:0.8,
  chess_capture_space:1.0, chess_capture_castle:0.8, chess_capture_jungle:0.9,
  chess_capture_ocean:0.9, chess_capture_candy:0.8, chess_capture_desert:0.9,
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
      const r=await fetch("https://api.elevenlabs.io/v1/sound-generation",{method:"POST",headers:{"xi-api-key":elKey,"Content-Type":"application/json"},body:JSON.stringify({text:SOUNDS[sName],duration_seconds:(DURATIONS[sName]||12),prompt_influence:0.5})});
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
