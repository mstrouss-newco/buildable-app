// /src/MusicMaker.jsx
// Kid-facing "Music Maker" — create, listen to, and keep up to 10 AI songs.
// Songs are tied to the kid/parent profile (deviceId) so they persist and can be
// reused in games. Self-contained UI with inline styles (no extra CSS import).
//
// Backend endpoints used:
//   POST /api/generate-song   -> { title, audioUrl, coverColor, vibe, theme, ... }
//   POST /api/save-song       -> saves to the profile (enforces 10-song cap)
//   GET  /api/list-songs       -> the kid's saved songs
//   POST /api/delete-song     -> remove one song to make room

import { useState, useEffect, useRef } from "react";

const MAX_SONGS = 10;

const VIBES = [
  { id: "happy",  label: "Happy",  emoji: "😀", color: "#FFD93D" },
  { id: "epic",   label: "Epic",   emoji: "🐉", color: "#5B6CFF" },
  { id: "spooky", label: "Spooky", emoji: "👻", color: "#8E44AD" },
  { id: "silly",  label: "Silly",  emoji: "🤣", color: "#FF8FB1" },
  { id: "chill",  label: "Chill",  emoji: "😎", color: "#4FD1C5" },
  { id: "dance",  label: "Dance",  emoji: "🕺", color: "#FF6B6B" },
];

const THEMES = [
  { id: "", label: "Surprise me" },
  { id: "space", label: "Space" },
  { id: "underwater", label: "Underwater" },
  { id: "castle", label: "Castle" },
  { id: "candy", label: "Candy" },
  { id: "forest", label: "Forest" },
  { id: "desert", label: "Desert" },
  { id: "volcano", label: "Volcano" },
];

function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("deviceId", id);
    }
    return id;
  } catch {
    return "dev_anon";
  }
}

export default function MusicMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const [vibe, setVibe] = useState("happy");
  const [theme, setTheme] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);     // freshly generated, not yet kept
  const [songs, setSongs] = useState([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("make");        // 'make' | 'library'
  const audioRef = useRef(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId));
      const j = await r.json();
      if (j && j.configured && Array.isArray(j.songs)) {
        setSongs(j.songs);
        setCount(j.count || j.songs.length);
      }
    } catch {}
  }

  async function makeSong() {
    setBusy(true);
    setStatus("");
    setDraft(null);
    try {
      const r = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe, theme, prompt, kidName: playerName || "" }),
      });
      const j = await r.json();
      if (j && j.ok) {
        setDraft(j);
      } else {
        setStatus("Hmm, that didn't work. Try again!");
      }
    } catch {
      setStatus("Hmm, that didn't work. Try again!");
    } finally {
      setBusy(false);
    }
  }

  async function keepSong() {
    if (!draft) return;
    if (count >= MAX_SONGS) {
      setStatus("You have 10 songs! Delete one in My Songs to make room.");
      setTab("library");
      return;
    }
    setStatus("Saving...");
    try {
      const r = await fetch("/api/save-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          kidName: playerName || "",
          title: draft.title,
          audioUrl: draft.audioUrl,
          vibe: draft.vibe,
          theme: draft.theme,
          prompt: draft.prompt,
          coverColor: draft.coverColor,
          durationSec: draft.durationSec,
          provider: draft.provider,
          meta: draft.meta,
        }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setStatus("Saved to My Songs! 🎉");
        setDraft(null);
        setPrompt("");
        await refresh();
      } else if (r.status === 409) {
        setStatus(j.message || "You already have 10 songs!");
        setTab("library");
      } else {
        setStatus("Couldn't save — try again.");
      }
    } catch {
      setStatus("Couldn't save — try again.");
    }
  }

  async function deleteSong(songId) {
    try {
      await fetch("/api/delete-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, songId }),
      });
      await refresh();
    } catch {}
  }

  const vibeObj = VIBES.find((v) => v.id === vibe) || VIBES[0];

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
          <div style={S.label}>Pick a vibe</div>
          <div style={S.vibeGrid}>
            {VIBES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVibe(v.id)}
                style={{
                  ...S.vibeBtn,
                  background: vibe === v.id ? v.color : "#2a2a3a",
                  color: vibe === v.id ? "#1a1a2a" : "#fff",
                  transform: vibe === v.id ? "scale(1.05)" : "scale(1)",
                }}
              >
                <span style={{ fontSize: 28 }}>{v.emoji}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>

          <div style={S.label}>Pick a world (optional)</div>
          <div style={S.themeRow}>
            {THEMES.map((t) => (
              <button
                key={t.id || "surprise"}
                onClick={() => setTheme(t.id)}
                style={theme === t.id ? S.themeChipActive : S.themeChip}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={S.label}>What's your song about?</div>
          <input
            style={S.input}
            placeholder="a dragon who loves tacos..."
            value={prompt}
            maxLength={120}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <button
            style={{ ...S.bigBtn, background: vibeObj.color, opacity: busy ? 0.7 : 1 }}
            onClick={makeSong}
            disabled={busy}
          >
            {busy ? "Making your song..." : "🎶 Make my song!"}
          </button>

          {busy && <div style={S.loading}>🎵 🎶 🎵 cooking up a tune...</div>}

          {draft && !busy && (
            <div style={{ ...S.draft, borderColor: draft.coverColor }}>
              <div style={S.draftTitle}>{draft.title}</div>
              <audio ref={audioRef} controls src={draft.audioUrl} style={S.audio} autoPlay />
              <div style={S.draftBtns}>
                <button style={{ ...S.keepBtn, background: draft.coverColor }} onClick={keepSong}>
                  💖 Keep it!
                </button>
                <button style={S.againBtn} onClick={makeSong}>🔄 Try again</button>
              </div>
            </div>
          )}

          {status && <div style={S.status}>{status}</div>}
        </div>
      )}

      {tab === "library" && (
        <div style={S.card}>
          {songs.length === 0 && (
            <div style={S.empty}>No songs yet! Make your first one. 🎵</div>
          )}
          <div style={S.songGrid}>
            {songs.map((s) => (
              <div key={s.song_id} style={{ ...S.songCard, borderColor: s.cover_color || "#5B6CFF" }}>
                <div style={{ ...S.songSwatch, background: s.cover_color || "#5B6CFF" }} />
                <div style={S.songInfo}>
                  <div style={S.songTitle}>{s.title}</div>
                  <div style={S.songMeta}>
                    {(s.vibe || "song")}{s.theme ? " · " + s.theme : ""}
                  </div>
                  <audio controls src={s.audio_url} style={S.audioSmall} />
                </div>
                <button style={S.deleteBtn} onClick={() => deleteSong(s.song_id)} title="Delete">✕</button>
              </div>
            ))}
          </div>
          {count >= MAX_SONGS && (
            <div style={S.fullNote}>Your song box is full! Delete one to make a new tune.</div>
          )}
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
  label: { fontSize: 15, fontWeight: 700, margin: "16px 0 10px" },
  vibeGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  vibeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: "none", borderRadius: 14, padding: "14px 6px", cursor: "pointer", fontWeight: 700, transition: "all .12s" },
  themeRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  themeChip: { background: "#2a2a3a", color: "#ddd", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  themeChipActive: { background: "#fff", color: "#1a1a2a", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "2px solid #3a3a4a", background: "#11111a", color: "#fff", outline: "none" },
  bigBtn: { width: "100%", marginTop: 18, padding: "16px", fontSize: 18, fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 14, cursor: "pointer" },
  loading: { textAlign: "center", marginTop: 16, fontSize: 18, letterSpacing: 2 },
  draft: { marginTop: 18, padding: 16, borderRadius: 14, border: "2px solid", background: "#11111a" },
  draftTitle: { fontSize: 18, fontWeight: 800, marginBottom: 10 },
  audio: { width: "100%" },
  draftBtns: { display: "flex", gap: 10, marginTop: 12 },
  keepBtn: { flex: 1, padding: "12px", fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 12, cursor: "pointer" },
  againBtn: { flex: 1, padding: "12px", fontWeight: 700, color: "#fff", background: "#2a2a3a", border: "none", borderRadius: 12, cursor: "pointer" },
  status: { marginTop: 14, textAlign: "center", color: "#FFD93D", fontWeight: 700 },
  empty: { textAlign: "center", color: "#bbb", padding: "30px 0", fontSize: 16 },
  songGrid: { display: "flex", flexDirection: "column", gap: 12 },
  songCard: { display: "flex", alignItems: "center", gap: 12, background: "#11111a", border: "2px solid", borderRadius: 14, padding: 12, position: "relative" },
  songSwatch: { width: 44, height: 44, borderRadius: 10, flexShrink: 0 },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontWeight: 800, fontSize: 16 },
  songMeta: { fontSize: 12, color: "#aaa", textTransform: "capitalize", marginBottom: 6 },
  audioSmall: { width: "100%", height: 32 },
  deleteBtn: { background: "transparent", color: "#ff6b6b", border: "none", fontSize: 18, cursor: "pointer", padding: 4 },
  fullNote: { marginTop: 14, textAlign: "center", color: "#FF8FB1", fontWeight: 700 },
};
