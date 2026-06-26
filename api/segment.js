// /api/segment.js — text-prompted region masks for in-image effects (water, fire,
// a candle, a glowing door...). Uses fal.ai evf-sam: image + word -> binary mask.
// We cache the mask and serve it; the reader uses it to confine a CSS effect.
//   GET ?probe=run&image=<url>&prompt=water     -> { ok, maskUrl } (test)
//   POST { k, prompt }                          -> generate+cache mask for scene k
//   GET ?mask=1&k=<sceneKey>&prompt=water        -> serve cached mask PNG
import crypto from "crypto";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MODEL = "fal-ai/evf-sam";

function readBody(req){if(req.body&&typeof req.body==="object")return Promise.resolve(req.body);return new Promise((res)=>{let raw="";req.on("data",c=>raw+=c);req.on("end",()=>{try{res(JSON.parse(raw||"{}"));}catch{res({});}});});}
function sha1(x){return crypto.createHash("sha1").update(x).digest("hex");}
async function cacheGet(key){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return null;try{const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});if(!r.ok)return null;const rows=await r.json();return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;}catch{return null;}}
async function cachePut(key,b64){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return;try{await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{method:"POST",headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})});}catch{}}

async function falRun(input){
  const sub=await fetch("https://queue.fal.run/"+MODEL,{method:"POST",headers:{Authorization:"Key "+process.env.FAL_KEY,"Content-Type":"application/json"},body:JSON.stringify(input)});
  const sj=await sub.json().catch(()=>({}));
  if(!sub.ok||!sj.status_url) return {error:"submit",status:sub.status,detail:sj};
  for(let i=0;i<80;i++){
    const sr=await fetch(sj.status_url,{headers:{Authorization:"Key "+process.env.FAL_KEY}});
    const st=await sr.json().catch(()=>({}));
    if(st.status==="COMPLETED"){const rr=await fetch(sj.response_url,{headers:{Authorization:"Key "+process.env.FAL_KEY}});return await rr.json().catch(()=>({}));}
    if(st.status&&st.status!=="IN_QUEUE"&&st.status!=="IN_PROGRESS")return{error:"status",status:st.status};
    await new Promise(r=>setTimeout(r,2000));
  }
  return {error:"timeout"};
}

export default async function handler(req,res){
  if(req.method==="GET"&&req.query.probe==="run"){
    if(!process.env.FAL_KEY)return res.status(200).json({ok:false,hasFal:false});
    const image=(req.query.image||"").toString(), prompt=(req.query.prompt||"water").toString();
    const r=await falRun({prompt,image_url:image,mask_only:true,blur_mask:9,fill_holes:true});
    return res.status(200).json({ok:!r.error,maskUrl:r&&r.image&&r.image.url,error:r&&r.error,detail:r});
  }
  if(req.method==="GET"&&req.query.mask){
    const key="seg:"+sha1((req.query.k||"")+"|"+(req.query.prompt||"water"));
    const b64=await cacheGet(key);
    if(!b64){res.status(404).json({ok:false,missing:true});return;}
    res.setHeader("Content-Type","image/png");res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Cache-Control","public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(b64,"base64"));return;
  }
  if(req.method==="POST"){
    if(!process.env.FAL_KEY)return res.status(200).json({ok:true,noFal:true});
    const body=await readBody(req);
    const k=(body.k||"").toString(), prompt=(body.prompt||"water").toString();
    if(!k)return res.status(400).json({ok:false,error:"k required"});
    const key="seg:"+sha1(k+"|"+prompt);
    if(!body.force&&await cacheGet(key))return res.status(200).json({ok:true,cached:true});
    const proto=(req.headers["x-forwarded-proto"]||"https").toString(), host=(req.headers.host||"").toString();
    const image=`${proto}://${host}/api/story-library?pimg=1&k=${encodeURIComponent(k)}`;
    const r=await falRun({prompt,image_url:image,mask_only:true,blur_mask:9,fill_holes:true});
    if(r.error||!r.image||!r.image.url)return res.status(200).json({ok:false,failed:true,detail:r});
    try{const mr=await fetch(r.image.url);const buf=Buffer.from(await mr.arrayBuffer());await cachePut(key,buf.toString("base64"));}catch(e){return res.status(200).json({ok:false,fetchFail:String(e&&e.message)});}
    return res.status(200).json({ok:true,generated:true});
  }
  return res.status(200).json({ok:true,model:MODEL,hasFal:!!process.env.FAL_KEY});
}
