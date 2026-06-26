// /src/MusicMaker.jsx
// Kid-facing "Music Maker" — create, listen to, and keep up to 10 AI songs.
// "Make a Song" is a QUIZ WIZARD: one big illustrated question per screen, with an
// always-visible "song so far" strip whose chips can be cycled at any time (tap the
// up/down chevrons, or swipe up/down on a phone) — so a kid can change any earlier
// choice without going back. Hitting Render plays a slot-machine "lock + glow" on
// the chips, then generates the song.
//
// Backend endpoints used:
//   POST /api/generate-song  POST /api/save-song  GET /api/list-songs  POST /api/delete-song

import { useState, useEffect, useRef } from "react";
import { shareCreation } from "./lib/shareSheet";
import CoverThumb from "./lib/CoverThumb";
import IconImg from "./lib/IconImg";

const MAX_SONGS = 10;

const VIBES = [
  { id: "happy",  label: "Happy",  emoji: "😀", color: "#FFD93D" },
  { id: "epic",   label: "Epic",   emoji: "🐉", color: "#5B6CFF" },
  { id: "spooky", label: "Spooky", emoji: "👻", color: "#8E44AD" },
  { id: "silly",  label: "Silly",  emoji: "🤣", color: "#FF8FB1" },
  { id: "chill",  label: "Chill",  emoji: "😎", color: "#4FD1C5" },
  { id: "dance",  label: "Dance",  emoji: "🕺", color: "#FF6B6B" },
];
const GENRES = [
  { id: "",        label: "Surprise", emoji: "🎲" },
  { id: "pop",     label: "Pop",      emoji: "🎤" },
  { id: "country", label: "Country",  emoji: "🤠" },
  { id: "hiphop",  label: "Hip Hop",  emoji: "🧢" },
  { id: "rock",    label: "Rock",     emoji: "🎸" },
  { id: "disco",   label: "Disco",    emoji: "🪩" },
  { id: "sleepy",  label: "Sleepy Time", emoji: "🌙" },
  { id: "marching",label: "Marching", emoji: "🥁" },
  { id: "reggae",  label: "Reggae",   emoji: "🌴" },
];
const SINGERS = [
  { id: "none",  label: "No Singer", emoji: "🎻" },
  { id: "boy",   label: "Boy",       emoji: "👦" },
  { id: "girl",  label: "Girl",      emoji: "👧" },
  { id: "group", label: "Group",     emoji: "👨‍👩‍👧‍👦" },
  { id: "both",  label: "Both",      emoji: "🧑‍🤝‍🧑" },
];
const DRUMS = [
  { id: "",        label: "Auto",     emoji: "🎚️" },
  { id: "big",     label: "Big Drums",emoji: "🥁" },
  { id: "soft",    label: "Soft Beat",emoji: "🫧" },
  { id: "marching",label: "Marching", emoji: "🪘" },
  { id: "bongos",  label: "Bongos",   emoji: "🪇" },
];
const GUITARS = [
  { id: "",        label: "Auto",     emoji: "🎚️" },
  { id: "electric",label: "Electric", emoji: "🎸" },
  { id: "acoustic",label: "Acoustic", emoji: "🪕" },
  { id: "twangy",  label: "Twangy",   emoji: "🤠" },
  { id: "none",    label: "No Guitar",emoji: "🚫" },
];
const STRINGS = [
  { id: "",       label: "Auto",      emoji: "🎚️" },
  { id: "violin", label: "Violin",    emoji: "🎻" },
  { id: "cello",  label: "Big Cello", emoji: "🎼" },
  { id: "harp",   label: "Harp",      emoji: "🪬" },
  { id: "none",   label: "No Strings",emoji: "🚫" },
];
const SPEEDS = [
  { id: "",       label: "Auto",   emoji: "🎚️" },
  { id: "slow",   label: "Slow",   emoji: "🐢" },
  { id: "medium", label: "Medium", emoji: "🚶" },
  { id: "fast",   label: "Fast",   emoji: "🐇" },
];

function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}
function getKidProfileId() {
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; }
}

let kfInjected = false;
function injectKeyframes() {
  if (kfInjected || typeof document === "undefined") return;
  kfInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-mm-jackpot", "");
  el.textContent =
    "@keyframes mmLock{0%{transform:translateY(-8px) scale(1.07)}55%{transform:translateY(3px) scale(.96)}100%{transform:translateY(0) scale(1)}}" +
    "@keyframes mmGlow{0%{box-shadow:0 0 0 0 rgba(255,217,61,0)}40%{box-shadow:0 0 0 3px rgba(255,217,61,.95),0 0 22px rgba(255,217,61,.8)}100%{box-shadow:0 0 0 2px rgba(255,217,61,.6)}}" +
    "@keyframes mmHintBob{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}";
  document.head.appendChild(el);
}

export default function MusicMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [vibe, setVibe] = useState("happy");
  const [genre, setGenre] = useState("");
  const [singer, setSinger] = useState("none");
  const [drums, setDrums] = useState("");
  const [guitar, setGuitar] = useState("");
  const [strings, setStrings] = useState("");
  const [speed, setSpeed] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [songs, setSongs] = useState([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("make");
  const [step, setStep] = useState(0);
  const [locking, setLocking] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => { injectKeyframes(); refresh(); }, []);

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

  function doRender() {
    if (busy || locking) return;
    setLocking(true);
    setTimeout(() => { setLocking(false); makeSong(); }, 1450);
  }

  async function keepSong() {
    if (!draft) return;
    if (count >= MAX_SONGS) { setStatus("You have 10 songs! Delete one in My Songs to make room."); setTab("library"); return; }
    setStatus("Saving...");
    try {
      const r = await fetch("/api/save-song", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, kidProfileId, kidName: playerName || "", title: draft.title, audioUrl: draft.audioUrl, vibe: draft.vibe, theme: draft.theme, prompt: draft.prompt, coverColor: draft.coverColor, durationSec: draft.durationSec, provider: draft.provider, meta: draft.meta }) });
      const j = await r.json();
      if (r.ok && j.ok) { setStatus("Saved to My Songs! 🎉"); setDraft(null); setPrompt(""); setStep(0); await refresh(); }
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
    { key: "vibe",    label: "Vibe",    q: "Pick a vibe",            cat: "vibe",    options: VIBES,   value: vibe,    set: setVibe },
    { key: "genre",   label: "Style",   q: "Pick a music style",     cat: "style",   options: GENRES,  value: genre,   set: setGenre },
    { key: "singer",  label: "Singer",  q: "Who sings?",             cat: "singer",  options: SINGERS, value: singer,  set: setSinger },
    { key: "drums",   label: "Drums",   q: "Pick your drums",        cat: "drums",   options: DRUMS,   value: drums,   set: setDrums },
    { key: "guitar",  label: "Guitar",  q: "Pick a guitar",          cat: "guitar",  options: GUITARS, value: guitar,  set: setGuitar },
    { key: "strings", label: "Strings", q: "Add some strings?",      cat: "strings", options: STRINGS, value: strings, set: setStrings },
    { key: "speed",   label: "Speed",   q: "How fast should it go?", cat: "",        options: SPEEDS,  value: speed,   set: setSpeed },
  ];
  const TOTAL = STEPS.length;
  const atEnd = step >= TOTAL;

  function pick(st, id) { st.set(id); setTimeout(() => setStep((s) => Math.min(TOTAL, s + 1)), 240); }
  function cycle(st, dir) {
    const i = st.options.findIndex((o) => o.id === st.value);
    const ni = ((i < 0 ? 0 : i) + dir + st.options.length) % st.options.length;
    st.set(st.options[ni].id);
  }
  function lockStyle(idx) {
    return locking
      ? { animation: "mmLock .5s cubic-bezier(.2,.9,.3,1.5) " + (idx * 0.12) + "s both, mmGlow 1s ease " + (idx * 0.12) + "s both", background: "#2e2c1c" }
      : null;
  }

  function Chip({ st, idx }) {
    const curOpt = st.options.find((o) => o.id === st.value) || st.options[0];
    return (
      <div style={{ ...S.chip, ...(lockStyle(idx) || {}) }}
        onTouchStart={(e) => { e.currentTarget._sy = e.touches[0].clientY; }}
        onTouchEnd={(e) => { const dy = e.changedTouches[0].clientY - (e.currentTarget._sy || 0); if (dy < -16) cycle(st, -1); else if (dy > 16) cycle(st, 1); }}>
        <button style={S.chev} onClick={() => cycle(st, -1)} aria-label={"Change " + st.label}>▲</button>
        <IconImg cat={st.cat} id={curOpt.id} emoji={curOpt.emoji} size={28} />
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
        <div style={S.sofarHead}>{locking ? "🎰 Locking it in…" : "Your song so far — tap ▲▼ (or swipe) to change anything"}</div>
        <div style={S.chipStrip}>{answered.map(({ st, i }) => <Chip key={st.key} st={st} idx={i} />)}</div>
      </div>
    );
  }

  const cur = STEPS[step];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.navBtn} onClick={onHome || onBack}>← Home</button>
        <h1 style={S.title}>🎵 Music Maker</h1>
        <div style={S.counter}>{count}/{MAX_SONGS} songs</div>
      </div>

      <div style={S.tabs}>
        <button style={tab === "make" ? S.tabActive : S.tab} onClick={() => setTab("make")}>Make a Song</button>
        <button style={tab === "library" ? S.tabActive : S.tab} onClick={() => setTab("library")}>My Songs ({count})</button>
      </div>

      {tab === "make" && (
        <div style={S.card}>
          {busy ? (
            <div style={S.loading}>🎵 🎶 🎵 cooking up a tune...</div>
          ) : draft ? (
            <div style={{ ...S.draft, borderColor: draft.coverColor }}>
              <div style={S.draftTitle}>{draft.title}</div>
              {draft.meta && draft.meta.recipe && <div style={S.recipe}>{draft.meta.recipe}</div>}
              <audio ref={audioRef} controls src={draft.audioUrl} style={S.audio} autoPlay />
              <div style={S.draftBtns}>
                <button style={{ ...S.keepBtn, background: draft.coverColor }} onClick={keepSong}>💖 Keep it!</button>
                <button style={S.againBtn} onClick={makeSong}>🔄 Try again</button>
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
                        <button key={o.id || "auto"} onClick={() => pick(cur, o.id)}
                          style={{ ...S.bigTile, borderColor: active ? accent : "transparent", background: active ? "#2c2c48" : "#23243a", boxShadow: active ? "0 0 0 2px " + accent + "55" : "none" }}>
                          <IconImg cat={cur.cat} id={o.id} emoji={o.emoji} size={60} />
                          <span style={S.bigTileLabel}>{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={S.wizNav}>
                    {step > 0 ? <button style={S.backBtn} onClick={() => setStep(step - 1)}>← Back</button> : <span />}
                    <button style={S.skipBtn} onClick={() => setStep(TOTAL)}>Skip to the end →</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={S.qHead}>One last thing… ✍️</div>
                  <div style={S.subHead}>What's your song about? (optional)</div>
                  <input style={S.input} placeholder="a dragon who loves tacos..." value={prompt} maxLength={120} onChange={(e) => setPrompt(e.target.value)} />
                  <button style={{ ...S.renderBtn, background: accent, opacity: locking ? 0.85 : 1 }} onClick={doRender} disabled={locking}>
                    {locking ? "🎰 Locking it in…" : "🎰 Render my song!"}
                  </button>
                  <button style={S.backBtn} onClick={() => setStep(TOTAL - 1)}>← Back</button>
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
          {songs.length === 0 && <div style={S.empty}>No songs yet! Make your first one. 🎵</div>}
          <div style={S.songGrid}>
            {songs.map((s) => (
              <div key={s.song_id} style={{ ...S.songCard, borderColor: s.cover_color || "#5B6CFF" }}>
                <CoverThumb vibe={s.vibe} theme={s.theme} color={s.cover_color} size={48} radius={8} />
                <div style={S.songInfo}>
                  <div style={S.songTitle}>{s.title}</div>
                  <div style={S.songMeta}>{(s.vibe || "song")}{s.theme ? " · " + s.theme : ""}</div>
                  <audio controls src={s.audio_url} style={S.audioSmall} />
                </div>
                <button style={S.shareBtn} onClick={() => shareCreation({ kind: "song", id: s.song_id, title: s.title })} title="Share">🔗</button>
                <button style={S.renameBtn} onClick={() => renameSong(s)} title="Rename">✏️</button>
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
  counter: { fontSize: 13, color: "#bbb", background: "#2a2a3a", padding: "6px 12px", borderRadius: 999 },
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
  wizNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  backBtn: { background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, padding: "8px 2px", marginTop: 8 },
  skipBtn: { background: "transparent", color: "#6f6f93", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 2px" },
  renderBtn: { width: "100%", marginTop: 16, padding: "16px", fontSize: 19, fontWeight: 900, color: "#1a1a2a", border: "none", borderRadius: 16, cursor: "pointer" },
  sofarWrap: { marginTop: 20, borderTop: "1px solid #2a2a3f", paddingTop: 14 },
  sofarHead: { fontSize: 12, color: "#9a9ac0", textAlign: "center", marginBottom: 10, fontWeight: 600 },
  chipStrip: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 },
  chip: { flex: "0 0 auto", width: 80, background: "#23243a", borderRadius: 14, padding: "4px 4px 8px", textAlign: "center" },
  chev: { width: "100%", border: "none", background: "transparent", color: "#bdb6ff", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "3px 0", animation: "mmHintBob 2.4s ease-in-out infinite" },
  chipLab: { fontSize: 9, color: "#8e8eb5", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 },
  chipVal: { fontSize: 11, fontWeight: 800, minHeight: 14 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "2px solid #3a3a4a", background: "#11111a", color: "#fff", outline: "none" },
  loading: { textAlign: "center", padding: "30px 0", fontSize: 18, letterSpacing: 2 },
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
  shareBtn: { background: "rgba(124,108,255,0.25)", color: "#cfc8ff", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  renameBtn: { background: "#2a2a3a", color: "#e7e7f5", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  deleteBtn: { background: "#2a2a3a", color: "#ff8080", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  fullNote: { marginTop: 14, textAlign: "center", color: "#FF8FB1", fontWeight: 700 },
};
