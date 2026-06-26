// /src/StoryReader.jsx  (v2 — LIBRARY model)
// The "living picture book". Each page = a reusable library WORLD background + the
// hero's matching EXPRESSION cutout (by the page's emotion), layered with motion via
// <LayeredPage>. No per-page art generation, so pages appear instantly and a story
// costs ~$0. Read-aloud highlights words in time (ElevenLabs if configured, else the
// browser's built-in speech).
import { useState, useEffect, useRef } from "react";
import { LayeredPage } from "./lib/storyEffects";
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

export default function StoryReader({ story, storyId, deviceId, kidProfileId, onExit, onSave, saving, savedMsg, onNewAdventure }) {
  const pages = (story && story.pages) || [];
  const style = (story && (story.style || story.art_style)) || "watercolor";
  const charSlug = (story && story.character_slug) || "bunny";
  const [idx, setIdx] = useState(0);
  const [spoken, setSpoken] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const narrCacheRef = useRef({});
  const hlTimerRef = useRef(null);
  const ambienceRef = useRef(null);
  const [soundOn, setSoundOn] = useState(true);

  const page = pages[idx] || {};
  const words = wordsOf(page.text);
  const palette = WORLD_PALETTE[page.world_slug] || ["#3a2c63", "#7a4a86"];
  const bgUrl = page.world_slug ? libImg("world", page.world_slug, style) : null;
  const charUrl = libImg("character", charSlug, style, page.emotion || "happy");

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

  function stopAll() {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } catch {}
    if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; }
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

  const isLast = idx === pages.length - 1;

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onExit}>← Back</button>
        <span style={s.counter}>{story.title}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.soundBtn} onClick={() => shareCreation({ kind: "story", id: storyId, title: story.title })} title="Share this story" aria-label="Share this story">🔗</button>
          <button style={s.soundBtn} onClick={toggleSound} title="Background sounds" aria-label="Toggle background sounds">{soundOn ? "🔊" : "🔇"}</button>
        </div>
      </div>
      <audio ref={ambienceRef} style={{ display: "none" }} />

      <LayeredPage bgUrl={bgUrl} charUrl={charUrl} charSlug={charSlug} effects={page.effects || [page.effect]} palette={palette} world={page.world_slug} pageIndex={idx} style={s.page} />

      <div style={s.textPanel}>
        <p style={s.text}>
          {words.map((w, i) => (<span key={i} style={{ ...(i === spoken ? s.wordOn : s.word) }}>{w} </span>))}
        </p>
      </div>

      <div style={s.controls}>
        <button style={s.circleBtn} disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
        <button style={s.readBtn} onClick={toggleRead}>{playing ? "⏸ Pause" : "▶ Read to me"}</button>
        <button style={{ ...s.circleBtn, ...(isLast ? { opacity: 0.3 } : {}) }} disabled={isLast} onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}>›</button>
      </div>

      <p style={s.pageNum}>Page {idx + 1} of {pages.length}</p>

      <audio ref={audioRef} style={{ display: "none" }} />

      {isLast && (
        <div style={s.endRow}>
          <button style={s.saveBtn} disabled={saving} onClick={() => onSave(story)}>{saving ? "Saving…" : "💾 Save to my library"}</button>
          {onNewAdventure && (<button style={s.againBtn} onClick={() => onNewAdventure(story)}>✨ New adventure with {story.character_name || "the same hero"}</button>)}
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
  textPanel: { width: "100%", maxWidth: 760, marginTop: 14, padding: "16px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 18, boxSizing: "border-box" },
  text: { fontFamily: FRED, fontSize: "clamp(17px, 2.6vw, 22px)", lineHeight: 1.55, margin: 0, color: "#fff", textAlign: "center" },
  word: { color: "#efeaff", transition: "color 0.1s, background 0.1s", borderRadius: 6, padding: "0 1px" },
  wordOn: { color: "#1a1330", background: "#ffe08a", borderRadius: 6, padding: "0 3px", boxShadow: "0 0 0 2px #ffe08a" },
  controls: { display: "flex", alignItems: "center", gap: 14, marginTop: 18 },
  circleBtn: { width: 52, height: 52, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, cursor: "pointer", fontFamily: FRED },
  readBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 20px rgba(155,126,221,0.45)" },
  pageNum: { marginTop: 12, fontSize: 14, opacity: 0.65 },
  endRow: { marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  saveBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "#fff", color: "#b3477a", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  savedMsg: { fontSize: 14, color: "#bdf5cf", fontWeight: 700 },
  againBtn: { padding: "12px 24px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
};
