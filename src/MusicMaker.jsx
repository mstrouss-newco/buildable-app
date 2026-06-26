// /src/MusicMaker.jsx
// Kid-facing "Music Maker" — create, keep, and play up to 10 AI songs.
// "Make a Song" is a QUIZ WIZARD read aloud for pre-readers: one big illustrated
// question per screen (6+ options, photoreal icons; Auto/None/Surprise are vector
// glyphs — no emoji), a Next button, and an always-visible "song so far" strip
// whose chips cycle (tap ▲▼ or swipe). Render plays a slot-machine lock + glow.

import { useState, useEffect, useRef } from "react";
import { shareCreation } from "./lib/shareSheet";
import CoverThumb from "./lib/CoverThumb";
import IconImg from "./lib/IconImg";
import QuizGate from "./QuizGate";
import { getLearningSettings } from "./store";

const MAX_SONGS = 10;

const VIBES = [
  { id: "happy",  label: "Happy",  color: "#FFD93D" },
  { id: "epic",   label: "Epic",   color: "#5B6CFF" },
  { id: "spooky", label: "Spooky", color: "#8E44AD" },
  { id: "silly",  label: "Silly",  color: "#FF8FB1" },
  { id: "chill",  label: "Chill",  color: "#4FD1C5" },
  { id: "dance",  label: "Dance",  color: "#FF6B6B" },
];
const GENRES = [
  { id: "surprise", label: "Surprise", glyph: "surprise" },
  { id: "pop", label: "Pop" }, { id: "country", label: "Country" }, { id: "hiphop", label: "Hip Hop" },
  { id: "rock", label: "Rock" }, { id: "disco", label: "Disco" }, { id: "sleepy", label: "Sleepy Time" },
  { id: "marching", label: "Marching" }, { id: "reggae", label: "Reggae" },
];
const SINGERS = [
  { id: "none", label: "No Singer", glyph: "none" },
  { id: "boy", label: "Boy" }, { id: "girl", label: "Girl" }, { id: "group", label: "Group" },
  { id: "both", label: "Both" }, { id: "robot", label: "Robot" },
];
const DRUMS = [
  { id: "auto", label: "Auto", glyph: "auto" },
  { id: "big", label: "Big Drums" }, { id: "soft", label: "Soft Beat" }, { id: "marching", label: "Marching" },
  { id: "bongos", label: "Bongos" }, { id: "electro", label: "Electro" },
];
const GUITARS = [
  { id: "auto", label: "Auto", glyph: "auto" },
  { id: "electric", label: "Electric" }, { id: "acoustic", label: "Acoustic" }, { id: "twangy", label: "Twangy" },
  { id: "bass", label: "Bass" }, { id: "none", label: "No Guitar", glyph: "none" },
];
const STRINGS = [
  { id: "auto", label: "Auto", glyph: "auto" },
  { id: "violin", label: "Violin" }, { id: "cello", label: "Cello" }, { id: "harp", label: "Harp" },
  { id: "orchestra", label: "Orchestra" }, { id: "none", label: "No Strings", glyph: "none" },
];
const SPEEDS = [
  { id: "auto", label: "Auto", glyph: "auto" },
  { id: "slow", label: "Slow" }, { id: "medium", label: "Medium" }, { id: "fast", label: "Fast" },
  { id: "superfast", label: "Super Fast" }, { id: "groovy", label: "Groovy" },
];

const LOADER_MSGS = ["Mixing the beats…", "Tuning the guitars…", "Finding the melody…", "Adding some sparkle…", "Almost there…"];
const QUESTION_PHRASES = ["Pick a vibe","Pick a music style","Who sings?","Pick your drums","Pick a guitar","Add some strings?","How fast should it go?","Last one! What is your song about?","Rendering your song!"];

function getDeviceId() {
  try { let id = localStorage.getItem("deviceId"); if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); } return id; } catch { return "dev_anon"; }
}
function getKidProfileId() {
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; }
}

let kfInjected = false;
function injectKeyframes() {
  if (kfInjected || typeof document === "undefined") return;
  kfInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-mm-kf", "");
  el.textContent =
    "@keyframes mmLock{0%{transform:translateY(-8px) scale(1.07)}55%{transform:translateY(3px) scale(.96)}100%{transform:translateY(0) scale(1)}}" +
    "@keyframes mmGlow{0%{box-shadow:0 0 0 0 rgba(255,217,61,0)}40%{box-shadow:0 0 0 3px rgba(255,217,61,.95),0 0 22px rgba(255,217,61,.8)}100%{box-shadow:0 0 0 2px rgba(255,217,61,.6)}}" +
    "@keyframes mmHintBob{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}" +
    "@keyframes mmEq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}";
  document.head.appendChild(el);
}

// Vector glyphs for the control options (no emoji).
function Glyph({ kind, size = 40 }) {
  const c = "#cfd0f5";
  if (kind === "auto") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <line x1="6" y1="4" x2="6" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="18" y1="4" x2="18" y2="20" />
        <circle cx="6" cy="9" r="2.4" fill={c} stroke="none" /><circle cx="12" cy="15" r="2.4" fill={c} stroke="none" /><circle cx="18" cy="8" r="2.4" fill={c} stroke="none" />
      </svg>
    );
  }
  if (kind === "surprise") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="9" cy="9" r="1.4" fill={c} stroke="none" /><circle cx="15" cy="9" r="1.4" fill={c} stroke="none" />
        <circle cx="9" cy="15" r="1.4" fill={c} stroke="none" /><circle cx="15" cy="15" r="1.4" fill={c} stroke="none" /><circle cx="12" cy="12" r="1.4" fill={c} stroke="none" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9a9ac0" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><line x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
    </svg>
  );
}

function OptionIcon({ opt, cat, size }) {
  if (opt.glyph) return <Glyph kind={opt.glyph} size={size} />;
  return <IconImg cat={cat} id={opt.id} size={size} />;
}

function Speaker({ on, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e7e7f5" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4z" />
      {on ? <path d="M15.5 8.5a5 5 0 010 7" /> : (<><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>)}
    </svg>
  );
}

export default function MusicMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [vibe, setVibe] = useState("happy");
  const [genre, setGenre] = useState("surprise");
  const [singer, setSinger] = useState("none");
  const [drums, setDrums] = useState("auto");
  const [guitar, setGuitar] = useState("auto");
  const [strings, setStrings] = useState("auto");
  const [speed, setSpeed] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [songs, setSongs] = useState([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("make");
  const [step, setStep] = useState(0);
  const [locking, setLocking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [msgI, setMsgI] = useState(0);
  const [justFinished, setJustFinished] = useState(false); // learning gate: only after a real finish
  const [gateNext, setGateNext] = useState(null);          // pending action awaiting a quick question
  const audioRef = useRef(null);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;
  const audioElRef = useRef(null);
  const ttsCacheRef = useRef({});
  const speakSeqRef = useRef(0);

  useEffect(() => { injectKeyframes(); refresh(); QUESTION_PHRASES.forEach(preload); }, []);

  function audioEl() {
    if (!audioElRef.current && typeof window !== "undefined") { const a = new Audio(); a.preload = "auto"; audioElRef.current = a; }
    return audioElRef.current;
  }
  function stopVoice() {
    try { if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.currentTime = 0; } } catch {}
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
  }
  function browserSpeak(text) {
    if (!voiceRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1.05; window.speechSynthesis.speak(u); } catch {}
  }
  function toObjUrl(dataUrl) {
    try {
      const b64 = dataUrl.split(",")[1]; const bin = atob(b64);
      const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: "audio/mpeg" }));
    } catch { return dataUrl; }
  }
  async function preload(text) {
    if (!text || ttsCacheRef.current[text]) return;
    try {
      const r = await fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (j && j.configured && j.audioUrl) ttsCacheRef.current[text] = toObjUrl(j.audioUrl);
    } catch {}
  }
  function playUrl(url, text, seq) {
    try {
      const a = audioEl(); a.src = url;
      const p = a.play();
      if (p && p.catch) p.catch(() => { if (seq === speakSeqRef.current && voiceRef.current) browserSpeak(text); });
      return true;
    } catch { return false; }
  }
  // ElevenLabs read-aloud. Plays from the client cache synchronously (preserves the
  // tap's audio permission); only awaits a fetch if the phrase isn't preloaded yet.
  function speak(text) {
    if (!voiceRef.current || typeof window === "undefined" || !text) return;
    const seq = ++speakSeqRef.current;
    stopVoice();
    const cached = ttsCacheRef.current[text];
    if (cached) { playUrl(cached, text, seq); return; }
    fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json())
      .then((j) => {
        if (seq !== speakSeqRef.current || !voiceRef.current) return;
        if (j && j.configured && j.audioUrl) { const u = toObjUrl(j.audioUrl); ttsCacheRef.current[text] = u; playUrl(u, text, seq); }
        else browserSpeak(text);
      })
      .catch(() => { if (seq === speakSeqRef.current && voiceRef.current) browserSpeak(text); });
  }

  async function refresh() {
    try {
      const r = await fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId) + (kidProfileId ? "&kidProfileId=" + encodeURIComponent(kidProfileId) : ""));
      const j = await r.json();
      if (j && j.configured && Array.isArray(j.songs)) { setSongs(j.songs); setCount(j.count || j.songs.length); }
    } catch {}
  }

  function buildChoices() { return { vibe, genre, singer, drums, guitar, strings, speed, prompt }; }

  async function makeSong() {
    setBusy(true); setStatus(""); setDraft(null);
    try {
      const r = await fetch("/api/generate-song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildChoices(), kidName: playerName || "" }) });
      const j = await r.json();
      if (j && j.ok) setDraft(j); else setStatus("Hmm, that didn't work. Try again!");
    } catch { setStatus("Hmm, that didn't work. Try again!"); }
    finally { setBusy(false); }
  }

  function doRender() { if (busy || locking) return; speak("Rendering your song!"); setLocking(true); setTimeout(() => { setLocking(false); makeSong(); }, 1450); }
  function startRender() {
    const ls = getLearningSettings();
    if (ls.enabled && justFinished) { setJustFinished(false); setGateNext(() => doRender); return; }
    doRender();
  }

  async function keepSong() {
    if (!draft) return;
    if (count >= MAX_SONGS) { setStatus("You have 10 songs! Delete one in My Songs to make room."); setTab("library"); return; }
    setStatus("Saving...");
    try {
      const r = await fetch("/api/save-song", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, kidProfileId, kidName: playerName || "", title: draft.title, audioUrl: draft.audioUrl, vibe: draft.vibe, theme: draft.theme, prompt: draft.prompt, coverColor: draft.coverColor, durationSec: draft.durationSec, provider: draft.provider, meta: draft.meta }) });
      const j = await r.json();
      if (r.ok && j.ok) { setStatus("Saved to My Songs!"); setDraft(null); setPrompt(""); setStep(0); setJustFinished(true); await refresh(); }
      else if (r.status === 409) { setStatus(j.message || "You already have 10 songs!"); setTab("library"); }
      else setStatus("Couldn't save — " + (j.detail || j.error || ("error " + r.status)));
    } catch (e) { setStatus("Couldn't save — " + ((e && e.message) || "network error")); }
  }

  async function renameSong(song) {
    const current = song.title || "";
    const next = window.prompt("Rename this song", current);
    if (next == null) return;
    const title = next.trim().slice(0, 120);
    if (!title || title === current) return;
    try {
      const res = await fetch("/api/rename-song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: getDeviceId(), kidProfileId: getKidProfileId(), songId: song.song_id, title }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Could not rename"); }
      refresh();
    } catch (err) { alert(err.message || "Could not rename song"); }
  }
  async function deleteSong(songId) {
    try { await fetch("/api/delete-song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, songId }) }); await refresh(); } catch {}
  }

  const vibeObj = VIBES.find((v) => v.id === vibe) || VIBES[0];
  const accent = vibeObj.color;

  const STEPS = [
    { key: "vibe",    q: "Pick a vibe",            cat: "vibe",    label: "Vibe",    options: VIBES,   value: vibe,    set: setVibe },
    { key: "genre",   q: "Pick a music style",     cat: "style",   label: "Style",   options: GENRES,  value: genre,   set: setGenre },
    { key: "singer",  q: "Who sings?",             cat: "singer",  label: "Singer",  options: SINGERS, value: singer,  set: setSinger },
    { key: "drums",   q: "Pick your drums",        cat: "drums",   label: "Drums",   options: DRUMS,   value: drums,   set: setDrums },
    { key: "guitar",  q: "Pick a guitar",          cat: "guitar",  label: "Guitar",  options: GUITARS, value: guitar,  set: setGuitar },
    { key: "strings", q: "Add some strings?",      cat: "strings", label: "Strings", options: STRINGS, value: strings, set: setStrings },
    { key: "speed",   q: "How fast should it go?", cat: "speed",   label: "Speed",   options: SPEEDS,  value: speed,   set: setSpeed },
  ];
  const TOTAL = STEPS.length;
  const atEnd = step >= TOTAL;
  const cur = STEPS[step];

  // Read each question aloud as it appears (for kids who can't read yet).
  useEffect(() => {
    if (tab !== "make" || busy || draft) return;
    if (atEnd) speak("Last one! What is your song about?");
    else if (cur) { speak(cur.q); cur.options.forEach((o) => preload(o.label)); }
  }, [step, tab, busy, draft]); // eslint-disable-line

  // Cycle the loader message while a song is generating.
  useEffect(() => {
    if (!busy) return; setMsgI(0);
    const t = setInterval(() => setMsgI((i) => (i + 1) % LOADER_MSGS.length), 1500);
    return () => clearInterval(t);
  }, [busy]);

  function selectOpt(st, o) { st.set(o.id); speak(o.label); }
  function next() { setStep((s) => Math.min(TOTAL, s + 1)); }
  function cycle(st, dir) {
    const i = st.options.findIndex((o) => o.id === st.value);
    const ni = ((i < 0 ? 0 : i) + dir + st.options.length) % st.options.length;
    st.set(st.options[ni].id);
  }
  function lockStyle(idx) {
    return locking ? { animation: "mmLock .5s cubic-bezier(.2,.9,.3,1.5) " + (idx * 0.12) + "s both, mmGlow 1s ease " + (idx * 0.12) + "s both", background: "#2e2c1c" } : null;
  }

  function Chip({ st, idx }) {
    const curOpt = st.options.find((o) => o.id === st.value) || st.options[0];
    return (
      <div style={{ ...S.chip, ...(lockStyle(idx) || {}) }}
        onTouchStart={(e) => { e.currentTarget._sy = e.touches[0].clientY; }}
        onTouchEnd={(e) => { const dy = e.changedTouches[0].clientY - (e.currentTarget._sy || 0); if (dy < -16) cycle(st, -1); else if (dy > 16) cycle(st, 1); }}>
        <button style={S.chev} onClick={() => cycle(st, -1)} aria-label={"Change " + st.label}>▲</button>
        <OptionIcon opt={curOpt} cat={st.cat} size={26} />
        <div style={S.chipLab}>{st.label}</div>
        <div style={S.chipVal}>{curOpt.label}</div>
        <button style={S.chev} onClick={() => cycle(st, 1)} aria-label={"Change " + st.label}>▼</button>
      </div>
    );
  }
  function SongSoFar() {
    const answered = STEPS.map((st, i) => ({ st, i })).filter((x) => x.i < step || atEnd);
    if (!answered.length) return null;
    return (
      <div style={S.sofarWrap}>
        <div style={S.sofarHead}>{locking ? "Locking it in…" : "Your song so far — tap ▲▼ (or swipe) to change anything"}</div>
        <div style={S.chipStrip}>{answered.map(({ st, i }) => <Chip key={st.key} st={st} idx={i} />)}</div>
      </div>
    );
  }

  // Learning gate: when a child starts a new song right after finishing one,
  // show one quick question first. Never hard-fails (QuizGate has Skip + passes
  // through on errors).
  if (gateNext) {
    const proceed = gateNext;
    return (
      <QuizGate
        age={6}
        goal={getLearningSettings().goal}
        gameType="song"
        title="One quick question first!"
        onPass={() => { setGateNext(null); proceed(); }}
      />
    );
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.navBtn} onClick={onHome || onBack}>← Home</button>
        <h1 style={S.title}>Music Maker</h1>
        <button style={S.voiceBtn} onClick={() => { const nv = !voiceOn; setVoiceOn(nv); if (!nv) stopVoice(); }} aria-label={voiceOn ? "Turn voice off" : "Turn voice on"} title={voiceOn ? "Voice on" : "Voice off"}>
          <Speaker on={voiceOn} />
        </button>
      </div>

      <div style={S.tabs}>
        <button style={tab === "make" ? S.tabActive : S.tab} onClick={() => setTab("make")}>Make a Song</button>
        <button style={tab === "library" ? S.tabActive : S.tab} onClick={() => setTab("library")}>My Songs ({count})</button>
      </div>

      {tab === "make" && (
        <div style={S.card}>
          {busy ? (
            <div style={S.loaderWrap}>
              <div style={S.eqRow}>{[0, 1, 2, 3, 4].map((i) => (<span key={i} style={{ ...S.eqBar, background: accent, animationDelay: (i * 0.12) + "s" }} />))}</div>
              <div style={S.loaderMsg}>{LOADER_MSGS[msgI]}</div>
            </div>
          ) : draft ? (
            <div style={{ ...S.draft, borderColor: draft.coverColor }}>
              <div style={S.draftTitle}>{draft.title}</div>
              {draft.meta && draft.meta.recipe && <div style={S.recipe}>{draft.meta.recipe}</div>}
              <audio ref={audioRef} controls src={draft.audioUrl} style={S.audio} autoPlay />
              <div style={S.draftBtns}>
                <button style={{ ...S.keepBtn, background: draft.coverColor }} onClick={keepSong}>Keep it!</button>
                <button style={S.againBtn} onClick={makeSong}>Try again</button>
              </div>
              <button style={S.tweakBtn} onClick={() => { setDraft(null); setStep(TOTAL); }}>← Tweak my choices</button>
              {status && <div style={S.status}>{status}</div>}
            </div>
          ) : (
            <div>
              <div style={S.dots}>
                {STEPS.map((_, i) => (<span key={i} style={{ ...S.dot, ...(i === step ? S.dotOn : i < step ? S.dotDone : {}) }} />))}
                <span style={{ ...S.dot, ...(atEnd ? S.dotOn : {}) }} />
              </div>

              {!atEnd ? (
                <>
                  <div style={S.qHead}>{cur.q}</div>
                  <div style={S.tilesGrid}>
                    {cur.options.map((o) => {
                      const active = cur.value === o.id;
                      return (
                        <button key={o.id} onClick={() => selectOpt(cur, o)}
                          style={{ ...S.bigTile, borderColor: active ? accent : "transparent", background: active ? "#2c2c48" : "#23243a", boxShadow: active ? "0 0 0 2px " + accent + "55" : "none" }}>
                          <OptionIcon opt={o} cat={cur.cat} size={60} />
                          <span style={S.bigTileLabel}>{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={S.wizNav}>
                    {step > 0 ? <button style={S.backBtn} onClick={() => setStep(step - 1)}>← Back</button> : <span />}
                    <button style={{ ...S.nextBtn, background: accent }} onClick={next}>Next →</button>
                  </div>
                  <div style={S.skipRow}><button style={S.skipBtn} onClick={() => setStep(TOTAL)}>Skip to the end</button></div>
                </>
              ) : (
                <>
                  <div style={S.qHead}>One last thing…</div>
                  <div style={S.subHead}>What's your song about? (optional)</div>
                  <input style={S.input} placeholder="a dragon who loves tacos..." value={prompt} maxLength={120} onChange={(e) => setPrompt(e.target.value)} />
                  <button style={{ ...S.renderBtn, background: accent, opacity: locking ? 0.85 : 1 }} onClick={startRender} disabled={locking}>
                    {locking ? "Locking it in…" : "Render my song!"}
                  </button>
                  <div style={S.skipRow}><button style={S.backBtn} onClick={() => setStep(TOTAL - 1)}>← Back</button></div>
                </>
              )}

              <SongSoFar />
              {status && <div style={S.status}>{status}</div>}
            </div>
          )}
        </div>
      )}

      {tab === "library" && (
        <div style={S.card}>
          {songs.length === 0 && <div style={S.empty}>No songs yet! Make your first one.</div>}
          <div style={S.songGrid}>
            {songs.map((s) => (
              <div key={s.song_id} style={{ ...S.songCard, borderColor: s.cover_color || "#5B6CFF" }}>
                <CoverThumb vibe={s.vibe} theme={s.theme} color={s.cover_color} size={48} radius={8} />
                <div style={S.songInfo}>
                  <div style={S.songTitle}>{s.title}</div>
                  <div style={S.songMeta}>{(s.vibe || "song")}{s.theme ? " · " + s.theme : ""}</div>
                  <audio controls src={s.audio_url} style={S.audioSmall} />
                </div>
                <button style={S.shareBtn} onClick={() => shareCreation({ kind: "song", id: s.song_id, title: s.title })} title="Share">↗</button>
                <button style={S.renameBtn} onClick={() => renameSong(s)} title="Rename">Aa</button>
                <button style={S.deleteBtn} onClick={() => deleteSong(s.song_id)} title="Delete">✕</button>
              </div>
            ))}
          </div>
          {count >= MAX_SONGS && <div style={S.fullNote}>Your song box is full! Delete one to make a new tune.</div>}
        </div>
      )}
    </div>
  );
}

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "16px 16px 60px", color: "#fff", fontFamily: "inherit" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  navBtn: { background: "#2a2a3a", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  title: { fontSize: 24, margin: 0 },
  voiceBtn: { background: "#2a2a3a", border: "none", borderRadius: 10, width: 40, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { flex: 1, background: "#2a2a3a", color: "#bbb", border: "none", borderRadius: 10, padding: "10px", cursor: "pointer", fontWeight: 600 },
  tabActive: { flex: 1, background: "#5B6CFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px", cursor: "pointer", fontWeight: 700 },
  card: { background: "#1c1c2a", borderRadius: 16, padding: 20 },
  dots: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "#3a3a4f", transition: "all .15s" },
  dotOn: { background: "#FFD93D", width: 20, borderRadius: 99 },
  dotDone: { background: "#5B6CFF" },
  qHead: { fontSize: 21, fontWeight: 800, textAlign: "center", margin: "2px 0 16px" },
  subHead: { fontSize: 14, color: "#b9b9d0", textAlign: "center", marginBottom: 10, fontWeight: 600 },
  tilesGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  bigTile: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 108, border: "2px solid transparent", borderRadius: 16, padding: "14px 6px", cursor: "pointer", color: "#fff", fontWeight: 700, transition: "transform .1s, border-color .1s, background .1s" },
  bigTileLabel: { fontSize: 13, fontWeight: 700, textAlign: "center" },
  wizNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12 },
  backBtn: { background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15, padding: "10px 6px" },
  nextBtn: { color: "#1a1a2a", border: "none", borderRadius: 14, padding: "12px 30px", cursor: "pointer", fontWeight: 900, fontSize: 16 },
  skipRow: { textAlign: "center", marginTop: 6 },
  skipBtn: { background: "transparent", color: "#6f6f93", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "6px" },
  renderBtn: { width: "100%", marginTop: 16, padding: "16px", fontSize: 19, fontWeight: 900, color: "#1a1a2a", border: "none", borderRadius: 16, cursor: "pointer" },
  sofarWrap: { marginTop: 20, borderTop: "1px solid #2a2a3f", paddingTop: 14 },
  sofarHead: { fontSize: 12, color: "#9a9ac0", textAlign: "center", marginBottom: 10, fontWeight: 600 },
  chipStrip: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 },
  chip: { flex: "0 0 auto", width: 80, background: "#23243a", borderRadius: 14, padding: "4px 4px 8px", textAlign: "center" },
  chev: { width: "100%", border: "none", background: "transparent", color: "#bdb6ff", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "3px 0", animation: "mmHintBob 2.4s ease-in-out infinite" },
  chipLab: { fontSize: 9, color: "#8e8eb5", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 },
  chipVal: { fontSize: 11, fontWeight: 800, minHeight: 14 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "2px solid #3a3a4a", background: "#11111a", color: "#fff", outline: "none" },
  loaderWrap: { textAlign: "center", padding: "34px 0" },
  eqRow: { display: "flex", gap: 6, justifyContent: "center", alignItems: "flex-end", height: 46, marginBottom: 14 },
  eqBar: { width: 9, height: 46, borderRadius: 5, transformOrigin: "bottom", animation: "mmEq .9s ease-in-out infinite" },
  loaderMsg: { fontSize: 16, fontWeight: 700, color: "#e7e7f5" },
  draft: { padding: 16, borderRadius: 14, border: "2px solid", background: "#11111a" },
  draftTitle: { fontSize: 18, fontWeight: 800, marginBottom: 6 },
  recipe: { fontSize: 13, color: "#b9b9d0", marginBottom: 10, fontWeight: 600 },
  audio: { width: "100%" },
  draftBtns: { display: "flex", gap: 10, marginTop: 12 },
  keepBtn: { flex: 1, padding: "12px", fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 12, cursor: "pointer" },
  againBtn: { flex: 1, padding: "12px", fontWeight: 700, color: "#fff", background: "#2a2a3a", border: "none", borderRadius: 12, cursor: "pointer" },
  tweakBtn: { display: "block", margin: "12px auto 0", background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14 },
  status: { marginTop: 14, textAlign: "center", color: "#FFD93D", fontWeight: 700 },
  empty: { textAlign: "center", color: "#bbb", padding: "30px 0", fontSize: 16 },
  songGrid: { display: "flex", flexDirection: "column", gap: 12 },
  songCard: { display: "flex", alignItems: "center", gap: 12, background: "#11111a", border: "2px solid", borderRadius: 14, padding: 12 },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  songMeta: { fontSize: 12, color: "#aaa", marginBottom: 6, textTransform: "capitalize" },
  audioSmall: { width: "100%", height: 32 },
  shareBtn: { background: "rgba(124,108,255,0.25)", color: "#cfc8ff", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0, fontSize: 16 },
  renameBtn: { background: "#2a2a3a", color: "#e7e7f5", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0, fontSize: 13 },
  deleteBtn: { background: "#2a2a3a", color: "#ff8080", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  fullNote: { marginTop: 14, textAlign: "center", color: "#FF8FB1", fontWeight: 700 },
};
