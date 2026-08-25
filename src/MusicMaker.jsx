// /src/MusicMaker.jsx
// Kid-facing "Music Maker" — create, keep, and play AI songs.
//
// Session MM1 — INSTANT + SPEAKABLE. A 5-year-old who can't read makes a song in
// three big spoken steps, zero reading required:
//   1) WHAT'S IT ABOUT? — picture topic chips that say their name when tapped,
//      plus a "Put my name in the song" switch (free typing stays optional).
//   2) PICK YOUR SOUND — one screen of style cards (vibe + genre merged); each
//      plays a ~2s music preview when tapped.
//   3) WHO SINGS IT? — singer cards with short voice previews.
// Then one big GO, or "Surprise me" to fill everything in one tap. The old
// drums/guitar/strings/speed pickers live behind an optional "Tweak my band".
// Every option speaks/plays a sound (short ElevenLabs clips from the shared
// sound library via /api/sfx). Icons preload on open so nothing waits. No emoji:
// pictures are library art (IconImg) and controls are vector glyphs.
//
// Session MM2 — MAKE IT A KEEPER. Finished songs feel like treasures:
//   • ALBUM COVER — real cover art per song (kind=cover), pinned to the song and
//     shown on the reveal, the My Songs shelf, and My Stuff (color square is the
//     fallback so nothing ever breaks).
//   • WAITING SHOW — a drawn "band warming up" moment (SVG + CSS, no emoji)
//     replaces the plain spinner; the rotating messages stay as spoken flavor.
//   • TITLE REVEAL — the cover + a playful title appear like a PRIZE (with a Feel
//     Kit celebration) BEFORE playback; the title is tappable to rename and saved.
//   • MAKE ANOTHER ABOUT… — one tap re-opens step 1 with the same style + singer
//     locked in. Instrument packs (Brass Band / Strings / World Beats) unlock
//     extra premium style cards; locked cards show a coin price and buy through
//     the shared wallet (window.BuildableWallet) + the shell loadout store.

import { useState, useEffect, useRef } from "react";
import { shareCreation } from "./lib/shareSheet";
import CoverThumb from "./lib/CoverThumb";
import IconImg, { preloadIcon } from "./lib/IconImg";
import SongPlayer from "./lib/SongPlayer";
import QuickGame from "./QuickGame";
import { getLearningSettings, effectiveLearning } from "./store";
import { registerAudio } from './lib/audioUnlock.js';

const MAX_SONGS = 100000; // testing: effectively unlimited (was 10)

// Song topics — picture chips that speak their name. Reuse library art where it
// exists (space, ocean); the rest are new "topic" subjects in api/images.js.
const TOPICS = [
  { id: "dog",      label: "Dogs",      prompt: "dogs" },
  { id: "cat",      label: "Cats",      prompt: "cats" },
  { id: "dinosaur", label: "Dinosaurs", prompt: "dinosaurs" },
  { id: "space",    label: "Space",     prompt: "outer space" },
  { id: "pancakes", label: "Pancakes",  prompt: "pancakes" },
  { id: "princess", label: "Princess",  prompt: "a princess" },
  { id: "trucks",   label: "Trucks",    prompt: "trucks" },
  { id: "ocean",    label: "Ocean",     prompt: "the ocean" },
  { id: "robots",   label: "Robots",    prompt: "robots" },
  { id: "family",   label: "My Family", prompt: "my family" },
];

// Style cards merge a vibe + a genre into one tappable choice. Each maps to the
// vibe/genre values /api/generate-song already accepts, shows the matching genre
// icon (cat "style"), and plays a ~2s preview (mm_style_<genre>).
const STYLE_CARDS = [
  { id: "happypop",     label: "Happy Pop",     vibe: "happy",  genre: "pop",      color: "#FFD93D" },
  { id: "danceparty",   label: "Dance Party",   vibe: "dance",  genre: "disco",    color: "#FF6B6B" },
  { id: "spookyrock",   label: "Spooky Rock",   vibe: "spooky", genre: "rock",     color: "#8E44AD" },
  { id: "sillycountry", label: "Silly Country", vibe: "silly",  genre: "country",  color: "#FF8FB1" },
  { id: "sleepylullaby",label: "Sleepy Lullaby",vibe: "chill",  genre: "sleepy",   color: "#4FD1C5" },
  { id: "epicmovie",    label: "Epic Movie",    vibe: "epic",   genre: "marching", color: "#5B6CFF" },
  { id: "kpop",         label: "K-Pop Energy",  vibe: "dance",  genre: "kpop",     color: "#FF4FA3" },
  { id: "chillreggae",  label: "Chill Reggae",  vibe: "chill",  genre: "reggae",   color: "#3DD06A" },
];

// MM2 — PREMIUM style cards that come with an instrument pack. Each card names
// the pack (matching public/music-maker/manifest.json's "Instrument packs"
// options) that unlocks it. Locked cards show a coin price and buy through the
// shared wallet + loadout store; owning the pack unlocks all of its cards.
const PACK_STYLE_CARDS = [
  { id: "marchingbrass", label: "Marching Brass", vibe: "epic",  genre: "brass",      color: "#E6A817", pack: "Brass Band" },
  { id: "bigbandswing",  label: "Big Band Swing", vibe: "happy", genre: "swing",      color: "#F2C14E", pack: "Brass Band" },
  { id: "moviestrings",  label: "Movie Strings",  vibe: "epic",  genre: "orchestral", color: "#7C6CFF", pack: "Strings" },
  { id: "dreamywaltz",   label: "Dreamy Waltz",   vibe: "chill", genre: "waltz",      color: "#8FB7FF", pack: "Strings" },
  { id: "sambacarnival", label: "Samba Carnival", vibe: "dance", genre: "samba",      color: "#FF7A3D", pack: "World Beats" },
  { id: "afrogroove",    label: "Afro Groove",    vibe: "dance", genre: "afrobeat",   color: "#3DC98A", pack: "World Beats" },
];
const ALL_STYLE_CARDS = STYLE_CARDS.concat(PACK_STYLE_CARDS);

const GAME_ID = "music-maker";
const PACK_SLOT = "Instrument packs";
// Reads the shell-owned loadout store for this studio (same key the shell writes)
// to learn which instrument packs the kid owns. Free option (Starter) is index 0.
function loadoutKey() {
  let kid = "";
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); if (k && k.id) kid = "_" + k.id; } catch (e) {}
  return "bk_loadout_v1_" + GAME_ID + kid;
}
function readLoadoutStore() {
  try { const s = JSON.parse(localStorage.getItem(loadoutKey()) || "null"); if (s && typeof s === "object") return { owned: s.owned || {}, equipped: s.equipped || {} }; } catch (e) {}
  return { owned: {}, equipped: {} };
}
function ownedPackNames(packMap) {
  // packMap: { "Brass Band": {index, price}, ... }. Returns a Set of owned pack names.
  const store = readLoadoutStore();
  const ownedIdx = new Set(store.owned[PACK_SLOT] || []);
  const names = new Set();
  Object.keys(packMap || {}).forEach((name) => { if (ownedIdx.has(packMap[name].index)) names.add(name); });
  return names;
}

const SINGERS = [
  { id: "none", label: "No Singer", glyph: "none" },
  { id: "boy", label: "Boy" }, { id: "girl", label: "Girl" }, { id: "group", label: "Group" },
  { id: "both", label: "Both" }, { id: "robot", label: "Robot" },
];

// Optional "Tweak my band" pickers (kept from the classic flow, no longer required).
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
const Q_TOPIC = "What is your song about?";
const Q_STYLE = "Pick your sound!";
const Q_SINGER = "Who sings it?";
const QUESTION_PHRASES = [Q_TOPIC, Q_STYLE, Q_SINGER, "Surprise!", "Making your song!"];

function getDeviceId() {
  try { let id = localStorage.getItem("deviceId"); if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); } return id; } catch { return "dev_anon"; }
}
function getKidProfileId() {
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; }
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let kfInjected = false;
function injectKeyframes() {
  if (kfInjected || typeof document === "undefined") return;
  kfInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-mm-kf", "");
  el.textContent =
    "@keyframes mmLock{0%{transform:translateY(-8px) scale(1.07)}55%{transform:translateY(3px) scale(.96)}100%{transform:translateY(0) scale(1)}}" +
    "@keyframes mmGlow{0%{box-shadow:0 0 0 0 rgba(255,217,61,0)}40%{box-shadow:0 0 0 3px rgba(255,217,61,.95),0 0 22px rgba(255,217,61,.8)}100%{box-shadow:0 0 0 2px rgba(255,217,61,.6)}}" +
    "@keyframes mmPop{0%{transform:scale(.9)}60%{transform:scale(1.04)}100%{transform:scale(1)}}" +
    "@keyframes mmEq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}" +
    // MM2 waiting-show + reveal motion (drawn band warming up, prize pop).
    "@keyframes mmBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}" +
    "@keyframes mmSway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}" +
    "@keyframes mmFloat{0%{transform:translateY(6px);opacity:0}30%{opacity:1}100%{transform:translateY(-26px);opacity:0}}" +
    "@keyframes mmReveal{0%{transform:scale(.6) rotate(-6deg);opacity:0}60%{transform:scale(1.06) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0)}}" +
    "@keyframes mmSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}";
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

// MM2 — the "band warming up" waiting show. All drawn SVG + CSS, no emoji: a
// little stage with a bouncing drum, a swaying guitar, dancing equalizer bars,
// and floating music notes while the song generates. `msg` is the spoken/visible
// flavor line, kept from the old loader.
function BandWarmup({ accent, msg }) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div style={S.loaderWrap}>
      <svg width="220" height="150" viewBox="0 0 220 150" role="img" aria-label="The band is warming up">
        {/* stage floor */}
        <ellipse cx="110" cy="132" rx="94" ry="12" fill="rgba(255,255,255,0.06)" />
        {/* floating notes */}
        <g fill={accent} opacity="0.9">
          <g style={{ animation: "mmFloat 2.2s ease-in-out infinite" }}><circle cx="52" cy="40" r="4" /><rect x="55" y="24" width="2.4" height="18" /></g>
          <g style={{ animation: "mmFloat 2.6s ease-in-out .6s infinite" }}><circle cx="112" cy="34" r="4" /><rect x="115" y="18" width="2.4" height="18" /></g>
          <g style={{ animation: "mmFloat 2.4s ease-in-out 1.1s infinite" }}><circle cx="170" cy="42" r="4" /><rect x="173" y="26" width="2.4" height="18" /></g>
        </g>
        {/* guitar player (swaying) */}
        <g style={{ transformOrigin: "60px 110px", animation: "mmSway 1.4s ease-in-out infinite" }}>
          <circle cx="60" cy="74" r="12" fill="#f3c98b" />
          <rect x="50" y="86" width="20" height="30" rx="8" fill={accent} />
          <ellipse cx="78" cy="104" rx="12" ry="9" fill="#b5651d" />
          <rect x="70" y="98" width="26" height="5" rx="2.5" fill="#8a4b16" transform="rotate(-18 70 98)" />
        </g>
        {/* drummer (bouncing) */}
        <g style={{ transformOrigin: "150px 112px", animation: "mmBounce 0.5s ease-in-out infinite" }}>
          <circle cx="150" cy="76" r="12" fill="#f3c98b" />
          <rect x="140" y="88" width="20" height="26" rx="8" fill="#5B6CFF" />
          <ellipse cx="150" cy="120" rx="22" ry="10" fill="#e7e7f5" />
          <rect x="128" y="112" width="44" height="10" rx="4" fill="#cfd0f5" />
        </g>
        {/* equalizer bars */}
        <g>
          {bars.map((i) => (
            <rect key={i} x={14 + i * 9} y="120" width="6" height="22" rx="3" fill={accent}
              style={{ transformOrigin: "center bottom", animation: "mmEq .9s ease-in-out infinite", animationDelay: (i * 0.1) + "s" }} />
          ))}
        </g>
      </svg>
      <div style={S.loaderMsg}>{msg}</div>
    </div>
  );
}

export default function MusicMaker({ onBack, onHome, playerName, remix = null, onConsumeRemix = null }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [vibe, setVibe] = useState("happy");
  const [genre, setGenre] = useState("pop");
  const [styleId, setStyleId] = useState(null);   // chosen style card
  const [singer, setSinger] = useState("none");
  const [drums, setDrums] = useState("auto");
  const [guitar, setGuitar] = useState("auto");
  const [strings, setStrings] = useState("auto");
  const [speed, setSpeed] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const [topicId, setTopicId] = useState(null);
  const [useName, setUseName] = useState(true);   // "Put my name in the song"
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [songs, setSongs] = useState([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("make");
  const [mkStep, setMkStep] = useState(0);        // 0 topic, 1 style, 2 singer
  const [showTweak, setShowTweak] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");   // MM2: editable reveal title
  const [editingTitle, setEditingTitle] = useState(false);
  const [revealPlay, setRevealPlay] = useState(false); // MM2: prize revealed → now playing
  const [coins, setCoins] = useState(0);               // MM2: shared wallet balance
  const [packMap, setPackMap] = useState({});          // MM2: {packName:{index,price}}
  const [ownedPacks, setOwnedPacks] = useState(new Set()); // MM2: owned pack names
  const [locking, setLocking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [msgI, setMsgI] = useState(0);
  const [justFinished, setJustFinished] = useState(false); // learning gate: only after a real finish
  const [gateNext, setGateNext] = useState(null);          // pending action awaiting a quick question
  const [mfLearn, setMfLearn] = useState(null);            // Session 6C: this studio's manifest learning defaults
  const audioRef = useRef(null);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;
  const audioElRef = useRef(null);   // TTS (spoken names/questions)
  const sfxElRef = useRef(null);     // tap-to-hear previews (/api/sfx)
  const ttsCacheRef = useRef({});
  const speakSeqRef = useRef(0);

  useEffect(() => { injectKeyframes(); refresh(); QUESTION_PHRASES.forEach(preload); preloadAllIcons(); preloadPreviews(); }, []);

  // Session 6C — read the studio's own manifest so the learning gate is manifest-
  // driven (features.learning), like every converted game. Parent overrides still
  // win via effectiveLearning(); a missing/late manifest just means null defaults.
  useEffect(() => {
    let live = true;
    fetch("/music-maker/manifest.json?v=" + Date.now())
      .then((r) => r.json())
      .then((m) => {
        if (!live || !m) return;
        if (m.features) setMfLearn(m.features.learning || null);
        // MM2 — build the pack price/index map from the manifest customization
        // so premium style cards unlock through the real instrument-pack slot.
        const slot = (m.customization || []).find((s) => /instrument/i.test(s.slot || ""));
        const map = {};
        if (slot) (slot.options || []).forEach((o, i) => { if (o && o.name) map[o.name] = { index: i, price: o.price || 0 }; });
        setPackMap(map);
        setOwnedPacks(ownedPackNames(map));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // MM2 — keep the coin balance live (shell owns the wallet). Refresh on the
  // shell's bk-wallet event so a purchase updates the price badges immediately.
  useEffect(() => {
    const read = () => { try { setCoins((window.BuildableWallet && window.BuildableWallet.balance()) || 0); } catch (e) { setCoins(0); } };
    read();
    if (typeof window !== "undefined") window.addEventListener("bk-wallet", read);
    return () => { if (typeof window !== "undefined") window.removeEventListener("bk-wallet", read); };
  }, []);

  // Warm every picker icon the moment the maker opens, so pictures paint instantly.
  function preloadAllIcons() {
    try {
      TOPICS.forEach((t) => preloadIcon("topic", t.id));
      ALL_STYLE_CARDS.forEach((s) => preloadIcon("style", s.genre));
      SINGERS.forEach((s) => { if (!s.glyph) preloadIcon("singer", s.id); });
      [["drums", DRUMS], ["guitar", GUITARS], ["strings", STRINGS], ["speed", SPEEDS]]
        .forEach(([cat, list]) => list.forEach((o) => { if (!o.glyph) preloadIcon(cat, o.id); }));
    } catch {}
  }
  // Warm the tap-to-hear clips on the main path (styles + singers) so the first
  // tap plays instantly. Instrument previews warm lazily when Tweak opens.
  function preloadPreviews() {
    try {
      const keys = STYLE_CARDS.map((s) => "mm_style_" + s.genre)
        .concat(SINGERS.filter((s) => !s.glyph).map((s) => "mm_sing_" + s.id));
      keys.forEach((k) => { fetch("/api/sfx?s=" + k).catch(() => {}); });
    } catch {}
  }

  function audioEl() {
    if (!audioElRef.current && typeof window !== "undefined") { const a = new Audio(); a.preload = "auto"; registerAudio(a); audioElRef.current = a; }
    return audioElRef.current;
  }
  function sfxEl() {
    if (!sfxElRef.current && typeof window !== "undefined") { const a = new Audio(); a.preload = "auto"; registerAudio(a); sfxElRef.current = a; }
    return sfxElRef.current;
  }
  // Play a short preview clip from the shared sound library. Plays synchronously
  // on the tap so iOS audio permission holds; silent-fails if a clip is missing.
  function playSfx(key) {
    if (!key || typeof window === "undefined") return;
    try { const a = sfxEl(); a.src = "/api/sfx?s=" + key; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch {}
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
      // If autoplay is momentarily blocked, stay silent — never the robot voice.
      if (p && p.catch) p.catch(() => {});
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
    // Only show this kid's own songs. Without a selected kid, show none rather
    // than the shared device list (which would mix in other kids' songs).
    if (!kidProfileId) { setSongs([]); setCount(0); return; }
    try {
      const r = await fetch("/api/list-songs?kidProfileId=" + encodeURIComponent(kidProfileId));
      const j = await r.json();
      if (j && j.configured && Array.isArray(j.songs)) { setSongs(j.songs); setCount(j.count || j.songs.length); }
    } catch {}
  }

  // Remix: prefill from another kid's published song, then clear draft.
  useEffect(() => {
    if (!remix) return;
    const c = (remix.meta && remix.meta.choices) || {};
    const v = c.vibe || remix.vibe || "happy";
    setVibe(v);
    if (c.genre) setGenre(c.genre);
    const card = ALL_STYLE_CARDS.find((s) => s.vibe === v && s.genre === (c.genre || genre));
    setStyleId(card ? card.id : null);
    if (c.singer) setSinger(c.singer);
    if (c.drums) setDrums(c.drums);
    if (c.guitar) setGuitar(c.guitar);
    if (c.strings) setStrings(c.strings);
    if (c.speed) setSpeed(c.speed);
    setPrompt(c.prompt || remix.theme || "");
    setTopicId(null);
    setDraft(null); setTab("make"); setMkStep(0);
    setStatus("Remixing " + (remix.title || "a song") + " — change anything you like!");
    if (onConsumeRemix) onConsumeRemix();
  }, [remix]);

  function buildChoices() { return { vibe, genre, singer, drums, guitar, strings, speed, prompt }; }

  // MM2 — Feel Kit celebration (shared, shell-loaded). Falls back to a tap.
  function feel(fn) { try { const F = window.BuildableFeel; if (F && F[fn]) F[fn](); } catch (e) {} }
  function celebrate() {
    try {
      const F = window.BuildableFeel;
      if (F && F.celebrate) F.celebrate(window.innerWidth || 360, window.innerHeight || 640);
      else if (F && F.tap) F.tap();
    } catch (e) {}
  }

  // MM2 — buy an instrument pack with the SHARED wallet, then record ownership in
  // the shell loadout store (so the shell's loadout screen agrees). Unlocks every
  // premium style card in that pack. Short on coins → a friendly nudge, no charge.
  function buyPack(packName) {
    const p = packMap[packName];
    if (!p) return false;
    if (coins < (p.price || 0)) {
      feel("miss");
      setStatus("The " + packName + " pack costs " + p.price + " coins. Play and practice to earn more!");
      return false;
    }
    let ok = false;
    try { ok = window.BuildableWallet ? window.BuildableWallet.spend(p.price) : false; } catch (e) { ok = false; }
    if (!ok) { setStatus("Couldn't open that pack right now — try again in a moment."); return false; }
    try {
      const s = readLoadoutStore();
      const list = (s.owned[PACK_SLOT] || []).slice();
      if (!list.includes(p.index)) list.push(p.index);
      s.owned[PACK_SLOT] = list.sort((a, b) => a - b);
      localStorage.setItem(loadoutKey(), JSON.stringify(s));
    } catch (e) {}
    setOwnedPacks(ownedPackNames(packMap));
    try { setCoins((window.BuildableWallet && window.BuildableWallet.balance()) || 0); } catch (e) {}
    setStatus("New sounds unlocked — the " + packName + " pack is yours!");
    celebrate();
    return true;
  }

  // MM2 — "Make another about…": keep the same style + singer, clear the topic,
  // and drop back on step 1 so a kid can binge-make songs about everything.
  function makeAnother() {
    setDraft(null); setTitleDraft(""); setRevealPlay(false); setEditingTitle(false);
    setTopicId(null); setPrompt(""); setStatus("");
    setTab("make"); setMkStep(0);
    feel("tap"); speak(Q_TOPIC);
  }

  async function makeSong() {
    setBusy(true); setStatus(""); setDraft(null);
    const nameToUse = (useName && playerName) ? playerName : "";
    try {
      const r = await fetch("/api/generate-song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...buildChoices(), kidName: nameToUse }) });
      const j = await r.json();
      if (j && j.ok) { setDraft(j); setTitleDraft(j.title || "My Song"); setRevealPlay(false); setEditingTitle(false); celebrate(); }
      else if (j && j.blocked) {
        // Kid typed something the server's safety filter blocked. Keep them on the
        // topic step, say a friendly line aloud (many can't read), and show a
        // clear kid-friendly message.
        setMkStep(0);
        speak("Oops! Let's keep it friendly. Try some different words for your song.");
        setStatus("Oops! Some of those words aren't allowed. Let's keep songs kind and friendly — try something fun like animals, space, or a silly adventure!");
      }
      else if (j && j.reason === "music_unavailable") {
        // The music service is down or out of budget. NEVER show the dev synth
        // tone as if it were the kid's song — say it plainly and offer a retry.
        speak("The song machine is having a nap. Let's try again!");
        setStatus("The song machine is having a nap! Let's try again in a minute.");
      }
      else setStatus("Hmm, that didn't work. Try again!");
    } catch { setStatus("Hmm, that didn't work. Try again!"); }
    finally { setBusy(false); }
  }

  function doRender() { if (busy || locking) return; speak("Making your song!"); setLocking(true); setTimeout(() => { setLocking(false); makeSong(); }, 1200); }
  function startRender() {
    // Session 6C: render learning-moment reads THIS studio's manifest defaults
    // blended with the parent's per-kid overrides (effectiveLearning). Still fully
    // skippable via QuickGame; never traps a kid.
    const eff = effectiveLearning(mfLearn);
    if (eff.enabled && eff.beforeUnlock) { setJustFinished(false); setGateNext(() => doRender); return; }
    doRender();
  }

  // One-tap "Surprise me" — fill everything randomly and go straight to the song.
  function surprise() {
    const t = pick(TOPICS); setTopicId(t.id); setPrompt(t.prompt);
    const unlocked = ALL_STYLE_CARDS.filter((c) => !c.pack || ownedPacks.has(c.pack));
    const s = pick(unlocked.length ? unlocked : STYLE_CARDS); setStyleId(s.id); setVibe(s.vibe); setGenre(s.genre);
    const sg = pick(SINGERS.filter((x) => x.id !== "none")); setSinger(sg.id);
    setDrums("auto"); setGuitar("auto"); setStrings("auto"); setSpeed("auto");
    speak("Surprise!");
    setTimeout(() => startRender(), 350);
  }

  function chooseTopic(t) { setTopicId(t.id); setPrompt(t.prompt); speak(t.label); }
  function chooseStyle(s) {
    // Locked premium card → buy its pack via the shared wallet first.
    if (s.pack && !ownedPacks.has(s.pack)) { if (!buyPack(s.pack)) return; }
    setStyleId(s.id); setVibe(s.vibe); setGenre(s.genre); playSfx("mm_style_" + s.genre);
  }
  function chooseSinger(s) { setSinger(s.id); if (s.glyph) speak("No singer"); else playSfx("mm_sing_" + s.id); }

  async function keepSong() {
    if (!draft) return;
    if (!kidProfileId) { setStatus("Tap Grown-ups and pick who's playing first, so this song saves to the right kid."); return; }
    if (count >= MAX_SONGS) { setStatus("You have lots of songs! Delete one in My Songs to make room."); setTab("library"); return; }
    setStatus("Saving...");
    try {
      const r = await fetch("/api/save-song", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, kidProfileId, kidName: playerName || "", title: (titleDraft || draft.title), audioUrl: draft.audioUrl, vibe: draft.vibe, theme: draft.theme, prompt: draft.prompt, coverColor: draft.coverColor, coverUrl: draft.coverUrl, durationSec: draft.durationSec, provider: draft.provider, meta: { ...(draft.meta || {}), coverUrl: draft.coverUrl, choices: buildChoices() } }) });
      const j = await r.json();
      if (r.ok && j.ok) { setStatus("Saved to My Songs!"); setDraft(null); setTitleDraft(""); setRevealPlay(false); setEditingTitle(false); setPrompt(""); setTopicId(null); setStyleId(null); setMkStep(0); setJustFinished(true); await refresh(); }
      else if (r.status === 409) { setStatus(j.message || "Your song box is full!"); setTab("library"); }
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
  async function publishSong(song) {
    const next = !song.published;
    setSongs((prev) => prev.map((x) => x.song_id === song.song_id ? { ...x, published: next } : x));
    try {
      await fetch("/api/publish-creation", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "song", id: song.song_id, deviceId: getDeviceId(), kidProfileId: getKidProfileId() || undefined, publish: next }) });
    } catch { /* keep optimistic */ }
  }
  async function deleteSong(songId) {
    try { await fetch("/api/delete-song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, songId }) }); await refresh(); } catch {}
  }

  const styleObj = ALL_STYLE_CARDS.find((s) => s.id === styleId) || null;
  const accent = styleObj ? styleObj.color : "#5B6CFF";
  const topicObj = TOPICS.find((t) => t.id === topicId) || null;
  const singerObj = SINGERS.find((s) => s.id === singer) || SINGERS[0];

  // Speak each step's question as it appears (for kids who can't read yet).
  useEffect(() => {
    if (tab !== "make" || busy || draft) return;
    if (mkStep === 0) speak(Q_TOPIC);
    else if (mkStep === 1) speak(Q_STYLE);
    else if (mkStep === 2) speak(Q_SINGER);
  }, [mkStep, tab, busy, draft]); // eslint-disable-line

  // Cycle the loader message while a song is generating.
  useEffect(() => {
    if (!busy) return; setMsgI(0);
    const t = setInterval(() => setMsgI((i) => (i + 1) % LOADER_MSGS.length), 1500);
    return () => clearInterval(t);
  }, [busy]);

  function lockStyle(idx) {
    return locking ? { animation: "mmLock .5s cubic-bezier(.2,.9,.3,1.5) " + (idx * 0.1) + "s both, mmGlow 1s ease " + (idx * 0.1) + "s both", background: "#2e2c1c" } : null;
  }

  // Optional "Tweak my band" — the classic drums/guitar/strings/speed pickers.
  function TweakRow({ cat, label, options, value, set }) {
    return (
      <div style={S.tweakRow}>
        <div style={S.tweakLabel}>{label}</div>
        <div style={S.tweakOpts}>
          {options.map((o) => {
            const active = value === o.id;
            const previewKey = o.glyph ? null : "mm_" + cat + "_" + o.id;
            return (
              <button key={o.id} onClick={() => { set(o.id); if (previewKey) playSfx(previewKey); else speak(o.label); }}
                style={{ ...S.tweakChip, borderColor: active ? accent : "transparent", background: active ? "#2c2c48" : "#23243a" }}>
                <OptionIcon opt={o} cat={cat} size={26} />
                <span style={S.tweakChipLab}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Little read-only recap of what's chosen so far (tap to jump back to a step).
  function Recap() {
    const items = [];
    if (topicObj || prompt) items.push({ key: "t", step: 0, cat: "topic", id: topicObj ? topicObj.id : null, lab: topicObj ? topicObj.label : (prompt || "About") });
    if (styleObj) items.push({ key: "s", step: 1, cat: "style", id: styleObj.genre, lab: styleObj.label });
    if (singer !== "none") items.push({ key: "g", step: 2, cat: "singer", id: singerObj.glyph ? null : singerObj.id, lab: singerObj.label });
    if (!items.length) return null;
    return (
      <div style={S.recapWrap}>
        <div style={S.recapHead}>Your song so far — tap to change</div>
        <div style={S.recapStrip}>
          {items.map((it) => (
            <button key={it.key} style={S.recapChip} onClick={() => setMkStep(it.step)}>
              {it.id ? <IconImg cat={it.cat} id={it.id} size={22} /> : <Glyph kind="none" size={22} />}
              <span style={S.recapLab}>{it.lab}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Learning gate: one quick question before rendering (manifest-driven, skippable).
  if (gateNext) {
    const proceed = gateNext;
    return (
      <QuickGame
        goal={effectiveLearning(mfLearn).goal}
        gameType="song"
        title="One quick game first!"
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
            <BandWarmup accent={accent} msg={LOADER_MSGS[msgI]} />
          ) : draft && !revealPlay ? (
            // MM2 — TITLE REVEAL: cover + title appear like a PRIZE before playback.
            <div style={S.revealWrap}>
              <div style={S.revealBadge}>Your new song!</div>
              <div style={{ ...S.revealCover, borderColor: draft.coverColor }}>
                <CoverThumb url={draft.coverUrl} vibe={draft.vibe} theme={draft.theme} color={draft.coverColor} fill radius={18} label={titleDraft || draft.title} />
              </div>
              {editingTitle ? (
                <input autoFocus style={{ ...S.titleInput, borderColor: draft.coverColor }} value={titleDraft} maxLength={60}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingTitle(false); }} />
              ) : (
                <button style={S.revealTitle} onClick={() => setEditingTitle(true)} title="Tap to rename">
                  <span>{titleDraft || draft.title}</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cfd0f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
              )}
              <button style={{ ...S.playPrizeBtn, background: draft.coverColor }} onClick={() => { feel("tap"); setRevealPlay(true); }} aria-label="Play my song">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="#15131f" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>
                <span>Play my song</span>
              </button>
              {/* Save lives HERE too, not only after Play. A kid who taps Home from
                  the reveal used to lose the song entirely and My Songs stayed at 0. */}
              <button style={S.revealSaveBtn} onClick={keepSong} aria-label="Save this song">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <span>Save it</span>
              </button>
              <button style={S.tweakBtn} onClick={() => { setDraft(null); setMkStep(1); }}>← Change my song</button>
              {status && <div style={S.status}>{status}</div>}
            </div>
          ) : draft ? (
            // MM2 — PLAYBACK + one-tap remake keeping style + singer.
            <div style={{ ...S.draft, borderColor: draft.coverColor }}>
              <div style={S.playHead}>
                <div style={{ ...S.playCover, borderColor: draft.coverColor }}>
                  <CoverThumb url={draft.coverUrl} vibe={draft.vibe} theme={draft.theme} color={draft.coverColor} size={64} radius={12} label={titleDraft || draft.title} />
                </div>
                <div style={S.draftTitle}>{titleDraft || draft.title}</div>
              </div>
              <SongPlayer src={draft.audioUrl} color={draft.coverColor} autoPlay size={92} />
              <div style={S.draftBtns}>
                <button style={{ ...S.keepBtn, background: draft.coverColor }} onClick={keepSong} aria-label="Save this song" title="Save">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="#15131f" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  <span style={S.btnCap}>Save</span>
                </button>
                <button style={S.againBtn} onClick={makeAnother} aria-label="Make another song about something new" title="Make another">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8"/><path d="M3 3.5V8h4.5"/></svg>
                  <span style={S.btnCap}>Make another about…</span>
                </button>
              </div>
              <button style={S.tweakBtn} onClick={() => { setDraft(null); setMkStep(1); }}>← Change my song</button>
              {status && <div style={S.status}>{status}</div>}
            </div>
          ) : (
            <div>
              <div style={S.topRow}>
                <div style={S.dots}>
                  {[0, 1, 2].map((i) => (<span key={i} style={{ ...S.dot, ...(i === mkStep ? S.dotOn : i < mkStep ? S.dotDone : {}) }} />))}
                </div>
                <button style={S.surpriseBtn} onClick={surprise} disabled={locking}>
                  <Glyph kind="surprise" size={20} /><span>Surprise me</span>
                </button>
              </div>

              {mkStep === 0 && (
                <>
                  <div style={S.qHead}>{Q_TOPIC}</div>
                  {playerName ? (
                    <button style={{ ...S.nameToggle, borderColor: useName ? accent : "#3a3a4a", background: useName ? "#242540" : "#1a1a28" }}
                      onClick={() => setUseName((v) => !v)} aria-pressed={useName}>
                      <span style={{ ...S.switch, background: useName ? accent : "#4a4a5e" }}>
                        <span style={{ ...S.knob, transform: useName ? "translateX(18px)" : "translateX(0)" }} />
                      </span>
                      <span style={S.nameToggleLab}>Put my name in the song</span>
                    </button>
                  ) : null}
                  <div style={S.tilesGrid}>
                    {TOPICS.map((t) => {
                      const active = topicId === t.id;
                      return (
                        <button key={t.id} onClick={() => chooseTopic(t)}
                          style={{ ...S.bigTile, borderColor: active ? accent : "transparent", background: active ? "#2c2c48" : "#23243a", boxShadow: active ? "0 0 0 2px " + accent + "55" : "none" }}>
                          <IconImg cat="topic" id={t.id} size={58} />
                          <span style={S.bigTileLabel}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input style={S.input} placeholder="or type your own idea…" value={topicId ? "" : prompt} maxLength={120}
                    onChange={(e) => { setTopicId(null); setPrompt(e.target.value); }} />
                  <div style={S.wizNav}>
                    <span />
                    <button style={{ ...S.nextBtn, background: accent }} onClick={() => setMkStep(1)}>Next →</button>
                  </div>
                </>
              )}

              {mkStep === 1 && (
                <>
                  <div style={S.qHead}>{Q_STYLE}</div>
                  <div style={S.styleGrid}>
                    {ALL_STYLE_CARDS.map((s, i) => {
                      const active = styleId === s.id;
                      const locked = !!s.pack && !ownedPacks.has(s.pack);
                      const price = locked && packMap[s.pack] ? packMap[s.pack].price : 0;
                      return (
                        <button key={s.id} onClick={() => chooseStyle(s)} aria-label={locked ? (s.label + " — costs " + price + " coins") : s.label}
                          style={{ ...S.styleCard, ...(lockStyle(i) || {}), borderColor: active ? s.color : "transparent", background: active ? "#2c2c48" : "#23243a", boxShadow: active ? "0 0 0 2px " + s.color + "66" : "none", opacity: locked ? 0.92 : 1 }}>
                          <span style={{ ...S.styleDot, background: s.color }} />
                          <div style={{ position: "relative" }}>
                            <IconImg cat="style" id={s.genre} size={52} />
                            {locked && <span style={S.lockBadge}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15131f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>}
                          </div>
                          <span style={S.styleLabel}>{s.label}</span>
                          {locked && (
                            <span style={S.pricePill}>
                              <span style={{ ...S.coinDot, background: coins >= price ? "#FFD24A" : "#7a7a90" }} />
                              {price}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div style={S.wizNav}>
                    <button style={S.backBtn} onClick={() => setMkStep(0)}>← Back</button>
                    <button style={{ ...S.nextBtn, background: accent }} onClick={() => setMkStep(2)}>Next →</button>
                  </div>
                </>
              )}

              {mkStep === 2 && (
                <>
                  <div style={S.qHead}>{Q_SINGER}</div>
                  <div style={S.tilesGrid}>
                    {SINGERS.map((s) => {
                      const active = singer === s.id;
                      return (
                        <button key={s.id} onClick={() => chooseSinger(s)}
                          style={{ ...S.bigTile, borderColor: active ? accent : "transparent", background: active ? "#2c2c48" : "#23243a", boxShadow: active ? "0 0 0 2px " + accent + "55" : "none" }}>
                          <OptionIcon opt={s} cat="singer" size={58} />
                          <span style={S.bigTileLabel}>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button style={{ ...S.goBtn, background: accent, opacity: locking ? 0.85 : 1 }} onClick={startRender} disabled={locking}>
                    {locking ? "Making your song…" : "GO! Make my song"}
                  </button>
                  <div style={S.wizNav}>
                    <button style={S.backBtn} onClick={() => setMkStep(1)}>← Back</button>
                    <button style={S.tweakLink} onClick={() => { const n = !showTweak; setShowTweak(n); if (n) [ "mm_drums_big","mm_guitar_electric","mm_strings_violin" ].forEach((k)=>fetch("/api/sfx?s="+k).catch(()=>{})); }}>
                      {showTweak ? "Hide band" : "Tweak my band"}
                    </button>
                  </div>
                  {showTweak && (
                    <div style={S.tweakPanel}>
                      <TweakRow cat="drums"   label="Drums"   options={DRUMS}   value={drums}   set={setDrums} />
                      <TweakRow cat="guitar"  label="Guitar"  options={GUITARS} value={guitar}  set={setGuitar} />
                      <TweakRow cat="strings" label="Strings" options={STRINGS} value={strings} set={setStrings} />
                      <TweakRow cat="speed"   label="Speed"   options={SPEEDS}  value={speed}   set={setSpeed} />
                    </div>
                  )}
                </>
              )}

              <Recap />
              {status && <div style={S.status}>{status}</div>}
            </div>
          )}
        </div>
      )}

      {tab === "library" && (
        <div style={S.card}>
          <div style={S.songGrid}>
            {songs.map((s) => (
              <div key={s.song_id} style={{ ...S.songCard, borderColor: s.cover_color || "#5B6CFF" }}>
                <CoverThumb url={s.cover_url} vibe={s.vibe} theme={s.theme} color={s.cover_color} size={48} radius={8} seed={s.song_id} label={s.title} />
                <div style={S.songInfo}>
                  <div style={S.songTitle}>{s.title}</div>
                  <div style={S.songMeta}>{(s.vibe || "song")}{s.theme ? " · " + s.theme : ""}</div>
                  <SongPlayer src={s.audio_url} color={s.cover_color || "#5B6CFF"} size={64} />
                </div>
                <button style={{ ...S.shareBtn, display: "inline-flex", alignItems: "center", justifyContent: "center", background: s.published ? "rgba(61,208,106,0.22)" : "rgba(255,255,255,0.08)", color: s.published ? "#7CF6B0" : "#cfc8ff" }} onClick={() => publishSong(s)} title={s.published ? "Published to Top board — tap to make private" : "Publish to the Top board"} aria-label="Publish">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>
                </button>
                <button style={S.shareBtn} onClick={() => shareCreation({ kind: "song", id: s.song_id, title: s.title })} title="Share">↗</button>
                <button style={S.renameBtn} onClick={() => renameSong(s)} title="Rename">Aa</button>
                <button style={S.deleteBtn} onClick={() => deleteSong(s.song_id)} title="Delete">✕</button>
              </div>
            ))}
            {count < MAX_SONGS && (
              <button style={S.addCard} onClick={() => { setTab("make"); setMkStep(0); setDraft(null); }} aria-label="Make a new song">
                <span style={S.addPlus}>+</span><span style={S.addText}>Make a Song</span>
              </button>
            )}
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
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  dots: { display: "flex", gap: 6, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: "50%", background: "#3a3a4f", transition: "all .15s" },
  dotOn: { background: "#FFD93D", width: 22, borderRadius: 99 },
  dotDone: { background: "#5B6CFF" },
  surpriseBtn: { display: "inline-flex", alignItems: "center", gap: 7, background: "#2a2a3a", color: "#e7e7f5", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 800, fontSize: 13 },
  qHead: { fontSize: 22, fontWeight: 900, textAlign: "center", margin: "2px 0 14px" },
  nameToggle: { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", border: "2px solid", borderRadius: 14, padding: "12px 14px", marginBottom: 14, cursor: "pointer", color: "#fff" },
  switch: { position: "relative", width: 38, height: 22, borderRadius: 999, flexShrink: 0, transition: "background .15s" },
  knob: { position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "transform .15s" },
  nameToggleLab: { fontWeight: 800, fontSize: 15 },
  tilesGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  bigTile: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 108, border: "2px solid transparent", borderRadius: 16, padding: "14px 6px", cursor: "pointer", color: "#fff", fontWeight: 700, transition: "transform .1s, border-color .1s, background .1s" },
  bigTileLabel: { fontSize: 13, fontWeight: 700, textAlign: "center" },
  styleGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  styleCard: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 116, border: "2px solid transparent", borderRadius: 16, padding: "16px 8px", cursor: "pointer", color: "#fff", fontWeight: 800, transition: "transform .1s, border-color .1s, background .1s" },
  styleDot: { position: "absolute", top: 10, right: 10, width: 10, height: 10, borderRadius: "50%" },
  styleLabel: { fontSize: 15, fontWeight: 800, textAlign: "center" },
  wizNav: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 12 },
  backBtn: { background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15, padding: "10px 6px" },
  nextBtn: { color: "#1a1a2a", border: "none", borderRadius: 14, padding: "12px 30px", cursor: "pointer", fontWeight: 900, fontSize: 16 },
  goBtn: { width: "100%", marginTop: 16, padding: "18px", fontSize: 21, fontWeight: 900, color: "#1a1a2a", border: "none", borderRadius: 16, cursor: "pointer", animation: "mmPop .25s ease" },
  tweakLink: { background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 14, padding: "10px 6px" },
  tweakPanel: { marginTop: 14, borderTop: "1px solid #2a2a3f", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 },
  tweakRow: {},
  tweakLabel: { fontSize: 12, color: "#8e8eb5", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, marginBottom: 6 },
  tweakOpts: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  tweakChip: { flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 72, border: "2px solid transparent", borderRadius: 12, padding: "8px 4px", cursor: "pointer", color: "#fff" },
  tweakChipLab: { fontSize: 11, fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box", marginTop: 12, padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "2px solid #3a3a4a", background: "#11111a", color: "#fff", outline: "none" },
  recapWrap: { marginTop: 20, borderTop: "1px solid #2a2a3f", paddingTop: 14 },
  recapHead: { fontSize: 12, color: "#9a9ac0", textAlign: "center", marginBottom: 10, fontWeight: 600 },
  recapStrip: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  recapChip: { display: "inline-flex", alignItems: "center", gap: 7, background: "#23243a", border: "none", borderRadius: 999, padding: "6px 12px 6px 6px", cursor: "pointer", color: "#fff" },
  recapLab: { fontSize: 12, fontWeight: 800 },
  loaderWrap: { textAlign: "center", padding: "34px 0" },
  eqRow: { display: "flex", gap: 6, justifyContent: "center", alignItems: "flex-end", height: 46, marginBottom: 14 },
  eqBar: { width: 9, height: 46, borderRadius: 5, transformOrigin: "bottom", animation: "mmEq .9s ease-in-out infinite" },
  loaderMsg: { fontSize: 16, fontWeight: 700, color: "#e7e7f5" },
  draft: { padding: 16, borderRadius: 14, border: "2px solid", background: "#11111a" },
  draftTitle: { fontSize: 18, fontWeight: 800, marginBottom: 6 },
  recipe: { fontSize: 13, color: "#b9b9d0", marginBottom: 10, fontWeight: 600 },
  draftBtns: { display: "flex", gap: 10, marginTop: 12 },
  keepBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px", fontWeight: 800, color: "#1a1a2a", border: "none", borderRadius: 14, cursor: "pointer" },
  againBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px", fontWeight: 700, color: "#fff", background: "#2a2a3a", border: "none", borderRadius: 14, cursor: "pointer" },
  btnCap: { fontSize: 13, fontWeight: 800 },
  revealSaveBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", maxWidth: 340, margin: "10px auto 0", padding: "12px", fontSize: 16, fontWeight: 800, color: "#fff", background: "rgba(255,255,255,0.10)", border: "2px solid rgba(255,255,255,0.28)", borderRadius: 14, cursor: "pointer" },
  tweakBtn: { display: "block", margin: "12px auto 0", background: "transparent", color: "#9a9ac0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14 },
  status: { marginTop: 14, textAlign: "center", color: "#FFD93D", fontWeight: 700 },
  songGrid: { display: "flex", flexDirection: "column", gap: 12 },
  songCard: { display: "flex", alignItems: "center", gap: 12, background: "#11111a", border: "2px solid", borderRadius: 14, padding: 12 },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontWeight: 800, fontSize: 15, marginBottom: 2 },
  songMeta: { fontSize: 12, color: "#aaa", marginBottom: 6, textTransform: "capitalize" },
  shareBtn: { background: "rgba(124,108,255,0.25)", color: "#cfc8ff", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0, fontSize: 16 },
  renameBtn: { background: "#2a2a3a", color: "#e7e7f5", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0, fontSize: 13 },
  deleteBtn: { background: "#2a2a3a", color: "#ff8080", border: "none", borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontWeight: 800, flexShrink: 0 },
  fullNote: { marginTop: 14, textAlign: "center", color: "#FF8FB1", fontWeight: 700 },
  addCard: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(124,108,255,0.10)", border: "2px dashed rgba(124,108,255,0.5)", borderRadius: 14, padding: "18px", cursor: "pointer" },
  addPlus: { fontSize: "clamp(20px, 5vw, 30px)", fontWeight: 900, lineHeight: 1, color: "#cfc8ff" },
  addText: { fontSize: 16, fontWeight: 800, color: "#fff" },

  // MM2 — title reveal ("prize") + playback header + pack lock/price badges.
  revealWrap: { textAlign: "center", padding: "8px 0 6px", animation: "mmReveal .5s cubic-bezier(.2,.9,.3,1.4) both" },
  revealBadge: { display: "inline-block", background: "#FFD24A", color: "#5a3d00", fontWeight: 900, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", borderRadius: 999, padding: "5px 14px", marginBottom: 12 },
  revealCover: { width: 200, maxWidth: "72%", margin: "0 auto 14px", aspectRatio: "1", borderRadius: 20, overflow: "hidden", border: "3px solid", boxShadow: "0 16px 40px rgba(0,0,0,.45)" },
  revealTitle: { display: "inline-flex", alignItems: "center", gap: 8, maxWidth: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 22, fontWeight: 900, cursor: "pointer", padding: "4px 8px", margin: "0 auto 4px" },
  titleInput: { width: "88%", boxSizing: "border-box", margin: "0 auto 8px", display: "block", padding: "10px 14px", fontSize: 20, fontWeight: 900, textAlign: "center", borderRadius: 12, border: "2px solid", background: "#11111a", color: "#fff", outline: "none" },
  playPrizeBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", maxWidth: 340, margin: "10px auto 0", padding: "16px", fontSize: 20, fontWeight: 900, color: "#15131f", border: "none", borderRadius: 16, cursor: "pointer", animation: "mmPop .3s ease" },
  playHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 },
  playCover: { width: 64, height: 64, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: "2px solid" },
  lockBadge: { position: "absolute", top: -6, right: -8, width: 22, height: 22, borderRadius: "50%", background: "#FFD24A", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,.4)" },
  pricePill: { display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, background: "rgba(0,0,0,0.35)", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 900, color: "#fff" },
  coinDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
};
