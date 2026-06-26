// /src/StoryMaker.jsx  (v2 — LIBRARY picker)
// Kid-facing entry to Stories. Three tappy picks — STYLE -> CHARACTER -> WORLD —
// from the reusable art library, then a confirm/name screen and "Make my story".
// The writer (api/generate-story) builds a 6-page arc that moves between library
// worlds and tags each page with an emotion; the reader layers the cached art.
import { useState, useEffect } from "react";
import StoryReader from "./StoryReader";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

// style id, label, emoji, enabled? (only watercolor art is built so far)
const STYLES = [
  ["watercolor", "Watercolor", "🎨", true],
  ["modern3d", "Modern 3D", "🧸", false],
  ["papercut", "Paper cut-out", "✂️", false],
];
const CHARACTERS = [
  ["bunny","Bramble Bunny"],["fox","Pip Fox"],["bear","Biscuit Bear"],["penguin","Waddle Penguin"],
  ["dragon","Ember Dragon"],["owl","Professor Owl"],["turtle","Shelby Turtle"],["hedgehog","Quill Hedgehog"],
  ["koala","Coco Koala"],["tiger","Tilly Tiger"],["fawn","Willow Fawn"],["otter","Ollie Otter"],
  ["wizard","Milo Wizard"],["fairy","Petal Fairy"],["robot","Bolt Robot"],["mermaid","Marina Mermaid"],
];
const WORLDS = [
  ["snowy-village","Snowy Village"],["coral-reef","Coral Reef"],["enchanted-forest","Enchanted Forest"],["dragon-mountain","Dragon Mountain"],
  ["dino-jungle","Dino Jungle"],["space-station","Starlight Space"],["desert-oasis","Desert Oasis"],["candy-land","Candy Land"],
];
const DEFAULT_NAME = Object.fromEntries(CHARACTERS);

function getDeviceId() {
  try { let id = localStorage.getItem("deviceId"); if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); } return id; }
  catch { return "dev_anon"; }
}
function getKidProfileId() { try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; } }
function libImg(kind, slug, style, emo) { return "/api/story-library?img=" + kind + ":" + slug + "&style=" + (style || "watercolor") + (emo ? "&emo=" + emo : ""); }

export default function StoryMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [view, setView] = useState("landing");   // landing | pick | ready | generating | reading
  const [substep, setSubstep] = useState(0);      // 0 style | 1 character | 2 world

  const [style, setStyle] = useState("watercolor");
  const [character, setCharacter] = useState(null);
  const [world, setWorld] = useState(null);
  const [name, setName] = useState("");

  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [genMsg, setGenMsg] = useState("Writing your story…");
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [currentStoryId, setCurrentStoryId] = useState(null);

  async function loadSaved() {
    try { const r = await fetch("/api/list-stories?deviceId=" + encodeURIComponent(deviceId) + (kidProfileId ? "&kidProfileId=" + encodeURIComponent(kidProfileId) : "")); const j = await r.json(); setSaved(Array.isArray(j.stories) ? j.stories : []); }
    catch {}
  }
  useEffect(() => { loadSaved(); }, []);

  function startPicker() { setError(null); setSubstep(0); setStyle("watercolor"); setCharacter(null); setWorld(null); setName(""); setView("pick"); }

  function chooseStyle(id, enabled) { if (!enabled) return; setStyle(id); setSubstep(1); }
  function chooseCharacter(slug) { setCharacter(slug); setName(DEFAULT_NAME[slug] || ""); setSubstep(2); }
  function chooseWorld(slug) { setWorld(slug); setView("ready"); }

  async function makeStory() {
    setError(null); setGenMsg("Writing your story…"); setView("generating");
    try {
      const r = await fetch("/api/generate-story", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, characterSlug: character, characterName: name, worldSlug: world, age: 6, deviceId, kidProfileId }) });
      const j = await r.json();
      if (!(j && j.ok && j.story)) { setError("Hmm, that didn't work. Try again!"); setView("ready"); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    } catch { setError("Hmm, that didn't work. Try again!"); setView("ready"); }
  }

  async function makeSequel(prev) {
    const c = (prev && prev.created_with) || {};
    setError(null); setGenMsg("Starting a new adventure…"); setView("generating");
    try {
      const r = await fetch("/api/generate-story", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: c.style || style, characterSlug: c.characterSlug || character, characterName: c.characterName || name, worldSlug: c.worldSlug || world, age: 6, deviceId, kidProfileId }) });
      const j = await r.json();
      if (!(j && j.ok && j.story)) { setError("Hmm, that didn't work. Try again!"); setView("reading"); return; }
      setStory(j.story); setSavedMsg(""); setCurrentStoryId(null); setView("reading");
    } catch { setError("Hmm, that didn't work. Try again!"); setView("reading"); }
  }

  async function saveStory(toSave) {
    if (!toSave || !toSave.pages) toSave = story;
    if (!toSave) return;
    setSaving(true); setSavedMsg("");
    try {
      const r = await fetch("/api/save-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ story: toSave, deviceId, kidProfileId, kidName: name || playerName || "", coverColor: "#7a4a86" }) });
      const j = await r.json();
      if (r.ok && j.ok) { setSavedMsg("Saved to your library! 📚"); if (j.story && j.story.story_id) setCurrentStoryId(j.story.story_id); loadSaved(); }
      else if (r.status === 409) setSavedMsg(j.message || "Your library is full!");
      else setSavedMsg("Couldn't save — " + (j.detail || j.error || ("error " + r.status)));
    } catch (e) { setSavedMsg("Couldn't save — " + ((e && e.message) || "network error")); }
    finally { setSaving(false); }
  }

  async function openSaved(storyId) {
    try { const r = await fetch("/api/list-stories?storyId=" + encodeURIComponent(storyId)); const j = await r.json(); if (j && j.story && j.story.story) { setStory(j.story.story); setSavedMsg(""); setCurrentStoryId(storyId); setView("reading"); } } catch {}
  }
  async function deleteSaved(storyId) {
    try { await fetch("/api/delete-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, storyId }) }); setSaved((p) => p.filter((x) => x.story_id !== storyId)); } catch {}
  }

  // ---------- READING ----------
  if (view === "reading" && story) {
    return <StoryReader story={story} storyId={currentStoryId} deviceId={deviceId} kidProfileId={kidProfileId}
      onExit={() => setView("landing")} onSave={saveStory} saving={saving} savedMsg={savedMsg} onNewAdventure={makeSequel} />;
  }

  // ---------- GENERATING ----------
  if (view === "generating") {
    return (
      <div style={{ ...s.container, justifyContent: "center" }}>
        <div style={{ fontSize: 64 }}>📖</div>
        <h2 style={s.genTitle}>{genMsg}</h2>
        <p style={s.genSub}>Dreaming up the adventure…</p>
      </div>
    );
  }

  // ---------- READY / CONFIRM ----------
  if (view === "ready") {
    return (
      <div style={s.container}>
        <div style={s.topBar}>
          <button style={s.navBtn} onClick={() => { setSubstep(2); setView("pick"); }}>← Back</button>
          <button style={s.navBtn} onClick={onHome}>🏠 Home</button>
        </div>
        <h2 style={s.readyTitle}>Ready to make your story?</h2>
        <div style={s.reviewRow}>
          <div style={s.reviewCard}><img src={libImg("character", character, "watercolor", "happy")} alt="" style={s.reviewImg} /><span style={s.reviewLbl}>{name}</span></div>
          <div style={s.plus}>+</div>
          <div style={s.reviewCard}><img src={libImg("world", world, "watercolor")} alt="" style={{ ...s.reviewImg, objectFit: "cover" }} /><span style={s.reviewLbl}>{(WORLDS.find((w) => w[0] === world) || [,""])[1]}</span></div>
        </div>
        <label style={s.nameLbl}>Name your hero</label>
        <input style={s.nameInput} value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder="Hero name" />
        {error && <p style={s.error}>{error}</p>}
        <button style={s.makeBtn} onClick={makeStory}>📖 Make my story!</button>
      </div>
    );
  }

  // ---------- PICKER ----------
  if (view === "pick") {
    const titles = ["Pick a look", "Pick your hero", "Pick a world"];
    return (
      <div style={s.container}>
        <div style={s.topBar}>
          <button style={s.navBtn} onClick={() => (substep > 0 ? setSubstep((x) => x - 1) : setView("landing"))}>← Back</button>
          <button style={s.navBtn} onClick={onHome}>🏠 Home</button>
        </div>
        <div style={s.dots}>{[0, 1, 2].map((i) => <div key={i} style={{ ...s.dot, ...(i === substep ? s.dotOn : {}), ...(i < substep ? s.dotDone : {}) }} />)}</div>
        <h2 style={s.qTitle}>{titles[substep]}</h2>

        {substep === 0 && (
          <div style={s.styleRow}>
            {STYLES.map(([id, label, emoji, enabled]) => (
              <button key={id} onClick={() => chooseStyle(id, enabled)} disabled={!enabled} style={{ ...s.styleTile, ...(style === id ? s.tileOn : {}), ...(!enabled ? s.tileSoon : {}) }}>
                <span style={{ fontSize: 38 }}>{emoji}</span>
                <span style={s.tileLabel}>{label}</span>
                {!enabled && <span style={s.soon}>Soon</span>}
              </button>
            ))}
          </div>
        )}

        {substep === 1 && (
          <div style={s.grid}>
            {CHARACTERS.map(([slug, label]) => (
              <button key={slug} onClick={() => chooseCharacter(slug)} style={{ ...s.gTile, ...(character === slug ? s.tileOn : {}) }}>
                <img src={libImg("character", slug, "watercolor", "happy")} alt={label} loading="lazy" style={s.gImgChar} />
                <span style={s.gLabel}>{label}</span>
              </button>
            ))}
          </div>
        )}

        {substep === 2 && (
          <div style={s.grid}>
            {WORLDS.map(([slug, label]) => (
              <button key={slug} onClick={() => chooseWorld(slug)} style={{ ...s.gTile, ...(world === slug ? s.tileOn : {}) }}>
                <img src={libImg("world", slug, "watercolor")} alt={label} loading="lazy" style={s.gImgWorld} />
                <span style={s.gLabel}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- LANDING ----------
  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onBack || onHome}>← Back</button>
        <button style={s.navBtn} onClick={onHome}>🏠 Home</button>
      </div>
      <h1 style={s.logo}>Stories</h1>
      <p style={s.tagline}>Make a magical picture book — just tap!</p>
      <button style={s.startBtn} onClick={startPicker}>✨ Make a new story</button>

      {saved.length > 0 && (
        <div style={s.savedWrap}>
          <h3 style={s.sectionTitle}>📚 My stories</h3>
          <div style={s.savedRow}>
            {saved.map((st) => (
              <div key={st.story_id} style={s.savedCard}>
                <button style={s.savedOpen} onClick={() => openSaved(st.story_id)}>
                  <div style={{ ...s.savedCover, background: st.cover_color || "#7a4a86" }}>📖</div>
                  <span style={s.savedName}>{st.title}</span>
                </button>
                <button style={s.savedDel} onClick={() => deleteSaved(st.story_id)} title="Delete">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 60px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 760, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  navBtn: { padding: "10px 18px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  logo: { fontFamily: FRED, fontSize: 44, margin: "30px 0 6px", background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  tagline: { opacity: 0.8, marginBottom: 26, fontSize: 16 },
  startBtn: { padding: "16px 34px", borderRadius: 18, border: "none", background: GRAD, color: "#fff", fontSize: 19, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.5)" },
  dots: { display: "flex", gap: 8, marginTop: 6, marginBottom: 14 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#39406e" },
  dotOn: { background: "#c06b99" }, dotDone: { background: "#7aa2ff" },
  qTitle: { fontFamily: FRED, fontSize: 26, margin: "2px 0 18px", textAlign: "center" },
  styleRow: { display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" },
  styleTile: { position: "relative", width: 150, height: 130, borderRadius: 18, border: "2px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", fontFamily: FRED },
  tileLabel: { fontSize: 15, fontWeight: 700 },
  tileSoon: { opacity: 0.4, cursor: "not-allowed" },
  soon: { position: "absolute", top: 8, right: 8, fontSize: 11, background: "rgba(255,255,255,0.2)", padding: "2px 7px", borderRadius: 999 },
  tileOn: { border: "2px solid #ffe08a", boxShadow: "0 0 0 3px rgba(255,224,138,0.3)" },
  grid: { width: "100%", maxWidth: 760, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12 },
  gTile: { borderRadius: 16, border: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: NUN },
  gImgChar: { width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: 12, background: "rgba(255,255,255,0.05)" },
  gImgWorld: { width: "100%", aspectRatio: "1/1", objectFit: "cover", borderRadius: 12 },
  gLabel: { fontSize: 13, fontWeight: 700, textAlign: "center" },
  readyTitle: { fontFamily: FRED, fontSize: 26, margin: "10px 0 20px", textAlign: "center" },
  reviewRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 22 },
  reviewCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 160 },
  reviewImg: { width: 160, height: 160, objectFit: "contain", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
  reviewLbl: { fontSize: 14, fontWeight: 700 },
  plus: { fontSize: 30, opacity: 0.7 },
  nameLbl: { fontSize: 14, opacity: 0.8, marginBottom: 6 },
  nameInput: { padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 17, fontFamily: FRED, textAlign: "center", marginBottom: 18, width: 240, maxWidth: "80%" },
  makeBtn: { padding: "16px 34px", borderRadius: 18, border: "none", background: GRAD, color: "#fff", fontSize: 19, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.5)" },
  error: { color: "#ffb0c0", fontSize: 14, marginBottom: 10 },
  genTitle: { fontFamily: FRED, fontSize: 26, margin: "16px 0 6px" },
  genSub: { opacity: 0.7 },
  savedWrap: { width: "100%", maxWidth: 760, marginTop: 40 },
  sectionTitle: { fontFamily: FRED, fontSize: 20, marginBottom: 12 },
  savedRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  savedCard: { position: "relative" },
  savedOpen: { width: 130, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  savedCover: { width: 130, height: 90, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 },
  savedName: { fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "center" },
  savedDel: { position: "absolute", top: -6, right: -6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 13 },
};
