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
import { LivingPage } from "./lib/storyEffects";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";

// World -> a calm 2-color palette for the placeholder "scene".
const WORLD_PALETTE = {
  snowy_forest: ["#2b3a55", "#5d7a9e"], outer_space: ["#1b1240", "#5b3a86"],
  underwater: ["#0d3b53", "#1f8aa6"], candy_land: ["#7a2f5f", "#d4789e"],
  enchanted_woods: ["#1f3d2f", "#4a7a55"], desert_oasis: ["#6b4a1f", "#caa05a"],
  cloud_castle: ["#3a4a86", "#8aa0d4"], pirate_cove: ["#2a3d4a", "#5a86a0"],
};

function wordsOf(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean);
}

export default function StoryReader({ story, deviceId, kidProfileId, onExit, onSave, saving, savedMsg }) {
  const pages = (story && story.pages) || [];
  const [idx, setIdx] = useState(0);
  const [art, setArt] = useState({});            // pageIndex -> url | "loading" | null
  const [spoken, setSpoken] = useState(-1);      // highlighted word index
  const [playing, setPlaying] = useState(false);
  const palette = WORLD_PALETTE[story && story.world] || ["#3a2c63", "#7a4a86"];
  const page = pages[idx] || {};
  const words = wordsOf(page.text);

  // Lazy page-art: fetch current page (and prefetch the next) if not present.
  useEffect(() => {
    let cancelled = false;
    async function ensureArt(i) {
      if (i < 0 || i >= pages.length) return;
      const p = pages[i];
      if (p.art_url) { setArt((a) => (a[i] ? a : { ...a, [i]: p.art_url })); return; }
      setArt((a) => {
        if (a[i] !== undefined) return a;          // already fetching/fetched
        fetch("/api/generate-story-art", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artPrompt: p.art_prompt, world: story.world }),
        })
          .then((r) => r.json())
          .then((j) => { if (!cancelled) setArt((prev) => ({ ...prev, [i]: j && j.url ? j.url : null })); })
          .catch(() => { if (!cancelled) setArt((prev) => ({ ...prev, [i]: null })); });
        return { ...a, [i]: "loading" };
      });
    }
    ensureArt(idx);
    ensureArt(idx + 1);
    return () => { cancelled = true; };
  }, [idx, pages, story]);

  // Stop any narration when leaving a page or unmounting.
  useEffect(() => {
    stopSpeech();
    setSpoken(-1); setPlaying(false);
    return () => stopSpeech();
  }, [idx]);

  function stopSpeech() {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
  }

  function readAloud() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    stopSpeech();
    const u = new SpeechSynthesisUtterance(page.text || "");
    u.rate = 0.92; u.pitch = 1.05;
    // Map character offset -> word index for accurate highlighting.
    const starts = [];
    let acc = 0;
    words.forEach((w, i) => { const at = (page.text || "").indexOf(w, acc); starts.push(at); acc = at + w.length; });
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      let wi = 0;
      for (let i = 0; i < starts.length; i++) { if (e.charIndex >= starts[i]) wi = i; }
      setSpoken(wi);
    };
    u.onend = () => { setSpoken(-1); setPlaying(false); };
    u.onerror = () => { setSpoken(-1); setPlaying(false); };
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }
  function toggleRead() { if (playing) { stopSpeech(); setPlaying(false); setSpoken(-1); } else { readAloud(); } }

  const isLast = idx === pages.length - 1;
  const artUrl = art[idx] && art[idx] !== "loading" ? art[idx] : null;

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onExit}>← Back</button>
        <span style={s.counter}>{story.title}</span>
        <span style={{ width: 70 }} />
      </div>

      <LivingPage artUrl={artUrl} effect={page.effect} palette={palette} style={s.page}>
        {art[idx] === "loading" && !artUrl && (
          <div style={s.artLoading}>painting this page…</div>
        )}
        <div style={s.textPanel}>
          <p style={s.text}>
            {words.map((w, i) => (
              <span key={i} style={{
                ...(i === spoken ? s.wordOn : s.word),
              }}>{w} </span>
            ))}
          </p>
        </div>
      </LivingPage>

      <div style={s.controls}>
        <button style={s.circleBtn} disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>‹</button>
        <button style={s.readBtn} onClick={toggleRead}>{playing ? "⏸ Pause" : "▶ Read to me"}</button>
        {!isLast ? (
          <button style={s.circleBtn} onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}>›</button>
        ) : (
          <button style={s.circleBtn} disabled style={{ ...s.circleBtn, opacity: 0.3 }}>›</button>
        )}
      </div>

      <p style={s.pageNum}>Page {idx + 1} of {pages.length}</p>

      {isLast && (
        <div style={s.endRow}>
          <button style={s.saveBtn} disabled={saving} onClick={onSave}>
            {saving ? "Saving…" : "💾 Save to my library"}
          </button>
          {savedMsg && <p style={s.savedMsg}>{savedMsg}</p>}
        </div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 50px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 760, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  navBtn: { padding: "10px 18px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  counter: { fontFamily: FRED, fontSize: 18, fontWeight: 700, textAlign: "center", flex: 1, padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  page: { width: "100%", maxWidth: 760, aspectRatio: "4 / 3", borderRadius: 24, border: "1px solid rgba(155,126,221,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", display: "flex" },
  artLoading: { position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontSize: 14, opacity: 0.8 },
  textPanel: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "24px 22px", background: "linear-gradient(transparent, rgba(0,0,0,0.78) 38%)", borderRadius: "0 0 24px 24px" },
  text: { fontFamily: FRED, fontSize: "clamp(18px, 3.6vw, 26px)", lineHeight: 1.5, margin: 0, textShadow: "0 2px 10px rgba(0,0,0,0.6)" },
  word: { color: "#fff", transition: "color 0.1s, background 0.1s", borderRadius: 6, padding: "0 1px" },
  wordOn: { color: "#1a1330", background: "#ffe08a", borderRadius: 6, padding: "0 3px", boxShadow: "0 0 0 2px #ffe08a" },
  controls: { display: "flex", alignItems: "center", gap: 14, marginTop: 18 },
  circleBtn: { width: 52, height: 52, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, cursor: "pointer", fontFamily: FRED },
  readBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 20px rgba(155,126,221,0.45)" },
  pageNum: { marginTop: 12, fontSize: 14, opacity: 0.65 },
  endRow: { marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  saveBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "#fff", color: "#b3477a", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  savedMsg: { fontSize: 14, color: "#bdf5cf", fontWeight: 700 },
};
