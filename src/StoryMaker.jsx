// /src/StoryMaker.jsx
// Buildable Stories — the kid-facing entry to the Stories product mode.
// REDESIGN (quiz wizard): one big illustrated question per screen (no long scroll),
// a talking owl guide that reads each question aloud + speaks an option when tapped
// (browser speech — output only, never records the child), and a "story so far" strip
// that fills in with pictures as choices are made. All controlled tap choices; the only
// free text is the (optional, pre-filled) hero name. The generator/reader are unchanged.
import { useState, useEffect, useRef } from "react";
import StoryReader from "./StoryReader";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

const HEROES = [["bunny","🐰","Bunny"],["dragon","🐲","Dragon"],["robot","🤖","Robot"],["kitten","🐱","Kitten"],["astronaut","🧑‍🚀","Astronaut"],["mermaid","🧜","Mermaid"],["fox","🦊","Fox"],["knight","🛡️","Knight"]];
const GENDERS = [["girl","👧","Girl"],["boy","👦","Boy"],["neutral","🙂","Either"]];
const WORLDS = [["snowy_forest","🌲","Snowy forest"],["outer_space","🚀","Outer space"],["underwater","🌊","Underwater"],["candy_land","🍭","Candy land"],["enchanted_woods","🍄","Enchanted woods"],["desert_oasis","🏜️","Desert oasis"],["cloud_castle","☁️","Cloud castle"],["pirate_cove","🏴‍☠️","Pirate cove"]];
const PROBLEMS = [["lost_friend","🔍","A lost friend"],["missing_star","⭐","A missing star"],["big_storm","⛈️","A big storm"],["locked_door","🚪","A magic door"],["hungry_creature","🍎","A hungry creature"],["broken_bridge","🌉","A broken bridge"]];
const HELPERS = [["wise_owl","🦉","Wise owl"],["talking_map","🗺️","Talking map"],["glowing_firefly","✨","Firefly"],["old_turtle","🐢","Clever turtle"],["friendly_ghost","👻","Friendly ghost"],["singing_bird","🐦","Singing bird"]];
const TONES = [["cozy","🔥","Cozy"],["funny","😄","Funny"],["adventurous","🗺️","Adventurous"],["magical","🪄","Magical"],["brave","🦁","Brave"]];
const ENDINGS = [["happy","🎉","Happy"],["surprise","🎁","Surprise"],["friendship","💞","Friendship"],["cozy_sleep","🌙","Sleepy"]];
const STYLES = [["watercolor","🎨","Watercolor"],["modern3d","🧸","Modern 3D"],["papercut","✂️","Paper cut-out"],["crayon","🖍️","Crayon"],["comic","💥","Comic"],["claymation","🪅","Clay"]];

function getDeviceId() {
  try { let id = localStorage.getItem("deviceId"); if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); } return id; }
  catch { return "dev_anon"; }
}
function getKidProfileId() {
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; } catch { return null; }
}
function emojiOf(opts, id) { const o = opts.find((x) => x[0] === id); return o ? o[1] : "❓"; }

export default function StoryMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [view, setView] = useState("landing");   // landing | wizard | generating | reading
  const [step, setStep] = useState(0);
  const [guideOn, setGuideOn] = useState(true);

  const [hero, setHero] = useState("bunny");
  const [heroName, setHeroName] = useState(playerName || "");
  const [gender, setGender] = useState("girl");
  const [world, setWorld] = useState("snowy_forest");
  const [problem, setProblem] = useState("lost_friend");
  const [helper, setHelper] = useState("wise_owl");
  const [tone, setTone] = useState("cozy");
  const [ending, setEnding] = useState("happy");
  const [artStyle, setArtStyle] = useState("watercolor");

  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [genMsg, setGenMsg] = useState("Writing your story…");
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const STEPS = [
    { key: "hero",    q: "Who is your hero?",                 opts: HEROES,   val: hero,     set: setHero },
    { key: "gender",  q: "Is the hero a girl or a boy?",      opts: GENDERS,  val: gender,   set: setGender },
    { key: "world",   q: "Where does the story happen?",      opts: WORLDS,   val: world,    set: setWorld },
    { key: "problem", q: "What's the problem?",               opts: PROBLEMS, val: problem,  set: setProblem },
    { key: "helper",  q: "Who helps out?",                    opts: HELPERS,  val: helper,   set: setHelper },
    { key: "tone",    q: "What's the feeling?",               opts: TONES,    val: tone,     set: setTone },
    { key: "ending",  q: "How does it end?",                  opts: ENDINGS,  val: ending,   set: setEnding },
    { key: "style",   q: "What should the pictures look like?", opts: STYLES, val: artStyle, set: setArtStyle, thumbs: true },
  ];
  const last = STEPS.length - 1;
  const cur = STEPS[Math.min(step, last)];

  function speak(text) {
    if (!guideOn || typeof window === "undefined" || !window.speechSynthesis) return;
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1.1; window.speechSynthesis.speak(u); } catch {}
  }
  // Read the question aloud whenever the step changes (only in the wizard).
  useEffect(() => { if (view === "wizard") speak(cur.q); }, [step, view]); // eslint-disable-line

  async function loadSaved() {
    try { const r = await fetch("/api/list-stories?deviceId=" + encodeURIComponent(deviceId) + (kidProfileId ? "&kidProfileId=" + encodeURIComponent(kidProfileId) : "")); const j = await r.json(); setSaved(Array.isArray(j.stories) ? j.stories : []); }
    catch { /* ignore */ }
  }
  useEffect(() => { loadSaved(); }, []);

  function startWizard() { setStep(0); setError(null); setView("wizard"); }

  function choose(stepObj, id, label) {
    stepObj.set(id);
    speak(label);
    if (step < last) setTimeout(() => setStep((s) => Math.min(last, s + 1)), 260);
  }

  async function prefetchArt(s, indices) {
    await Promise.all(indices.map(async (i) => {
      const p = s.pages[i]; if (!p || p.art_url) return;
      try { const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 42000);
        const r = await fetch("/api/generate-story-art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artPrompt: p.art_prompt, world: s.world, style: s.art_style }), signal: ctrl.signal });
        const j = await r.json(); clearTimeout(to); if (j && j.url) p.art_url = j.url;
      } catch {}
    }));
  }

  // #5 — a brand-new adventure reusing the SAME characters (consistent look + names).
  async function makeSequel(prev) {
    const c = (prev && prev.created_with) || {};
    // Pick a fresh problem so it's a different adventure, not a repeat.
    const problems = PROBLEMS.map((p) => p[0]).filter((p) => p !== c.problem);
    const newProblem = problems[Math.floor(Math.random() * problems.length)] || c.problem;
    setError(null); setGenMsg("Starting a new adventure…"); setView("generating");
    try {
      const r = await fetch("/api/generate-story", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choices: { ...c, problem: newProblem, twist: "" }, priorCharacterSheet: prev.character_sheet || "", age: 6, deviceId, kidProfileId }) });
      const j = await r.json();
      if (!(j && j.ok && j.story)) { setError("Hmm, that didn't work. Try again!"); setView("reading"); return; }
      const sNew = j.story; sNew.art_style = (prev && prev.art_style) || artStyle;
      setStory(sNew); setSavedMsg(""); setView("reading");
    } catch { setError("Hmm, that didn't work. Try again!"); setView("reading"); }
  }

  async function makeStory() {
    setError(null); setGenMsg("Writing your story…"); setView("generating");
    try {
      const r = await fetch("/api/generate-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choices: { hero, heroName, gender, world, problem, helper, tone, ending, twist: "" }, age: 6, deviceId, kidProfileId }) });
      const j = await r.json();
      if (!(j && j.ok && j.story)) { setError("Hmm, that didn't work. Try again!"); setView("wizard"); return; }
      const s = j.story; s.art_style = artStyle;
      setStory(s); setSavedMsg(""); setView("reading");
    } catch { setError("Hmm, that didn't work. Try again!"); setView("wizard"); }
  }

  async function saveStory(enriched) {
    const toSave = enriched && enriched.pages ? enriched : story;
    if (!toSave) return;
    setSaving(true); setSavedMsg("");
    try {
      const r = await fetch("/api/save-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ story: toSave, deviceId, kidProfileId, kidName: heroName || playerName || "", coverColor: "#7a4a86" }) });
      const j = await r.json();
      if (r.ok && j.ok) { setSavedMsg("Saved to your library! 📚"); loadSaved(); }
      else if (r.status === 409) setSavedMsg(j.message || "Your library is full!");
      else setSavedMsg("Couldn't save — " + (j.detail || j.error || ("error " + r.status)));
    } catch (e) { setSavedMsg("Couldn't save — " + ((e && e.message) || "network error")); }
    finally { setSaving(false); }
  }

  async function openSaved(storyId) {
    try { const r = await fetch("/api/list-stories?storyId=" + encodeURIComponent(storyId)); const j = await r.json(); if (j && j.story && j.story.story) { setStory(j.story.story); setSavedMsg(""); setView("reading"); } } catch {}
  }
  async function deleteSaved(storyId) {
    try { await fetch("/api/delete-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, storyId }) }); setSaved((p) => p.filter((x) => x.story_id !== storyId)); } catch {}
  }

  // ---------- READING ----------
  if (view === "reading" && story) {
    return <StoryReader story={story} deviceId={deviceId} kidProfileId={kidProfileId}
      onExit={() => setView("landing")} onSave={saveStory} saving={saving} savedMsg={savedMsg} onNewAdventure={makeSequel} />;
  }

  // ---------- GENERATING ----------
  if (view === "generating") {
    return (
      <div style={{ ...s.container, justifyContent: "center" }}>
        <div style={{ fontSize: 64 }}>📖</div>
        <h2 style={s.genTitle}>{genMsg}</h2>
        <p style={s.genSub}>Dreaming up your hero, your world, and painting the pictures.</p>
      </div>
    );
  }

  // ---------- WIZARD ----------
  if (view === "wizard") {
    return (
      <div style={s.container}>
        <div style={s.topBar}>
          <button style={s.navBtn} onClick={() => (step > 0 ? setStep((x) => x - 1) : setView("landing"))}>← Back</button>
          <button style={s.iconBtn} onClick={() => setGuideOn((v) => !v)} title="Owl voice">{guideOn ? "🔊" : "🔇"}</button>
        </div>

        {/* story so far */}
        <div style={s.strip}>
          {STEPS.map((st, i) => (
            <div key={st.key} style={{ ...s.chip, ...(i === step ? s.chipNow : {}), ...(i > step ? s.chipTodo : {}) }}>
              {i <= step ? emojiOf(st.opts, st.val) : "•"}
            </div>
          ))}
        </div>

        {/* talking guide */}
        <div style={s.guideRow}>
          <div style={s.owl}>🦉</div>
          <button style={s.bubble} onClick={() => speak(cur.q)}>
            {cur.q} <span style={s.speaker}>🔊</span>
          </button>
        </div>

        {/* options */}
        <div style={s.optGrid}>
          {cur.opts.map(([id, emoji, label]) => (
            <button key={id} onClick={() => choose(cur, id, label)} style={{ ...s.optTile, ...(cur.val === id ? s.optOn : {}) }}>
              {cur.thumbs
                ? <img src={"/api/story-style-sample?style=" + id} alt={label} style={s.optThumb} loading="lazy" />
                : <span style={s.optEmoji}>{emoji}</span>}
              <span style={s.optLabel}>{label}</span>
            </button>
          ))}
        </div>

        {error && <p style={s.error}>{error}</p>}

        {step === last && (
          <button style={s.makeBtn} onClick={makeStory}>📖 Make my story!</button>
        )}
      </div>
    );
  }

  // ---------- LANDING (library + start) ----------
  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onBack || onHome}>← Back</button>
        <button style={s.navBtn} onClick={onHome}>🏠 Home</button>
      </div>
      <h1 style={s.logo}>Stories</h1>
      <p style={s.tagline}>Make a magical picture book — just tap!</p>

      <button style={s.startBtn} onClick={startWizard}>✨ Make a new story</button>

      {saved.length > 0 && (
        <div style={s.savedWrap}>
          <h3 style={s.sectionTitle}>📚 My stories</h3>
          <div style={s.savedRow}>
            {saved.map((st) => (
              <div key={st.story_id} style={s.savedCard}>
                <button style={s.savedOpen} onClick={() => openSaved(st.story_id)}>📖 {st.title}</button>
                <button style={s.savedDel} onClick={() => deleteSaved(st.story_id)}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 50px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 820, display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  navBtn: { padding: "11px 20px", background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  iconBtn: { width: 46, height: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 18, cursor: "pointer" },
  logo: { fontFamily: FRED, fontSize: "clamp(34px,7vw,52px)", fontWeight: 700, background: "linear-gradient(90deg,#9b7edd,#c06b99,#d65a7b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "8px 0 6px", textAlign: "center" },
  tagline: { fontSize: 17, color: "#b8b3d0", textAlign: "center", marginBottom: 22, fontWeight: 600 },
  startBtn: { padding: "20px 32px", borderRadius: 20, border: "none", background: GRAD, color: "#fff", fontSize: 24, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 12px 34px rgba(155,126,221,0.5)", marginBottom: 24 },
  // wizard
  strip: { width: "100%", maxWidth: 560, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: { width: 40, height: 40, borderRadius: 12, background: "rgba(124,92,214,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 },
  chipNow: { boxShadow: "0 0 0 3px #ffd66b" },
  chipTodo: { background: "rgba(255,255,255,0.06)", border: "2px dashed rgba(255,255,255,0.18)", color: "#6a5c92" },
  guideRow: { width: "100%", maxWidth: 660, display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  owl: { width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#9b7edd,#d6638b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flex: "none" },
  bubble: { flex: 1, textAlign: "left", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 16, borderBottomLeftRadius: 4, padding: "12px 16px", color: "#fff", fontFamily: FRED, fontSize: "clamp(18px,3.4vw,24px)", fontWeight: 700, cursor: "pointer" },
  speaker: { fontSize: 16, opacity: 0.7 },
  optGrid: { width: "100%", maxWidth: 660, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 14, marginBottom: 16 },
  optTile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 10px", borderRadius: 20, border: "3px solid transparent", background: "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", fontFamily: NUN },
  optOn: { border: "3px solid #ffd66b", background: "rgba(255,255,255,0.16)", boxShadow: "0 8px 22px rgba(155,126,221,0.45)" },
  optEmoji: { fontSize: 46 },
  optThumb: { width: 92, height: 92, borderRadius: 14, objectFit: "cover", background: "rgba(255,255,255,0.06)" },
  optLabel: { fontSize: 15, fontWeight: 800 },
  makeBtn: { padding: "18px 30px", borderRadius: 18, border: "none", background: GRAD, color: "#fff", fontSize: 22, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.5)", marginTop: 4 },
  error: { color: "#ffd7d7", background: "rgba(180,40,40,0.25)", borderRadius: 10, padding: "8px 12px", fontSize: 15, textAlign: "center" },
  genTitle: { fontFamily: FRED, fontSize: 30, fontWeight: 700, margin: "16px 0 6px" },
  genSub: { fontSize: 16, color: "#b8b3d0", textAlign: "center" },
  // library
  sectionTitle: { fontFamily: FRED, fontSize: 19, fontWeight: 700, margin: "0 0 12px" },
  savedWrap: { width: "100%", maxWidth: 820 },
  savedRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  savedCard: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "6px 8px 6px 6px" },
  savedOpen: { background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontFamily: NUN, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  savedDel: { background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, padding: "8px", cursor: "pointer" },
};
