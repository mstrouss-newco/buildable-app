// /src/StoryMaker.jsx  (v5 — talking story buddy + calming music + faster picker art)
import { useState, useEffect, useRef } from "react";
import StoryReader from "./StoryReader";
import QuizGate from "./QuizGate";
import { getLearningSettings, gradeToAge } from "./store";

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
function iconImg(id){return "/api/game-art?img=story-icons:"+id+"&style=watercolor";}
const SPARK_ICON={"It's my birthday!":"birthday","I lost my favorite toy":"lost_toy","My first day somewhere new":"first_day","Learning to be brave":"learn_brave","A rainy-day adventure":"rainy_day","Making a new friend":"new_friend"};
const rand=(a)=>a[Math.floor(Math.random()*a.length)];

function Chevron({dir}){return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dir==="up"?<polyline points="6 15 12 9 18 15"/>:<polyline points="6 9 12 15 18 9"/>}</svg>);}

const kindOf=(k)=> k==="world"?"world":(k==="quest"||k==="mood"||k==="ending")?"icon":"character";
function tileHue(seed){let h=0;const t=String(seed||"x");for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))>>>0;return h%360;}
// Friendly DRAWN placeholder (no emoji, per product law) shown INSTANTLY behind every
// picker tile so a kid never sees a blank dark box; the real painted art fades in when
// it loads (and TileImg retries a few times so it upgrades as the art warms in).
function TilePlaceholder({kind,hue}){
  const lite=`hsl(${hue},60%,72%)`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
      <defs><linearGradient id={"tg"+hue} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={`hsl(${hue},55%,34%)`}/><stop offset="1" stopColor={`hsl(${(hue+38)%360},52%,22%)`}/></linearGradient></defs>
      <rect width="100" height="100" fill={`url(#tg${hue})`}/>
      {kind==="world" ? (<g>
        <circle cx="72" cy="26" r="12" fill={lite} opacity="0.85"/>
        <path d="M0 72 Q28 56 52 68 T100 62 L100 100 L0 100 Z" fill="rgba(0,0,0,0.22)"/>
        <path d="M0 82 Q30 70 60 80 T100 76 L100 100 L0 100 Z" fill="rgba(0,0,0,0.34)"/>
      </g>) : kind==="icon" ? (
        <path d="M50 24 l7 16 17 2 -13 12 4 17 -15 -9 -15 9 4 -17 -13 -12 17 -2 Z" fill={lite} opacity="0.9"/>
      ) : (<g>
        <ellipse cx="38" cy="30" rx="7" ry="12" fill={lite}/><ellipse cx="62" cy="30" rx="7" ry="12" fill={lite}/>
        <ellipse cx="50" cy="62" rx="24" ry="27" fill={lite}/>
        <circle cx="42" cy="56" r="3" fill="rgba(0,0,0,0.55)"/><circle cx="58" cy="56" r="3" fill="rgba(0,0,0,0.55)"/>
      </g>)}
    </svg>
  );
}
function TileImg({src,alt,kind,seed,fit="contain",box}){
  const [loaded,setLoaded]=useState(false);
  const [tries,setTries]=useState(0);
  const hue=tileHue(seed);
  const bust=tries>0?((src.indexOf("?")>=0?"&":"?")+"cb="+tries):"";
  return (
    <div style={{position:"relative",overflow:"hidden",borderRadius:12,background:`hsl(${hue},52%,24%)`,...(box||{width:"100%",aspectRatio:"1/1"})}}>
      {!loaded && <TilePlaceholder kind={kind} hue={hue}/>}
      <img src={src+bust} alt={alt||""} loading="eager" decoding="async"
        onLoad={()=>setLoaded(true)}
        onError={()=>{ if(tries<4){ const n=tries+1; setTimeout(()=>setTries(n), 2200*n); } }}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:fit,opacity:loaded?1:0,transition:"opacity .35s ease"}}/>
    </div>
  );
}

export default function StoryMaker({ onBack, onHome, playerName, remix = null, onConsumeRemix = null }) {
  const deviceId=getDeviceId(); const kidProfileId=getKidProfileId();
  const [view,setView]=useState("landing");   // landing | pick | generating | reading
  const [step,setStep]=useState(0);

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
  const prewriteRef=useRef({sig:null,promise:null,name:null}); // write-while-naming
  const [genMsg,setGenMsg]=useState("Writing your story");
  const [saved,setSaved]=useState([]);
  const [saving,setSaving]=useState(false);
  const [savedMsg,setSavedMsg]=useState("");
  const [currentStoryId,setCurrentStoryId]=useState(null);
  const [justFinished,setJustFinished]=useState(false); // learning gate: only after a real finish
  const [gateNext,setGateNext]=useState(null);              // pending action awaiting a quick question

  // --- sound: calming background music + talking story buddy (iPad-safe) ---
  // The buddy voice uses the SAME ElevenLabs narration the reader uses
  // (/api/narrate-story-page) — real audio files, which play reliably on iPad.
  // Browser speech is only a fallback if ElevenLabs isn't configured.
  const [soundOn,setSoundOn]=useState(true);
  const musicRef=useRef(null);      // looping background music
  const voiceRef=useRef(null);      // the buddy's spoken-line player
  const narrCacheRef=useRef({});    // text -> audioUrl ("none" if unavailable)
  const primedRef=useRef(false);

  async function loadSaved(){try{const r=await fetch("/api/list-stories?deviceId="+encodeURIComponent(deviceId)+(kidProfileId?"&kidProfileId="+encodeURIComponent(kidProfileId):""));const j=await r.json();setSaved(Array.isArray(j.stories)?j.stories:[]);}catch{}}
  useEffect(()=>{loadSaved();},[]);

  async function publishStory(st){
    const next=!st.published;
    setSaved(prev=>prev.map(x=>x.story_id===st.story_id?{...x,published:next}:x));
    try{ await fetch("/api/publish-creation",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({kind:"story",id:st.story_id,deviceId,kidProfileId:getKidProfileId()||undefined,publish:next})}); }catch{}
  }

  // Remix: open the picker pre-filled with the EXACT choices behind another kid's
  // published story (hero, world, quest, mood, ending, art style), so the kid can
  // tweak anything and make their own version. Falls back to seeding the idea.
  useEffect(()=>{
    if(!remix) return;
    let alive=true;
    reset();
    (async()=>{
      let c=null;
      try{
        const r=await fetch("/api/list-stories?storyId="+encodeURIComponent(remix.id));
        const j=await r.json();
        c=(j&&j.story&&j.story.story&&j.story.story.created_with)||null;
      }catch{}
      if(!alive) return;
      if(c){
        if(c.guide)setGuide(c.guide);
        setStyle(c.style||"watercolor");
        if(c.characterSlug)setHero(c.characterSlug);
        if(c.worldSlug)setWorld(c.worldSlug);
        if(c.quest)setQuest(c.quest);
        if(c.mood)setMood(c.mood);
        if(c.ending)setEnding(c.ending);
        if(c.characterName)setName(c.characterName);
        if(c.spark){setCustomSpark(c.spark);setSpark("");}
      } else {
        setCustomSpark(remix.title||""); setSpark("");
      }
      setView("pick"); setStep(0); setSavedMsg("");
    })();
    if(onConsumeRemix) onConsumeRemix();
    return ()=>{alive=false;};
  },[remix]);

  const MUSIC_URL="/music-library/playful_musicbox.mp3?v=1";
  function ensureMusic(){ if(!musicRef.current && typeof window!=="undefined"){ const a=new Audio(MUSIC_URL); a.loop=true; a.volume=0.18; a.preload="auto"; musicRef.current=a; } return musicRef.current; }
  function ensureVoice(){ if(!voiceRef.current && typeof window!=="undefined"){ const a=new Audio(); a.preload="auto"; voiceRef.current=a; } return voiceRef.current; }
  function stopVoice(){ try{ if(voiceRef.current){ voiceRef.current.pause(); } }catch{} try{ if(typeof window!=="undefined"&&window.speechSynthesis) window.speechSynthesis.cancel(); }catch{} }
  // Fetch + cache a spoken line ahead of time (so it plays the instant it's needed).
  function prewarm(text){ if(!text||narrCacheRef.current[text]!==undefined) return; fetch("/api/narrate-story-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})}).then(r=>r.json()).then(j=>{ narrCacheRef.current[text]=(j&&j.configured&&j.audioUrl)?j.audioUrl:"none"; }).catch(()=>{}); }

  // The buddy speaks a line via ElevenLabs (cached per-text so repeats are free + instant).
  async function say(text){
    if(!soundOn||typeof window==="undefined"||!text) return;
    const v=ensureVoice(); if(!v) return;
    try{
      let url=narrCacheRef.current[text];
      if(url===undefined){
        const r=await fetch("/api/narrate-story-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
        const j=await r.json();
        url=(j&&j.configured&&j.audioUrl)?j.audioUrl:"none";
        narrCacheRef.current[text]=url;
      }
      if(!soundOn) return; // kid may have muted while it loaded
      if(url==="none"){ // ElevenLabs not configured -> gentle browser-speech fallback
        if(window.speechSynthesis){ try{ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.rate=0.95; u.pitch=1.12; window.speechSynthesis.speak(u); }catch{} }
        return;
      }
      v.src=url; v.currentTime=0; v.volume=1; v.muted=false; v.play().catch(()=>{});
    }catch{}
  }

  // Unlock audio from inside a real tap — required by iOS Safari / iPad.
  function primeSound(){
    if(typeof window==="undefined") return;
    const m=ensureMusic(); if(m&&soundOn){ try{ m.play().catch(()=>{}); }catch{} }
    const v=ensureVoice();
    if(v && !primedRef.current){
      try{ v.muted=true; v.src=MUSIC_URL; const p=v.play();
        if(p&&p.then) p.then(()=>{ try{ v.pause(); v.currentTime=0; v.muted=false; v.removeAttribute("src"); }catch{} }).catch(()=>{ try{ v.muted=false; }catch{} });
      }catch{}
      primedRef.current=true;
    }
  }
  function toggleSound(){ setSoundOn(v=>{ const n=!v; const m=musicRef.current; if(m){ if(n){ m.play().catch(()=>{}); } else { try{m.pause();}catch{} } } if(!n){ stopVoice(); } return n; }); }

  // Stop music + voice when the story maker closes.
  useEffect(()=>()=>{ try{ if(musicRef.current) musicRef.current.pause(); }catch{} stopVoice(); },[]);

  function reset(){setGuide("unicorn");setStyle("watercolor");setHero("bunny");setWorld("enchanted-forest");setQuest("lost_friend");setMood("cozy");setEnding("happy");setSpark("");setCustomSpark("");setName(DEFAULT_NAME["bunny"]);}
  function doStartPicker(){setError(null);reset();setStep(0);setView("pick");}
  function maybeGate(action){
    const ls=getLearningSettings();
    if(ls.enabled && justFinished){ setJustFinished(false); setGateNext(()=>action); return; }
    action();
  }
  function startPicker(){ primeSound(); maybeGate(doStartPicker); }

  const STEPS = [
    { key:"guide",  q:"Who's your story buddy?", opts:GUIDES,     val:guide,  set:setGuide,  img:(id)=>libImg("character",id,"watercolor","happy") },
    { key:"style",  q:"Pick a look",             opts:STYLES,     val:style,  set:setStyle,  img:(id)=>libImg("character","bunny",id) },
    { key:"hero",   q:"Who's our hero?",          opts:CHARACTERS, val:hero,   set:(v)=>{setHero(v);setName(DEFAULT_NAME[v]||"");}, img:(id)=>libImg("character",id,"watercolor","happy") },
    { key:"world",  q:"Where does it happen?",    opts:WORLDS,     val:world,  set:setWorld,  img:(id)=>libImg("world",id,"watercolor") },
    { key:"quest",  q:"What happens in the story?",opts:QUESTS,    val:quest,  set:setQuest,  img:(id)=>iconImg(id) },
    { key:"mood",   q:"How should it feel?",      opts:MOODS,      val:mood,   set:setMood,   img:(id)=>iconImg(id) },
    { key:"ending", q:"How does it end?",         opts:ENDINGS,    val:ending, set:setEnding, img:(id)=>iconImg(id) },
  ];
  const TOTAL=STEPS.length;
  const atEnd=step>=TOTAL;
  const cur=STEPS[step];

  // Background music plays only while building; pause everywhere else.
  useEffect(()=>{ const m=musicRef.current; if(m){ if(soundOn&&view==="pick"){ m.play().catch(()=>{}); } else { try{m.pause();}catch{} } } if(view!=="pick"){ stopVoice(); } },[view,soundOn]);
  // The story buddy reads each question aloud as the kid moves through the steps.
  useEffect(()=>{ if(view!=="pick") return; const t=setTimeout(()=>{ if(atEnd){ say("One last thing! Give your hero a name, then tap Make my story!"); } else if(cur){ say(step===0 ? ("Hi! Let's make a magical story together. "+cur.q) : cur.q); } }, 450); return ()=>clearTimeout(t); },[view,step]);
  // Pre-load the pictures for the current + upcoming steps so tiles appear fast.
  useEffect(()=>{ if(typeof window==="undefined") return; if(view!=="pick"&&view!=="landing") return; const idxs = view==="landing" ? [0,1,2] : [step,step+1,step+2]; idxs.forEach(i=>{ const st=STEPS[i]; if(!st||!st.img) return; st.opts.forEach(([id])=>{ try{ const im=new Image(); im.decoding="async"; im.src=st.img(id); }catch{} }); }); if(view==="pick"&&soundOn){ const nx=STEPS[step+1]; if(nx) prewarm(nx.q); if(step+1>=TOTAL) prewarm("One last thing! Give your hero a name, then tap Make my story!"); } },[view,step]);

  function labelOf(st){const o=st.opts.find(x=>x[0]===st.val);return o?o[1]:"";}
  function cycle(st,dir){const i=st.opts.findIndex(o=>o[0]===st.val);const ni=((i<0?0:i)+dir+st.opts.length)%st.opts.length;st.set(st.opts[ni][0]);}
  function pickOpt(st,id){st.set(id);}
  // Page painting now lives ENTIRELY in StoryReader (one paint owner): it shows the
  // layered art instantly and crossfades each painted page in as its gen finishes.

  function next(){setStep(s=>Math.min(TOTAL,s+1));}
  function back(){ if(atEnd){setStep(TOTAL-1);return;} if(step>0)setStep(step-1); else setView("landing"); }

  function doSurprise(){
    setError(null);
    setGuide(rand(GUIDES)[0]); setStyle("watercolor");
    const h=rand(CHARACTERS)[0];
    makeStory({ guide:rand(GUIDES)[0], style:"watercolor", characterSlug:h, characterName:DEFAULT_NAME[h], worldSlug:rand(WORLDS)[0],
      quest:rand(QUESTS)[0], mood:rand(MOODS)[0], ending:rand(ENDINGS)[0], spark:rand(SPARKS) });
  }
  function surprise(){ primeSound(); maybeGate(doSurprise); }

  // Open a finished story straight into the reader — no Painting screen. The reader
  // shows layered art instantly and paints each page in as its gen finishes.
  function openFreshStory(st){ setStory(st); setSavedMsg(""); setCurrentStoryId(null); setJustFinished(true); setView("reading"); }
  async function generateStoryRaw(body){
    try{
      // Grade-based text length: send the kid's grade (from parent settings) and the
      // age it maps to, so K-1 stories come back in short 1-2 sentence pages.
      const ls=getLearningSettings()||{}; const grade=ls.grade||"";
      const age=grade?gradeToAge(grade):6;
      const r=await fetch("/api/generate-story",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body, grade, age, deviceId, kidProfileId})});
      const j=await r.json();
      return (j&&j.ok&&j.story)?j.story:null;
    }catch{ return null; }
  }
  // Swap the placeholder default hero name for the name the kid typed, client-side,
  // across the title + every page + dialogue. Never cuts mid-word.
  function swapHeroName(st, from, to){
    if(!st||!from||!to||from===to) return st;
    const first=String(from).split(" ")[0];
    const esc=(x)=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const rep=(sv)=>{ if(!sv) return sv; let out=String(sv).split(from).join(to);
      if(first && first!==from) out=out.replace(new RegExp("\\b"+esc(first)+"\\b","g"), to); return out; };
    const pages=Array.isArray(st.pages)?st.pages.map(p=>({...p, text:rep(p.text),
      text_a:rep(p.text_a), text_b:rep(p.text_b),
      choice:p.choice?{...p.choice, prompt:rep(p.choice.prompt)}:p.choice,
      lines:Array.isArray(p.lines)?p.lines.map(l=>({...l, say:rep(l.say)})):p.lines })):st.pages;
    return {...st, title:rep(st.title), character_name:to, pages, created_with:{...(st.created_with||{}), characterName:to}};
  }
  const pickSig=()=>[guide,style,hero,world,quest,mood,ending,(customSpark.trim()||spark)].join("|");
  function pickBody(nm){ return { guide, style, characterSlug:hero, characterName:nm, worldSlug:world, quest, mood, ending, spark:(customSpark.trim()||spark) }; }

  // WRITE-WHILE-NAMING: the moment the naming screen is up, quietly start writing the
  // story with the hero's DEFAULT name. On Make we swap in the kid's typed name.
  // Debounced so cycling the chips doesn't spam the writer.
  useEffect(()=>{
    if(view!=="pick"||!atEnd) return;
    const sig=pickSig();
    if(prewriteRef.current.sig===sig && prewriteRef.current.promise) return;
    const t=setTimeout(()=>{ const nm=DEFAULT_NAME[hero]||"Hero";
      prewriteRef.current={ sig, name:nm, promise:generateStoryRaw(pickBody(nm)) }; }, 500);
    return ()=>clearTimeout(t);
  },[view,step,guide,style,hero,world,quest,mood,ending,spark,customSpark]);

  async function doMake(){
    const typed=(name||"").trim()||DEFAULT_NAME[hero]||"Hero";
    const sig=pickSig(); setError(null);
    const pw=prewriteRef.current;
    if(pw.sig===sig && pw.promise){
      setGenMsg("Writing your story"); setView("generating");
      const st=await pw.promise;
      if(st){ openFreshStory(swapHeroName(st, pw.name||DEFAULT_NAME[hero], typed)); return; }
    }
    makeStory(); // no prewrite ready (or it failed) — write fresh with the typed name
  }
  async function makeStory(payload){
    const body = payload || pickBody(name||DEFAULT_NAME[hero]||"");
    setError(null); setGenMsg("Writing your story"); setView("generating");
    const st=await generateStoryRaw(body);
    if(!st){ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"pick"); if(!payload)setStep(TOTAL); return; }
    openFreshStory(st);
  }
  // "What happens next?" — a true CHAPTER 2 that CONTINUES this story: same hero,
  // friend, world and art style, plus a recap of the pages so the writer picks up
  // where it left off (not a repeat). Linked by series_id + chapter so My stories
  // can show a "Chapter 2" ribbon. Reuses the existing cutouts, so art stays cheap.
  async function continueStory(prev){
    const c=(prev&&prev.created_with)||{};
    const priorPages=Array.isArray(prev&&prev.pages)?prev.pages.map(p=>p&&p.text).filter(Boolean):[];
    const chapter=((prev&&prev.chapter)||1)+1;
    const seriesId=(prev&&prev.series_id)||null;
    setError(null); setGenMsg("Writing what happens next"); setView("generating");
    const st=await generateStoryRaw({ ...c, priorTitle:(prev&&prev.title)||"", priorPages, chapter, seriesId });
    if(!st){ setError("Hmm, that didn't work."); setView("reading"); return; }
    openFreshStory(st);
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

  // Learning gate overlay: when set, show one quick question first, then run the
  // pending action (start a new story / surprise). Never hard-fails (QuizGate
  // has Skip + passes through on errors).
  if (gateNext) {
    const proceed = gateNext;
    return (
      <QuizGate
        goal={getLearningSettings().goal}
        gameType="story"
        title="One quick question first!"
        onPass={() => { setGateNext(null); proceed(); }}
      />
    );
  }

  // ---------- READING ----------
  if(view==="reading"&&story){
    return <StoryReader story={story} storyId={currentStoryId} deviceId={deviceId} kidProfileId={kidProfileId}
      grade={(getLearningSettings()||{}).grade||""}
      onExit={()=>setView("landing")} onSave={saveStory} saving={saving} savedMsg={savedMsg} onContinue={continueStory} />;
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
      <div style={s.topBar}><button style={s.navBtn} onClick={back}>Back</button><button style={s.navBtn} onClick={toggleSound} aria-label="Turn sound on or off">{soundOn?"Sound on":"Sound off"}</button><button style={s.navBtn} onClick={onHome}>Home</button></div>
      <div style={s.dots}>{STEPS.map((_,i)=><span key={i} style={{...s.dot,...(i===step?s.dotOn:i<step?s.dotDone:{})}}/>)}<span style={{...s.dot,...(atEnd?s.dotOn:{})}}/></div>

      {!atEnd ? (<>
        <h2 style={s.qTitle}>{cur.q}</h2>
        <div style={cur.img?s.grid:s.textGrid}>
          {cur.opts.map(([id,label])=>{const on=cur.val===id;return (
            <button key={id} onClick={()=>pickOpt(cur,id)} style={{...(cur.img?s.gTile:s.textTile),...(on?s.tileOn:{})}}>
              {cur.img && <TileImg src={cur.img(id)} alt={label} kind={kindOf(cur.key)} seed={cur.key+":"+id} fit={cur.key==="world"?"cover":"contain"}/>}
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
            {SPARKS.map((txt)=>(<button key={txt} onClick={()=>{setSpark(txt===spark&&!customSpark?"":txt);setCustomSpark("");}} style={{...s.sparkCard,...((spark===txt&&!customSpark)?s.tileOn:{})}}>{SPARK_ICON[txt]&&<TileImg src={iconImg(SPARK_ICON[txt])} kind="icon" seed={"spark:"+txt} fit="contain" box={{width:56,height:56,borderRadius:12}}/>}{txt}</button>))}
          </div>
          <input style={s.bigInput} value={customSpark} maxLength={140} placeholder="…or type your own idea" onChange={(e)=>{setCustomSpark(e.target.value);if(e.target.value)setSpark("");}}/>
          <button style={s.makeBtn} onClick={doMake}>Make my story!</button>
        </div>
      </>)}

      {/* STORY SO FAR — carry choices along; change any inline */}
      <div style={s.sofarWrap}>
        <div style={s.sofarHead}>Your story so far — change anything</div>
        <div style={s.chipStrip}>
          {STEPS.filter((_,i)=>i<step||atEnd).map((st,i)=>(
            <div key={st.key} style={s.chip}>
              <button style={s.chev} onClick={()=>cycle(st,-1)} aria-label={"Change "+st.q}><Chevron dir="up"/></button>
              {st.img && <TileImg src={st.img(st.val)} kind={kindOf(st.key)} seed={"chip:"+st.key+":"+st.val} fit={st.key==="world"?"cover":"contain"} box={{width:38,height:38,borderRadius:8}}/>}
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
            <div style={{...s.savedCover,background:st.cover_color||"#7a4a86",position:"relative"}}>
              {Number(st.chapter)>=2 && <span style={s.savedRibbon}>Chapter {Number(st.chapter)}</span>}
            </div>
            <span style={s.savedName}>{st.title}</span></button>
          <button style={s.savedDel} onClick={()=>deleteSaved(st.story_id)} title="Delete">×</button>
          <button style={{...s.savedPub,background:st.published?"rgba(61,208,106,0.9)":"rgba(0,0,0,0.6)"}} onClick={()=>publishStory(st)} title={st.published?"Published to Top board — tap to make private":"Publish to the Top board"} aria-label="Publish">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>
          </button>
        </div>))}
      </div>
    </div>)}
  </div>);
}

const spin = "@keyframes bkSpin{0%,80%,100%{transform:scale(.4);opacity:.4}40%{transform:scale(1);opacity:1}}";
const shimmer = "@keyframes bkShim{0%{background-position:-200% 0}100%{background-position:200% 0}}@keyframes bkFade{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:scale(1)}}";
const lock = "@keyframes bkLock{0%{transform:scale(1)}55%{transform:scale(1.12);box-shadow:0 0 0 3px rgba(255,224,138,.55)}100%{transform:scale(1)}}";

const s = {
  container:{minHeight:"100vh",background:PAGE_BG,color:"#fff",fontFamily:NUN,padding:"20px 16px 60px",display:"flex",flexDirection:"column",alignItems:"center"},
  topBar:{width:"100%",maxWidth:760,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  navBtn:{padding:"10px 18px",background:"rgba(255,255,255,0.08)",color:"#fff",border:"1px solid rgba(255,255,255,0.16)",borderRadius:14,fontWeight:700,fontFamily:NUN,cursor:"pointer"},
  logo:{fontFamily:FRED,fontSize: "clamp(26px, 7vw, 44px)",margin:"30px 0 6px",background:GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
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
  sparkCard:{borderRadius:14,border:"2px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"#fff",cursor:"pointer",padding:"13px 12px",fontFamily:FRED,fontSize:14,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  sparkImg:{width:56,height:56,objectFit:"contain"},
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
  paintGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:"100%",maxWidth:520,margin:"16px 0 20px"},
  paintCell:{aspectRatio:"3 / 2",borderRadius:12,overflow:"hidden",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)"},
  paintImg:{width:"100%",height:"100%",objectFit:"cover",animation:"bkFade .5s ease both"},
  paintShimmer:{width:"100%",height:"100%",background:"linear-gradient(100deg,rgba(255,255,255,0.05) 30%,rgba(255,255,255,0.20) 50%,rgba(255,255,255,0.05) 70%)",backgroundSize:"200% 100%",animation:"bkShim 1.4s linear infinite"},
  spinDots:{display:"flex",gap:10},spinDot:{width:16,height:16,borderRadius:"50%",background:"#c06b99",animation:"bkSpin 1.2s ease-in-out infinite"},
  savedWrap:{width:"100%",maxWidth:760,marginTop:40},
  sectionTitle:{fontFamily:FRED,fontSize:20,marginBottom:12},
  savedRow:{display:"flex",gap:12,flexWrap:"wrap"},
  savedCard:{position:"relative"},
  savedOpen:{width:130,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  savedCover:{width:130,height:90,borderRadius:14},
  savedRibbon:{position:"absolute",top:6,left:6,background:"linear-gradient(135deg,#9b7edd,#d65a7b)",color:"#fff",fontSize:10,fontWeight:800,fontFamily:FRED,padding:"3px 8px",borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,0.35)"},
  savedName:{fontSize:13,fontWeight:700,color:"#fff",textAlign:"center"},
  savedDel:{position:"absolute",top:-6,right:-6,width:26,height:26,borderRadius:"50%",border:"none",background:"rgba(0,0,0,0.6)",color:"#fff",cursor:"pointer",fontSize:16,lineHeight:1},
  savedPub:{position:"absolute",bottom:-6,right:-6,width:28,height:28,borderRadius:"50%",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
};
