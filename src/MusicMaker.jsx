// /src/MusicMaker.jsx
// Kid-facing "Music Maker" — create, listen to, and keep up to 10 AI songs.
// Songs are tied to the kid/parent profile (deviceId) so they persist and can be
// reused in games. Self-contained UI with inline styles (no extra CSS import).
//
// Backend endpoints used:
//   POST /api/generate-song   -> { title, audioUrl, coverColor, vibe, theme, ... }
//   POST /api/save-song       -> saves to the profile (enforces 10-song cap)
//   GET  /api/list-songs      -> the kid's saved songs
//   POST /api/delete-song     -> remove one song to make room
//
// The "Make a Song" tab is fully visual and tap-driven: kids pick a vibe, a
// genre, who sings, and the instruments (drums / guitar / strings). Every picker
// is config-driven (the arrays below) so adding a new option is a one-line edit.

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

// Music styles kids know. "surprise" lets the song pick its own.
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

// Who sings the song.
const SINGERS = [
  { id: "none",  label: "No Singer", emoji: "🎻" },
  { id: "boy",   label: "Boy",       emoji: "👦" },
  { id: "girl",  label: "Girl",      emoji: "👧" },
  { id: "group", label: "Group",     emoji: "👨‍👩‍👧‍👦" },
  { id: "both",  label: "Both",      emoji: "🧑‍🤝‍🧑" },
];

// Instrument pickers. Each has an "Auto" (let the song decide) option first.
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

// How fast the song feels.
const SPEEDS = [
  { id: "",       label: "Auto",   emoji: "🎚️" },
  { id: "slow",   label: "Slow",   emoji: "🐢" },
  { id: "medium", label: "Medium", emoji: "🚶" },
  { id: "fast",   label: "Fast",   emoji: "🐇" },
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

// The active kid profile (set in the Grown-ups area) makes a child's songs
// follow them across devices. Null when no grown-up/kid is signed in -- then
// saves use the device lane exactly as before.
function getKidProfileId() {
  try {
    const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null");
    return k && k.id ? k.id : null;
  } catch {
    return null;
  }
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
      const r = await fetch("/api/list-songs?deviceId=" + encodeURIComponent(deviceId) + (kidProfileId ? "&kidProfileId=" + encodeURIComponent(kidProfileId) : ""));
      const j = await r.json();
      if (j && j.configured && Array.isArray(j.songs)) {
        setSongs(j.songs);
        setCount(j.count || j.songs.length);
      }
    } catch {}
  }

  // Everything the kid picked, bundled for the API + for saving.
  function buildChoices() {
    return { vibe, genre, singer, drums, guitar, strings, speed, theme, prompt };
  }

  async function makeSong() {
    setBusy(true);
    setStatus("");
    setDraft(null);
    try {
      const r = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildChoices(), kidName: playerName || "" }),
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
          kidProfileId,
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
        setStatus("Couldn't save — " + (j.detail || j.error || ("error " + r.status)));
      }
    } catch (e) {
      setStatus("Couldn't save — " + ((e && e.message) || "network error"));
    }
  }

  async function renameSong(song) {
    const current = song.title || "";
    const next = window.prompt("Rename this song", current);
    if (next == null) return;
    const title = next.trim().slice(0, 120);
    if (!title || title === current) return;
    try {
      const res = await fetch("/api/rename-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: getDeviceId(),
          kidProfileId: getKidProfileId(),
          songId: song.song_id,
          title,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Could not rename");
      }
      refresh();
    } catch (err) {
      alert(err.message || "Could not rename song");
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

  // Small helper: a row of tappable emoji tiles for a single choice.
  const TileRow = ({ options, value, onPick, accent, cat }) => (
    <div style={S.tileRow}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id || "auto"}
            onClick={() => onPick(o.id)}
            style={{
              ...S.tile,
              borderColor: active ? (accent || "#5B6CFF") : "transparent",
              background: active ? "#262640" : "#20202e",
              boxShadow: active ? `0 0 0 2px ${accent || "#5B6CFF"}55` : "none",
            }}
          >
            <IconImg cat={cat} id={o.id} emoji={o.emoji} size={28} />
            <span style={S.tileLabel}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );

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
          {/* VIBE */}
          <div style={S.label}>🎨 Pick a vibe</div>
          <div style={S.vibeGrid}>
            {VIBES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVibe(v.id)}
                style={{
                  ...S.vibeBtn,
                  background: vibe === v.id ? v.color : "#2a2a3a",
                  color: vibe === v.id ? "#1a1a2a" : "#fff",
                }}
              >
                <IconImg cat="vibe" id={v.id} emoji={v.emoji} size={28} />
                <span>{v.label}</span>
              </button>
            ))}
          </div>

          {/* GENRE */}
          <div style={S.label}>🎶 Pick a music style</div>
          <TileRow options={GENRES} value={genre} onPick={setGenre} accent={vibeObj.color} cat="style" />

          {/* SINGER */}
          <div style={S.label}>🎤 Who sings?</div>
          <TileRow options={SINGERS} value={singer} onPick={setSinger} accent={vibeObj.color} cat="singer" />

          {/* INSTRUMENTS */}
          <div style={S.label}>🥁 Drums</div>
          <TileRow options={DRUMS} value={drums} onPick={setDrums} accent={vibeObj.color} cat="drums" />

          <div style={S.label}>🎸 Guitar</div>
          <TileRow options={GUITARS} value={guitar} onPick={setGuitar} accent={vibeObj.color} cat="guitar" />

          <div style={S.label}>🎻 Strings</div>
          <TileRow options={STRINGS} value={strings} onPick={setStrings} accent={vibeObj.color} cat="strings" />

          {/* SPEED */}
          <div style={S.label}>⏱️ How fast?</div>
          <TileRow options={SPEEDS} value={speed} onPick={setSpeed} accent={vibeObj.color} />

          {/* WORLD */}
          <div style={S.label}>🌍 Pick a world (optional)</div>
          <div style={S.themeRow}>
            {THEMES.map((t) => (
              <button
                key={t.id || "surprise"}
                onClick={() => setTheme(t.id)}
                style={theme === t.id ? S.themeChipActive : S.themeChip}
              >
                {t.id ? <IconImg cat="world" id={t.id} emoji="🌍" size={18} radius={4} /> : null}
                {t.label}
              </button>
            ))}
          </div>

          {/* PROMPT */}
          <div style={S.label}>✍️ What's your song about?</div>
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
              {draft.meta && draft.meta.recipe && (
                <div style={S.recipe}>{draft.meta.recipe}</div>
              )}
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
                <CoverThumb vibe={s.vibe} theme={s.theme} color={s.cover_color} size={48} radius={8} />
                <div style={S.songInfo}>
                  <div style={S.songTitle}>{s.title}</div>
                  <div style={S.songMeta}>
                    {(s.vibe || "song")}{s.theme ? " · " + s.theme : ""}
                  </div>
                  <audio controls src={s.audio_url} style={S.audioSmall} />
                </div>
                <button style={S.shareBtn} onClick={() => shareCreation({ kind: "song", id: s.song_id, title: s.title })} title="Share">🔗</button>
                <button style={S.renameBtn} onClick={() => renameSong(s)} title="Rename">✏️</button>
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
  label: { fontSize: 15, fontWeight: 700, margin: "18px 0 10px" },
  vibeGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  vibeBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: "none", borderRadius: 14, padding: "14px 6px", cursor: "pointer", fontWeight: 700, transition: "all .12s" },
  tileRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  tile: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, width: 84, minHeight: 78, border: "2px solid transparent", borderRadius: 14, padding: "10px 6px", cursor: "pointer", fontWeight: 700, color: "#fff", transition: "all .12s" },
  tileEmoji: { fontSize: 28, lineHeight: 1 },
  tileLabel: { fontSize: 12, fontWeight: 700, textAlign: "center", color: "#e7e7f5" },
  themeRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  themeChip: { display: "inline-flex", alignItems: "center", gap: 6, background: "#2a2a3a", color: "#ddd", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  themeChipActive: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#1a1a2a", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "2px solid #3a3a4a", background: "#11111a", color: "#fff", outline: "none" },
  bigBtn: { width: "100%", marginTop: 18, padding: "16px", fontSize: 18, fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 14, cursor: "pointer" },
  loading: { textAlign: "center", marginTop: 16, fontSize: 18, letterSpacing: 2 },
  draft: { marginTop: 18, padding: 16, borderRadius: 14, border: "2px solid", background: "#11111a" },
  draftTitle: { fontSize: 18, fontWeight: 800, marginBottom: 6 },
  recipe: { fontSize: 13, color: "#b9b9d0", marginBottom: 10, fontWeight: 600 },
  audio: { width: "100%" },
  draftBtns: { display: "flex", gap: 10, marginTop: 12 },
  keepBtn: { flex: 1, padding: "12px", fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 12, cursor: "pointer" },
  againBtn: { flex: 1, padding: "12px", fontWeight: 700, color: "#fff", background: "#2a2a3a", border: "none", borderRadius: 12, cursor: "pointer" },
  status: { marginTop: 14, textAlign: "center", color: "#FFD93D", fontWeight: 700 },
  empty: { textAlign: "center", color: "#bbb", padding: "30px 0", fontSize: 16 },
  songGrid: { display: "flex", flexDirection: "column", gap: 12 },
  songCard: { display: "flex", alignItems: "center", gap: 12, background: "#11111a", border: "2px solid", borderRadius: 14, padding: 12 },
  songSwatch: { width: 14, height: 48, borderRadius: 6, flexShrink: 0 },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  songMeta: { fontSize: 12, color: "#aaa", marginBottom: 6, textTransform: "capitalize" },
  audioSmall: { width: "100%", height: 32 },
  shareBtn: { background: "rgba(124,108,255,0.25)", color: "#cfc8ff", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  renameBtn: { background: "#2a2a3a", color: "#e7e7f5", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
    deleteBtn: { background: "#2a2a3a", color: "#ff8080", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  fullNote: { marginTop: 14, textAlign: "center", color: "#FF8FB1", fontWeight: 700 },
};
