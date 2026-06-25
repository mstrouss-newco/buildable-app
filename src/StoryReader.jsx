// /src/StoryReader.jsx
// Story Reader — the "living picture book". For each page it shows generated art
// (lazy-loaded; calm gradient placeholder until it arrives), a hand-written
// ambient effect via <LivingPage>, and the page text that highlights word-by-word
// as it's read aloud.
//
// NARRATION (MVP, zero keys/cost): the browser's Web Speech API reads the page and
// fires word-boundary events we use to highlight the current word exactly in time.
// UPGRADE PATH: when ELEVENLABS_API_KEY is set, /api/narrate-story-page can return
// { audioUrl, wordTimings } for premium narration — swap the speak() call for an
// <audio> element driven by wordTimings (the highlight loop already keys off an index).
import { useState, useEffect, useRef } from "react";
import { LivingPage, LayeredPage } from "./lib/storyEffects";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";

// World -> a calm 2-color palette for the placeholder "scene".
const HERO_EMOJI = { bunny:"🐰", dragon:"🐲", robot:"🤖", kitten:"🐱", astronaut:"🧑‍🚀", mermaid:"🧜", fox:"🦊", knight:"🛡️" };
const HELPER_EMOJI = { wise_owl:"🦉", talking_map:"🗺️", glowing_firefly:"✨", old_turtle:"🐢", friendly_ghost:"👻", singing_bird:"🐦" };

const WORLD_SCENE = {
  snowy_forest: "a cozy snowy pine forest with a little log cabin and a big moon",
  outer_space: "a sparkly outer-space scene with planets and bright stars",
  underwater: "a colorful underwater coral kingdom with seaweed",
  candy_land: "a sweet candy land with lollipops and gumdrop hills",
  enchanted_woods: "an enchanted glowing woodland with big friendly mushrooms",
  desert_oasis: "a sunny desert oasis with palm trees and a blue pool",
  cloud_castle: "a magical castle floating in fluffy pink clouds",
  pirate_cove: "a friendly pirate cove with a little sailing ship",
};

const WORLD_PALETTE = {
  snowy_forest: ["#2b3a55", "#5d7a9e"], outer_space: ["#1b1240", "#5b3a86"],
  underwater: ["#0d3b53", "#1f8aa6"], candy_land: ["#7a2f5f", "#d4789e"],
  enchanted_woods: ["#1f3d2f", "#4a7a55"], desert_oasis: ["#6b4a1f", "#caa05a"],
  cloud_castle: ["#3a4a86", "#8aa0d4"], pirate_cove: ["#2a3d4a", "#5a86a0"],
};

function wordsOf(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean);
}

export default function StoryReader({ story, deviceId, kidProfileId, onExit, onSave, saving, savedMsg, onNewAdventure }) {
  const pages = (story && story.pages) || [];
  const [idx, setIdx] = useState(0);
  const [bgs, setBgs] = useState({});            // pageIndex -> library bg url | "loading" | null
  const [spoken, setSpoken] = useState(-1);      // highlighted word index
  const [playing, setPlaying] = useState(false);
  const startedRef = useRef(false);
  const audioRef = useRef(null);
  const narrCacheRef = useRef({});   // pageIndex -> {audioUrl, wordTimings} | "none"
  const hlTimerRef = useRef(null);
  const ambienceRef = useRef(null);
  const [soundOn, setSoundOn] = useState(true);
  const [charUrl, setCharUrl] = useState(null);  // the story's ONE character cutout (reused everywhere)
  const charRef = useRef(null);
  const [pageVideo, setPageVideo] = useState({}); // idx -> mp4 url | "loading" | null
  const palette = WORLD_PALETTE[story && story.world] || ["#3a2c63", "#7a4a86"];
  const made = (story && story.created_with) || {};
  const heroEmoji = HERO_EMOJI[made.hero] || "🐰";
  const helperEmoji = HELPER_EMOJI[made.helper] || "";
  const page = pages[idx] || {};
  const words = wordsOf(page.text);

  // AUTO LAYERED PAGES: generate the ONE character cutout, then pull a reusable library
  // background per page (deterministic per world+style+variant -> cached). Every page is
  // layered + moving by default; no button. Concurrency-limited to respect rate limits.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => { const c = await ensureChar(); if (!cancelled) setCharUrl(c); })();
    const scene = WORLD_SCENE[story.world] || "a magical storybook place";
    const queue = pages.map((_p, i) => i);
    pages.forEach((_p, i) => setBgs((m) => ({ ...m, [i]: "loading" })));
    let active = 0, qi = 0;
    const pump = () => {
      while (!cancelled && active < 2 && qi < queue.length) {
        const i = queue[qi++]; active++;
        const bgPrompt = "Storybook BACKGROUND SETTING ONLY — NO characters, NO animals, NO people, an empty wide scene of " + scene + ". Variation " + (i % 3) + ".";
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 70000);
        fetch("/api/generate-story-art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artPrompt: bgPrompt, world: story.world, style: story.art_style }), signal: ctrl.signal })
          .then((r) => r.json())
          .then((j) => { clearTimeout(to); if (!cancelled) setBgs((prev) => ({ ...prev, [i]: j && j.url ? j.url : null })); })
          .catch(() => { clearTimeout(to); if (!cancelled) setBgs((prev) => ({ ...prev, [i]: null })); })
          .finally(() => { active--; if (!cancelled) pump(); });
      }
    };
    pump();
    return () => { cancelled = true; };
  }, []);

  // World ambience: fetch once (deterministic per world), loop quietly underneath.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/story-ambience?world=" + encodeURIComponent((story && story.world) || ""))
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j || !j.configured || !j.audioUrl) return;
        const el = ambienceRef.current;
        if (!el) return;
        el.src = j.audioUrl; el.loop = true; el.volume = 0.2;
        if (soundOn) el.play().catch(() => {}); // may need a user gesture; retried on Read
      })
      .catch(() => {});
    return () => { cancelled = true; try { ambienceRef.current && ambienceRef.current.pause(); } catch {} };
  }, []);

  // PROTOTYPE: split the current page into a background + a transparent character layer
  // and parallax them for real motion (like the games' layered scenes).
  // Generate the story's ONE character cutout (reused on every page); cached server-side.
  async function ensureChar() {
    if (charRef.current) return charRef.current;
    const charSheet = story.character_sheet || "a friendly little hero";
    const charPrompt = charSheet + ". Full body, standing, friendly, facing forward, centered, on a plain solid background, no scenery, no ground, simple.";
    try {
      const r = await fetch("/api/generate-story-art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artPrompt: charPrompt, world: story.world, style: story.art_style, transparent: true }) }).then((x) => x.json());
      charRef.current = r && r.url ? r.url : null;
    } catch { charRef.current = null; }
    return charRef.current;
  }
  // PROTOTYPE: animate THIS page into a looping video (real motion) via fal.ai.
  async function bringToLife() {
    if (pageVideo[idx] === "loading") return;
    setPageVideo((m) => ({ ...m, [idx]: "loading" }));
    try {
      const stillR = await fetch("/api/generate-story-art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artPrompt: page.art_prompt, world: story.world, style: story.art_style }) }).then((r) => r.json());
      const still = stillR && stillR.url;
      if (!still) { setPageVideo((m) => ({ ...m, [idx]: null })); return; }
      const vidR = await fetch("/api/animate-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: still, cacheKey: page.art_prompt }) }).then((r) => r.json());
      setPageVideo((m) => ({ ...m, [idx]: vidR && vidR.videoUrl ? vidR.videoUrl : null }));
    } catch { setPageVideo((m) => ({ ...m, [idx]: null })); }
  }

  function toggleSound() {
    setSoundOn((v) => {
      const next = !v;
      const el = ambienceRef.current;
      if (el) { if (next) el.play().catch(() => {}); else el.pause(); }
      return next;
    });
  }

    // Stop any narration when leaving a page or unmounting.
  useEffect(() => {
    stopAll();
    setSpoken(-1); setPlaying(false);
    return () => stopAll();
  }, [idx]);

  function stopAll() {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } catch {}
    if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; }
  }

  // Browser built-in speech (fallback when ElevenLabs isn't configured).
  function readAloudBrowser() {
    if (typeof window === "undefined" || !window.speechSynthesis) { setPlaying(false); return; }
    const u = new SpeechSynthesisUtterance(page.text || "");
    u.rate = 0.82; u.pitch = 1.05;
    const starts = [];
    let acc = 0;
    words.forEach((w) => { const at = (page.text || "").indexOf(w, acc); starts.push(at); acc = at + w.length; });
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      let wi = 0;
      for (let i = 0; i < starts.length; i++) { if (e.charIndex >= starts[i]) wi = i; }
      setSpoken(wi);
    };
    u.onend = () => { setSpoken(-1); setPlaying(false); };
    u.onerror = () => { setSpoken(-1); setPlaying(false); };
    window.speechSynthesis.speak(u);
  }

  // Premium narration: play the ElevenLabs audio and highlight words by their timings.
  function playWithAudio(audioUrl, wordTimings) {
    const el = audioRef.current;
    if (!el) { readAloudBrowser(); return; }
    el.src = audioUrl;
    try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch {}
    el.playbackRate = 0.9;
    if (Array.isArray(wordTimings) && wordTimings.length) {
      hlTimerRef.current = setInterval(() => {
        const t = el.currentTime || 0;
        let wi = -1;
        for (let i = 0; i < wordTimings.length; i++) { if (t >= (wordTimings[i].start || 0)) wi = i; }
        setSpoken(wi);
      }, 80);
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
        const r = await fetch("/api/narrate-story-page", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: page.text }),
        });
        const j = await r.json();
        cached = (j && j.configured && j.audioUrl) ? { audioUrl: j.audioUrl, wordTimings: j.wordTimings } : "none";
      } catch { cached = "none"; }
      narrCacheRef.current[idx] = cached;
    }
    if (cached && cached !== "none") playWithAudio(cached.audioUrl, cached.wordTimings);
    else readAloudBrowser();
  }
  function toggleRead() { if (playing) { stopAll(); setPlaying(false); setSpoken(-1); } else { narratePage(); } }

  // How many pages have finished painting (for a gentle progress hint).
  const readyCount = pages.reduce((n, _p, i) => n + (bgs[i] && bgs[i] !== "loading" ? 1 : 0), 0);
  const stillPainting = pages.some((_p, i) => bgs[i] === "loading") || !charUrl;
  function enrichedStory() { return { ...story }; } // backgrounds/character are cached server-side; re-reads regenerate instantly

  const isLast = idx === pages.length - 1;
  const bgUrl = bgs[idx] && bgs[idx] !== "loading" ? bgs[idx] : null;

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onExit}>← Back</button>
        <span style={s.counter}>{story.title}</span>
        <button style={s.soundBtn} onClick={toggleSound} title="Background sounds" aria-label="Toggle background sounds">{soundOn ? "🔊" : "🔇"}</button>
      </div>
      <audio ref={ambienceRef} style={{ display: "none" }} />

      {pageVideo[idx] && pageVideo[idx] !== "loading" ? (
        <div style={{ ...s.page, overflow: "hidden", position: "relative" }}>
          <video src={pageVideo[idx]} autoPlay loop muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 24 }} />
        </div>
      ) : (
        <LayeredPage bgUrl={bgUrl} charUrl={charUrl} effects={page.effects || [page.effect]} palette={palette} world={story.world} heroEmoji={heroEmoji} helperEmoji={helperEmoji} pageIndex={idx} style={s.page}>
          {!bgUrl && bgs[idx] === "loading" && (<div style={s.artLoading}>✨ setting the scene…</div>)}
        </LayeredPage>
      )}

      <button style={s.liveBtn} onClick={bringToLife} disabled={pageVideo[idx] === "loading"}>
        {pageVideo[idx] === "loading" ? "🎬 bringing to life… (~1–2 min)" : pageVideo[idx] ? "🎬 living video" : "🎬 Bring this page to life"}
      </button>

      <div style={s.textPanel}>
        <p style={s.text}>
          {words.map((w, i) => (
            <span key={i} style={{ ...(i === spoken ? s.wordOn : s.word) }}>{w} </span>
          ))}
        </p>
      </div>

      <div style={s.controls}>
        <button style={s.circleBtn} disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
        <button style={s.readBtn} onClick={toggleRead}>{playing ? "⏸ Pause" : "▶ Read to me"}</button>
        {!isLast ? (
          <button style={s.circleBtn} onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}>›</button>
        ) : (
          <button style={s.circleBtn} disabled style={{ ...s.circleBtn, opacity: 0.3 }}>›</button>
        )}
      </div>

      <p style={s.pageNum}>
        Page {idx + 1} of {pages.length}
        {stillPainting && <span style={{ opacity: 0.7 }}>{"  ·  🎨 painting your book… " + readyCount + "/" + pages.length}</span>}
      </p>

      <audio ref={audioRef} style={{ display: "none" }} />

      {isLast && (
        <div style={s.endRow}>
          <button style={s.saveBtn} disabled={saving} onClick={() => onSave(enrichedStory())}>
            {saving ? "Saving…" : "💾 Save to my library"}
          </button>
          {onNewAdventure && (
            <button style={s.againBtn} onClick={() => onNewAdventure(story)}>✨ New adventure with {(story.created_with && story.created_with.heroName) || "the same friends"}</button>
          )}
          {savedMsg && <p style={s.savedMsg}>{savedMsg}</p>}
        </div>
      )}
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
  artLoading: { position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontSize: 14, opacity: 0.8 },
  textPanel: { width: "100%", maxWidth: 760, marginTop: 14, padding: "16px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 18, boxSizing: "border-box" },
  text: { fontFamily: FRED, fontSize: "clamp(17px, 2.6vw, 22px)", lineHeight: 1.55, margin: 0, color: "#fff", textAlign: "center" },
  word: { color: "#efeaff", transition: "color 0.1s, background 0.1s", borderRadius: 6, padding: "0 1px" },
  wordOn: { color: "#1a1330", background: "#ffe08a", borderRadius: 6, padding: "0 3px", boxShadow: "0 0 0 2px #ffe08a" },
  controls: { display: "flex", alignItems: "center", gap: 14, marginTop: 18 },
  circleBtn: { width: 52, height: 52, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, cursor: "pointer", fontFamily: FRED },
  readBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 20px rgba(155,126,221,0.45)" },
  liveBtn: { marginTop: 12, padding: "11px 22px", borderRadius: 999, border: "1px solid rgba(124,246,176,0.5)", background: "rgba(124,246,176,0.14)", color: "#bdf5cf", fontFamily: FRED, fontSize: 15, fontWeight: 700, cursor: "pointer" },
  pageNum: { marginTop: 12, fontSize: 14, opacity: 0.65 },
  endRow: { marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  saveBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "#fff", color: "#b3477a", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  savedMsg: { fontSize: 14, color: "#bdf5cf", fontWeight: 700 },
  againBtn: { padding: "12px 24px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
};
