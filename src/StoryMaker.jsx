// /src/StoryMaker.jsx  (v3 — guided, personalized flow)
import { useState, useEffect } from "react";
import StoryReader from "./StoryReader";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

const GUIDES = [["builder","Bo the Builder"],["wizard","Milo the Wizard"],["unicorn","Sparkle the Unicorn"],["fox","Pip the Fox"]];
const STYLES = [["watercolor","Watercolor","🎨",true],["modern3d","Modern 3D","🧸",false],["papercut","Paper cut-out","✂️",false]];
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
const QUESTS = [["lost_friend","🔍","Find a lost friend"],["hidden_treasure","💎","Hunt for treasure"],["missing_star","⭐","A missing star"],["magic_door","🚪","A magic door"],["help_creature","🐣","Help a little creature"],["big_storm","⛈️","A big cozy storm"]];
const MOODS = [["cozy","🔥","Cozy"],["silly","😄","Silly"],["brave","🦁","Brave"],["magical","🪄","Magical"],["spooky","👻","A little spooky"]];
const ENDINGS = [["happy","🎉","Happy"],["surprise","🎁","Surprise"],["friendship","💞","Friendship"],["sleepy","🌙","Sleepy"]];
const SPARKS = ["It's my birthday!","I lost my favorite toy","My first day somewhere new","Learning to be brave","A rainy-day adventure","Making a new friend"];
const DEFAULT_NAME = Object.fromEntries(CHARACTERS);

const STEPS = ["guide","style","hero","world","quest","mood","ending","spark","mine","name"];
const QTEXT = {
  guide:"Who's your story buddy?", style:"Pick a look!", hero:"Who's our hero?", world:"Where does it happen?",
  quest:"What happens in the story?", mood:"How should it feel?", ending:"How does it end?",
  spark:"What's your big idea?", mine:"Make it yours!", name:"Name your hero!",
};

function getDeviceId(){try{let id=localStorage.getItem("deviceId");if(!id){id="dev_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);localStorage.setItem("deviceId",id);}return id;}catch{return "dev_anon";}}
function getKidProfileId(){try{const k=JSON.parse(localStorage.getItem("bk_active_kid_v1")||"null");return k&&k.id?k.id:null;}catch{return null;}}
function libImg(kind,slug,emo){return "/api/story-library?img="+kind+":"+slug+"&style=watercolor"+(emo?"&emo="+emo:"");}
const rand=(a)=>a[Math.floor(Math.random()*a.length)];

export default function StoryMaker({ onBack, onHome, playerName }) {
  const deviceId=getDeviceId(); const kidProfileId=getKidProfileId();
  const [view,setView]=useState("landing");
  const [si,setSi]=useState(0);

  const [guide,setGuide]=useState(null);
  const [style,setStyle]=useState("watercolor");
  const [hero,setHero]=useState(null);
  const [world,setWorld]=useState(null);
  const [quest,setQuest]=useState(null);
  const [mood,setMood]=useState(null);
  const [ending,setEnding]=useState(null);
  const [spark,setSpark]=useState("");
  const [customSpark,setCustomSpark]=useState("");
  const [favColor,setFavColor]=useState(""); const [favFood,setFavFood]=useState(""); const [petName,setPetName]=useState("");
  const [name,setName]=useState("");

  const [story,setStory]=useState(null);
  const [error,setError]=useState(null);
  const [genMsg,setGenMsg]=useState("Writing your story…");
  const [saved,setSaved]=useState([]);
  const [saving,setSaving]=useState(false);
  const [savedMsg,setSavedMsg]=useState("");
  const [currentStoryId,setCurrentStoryId]=useState(null);

  async function loadSaved(){try{const r=await fetch("/api/list-stories?deviceId="+encodeURIComponent(deviceId)+(kidProfileId?"&kidProfileId="+encodeURIComponent(kidProfileId):""));const j=await r.json();setSaved(Array.isArray(j.stories)?j.stories:[]);}catch{}}
  useEffect(()=>{loadSaved();},[]);

  function reset(){setGuide(null);setStyle("watercolor");setHero(null);setWorld(null);setQuest(null);setMood(null);setEnding(null);setSpark("");setCustomSpark("");setFavColor("");setFavFood("");setPetName("");setName("");}
  function startPicker(){setError(null);reset();setSi(0);setView("pick");}

  const step=STEPS[si];
  const advance=()=>{ if(si<STEPS.length-1) setSi(si+1); else setView("ready"); };
  function choose(setter,val){ setter(val); setTimeout(advance,200); }
  function back(){ if(si>0) setSi(si-1); else setView("landing"); }

  function surprise(){
    setError(null);
    const g=rand(GUIDES)[0], h=rand(CHARACTERS)[0], w=rand(WORLDS)[0];
    makeStory({ guide:g, style:"watercolor", characterSlug:h, characterName:DEFAULT_NAME[h], worldSlug:w,
      quest:rand(QUESTS)[0], mood:rand(MOODS)[0], ending:rand(ENDINGS)[0], spark:rand(SPARKS), favColor:"", favFood:"", petName:"" });
  }

  async function makeStory(payload){
    const body = payload || {
      guide, style, characterSlug:hero, characterName:(name||DEFAULT_NAME[hero]||""), worldSlug:world,
      quest, mood, ending, spark:(customSpark.trim()||spark), favColor, favFood, petName,
    };
    setError(null); setGenMsg("Writing your story…"); setView("generating");
    try{
      const r=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body, age:6, deviceId, kidProfileId})});
      const j=await r.json();
      if(!(j&&j.ok&&j.story)){ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"ready"); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    }catch{ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"ready"); }
  }
  async function makeSequel(prev){
    const c=(prev&&prev.created_with)||{};
    setError(null); setGenMsg("Starting a new adventure…"); setView("generating");
    try{
      const r=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c, age:6, deviceId, kidProfileId})});
      const j=await r.json();
      if(!(j&&j.ok&&j.story)){ setError("Hmm, that didn't work. Try again!"); setView("reading"); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    }catch{ setError("Hmm, that didn't work."); setView("reading"); }
  }

  async function saveStory(toSave){
    if(!toSave||!toSave.pages) toSave=story; if(!toSave) return;
    setSaving(true); setSavedMsg("");
    try{
      const r=await fetch("/api/save-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({story:toSave,deviceId,kidProfileId,kidName:(name||playerName||""),coverColor:"#7a4a86"})});
      const j=await r.json();
      if(r.ok&&j.ok){ setSavedMsg("Saved to your library! 📚"); if(j.story&&j.story.story_id) setCurrentStoryId(j.story.story_id); loadSaved(); }
      else if(r.status===409) setSavedMsg(j.message||"Your library is full!");
      else setSavedMsg("Couldn't save — "+(j.detail||j.error||("error "+r.status)));
    }catch(e){ setSavedMsg("Couldn't save — "+((e&&e.message)||"network error")); }
    finally{ setSaving(false); }
  }
  async function openSaved(storyId){try{const r=await fetch("/api/list-stories?storyId="+encodeURIComponent(storyId));const j=await r.json();if(j&&j.story&&j.story.story){setStory(j.story.story);setSavedMsg("");setCurrentStoryId(storyId);setView("reading");}}catch{}}
  async function deleteSaved(storyId){try{await fetch("/api/delete-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId,storyId})});setSaved(p=>p.filter(x=>x.story_id!==storyId));}catch{}}

  if(view==="reading"&&story){
    return <StoryReader story={story} storyId={currentStoryId} deviceId={deviceId} kidProfileId={kidProfileId}
      onExit={()=>setView("landing")} onSave={saveStory} saving={saving} savedMsg={savedMsg} onNewAdventure={makeSequel} />;
  }
  if(view==="generating"){
    return (<div style={{...s.container,justifyContent:"center"}}>
      <div style={{fontSize:64}}>📖</div><h2 style={s.genTitle}>{genMsg}</h2>
      <p style={s.genSub}>{guide?(GUIDES.find(g=>g[0]===guide)||[,""])[1]+" is dreaming it up…":"Dreaming up the adventure…"}</p></div>);
  }

  if(view==="ready"){
    const worldName=(WORLDS.find(w=>w[0]===world)||[,""])[1];
    return (<div style={s.container}>
      <div style={s.topBar}><button style={s.navBtn} onClick={()=>{setSi(STEPS.length-1);setView("pick");}}>← Back</button><button style={s.navBtn} onClick={onHome}>🏠 Home</button></div>
      <h2 style={s.readyTitle}>Ready to make your story?</h2>
      <div style={s.cover}>
        <img src={libImg("world",world)} alt="" style={s.coverBg}/>
        <img src={libImg("character",hero,"happy")} alt="" style={s.coverHero}/>
        <div style={s.coverName}>A story for {(name||DEFAULT_NAME[hero])}</div>
      </div>
      <p style={s.coverSub}>{(name||DEFAULT_NAME[hero])} in {worldName}{quest?(" · "+(QUESTS.find(q=>q[0]===quest)||[,,""])[2]):""}</p>
      {error&&<p style={s.error}>{error}</p>}
      <button style={s.makeBtn} onClick={()=>makeStory()}>📖 Make my story!</button>
    </div>);
  }

  if(view==="pick"){
    return (<div style={s.container}>
      <div style={s.topBar}><button style={s.navBtn} onClick={back}>← Back</button><button style={s.navBtn} onClick={onHome}>🏠 Home</button></div>
      <div style={s.dots}>{STEPS.map((_,i)=><div key={i} style={{...s.dot,...(i===si?s.dotOn:{}),...(i<si?s.dotDone:{})}}/>)}</div>

      <div style={s.recipe}>
        {guide&&<img src={libImg("character",guide,"happy")} title="Guide" style={s.recipeImg}/>}
        {hero&&<img src={libImg("character",hero,"happy")} title="Hero" style={s.recipeImg}/>}
        {world&&<img src={libImg("world",world)} title="World" style={{...s.recipeImg,objectFit:"cover"}}/>}
      </div>

      {guide&&step!=="guide"&&(<div style={s.guideRow}>
        <img src={libImg("character",guide,"happy")} alt="" style={s.guideAvatar}/>
        <div style={s.bubble}>{QTEXT[step]}</div>
      </div>)}
      {(!guide||step==="guide")&&<h2 style={s.qTitle}>{QTEXT[step]}</h2>}

      {step==="guide"&&(<div style={s.grid}>
        {GUIDES.map(([slug,label])=>(
          <button key={slug} onClick={()=>choose(setGuide,slug)} style={{...s.gTile,...(guide===slug?s.tileOn:{})}}>
            <img src={libImg("character",slug,"happy")} alt={label} loading="lazy" style={s.gImgChar}/><span style={s.gLabel}>{label}</span>
          </button>))}
      </div>)}

      {step==="style"&&(<div style={s.styleRow}>
        {STYLES.map(([id,label,emoji,en])=>(
          <button key={id} onClick={()=>en&&choose(setStyle,id)} disabled={!en} style={{...s.styleTile,...(style===id?s.tileOn:{}),...(!en?s.tileSoon:{})}}>
            <span style={{fontSize:38}}>{emoji}</span><span style={s.tileLabel}>{label}</span>{!en&&<span style={s.soon}>Soon</span>}
          </button>))}
      </div>)}

      {step==="hero"&&(<div style={s.grid}>
        {CHARACTERS.map(([slug,label])=>(
          <button key={slug} onClick={()=>{setName(DEFAULT_NAME[slug]||"");choose(setHero,slug);}} style={{...s.gTile,...(hero===slug?s.tileOn:{})}}>
            <img src={libImg("character",slug,"happy")} alt={label} loading="lazy" style={s.gImgChar}/><span style={s.gLabel}>{label}</span>
          </button>))}
      </div>)}

      {step==="world"&&(<div style={s.grid}>
        {WORLDS.map(([slug,label])=>(
          <button key={slug} onClick={()=>choose(setWorld,slug)} style={{...s.gTile,...(world===slug?s.tileOn:{})}}>
            <img src={libImg("world",slug)} alt={label} loading="lazy" style={s.gImgWorld}/><span style={s.gLabel}>{label}</span>
          </button>))}
      </div>)}

      {step==="quest"&&<EmojiGrid opts={QUESTS} val={quest} pick={(v)=>choose(setQuest,v)}/>}
      {step==="mood"&&<EmojiGrid opts={MOODS} val={mood} pick={(v)=>choose(setMood,v)}/>}
      {step==="ending"&&<EmojiGrid opts={ENDINGS} val={ending} pick={(v)=>choose(setEnding,v)}/>}

      {step==="spark"&&(<div style={{width:"100%",maxWidth:620}}>
        <div style={s.sparkGrid}>
          {SPARKS.map((txt)=>(<button key={txt} onClick={()=>{setSpark(txt);setCustomSpark("");}} style={{...s.sparkCard,...((spark===txt&&!customSpark)?s.tileOn:{})}}>{txt}</button>))}
        </div>
        <div style={s.orType}>…or type your own idea</div>
        <input style={s.bigInput} value={customSpark} maxLength={140} placeholder="e.g. a story about my dog Max learning to swim"
          onChange={(e)=>{setCustomSpark(e.target.value);if(e.target.value)setSpark("");}}/>
        <div style={s.nextRow}><button style={s.skip} onClick={()=>{setSpark("");setCustomSpark("");advance();}}>Skip</button><button style={s.next} onClick={advance}>Next →</button></div>
      </div>)}

      {step==="mine"&&(<div style={{width:"100%",maxWidth:480}}>
        <p style={s.mineHint}>Pop in a few favorites and we'll sprinkle them in (all optional).</p>
        <label style={s.mineLbl}>Favorite color</label><input style={s.bigInput} value={favColor} maxLength={24} onChange={e=>setFavColor(e.target.value)} placeholder="purple"/>
        <label style={s.mineLbl}>Favorite food</label><input style={s.bigInput} value={favFood} maxLength={24} onChange={e=>setFavFood(e.target.value)} placeholder="pancakes"/>
        <label style={s.mineLbl}>Pet's name</label><input style={s.bigInput} value={petName} maxLength={24} onChange={e=>setPetName(e.target.value)} placeholder="Max"/>
        <div style={s.nextRow}><button style={s.skip} onClick={()=>{setFavColor("");setFavFood("");setPetName("");advance();}}>Skip</button><button style={s.next} onClick={advance}>Next →</button></div>
      </div>)}

      {step==="name"&&(<div style={{width:"100%",maxWidth:420,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <img src={libImg("character",hero||"bunny","happy")} alt="" style={{width:130,height:130,objectFit:"contain",marginBottom:10}}/>
        <input style={{...s.bigInput,textAlign:"center",fontFamily:FRED,fontSize:20}} value={name} maxLength={28} onChange={e=>setName(e.target.value)} placeholder="Hero name"/>
        <button style={s.makeBtn} onClick={advance}>That's the one! →</button>
      </div>)}
    </div>);
  }

  return (<div style={s.container}>
    <div style={s.topBar}><button style={s.navBtn} onClick={onBack||onHome}>← Back</button><button style={s.navBtn} onClick={onHome}>🏠 Home</button></div>
    <h1 style={s.logo}>Stories</h1>
    <p style={s.tagline}>Make a magical picture book — just tap!</p>
    <button style={s.startBtn} onClick={startPicker}>✨ Make a new story</button>
    <button style={s.surpriseBtn} onClick={surprise}>🎲 Surprise me!</button>

    {saved.length>0&&(<div style={s.savedWrap}>
      <h3 style={s.sectionTitle}>📚 My stories</h3>
      <div style={s.savedRow}>
        {saved.map((st)=>(<div key={st.story_id} style={s.savedCard}>
          <button style={s.savedOpen} onClick={()=>openSaved(st.story_id)}>
            <div style={{...s.savedCover,background:st.cover_color||"#7a4a86"}}>📖</div>
            <span style={s.savedName}>{st.title}</span></button>
          <button style={s.savedDel} onClick={()=>deleteSaved(st.story_id)} title="Delete">✕</button>
        </div>))}
      </div>
    </div>)}
  </div>);
}

function EmojiGrid({opts,val,pick}){
  return (<div style={s.emojiGrid}>
    {opts.map(([id,emoji,label])=>(
      <button key={id} onClick={()=>pick(id)} style={{...s.emojiTile,...(val===id?s.tileOn:{})}}>
        <span style={{fontSize:34}}>{emoji}</span><span style={s.gLabel}>{label}</span>
      </button>))}
  </div>);
}

const s = {
  container:{minHeight:"100vh",background:PAGE_BG,color:"#fff",fontFamily:NUN,padding:"20px 16px 60px",display:"flex",flexDirection:"column",alignItems:"center"},
  topBar:{width:"100%",maxWidth:760,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  navBtn:{padding:"10px 18px",background:"rgba(255,255,255,0.08)",color:"#fff",border:"1px solid rgba(255,255,255,0.16)",borderRadius:14,fontWeight:700,fontFamily:NUN,cursor:"pointer"},
  logo:{fontFamily:FRED,fontSize:44,margin:"30px 0 6px",background:GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  tagline:{opacity:.8,marginBottom:26,fontSize:16},
  startBtn:{padding:"16px 34px",borderRadius:18,border:"none",background:GRAD,color:"#fff",fontSize:19,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 10px 30px rgba(155,126,221,0.5)"},
  surpriseBtn:{marginTop:14,padding:"12px 26px",borderRadius:16,border:"1px solid rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.08)",color:"#fff",fontSize:16,fontWeight:800,fontFamily:FRED,cursor:"pointer"},
  dots:{display:"flex",gap:6,marginTop:6,marginBottom:10,flexWrap:"wrap",justifyContent:"center",maxWidth:320},
  dot:{width:9,height:9,borderRadius:"50%",background:"#39406e"},dotOn:{background:"#c06b99"},dotDone:{background:"#7aa2ff"},
  recipe:{display:"flex",gap:8,minHeight:46,marginBottom:6},
  recipeImg:{width:46,height:46,borderRadius:10,objectFit:"contain",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)"},
  guideRow:{display:"flex",alignItems:"center",gap:10,margin:"4px 0 16px",maxWidth:600},
  guideAvatar:{width:64,height:64,objectFit:"contain"},
  bubble:{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.18)",borderRadius:"4px 16px 16px 16px",padding:"12px 16px",fontFamily:FRED,fontSize:18},
  qTitle:{fontFamily:FRED,fontSize:24,margin:"4px 0 16px",textAlign:"center"},
  grid:{width:"100%",maxWidth:760,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(135px,1fr))",gap:12},
  gTile:{borderRadius:16,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:8,display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:NUN},
  gImgChar:{width:"100%",aspectRatio:"1/1",objectFit:"contain",borderRadius:12,background:"rgba(255,255,255,0.05)"},
  gImgWorld:{width:"100%",aspectRatio:"1/1",objectFit:"cover",borderRadius:12},
  gLabel:{fontSize:13,fontWeight:700,textAlign:"center"},
  tileOn:{border:"2px solid #ffe08a",boxShadow:"0 0 0 3px rgba(255,224,138,0.3)"},
  styleRow:{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"},
  styleTile:{position:"relative",width:150,height:130,borderRadius:18,border:"2px solid rgba(255,255,255,0.14)",background:"rgba(255,255,255,0.06)",color:"#fff",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:FRED},
  tileLabel:{fontSize:15,fontWeight:700},tileSoon:{opacity:.4,cursor:"not-allowed"},
  soon:{position:"absolute",top:8,right:8,fontSize:11,background:"rgba(255,255,255,0.2)",padding:"2px 7px",borderRadius:999},
  emojiGrid:{width:"100%",maxWidth:620,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12},
  emojiTile:{borderRadius:16,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:"16px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontFamily:NUN},
  sparkGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:14},
  sparkCard:{borderRadius:14,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:"14px 12px",fontFamily:FRED,fontSize:15,textAlign:"center"},
  orType:{textAlign:"center",opacity:.7,margin:"4px 0 8px",fontSize:14},
  bigInput:{width:"100%",boxSizing:"border-box",padding:"13px 16px",borderRadius:14,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:16,fontFamily:NUN,marginBottom:10},
  mineHint:{opacity:.8,fontSize:14,textAlign:"center",marginBottom:12},
  mineLbl:{fontSize:13,opacity:.8,display:"block",marginBottom:4},
  nextRow:{display:"flex",gap:12,justifyContent:"center",marginTop:8},
  skip:{padding:"12px 22px",borderRadius:14,border:"1px solid rgba(255,255,255,0.2)",background:"transparent",color:"#cdd3ff",fontWeight:700,fontFamily:FRED,cursor:"pointer"},
  next:{padding:"12px 26px",borderRadius:14,border:"none",background:GRAD,color:"#fff",fontWeight:800,fontFamily:FRED,cursor:"pointer"},
  readyTitle:{fontFamily:FRED,fontSize:26,margin:"10px 0 18px",textAlign:"center"},
  cover:{position:"relative",width:"min(90vw,460px)",aspectRatio:"4/3",borderRadius:20,overflow:"hidden",border:"1px solid rgba(255,255,255,0.2)",boxShadow:"0 16px 50px rgba(0,0,0,0.5)"},
  coverBg:{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"},
  coverHero:{position:"absolute",left:"50%",bottom:0,width:"42%",transform:"translateX(-50%)",filter:"drop-shadow(0 8px 14px rgba(0,0,0,0.4))"},
  coverName:{position:"absolute",left:0,right:0,top:12,textAlign:"center",fontFamily:FRED,fontSize:18,textShadow:"0 1px 6px rgba(0,0,0,0.7)"},
  coverSub:{opacity:.8,fontSize:14,margin:"12px 0 16px",textAlign:"center"},
  makeBtn:{marginTop:14,padding:"16px 34px",borderRadius:18,border:"none",background:GRAD,color:"#fff",fontSize:19,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 10px 30px rgba(155,126,221,0.5)"},
  error:{color:"#ffb0c0",fontSize:14,marginBottom:10},
  genTitle:{fontFamily:FRED,fontSize:26,margin:"16px 0 6px"},genSub:{opacity:.7},
  savedWrap:{width:"100%",maxWidth:760,marginTop:40},
  sectionTitle:{fontFamily:FRED,fontSize:20,marginBottom:12},
  savedRow:{display:"flex",gap:12,flexWrap:"wrap"},
  savedCard:{position:"relative"},
  savedOpen:{width:130,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  savedCover:{width:130,height:90,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34},
  savedName:{fontSize:13,fontWeight:700,color:"#fff",textAlign:"center"},
  savedDel:{position:"absolute",top:-6,right:-6,width:26,height:26,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#fff",cursor:"pointer",fontSize:13},
};
