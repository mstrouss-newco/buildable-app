// /api/gen-exhibit-audio.js — MANUAL, server-side narration generator for a
// Kidspedia exhibit (EXHIBIT-MANIFEST.md). Run by the owner AFTER an exhibit is
// approved (never live while a kid waits): for every fact that has no audio yet,
// it speaks the fact once with the one configured narrator voice via ElevenLabs
// and saves the mp3 to the audio path (cache key "exhibit-audio:<id>"). The
// serve endpoint /api/explore-audio streams it later; the kid-facing template
// never triggers this. Generate-once + skip-if-present, so re-running is free.
//
// The ElevenLabs key lives ONLY in Vercel env (never in the browser, never in
// this repo). Cost is per character, so the JSON report totals the characters
// generated for the session recap.
//
//   GET /api/gen-exhibit-audio?exhibit=solar-system      -> generate the missing ones
//   GET /api/gen-exhibit-audio?exhibit=solar-system&dry=1 -> report what WOULD be made, spend nothing
//   (&force=1 regenerates all — requires ?token= when EXHIBIT_GEN_TOKEN is set)
//
// OWNER SETUP (env in Vercel, by name only):
//   ELEVENLABS_API_KEY            (required to generate)
//   ELEVENLABS_NARRATOR_VOICE_ID  (optional; else ELEVENLABS_VOICE_ID; else a warm default)
//   ELEVENLABS_MODEL_ID           (optional; default eleven_turbo_v2_5 — cheap + clear)
//   EXHIBIT_GEN_TOKEN             (optional; if set, ?force=1 needs ?token=<it>)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VOICE = process.env.ELEVENLABS_NARRATOR_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Rachel — warm, clear
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2_5";
const MAX_ITEMS = 80;      // bound the spend per call
const MAX_TEXT  = 700;     // bound each clip's characters

async function cacheGet(key){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY) return null;
  try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${encodeURIComponent(key)}&select=cache_key&limit=1`,{
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});
    if(!r.ok) return null; const rows=await r.json();
    return Array.isArray(rows)&&rows[0]?true:null;
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
async function logCost(chars,exhibit){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY||!chars) return;
  try{
    const today=new Date().toISOString().slice(0,10);
    // ElevenLabs TTS is ~ $0.00003 / char on the creator tiers; rough estimate only.
    await fetch(`${SUPABASE_URL}/rest/v1/usage_log`,{method:"POST",
      headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({date:today,cost_usd:+(chars*0.00003).toFixed(4),kind:"exhibit-narration",model:"elevenlabs:"+exhibit})});
  }catch{}
}

// Collect the narratable items from any exhibit shape (orbit center+bodies today,
// generic items[] for future templates). Each -> { id, name, text }.
function collectItems(data){
  const out=[];
  const push=(it)=>{
    if(!it||!it.id||!it.fact) return;
    out.push({ id:String(it.id), name:String(it.name||""), text:String(it.fact).trim().slice(0,MAX_TEXT) });
  };
  if(data.center) push(data.center);
  (Array.isArray(data.bodies)?data.bodies:[]).forEach(push);
  (Array.isArray(data.items)?data.items:[]).forEach(push);
  (Array.isArray(data.creatures)?data.creatures:[]).forEach(push);
  // Topic books (template "topic-book"): every page is one narratable item.
  // The template plays the clip for the page's FIRST fact only and reads any
  // other fact with the browser voice, so the clip must say exactly what that
  // fallback says — "<page title>. <first fact>" — or the narrator and the
  // robot voice would tell the kid two different things.
  (Array.isArray(data.pages)?data.pages:[]).forEach((p)=>{
    if(!p||!p.id) return;
    const facts=Array.isArray(p.facts)?p.facts:[];
    const first=facts[0];
    const text=typeof first==="string"?first:(first&&first.text)||"";
    if(!text.trim()) return;
    push({ id:p.id, name:p.title||"", fact:((p.title?p.title+". ":"")+text) });
  });
  return out.slice(0,MAX_ITEMS);
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const exhibit=(req.query.exhibit||"").toString().slice(0,60).replace(/[^a-z0-9-]/gi,"");
  if(!exhibit) return res.status(400).json({ok:false,error:"missing ?exhibit="});
  const dry=!!req.query.dry;
  const force=!!req.query.force;
  if(force && process.env.EXHIBIT_GEN_TOKEN && req.query.token!==process.env.EXHIBIT_GEN_TOKEN){
    return res.status(403).json({ok:false,error:"force requires token"});
  }

  // Load the approved exhibit from this deployment's own static file.
  const host=req.headers["x-forwarded-host"]||req.headers.host;
  const proto=req.headers["x-forwarded-proto"]||"https";
  let data;
  try{
    const r=await fetch(`${proto}://${host}/explore/${exhibit}.json`,{cache:"no-store"});
    if(!r.ok) return res.status(404).json({ok:false,error:"exhibit not found"});
    data=await r.json();
  }catch(e){ return res.status(502).json({ok:false,error:"could not load exhibit"}); }

  // Golden rule: only approved exhibits are ever spoken.
  if(!data||(data.status!=="approved"&&data.status!=="in-review")) return res.status(409).json({ok:false,error:"exhibit is not approved or in-review"});

  const items=collectItems(data);
  const elKey=process.env.ELEVENLABS_API_KEY;
  const report={ok:true,exhibit,voice:VOICE,model:MODEL,generated:[],skipped:[],failed:[],totalCharsGenerated:0};

  for(const it of items){
    const audioId=`${exhibit}-${it.id}`;          // the asset id / audio path
    const key="exhibit-audio:"+audioId;
    if(force) await cacheDel(key);
    if(!force && await cacheGet(key)){ report.skipped.push({item:it.id,id:audioId,reason:"already made"}); continue; }
    if(dry){ report.generated.push({item:it.id,id:audioId,chars:it.text.length,dryRun:true}); report.totalCharsGenerated+=it.text.length; continue; }
    if(!elKey){ return res.status(503).json({ok:false,configured:false,error:"ELEVENLABS_API_KEY not set"}); }
    try{
      const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`,{
        method:"POST",
        headers:{"xi-api-key":elKey,"Content-Type":"application/json","Accept":"audio/mpeg"},
        body:JSON.stringify({text:it.text,model_id:MODEL,voice_settings:{stability:0.45,similarity_boost:0.8,style:0.35,use_speaker_boost:true}}),
      });
      if(!r.ok){ report.failed.push({item:it.id,status:r.status,detail:(await r.text().catch(()=>"")).slice(0,160)}); continue; }
      const b64=Buffer.from(await r.arrayBuffer()).toString("base64");
      await cachePut(key,b64);
      report.generated.push({item:it.id,id:audioId,chars:it.text.length});
      report.totalCharsGenerated+=it.text.length;
    }catch(e){ report.failed.push({item:it.id,error:String(e&&e.message).slice(0,160)}); }
  }

  if(!dry && report.totalCharsGenerated) await logCost(report.totalCharsGenerated,exhibit);
  report.note=`Set factAudio:"<${exhibit}-{itemId}>" on each item in public/explore/${exhibit}.json so the template plays these; missing clips fall back to the browser voice.`;
  return res.status(200).json(report);
}
