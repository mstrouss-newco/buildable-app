// /src/GrownUpScreen.jsx
// -------------------------------------------------------------
// Grown-ups area: a proper, dedicated account flow.
//
// Redesigned to the Buildable brand: dark starfield surface, the
// gradient "buildablekids." wordmark, clean app-icon glyphs, and
// gradient-circle kid avatars with initials. NO EMOJI anywhere.
//
// This screen is a guided, multi-STEP flow (not a single cramped panel):
//
// STEP "choose" -> pick a lane: Continue with Google (preferred), use
// email instead, or continue without an account.
// STEP "auth" -> parent signs up or signs in (Google or email).
// STEP "picker" -> "Who's playing?" tap-a-tile kid picker.
// STEP "gate" -> grown-up-only math check before the Parents area.
// STEP "parents" -> create + manage kid profiles.
// STEP "projects" -> assign existing creations (songs/games) to a kid.
//
// Google sign-in (preferred): signInWithGoogle() redirects to Supabase ->
// Google -> back here with tokens in the URL hash; completeOAuthRedirect()
// (run on mount) finishes the sign-in. The agent never types passwords.
//
// All data access goes through src/lib/accounts.js, which branches between
// the guest (device) store and the account (Supabase) store.
//
// Props: { onBack, onProfileChosen } -- unchanged contract so the parent
// route in BuildableKids.jsx needs no edits.
// -------------------------------------------------------------
import { useState, useEffect } from "react";
import {
  isConfigured, isSignedIn, signInParent, signUpParent, signOut,
  listKidProfiles, createKidProfile, renameKidProfile, deleteKidProfile,
  setActiveKid, getActiveKid,
  listFamilyProjects, assignProjectToKid,
  signInWithGoogle, completeOAuthRedirect,
} from "./lib/accounts";
import { getLearningSettings, setLearningSettings, learningGoalOptions, learningAgeRange, getProgress, BADGES, progressSubjects, weakestSubject, reviewCount } from "./store";

const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GRAD_BTN = "linear-gradient(90deg, #8A6BFF 0%, #E0578F 100%)";
const CARD_BG = "rgba(255,255,255,0.045)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.10)";

// Kid avatars are colors, not pictures. Each kid gets a gradient circle
// with their first initial. The DB `avatar` column stores a color key
// (e.g. "purple"); legacy rows (old emoji values) fall back to a color
// derived from the child's name, so nothing breaks and no emoji renders.
const COLORS = [
  { key: "purple", grad: "linear-gradient(160deg,#8A6BFF,#6A4FE0)" },
  { key: "pink",   grad: "linear-gradient(160deg,#F2789E,#E0578F)" },
  { key: "blue",   grad: "linear-gradient(160deg,#4FA6E8,#2F8FD6)" },
  { key: "green",  grad: "linear-gradient(160deg,#3DD06A,#2BB14F)" },
  { key: "amber",  grad: "linear-gradient(160deg,#FFC75A,#F0972A)" },
  { key: "teal",   grad: "linear-gradient(160deg,#46D7C0,#1FA897)" },
];
const COLOR_MAP = Object.fromEntries(COLORS.map((c) => [c.key, c.grad]));

function avatarGrad(kid) {
  if (kid && kid.avatar && COLOR_MAP[kid.avatar]) return COLOR_MAP[kid.avatar];
  const name = (kid && kid.display_name) || "?";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length].grad;
}
function initialOf(kid) {
  const n = ((kid && kid.display_name) || "").trim();
  return n ? n[0].toUpperCase() : "?";
}

// The brand wordmark, used in place of the old family emoji.
function Wordmark() {
  return (
    <div style={S.logo}>
      buildablekids<span style={{ color: "#E87BB0" }}>.</span>
    </div>
  );
}

// Inline Google "G" mark so the button needs no external asset.
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"
      style={{ display: "block" }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

// Small clean glyphs for the "organize creations" list (no emoji).
function SongGlyph() {
  return (
    <span style={S.projIcon}>
      <span style={{ ...S.projIconBox, background: COLOR_MAP.purple }}>
        <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
          <ellipse cx="17" cy="33" rx="7" ry="5.2" transform="rotate(-20 17 33)" fill="#fff"/>
          <rect x="22.6" y="11" width="3.2" height="22.5" fill="#fff"/>
          <path d="M25.8 11 q11 3 8.5 15 q.5 -8 -8.5 -9 z" fill="#fff"/>
        </svg>
      </span>
    </span>
  );
}
function GameGlyph() {
  return (
    <span style={S.projIcon}>
      <span style={{ ...S.projIconBox, background: COLOR_MAP.green }}>
        <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="18" width="36" height="16" rx="8" fill="#fff"/>
          <rect x="12" y="22.5" width="3.2" height="9" rx="1" fill="#2BB14F"/>
          <rect x="9" y="25.5" width="9.2" height="3.2" rx="1" fill="#2BB14F"/>
          <circle cx="32" cy="24.5" r="2.4" fill="#2BB14F"/>
          <circle cx="37" cy="29" r="2.4" fill="#2BB14F"/>
        </svg>
      </span>
    </span>
  );
}

// Device id for the no-login lane (shared with the rest of the app).
function gsDeviceId() {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) { id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); localStorage.setItem("deviceId", id); }
    return id;
  } catch { return "dev_anon"; }
}

export default function GrownUpScreen({ onBack, onProfileChosen, onOpenFriends }) {
  // Flow steps. Start on the kid picker when already signed in (returning
  // parent); otherwise start on the lane chooser.
  const [step, setStep] = useState(isSignedIn() ? "picker" : "choose");

  // auth form
  const [mode, setMode] = useState("signup"); // 'signup' | 'signin'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [signedIn, setSignedIn] = useState(isSignedIn());

  // kid profiles
  const [kids, setKids] = useState([]);
  const [loadingKids, setLoadingKids] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState(COLORS[0].key);

  // grown-up gate (simple check so kids can't wander into the Parents area)
  const [gateA] = useState(() => 3 + Math.floor(Math.random() * 7));
  const [gateB] = useState(() => 3 + Math.floor(Math.random() * 7));
  const [gateInput, setGateInput] = useState("");
  const [gateError, setGateError] = useState(null);
  function openParents() {
    if (!kids || kids.length === 0) { setStep("parents"); return; }
    setGateInput(""); setGateError(null); setStep("gate");
  }
  function submitGate(e) {
    e.preventDefault();
    if (parseInt(gateInput, 10) === gateA * gateB) { setGateError(null); setStep("parents"); }
    else { setGateError("Not quite — ask a grown-up to help."); }
  }
  const [active, setActive] = useState(getActiveKid());

  // projects (assign-to-kid)
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const configured = isConfigured();

  // If we just came back from a Google sign-in, finish it: pull the tokens
  // out of the URL hash, save the session, and jump to the kid picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const done = await completeOAuthRedirect();
        if (done && !cancelled) {
          setSignedIn(true);
          setStep("picker");
        }
      } catch (e) { /* ignore -- normal load with no redirect */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function refreshKids() {
    setLoadingKids(true);
    try { setKids(await listKidProfiles()); }
    catch (e) { setError(e.message); }
    finally { setLoadingKids(false); }
  }

  useEffect(() => { refreshKids(); }, [signedIn]);

  async function refreshProjects() {
    setLoadingProjects(true);
    try {
      const acct = await listFamilyProjects().catch(() => []); // filed rows (account, any device)
      const did = gsDeviceId();
      const dev = [];
      try {
        const [sg, gm] = await Promise.all([
          fetch("/api/list-songs?deviceId=" + encodeURIComponent(did)).then((r) => r.json()).catch(() => ({})),
          fetch("/api/list-games?deviceId=" + encodeURIComponent(did)).then((r) => r.json()).catch(() => ({})),
        ]);
        (sg && sg.songs || []).forEach((s) => dev.push({ kind: "song", projectId: s.song_id, title: s.title || "Untitled song", kidProfileId: s.kid_profile_id || null }));
        (gm && gm.games || []).forEach((g) => dev.push({ kind: "game", projectId: g.game_id || g.id, title: g.title || "Untitled game", kidProfileId: g.kid_profile_id || null }));
      } catch (e) { /* device lane optional */ }
      // Merge + dedupe by kind:id, preferring a row that already names a kid.
      const map = new Map();
      for (const p of [...(acct || []), ...dev]) {
        const key = p.kind + ":" + p.projectId;
        const prev = map.get(key);
        if (!prev || (!prev.kidProfileId && p.kidProfileId)) map.set(key, p);
      }
      setProjects([...map.values()]);
    }
    catch (e) { setError(e.message); }
    finally { setLoadingProjects(false); }
  }

  // ---- Google (preferred) ----
  function handleGoogle() {
    setError(null);
    try { signInWithGoogle(); }
    catch (err) { setError((err && err.message) || "Could not start Google sign-in"); }
  }

  // ---- email auth ----
  async function handleAuth(e) {
    e.preventDefault();
    setError(null); setNotice(null); setBusy(true);
    try {
      if (mode === "signup") {
        const res = await signUpParent(email.trim(), password);
        if (res && res.needsEmailConfirmation) {
          setNotice("Almost there! Check " + (email.trim() || "your email") +
            " for a confirmation link, then come back and sign in.");
          setMode("signin");
          setPassword("");
          return;
        }
      } else {
        await signInParent(email.trim(), password);
      }
      setSignedIn(true);
      setStep("picker");
      setPassword("");
    } catch (err) {
      const m = (err && err.message) || "Could not sign in";
      if (/rate limit/i.test(m)) {
        setError("Too many tries just now. Please wait a few minutes and try again.");
      } else if (/already registered|already been registered/i.test(m)) {
        setError("That email already has an account. Try signing in instead.");
        setMode("signin");
      } else if (/confirm/i.test(m)) {
        setError("Please confirm your email first (check your inbox), then sign in.");
      } else {
        setError(m);
      }
    } finally { setBusy(false); }
  }

  async function handleSignOut() {
    signOut();
    setSignedIn(false);
    setActive(null);
    setStep("choose");
    await refreshKids();
  }

  // ---- kid profiles ----
  async function handleAddKid(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      await createKidProfile(newName.trim(), newAvatar);
      setNewName("");
      setNewAvatar(COLORS[0].key);
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function chooseKid(kid) {
    setActiveKid(kid);
    setActive(kid);
    if (onProfileChosen) onProfileChosen(kid);
  }

  async function handleRename(kid) {
    const next = window.prompt("Rename this profile", kid.display_name || "");
    if (next == null) return;
    const name = next.trim();
    if (!name) return;
    setBusy(true); setError(null);
    try {
      await renameKidProfile(kid.id, name);
      if (active && active.id === kid.id) setActive({ ...active, display_name: name });
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleDeleteKid(kid) {
    const ok = window.confirm("Remove " + (kid.display_name || "this profile") +
      "? Their saved creations stay in the library.");
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await deleteKidProfile(kid.id);
      if (active && active.id === kid.id) setActive(null);
      await refreshKids();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // ---- projects ----
  function goProjects() {
    setStep("projects");
    setError(null);
    refreshProjects();
  }

  async function handleAssign(project, kidProfileId) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/assign-creation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: project.kind, id: project.projectId, kidProfileId: kidProfileId || null, deviceId: gsDeviceId() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || j.detail || ("Couldn't file this (error " + r.status + ")"));
      await refreshProjects();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  // -------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------
  return (
    <div style={S.container}>
      <div style={S.topRow}>
        <button onClick={(step === "choose" || step === "picker" || !signedIn) ? onBack : () => setStep("picker")}
          style={S.backBtn}>← Back</button>
        {signedIn && <button onClick={handleSignOut} style={S.backBtn}>Sign out</button>}
      </div>

      <Wordmark />

      {/* STEP: choose a lane ------------------------------------- */}
      {step === "choose" && !signedIn && (
        <>
          <h1 style={S.title}>Set up your family</h1>
          <div style={S.card}>
            <p style={S.lead}>Your kids' creations follow them on any device.</p>
            {!configured && (
              <p style={S.warn}>
                Accounts aren't switched on for this site yet. You can still play as a
                guest below; a grown-up can enable accounts in the site settings.
              </p>
            )}
            <button style={S.googleBtn} disabled={!configured} onClick={handleGoogle}>
              <GoogleG /> <span style={{ marginLeft: 10 }}>Continue with Google</span>
            </button>
            <button style={S.secondaryBig} disabled={!configured}
              onClick={() => { setMode("signup"); setStep("auth"); }}>
              Continue with email
            </button>
            <div style={S.divider}><span style={S.dividerText}>or</span></div>
            <button style={S.ghostBig} onClick={() => setStep("picker")}>
              Keep playing as a guest
            </button>
            <p style={S.fineprint}>
              Guest mode keeps profiles on this device only. No login, nothing leaves
              this device's library.
            </p>
          </div>
        </>
      )}

      {/* STEP: parent auth (email) ------------------------------- */}
      {step === "auth" && !signedIn && (
        <>
          <h1 style={S.title}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <div style={S.card}>
            <button style={S.googleBtn} disabled={!configured} onClick={handleGoogle}>
              <GoogleG /> <span style={{ marginLeft: 10 }}>Continue with Google</span>
            </button>
            <div style={S.divider}><span style={S.dividerText}>or use email</span></div>
            <form onSubmit={handleAuth} style={S.form}>
              <label style={S.label}>Email
                <input style={S.input} type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </label>
              <label style={S.label}>Password
                <input style={S.input} type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters" />
              </label>
              {error && <p style={S.error}>{error}</p>}
              {notice && <p style={S.noticeBox}>{notice}</p>}
              <button type="submit" style={S.primaryBig} disabled={busy}>
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <button style={S.linkBtn}
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setNotice(null); }}>
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </div>
        </>
      )}

      {/* STEP: profile picker — "Who's playing?" (clean: tap to choose) */}
      {(step === "picker" || (signedIn && step === "auth")) && (
        <>
          <h1 style={S.title}>Who's playing?</h1>
          <div style={S.card}>
            {loadingKids && <p style={S.muted}>Loading profiles…</p>}

            {!loadingKids && kids.length === 0 ? (
              <>
                <p style={S.lead}>Let's set up your first child's profile.</p>
                <button style={S.primaryBig} onClick={() => setStep("parents")}>Add your first child</button>
              </>
            ) : (
              <>
                <div style={S.kidGrid}>
                  {kids.map((k) => (
                    <button key={k.id} onClick={() => chooseKid(k)} style={S.kidWrap}>
                      <span style={{ ...S.kidAvatar, background: avatarGrad(k) }}>{initialOf(k)}</span>
                      <span style={S.kidName}>{k.display_name}</span>
                    </button>
                  ))}
                </div>
                <p style={S.fineprint}>
                  {signedIn ? "Signed in — creations follow your kids on any device." : "Saved on this device."}
                </p>
              </>
            )}

            {error && <p style={S.error}>{error}</p>}
            <button style={S.ghostBig} onClick={openParents}>For grown-ups</button>
          </div>
        </>
      )}

      {/* STEP: grown-up gate ------------------------------------- */}
      {step === "gate" && (
        <>
          <h1 style={S.title}>Grown-ups only</h1>
          <div style={S.card}>
            <p style={S.lead}>Quick check — what is {gateA} × {gateB}?</p>
            <form onSubmit={submitGate} style={S.form}>
              <input style={S.input} type="number" inputMode="numeric" autoFocus
                value={gateInput} onChange={(e) => setGateInput(e.target.value)}
                placeholder="Type the answer" />
              {gateError && <p style={S.error}>{gateError}</p>}
              <button type="submit" style={S.primaryBig}>Enter</button>
            </form>
            <button style={S.ghostBig} onClick={() => setStep("picker")}>← Back</button>
          </div>
        </>
      )}

      {/* STEP: parents management (add/edit kids + organize) ----- */}
      {step === "parents" && (
        <>
          <h1 style={S.title}>Parents</h1>
          <div style={S.card}>
            <p style={S.lead}>Add or edit your kids, and organize what they've made.</p>

            {kids.length > 0 && (
              <div style={S.kidGrid}>
                {kids.map((k) => (
                  <div key={k.id} style={S.kidManageWrap}>
                    <div style={S.kidWrap}>
                      <span style={{ ...S.kidAvatar, background: avatarGrad(k) }}>{initialOf(k)}</span>
                      <span style={S.kidName}>{k.display_name}</span>
                    </div>
                    <div style={S.kidActions}>
                      <button type="button" style={S.miniBtn} onClick={() => handleRename(k)}>Rename</button>
                      <button type="button" style={S.miniBtnDanger} onClick={() => handleDeleteKid(k)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddKid} style={S.addRow}>
              <input style={S.input} value={newName} maxLength={40}
                onChange={(e) => setNewName(e.target.value)} placeholder="Add a child's name" />
              <div style={S.avatarRow}>
                {COLORS.map((c) => (
                  <button type="button" key={c.key} onClick={() => setNewAvatar(c.key)}
                    aria-label={"Color " + c.key}
                    style={{
                      ...S.colorPick, background: c.grad,
                      ...(newAvatar === c.key ? S.colorPickActive : {}),
                    }} />
                ))}
              </div>
              <button type="submit" style={S.primaryBig} disabled={busy || !newName.trim()}>Add child</button>
            </form>

            {error && <p style={S.error}>{error}</p>}

            <LearningModeCard />

            <LearningProgressCard />

            {signedIn && (
              <button style={S.linkBtn} onClick={goProjects}>Organize creations by child →</button>
            )}
            {signedIn && onOpenFriends && (
              <button style={S.linkBtn} onClick={onOpenFriends}>Manage friends & friend code →</button>
            )}
            <button style={S.ghostBig} onClick={() => setStep("picker")}>← Done</button>
          </div>
        </>
      )}

      {/* STEP: assign projects to kids --------------------------- */}
      {step === "projects" && signedIn && (
        <>
          <h1 style={S.title}>Organize creations</h1>
          <div style={S.card}>
            <p style={S.lead}>Link each saved song or game to the child who made it.</p>
            {loadingProjects && <p style={S.muted}>Loading creations…</p>}
            {!loadingProjects && projects.length === 0 && (
              <p style={S.muted}>No saved creations yet. They'll appear here once kids make some.</p>
            )}
            <div style={S.projList}>
              {projects.map((p) => (
                <div key={p.kind + ":" + p.projectId} style={S.projRow}>
                  {p.kind === "game" ? <GameGlyph /> : <SongGlyph />}
                  <span style={S.projTitle}>{p.title}</span>
                  <select style={S.select} disabled={busy}
                    value={p.kidProfileId || ""}
                    onChange={(e) => handleAssign(p, e.target.value || null)}>
                    <option value="">Unassigned</option>
                    {kids.map((k) => (
                      <option key={k.id} value={k.id}>{k.display_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {error && <p style={S.error}>{error}</p>}
            <button style={S.ghostBig} onClick={() => setStep("parents")}>← Back</button>
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Learning Mode card (grown-ups). Off by default. When on, the app turns
// render-wait mini-games and quick moments into one real practice question.
// No emojis: the on/off control is a CSS switch, the goal picker is buttons.
// -------------------------------------------------------------
function LearningModeCard() {
  const [settings, setSettings] = useState(() => getLearningSettings());
  const goals = learningGoalOptions();
  const goalLabel = { math: "Math", reading: "Reading", mix: "A mix" };

  function toggle() {
    setSettings(setLearningSettings({ enabled: !settings.enabled }));
  }
  function pickGoal(goal) {
    setSettings(setLearningSettings({ goal }));
  }

  const ageRange = learningAgeRange();
  function setAge(next) {
    const clamped = Math.min(ageRange.max, Math.max(ageRange.min, next));
    setSettings(setLearningSettings({ age: clamped }));
  }

  return (
    <div style={LM.wrap}>
      <div style={LM.headerRow}>
        <div>
          <div style={LM.title}>Learning Mode</div>
          <div style={LM.sub}>Turn waiting time into one quick practice question.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={toggle}
          style={{ ...LM.switch, ...(settings.enabled ? LM.switchOn : {}) }}
        >
          <span style={{ ...LM.knob, ...(settings.enabled ? LM.knobOn : {}) }} />
        </button>
      </div>

      {settings.enabled && (
        <div style={LM.goalsWrap}>
          <div style={LM.goalsLabel}>What should we practice?</div>
          <div style={LM.goalsRow}>
            {goals.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => pickGoal(g)}
                style={{ ...LM.goalBtn, ...(settings.goal === g ? LM.goalBtnActive : {}) }}
              >
                {goalLabel[g] || g}
              </button>
            ))}
          </div>

          <div style={LM.ageLabel}>Child's age</div>
          <div style={LM.ageRow}>
            <button
              type="button"
              aria-label="Younger"
              disabled={settings.age <= ageRange.min}
              onClick={() => setAge(settings.age - 1)}
              style={{ ...LM.ageStep, ...(settings.age <= ageRange.min ? LM.ageStepOff : {}) }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
            <div style={LM.ageValue}>
              <span style={LM.ageNum}>{settings.age}</span>
              <span style={LM.ageUnit}>years</span>
            </div>
            <button
              type="button"
              aria-label="Older"
              disabled={settings.age >= ageRange.max}
              onClick={() => setAge(settings.age + 1)}
              style={{ ...LM.ageStep, ...(settings.age >= ageRange.max ? LM.ageStepOff : {}) }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor" />
                <rect x="7" y="3" width="2" height="10" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div style={LM.ageHint}>Sets how hard the practice questions are.</div>
        </div>
      )}
    </div>
  );
}


// -------------------------------------------------------------
// Learning progress (grown-ups). Read-only summary of on-device progress:
// questions right, current day streak, badges earned, per-subject strength
// bars, and a badge shelf (earned in color, unearned dimmed). All visuals are
// SVG/CSS — no emoji. Shows nothing meaningful until a kid answers in
// Learning Mode; copy stays friendly when empty.
// -------------------------------------------------------------
const SUBJECT_LABEL = { math: "Math", geometry: "Shapes", spelling: "Spelling", reading: "Reading" };

// Small SVG rosette used in the badge shelf. `on` toggles full color vs dimmed.
function BadgeIcon({ on, size = 40 }) {
  const ribbon = on ? "#FFC75A" : "rgba(255,255,255,0.10)";
  const ribbonEdge = on ? "#F0972A" : "rgba(255,255,255,0.18)";
  const check = on ? "#7a4b00" : "rgba(255,255,255,0.28)";
  const tail = on ? "#E0578F" : "rgba(255,255,255,0.10)";
  const tailEdge = on ? "#b5396e" : "rgba(255,255,255,0.18)";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="26" r="18" fill={ribbon} stroke={ribbonEdge} strokeWidth="2.5" />
      <path d="M24 26.5l5.5 5.5 11-12" fill="none" stroke={check} strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 41 L21 60 L32 53 L43 60 L39 41 Z" fill={tail} stroke={tailEdge} strokeWidth="1.5" />
    </svg>
  );
}

function LearningProgressCard() {
  const p = getProgress();
  const subjects = progressSubjects();
  const earnedSet = new Set(p.badges || []);
  const attempted = p.totalCorrect + p.totalWrong;
  const weak = weakestSubject();
  const queued = reviewCount();
  const SUBJECT_LABEL = { math: "Math", geometry: "Shapes", spelling: "Spelling", reading: "Reading" };

  return (
    <div style={LP.wrap}>
      <div style={LP.title}>Learning progress</div>
      <div style={LP.sub}>Saved on this device. Builds up as your kid plays in Learning Mode.</div>

      <div style={LP.statRow}>
        <div style={LP.stat}>
          <div style={LP.statNum}>{p.totalCorrect}</div>
          <div style={LP.statLabel}>Questions right</div>
        </div>
        <div style={LP.stat}>
          <div style={LP.statNum}>{p.streakDays}</div>
          <div style={LP.statLabel}>Day streak</div>
        </div>
        <div style={LP.stat}>
          <div style={LP.statNum}>{(p.badges || []).length}</div>
          <div style={LP.statLabel}>Badges</div>
        </div>
      </div>

      {attempted > 0 && (weak || queued > 0) && (
        <div style={LP.practice}>
          {weak ? <>Now practicing: <strong>{SUBJECT_LABEL[weak] || weak}</strong></> : null}
          {weak && queued > 0 ? " · " : null}
          {queued > 0 ? <>{queued} to review again</> : null}
        </div>
      )}

      {attempted === 0 ? (
        <div style={LP.empty}>No practice yet. Turn on Learning Mode above, then progress shows up here.</div>
      ) : (
        <div style={LP.bars}>
          {subjects.map((s) => {
            const e = p.bySubject[s] || { right: 0, wrong: 0 };
            const att = e.right + e.wrong;
            const pct = att ? Math.round((e.right / att) * 100) : 0;
            return (
              <div key={s} style={LP.barRow}>
                <span style={LP.barLabel}>{SUBJECT_LABEL[s] || s}</span>
                <span style={LP.barTrack}>
                  <span style={{ ...LP.barFill, width: pct + "%" }} />
                </span>
                <span style={LP.barNum}>{e.right}/{att}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={LP.shelfLabel}>Badge shelf</div>
      <div style={LP.shelf}>
        {BADGES.map((b) => {
          const on = earnedSet.has(b.id);
          return (
            <div key={b.id} style={LP.badge} title={b.description}>
              <BadgeIcon on={on} />
              <span style={{ ...LP.badgeLabel, opacity: on ? 1 : 0.45 }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const LP = {
  wrap: {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.3)",
    borderRadius: 16, padding: "14px 16px", margin: "14px 0",
  },
  title: { fontSize: 16, fontWeight: 800 },
  practice: { fontSize: 13, fontWeight: 700, color: "#C9B8FF", margin: "0 0 12px", textAlign: "center" },
  sub: { fontSize: 12.5, opacity: 0.75, marginTop: 3, lineHeight: 1.4 },
  statRow: { display: "flex", gap: 10, margin: "14px 0 4px" },
  stat: {
    flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: "10px 6px",
  },
  statNum: { fontFamily: FRED, fontSize: 24, fontWeight: 700, color: "#fff" },
  statLabel: { fontSize: 11.5, opacity: 0.75, marginTop: 2 },
  empty: { fontSize: 13, opacity: 0.7, lineHeight: 1.45, margin: "12px 0 4px" },
  bars: { display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 4px" },
  barRow: { display: "flex", alignItems: "center", gap: 10 },
  barLabel: { width: 70, fontSize: 13, fontWeight: 700, color: "#D8D2EC", flex: "0 0 auto" },
  barTrack: {
    flex: 1, height: 12, borderRadius: 999, background: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  barFill: {
    display: "block", height: "100%", borderRadius: 999,
    background: "linear-gradient(90deg,#8A6BFF,#E0578F)",
  },
  barNum: { width: 44, textAlign: "right", fontSize: 12, fontWeight: 700, opacity: 0.85, flex: "0 0 auto" },
  shelfLabel: { fontSize: 13, fontWeight: 700, opacity: 0.9, margin: "16px 0 8px" },
  shelf: { display: "flex", flexWrap: "wrap", gap: 12 },
  badge: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 72 },
  badgeLabel: { fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.25 },
};

const LM = {
  wrap: {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.3)",
    borderRadius: 16, padding: "14px 16px", margin: "14px 0",
  },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 16, fontWeight: 800 },
  sub: { fontSize: 12.5, opacity: 0.75, marginTop: 3, lineHeight: 1.4, maxWidth: 280 },
  switch: {
    flex: "0 0 auto", width: 52, height: 30, borderRadius: 999, border: "none",
    background: "rgba(255,255,255,0.22)", position: "relative", cursor: "pointer",
    padding: 0, transition: "background 0.2s",
  },
  switchOn: { background: "#00c48c" },
  knob: {
    position: "absolute", top: 3, left: 3, width: 24, height: 24, borderRadius: "50%",
    background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  knobOn: { left: 25 },
  goalsWrap: { marginTop: 14 },
  goalsLabel: { fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.9 },
  goalsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  goalBtn: {
    background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 12, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    fontFamily: NUN,
  },
  goalBtnActive: { background: "#fff", color: "#b3477a", borderColor: "#fff" },
  ageLabel: { fontSize: 13, fontWeight: 700, margin: "14px 0 8px", opacity: 0.9 },
  ageRow: { display: "flex", alignItems: "center", gap: 12 },
  ageStep: {
    width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  ageStepOff: { opacity: 0.35, cursor: "default" },
  ageValue: {
    minWidth: 84, textAlign: "center", display: "flex", flexDirection: "column",
    alignItems: "center", lineHeight: 1,
  },
  ageNum: { fontFamily: FRED, fontSize: 26, fontWeight: 700, color: "#fff" },
  ageUnit: { fontSize: 11.5, opacity: 0.7, marginTop: 2 },
  ageHint: { fontSize: 12, opacity: 0.7, marginTop: 8, lineHeight: 1.4 },
};

const S = {
  container: {
    minHeight: "100vh", background: "#120C22", color: "#fff",
    fontFamily: NUN, padding: "20px 16px 60px", boxSizing: "border-box",
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  backBtn: {
    background: "rgba(255,255,255,0.10)", color: "#fff", border: "none",
    borderRadius: 999, padding: "8px 16px", fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: NUN,
  },
  logo: {
    fontFamily: FRED, fontWeight: 700, fontSize: 24, textAlign: "center",
    margin: "10px 0 2px",
    background: "linear-gradient(90deg, #9B7CFF, #E87BB0)",
    WebkitBackgroundClip: "text", backgroundClip: "text",
    WebkitTextFillColor: "transparent", color: "transparent",
  },
  title: { fontFamily: FRED, fontSize: 28, fontWeight: 600, textAlign: "center", margin: "10px 0 16px" },
  card: {
    maxWidth: 460, margin: "0 auto", background: CARD_BG, border: CARD_BORDER,
    borderRadius: 22, padding: 22,
  },
  lead: { fontSize: 16, lineHeight: 1.45, textAlign: "center", margin: "0 0 16px", color: "#D8D2EC" },
  muted: { fontSize: 14, textAlign: "center", color: "#9C93BC", margin: "12px 0" },
  fineprint: { fontSize: 12, textAlign: "center", color: "#8C84A8", margin: "14px 0 0", lineHeight: 1.4 },
  warn: {
    fontSize: 13, lineHeight: 1.4, color: "#FFE2A6",
    background: "rgba(255,200,90,0.12)",
    border: "1px solid rgba(255,200,90,0.32)", borderRadius: 12, padding: "10px 12px", margin: "0 0 14px",
  },
  googleBtn: {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#fff", color: "#3c4043", border: "none", borderRadius: 999,
    padding: "14px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer",
    fontFamily: NUN, marginTop: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  },
  primaryBig: {
    width: "100%", background: GRAD_BTN, color: "#fff", border: "none",
    borderRadius: 999, padding: "14px 18px", fontSize: 17, fontWeight: 700,
    cursor: "pointer", fontFamily: FRED, marginTop: 10,
  },
  secondaryBig: {
    width: "100%", background: "rgba(255,255,255,0.08)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "13px 18px",
    fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  ghostBig: {
    width: "100%", background: "transparent", color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "12px 18px",
    fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: NUN, marginTop: 10,
  },
  divider: { display: "flex", alignItems: "center", margin: "16px 0", opacity: 0.5 },
  dividerText: {
    margin: "0 auto", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#9C93BC",
  },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 700, color: "#D8D2EC" },
  input: {
    width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none",
    padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333",
  },
  linkBtn: {
    display: "block", width: "100%", background: "none", color: "#C9A0E8",
    border: "none", textDecoration: "underline", fontSize: 14, fontWeight: 700,
    cursor: "pointer", marginTop: 14, fontFamily: NUN,
  },
  error: {
    color: "#ffd7d7", background: "rgba(180,40,40,0.25)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0",
  },
  noticeBox: {
    color: "#eafff0", background: "rgba(40,160,90,0.22)", borderRadius: 10,
    padding: "8px 12px", fontSize: 14, margin: "10px 0 0", lineHeight: 1.4,
  },
  kidGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
    gap: 14, margin: "6px 0 16px", justifyItems: "center",
  },
  kidManageWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  kidWrap: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    background: "transparent", border: "none", cursor: "pointer", color: "#fff",
    fontFamily: NUN, padding: 0,
  },
  kidAvatar: {
    width: 72, height: 72, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center", fontFamily: FRED,
    fontSize: "clamp(20px, 5vw, 30px)", fontWeight: 600, color: "#fff",
    boxShadow: "0 8px 18px rgba(0,0,0,0.4)",
  },
  kidName: { fontSize: 14, fontWeight: 700, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  kidActions: { display: "flex", gap: 6 },
  miniBtn: {
    background: "rgba(255,255,255,0.10)", color: "#fff", border: "none", borderRadius: 999,
    padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
  miniBtnDanger: {
    background: "rgba(225,90,90,0.18)", color: "#FFC9C9", border: "none", borderRadius: 999,
    padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: NUN,
  },
  addRow: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  avatarRow: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  colorPick: {
    width: 34, height: 34, borderRadius: "50%", border: "2px solid transparent",
    cursor: "pointer", padding: 0,
  },
  colorPickActive: { border: "2px solid #fff", boxShadow: "0 0 0 2px rgba(255,255,255,0.35)" },
  projList: { display: "flex", flexDirection: "column", gap: 8, margin: "6px 0 14px" },
  projRow: {
    display: "flex", alignItems: "center", gap: 10,
    background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "8px 10px",
  },
  projIcon: { display: "flex", alignItems: "center" },
  projIconBox: {
    width: 30, height: 30, borderRadius: 9, display: "flex",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  projTitle: { flex: 1, fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  select: {
    borderRadius: 10, border: "none", padding: "6px 8px", fontSize: 13,
    fontFamily: NUN, color: "#333", maxWidth: 150,
  },
};
