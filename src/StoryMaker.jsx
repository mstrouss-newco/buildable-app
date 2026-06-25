// /src/StoryMaker.jsx
// Buildable Stories — the kid-facing entry to the Stories product mode.
// Flow: guided "Mad-Libs" builder (tap choices, almost no typing) -> POST
// /api/generate-story -> open the living picture book in <StoryReader>. Also lists
// the child's saved stories so they can re-read or delete them.
//
// Inputs are CONTROLLED tap choices (safe by construction); the only free text is
// an optional name + an optional "twist", both length-capped and server-moderated.
import { useState, useEffect } from "react";
import StoryReader from "./StoryReader";

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";
const GRAD = "linear-gradient(135deg, #9b7edd 0%, #c06b99 50%, #d65a7b 100%)";

// Option lists — ids MUST match the maps in api/generate-story.js.
const HEROES = [["bunny","🐰","Bunny"],["dragon","🐲","Dragon"],["robot","🤖","Robot"],["kitten","🐱","Kitten"],["astronaut","🧑‍🚀","Astronaut"],["mermaid","🧜","Mermaid"],["fox","🦊","Fox"],["knight","🛡️","Knight"]];
const WORLDS = [["snowy_forest","🌲","Snowy forest"],["outer_space","🚀","Outer space"],["underwater","🌊","Underwater"],["candy_land","🍭","Candy land"],["enchanted_woods","🍄","Enchanted woods"],["desert_oasis","🏜️","Desert oasis"],["cloud_castle","☁️","Cloud castle"],["pirate_cove","🏴‍☠️","Pirate cove"]];
const PROBLEMS = [["lost_friend","🔍","A lost friend"],["missing_star","⭐","A missing star"],["big_storm","⛈️","A big storm"],["locked_door","🚪","A magic door"],["hungry_creature","🍎","A hungry creature"],["broken_bridge","🌉","A broken bridge"]];
const HELPERS = [["wise_owl","🦉","Wise owl"],["talking_map","🗺️","Talking map"],["glowing_firefly","✨","Firefly"],["old_turtle","🐢","Clever turtle"],["friendly_ghost","👻","Friendly ghost"],["singing_bird","🐦","Singing bird"]];
const TONES = [["cozy","🔥","Cozy"],["funny","😄","Funny"],["adventurous","🗺️","Adventurous"],["magical","🪄","Magical"],["brave","🦁","Brave"]];
const ENDINGS = [["happy","🎉","Happy"],["surprise","🎁","Surprise"],["friendship","💞","Friendship"],["cozy_sleep","🌙","Sleepy"]];
const GENDERS = [["girl","👧","Girl"],["boy","👦","Boy"],["neutral","🙂","Prefer not to say"]];
const STYLES = [["watercolor","🎨","Watercolor"],["modern3d","🧸","Modern 3D"],["papercut","✂️","Paper cut-out"],["crayon","🖍️","Crayon"],["comic","💥","Comic"],["claymation","🪅","Clay"]];

function getDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}
function getKidProfileId() {
  try { const k = JSON.parse(localStorage.getItem("bk_active_kid_v1") || "null"); return k && k.id ? k.id : null; }
  catch { return null; }
}

export default function StoryMaker({ onBack, onHome, playerName }) {
  const deviceId = getDeviceId();
  const kidProfileId = getKidProfileId();
  const [view, setView] = useState("build");   // build | generating | reading
  const [hero, setHero] = useState("bunny");
  const [heroName, setHeroName] = useState(playerName || "");
  const [gender, setGender] = useState("girl");
  const [artStyle, setArtStyle] = useState("watercolor");
  const [world, setWorld] = useState("snowy_forest");
  const [problem, setProblem] = useState("lost_friend");
  const [helper, setHelper] = useState("wise_owl");
  const [tone, setTone] = useState("cozy");
  const [ending, setEnding] = useState("happy");
  const [twist, setTwist] = useState("");
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [genMsg, setGenMsg] = useState("Writing your story…");

  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  async function loadSaved() {
    try {
      const r = await fetch("/api/list-stories?deviceId=" + encodeURIComponent(deviceId) + (kidProfileId ? "&kidProfileId=" + encodeURIComponent(kidProfileId) : ""));
      const j = await r.json();
      setSaved(Array.isArray(j.stories) ? j.stories : []);
    } catch { /* ignore */ }
  }
  useEffect(() => { loadSaved(); }, []);

  // Paint specific pages' art up-front (used before opening the reader so the book
  // never opens on a blank/placeholder page). Times out so it can't hang.
  async function prefetchArt(story, indices) {
    await Promise.all(indices.map(async (i) => {
      const p = story.pages[i];
      if (!p || p.art_url) return;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 42000);
        const r = await fetch("/api/generate-story-art", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artPrompt: p.art_prompt, world: story.world, style: story.art_style }), signal: ctrl.signal,
        });
        const j = await r.json();
        clearTimeout(to);
        if (j && j.url) p.art_url = j.url;
      } catch { /* leave null -> reader shows the scene, then fills in */ }
    }));
  }

  async function makeStory() {
    setError(null); setGenMsg("Writing your story…"); setView("generating");
    try {
      const r = await fetch("/api/generate-story", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choices: { hero, heroName, gender, world, problem, helper, tone, ending, twist }, age: 6, deviceId, kidProfileId }),
      });
      const j = await r.json();
      if (!(j && j.ok && j.story)) { setError("Hmm, that didn't work. Try again!"); setView("build"); return; }
      const story = j.story;
      story.art_style = artStyle;
      // Paint the first two pages before opening so the book starts with real art.
      setGenMsg("Painting your first pages…");
      await prefetchArt(story, [0, 1]);
      setStory(story); setSavedMsg(""); setView("reading");
    } catch { setError("Hmm, that didn't work. Try again!"); setView("build"); }
  }

  async function saveStory(enriched) {
    if (!story) return;
    setSaving(true); setSavedMsg("");
    try {
      const r = await fetch("/api/save-story", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: toSave, deviceId, kidProfileId, kidName: heroName || playerName || "", coverColor: "#7a4a86" }),
      });
      const j = await r.json();
      if (r.ok && j.ok) { setSavedMsg("Saved to your library! 📚"); loadSaved(); }
      else if (r.status === 409) setSavedMsg(j.message || "Your library is full!");
      else setSavedMsg("Couldn't save — " + (j.detail || j.error || ("error " + r.status)));
    } catch (e) { setSavedMsg("Couldn't save — " + ((e && e.message) || "network error")); }
    finally { setSaving(false); }
  }

  async function openSaved(storyId) {
    try {
      const r = await fetch("/api/list-stories?storyId=" + encodeURIComponent(storyId));
      const j = await r.json();
      if (j && j.story && j.story.story) { setStory(j.story.story); setSavedMsg(""); setView("reading"); }
    } catch { /* ignore */ }
  }
  async function deleteSaved(storyId) {
    try {
      await fetch("/api/delete-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId, storyId }) });
      setSaved((prev) => prev.filter((x) => x.story_id !== storyId));
    } catch { /* ignore */ }
  }

  if (view === "reading" && story) {
    return <StoryReader story={story} deviceId={deviceId} kidProfileId={kidProfileId}
      onExit={() => setView("build")} onSave={saveStory} saving={saving} savedMsg={savedMsg} />;
  }

  if (view === "generating") {
    return (
      <div style={{ ...s.container, justifyContent: "center" }}>
        <div style={s.spinner}>📖</div>
        <h2 style={s.genTitle}>{genMsg}</h2>
        <p style={s.genSub}>Dreaming up your hero, your world, and painting the pictures.</p>
      </div>
    );
  }

  const Picker = ({ label, options, value, set }) => (
    <div style={s.section}>
      <h3 style={s.sectionTitle}>{label}</h3>
      <div style={s.tileRow}>
        {options.map(([id, emoji, name]) => (
          <button key={id} onClick={() => set(id)} style={{ ...s.tile, ...(value === id ? s.tileOn : {}) }}>
            <span style={s.tileEmoji}>{emoji}</span>
            <span style={s.tileLabel}>{name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={s.container}>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onBack || onHome}>← Back</button>
        <button style={s.navBtn} onClick={onHome}>🏠 Home</button>
      </div>

      <h1 style={s.logo}>Make a story</h1>
      <p style={s.tagline}>Pick your pieces, then I'll turn them into a picture book!</p>

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

      <div style={s.builder}>
        <Picker label="Who is your hero?" options={HEROES} value={hero} set={setHero} />
        <div style={s.section}>
          <h3 style={s.sectionTitle}>What's their name? (optional)</h3>
          <input style={s.input} value={heroName} maxLength={24} placeholder="e.g. Pip" onChange={(e) => setHeroName(e.target.value)} />
        </div>
        <Picker label="Is the hero a girl or a boy?" options={GENDERS} value={gender} set={setGender} />
        <div style={s.section}>
          <h3 style={s.sectionTitle}>What should the pictures look like?</h3>
          <div style={s.tileRow}>
            {STYLES.map(([id, emoji, name]) => (
              <button key={id} onClick={() => setArtStyle(id)} style={{ ...s.styleTile, ...(artStyle === id ? s.tileOn : {}) }}>
                <img src={"/api/story-style-sample?style=" + id} alt={name} style={s.styleThumb} loading="lazy" />
                <span style={s.tileLabel}>{emoji} {name}</span>
              </button>
            ))}
          </div>
        </div>
        <Picker label="Where does it happen?" options={WORLDS} value={world} set={setWorld} />
        <Picker label="What's the problem?" options={PROBLEMS} value={problem} set={setProblem} />
        <Picker label="Who helps out?" options={HELPERS} value={helper} set={setHelper} />
        <Picker label="What's the feeling?" options={TONES} value={tone} set={setTone} />
        <Picker label="How does it end?" options={ENDINGS} value={ending} set={setEnding} />
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Add a fun twist? (optional)</h3>
          <input style={s.input} value={twist} maxLength={120} placeholder="e.g. it rains marshmallows" onChange={(e) => setTwist(e.target.value)} />
        </div>

        {error && <p style={s.error}>{error}</p>}
        <button style={s.makeBtn} onClick={makeStory}>📖 Make my story!</button>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 60px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 820, display: "flex", gap: 10, marginBottom: 18 },
  navBtn: { padding: "11px 20px", background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  logo: { fontFamily: FRED, fontSize: "clamp(34px,7vw,52px)", fontWeight: 700, background: "linear-gradient(90deg,#9b7edd,#c06b99,#d65a7b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "4px 0 6px", textAlign: "center" },
  tagline: { fontSize: 17, color: "#b8b3d0", textAlign: "center", marginBottom: 22, fontWeight: 600 },
  builder: { width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 18 },
  section: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 20, padding: "16px 18px" },
  sectionTitle: { fontFamily: FRED, fontSize: 19, fontWeight: 700, margin: "0 0 12px" },
  tileRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  tile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 84, padding: "12px 10px", borderRadius: 16, border: "2px solid transparent", background: "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", fontFamily: NUN },
  tileOn: { border: "2px solid #fff", background: "rgba(255,255,255,0.2)", boxShadow: "0 6px 18px rgba(155,126,221,0.4)" },
  tileEmoji: { fontSize: 28 },
  styleTile: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 8, width: 104, borderRadius: 16, border: "2px solid transparent", background: "rgba(255,255,255,0.07)", color: "#fff", cursor: "pointer", fontFamily: NUN },
  styleThumb: { width: 84, height: 84, borderRadius: 12, objectFit: "cover", background: "rgba(255,255,255,0.06)" },
  tileLabel: { fontSize: 13, fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none", padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333" },
  makeBtn: { padding: "18px", borderRadius: 18, border: "none", background: GRAD, color: "#fff", fontSize: 22, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.5)" },
  error: { color: "#ffd7d7", background: "rgba(180,40,40,0.25)", borderRadius: 10, padding: "8px 12px", fontSize: 15, textAlign: "center" },
  savedWrap: { width: "100%", maxWidth: 820, marginBottom: 18 },
  savedRow: { display: "flex", flexWrap: "wrap", gap: 10 },
  savedCard: { display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "6px 8px 6px 6px" },
  savedOpen: { background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontFamily: NUN, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  savedDel: { background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, padding: "8px", cursor: "pointer" },
  spinner: { fontSize: 64, animation: "none" },
  genTitle: { fontFamily: FRED, fontSize: 30, fontWeight: 700, margin: "16px 0 6px" },
  genSub: { fontSize: 16, color: "#b8b3d0", textAlign: "center" },
};
