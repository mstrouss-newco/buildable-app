// /src/StoryMaker.jsx  (v6 — ST4 fewer taps: 3-screen flow, hero shuffle,
//  Story Dice, name-on-hero popover, More-choices drawer, cream/light theme)
import { useState, useEffect, useRef } from "react";
import StoryReader from "./StoryReader";
import QuickGame from "./QuickGame";
import { getLearningSettings, gradeToAge } from "./store";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
// Cream/light theme to match the Home screen (session 3E palette).
const PAGE_BG =
  "radial-gradient(circle at 10% -8%, rgba(155,126,221,0.16), transparent 42%)," +
  "radial-gradient(circle at 90% 108%, rgba(240,151,42,0.14), transparent 46%)," +
  "#FFF8EE";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";
const INK = "#3A2E4D";
const SUB = "#8B84A0";
const CARD = "#FFFFFF";
const CARD_BORDER = "1px solid rgba(58,46,77,0.10)";
const SHADOW = "0 8px 22px rgba(58,46,77,0.09)";

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
const CHAR_LABEL = Object.fromEntries(CHARACTERS);
const HERO_WINDOW = 6; // hero grid shows 6 at a time (ST4)

function getDeviceId(){try{let id=localStorage.getItem("deviceId");if(!id){id="dev_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);localStorage.setItem("deviceId",id);}return id;}catch{return "dev_anon";}}
// Only a profile with a REAL kid_profiles row (lane "account") has an id the
// server knows. A device-local guest profile returns null, which means "save to
// the device lane" -- sending a guest id instead is what quietly detached
// creations from their kid and emptied the shelves.
function getKidProfileId(){try{const k=JSON.parse(localStorage.getItem("bk_active_kid_v1")||"null");return k&&k.id&&k.lane==="account"?k.id:null;}catch{return null;}}
function libImg(kind,slug,style,emo){return "/api/story-library?img="+kind+":"+slug+"&style="+(style||"watercolor")+(emo?"&emo="+emo:"");}
function iconImg(id){return "/api/game-art?img=story-icons:"+id+"&style=watercolor";}
const SPARK_ICON={"It's my birthday!":"birthday","I lost my favorite toy":"lost_toy","My first day somewhere new":"first_day","Learning to be brave":"learn_brave","A rainy-day adventure":"rainy_day","Making a new friend":"new_friend"};
const rand=(a)=>a[Math.floor(Math.random()*a.length)];
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function Chevron({dir}){return (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dir==="left"?<polyline points="15 18 9 12 15 6"/>:<polyline points="9 18 15 12 9 6"/>}</svg>);}

const kindOf=(k)=> k==="world"?"world":(k==="quest"||k==="mood"||k==="ending")?"icon":"character";
function tileHue(seed){let h=0;const t=String(seed||"x");for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))>>>0;return h%360;}
// Friendly DRAWN placeholder (no emoji, per product law) shown INSTANTLY behind every
// picker tile so a kid never sees a blank box; the real painted art fades in when it
// loads (and TileImg retries a few times so it upgrades as the art warms in).
function TilePlaceholder({kind,hue}){
  const lite=`hsl(${hue},62%,74%)`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
      <defs><linearGradient id={"tg"+hue} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={`hsl(${hue},58%,60%)`}/><stop offset="1" stopColor={`hsl(${(hue+38)%360},54%,48%)`}/></linearGradient></defs>
      <rect width="100" height="100" fill={`url(#tg${hue})`}/>
      {kind==="world" ? (<g>
        <circle cx="72" cy="26" r="12" fill={lite} opacity="0.9"/>
        <path d="M0 72 Q28 56 52 68 T100 62 L100 100 L0 100 Z" fill="rgba(255,255,255,0.18)"/>
        <path d="M0 82 Q30 70 60 80 T100 76 L100 100 L0 100 Z" fill="rgba(0,0,0,0.12)"/>
      </g>) : kind==="icon" ? (
        <path d="M50 24 l7 16 17 2 -13 12 4 17 -15 -9 -15 9 4 -17 -13 -12 17 -2 Z" fill={lite} opacity="0.95"/>
      ) : (<g>
        <ellipse cx="38" cy="30" rx="7" ry="12" fill={lite}/><ellipse cx="62" cy="30" rx="7" ry="12" fill={lite}/>
        <ellipse cx="50" cy="62" rx="24" ry="27" fill={lite}/>
        <circle cx="42" cy="56" r="3" fill="rgba(0,0,0,0.45)"/><circle cx="58" cy="56" r="3" fill="rgba(0,0,0,0.45)"/>
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
    <div style={{position:"relative",overflow:"hidden",borderRadius:12,background:`hsl(${hue},50%,88%)`,...(box||{width:"100%",aspectRatio:"1/1"})}}>
      {!loaded && <TilePlaceholder kind={kind} hue={hue}/>}
      <img src={src+bust} alt={alt||""} loading="eager" decoding="async"
        onLoad={()=>setLoaded(true)}
        onError={()=>{ if(tries<4){ const n=tries+1; setTimeout(()=>setTries(n), 2200*n); } }}
        style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:fit,opacity:loaded?1:0,transition:"opacity .35s ease"}}/>
    </div>
  );
}
// Real saved-story cover: use the story's own first-page painted art (thumbnail
// from /api/list-stories); fall back to a soft cream panel if it hasn't painted.
function SavedCover({src,color}){
  const [ok,setOk]=useState(!!src);
  if(src&&ok){
    return <img src={src} alt="" loading="lazy" decoding="async" onError={()=>setOk(false)}
      style={{width:"100%",height:"100%",objectFit:"cover"}}/>;
  }
  return (<div style={{width:"100%",height:"100%",background:color||"linear-gradient(160deg,#efe6ff,#ffe3ee)",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(58,46,77,0.38)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h7v18H6a2 2 0 0 0-2 2z"/><path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 1 2 2z"/></svg>
  </div>);
}

export default function StoryMaker({ onBack, onHome, playerName, remix = null, onConsumeRemix = null }) {
  const deviceId=getDeviceId(); const kidProfileId=getKidProfileId();
  const [view,setView]=useState("landing");   // landing | pick | generating | reading
  const [step,setStep]=useState(0);            // 0 hero | 1 world | 2 what happens

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
  const [heroWin,setHeroWin]=useState(()=>CHARACTERS.slice(0,HERO_WINDOW).map(c=>c[0]));
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [dice,setDice]=useState(null);          // null | {phase:"roll"|"land", hero,world,quest}

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
  const [soundOn,setSoundOn]=useState(true);
  const musicRef=useRef(null);      // looping background music
  const voiceRef=useRef(null);      // the buddy's spoken-line player
  const narrCacheRef=useRef({});    // text -> audioUrl ("none" if unavailable)
  const primedRef=useRef(false);
  const diceCtxRef=useRef(null);    // tiny WebAudio context for the dice tick

  async function loadSaved(){try{const r=await fetch("/api/list-stories?deviceId="+encodeURIComponent(deviceId)+(kidProfileId?"&kidProfileId="+encodeURIComponent(kidProfileId):""));const j=await r.json();setSaved(Array.isArray(j.stories)?j.stories:[]);}catch{}}
  useEffect(()=>{loadSaved();},[]);

  async function publishStory(st){
    const next=!st.published;
    setSaved(prev=>prev.map(x=>x.story_id===st.story_id?{...x,published:next}:x));
    try{ await fetch("/api/publish-creation",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({kind:"story",id:st.story_id,deviceId,kidProfileId:getKidProfileId()||undefined,publish:next})}); }catch{}
  }

  // Remix: open pre-filled with the EXACT choices behind another kid's published
  // story, so the kid can tweak anything and make their own version.
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
        if(c.characterSlug){setHero(c.characterSlug);setHeroWin(makeHeroWindow(c.characterSlug));}
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
  function prewarm(text){ if(!text||narrCacheRef.current[text]!==undefined) return; fetch("/api/narrate-story-page",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})}).then(r=>r.json()).then(j=>{ narrCacheRef.current[text]=(j&&j.configured&&j.audioUrl)?j.audioUrl:"none"; }).catch(()=>{}); }

  // A tiny synthesized "tick" for the dice roll — no audio asset needed.
  function diceTick(){
    if(!soundOn||typeof window==="undefined") return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
      const ctx=diceCtxRef.current||(diceCtxRef.current=new AC());
      const o=ctx.createOscillator(); const g=ctx.createGain();
      o.type="triangle"; o.frequency.value=260+Math.random()*160;
      o.connect(g); g.connect(ctx.destination);
      const t=ctx.currentTime;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.18,t+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.16);
      o.start(t); o.stop(t+0.17);
    }catch{}
  }

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
      if(!soundOn) return;
      if(url==="none"){
        if(window.speechSynthesis){ try{ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.rate=0.95; u.pitch=1.12; window.speechSynthesis.speak(u); }catch{} }
        return;
      }
      v.src=url; v.currentTime=0; v.volume=1; v.muted=false; v.play().catch(()=>{});
    }catch{}
  }

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

  useEffect(()=>()=>{ try{ if(musicRef.current) musicRef.current.pause(); }catch{} stopVoice(); },[]);

  // A fresh hero window of 6 that always includes the current hero.
  function makeHeroWindow(keep){
    const rest=shuffle(CHARACTERS.map(c=>c[0]).filter(id=>id!==keep)).slice(0,HERO_WINDOW-1);
    return shuffle([keep,...rest]);
  }
  function shuffleHeroes(){ primeSound(); setHeroWin(makeHeroWindow(hero)); }

  // New story = fresh smart defaults. Buddy + mood + ending are randomized per
  // story (ST4 smart defaults); art style stays watercolor (our best-tuned look,
  // still changeable in More choices).
  function reset(){
    setGuide(rand(GUIDES)[0]); setStyle("watercolor");
    setHero("bunny"); setName(DEFAULT_NAME["bunny"]); setHeroWin(CHARACTERS.slice(0,HERO_WINDOW).map(c=>c[0]));
    setWorld(rand(WORLDS)[0]); setQuest(rand(QUESTS)[0]);
    setMood(rand(MOODS)[0]); setEnding(rand(ENDINGS)[0]);
    setSpark(""); setCustomSpark(""); setDrawerOpen(false);
  }
  function doStartPicker(){setError(null);reset();setStep(0);setView("pick");}
  function maybeGate(action){
    const ls=getLearningSettings();
    if(ls.enabled && justFinished){ setJustFinished(false); setGateNext(()=>action); return; }
    action();
  }
  function startPicker(){ primeSound(); maybeGate(doStartPicker); }

  // Three core screens. Buddy/style/mood/ending live in the More-choices drawer.
  const STEPS = [
    { key:"hero",  q:"Who's our hero?",       opts:heroWin.map(id=>[id,CHAR_LABEL[id]||id]), val:hero,  set:(v)=>{setHero(v);setName(DEFAULT_NAME[v]||"");}, img:(id)=>libImg("character",id,"watercolor","happy") },
    { key:"world", q:"Where does it happen?", opts:WORLDS, val:world, set:setWorld, img:(id)=>libImg("world",id,"watercolor") },
    { key:"quest", q:"What happens?",          opts:QUESTS, val:quest, set:setQuest, img:(id)=>iconImg(id) },
  ];
  const TOTAL=STEPS.length;
  const LAST=TOTAL-1;
  const cur=STEPS[step];

  useEffect(()=>{ const m=musicRef.current; if(m){ if(soundOn&&view==="pick"){ m.play().catch(()=>{}); } else { try{m.pause();}catch{} } } if(view!=="pick"){ stopVoice(); } },[view,soundOn]);
  // The buddy reads each screen's question aloud as the kid moves through them.
  useEffect(()=>{ if(view!=="pick") return; const t=setTimeout(()=>{ if(cur){ say(step===0 ? ("Hi! Let's make a magical story together. "+cur.q) : cur.q); } }, 450); return ()=>clearTimeout(t); },[view,step]);
  // Pre-load the pictures for the current + next screen so tiles appear fast.
  useEffect(()=>{ if(typeof window==="undefined") return; if(view!=="pick"&&view!=="landing") return; const idxs = view==="landing" ? [0,1] : [step,step+1]; idxs.forEach(i=>{ const st=STEPS[i]; if(!st||!st.img) return; st.opts.forEach(([id])=>{ try{ const im=new Image(); im.decoding="async"; im.src=st.img(id); }catch{} }); }); if(view==="pick"&&soundOn){ const nx=STEPS[step+1]; if(nx) prewarm(nx.q); } },[view,step,heroWin]);

  function pickOpt(st,id){st.set(id);}
  function cycleVal(list,val,set,dir){const i=list.findIndex(o=>o[0]===val);const ni=((i<0?0:i)+dir+list.length)%list.length;set(list[ni][0]);}

  function next(){setStep(s=>Math.min(LAST,s+1));}
  function back(){ if(step>0)setStep(step-1); else setView("landing"); }

  // ---------- STORY DICE (replaces "Surprise me") ----------
  function doRollDice(){
    primeSound();
    const h=rand(CHARACTERS)[0], w=rand(WORLDS)[0], qz=rand(QUESTS)[0];
    const gd=rand(GUIDES)[0], md=rand(MOODS)[0], en=rand(ENDINGS)[0], sp=rand(SPARKS);
    setError(null);
    setDice({phase:"roll",hero:h,world:w,quest:qz});
    diceTick();
    const t1=setTimeout(()=>{ diceTick(); }, 380);
    const t2=setTimeout(()=>{ diceTick(); }, 760);
    const t3=setTimeout(()=>{ setDice(d=>d?{...d,phase:"land"}:d); diceTick(); }, 1150);
    const t4=setTimeout(()=>{
      setDice(null);
      setGuide(gd); setStyle("watercolor"); setHero(h); setName(DEFAULT_NAME[h]||"");
      setWorld(w); setQuest(qz); setMood(md); setEnding(en);
      makeStory({ guide:gd, style:"watercolor", characterSlug:h, characterName:DEFAULT_NAME[h], worldSlug:w, quest:qz, mood:md, ending:en, spark:sp });
    }, 2000);
    diceTimersRef.current=[t1,t2,t3,t4];
  }
  const diceTimersRef=useRef([]);
  useEffect(()=>()=>{ diceTimersRef.current.forEach(clearTimeout); },[]);
  function storyDice(){ primeSound(); maybeGate(doRollDice); }

  function openFreshStory(st){ setStory(st); setSavedMsg(""); setCurrentStoryId(null); setJustFinished(true); setView("reading"); }
  async function generateStoryRaw(body){
    try{
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

  // WRITE-WHILE-NAMING (ST1): once the kid is on the final screen (all three core
  // choices made), quietly start writing with the hero's DEFAULT name. On Make we
  // swap in the kid's typed name. Debounced so tweaking a drawer chip doesn't spam.
  useEffect(()=>{
    if(view!=="pick"||step!==LAST) return;
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
    if(!st){ setError("Hmm, that didn't work. Try again!"); setView(payload?"landing":"pick"); if(!payload)setStep(LAST); return; }
    openFreshStory(st);
  }
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

  // Learning gate overlay.
  if (gateNext) {
    const proceed = gateNext;
    return (
      <QuickGame
        goal={getLearningSettings().goal}
        gameType="story"
        title="One quick game first!"
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

  // ---------- PICKER (3 screens) ----------
  if(view==="pick"){
    const heroChosen=STEPS[0].opts.some(o=>o[0]===hero);
    return (<div style={s.container}>
      <style>{spin+diceKf}</style>
      <div style={s.topBar}><button style={s.navBtn} onClick={back}>Back</button><button style={s.navBtn} onClick={toggleSound} aria-label="Turn sound on or off">{soundOn?"Sound on":"Sound off"}</button><button style={s.navBtn} onClick={onHome}>Home</button></div>

      <div style={s.dots}>{STEPS.map((_,i)=><span key={i} style={{...s.dot,...(i===step?s.dotOn:i<step?s.dotDone:{})}}/>)}</div>
      <h2 style={s.qTitle}>{cur.q}</h2>

      <div style={s.grid}>
        {cur.opts.map(([id,label])=>{const on=cur.val===id;return (
          <button key={id} onClick={()=>pickOpt(cur,id)} style={{...s.gTile,...(on?s.tileOn:{})}}>
            <TileImg src={cur.img(id)} alt={label} kind={kindOf(cur.key)} seed={cur.key+":"+id} fit={cur.key==="world"?"cover":"contain"}/>
            <span style={s.gLabel}>{label}</span>
          </button>);})}
      </div>

      {/* HERO screen: Shuffle + name-on-hero popover */}
      {step===0 && (<>
        <button style={s.shuffleBtn} onClick={shuffleHeroes} aria-label="Show different heroes">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="16 3 21 3 21 8"/><path d="M4 20L21 3"/><polyline points="21 16 21 21 16 21"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
          Shuffle heroes
        </button>
        <div style={s.namePop}>
          <label style={s.nameLbl}>{heroChosen?`Name your ${CHAR_LABEL[hero]||"hero"}`:"Name your hero"}</label>
          <input style={s.nameInput} value={name} maxLength={28} onChange={e=>setName(e.target.value)} placeholder="Hero name"/>
        </div>
      </>)}

      {/* FINAL screen: More choices drawer + big idea + Make */}
      {step===LAST && (<div style={{width:"100%",maxWidth:560,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <button style={s.drawerToggle} onClick={()=>setDrawerOpen(o=>!o)} aria-expanded={drawerOpen}>
          <span>More choices</span><span style={{transform:drawerOpen?"rotate(90deg)":"none",transition:"transform .18s ease",display:"inline-flex"}}><Chevron dir="right"/></span>
        </button>
        {drawerOpen && (<div style={s.drawer}>
          {DRAWER(guide,setGuide,style,setStyle,mood,setMood,ending,setEnding).map((row)=>(
            <div key={row.label} style={s.drawerRow}>
              <span style={s.drawerLbl}>{row.label}</span>
              <div style={s.drawerCtl}>
                <button style={s.drawerChev} onClick={()=>cycleVal(row.list,row.val,row.set,-1)} aria-label={"Previous "+row.label}><Chevron dir="left"/></button>
                <TileImg src={row.img(row.val)} kind={row.kind} seed={"dr:"+row.label+":"+row.val} fit="contain" box={{width:40,height:40,borderRadius:9}}/>
                <span style={s.drawerVal}>{(row.list.find(o=>o[0]===row.val)||[,""])[1]}</span>
                <button style={s.drawerChev} onClick={()=>cycleVal(row.list,row.val,row.set,1)} aria-label={"Next "+row.label}><Chevron dir="right"/></button>
              </div>
            </div>
          ))}
        </div>)}

        <label style={{...s.nameLbl,marginTop:16}}>Add your own idea? (optional)</label>
        <div style={s.sparkGrid}>
          {SPARKS.map((txt)=>(<button key={txt} onClick={()=>{setSpark(txt===spark&&!customSpark?"":txt);setCustomSpark("");}} style={{...s.sparkCard,...((spark===txt&&!customSpark)?s.tileOn:{})}}>{SPARK_ICON[txt]&&<TileImg src={iconImg(SPARK_ICON[txt])} kind="icon" seed={"spark:"+txt} fit="contain" box={{width:48,height:48,borderRadius:11}}/>}{txt}</button>))}
        </div>
        <input style={s.bigInput} value={customSpark} maxLength={140} placeholder="…or type your own idea" onChange={(e)=>{setCustomSpark(e.target.value);if(e.target.value)setSpark("");}}/>
      </div>)}

      <div style={s.wizNav}>
        {step<LAST
          ? <button style={s.next} onClick={next}>Next</button>
          : <button style={s.makeBtn} onClick={doMake}>Make my story!</button>}
      </div>

      {error&&<p style={s.error}>{error}</p>}
    </div>);
  }

  // ---------- LANDING ----------
  return (<div style={s.container}>
    <style>{diceKf}</style>
    {dice && <DiceOverlay dice={dice} heroImg={libImg("character",dice.hero,"watercolor","happy")} worldImg={libImg("world",dice.world,"watercolor")} questImg={iconImg(dice.quest)} />}
    <div style={s.topBar}><button style={s.navBtn} onClick={onBack||onHome}>Back</button><button style={s.navBtn} onClick={onHome}>Home</button></div>
    <h1 style={s.logo}>Stories</h1>
    <p style={s.tagline}>Make a magical picture book — just tap!</p>
    <button style={s.startBtn} onClick={startPicker}>Make a new story</button>
    <button style={s.diceBtn} onClick={storyDice}>
      <DiceGlyph/> Roll the Story Dice
    </button>

    {saved.length>0&&(<div style={s.savedWrap}>
      <h3 style={s.sectionTitle}>My stories</h3>
      <div style={s.savedRow}>
        {saved.map((st)=>(<div key={st.story_id} style={s.savedCard}>
          <button style={s.savedOpen} onClick={()=>openSaved(st.story_id)}>
            <div style={s.savedCover}>
              <SavedCover src={st.thumbnail} color={st.cover_color}/>
              {Number(st.chapter)>=2 && <span style={s.savedRibbon}>Chapter {Number(st.chapter)}</span>}
            </div>
            <span style={s.savedName}>{st.title}</span></button>
          <button style={s.savedDel} onClick={()=>deleteSaved(st.story_id)} title="Delete" aria-label="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
          <button style={{...s.savedPub,background:st.published?"rgba(40,165,75,0.95)":"rgba(58,46,77,0.6)"}} onClick={()=>publishStory(st)} title={st.published?"Published to Top board — tap to make private":"Publish to the Top board"} aria-label="Publish">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>
          </button>
        </div>))}
      </div>
    </div>)}
  </div>);
}

// The four "smart default" choices, tucked in the More-choices drawer.
function DRAWER(guide,setGuide,style,setStyle,mood,setMood,ending,setEnding){
  return [
    {label:"Story buddy", list:GUIDES,  val:guide,  set:setGuide,  img:(id)=>libImg("character",id,"watercolor","happy"), kind:"character"},
    {label:"Look",        list:STYLES,  val:style,  set:setStyle,  img:(id)=>libImg("character","bunny",id),               kind:"character"},
    {label:"Mood",        list:MOODS,   val:mood,   set:setMood,   img:(id)=>iconImg(id),                                  kind:"icon"},
    {label:"How it ends", list:ENDINGS, val:ending, set:setEnding, img:(id)=>iconImg(id),                                  kind:"icon"},
  ];
}

function DiceGlyph(){return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/></svg>);}

// Three dice tumble (wobble) then land on hero / world / quest, then off to making.
function DiceOverlay({dice,heroImg,worldImg,questImg}){
  const rolling=dice.phase==="roll";
  const faces=[{img:heroImg,label:"Hero",fit:"contain"},{img:worldImg,label:"Where",fit:"cover"},{img:questImg,label:"Quest",fit:"contain"}];
  return (<div style={dov.wrap}>
    <div style={dov.title}>{rolling?"Rolling the Story Dice…":"Your story!"}</div>
    <div style={dov.row}>
      {faces.map((f,i)=>(
        <div key={i} style={{...dov.die, animation: rolling? `bkDiceRoll .5s ease-in-out ${i*0.08}s infinite` : `bkDiceLand .5s ease both ${i*0.09}s`}}>
          <img src={f.img} alt="" decoding="async" style={{width:"100%",height:"100%",objectFit:f.fit,borderRadius:14}}/>
          {!rolling && <span style={dov.dieLabel}>{f.label}</span>}
        </div>
      ))}
    </div>
  </div>);
}

const spin = "@keyframes bkSpin{0%,80%,100%{transform:scale(.4);opacity:.4}40%{transform:scale(1);opacity:1}}";
const diceKf = "@keyframes bkDiceRoll{0%{transform:rotate(-12deg) translateY(0)}25%{transform:rotate(11deg) translateY(-12px)}50%{transform:rotate(-7deg) translateY(0)}75%{transform:rotate(8deg) translateY(-7px)}100%{transform:rotate(-12deg) translateY(0)}}@keyframes bkDiceLand{0%{transform:scale(1.18) rotate(-4deg)}55%{transform:scale(.92) rotate(2deg)}100%{transform:scale(1) rotate(0)}}";

const dov = {
  wrap:{position:"fixed",inset:0,zIndex:9000,background:"rgba(255,248,238,0.94)",backdropFilter:"blur(3px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:26,padding:20},
  title:{fontFamily:FRED,fontSize:"clamp(22px,5vw,30px)",color:INK,fontWeight:800},
  row:{display:"flex",gap:"clamp(12px,3vw,22px)"},
  die:{position:"relative",width:"clamp(84px,24vw,120px)",height:"clamp(84px,24vw,120px)",borderRadius:16,background:CARD,border:"1px solid rgba(58,46,77,0.12)",boxShadow:"0 12px 26px rgba(58,46,77,0.18)",padding:8,boxSizing:"border-box"},
  dieLabel:{position:"absolute",bottom:-22,left:0,right:0,textAlign:"center",fontFamily:FRED,fontWeight:800,fontSize:13,color:SUB},
};

const s = {
  container:{minHeight:"100vh",background:PAGE_BG,color:INK,fontFamily:NUN,padding:"20px 16px 60px",display:"flex",flexDirection:"column",alignItems:"center"},
  topBar:{width:"100%",maxWidth:640,display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  navBtn:{padding:"10px 18px",background:CARD,color:INK,border:CARD_BORDER,borderRadius:14,fontWeight:800,fontFamily:NUN,cursor:"pointer",boxShadow:SHADOW},
  logo:{fontFamily:FRED,fontSize:"clamp(30px, 8vw, 52px)",margin:"34px 0 6px",background:GRAD,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  tagline:{color:SUB,marginBottom:30,fontSize:17,fontWeight:600,textAlign:"center"},
  startBtn:{padding:"17px 40px",borderRadius:20,border:"none",background:GRAD,color:"#fff",fontSize:20,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 12px 30px rgba(155,126,221,0.4)"},
  diceBtn:{marginTop:16,padding:"13px 26px",borderRadius:18,border:CARD_BORDER,background:CARD,color:INK,fontSize:17,fontWeight:800,fontFamily:FRED,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:9,boxShadow:SHADOW},
  dots:{display:"flex",gap:8,marginTop:8,marginBottom:14,justifyContent:"center"},
  dot:{width:10,height:10,borderRadius:"50%",background:"rgba(58,46,77,0.16)"},dotOn:{background:"#c06b99"},dotDone:{background:"#9b7edd"},
  qTitle:{fontFamily:FRED,fontSize:"clamp(24px,5.5vw,30px)",margin:"2px 0 20px",textAlign:"center",color:INK,fontWeight:800},
  grid:{width:"100%",maxWidth:640,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:14,justifyContent:"center"},
  gTile:{borderRadius:18,border:CARD_BORDER,background:CARD,color:INK,cursor:"pointer",padding:10,display:"flex",flexDirection:"column",alignItems:"center",gap:8,fontFamily:NUN,boxShadow:SHADOW},
  gLabel:{fontSize:14,fontWeight:800,textAlign:"center",color:INK},
  tileOn:{border:"2px solid #c06b99",boxShadow:"0 0 0 4px rgba(192,107,153,0.18)"},
  shuffleBtn:{marginTop:18,padding:"11px 22px",borderRadius:16,border:CARD_BORDER,background:CARD,color:INK,fontWeight:800,fontFamily:FRED,fontSize:15,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8,boxShadow:SHADOW},
  namePop:{marginTop:16,width:"100%",maxWidth:400,display:"flex",flexDirection:"column",alignItems:"center",background:CARD,border:CARD_BORDER,borderRadius:18,padding:"14px 16px",boxShadow:SHADOW},
  nameLbl:{fontSize:14,color:SUB,marginBottom:8,fontFamily:FRED,fontWeight:700},
  nameInput:{width:"100%",boxSizing:"border-box",padding:"13px 16px",borderRadius:14,border:CARD_BORDER,background:"#FFFDFA",color:INK,fontSize:19,fontFamily:FRED,textAlign:"center"},
  drawerToggle:{marginTop:6,padding:"11px 20px",borderRadius:14,border:CARD_BORDER,background:CARD,color:INK,fontWeight:800,fontFamily:FRED,fontSize:15,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8,boxShadow:SHADOW},
  drawer:{marginTop:12,width:"100%",background:CARD,border:CARD_BORDER,borderRadius:18,padding:"10px 14px",boxShadow:SHADOW},
  drawerRow:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"9px 2px",borderBottom:"1px solid rgba(58,46,77,0.07)"},
  drawerLbl:{fontSize:14,fontWeight:800,color:INK,fontFamily:FRED},
  drawerCtl:{display:"flex",alignItems:"center",gap:8},
  drawerChev:{background:"rgba(58,46,77,0.06)",border:"none",color:INK,cursor:"pointer",width:30,height:30,borderRadius:9,display:"inline-flex",alignItems:"center",justifyContent:"center"},
  drawerVal:{fontSize:12,fontWeight:800,color:INK,minWidth:78,textAlign:"center"},
  sparkGrid:{width:"100%",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:12},
  sparkCard:{borderRadius:14,border:CARD_BORDER,background:CARD,color:INK,cursor:"pointer",padding:"12px 12px",fontFamily:FRED,fontSize:14,fontWeight:700,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:7,boxShadow:SHADOW},
  bigInput:{width:"100%",boxSizing:"border-box",padding:"13px 16px",borderRadius:14,border:CARD_BORDER,background:"#FFFDFA",color:INK,fontSize:16,fontFamily:NUN,marginBottom:8},
  wizNav:{display:"flex",gap:12,justifyContent:"center",marginTop:22,alignItems:"center"},
  next:{padding:"14px 40px",borderRadius:16,border:"none",background:GRAD,color:"#fff",fontWeight:800,fontFamily:FRED,fontSize:18,cursor:"pointer",boxShadow:"0 10px 26px rgba(155,126,221,0.36)"},
  makeBtn:{padding:"17px 40px",borderRadius:20,border:"none",background:GRAD,color:"#fff",fontSize:20,fontWeight:800,fontFamily:FRED,cursor:"pointer",boxShadow:"0 12px 30px rgba(155,126,221,0.4)"},
  error:{color:"#c0396a",fontSize:15,marginTop:14,fontWeight:700},
  genTitle:{fontFamily:FRED,fontSize:26,margin:"18px 0 6px",color:INK,fontWeight:800},genSub:{color:SUB,fontWeight:600},
  spinDots:{display:"flex",gap:10},spinDot:{width:16,height:16,borderRadius:"50%",background:"#c06b99",animation:"bkSpin 1.2s ease-in-out infinite"},
  savedWrap:{width:"100%",maxWidth:640,marginTop:44},
  sectionTitle:{fontFamily:FRED,fontSize:21,marginBottom:14,color:INK,fontWeight:800},
  savedRow:{display:"flex",gap:14,flexWrap:"wrap"},
  savedCard:{position:"relative"},
  savedOpen:{width:140,border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:0},
  savedCover:{width:140,height:98,borderRadius:16,overflow:"hidden",position:"relative",border:CARD_BORDER,boxShadow:SHADOW,background:"#efe6ff"},
  savedRibbon:{position:"absolute",top:6,left:6,background:"linear-gradient(135deg,#9b7edd,#d65a7b)",color:"#fff",fontSize:10,fontWeight:800,fontFamily:FRED,padding:"3px 8px",borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,0.3)"},
  savedName:{fontSize:13,fontWeight:800,color:INK,textAlign:"center"},
  savedDel:{position:"absolute",top:-6,right:-6,width:26,height:26,borderRadius:"50%",border:"none",background:"rgba(58,46,77,0.72)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 8px rgba(58,46,77,0.25)"},
  savedPub:{position:"absolute",bottom:24,right:-6,width:28,height:28,borderRadius:"50%",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 8px rgba(58,46,77,0.25)"},
};
