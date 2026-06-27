// /src/StoryReader.jsx  (v2 — LIBRARY model)
// The "living picture book". Each page = a reusable library WORLD background + the
// hero's matching EXPRESSION cutout (by the page's emotion), layered with motion via
// <LayeredPage>. No per-page art generation, so pages appear instantly and a story
// costs ~$0. Read-aloud highlights words in time (ElevenLabs if configured, else the
// browser's built-in speech).
import { useState, useEffect, useRef } from "react";
import { LayeredPage, SceneStage } from "./lib/storyEffects";
import { shareCreation } from "./lib/shareSheet";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";

const WORLD_PALETTE = {
  "snowy-village": ["#2b3a55", "#5d7a9e"], "coral-reef": ["#0d3b53", "#1f8aa6"],
  "enchanted-forest": ["#1f3d2f", "#4a7a55"], "dragon-mountain": ["#5a3a2a", "#a86a4a"],
  "dino-jungle": ["#22401f", "#5a8a3a"], "space-station": ["#1b1240", "#5b3a86"],
  "desert-oasis": ["#6b4a1f", "#caa05a"], "candy-land": ["#7a2f5f", "#d4789e"],
};

function libImg(kind, slug, style, emo) {
  return "/api/story-library?img=" + kind + ":" + slug + "&style=" + (style || "watercolor") + (emo ? "&emo=" + emo : "");
}
function wordsOf(text) { return (text || "").trim().split(/\s+/).filter(Boolean); }
const WATER_WORLDS = new Set(["coral-reef", "desert-oasis"]);
const WATER_FX = new Set(["water_shimmer", "gentle_waves"]);
function wantsWater(pg){ return !!pg && (WATER_WORLDS.has(pg.world_slug) || WATER_FX.has(pg.effect)); }

function ShareIcon(){return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>);}
function SoundIcon({on}){return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="4 9 8 9 13 4 13 20 8 15 4 15"/>{on?<path d="M16 8a4 4 0 0 1 0 8"/>:<g><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></g>}</svg>);}
function Chevron({dir}){const pts=dir==="left"?"15 6 9 12 15 18":"9 6 15 12 9 18";return(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points={pts}/></svg>);}

export default function StoryReader({ story, storyId, deviceId, kidProfileId, onExit, onSave, saving, savedMsg, onNewAdventure }) {
  const pages = (story && story.pages) || [];
  const style = (story && (story.style || story.art_style)) || "watercolor";
  const charSlug = (story && story.character_slug) || "bunny";
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);   // page-turn direction (1=forward, -1=back)
  const [cover, setCover] = useState(true);   // show the book cover first
  const [ended, setEnded] = useState(false);  // show 'The End'
  const [spoken, setSpoken] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const narrCacheRef = useRef({});
  const hlTimerRef = useRef(null);
  const ambienceRef = useRef(null);
  const waterAudioRef = useRef(null);
  const [soundOn, setSoundOn] = useState(true);
  const [sceneUrl, setSceneUrl] = useState({});   // pageIndex -> generated scene url
  const tokenRef = useRef((story && (story.scene_token || story.story_id)) || (Math.random().toString(36).slice(2,10) + Date.now().toString(36)));
  const startedScenesRef = useRef(false);

  const page = pages[idx] || {};
  const words = wordsOf(page.text);
  const palette = WORLD_PALETTE[page.world_slug] || ["#3a2c63", "#7a4a86"];
  const bgUrl = page.world_slug ? libImg("world", page.world_slug, "watercolor") : null;   // placeholder
  const charUrl = libImg("character", charSlug, "watercolor", page.emotion || "happy");      // placeholder

  // RICH PAGES: generate an integrated illustration of each page's moment (the hero
  // drawn INTO the scene, by emotion) in the background. Flat layered page shows
  // instantly; each page upgrades to its painted scene when ready. Cached per story.
  useEffect(() => {
    if (startedScenesRef.current || !pages.length) return;
    startedScenesRef.current = true;
    let cancelled = false;
    const token = tokenRef.current;
    const queue = pages.map((_p, i) => i);
    let active = 0, qi = 0;
    const pump = () => {
      while (!cancelled && active < 2 && qi < queue.length) {
        const i = queue[qi++]; const pg = pages[i];
        if (!pg || !pg.text) continue;
        active++;
        const ck = token + "|" + i + "|" + (pg.emotion || "happy");
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 120000);
        fetch("/api/story-library", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ pageScene: true, slug: charSlug, style, emo: pg.emotion || "happy", world: pg.world_slug, action: pg.text, pageIndex: i, cacheKey: ck, companion: (story && story.companion_slug) || "" }) })
          .then((r) => r.json())
          .then((j) => { clearTimeout(to); if (!cancelled && j && (j.generated || j.cached)) setSceneUrl((m) => ({ ...m, [i]: "/api/story-library?pimg=1&k=" + encodeURIComponent(ck) })); })
          .catch(() => { clearTimeout(to); })
          .finally(() => { active--; if (!cancelled) pump(); });
      }
    };
    pump();
    return () => { cancelled = true; };
  }, []);

  // World ambience: optional (returns configured:false if not set up). Loops quietly.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/story-ambience?world=" + encodeURIComponent((story && story.start_world) || ""))
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j || !j.configured || !j.audioUrl) return;
        const el = ambienceRef.current; if (!el) return;
        el.src = j.audioUrl; el.loop = true; el.volume = 0.2;
        if (soundOn) el.play().catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; try { ambienceRef.current && ambienceRef.current.pause(); } catch {} };
  }, []);

  useEffect(() => { stopAll(); setSpoken(-1); setPlaying(false); return () => stopAll(); }, [idx]);

  // Trickling-water sound on water pages (generated once, cached). Loops quietly.
  useEffect(() => {
    const el = waterAudioRef.current; if (!el) return;
    if (wantsWater(page) && soundOn) {
      if (!el.src || el.src.indexOf("s=water") < 0) el.src = "/api/sfx?s=water";
      el.loop = true; el.volume = 0.3; el.play().catch(() => {});
    } else { try { el.pause(); } catch {} }
  }, [idx, soundOn]);

  function stopAll() {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } catch {}
    if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; }
    try { if (waterAudioRef.current) waterAudioRef.current.pause(); } catch {}
  }

  function toggleSound() {
    setSoundOn((v) => { const next = !v; const el = ambienceRef.current; if (el) { if (next) el.play().catch(() => {}); else el.pause(); } return next; });
  }

  function readAloudBrowser() {
    if (typeof window === "undefined" || !window.speechSynthesis) { setPlaying(false); return; }
    const u = new SpeechSynthesisUtterance(page.text || "");
    u.rate = 0.82; u.pitch = 1.05;
    const starts = []; let acc = 0;
    words.forEach((w) => { const at = (page.text || "").indexOf(w, acc); starts.push(at); acc = at + w.length; });
    u.onboundary = (e) => { if (e.name && e.name !== "word") return; let wi = 0; for (let i = 0; i < starts.length; i++) { if (e.charIndex >= starts[i]) wi = i; } setSpoken(wi); };
    u.onend = () => { setSpoken(-1); setPlaying(false); };
    u.onerror = () => { setSpoken(-1); setPlaying(false); };
    window.speechSynthesis.speak(u);
  }

  function playWithAudio(audioUrl, wordTimings) {
    const el = audioRef.current; if (!el) { readAloudBrowser(); return; }
    el.src = audioUrl;
    try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch {}
    el.playbackRate = 0.9;
    if (Array.isArray(wordTimings) && wordTimings.length) {
      hlTimerRef.current = setInterval(() => { const t = el.currentTime || 0; let wi = -1; for (let i = 0; i < wordTimings.length; i++) { if (t >= (wordTimings[i].start || 0)) wi = i; } setSpoken(wi); }, 80);
    }
    el.onended = () => { setSpoken(-1); setPlaying(false); if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; } };
    el.play().catch(() => { setPlaying(false); });
  }

  async function narratePage() {
    setPlaying(true); setSpoken(-1);
    if (soundOn && ambienceRef.current && ambienceRef.current.src && ambienceRef.current.paused) ambienceRef.current.play().catch(() => {});
    let cached = narrCacheRef.current[idx];
    if (cached === undefined) {
      try {
        const r = await fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: page.text }) });
        const j = await r.json();
        cached = (j && j.configured && j.audioUrl) ? { audioUrl: j.audioUrl, wordTimings: j.wordTimings } : "none";
      } catch { cached = "none"; }
      narrCacheRef.current[idx] = cached;
    }
    if (cached && cached !== "none") playWithAudio(cached.audioUrl, cached.wordTimings);
    else readAloudBrowser();
  }
  function toggleRead() { if (playing) { stopAll(); setPlaying(false); setSpoken(-1); } else { narratePage(); } }

  function repaint() {
    const pg = pages[idx]; if (!pg || !pg.text) return;
    const ck = tokenRef.current + "|" + idx + "|" + (pg.emotion || "happy");
    setSceneUrl((m) => { const n = { ...m }; delete n[idx]; return n; });   // back to placeholder while it paints
    fetch("/api/story-library", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageScene: true, force: true, slug: charSlug, style, emo: pg.emotion || "happy", world: pg.world_slug, action: pg.text, pageIndex: idx, cacheKey: ck, companion: (story && story.companion_slug) || "" }) })
      .then((r) => r.json())
      .then((j) => { if (j && (j.generated || j.cached)) setSceneUrl((m) => ({ ...m, [idx]: "/api/story-library?pimg=1&k=" + encodeURIComponent(ck) + "&cb=" + Date.now() })); })
      .catch(() => {});
  }

  const isLast = idx === pages.length - 1;
  const friend = story.companion_name;
  const topBar = (
    <div style={s.topBar}>
      <button style={s.navBtn} onClick={onExit}>Back</button>
      <span style={s.counter}>{story.title}</span>
      <span style={{ width: 64 }} />
    </div>
  );

  // ---------- COVER ----------
  if (cover) {
    const p0 = pages[0] || {};
    const overlay = (
      <div style={s.coverOverlay}>
        <div style={s.coverInner}>
          <p style={s.coverKicker}>A storybook</p>
          <h1 style={s.coverTitle}>{story.title}</h1>
          <p style={s.coverBy}>starring {story.character_name}{friend ? ` & ${friend}` : ""}</p>
          <button style={s.coverBtn} onClick={() => { setDir(1); setCover(false); }}>Open the book</button>
        </div>
      </div>
    );
    return (
      <div style={s.container}>
        {topBar}
        {sceneUrl[0]
          ? <SceneStage url={sceneUrl[0]} effects={["magic_sparkles"]} world={p0.world_slug} pageIndex={0} style={s.page}>{overlay}</SceneStage>
          : <LayeredPage bgUrl={p0.world_slug ? libImg("world", p0.world_slug, "watercolor") : null} charUrl={libImg("character", charSlug, "watercolor", p0.emotion || "happy")} charSlug={charSlug} effects={["magic_sparkles"]} palette={palette} world={p0.world_slug} pageIndex={0} style={s.page}>{overlay}</LayeredPage>}
      </div>
    );
  }

  // ---------- THE END ----------
  if (ended) {
    const li2 = pages.length - 1; const pl = pages[li2] || {};
    const overlay = (
      <div style={s.coverOverlay}>
        <div style={s.coverInner}>
          <h1 style={s.endTitle}>The End</h1>
          <p style={s.coverBy}>{story.character_name}{friend ? ` and ${friend}` : ""} lived happily ever after.</p>
        </div>
      </div>
    );
    return (
      <div style={s.container}>
        {topBar}
        {sceneUrl[li2]
          ? <SceneStage url={sceneUrl[li2]} effects={["magic_sparkles", "twinkling_stars"]} world={pl.world_slug} pageIndex={li2} style={s.page}>{overlay}</SceneStage>
          : <LayeredPage bgUrl={pl.world_slug ? libImg("world", pl.world_slug, "watercolor") : null} charUrl={libImg("character", charSlug, "watercolor", pl.emotion || "happy")} charSlug={charSlug} effects={["magic_sparkles"]} palette={palette} world={pl.world_slug} pageIndex={li2} style={s.page}>{overlay}</LayeredPage>}
        <div style={s.endRow}>
          <button style={s.saveBtn} disabled={saving} onClick={() => onSave(story)}>{saving ? "Saving…" : "Save to my library"}</button>
          <button style={s.againBtn} onClick={() => { setEnded(false); setDir(-1); setIdx(0); }}>Read it again</button>
          {onNewAdventure && (<button style={s.againBtn} onClick={() => onNewAdventure(story)}>New adventure with {story.character_name || "the same hero"}</button>)}
          {savedMsg && <p style={s.savedMsg}>{savedMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <style>{"@keyframes bk-turn-next{0%{opacity:0;transform:perspective(1200px) rotateY(14deg) translateX(7%)}100%{opacity:1;transform:perspective(1200px) rotateY(0) translateX(0)}}@keyframes bk-turn-prev{0%{opacity:0;transform:perspective(1200px) rotateY(-14deg) translateX(-7%)}100%{opacity:1;transform:perspective(1200px) rotateY(0) translateX(0)}}"}</style>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onExit}>Back</button>
        <span style={s.counter}>{story.title}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.soundBtn} onClick={() => shareCreation({ kind: "story", id: storyId, title: story.title })} title="Share this story" aria-label="Share this story"><ShareIcon/></button>
          <button style={s.soundBtn} onClick={toggleSound} title="Background sounds" aria-label="Toggle background sounds"><SoundIcon on={soundOn}/></button>
        </div>
      </div>
      <audio ref={ambienceRef} style={{ display: "none" }} />
      <audio ref={waterAudioRef} style={{ display: "none" }} />

      <div key={idx} style={{ width: "100%", maxWidth: 760, animation: (dir >= 0 ? "bk-turn-next" : "bk-turn-prev") + " 0.5s cubic-bezier(.2,.7,.3,1) both", transformOrigin: dir >= 0 ? "left center" : "right center" }}>
        {sceneUrl[idx]
          ? <SceneStage url={sceneUrl[idx]} effects={page.effects || [page.effect]} world={page.world_slug} pageIndex={idx} style={s.page} />
          : <LayeredPage bgUrl={bgUrl} charUrl={charUrl} charSlug={charSlug} effects={page.effects || [page.effect]} palette={palette} world={page.world_slug} pageIndex={idx} style={s.page} />}
      </div>

      <button style={s.repaintBtn} onClick={repaint} title="Paint this page again">Repaint this page</button>

      <div style={s.textPanel}>
        <p style={s.text}>
          {words.map((w, i) => (<span key={i} style={{ ...(i === spoken ? s.wordOn : s.word) }}>{w} </span>))}
        </p>
      </div>

      <div style={s.controls}>
        <button style={s.circleBtn} disabled={idx === 0} onClick={() => { setDir(-1); setIdx((i) => Math.max(0, i - 1)); }}><Chevron dir="left"/></button>
        <button style={s.readBtn} onClick={toggleRead}>{playing ? "Pause" : "Read to me"}</button>
        <button style={s.circleBtn} onClick={() => { if (isLast) { setEnded(true); } else { setDir(1); setIdx((i) => i + 1); } }}><Chevron dir="right"/></button>
      </div>

      <p style={s.pageNum}>Page {idx + 1} of {pages.length}</p>

      <audio ref={audioRef} style={{ display: "none" }} />

    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 50px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 760, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  soundBtn: { width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 18, cursor: "pointer" },
  navBtn: { padding: "10px 18px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  counter: { fontFamily: FRED, fontSize: 18, fontWeight: 700, textAlign: "center", flex: 1, padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  page: { width: "100%", maxWidth: 760, aspectRatio: "3 / 2", borderRadius: 24, border: "1px solid rgba(155,126,221,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  textPanel: { width: "100%", maxWidth: 760, marginTop: 14, padding: "16px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 18, boxSizing: "border-box" },
  text: { fontFamily: FRED, fontSize: "clamp(17px, 2.6vw, 22px)", lineHeight: 1.55, margin: 0, color: "#fff", textAlign: "center" },
  word: { color: "#efeaff", transition: "color 0.1s, background 0.1s", borderRadius: 6, padding: "0 1px" },
  wordOn: { color: "#1a1330", background: "#ffe08a", borderRadius: 6, padding: "0 3px", boxShadow: "0 0 0 2px #ffe08a" },
  controls: { display: "flex", alignItems: "center", gap: 14, marginTop: 18 },
  circleBtn: { width: 52, height: 52, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, cursor: "pointer", fontFamily: FRED },
  readBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 20px rgba(155,126,221,0.45)" },
  repaintBtn: { marginTop: 10, padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.07)", color: "#cdd3ff", fontFamily: NUN, fontSize: 13, fontWeight: 700, cursor: "pointer" },
  pageNum: { marginTop: 12, fontSize: 14, opacity: 0.65 },
  endRow: { marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  saveBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "#fff", color: "#b3477a", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  savedMsg: { fontSize: 14, color: "#bdf5cf", fontWeight: 700 },
  againBtn: { padding: "12px 24px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  coverOverlay: { position: "absolute", inset: 0, borderRadius: "inherit", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(to top, rgba(10,8,24,0.80), rgba(10,8,24,0.15) 55%, rgba(10,8,24,0.50))", padding: 20, boxSizing: "border-box" },
  coverInner: { textAlign: "center", maxWidth: "88%" },
  coverKicker: { fontFamily: NUN, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#e9c6ff", margin: "0 0 10px", opacity: 0.9 },
  coverTitle: { fontFamily: FRED, fontSize: "clamp(28px,5.5vw,46px)", fontWeight: 800, margin: "0 0 10px", color: "#fff", textShadow: "0 3px 18px rgba(0,0,0,0.65)", lineHeight: 1.12 },
  coverBy: { fontFamily: FRED, fontSize: "clamp(15px,2.5vw,19px)", color: "#f3ecff", margin: "0 0 20px", textShadow: "0 2px 10px rgba(0,0,0,0.6)" },
  coverBtn: { padding: "14px 32px", borderRadius: 18, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.6)", animation: "bk-cbob 2.6s ease-in-out infinite" },
  endTitle: { fontFamily: FRED, fontSize: "clamp(40px,9vw,76px)", fontWeight: 800, margin: "0 0 8px", color: "#fff", textShadow: "0 4px 22px rgba(0,0,0,0.7)" },
};
