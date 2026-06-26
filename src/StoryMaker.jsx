// /src/StoryMaker.jsx  (v4 — music-style flow, no emojis, style samples, jackpot)
import { useState, useEffect } from "react";
import StoryReader from "./StoryReader";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

const GUIDES = [["builder","Bo the Builder"],["wizard","Milo the Wizard"],["unicorn","Sparkle the Unicorn"],["fox","Pip the Fox"]];
const STYLES = [["watercolor","Watercolor"],["modern","Modern"],["modern3d","3D Movie"],["papercut","Paper cut-out"]];
const CHARACTERS = [
  ["bunny","Bramble Bunny"],["fox","Pip Fox"],["bear","Biscuit Bear"],["penguin","Waddle Penguin"],
  ["dragon","Ember Dragon"],["owl","Professor Owl"],["turtle","Shelby Turtle"],["hedgehog","Quill Hedgehog"],
  ["koala","Coco Koala"],["tiger","Tilly Tiger"],["fawn","Willow Fawn"],["otter","Ollie Otter"],
  ["wizard","Milo Wizard"],["fairy","Petal Fairy"],["robot","Bolt Robot"],["mermaid","Marina Mermaid"],
  ["unicorn","Sparkle Unicorn"],["builder","Bo Builder"],
];
const WORLDS = [
  ["snowy-village","Snowy Village"],["coral-reef","Coral Reef"],["enchanted-forest","Enchanted Forest"],["dragon-mountain","Dragon Mountain"],
  ["dino-jungle","Dino Jungle"],["space-station","Starlight Space"],["desert-oasis","Desert Oasis"],["candy-land","Candy Land"],
];
const QUESTS = [["lost_friend","Find a lost friend"],["hidden_treasure","Hunt for treasure"],["missing_star","A missing star"],["magic_door","A magic door"],["help_creature","Help a little creature"],["big_storm","A big cozy storm"]];
const MOODS = [["cozy","Cozy"],["silly","Silly"],["brave","Brave"],["magical","Magical"],["spooky","A little spooky"]];
const ENDINGS = [["happy","Happy"],["surprise","Surprise"],["friendship","Friendship"],["sleepy","Sleepy"]];
const SPARKS = ["It's my birthday!","I lost my favorite toy","My first day somewhere new","Learning to be brave","A rainy-day adventure","Making a new friend"];
const DEFAULT_NAME = Object.fromEntries(CHARACTERS);

function getDeviceId(){try{let id=localStorage.getItem("deviceId");if(!id){id="dev_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);localStorage.setItem("deviceId",id);}return id;}catch{return "dev_anon";}}
function getKidProfileId(){try{const k=JSON.parse(localStorage.getItem("bk_active_kid_v1")||"null");return k&&k.id?k.id:null;}catch{return null;}}
function libImg(kind,slug,style,emo){return "/api/story-library?img="+kind+":"+slug+"&style="+(style||"watercolor")+(emo?"&emo="+emo:"");}
const rand=(a)=>a[Math.floor(Math.random()*a.length)];

function Chevron({dir}){return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dir==="up"?<polyline points="6 15 12 9 18 15"/>:<polyline points="6 9 12 15 18 9"/>}</svg>);}

export default function StoryMaker({ onBack, onHome, playerName }) {
  const deviceId=getDeviceId(); const kidProfileId=getKidProfileId();
  const [view,setView]=useState("landing");   // landing | pick | generating | reading
  const [step,setStep]=useState(0);
  const [locking,setLocking]=useState(false);

  const [guide,setGuide]=useState("unicorn");
  const [style,setStyle]=useState("watercolor");
  const [hero,setHero]=useState("bunny");
  const [world,setWorld]=useState("enchanted-forest");
  const [quest,setQuest]=useState("lost_friend");
  const [mood,setMood]=useState("cozy");
  const [ending,setEnding]=useState("happy");
  const [spark,setSpark]=useState("");
  const [customSpark,setCustomSpark]=useState("");
  const [name,setName]=useState(DEFAULT_NAME["bunny"]);

  const [story,setStory]=useState(null);
  const [error,setError]=useState(null);
  const [genMsg,setGenMsg]=useState("Writing your story");
  const [saved,setSaved]=useState([]);
  const [saving,setSaving]=useState(false);
  const [savedMsg,setSavedMsg]=useState("");
  const [currentStoryId,setCurrentStoryId]=useState(null);

  async function loadSaved(){try{const r=await fetch("/api/list-stories?deviceId="+encodeURIComponent(deviceId)+(kidProfileId?"&kidProfileId="+encodeURIComponent(kidProfileId):""));const j=await r.json();setSaved(Array.isArray(j.stories)?j.stories:[]);}catch{}}
  useEffect(()=>{loadSaved();},[]);

  function reset(){setGuide("unicorn");setStyle("watercolor");setHero("bunny");setWorld("enchanted-forest");setQuest("lost_friend");setMood("cozy");setEnding("happy");setSpark("");setCustomSpark("");setName(DEFAULT_NAME["bunny"]);}
  function startPicker(){setError(null);reset();setStep(0);setView("pick");}

  const STEPS = [
    { key:"guide",  q:"Who's your story buddy?", opts:GUIDES,     val:guide,  set:setGuide,  img:(id)=>libImg("character",id,"watercolor","happy") },
    { key:"style",  q:"Pick a look",             opts:STYLES,     val:style,  set:setStyle,  img:(id)=>libImg("character","bunny",id,"happy") },
    { key:"hero",   q:"Who's our hero?",          opts:CHARACTERS, val:hero,   set:(v)=>{setHero(v);setName(DEFAULT_NAME[v]||"");}, img:(id)=>libImg("character",id,"watercolor","happy") },
    { key:"world",  q:"Where does it happen?",    opts:WORLDS,     val:world,  set:setWorld,  img:(id)=>libImg("world",id,"watercolor") },
    { key:"quest",  q:"What happens in the story?",opts:QUESTS,    val:quest,  set:setQuest,  img:null },
    { key:"mood",   q:"How should it feel?",      opts:MOODS,      val:mood,   set:setMood,   img:null },
    { key:"ending", q:"How does it end?",         opts:ENDINGS,    val:ending, set:setEnding, img:null },
  ];
  const TOTAL=STEPS.length;
  const atEnd=step>=TOTAL;
  const cur=STEPS[step];

  function labelOf(st){const o=st.opts.find(x=>x[0]===st.val);return o?o[1]:"";}
  function cycle(st,dir){const i=st.opts.findIndex(o=>o[0]===st.val);const ni=((i<0?0:i)+dir+st.opts.length)%st.opts.length;st.set(st.opts[ni][0]);}
  function pickOpt(st,id){st.set(id);}
  function next(){setStep(s=>Math.min(TOTAL,s+1));}
  function back(){ if(atEnd){setStep(TOTAL-1);return;} if(step>0)setStep(step-1); else setView("landing"); }

  function surprise(){
    setError(null);
    setGuide(rand(GUIDES)[0]); setStyle("watercolor");
    const h=rand(CHARACTERS)[0];
    makeStory({ guide:rand(GUIDES)[0], style:"watercolor", characterSlug:h, characterName:DEFAULT_NAME[h], worldSlug:rand(WORLDS)[0],
      quest:rand(QUESTS)[0], mood:rand(MOODS)[0], ending:rand(ENDINGS)[0], spark:rand(SPARKS) });
  }

  function doMake(){ if(locking) return; setLocking(true); setTimeout(()=>{ setLocking(false); makeStory(); }, 1350); }

  async function makeStory(payload){
    const body = payload || { guide, style, characterSlug:hero, characterName:(name||DEFAULT_NAME[hero]||""), worldSlug:world,
      quest, mood, ending, spark:(customSpark.trim()||spark) };
    setError(null); setGenMsg("Writing your story"); setView("generating");
    try{
      const r=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body, age:6, deviceId, kidProfileId})});
      const j=await r.json();
      if(!(j&&j.ok&&j.story)){ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"pick"); if(!payload)setStep(TOTAL); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    }catch{ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"pick"); if(!payload)setStep(TOTAL); }
  }
  async function makeSequel(prev){
    const c=(prev&&prev.created_with)||{};
    setError(null); setGenMsg("Starting a new adventure"); setView("generating");
    try{
      const r=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c, age:6, deviceId, kidProfileId})});
      const j=await r.json();
      if(!(j&&j.ok&&j.story)){ setError("Hmm, that didn't work."); setView("reading"); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    }catch{ setError("Hmm, that didn't work."); setView("reading"); }
  }

  async function saveStory(toSave){
    if(!toSave||!toSave.pages) toSave=story; if(!toSave) return;
    setSaving(true); setSavedMsg("");
    try{
      const r=await fetch("/api/save-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:toSave,deviceId,kidProfileId,kidName:(name||playerName||""),coverColor:"#7a4a86"})});
      const j=await r.json();
      if(r.ok&&j.ok){ setSavedMsg("Saved to your library!"); if(j.story&&j.story.story_id) setCurrentStoryId(j.story.story_id); loadSaved(); }
      else if(r.status===409) setSavedMsg(j.message||"Your library is full!");
      else setSavedMsg("Couldn't save — "+(j.detail||j.error||("error "+r.status)));
    }catch(e){ setSavedMsg("Couldn't save — "+((e&&e.message)||"network error")); }
    finally{ setSaving(false); }
  }
  async function openSaved(storyId){try{const r=await fetch("/api/list-stories?storyId="+encodeURIComponent(storyId));const j=await r.json();if(j&&j.story&&j.story.story){setStory(j.story.story);setSavedMsg("");setCurrentStoryId(storyId);setView("reading");}}catch{}}
  async function deleteSaved(storyId){try{await fetch("/api/delete-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId,storyId})});setSaved(p=>p.filter(x=>x.story_id!==storyId));}catch{}}

  // ---------- READING ----------
  if(view==="reading"&&story){
    return <StoryReader story={story} storyId={currentStoryId} deviceId={deviceId} kidProfileId={kidProfileId}
      onExit={()=>setView("landing")} onSave={saveStory} saving={saving} savedMsg={savedMsg} onNewAdventure={makeSequel} />;
  }
  if(view==="generating"){
    return (<div style={{...s.container,justifyContent:"center"}}>
      <div style={s.spinDots}>{[0,1,2].map(i=><span key={i} style={{...s.spinDot,animationDelay:(i*0.15)+"s"}}/>)}</div>
      <h2 style={s.genTitle}>{genMsg}…</h2>
      <p style={s.genSub}>{(GUIDES.find(g=>g[0]===guide)||[,"Your buddy"])[1]} is dreaming it up</p>
      <style>{spin}</style>
    </div>);
  }

  // ---------- PICKER ----------
  if(view==="pick"){
    return (<div style={s.container}>
      <style>{spin+lock}</style>
      <div style={s.topBar}><button style={s.navBtn} onClick={back}>Back</button><button style={s.navBtn} onClick={onHome}>Home</button></div>
      <div style={s.dots}>{STEPS.map((_,i)=><span key={i} style={{...s.dot,...(i===step?s.dotOn:i<step?s.dotDone:{})}}/>)}<span style={{...s.dot,...(atEnd?s.dotOn:{})}}/></div>

      {!atEnd ? (<>
        <h2 style={s.qTitle}>{cur.q}</h2>
        <div style={cur.img?s.grid:s.textGrid}>
          {cur.opts.map(([id,label])=>{const on=cur.val===id;return (
            <button key={id} onClick={()=>pickOpt(cur,id)} style={{...(cur.img?s.gTile:s.textTile),...(on?s.tileOn:{})}}>
              {cur.img && <img src={cur.img(id)} alt={label} loading="lazy" style={cur.key==="world"?s.gImgWorld:s.gImgChar}/>}
              <span style={s.gLabel}>{label}</span>
            </button>);})}
        </div>
        <div style={s.wizNav}>
          <button style={s.skip} onClick={()=>setStep(TOTAL)}>Skip to the end</button>
          <button style={s.next} onClick={next}>Next</button>
        </div>
      </>) : (<>
        <h2 style={s.qTitle}>One last thing!</h2>
        <div style={{width:"100%",maxWidth:520,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <label style={s.fieldLbl}>Name your hero</label>
          <input style={{...s.bigInput,textAlign:"center",fontFamily:FRED,fontSize:20}} value={name} maxLength={28} onChange={e=>setName(e.target.value)} placeholder="Hero name"/>
          <label style={{...s.fieldLbl,marginTop:10}}>What's your big idea? (optional)</label>
          <div style={s.sparkGrid}>
            {SPARKS.map((txt)=>(<button key={txt} onClick={()=>{setSpark(txt===spark&&!customSpark?"":txt);setCustomSpark("");}} style={{...s.sparkCard,...((spark===txt&&!customSpark)?s.tileOn:{})}}>{txt}</button>))}
          </div>
          <input style={s.bigInput} value={customSpark} maxLength={140} placeholder="…or type your own idea" onChange={(e)=>{setCustomSpark(e.target.value);if(e.target.value)setSpark("");}}/>
          <button style={{...s.makeBtn,...(locking?s.makeBtnLock:{})}} onClick={doMake} disabled={locking}>{locking?"Making it!":"Make my story!"}</button>
        </div>
      </>)}

      {/* STORY SO FAR — carry choices along; change any inline */}
      <div style={s.sofarWrap}>
        <div style={s.sofarHead}>{locking?"Locking it in…":"Your story so far — change anything"}</div>
        <div style={s.chipStrip}>
          {STEPS.filter((_,i)=>i<step||atEnd).map((st,i)=>(
            <div key={st.key} style={{...s.chip,...(locking?{animation:"bkLock .5s cubic-bezier(.2,.9,.3,1.5) "+(i*0.1)+"s both"}:{})}}>
              <button style={s.chev} onClick={()=>cycle(st,-1)} aria-label={"Change "+st.q}><Chevron dir="up"/></button>
              {st.img && <img src={st.img(st.val)} alt="" style={s.chipImg}/>}
              <div style={s.chipVal}>{labelOf(st)}</div>
              <button style={s.chev} onClick={()=>cycle(st,1)} aria-label={"Change "+st.q}><Chevron dir="down"/></button>
            </div>))}
        </div>
      </div>
      {error&&<p style={s.error}>{error}</p>}
    </div>);
  }

  // ---------- LANDING ----------
  return (<div style={s.container}>
    <div style={s.topBar}><button style={s.navBtn} onClick={onBack||onHome}>Back</button><button style={s.navBtn} onClick={onHome}>Home</button></div>
    <h1 style={s.logo}>Stories</h1>
    <p style={s.tagline}>Make a magical picture book — just tap!</p>
    <button style={s.startBtn} onClick={startPicker}>Make a new story</button>
    <button style={s.surpriseBtn} onClick={surprise}>Surprise me!</button>

    {saved.length>0&&(<div style={s.savedWrap}>
      <h3 style={s.sectionTitle}>My stories</h3>
      <div style={s.savedRow}>
        {saved.map((st)=>(<div key={st.story_id} style={s.savedCard}>
          <button style={s.savedOpen} onClick={()=>openSaved(st.story_id)}>
            <div style={{...s.savedCover,background:st.cover_color||"#7a4a86"}}/>
            <span style={s.savedName}>{st.title}</span></button>
          <button style={s.savedDel} onClick={()=>deleteSaved(st.story_id)} title="Delete">×</button>
        </div>))}
      </div>
    </div>)}
  </div>);
}

const spin = "@keyframes bkSpin{0%,80%,100%{transform:scale(.4);opacity:.4}40%{transform:scale(1);opacity:1}}";
const lock = "@keyframes bkLock{0%{transform:scale(1)}55%{transform:scale(1.12);box-shadow:0 0 0 3px rgba(255,224,138,.55)}100%{transform:scale(1)}}";

const s = {
  container:{minHeight:"100vh",background:PAGE_BG,color:"#fff",fontFamily:NUN,padding:"20px 16px 60px",display:"flex",flexDirection:"column",alignItems:"center"},
  topBar:{width:"100%",maxWidth:760,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  navBtn:{padding:"10px 18px",background:"rgba(255,255,255,0.08)",color:"#fff",border:"1px solid rgba(255,255,255,0.16)",borderRadius:14,fontWeight:700,fontFamily:NUN,cursor:"pointer"},
  logo:{fontFamily:FRED,fontSize:44,margin:"30px 0 6px",background:GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  tagline:{opacity:.8,marginBottom:26,fontSize:16},
  startBtn:{padding:"16px 34px",borderRadius:18,border:"none",background:GRAD,color:"#fff",fontSize:19,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 10px 30px rgba(155,126,221,0.5)"},
  surpriseBtn:{marginTop:14,padding:"12px 26px",borderRadius:16,border:"1px solid rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:16,fontWeight:800,fontFamily:FRED,cursor:"pointer"},
  dots:{display:"flex",gap:6,marginTop:6,marginBottom:12,flexWrap:"wrap",justifyContent:"center",maxWidth:320},
  dot:{width:9,height:9,borderRadius:"50%",background:"#39406e"},dotOn:{background:"#c06b99"},dotDone:{background:"#7aa2ff"},
  qTitle:{fontFamily:FRED,fontSize:25,margin:"4px 0 18px",textAlign:"center"},
  grid:{width:"100%",maxWidth:760,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(135px,1fr))",gap:12},
  textGrid:{width:"100%",maxWidth:620,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12},
  gTile:{borderRadius:16,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:8,display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontFamily:NUN},
  textTile:{borderRadius:16,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:"20px 12px",fontFamily:FRED,fontSize:16,textAlign:"center"},
  gImgChar:{width:"100%",aspectRatio:"1/1",objectFit:"contain",borderRadius:12,background:"rgba(255,255,255,0.05)"},
  gImgWorld:{width:"100%",aspectRatio:"1/1",objectFit:"cover",borderRadius:12},
  gLabel:{fontSize:13,fontWeight:700,textAlign:"center"},
  tileOn:{border:"2px solid #ffe08a",boxShadow:"0 0 0 3px rgba(255,224,138,0.3)"},
  wizNav:{display:"flex",gap:12,justifyContent:"center",marginTop:18,alignItems:"center"},
  skip:{padding:"12px 20px",borderRadius:14,border:"1px solid rgba(255,255,255,0.2)",background:"transparent",color:"#cdd3ff",fontWeight:700,fontFamily:FRED,cursor:"pointer"},
  next:{padding:"12px 30px",borderRadius:14,border:"none",background:GRAD,color:"#fff",fontWeight:800,fontFamily:FRED,fontSize:16,cursor:"pointer"},
  fieldLbl:{fontSize:14,opacity:.85,marginBottom:6,fontFamily:FRED},
  bigInput:{width:"100%",boxSizing:"border-box",padding:"13px 16px",borderRadius:14,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:16,fontFamily:NUN,marginBottom:12},
  sparkGrid:{width:"100%",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:12},
  sparkCard:{borderRadius:14,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:"13px 12px",fontFamily:FRED,fontSize:14,textAlign:"center"},
  makeBtn:{marginTop:8,padding:"16px 34px",borderRadius:18,border:"none",background:GRAD,color:"#fff",fontSize:19,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 10px 30px rgba(155,126,221,0.5)"},
  makeBtnLock:{opacity:.85,transform:"scale(.98)"},
  sofarWrap:{width:"100%",maxWidth:760,marginTop:28},
  sofarHead:{fontSize:13,color:"#b9b9d0",marginBottom:8,fontWeight:700,textAlign:"center"},
  chipStrip:{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"},
  chip:{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"6px 8px",minWidth:74},
  chev:{background:"transparent",border:"none",color:"#9aa0c7",cursor:"pointer",padding:0,lineHeight:0,height:16},
  chipImg:{width:38,height:38,objectFit:"contain",borderRadius:8},
  chipVal:{fontSize:11,fontWeight:700,textAlign:"center",maxWidth:80},
  error:{color:"#ffb0c0",fontSize:14,marginTop:12},
  genTitle:{fontFamily:FRED,fontSize:26,margin:"18px 0 6px"},genSub:{opacity:.7},
  spinDots:{display:"flex",gap:10},spinDot:{width:16,height:16,borderRadius:"50%",background:"#c06b99",animation:"bkSpin 1.2s ease-in-out infinite"},
  savedWrap:{width:"100%",maxWidth:760,marginTop:40},
  sectionTitle:{fontFamily:FRED,fontSize:20,marginBottom:12},
  savedRow:{display:"flex",gap:12,flexWrap:"wrap"},
  savedCard:{position:"relative"},
  savedOpen:{width:130,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  savedCover:{width:130,height:90,borderRadius:14},
  savedName:{fontSize:13,fontWeight:700,color:"#fff",textAlign:"center"},
  savedDel:{position:"absolute",top:-6,right:-6,width:26,height:26,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#fff",cursor:"pointer",fontSize:16,lineHeight:1},
};
